#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - DEBUG VERSION
This will log everything to help identify the issue.
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
import pandas as pd

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
# LOGGING - VERY DETAILED
# ============================================================

logging.basicConfig(
    level=logging.DEBUG,  # Changed to DEBUG for more details
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
        """Main scraping method with detailed debugging."""
        try:
            logger.info("=" * 60)
            logger.info("STARTING SCRAPER - DEBUG MODE")
            logger.info("=" * 60)
            
            # Step 1: Create data directory
            DATA_DIR.mkdir(exist_ok=True)
            logger.info(f"✅ Data directory: {DATA_DIR}")
            
            # Step 2: Fetch notice page
            logger.info(f"📡 Fetching: {NOTICE_URL}")
            try:
                response = self.session.get(NOTICE_URL, timeout=self.timeout)
                response.raise_for_status()
                logger.info(f"✅ Status: {response.status_code}")
                logger.info(f"✅ Content-Type: {response.headers.get('content-type')}")
                html = response.text
                logger.info(f"✅ Page size: {len(html)} bytes")
            except Exception as e:
                logger.error(f"❌ Failed to fetch page: {e}")
                return False
            
            # Step 3: Parse HTML and find routine links
            logger.info("🔍 Searching for routine notices...")
            soup = BeautifulSoup(html, 'html.parser')
            
            # Find all links
            all_links = soup.find_all('a', href=True)
            logger.info(f"📊 Found {len(all_links)} total links")
            
            # Look for routine links
            routine_links = []
            for link in all_links:
                text = link.get_text().strip()
                href = link.get('href', '')
                
                # Debug: Log all links with routine in them
                if 'routine' in text.lower() or 'routine' in href.lower():
                    logger.info(f"🔗 Potential routine link: '{text[:50]}' -> {href}")
                    routine_links.append((text, href))
            
            if not routine_links:
                logger.error("❌ No routine links found on the page")
                # Save HTML for debugging
                debug_file = DATA_DIR / "debug_page.html"
                debug_file.write_text(html)
                logger.info(f"💾 Saved HTML to {debug_file} for debugging")
                return False
            
            # Step 4: Process each routine link
            for title, href in routine_links:
                logger.info(f"📄 Processing: {title}")
                
                # Make URL absolute
                if not href.startswith(('http://', 'https://')):
                    href = requests.compat.urljoin(NOTICE_URL, href)
                logger.info(f"🔗 Full URL: {href}")
                
                # Check if it's a file
                if any(ext in href.lower() for ext in ['.pdf', '.xlsx', '.xls']):
                    logger.info(f"📁 Found file: {href}")
                    
                    # Download file
                    try:
                        logger.info(f"⬇️ Downloading: {href}")
                        file_response = self.session.get(href, timeout=self.timeout)
                        file_response.raise_for_status()
                        content = file_response.content
                        logger.info(f"✅ Downloaded {len(content)} bytes")
                        
                        # Parse based on file type
                        if '.xlsx' in href.lower() or '.xls' in href.lower():
                            logger.info("📊 Parsing Excel file...")
                            sections = self.parse_excel(content)
                            if sections:
                                logger.info(f"✅ Found {len(sections)} sections")
                                # Save output
                                output = {
                                    'updated_at': datetime.now(timezone.utc).isoformat(),
                                    'source': href,
                                    'sections': sections
                                }
                                
                                with open(TEMP_FILE, 'w', encoding='utf-8') as f:
                                    json.dump(output, f, indent=2, ensure_ascii=False)
                                
                                TEMP_FILE.rename(OUTPUT_FILE)
                                logger.info(f"✅ Saved to {OUTPUT_FILE}")
                                return True
                            else:
                                logger.warning("⚠️ No sections extracted from Excel")
                        else:
                            logger.warning(f"⚠️ Unsupported file type: {href}")
                            
                    except Exception as e:
                        logger.error(f"❌ Failed to download/parse: {e}")
                        continue
                else:
                    logger.info(f"ℹ️ Not a file link: {href}")
            
            logger.error("❌ No valid routine file found or parsed")
            return False
            
        except Exception as e:
            logger.error(f"❌ Scraper failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False
    
    def parse_excel(self, content: bytes) -> Dict[str, List[Dict]]:
        """Parse Excel file with detailed debugging."""
        try:
            # Save to temp file
            temp_file = DATA_DIR / "temp_routine.xlsx"
            temp_file.write_bytes(content)
            logger.info(f"💾 Saved temp Excel: {temp_file}")
            
            # Try to read Excel
            logger.info("📖 Reading Excel file...")
            try:
                df = pd.read_excel(temp_file, engine='openpyxl')
                logger.info("✅ Read with openpyxl")
            except Exception as e:
                logger.warning(f"openpyxl failed: {e}, trying xlrd")
                try:
                    df = pd.read_excel(temp_file, engine='xlrd')
                    logger.info("✅ Read with xlrd")
                except Exception as e2:
                    logger.warning(f"xlrd failed: {e2}, trying default")
                    df = pd.read_excel(temp_file)
                    logger.info("✅ Read with default engine")
            
            # Clean up
            temp_file.unlink()
            
            if df is None or df.empty:
                logger.error("❌ Excel file is empty or unreadable")
                return {}
            
            logger.info(f"📊 Excel: {len(df)} rows, {len(df.columns)} columns")
            logger.info(f"📋 Columns: {list(df.columns)}")
            
            # Show sample data
            logger.info("📝 Sample data (first 3 rows):")
            for i in range(min(3, len(df))):
                row_data = {}
                for col in df.columns:
                    val = df.iloc[i][col]
                    if pd.notna(val):
                        row_data[col] = str(val)[:50]
                logger.info(f"  Row {i}: {row_data}")
            
            # Extract data
            sections = self.extract_from_dataframe(df)
            logger.info(f"📊 Extracted {len(sections)} sections")
            
            return sections
            
        except Exception as e:
            logger.error(f"❌ Excel parsing failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {}
    
    def extract_from_dataframe(self, df: pd.DataFrame) -> Dict[str, List[Dict]]:
        """Extract routine data from DataFrame."""
        sections = {}
        
        # Try to find columns by name
        column_mapping = {}
        for idx, col in enumerate(df.columns):
            col_lower = str(col).lower().strip()
            
            if 'section' in col_lower or 'sec' in col_lower:
                column_mapping['section'] = idx
                logger.info(f"📍 Found section column: '{col}' (index {idx})")
            elif 'day' in col_lower:
                column_mapping['day'] = idx
                logger.info(f"📍 Found day column: '{col}' (index {idx})")
            elif 'time' in col_lower:
                column_mapping['time'] = idx
                logger.info(f"📍 Found time column: '{col}' (index {idx})")
            elif 'course' in col_lower or 'subject' in col_lower or 'code' in col_lower:
                column_mapping['course'] = idx
                logger.info(f"📍 Found course column: '{col}' (index {idx})")
            elif 'teacher' in col_lower or 'instructor' in col_lower:
                column_mapping['teacher'] = idx
                logger.info(f"📍 Found teacher column: '{col}' (index {idx})")
            elif 'room' in col_lower or 'venue' in col_lower:
                column_mapping['room'] = idx
                logger.info(f"📍 Found room column: '{col}' (index {idx})")
        
        # If we found section, day, and course, extract data
        if 'section' in column_mapping and 'day' in column_mapping and 'course' in column_mapping:
            logger.info("✅ Found required columns, extracting data...")
            
            for idx, row in df.iterrows():
                try:
                    section = str(row.iloc[column_mapping['section']]).strip()
                    if not section or section.lower() in ['nan', 'none', '']:
                        continue
                    
                    # Clean section
                    section = section.upper().replace(' ', '_')
                    section = re.sub(r'[^A-Z0-9_]', '', section)
                    
                    if not section:
                        continue
                    
                    # Get other fields
                    day = str(row.iloc[column_mapping.get('day', 0)]).strip()
                    time = str(row.iloc[column_mapping.get('time', 0)]).strip() if 'time' in column_mapping else ''
                    course = str(row.iloc[column_mapping.get('course', 0)]).strip()
                    teacher = str(row.iloc[column_mapping.get('teacher', 0)]).strip() if 'teacher' in column_mapping else ''
                    room = str(row.iloc[column_mapping.get('room', 0)]).strip() if 'room' in column_mapping else ''
                    
                    # Skip if missing essential data
                    if not day or not course:
                        continue
                    
                    # Clean day
                    day_map = {
                        'sat': 'Saturday', 'saturday': 'Saturday',
                        'sun': 'Sunday', 'sunday': 'Sunday',
                        'mon': 'Monday', 'monday': 'Monday',
                        'tue': 'Tuesday', 'tuesday': 'Tuesday',
                        'wed': 'Wednesday', 'wednesday': 'Wednesday',
                        'thu': 'Thursday', 'thursday': 'Thursday',
                        'fri': 'Friday', 'friday': 'Friday'
                    }
                    day = day_map.get(day.lower(), day)
                    
                    # Determine type
                    class_type = 'Theory'
                    if 'lab' in course.lower() or 'practical' in course.lower():
                        class_type = 'Lab'
                    
                    # Add to sections
                    if section not in sections:
                        sections[section] = []
                    
                    sections[section].append({
                        'day': day,
                        'time': time if time else 'TBA',
                        'course': course,
                        'teacher': teacher if teacher else 'TBA',
                        'room': room if room else 'TBA',
                        'type': class_type
                    })
                    
                except Exception as e:
                    logger.warning(f"Error processing row {idx}: {e}")
                    continue
            
            logger.info(f"✅ Extracted {sum(len(entries) for entries in sections.values())} classes")
        else:
            logger.warning("❌ Could not find required columns")
            logger.info(f"Available columns: {list(df.columns)}")
            
            # Try position-based extraction as fallback
            logger.info("🔄 Trying position-based extraction...")
            sections = self.extract_by_position(df)
        
        return sections
    
    def extract_by_position(self, df: pd.DataFrame) -> Dict[str, List[Dict]]:
        """Fallback extraction by column position."""
        sections = {}
        
        # Try to find header row
        start_row = 0
        for i in range(min(5, len(df))):
            row = df.iloc[i]
            row_text = ' '.join([str(val).lower() for val in row if pd.notna(val)])
            if 'section' in row_text or 'day' in row_text:
                start_row = i + 1
                logger.info(f"Found header at row {i}, starting from row {start_row}")
                break
        
        # Assume columns: section, day, time, course, teacher, room
        for idx in range(start_row, len(df)):
            try:
                row = df.iloc[idx]
                
                # Get section (column 0)
                section = str(row.iloc[0]).strip() if len(row) > 0 else ''
                if not section or section.lower() in ['nan', 'none', '']:
                    continue
                
                section = section.upper().replace(' ', '_')
                section = re.sub(r'[^A-Z0-9_]', '', section)
                
                if not section:
                    continue
                
                # Get other fields (adjust indices as needed)
                day = str(row.iloc[1]).strip() if len(row) > 1 else ''
                time = str(row.iloc[2]).strip() if len(row) > 2 else ''
                course = str(row.iloc[3]).strip() if len(row) > 3 else ''
                teacher = str(row.iloc[4]).strip() if len(row) > 4 else ''
                room = str(row.iloc[5]).strip() if len(row) > 5 else ''
                
                if not day or not course:
                    continue
                
                # Clean day
                day_map = {
                    'sat': 'Saturday', 'saturday': 'Saturday',
                    'sun': 'Sunday', 'sunday': 'Sunday',
                    'mon': 'Monday', 'monday': 'Monday',
                    'tue': 'Tuesday', 'tuesday': 'Tuesday',
                    'wed': 'Wednesday', 'wednesday': 'Wednesday',
                    'thu': 'Thursday', 'thursday': 'Thursday',
                    'fri': 'Friday', 'friday': 'Friday'
                }
                day = day_map.get(day.lower(), day)
                
                # Determine type
                class_type = 'Theory'
                if 'lab' in course.lower() or 'practical' in course.lower():
                    class_type = 'Lab'
                
                if section not in sections:
                    sections[section] = []
                
                sections[section].append({
                    'day': day,
                    'time': time if time else 'TBA',
                    'course': course,
                    'teacher': teacher if teacher else 'TBA',
                    'room': room if room else 'TBA',
                    'type': class_type
                })
                
            except Exception as e:
                continue
        
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
            logger.info("⚠️ Scraping failed but keeping existing routine.json")
            sys.exit(0)
        else:
            logger.error("❌ Scraping failed and no existing data")
            sys.exit(1)


if __name__ == "__main__":
    main()
