#!/usr/bin/env python3
"""
DIU CSE Routine Scraper – TABLE EXTRACTION WITH MERGED LAB SUPPORT
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
FALLBACK_PDF_URL = "https://webbackend.daffodilvarsity.edu.bd/download-file/4148"
FALLBACK_VERSION = "5.0"

# ============================================================
# FILE PATHS
# ============================================================

DATA_DIR = Path("data")
SECTIONS_DIR = DATA_DIR / "sections"
OUTPUT_FILE = DATA_DIR / "routine.json"
DEBUG_FILE = DATA_DIR / "debug_tables.txt"

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
        logger.info("DIU CSE ROUTINE SCRAPER – TABLE EXTRACTION")
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

        logger.info("📖 Extracting tables from PDF...")
        sections = extract_tables(pdf_content)

        if not sections:
            logger.error("❌ No data extracted")
            sys.exit(1)

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


def extract_tables(pdf_content):
    """Extract classes from tables with proper time slots and lab merging."""
    sections = defaultdict(lambda: {'classes': []})
    class_count = 0

    with pdfplumber.open(BytesIO(pdf_content)) as pdf:
        logger.info(f"📄 PDF has {len(pdf.pages)} pages")

        for page_num, page in enumerate(pdf.pages, 1):
            # Extract text to find the day for this page
            page_text = page.extract_text()
            current_day = None
            if page_text:
                for line in page_text.split('\n'):
                    upper = line.upper()
                    for day in ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']:
                        if day in upper:
                            # Check if this is a day header (contains time slots or is short)
                            if re.search(r'\d{2}:\d{2}-\d{2}:\d{2}', upper) or len(line) < 30:
                                current_day = day.capitalize()
                                break
                    if current_day:
                        break

            # Extract tables from the page
            tables = page.extract_tables()
            if not tables:
                continue

            for table in tables:
                if not table or len(table) < 2:
                    continue

                # ---- Identify header row with time slots ----
                header_row = None
                header_index = -1
                raw_time_slots = []
                for idx, row in enumerate(table):
                    row_text = ' '.join([str(cell) if cell else '' for cell in row])
                    if re.search(r'\d{2}:\d{2}-\d{2}:\d{2}', row_text):
                        header_row = row
                        header_index = idx
                        raw_time_slots = [cell.strip() if cell else '' for cell in row]
                        break

                if not header_row:
                    continue

                # ---- Clean time slots: fill empty cells with the last non-empty ----
                time_slots = []
                last_time = None
                for cell in raw_time_slots:
                    if cell.strip():
                        last_time = cell.strip()
                    time_slots.append(last_time if last_time else '')
                while time_slots and not time_slots[-1]:
                    time_slots.pop()

                # ---- Process data rows ----
                for row_idx in range(header_index + 1, len(table)):
                    row = table[row_idx]
                    if all(cell is None or str(cell).strip() == '' for cell in row):
                        continue

                    # Process each cell (column = time slot)
                    for col_idx, cell in enumerate(row):
                        if col_idx >= len(time_slots):
                            break
                        time_slot = time_slots[col_idx]
                        if not time_slot:
                            continue

                        cell_text = str(cell).strip() if cell else ''
                        if not cell_text:
                            continue

                        # Parse the cell: it contains room, course(section), teacher
                        # Pattern: Room + Course(Section) + Teacher
                        pattern = re.compile(r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)')
                        match = pattern.search(cell_text)
                        if match:
                            room, course, section, teacher = match.groups()
                        else:
                            pattern2 = re.compile(r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)')
                            match2 = pattern2.search(cell_text)
                            if match2:
                                room, course, section = match2.groups()
                                teacher = 'TBA'
                            else:
                                pattern3 = re.compile(r'([A-Z]{3,4}\d{3,4})\(([^)]+)\)')
                                match3 = pattern3.search(cell_text)
                                if match3:
                                    course, section = match3.groups()
                                    room = 'TBA'
                                    teacher = 'TBA'
                                else:
                                    continue

                        # Clean section
                        section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
                        if not section_clean:
                            continue

                        # ---- Extract main section and sub-section ----
                        sub_section = ''
                        main_section = section_clean
                        match_sub = re.search(r'(_[A-Z])(\d+)$', section_clean)
                        if match_sub:
                            main_section = section_clean[:match_sub.start()] + match_sub.group(1)
                            sub_section = match_sub.group(2)
                        else:
                            sub_section = 'Main'

                        # Determine lab
                        is_lab = 'LAB' in cell_text.upper() or 'COM LAB' in cell_text.upper()
                        class_type = 'Lab' if is_lab else 'Theory'

                        batch_match = re.search(r'(\d{2})', main_section)
                        batch = batch_match.group(1) if batch_match else 'Unknown'
                        section_letter = re.sub(r'[^A-Z]', '', main_section.split('_')[-1] if '_' in main_section else '')

                        # Store raw class
                        sections[main_section]['batch'] = batch
                        sections[main_section]['section'] = section_letter
                        sections[main_section]['classes'].append({
                            'day': current_day or 'Unknown',
                            'time': time_slot,
                            'course': course,
                            'teacher': teacher,
                            'room': room,
                            'type': class_type,
                            'batch': batch,
                            'section': section_letter,
                            'sub_section': sub_section
                        })
                        class_count += 1

    logger.info(f"📊 Extracted {class_count} raw class records")

    # ---- Merge lab classes that span two consecutive slots ----
    merged_sections = {}
    for sec_key, sec_data in sections.items():
        merged_classes = merge_lab_classes(sec_data['classes'])
        merged_sections[sec_key] = {
            'batch': sec_data['batch'],
            'section': sec_data['section'],
            'classes': merged_classes
        }

    return merged_sections


def merge_lab_classes(classes):
    """Merge lab classes that are consecutive in time."""
    if not classes:
        return []

    time_slots = [
        '08:30-10:00', '10:00-11:30', '11:30-01:00',
        '01:00-02:30', '02:30-04:00', '04:00-05:30'
    ]

    # Group by (day, course, teacher, room) – same lab
    groups = defaultdict(list)
    for cls in classes:
        key = (cls['day'], cls['course'], cls['teacher'], cls['room'])
        groups[key].append(cls)

    merged = []
    for key, items in groups.items():
        items.sort(key=lambda x: time_slots.index(x['time']) if x['time'] in time_slots else 999)

        # Check if lab items are consecutive
        if items[0]['type'] == 'Lab' and len(items) >= 2:
            time_indices = [time_slots.index(item['time']) for item in items if item['time'] in time_slots]
            # Check if they form a consecutive block (indices like [0,1] or [2,3] etc.)
            if len(time_indices) >= 2 and time_indices[1] == time_indices[0] + 1:
                # Merge into one entry
                merged_item = items[0].copy()
                start_time = time_slots[time_indices[0]]
                end_time = time_slots[time_indices[1]].split('-')[1]
                merged_item['time'] = f"{start_time.split('-')[0]}-{end_time}"
                merged_item['sub_section'] = items[0].get('sub_section', 'Main')
                merged.append(merged_item)
                # Skip the rest
                continue
        # Not mergeable, keep all
        merged.extend(items)

    return merged


if __name__ == "__main__":
    main()
