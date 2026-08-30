#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - RELIABLE VERSION
Uses pdfplumber for accurate table extraction.
Outputs separate JSON files per section.
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
import pdfplumber
from io import BytesIO

# ============================================================
# CONFIGURATION
# ============================================================

NOTICE_URL = "https://webbackend.daffodilvarsity.edu.bd/department/cse/notice"

# ============================================================
# FILE PATHS
# ============================================================

DATA_DIR = Path("data")
OUTPUT_FILE = DATA_DIR / "routine.json"          # Combined JSON
SECTIONS_DIR = DATA_DIR / "sections"              # Per-section JSON files
DEBUG_FILE = DATA_DIR / "debug_tables.txt"

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
        logger.info("DIU CSE ROUTINE SCRAPER - pdfplumber")
        logger.info("=" * 60)

        # Find the PDF URL
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
        logger.info(f"✅ Downloaded {len(response.content)} bytes")

        # Parse PDF with pdfplumber
        logger.info("📖 Parsing PDF with pdfplumber...")
        sections = parse_pdf_with_plumber(response.content)

        if not sections:
            logger.error("❌ No data extracted")
            sys.exit(1)

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
            section_file = SECTIONS_DIR / f"{section_key}.json"
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
    """Find the PDF download URL from the notice page."""
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


