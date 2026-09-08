import os
import re
import json
import requests
import pdfplumber
from bs4 import BeautifulSoup
from pathlib import Path
from collections import defaultdict, Counter
from urllib.parse import urljoin


# ============================================================
# CONFIG
# ============================================================

NOTICE_URL = "https://webbackend.daffodilvarsity.edu.bd/department/cse/notice"
FALLBACK_PDF_URL = "https://webbackend.daffodilvarsity.edu.bd/download-file/4148"

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
SECTIONS_DIR = DATA_DIR / "sections"

PDF_PATH = BASE_DIR / "latest_routine.pdf"

TIME_SLOTS = [
    "08:30-10:00",
    "10:00-11:30",
    "11:30-01:00",
    "01:00-02:30",
    "02:30-04:00",
    "04:00-05:30",
]

DAYS = {
    "SATURDAY": "Saturday",
    "SUNDAY": "Sunday",
    "MONDAY": "Monday",
    "TUESDAY": "Tuesday",
    "WEDNESDAY": "Wednesday",
    "THURSDAY": "Thursday",
    "FRIDAY": "Friday",
}


# ============================================================
# HTTP SESSION
# ============================================================

session = requests.Session()

session.headers.update({
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 Chrome/140.0 Safari/537.36"
    )
})


# ============================================================
# FIND LATEST ROUTINE PDF
# KEEPING EXISTING FETCH LOGIC
# ============================================================

def find_latest_class_routine():
    """
    Finds the latest CSE class routine from DIU notice page.

    Existing fetch logic is intentionally kept:
        NOTICE PAGE
            ↓
        Notice details
            ↓
        download-file URL
            ↓
        PDF
    """

    try:
        print("Checking DIU CSE notice page...")

        response = session.get(
            NOTICE_URL,
            timeout=30
        )

        response.raise_for_status()

        soup = BeautifulSoup(
            response.text,
            "html.parser"
        )

        notices = []

        for link in soup.find_all("a", href=True):

            text = link.get_text(
                " ",
                strip=True
            )

            href = link.get("href", "").strip()

            text_lower = text.lower()

            if (
                "class routine" in text_lower
                and "exam" not in text_lower
            ):

                full_url = urljoin(
                    NOTICE_URL,
                    href
                )

                notices.append(
                    (
                        text,
                        full_url
                    )
                )

        if not notices:
            raise RuntimeError(
                "No class routine notice found."
            )

        # Usually first/latest notice is the newest.
        notice_text, notice_url = notices[0]

        print(
            f"Latest routine notice: {notice_text}"
        )

        detail_response = session.get(
            notice_url,
            timeout=30
        )

        detail_response.raise_for_status()

        detail_soup = BeautifulSoup(
            detail_response.text,
            "html.parser"
        )

        pdf_url = None

        for link in detail_soup.find_all(
            "a",
            href=True
        ):

            href = link.get("href", "")

            if "download-file" in href.lower():

                pdf_url = urljoin(
                    notice_url,
                    href
                )

                break

        # Sometimes download-file is inside an iframe/embed
        if not pdf_url:

            for tag in detail_soup.find_all(
                ["iframe", "embed"]
            ):

                src = tag.get("src", "")

                if "download-file" in src.lower():

                    pdf_url = urljoin(
                        notice_url,
                        src
                    )

                    break

        if not pdf_url:
            raise RuntimeError(
                "PDF download URL not found."
            )

        return pdf_url, notice_text

    except Exception as e:

        print(
            f"Notice page fetch failed: {e}"
        )

        print(
            "Using fallback PDF URL..."
        )

        return (
            FALLBACK_PDF_URL,
            "Fallback routine"
        )


# ============================================================
# DOWNLOAD PDF
# ============================================================

