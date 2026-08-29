#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - PyPDF2 Version
Properly extracts data from the routine PDF
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
        logger.info("DIU CSE ROUTINE SCRAPER - PyPDF2")
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
        sections = parse_pdf_with_pypdf2(response.content)
        
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


def parse_pdf_with_pypdf2(content):
    """Parse PDF using PyPDF2 with multiple strategies."""
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
        
        # Try multiple strategies
        strategies = [
            ("Strategy 1: Pattern with Room Course(Section) Teacher", extract_with_pattern1),
            ("Strategy 2: Pattern with Course(Section) Teacher", extract_with_pattern2),
            ("Strategy 3: Simple course code extraction", extract_courses_simple),
            ("Strategy 4: Line-by-line parsing", extract_line_by_line),
        ]
        
        for name, strategy in strategies:
            logger.info(f"🔍 Trying {name}...")
            result = strategy(all_text)
            if result:
                total = sum(len(entries) for entries in result.values())
                if total > 0:
                    logger.info(f"✅ {name} found {total} classes in {len(result)} sections")
                    return result
        
        # If all strategies fail, try to extract from the raw text
        logger.info("🔍 Trying aggressive extraction...")
        result = extract_aggressive(all_text)
        if result:
            total = sum(len(entries) for entries in result.values())
            if total > 0:
                logger.info(f"✅ Aggressive extraction found {total} classes")
                return result
        
        return {}
        
    except Exception as e:
        logger.error(f"❌ PDF parsing failed: {e}")
        return {}


def extract_with_pattern1(text):
    """Pattern: Room Course(Section) Teacher"""
    sections = {}
    lines = text.split('\n')
    time_slots = ['08:30-10:00', '10:00-11:30', '11:30-01:00', '01:00-02:30', '02:30-04:00', '04:00-05:30']
    current_day = None
    count = 0
    
    # Pattern: KT-201 CSE315(66_E) AS
    pattern = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Check for day
        day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY)', line.upper())
        if day_match:
            current_day = day_match.group(1).capitalize()
            continue
        
        if not current_day:
            continue
        
        # Skip table of contents and page numbers
        if 'TABLE' in line.upper() or 'PAGE' in line.upper() or 'PDF' in line.upper():
            continue
        
        # Find matches
        matches = re.findall(pattern, line)
        
        for room, course, section, teacher in matches:
            section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
            if not section_clean:
                continue
            
            # Determine time slot based on position
            time_slot = get_time_slot_from_position(line, room, time_slots)
            
            # Determine type
            class_type = 'Lab' if 'LAB' in line.upper() or 'COM LAB' in line.upper() else 'Theory'
            
            # Extract batch
            batch_match = re.search(r'(\d{2})', section_clean)
            batch = batch_match.group(1) if batch_match else 'Unknown'
            section_letter = re.sub(r'[^A-Z]', '', section_clean)
            
            entry = {
                'day': current_day,
                'time': time_slot,
                'course': course,
                'teacher': teacher,
                'room': room,
                'type': class_type,
                'batch': batch,
                'section': section_letter
            }
            
            if section_clean not in sections:
                sections[section_clean] = {
                    'batch': batch,
                    'section': section_letter,
                    'classes': []
                }
            sections[section_clean]['classes'].append(entry)
            count += 1
    
    return sections if count > 0 else {}


