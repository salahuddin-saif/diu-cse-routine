#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - ULTIMATE FIX
Robust extraction of all classes, all days, all slots.
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
DEBUG_FILE = DATA_DIR / "debug_cleaned_text.txt"

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
        logger.info("="*60)
        logger.info("DIU CSE ROUTINE SCRAPER - ULTIMATE FIX")
        logger.info("="*60)

        result = find_latest_class_routine()
        if not result:
            logger.error("❌ Could not find Class Routine")
            sys.exit(1)

        pdf_url, version = result
        logger.info(f"📄 Found Version: {version}")

        logger.info("⬇️ Downloading PDF...")
        response = requests.get(pdf_url, timeout=30)
        response.raise_for_status()
        logger.info(f"✅ Downloaded {len(response.content)} bytes")

        logger.info("📖 Parsing PDF...")
        sections = parse_pdf_ultimate(response.content)

        if not sections:
            logger.error("❌ No data extracted")
            sys.exit(1)

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


def parse_pdf_ultimate(content):
    """Ultimate parser: clean text, split by day, extract all classes."""
    all_classes = []

    try:
        pdf_reader = PyPDF2.PdfReader(BytesIO(content))
        logger.info(f"📄 PDF has {len(pdf_reader.pages)} pages")

        # Extract raw text
        raw_text = ""
        for page_num, page in enumerate(pdf_reader.pages):
            text = page.extract_text()
            if text:
                raw_text += text + "\n"
                logger.info(f"📝 Page {page_num + 1}: {len(text)} chars")

        if not raw_text:
            return {}

        # Clean and preprocess
        cleaned = preprocess_text(raw_text)
        DEBUG_FILE.write_text(cleaned)
        logger.info(f"💾 Saved cleaned text to {DEBUG_FILE}")

        # Split by day
        day_blocks = split_by_day(cleaned)

        # Process each day
        time_slots = [
            '08:30-10:00', '10:00-11:30', '11:30-01:00',
            '01:00-02:30', '02:30-04:00', '04:00-05:30'
        ]

        for day, block in day_blocks.items():
            logger.info(f"📅 Processing {day}...")
            classes = extract_classes_from_block(block, day, time_slots)
            all_classes.extend(classes)
            logger.info(f"   Found {len(classes)} classes")

        logger.info(f"📊 Total classes extracted: {len(all_classes)}")

        # Group by base section
        sections = group_by_section(all_classes)
        return sections

    except Exception as e:
        logger.error(f"❌ PDF parsing failed: {e}")
        return {}


def preprocess_text(text):
    """Clean and normalize text."""
    # Remove page numbers (common patterns)
    text = re.sub(r'\bPage\s+\d+\b', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\b\d+\s*/\s*\d+\b', '', text)  # e.g., "1/10"
    # Remove table of contents lines
    lines = text.split('\n')
    cleaned_lines = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        # Skip lines that are just numbers or "Table"
        if re.match(r'^[\d\s]+$', line):
            continue
        if 'TABLE' in line.upper() and len(line) < 20:
            continue
        cleaned_lines.append(line)
    return '\n'.join(cleaned_lines)


def split_by_day(text):
    """Split text into blocks per day."""
    day_pattern = r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)'
    lines = text.split('\n')
    blocks = {}
    current_day = None
    buffer = []

    for line in lines:
        upper = line.upper()
        # Check if this line starts a day
        match = re.search(day_pattern, upper)
        if match and len(line) < 50:  # Day headers are usually short
            # Save previous block
            if current_day and buffer:
                blocks[current_day] = '\n'.join(buffer)
            current_day = match.group(1).capitalize()
            buffer = []
            # If the line has time slots, it's a day header with columns; we can keep it
            buffer.append(line)
        else:
            if current_day:
                buffer.append(line)
            else:
                # If no day yet, skip
                continue

    # Save last block
    if current_day and buffer:
        blocks[current_day] = '\n'.join(buffer)

    return blocks