def download_pdf(pdf_url):
    print(
        f"Downloading PDF:\n{pdf_url}"
    )

    response = session.get(
        pdf_url,
        timeout=60
    )

    response.raise_for_status()

    PDF_PATH.write_bytes(
        response.content
    )

    print(
        f"PDF saved: {PDF_PATH}"
    )

    return PDF_PATH


# ============================================================
# NORMALIZE TEXT
# ============================================================

def clean_text(value):
    if value is None:
        return ""

    value = str(value)

    value = value.replace(
        "\n",
        " "
    )

    value = value.replace(
        "\r",
        " "
    )

    value = re.sub(
        r"\s+",
        " ",
        value
    )

    return value.strip()


# ============================================================
# DAY DETECTION
# ============================================================

def detect_day_from_text(text):

    if not text:
        return None

    upper = text.upper()

    for key, day in DAYS.items():

        if key in upper:
            return day

    return None


# ============================================================
# SECTION PARSING
# ============================================================

def parse_section(raw_section):
    """
    Examples:

        70_N
        67_F1
        69_J2
        RE_A
        RE_A1
    """

    raw_section = clean_text(
        raw_section
    ).upper()

    raw_section = raw_section.replace(
        " ",
        ""
    )

    # --------------------------------------------------------
    # Normal section:
    #
    # 70_N
    # 70_N1
    # 70_N2
    # 67_F
    # 67_F1
    # 67_F2
    # --------------------------------------------------------

    match = re.match(
        r"^(\d+)_([A-Z])([12]?)$",
        raw_section
    )

    if match:

        batch = match.group(1)
        section = match.group(2)
        suffix = match.group(3)

        main_section = f"{batch}_{section}"

        if suffix:
            subsection = suffix
        else:
            subsection = "Main"

        return {
            "section": main_section,
            "sub_section": subsection,
            "batch": batch,
            "section_letter": section,
        }

    # --------------------------------------------------------
    # Special section:
    #
    # RE_A
    # RE_A1
    # RE_A2
    # --------------------------------------------------------

    match = re.match(
        r"^(.+?)([12]?)$",
        raw_section
    )

    if match:

        base = match.group(1)
        suffix = match.group(2)

        if suffix and base.endswith("_"):
            base = base[:-1]

        return {
            "section": base,
            "sub_section": suffix or "Main",
            "batch": "",
            "section_letter": "",
        }

    return {
        "section": raw_section,
        "sub_section": "Main",
        "batch": "",
        "section_letter": "",
    }


# ============================================================
# COURSE PARSING
# ============================================================

COURSE_PATTERN = re.compile(
    r"^([A-Z]{2,8}\d{3,4})\((.*)\)$"
)


def parse_course(course_text):

    course_text = clean_text(
        course_text
    )

    match = COURSE_PATTERN.match(
        course_text
    )

    if not match:
        return None, None

    course_code = match.group(1)

    section = clean_text(
        match.group(2)
    )

    return course_code, section


# ============================================================
# LAB DETECTION
# ============================================================

def is_lab_room(room):
    if not room:
        return False

    return "LAB" in room.upper()


def clean_room(room):

    room = clean_text(room)

    if not room:
        return ""

    # Example:
    # KT-501(A) (COM LAB)
    #
    # becomes:
    # KT-501(A)

    room = re.sub(
        r"\s*\([^)]*LAB[^)]*\)",
        "",
        room,
        flags=re.I
    )

    return clean_text(room)


# ============================================================
# TABLE EXTRACTION
# ============================================================

