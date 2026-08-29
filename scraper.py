#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - Working Version
Extracts data from the DIU routine PDF.
"""

import json
import os
import sys
import logging
import re
from datetime import datetime, timezone
from typing import Dict, List, Optional
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


class DIURoutineScraper:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        })
        self.timeout = 30
    
    def scrape(self) -> bool:
        """Main scraping method."""
        try:
            logger.info("=" * 60)
            logger.info("STARTING DIU CSE ROUTINE SCRAPER")
            logger.info("=" * 60)
            
            DATA_DIR.mkdir(exist_ok=True)
            
            # Step 1: Find PDF URL
            pdf_url = self.find_pdf_url()
            if not pdf_url:
                logger.error("❌ Could not find PDF URL")
                return False
            
            logger.info(f"✅ Found PDF URL: {pdf_url}")
            
            # Step 2: Download PDF
            logger.info(f"⬇️ Downloading PDF...")
            response = self.session.get(pdf_url, timeout=self.timeout)
            response.raise_for_status()
            pdf_content = response.content
            logger.info(f"✅ Downloaded {len(pdf_content)} bytes")
            
            # Step 3: Parse PDF
            logger.info("📖 Parsing PDF...")
            sections = self.parse_pdf(pdf_content)
            
            if not sections:
                logger.error("❌ No data extracted from PDF")
                # Try alternate parsing method
                logger.info("🔄 Trying alternate parsing method...")
                sections = self.parse_pdf_alternate(pdf_content)
            
            if not sections:
                logger.error("❌ Still no data extracted")
                return False
            
            # Step 4: Validate
            total = sum(len(entries) for entries in sections.values())
            if total == 0:
                logger.error("❌ No class entries found")
                return False
            
            logger.info(f"✅ Extracted {len(sections)} sections with {total} classes")
            
            # Step 5: Save
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
            logger.error(f"❌ Scraper failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False
    
    def find_pdf_url(self) -> Optional[str]:
        """Find the PDF URL from the notice page."""
        try:
            logger.info(f"📡 Fetching notice page: {NOTICE_URL}")
            response = self.session.get(NOTICE_URL, timeout=self.timeout)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Find routine notices
            for link in soup.find_all('a', href=True):
                text = link.get_text().strip()
                href = link.get('href', '')
                
                if 'routine' in text.lower():
                    logger.info(f"🔗 Found routine notice: {text[:50]}")
                    
                    # Make URL absolute
                    if not href.startswith(('http://', 'https://')):
                        href = requests.compat.urljoin(NOTICE_URL, href)
                    
                    # Visit notice detail page
                    try:
                        detail_response = self.session.get(href, timeout=self.timeout)
                        detail_response.raise_for_status()
                        detail_soup = BeautifulSoup(detail_response.text, 'html.parser')
                        
                        # Find PDF download link
                        for dl_link in detail_soup.find_all('a', href=True):
                            dl_href = dl_link.get('href', '')
                            if 'download-file' in dl_href:
                                if not dl_href.startswith(('http://', 'https://')):
                                    dl_href = requests.compat.urljoin(href, dl_href)
                                logger.info(f"✅ Found PDF: {dl_href}")
                                return dl_href
                    except Exception as e:
                        logger.warning(f"⚠️ Could not process detail page: {e}")
            
            logger.error("❌ No PDF found")
            return None
            
        except Exception as e:
            logger.error(f"❌ Failed to find PDF: {e}")
            return None
    
    def parse_pdf(self, content: bytes) -> Dict[str, List[Dict]]:
        """Parse PDF and extract routine data."""
        sections = {}
        
        try:
            pdf_reader = PyPDF2.PdfReader(BytesIO(content))
            logger.info(f"📄 PDF has {len(pdf_reader.pages)} pages")
            
            # Time slots
            time_slots = [
                '08:30-10:00', '10:00-11:30', '11:30-01:00',
                '01:00-02:30', '02:30-04:00', '04:00-05:30'
            ]
            
            # Process only content pages (skip first 2 pages which are TOC)
            start_page = 2
            end_page = min(10, len(pdf_reader.pages))
            
            all_text = ""
            for page_num in range(start_page, end_page):
                page = pdf_reader.pages[page_num]
                text = page.extract_text()
                if text:
                    all_text += text + "\n"
                    logger.info(f"📝 Page {page_num + 1}: {len(text)} chars")
            
            if not all_text:
                logger.error("❌ No text extracted from PDF")
                return {}
            
            # Parse the text
            lines = all_text.split('\n')
            current_day = None
            
            # Pattern for class data: ROOM COURSE(SECTION) TEACHER
            # Example: "KT-201 CSE315(66_E) AS"
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
                
                # Skip table references and page numbers
                if 'TABLE' in line.upper() or 'PAGE' in line.upper():
                    continue
                
                if not current_day:
                    continue
                
                # Find all class entries in this line
                matches = re.findall(pattern, line)
                
                if matches:
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
                        
                        # Determine time slot (approximate)
                        time_slot = self.get_time_slot(line, room, time_slots)
                        
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
            
            return sections
            
        except Exception as e:
            logger.error(f"❌ PDF parsing failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {}
    
    def parse_pdf_alternate(self, content: bytes) -> Dict[str, List[Dict]]:
        """Alternate parsing method - more aggressive extraction."""
        sections = {}
        
        try:
            pdf_reader = PyPDF2.PdfReader(BytesIO(content))
            
            # Extract ALL text from all pages
            all_text = ""
            for page in pdf_reader.pages:
                text = page.extract_text()
                if text:
                    all_text += text + "\n"
            
            # Pattern for class data
            pattern = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'
            
            # Find all matches
            matches = re.findall(pattern, all_text)
            logger.info(f"📊 Found {len(matches)} total class entries")
            
            if not matches:
                return {}
            
            # Process matches
            for room, course, section, teacher in matches:
                section_clean = re.sub(r'[^A-Z0-9_]', '', section.replace(' ', '_').upper())
                if not section_clean:
                    continue
                
                # Determine class type
                class_type = 'Theory'
                
                # Try to find which day this belongs to
                day = self.find_day_for_entry(all_text, room, course, section)
                
                entry = {
                    'day': day or 'Unknown',
                    'time': 'TBA',
                    'course': course,
                    'teacher': teacher,
                    'room': room,
                    'type': class_type
                }
                
                if section_clean not in sections:
                    sections[section_clean] = []
                sections[section_clean].append(entry)
            
            return sections
            
        except Exception as e:
            logger.error(f"❌ Alternate parsing failed: {e}")
            return {}
    
    def get_time_slot(self, line: str, room: str, time_slots: List[str]) -> str:
        """Try to determine the time slot from the line."""
        # Find the position of the room in the line
        room_pos = line.find(room)
        if room_pos == -1:
            return 'TBA'
        
        # Roughly estimate which time slot based on position
        # This is a heuristic - may not be accurate
        line_length = len(line)
        position_ratio = room_pos / line_length if line_length > 0 else 0
        
        if position_ratio < 0.2:
            return time_slots[0] if time_slots else 'TBA'
        elif position_ratio < 0.4:
            return time_slots[1] if len(time_slots) > 1 else 'TBA'
        elif position_ratio < 0.6:
            return time_slots[2] if len(time_slots) > 2 else 'TBA'
        elif position_ratio < 0.8:
            return time_slots[3] if len(time_slots) > 3 else 'TBA'
        else:
            return time_slots[4] if len(time_slots) > 4 else 'TBA'
    
    def find_day_for_entry(self, text: str, room: str, course: str, section: str) -> Optional[str]:
        """Find which day an entry belongs to."""
        days = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY']
        
        # Look for the entry in the text and find which day section it's in
        lines = text.split('\n')
        current_day = None
        
        for line in lines:
            line_upper = line.upper()
            
            # Check for day
            for day in days:
                if day in line_upper and any(slot in line for slot in ['08:30', '10:00', '11:30', '01:00', '02:30', '04:00']):
                    current_day = day.capitalize()
                    break
            
            # Check if this line contains our entry
            if room in line and course in line and section in line:
                return current_day
        
        return None


def main():
    """Main entry point."""
    scraper = DIURoutineScraper()
    has_existing = OUTPUT_FILE.exists()
    
    if scraper.scrape():
        logger.info("✅ Scraping completed successfully")
        sys.exit(0)
    else:
        if has_existing:
            logger.info("⚠️ Scraping failed but keeping existing routine.json")
            sys.exit(0)
        else:
            logger.error("❌ Scraping failed and no existing data")
            sys.exit(1)


if __name__ == "__main__":
    main()
