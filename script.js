/* =========================================================
   DIU CSE ROUTINE
   Full Frontend Script
   ========================================================= */

'use strict';

/* =========================================================
   CONFIG
   ========================================================= */

const COMBINED_URL = './data/routine.json?t=' + Date.now();
const SECTION_BASE_URL = './data/sections/';

const STORAGE_KEY = 'diu_cse_selected_section';
const MODE_KEY = 'diu_cse_mode';
const QUERY_KEY = 'diu_cse_search';

const AUTO_REFRESH_MS = 10 * 60 * 1000;

/*
 * IMPORTANT:
 * Only these 6 standard time slots are used.
 *
 * A Lab such as 11:30-02:30 occupies:
 * 11:30-01:00 + 01:00-02:30
 *
 * It is NOT treated as a separate time column.
 */
const TIME_ORDER = [
    '08:30-10:00',
    '10:00-11:30',
    '11:30-01:00',
    '01:00-02:30',
    '02:30-04:00',
    '04:00-05:30'
];

const DISPLAY_TIME_SLOTS = [...TIME_ORDER];

const DAY_ORDER = [
    'Saturday',
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday'
];

const DAY_SHORT = {
    Saturday: 'Sat',
    Sunday: 'Sun',
    Monday: 'Mon',
    Tuesday: 'Tue',
    Wednesday: 'Wed',
    Thursday: 'Thu',
    Friday: 'Fri'
};

const DAY_MAP = {
    sat: 'Saturday',
    saturday: 'Saturday',

    sun: 'Sunday',
    sunday: 'Sunday',

    mon: 'Monday',
    monday: 'Monday',

    tue: 'Tuesday',
    tues: 'Tuesday',
    tuesday: 'Tuesday',

    wed: 'Wednesday',
    wednesday: 'Wednesday',

    thu: 'Thursday',
    thurs: 'Thursday',
    thursday: 'Thursday',

    fri: 'Friday',
    friday: 'Friday'
};


/* =========================================================
   GLOBAL STATE
   ========================================================= */

let routineData = null;
let allClasses = [];

let currentMode =
    localStorage.getItem(MODE_KEY) || 'section';

let selectedSection =
    localStorage.getItem(STORAGE_KEY) || '';

let currentQuery =
    localStorage.getItem(QUERY_KEY) || '';

let currentDay = 'Saturday';

let refreshTimer = null;

let availableSections = [];
let availableTeachers = [];
let availableRooms = [];


/* =========================================================
   BASIC HELPERS
   ========================================================= */

function $(selector) {
    return document.querySelector(selector);
}

function $all(selector) {
    return [...document.querySelectorAll(selector)];
}