def extract_tables(pdf_path):

    DATA_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    debug_dir = DATA_DIR / "debug"
    debug_dir.mkdir(
        parents=True,
        exist_ok=True
    )

    all_classes = []

    current_day = None

    raw_table_counter = 0

    print(
        "\nExtracting PDF tables..."
    )

    with pdfplumber.open(
        pdf_path
    ) as pdf:

        for page_number, page in enumerate(
            pdf.pages,
            start=1
        ):

            print(
                f"Processing page {page_number}/{len(pdf.pages)}..."
            )

            # ------------------------------------------------
            # Try to detect day from page text.
            # ------------------------------------------------

            page_text = page.extract_text() or ""

            detected_day = detect_day_from_text(
                page_text
            )

            if detected_day:
                current_day = detected_day

            if not current_day:
                print(
                    f"WARNING: Could not detect day on page {page_number}"
                )

            # ------------------------------------------------
            # Extract tables
            # ------------------------------------------------

            tables = page.extract_tables()

            if not tables:
                print(
                    f"WARNING: No table found on page {page_number}"
                )
                continue

            for table_index, table in enumerate(
                tables
            ):

                if not table:
                    continue

                raw_table_counter += 1

                # Save debug table
                debug_file = (
                    debug_dir
                    / f"page_{page_number}_table_{table_index + 1}.json"
                )

                try:

                    debug_file.write_text(
                        json.dumps(
                            table,
                            ensure_ascii=False,
                            indent=2
                        ),
                        encoding="utf-8"
                    )

                except Exception:
                    pass

                # ------------------------------------------------
                # Every logical time slot contains:
                #
                # ROOM
                # COURSE
                # TEACHER
                #
                # 6 slots × 3 = 18 columns
                # ------------------------------------------------

                for row_number, row in enumerate(
                    table
                ):

                    if not row:
                        continue

                    # Normalize cells
                    row = [
                        clean_text(cell)
                        for cell in row
                    ]

                    # ------------------------------------------------
                    # VERY IMPORTANT:
                    #
                    # Never remove empty cells.
                    #
                    # Removing empty cells causes:
                    #
                    # slot 2 → slot 1
                    # slot 3 → slot 2
                    #
                    # and classes get wrong times.
                    # ------------------------------------------------

                    if len(row) < 18:

                        row += [
                            ""
                        ] * (
                            18 - len(row)
                        )

                    # Some PDFs may contain extra cells.
                    # We only process the first 18 logical columns.
                    row = row[:18]

                    # ------------------------------------------------
                    # Process six time slots
                    # ------------------------------------------------

                    for slot_index in range(6):

                        base = slot_index * 3

                        room = row[base]
                        course_cell = row[base + 1]
                        teacher = row[base + 2]

                        if not course_cell:
                            continue

                        course_code, raw_section = parse_course(
                            course_cell
                        )

                        if not course_code:
                            continue

                        if not raw_section:
                            continue

                        section_info = parse_section(
                            raw_section
                        )

                        room_clean = clean_room(
                            room
                        )

                        class_type = (
                            "Lab"
                            if is_lab_room(room)
                            else "Theory"
                        )

                        # ------------------------------------------------
                        # Teacher cleanup
                        # ------------------------------------------------

                        teacher = clean_text(
                            teacher
                        )

                        # Some teacher cells may be merged/empty.
                        # Do not invent teacher names.
                        if teacher == "-":
                            teacher = ""

                        item = {
                            "day": current_day,
                            "time": TIME_SLOTS[slot_index],
                            "course": course_code,
                            "teacher": teacher,
                            "room": room_clean,
                            "section": section_info["section"],
                            "sub_section": section_info["sub_section"],
                            "batch": section_info["batch"],
                            "section_letter": section_info["section_letter"],
                            "type": class_type,
                            "_page": page_number,
                            "_row": row_number,
                            "_slot": slot_index,
                        }

                        all_classes.append(
                            item
                        )

    print(
        f"\nRaw classes extracted: {len(all_classes)}"
    )

    return all_classes


# ============================================================
# MERGE CONSECUTIVE LAB CLASSES
# ============================================================

def time_to_minutes(time_string):

    start, end = time_string.split("-")

    def parse_time(value):

        hour, minute = map(
            int,
            value.split(":")
        )

        # Routine times use:
        # 01:00 after 11:30
        #
        # Treat 01:00 / 02:30 / 04:00 as afternoon
        # when necessary.

        return hour * 60 + minute

    return (
        parse_time(start),
        parse_time(end)
    )


