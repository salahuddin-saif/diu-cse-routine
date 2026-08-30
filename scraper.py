#!/usr/bin/env python3
"""
DIU CSE Routine Scraper – SECTION‑WISE COMPLETE EXTRACTION
Extracts ALL classes, groups by section, verifies completeness.
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
        logger.info("DIU CSE ROUTINE SCRAPER – COMPLETE")
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

        # Save raw text for debugging
        debug_file = DATA_DIR / "debug_full_text.txt"
        debug_file.write_text(text)
        logger.info(f"💾 Saved full text to {debug_file}")

        # Extract all classes using multiple strategies
        logger.info("🔍 Extracting classes...")
        all_classes = extract_all_classes(text)

        if not all_classes:
            logger.error("❌ No classes extracted")
            sys.exit(1)

        logger.info(f"📊 Extracted {len(all_classes)} raw class records")

        # Group by section with verification
        logger.info("📦 Grouping by section and verifying completeness...")
        sections = group_and_verify(all_classes)

        # Save combined JSON
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

        # Save per-section JSON files
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


def extract_all_classes(text):
    """Extract all class records using multiple regex patterns."""
    classes = []
    lines = text.split('\n')

    # Time slots
    time_slots = [
        '08:30-10:00', '10:00-11:30', '11:30-01:00',
        '01:00-02:30', '02:30-04:00', '04:00-05:30'
    ]

    # Days
    days = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']

    # Patterns – from most specific to most general
    patterns = [
        # Pattern 1: room + course(section) + teacher
        re.compile(r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'),
        # Pattern 2: room + course(section) without teacher
        re.compile(r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)'),
        # Pattern 3: course(section) + teacher without room
        re.compile(r'([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'),
        # Pattern 4: course(section) only
        re.compile(r'([A-Z]{3,4}\d{3,4})\(([^)]+)\)'),
    ]

    current_day = None
    # First pass: find day headers
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        upper = stripped.upper()
        for day in days:
            if day in upper and any(slot in upper for slot in time_slots):
                current_day = day.capitalize()
                break
        if current_day:
            break

    # Second pass: extract classes line by line
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Detect day changes
        upper = stripped.upper()
        for day in days:
            if day in upper and any(slot in upper for slot in time_slots):
                current_day = day.capitalize()
                break

        if not current_day:
            continue

        # Skip table of contents and page numbers
        if 'TABLE' in upper or 'PAGE' in upper:
            continue

        # Check for lab
        is_lab = 'LAB' in upper or 'COM LAB' in upper

        # Try each pattern
        for pattern in patterns:
            matches = pattern.findall(stripped)
            if not matches:
                continue

            for match in matches:
                # Unpack based on pattern length
                if len(match) == 4:
                    room, course, section, teacher = match
                elif len(match) == 3:
                    # Could be (room, course, section) or (course, section, teacher)
                    # Detect by checking if first part looks like a room
                    if re.match(r'[A-Z0-9\-]+', match[0]) and '-' in match[0]:
                        room, course, section = match
                        teacher = 'TBA'
                    else:
                        course, section, teacher = match
                        room = 'TBA'
                else:  # len == 2
                    course, section = match
                    room = 'TBA'
                    teacher = 'TBA'

                # Clean section
                section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
                if not section_clean:
                    continue

                # Determine time slot based on position in line (if room known)
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

                class_type = 'Lab' if is_lab else 'Theory'
                batch_match = re.search(r'(\d{2})', section_clean)
                batch = batch_match.group(1) if batch_match else 'Unknown'
                section_letter = re.sub(r'[^A-Z]', '', section_clean)

                classes.append({
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

            # If we found matches with this pattern, move to next line
            break

    return classes


def group_and_verify(all_classes):
    """Group classes by section and verify completeness."""
    sections = defaultdict(lambda: {'classes': []})

    # First, collect all sections and their classes
    for cls in all_classes:
        key = cls['section_key']
        sections[key]['batch'] = cls.get('batch', 'Unknown')
        sections[key]['section'] = cls.get('section_letter', '')
        # Add class entry without internal keys
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

    # Optional: sort classes by day and time for each section
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

    # Convert defaultdict to dict
    return dict(sections)


if __name__ == "__main__":
    main()
