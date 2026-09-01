#!/usr/bin/env python3
"""
DIU CSE Routine PDF Parser – Auto‑Discovery + Coordinate‑Based Parsing
"""

import json
import re
import sys
import argparse
import os
from pathlib import Path
from collections import defaultdict
from typing import List, Dict, Any, Optional, Tuple
import requests
from bs4 import BeautifulSoup
import pymupdf

# ============================================================
# CONFIGURATION
# ============================================================

NOTICE_URL = "https://webbackend.daffodilvarsity.edu.bd/department/cse/notice"

# Time slots with X‑coordinate boundaries (configurable)
SLOT_EDGES = [
    (0.0, 0.18),    # Slot 0: 08:30-10:00
    (0.18, 0.32),   # Slot 1: 10:00-11:30
    (0.32, 0.46),   # Slot 2: 11:30-01:00
    (0.46, 0.60),   # Slot 3: 01:00-02:30
    (0.60, 0.78),   # Slot 4: 02:30-04:00
    (0.78, 1.0),    # Slot 5: 04:00-05:30
]

TIME_SLOTS = [
    {"start": "08:30", "end": "10:00"},
    {"start": "10:00", "end": "11:30"},
    {"start": "11:30", "end": "01:00"},
    {"start": "01:00", "end": "02:30"},
    {"start": "02:30", "end": "04:00"},
    {"start": "04:00", "end": "05:30"},
]

# Regex patterns
COURSE_RE = re.compile(r'^([A-Z]{2,6}\s*\d{3,4}[A-Z]?)\s*\(([^)]+)\)$')
ROOM_RE = re.compile(r'(KT-\d+|G\d+-\d+|ANX\d+-\d+|SH-\d+|CTBA-\d+|EMBED|IOT)')
TEACHER_RE = re.compile(r'^[A-Z]{2,4}$')
DAY_RE = re.compile(r'^(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)$', re.IGNORECASE)

IGNORE_WORDS = {
    'ROOM', 'COURSE', 'TEACHER', 'LAB', 'COM', 'RESERVED',
    'Page', 'TABLE', 'VERSION', 'Effective', 'From', 'Prepared', 'by'
}

# ============================================================
# DATA STRUCTURES
# ============================================================

class Word:
    def __init__(self, page: int, x0: float, y0: float, x1: float, y1: float, text: str):
        self.page = page
        self.x0 = x0
        self.y0 = y0
        self.x1 = x1
        self.y1 = y1
        self.text = text.strip()
        self.x_center = (x0 + x1) / 2
        self.y_center = (y0 + y1) / 2

class ClassEntry:
    def __init__(self):
        self.day: Optional[str] = None
        self.slot: Optional[int] = None
        self.start_time: Optional[str] = None
        self.end_time: Optional[str] = None
        self.course: Optional[str] = None
        self.group: Optional[str] = None
        self.teacher: Optional[str] = None
        self.room: Optional[str] = None
        self.is_lab: bool = False
        self.page: Optional[int] = None
        self.x: Optional[float] = None
        self.y: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "day": self.day,
            "slot": self.slot,
            "start": self.start_time,
            "end": self.end_time,
            "course": self.course,
            "group": self.group,
            "teacher": self.teacher or "?",
            "room": self.room or "?",
            "type": "lab" if self.is_lab else "theory"
        }

# ============================================================
# PDF DISCOVERY & DOWNLOAD
# ============================================================

def discover_pdf_url() -> Optional[str]:
    """Find the latest class routine PDF URL from the DIU notice page."""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
            'Referer': 'https://webbackend.daffodilvarsity.edu.bd/',
        }
        response = requests.get(NOTICE_URL, timeout=30, headers=headers)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')

        for link in soup.find_all('a', href=True):
            text = link.get_text().strip()
            href = link.get('href', '')
            if 'class routine' in text.lower() and 'exam' not in text.lower():
                if not href.startswith(('http://', 'https://')):
                    href = requests.compat.urljoin(NOTICE_URL, href)
                # Visit the detail page
                detail_response = requests.get(href, timeout=30, headers=headers)
                detail_response.raise_for_status()
                detail_soup = BeautifulSoup(detail_response.text, 'html.parser')
                for dl_link in detail_soup.find_all('a', href=True):
                    dl_href = dl_link.get('href', '')
                    if 'download-file' in dl_href:
                        if not dl_href.startswith(('http://', 'https://')):
                            dl_href = requests.compat.urljoin(href, dl_href)
                        return dl_href
        return None
    except Exception as e:
        print(f"❌ Error discovering PDF: {e}")
        return None

