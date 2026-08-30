#!/usr/bin/env python3
"""
DIU CSE Routine Scraper – AGGRESSIVE EXTRACTION
"""

import json
import os
import sys
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict
import requests
from bs4 import BeautifulSoup

# Try pdfplumber, fallback to PyPDF2
try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False

try:
    import PyPDF2
    from io import BytesIO
    HAS_PYPDF2 = True
except ImportError:
    HAS_PYPDF2 = False

# ============================================================
# CONFIGURATION
# ============================================================

NOTICE_URL = "https://webbackend.daffodilvarsity.edu.bd/department/cse/notice"

# ============================================================
# FILE PATHS
# ============================================================

DATA_DIR = Path("data")
SECTIONS_DIR = DATA_DIR / "sections"
OUTPUT_FILE = DATA_DIR / "routine.json"
DEBUG_FILE = DATA_DIR / "debug_full_text.txt"

# ============================================================
# LOGGING
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def main():
    try:
        DATA_DIR.mkdir(exist_ok=True)
        SECTIONS_DIR.mkdir(exist_ok=True)

        logger.info("=" * 60)
        logger.info("DIU CSE ROUTINE SCRAPER – AGGRESSIVE")
        logger.info("=" * 60)

        # Find PDF
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
        pdf_content = response.content
        logger.info(f"✅ Downloaded {len(pdf_content)} bytes")

        # Extract text
        logger.info("📖 Extracting text from PDF...")
        text = extract_text(pdf_content)
        if not text:
            logger.error("❌ No text extracted")
            sys.exit(1)

        # Save debug text
        DEBUG_FILE.write_text(text)
        logger.info(f"💾 Saved full text to {DEBUG_FILE}")

        # Log first 200 lines for inspection
        lines = text.split('\n')
        logger.info("📄 FIRST 200 LINES OF EXTRACTED TEXT:")
        for i, line in enumerate(lines[:200]):
            if line.strip():
                logger.info(f"  {i:3d}: {line}")

        # Extract classes using multiple strategies
        logger.info("🔍 Extracting classes...")
        all_classes = extract_classes_aggressive(text)

        if not all_classes:
            logger.error("❌ No classes extracted. Check debug file.")
            sys.exit(1)

        logger.info(f"📊 Extracted {len(all_classes)} raw class records")

        # Group and save
        sections = group_and_verify(all_classes)

        total = sum(len(entries) for entries in sections.values())
        output = {
            'updated_at': datetime.now(timezone.utc).isoformat(),
            'source': pdf_url,
            'version': version,
            'sections': sections
        }
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        logger.info(f"✅ Saved combined JSON: {len(sections)} sections, {total} classes")

        for section_key, section_data in sections.items():
            safe_key = re.sub(r'[^\w\-]', '_', section_key)
            section_file = SECTIONS_DIR / f"{safe_key}.json"
            with open(section_file, 'w', encoding='utf-8') as f:
                json.dump({
                    'section': section_key,
                    'batch': section_data.get('batch', 'Unknown'),
                    'classes': section_data.get('classes', [])
                }, f, indent=2, ensure_ascii=False)
            logger.info(f"   Saved {section_file}")

        sys.exit(0)

    except Exception as e:
        logger.error(f"❌ Failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)


def find_latest_class_routine():
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
        logger.error(f"❌ Error finding PDF: {e}")
        return None


def extract_text(pdf_content):
    """Extract text using pdfplumber or PyPDF2."""
    if HAS_PDFPLUMBER:
        try:
            with pdfplumber.open(BytesIO(pdf_content)) as pdf:
                text = ""
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
                return text
        except Exception as e:
            logger.warning(f"pdfplumber failed: {e}, falling back to PyPDF2")

    if HAS_PYPDF2:
        try:
            reader = PyPDF2.PdfReader(BytesIO(pdf_content))
            text = ""
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
            return text
        except Exception as e:
            logger.error(f"PyPDF2 failed: {e}")
            return None

    logger.error("No PDF extraction library available")
    return None


def extract_classes_aggressive(text):
    """Extract classes using aggressive multiple strategies."""
    all_classes = []
    lines = text.split('\n')

    # Time slots
    time_slots = [
        '08:30-10:00', '10:00-11:30', '11:30-01:00',
        '01:00-02:30', '02:30-04:00', '04:00-05:30'
    ]

    # Days
    days = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']

    # We'll try three strategies:
    # Strategy 1: Find course codes with section in parentheses
    # Strategy 2: Find lines with room and course codes
    # Strategy 3: Find any course code and infer section from nearby text

    # First, detect current day
    current_day = None
    for line in lines:
        upper = line.upper()
        for day in days:
            if day in upper and any(slot in upper for slot in time_slots):
                current_day = day.capitalize()
                break
        if current_day:
            break

    if not current_day:
        logger.warning("No day header found, defaulting to Unknown")
        current_day = 'Unknown'

    # Strategy 1: Look for patterns with parentheses
    pattern1 = re.compile(r'([A-Z]{3,4}\d{3,4})\s*\(([^)]+)\)\s*([A-Z0-9_]+)?')
    # Strategy 2: Look for room + course code
    pattern2 = re.compile(r'(KT-\d+|G1-\d+|ANX1-\d+|SH-\d+)\s+([A-Z]{3,4}\d{3,4})')
    # Strategy 3: Just find course codes
    pattern3 = re.compile(r'([A-Z]{3,4}\d{3,4})')

    # Also look for lab keywords
    lab_keywords = ['LAB', 'COM LAB', 'ELECTRICAL', 'PHYSICS']

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Update day if we see a header
        upper = stripped.upper()
        for day in days:
            if day in upper and any(slot in upper for slot in time_slots):
                current_day = day.capitalize()
                break

        # Skip table of contents
        if 'TABLE' in upper or 'PAGE' in upper:
            continue

        # Check for lab
        is_lab = any(kw in upper for kw in lab_keywords)

        # ----- Strategy 1: Course(Section) with optional teacher -----
        matches1 = pattern1.findall(stripped)
        for match in matches1:
            course = match[0]
            section = match[1]
            teacher = match[2] if len(match) > 2 and match[2] else 'TBA'

            # Find room in the same line
            room = 'TBA'
            room_match = re.search(r'(KT-\d+|G1-\d+|ANX1-\d+|SH-\d+)', stripped)
            if room_match:
                room = room_match.group(0)

            section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
            if not section_clean:
                continue

            # Assign time slot based on position (if room found)
            time_slot = 'TBA'
            if room != 'TBA':
                pos = stripped.find(room)
                if pos != -1 and len(stripped) > 0:
                    ratio = pos / len(stripped)
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

            all_classes.append({
                'section_key': section_clean,
                'day': current_day,
                'time': time_slot,
                'course': course,
                'teacher': teacher,
                'room': room,
                'type': 'Lab' if is_lab else 'Theory',
                'batch': re.search(r'(\d{2})', section_clean).group(1) if re.search(r'(\d{2})', section_clean) else 'Unknown',
                'section_letter': re.sub(r'[^A-Z]', '', section_clean)
            })

        # ----- Strategy 2: Room + Course (without parentheses) -----
        matches2 = pattern2.findall(stripped)
        for room, course in matches2:
            # Try to find a section nearby
            section = 'Unknown'
            # Look for something like 70_N or 66_E in the line
            section_match = re.search(r'(\d{2}_[A-Z])', stripped)
            if section_match:
                section = section_match.group(0)
            # Or look for parentheses
            paren_match = re.search(r'\(([^)]+)\)', stripped)
            if paren_match:
                section = paren_match.group(1)

            section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
            if not section_clean:
                # Try to infer section from the line context
                # If we have a room and course, we can try to find a section number
                batch_match = re.search(r'(\d{2})', stripped)
                if batch_match:
                    section_clean = batch_match.group(1) + '_' + (re.search(r'([A-Z])', stripped).group(0) if re.search(r'([A-Z])', stripped) else 'X')
                else:
                    continue

            # Try to find teacher
            teacher = 'TBA'
            teacher_match = re.search(r'\b([A-Z]{2,4})\b', stripped)
            if teacher_match:
                teacher = teacher_match.group(0)

            # Assign time slot
            time_slot = 'TBA'
            pos = stripped.find(room)
            if pos != -1 and len(stripped) > 0:
                ratio = pos / len(stripped)
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

            all_classes.append({
                'section_key': section_clean,
                'day': current_day,
                'time': time_slot,
                'course': course,
                'teacher': teacher,
                'room': room,
                'type': 'Lab' if is_lab else 'Theory',
                'batch': re.search(r'(\d{2})', section_clean).group(1) if re.search(r'(\d{2})', section_clean) else 'Unknown',
                'section_letter': re.sub(r'[^A-Z]', '', section_clean)
            })

    # If we still have no classes, try a very aggressive approach:
    # Just find any course code and create a class entry
    if not all_classes:
        logger.warning("No classes extracted with strategies 1 & 2, using fallback strategy 3")
        for line in lines:
            if not line.strip():
                continue
            courses = pattern3.findall(line)
            for course in courses:
                # Try to find a section
                section = 'Unknown'
                section_match = re.search(r'(\d{2}_[A-Z])', line)
                if section_match:
                    section = section_match.group(0)
                else:
                    paren_match = re.search(r'\(([^)]+)\)', line)
                    if paren_match:
                        section = paren_match.group(1)
                section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
                if not section_clean:
                    continue
                # Try to find room
                room = 'TBA'
                room_match = re.search(r'(KT-\d+|G1-\d+|ANX1-\d+|SH-\d+)', line)
                if room_match:
                    room = room_match.group(0)
                # Try to find teacher
                teacher = 'TBA'
                teacher_match = re.search(r'\b([A-Z]{2,4})\b', line)
                if teacher_match:
                    teacher = teacher_match.group(0)
                # Assign time slot
                time_slot = 'TBA'
                if room != 'TBA':
                    pos = line.find(room)
                    if pos != -1 and len(line) > 0:
                        ratio = pos / len(line)
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
                all_classes.append({
                    'section_key': section_clean,
                    'day': current_day,
                    'time': time_slot,
                    'course': course,
                    'teacher': teacher,
                    'room': room,
                    'type': 'Theory',
                    'batch': re.search(r'(\d{2})', section_clean).group(1) if re.search(r'(\d{2})', section_clean) else 'Unknown',
                    'section_letter': re.sub(r'[^A-Z]', '', section_clean)
                })

    return all_classes


def group_and_verify(all_classes):
    sections = defaultdict(lambda: {'classes': []})
    for cls in all_classes:
        key = cls['section_key']
        sections[key]['batch'] = cls.get('batch', 'Unknown')
        sections[key]['section'] = cls.get('section_letter', '')
        entry = {
            'day': cls['day'],
            'time': cls['time'],
            'course': cls['course'],
            'teacher': cls['teacher'],
            'room': cls['room'],
            'type': cls['type'],
            'batch': cls.get('batch', 'Unknown'),
            'section': cls.get('section_letter', '')
        }
        sections[key]['classes'].append(entry)

    # Sort classes by day and time
    day_order = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    time_order = [
        '08:30-10:00', '10:00-11:30', '11:30-01:00',
        '01:00-02:30', '02:30-04:00', '04:00-05:30'
    ]
    for section in sections.values():
        section['classes'].sort(key=lambda c: (
            day_order.index(c['day']) if c['day'] in day_order else 999,
            time_order.index(c['time']) if c['time'] in time_order else 999
        ))

    return dict(sections)


if __name__ == "__main__":
    main()
