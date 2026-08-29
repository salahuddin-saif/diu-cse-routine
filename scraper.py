#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - SIMPLIFIED WORKING VERSION
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
TEMP_FILE = DATA_DIR / "routine.json.tmp"

# ============================================================
# LOGGING
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)


def scrape_routine():
    """Main scraping function."""
    try:
        logger.info("=" * 60)
        logger.info("DIU CSE ROUTINE SCRAPER - SIMPLIFIED VERSION")
        logger.info("=" * 60)
        
        # Create data directory
        DATA_DIR.mkdir(exist_ok=True)
        
        # STEP 1: Get the PDF URL
        logger.info("📡 Finding PDF URL...")
        pdf_url = get_pdf_url()
        
        if not pdf_url:
            logger.error("❌ Could not find PDF URL")
            return False
        
        logger.info(f"✅ Found PDF: {pdf_url}")
        
        # STEP 2: Download the PDF
        logger.info("⬇️ Downloading PDF...")
        response = requests.get(pdf_url, timeout=30)
        response.raise_for_status()
        pdf_content = response.content
        logger.info(f"✅ Downloaded {len(pdf_content)} bytes")
        
        # STEP 3: Parse the PDF
        logger.info("📖 Parsing PDF...")
        sections = parse_pdf(pdf_content)
        
        if not sections:
            logger.error("❌ No data extracted")
            return False
        
        # STEP 4: Save the data
        total = sum(len(entries) for entries in sections.values())
        logger.info(f"✅ Extracted {len(sections)} sections with {total} classes")
        
        output = {
            'updated_at': datetime.now(timezone.utc).isoformat(),
            'source': pdf_url,
            'sections': sections
        }
        
        with open(TEMP_FILE, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        
        TEMP_FILE.rename(OUTPUT_FILE)
        
        logger.info(f"✅ Saved to {OUTPUT_FILE}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False


def get_pdf_url():
    """Get the PDF URL from the notice page."""
    try:
        # Get notice page
        response = requests.get(NOTICE_URL, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Find routine notice
        for link in soup.find_all('a', href=True):
            text = link.get_text().strip().lower()
            href = link.get('href', '')
            
            if 'routine' in text:
                # Make URL absolute
                if not href.startswith(('http://', 'https://')):
                    href = requests.compat.urljoin(NOTICE_URL, href)
                
                logger.info(f"🔗 Found routine notice: {text[:50]}")
                
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
                        return dl_href
                
                # If no download-file link, look for .pdf
                for dl_link in detail_soup.find_all('a', href=True):
                    dl_href = dl_link.get('href', '')
                    if '.pdf' in dl_href.lower():
                        if not dl_href.startswith(('http://', 'https://')):
                            dl_href = requests.compat.urljoin(href, dl_href)
                        return dl_href
        
        return None
        
    except Exception as e:
        logger.error(f"❌ Error getting PDF URL: {e}")
        return None


def parse_pdf(pdf_content):
    """Parse the PDF and extract routine data."""
    try:
        pdf_reader = PyPDF2.PdfReader(BytesIO(pdf_content))
        logger.info(f"📄 PDF has {len(pdf_reader.pages)} pages")
        
        # Extract text from all pages
        all_text = ""
        for i, page in enumerate(pdf_reader.pages):
            try:
                text = page.extract_text()
                if text:
                    all_text += text + "\n"
                    logger.info(f"📝 Page {i+1}: {len(text)} chars")
            except:
                logger.warning(f"⚠️ Could not extract page {i+1}")
        
        if not all_text.strip():
            logger.error("❌ No text extracted from PDF")
            return {}
        
        # Save extracted text for debugging
        debug_file = DATA_DIR / "debug_text.txt"
        debug_file.write_text(all_text)
        logger.info(f"💾 Saved extracted text to {debug_file}")
        
        # Parse the text
        sections = extract_routine_from_text(all_text)
        return sections
        
    except Exception as e:
        logger.error(f"❌ PDF parsing failed: {e}")
        return {}


def extract_routine_from_text(text):
    """Extract routine data from text."""
    sections = {}
    lines = text.split('\n')
    
    # Time slots
    time_slots = [
        '08:30-10:00',
        '10:00-11:30',
        '11:30-01:00',
        '01:00-02:30',
        '02:30-04:00',
        '04:00-05:30'
    ]
    
    current_day = None
    class_count = 0
    
    # Pattern for class data
    # Matches: ROOM COURSE(SECTION) TEACHER
    pattern = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Check for day header
        day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY)', line.upper())
        if day_match:
            # Check if this is actually a day header (contains time slots)
            if any(slot in line for slot in time_slots):
                current_day = day_match.group(1).capitalize()
                logger.info(f"📅 Found day: {current_day}")
                continue
        
        # Skip table of contents and page references
        if 'TABLE' in line.upper() or 'PAGE' in line.upper():
            continue
        
        if not current_day:
            continue
        
        # Find class entries
        matches = re.findall(pattern, line)
        
        for room, course, section, teacher in matches:
            # Clean section
            section_clean = section.replace(' ', '_').upper()
            section_clean = re.sub(r'[^A-Z0-9_]', '', section_clean)
            
            if not section_clean:
                continue
            
            # Determine class type
            class_type = 'Theory'
            if 'LAB' in line.upper() or 'COM LAB' in line.upper():
                class_type = 'Lab'
            
            # Determine time slot (approximate based on position)
            time_slot = get_time_slot(line, room, time_slots)
            
            entry = {
                'day': current_day,
                'time': time_slot,
                'course': course,
                'teacher': teacher,
                'room': room,
                'type': class_type
            }
            
            if section_clean not in sections:
                sections[section_clean] = []
            sections[section_clean].append(entry)
            class_count += 1
    
    logger.info(f"📊 Found {class_count} classes in {len(sections)} sections")
    return sections


def get_time_slot(line, room, time_slots):
    """Estimate time slot based on room position in line."""
    pos = line.find(room)
    if pos == -1:
        return 'TBA'
    
    # Calculate position ratio
    line_len = len(line)
    if line_len == 0:
        return 'TBA'
    
    ratio = pos / line_len
    
    # Map ratio to time slot
    if ratio < 0.2:
        return time_slots[0] if time_slots else 'TBA'
    elif ratio < 0.35:
        return time_slots[1] if len(time_slots) > 1 else 'TBA'
    elif ratio < 0.5:
        return time_slots[2] if len(time_slots) > 2 else 'TBA'
    elif ratio < 0.65:
        return time_slots[3] if len(time_slots) > 3 else 'TBA'
    elif ratio < 0.8:
        return time_slots[4] if len(time_slots) > 4 else 'TBA'
    else:
        return time_slots[5] if len(time_slots) > 5 else 'TBA'


def main():
    """Main entry point."""
    success = scrape_routine()
    
    if success:
        logger.info("✅ Scraping completed successfully")
        sys.exit(0)
    else:
        # Check if we have existing data
        if OUTPUT_FILE.exists():
            logger.info("⚠️ Scraping failed but keeping existing routine.json")
            sys.exit(0)
        else:
            logger.error("❌ Scraping failed and no existing data")
            sys.exit(1)


if __name__ == "__main__":
    main()
