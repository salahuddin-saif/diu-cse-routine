#!/usr/bin/env python3
"""
DIU CSE Routine Scraper – TABLE-BASED WITH TIME SLOTS (FIXED)
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
        logger.info("DIU CSE ROUTINE SCRAPER – TABLE WITH TIME SLOTS (FIXED)")
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


def extract_tables(pdf_content):
    """Extract classes from tables with proper time slots."""
    sections = defaultdict(lambda: {'classes': []})
    class_count = 0

    with pdfplumber.open(BytesIO(pdf_content)) as pdf:
        logger.info(f"📄 PDF has {len(pdf.pages)} pages")

        for page_num, page in enumerate(pdf.pages, 1):
            # Extract text to find day
            page_text = page.extract_text()
            current_day = None
            if page_text:
                for line in page_text.split('\n'):
                    upper = line.upper()
                    for day in ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']:
                        if day in upper and ('08:30' in upper or '10:00' in upper):
                            current_day = day.capitalize()
                            logger.info(f"📅 Page {page_num} - Found day: {current_day}")
                            break
                    if current_day:
                        break

            # Extract tables
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

                # Search for a row that contains at least one time slot pattern
                for idx, row in enumerate(table):
                    row_text = ' '.join([str(cell) if cell else '' for cell in row])
                    if re.search(r'\d{2}:\d{2}-\d{2}:\d{2}', row_text):
                        header_row = row
                        header_index = idx
                        raw_time_slots = [cell.strip() if cell else '' for cell in row]
                        logger.info(f"   Found header row at index {idx} with time slots: {raw_time_slots}")
                        break

                # If no header, skip this table
                if not header_row:
                    logger.warning(f"   No time slot header found in table on page {page_num}")
                    continue

                # ---- Clean the header row to get time slots ----
                # Propagate the last non-empty time slot to subsequent empty cells
                time_slots = []
                last_time = None
                for cell in raw_time_slots:
                    if cell.strip():
                        last_time = cell.strip()
                    time_slots.append(last_time if last_time else '')
                # Remove trailing empty slots
                while time_slots and not time_slots[-1]:
                    time_slots.pop()
                logger.info(f"   Cleaned time slots: {time_slots}")

                # ---- Process data rows ----
                for row_idx in range(header_index + 1, len(table)):
                    row = table[row_idx]
                    # Skip rows that are completely empty
                    if all(cell is None or str(cell).strip() == '' for cell in row):
                        continue

                    # For each column (time slot), extract class data
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
                        # Pattern: room + course(section) + teacher
                        pattern = re.compile(r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)')
                        match = pattern.search(cell_text)
                        if match:
                            room, course, section, teacher = match.groups()
                        else:
                            # Try without teacher
                            pattern2 = re.compile(r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)')
                            match2 = pattern2.search(cell_text)
                            if match2:
                                room, course, section = match2.groups()
                                teacher = 'TBA'
                            else:
                                # Try course(section) only
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

                        # Detect lab
                        is_lab = 'LAB' in cell_text.upper() or 'COM LAB' in cell_text.upper()
                        class_type = 'Lab' if is_lab else 'Theory'

                        # Extract batch and section letter
                        batch_match = re.search(r'(\d{2})', section_clean)
                        batch = batch_match.group(1) if batch_match else 'Unknown'
                        section_letter = re.sub(r'[^A-Z]', '', section_clean)

                        # Store
                        key = section_clean
                        if key not in sections:
                            sections[key]['batch'] = batch
                            sections[key]['section'] = section_letter
                        sections[key]['classes'].append({
                            'day': current_day or 'Unknown',
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
    return dict(sections)


if __name__ == "__main__":
    main()