def are_consecutive(
    first_time,
    second_time
):

    _, first_end = time_to_minutes(
        first_time
    )

    second_start, _ = time_to_minutes(
        second_time
    )

    # Handle afternoon wrap:
    # 01:00 follows 11:30
    if (
        first_end == 60
        and second_start == 60
    ):
        return True

    if first_end == second_start:
        return True

    # 11:30 → 01:00
    if (
        first_time.endswith("01:00")
        and second_time.startswith("01:00")
    ):
        return True

    return False


def merge_lab_classes(classes):

    if not classes:
        return []

    # Sort chronologically using slot order.
    time_order = {
        time: index
        for index, time in enumerate(
            TIME_SLOTS
        )
    }

    classes = sorted(
        classes,
        key=lambda x: (
            x.get("day", ""),
            x.get("section", ""),
            x.get("sub_section", ""),
            time_order.get(
                x.get("time", ""),
                999
            ),
            x.get("course", ""),
        )
    )

    merged = []

    for item in classes:

        if not merged:

            merged.append(
                item.copy()
            )

            continue

        previous = merged[-1]

        same_class = (
            previous.get("day")
            == item.get("day")
            and previous.get("section")
            == item.get("section")
            and previous.get("sub_section")
            == item.get("sub_section")
            and previous.get("course")
            == item.get("course")
            and previous.get("teacher")
            == item.get("teacher")
            and previous.get("room")
            == item.get("room")
            and previous.get("type")
            == "Lab"
            and item.get("type")
            == "Lab"
        )

        if same_class and are_consecutive(
            previous["time"],
            item["time"]
        ):

            previous_start = previous["time"].split("-")[0]

            current_end = item["time"].split("-")[1]

            previous["time"] = (
                f"{previous_start}-{current_end}"
            )

        else:

            merged.append(
                item.copy()
            )

    return merged


# ============================================================
# GROUP SECTIONS
# ============================================================

def group_sections(classes):

    sections = defaultdict(list)

    for item in classes:

        section = item.get(
            "section"
        )

        if not section:
            continue

        clean_item = {
            key: value
            for key, value in item.items()
            if not key.startswith("_")
        }

        sections[section].append(
            clean_item
        )

    # Sort classes
    time_order = {
        time: index
        for index, time in enumerate(
            TIME_SLOTS
        )
    }

    for section in sections:

        sections[section].sort(
            key=lambda x: (
                x.get("day", ""),
                time_order.get(
                    x.get("time", ""),
                    999
                ),
                x.get("course", "")
            )
        )

    return sections


# ============================================================
# VALIDATION
# ============================================================

def validate_classes(classes):

    invalid = []

    duplicate_keys = []

    seen = set()

    for index, item in enumerate(
        classes
    ):

        required = [
            "day",
            "time",
            "course",
            "section",
            "sub_section",
            "room",
            "type",
        ]

        missing = [
            field
            for field in required
            if not item.get(field)
        ]

        if missing:

            invalid.append({
                "index": index,
                "missing": missing,
                "class": item,
            })

        key = (
            item.get("day"),
            item.get("time"),
            item.get("course"),
            item.get("section"),
            item.get("sub_section"),
            item.get("room"),
        )

        if key in seen:

            duplicate_keys.append({
                "index": index,
                "key": key,
            })

        seen.add(key)

    teacher_missing = [
        item
        for item in classes
        if not item.get("teacher")
    ]

    return {
        "total_classes": len(classes),
        "invalid_classes": len(invalid),
        "duplicate_classes": len(duplicate_keys),
        "missing_teacher": len(teacher_missing),
        "invalid": invalid[:100],
        "duplicates": duplicate_keys[:100],
    }


# ============================================================
# WRITE OUTPUT
# ============================================================

