#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - FINAL FIX
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
    try:
        DATA_DIR.mkdir(exist_ok=True)
        logger.info("="*60)
        logger.info("DIU CSE ROUTINE SCRAPER - FINAL")
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
        sections = parse_pdf_final(response.content)

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


def parse_pdf_final(content):
    """Final parser: extract all classes with proper day and time assignment."""
    all_classes = []

    try:
        pdf_reader = PyPDF2.PdfReader(BytesIO(content))
        logger.info(f"📄 PDF has {len(pdf_reader.pages)} pages")

        # Extract text from all pages
        raw_text = ""
        for page_num, page in enumerate(pdf_reader.pages):
            text = page.extract_text()
            if text:
                raw_text += text + "\n"
                logger.info(f"📝 Page {page_num + 1}: {len(text)} chars")

        if not raw_text:
            return {}

        # Preprocess: remove page numbers and table markers
        lines = raw_text.split('\n')
        cleaned = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            if re.match(r'^\s*\d+\s*$', line):
                continue
            if 'TABLE' in line.upper() and len(line) < 20:
                continue
            cleaned.append(line)

        # Time slots
        time_slots = [
            '08:30-10:00', '10:00-11:30', '11:30-01:00',
            '01:00-02:30', '02:30-04:00', '04:00-05:30'
        ]
        # Compile patterns
        course_section_pattern = re.compile(r'([A-Z]{3,4}\d{3,4})\s*\(([^)]+)\)')
        room_pattern = re.compile(r'\b(KT-\d+|G1-\d+|ANX1-\d+|SH-\d+|CTBA-\d+)\b')
        teacher_pattern = re.compile(r'\b([A-Z]{2,4})\b')

        current_day = None
        i = 0
        while i < len(cleaned):
            line = cleaned[i]
            # Check for day header
            # A day header contains a day name and at least one time slot
            day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)', line.upper())
            if day_match and any(slot in line for slot in time_slots):
                current_day = day_match.group(1).capitalize()
                logger.info(f"📅 Found day: {current_day}")
                i += 1
                continue

            if not current_day:
                i += 1
                continue

            # Check for lab line
            is_lab = False
            if 'LAB' in line.upper() or 'COM LAB' in line.upper():
                is_lab = True
                # Merge with following line if it seems to be a continuation
                if i + 1 < len(cleaned):
                    next_line = cleaned[i+1]
                    if next_line and not re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)', next_line.upper()):
                        line = line + " " + next_line
                        i += 1

            # Find all course-section pairs
            matches = list(course_section_pattern.finditer(line))
            if not matches:
                i += 1
                continue

            # For each match, extract room and teacher
            for idx, match in enumerate(matches):
                course = match.group(1)
                section = match.group(2)
                start = match.start()

                # Find room: look for room pattern in the whole line
                room = 'TBA'
                room_match = room_pattern.search(line)
                if room_match:
                    room = room_match.group(0)

                # Find teacher: look for 2-4 uppercase letters near the match (within 30 chars after)
                teacher = 'TBA'
                context = line[start:start+40]
                # Remove the course and section from context to avoid matching them
                context_clean = context.replace(course, '').replace(f'({section})', '')
                teacher_matches = teacher_pattern.findall(context_clean)
                if teacher_matches:
                    # Take the first one
                    teacher = teacher_matches[0]

                # Assign time slot based on order
                if idx < len(time_slots):
                    time_slot = time_slots[idx]
                else:
                    time_slot = 'TBA'

                # Determine type
                class_type = 'Lab' if is_lab else 'Theory'

                # Clean section
                section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
                if not section_clean:
                    continue

                all_classes.append({
                    'section_key': section_clean,
                    'day': current_day,
                    'time': time_slot,
                    'course': course,
                    'teacher': teacher,
                    'room': room,
                    'type': class_type,
                })

            i += 1

        logger.info(f"📊 Total classes extracted: {len(all_classes)}")

        # Group by base section
        sections = group_by_section(all_classes)
        return sections

    except Exception as e:
        logger.error(f"❌ PDF parsing failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {}


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
