#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - FINAL WORKING VERSION
Generates per-section JSON files.
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

# Try pdfplumber, fallback to PyPDF2
try:
    import pdfplumber
    PDF_ENGINE = 'pdfplumber'
except ImportError:
    import PyPDF2
    from io import BytesIO
    PDF_ENGINE = 'pypdf2'

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
        logger.info("DIU CSE ROUTINE SCRAPER - FINAL")
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

        # Parse
        logger.info(f"📖 Parsing PDF using {PDF_ENGINE}...")
        sections = parse_pdf(pdf_content)

        if not sections:
            logger.error("❌ No data extracted")
            sys.exit(1)

        # Save combined
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

        # Save per-section files
        for section_key, section_data in sections.items():
            # Remove invalid chars for filename
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


def parse_pdf(content):
    """Parse PDF using available engine."""
    if PDF_ENGINE == 'pdfplumber':
        return parse_with_pdfplumber(content)
    else:
        return parse_with_pypdf2(content)


def parse_with_pdfplumber(content):
    """Use pdfplumber for accurate table extraction."""
    all_classes = []
    time_slots = [
        '08:30-10:00', '10:00-11:30', '11:30-01:00',
        '01:00-02:30', '02:30-04:00', '04:00-05:30'
    ]
    days = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']

    try:
        with pdfplumber.open(BytesIO(content)) as pdf:
            logger.info(f"📄 PDF has {len(pdf.pages)} pages")
            full_text = ""
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    full_text += text + "\n"

            if not full_text:
                return {}

            # Split by day
            lines = full_text.split('\n')
            current_day = None
            class_count = 0

            # Pattern for class data
            pattern = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'

            for line in lines:
                line = line.strip()
                if not line:
                    continue

                # Detect day header
                day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)', line.upper())
                if day_match and any(slot in line for slot in time_slots):
                    current_day = day_match.group(1).capitalize()
                    logger.info(f"📅 Found day: {current_day}")
                    continue

                if not current_day:
                    continue

                if 'TABLE' in line.upper() or 'PAGE' in line.upper():
                    continue

                # Find all matches
                matches = re.findall(pattern, line)
                if not matches:
                    continue

                # Determine lab
                is_lab = 'LAB' in line.upper() or 'COM LAB' in line.upper()

                for idx, (room, course, section, teacher) in enumerate(matches):
                    section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
                    if not section_clean:
                        continue

                    # Time slot based on order
                    time_slot = time_slots[idx] if idx < len(time_slots) else 'TBA'

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
            if all_classes:
                return group_by_section(all_classes)
            return {}

    except Exception as e:
        logger.error(f"❌ pdfplumber failed: {e}")
        return {}


def parse_with_pypdf2(content):
    """Fallback to PyPDF2."""
    try:
        import PyPDF2
        from io import BytesIO

        pdf_reader = PyPDF2.PdfReader(BytesIO(content))
        logger.info(f"📄 PDF has {len(pdf_reader.pages)} pages")

        full_text = ""
        for page in pdf_reader.pages:
            text = page.extract_text()
            if text:
                full_text += text + "\n"

        if not full_text:
            return {}

        time_slots = ['08:30-10:00', '10:00-11:30', '11:30-01:00', '01:00-02:30', '02:30-04:00', '04:00-05:30']
        days = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']
        lines = full_text.split('\n')
        current_day = None
        all_classes = []
        pattern = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'

        for line in lines:
            line = line.strip()
            if not line:
                continue
            day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)', line.upper())
            if day_match and any(slot in line for slot in time_slots):
                current_day = day_match.group(1).capitalize()
                continue
            if not current_day or 'TABLE' in line.upper():
                continue
            matches = re.findall(pattern, line)
            for idx, (room, course, section, teacher) in enumerate(matches):
                section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
                if not section_clean:
                    continue
                time_slot = time_slots[idx] if idx < len(time_slots) else 'TBA'
                is_lab = 'LAB' in line.upper()
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

        if all_classes:
            return group_by_section(all_classes)
        return {}

    except Exception as e:
        logger.error(f"❌ PyPDF2 failed: {e}")
        return {}


def group_by_section(all_classes):
    sections = {}
    for cls in all_classes:
        key = cls['section_key']
        if key not in sections:
            sections[key] = {
                'batch': cls.get('batch', 'Unknown'),
                'section': cls.get('section_letter', ''),
                'classes': []
            }
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
    return sections


if __name__ == "__main__":
    main()
