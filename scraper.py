#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - Finds the CORRECT routine (Class Routine, not Exam)
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
    """Main scraper function."""
    try:
        DATA_DIR.mkdir(exist_ok=True)
        
        logger.info("=" * 60)
        logger.info("DIU CSE ROUTINE SCRAPER")
        logger.info("=" * 60)
        
        # STEP 1: Find the class routine PDF
        logger.info("🔍 Looking for Class Routine on notice page...")
        pdf_url = find_class_routine_pdf()
        
        if not pdf_url:
            logger.error("❌ Could not find Class Routine PDF")
            # Fallback to known URL
            logger.info("🔄 Trying fallback URL...")
            pdf_url = "https://webbackend.daffodilvarsity.edu.bd/download-file/4148"
        
        logger.info(f"📄 PDF URL: {pdf_url}")
        
        # STEP 2: Download PDF
        logger.info("⬇️ Downloading PDF...")
        response = requests.get(pdf_url, timeout=30)
        response.raise_for_status()
        logger.info(f"✅ Downloaded {len(response.content)} bytes")
        
        # STEP 3: Parse PDF
        logger.info("📖 Parsing PDF...")
        sections = parse_pdf(response.content)
        
        if not sections:
            logger.error("❌ No data extracted from PDF")
            sys.exit(1)
        
        # STEP 4: Save data
        total = sum(len(entries) for entries in sections.values())
        output = {
            'updated_at': datetime.now(timezone.utc).isoformat(),
            'source': pdf_url,
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


def find_class_routine_pdf():
    """Find the Class Routine PDF (not Exam Routine)."""
    try:
        # Get notice page
        response = requests.get(NOTICE_URL, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Find all notice links
        for link in soup.find_all('a', href=True):
            text = link.get_text().strip()
            href = link.get('href', '')
            
            # Look for "Class Routine" (not "Examination Routine")
            if 'class routine' in text.lower() and 'exam' not in text.lower():
                logger.info(f"🔗 Found: {text}")
                
                # Make URL absolute
                if not href.startswith(('http://', 'https://')):
                    href = requests.compat.urljoin(NOTICE_URL, href)
                
                # Get detail page
                detail_response = requests.get(href, timeout=30)
                detail_response.raise_for_status()
                detail_soup = BeautifulSoup(detail_response.text, 'html.parser')
                
                # Find PDF download link
                for dl_link in detail_soup.find_all('a', href=True):
                    dl_href = dl_link.get('href', '')
                    if 'download-file' in dl_href:
                        if not dl_href.startswith(('http://', 'https://')):
                            dl_href = requests.compat.urljoin(href, dl_href)
                        logger.info(f"✅ Found Class Routine PDF: {dl_href}")
                        return dl_href
        
        # If no "Class Routine" found, try "Routine" but exclude "Examination"
        for link in soup.find_all('a', href=True):
            text = link.get_text().strip()
            href = link.get('href', '')
            
            if 'routine' in text.lower() and 'exam' not in text.lower():
                logger.info(f"🔗 Found: {text}")
                
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
                        logger.info(f"✅ Found Routine PDF: {dl_href}")
                        return dl_href
        
        return None
        
    except Exception as e:
        logger.error(f"❌ Error finding PDF: {e}")
        return None


def parse_pdf(content):
    """Parse PDF and extract class routine data."""
    sections = {}
    
    try:
        pdf_reader = PyPDF2.PdfReader(BytesIO(content))
        logger.info(f"📄 PDF has {len(pdf_reader.pages)} pages")
        
        # Extract text
        all_text = ""
        for page_num, page in enumerate(pdf_reader.pages):
            text = page.extract_text()
            if text:
                all_text += text + "\n"
                logger.info(f"📝 Page {page_num + 1}: {len(text)} chars")
        
        if not all_text:
            logger.error("❌ No text extracted")
            return {}
        
        # Save debug text
        debug_file = DATA_DIR / "debug_text.txt"
        debug_file.write_text(all_text)
        logger.info(f"💾 Saved debug text to {debug_file}")
        
        # Parse the text
        sections = extract_routine(all_text)
        return sections
        
    except Exception as e:
        logger.error(f"❌ PDF parsing failed: {e}")
        return {}


def extract_routine(text):
    """Extract routine data from text."""
    sections = {}
    lines = text.split('\n')
    
    time_slots = [
        '08:30-10:00', '10:00-11:30', '11:30-01:00',
        '01:00-02:30', '02:30-04:00', '04:00-05:30'
    ]
    
    current_day = None
    class_count = 0
    
    # Pattern: Room Course(Section) Teacher
    pattern = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Check for day
        day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY)', line.upper())
        if day_match and any(slot in line for slot in time_slots):
            current_day = day_match.group(1).capitalize()
            logger.info(f"📅 Found day: {current_day}")
            continue
        
        # Skip table of contents and exam references
        if 'TABLE' in line.upper() or 'EXAM' in line.upper():
            continue
        
        if not current_day:
            continue
        
        # Find class entries
        matches = re.findall(pattern, line)
        
        for room, course, section, teacher in matches:
            section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
            if not section_clean:
                continue
            
            # Determine time slot
            pos = line.find(room)
            ratio = pos / len(line) if len(line) > 0 else 0
            time_slot = 'TBA'
            if ratio < 0.2:
                time_slot = time_slots[0] if time_slots else 'TBA'
            elif ratio < 0.35:
                time_slot = time_slots[1] if len(time_slots) > 1 else 'TBA'
            elif ratio < 0.5:
                time_slot = time_slots[2] if len(time_slots) > 2 else 'TBA'
            elif ratio < 0.65:
                time_slot = time_slots[3] if len(time_slots) > 3 else 'TBA'
            elif ratio < 0.8:
                time_slot = time_slots[4] if len(time_slots) > 4 else 'TBA'
            else:
                time_slot = time_slots[5] if len(time_slots) > 5 else 'TBA'
            
            entry = {
                'day': current_day,
                'time': time_slot,
                'course': course,
                'teacher': teacher,
                'room': room,
                'type': 'Lab' if 'LAB' in line.upper() else 'Theory'
            }
            
            if section_clean not in sections:
                sections[section_clean] = []
            sections[section_clean].append(entry)
            class_count += 1
    
    logger.info(f"📊 Found {class_count} classes in {len(sections)} sections")
    return sections


if __name__ == "__main__":
    main()
