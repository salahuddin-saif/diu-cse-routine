#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - COMPLETE VERSION
Extracts ALL data: 7 days, all time slots, all sections, including labs
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
        
        # Save debug text
        DEBUG_FILE.write_text(all_text)
        logger.info(f"💾 Saved debug text to {DEBUG_FILE}")
        
        # Parse the text
        sections = parse_all_routine_data(all_text)
        return sections
        
    except Exception as e:
        logger.error(f"❌ PDF parsing failed: {e}")
        return {}


def parse_all_routine_data(text):
    """Parse ALL routine data from the text."""
    sections = {}
    lines = text.split('\n')
    
    # All 7 days
    days = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']
    
    # All time slots
    time_slots = [
        '08:30-10:00',
        '10:00-11:30',
        '11:30-01:00',
        '01:00-02:30',
        '02:30-04:00',
        '04:00-05:30'
    ]
    
    current_day = None
    day_found = False
    class_count = 0
    
    # Pattern for class data: ROOM COURSE(SECTION) TEACHER
    pattern = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'
    # Pattern without teacher
    pattern2 = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)'
    # Pattern for lab classes (COM LAB, Electrical Circuits Lab, etc.)
    lab_pattern = r'\(COM LAB\)|\(Electrical Circuits Lab\)|\(Physics Lab\)|\(Basic Electronics Lab\)'
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        
        # Check for day header
        day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)', line.upper())
        if day_match:
            # Check if this is actually a day header (has time slots or is a heading)
            has_time = any(slot in line for slot in time_slots)
            # Check if it's a standalone day heading (like "SATURDAY" at start of line)
            is_heading = line.upper().strip() == day_match.group(1) or line.upper().startswith(day_match.group(1))
            
            if has_time or is_heading:
                current_day = day_match.group(1).capitalize()
                day_found = True
                logger.info(f"📅 Found day: {current_day}")
                i += 1
                continue
        
        # Skip if no day found yet
        if not current_day:
            i += 1
            continue
        
        # Skip table of contents and page numbers
        if 'TABLE' in line.upper() or 'PAGE' in line.upper() or 'PDF' in line.upper():
            i += 1
            continue
        
        # Skip lines that are just dashes or empty
        if re.match(r'^[\s\-]+$', line):
            i += 1
            continue
        
        # Check if this line contains lab information
        is_lab = False
        if re.search(lab_pattern, line, re.IGNORECASE):
            is_lab = True
            # Sometimes lab info is on multiple lines, combine them
            if i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                if next_line and not re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)', next_line.upper()):
                    line = line + " " + next_line
                    i += 1
        
        # Try to find class data in this line
        matches = re.findall(pattern, line)
        
        # If no matches with teacher, try without teacher
        if not matches:
            matches2 = re.findall(pattern2, line)
            matches = [(m[0], m[1], m[2], 'TBA') for m in matches2]
        
        if matches:
            # Process each match
            for room, course, section, teacher in matches:
                # Clean section
                section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
                if not section_clean:
                    continue
                
                # Determine time slot based on position in line
                time_slot = get_time_slot_from_line(line, room, time_slots, matches, time_slots)
                
                # Determine class type
                class_type = 'Lab' if is_lab or 'LAB' in line.upper() else 'Theory'
                
                # Extract batch from section
                batch_match = re.search(r'(\d{2})', section_clean)
                batch = batch_match.group(1) if batch_match else 'Unknown'
                
                # Extract section letter
                section_letter = re.sub(r'[^A-Z]', '', section_clean)
                if not section_letter:
                    section_letter = section_clean
                
                entry = {
                    'day': current_day,
                    'time': time_slot,
                    'course': course,
                    'teacher': teacher if teacher != 'TBA' else 'TBA',
                    'room': room,
                    'type': class_type,
                    'batch': batch,
                    'section': section_letter
                }
                
                # Store in sections
                if section_clean not in sections:
                    sections[section_clean] = {
                        'batch': batch,
                        'section': section_letter,
                        'classes': []
                    }
                sections[section_clean]['classes'].append(entry)
                class_count += 1
        
        i += 1
    
    logger.info(f"📊 Found {class_count} classes in {len(sections)} sections")
    
    # Log sample data
    if sections:
        sample_key = list(sections.keys())[0]
        logger.info(f"📋 Sample: {sample_key} - {len(sections[sample_key]['classes'])} classes")
    
    return sections


def get_time_slot_from_line(line, room, time_slots, all_matches, all_time_slots):
    """Determine time slot based on room position in line."""
    pos = line.find(room)
    if pos == -1:
        return 'TBA'
    
    line_len = len(line)
    if line_len == 0:
        return 'TBA'
    
    ratio = pos / line_len
    
    # Map ratio to time slot (6 slots across the line)
    if ratio < 0.18:
        return all_time_slots[0] if all_time_slots else 'TBA'
    elif ratio < 0.32:
        return all_time_slots[1] if len(all_time_slots) > 1 else 'TBA'
    elif ratio < 0.46:
        return all_time_slots[2] if len(all_time_slots) > 2 else 'TBA'
    elif ratio < 0.60:
        return all_time_slots[3] if len(all_time_slots) > 3 else 'TBA'
    elif ratio < 0.78:
        return all_time_slots[4] if len(all_time_slots) > 4 else 'TBA'
    else:
        return all_time_slots[5] if len(all_time_slots) > 5 else 'TBA'


if __name__ == "__main__":
    main()
