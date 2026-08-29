#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - PDF Parser for Complex Table Structure
Parses the DIU routine PDF with multiple columns per row.
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
            
            # Step 1: Fetch notice page
            logger.info(f"📡 Fetching notice page: {NOTICE_URL}")
            response = self.session.get(NOTICE_URL, timeout=self.timeout)
            response.raise_for_status()
            html = response.text
            logger.info(f"✅ Page loaded: {len(html)} bytes")
            
            # Step 2: Find the routine notice
            soup = BeautifulSoup(html, 'html.parser')
            routine_links = []
            
            for link in soup.find_all('a', href=True):
                text = link.get_text().strip()
                href = link.get('href', '')
                
                if 'routine' in text.lower() or 'class routine' in text.lower():
                    if not href.startswith(('http://', 'https://')):
                        href = requests.compat.urljoin(NOTICE_URL, href)
                    routine_links.append((text, href))
                    logger.info(f"🔗 Found: {text[:50]}...")
            
            if not routine_links:
                logger.error("❌ No routine notices found")
                return False
            
            # Step 3: Find PDF download link
            pdf_url = None
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
                            pdf_url = href
                            logger.info(f"✅ Found PDF: {href}")
                            break
                    
                    if pdf_url:
                        break
                except Exception as e:
                    logger.warning(f"⚠️ Error: {e}")
            
            if not pdf_url:
                logger.error("❌ Could not find PDF")
                return False
            
            # Step 4: Download PDF
            logger.info(f"⬇️ Downloading PDF...")
            pdf_response = self.session.get(pdf_url, timeout=self.timeout)
            pdf_response.raise_for_status()
            pdf_content = pdf_response.content
            logger.info(f"✅ Downloaded {len(pdf_content)} bytes")
            
            # Step 5: Parse PDF
            logger.info("📖 Parsing PDF...")
            sections = self.parse_pdf(pdf_content)
            
            if not sections:
                logger.error("❌ No data extracted")
                return False
            
            # Step 6: Save
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
    
    def parse_pdf(self, content: bytes) -> Dict[str, List[Dict]]:
        """Parse the PDF and extract routine data."""
        try:
            pdf_reader = PyPDF2.PdfReader(BytesIO(content))
            logger.info(f"📄 PDF has {len(pdf_reader.pages)} pages")
            
            # Extract text from relevant pages (skip the table of contents pages)
            full_text = ""
            for page_num in range(2, min(8, len(pdf_reader.pages))):
                page = pdf_reader.pages[page_num]
                text = page.extract_text()
                full_text += text + "\n"
                logger.info(f"📝 Page {page_num + 1}: {len(text)} chars")
            
            # Parse the routine
            sections = self.parse_routine_table(full_text)
            return sections
            
        except Exception as e:
            logger.error(f"❌ PDF parsing failed: {e}")
            return {}
    
    def parse_routine_table(self, text: str) -> Dict[str, List[Dict]]:
        """Parse the routine table from extracted text."""
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
        
        # Days to look for
        days = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY']
        current_day = None
        
        # Process line by line
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            
            # Check for day header
            for day in days:
                if day in line.upper() and '08:30' in line:
                    current_day = day.capitalize()
                    logger.info(f"📅 Processing: {current_day}")
                    i += 1
                    break
            
            if not current_day:
                i += 1
                continue
            
            # Check if we're at the next day or end
            if current_day and any(day in line.upper() for day in days) and '08:30' not in line:
                # Check if this is just a table header reference
                if 'TABLE' not in line.upper():
                    current_day = None
                    i += 1
                    continue
            
            # Parse class entries
            entries = self.parse_class_entries(line, current_day, time_slots)
            if entries:
                for entry in entries:
                    if entry:
                        section = entry.get('section', '')
                        if section:
                            if section not in sections:
                                sections[section] = []
                            sections[section].append(entry)
            
            i += 1
        
        return sections
    
    def parse_class_entries(self, line: str, day: str, time_slots: List[str]) -> List[Dict]:
        """Parse class entries from a line of text."""
        entries = []
        
        # Pattern for class data: Room Course(Teacher)
        # Example: "KT-201 CSE315(66_E) AS"
        pattern = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'
        
        # Find all matches in the line
        matches = re.findall(pattern, line)
        
        if not matches:
            return entries
        
        # Group matches into sets of 6 (one per time slot)
        for i in range(0, len(matches), 6):
            slot_entries = matches[i:i+6]
            for j, match in enumerate(slot_entries):
                if j < len(time_slots):
                    room, course, section, teacher = match
                    
                    # Determine class type
                    class_type = 'Theory'
                    if 'LAB' in line.upper() or 'COM LAB' in line.upper():
                        class_type = 'Lab'
                    
                    # Clean section
                    section = section.replace(' ', '_').upper()
                    section = re.sub(r'[^A-Z0-9_]', '', section)
                    
                    entry = {
                        'day': day,
                        'time': time_slots[j],
                        'course': course,
                        'section': section,
                        'teacher': teacher,
                        'room': room,
                        'type': class_type
                    }
                    entries.append(entry)
        
        return entries


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
