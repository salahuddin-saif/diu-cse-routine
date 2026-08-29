#!/usr/bin/env python3
"""
DIU CSE Routine Scraper - UPDATED FOR ACTUAL DIU WEBSITE
Fetches the official DIU CSE routine and saves it as JSON for GitHub Pages.
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
# CONFIGURATION - CORRECT URL
# ============================================================

# The actual DIU CSE notice page
NOTICE_URL = "https://webbackend.daffodilvarsity.edu.bd/department/cse/notice"

# Keywords to find routine notices
ROUTINE_KEYWORDS = [
    'routine', 'class routine', 'cse routine', 'section routine',
    'final examination routine', 'exam routine', 'midterm routine'
]

# Keywords to filter out (not routines we want)
EXCLUDE_KEYWORDS = [
    'fees', 'payment', 'tuition', 'admission', 'result',
    'assignment', 'project', 'thesis', 'seminar', 'workshop'
]

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
    """Scraper for DIU CSE routine from the correct notice page."""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        })
        self.timeout = 30
    
    def fetch_notice_page(self) -> Optional[str]:
        """Fetch the CSE notice page."""
        try:
            logger.info(f"Fetching notice page: {NOTICE_URL}")
            response = self.session.get(NOTICE_URL, timeout=self.timeout)
            response.raise_for_status()
            
            # Check if it's HTML
            if 'text/html' in response.headers.get('content-type', ''):
                logger.info(f"Successfully fetched page (status: {response.status_code})")
                return response.text
            else:
                logger.warning(f"Unexpected content-type: {response.headers.get('content-type')}")
                return response.text
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to fetch notice page: {e}")
            return None
    
    def find_routine_notice(self, html: str) -> Optional[Tuple[str, str]]:
        """
        Find the latest CSE routine notice.
        Returns tuple of (notice_title, file_url) or None.
        """
        soup = BeautifulSoup(html, 'html.parser')
        
        # Look for all links
        all_links = soup.find_all('a', href=True)
        
        # First, try to find routine notices
        routine_links = []
        for link in all_links:
            text = link.get_text().strip()
            href = link.get('href', '')
            
            # Check if this is a routine notice
            is_routine = False
            text_lower = text.lower()
            for keyword in ROUTINE_KEYWORDS:
                if keyword in text_lower:
                    is_routine = True
                    break
            
            if not is_routine:
                continue
            
            # Skip excluded keywords
            skip = False
            for exclude in EXCLUDE_KEYWORDS:
                if exclude in text_lower:
                    skip = True
                    break
            
            if skip:
                continue
            
            # Make sure it has a file link
            if not href or href == '#':
                continue
            
            # Make URL absolute if needed
            if not href.startswith(('http://', 'https://')):
                href = requests.compat.urljoin(NOTICE_URL, href)
            
            routine_links.append((text, href))
            logger.info(f"Found routine: {text[:50]}...")
        
        # If we found routine links, return the first one
        if routine_links:
            return routine_links[0]
        
        # If no direct routine links found, search in the content
        logger.warning("No direct routine links found, searching content...")
        return self.find_routine_in_content(soup)
    
    def find_routine_in_content(self, soup: BeautifulSoup) -> Optional[Tuple[str, str]]:
        """Search for routine links within text content."""
        # Look for divs containing routine text
        routine_divs = []
        
        for div in soup.find_all(['div', 'article', 'section', 'li']):
            text = div.get_text().strip().lower()
            
            # Check if this div contains routine text
            is_routine = False
            for keyword in ROUTINE_KEYWORDS:
                if keyword in text:
                    is_routine = True
                    break
            
            if not is_routine:
                continue
            
            # Check for exclusion keywords
            skip = False
            for exclude in EXCLUDE_KEYWORDS:
                if exclude in text:
                    skip = True
                    break
            
            if skip:
                continue
            
            routine_divs.append(div)
        
        # Check each routine div for file links
        for div in routine_divs:
            # Find all links in this div
            links = div.find_all('a', href=True)
            for link in links:
                href = link.get('href', '')
                if href and href != '#':
                    # Check if it's a file download
                    if any(ext in href.lower() for ext in ['.pdf', '.xlsx', '.xls', '.docx']):
                        if not href.startswith(('http://', 'https://')):
                            href = requests.compat.urljoin(NOTICE_URL, href)
                        title = link.get_text().strip() or "Routine Download"
                        logger.info(f"Found routine file in content: {title}")
                        return (title, href)
        
        return None
    
    def download_file(self, url: str) -> Optional[bytes]:
        """Download a file from URL."""
        try:
            logger.info(f"Downloading file: {url}")
            response = self.session.get(url, timeout=self.timeout)
            response.raise_for_status()
            logger.info(f"Downloaded {len(response.content)} bytes")
            return response.content
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to download file: {e}")
            return None
    
    def parse_excel_file(self, content: bytes) -> Dict[str, List[Dict]]:
        """Parse Excel file containing routine data."""
        try:
            # Save to temporary file
            temp_file = DATA_DIR / "temp_routine.xlsx"
            temp_file.write_bytes(content)
            
            # Try to read with different engines
            df = None
            try:
                df = pd.read_excel(temp_file, engine='openpyxl')
            except Exception as e:
                logger.warning(f"openpyxl failed: {e}, trying xlrd")
                try:
                    df = pd.read_excel(temp_file, engine='xlrd')
                except Exception as e2:
                    logger.warning(f"xlrd failed: {e2}, trying default")
                    df = pd.read_excel(temp_file)
            
            # Clean up
            temp_file.unlink()
            
            if df is None or df.empty:
                logger.error("Excel file is empty or unreadable")
                return {}
            
            logger.info(f"Read Excel: {len(df)} rows, {len(df.columns)} columns")
            logger.info(f"Columns found: {list(df.columns)}")
            
            # Print first few rows for debugging
            logger.info("First 5 rows of data:")
            for i in range(min(5, len(df))):
                row_data = {}
                for col in df.columns:
                    val = df.iloc[i][col]
                    if pd.notna(val):
                        row_data[col] = str(val)[:50]
                logger.info(f"Row {i}: {row_data}")
            
            # Try to extract routine data
            return self.extract_routine_from_df(df)
            
        except Exception as e:
            logger.error(f"Failed to parse Excel: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {}
    
    def extract_routine_from_df(self, df: pd.DataFrame) -> Dict[str, List[Dict]]:
        """
        Extract routine data from DataFrame.
        This is flexible to handle different Excel structures.
        """
        sections = {}
        
        # First, try to find columns by name
        col_mapping = self.map_columns(df)
        
        if col_mapping:
            logger.info(f"Column mapping found: {col_mapping}")
            sections = self.extract_with_mapping(df, col_mapping)
        else:
            logger.warning("No column mapping found, trying position-based extraction")
            sections = self.extract_by_position(df)
        
        return sections
    
    def map_columns(self, df: pd.DataFrame) -> Dict[str, int]:
        """Map column names to indices."""
        mapping = {}
        
        # Keywords to look for in column names
        keywords = {
            'section': ['section', 'sec', 'group', 'batch', 'class'],
            'day': ['day', 'weekday', 'date', 'days'],
            'time': ['time', 'period', 'schedule', 'timing'],
            'course': ['course', 'subject', 'code', 'cse', 'subject code'],
            'teacher': ['teacher', 'instructor', 'faculty', 'professor'],
            'room': ['room', 'venue', 'location', 'classroom'],
            'type': ['type', 'category', 'class type']
        }
        
        for idx, col in enumerate(df.columns):
            col_lower = str(col).lower().strip()
            
            for target, words in keywords.items():
                if target in mapping:
                    continue
                for word in words:
                    if word in col_lower:
                        mapping[target] = idx
                        logger.debug(f"Mapped '{target}' to column '{col}' (index {idx})")
                        break
        
        return mapping
    
    def extract_with_mapping(self, df: pd.DataFrame, mapping: Dict[str, int]) -> Dict[str, List[Dict]]:
        """Extract data using column mapping."""
        sections = {}
        
        # Check if we have the minimum required columns
        required = ['section', 'day', 'course']
        if not all(req in mapping for req in required):
            logger.warning("Missing required columns for extraction")
            return {}
        
        for idx, row in df.iterrows():
            try:
                # Get section
                section = self.get_cell_value(row, mapping.get('section'))
                if not section:
                    continue
                
                section = self.normalize_section(section)
                
                # Get other fields
                day = self.get_cell_value(row, mapping.get('day'))
                time = self.get_cell_value(row, mapping.get('time'))
                course = self.get_cell_value(row, mapping.get('course'))
                teacher = self.get_cell_value(row, mapping.get('teacher'))
                room = self.get_cell_value(row, mapping.get('room'))
                class_type = self.get_cell_value(row, mapping.get('type'))
                
                # Skip if missing essential data
                if not day or not course:
                    continue
                
                # Clean values
                day = self.clean_day(day)
                course = self.clean_course(course)
                class_type = self.clean_type(class_type)
                
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
        
        return sections
    
    def extract_by_position(self, df: pd.DataFrame) -> Dict[str, List[Dict]]:
        """Extract data by position (fallback)."""
        sections = {}
        
        # Try to find section column
        section_col = None
        for i, col in enumerate(df.columns):
            col_lower = str(col).lower()
            if any(kw in col_lower for kw in ['section', 'sec', 'group']):
                section_col = i
                break
        
        if section_col is None:
            section_col = 0
        
        # Try to find header row
        start_row = 0
        for i in range(min(10, len(df))):
            row = df.iloc[i]
            if any('section' in str(val).lower() for val in row):
                start_row = i + 1
                break
        
        for idx in range(start_row, len(df)):
            try:
                row = df.iloc[idx]
                
                # Get section
                section = self.get_cell_value(row, section_col)
                if not section:
                    continue
                
                section = self.normalize_section(section)
                
                # Get other fields (adjust indices as needed)
                day = self.get_cell_value(row, section_col + 1)
                time = self.get_cell_value(row, section_col + 2)
                course = self.get_cell_value(row, section_col + 3)
                teacher = self.get_cell_value(row, section_col + 4)
                room = self.get_cell_value(row, section_col + 5)
                class_type = self.get_cell_value(row, section_col + 6)
                
                if not day or not course:
                    continue
                
                day = self.clean_day(day)
                course = self.clean_course(course)
                class_type = self.clean_type(class_type)
                
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
    
    def get_cell_value(self, row, idx):
        """Get cell value safely."""
        if idx is None:
            return ''
        try:
            val = row.iloc[idx]
            if pd.isna(val):
                return ''
            return str(val).strip()
        except:
            return ''
    
    def normalize_section(self, section: str) -> str:
        """Normalize section name."""
        # Clean and standardize
        normalized = ' '.join(section.split()).upper()
        normalized = normalized.replace(' ', '_')
        normalized = re.sub(r'[^A-Z0-9_]', '', normalized)
        return normalized
    
    def clean_day(self, day: str) -> str:
        """Clean day name."""
        if not day:
            return ''
        
        day = day.strip()
        day_map = {
            'sat': 'Saturday', 'saturday': 'Saturday',
            'sun': 'Sunday', 'sunday': 'Sunday',
            'mon': 'Monday', 'monday': 'Monday',
            'tue': 'Tuesday', 'tuesday': 'Tuesday',
            'wed': 'Wednesday', 'wednesday': 'Wednesday',
            'thu': 'Thursday', 'thursday': 'Thursday',
            'fri': 'Friday', 'friday': 'Friday'
        }
        return day_map.get(day.lower(), day)
    
    def clean_course(self, course: str) -> str:
        """Clean course code."""
        if not course:
            return ''
        
        course = ' '.join(course.split())
        # Try to extract course code
        match = re.search(r'[A-Z]{2,4}\s*[-]?\s*\d{3,4}', course)
        if match:
            return match.group().replace(' ', '')
        return course
    
    def clean_type(self, class_type: str) -> str:
        """Clean class type."""
        if not class_type:
            return 'Theory'
        
        class_type = class_type.strip()
        if any(kw in class_type.lower() for kw in ['lab', 'practical']):
            return 'Lab'
        elif any(kw in class_type.lower() for kw in ['theory', 'lecture']):
            return 'Theory'
        return 'Theory'
    
    def validate_routine(self, sections: Dict[str, List[Dict]]) -> bool:
        """Validate routine data."""
        if not sections:
            logger.error("No sections found")
            return False
        
        total_entries = sum(len(entries) for entries in sections.values())
        if total_entries == 0:
            logger.error("No class entries found")
            return False
        
        logger.info(f"✅ Validated: {len(sections)} sections, {total_entries} classes")
        return True
    
    def scrape(self) -> bool:
        """Main scraping method."""
        try:
            DATA_DIR.mkdir(exist_ok=True)
            
            # Fetch notice page
            html = self.fetch_notice_page()
            if not html:
                logger.error("Could not fetch notice page")
                return False
            
            # Find routine notice
            notice = self.find_routine_notice(html)
            if not notice:
                logger.error("Could not find routine notice on the page")
                return False
            
            title, file_url = notice
            logger.info(f"Found routine: {title}")
            logger.info(f"File URL: {file_url}")
            
            # Download file
            file_content = self.download_file(file_url)
            if not file_content:
                return False
            
            # Parse file
            sections = {}
            if any(ext in file_url.lower() for ext in ['.xlsx', '.xls']):
                sections = self.parse_excel_file(file_content)
            else:
                logger.error(f"Unsupported file format: {file_url}")
                return False
            
            # Validate
            if not self.validate_routine(sections):
                return False
            
            # Save output
            output = {
                'updated_at': datetime.now(timezone.utc).isoformat(),
                'source': file_url,
                'sections': sections
            }
            
            with open(TEMP_FILE, 'w', encoding='utf-8') as f:
                json.dump(output, f, indent=2, ensure_ascii=False)
            
            TEMP_FILE.rename(OUTPUT_FILE)
            
            logger.info(f"✅ Successfully saved routine to {OUTPUT_FILE}")
            return True
            
        except Exception as e:
            logger.error(f"Scraping failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False


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