def parse_pdf_with_plumber(content):
    """Extract routine data using pdfplumber."""
    all_classes = []
    days = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']
    time_slots = [
        '08:30-10:00', '10:00-11:30', '11:30-01:00',
        '01:00-02:30', '02:30-04:00', '04:00-05:30'
    ]

    try:
        with pdfplumber.open(BytesIO(content)) as pdf:
            logger.info(f"📄 PDF has {len(pdf.pages)} pages")

            all_tables = []
            for page_num, page in enumerate(pdf.pages, 1):
                tables = page.extract_tables()
                if tables:
                    logger.info(f"📊 Page {page_num}: found {len(tables)} tables")
                    for table_idx, table in enumerate(tables):
                        # Skip empty tables
                        if not table or len(table) < 2:
                            continue
                        # Convert to list of dicts for easier processing
                        headers = table[0] if table else []
                        # Skip if no headers
                        if not headers or not any(h for h in headers if h):
                            continue
                        # Remove empty header columns
                        clean_headers = [h.strip() if h else f'col_{i}' for i, h in enumerate(headers)]
                        rows = []
                        for row in table[1:]:
                            if any(cell for cell in row if cell and str(cell).strip()):
                                rows.append(row)
                        if rows:
                            all_tables.append({
                                'page': page_num,
                                'headers': clean_headers,
                                'rows': rows
                            })

            # If no tables found, fallback to text extraction
            if not all_tables:
                logger.warning("⚠️ No tables found, falling back to text extraction...")
                return extract_from_text(pdf)

            # Process tables
            current_day = None
            class_count = 0

            # First, try to detect days from the tables
            for table_info in all_tables:
                # Look for day headers in the first column of the first few rows
                for row in table_info['rows']:
                    if row and row[0]:
                        cell_text = str(row[0]).strip().upper()
                        for day in days:
                            if day in cell_text:
                                current_day = day.capitalize()
                                break
                    if current_day:
                        break
                if current_day:
                    break

            # If no day found, use page numbers as fallback
            if not current_day:
                # Map page numbers to days (this is approximate)
                page_day_map = {
                    3: 'Saturday',
                    4: 'Sunday',
                    5: 'Monday',
                    6: 'Tuesday',
                    7: 'Wednesday',
                    8: 'Thursday',
                    9: 'Friday'
                }
                # Use the first table's page

            # Process each table and extract classes
            for table_info in all_tables:
                headers = table_info['headers']
                rows = table_info['rows']

                # Determine which columns contain room, course, section, teacher
                # We'll look for patterns in the first few rows
                room_col = None
                course_col = None
                section_col = None
                teacher_col = None

                # Try to infer column types from headers or content
                for i, h in enumerate(headers):
                    h_lower = h.lower()
                    if 'room' in h_lower:
                        room_col = i
                    elif 'course' in h_lower or 'code' in h_lower:
                        course_col = i
                    elif 'section' in h_lower:
                        section_col = i
                    elif 'teacher' in h_lower or 'instructor' in h_lower:
                        teacher_col = i

                # If we couldn't find columns, try to detect patterns in the data
                if room_col is None and course_col is None:
                    # Inspect first few rows to detect structure
                    sample_rows = rows[:5]
                    for row in sample_rows:
                        for i, cell in enumerate(row):
                            if cell and isinstance(cell, str):
                                # Check if cell looks like a room (KT-, G1-, etc.)
                                if re.search(r'\b(KT-\d+|G1-\d+|ANX1-\d+|SH-\d+)', cell):
                                    if room_col is None:
                                        room_col = i
                                # Check if cell looks like a course code
                                if re.search(r'[A-Z]{3,4}\d{3,4}', cell):
                                    if course_col is None:
                                        course_col = i
                                # Check if cell looks like a section (e.g., 66_E)
                                if re.search(r'\d{2}_[A-Z]', cell):
                                    if section_col is None:
                                        section_col = i

                # If still not found, use positional defaults
                if room_col is None:
                    room_col = 0
                if course_col is None:
                    course_col = 1 if len(headers) > 1 else 0
                if section_col is None:
                    section_col = 2 if len(headers) > 2 else 0

                # Now extract classes from each row
                for row in rows:
                    # Skip rows that are completely empty or contain only headers
                    if not row or all(c is None or str(c).strip() == '' for c in row):
                        continue

                    # Try to extract multiple classes from a single row
                    # Some rows contain multiple class entries side by side
                    # We'll join all cells into a single string and look for patterns
                    full_row_text = ' '.join([str(c) if c else '' for c in row])

                    # Pattern: Room Course(Section) Teacher
                    pattern = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'
                    matches = re.findall(pattern, full_row_text)

                    if matches:
                        for room, course, section, teacher in matches:
                            # Clean section
                            section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
                            if not section_clean:
                                continue

                            # Determine day: try to get from context (maybe from table metadata)
                            # We'll assign the current day if we have it
                            day = current_day if current_day else 'Unknown'

                            # Determine time slot: we can try to infer from row position or column
                            # For now, assign sequentially
                            time_slot = 'TBA'
                            # If we have a time column, use it
                            # Otherwise, we'll assign based on the row index (approximate)

                            # Determine type
                            class_type = 'Lab' if 'LAB' in full_row_text.upper() else 'Theory'

                            # Extract batch
                            batch_match = re.search(r'(\d{2})', section_clean)
                            batch = batch_match.group(1) if batch_match else 'Unknown'

                            # Extract section letter
                            section_letter = re.sub(r'[^A-Z]', '', section_clean)
                            if not section_letter:
                                section_letter = section_clean

                            all_classes.append({
                                'section_key': section_clean,
                                'day': day,
                                'time': time_slot,
                                'course': course,
                                'teacher': teacher if teacher != 'TBA' else 'TBA',
                                'room': room,
                                'type': class_type,
                                'batch': batch,
                                'section_letter': section_letter
                            })
                            class_count += 1

            logger.info(f"📊 Extracted {class_count} classes from tables")

            # If we have classes, group them by section
            if all_classes:
                sections = group_by_section(all_classes)
                return sections

            # Fallback: if no classes from tables, try text extraction
            logger.warning("⚠️ No classes extracted from tables, trying text extraction...")
            return extract_from_text(pdf)

    except Exception as e:
        logger.error(f"❌ pdfplumber failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {}


def extract_from_text(pdf):
    """Fallback: extract from raw text using pdfplumber's text extraction."""
    all_classes = []
    full_text = ""
    for page in pdf.pages:
        text = page.extract_text()
        if text:
            full_text += text + "\n"

    if not full_text:
        return {}

    lines = full_text.split('\n')
    time_slots = ['08:30-10:00', '10:00-11:30', '11:30-01:00', '01:00-02:30', '02:30-04:00', '04:00-05:30']
    days = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']

    current_day = None
    pattern = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Check for day header
        day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)', line.upper())
        if day_match and any(slot in line for slot in time_slots):
            current_day = day_match.group(1).capitalize()
            continue

        if not current_day:
            continue

        # Skip table markers
        if 'TABLE' in line.upper() or 'PAGE' in line.upper():
            continue

        matches = re.findall(pattern, line)
        for room, course, section, teacher in matches:
            section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
            if not section_clean:
                continue

            # Determine time slot based on position
            time_slot = 'TBA'
            pos = line.find(room)
            if pos != -1 and len(line) > 0:
                ratio = pos / len(line)
                if ratio < 0.2:
                    time_slot = time_slots[0]
                elif ratio < 0.35:
                    time_slot = time_slots[1]
                elif ratio < 0.5:
                    time_slot = time_slots[2]
                elif ratio < 0.65:
                    time_slot = time_slots[3]
                elif ratio < 0.8:
                    time_slot = time_slots[4]
                else:
                    time_slot = time_slots[5]

            class_type = 'Lab' if 'LAB' in line.upper() else 'Theory'
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

    if all_classes:
        return group_by_section(all_classes)
    return {}


def group_by_section(all_classes):
    """Group classes by section."""
    sections = {}
    for cls in all_classes:
        section_key = cls['section_key']
        if section_key not in sections:
            sections[section_key] = {
                'batch': cls.get('batch', 'Unknown'),
                'section': cls.get('section_letter', ''),
                'classes': []
            }

        # Add class entry without section_key
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
        sections[section_key]['classes'].append(entry)

    return sections


if __name__ == "__main__":
    main()
