#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - TABLE-BASED PARSER
Extracts ALL classes by day and time slot using pattern order.
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
import PyPDF2
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
        logger.info("DIU CSE ROUTINE SCRAPER - TABLE PARSER")
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
        
        # Parse PDF
        logger.info("📖 Parsing PDF...")
        sections = parse_pdf_table_based(response.content)
        
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


def parse_pdf_table_based(content):
    """Parse PDF using table-based approach."""
    sections = {}
    all_classes = []
    
    try:
        pdf_reader = PyPDF2.PdfReader(BytesIO(content))
        logger.info(f"📄 PDF has {len(pdf_reader.pages)} pages")
        
        # Extract text from ALL pages
        full_text = ""
        for page_num, page in enumerate(pdf_reader.pages):
            text = page.extract_text()
            if text:
                full_text += text + "\n"
                logger.info(f"📝 Page {page_num + 1}: {len(text)} chars")
        
        if not full_text:
            return {}
        
        # Parse the full text
        all_classes = parse_table(full_text)
        
        logger.info(f"📊 Total classes found: {len(all_classes)}")
        
        # Group by section
        for cls in all_classes:
            section_key = cls.get('section_key')
            if section_key:
                if section_key not in sections:
                    sections[section_key] = {
                        'batch': cls.get('batch', 'Unknown'),
                        'section': cls.get('section_letter', ''),
                        'classes': []
                    }
                
                entry = {
                    'day': cls.get('day', 'Unknown'),
                    'time': cls.get('time', 'TBA'),
                    'course': cls.get('course', ''),
                    'teacher': cls.get('teacher', 'TBA'),
                    'room': cls.get('room', 'TBA'),
                    'type': cls.get('type', 'Theory'),
                    'batch': cls.get('batch', 'Unknown'),
                    'section': cls.get('section_letter', '')
                }
                sections[section_key]['classes'].append(entry)
        
        return sections
        
    except Exception as e:
        logger.error(f"❌ PDF parsing failed: {e}")
        return {}


def parse_table(text):
    """Parse the table structure from text."""
    all_classes = []
    lines = text.split('\n')
    
    # Time slots (6 slots)
    time_slots = [
        '08:30-10:00',
        '10:00-11:30',
        '11:30-01:00',
        '01:00-02:30',
        '02:30-04:00',
        '04:00-05:30'
    ]
    
    # Days
    days = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']
    
    current_day = None
    i = 0
    
    # Patterns for class data
    pattern_with_teacher = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'
    pattern_without_teacher = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)'
    
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        
        # Check for day
        day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)', line.upper())
        if day_match:
            # Check if it's a day header (contains time slots or is a heading)
            if any(slot in line for slot in time_slots) or len(line) < 30:
                current_day = day_match.group(1).capitalize()
                logger.info(f"📅 Found day: {current_day}")
                i += 1
                continue
        
        if not current_day:
            i += 1
            continue
        
        # Skip table of contents and page numbers
        if 'TABLE' in line.upper() or 'PAGE' in line.upper():
            i += 1
            continue
        
        # Check if this line contains lab info
        is_lab = False
        if 'LAB' in line.upper() or 'COM LAB' in line.upper():
            is_lab = True
            # Merge with next line if it continues
            if i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                if next_line and not re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)', next_line.upper()):
                    line = line + " " + next_line
                    i += 1
        
        # Extract ALL class patterns from this line
        # First try with teacher
        matches = re.findall(pattern_with_teacher, line)
        if not matches:
            # Try without teacher
            matches2 = re.findall(pattern_without_teacher, line)
            # Convert to same format: (room, course, section, teacher)
            matches = [(m[0], m[1], m[2], 'TBA') for m in matches2]
        
        if matches:
            # Assign time slots sequentially
            for idx, match in enumerate(matches):
                # If more matches than time slots, wrap around or skip
                if idx >= len(time_slots):
                    logger.warning(f"More matches ({len(matches)}) than time slots on line: {line[:50]}...")
                    break
                
                room, course, section, teacher = match
                section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
                if not section_clean:
                    continue
                
                time_slot = time_slots[idx] if idx < len(time_slots) else 'TBA'
                
                # Determine class type
                class_type = 'Lab' if is_lab or 'LAB' in line.upper() else 'Theory'
                
                # Extract batch
                batch_match = re.search(r'(\d{2})', section_clean)
                batch = batch_match.group(1) if batch_match else 'Unknown'
                section_letter = re.sub(r'[^A-Z]', '', section_clean)
                
                all_classes.append({
                    'section_key': section_clean,
                    'day': current_day,
                    'time': time_slot,
                    'course': course,
                    'teacher': teacher if teacher != 'TBA' else 'TBA',
                    'room': room,
                    'type': class_type,
                    'batch': batch,
                    'section_letter': section_letter
                })
        
        i += 1
    
    return all_classes


if __name__ == "__main__":
    main()