function escapeHtml(value) {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalizeText(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function normalizeDay(day) {
    const key = normalizeText(day).replace(/\./g, '');

    return DAY_MAP[key] || String(day || '').trim();
}

function normalizeTime(time) {
    if (!time) return '';

    let t = String(time)
        .trim()
        .replace(/\s+/g, '')
        .replace(/[–—]/g, '-');

    t = t.replace(/\./g, ':');

    /*
     * Normalize common formats:
     * 08:30 - 10:00
     * 08.30-10.00
     */
    return t;
}

function getTodayName() {
    const today = new Date();

    const map = {
        0: 'Sunday',
        1: 'Monday',
        2: 'Tuesday',
        3: 'Wednesday',
        4: 'Thursday',
        5: 'Friday',
        6: 'Saturday'
    };

    return map[today.getDay()];
}

function isToday(day) {
    return normalizeDay(day) === getTodayName();
}

function saveState() {
    localStorage.setItem(MODE_KEY, currentMode);
    localStorage.setItem(STORAGE_KEY, selectedSection);
    localStorage.setItem(QUERY_KEY, currentQuery);
}


/* =========================================================
   SEMESTER
   ========================================================= */

function getSemester() {

    /*
     * First priority:
     * semester explicitly supplied by JSON.
     */

    if (routineData) {

        if (routineData.semester) {
            return String(routineData.semester).trim();
        }

        if (
            routineData.meta &&
            routineData.meta.semester
        ) {
            return String(
                routineData.meta.semester
            ).trim();
        }

        const possibleSemester =
            routineData.academic_session ||
            routineData.academicSession ||
            routineData.term ||
            routineData.season ||
            routineData.semester_name ||
            routineData.semesterName;

        if (possibleSemester) {
            return String(possibleSemester).trim();
        }
    }

    /*
     * Automatic fallback.
     *
     * Jan-Apr  = Spring
     * May-Aug  = Summer
     * Sep-Dec  = Fall
     */

    const now = new Date();

    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    let semester;

    if (month >= 1 && month <= 4) {
        semester = 'Spring';
    } else if (month >= 5 && month <= 8) {
        semester = 'Summer';
    } else {
        semester = 'Fall';
    }

    return `${semester} ${year}`;
}


/* =========================================================
   DATA FIELD HELPERS
   ========================================================= */

function getSection(cls) {

    return (
        cls.section ??
        cls.Section ??
        cls.section_name ??
        cls.sectionName ??
        cls.sub_section ??
        cls.subSection ??
        cls.subsection ??
        cls.batch_section ??
        cls.batchSection ??
        ''
    );
}

function getTeacher(cls) {

    return (
        cls.teacher ??
        cls.Teacher ??
        cls.faculty ??
        cls.Faculty ??
        cls.instructor ??
        cls.Instructor ??
        cls.teacher_name ??
        cls.teacherName ??
        cls.faculty_name ??
        cls.facultyName ??
        ''
    );
}

function getRoom(cls) {

    return (
        cls.room ??
        cls.Room ??
        cls.room_no ??
        cls.roomNo ??
        cls.room_number ??
        cls.roomNumber ??
        cls.classroom ??
        cls.classRoom ??
        ''
    );
}

function getCourse(cls) {

    return (
        cls.course ??
        cls.Course ??
        cls.course_name ??
        cls.courseName ??
        cls.subject ??
        cls.Subject ??
        cls.title ??
        ''
    );
}

function getCourseCode(cls) {

    return (
        cls.course_code ??
        cls.courseCode ??
        cls.code ??
        cls.Code ??
        cls.subject_code ??
        ''
    );
}

function getType(cls) {

    const value =
        cls.type ??
        cls.Type ??
        cls.class_type ??
        cls.classType ??
        cls.category ??
        '';

    const text = normalizeText(value);

    if (
        text.includes('lab') ||
        text.includes('laboratory')
    ) {
        return 'Lab';
    }

    return 'Theory';
}

function getDay(cls) {

    return normalizeDay(
        cls.day ??
        cls.Day ??
        cls.weekday ??
        cls.weekDay ??
        ''
    );
}

function getTime(cls) {

    return (
        cls.time ??
        cls.Time ??
        cls.time_slot ??
        cls.timeSlot ??
        cls.schedule ??
        ''
    );
}

function getRoutineLink(cls) {

    const candidates = [
        cls.link,
        cls.url,
        cls.routine_link,
        cls.routineLink,
        cls.pdf,
        cls.pdf_url,
        cls.pdfUrl,
        cls.notice_url,
        cls.noticeUrl,
        cls.source_url,
        cls.sourceUrl
    ];

    for (const value of candidates) {

        if (
            value &&
            typeof value === 'string' &&
            /^https?:\/\//i.test(value)
        ) {
            return value;
        }
    }

    return '';
}


/* =========================================================
   TIME PARSING
   ========================================================= */

function normalizeClock(value) {

    if (!value) return null;

    let str = String(value)
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '');

    str = str.replace(/\./g, ':');

    const match = str.match(
        /^(\d{1,2})(?::?(\d{2}))?(AM|PM)?$/
    );

    if (!match) {
        return null;
    }

    let hour = Number(match[1]);
    let minute = Number(match[2] || 0);
    const period = match[3];

    if (period === 'PM' && hour !== 12) {
        hour += 12;
    }

    if (period === 'AM' && hour === 12) {
        hour = 0;
    }

    return hour * 60 + minute;
}

function parseTimeRange(time) {

    if (!time) {
        return null;
    }

    let value = String(time)
        .trim()
        .replace(/[–—]/g, '-');

    const parts = value.split('-');

    if (parts.length !== 2) {
        return null;
    }

    const start = normalizeClock(parts[0]);
    const end = normalizeClock(parts[1]);

    if (
        start === null ||
        end === null
    ) {
        return null;
    }

    return {
        start,
        end
    };
}

function getSlotIndex(time) {

    const normalized = normalizeTime(time);

    /*
     * Exact matches first.
     */

    const exact = DISPLAY_TIME_SLOTS.findIndex(
        slot => normalizeTime(slot) === normalized
    );

    if (exact !== -1) {
        return exact;
    }

    /*
     * Handle 11:30-02:30 Lab.
     */

    const range = parseTimeRange(time);

    if (!range) {
        return -1;
    }

    const slotRanges = [
        [510, 600],   // 08:30-10
        [600, 690],   // 10-11:30
        [690, 780],   // 11:30-1
        [780, 870],   // 1-2:30
        [870, 960],   // 2:30-4
        [960, 1050]   // 4-5:30
    ];

    for (let i = 0; i < slotRanges.length; i++) {

        const [start, end] = slotRanges[i];

        if (
            range.start < end &&
            range.end > start
        ) {
            return i;
        }
    }

    return -1;
}

function isTwoSlotClass(cls) {

    const time = getTime(cls);
    const range = parseTimeRange(time);

    if (!range) {
        return false;
    }

    /*
     * 11:30-02:30 is specifically two slots.
     */

    const duration = range.end - range.start;

    return (
        duration >= 170 &&
        range.start === 690 &&
        range.end === 870
    );
}


/* =========================================================
   DATA EXTRACTION
   ========================================================= */

function extractClasses(data) {

    const result = [];

    if (!data) {
        return result;
    }

    /*
     * Direct array.
     */

    if (Array.isArray(data)) {

        data.forEach(item => {

            if (
                item &&
                typeof item === 'object' &&
                (
                    item.day ||
                    item.Day ||
                    item.time ||
                    item.Time ||
                    item.course ||
                    item.Course
                )
            ) {
                result.push(item);
            }
        });

        return result;
    }

    /*
     * Common top-level class arrays.
     */

    const directKeys = [
        'classes',
        'routine',
        'data',
        'schedule',
        'entries'
    ];

    for (const key of directKeys) {

        if (Array.isArray(data[key])) {

            result.push(
                ...extractClasses(data[key])
            );
        }
    }

    /*
     * Sections object.
     */

    if (
        data.sections &&
        typeof data.sections === 'object'
    ) {

        Object.entries(data.sections)
            .forEach(([sectionName, value]) => {

                const classes = extractClasses(value);

                classes.forEach(cls => {

                    if (!getSection(cls)) {
                        cls.section = sectionName;
                    }

                    result.push(cls);
                });
            });
    }

    /*
     * If JSON itself is:
     *
     * {
     *   "A": [...],
     *   "B": [...]
     * }
     */

    const reserved = new Set([
        'semester',
        'meta',
        'sections',
        'classes',
        'routine',
        'data',
        'schedule',
        'entries',
        'academic_session',
        'academicSession',
        'term',
        'season'
    ]);

    Object.entries(data).forEach(
        ([key, value]) => {

            if (reserved.has(key)) {
                return;
            }

            if (
                Array.isArray(value) ||
                (
                    value &&
                    typeof value === 'object'
                )
            ) {

                const classes =
                    extractClasses(value);

                classes.forEach(cls => {

                    if (!getSection(cls)) {
                        cls.section = key;
                    }

                    result.push(cls);
                });
            }
        }
    );

    return result;
}


/* =========================================================
   UNIQUE LISTS
   ========================================================= */

function rebuildIndexes() {

    const sections = new Set();
    const teachers = new Set();
    const rooms = new Set();

    allClasses.forEach(cls => {

        const section = getSection(cls);
        const teacher = getTeacher(cls);
        const room = getRoom(cls);

        if (section) {
            sections.add(String(section).trim());
        }

        if (teacher) {
            teachers.add(String(teacher).trim());
        }

        if (room) {
            rooms.add(String(room).trim());
        }
    });

    availableSections =
        [...sections].sort(
            (a, b) =>
                a.localeCompare(
                    b,
                    undefined,
                    {
                        numeric: true,
                        sensitivity: 'base'
                    }
                )
        );

    availableTeachers =
        [...teachers].sort(
            (a, b) =>
                a.localeCompare(
                    b,
                    undefined,
                    {
                        sensitivity: 'base'
                    }
                )
        );

    availableRooms =
        [...rooms].sort(
            (a, b) =>
                a.localeCompare(
                    b,
                    undefined,
                    {
                        numeric: true,
                        sensitivity: 'base'
                    }
                )
        );
}


/* =========================================================
   LOAD JSON
   ========================================================= */

async function fetchJson(url) {

    const response = await fetch(
        url,
        {
            cache: 'no-store'
        }
    );

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status}: ${url}`
        );
    }

    return response.json();
}

function sectionFileNames(section) {

    const raw = String(section || '').trim();

    const normalized = raw
        .replace(/\s+/g, '_')
        .replace(/[^\w-]/g, '');

    const lower = normalized.toLowerCase();

    return [
        `${normalized}.json`,
        `${lower}.json`,
        `${encodeURIComponent(raw)}.json`
    ];
}

async function loadSectionData(section) {

    if (!section) {
        return null;
    }

    const names = sectionFileNames(section);

    for (const name of names) {

        try {

            return await fetchJson(
                SECTION_BASE_URL +
                name +
                '?t=' +
                Date.now()
            );

        } catch (error) {
            // Try next filename.
        }
    }

    return null;
}

async function loadRoutine() {

    showLoading(true);

    try {

        /*
         * First load combined JSON.
         */

        const combined =
            await fetchJson(COMBINED_URL);

        routineData = combined;

        allClasses =
            extractClasses(combined);

        rebuildIndexes();

        /*
         * Set default section.
         */

        if (
            !selectedSection &&
            availableSections.length
        ) {
            selectedSection =
                availableSections[0];

            localStorage.setItem(
                STORAGE_KEY,
                selectedSection
            );
        }

        populateSectionSelector();

        /*
         * If selected section has its own JSON,
         * load it.
         */

        if (
            currentMode === 'section' &&
            selectedSection
        ) {

            const sectionData =
                await loadSectionData(
                    selectedSection
                );

            if (sectionData) {

                const sectionClasses =
                    extractClasses(
                        sectionData
                    );

                if (sectionClasses.length) {

                    allClasses =
                        sectionClasses.map(cls => {

                            if (!getSection(cls)) {
                                cls.section =
                                    selectedSection;
                            }

                            return cls;
                        });
                }
            }
        }

        rebuildIndexes();

        render();

        showLoading(false);

    } catch (error) {

        console.error(
            'Routine loading error:',
            error
        );

        showLoading(false);

        showError(
            'Routine data could not be loaded. ' +
            'Please refresh the page.'
        );
    }
}


/* =========================================================
   AUTO REFRESH
   ========================================================= */

function startAutoRefresh() {

    if (refreshTimer) {
        clearInterval(refreshTimer);
    }

    refreshTimer =
        setInterval(
            () => loadRoutine(),
            AUTO_REFRESH_MS
        );
}


/* =========================================================
   UI HELPERS
   ========================================================= */

function showLoading(show) {

    const elements = [
        $('#loading'),
        $('.loading'),
        $('.loading-state')
    ];

    elements.forEach(el => {

        if (el) {
            el.style.display =
                show ? '' : 'none';
        }
    });
}

function showError(message) {

    const container =
        $('#routine-container') ||
        $('#routineContainer') ||
        $('.routine-container') ||
        $('#routine');

    if (!container) {
        return;
    }

    container.innerHTML = `
        <div class="routine-error">
            <i class="fas fa-exclamation-triangle"></i>
            <div>
                <strong>Unable to load routine</strong>
                <p>${escapeHtml(message)}</p>
            </div>
        </div>
    `;
}

function getMainContainer() {

    return (
        $('#routine-container') ||
        $('#routineContainer') ||
        $('.routine-container') ||
        $('#routine') ||
        $('.routine')
    );
}


/* =========================================================
   SECTION SELECTOR
   ========================================================= */

function populateSectionSelector() {

    const selectors = [
        '#sectionSelect',
        '#section',
        '#section-selector',
        'select[name="section"]'
    ];

    let select = null;

    for (const selector of selectors) {

        const element = $(selector);

        if (element) {
            select = element;
            break;
        }
    }

    if (!select) {
        return;
    }

    select.innerHTML = '';

    availableSections.forEach(section => {

        const option =
            document.createElement('option');

        option.value = section;
        option.textContent = section;

        if (
            normalizeText(section) ===
            normalizeText(selectedSection)
        ) {
            option.selected = true;
        }

        select.appendChild(option);
    });

    select.value = selectedSection;

    select.onchange = async function () {

        selectedSection = this.value;

        localStorage.setItem(
            STORAGE_KEY,
            selectedSection
        );

        if (currentMode === 'section') {
            await loadRoutine();
        } else {
            render();
        }
    };
}


/* =========================================================
   MODE DETECTION
   ========================================================= */

function setMode(mode) {

    const allowed = [
        'section',
        'teacher',
        'room',
        'empty-room'
    ];

    if (!allowed.includes(mode)) {
        mode = 'section';
    }

    currentMode = mode;

    localStorage.setItem(
        MODE_KEY,
        currentMode
    );

    updateModeUI();

    render();
}

function updateModeUI() {

    /*
     * Common data-mode buttons.
     */

    $all('[data-mode]').forEach(btn => {

        btn.classList.toggle(
            'active',
            btn.dataset.mode === currentMode
        );
    });

    /*
     * Common nav items.
     */

    $all('.nav-item').forEach(item => {

        const text =
            normalizeText(
                item.textContent
            );

        let active = false;

        if (
            currentMode === 'section' &&
            (
                text.includes('section') ||
                text.includes('routine')
            )
        ) {
            active = true;
        }

        if (
            currentMode === 'teacher' &&
            text.includes('teacher')
        ) {
            active = true;
        }

        if (
            currentMode === 'room' &&
            text.includes('room') &&
            !text.includes('empty')
        ) {
            active = true;
        }

        if (
            currentMode === 'empty-room' &&
            text.includes('empty')
        ) {
            active = true;
        }

        item.classList.toggle(
            'active',
            active
        );
    });
}


/* =========================================================
   FILTERING
   ========================================================= */

function getFilteredClasses() {

    let classes = [...allClasses];

    if (currentMode === 'section') {

        if (!selectedSection) {
            return classes;
        }

        const selected =
            normalizeText(
                selectedSection
            );

        classes =
            classes.filter(cls =>
                normalizeText(
                    getSection(cls)
                ) === selected
            );
    }

    if (currentMode === 'teacher') {

        const query =
            normalizeText(currentQuery);

        if (!query) {
            return classes;
        }

        classes =
            classes.filter(cls => {

                const teacher =
                    normalizeText(
                        getTeacher(cls)
                    );

                const course =
                    normalizeText(
                        getCourse(cls)
                    );

                const code =
                    normalizeText(
                        getCourseCode(cls)
                    );

                const section =
                    normalizeText(
                        getSection(cls)
                    );

                return (
                    teacher.includes(query) ||
                    course.includes(query) ||
                    code.includes(query) ||
                    section.includes(query)
                );
            });
    }

    if (currentMode === 'room') {

        const query =
            normalizeText(currentQuery);

        if (!query) {
            return classes;
        }

        classes =
            classes.filter(cls => {

                const room =
                    normalizeText(
                        getRoom(cls)
                    );

                return room.includes(query);
            });
    }

    return classes;
}


/* =========================================================
   SEARCH
   ========================================================= */

function setupSearch() {

    const input =
        $('#searchInput') ||
        $('#search') ||
        $('input[type="search"]') ||
        $('.search-input');

    if (!input) {
        return;
    }

    input.value = currentQuery;

    input.addEventListener(
        'input',
        function () {

            currentQuery =
                this.value;

            localStorage.setItem(
                QUERY_KEY,
                currentQuery
            );

            if (
                currentMode === 'teacher' ||
                currentMode === 'room'
            ) {
                render();
            }
        }
    );
}


/* =========================================================
   ROUTINE LINK
   ========================================================= */

function routineLinkHtml(cls) {

    const link = getRoutineLink(cls);

    if (!link) {
        return '';
    }

    return `
        <a
            class="routine-link"
            href="${escapeHtml(link)}"
            target="_blank"
            rel="noopener noreferrer"
            title="Open routine source"
            onclick="event.stopPropagation();"
        >
            <i class="fas fa-external-link-alt"></i>
        </a>
    `;
}


/* =========================================================
   CLASS CARD
   ========================================================= */

function classCardHtml(cls) {

    const course =
        getCourse(cls);

    const code =
        getCourseCode(cls);

    const teacher =
        getTeacher(cls);

    const room =
        getRoom(cls);

    const section =
        getSection(cls);

    const type =
        getType(cls);

    const isLab =
        type === 'Lab';

    const link =
        routineLinkHtml(cls);

    return `
        <div class="routine-class-card ${
            isLab ? 'lab-card' : 'theory-card'
        }">

            <div class="routine-card-top">

                <span class="class-type ${
                    isLab ? 'lab' : 'theory'
                }">
                    ${escapeHtml(type)}
                </span>

                ${link}

            </div>

            <div class="course-name">
                ${escapeHtml(course || 'Class')}
            </div>

            ${
                code
                    ? `
                        <div class="course-code">
                            ${escapeHtml(code)}
                        </div>
                      `
                    : ''
            }

            ${
                teacher
                    ? `
                        <div class="teacher-name">
                            <i class="fas fa-user"></i>
                            ${escapeHtml(teacher)}
                        </div>
                      `
                    : ''
            }

            ${
                room
                    ? `
                        <div class="room-name">
                            <i class="fas fa-door-open"></i>
                            ${escapeHtml(room)}
                        </div>
                      `
                    : ''
            }

            ${
                currentMode !== 'section' && section
                    ? `
                        <div class="section-name">
                            <i class="fas fa-users"></i>
                            ${escapeHtml(section)}
                        </div>
                      `
                    : ''
            }

        </div>
    `;
}


/* =========================================================
   DAY HEADER
   ========================================================= */

function dayHeaderHtml(day) {

    const today =
        isToday(day);

    return `
        <span class="day-header-content">

            <i class="fas fa-calendar-alt"></i>

            <span>
                ${escapeHtml(day)}
            </span>

            ${
                today
                    ? `
                        <span
                            class="today-dot"
                            title="Today"
                            aria-label="Today"
                        ></span>
                      `
                    : ''
            }

        </span>
    `;
}


/* =========================================================
   DAY VIEW
   ========================================================= */

function renderDayView(day) {

    const container =
        getMainContainer();

    if (!container) {
        return;
    }

    const classes =
        getFilteredClasses()
            .filter(
                cls =>
                    getDay(cls) === day
            );

    let html = `
        <div class="routine-view day-view">

            <div class="routine-day-title ${
                isToday(day)
                    ? 'today'
                    : ''
            }">
                ${dayHeaderHtml(day)}
            </div>

            <div class="routine-table-wrapper">

                <table class="routine-table">

                    <thead>
                        <tr>
    `;

    DISPLAY_TIME_SLOTS.forEach(time => {

        html += `
            <th>
                ${escapeHtml(time)}
            </th>
        `;
    });

    html += `
                        </tr>
                    </thead>

                    <tbody>
                        <tr>
    `;

    const occupied =
        new Set();

    DISPLAY_TIME_SLOTS.forEach(
        (_, index) => {

            if (occupied.has(index)) {
                return;
            }

            const cls =
                classes.find(
                    item => {

                        const slot =
                            getSlotIndex(
                                getTime(item)
                            );

                        return slot === index;
                    }
                );

            if (!cls) {

                html += `
                    <td class="empty-slot">
                        <span>—</span>
                    </td>
                `;

                return;
            }

            const twoSlot =
                isTwoSlotClass(cls);

            if (twoSlot && index === 2) {

                occupied.add(2);
                occupied.add(3);

                html += `
                    <td
                        class="routine-cell lab-span-cell"
                        colspan="2"
                    >
                        ${classCardHtml(cls)}
                    </td>
                `;

                return;
            }

            occupied.add(index);

            html += `
                <td class="routine-cell">
                    ${classCardHtml(cls)}
                </td>
            `;
        }
    );

    html += `
                        </tr>
                    </tbody>

                </table>

            </div>

        </div>
    `;

    container.innerHTML = html;
}


/* =========================================================
   WEEK VIEW
   ========================================================= */

function renderWeekView() {

    const container =
        getMainContainer();

    if (!container) {
        return;
    }

    const classes =
        getFilteredClasses();

    let html = `
        <div class="routine-view week-view">

            <div class="week-grid">

    `;

    DAY_ORDER.forEach(day => {

        const dayClasses =
            classes.filter(
                cls =>
                    getDay(cls) === day
            );

        html += `
            <div class="week-day-column ${
                isToday(day)
                    ? 'today-column'
                    : ''
            }">

                <div class="week-day-header">
                    ${dayHeaderHtml(day)}
                </div>

                <div class="week-day-body">
        `;

        DISPLAY_TIME_SLOTS.forEach(
            time => {

                const index =
                    DISPLAY_TIME_SLOTS.indexOf(
                        time
                    );

                /*
                 * Don't render the second half
                 * of a two-slot lab separately.
                 */

                const previousSlot =
                    index - 1;

                const previousClass =
                    dayClasses.find(
                        cls =>
                            isTwoSlotClass(cls) &&
                            getSlotIndex(
                                getTime(cls)
                            ) === previousSlot
                    );

                if (
                    previousClass &&
                    index === 3
                ) {
                    return;
                }

                const cls =
                    dayClasses.find(
                        item =>
                            getSlotIndex(
                                getTime(item)
                            ) === index
                    );

                html += `
                    <div class="week-slot">

                        <div class="week-time">
                            ${escapeHtml(time)}
                        </div>

                        <div class="week-class">
                `;

                if (cls) {

                    html +=
                        classCardHtml(cls);

                } else {

                    html += `
                        <span class="week-empty">
                            —
                        </span>
                    `;
                }

                html += `
                        </div>

                    </div>
                `;
            }
        );

        html += `
                </div>

            </div>
        `;
    });

    html += `
            </div>

        </div>
    `;

    container.innerHTML = html;
}


/* =========================================================
   TEACHER MODE
   ========================================================= */

function renderTeacherMode() {

    const container =
        getMainContainer();

    if (!container) {
        return;
    }

    const query =
        normalizeText(currentQuery);

    if (!query) {

        container.innerHTML = `
            <div class="mode-empty">
                <i class="fas fa-chalkboard-teacher"></i>

                <h3>Teacher Mode</h3>

                <p>
                    Search for a teacher,
                    course or section.
                </p>
            </div>
        `;

        return;
    }

    const classes =
        getFilteredClasses();

    if (!classes.length) {

        container.innerHTML = `
            <div class="mode-empty">
                <i class="fas fa-search"></i>

                <h3>No Result Found</h3>

                <p>
                    No class matched
                    "${escapeHtml(currentQuery)}".
                </p>
            </div>
        `;

        return;
    }

    /*
     * Group by teacher.
     */

    const groups = {};

    classes.forEach(cls => {

        const teacher =
            getTeacher(cls) ||
            'Unknown Teacher';

        if (!groups[teacher]) {
            groups[teacher] = [];
        }

        groups[teacher].push(cls);
    });

    let html = `
        <div class="teacher-results">
    `;

    Object.entries(groups)
        .sort((a, b) =>
            a[0].localeCompare(b[0])
        )
        .forEach(
            ([teacher, teacherClasses]) => {

                html += `
                    <div class="teacher-group">

                        <div class="teacher-group-header">
                            <i class="fas fa-user-tie"></i>

                            <strong>
                                ${escapeHtml(teacher)}
                            </strong>

                            <span>
                                ${teacherClasses.length}
                                class(es)
                            </span>
                        </div>

                        <div class="teacher-class-list">
                `;

                teacherClasses
                    .sort(compareClasses)
                    .forEach(cls => {

                        html += `
                            <div class="teacher-result-card">

                                <div class="teacher-result-main">

                                    <strong>
                                        ${escapeHtml(
                                            getCourse(cls) ||
                                            'Class'
                                        )}
                                    </strong>

                                    ${
                                        getCourseCode(cls)
                                            ? `
                                                <small>
                                                    ${escapeHtml(
                                                        getCourseCode(cls)
                                                    )}
                                                </small>
                                              `
                                            : ''
                                    }

                                </div>

                                <div class="teacher-result-meta">

                                    <span>
                                        <i class="fas fa-calendar"></i>
                                        ${escapeHtml(
                                            getDay(cls)
                                        )}
                                    </span>

                                    <span>
                                        <i class="fas fa-clock"></i>
                                        ${escapeHtml(
                                            getTime(cls)
                                        )}
                                    </span>

                                    <span>
                                        <i class="fas fa-door-open"></i>
                                        ${escapeHtml(
                                            getRoom(cls) ||
                                            'N/A'
                                        )}
                                    </span>

                                    <span>
                                        <i class="fas fa-users"></i>
                                        ${escapeHtml(
                                            getSection(cls) ||
                                            'N/A'
                                        )}
                                    </span>

                                </div>

                            </div>
                        `;
                    });

                html += `
                        </div>
                    </div>
                `;
            }
        );

    html += `
        </div>
    `;

    container.innerHTML = html;
}


/* =========================================================
   ROOM MODE
   ========================================================= */

function renderRoomMode() {

    const container =
        getMainContainer();

    if (!container) {
        return;
    }

    const query =
        normalizeText(currentQuery);

    if (!query) {

        container.innerHTML = `
            <div class="mode-empty">

                <i class="fas fa-door-open"></i>

                <h3>Room Mode</h3>

                <p>
                    Search for a room number.
                </p>

            </div>
        `;

        return;
    }

    const classes =
        getFilteredClasses();

    if (!classes.length) {

        container.innerHTML = `
            <div class="mode-empty">

                <i class="fas fa-search"></i>

                <h3>No Room Found</h3>

                <p>
                    No class found in
                    "${escapeHtml(currentQuery)}".
                </p>

            </div>
        `;

        return;
    }

    const grouped = {};

    classes.forEach(cls => {

        const room =
            getRoom(cls) ||
            'Unknown Room';

        if (!grouped[room]) {
            grouped[room] = [];
        }

        grouped[room].push(cls);
    });

    let html = `
        <div class="room-results">
    `;

    Object.entries(grouped)
        .sort((a, b) =>
            a[0].localeCompare(
                b[0],
                undefined,
                {
                    numeric: true
                }
            )
        )
        .forEach(
            ([room, roomClasses]) => {

                html += `
                    <div class="room-group">

                        <div class="room-group-header">

                            <i class="fas fa-door-open"></i>

                            <strong>
                                ${escapeHtml(room)}
                            </strong>

                        </div>

                        <div class="room-class-list">
                `;

                roomClasses
                    .sort(compareClasses)
                    .forEach(cls => {

                        html += `
                            <div class="room-result-card">

                                <strong>
                                    ${escapeHtml(
                                        getCourse(cls) ||
                                        'Class'
                                    )}
                                </strong>

                                ${
                                    getCourseCode(cls)
                                        ? `
                                            <small>
                                                ${escapeHtml(
                                                    getCourseCode(cls)
                                                )}
                                            </small>
                                          `
                                        : ''
                                }

                                <div class="room-result-meta">

                                    <span>
                                        ${escapeHtml(
                                            getDay(cls)
                                        )}
                                    </span>

                                    <span>
                                        ${escapeHtml(
                                            getTime(cls)
                                        )}
                                    </span>

                                    <span>
                                        ${escapeHtml(
                                            getTeacher(cls) ||
                                            'N/A'
                                        )}
                                    </span>

                                    <span>
                                        Section:
                                        ${escapeHtml(
                                            getSection(cls) ||
                                            'N/A'
                                        )}
                                    </span>

                                </div>

                            </div>
                        `;
                    });

                html += `
                        </div>
                    </div>
                `;
            }
        );

    html += `
        </div>
    `;

    container.innerHTML = html;
}


/* =========================================================
   EMPTY ROOM
   ========================================================= */

function classOccupiesSlot(cls, slotIndex) {

    const range =
        parseTimeRange(
            getTime(cls)
        );

    if (!range) {

        return (
            getSlotIndex(
                getTime(cls)
            ) === slotIndex
        );
    }

    const slotRanges = [
        [510, 600],
        [600, 690],
        [690, 780],
        [780, 870],
        [870, 960],
        [960, 1050]
    ];

    const slot =
        slotRanges[slotIndex];

    if (!slot) {
        return false;
    }

    return (
        range.start < slot[1] &&
        range.end > slot[0]
    );
}

function getOccupiedRooms(day, slotIndex) {

    const occupied =
        new Set();

    allClasses.forEach(cls => {

        if (
            getDay(cls) !== day
        ) {
            return;
        }

        if (
            classOccupiesSlot(
                cls,
                slotIndex
            )
        ) {

            const room =
                getRoom(cls);

            if (room) {
                occupied.add(
                    normalizeText(room)
                );
            }
        }
    });

    return occupied;
}

function renderEmptyRooms() {

    const container =
        getMainContainer();

    if (!container) {
        return;
    }

    if (!availableRooms.length) {

        container.innerHTML = `
            <div class="mode-empty">

                <i class="fas fa-door-open"></i>

                <h3>No Room Data</h3>

                <p>
                    Room information is not available
                    in the routine data.
                </p>

            </div>
        `;

        return;
    }

    let html = `
        <div class="empty-room-view">

            <div class="empty-room-title">

                <i class="fas fa-door-open"></i>

                <div>
                    <h2>Empty Rooms</h2>

                    <p>
                        Rooms without a scheduled
                        class.
                    </p>
                </div>

            </div>

            <div class="empty-room-days">
    `;

    DAY_ORDER.forEach(day => {

        html += `
            <div class="empty-room-day">

                <div class="empty-room-day-header ${
                    isToday(day)
                        ? 'today'
                        : ''
                }">

                    ${dayHeaderHtml(day)}

                </div>

                <div class="empty-room-slots">
        `;

        DISPLAY_TIME_SLOTS.forEach(
            (time, slotIndex) => {

                const occupied =
                    getOccupiedRooms(
                        day,
                        slotIndex
                    );

                const empty =
                    availableRooms.filter(
                        room =>
                            !occupied.has(
                                normalizeText(room)
                            )
                    );

                html += `
                    <div class="empty-room-slot">

                        <div class="empty-room-time">
                            ${escapeHtml(time)}
                        </div>

                        <div class="empty-room-list">

                            ${
                                empty.length
                                    ? empty.map(room => `
                                        <span class="empty-room-badge">
                                            ${escapeHtml(room)}
                                        </span>
                                      `).join('')
                                    : `
                                        <span class="no-empty-room">
                                            No empty room
                                        </span>
                                      `
                            }

                        </div>

                    </div>
                `;
            }
        );

        html += `
                </div>
            </div>
        `;
    });

    html += `
            </div>
        </div>
    `;

    container.innerHTML = html;
}


/* =========================================================
   SORT
   ========================================================= */

function compareClasses(a, b) {

    const dayA =
        DAY_ORDER.indexOf(
            getDay(a)
        );

    const dayB =
        DAY_ORDER.indexOf(
            getDay(b)
        );

    if (dayA !== dayB) {
        return dayA - dayB;
    }

    const timeA =
        getSlotIndex(
            getTime(a)
        );

    const timeB =
        getSlotIndex(
            getTime(b)
        );

    return timeA - timeB;
}


/* =========================================================
   MAIN RENDER
   ========================================================= */

function render() {

    updateModeUI();

    if (currentMode === 'teacher') {

        renderTeacherMode();
        return;
    }

    if (currentMode === 'room') {

        renderRoomMode();
        return;
    }

    if (currentMode === 'empty-room') {

        renderEmptyRooms();
        return;
    }

    renderDayView(
        currentDay
    );
}


/* =========================================================
   VIEW SWITCHING
   ========================================================= */

function setupViewButtons() {

    /*
     * Day buttons.
     */

    $all('[data-day]').forEach(btn => {

        btn.addEventListener(
            'click',
            () => {

                const day =
                    normalizeDay(
                        btn.dataset.day
                    );

                if (
                    DAY_ORDER.includes(day)
                ) {

                    currentDay = day;

                    $all(
                        '[data-day]'
                    ).forEach(
                        item =>
                            item.classList.toggle(
                                'active',
                                normalizeDay(
                                    item.dataset.day
                                ) === day
                            )
                    );

                    render();
                }
            }
        );
    });

    /*
     * Week button.
     */

    const weekButtons =
        $all(
            '[data-view="week"], .week-view-btn'
        );

    weekButtons.forEach(btn => {

        btn.addEventListener(
            'click',
            () => {

                $all(
                    '[data-view]'
                ).forEach(
                    item =>
                        item.classList.remove(
                            'active'
                        )
                );

                btn.classList.add(
                    'active'
                );

                if (
                    currentMode === 'section'
                ) {
                    renderWeekView();
                }
            }
        );
    });
}


/* =========================================================
   MODE BUTTONS
   ========================================================= */

function setupModeButtons() {

    /*
     * Recommended HTML:
     *
     * <button data-mode="section">
     * <button data-mode="teacher">
     * <button data-mode="room">
     * <button data-mode="empty-room">
     */

    $all('[data-mode]')
        .forEach(btn => {

            btn.addEventListener(
                'click',
                () => {

                    setMode(
                        btn.dataset.mode
                    );
                }
            );
        });


    /*
     * Fallback for existing nav UI.
     */

    $all('.nav-item')
        .forEach(item => {

            item.addEventListener(
                'click',
                () => {

                    const mode =
                        item.dataset.mode;

                    if (mode) {

                        setMode(mode);
                        return;
                    }

                    const text =
                        normalizeText(
                            item.textContent
                        );

                    if (
                        text.includes('teacher')
                    ) {

                        setMode('teacher');

                    } else if (
                        text.includes('empty room') ||
                        text.includes('empty-room')
                    ) {

                        setMode('empty-room');

                    } else if (
                        text.includes('room')
                    ) {

                        setMode('room');

                    } else if (
                        text.includes('section') ||
                        text.includes('routine')
                    ) {

                        setMode('section');
                    }
                }
            );
        });
}


/* =========================================================
   TODAY BUTTON
   ========================================================= */

function setupTodayButton() {

    const buttons =
        $all(
            '[data-action="today"], .today-btn'
        );

    buttons.forEach(btn => {

        btn.addEventListener(
            'click',
            () => {

                currentDay =
                    getTodayName();

                currentMode =
                    'section';

                localStorage.setItem(
                    MODE_KEY,
                    'section'
                );

                render();
            }
        );
    });
}


/* =========================================================
   DOWNLOAD PNG
   ========================================================= */

function loadHtml2Canvas() {

    return new Promise(
        (resolve, reject) => {

            if (
                typeof html2canvas !==
                'undefined'
            ) {
                resolve();
                return;
            }

            const script =
                document.createElement(
                    'script'
                );

            script.src =
                'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';

            script.onload = () =>
                resolve();

            script.onerror = () =>
                reject(
                    new Error(
                        'html2canvas could not load.'
                    )
                );

            document.head.appendChild(
                script
            );
        }
    );
}


/*
 * Build a separate clean download table.
 *
 * IMPORTANT:
 * - Exactly 6 time columns.
 * - No Today green dot.
 * - Lab 11:30-02:30 = colspan 2.
 */

function createRoutineDownloadCard() {

    const classes =
        getFilteredClasses();

    const semester =
        getSemester();

    const title =
        currentMode === 'section'
            ? selectedSection ||
              'CSE Routine'
            : currentMode === 'teacher'
                ? `Teacher: ${currentQuery}`
                : currentMode === 'room'
                    ? `Room: ${currentQuery}`
                    : 'Empty Rooms';

    const wrapper =
        document.createElement(
            'div'
        );

    wrapper.id =
        'routine-download-card';

    wrapper.style.position =
        'fixed';

    wrapper.style.left =
        '-100000px';

    wrapper.style.top =
        '0';

    wrapper.style.width =
        '1500px';

    wrapper.style.padding =
        '40px';

    wrapper.style.background =
        '#ffffff';

    wrapper.style.color =
        '#111827';

    wrapper.style.fontFamily =
        'Arial, Helvetica, sans-serif';

    const header = `
        <div
            style="
                margin-bottom:25px;
                text-align:center;
            "
        >

            <div
                style="
                    font-size:30px;
                    font-weight:800;
                    margin-bottom:8px;
                "
            >
                DIU CSE ROUTINE
            </div>

            <div
                style="
                    font-size:20px;
                    font-weight:700;
                    margin-bottom:5px;
                "
            >
                ${escapeHtml(title)}
            </div>

            <div
                style="
                    font-size:15px;
                    color:#4b5563;
                "
            >
                ${escapeHtml(semester)}
            </div>

        </div>
    `;

    let table = `
        <table
            style="
                width:100%;
                border-collapse:collapse;
                table-layout:fixed;
                font-size:13px;
            "
        >

            <thead>

                <tr>

                    <th
                        style="
                            border:1px solid #111827;
                            padding:12px 8px;
                            background:#111827;
                            color:#ffffff;
                            width:120px;
                        "
                    >
                        Day
                    </th>
    `;

    DISPLAY_TIME_SLOTS.forEach(time => {

        table += `
            <th
                style="
                    border:1px solid #111827;
                    padding:12px 6px;
                    background:#111827;
                    color:#ffffff;
                "
            >
                ${escapeHtml(time)}
            </th>
        `;
    });

    table += `
                </tr>
            </thead>

            <tbody>
    `;

    DAY_ORDER.forEach(day => {

        const dayClasses =
            classes.filter(
                cls =>
                    getDay(cls) === day
            );

        table += `
            <tr>

                <td
                    style="
                        border:1px solid #9ca3af;
                        padding:12px 8px;
                        text-align:center;
                        font-weight:800;
                        background:#f3f4f6;
                    "
                >
                    ${escapeHtml(day)}
                </td>
        `;

        const occupied =
            new Set();

        for (
            let slotIndex = 0;
            slotIndex <
            DISPLAY_TIME_SLOTS.length;
            slotIndex++
        ) {

            if (
                occupied.has(
                    slotIndex
                )
            ) {
                continue;
            }

            const cls =
                dayClasses.find(
                    item => {

                        const index =
                            getSlotIndex(
                                getTime(item)
                            );

                        return (
                            index ===
                            slotIndex
                        );
                    }
                );

            if (!cls) {

                table += `
                    <td
                        style="
                            border:1px solid #9ca3af;
                            padding:10px;
                            height:90px;
                            text-align:center;
                            vertical-align:middle;
                            color:#9ca3af;
                        "
                    >
                        —
                    </td>
                `;

                continue;
            }

            const twoSlot =
                isTwoSlotClass(cls);

            /*
             * 11:30-02:30 Lab
             */

            if (
                twoSlot &&
                slotIndex === 2
            ) {

                occupied.add(2);
                occupied.add(3);

                table += `
                    <td
                        colspan="2"
                        style="
                            border:1px solid #9ca3af;
                            padding:8px;
                            height:90px;
                            vertical-align:middle;
                            background:#f9fafb;
                        "
                    >

                        ${downloadClassHtml(cls)}

                    </td>
                `;

                continue;
            }

            occupied.add(slotIndex);

            table += `
                <td
                    style="
                        border:1px solid #9ca3af;
                        padding:8px;
                        height:90px;
                        vertical-align:middle;
                        background:#ffffff;
                    "
                >

                    ${downloadClassHtml(cls)}

                </td>
            `;
        }

        table += `
            </tr>
        `;
    });

    table += `
            </tbody>

        </table>

        <div
            style="
                margin-top:20px;
                text-align:right;
                font-size:12px;
                color:#6b7280;
            "
        >
            Generated from DIU CSE Routine
        </div>
    `;

    wrapper.innerHTML =
        header + table;

    document.body.appendChild(
        wrapper
    );

    return wrapper;
}


/* =========================================================
   DOWNLOAD CLASS HTML
   ========================================================= */

function downloadClassHtml(cls) {

    const course =
        getCourse(cls);

    const code =
        getCourseCode(cls);

    const teacher =
        getTeacher(cls);

    const room =
        getRoom(cls);

    const section =
        getSection(cls);

    const type =
        getType(cls);

    const link =
        getRoutineLink(cls);

    return `
        <div
            style="
                text-align:left;
                line-height:1.35;
            "
        >

            <div
                style="
                    font-size:11px;
                    font-weight:700;
                    margin-bottom:5px;
                    text-transform:uppercase;
                "
            >
                ${escapeHtml(type)}
            </div>

            <div
                style="
                    font-size:14px;
                    font-weight:800;
                    margin-bottom:3px;
                "
            >
                ${escapeHtml(
                    course || 'Class'
                )}
            </div>

            ${
                code
                    ? `
                        <div
                            style="
                                font-size:11px;
                                font-weight:600;
                                margin-bottom:4px;
                            "
                        >
                            ${escapeHtml(code)}
                        </div>
                      `
                    : ''
            }

            ${
                teacher
                    ? `
                        <div
                            style="
                                font-size:11px;
                                margin-top:3px;
                            "
                        >
                            👤
                            ${escapeHtml(teacher)}
                        </div>
                      `
                    : ''
            }

            ${
                room
                    ? `
                        <div
                            style="
                                font-size:11px;
                                margin-top:3px;
                            "
                        >
                            🚪
                            ${escapeHtml(room)}
                        </div>
                      `
                    : ''
            }

            ${
                currentMode !== 'section' &&
                section
                    ? `
                        <div
                            style="
                                font-size:11px;
                                margin-top:3px;
                            "
                        >
                            👥
                            ${escapeHtml(section)}
                        </div>
                      `
                    : ''
            }

            ${
                link
                    ? `
                        <div
                            style="
                                font-size:10px;
                                margin-top:4px;
                            "
                        >
                            Routine source available
                        </div>
                      `
                    : ''
            }

        </div>
    `;
}


/* =========================================================
   DOWNLOAD IMAGE
   ========================================================= */

async function downloadRoutinePNG() {

    try {

        await loadHtml2Canvas();

        const card =
            createRoutineDownloadCard();

        /*
         * Wait for browser layout.
         */

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    100
                )
        );

        const canvas =
            await html2canvas(
                card,
                {
                    backgroundColor:
                        '#ffffff',

                    scale: 2,

                    useCORS: true,

                    logging: false
                }
            );

        const link =
            document.createElement(
                'a'
            );

        const safeTitle =
            (
                currentMode === 'section'
                    ? selectedSection
                    : currentQuery
            )
                .replace(
                    /[^\w\-]+/g,
                    '_'
                );

        link.download =
            `DIU_CSE_Routine_${safeTitle || 'Routine'}.png`;

        link.href =
            canvas.toDataURL(
                'image/png'
            );

        link.click();

        card.remove();

    } catch (error) {

        console.error(
            'PNG download error:',
            error
        );

        const existing =
            document.querySelector(
                '#routine-download-card'
            );

        if (existing) {
            existing.remove();
        }

        alert(
            'PNG download failed. Please try again.'
        );
    }
}


/* =========================================================
   DOWNLOAD BUTTON
   ========================================================= */

function setupDownloadButton() {

    const buttons = [
        ...$all(
            '[data-action="download"]'
        ),
        ...$all(
            '#downloadBtn'
        ),
        ...$all(
            '.download-btn'
        ),
        ...$all(
            '.png-download'
        )
    ];

    buttons.forEach(btn => {

        btn.addEventListener(
            'click',
            downloadRoutinePNG
        );
    });
}


/* =========================================================
   SEMESTER UI
   ========================================================= */

function updateSemesterUI() {

    const semester =
        getSemester();

    const elements = [
        $('#semester'),
        $('#semesterText'),
        $('.semester'),
        $('.semester-text')
    ];

    elements.forEach(el => {

        if (el) {
            el.textContent =
                semester;
        }
    });
}


/* =========================================================
   ROUTINE LINK / NOTICE LINK UI
   ========================================================= */

function getGlobalRoutineLink() {

    if (!routineData) {
        return '';
    }

    const candidates = [
        routineData.link,
        routineData.url,
        routineData.routine_link,
        routineData.routineLink,
        routineData.pdf,
        routineData.pdf_url,
        routineData.pdfUrl,
        routineData.notice_url,
        routineData.noticeUrl,
        routineData.source_url
    ];

    for (const link of candidates) {

        if (
            typeof link === 'string' &&
            /^https?:\/\//i.test(link)
        ) {
            return link;
        }
    }

    if (
        routineData.meta &&
        typeof routineData.meta === 'object'
    ) {

        const metaCandidates = [
            routineData.meta.link,
            routineData.meta.url,
            routineData.meta.routine_link,
            routineData.meta.pdf,
            routineData.meta.notice_url
        ];

        for (
            const link of metaCandidates
        ) {

            if (
                typeof link === 'string' &&
                /^https?:\/\//i.test(link)
            ) {
                return link;
            }
        }
    }

    return '';
}

function setupGlobalRoutineLink() {

    const link =
        getGlobalRoutineLink();

    if (!link) {
        return;
    }

    const elements = [
        $('#routineLink'),
        $('#noticeLink'),
        $('.routine-link-btn'),
        '[data-action="routine-link"]'
    ];

    elements.forEach(selectorOrElement => {

        const elementsFound =
            typeof selectorOrElement ===
            'string'
                ? $all(selectorOrElement)
                : [selectorOrElement];

        elementsFound.forEach(el => {

            if (!el) return;

            el.href = link;
            el.target = '_blank';
            el.rel =
                'noopener noreferrer';

            el.style.display = '';
        });
    });
}


/* =========================================================
   KEYBOARD SHORTCUTS
   ========================================================= */

function setupKeyboardShortcuts() {

    document.addEventListener(
        'keydown',
        event => {

            /*
             * Ctrl/Cmd + P
             * Browser print.
             */

            if (
                (event.ctrlKey ||
                    event.metaKey) &&
                event.key.toLowerCase() === 'p'
            ) {

                /*
                 * Let browser handle it.
                 */
                return;
            }

            /*
             * Escape clears search.
             */

            if (
                event.key === 'Escape'
            ) {

                const input =
                    $('#searchInput') ||
                    $('#search') ||
                    $('input[type="search"]');

                if (input) {

                    input.value = '';

                    currentQuery = '';

                    localStorage.setItem(
                        QUERY_KEY,
                        ''
                    );

                    render();
                }
            }
        }
    );
}


/* =========================================================
   INITIAL DAY
   ========================================================= */

function setInitialDay() {

    const today =
        getTodayName();

    if (
        DAY_ORDER.includes(today)
    ) {

        currentDay = today;

    } else {

        currentDay = 'Saturday';
    }

    /*
     * Update day buttons.
     */

    $all('[data-day]')
        .forEach(btn => {

            btn.classList.toggle(
                'active',
                normalizeDay(
                    btn.dataset.day
                ) === currentDay
            );
        });
}


/* =========================================================
   TODAY DOT CSS
   ========================================================= */

function injectTodayDotCSS() {

    if (
        document.getElementById(
            'diu-routine-extra-css'
        )
    ) {
        return;
    }

    const style =
        document.createElement(
            'style'
        );

    style.id =
        'diu-routine-extra-css';

    style.textContent = `

        .day-header-content {
            display:inline-flex;
            align-items:center;
            justify-content:center;
            gap:8px;
        }

        .today-dot {
            display:inline-block;
            width:9px;
            height:9px;
            min-width:9px;
            border-radius:50%;
            background:#22c55e;
            box-shadow:
                0 0 0 3px
                rgba(34,197,94,.15);
        }

        .routine-day-title.today {
            position:relative;
        }

        .week-day-header .today-dot {
            width:9px;
            height:9px;
        }

        .today-column
        .week-day-header {
            border-color:#22c55e !important;
        }

        .empty-room-day-header.today {
            border-color:#22c55e !important;
        }

    `;

    document.head.appendChild(
        style
    );
}


/* =========================================================
   DOM READY
   ========================================================= */

document.addEventListener(
    'DOMContentLoaded',
    async () => {

        injectTodayDotCSS();

        setInitialDay();

        setupModeButtons();

        setupViewButtons();

        setupTodayButton();

        setupSearch();

        setupDownloadButton();

        setupKeyboardShortcuts();

        await loadRoutine();

        updateSemesterUI();

        setupGlobalRoutineLink();

        startAutoRefresh();

    }
);


/* =========================================================
   PUBLIC FUNCTIONS
   ========================================================= */

window.loadRoutine =
    loadRoutine;

window.setMode =
    setMode;

window.render =
    render;

window.renderWeekView =
    renderWeekView;

window.renderEmptyRooms =
    renderEmptyRooms;

window.downloadRoutinePNG =
    downloadRoutinePNG;

window.getSemester =
    getSemester;

window.getTodayName =
    getTodayName;

window.isToday =
    isToday;


/* =========================================================
   OPTIONAL GLOBAL HELPERS
   ========================================================= */

window.showTeacherMode =
    function () {
        setMode('teacher');
    };

window.showRoomMode =
    function () {
        setMode('room');
    };

window.showEmptyRooms =
    function () {
        setMode('empty-room');
    };

window.showSectionMode =
    function () {
        setMode('section');
    };
