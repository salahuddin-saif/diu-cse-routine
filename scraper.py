#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - COMPLETE FIXED VERSION
Extracts ALL classes from ALL pages
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
DEBUG_FILE = DATA_DIR / "debug_text.txt"

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
        logger.info("DIU CSE ROUTINE SCRAPER - COMPLETE")
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
        sections = parse_pdf_complete(response.content)
        
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


def parse_pdf_complete(content):
    """Parse PDF and extract ALL data from ALL pages."""
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
        
        # Save debug text
        DEBUG_FILE.write_text(full_text)
        logger.info(f"💾 Saved debug text to {DEBUG_FILE}")
        
        # Parse the FULL text
        all_classes = parse_full_text(full_text)
        
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


def parse_full_text(text):
    """Parse the complete text to extract ALL classes."""
    classes = []
    lines = text.split('\n')
    
    # Time slots
    time_slots = [
        '08:30-10:00', '10:00-11:30', '11:30-01:00',
        '01:00-02:30', '02:30-04:00', '04:00-05:30'
    ]
    
    # Days
    days = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']
    
    current_day = None
    day_found = False
    
    # Pattern for class data: ROOM COURSE(SECTION) TEACHER
    pattern1 = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'
    pattern2 = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)'
    pattern3 = r'([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'
    pattern4 = r'([A-Z]{3,4}\d{3,4})\(([^)]+)\)'
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        
        # Check for day
        day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)', line.upper())
        if day_match:
            # Check if it's a day header
            has_time = any(slot in line for slot in time_slots)
            is_heading = line.upper().strip() == day_match.group(1)
            if has_time or is_heading:
                current_day = day_match.group(1).capitalize()
                day_found = True
                logger.debug(f"Found day: {current_day}")
                i += 1
                continue
        
        if not current_day:
            i += 1
            continue
        
        # Skip table of contents and page numbers
        if 'TABLE' in line.upper() or 'PAGE' in line.upper():
            i += 1
            continue
        
        # Check for lab
        is_lab = False
        if 'LAB' in line.upper() or 'COM LAB' in line.upper():
            is_lab = True
            # Combine with next line if it's a multi-line lab
            if i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                if next_line and not re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)', next_line.upper()):
                    line = line + " " + next_line
                    i += 1
        
        # Try to find classes in this line
        matches = []
        
        # Try pattern1
        m1 = re.findall(pattern1, line)
        for m in m1:
            matches.append({'room': m[0], 'course': m[1], 'section': m[2], 'teacher': m[3]})
        
        # Try pattern2 if no matches
        if not matches:
            m2 = re.findall(pattern2, line)
            for m in m2:
                teacher = 'TBA'
                remaining = line.replace(m[0], '').replace(m[1], '').replace(f'({m[2]})', '')
                teacher_match = re.search(r'\b([A-Z]{2,4})\b', remaining)
                if teacher_match:
                    teacher = teacher_match.group(0)
                matches.append({'room': m[0], 'course': m[1], 'section': m[2], 'teacher': teacher})
        
        # Try pattern3 if no matches
        if not matches:
            m3 = re.findall(pattern3, line)
            for m in m3:
                room = 'TBA'
                room_match = re.search(r'\b(KT-\d+|G1-\d+|ANX1-\d+|SH-\d+)\b', line)
                if room_match:
                    room = room_match.group(0)
                matches.append({'room': room, 'course': m[0], 'section': m[1], 'teacher': m[2]})
        
        # Try pattern4 if no matches
        if not matches:
            m4 = re.findall(pattern4, line)
            for m in m4:
                room = 'TBA'
                room_match = re.search(r'\b(KT-\d+|G1-\d+|ANX1-\d+|SH-\d+)\b', line)
                if room_match:
                    room = room_match.group(0)
                teacher = 'TBA'
                remaining = line.replace(m[0], '').replace(f'({m[1]})', '')
                teacher_match = re.search(r'\b([A-Z]{2,4})\b', remaining)
                if teacher_match:
                    teacher = teacher_match.group(0)
                matches.append({'room': room, 'course': m[0], 'section': m[1], 'teacher': teacher})
        
        # Process matches
        for idx, match in enumerate(matches):
            section_clean = re.sub(r'[^A-Z0-9_]', '', match['section'].replace(' ', '_').upper())
            if not section_clean:
                continue
            
            # Determine time slot
            time_slot = get_time_slot(line, match['room'], time_slots, idx, len(matches))
            
            # Determine type
            class_type = 'Lab' if is_lab or 'LAB' in line.upper() else 'Theory'
            
            # Extract batch
            batch_match = re.search(r'(\d{2})', section_clean)
            batch = batch_match.group(1) if batch_match else 'Unknown'
            section_letter = re.sub(r'[^A-Z]', '', section_clean)
            
            classes.append({
                'section_key': section_clean,
                'day': current_day,
                'time': time_slot,
                'course': match['course'],
                'teacher': match['teacher'],
                'room': match['room'],
                'type': class_type,
                'batch': batch,
                'section_letter': section_letter
            })
        
        i += 1
    
    return classes


def get_time_slot(line, room, time_slots, idx, total):
    """Determine time slot based on position or index."""
    if room and room != 'TBA':
        pos = line.find(room)
        if pos != -1 and len(line) > 0:
            ratio = pos / len(line)
            if ratio < 0.18:
                return time_slots[0]
            elif ratio < 0.32:
                return time_slots[1]
            elif ratio < 0.46:
                return time_slots[2]
            elif ratio < 0.60:
                return time_slots[3]
            elif ratio < 0.78:
                return time_slots[4]
            else:
                return time_slots[5]
    
    # If room not found, distribute evenly
    if total > 1 and idx < len(time_slots):
        return time_slots[idx]
    
    return 'TBA'


if __name__ == "__main__":
    main()
