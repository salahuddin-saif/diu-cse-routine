#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - FIXED VERSION
Correctly parses the class routine PDF
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
        logger.info("DIU CSE ROUTINE SCRAPER - FIXED VERSION")
        logger.info("=" * 60)
        
        # STEP 1: Find the class routine PDF
        logger.info("🔍 Looking for Class Routine...")
        pdf_url = find_class_routine_pdf()
        
        if not pdf_url:
            logger.error("❌ Could not find Class Routine PDF")
            sys.exit(1)
        
        logger.info(f"📄 PDF URL: {pdf_url}")
        
        # STEP 2: Download PDF
        logger.info("⬇️ Downloading PDF...")
        response = requests.get(pdf_url, timeout=30)
        response.raise_for_status()
        logger.info(f"✅ Downloaded {len(response.content)} bytes")
        
        # STEP 3: Parse PDF
        logger.info("📖 Parsing PDF...")
        sections = parse_pdf(response.content)
        
        if not sections:
            logger.error("❌ No data extracted from PDF")
            # Check debug file to see what was extracted
            if DEBUG_FILE.exists():
                logger.info(f"💡 Check {DEBUG_FILE} for extracted text")
            sys.exit(1)
        
        # STEP 4: Save data
        total = sum(len(entries) for entries in sections.values())
        output = {
            'updated_at': datetime.now(timezone.utc).isoformat(),
            'source': pdf_url,
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


def find_class_routine_pdf():
    """Find the Class Routine PDF."""
    try:
        response = requests.get(NOTICE_URL, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        
        for link in soup.find_all('a', href=True):
            text = link.get_text().strip()
            href = link.get('href', '')
            
            if 'class routine' in text.lower() and 'exam' not in text.lower():
                logger.info(f"🔗 Found: {text}")
                
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
                        return dl_href
        
        return None
        
    except Exception as e:
        logger.error(f"❌ Error: {e}")
        return None


def parse_pdf(content):
    """Parse PDF and extract routine data."""
    sections = {}
    
    try:
        pdf_reader = PyPDF2.PdfReader(BytesIO(content))
        logger.info(f"📄 PDF has {len(pdf_reader.pages)} pages")
        
        # Extract text
        all_text = ""
        for page_num, page in enumerate(pdf_reader.pages):
            text = page.extract_text()
            if text:
                all_text += text + "\n"
                logger.info(f"📝 Page {page_num + 1}: {len(text)} chars")
        
        if not all_text:
            logger.error("❌ No text extracted")
            return {}
        
        # Save debug text
        DEBUG_FILE.write_text(all_text)
        logger.info(f"💾 Saved debug text to {DEBUG_FILE}")
        
        # Try multiple parsing strategies
        sections = extract_routine_multiple_strategies(all_text)
        return sections
        
    except Exception as e:
        logger.error(f"❌ PDF parsing failed: {e}")
        return {}


def extract_routine_multiple_strategies(text):
    """Try multiple strategies to extract routine data."""
    sections = {}
    
    # Strategy 1: Original pattern
    logger.info("🔍 Strategy 1: Original pattern")
    pattern1 = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'
    sections = extract_with_pattern(text, pattern1)
    if sections:
        return sections
    
    # Strategy 2: More flexible pattern with optional spaces
    logger.info("🔍 Strategy 2: Flexible pattern")
    pattern2 = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\s*\(([^)]+)\)\s*([A-Z0-9_]+)'
    sections = extract_with_pattern(text, pattern2)
    if sections:
        return sections
    
    # Strategy 3: Without teacher initials (just room, course, section)
    logger.info("🔍 Strategy 3: Room + Course + Section")
    pattern3 = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\s*\(([^)]+)\)'
    sections = extract_with_pattern_simple(text, pattern3)
    if sections:
        return sections
    
    # Strategy 4: Line-by-line parsing looking for patterns
    logger.info("🔍 Strategy 4: Line-by-line parsing")
    sections = extract_line_by_line(text)
    if sections:
        return sections
    
    logger.error("❌ All strategies failed")
    return {}


