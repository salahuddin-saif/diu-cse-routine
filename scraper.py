#!/usr/bin/env python3
"""
DIU CSE Routine Scraper – ULTIMATE RELIABLE VERSION
- Extracts using pdfplumber tables + regex fallback
- Merges results from both strategies
- Version-aware replace/merge
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
        logger.info("DIU CSE ROUTINE SCRAPER – ULTIMATE")
        logger.info("=" * 60)

        result = find_latest_class_routine()
        if not result:
            logger.error("❌ Could not find Class Routine")
            sys.exit(1)

        pdf_url, new_version = result
        logger.info(f"📄 Found Version: {new_version}")

        stored_version = get_stored_version()
        replace_all = (stored_version is None or stored_version != new_version)

        if replace_all:
            logger.info(f"🔄 New version detected (stored: {stored_version}, new: {new_version}). Replacing all data.")
        else:
            logger.info(f"✅ Same version ({stored_version}). Merging with existing data.")

        logger.info("⬇️ Downloading PDF...")
        response = requests.get(pdf_url, timeout=30)
        response.raise_for_status()
        pdf_content = response.content
        logger.info(f"✅ Downloaded {len(pdf_content)} bytes")

        # ----- EXTRACT USING MULTIPLE STRATEGIES -----
        logger.info("📖 Extracting using pdfplumber tables...")
        sections_from_tables = extract_tables_pdfplumber(pdf_content)

        logger.info("📖 Extracting using regex (fallback)...")
        text = extract_text(pdf_content)
        sections_from_regex = extract_classes_from_text(text) if text else {}

        # ----- MERGE RESULTS FROM BOTH STRATEGIES -----
        logger.info("🔄 Merging results from both strategies...")
        combined_sections = merge_section_data(sections_from_tables, sections_from_regex)

        if not combined_sections:
            logger.error("❌ No data extracted from PDF.")
            sys.exit(1)

        # ----- FINAL MERGE WITH EXISTING (if same version) -----
        if replace_all:
            final_sections = combined_sections
        else:
            final_sections = merge_with_existing(combined_sections)

        total = sum(len(entries) for entries in final_sections.values())
        from datetime import datetime, timezone
        output = {
            'updated_at': datetime.now(timezone.utc).isoformat(),
            'source': pdf_url,
            'version': new_version,
            'sections': final_sections
        }
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        logger.info(f"✅ Saved combined JSON: {len(final_sections)} sections, {total} classes")

        # Save per-section files
        for section_key, section_data in final_sections.items():
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


def get_stored_version():
    if not OUTPUT_FILE.exists():
        return None
    try:
        with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data.get('version')
    except Exception:
        return None


def merge_section_data(sections_a, sections_b):
    """Merge two dictionaries of sections, preferring the one with more classes per section."""
    merged = {}
    all_keys = set(sections_a.keys()) | set(sections_b.keys())
    for key in all_keys:
        data_a = sections_a.get(key, {})
        data_b = sections_b.get(key, {})
        classes_a = data_a.get('classes', [])
        classes_b = data_b.get('classes', [])
        # Keep the one with more classes
        if len(classes_a) >= len(classes_b):
            merged[key] = data_a
            # Add any missing from b
            existing_fps = set((c['day'], c['time'], c['course'], c['teacher'], c['room']) for c in classes_a)
            for cls in classes_b:
                fp = (cls['day'], cls['time'], cls['course'], cls['teacher'], cls['room'])
                if fp not in existing_fps:
                    merged[key]['classes'].append(cls)
                    existing_fps.add(fp)
        else:
            merged[key] = data_b
            existing_fps = set((c['day'], c['time'], c['course'], c['teacher'], c['room']) for c in classes_b)
            for cls in classes_a:
                fp = (cls['day'], cls['time'], cls['course'], cls['teacher'], cls['room'])
                if fp not in existing_fps:
                    merged[key]['classes'].append(cls)
                    existing_fps.add(fp)
        # Ensure batch and section fields
        if 'batch' not in merged[key]:
            merged[key]['batch'] = data_a.get('batch', data_b.get('batch', 'Unknown'))
        if 'section' not in merged[key]:
            merged[key]['section'] = data_a.get('section', data_b.get('section', ''))
    return merged


def merge_with_existing(new_sections):
    """Merge new data into existing per-section JSON files (preserve manual fixes)."""
    merged = {}
    existing_files = list(SECTIONS_DIR.glob("*.json"))
    for file_path in existing_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                section_key = data.get('section')
                if section_key:
                    merged[section_key] = {
                        'batch': data.get('batch', 'Unknown'),
                        'section': data.get('section', ''),
                        'classes': data.get('classes', [])
                    }
        except Exception as e:
            logger.warning(f"Could not load existing {file_path}: {e}")

    for sec_key, sec_data in new_sections.items():
        if sec_key not in merged:
            merged[sec_key] = {
                'batch': sec_data.get('batch', 'Unknown'),
                'section': sec_data.get('section', ''),
                'classes': sec_data.get('classes', [])
            }
            continue

        existing_classes = merged[sec_key]['classes']
        new_classes = sec_data.get('classes', [])
        existing_fps = set((c['day'], c['time'], c['course'], c['teacher'], c['room']) for c in existing_classes)
        added = 0
        for cls in new_classes:
            fp = (cls['day'], cls['time'], cls['course'], cls['teacher'], cls['room'])
            if fp not in existing_fps:
                existing_classes.append(cls)
                existing_fps.add(fp)
                added += 1
        if added:
            logger.info(f"   Added {added} new classes to section {sec_key}")
            merged[sec_key]['batch'] = merged[sec_key].get('batch', sec_data.get('batch', 'Unknown'))
            merged[sec_key]['section'] = merged[sec_key].get('section', sec_data.get('section', ''))

    return merged


def extract_text(pdf_content):
    """Extract raw text for regex fallback."""
    try:
        with pdfplumber.open(BytesIO(pdf_content)) as pdf:
            text = ""
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
            return text
    except Exception as e:
        logger.warning(f"pdfplumber text extraction failed: {e}")
        return None


def extract_tables_pdfplumber(pdf_content):
    """Extract using pdfplumber tables (with lab merging)."""
    sections = defaultdict(lambda: {'classes': []})
    class_count = 0

    try:
        with pdfplumber.open(BytesIO(pdf_content)) as pdf:
            logger.info(f"📄 PDF has {len(pdf.pages)} pages")

            for page_num, page in enumerate(pdf.pages, 1):
                page_text = page.extract_text()
                current_day = None
                if page_text:
                    for line in page_text.split('\n'):
                        upper = line.upper()
                        for day in ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']:
                            if day in upper and (re.search(r'\d{2}:\d{2}-\d{2}:\d{2}', upper) or len(line) < 30):
                                current_day = day.capitalize()
                                break
                        if current_day:
                            break

                tables = page.extract_tables()
                if not tables:
                    continue

                for table in tables:
                    if not table or len(table) < 2:
                        continue

                    header_index = -1
                    raw_time_slots = []
                    for idx, row in enumerate(table):
                        row_text = ' '.join([str(cell) if cell else '' for cell in row])
                        if re.search(r'\d{2}:\d{2}-\d{2}:\d{2}', row_text):
                            header_index = idx
                            raw_time_slots = [cell.strip() if cell else '' for cell in row]
                            break

                    if header_index == -1:
                        continue

                    time_slots = []
                    last_time = None
                    for cell in raw_time_slots:
                        if cell.strip():
                            last_time = cell.strip()
                        time_slots.append(last_time if last_time else '')
                    while time_slots and not time_slots[-1]:
                        time_slots.pop()

                    for row_idx in range(header_index + 1, len(table)):
                        row = table[row_idx]
                        if all(cell is None or str(cell).strip() == '' for cell in row):
                            continue

                        for col_idx, cell in enumerate(row):
                            if col_idx >= len(time_slots):
                                break
                            time_slot = time_slots[col_idx]
                            if not time_slot:
                                continue

                            cell_text = str(cell).strip() if cell else ''
                            if not cell_text:
                                continue

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

                            section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
                            if not section_clean:
                                continue

                            sub_section = 'Main'
                            main_section = section_clean
                            match_sub = re.search(r'(_[A-Z])(\d+)$', section_clean)
                            if match_sub:
                                main_section = section_clean[:match_sub.start()] + match_sub.group(1)
                                sub_section = match_sub.group(2)

                            is_lab = 'LAB' in cell_text.upper() or 'COM LAB' in cell_text.upper()
                            class_type = 'Lab' if is_lab else 'Theory'

                            batch_match = re.search(r'(\d{2})', main_section)
                            batch = batch_match.group(1) if batch_match else 'Unknown'
                            section_letter = re.sub(r'[^A-Z]', '', main_section.split('_')[-1] if '_' in main_section else '')

                            key = main_section
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
                                'section': section_letter,
                                'sub_section': sub_section
                            })
                            class_count += 1

    except Exception as e:
        logger.error(f"❌ pdfplumber table extraction failed: {e}")
        return {}

    logger.info(f"📊 Extracted {class_count} raw class records from tables")

    if class_count == 0:
        return {}

    # Merge lab classes
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


def extract_classes_from_text(text):
    """Regex-based fallback extraction."""
    all_classes = []
    lines = text.split('\n')
    time_slots = [
        '08:30-10:00', '10:00-11:30', '11:30-01:00',
        '01:00-02:30', '02:30-04:00', '04:00-05:30'
    ]
    days = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']
    current_day = None
    pattern = re.compile(r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)')
    pattern2 = re.compile(r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)')

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        upper = stripped.upper()
        day_found = None
        for day in days:
            if day in upper and (any(slot in upper for slot in time_slots) or len(stripped) < 50):
                day_found = day.capitalize()
                break
        if day_found:
            current_day = day_found
            continue
        if not current_day:
            continue
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

    # Group into sections
    sections = defaultdict(lambda: {'classes': []})
    for cls in all_classes:
        key = cls['main_section']
        sections[key]['batch'] = cls.get('batch', 'Unknown')
        sections[key]['section'] = cls.get('section', '')
        sections[key]['classes'].append({
            'day': cls['day'],
            'time': cls['time'],
            'course': cls['course'],
            'teacher': cls['teacher'],
            'room': cls['room'],
            'type': cls['type'],
            'batch': cls.get('batch', 'Unknown'),
            'section': cls.get('section', ''),
            'sub_section': cls.get('sub_section', 'Main')
        })
    return dict(sections)


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


if __name__ == "__main__":
    main()