def download_pdf(url: str, output_path: str) -> bool:
    """Download PDF from URL to output_path."""
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        with open(output_path, 'wb') as f:
            f.write(response.content)
        print(f"✅ Downloaded PDF to {output_path}")
        return True
    except Exception as e:
        print(f"❌ Failed to download PDF: {e}")
        return False

# ============================================================
# COORDINATE‑BASED PARSER
# ============================================================

class RoutinePDFParser:
    def __init__(self, debug: bool = False):
        self.debug = debug
        self.words: List[Word] = []
        self.classes: List[ClassEntry] = []
        self.page_width: float = 0
        self.page_height: float = 0
        self.current_day: Optional[str] = None

    def parse(self, pdf_path: str) -> List[ClassEntry]:
        doc = pymupdf.open(pdf_path)
        for page_idx, page in enumerate(doc):
            rect = page.rect
            self.page_width = rect.width
            self.page_height = rect.height

            words_data = page.get_text("words")
            for w in words_data:
                word = Word(
                    page=page_idx,
                    x0=w[0], y0=w[1],
                    x1=w[2], y1=w[3],
                    text=w[4]
                )
                self.words.append(word)

            self.words.sort(key=lambda w: (w.y_center, w.x_center))
            self._process_page(page_idx)
        doc.close()
        return self.classes

    def _process_page(self, page_idx: int):
        page_words = [w for w in self.words if w.page == page_idx]
        if not page_words:
            return
        self._detect_day(page_words)
        self._detect_classes(page_words)

    def _detect_day(self, page_words: List[Word]):
        for word in page_words:
            if DAY_RE.match(word.text.upper()):
                self.current_day = word.text.capitalize()
                if self.debug:
                    print(f"[DAY] {self.current_day} (page={word.page}, y={word.y_center:.2f})")
                break

    def _detect_classes(self, page_words: List[Word]):
        if not self.current_day:
            return
        for word in page_words:
            match = COURSE_RE.match(word.text)
            if not match:
                continue
            course = match.group(1).strip()
            group = match.group(2).strip()
            slot = self._get_slot(word.x_center)
            if slot is None:
                continue
            teacher = self._find_teacher(word, page_words)
            room = self._find_room(word, page_words)
            is_lab = self._is_lab(word, page_words)

            entry = ClassEntry()
            entry.day = self.current_day
            entry.slot = slot
            entry.start_time = TIME_SLOTS[slot]["start"]
            entry.end_time = TIME_SLOTS[slot]["end"]
            entry.course = course
            entry.group = group
            entry.teacher = teacher
            entry.room = room
            entry.is_lab = is_lab
            entry.page = word.page
            entry.x = word.x_center
            entry.y = word.y_center
            self.classes.append(entry)

            if self.debug:
                print(f"[COURSE] {course} ({group})")
                print(f"  page={word.page} x={word.x_center:.2f} y={word.y_center:.2f}")
                print(f"  day={entry.day} slot={slot} time={entry.start_time}-{entry.end_time}")
                print(f"  teacher={teacher} room={room} lab={is_lab}")

    def _get_slot(self, x: float) -> Optional[int]:
        if self.page_width == 0:
            return None
        ratio = x / self.page_width
        for i, (low, high) in enumerate(SLOT_EDGES):
            if low <= ratio < high:
                return i
        return None

    def _find_teacher(self, word: Word, page_words: List[Word]) -> Optional[str]:
        candidates = []
        for other in page_words:
            if other.text == word.text or other.text in IGNORE_WORDS:
                continue
            if self._get_slot(other.x_center) != self._get_slot(word.x_center):
                continue
            if abs(other.y_center - word.y_center) > 50:
                continue
            if TEACHER_RE.match(other.text):
                distance = abs(other.x_center - word.x_center) + abs(other.y_center - word.y_center)
                candidates.append((distance, other.text))
        if candidates:
            candidates.sort(key=lambda x: x[0])
            return candidates[0][1]
        return None

    def _find_room(self, word: Word, page_words: List[Word]) -> Optional[str]:
        candidates = []
        for other in page_words:
            if other.text == word.text:
                continue
            if ROOM_RE.search(other.text):
                if abs(other.y_center - word.y_center) < 80:
                    distance = abs(other.x_center - word.x_center) + abs(other.y_center - word.y_center)
                    candidates.append((distance, other.text))
        if candidates:
            candidates.sort(key=lambda x: x[0])
            return candidates[0][1]
        return None

    def _is_lab(self, word: Word, page_words: List[Word]) -> bool:
        lab_keywords = ['LAB', 'COM LAB', 'COMPUTER LAB', 'ELECTRICAL LAB', 'PHYSICS LAB']
        for other in page_words:
            if other.text in IGNORE_WORDS:
                continue
            if any(kw in other.text.upper() for kw in lab_keywords):
                if abs(other.y_center - word.y_center) < 100:
                    return True
        return False

