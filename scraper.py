#!/usr/bin/env python3
"""
DIU CSE Routine Scraper – TEXT-BASED WITH REGEX
"""

import json
import re
import sys
from pathlib import Path
from collections import defaultdict
import requests
from bs4 import BeautifulSoup
import pdfplumber
from io import BytesIO
import logging

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
DEBUG_FILE = DATA_DIR / "debug_text.txt"

# ============================================================
# LOGGING
# ============================================================

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============================================================
# MAIN
# ============================================================

def main():
    try:
        DATA_DIR.mkdir(exist_ok=True)
        SECTIONS_DIR.mkdir(exist_ok=True)

        logger.info("=" * 60)
        logger.info("DIU CSE ROUTINE SCRAPER – TEXT-BASED REGEX")
        logger.info("=" * 60)

        result = find_latest_class_routine()
        if not result:
            logger.error("❌ Could not find Class Routine")
            sys.exit(1)

        pdf_url, version = result
        logger.info(f"📄 Found Version: {version}")

        logger.info("⬇️ Downloading PDF...")
        response = requests.get(pdf_url, timeout=30)
        response.raise_for_status()
        pdf_content = response.content
        logger.info(f"✅ Downloaded {len(pdf_content)} bytes")

        logger.info("📖 Extracting text from PDF...")
        text = extract_text(pdf_content)
        if not text:
            logger.error("❌ No text extracted")
            sys.exit(1)

        DEBUG_FILE.write_text(text)
        logger.info(f"💾 Saved debug text to {DEBUG_FILE}")

        logger.info("🔍 Extracting classes using regex...")
        all_classes = extract_classes_from_text(text)

        if not all_classes:
            logger.error("❌ No classes extracted")
            sys.exit(1)

        logger.info(f"📊 Extracted {len(all_classes)} raw class records")

        sections = group_and_verify(all_classes)

        total = sum(len(entries) for entries in sections.values())
        from datetime import datetime, timezone
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
    """Extract text using pdfplumber (fallback to PyPDF2)."""
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
        try:
            import PyPDF2
            reader = PyPDF2.PdfReader(BytesIO(pdf_content))
            text = ""
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
            return text
        except Exception as e2:
            logger.error(f"PyPDF2 failed: {e2}")
            return None


def extract_classes_from_text(text):
    """Extract classes using regex with day detection."""
    all_classes = []
    lines = text.split('\n')

    time_slots = [
        '08:30-10:00', '10:00-11:30', '11:30-01:00',
        '01:00-02:30', '02:30-04:00', '04:00-05:30'
    ]
    days = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']

    current_day = None
    class_count = 0

    # Pattern: Room Course(Section) Teacher
    pattern = re.compile(r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)')
    # Fallback: Room Course(Section)
    pattern2 = re.compile(r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)')

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        upper = stripped.upper()

        # ---- Day Detection ----
        # If line contains a day name and is either short (header) or has no time slots
        day_found = None
        for day in days:
            if day in upper:
                # Check if it's a header line (short or no time slots)
                if len(stripped) < 30 or not any(slot in upper for slot in time_slots):
                    day_found = day.capitalize()
                    break

        if day_found:
            current_day = day_found
            logger.info(f"📅 Found day: {current_day}")
            continue

        if not current_day:
            continue

        # Skip table headers like "Room Course Teacher"
        if 'ROOM' in upper and 'COURSE' in upper and 'TEACHER' in upper:
            continue

        # Skip table of contents and page numbers
        if 'TABLE' in upper or 'PAGE' in upper:
            continue

        # Check for lab
        is_lab = 'LAB' in upper or 'COM LAB' in upper

        # Find all matches in this line using pattern1
        matches = pattern.findall(stripped)

        # If no matches, try pattern2
        if not matches:
            matches2 = pattern2.findall(stripped)
            matches = [(m[0], m[1], m[2], 'TBA') for m in matches2]

        # If still no matches, skip this line
        if not matches:
            continue

        # Process each match
        for idx, (room, course, section, teacher) in enumerate(matches):
            section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
            if not section_clean:
                continue

            # Assign time slot based on order of appearance
            if idx < len(time_slots):
                time_slot = time_slots[idx]
            else:
                time_slot = 'TBA'

            class_type = 'Lab' if is_lab else 'Theory'

            batch_match = re.search(r'(\d{2})', section_clean)
            batch = batch_match.group(1) if batch_match else 'Unknown'
            section_letter = re.sub(r'[^A-Z]', '', section_clean)

            all_classes.append({
                'section_key': section_clean,
                'day': current_day,
                'time': time_slot,
                'course': course,
                'teacher': teacher,
                'room': room,
                'type': class_type,
                'batch': batch,
                'section_letter': section_letter
            })
            class_count += 1

    logger.info(f"📊 Extracted {class_count} classes")
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
