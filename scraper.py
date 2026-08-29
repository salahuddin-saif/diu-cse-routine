#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - PDF Table Extractor
Extracts routine data from PDF using table structure detection.
"""

import json
import os
import sys
import logging
import re
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple
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
                return False
            
            # Step 2: Download PDF
            logger.info(f"⬇️ Downloading PDF...")
            pdf_response = self.session.get(pdf_url, timeout=self.timeout)
            pdf_response.raise_for_status()
            pdf_content = pdf_response.content
            logger.info(f"✅ Downloaded {len(pdf_content)} bytes")
            
            # Step 3: Parse PDF
            logger.info("📖 Parsing PDF...")
            sections = self.parse_pdf(pdf_content)
            
            if not sections:
                logger.error("❌ No data extracted from PDF")
                return False
            
            # Step 4: Save
            output = {
                'updated_at': datetime.now(timezone.utc).isoformat(),
                'source': pdf_url,
                'sections': sections
            }
            
            with open(TEMP_FILE, 'w', encoding='utf-8') as f:
                json.dump(output, f, indent=2, ensure_ascii=False)
            
            TEMP_FILE.rename(OUTPUT_FILE)
            
            total = sum(len(entries) for entries in sections.values())
            logger.info(f"✅ Success! {len(sections)} sections, {total} classes")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False
    
    def find_pdf_url(self) -> Optional[str]:
        """Find the PDF download URL from the notice page."""
        try:
            logger.info(f"📡 Fetching notice page: {NOTICE_URL}")
            response = self.session.get(NOTICE_URL, timeout=self.timeout)
            response.raise_for_status()
            html = response.text
            soup = BeautifulSoup(html, 'html.parser')
            
            # Find routine notices
            routine_links = []
            for link in soup.find_all('a', href=True):
                text = link.get_text().strip()
                href = link.get('href', '')
                
                if 'routine' in text.lower() or 'class routine' in text.lower():
                    if not href.startswith(('http://', 'https://')):
                        href = requests.compat.urljoin(NOTICE_URL, href)
                    routine_links.append((text, href))
                    logger.info(f"🔗 Found routine: {text[:50]}...")
            
            if not routine_links:
                logger.error("❌ No routine notices found")
                return None
            
            # Check each notice for PDF
            for title, url in routine_links:
                logger.info(f"📄 Checking: {title[:50]}...")
                try:
                    detail_response = self.session.get(url, timeout=self.timeout)
                    detail_response.raise_for_status()
                    detail_soup = BeautifulSoup(detail_response.text, 'html.parser')
                    
                    for link in detail_soup.find_all('a', href=True):
                        href = link.get('href', '')
                        if 'download-file' in href or '.pdf' in href.lower():
                            if not href.startswith(('http://', 'https://')):
                                href = requests.compat.urljoin(url, href)
                            logger.info(f"✅ Found PDF: {href}")
                            return href
                except Exception as e:
                    logger.warning(f"⚠️ Error checking notice: {e}")
            
            logger.error("❌ Could not find PDF")
            return None
            
        except Exception as e:
            logger.error(f"❌ Failed to find PDF: {e}")
            return None
    
    def parse_pdf(self, content: bytes) -> Dict[str, List[Dict]]:
        """Parse PDF and extract routine data."""
        try:
            pdf_reader = PyPDF2.PdfReader(BytesIO(content))
            logger.info(f"📄 PDF has {len(pdf_reader.pages)} pages")
            
            # Extract all text
            full_text = ""
            for page_num, page in enumerate(pdf_reader.pages):
                text = page.extract_text()
                if text:
                    full_text += text + "\n"
                    logger.info(f"📝 Page {page_num + 1}: {len(text)} chars")
            
            # Parse the text
            sections = self.extract_from_text(full_text)
            return sections
            
        except Exception as e:
            logger.error(f"❌ PDF parsing failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {}
    
    def extract_from_text(self, text: str) -> Dict[str, List[Dict]]:
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
        
        # Days
        days = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY']
        
        current_day = None
        i = 0
        
        while i < len(lines):
            line = lines[i].strip()
            
            # Check for day
            for day in days:
                if day in line.upper() and any(slot in line for slot in time_slots):
                    current_day = day.capitalize()
                    logger.info(f"📅 Found day: {current_day}")
                    i += 1
                    break
            
            if not current_day:
                i += 1
                continue
            
            # Check if this is a header or table reference
            if 'TABLE' in line.upper() or 'PAGE' in line.upper():
                i += 1
                continue
            
            # Parse class data
            # Pattern: KT-201 CSE315(66_E) AS
            pattern = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'
            matches = re.findall(pattern, line)
            
            if matches:
                # Process each match
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
                    
                    # Determine time slot based on position in line
                    # This is approximate - we'll use the position of the match
                    time_slot = 'TBA'
                    # Try to find which time slot this belongs to
                    # If we're processing sequentially, we can track the index
                    
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
            
            i += 1
        
        return sections


def main():
    """Main entry point."""
    scraper = DIURoutineScraper()
    has_existing = OUTPUT_FILE.exists()
    
    if scraper.scrape():
        logger.info("✅ Scraping completed successfully")
        sys.exit(0)
    else:
        if has_existing:
            logger.info("⚠️ Keeping existing routine.json")
            sys.exit(0)
        else:
            logger.error("❌ Scraping failed and no existing data")
            sys.exit(1)


if __name__ == "__main__":
    main()