def write_output(
    classes,
    sections,
    validation,
    pdf_url,
    version
):

    DATA_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    SECTIONS_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    # --------------------------------------------------------
    # Main routine.json
    # --------------------------------------------------------

    routine_data = {
        "version": version,
        "pdf_url": pdf_url,
        "total_classes": len(classes),
        "total_sections": len(sections),
        "classes": classes,
        "sections": {
            section: data
            for section, data in sections.items()
        },
    }

    routine_file = (
        DATA_DIR / "routine.json"
    )

    routine_file.write_text(
        json.dumps(
            routine_data,
            ensure_ascii=False,
            indent=2
        ),
        encoding="utf-8"
    )

    # --------------------------------------------------------
    # Individual section JSON files
    # --------------------------------------------------------

    for section, section_classes in sections.items():

        safe_name = re.sub(
            r"[^A-Za-z0-9_\-]",
            "_",
            section
        )

        section_data = {
            "section": section,
            "classes": section_classes,
        }

        section_file = (
            SECTIONS_DIR
            / f"{safe_name}.json"
        )

        section_file.write_text(
            json.dumps(
                section_data,
                ensure_ascii=False,
                indent=2
            ),
            encoding="utf-8"
        )

    # --------------------------------------------------------
    # Validation
    # --------------------------------------------------------

    validation_file = (
        DATA_DIR / "validation.json"
    )

    validation_file.write_text(
        json.dumps(
            validation,
            ensure_ascii=False,
            indent=2
        ),
        encoding="utf-8"
    )

    print(
        "\nOutput generated successfully."
    )

    print(
        f"routine.json : {routine_file}"
    )

    print(
        f"sections     : {SECTIONS_DIR}"
    )

    print(
        f"classes      : {len(classes)}"
    )

    print(
        f"sections     : {len(sections)}"
    )

    print(
        f"invalid      : {validation['invalid_classes']}"
    )

    print(
        f"duplicates    : {validation['duplicate_classes']}"
    )

    print(
        f"missing teacher: {validation['missing_teacher']}"
    )


# ============================================================
# MAIN
# ============================================================

def run():

    print("=" * 60)
    print("DIU CSE ROUTINE SCRAPER")
    print("=" * 60)

    # --------------------------------------------------------
    # 1. Find PDF
    # --------------------------------------------------------

    pdf_url, version = (
        find_latest_class_routine()
    )

    print(
        f"\nPDF URL: {pdf_url}"
    )

    print(
        f"Version: {version}"
    )

    # --------------------------------------------------------
    # 2. Download PDF
    # --------------------------------------------------------

    pdf_path = download_pdf(
        pdf_url
    )

    # --------------------------------------------------------
    # 3. Extract classes from tables
    # --------------------------------------------------------

    raw_classes = extract_tables(
        pdf_path
    )

    # --------------------------------------------------------
    # 4. Merge consecutive lab slots
    # --------------------------------------------------------

    classes = merge_lab_classes(
        raw_classes
    )

    print(
        f"\nAfter lab merging: {len(classes)}"
    )

    # --------------------------------------------------------
    # 5. Remove internal fields
    # --------------------------------------------------------

    cleaned_classes = []

    for item in classes:

        clean_item = {
            key: value
            for key, value in item.items()
            if not key.startswith("_")
        }

        cleaned_classes.append(
            clean_item
        )

    # --------------------------------------------------------
    # 6. Group by section
    # --------------------------------------------------------

    sections = group_sections(
        cleaned_classes
    )

    # --------------------------------------------------------
    # 7. Validation
    # --------------------------------------------------------

    validation = validate_classes(
        cleaned_classes
    )

    # --------------------------------------------------------
    # 8. Write JSON
    # --------------------------------------------------------

    write_output(
        cleaned_classes,
        sections,
        validation,
        pdf_url,
        version
    )

    print(
        "\nScraping completed."
    )


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    run()