def extract_with_pattern2(text):
    """Pattern: Course(Section) Teacher"""
    sections = {}
    lines = text.split('\n')
    time_slots = ['08:30-10:00', '10:00-11:30', '11:30-01:00', '01:00-02:30', '02:30-04:00', '04:00-05:30']
    current_day = None
    count = 0
    
    pattern = r'([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY)', line.upper())
        if day_match:
            current_day = day_match.group(1).capitalize()
            continue
        
        if not current_day or 'TABLE' in line.upper() or 'PAGE' in line.upper():
            continue
        
        matches = re.findall(pattern, line)
        
        for course, section, teacher in matches:
            section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
            if not section_clean:
                continue
            
            # Try to find room
            room = 'TBA'
            room_match = re.search(r'\b(KT-\d+|G1-\d+|ANX1-\d+|SH-\d+)\b', line)
            if room_match:
                room = room_match.group(0)
            
            # Determine time slot
            time_slot = 'TBA'
            if room != 'TBA':
                time_slot = get_time_slot_from_position(line, room, time_slots)
            
            class_type = 'Lab' if 'LAB' in line.upper() else 'Theory'
            
            batch_match = re.search(r'(\d{2})', section_clean)
            batch = batch_match.group(1) if batch_match else 'Unknown'
            section_letter = re.sub(r'[^A-Z]', '', section_clean)
            
            entry = {
                'day': current_day,
                'time': time_slot,
                'course': course,
                'teacher': teacher,
                'room': room,
                'type': class_type,
                'batch': batch,
                'section': section_letter
            }
            
            if section_clean not in sections:
                sections[section_clean] = {
                    'batch': batch,
                    'section': section_letter,
                    'classes': []
                }
            sections[section_clean]['classes'].append(entry)
            count += 1
    
    return sections if count > 0 else {}


def extract_courses_simple(text):
    """Simple course code extraction."""
    sections = {}
    lines = text.split('\n')
    current_day = None
    count = 0
    
    # Look for course codes with sections in parentheses
    pattern = r'([A-Z]{3,4}\d{3,4})\(([A-Z0-9_]+)\)'
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY)', line.upper())
        if day_match:
            current_day = day_match.group(1).capitalize()
            continue
        
        if not current_day or 'TABLE' in line.upper() or 'PAGE' in line.upper():
            continue
        
        matches = re.findall(pattern, line)
        
        for course, section in matches:
            section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
            if not section_clean:
                continue
            
            # Try to find teacher
            teacher = 'TBA'
            remaining = line.replace(course, '').replace(f'({section})', '')
            teacher_match = re.search(r'\b([A-Z]{2,4})\b', remaining)
            if teacher_match:
                teacher = teacher_match.group(0)
            
            # Try to find room
            room = 'TBA'
            room_match = re.search(r'\b(KT-\d+|G1-\d+|ANX1-\d+|SH-\d+)\b', line)
            if room_match:
                room = room_match.group(0)
            
            # Determine time slot
            time_slot = 'TBA'
            if room != 'TBA':
                time_slots = ['08:30-10:00', '10:00-11:30', '11:30-01:00', '01:00-02:30', '02:30-04:00', '04:00-05:30']
                time_slot = get_time_slot_from_position(line, room, time_slots)
            
            class_type = 'Lab' if 'LAB' in line.upper() else 'Theory'
            
            batch_match = re.search(r'(\d{2})', section_clean)
            batch = batch_match.group(1) if batch_match else 'Unknown'
            section_letter = re.sub(r'[^A-Z]', '', section_clean)
            
            entry = {
                'day': current_day,
                'time': time_slot,
                'course': course,
                'teacher': teacher,
                'room': room,
                'type': class_type,
                'batch': batch,
                'section': section_letter
            }
            
            if section_clean not in sections:
                sections[section_clean] = {
                    'batch': batch,
                    'section': section_letter,
                    'classes': []
                }
            sections[section_clean]['classes'].append(entry)
            count += 1
    
    return sections if count > 0 else {}


