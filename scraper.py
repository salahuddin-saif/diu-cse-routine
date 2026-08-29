#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - COMPLETE WORKING VERSION
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
PDF_URL = "https://webbackend.daffodilvarsity.edu.bd/download-file/4148"

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
        
        # Try to get PDF from notice page first
        pdf_url = get_pdf_from_notice()
        if not pdf_url:
            logger.warning("Using fallback PDF URL")
            pdf_url = PDF_URL
        
        logger.info(f"📄 PDF URL: {pdf_url}")
        
        # Download PDF
        response = requests.get(pdf_url, timeout=30)
        response.raise_for_status()
        logger.info(f"✅ Downloaded {len(response.content)} bytes")
        
        # Parse PDF
        sections = parse_pdf(response.content)
        
        if not sections:
            logger.error("❌ No data extracted")
            sys.exit(1)
        
        # Save data
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
        sys.exit(1)


def get_pdf_from_notice():
    """Get PDF URL from notice page."""
    try:
        response = requests.get(NOTICE_URL, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        
        for link in soup.find_all('a', href=True):
            text = link.get_text().strip().lower()
            href = link.get('href', '')
            
            if 'routine' in text:
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
                        return dl_href
        return None
    except:
        return None


def parse_pdf(content):
    """Parse PDF and extract routine data."""
    sections = {}
    
    try:
        pdf_reader = PyPDF2.PdfReader(BytesIO(content))
        
        # Extract text
        all_text = ""
        for page in pdf_reader.pages:
            text = page.extract_text()
            if text:
                all_text += text + "\n"
        
        if not all_text:
            return {}
        
        # Parse text
        lines = all_text.split('\n')
        time_slots = ['08:30-10:00', '10:00-11:30', '11:30-01:00', 
                      '01:00-02:30', '02:30-04:00', '04:00-05:30']
        current_day = None
        pattern = r'([A-Z0-9\-]+)\s+([A-Z]{3,4}\d{3,4})\(([^)]+)\)\s+([A-Z0-9_]+)'
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Check for day
            day_match = re.search(r'(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY)', line.upper())
            if day_match and any(slot in line for slot in time_slots):
                current_day = day_match.group(1).capitalize()
                continue
            
            if not current_day or 'TABLE' in line.upper():
                continue
            
            # Find classes
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
                    time_slot = time_slots[0]
                elif ratio < 0.35:
                    time_slot = time_slots[1]
                elif ratio < 0.5:
                    time_slot = time_slots[2]
                elif ratio < 0.65:
                    time_slot = time_slots[3]
                elif ratio < 0.8:
                    time_slot = time_slots[4]
                else:
                    time_slot = time_slots[5]
                
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
        
        return sections
        
    except Exception as e:
        logger.error(f"PDF parsing error: {e}")
        return {}


if __name__ == "__main__":
    main()
