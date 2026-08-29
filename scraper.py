#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - PDF Version
Fetches the CSE routine PDF from the notice page and converts it to JSON.
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
            
            # Create data directory
            DATA_DIR.mkdir(exist_ok=True)
            
            # Step 1: Fetch notice page
            logger.info(f"📡 Fetching notice page: {NOTICE_URL}")
            response = self.session.get(NOTICE_URL, timeout=self.timeout)
            response.raise_for_status()
            html = response.text
            logger.info(f"✅ Page loaded: {len(html)} bytes")
            
            # Step 2: Find the routine notice link
            soup = BeautifulSoup(html, 'html.parser')
            
            # Look for routine notices
            routine_links = []
            for link in soup.find_all('a', href=True):
                text = link.get_text().strip()
                href = link.get('href', '')
                
                # Look for routine-related text
                if 'routine' in text.lower() or 'class routine' in text.lower():
                    # Make URL absolute
                    if not href.startswith(('http://', 'https://')):
                        href = requests.compat.urljoin(NOTICE_URL, href)
                    routine_links.append((text, href))
                    logger.info(f"🔗 Found: {text[:50]}...")
            
            if not routine_links:
                logger.error("❌ No routine notices found on the page")
                return False
            
            # Step 3: Find the PDF download link
            pdf_url = None
            for title, url in routine_links:
                # Go to the notice detail page
                logger.info(f"📄 Checking notice: {title[:50]}...")
                try:
                    detail_response = self.session.get(url, timeout=self.timeout)
                    detail_response.raise_for_status()
                    detail_soup = BeautifulSoup(detail_response.text, 'html.parser')
                    
                    # Look for PDF download link
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
                    logger.warning(f"⚠️ Could not process notice: {e}")
                    continue
            
            if not pdf_url:
                logger.error("❌ Could not find PDF download link")
                return False
            
            # Step 4: Download the PDF
            logger.info(f"⬇️ Downloading PDF: {pdf_url}")
            pdf_response = self.session.get(pdf_url, timeout=self.timeout)
            pdf_response.raise_for_status()
            pdf_content = pdf_response.content
            logger.info(f"✅ Downloaded {len(pdf_content)} bytes")
            
            # Step 5: Parse the PDF
            logger.info("📖 Parsing PDF...")
            sections = self.parse_pdf(pdf_content)
            
            if not sections:
                logger.error("❌ No routine data extracted from PDF")
                return False
            
            # Step 6: Save the data
            output = {
                'updated_at': datetime.now(timezone.utc).isoformat(),
                'source': pdf_url,
                'sections': sections
            }
            
            with open(TEMP_FILE, 'w', encoding='utf-8') as f:
                json.dump(output, f, indent=2, ensure_ascii=False)
            
            TEMP_FILE.rename(OUTPUT_FILE)
            
            total_classes = sum(len(entries) for entries in sections.values())
            logger.info(f"✅ Success! {len(sections)} sections, {total_classes} classes")
            logger.info(f"💾 Saved to: {OUTPUT_FILE}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Scraper failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False
    
    def parse_pdf(self, content: bytes) -> Dict[str, List[Dict]]:
        """Parse the PDF and extract routine data."""
        try:
            pdf_reader = PyPDF2.PdfReader(BytesIO(content))
            logger.info(f"📄 PDF has {len(pdf_reader.pages)} pages")
            
            # Extract text from all pages
            full_text = ""
            for page_num, page in enumerate(pdf_reader.pages):
                text = page.extract_text()
                full_text += text + "\n"
                logger.info(f"📝 Page {page_num + 1}: {len(text)} characters")
            
            # Parse the routine from text
            sections = self.parse_routine_text(full_text)
            return sections
            
        except Exception as e:
            logger.error(f"❌ PDF parsing failed: {e}")
            return {}
    
    def parse_routine_text(self, text: str) -> Dict[str, List[Dict]]:
        """Parse the routine from the extracted text."""
        sections = {}
        lines = text.split('\n')
        
        # Find where the routine data starts
        start_index = 0
        for i, line in enumerate(lines):
            if 'SATURDAY' in line and '08:30-10:00' in line:
                start_index = i
                break
        
        logger.info(f"📍 Routine starts at line {start_index}")
        
        # Process each day's schedule
        days = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']
        current_day = None
        time_slots = ['08:30-10:00', '10:00-11:30', '11:30-01:00', '01:00-02:30', '02:30-04:00', '04:00-05:30']
        
        # Skip header rows
        i = start_index
        
        while i < len(lines):
            line = lines[i].strip()
            
            # Check if this is a day header
            for day in days:
                if day in line.upper() and '08:30' in line:
                    current_day = day.capitalize()
                    logger.info(f"📅 Processing: {current_day}")
                    i += 1
                    break
            
            if not current_day:
                i += 1
                continue
            
            # Check for the end of routine
            if 'SUNDAY' in line.upper() and current_day == 'Saturday':
                # Found next day, we're done with Saturday
                pass
            
            # Parse a line of routine data
            # Format: Room Course Teacher (repeated for each time slot)
            parts = line.split()
            if len(parts) >= 3:
                # Try to identify room, course, teacher patterns
                entry = self.parse_routine_line(parts, current_day, time_slots)
                if entry:
                    section = entry.get('section', 'UNKNOWN')
                    if section not in sections:
                        sections[section] = []
                    sections[section].append({
                        'day': entry.get('day', ''),
                        'time': entry.get('time', ''),
                        'course': entry.get('course', ''),
                        'teacher': entry.get('teacher', ''),
                        'room': entry.get('room', ''),
                        'type': entry.get('type', 'Theory')
                    })
            
            i += 1
        
        return sections
    
    def parse_routine_line(self, parts: List[str], day: str, time_slots: List[str]) -> Optional[Dict]:
        """Parse a single line of routine data."""
        try:
            # Look for room number pattern (KT-XXX, G1-XXX, ANX1-XXX, etc.)
            room_pattern = r'[A-Z0-9\-]+'
            course_pattern = r'[A-Z]{3,4}\d{3,4}'
            section_pattern = r'\([^)]+\)'
            
            text = ' '.join(parts)
            
            # Find room
            room_match = re.search(r'\b(KT-\d+|G1-\d+|ANX1-\d+|SH-\d+|CTBA-\d+)\b', text)
            room = room_match.group(0) if room_match else ''
            
            # Find course code
            course_match = re.search(r'\b([A-Z]{3,4}\s*\d{3,4})\b', text)
            course = course_match.group(0).replace(' ', '') if course_match else ''
            
            # Find section in parentheses
            section_match = re.search(r'\(([^)]+)\)', text)
            section = section_match.group(1).strip() if section_match else ''
            
            # Find teacher initials (pattern like "AS", "FNN", etc.)
            # Teacher initials are usually 2-4 uppercase letters
            # Remove room, course, section and find remaining uppercase patterns
            clean_text = text
            if room:
                clean_text = clean_text.replace(room, '')
            if course:
                clean_text = clean_text.replace(course, '')
            if section_match:
                clean_text = clean_text.replace(section_match.group(0), '')
            
            # Extract teacher initials
            teacher_match = re.search(r'\b([A-Z]{2,4})\b', clean_text)
            teacher = teacher_match.group(0) if teacher_match else ''
            
            if not course or not section:
                return None
            
            # Determine class type
            class_type = 'Theory'
            if 'LAB' in text.upper() or 'COM LAB' in text.upper():
                class_type = 'Lab'
            
            # Clean section name
            section = section.replace(' ', '_').upper()
            section = re.sub(r'[^A-Z0-9_]', '', section)
            
            # Clean course code
            course = course.replace(' ', '')
            
            return {
                'section': section,
                'day': day,
                'time': 'TBA',  # Will be determined by position
                'course': course,
                'teacher': teacher if teacher else 'TBA',
                'room': room if room else 'TBA',
                'type': class_type
            }
            
        except Exception as e:
            logger.warning(f"⚠️ Could not parse line: {' '.join(parts)[:50]}... Error: {e}")
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
