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
from typing import Dict, List, Optional, Tuple, Any
from pathlib import Path
import tempfile
import time

import requests
from bs4 import BeautifulSoup
import pandas as pd

# ============================================================
# CONFIGURATION - CHANGE THESE TO MATCH DIU'S ACTUAL SOURCE
# ============================================================

# Primary URL where DIU posts CSE routine notices
NOTICE_URL = "https://daffodilvarsity.edu.bd/notice"

# Alternative URLs to try if primary fails (add more as needed)
# These are common places where DIU might post routines
ALTERNATIVE_URLS = [
    "https://daffodilvarsity.edu.bd/department/cse/notice",
    "https://daffodilvarsity.edu.bd/academics/notice",
    "https://daffodilvarsity.edu.bd/student-corner/notice",
]

# Keywords to look for in notice titles
ROUTINE_KEYWORDS = [
    'routine', 'class routine', 'cse routine', 'section routine',
    'class schedule', 'cse schedule', 'academic schedule',
    'routine notice', 'cse notice', 'class routine notice'
]

# Keywords to filter out (not routines)
EXCLUDE_KEYWORDS = [
    'exam', 'test', 'quiz', 'assignment', 'project', 'thesis',
    'seminar', 'workshop', 'event', 'holiday', 'vacation',
    'admission', 'result', 'payment', 'fee'
]

# ============================================================
# FILE PATHS
# ============================================================

DATA_DIR = Path("data")
OUTPUT_FILE = DATA_DIR / "routine.json"
TEMP_FILE = DATA_DIR / "routine.json.tmp"

# ============================================================
# LOGGING SETUP
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


