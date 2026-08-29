#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - FINAL WORKING VERSION
Uses multiple strategies to extract data from the PDF
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
        logger.info("DIU CSE ROUTINE SCRAPER - FINAL VERSION")
        logger.info("=" * 60)
        
        # STEP 1: Find the class routine PDF
        logger.info("🔍 Looking for latest Class Routine...")
        result = find_latest_class_routine()
        
        if not result:
            logger.error("❌ Could not find Class Routine")
            sys.exit(1)
        
        pdf_url, version = result
        logger.info(f"📄 Found Version: {version}")
        logger.info(f"📄 PDF URL: {pdf_url}")
        
        # STEP 2: Download PDF
        logger.info("⬇️ Downloading PDF...")
        response = requests.get(pdf_url, timeout=30)
        response.raise_for_status()
        logger.info(f"✅ Downloaded {len(response.content)} bytes")
        
        # STEP 3: Parse PDF with multiple strategies
        logger.info("📖 Parsing PDF...")
        sections = parse_pdf_with_strategies(response.content)
        
        if not sections:
            logger.error("❌ No data extracted from PDF")
            sys.exit(1)
        
        # STEP 4: Save data
        total = sum(len(entries) for entries in sections.values())
        output = {
            'updated_at': datetime.now(timezone.utc).isoformat(),
            'source': pdf_url,
            'version': version,
            'sections': sections
        }
        
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        
        logger.info(f"✅ Saved Version {version} with {len(sections)} sections, {total} classes")
        sys.exit(0)
        
    except Exception as e:
        logger.error(f"❌ Failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)


def find_latest_class_routine():
    """Find the latest class routine and detect version."""
    try:
        response = requests.get(NOTICE_URL, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        
        routine_notices = []
        
        for link in soup.find_all('a', href=True):
            text = link.get_text().strip()
            href = link.get('href', '')
            
            if 'class routine' in text.lower() and 'exam' not in text.lower():
                version_match = re.search(r'[Vv]ersion\s*([\d.]+)', text)
                version = version_match.group(1) if version_match else '5.0'
                
                routine_notices.append({
                    'text': text,
                    'href': href,
                    'version': version
                })
        
        if not routine_notices:
            return None
        
        # Sort by version
        routine_notices.sort(key=lambda x: parse_version(x['version']), reverse=True)
        latest = routine_notices[0]
        
        href = latest['href']
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
                return (dl_href, latest['version'])
        
        return None
        
    except Exception as e:
        logger.error(f"❌ Error: {e}")
        return None


def parse_version(version_str):
    """Convert version string to comparable number."""
    try:
        parts = version_str.split('.')
        return tuple(int(p) for p in parts)
    except:
        return (0,)


def parse_pdf_with_strategies(content):
    """Parse PDF using multiple strategies."""
    sections = {}
    
    try:
        pdf_reader = PyPDF2.PdfReader(BytesIO(content))
        logger.info(f"📄 PDF has {len(pdf_reader.pages)} pages")
        
        # Extract all text
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
        
        # Try multiple strategies
        strategies = [
            ("Strategy 1: Pattern with Room Course(Section) Teacher", extract_with_pattern1),
            ("Strategy 2: Pattern with Room Course(Section)", extract_with_pattern2),
            ("Strategy 3: Pattern with Course(Section) Teacher", extract_with_pattern3),
            ("Strategy 4: Simple line parsing", extract_line_by_line),
            ("Strategy 5: Aggressive parsing", extract_aggressive),
        ]
        
        for name, strategy in strategies:
            logger.info(f"🔍 Trying {name}...")
            result = strategy(all_text)
            if result:
                total = sum(len(entries) for entries in result.values())
                if total > 0:
                    logger.info(f"✅ {name} found {total} classes in {len(result)} sections")
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
    
    # More flexible pattern
    pattern = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\s*\(([^)]+)\)\s*([A-Z0-9_]+)'
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Check for day
        day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY)', line.upper())
        if day_match:
            current_day = day_match.group(1).capitalize()
            continue
        
        if not current_day or 'TABLE' in line.upper() or 'PAGE' in line.upper():
            continue
        
        matches = re.findall(pattern, line)
        
        for room, course, section, teacher in matches:
            section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
            if not section_clean:
                continue
            
            # Determine time slot
            time_slot = 'TBA'
            pos = line.find(room)
            if pos != -1 and len(line) > 0:
                ratio = pos / len(line)
                if ratio < 0.2:
                    time_slot = time_slots[0]
                elif ratio < 0.35:
                    time_slot = time_slots[1] if len(time_slots) > 1 else 'TBA'
                elif ratio < 0.5:
                    time_slot = time_slots[2] if len(time_slots) > 2 else 'TBA'
                elif ratio < 0.65:
                    time_slot = time_slots[3] if len(time_slots) > 3 else 'TBA'
                elif ratio < 0.8:
                    time_slot = time_slots[4] if len(time_slots) > 4 else 'TBA'
                else:
                    time_slot = time_slots[5] if len(time_slots) > 5 else 'TBA'
            
            entry = {
                'day': current_day,
                'time': time_slot,
                'course': course,
                'teacher': teacher,
                'room': room,
                'type': 'Lab' if 'LAB' in line.upper() else 'Theory'
            }
            
            if section_clean not in sections:
                sections[section_clean] = []
            sections[section_clean].append(entry)
            count += 1
    
    return sections if count > 0 else {}


