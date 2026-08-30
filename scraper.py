#!/usr/bin/env python3
"""
DIU CSE Routine Scraper – PDF OXIDE (with fallback)
Extracts text with layout, parses class data, merges labs.
"""

import json
import re
import sys
from pathlib import Path
from collections import defaultdict
import requests
from bs4 import BeautifulSoup
from io import BytesIO
import logging

# Primary: pdfoxide
try:
    from pdfoxide import Document
    HAS_PDFOXIDE = True
except ImportError:
    HAS_PDFOXIDE = False

# Fallback: pdfplumber
try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False

# ============================================================
# CONFIGURATION
# ============================================================

NOTICE_URL = "https://webbackend.daffodilvarsity.edu.bd/department/cse/notice"
FALLBACK_PDF_URL = "https://webbackend.daffodilvarsity.edu.bd/download-file/4148"
FALLBACK_VERSION = "5.0"

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
        logger.info("DIU CSE ROUTINE SCRAPER – PDF OXIDE")
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

        logger.info("📖 Extracting text with layout...")
        text = extract_text_with_layout(pdf_content)

        if not text:
            logger.error("❌ No text extracted")
            sys.exit(1)

        DEBUG_FILE.write_text(text)
        logger.info(f"💾 Saved debug text to {DEBUG_FILE}")

        logger.info("🔍 Extracting classes...")
        all_classes = extract_classes_from_text(text)

        if not all_classes:
            logger.error("❌ No classes extracted")
            sys.exit(1)

        logger.info(f"📊 Extracted {len(all_classes)} raw class records")

        # Merge lab classes
        all_classes = merge_lab_classes(all_classes)

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
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
            'Referer': 'https://webbackend.daffodilvarsity.edu.bd/',
        }
        response = requests.get(NOTICE_URL, timeout=30, headers=headers)
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
                detail_response = requests.get(href, timeout=30, headers=headers)
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
        logger.warning(f"⚠️ Using fallback PDF: {FALLBACK_PDF_URL}")
        return (FALLBACK_PDF_URL, FALLBACK_VERSION)


def extract_text_with_layout(pdf_content):
    """Extract text with layout using pdfoxide, fallback to pdfplumber."""
    text = ""

    if HAS_PDFOXIDE:
        try:
            logger.info("🔍 Using pdfoxide for text extraction...")
            doc = Document(BytesIO(pdf_content))
            for page in doc.pages:
                # Get text with positions
                page_text = page.text()
                if page_text:
                    text += page_text + "\n"
            if text.strip():
                return text
        except Exception as e:
            logger.warning(f"pdfoxide failed: {e}, falling back to pdfplumber")

    if HAS_PDFPLUMBER:
        try:
            logger.info("🔍 Using pdfplumber for text extraction...")
            with pdfplumber.open(BytesIO(pdf_content)) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
            return text
        except Exception as e:
            logger.warning(f"pdfplumber failed: {e}")

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
        day_found = None
        for day in days:
            if day in upper:
                if any(slot in upper for slot in time_slots) or len(stripped) < 50:
                    day_found = day.capitalize()
                    break

        if day_found:
            current_day = day_found
            logger.info(f"📅 Found day: {current_day}")
            continue

        if not current_day:
            continue

        # Skip table headers and noise
        if 'ROOM' in upper and 'COURSE' in upper and 'TEACHER' in upper:
            continue
        if 'TABLE' in upper or 'PAGE' in upper:
            continue

        is_lab = 'LAB' in upper or 'COM LAB' in upper

        matches = pattern.findall(stripped)
        if not matches:
            matches2 = pattern2.findall(stripped)
            matches = [(m[0], m[1], m[2], 'TBA') for m in matches2]

        if not matches:
            continue

        for idx, (room, course, section, teacher) in enumerate(matches):
            section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
            if not section_clean:
                continue

            # Extract main section and sub-section
            sub_section = 'Main'
            main_section = section_clean
            match_sub = re.search(r'(_[A-Z])(\d+)$', section_clean)
            if match_sub:
                main_section = section_clean[:match_sub.start()] + match_sub.group(1)
                sub_section = match_sub.group(2)

            time_slot = time_slots[idx] if idx < len(time_slots) else 'TBA'
            class_type = 'Lab' if is_lab else 'Theory'

            batch_match = re.search(r'(\d{2})', main_section)
            batch = batch_match.group(1) if batch_match else 'Unknown'
            section_letter = re.sub(r'[^A-Z]', '', main_section.split('_')[-1] if '_' in main_section else '')

            all_classes.append({
                'main_section': main_section,
                'sub_section': sub_section,
                'day': current_day,
                'time': time_slot,
                'course': course,
                'teacher': teacher,
                'room': room,
                'type': class_type,
                'batch': batch,
                'section': section_letter
            })
            class_count += 1

    logger.info(f"📊 Extracted {class_count} classes")
    return all_classes


def merge_lab_classes(classes):
    """Merge consecutive lab slots (e.g., 08:30-10:00 + 10:00-11:30 → 08:30-11:30)."""
    if not classes:
        return []

    time_slots = [
        '08:30-10:00', '10:00-11:30', '11:30-01:00',
        '01:00-02:30', '02:30-04:00', '04:00-05:30'
    ]

    groups = defaultdict(list)
    for cls in classes:
        key = (cls['day'], cls['course'], cls['teacher'], cls['room'])
        groups[key].append(cls)

    merged = []
    for key, items in groups.items():
        items.sort(key=lambda x: time_slots.index(x['time']) if x['time'] in time_slots else 999)
        if items[0]['type'] == 'Lab' and len(items) >= 2:
            time_indices = [time_slots.index(item['time']) for item in items if item['time'] in time_slots]
            if len(time_indices) >= 2 and time_indices[1] == time_indices[0] + 1:
                merged_item = items[0].copy()
                start_time = time_slots[time_indices[0]]
                end_time = time_slots[time_indices[1]].split('-')[1]
                merged_item['time'] = f"{start_time.split('-')[0]}-{end_time}"
                merged_item['sub_section'] = items[0].get('sub_section', 'Main')
                merged.append(merged_item)
                continue
        merged.extend(items)
    return merged


def group_and_verify(all_classes):
    sections = defaultdict(lambda: {'classes': []})
    for cls in all_classes:
        key = cls['main_section']
        sections[key]['batch'] = cls.get('batch', 'Unknown')
        sections[key]['section'] = cls.get('section', '')
        entry = {
            'day': cls['day'],
            'time': cls['time'],
            'course': cls['course'],
            'teacher': cls['teacher'],
            'room': cls['room'],
            'type': cls['type'],
            'batch': cls.get('batch', 'Unknown'),
            'section': cls.get('section', ''),
            'sub_section': cls.get('sub_section', 'Main')
        }
        sections[key]['classes'].append(entry)

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
