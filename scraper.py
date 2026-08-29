#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - Complete Working Version
Handles the entire flow: notice → detail → PDF → JSON
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
        """Main scraping method - Complete flow."""
        try:
            logger.info("=" * 60)
            logger.info("STARTING DIU CSE ROUTINE SCRAPER")
            logger.info("=" * 60)
            
            # Create data directory
            DATA_DIR.mkdir(exist_ok=True)
            
            # STEP 1: Get the notice page
            logger.info(f"📡 STEP 1: Fetching notice page: {NOTICE_URL}")
            response = self.session.get(NOTICE_URL, timeout=self.timeout)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            logger.info("✅ Notice page loaded")
            
            # STEP 2: Find routine notice
            logger.info("🔍 STEP 2: Finding routine notice...")
            routine_notice = self.find_routine_notice(soup)
            
            if not routine_notice:
                logger.error("❌ No routine notice found")
                return False
            
            notice_title, notice_url = routine_notice
            logger.info(f"✅ Found routine notice: {notice_title}")
            logger.info(f"🔗 Notice URL: {notice_url}")
            
            # STEP 3: Get the notice detail page
            logger.info("📄 STEP 3: Getting notice detail...")
            detail_response = self.session.get(notice_url, timeout=self.timeout)
            detail_response.raise_for_status()
            detail_soup = BeautifulSoup(detail_response.text, 'html.parser')
            logger.info("✅ Detail page loaded")
            
            # STEP 4: Find PDF download link
            logger.info("🔍 STEP 4: Finding PDF download link...")
            pdf_url = self.find_pdf_link(detail_soup, notice_url)
            
            if not pdf_url:
                logger.error("❌ No PDF found")
                return False
            
            logger.info(f"✅ Found PDF: {pdf_url}")
            
            # STEP 5: Download PDF
            logger.info("⬇️ STEP 5: Downloading PDF...")
            pdf_response = self.session.get(pdf_url, timeout=self.timeout)
            pdf_response.raise_for_status()
            pdf_content = pdf_response.content
            logger.info(f"✅ Downloaded {len(pdf_content)} bytes")
            
            # STEP 6: Parse PDF
            logger.info("📖 STEP 6: Parsing PDF...")
            sections = self.parse_pdf(pdf_content)
            
            if not sections:
                logger.error("❌ No data extracted from PDF")
                return False
            
            # STEP 7: Save data
            total_classes = sum(len(entries) for entries in sections.values())
            logger.info(f"✅ Extracted {len(sections)} sections with {total_classes} classes")
            
            output = {
                'updated_at': datetime.now(timezone.utc).isoformat(),
                'source': pdf_url,
                'sections': sections
            }
            
            with open(TEMP_FILE, 'w', encoding='utf-8') as f:
                json.dump(output, f, indent=2, ensure_ascii=False)
            
            TEMP_FILE.rename(OUTPUT_FILE)
            
            logger.info(f"✅ Successfully saved to {OUTPUT_FILE}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Scraper failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False
    
    def find_routine_notice(self, soup: BeautifulSoup) -> Optional[tuple]:
        """Find the routine notice on the notice page."""
        # Look for links with "routine" in text
        for link in soup.find_all('a', href=True):
            text = link.get_text().strip()
            href = link.get('href', '')
            
            if 'routine' in text.lower():
                # Make URL absolute
                if not href.startswith(('http://', 'https://')):
                    href = requests.compat.urljoin(NOTICE_URL, href)
                return (text, href)
        
        # If no direct link, search in divs
        for div in soup.find_all(['div', 'article', 'li']):
            text = div.get_text().strip()
            if 'routine' in text.lower():
                link = div.find('a', href=True)
                if link:
                    href = link.get('href')
                    if not href.startswith(('http://', 'https://')):
                        href = requests.compat.urljoin(NOTICE_URL, href)
                    return (link.get_text().strip(), href)
        
        return None
    
    def find_pdf_link(self, soup: BeautifulSoup, base_url: str) -> Optional[str]:
        """Find the PDF download link on the detail page."""
        for link in soup.find_all('a', href=True):
            href = link.get('href', '')
            
            # Look for PDF download link
            if 'download-file' in href.lower() or href.lower().endswith('.pdf'):
                if not href.startswith(('http://', 'https://')):
                    href = requests.compat.urljoin(base_url, href)
                return href
        
        # Look for "Download" or "Attachment" links
        for link in soup.find_all('a', href=True):
            text = link.get_text().strip().lower()
            if 'download' in text or 'attachment' in text or 'pdf' in text:
                href = link.get('href')
                if href and not href.startswith(('http://', 'https://')):
                    href = requests.compat.urljoin(base_url, href)
                return href
        
        return None
    
    def parse_pdf(self, content: bytes) -> Dict[str, List[Dict]]:
        """Parse PDF and extract routine data."""
        sections = {}
        
        try:
            pdf_reader = PyPDF2.PdfReader(BytesIO(content))
            logger.info(f"📄 PDF has {len(pdf_reader.pages)} pages")
            
            # Extract all text from all pages
            all_text = ""
            for page_num, page in enumerate(pdf_reader.pages):
                text = page.extract_text()
                if text:
                    all_text += text + "\n"
                    logger.info(f"📝 Page {page_num + 1}: {len(text)} chars")
            
            if not all_text:
                logger.error("❌ No text extracted")
                return {}
            
            # Parse the text
            sections = self.extract_class_data(all_text)
            return sections
            
        except Exception as e:
            logger.error(f"❌ PDF parsing failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {}
    
    def extract_class_data(self, text: str) -> Dict[str, List[Dict]]:
        """Extract class data from PDF text."""
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
        class_counter = 0
        
        # Pattern for class data: Room Course(Section) Teacher
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
            
            # Skip table references
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
                
                # Determine type
                class_type = 'Theory'
                if 'LAB' in line.upper():
                    class_type = 'Lab'
                
                # Determine time slot based on position
                time_slot = self.get_time_slot_from_position(line, room, time_slots)
                
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
                class_counter += 1
        
        logger.info(f"📊 Extracted {class_counter} classes")
        return sections
    
    def get_time_slot_from_position(self, line: str, room: str, time_slots: List[str]) -> str:
        """Determine time slot based on the position of the room in the line."""
        # Find position of room in the line
        pos = line.find(room)
        if pos == -1:
            return 'TBA'
        
        # Calculate which time slot based on position
        # This is a heuristic
        total_length = len(line)
        if total_length == 0:
            return 'TBA'
        
        ratio = pos / total_length
        
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
