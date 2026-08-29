#!/usr/bin/env python3
"""
DIU CSE Routine Scraper
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

# Configuration - CHANGE THIS URL TO THE ACTUAL DIU ROUTINE SOURCE
NOTICE_URL = "https://daffodilvarsity.edu.bd/notice"  # UPDATE THIS URL
# Alternative: "https://daffodilvarsity.edu.bd/department/cse/notice"
# or the specific URL where DIU posts routine notices

# File paths
DATA_DIR = Path("data")
OUTPUT_FILE = DATA_DIR / "routine.json"
TEMP_FILE = DATA_DIR / "routine.json.tmp"

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


class DIURoutineScraper:
    """Scraper for DIU CSE routine notices."""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
        })
        self.timeout = 30
        
    def fetch_notice_page(self) -> Optional[str]:
        """Fetch the main notice page."""
        try:
            logger.info(f"Fetching notice page: {NOTICE_URL}")
            response = self.session.get(NOTICE_URL, timeout=self.timeout)
            response.raise_for_status()
            logger.info(f"Successfully fetched notice page (status: {response.status_code})")
            return response.text
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to fetch notice page: {e}")
            return None
    
    def find_routine_notice(self, html: str) -> Optional[Tuple[str, str]]:
        """
        Find the latest CSE routine notice.
        Returns tuple of (notice_title, link_url) or None.
        """
        soup = BeautifulSoup(html, 'html.parser')
        
        # Common patterns for routine notices
        routine_patterns = [
            r'cse.*routine',
            r'class.*routine',
            r'routine.*cse',
            r'notice.*routine',
            r'cse.*class.*schedule',
            r'cse.*section.*routine'
        ]
        
        # Look for links with routine-related text
        links = soup.find_all('a', href=True)
        
        candidates = []
        for link in links:
            text = link.get_text().strip().lower()
            href = link.get('href', '')
            
            # Check if this link contains routine-related text
            for pattern in routine_patterns:
                if re.search(pattern, text, re.IGNORECASE):
                    # Check if it's a PDF or Excel file
                    if any(ext in href.lower() for ext in ['.pdf', '.xlsx', '.xls', '.docx']):
                        # Make sure URL is absolute
                        if not href.startswith('http'):
                            href = requests.compat.urljoin(NOTICE_URL, href)
                        candidates.append((text, href))
                        break
        
        if candidates:
            # Return the first candidate (usually latest)
            logger.info(f"Found routine notice: {candidates[0][0]}")
            return candidates[0]
        
        logger.warning("No routine notice found on the page")
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
    
    def parse_excel_routine(self, file_content: bytes) -> Dict[str, List[Dict]]:
        """
        Parse Excel file containing routine data.
        This is a flexible parser that should be adapted to DIU's actual format.
        """
        try:
            # Write temporary file
            temp_file = DATA_DIR / "temp_routine.xlsx"
            temp_file.write_bytes(file_content)
            
            # Read Excel file
            df = pd.read_excel(temp_file, engine='openpyxl')
            
            # Remove temporary file
            temp_file.unlink()
            
            logger.info(f"Read Excel file with {len(df)} rows and {len(df.columns)} columns")
            
            # This is a generic parser - you'll need to adapt this to DIU's actual format
            # Common column names to look for
            column_mapping = {
                'section': ['section', 'sec', 'section name', 'group'],
                'day': ['day', 'weekday', 'day of week'],
                'time': ['time', 'schedule', 'time slot', 'period'],
                'course': ['course', 'subject', 'course code', 'subject code'],
                'teacher': ['teacher', 'instructor', 'faculty', 'professor'],
                'room': ['room', 'room no', 'venue', 'classroom'],
                'type': ['type', 'class type', 'category', 'mode']
            }
            
            # Find actual column names
            col_map = {}
            for target, possible_names in column_mapping.items():
                for col in df.columns:
                    col_lower = str(col).lower().strip()
                    for pname in possible_names:
                        if pname in col_lower:
                            col_map[target] = col
                            break
                    if target in col_map:
                        break
            
            # If we couldn't map all columns, use position-based approach
            if len(col_map) < 4:
                logger.warning("Could not map all columns, using positional approach")
                return self.parse_excel_by_position(df)
            
            # Extract data
            sections = {}
            for _, row in df.iterrows():
                section = str(row[col_map.get('section', '')]).strip() if col_map.get('section') else None
                if not section or section.lower() in ['nan', 'none', '']:
                    continue
                
                day = str(row[col_map.get('day', '')]).strip() if col_map.get('day') else ''
                time = str(row[col_map.get('time', '')]).strip() if col_map.get('time') else ''
                course = str(row[col_map.get('course', '')]).strip() if col_map.get('course') else ''
                teacher = str(row[col_map.get('teacher', '')]).strip() if col_map.get('teacher') else ''
                room = str(row[col_map.get('room', '')]).strip() if col_map.get('room') else ''
                class_type = str(row[col_map.get('type', '')]).strip() if col_map.get('type') else 'Theory'
                
                # Normalize section
                section = self.normalize_section(section)
                
                if section not in sections:
                    sections[section] = []
                
                sections[section].append({
                    'day': day,
                    'time': time,
                    'course': course,
                    'teacher': teacher,
                    'room': room,
                    'type': class_type if class_type and class_type.lower() != 'nan' else 'Theory'
                })
            
            return sections
            
        except Exception as e:
            logger.error(f"Failed to parse Excel file: {e}")
            return {}
    
    def parse_excel_by_position(self, df: pd.DataFrame) -> Dict[str, List[Dict]]:
        """
        Fallback parser that uses column positions.
        Adapt this to DIU's actual format.
        """
        sections = {}
        
        # Try to find section column (usually first or contains 'section')
        section_col = None
        for i, col in enumerate(df.columns):
            if 'section' in str(col).lower():
                section_col = i
                break
        
        if section_col is None:
            section_col = 0  # Assume first column is section
        
        # Other columns based on typical structure
        # You'll need to adjust these indices based on DIU's actual format
        for _, row in df.iterrows():
            try:
                section = str(row.iloc[section_col]).strip()
                if not section or section.lower() in ['nan', 'none', '']:
                    continue
                
                section = self.normalize_section(section)
                
                if section not in sections:
                    sections[section] = []
                
                # Adjust indices based on actual Excel structure
                day = str(row.iloc[section_col + 1]).strip() if len(row) > section_col + 1 else ''
                time = str(row.iloc[section_col + 2]).strip() if len(row) > section_col + 2 else ''
                course = str(row.iloc[section_col + 3]).strip() if len(row) > section_col + 3 else ''
                teacher = str(row.iloc[section_col + 4]).strip() if len(row) > section_col + 4 else ''
                room = str(row.iloc[section_col + 5]).strip() if len(row) > section_col + 5 else ''
                class_type = str(row.iloc[section_col + 6]).strip() if len(row) > section_col + 6 else 'Theory'
                
                sections[section].append({
                    'day': day if day.lower() not in ['nan', 'none', ''] else '',
                    'time': time if time.lower() not in ['nan', 'none', ''] else '',
                    'course': course if course.lower() not in ['nan', 'none', ''] else '',
                    'teacher': teacher if teacher.lower() not in ['nan', 'none', ''] else '',
                    'room': room if room.lower() not in ['nan', 'none', ''] else '',
                    'type': class_type if class_type.lower() not in ['nan', 'none', ''] else 'Theory'
                })
                
            except Exception as e:
                logger.warning(f"Error processing row: {e}")
                continue
        
        return sections
    
    def normalize_section(self, section: str) -> str:
        """Normalize section name for consistent matching."""
        # Remove extra spaces, convert to uppercase
        normalized = ' '.join(section.split()).upper()
        # Replace spaces with underscores
        normalized = normalized.replace(' ', '_')
        # Remove any special characters except underscores
        normalized = re.sub(r'[^A-Z0-9_]', '', normalized)
        return normalized
    
    def validate_routine(self, sections: Dict[str, List[Dict]]) -> bool:
        """Validate the scraped routine data."""
        if not sections:
            logger.error("No sections found in routine data")
            return False
        
        total_entries = 0
        for section, entries in sections.items():
            total_entries += len(entries)
        
        if total_entries == 0:
            logger.error("No class entries found in routine data")
            return False
        
        logger.info(f"Validation passed: {len(sections)} sections, {total_entries} class entries")
        return True
    
    def scrape(self) -> bool:
        """Main scraping method."""
        try:
            # Create data directory if it doesn't exist
            DATA_DIR.mkdir(exist_ok=True)
            
            # Fetch notice page
            html = self.fetch_notice_page()
            if not html:
                return False
            
            # Find routine notice
            notice = self.find_routine_notice(html)
            if not notice:
                logger.error("Could not find routine notice")
                return False
            
            title, url = notice
            
            # Download the file
            file_content = self.download_file(url)
            if not file_content:
                return False
            
            # Parse based on file type
            sections = {}
            if '.xlsx' in url.lower() or '.xls' in url.lower():
                sections = self.parse_excel_routine(file_content)
            else:
                # Add support for other formats as needed
                logger.error(f"Unsupported file format: {url}")
                return False
            
            # Validate
            if not self.validate_routine(sections):
                return False
            
            # Prepare output
            output = {
                'updated_at': datetime.now(timezone.utc).isoformat(),
                'source': url,
                'sections': sections
            }
            
            # Write to temporary file first
            with open(TEMP_FILE, 'w', encoding='utf-8') as f:
                json.dump(output, f, indent=2, ensure_ascii=False)
            
            # If successful, replace the main file
            TEMP_FILE.rename(OUTPUT_FILE)
            
            logger.info(f"Successfully saved routine data to {OUTPUT_FILE}")
            return True
            
        except Exception as e:
            logger.error(f"Scraping failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False


def main():
    """Main entry point."""
    scraper = DIURoutineScraper()
    
    # Check if we already have a valid routine file
    has_existing = OUTPUT_FILE.exists()
    
    if scraper.scrape():
        sys.exit(0)
    else:
        if has_existing:
            logger.info("Scraping failed but keeping existing routine.json")
            sys.exit(0)  # Don't fail the action if we have existing data
        else:
            logger.error("Scraping failed and no existing routine.json found")
            sys.exit(1)


if __name__ == "__main__":
    main()