def extract_line_by_line(text):
    """Line-by-line parsing."""
    sections = {}
    lines = text.split('\n')
    current_day = None
    count = 0
    
    # Multiple patterns to try
    patterns = [
        r'([A-Z]{3,4}\d{3,4})\(([A-Z0-9_]+)\)\s*([A-Z0-9_]+)',
        r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([A-Z0-9_]+)\)',
        r'([A-Z]{3,4}\d{3,4})\(([A-Z0-9_]+)\)',
    ]
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY)', line.upper())
        if day_match:
            current_day = day_match.group(1).capitalize()
            continue
        
        if not current_day or 'TABLE' in line.upper() or 'PAGE' in line.upper():
            continue
        
        for pattern in patterns:
            matches = re.findall(pattern, line)
            if matches:
                for match in matches:
                    if isinstance(match, tuple):
                        if len(match) >= 2:
                            course = match[0]
                            section = match[1]
                            teacher = match[2] if len(match) > 2 else 'TBA'
                            
                            section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
                            if not section_clean:
                                continue
                            
                            room = 'TBA'
                            room_match = re.search(r'\b(KT-\d+|G1-\d+|ANX1-\d+|SH-\d+)\b', line)
                            if room_match:
                                room = room_match.group(0)
                            
                            time_slots = ['08:30-10:00', '10:00-11:30', '11:30-01:00', '01:00-02:30', '02:30-04:00', '04:00-05:30']
                            time_slot = 'TBA'
                            if room != 'TBA':
                                time_slot = get_time_slot_from_position(line, room, time_slots)
                            
                            class_type = 'Lab' if 'LAB' in line.upper() else 'Theory'
                            
                            batch_match = re.search(r'(\d{2})', section_clean)
                            batch = batch_match.group(1) if batch_match else 'Unknown'
                            section_letter = re.sub(r'[^A-Z]', '', section_clean)
                            
                            entry = {
                                'day': current_day,
                                'time': time_slot,
                                'course': course,
                                'teacher': teacher,
                                'room': room,
                                'type': class_type,
                                'batch': batch,
                                'section': section_letter
                            }
                            
                            if section_clean not in sections:
                                sections[section_clean] = {
                                    'batch': batch,
                                    'section': section_letter,
                                    'classes': []
                                }
                            sections[section_clean]['classes'].append(entry)
                            count += 1
                break
    
    return sections if count > 0 else {}


def extract_aggressive(text):
    """Aggressive extraction - try everything."""
    sections = {}
    lines = text.split('\n')
    current_day = None
    count = 0
    
    # Look for any course code pattern
    course_pattern = r'([A-Z]{3,4}\d{3,4})'
    section_pattern = r'\(([A-Z0-9_]+)\)'
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY)', line.upper())
        if day_match:
            current_day = day_match.group(1).capitalize()
            continue
        
        if not current_day or 'TABLE' in line.upper() or 'PAGE' in line.upper():
            continue
        
        # Find all courses and sections
        courses = re.findall(course_pattern, line)
        sections_found = re.findall(section_pattern, line)
        
        if courses and sections_found:
            for i, course in enumerate(courses):
                section = sections_found[i] if i < len(sections_found) else sections_found[0]
                section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
                if not section_clean:
                    continue
                
                # Try to find teacher
                teacher = 'TBA'
                remaining = line
                for c in courses:
                    remaining = remaining.replace(c, '')
                for s in sections_found:
                    remaining = remaining.replace(f'({s})', '')
                teacher_match = re.search(r'\b([A-Z]{2,4})\b', remaining)
                if teacher_match:
                    teacher = teacher_match.group(0)
                
                room = 'TBA'
                room_match = re.search(r'\b(KT-\d+|G1-\d+|ANX1-\d+|SH-\d+)\b', line)
                if room_match:
                    room = room_match.group(0)
                
                time_slots = ['08:30-10:00', '10:00-11:30', '11:30-01:00', '01:00-02:30', '02:30-04:00', '04:00-05:30']
                time_slot = 'TBA'
                if room != 'TBA':
                    time_slot = get_time_slot_from_position(line, room, time_slots)
                
                class_type = 'Lab' if 'LAB' in line.upper() else 'Theory'
                
                batch_match = re.search(r'(\d{2})', section_clean)
                batch = batch_match.group(1) if batch_match else 'Unknown'
                section_letter = re.sub(r'[^A-Z]', '', section_clean)
                
                entry = {
                    'day': current_day,
                    'time': time_slot,
                    'course': course,
                    'teacher': teacher,
                    'room': room,
                    'type': class_type,
                    'batch': batch,
                    'section': section_letter
                }
                
                if section_clean not in sections:
                    sections[section_clean] = {
                        'batch': batch,
                        'section': section_letter,
                        'classes': []
                    }
                sections[section_clean]['classes'].append(entry)
                count += 1
    
    return sections if count > 0 else {}


def get_time_slot_from_position(line, room, time_slots):
    """Determine time slot based on room position."""
    pos = line.find(room)
    if pos == -1:
        return 'TBA'
    
    line_len = len(line)
    if line_len == 0:
        return 'TBA'
    
    ratio = pos / line_len
    
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


if __name__ == "__main__":
    main()