def extract_with_pattern(text, pattern):
    """Extract using a regex pattern."""
    sections = {}
    lines = text.split('\n')
    time_slots = ['08:30-10:00', '10:00-11:30', '11:30-01:00', 
                  '01:00-02:30', '02:30-04:00', '04:00-05:30']
    current_day = None
    count = 0
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Check for day
        day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY)', line.upper())
        if day_match:
            current_day = day_match.group(1).capitalize()
            logger.debug(f"Day: {current_day}")
            continue
        
        if not current_day:
            continue
        
        # Skip table references
        if 'TABLE' in line.upper() or 'PAGE' in line.upper():
            continue
        
        # Find matches
        matches = re.findall(pattern, line)
        
        for match in matches:
            if len(match) >= 3:
                room = match[0]
                course = match[1]
                section = match[2]
                teacher = match[3] if len(match) > 3 else 'TBA'
                
                # Clean section
                section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
                if not section_clean:
                    continue
                
                # Determine time slot
                time_slot = 'TBA'
                if len(match) > 3:
                    pos = line.find(room)
                    if pos != -1 and len(line) > 0:
                        ratio = pos / len(line)
                        if ratio < 0.2:
                            time_slot = time_slots[0] if time_slots else 'TBA'
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
    
    logger.info(f"Strategy found {count} classes in {len(sections)} sections")
    return sections


def extract_with_pattern_simple(text, pattern):
    """Extract with simple pattern (room, course, section)."""
    sections = {}
    lines = text.split('\n')
    time_slots = ['08:30-10:00', '10:00-11:30', '11:30-01:00', 
                  '01:00-02:30', '02:30-04:00', '04:00-05:30']
    current_day = None
    count = 0
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY)', line.upper())
        if day_match:
            current_day = day_match.group(1).capitalize()
            continue
        
        if not current_day or 'TABLE' in line.upper():
            continue
        
        matches = re.findall(pattern, line)
        
        for match in matches:
            if len(match) >= 3:
                room = match[0]
                course = match[1]
                section = match[2]
                
                section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
                if not section_clean:
                    continue
                
                # Try to find teacher from remaining text
                teacher = 'TBA'
                remaining = line.replace(room, '').replace(course, '').replace(f'({section})', '')
                teacher_match = re.search(r'\b([A-Z]{2,4})\b', remaining)
                if teacher_match:
                    teacher = teacher_match.group(0)
                
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
    
    logger.info(f"Strategy found {count} classes in {len(sections)} sections")
    return sections


def extract_line_by_line(text):
    """Parse line by line looking for class data."""
    sections = {}
    lines = text.split('\n')
    time_slots = ['08:30-10:00', '10:00-11:30', '11:30-01:00', 
                  '01:00-02:30', '02:30-04:00', '04:00-05:30']
    current_day = None
    count = 0
    
    # More flexible patterns
    patterns = [
        r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)',
        r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\s*\(([^)]+)\)',
        r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([A-Z0-9_]+)\)',
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
        
        if not current_day or 'TABLE' in line.upper():
            continue
        
        # Try each pattern
        for pattern in patterns:
            matches = re.findall(pattern, line)
            if matches:
                for match in matches:
                    if len(match) >= 3:
                        room = match[0]
                        course = match[1]
                        section = match[2]
                        
                        section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
                        if not section_clean:
                            continue
                        
                        # Try to find teacher
                        teacher = 'TBA'
                        remaining = line.replace(room, '').replace(course, '').replace(f'({section})', '')
                        # Look for 2-4 letter uppercase pattern (teacher initials)
                        teacher_match = re.search(r'\b([A-Z]{2,4})\b', remaining)
                        if teacher_match:
                            teacher = teacher_match.group(0)
                        
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
                break  # Stop after first successful pattern
    
    logger.info(f"Line-by-line found {count} classes in {len(sections)} sections")
    return sections


if __name__ == "__main__":
    main()