# ============================================================
# UTILITY FUNCTIONS
# ============================================================

def deduplicate_classes(classes: List[ClassEntry]) -> List[ClassEntry]:
    seen = set()
    unique = []
    for cls in classes:
        key = (cls.day, cls.slot, cls.course, cls.group, cls.teacher, cls.room)
        if key not in seen:
            seen.add(key)
            unique.append(cls)
    return unique

def get_sections(classes: List[ClassEntry]) -> Dict[str, List[Dict]]:
    sections = defaultdict(list)
    for cls in classes:
        sections[cls.group].append(cls.to_dict())
    return dict(sections)

# ============================================================
# MAIN
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="DIU CSE Routine PDF Parser – Auto‑Discovery & Coordinate Parsing"
    )
    parser.add_argument(
        "input", nargs="?",
        help="Input PDF file path OR URL. If omitted, auto‑discover from DIU notice page."
    )
    parser.add_argument(
        "output", nargs="?",
        help="Output JSON file path. Default: data/routine.json"
    )
    parser.add_argument(
        "--debug", action="store_true",
        help="Enable debug output"
    )
    args = parser.parse_args()

    # Determine PDF source
    pdf_path = None
    temp_pdf = None

    if args.input:
        # Could be a URL or a file path
        if args.input.startswith(('http://', 'https://')):
            # Download from URL
            temp_pdf = Path("data/temp_routine.pdf")
            temp_pdf.parent.mkdir(parents=True, exist_ok=True)
            if download_pdf(args.input, str(temp_pdf)):
                pdf_path = str(temp_pdf)
            else:
                sys.exit(1)
        else:
            # Local file
            if Path(args.input).exists():
                pdf_path = args.input
            else:
                print(f"❌ File not found: {args.input}")
                sys.exit(1)
    else:
        # Auto‑discover from DIU notice page
        print("🔍 Auto‑discovering PDF from DIU notice page...")
        pdf_url = discover_pdf_url()
        if not pdf_url:
            # Fallback to environment variable
            pdf_url = os.environ.get("ROUTINE_PDF_URL")
            if pdf_url:
                print(f"ℹ️ Using fallback URL from ROUTINE_PDF_URL")
            else:
                print("❌ Could not discover PDF and no ROUTINE_PDF_URL set.")
                sys.exit(1)
        temp_pdf = Path("data/temp_routine.pdf")
        temp_pdf.parent.mkdir(parents=True, exist_ok=True)
        if download_pdf(pdf_url, str(temp_pdf)):
            pdf_path = str(temp_pdf)
        else:
            sys.exit(1)

    # Set output path
    output_path = args.output if args.output else "data/routine.json"
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    # Parse PDF
    print(f"📖 Parsing PDF: {pdf_path}")
    parser_obj = RoutinePDFParser(debug=args.debug)
    classes = parser_obj.parse(pdf_path)
    print(f"Found {len(classes)} class entries")

    classes = deduplicate_classes(classes)
    print(f"After deduplication: {len(classes)} unique classes")

    sections = get_sections(classes)
    print(f"Found {len(sections)} sections")

    output = {
        "meta": {
            "department": "CSE",
            "version": "1.0",
            "sourcePdf": pdf_path,
            "totalClasses": len(classes),
            "totalSections": len(sections)
        },
        "sections": sections
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"✅ Output saved to: {output_path}")

    # Clean up temporary PDF
    if temp_pdf and temp_pdf.exists():
        temp_pdf.unlink()

    if args.debug:
        print("\n--- DEBUG SUMMARY (first 10 entries) ---")
        for cls in classes[:10]:
            print(f"  {cls.course} ({cls.group}) - {cls.day} {cls.start_time}-{cls.end_time}")

if __name__ == "__main__":
    main()
