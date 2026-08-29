#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - COMPLETE EXTRACTION
Extracts ALL classes from ALL pages with ALL time slots
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
    
    try:
        pdf_reader = PyPDF2.PdfReader(BytesIO(content))
        logger.info(f"📄 PDF has {len(pdf_reader.pages)} pages")
        
        # Extract text from ALL pages
        all_text = ""
        page_texts = []
        for page_num, page in enumerate(pdf_reader.pages):
            text = page.extract_text()
            if text:
                all_text += text + "\n"
                page_texts.append((page_num + 1, text))
                logger.info(f"📝 Page {page_num + 1}: {len(text)} chars")
        
        if not all_text:
            return {}
        
        # Save debug text
        DEBUG_FILE.write_text(all_text)
        logger.info(f"💾 Saved debug text to {DEBUG_FILE}")
        
        # Parse the text page by page
        sections = parse_page_by_page(page_texts)
        return sections
        
    except Exception as e:
        logger.error(f"❌ PDF parsing failed: {e}")
        return {}


def parse_page_by_page(page_texts):
    """Parse each page separately to preserve structure."""
    sections = {}
    all_classes = []
    
    # Time slots
    time_slots = [
        '08:30-10:00',
        '10:00-11:30',
        '11:30-01:00',
        '01:00-02:30',
        '02:30-04:00',
        '04:00-05:30'
    ]
    
    # All 7 days
    days = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']
    
    current_day = None
    total_classes = 0
    
    for page_num, text in page_texts:
        logger.info(f"📄 Processing page {page_num}")
        lines = text.split('\n')
        
        # Process each line on the page
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            if not line:
                i += 1
                continue
            
            # Check for day header
            day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)', line.upper())
            if day_match:
                # Check if this is a day header (has time slots or is a heading)
                has_time = any(slot in line for slot in time_slots)
                is_heading = line.upper().strip() == day_match.group(1)
                
                if has_time or is_heading:
                    current_day = day_match.group(1).capitalize()
                    logger.info(f"📅 Page {page_num} - Found day: {current_day}")
                    i += 1
                    continue
            
            # Skip if no day found
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
            
            # Check if this is a lab line
            is_lab = False
            lab_pattern = r'\(COM LAB\)|\(Electrical Circuits Lab\)|\(Physics Lab\)|\(Basic Electronics Lab\)|\(E\.C\. Lab\)'
            if re.search(lab_pattern, line, re.IGNORECASE):
                is_lab = True
                # Combine with next line if it continues
                if i + 1 < len(lines):
                    next_line = lines[i + 1].strip()
                    if next_line and not re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)', next_line.upper()):
                        line = line + " " + next_line
                        i += 1
            
            # Extract ALL classes from this line
            classes_in_line = extract_classes_from_line(line, current_day, time_slots, is_lab)
            all_classes.extend(classes_in_line)
            total_classes += len(classes_in_line)
            
            i += 1
    
    logger.info(f"📊 Total classes found: {total_classes}")
    
    # Group classes by section
    for cls in all_classes:
        section_key = cls.get('section_key')
        if section_key:
            if section_key not in sections:
                sections[section_key] = {
                    'batch': cls.get('batch', 'Unknown'),
                    'section': cls.get('section_letter', ''),
                    'classes': []
                }
            
            # Create entry without section_key
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


def extract_classes_from_line(line, day, time_slots, is_lab=False):
    """Extract ALL classes from a single line."""
    classes = []
    
    # Pattern: Room Course(Section) Teacher
    pattern1 = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'
    # Pattern: Room Course(Section)
    pattern2 = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)'
    # Pattern: Course(Section) Teacher
    pattern3 = r'([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'
    # Pattern: Course(Section)
    pattern4 = r'([A-Z]{3,4}\d{3,4})\(([^)]+)\)'
    
    # Try each pattern
    matches = []
    
    # Try pattern1
    matches1 = re.findall(pattern1, line)
    for m in matches1:
        matches.append({'room': m[0], 'course': m[1], 'section': m[2], 'teacher': m[3]})
    
    # If no matches with pattern1, try pattern2
    if not matches:
        matches2 = re.findall(pattern2, line)
        for m in matches2:
            matches.append({'room': m[0], 'course': m[1], 'section': m[2], 'teacher': 'TBA'})
    
    # If still no matches, try pattern3
    if not matches:
        matches3 = re.findall(pattern3, line)
        for m in matches3:
            # Try to find room
            room = 'TBA'
            room_match = re.search(r'\b(KT-\d+|G1-\d+|ANX1-\d+|SH-\d+|CTBA-\d+)\b', line)
            if room_match:
                room = room_match.group(0)
            matches.append({'room': room, 'course': m[0], 'section': m[1], 'teacher': m[2]})
    
    # If still no matches, try pattern4
    if not matches:
        matches4 = re.findall(pattern4, line)
        for m in matches4:
            # Try to find room
            room = 'TBA'
            room_match = re.search(r'\b(KT-\d+|G1-\d+|ANX1-\d+|SH-\d+|CTBA-\d+)\b', line)
            if room_match:
                room = room_match.group(0)
            # Try to find teacher
            teacher = 'TBA'
            remaining = line.replace(m[0], '').replace(f'({m[1]})', '')
            teacher_match = re.search(r'\b([A-Z]{2,4})\b', remaining)
            if teacher_match:
                teacher = teacher_match.group(0)
            matches.append({'room': room, 'course': m[0], 'section': m[1], 'teacher': teacher})
    
    # Process each match
    for idx, match in enumerate(matches):
        section_clean = re.sub(r'[^A-Z0-9_]', '', match['section'].replace(' ', '_').upper())
        if not section_clean:
            continue
        
        # Determine time slot based on position in line
        # If we have multiple matches, assign time slots sequentially
        if len(matches) > 1:
            # If there are multiple classes, assign time slots based on position
            time_slot = get_time_slot_by_position(line, match['room'], time_slots, idx, len(matches))
        else:
            time_slot = get_time_slot_by_position(line, match['room'], time_slots, idx, len(matches))
        
        # Determine class type
        class_type = 'Lab' if is_lab or 'LAB' in line.upper() or 'COM LAB' in line.upper() else 'Theory'
        
        # Extract batch
        batch_match = re.search(r'(\d{2})', section_clean)
        batch = batch_match.group(1) if batch_match else 'Unknown'
        
        # Extract section letter
        section_letter = re.sub(r'[^A-Z]', '', section_clean)
        if not section_letter:
            section_letter = section_clean
        
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


def get_time_slot_by_position(line, room, time_slots, match_index, total_matches):
    """Determine time slot based on position or index."""
    if room and room != 'TBA':
        pos = line.find(room)
        if pos != -1 and len(line) > 0:
            ratio = pos / len(line)
            
            if ratio < 0.18:
                return time_slots[0] if time_slots else 'TBA'
            elif ratio < 0.32:
                return time_slots[1] if len(time_slots) > 1 else 'TBA'
            elif ratio < 0.46:
                return time_slots[2] if len(time_slots) > 2 else 'TBA'
            elif ratio < 0.60:
                return time_slots[3] if len(time_slots) > 3 else 'TBA'
            elif ratio < 0.78:
                return time_slots[4] if len(time_slots) > 4 else 'TBA'
            else:
                return time_slots[5] if len(time_slots) > 5 else 'TBA'
    
    # If room not found, use match index
    if total_matches > 1 and match_index < len(time_slots):
        return time_slots[match_index]
    
    return 'TBA'


if __name__ == "__main__":
    main()
