#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - COMPLETE DEBUG VERSION
This will log EVERYTHING to help identify the issue.
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
DEBUG_FILE = DATA_DIR / "debug_text.txt"
DEBUG_PDF = DATA_DIR / "debug_routine.pdf"

# ============================================================
# LOGGING - EXTREMELY DETAILED
# ============================================================

logging.basicConfig(
    level=logging.DEBUG,  # DEBUG level for maximum detail
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)


def scrape_routine():
    """Main scraping function with full debugging."""
    try:
        logger.info("=" * 70)
        logger.info("DIU CSE ROUTINE SCRAPER - FULL DEBUG VERSION")
        logger.info("=" * 70)
        
        # Create data directory
        DATA_DIR.mkdir(exist_ok=True)
        logger.info(f"✅ Data directory: {DATA_DIR.absolute()}")
        
        # STEP 1: Get the PDF URL
        logger.info("🔍 STEP 1: Finding PDF URL...")
        pdf_url = get_pdf_url()
        
        if not pdf_url:
            logger.error("❌ Could not find PDF URL")
            return False
        
        logger.info(f"✅ Found PDF URL: {pdf_url}")
        
        # STEP 2: Download the PDF
        logger.info("⬇️ STEP 2: Downloading PDF...")
        try:
            response = requests.get(pdf_url, timeout=30)
            response.raise_for_status()
            pdf_content = response.content
            logger.info(f"✅ Downloaded {len(pdf_content)} bytes")
            
            # Save PDF for debugging
            DEBUG_PDF.write_bytes(pdf_content)
            logger.info(f"💾 Saved PDF to {DEBUG_PDF}")
            
        except Exception as e:
            logger.error(f"❌ Download failed: {e}")
            return False
        
        # STEP 3: Parse the PDF
        logger.info("📖 STEP 3: Parsing PDF...")
        sections = parse_pdf_with_debug(pdf_content)
        
        if not sections:
            logger.error("❌ No data extracted from PDF")
            return False
        
        # STEP 4: Save the data
        total = sum(len(entries) for entries in sections.values())
        logger.info(f"✅ Extracted {len(sections)} sections with {total} classes")
        
        output = {
            'updated_at': datetime.now(timezone.utc).isoformat(),
            'source': pdf_url,
            'sections': sections
        }
        
        # Write to temp file first
        with open(TEMP_FILE, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        
        # Rename to final
        TEMP_FILE.rename(OUTPUT_FILE)
        
        logger.info(f"✅ Successfully saved to {OUTPUT_FILE}")
        logger.info(f"📊 Total sections: {len(sections)}")
        logger.info(f"📊 Total classes: {total}")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Scraper failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False


def get_pdf_url():
    """Get the PDF URL with full debugging."""
    try:
        logger.info("🌐 Fetching notice page: %s", NOTICE_URL)
        response = requests.get(NOTICE_URL, timeout=30)
        response.raise_for_status()
        logger.info(f"✅ Status: {response.status_code}")
        logger.info(f"✅ Content length: {len(response.text)} bytes")
        
        soup = BeautifulSoup(response.text, 'html.parser')
        logger.info("✅ Parsed HTML")
        
        # Find all links
        links = soup.find_all('a', href=True)
        logger.info(f"📊 Found {len(links)} links on the page")
        
        # Look for routine notices
        routine_links = []
        for link in links:
            text = link.get_text().strip()
            href = link.get('href', '')
            if 'routine' in text.lower():
                routine_links.append((text, href))
                logger.info(f"🔗 Found routine link: '{text[:50]}' -> {href}")
        
        if not routine_links:
            logger.error("❌ No routine links found on the page")
            return None
        
        # Check each routine link
        for title, href in routine_links:
            logger.info(f"📄 Checking routine: {title[:50]}...")
            
            # Make URL absolute
            if not href.startswith(('http://', 'https://')):
                href = requests.compat.urljoin(NOTICE_URL, href)
            logger.info(f"🔗 Full URL: {href}")
            
            try:
                # Get detail page
                detail_response = requests.get(href, timeout=30)
                detail_response.raise_for_status()
                logger.info(f"✅ Detail page loaded: {len(detail_response.text)} bytes")
                
                detail_soup = BeautifulSoup(detail_response.text, 'html.parser')
                
                # Look for PDF download links
                for dl_link in detail_soup.find_all('a', href=True):
                    dl_href = dl_link.get('href', '')
                    dl_text = dl_link.get_text().strip()
                    
                    logger.debug(f"🔍 Checking link: {dl_text[:30]} -> {dl_href}")
                    
                    if 'download-file' in dl_href.lower() or '.pdf' in dl_href.lower():
                        if not dl_href.startswith(('http://', 'https://')):
                            dl_href = requests.compat.urljoin(href, dl_href)
                        logger.info(f"✅ Found PDF: {dl_href}")
                        return dl_href
                
                logger.warning("⚠️ No PDF download link found on detail page")
                
            except Exception as e:
                logger.warning(f"⚠️ Could not process detail page: {e}")
                continue
        
        logger.error("❌ No PDF found after checking all routine links")
        return None
        
    except Exception as e:
        logger.error(f"❌ Error getting PDF URL: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None


def parse_pdf_with_debug(pdf_content):
    """Parse the PDF with full debugging."""
    sections = {}
    
    try:
        # Try to read PDF
        logger.info("📄 Reading PDF with PyPDF2...")
        try:
            pdf_reader = PyPDF2.PdfReader(BytesIO(pdf_content))
            logger.info(f"✅ PDF has {len(pdf_reader.pages)} pages")
        except Exception as e:
            logger.error(f"❌ Could not read PDF: {e}")
            return {}
        
        # Extract text from all pages
        all_text = ""
        for i, page in enumerate(pdf_reader.pages):
            try:
                text = page.extract_text()
                if text:
                    all_text += text + "\n"
                    logger.info(f"📝 Page {i+1}: {len(text)} characters extracted")
                    # Log first 100 chars of each page
                    logger.debug(f"Page {i+1} preview: {text[:100]}...")
                else:
                    logger.warning(f"⚠️ Page {i+1}: No text extracted")
            except Exception as e:
                logger.warning(f"⚠️ Could not extract page {i+1}: {e}")
        
        # Save extracted text for debugging
        if all_text:
            DEBUG_FILE.write_text(all_text)
            logger.info(f"💾 Saved extracted text to {DEBUG_FILE} ({len(all_text)} chars)")
        else:
            logger.error("❌ No text extracted from any page")
            return {}
        
        # Parse the text
        logger.info("🔍 Parsing text for routine data...")
        sections = extract_routine_from_text(all_text)
        
        if sections:
            total = sum(len(entries) for entries in sections.values())
            logger.info(f"✅ Found {len(sections)} sections with {total} classes")
        else:
            logger.warning("⚠️ No routine data found in text")
        
        return sections
        
    except Exception as e:
        logger.error(f"❌ PDF parsing failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {}


def extract_routine_from_text(text):
    """Extract routine data from text with debugging."""
    sections = {}
    lines = text.split('\n')
    logger.info(f"📊 Processing {len(lines)} lines of text")
    
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
    
    # First, find all days
    days_found = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY)', line.upper())
        if day_match and any(slot in line for slot in time_slots):
            day = day_match.group(1).capitalize()
            if day not in days_found:
                days_found.append(day)
                logger.info(f"📅 Found day: {day}")
    
    logger.info(f"📅 Days found: {days_found}")
    
    # Process lines to extract classes
    for line_num, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue
        
        # Check for day header
        day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY)', line.upper())
        if day_match and any(slot in line for slot in time_slots):
            current_day = day_match.group(1).capitalize()
            logger.debug(f"Line {line_num}: Setting day to {current_day}")
            continue
        
        # Skip table of contents and page references
        if 'TABLE' in line.upper() or 'PAGE' in line.upper():
            continue
        
        if not current_day:
            continue
        
        # Find class entries
        matches = re.findall(pattern, line)
        
        if matches:
            logger.debug(f"Line {line_num}: Found {len(matches)} matches: {matches[:2]}")
        
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
    
    logger.info(f"📊 Total classes found: {class_count}")
    logger.info(f"📊 Total sections: {len(sections)}")
    
    # Log sample of data found
    if sections:
        sample_section = next(iter(sections))
        logger.info(f"📋 Sample data for section {sample_section}: {sections[sample_section][:2]}")
    
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
        logger.info("=" * 70)
        logger.info("✅ SCRAPING COMPLETED SUCCESSFULLY")
        logger.info("=" * 70)
        sys.exit(0)
    else:
        # Check if we have existing data
        if OUTPUT_FILE.exists():
            logger.info("⚠️ Scraping failed but keeping existing routine.json")
            sys.exit(0)
        else:
            logger.error("=" * 70)
            logger.error("❌ SCRAPING FAILED AND NO EXISTING DATA")
            logger.error("=" * 70)
            sys.exit(1)


if __name__ == "__main__":
    main()
