#!/usr/bin/env python3
"""
DIU CSE Routine PDF Parser
Uses PyMuPDF for coordinate-based text extraction.
Reference: Routine-Scrapper-Open by AbabilX
"""

import json
import re
import sys
import argparse
from pathlib import Path
from collections import defaultdict
from typing import List, Dict, Any, Optional, Tuple

try:
    import pymupdf
except ImportError:
    print("Error: PyMuPDF not installed. Run: pip install PyMuPDF")
    sys.exit(1)


# ============================================================
# CONFIGURATION
# ============================================================

# Time slots with their X-coordinate boundaries (configurable)
# These are approximate; you can adjust based on your PDF
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

# Words to ignore (headers, labels, etc.)
IGNORE_WORDS = {
    'ROOM', 'COURSE', 'TEACHER', 'LAB', 'COM', 'RESERVED',
    'Page', 'TABLE', 'VERSION', 'Effective', 'From', 'Prepared', 'by'
}

# ============================================================
# DATA STRUCTURES
# ============================================================

class Word:
    """Represents a word extracted from the PDF with coordinates."""
    def __init__(self, page: int, x0: float, y0: float, x1: float, y1: float, text: str):
        self.page = page
        self.x0 = x0
        self.y0 = y0
        self.x1 = x1
        self.y1 = y1
        self.text = text.strip()
        self.x_center = (x0 + x1) / 2
        self.y_center = (y0 + y1) / 2
    
    def __repr__(self):
        return f"Word(page={self.page}, x={self.x_center:.2f}, y={self.y_center:.2f}, text='{self.text}')"


class ClassEntry:
    """Represents a parsed class entry."""
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
# PARSER
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
        """Parse the PDF and return class entries."""
        doc = pymupdf.open(pdf_path)
        
        for page_idx, page in enumerate(doc):
            # Get page dimensions
            rect = page.rect
            self.page_width = rect.width
            self.page_height = rect.height
            
            # Extract words with coordinates
            words_data = page.get_text("words")
            for w in words_data:
                # w format: (x0, y0, x1, y1, text, block_no, line_no, word_no)
                word = Word(
                    page=page_idx,
                    x0=w[0], y0=w[1],
                    x1=w[2], y1=w[3],
                    text=w[4]
                )
                self.words.append(word)
            
            # Sort words by Y then X (top to bottom, left to right)
            self.words.sort(key=lambda w: (w.y_center, w.x_center))
            
            # Process this page
            self._process_page(page_idx)
        
        doc.close()
        return self.classes
    
    def _process_page(self, page_idx: int):
        """Process all words on a page."""
        # Get all words on this page
        page_words = [w for w in self.words if w.page == page_idx]
        if not page_words:
            return
        
        # Find day on this page
        self._detect_day(page_words)
        
        # Find classes on this page
        self._detect_classes(page_words)
    
    def _detect_day(self, page_words: List[Word]):
        """Detect the day from the page words."""
        for word in page_words:
            text = word.text.upper()
            if DAY_RE.match(text):
                self.current_day = text.capitalize()
                if self.debug:
                    print(f"[DAY] {self.current_day} (page={word.page}, y={word.y_center:.2f})")
                break
    
    def _detect_classes(self, page_words: List[Word]):
        """Detect class entries from page words."""
        if not self.current_day:
            if self.debug:
                print(f"[WARN] No day detected on page {page_words[0].page}")
            return
        
        # Look for course patterns in each word
        for i, word in enumerate(page_words):
            # Check if this word contains a course code
            course_match = COURSE_RE.match(word.text)
            if not course_match:
                continue
            
            course = course_match.group(1).strip()
            group = course_match.group(2).strip()
            
            # Find the slot based on X-coordinate
            slot = self._get_slot(word.x_center)
            if slot is None:
                if self.debug:
                    print(f"[WARN] Could not determine slot for {course} at x={word.x_center:.2f}")
                continue
            
            # Find teacher nearby
            teacher = self._find_teacher(word, page_words)
            
            # Find room nearby
            room = self._find_room(word, page_words)
            
            # Check if it's a lab
            is_lab = self._is_lab(word, page_words)
            
            # Create entry
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
        """Determine the time slot based on X-coordinate."""
        if self.page_width == 0:
            return None
        
        ratio = x / self.page_width
        for i, (low, high) in enumerate(SLOT_EDGES):
            if low <= ratio < high:
                return i
        return None
    
    def _find_teacher(self, word: Word, page_words: List[Word]) -> Optional[str]:
        """Find teacher initials near the course word."""
        candidates = []
        
        # Look at words on the same page, within a reasonable Y range
        for other in page_words:
            if other.text == word.text:
                continue
            if other.text in IGNORE_WORDS:
                continue
            
            # Same time slot (roughly same X range)
            other_slot = self._get_slot(other.x_center)
            if other_slot != self._get_slot(word.x_center):
                continue
            
            # Within 50 pixels in Y direction
            if abs(other.y_center - word.y_center) > 50:
                continue
            
            # Check if it looks like a teacher (2-4 uppercase letters)
            if TEACHER_RE.match(other.text):
                # Score based on proximity
                distance = abs(other.x_center - word.x_center) + abs(other.y_center - word.y_center)
                candidates.append((distance, other.text))
        
        if candidates:
            candidates.sort(key=lambda x: x[0])
            return candidates[0][1]
        
        return None
    
    def _find_room(self, word: Word, page_words: List[Word]) -> Optional[str]:
        """Find room name near the course word."""
        candidates = []
        
        for other in page_words:
            if other.text == word.text:
                continue
            
            # Check if it matches room pattern
            if ROOM_RE.search(other.text):
                # Within reasonable distance
                if abs(other.y_center - word.y_center) < 80:
                    distance = abs(other.x_center - word.x_center) + abs(other.y_center - word.y_center)
                    candidates.append((distance, other.text))
        
        if candidates:
            candidates.sort(key=lambda x: x[0])
            return candidates[0][1]
        
        return None
    
    def _is_lab(self, word: Word, page_words: List[Word]) -> bool:
        """Check if this is a lab class."""
        lab_keywords = ['LAB', 'COM LAB', 'COMPUTER LAB', 'ELECTRICAL LAB', 'PHYSICS LAB']
        
        for other in page_words:
            if other.text in IGNORE_WORDS:
                continue
            if any(keyword in other.text.upper() for keyword in lab_keywords):
                # Within a reasonable distance
                if abs(other.y_center - word.y_center) < 100:
                    return True
        return False


