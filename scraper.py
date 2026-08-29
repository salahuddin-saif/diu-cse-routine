#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - Using pdfplumber for proper table extraction
"""

import json
import os
import sys
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
import requests
from bs4 import BeautifulSoup
import pdfplumber
from io import BytesIO

# ============================================================
# CONFIGURATION
# ============================================================

NOTICE_URL = "https://webbackend.daffodilvarsity.edu.bd/department/cse/notice"

# ============================================================
# FILE PATHS
# ============================================================

DATA_DIR = Path("data")
OUTPUT_FILE = DATA_DIR / "routine.json"

# ============================================================
# LOGGING
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def main():
    """Main scraper function."""
    try:
        DATA_DIR.mkdir(exist_ok=True)
        
        logger.info("=" * 60)
        logger.info("DIU CSE ROUTINE SCRAPER - PDFPLUMBER")
        logger.info("=" * 60)
        
        # Find PDF
        logger.info("🔍 Looking for Class Routine...")
        result = find_latest_class_routine()
        
        if not result:
            logger.error("❌ Could not find Class Routine")
            sys.exit(1)
        
        pdf_url, version = result
        logger.info(f"📄 Found Version: {version}")
        
        # Download PDF
        logger.info("⬇️ Downloading PDF...")
        response = requests.get(pdf_url, timeout=30)
        response.raise_for_status()
        logger.info(f"✅ Downloaded {len(response.content)} bytes")
        
        # Parse PDF with pdfplumber
        logger.info("📖 Parsing PDF with pdfplumber...")
        sections = parse_pdf_with_plumber(response.content)
        
        if not sections:
            logger.error("❌ No data extracted")
            sys.exit(1)
        
        # Save
        total = sum(len(entries) for entries in sections.values())
        output = {
            'updated_at': datetime.now(timezone.utc).isoformat(),
            'source': pdf_url,
            'version': version,
            'sections': sections
        }
        
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        
        logger.info(f"✅ Saved {len(sections)} sections with {total} classes")
        sys.exit(0)
        
    except Exception as e:
        logger.error(f"❌ Failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)


def find_latest_class_routine():
    """Find the latest class routine."""
    try:
        response = requests.get(NOTICE_URL, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        
        for link in soup.find_all('a', href=True):
            text = link.get_text().strip()
            href = link.get('href', '')
            
            if 'class routine' in text.lower() and 'exam' not in text.lower():
                version_match = re.search(r'[Vv]ersion\s*([\d.]+)', text)
                version = version_match.group(1) if version_match else '5.0'
                
                if not href.startswith(('http://', 'https://')):
                    href = requests.compat.urljoin(NOTICE_URL, href)
                
                detail_response = requests.get(href, timeout=30)
                detail_response.raise_for_status()
                detail_soup = BeautifulSoup(detail_response.text, 'html.parser')
                
                for dl_link in detail_soup.find_all('a', href=True):
                    dl_href = dl_link.get('href', '')
                    if 'download-file' in dl_href:
                        if not dl_href.startswith(('http://', 'https://')):
                            dl_href = requests.compat.urljoin(href, dl_href)
                        return (dl_href, version)
        
        return None
        
    except Exception as e:
        logger.error(f"❌ Error: {e}")
        return None


def parse_pdf_with_plumber(content):
    """Parse PDF using pdfplumber for better table extraction."""
    sections = {}
    all_classes = []
    
    try:
        with pdfplumber.open(BytesIO(content)) as pdf:
            logger.info(f"📄 PDF has {len(pdf.pages)} pages")
            
            # Process each page
            for page_num, page in enumerate(pdf.pages):
                logger.info(f"📝 Processing page {page_num + 1}")
                
                # Extract text
                text = page.extract_text()
                if not text:
                    continue
                
                # Extract tables
                tables = page.extract_tables()
                if tables:
                    logger.info(f"📊 Found {len(tables)} tables on page {page_num + 1}")
                    for table in tables:
                        if table and len(table) > 0:
                            # Process table rows
                            classes = process_table_rows(table, page_num + 1)
                            all_classes.extend(classes)
                
                # Also try parsing text directly
                text_classes = parse_text_for_classes(text)
                all_classes.extend(text_classes)
            
            logger.info(f"📊 Total classes found: {len(all_classes)}")
            
            # Group by section
            for cls in all_classes:
                section_key = cls.get('section_key')
                if section_key:
                    if section_key not in sections:
                        # Extract batch and section
                        batch_match = re.search(r'(\d{2})', section_key)
                        batch = batch_match.group(1) if batch_match else 'Unknown'
                        section_letter = re.sub(r'[^A-Z]', '', section_key)
                        if not section_letter:
                            section_letter = section_key
                        
                        sections[section_key] = {
                            'batch': batch,
                            'section': section_letter,
                            'classes': []
                        }
                    
                    # Clean the entry
                    entry = {
                        'day': cls.get('day', 'Unknown'),
                        'time': cls.get('time', 'TBA'),
                        'course': cls.get('course', ''),
                        'teacher': cls.get('teacher', 'TBA'),
                        'room': cls.get('room', 'TBA'),
                        'type': cls.get('type', 'Theory'),
                        'batch': cls.get('batch', 'Unknown'),
                        'section': cls.get('section', '')
                    }
                    
                    sections[section_key]['classes'].append(entry)
            
            return sections
            
    except Exception as e:
        logger.error(f"❌ pdfplumber failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {}


def process_table_rows(table, page_num):
    """Process rows from a table extracted by pdfplumber."""
    classes = []
    
    # Skip header rows
    for row_idx, row in enumerate(table):
        if not row or all(cell is None or str(cell).strip() == '' for cell in row):
            continue
        
        # Skip header rows
        row_text = ' '.join([str(cell) for cell in row if cell])
        if 'ROOM' in row_text.upper() or 'COURSE' in row_text.upper() or 'TEACHER' in row_text.upper():
            continue
        if 'SATURDAY' in row_text.upper() or 'SUNDAY' in row_text.upper():
            continue
        
        # Process each cell
        for cell in row:
            if cell:
                cell_text = str(cell).strip()
                if cell_text:
                    # Look for class pattern: COURSE(SECTION)
                    course_match = re.search(r'([A-Z]{3,4}\d{3,4})\(([^)]+)\)', cell_text)
                    if course_match:
                        course = course_match.group(1)
                        section = course_match.group(2)
                        
                        # Clean section
                        section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
                        if not section_clean:
                            continue
                        
                        # Look for teacher nearby
                        teacher = 'TBA'
                        # Try to find teacher in same cell or adjacent
                        teacher_match = re.search(r'\b([A-Z]{2,4})\b', cell_text.replace(course_match.group(0), ''))
                        if teacher_match:
                            teacher = teacher_match.group(0)
                        
                        # Look for room
                        room = 'TBA'
                        room_match = re.search(r'\b(KT-\d+|G1-\d+|ANX1-\d+|SH-\d+)\b', cell_text)
                        if room_match:
                            room = room_match.group(0)
                        
                        # Determine day from page context
                        day = 'Unknown'
                        if page_num in [2, 3]:
                            day = 'Saturday'
                        elif page_num in [3, 4]:
                            day = 'Sunday'
                        elif page_num in [5, 6]:
                            day = 'Monday'
                        elif page_num in [7, 8]:
                            day = 'Tuesday'
                        elif page_num in [9, 10]:
                            day = 'Wednesday'
                        elif page_num in [11, 12]:
                            day = 'Thursday'
                        
                        # Determine type
                        class_type = 'Lab' if 'LAB' in cell_text.upper() else 'Theory'
                        
                        # Extract batch
                        batch_match = re.search(r'(\d{2})', section_clean)
                        batch = batch_match.group(1) if batch_match else 'Unknown'
                        section_letter = re.sub(r'[^A-Z]', '', section_clean)
                        
                        classes.append({
                            'section_key': section_clean,
                            'day': day,
                            'time': 'TBA',
                            'course': course,
                            'teacher': teacher,
                            'room': room,
                            'type': class_type,
                            'batch': batch,
                            'section': section_letter
                        })
    
    return classes


def parse_text_for_classes(text):
    """Parse text for class patterns."""
    classes = []
    
    # Pattern: Room Course(Section) Teacher
    pattern = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'
    pattern2 = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)'
    
    lines = text.split('\n')
    current_day = 'Unknown'
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Check for day
        day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY)', line.upper())
        if day_match:
            current_day = day_match.group(1).capitalize()
            continue
        
        # Find matches
        matches = re.findall(pattern, line)
        if not matches:
            matches = re.findall(pattern2, line)
            matches = [(m[0], m[1], m[2], 'TBA') for m in matches]
        
        for room, course, section, teacher in matches:
            section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
            if not section_clean:
                continue
            
            # Determine time slot
            time_slot = 'TBA'
            pos = line.find(room)
            if pos != -1 and len(line) > 0:
                ratio = pos / len(line)
                time_slots = ['08:30-10:00', '10:00-11:30', '11:30-01:00', '01:00-02:30', '02:30-04:00', '04:00-05:30']
                if ratio < 0.18:
                    time_slot = time_slots[0]
                elif ratio < 0.32:
                    time_slot = time_slots[1]
                elif ratio < 0.46:
                    time_slot = time_slots[2]
                elif ratio < 0.60:
                    time_slot = time_slots[3]
                elif ratio < 0.78:
                    time_slot = time_slots[4]
                else:
                    time_slot = time_slots[5]
            
            class_type = 'Lab' if 'LAB' in line.upper() else 'Theory'
            
            batch_match = re.search(r'(\d{2})', section_clean)
            batch = batch_match.group(1) if batch_match else 'Unknown'
            section_letter = re.sub(r'[^A-Z]', '', section_clean)
            
            classes.append({
                'section_key': section_clean,
                'day': current_day,
                'time': time_slot,
                'course': course,
                'teacher': teacher,
                'room': room,
                'type': class_type,
                'batch': batch,
                'section': section_letter
            })
    
    return classes


if __name__ == "__main__":
    main()