class DIURoutineScraper:
    """Enhanced scraper for DIU CSE routine notices."""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,bn;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        })
        self.timeout = 30
        self.max_retries = 3
        self.retry_delay = 2
    
    def fetch_with_retry(self, url: str) -> Optional[str]:
        """Fetch a URL with retry logic."""
        for attempt in range(self.max_retries):
            try:
                logger.info(f"Fetching URL (attempt {attempt + 1}/{self.max_retries}): {url}")
                response = self.session.get(url, timeout=self.timeout)
                response.raise_for_status()
                
                # Check if response is HTML
                content_type = response.headers.get('content-type', '')
                if 'text/html' in content_type or url.endswith('.html') or url.endswith('.php'):
                    logger.info(f"Successfully fetched HTML page (status: {response.status_code})")
                    return response.text
                else:
                    logger.warning(f"Response is not HTML (content-type: {content_type})")
                    # If it's a file, return the content as bytes instead
                    return response.text if response.text else None
                    
            except requests.exceptions.RequestException as e:
                logger.warning(f"Attempt {attempt + 1} failed: {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay * (attempt + 1))
                else:
                    logger.error(f"All {self.max_retries} attempts failed for {url}")
                    return None
        return None
    
    def find_routine_notice(self, html: str, base_url: str) -> Optional[Tuple[str, str, str]]:
        """
        Find the latest CSE routine notice.
        Returns tuple of (notice_title, file_url, file_type) or None.
        """
        soup = BeautifulSoup(html, 'html.parser')
        
        # Find all links
        links = soup.find_all('a', href=True)
        candidates = []
        
        for link in links:
            text = link.get_text().strip().lower()
            href = link.get('href', '')
            
            # Skip empty or javascript links
            if not href or href.startswith('#') or href.startswith('javascript:'):
                continue
            
            # Check if this is a routine notice
            is_routine = False
            for keyword in ROUTINE_KEYWORDS:
                if keyword in text or keyword in href.lower():
                    is_routine = True
                    break
            
            # Skip if it has exclusion keywords
            if is_routine:
                for exclude in EXCLUDE_KEYWORDS:
                    if exclude in text or exclude in href.lower():
                        is_routine = False
                        break
            
            if is_routine:
                # Check file type
                file_type = self.get_file_type(href)
                if file_type:
                    # Make sure URL is absolute
                    if not href.startswith(('http://', 'https://')):
                        href = requests.compat.urljoin(base_url, href)
                    candidates.append((text, href, file_type))
                    logger.debug(f"Found candidate: {text} ({file_type})")
        
        # Sort by file type priority (PDF > Excel > Word)
        priority = {'pdf': 0, 'xlsx': 1, 'xls': 2, 'docx': 3, 'doc': 4}
        candidates.sort(key=lambda x: priority.get(x[2], 99))
        
        if candidates:
            logger.info(f"Found routine notice: {candidates[0][0]}")
            return candidates[0]
        
        # Try searching in divs and paragraphs for routine links
        logger.info("No direct routine links found, searching in content...")
        return self.find_routine_in_content(soup, base_url)
    
    def find_routine_in_content(self, soup: BeautifulSoup, base_url: str) -> Optional[Tuple[str, str, str]]:
        """Search for routine links within text content."""
        # Look for text containing routine keywords
        text_elements = soup.find_all(['p', 'div', 'span', 'li', 'td'])
        
        for element in text_elements:
            text = element.get_text().strip().lower()
            
            # Check if text mentions routine
            is_routine = False
            for keyword in ROUTINE_KEYWORDS:
                if keyword in text:
                    is_routine = True
                    break
            
            if not is_routine:
                continue
            
            # Check for exclusion keywords
            for exclude in EXCLUDE_KEYWORDS:
                if exclude in text:
                    is_routine = False
                    break
            
            if not is_routine:
                continue
            
            # Find links within this element
            links = element.find_all('a', href=True)
            for link in links:
                href = link.get('href', '')
                if not href or href.startswith('#'):
                    continue
                
                file_type = self.get_file_type(href)
                if file_type:
                    if not href.startswith(('http://', 'https://')):
                        href = requests.compat.urljoin(base_url, href)
                    title = link.get_text().strip() or text[:50]
                    logger.info(f"Found routine link in content: {title}")
                    return (title, href, file_type)
        
        return None
    
    def get_file_type(self, url: str) -> Optional[str]:
        """Determine file type from URL."""
        url_lower = url.lower()
        if url_lower.endswith('.pdf'):
            return 'pdf'
        elif url_lower.endswith('.xlsx') or url_lower.endswith('.xls'):
            return 'excel'
        elif url_lower.endswith('.docx') or url_lower.endswith('.doc'):
            return 'word'
        elif 'download' in url_lower and ('file' in url_lower or 'id' in url_lower):
            # Some URLs might not have file extension but serve files
            return 'unknown'
        return None
    
    def download_file(self, url: str) -> Optional[bytes]:
        """Download a file from URL with retry."""
        for attempt in range(self.max_retries):
            try:
                logger.info(f"Downloading file (attempt {attempt + 1}): {url}")
                response = self.session.get(url, timeout=self.timeout)
                response.raise_for_status()
                
                content = response.content
                logger.info(f"Downloaded {len(content)} bytes")
                
                # Verify it's not HTML (might be error page)
                if len(content) < 1024 and b'<html' in content[:512]:
                    logger.warning("Downloaded file appears to be HTML instead of actual file")
                    continue
                
                return content
                
            except requests.exceptions.RequestException as e:
                logger.warning(f"Download attempt {attempt + 1} failed: {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay * (attempt + 1))
                else:
                    logger.error(f"All download attempts failed for {url}")
                    return None
        return None
    
    def parse_routine_file(self, file_content: bytes, file_type: str, url: str) -> Dict[str, List[Dict]]:
        """Parse the routine file based on its type."""
        if file_type in ['excel', 'xlsx', 'xls']:
            return self.parse_excel_routine(file_content)
        elif file_type in ['pdf']:
            return self.parse_pdf_routine(file_content)
        elif file_type in ['word', 'docx', 'doc']:
            return self.parse_word_routine(file_content)
        else:
            logger.error(f"Unsupported file type: {file_type}")
            return {}
    
    def parse_excel_routine(self, file_content: bytes) -> Dict[str, List[Dict]]:
        """Parse Excel file containing routine data."""
        try:
            # Write temporary file
            with tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False) as tmp:
                tmp.write(file_content)
                tmp_path = tmp.name
            
            # Read Excel file
            try:
                df = pd.read_excel(tmp_path, engine='openpyxl')
            except Exception as e:
                logger.warning(f"Failed to read as xlsx, trying as xls: {e}")
                df = pd.read_excel(tmp_path, engine='xlrd')
            
            # Clean up temp file
            os.unlink(tmp_path)
            
            logger.info(f"Read Excel file with {len(df)} rows and {len(df.columns)} columns")
            logger.debug(f"Columns: {list(df.columns)}")
            
            # Try different parsing strategies
            sections = {}
            
            # Strategy 1: Auto-detect columns
            sections = self.parse_excel_auto_detect(df)
            if self.validate_routine(sections, allow_empty=False):
                logger.info("Successfully parsed with auto-detect strategy")
                return sections
            
            # Strategy 2: Position-based parsing
            sections = self.parse_excel_by_position(df)
            if self.validate_routine(sections, allow_empty=False):
                logger.info("Successfully parsed with position-based strategy")
                return sections
            
            # Strategy 3: Try to find any table structure
            sections = self.parse_excel_table_structure(df)
            if self.validate_routine(sections, allow_empty=False):
                logger.info("Successfully parsed with table structure strategy")
                return sections
            
            logger.error("All Excel parsing strategies failed")
            return {}
            
        except Exception as e:
            logger.error(f"Failed to parse Excel file: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {}
    
    def parse_excel_auto_detect(self, df: pd.DataFrame) -> Dict[str, List[Dict]]:
        """Auto-detect column mapping based on column names."""
        # Common column name mappings
        column_mapping = {
            'section': ['section', 'sec', 'section name', 'group', 'batch', 'class'],
            'day': ['day', 'weekday', 'day of week', 'date'],
            'time': ['time', 'schedule', 'time slot', 'period', 'start', 'end'],
            'course': ['course', 'subject', 'course code', 'subject code', 'code'],
            'teacher': ['teacher', 'instructor', 'faculty', 'professor', 'lecturer'],
            'room': ['room', 'room no', 'venue', 'classroom', 'location'],
            'type': ['type', 'class type', 'category', 'mode', 'status']
        }
        
        # Find best matching columns
        col_map = {}
        used_columns = set()
        
        for target, possible_names in column_mapping.items():
            best_match = None
            best_score = 0
            
            for col in df.columns:
                col_lower = str(col).lower().strip()
                if col in used_columns:
                    continue
                    
                # Check for exact matches first
                if col_lower in possible_names:
                    best_match = col
                    best_score = 100
                    break
                
                # Check for partial matches
                for pname in possible_names:
                    if pname in col_lower or col_lower in pname:
                        score = 50 if pname in col_lower else 30
                        if score > best_score:
                            best_score = score
                            best_match = col
                            break
            
            if best_match:
                col_map[target] = best_match
                used_columns.add(best_match)
                logger.debug(f"Mapped '{target}' to column '{best_match}'")
        
        # If we have enough columns, extract data
        if len(col_map) >= 4:
            return self.extract_data_from_df(df, col_map)
        
        return {}
    
    def extract_data_from_df(self, df: pd.DataFrame, col_map: Dict[str, str]) -> Dict[str, List[Dict]]:
        """Extract data from DataFrame using column mapping."""
        sections = {}
        required_fields = ['section', 'day', 'course']
        
        for idx, row in df.iterrows():
            try:
                # Extract section
                section_col = col_map.get('section')
                if not section_col:
                    continue
                
                section = str(row.get(section_col, '')).strip()
                if not section or section.lower() in ['nan', 'none', '', 'null']:
                    continue
                
                # Check if we have all required fields
                has_required = all(col_map.get(field) and str(row.get(col_map[field], '')).strip() 
                                  for field in required_fields)
                if not has_required:
                    continue
                
                # Normalize section
                section = self.normalize_section(section)
                
                # Extract data
                day = str(row.get(col_map.get('day', ''), '')).strip()
                time = str(row.get(col_map.get('time', ''), '')).strip()
                course = str(row.get(col_map.get('course', ''), '')).strip()
                teacher = str(row.get(col_map.get('teacher', ''), '')).strip()
                room = str(row.get(col_map.get('room', ''), '')).strip()
                class_type = str(row.get(col_map.get('type', ''), '')).strip()
                
                # Clean up values
                day = self.clean_day(day)
                time = self.clean_time(time)
                course = self.clean_course(course)
                class_type = self.clean_type(class_type)
                
                if not section or not day or not course:
                    continue
                
                if section not in sections:
                    sections[section] = []
                
                sections[section].append({
                    'day': day if day else 'Unknown',
                    'time': time if time else 'TBA',
                    'course': course,
                    'teacher': teacher if teacher else 'TBA',
                    'room': room if room else 'TBA',
                    'type': class_type if class_type else 'Theory'
                })
                
            except Exception as e:
                logger.warning(f"Error processing row {idx}: {e}")
                continue
        
        return sections
    
    def parse_excel_by_position(self, df: pd.DataFrame) -> Dict[str, List[Dict]]:
        """Parse Excel using column positions (fallback)."""
        sections = {}
        
        # Try to find section column
        section_col = None
        for i, col in enumerate(df.columns):
            col_lower = str(col).lower()
            if any(keyword in col_lower for keyword in ['section', 'sec', 'group', 'batch']):
                section_col = i
                break
        
        if section_col is None:
            section_col = 0  # Assume first column is section
        
        # Check if there's a header row we should skip
        header_row = 0
        for i in range(min(5, len(df))):
            row = df.iloc[i]
            if any(str(val).lower() in ['section', 'day', 'time', 'course'] for val in row):
                header_row = i
                break
        
        # Use the next rows after header
        start_row = header_row + 1 if header_row > 0 else 0
        
        for idx in range(start_row, len(df)):
            try:
                row = df.iloc[idx]
                
                # Skip empty rows
                if all(pd.isna(val) or str(val).strip() == '' for val in row):
                    continue
                
                section = str(row.iloc[section_col]).strip()
                if not section or section.lower() in ['nan', 'none', '', 'null']:
                    continue
                
                section = self.normalize_section(section)
                
                # Extract data based on typical structure
                # Adjust indices based on your actual Excel structure
                day_col = section_col + 1
                time_col = section_col + 2
                course_col = section_col + 3
                teacher_col = section_col + 4
                room_col = section_col + 5
                type_col = section_col + 6
                
                day = self.clean_day(str(row.iloc[day_col]).strip() if len(row) > day_col else '')
                time = self.clean_time(str(row.iloc[time_col]).strip() if len(row) > time_col else '')
                course = self.clean_course(str(row.iloc[course_col]).strip() if len(row) > course_col else '')
                teacher = str(row.iloc[teacher_col]).strip() if len(row) > teacher_col else ''
                room = str(row.iloc[room_col]).strip() if len(row) > room_col else ''
                class_type = self.clean_type(str(row.iloc[type_col]).strip() if len(row) > type_col else '')
                
                if not section or not day or not course:
                    continue
                
                if section not in sections:
                    sections[section] = []
                
                sections[section].append({
                    'day': day if day else 'Unknown',
                    'time': time if time else 'TBA',
                    'course': course,
                    'teacher': teacher if teacher else 'TBA',
                    'room': room if room else 'TBA',
                    'type': class_type if class_type else 'Theory'
                })
                
            except Exception as e:
                logger.warning(f"Error processing row {idx}: {e}")
                continue
        
        return sections
    
    def parse_excel_table_structure(self, df: pd.DataFrame) -> Dict[str, List[Dict]]:
        """Parse Excel if it's in a table format with merged cells."""
        sections = {}
        
        # Look for common patterns
        for idx, row in df.iterrows():
            # Try to find section in any cell
            section = None
            for val in row:
                val_str = str(val).strip()
                if val_str and any(keyword in val_str.lower() for keyword in ['section', 'sec', 'batch']):
                    section = self.normalize_section(val_str)
                    break
            
            if not section:
                continue
            
            # Look for subsequent rows that belong to this section
            # This is complex and depends on actual format
            # You may need to customize this based on DIU's actual Excel structure
        
        return sections
    
    def parse_pdf_routine(self, file_content: bytes) -> Dict[str, List[Dict]]:
        """Parse PDF file containing routine data."""
        try:
            import PyPDF2
            from io import BytesIO
            
            pdf_reader = PyPDF2.PdfReader(BytesIO(file_content))
            text = ""
            for page in pdf_reader.pages:
                text += page.extract_text()
            
            # Parse text for routine data
            return self.parse_text_routine(text)
            
        except ImportError:
            logger.error("PyPDF2 not installed. Install with: pip install PyPDF2")
            return {}
        except Exception as e:
            logger.error(f"Failed to parse PDF: {e}")
            return {}
    
    def parse_word_routine(self, file_content: bytes) -> Dict[str, List[Dict]]:
        """Parse Word document containing routine data."""
        try:
            import docx
            from io import BytesIO
            
            doc = docx.Document(BytesIO(file_content))
            text = "\n".join([para.text for para in doc.paragraphs])
            
            # Parse text for routine data
            return self.parse_text_routine(text)
            
        except ImportError:
            logger.error("python-docx not installed. Install with: pip install python-docx")
            return {}
        except Exception as e:
            logger.error(f"Failed to parse Word document: {e}")
            return {}
    
    def parse_text_routine(self, text: str) -> Dict[str, List[Dict]]:
        """Parse routine from text content."""
        sections = {}
        
        # Split into lines
        lines = text.split('\n')
        
        current_section = None
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Check if this line contains section info
            if any(keyword in line.lower() for keyword in ['section', 'sec', 'group']):
                section_match = re.search(r'[A-Z0-9_]+', line)
                if section_match:
                    current_section = self.normalize_section(section_match.group())
                    if current_section not in sections:
                        sections[current_section] = []
                    continue
            
            # Try to parse as a class entry
            if current_section:
                class_entry = self.parse_text_class_entry(line)
                if class_entry:
                    sections[current_section].append(class_entry)
        
        return sections
    
    def parse_text_class_entry(self, line: str) -> Optional[Dict]:
        """Parse a single class entry from text."""
        # This is a simple parser - you'll need to adapt based on actual format
        # Common patterns: "Day Time Course Teacher Room Type"
        
        # Pattern: "Sat 9:00-10:30 CSE123 Prof. Smith AB-101 Theory"
        parts = line.split()
        if len(parts) < 3:
            return None
        
        # Try to identify parts
        day_patterns = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday']
        time_pattern = r'\d{1,2}:\d{2}'
        
        day = None
        time = None
        course = None
        teacher = None
        room = None
        class_type = 'Theory'
        
        # Find day
        for i, part in enumerate(parts):
            if part.lower() in day_patterns:
                day = part
                break
        
        if not day:
            return None
        
        # Find time
        time_parts = []
        for i, part in enumerate(parts):
            if re.search(time_pattern, part):
                time_parts = parts[i:i+3]
                break
        
        if time_parts:
            time = ' '.join(time_parts[:2])
        
        return {
            'day': day,
            'time': time if time else 'TBA',
            'course': line,
            'teacher': 'TBA',
            'room': 'TBA',
            'type': 'Theory'
        }
    
    def normalize_section(self, section: str) -> str:
        """Normalize section name for consistent matching."""
        # Remove extra spaces
        normalized = ' '.join(section.split()).upper()
        
        # Replace spaces with underscores
        normalized = normalized.replace(' ', '_')
        
        # Remove special characters except underscores
        normalized = re.sub(r'[^A-Z0-9_]', '', normalized)
        
        return normalized
    
    def clean_day(self, day: str) -> str:
        """Clean and normalize day names."""
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
    
    def clean_time(self, time_str: str) -> str:
        """Clean and normalize time strings."""
        if not time_str or time_str.lower() in ['nan', 'none', '']:
            return ''
        
        # Remove extra spaces
        time_str = ' '.join(time_str.split())
        
        # Try to format consistently
        if 'am' in time_str.lower() or 'pm' in time_str.lower():
            return time_str
        
        # If it has a dash, try to add AM/PM
        if '-' in time_str and not any(x in time_str.lower() for x in ['am', 'pm']):
            parts = time_str.split('-')
            if len(parts) == 2:
                return f"{parts[0].strip()} AM - {parts[1].strip()} PM"
        
        return time_str
    
    def clean_course(self, course: str) -> str:
        """Clean and normalize course codes."""
        if not course or course.lower() in ['nan', 'none', '']:
            return ''
        
        course = ' '.join(course.split())
        
        # Try to extract course code pattern
        # Common patterns: CSE123, CSE 123, CSE-123
        match = re.search(r'[A-Z]{2,4}\s*[-]?\s*\d{3,4}', course)
        if match:
            return match.group().replace(' ', '')
        
        return course
    
    def clean_type(self, class_type: str) -> str:
        """Clean and normalize class type."""
        if not class_type or class_type.lower() in ['nan', 'none', '']:
            return 'Theory'
        
        class_type = class_type.strip()
        if any(keyword in class_type.lower() for keyword in ['lab', 'practical', 'laboratory']):
            return 'Lab'
        elif any(keyword in class_type.lower() for keyword in ['theory', 'lecture']):
            return 'Theory'
        
        return class_type
    
    def validate_routine(self, sections: Dict[str, List[Dict]], allow_empty: bool = True) -> bool:
        """Validate the scraped routine data."""
        if not sections:
            if not allow_empty:
                logger.error("No sections found in routine data")
            return False
        
        total_entries = sum(len(entries) for entries in sections.values())
        
        if total_entries == 0:
            if not allow_empty:
                logger.error("No class entries found in routine data")
            return False
        
        # Validate each entry has required fields
        required_fields = ['day', 'course']
        invalid_entries = 0
        
        for section, entries in sections.items():
            for entry in entries:
                if not all(entry.get(field) for field in required_fields):
                    invalid_entries += 1
        
        if invalid_entries > 0:
            logger.warning(f"Found {invalid_entries} entries with missing required fields")
            
        logger.info(f"Validation: {len(sections)} sections, {total_entries} class entries")
        return True
    
    def scrape(self) -> bool:
        """Main scraping method."""
        try:
            # Create data directory if it doesn't exist
            DATA_DIR.mkdir(exist_ok=True)
            
            # Try primary URL
            html = self.fetch_with_retry(NOTICE_URL)
            
            if not html:
                logger.warning("Primary URL failed, trying alternatives...")
                for alt_url in ALTERNATIVE_URLS:
                    logger.info(f"Trying alternative: {alt_url}")
                    html = self.fetch_with_retry(alt_url)
                    if html:
                        logger.info(f"Successfully fetched from alternative: {alt_url}")
                        break
            
            if not html:
                logger.error("Failed to fetch any notice page")
                return False
            
            # Find routine notice
            notice = self.find_routine_notice(html, NOTICE_URL)
            if not notice:
                logger.error("Could not find routine notice on any page")
                return False
            
            title, url, file_type = notice
            logger.info(f"Found: {title} ({file_type}) - {url}")
            
            # Download the file
            file_content = self.download_file(url)
            if not file_content:
                logger.error("Failed to download routine file")
                return False
            
            # Parse the file
            sections = self.parse_routine_file(file_content, file_type, url)
            
            # Validate
            if not self.validate_routine(sections, allow_empty=False):
                logger.error("Validation failed - no valid routine data extracted")
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
            logger.info(f"Total: {len(sections)} sections, {sum(len(entries) for entries in sections.values())} classes")
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
        logger.info("✅ Scraping completed successfully")
        sys.exit(0)
    else:
        if has_existing:
            logger.info("⚠️ Scraping failed but keeping existing routine.json")
            sys.exit(0)  # Don't fail the action if we have existing data
        else:
            logger.error("❌ Scraping failed and no existing routine.json found")
            sys.exit(1)


if __name__ == "__main__":
    main()