def extract_classes_from_block(block, day, time_slots):
    """Extract classes from a day block."""
    classes = []
    lines = block.split('\n')

    # Patterns
    course_pattern = r'([A-Z]{3,4}\d{3,4})'
    section_pattern = r'\(([^)]+)\)'
    room_pattern = r'\b(KT-\d+|G1-\d+|ANX1-\d+|SH-\d+|CTBA-\d+)\b'
    teacher_pattern = r'\b([A-Z]{2,4})\b'

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue

        # Check for lab: if line contains 'LAB' or 'COM LAB', merge with next lines
        is_lab = False
        if 'LAB' in line.upper() or 'COM LAB' in line.upper():
            is_lab = True
            # Merge with next line if it seems to continue
            if i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                if next_line and not re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)', next_line.upper()):
                    line = line + " " + next_line
                    i += 1

        # Find all course codes in this line
        course_matches = list(re.finditer(course_pattern, line))
        if not course_matches:
            i += 1
            continue

        # For each course, extract section, teacher, room
        # We'll assign time slots sequentially
        for idx, cm in enumerate(course_matches):
            course = cm.group(0)
            start_pos = cm.start()

            # Find section: look for parentheses after the course
            section = 'Unknown'
            # Search within 30 characters after the course
            section_search = line[start_pos:start_pos+40]
            sec_match = re.search(section_pattern, section_search)
            if sec_match:
                section = sec_match.group(1)

            # Find teacher: look for 2-4 uppercase letters near the course
            teacher = 'TBA'
            # Use a context window around the course
            context_start = max(0, start_pos - 20)
            context_end = min(len(line), start_pos + 40)
            context = line[context_start:context_end]
            # Find all potential teacher initials in context
            teacher_matches = re.findall(teacher_pattern, context)
            # Filter out common false positives (like course codes)
            teacher_candidates = [t for t in teacher_matches if not re.match(r'[A-Z]{3,4}\d', t)]
            if teacher_candidates:
                # Take the closest one after the course
                # Simplification: take the first one found after the course
                for t in teacher_candidates:
                    if line.find(t, start_pos) != -1:
                        teacher = t
                        break

            # Find room: look for room pattern anywhere in the line
            room = 'TBA'
            room_match = re.search(room_pattern, line)
            if room_match:
                room = room_match.group(0)

            # Assign time slot based on order
            if idx < len(time_slots):
                time_slot = time_slots[idx]
            else:
                time_slot = 'TBA'

            # Determine type
            class_type = 'Lab' if is_lab else 'Theory'

            # Clean section: remove spaces, convert to uppercase, replace spaces with underscores
            section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
            if not section_clean:
                continue

            classes.append({
                'section_key': section_clean,
                'day': day,
                'time': time_slot,
                'course': course,
                'teacher': teacher,
                'room': room,
                'type': class_type,
            })

        i += 1

    return classes


def group_by_section(all_classes):
    """Group classes by base section, add sub-section."""
    sections = {}
    for cls in all_classes:
        raw_section = cls['section_key']
        # Remove trailing digits to get base section (e.g., 70_N1 -> 70_N)
        base_section = re.sub(r'(\d+)$', '', raw_section)
        if not base_section:
            base_section = raw_section

        sub_section = raw_section.replace(base_section, '').lstrip('_')
        if not sub_section:
            sub_section = 'Main'

        batch_match = re.search(r'(\d{2})', base_section)
        batch = batch_match.group(1) if batch_match else 'Unknown'
        section_letter = ''
        if '_' in base_section:
            section_letter = base_section.split('_')[1]

        if base_section not in sections:
            sections[base_section] = {
                'batch': batch,
                'section': section_letter,
                'classes': []
            }

        entry = {
            'day': cls['day'],
            'time': cls['time'],
            'course': cls['course'],
            'teacher': cls['teacher'],
            'room': cls['room'],
            'type': cls['type'],
            'batch': batch,
            'section': section_letter,
            'sub_section': sub_section
        }
        sections[base_section]['classes'].append(entry)

    return sections


if __name__ == "__main__":
    main()
