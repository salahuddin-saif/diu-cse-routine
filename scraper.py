#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - FIXED VERSION
Properly extracts ALL classes with correct time slots
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
        logger.info("DIU CSE ROUTINE SCRAPER - FIXED")
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
    """Parse PDF and extract ALL data."""
    sections = {}
    
    try:
        pdf_reader = PyPDF2.PdfReader(BytesIO(content))
        logger.info(f"📄 PDF has {len(pdf_reader.pages)} pages")
        
        # Extract text from ALL pages
        all_text = ""
        for page_num, page in enumerate(pdf_reader.pages):
            text = page.extract_text()
            if text:
                all_text += text + "\n"
                logger.info(f"📝 Page {page_num + 1}: {len(text)} chars")
        
        if not all_text:
            return {}
        
        # Parse the text
        sections = extract_all_classes(all_text)
        return sections
        
    except Exception as e:
        logger.error(f"❌ PDF parsing failed: {e}")
        return {}


def extract_all_classes(text):
    """Extract ALL classes from the text."""
    sections = {}
    lines = text.split('\n')
    
    # All time slots
    time_slots = [
        '08:30-10:00',
        '10:00-11:30',
        '11:30-01:00',
        '01:00-02:30',
        '02:30-04:00',
        '04:00-05:30'
    ]
    
    # All days
    days = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']
    
    current_day = None
    total_classes = 0
    
    # Process line by line
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        
        # Check for day header
        day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)', line.upper())
        if day_match:
            has_time = any(slot in line for slot in time_slots)
            if has_time:
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
        
        # Check if this line has class data
        if re.search(r'[A-Z]{3,4}\d{3,4}', line):
            # Extract all classes from this line
            classes = extract_from_line(line, current_day, time_slots)
            
            for cls in classes:
                section_key = cls['section_key']
                if section_key not in sections:
                    sections[section_key] = {
                        'batch': cls['batch'],
                        'section': cls['section_letter'],
                        'classes': []
                    }
                
                entry = {
                    'day': cls['day'],
                    'time': cls['time'],
                    'course': cls['course'],
                    'teacher': cls['teacher'],
                    'room': cls['room'],
                    'type': cls['type'],
                    'batch': cls['batch'],
                    'section': cls['section_letter']
                }
                sections[section_key]['classes'].append(entry)
                total_classes += 1
        
        i += 1
    
    logger.info(f"📊 Found {total_classes} classes in {len(sections)} sections")
    return sections


def extract_from_line(line, day, time_slots):
    """Extract ALL classes from a single line."""
    classes = []
    
    # Pattern: KT-201 CSE315(66_E) AS
    pattern = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'
    # Pattern without teacher
    pattern2 = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)'
    # Pattern: CSE315(66_E) AS
    pattern3 = r'([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'
    
    # Try each pattern
    matches = []
    
    # Try pattern1
    m1 = re.findall(pattern, line)
    for m in m1:
        matches.append({'room': m[0], 'course': m[1], 'section': m[2], 'teacher': m[3]})
    
    # Try pattern2 if no matches
    if not matches:
        m2 = re.findall(pattern2, line)
        for m in m2:
            teacher = 'TBA'
            # Try to find teacher
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
    
    # Process each match
    for idx, match in enumerate(matches):
        section_clean = re.sub(r'[^A-Z0-9_]', '', match['section'].replace(' ', '_').upper())
        if not section_clean:
            continue
        
        # Determine time slot
        time_slot = get_time_slot(line, match['room'], time_slots, idx, len(matches))
        
        # Determine class type
        class_type = 'Theory'
        if 'LAB' in line.upper() or 'COM LAB' in line.upper():
            class_type = 'Lab'
        
        # Extract batch
        batch_match = re.search(r'(\d{2})', section_clean)
        batch = batch_match.group(1) if batch_match else 'Unknown'
        section_letter = re.sub(r'[^A-Z]', '', section_clean)
        
        classes.append({
            'section_key': section_clean,
            'day': day,
            'time': time_slot,
            'course': match['course'],
            'teacher': match['teacher'],
            'room': match['room'],
            'type': class_type,
            'batch': batch,
            'section_letter': section_letter
        })
    
    return classes


def get_time_slot(line, room, time_slots, idx, total):
    """Determine time slot."""
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