def extract_with_pattern2(text):
    """Pattern: Room Course(Section)"""
    sections = {}
    lines = text.split('\n')
    time_slots = ['08:30-10:00', '10:00-11:30', '11:30-01:00', '01:00-02:30', '02:30-04:00', '04:00-05:30']
    current_day = None
    count = 0
    
    pattern = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\s*\(([^)]+)\)'
    
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
        
        for room, course, section in matches:
            section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
            if not section_clean:
                continue
            
            # Try to find teacher
            teacher = 'TBA'
            remaining = line.replace(room, '').replace(course, '').replace(f'({section})', '')
            teacher_match = re.search(r'\b([A-Z]{2,4})\b', remaining)
            if teacher_match:
                teacher = teacher_match.group(0)
            
            # Determine time slot
            time_slot = 'TBA'
            pos = line.find(room)
            if pos != -1 and len(line) > 0:
                ratio = pos / len(line)
                if ratio < 0.2:
                    time_slot = time_slots[0]
                elif ratio < 0.35:
                    time_slot = time_slots[1] if len(time_slots) > 1 else 'TBA'
                elif ratio < 0.5:
                    time_slot = time_slots[2] if len(time_slots) > 2 else 'TBA'
                elif ratio < 0.65:
                    time_slot = time_slots[3] if len(time_slots) > 3 else 'TBA'
                elif ratio < 0.8:
                    time_slot = time_slots[4] if len(time_slots) > 4 else 'TBA'
                else:
                    time_slot = time_slots[5] if len(time_slots) > 5 else 'TBA'
            
            entry = {
                'day': current_day,
                'time': time_slot,
                'course': course,
                'teacher': teacher,
                'room': room,
                'type': 'Lab' if 'LAB' in line.upper() else 'Theory'
            }
            
            if section_clean not in sections:
                sections[section_clean] = []
            sections[section_clean].append(entry)
            count += 1
    
    return sections if count > 0 else {}


def extract_with_pattern3(text):
    """Pattern: Course(Section) Teacher"""
    sections = {}
    lines = text.split('\n')
    time_slots = ['08:30-10:00', '10:00-11:30', '11:30-01:00', '01:00-02:30', '02:30-04:00', '04:00-05:30']
    current_day = None
    count = 0
    
    pattern = r'([A-Z]{3,4}\d{3,4})\s*\(([^)]+)\)\s*([A-Z0-9_]+)'
    
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
            
            entry = {
                'day': current_day,
                'time': 'TBA',
                'course': course,
                'teacher': teacher,
                'room': room,
                'type': 'Lab' if 'LAB' in line.upper() else 'Theory'
            }
            
            if section_clean not in sections:
                sections[section_clean] = []
            sections[section_clean].append(entry)
            count += 1
    
    return sections if count > 0 else {}