# ============================================================
# UTILITY FUNCTIONS
# ============================================================

def deduplicate_classes(classes: List[ClassEntry]) -> List[ClassEntry]:
    """Remove duplicate class entries."""
    seen = set()
    unique = []
    
    for cls in classes:
        key = (
            cls.day,
            cls.slot,
            cls.course,
            cls.group,
            cls.teacher,
            cls.room
        )
        if key not in seen:
            seen.add(key)
            unique.append(cls)
    
    return unique


def get_sections(classes: List[ClassEntry]) -> Dict[str, List[Dict]]:
    """Group classes by section/group."""
    sections = defaultdict(list)
    
    for cls in classes:
        group = cls.group
        sections[group].append(cls.to_dict())
    
    return dict(sections)


# ============================================================
# MAIN
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="Parse DIU CSE Routine PDF")
    parser.add_argument("input", help="Input PDF file path")
    parser.add_argument("output", help="Output JSON file path")
    parser.add_argument("--debug", action="store_true", help="Enable debug output")
    args = parser.parse_args()
    
    if not Path(args.input).exists():
        print(f"Error: Input file not found: {args.input}")
        sys.exit(1)
    
    print(f"Parsing PDF: {args.input}")
    pdf_parser = RoutinePDFParser(debug=args.debug)
    classes = pdf_parser.parse(args.input)
    
    print(f"Found {len(classes)} class entries")
    
    # Deduplicate
    classes = deduplicate_classes(classes)
    print(f"After deduplication: {len(classes)} unique classes")
    
    # Group by section
    sections = get_sections(classes)
    print(f"Found {len(sections)} sections")
    
    # Build output
    output = {
        "meta": {
            "department": "CSE",
            "version": "1.0",
            "sourcePdf": args.input,
            "totalClasses": len(classes),
            "totalSections": len(sections)
        },
        "sections": sections
    }
    
    # Write output
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"Output saved to: {output_path}")
    
    if args.debug:
        print("\n--- DEBUG SUMMARY ---")
        for cls in classes[:10]:  # Show first 10 entries
            print(f"  {cls.course} ({cls.group}) - {cls.day} {cls.start_time}-{cls.end_time}")


if __name__ == "__main__":
    main()