def extract_line_by_line(text):
    """Simple line-by-line parsing."""
    sections = {}
    lines = text.split('\n')
    time_slots = ['08:30-10:00', '10:00-11:30', '11:30-01:00', '01:00-02:30', '02:30-04:00', '04:00-05:30']
    current_day = None
    count = 0
    
    # Look for class patterns in each line
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Check for day
        day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY)', line.upper())
        if day_match:
            current_day = day_match.group(1).capitalize()
            continue
        
        if not current_day or 'TABLE' in line.upper() or 'PAGE' in line.upper():
            continue
        
        # Look for course codes
        course_matches = re.findall(r'([A-Z]{3,4}\d{3,4})', line)
        if not course_matches:
            continue
        
        # Look for sections in parentheses
        section_matches = re.findall(r'\(([^)]+)\)', line)
        if not section_matches:
            continue
        
        # Pair courses with sections
        for i, course in enumerate(course_matches):
            section = section_matches[i] if i < len(section_matches) else section_matches[0]
            section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
            if not section_clean:
                continue
            
            # Try to find teacher
            teacher = 'TBA'
            teacher_match = re.search(r'\b([A-Z]{2,4})\b', line.replace(course, '').replace(f'({section})', ''))
            if teacher_match:
                teacher = teacher_match.group(0)
            
            # Try to find room
            room = 'TBA'
            room_match = re.search(r'\b(KT-\d+|G1-\d+|ANX1-\d+|SH-\d+)\b', line)
            if room_match:
                room = room_match.group(0)
            
            entry = {
                'day': current_day,
                'time': 'TBA',
                'course': course,
                'teacher': teacher,
                'room': room,
                'type': 'Lab' if 'LAB' in line.upper() else 'Theory'
            }
            
            if section_clean not in sections:
                sections[section_clean] = []
            sections[section_clean].append(entry)
            count += 1
    
    return sections if count > 0 else {}


def extract_aggressive(text):
    """Aggressive parsing - look for any pattern."""
    sections = {}
    lines = text.split('\n')
    current_day = None
    count = 0
    
    # Multiple patterns to try
    patterns = [
        r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([A-Z0-9_]+)\)',
        r'([A-Z]{3,4}\d{3,4})\(([A-Z0-9_]+)\)',
        r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})',
        r'([A-Z]{3,4}\d{3,4})\s+([A-Z0-9_]+)',
    ]
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Check for day
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
                            # Try to identify parts
                            parts = list(match)
                            course = None
                            section = None
                            room = None
                            teacher = None
                            
                            for part in parts:
                                if re.match(r'[A-Z]{3,4}\d{3,4}', part):
                                    course = part
                                elif re.match(r'[A-Z0-9_]+', part) and not course:
                                    section = part
                                elif re.match(r'[A-Z]{2,4}', part) and len(part) <= 4:
                                    teacher = part
                                elif re.match(r'[A-Z0-9\-]+', part) and '-' in part:
                                    room = part
                            
                            if course and section:
                                section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
                                if section_clean:
                                    entry = {
                                        'day': current_day,
                                        'time': 'TBA',
                                        'course': course,
                                        'teacher': teacher or 'TBA',
                                        'room': room or 'TBA',
                                        'type': 'Lab' if 'LAB' in line.upper() else 'Theory'
                                    }
                                    
                                    if section_clean not in sections:
                                        sections[section_clean] = []
                                    sections[section_clean].append(entry)
                                    count += 1
                    else:
                        # Single match
                        if re.match(r'[A-Z]{3,4}\d{3,4}', match):
                            # Found a course code
                            pass
                break  # Stop after first successful pattern
    
    return sections if count > 0 else {}


if __name__ == "__main__":
    main()
