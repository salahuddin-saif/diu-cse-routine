/* =========================================================
   DIU CSE ROUTINE
   FULL FRONTEND SCRIPT
   ========================================================= */

'use strict';


/* =========================================================
   CONFIG
   ========================================================= */

const COMBINED_URL =
    './data/routine.json?t=' + Date.now();

const SECTION_BASE_URL =
    './data/sections/';

const STORAGE_KEY =
    'diu_cse_selected_section';

const MODE_KEY =
    'diu_cse_mode';

const QUERY_KEY =
    'diu_cse_search';

const AUTO_REFRESH_MS =
    10 * 60 * 1000;


/*
 * =========================================================
 * STANDARD TIME SLOTS
 * =========================================================
 *
 * Only these 6 slots are used.
 *
 * 11:30-02:30 Lab =
 * 11:30-01:00
 * +
 * 01:00-02:30
 *
 * Therefore Lab is rendered with rowspan="2"
 * in the proper week table.
 */

const TIME_ORDER = [
    '08:30-10:00',
    '10:00-11:30',
    '11:30-01:00',
    '01:00-02:30',
    '02:30-04:00',
    '04:00-05:30'
];

const DISPLAY_TIME_SLOTS =
    [...TIME_ORDER];


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
    localStorage.getItem(MODE_KEY) ||
    'section';

let selectedSection =
    localStorage.getItem(STORAGE_KEY) ||
    '';

let currentQuery =
    localStorage.getItem(QUERY_KEY) ||
    '';

let currentDay =
    'Saturday';

let refreshTimer = null;

let availableSections = [];

let availableTeachers = [];

let availableRooms = [];


/*
 * Current view.
 *
 * Keeping this separate makes sure that
 * switching/searching does not accidentally
 * reset Day / Week view.
 */

let currentView = 'day';


/* =========================================================
   BASIC HELPERS
   ========================================================= */

function $(selector) {

    return document.querySelector(selector);
}


function $all(selector) {

    return [
        ...document.querySelectorAll(selector)
    ];
}


function escapeHtml(value) {

    if (
        value === null ||
        value === undefined
    ) {
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

    const key =
        normalizeText(day)
            .replace(/\./g, '');

    return (
        DAY_MAP[key] ||
        String(day || '').trim()
    );
}


function normalizeTime(time) {

    if (!time) {
        return '';
    }

    let t =
        String(time)
            .trim()
            .replace(/\s+/g, '')
            .replace(/[–—]/g, '-');

    t =
        t.replace(/\./g, ':');

    return t;
}


function getTodayName() {

    const today =
        new Date();

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

    return (
        normalizeDay(day) ===
        getTodayName()
    );
}


function saveState() {

    localStorage.setItem(
        MODE_KEY,
        currentMode
    );

    localStorage.setItem(
        STORAGE_KEY,
        selectedSection
    );

    localStorage.setItem(
        QUERY_KEY,
        currentQuery
    );
}


/* =========================================================
   SEMESTER
   ========================================================= */

function getSemester() {

    if (routineData) {

        if (routineData.semester) {

            return String(
                routineData.semester
            ).trim();
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

            return String(
                possibleSemester
            ).trim();
        }
    }


    const now =
        new Date();

    const month =
        now.getMonth() + 1;

    const year =
        now.getFullYear();

    let semester;

    if (
        month >= 1 &&
        month <= 4
    ) {

        semester = 'Spring';

    } else if (
        month >= 5 &&
        month <= 8
    ) {

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

    const text =
        normalizeText(value);

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


    for (
        const value of candidates
    ) {

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

    if (!value) {
        return null;
    }

    let str =
        String(value)
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '');

    str =
        str.replace(/\./g, ':');

    const match =
        str.match(
            /^(\d{1,2})(?::?(\d{2}))?(AM|PM)?$/
        );

    if (!match) {
        return null;
    }

    let hour =
        Number(match[1]);

    const minute =
        Number(match[2] || 0);

    const period =
        match[3];


    if (
        period === 'PM' &&
        hour !== 12
    ) {

        hour += 12;
    }


    if (
        period === 'AM' &&
        hour === 12
    ) {

        hour = 0;
    }


    return (
        hour * 60 +
        minute
    );
}


function parseTimeRange(time) {

    if (!time) {
        return null;
    }

    let value =
        String(time)
            .trim()
            .replace(/[–—]/g, '-');

    const parts =
        value.split('-');

    if (
        parts.length !== 2
    ) {

        return null;
    }

    const start =
        normalizeClock(parts[0]);

    const end =
        normalizeClock(parts[1]);


    if (
        start === null ||
        end === null
    ) {

        return null;
    }


    /*
     * Handle ranges crossing noon/midnight.
     *
     * Example:
     * 11:30 -> 02:30
     *
     * Since DIU routine uses 12-hour display,
     * 02:30 after 11:30 means 14:30.
     */

    let fixedEnd = end;

    if (
        fixedEnd <= start
    ) {

        fixedEnd += 12 * 60;

        if (
            fixedEnd <= start
        ) {
            fixedEnd += 12 * 60;
        }
    }


    return {
        start,
        end: fixedEnd
    };
}


function getSlotIndex(time) {

    const normalized =
        normalizeTime(time);


    /*
     * Exact matches first.
     */

    const exact =
        DISPLAY_TIME_SLOTS.findIndex(
            slot =>
                normalizeTime(slot) ===
                normalized
        );


    if (exact !== -1) {
        return exact;
    }


    const range =
        parseTimeRange(time);


    if (!range) {
        return -1;
    }


    const slotRanges = [

        [510, 600],
        [600, 690],
        [690, 780],
        [780, 870],
        [870, 960],
        [960, 1050]
    ];


    for (
        let i = 0;
        i < slotRanges.length;
        i++
    ) {

        const [
            start,
            end
        ] = slotRanges[i];


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

    const type =
        getType(cls);

    const range =
        parseTimeRange(
            getTime(cls)
        );


    if (!range) {
        return false;
    }


    /*
     * ONLY Lab 11:30-02:30
     */

    return (
        type === 'Lab' &&
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
     * Common top-level arrays.
     */

    const directKeys = [

        'classes',
        'routine',
        'data',
        'schedule',
        'entries'
    ];


    for (
        const key of directKeys
    ) {

        if (
            Array.isArray(data[key])
        ) {

            result.push(
                ...extractClasses(
                    data[key]
                )
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

        Object.entries(
            data.sections
        ).forEach(
            ([sectionName, value]) => {

                const classes =
                    extractClasses(value);


                classes.forEach(cls => {

                    if (
                        !getSection(cls)
                    ) {

                        cls.section =
                            sectionName;
                    }


                    result.push(cls);
                });
            }
        );
    }


    /*
     * JSON:
     *
     * {
     *   "70_N": [...],
     *   "71_A": [...]
     * }
     */

    const reserved =
        new Set([

            'semester',
            'meta',
            'metadata',

            'sections',
            'classes',
            'routine',
            'data',
            'schedule',
            'entries',

            'academic_session',
            'academicSession',

            'term',
            'season',

            'version',
            'updated',
            'lastUpdated'
        ]);


    Object.entries(
        data
    ).forEach(
        ([key, value]) => {

            if (
                reserved.has(key)
            ) {
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

                    if (
                        !getSection(cls)
                    ) {

                        cls.section =
                            key;
                    }


                    result.push(cls);
                });
            }
        }
    );


    return result;
}


/* =========================================================
   SECTION HELPERS
   ========================================================= */

/*
 * Example:
 *
 * 70_N
 * 70_N1
 * 70_N2
 *
 * Base section of 70_N1 = 70_N
 */

function getBaseSection(section) {

    const value =
        String(section || '')
            .trim()
            .replace(/\s+/g, '_');


    return value.replace(
        /_(\d+)$/i,
        ''
    );
}


function getSectionMatches(
    classSection,
    targetSection
) {

    const a =
        normalizeText(
            classSection
        );

    const b =
        normalizeText(
            targetSection
        );


    if (!a || !b) {
        return false;
    }


    /*
     * Exact section.
     */

    if (a === b) {
        return true;
    }


    /*
     * Base section match.
     *
     * 70_N1 / 70_N2
     * belongs to 70_N.
     */

    const baseA =
        normalizeText(
            getBaseSection(a)
        );

    const baseB =
        normalizeText(
            getBaseSection(b)
        );


    return (
        baseA === baseB
    );
}


function mergeSectionClasses(
    classes,
    section
) {

    const target =
        normalizeText(section);


    const result =
        classes.filter(
            cls =>
                getSectionMatches(
                    getSection(cls),
                    target
                )
        );


    return removeDuplicateClasses(
        result
    );
}


/* =========================================================
   UNIQUE LISTS
   ========================================================= */

function getClassUniqueKey(cls) {

    return [

        normalizeText(getDay(cls)),
        normalizeTime(getTime(cls)),
        normalizeText(getCourseCode(cls)),
        normalizeText(getCourse(cls)),
        normalizeText(getTeacher(cls)),
        normalizeText(getRoom(cls)),
        normalizeText(getSection(cls))
    ].join('|');
}


function removeDuplicateClasses(classes) {

    const seen =
        new Set();

    const result = [];


    classes.forEach(cls => {

        const key =
            getClassUniqueKey(cls);


        if (
            seen.has(key)
        ) {
            return;
        }


        seen.add(key);

        result.push(cls);
    });


    return result;
}


function rebuildIndexes() {

    const sections =
        new Set();

    const teachers =
        new Set();

    const rooms =
        new Set();


    allClasses.forEach(cls => {

        const section =
            getSection(cls);

        const teacher =
            getTeacher(cls);

        const room =
            getRoom(cls);


        if (section) {

            sections.add(
                String(section).trim()
            );
        }


        if (teacher) {

            teachers.add(
                String(teacher).trim()
            );
        }


        if (room) {

            rooms.add(
                String(room).trim()
            );
        }
    });


    availableSections =
        [...sections].sort(
            naturalCompare
        );


    availableTeachers =
        [...teachers].sort(
            naturalCompare
        );


    availableRooms =
        [...rooms].sort(
            naturalCompare
        );
}


/* =========================================================
   NATURAL SORT
   ========================================================= */

function naturalCompare(a, b) {

    return String(a)
        .localeCompare(
            String(b),
            undefined,
            {
                numeric: true,
                sensitivity: 'base'
            }
        );
}


/* =========================================================
   LOAD JSON
   ========================================================= */

async function fetchJson(url) {

    const response =
        await fetch(
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

    const raw =
        String(section || '')
            .trim();


    const normalized =
        raw
            .replace(/\s+/g, '_')
            .replace(/[^\w-]/g, '');


    const lower =
        normalized.toLowerCase();


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


    const names =
        sectionFileNames(section);


    for (
        const name of names
    ) {

        try {

            return await fetchJson(
                SECTION_BASE_URL +
                name +
                '?t=' +
                Date.now()
            );

        } catch (error) {

            /*
             * Try next filename.
             */
        }
    }


    return null;
}


/* =========================================================
   LOAD ROUTINE
   ========================================================= */

async function loadRoutine() {

    showLoading(true);


    try {

        /*
         * Always load combined JSON first.
         */

        const combined =
            await fetchJson(
                COMBINED_URL
            );


        routineData =
            combined;


        allClasses =
            extractClasses(
                combined
            );


        allClasses =
            removeDuplicateClasses(
                allClasses
            );


        rebuildIndexes();


        /*
         * Default section.
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
         * Section-specific JSON.
         *
         * Existing behavior preserved.
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

                let sectionClasses =
                    extractClasses(
                        sectionData
                    );


                /*
                 * If the section JSON itself
                 * contains subsection keys,
                 * merge them all.
                 */

                if (
                    !sectionClasses.length
                ) {

                    sectionClasses =
                        extractClasses(
                            sectionData
                        );
                }


                if (
                    sectionClasses.length
                ) {

                    sectionClasses =
                        sectionClasses.map(
                            cls => {

                                if (
                                    !getSection(cls)
                                ) {

                                    cls.section =
                                        selectedSection;
                                }

                                return cls;
                            }
                        );


                    /*
                     * If selected section is 70_N,
                     * also allow 70_N1 / 70_N2
                     * inside that JSON.
                     */

                    const merged =
                        mergeSectionClasses(
                            sectionClasses,
                            selectedSection
                        );


                    if (
                        merged.length
                    ) {

                        allClasses =
                            merged;

                    } else {

                        allClasses =
                            sectionClasses;
                    }
                }
            }
        }


        allClasses =
            removeDuplicateClasses(
                allClasses
            );


        rebuildIndexes();

        updateSemesterUI();

        setupGlobalRoutineLink();

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

        clearInterval(
            refreshTimer
        );
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
        getMainContainer();


    if (!container) {
        return;
    }


    container.innerHTML = `

        <div class="routine-error">

            <i class="fas fa-exclamation-triangle"></i>

            <div>

                <strong>
                    Unable to load routine
                </strong>

                <p>
                    ${escapeHtml(message)}
                </p>

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


    for (
        const selector of selectors
    ) {

        const element =
            $(selector);


        if (element) {

            select =
                element;

            break;
        }
    }


    if (!select) {
        return;
    }


    select.innerHTML = '';


    availableSections.forEach(
        section => {

            const option =
                document.createElement(
                    'option'
                );


            option.value =
                section;


            option.textContent =
                section;


            if (
                normalizeText(section) ===
                normalizeText(selectedSection)
            ) {

                option.selected =
                    true;
            }


            select.appendChild(
                option
            );
        }
    );


    select.value =
        selectedSection;


    select.onchange =
        async function () {

            selectedSection =
                this.value;


            localStorage.setItem(
                STORAGE_KEY,
                selectedSection
            );


            if (
                currentMode ===
                'section'
            ) {

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


    if (
        !allowed.includes(mode)
    ) {

        mode = 'section';
    }


    currentMode =
        mode;


    localStorage.setItem(
        MODE_KEY,
        currentMode
    );


    updateModeUI();

    render();
}


function updateModeUI() {

    $all('[data-mode]')
        .forEach(btn => {

            btn.classList.toggle(
                'active',
                btn.dataset.mode ===
                currentMode
            );
        });


    $all('.nav-item')
        .forEach(item => {

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

    let classes =
        [...allClasses];


    if (
        currentMode === 'section'
    ) {

        if (!selectedSection) {
            return classes;
        }


        classes =
            classes.filter(
                cls =>
                    getSectionMatches(
                        getSection(cls),
                        selectedSection
                    )
            );
    }


    if (
        currentMode === 'teacher'
    ) {

        const query =
            normalizeText(
                currentQuery
            );


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


    if (
        currentMode === 'room'
    ) {

        const query =
            normalizeText(
                currentQuery
            );


        if (!query) {
            return classes;
        }


        classes =
            classes.filter(cls => {

                const room =
                    normalizeText(
                        getRoom(cls)
                    );


                return room.includes(
                    query
                );
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


    input.value =
        currentQuery;


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
                currentMode ===
                'teacher' ||
                currentMode ===
                'room'
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

    const link =
        getRoutineLink(cls);


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
            isLab
                ? 'lab-card'
                : 'theory-card'
        }">

            <div class="routine-card-top">

                <span class="class-type ${
                    isLab
                        ? 'lab'
                        : 'theory'
                }">

                    ${escapeHtml(type)}

                </span>

                ${link}

            </div>


            <div class="course-name">

                ${escapeHtml(
                    course || 'Class'
                )}

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

                            ${escapeHtml(
                                teacher
                            )}

                        </div>

                      `
                    : ''
            }


            ${
                room
                    ? `

                        <div class="room-name">

                            <i class="fas fa-door-open"></i>

                            ${escapeHtml(
                                room
                            )}

                        </div>

                      `
                    : ''
            }


            ${
                currentMode !== 'section' &&
                section
                    ? `

                        <div class="section-name">

                            <i class="fas fa-users"></i>

                            ${escapeHtml(
                                section
                            )}

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
   CLASS LOOKUP
   ========================================================= */

/*
 * Get classes that belong to a particular
 * standard time slot.
 */

function getClassesForSlot(
    classes,
    slotIndex
) {

    return classes.filter(
        cls =>
            getSlotIndex(
                getTime(cls)
            ) === slotIndex
    );
}


/*
 * Find the two-slot lab starting at
 * 11:30.
 */

function getTwoSlotLab(
    classes
) {

    return classes.find(
        cls =>
            isTwoSlotClass(cls) &&
            getSlotIndex(
                getTime(cls)
            ) === 2
    );
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
            )
            .sort(compareClasses);


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


    DISPLAY_TIME_SLOTS.forEach(
        time => {

            html += `

                <th>

                    ${escapeHtml(time)}

                </th>

            `;
        }
    );


    html += `

                        </tr>

                    </thead>

                    <tbody>

                        <tr>
    `;


    const lab =
        getTwoSlotLab(
            classes
        );


    const labRendered =
        !!lab;


    for (
        let index = 0;
        index <
        DISPLAY_TIME_SLOTS.length;
        index++
    ) {

        /*
         * If 11:30 lab occupies 11:30-01
         * and 01-02:30, then skip slot 3.
         */

        if (
            index === 3 &&
            labRendered
        ) {

            continue;
        }


        const slotClasses =
            getClassesForSlot(
                classes,
                index
            );


        const cls =
            slotClasses[0];


        /*
         * Lab at slot 2 gets colspan 2
         * in Day View.
         */

        if (
            index === 2 &&
            lab
        ) {

            html += `

                <td
                    class="routine-cell lab-span-cell"
                    colspan="2"
                >

                    ${classCardHtml(lab)}

                </td>

            `;

            continue;
        }


        if (!cls) {

            html += `

                <td class="empty-slot">

                    <span>—</span>

                </td>

            `;

            continue;
        }


        html += `

            <td class="routine-cell">

                ${classCardHtml(cls)}

            </td>

        `;
    }


    html += `

                        </tr>

                    </tbody>

                </table>

            </div>

        </div>

    `;


    container.innerHTML =
        html;
}


/* =========================================================
   WEEK TABLE MODEL
   ========================================================= */

/*
 * This is the important table fix.
 *
 * Instead of hiding a whole row whenever a Lab exists,
 * we determine exactly which cell is occupied.
 *
 * Every day has 6 slots.
 *
 * Lab 11:30-02:30:
 *
 * slot 2 -> rowspan="2"
 * slot 3 -> skipped ONLY because slot 2 lab exists.
 */

function buildWeekDayCells(
    dayClasses
) {

    const cells = [];

    const lab =
        getTwoSlotLab(
            dayClasses
        );


    for (
        let slotIndex = 0;
        slotIndex <
        DISPLAY_TIME_SLOTS.length;
        slotIndex++
    ) {

        /*
         * Second half of the 2-slot lab.
         */

        if (
            slotIndex === 3 &&
            lab
        ) {

            continue;
        }


        const slotClasses =
            getClassesForSlot(
                dayClasses,
                slotIndex
            );


        const cls =
            slotClasses[0];


        /*
         * Two-slot lab.
         */

        if (
            slotIndex === 2 &&
            lab
        ) {

            cells.push({

                slotIndex,

                rowspan: 2,

                colspan: 1,

                type: 'lab-span',

                classData: lab,

                extraClasses:
                    slotClasses.slice(1)

            });

            continue;
        }


        /*
         * Normal class.
         */

        cells.push({

            slotIndex,

            rowspan: 1,

            colspan: 1,

            type: cls
                ? 'class'
                : 'empty',

            classData:
                cls || null,

            extraClasses: []
        });
    }


    return cells;
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

            <div class="week-table-wrapper">

                <table class="week-routine-table">

                    <colgroup>

                        <col class="week-day-col">

    `;


    DISPLAY_TIME_SLOTS.forEach(
        () => {

            html += `
                <col class="week-time-col">
            `;
        }
    );


    html += `

                    </colgroup>

                    <thead>

                        <tr>

                            <th class="week-day-heading">
                                Day
                            </th>

    `;


    DISPLAY_TIME_SLOTS.forEach(
        time => {

            html += `

                <th class="week-time-heading">

                    ${escapeHtml(time)}

                </th>

            `;
        }
    );


    html += `

                        </tr>

                    </thead>

                    <tbody>

    `;


    DAY_ORDER.forEach(day => {

        const dayClasses =
            classes
                .filter(
                    cls =>
                        getDay(cls) === day
                )
                .sort(compareClasses);


        const cells =
            buildWeekDayCells(
                dayClasses
            );


        html += `

            <tr class="${
                isToday(day)
                    ? 'today-row'
                    : ''
            }">

                <th
                    class="week-day-cell ${
                        isToday(day)
                            ? 'today-day-cell'
                            : ''
                    }"
                >

                    ${dayHeaderHtml(day)}

                </th>

        `;


        cells.forEach(cell => {

            if (
                cell.type === 'empty'
            ) {

                html += `

                    <td
                        class="
                            week-routine-cell
                            week-empty-cell
                        "
                    >

                        <span>—</span>

                    </td>

                `;

                return;
            }


            if (
                cell.type === 'lab-span'
            ) {

                html += `

                    <td
                        rowspan="2"
                        class="
                            week-routine-cell
                            week-lab-cell
                        "
                    >

                        ${classCardHtml(
                            cell.classData
                        )}

                    </td>

                `;

                return;
            }


            html += `

                <td
                    class="
                        week-routine-cell
                        week-class-cell
                    "
                >

                    ${classCardHtml(
                        cell.classData
                    )}

                </td>

            `;
        });


        html += `

            </tr>

        `;
    });


    html += `

                    </tbody>

                </table>

            </div>

        </div>

    `;


    container.innerHTML =
        html;
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
        normalizeText(
            currentQuery
        );


    if (!query) {

        container.innerHTML = `

            <div class="mode-empty">

                <i class="fas fa-chalkboard-teacher"></i>

                <h3>
                    Teacher Mode
                </h3>

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

                <h3>
                    No Result Found
                </h3>

                <p>
                    No class matched
                    "${escapeHtml(currentQuery)}".
                </p>

            </div>

        `;

        return;
    }


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
        .sort(
            (a, b) =>
                naturalCompare(
                    a[0],
                    b[0]
                )
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


    container.innerHTML =
        html;
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
        normalizeText(
            currentQuery
        );


    if (!query) {

        container.innerHTML = `

            <div class="mode-empty">

                <i class="fas fa-door-open"></i>

                <h3>
                    Room Mode
                </h3>

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

                <h3>
                    No Room Found
                </h3>

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
        .sort(
            (a, b) =>
                naturalCompare(
                    a[0],
                    b[0]
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


    container.innerHTML =
        html;
}


/* =========================================================
   EMPTY ROOM
   ========================================================= */

function classOccupiesSlot(
    cls,
    slotIndex
) {

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


function normalizeRoomList(roomValue) {

    if (!roomValue) {
        return [];
    }


    return String(roomValue)
        .split(/[;,/]+/)
        .map(
            room =>
                room.trim()
        )
        .filter(Boolean);
}


function getOccupiedRooms(
    day,
    slotIndex
) {

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

            const rooms =
                normalizeRoomList(
                    getRoom(cls)
                );


            rooms.forEach(room => {

                occupied.add(
                    normalizeText(room)
                );
            });
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

                <h3>
                    No Room Data
                </h3>

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

                    <h2>
                        Empty Rooms
                    </h2>

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
                                normalizeText(
                                    room
                                )
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
                                    ? empty
                                        .map(
                                            room => `

                                                <span
                                                    class="empty-room-badge"
                                                >
                                                    ${escapeHtml(
                                                        room
                                                    )}
                                                </span>

                                            `
                                        )
                                        .join('')
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


    container.innerHTML =
        html;
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


    if (
        dayA !== dayB
    ) {

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


    if (
        currentMode === 'teacher'
    ) {

        renderTeacherMode();
        return;
    }


    if (
        currentMode === 'room'
    ) {

        renderRoomMode();
        return;
    }


    if (
        currentMode === 'empty-room'
    ) {

        renderEmptyRooms();
        return;
    }


    if (
        currentView === 'week'
    ) {

        renderWeekView();

    } else {

        renderDayView(
            currentDay
        );
    }
}


/* =========================================================
   VIEW SWITCHING
   ========================================================= */

function setupViewButtons() {

    /*
     * Day buttons.
     */

    $all('[data-day]')
        .forEach(btn => {

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

                        currentDay =
                            day;

                        currentView =
                            'day';


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


                        $all(
                            '[data-view]'
                        ).forEach(
                            item =>
                                item.classList.remove(
                                    'active'
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

                currentView =
                    'week';


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
                    currentMode ===
                    'section'
                ) {

                    renderWeekView();
                }
            }
        );
    });


    /*
     * Optional Day button.
     */

    $all(
        '[data-view="day"], .day-view-btn'
    ).forEach(btn => {

        btn.addEventListener(
            'click',
            () => {

                currentView =
                    'day';


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


                render();
            }
        );
    });
}


/* =========================================================
   MODE BUTTONS
   ========================================================= */

function setupModeButtons() {

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

                        setMode(
                            'teacher'
                        );

                    } else if (
                        text.includes('empty room') ||
                        text.includes('empty-room')
                    ) {

                        setMode(
                            'empty-room'
                        );

                    } else if (
                        text.includes('room')
                    ) {

                        setMode(
                            'room'
                        );

                    } else if (
                        text.includes('section') ||
                        text.includes('routine')
                    ) {

                        setMode(
                            'section'
                        );
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

                currentView =
                    'day';


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
   DOWNLOAD - HTML2CANVAS
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


            script.onload =
                () => resolve();


            script.onerror =
                () =>
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


/* =========================================================
   DOWNLOAD CARD CSS
   ========================================================= */

function getDownloadStyles() {

    return `

        * {
            box-sizing:border-box;
        }

        #routine-download-card {

            width:1600px;

            padding:48px;

            background:#f8fafc;

            color:#0f172a;

            font-family:
                Arial,
                Helvetica,
                sans-serif;
        }


        .download-header {

            background:#0f172a;

            border-radius:20px;

            padding:34px 38px;

            margin-bottom:28px;

            color:#ffffff;
        }


        .download-brand {

            font-size:16px;

            font-weight:700;

            letter-spacing:2px;

            margin-bottom:8px;
        }


        .download-title {

            font-size:34px;

            line-height:1.15;

            font-weight:800;

            margin-bottom:8px;
        }


        .download-subtitle {

            font-size:16px;

            color:#cbd5e1;

            margin-bottom:22px;
        }


        .download-meta {

            display:flex;

            gap:10px;

            flex-wrap:wrap;
        }


        .download-pill {

            display:inline-block;

            padding:8px 14px;

            border-radius:999px;

            background:#1e293b;

            border:1px solid #334155;

            color:#f8fafc;

            font-size:12px;

            font-weight:700;
        }


        .download-table-wrap {

            background:#ffffff;

            border:1px solid #cbd5e1;

            border-radius:16px;

            overflow:hidden;
        }


        .download-table {

            width:100%;

            border-collapse:collapse;

            table-layout:fixed;

            font-size:13px;
        }


        .download-table th {

            background:#1e293b;

            color:#ffffff;

            border-right:1px solid #475569;

            border-bottom:1px solid #475569;

            padding:14px 8px;

            text-align:center;

            vertical-align:middle;

            font-weight:800;
        }


        .download-table th:last-child {

            border-right:0;
        }


        .download-day-head {

            width:135px;
        }


        .download-table td {

            border-right:1px solid #cbd5e1;

            border-bottom:1px solid #cbd5e1;

            padding:9px;

            height:112px;

            vertical-align:middle;

            background:#ffffff;
        }


        .download-table tr:last-child td {

            border-bottom:0;
        }


        .download-table td:last-child {

            border-right:0;
        }


        .download-day-cell {

            background:#f1f5f9 !important;

            text-align:center;

            font-weight:800;

            font-size:14px;

            color:#0f172a;
        }


        .download-day-cell.today {

            background:#ecfdf5 !important;

            color:#15803d;
        }


        .download-empty {

            text-align:center;

            color:#94a3b8;

            font-size:18px;
        }


        .download-class {

            border-radius:10px;

            padding:11px 12px;

            min-height:88px;

            text-align:left;

            border-left:5px solid #2563eb;

            background:#eff6ff;
        }


        .download-class.lab {

            border-left-color:#f59e0b;

            background:#fffbeb;
        }


        .download-class-type {

            display:inline-block;

            font-size:9px;

            font-weight:800;

            letter-spacing:.7px;

            text-transform:uppercase;

            margin-bottom:6px;

            padding:4px 7px;

            border-radius:5px;

            background:#dbeafe;

            color:#1d4ed8;
        }


        .download-class.lab
        .download-class-type {

            background:#fef3c7;

            color:#b45309;
        }


        .download-course {

            font-size:15px;

            font-weight:800;

            color:#0f172a;

            line-height:1.2;

            margin-bottom:4px;
        }


        .download-code {

            font-size:10px;

            font-weight:700;

            color:#64748b;

            margin-bottom:6px;
        }


        .download-info {

            font-size:10px;

            color:#334155;

            margin-top:3px;

            line-height:1.25;
        }


        .download-footer {

            margin-top:20px;

            display:flex;

            justify-content:space-between;

            align-items:center;

            font-size:11px;

            color:#64748b;
        }


        .download-footer-brand {

            font-weight:700;

            color:#334155;
        }

    `;
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

    const isLab =
        type === 'Lab';


    return `

        <div class="
            download-class
            ${isLab ? 'lab' : ''}
        ">

            <div class="download-class-type">

                ${escapeHtml(type)}

            </div>


            <div class="download-course">

                ${escapeHtml(
                    course || 'Class'
                )}

            </div>


            ${
                code
                    ? `

                        <div class="download-code">

                            ${escapeHtml(code)}

                        </div>

                      `
                    : ''
            }


            ${
                teacher
                    ? `

                        <div class="download-info">

                            👤
                            ${escapeHtml(
                                teacher
                            )}

                        </div>

                      `
                    : ''
            }


            ${
                room
                    ? `

                        <div class="download-info">

                            🚪
                            ${escapeHtml(
                                room
                            )}

                        </div>

                      `
                    : ''
            }


            ${
                currentMode !== 'section' &&
                section
                    ? `

                        <div class="download-info">

                            👥
                            ${escapeHtml(
                                section
                            )}

                        </div>

                      `
                    : ''
            }

        </div>

    `;
}


/* =========================================================
   DOWNLOAD TABLE
   ========================================================= */

function createRoutineDownloadCard() {

    const classes =
        getFilteredClasses()
            .sort(compareClasses);


    const semester =
        getSemester();


    const title =
        currentMode === 'section'

            ? (
                selectedSection ||
                'CSE Class Routine'
            )

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


    wrapper.innerHTML = `

        <style>

            ${getDownloadStyles()}

        </style>


        <div class="download-header">

            <div class="download-brand">

                DAFFODIL INTERNATIONAL UNIVERSITY

            </div>


            <div class="download-title">

                CSE CLASS ROUTINE

            </div>


            <div class="download-subtitle">

                ${escapeHtml(title)}

            </div>


            <div class="download-meta">

                <span class="download-pill">

                    Section:
                    ${escapeHtml(
                        selectedSection ||
                        'N/A'
                    )}

                </span>


                <span class="download-pill">

                    ${escapeHtml(
                        semester
                    )}

                </span>


                <span class="download-pill">

                    ${currentView === 'week'
                        ? 'Weekly Schedule'
                        : 'Class Schedule'}

                </span>

            </div>

        </div>


        <div class="download-table-wrap">

            <table class="download-table">

                <colgroup>

                    <col style="width:135px;">

                    ${DISPLAY_TIME_SLOTS
                        .map(
                            () =>
                                `<col>`
                        )
                        .join('')}

                </colgroup>


                <thead>

                    <tr>

                        <th class="download-day-head">

                            DAY

                        </th>

                        ${DISPLAY_TIME_SLOTS
                            .map(
                                time =>
                                    `

                                    <th>

                                        ${escapeHtml(
                                            time
                                        )}

                                    </th>

                                    `
                            )
                            .join('')}

                    </tr>

                </thead>


                <tbody>

    `;


    DAY_ORDER.forEach(day => {

        const dayClasses =
            classes
                .filter(
                    cls =>
                        getDay(cls) === day
                )
                .sort(compareClasses);


        const lab =
            getTwoSlotLab(
                dayClasses
            );


        wrapper.innerHTML += `

            <tr>

                <td class="
                    download-day-cell
                    ${
                        isToday(day)
                            ? 'today'
                            : ''
                    }
                ">

                    ${escapeHtml(day)}

                </td>

        `;


        /*
         * Build cells as a string.
         */

        let rowHtml = '';


        for (
            let slotIndex = 0;
            slotIndex <
            DISPLAY_TIME_SLOTS.length;
            slotIndex++
        ) {

            /*
             * Skip second slot of Lab.
             */

            if (
                slotIndex === 3 &&
                lab
            ) {

                continue;
            }


            const slotClasses =
                getClassesForSlot(
                    dayClasses,
                    slotIndex
                );


            const cls =
                slotClasses[0];


            /*
             * 11:30-02:30 Lab.
             */

            if (
                slotIndex === 2 &&
                lab
            ) {

                rowHtml += `

                    <td
                        rowspan="2"
                        style="
                            vertical-align:middle;
                            padding:9px;
                        "
                    >

                        ${downloadClassHtml(
                            lab
                        )}

                    </td>

                `;

                continue;
            }


            if (!cls) {

                rowHtml += `

                    <td>

                        <div class="download-empty">

                            —

                        </div>

                    </td>

                `;

                continue;
            }


            rowHtml += `

                <td>

                    ${downloadClassHtml(
                        cls
                    )}

                </td>

            `;
        }


        /*
         * We cannot append a second <tr>.
         * Therefore replace the temporary opening
         * row with complete row below.
         */

        const temp =
            document.createElement(
                'template'
            );


        temp.innerHTML = `

            <tr>

                <td class="
                    download-day-cell
                    ${
                        isToday(day)
                            ? 'today'
                            : ''
                    }
                ">

                    ${escapeHtml(day)}

                </td>

                ${rowHtml}

            </tr>

        `;


        /*
         * Remove temporary duplicate row that
         * was inserted above.
         */

        const lastChild =
            wrapper.lastElementChild;


        if (
            lastChild &&
            lastChild.tagName === 'TR'
        ) {

            lastChild.remove();
        }


        wrapper.appendChild(
            temp.content.firstElementChild
        );
    });


    /*
     * Close table by constructing footer
     * separately. This avoids innerHTML corruption.
     */

    wrapper.innerHTML += `

                </tbody>

            </table>

        </div>


        <div class="download-footer">

            <span class="download-footer-brand">

                DIU CSE Routine

            </span>


            <span>

                Generated:
                ${escapeHtml(
                    new Date()
                        .toLocaleString()
                )}

            </span>

        </div>

    `;


    document.body.appendChild(
        wrapper
    );


    return wrapper;
}


/* =========================================================
   BETTER DOWNLOAD CARD
   ========================================================= */

/*
 * The previous implementation above uses DOM replacement
 * for compatibility.
 *
 * This function creates a completely clean card in one
 * HTML string and is used by the downloader.
 */

function createCleanDownloadCard() {

    const classes =
        getFilteredClasses()
            .sort(compareClasses);


    const semester =
        getSemester();


    const title =
        currentMode === 'section'

            ? (
                selectedSection ||
                'CSE Class Routine'
            )

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


    let html = `

        <style>

            ${getDownloadStyles()}

        </style>


        <div class="download-header">

            <div class="download-brand">

                DAFFODIL INTERNATIONAL UNIVERSITY

            </div>


            <div class="download-title">

                CSE CLASS ROUTINE

            </div>


            <div class="download-subtitle">

                ${escapeHtml(title)}

            </div>


            <div class="download-meta">

                <span class="download-pill">

                    SECTION:
                    ${escapeHtml(
                        selectedSection ||
                        'N/A'
                    )}

                </span>


                <span class="download-pill">

                    ${escapeHtml(
                        semester
                    )}

                </span>


                <span class="download-pill">

                    ${
                        currentView === 'week'
                            ? 'WEEKLY SCHEDULE'
                            : 'CLASS SCHEDULE'
                    }

                </span>

            </div>

        </div>


        <div class="download-table-wrap">

            <table class="download-table">

                <colgroup>

                    <col style="width:135px;">

                    ${DISPLAY_TIME_SLOTS
                        .map(
                            () =>
                                '<col>'
                        )
                        .join('')}

                </colgroup>


                <thead>

                    <tr>

                        <th class="download-day-head">

                            DAY

                        </th>

                        ${DISPLAY_TIME_SLOTS
                            .map(
                                time =>
                                    `

                                    <th>

                                        ${escapeHtml(
                                            time
                                        )}

                                    </th>

                                    `
                            )
                            .join('')}

                    </tr>

                </thead>


                <tbody>

    `;


    DAY_ORDER.forEach(day => {

        const dayClasses =
            classes
                .filter(
                    cls =>
                        getDay(cls) === day
                )
                .sort(compareClasses);


        const lab =
            getTwoSlotLab(
                dayClasses
            );


        html += `

            <tr>

                <td class="
                    download-day-cell
                    ${
                        isToday(day)
                            ? 'today'
                            : ''
                    }
                ">

                    ${escapeHtml(day)}

                </td>

        `;


        for (
            let slotIndex = 0;
            slotIndex <
            DISPLAY_TIME_SLOTS.length;
            slotIndex++
        ) {

            /*
             * Skip second half of lab rowspan.
             */

            if (
                slotIndex === 3 &&
                lab
            ) {

                continue;
            }


            const slotClasses =
                getClassesForSlot(
                    dayClasses,
                    slotIndex
                );


            const cls =
                slotClasses[0];


            /*
             * Two-slot lab.
             */

            if (
                slotIndex === 2 &&
                lab
            ) {

                html += `

                    <td
                        rowspan="2"
                        style="
                            vertical-align:middle;
                            padding:9px;
                        "
                    >

                        ${downloadClassHtml(
                            lab
                        )}

                    </td>

                `;

                continue;
            }


            if (!cls) {

                html += `

                    <td>

                        <div class="download-empty">

                            —

                        </div>

                    </td>

                `;

                continue;
            }


            html += `

                <td>

                    ${downloadClassHtml(
                        cls
                    )}

                </td>

            `;
        }


        html += `

            </tr>

        `;
    });


    html += `

                </tbody>

            </table>

        </div>


        <div class="download-footer">

            <span class="download-footer-brand">

                DIU CSE Routine

            </span>


            <span>

                Generated:
                ${escapeHtml(
                    new Date()
                        .toLocaleString()
                )}

            </span>

        </div>

    `;


    wrapper.innerHTML =
        html;


    document.body.appendChild(
        wrapper
    );


    return wrapper;
}


/* =========================================================
   DOWNLOAD IMAGE
   ========================================================= */

async function downloadRoutinePNG() {

    let card = null;


    try {

        await loadHtml2Canvas();


        /*
         * Use the clean implementation.
         */

        card =
            createCleanDownloadCard();


        /*
         * Wait for layout.
         */

        await new Promise(
            resolve =>
                requestAnimationFrame(
                    () =>
                        requestAnimationFrame(
                            resolve
                        )
                )
        );


        const canvas =
            await html2canvas(
                card,
                {

                    backgroundColor:
                        '#f8fafc',

                    scale: 2,

                    useCORS: true,

                    allowTaint: false,

                    logging: false,

                    imageTimeout: 0,

                    removeContainer: true
                }
            );


        const link =
            document.createElement(
                'a'
            );


        let safeTitle =
            currentMode === 'section'
                ? selectedSection
                : currentQuery;


        safeTitle =
            String(
                safeTitle ||
                'Routine'
            )
                .replace(
                    /[^\w\-]+/g,
                    '_'
                );


        link.download =
            `DIU_CSE_Routine_${safeTitle}.png`;


        link.href =
            canvas.toDataURL(
                'image/png'
            );


        document.body.appendChild(
            link
        );


        link.click();


        link.remove();


    } catch (error) {

        console.error(
            'PNG download error:',
            error
        );


        alert(
            'PNG download failed. Please try again.'
        );

    } finally {

        if (card) {

            card.remove();
        }


        const oldCard =
            document.querySelector(
                '#routine-download-card'
            );


        if (oldCard) {

            oldCard.remove();
        }
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

        /*
         * Prevent duplicate event listeners.
         */

        if (
            btn.dataset.downloadReady ===
            'true'
        ) {

            return;
        }


        btn.dataset.downloadReady =
            'true';


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
   GLOBAL ROUTINE LINK
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

        routineData.source_url,
        routineData.sourceUrl
    ];


    for (
        const link of candidates
    ) {

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
            routineData.meta.routineLink,

            routineData.meta.pdf,
            routineData.meta.pdf_url,

            routineData.meta.notice_url,
            routineData.meta.source_url
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

        '#routineLink',
        '#noticeLink',
        '.routine-link-btn',
        '[data-action="routine-link"]'
    ];


    elements.forEach(
        selector => {

            $all(selector)
                .forEach(el => {

                    if (!el) {
                        return;
                    }


                    el.href =
                        link;


                    el.target =
                        '_blank';


                    el.rel =
                        'noopener noreferrer';


                    el.style.display =
                        '';
                });
        }
    );
}


/* =========================================================
   KEYBOARD SHORTCUTS
   ========================================================= */

function setupKeyboardShortcuts() {

    document.addEventListener(
        'keydown',
        event => {

            /*
             * Escape = clear search.
             */

            if (
                event.key === 'Escape'
            ) {

                const input =
                    $('#searchInput') ||
                    $('#search') ||
                    $('input[type="search"]');


                if (input) {

                    input.value =
                        '';


                    currentQuery =
                        '';


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

        currentDay =
            today;

    } else {

        currentDay =
            'Saturday';
    }


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
   EXTRA CSS
   ========================================================= */

function injectRoutineExtraCSS() {

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

        /* =================================================
           TODAY DOT
           ================================================= */

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
                rgba(34,197,94,.14);
        }


        /* =================================================
           WEEK TABLE
           ================================================= */

        .week-table-wrapper {

            width:100%;

            overflow-x:auto;

            border-radius:16px;

            background:#ffffff;

            border:1px solid #e2e8f0;

            box-shadow:
                0 8px 25px
                rgba(15,23,42,.06);
        }


        .week-routine-table {

            width:100%;

            min-width:1050px;

            border-collapse:separate;

            border-spacing:0;

            table-layout:fixed;

            background:#ffffff;
        }


        .week-day-col {

            width:125px;
        }


        .week-time-col {

            width:auto;
        }


        .week-routine-table th {

            border-right:1px solid #334155;

            border-bottom:1px solid #334155;
        }


        .week-day-heading,
        .week-time-heading {

            background:#0f172a;

            color:#ffffff;

            padding:14px 8px;

            text-align:center;

            font-size:12px;

            font-weight:800;

            vertical-align:middle;
        }


        .week-day-heading {

            position:sticky;

            left:0;

            z-index:3;
        }


        .week-day-cell {

            background:#f8fafc;

            color:#0f172a;

            padding:12px 8px;

            text-align:center;

            font-size:12px;

            font-weight:800;

            border-right:1px solid #cbd5e1 !important;

            border-bottom:1px solid #cbd5e1 !important;

            vertical-align:middle;

            position:sticky;

            left:0;

            z-index:2;
        }


        .week-day-cell.today-day-cell {

            background:#ecfdf5;

            color:#15803d;
        }


        .week-routine-cell {

            border-right:1px solid #cbd5e1;

            border-bottom:1px solid #cbd5e1;

            padding:8px;

            vertical-align:middle;

            background:#ffffff;

            min-height:100px;
        }


        .week-empty-cell {

            text-align:center;

            color:#94a3b8;

            font-size:18px;
        }


        .week-lab-cell {

            background:#fffbeb;

        }


        .today-row
        .week-routine-cell {

            background:#fbfffc;
        }


        .today-row
        .week-lab-cell {

            background:#fffbeb;
        }


        /* =================================================
           CARD COLORS
           ================================================= */

        .routine-class-card {

            border-radius:10px;

            padding:10px;

            border-left:4px solid #2563eb;

            background:#eff6ff;
        }


        .routine-class-card.lab-card {

            border-left-color:#f59e0b;

            background:#fffbeb;
        }


        .routine-class-card
        .class-type {

            font-size:9px;

            font-weight:800;

            letter-spacing:.5px;
        }


        .routine-class-card
        .class-type.theory {

            color:#1d4ed8;
        }


        .routine-class-card
        .class-type.lab {

            color:#b45309;
        }


        .routine-class-card
        .course-name {

            font-weight:800;
        }


        .routine-class-card
        .course-code {

            color:#64748b;

            font-size:10px;
        }


        /* =================================================
           TODAY HEADER
           ================================================= */

        .routine-day-title.today {

            position:relative;

            color:#15803d;
        }


        .today-column
        .week-day-header {

            border-color:#22c55e !important;
        }


        .empty-room-day-header.today {

            border-color:#22c55e !important;
        }


        /* =================================================
           RESPONSIVE
           ================================================= */

        @media (max-width:768px) {

            .week-table-wrapper {

                overflow-x:auto;
            }


            .week-routine-table {

                min-width:950px;
            }
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

        injectRoutineExtraCSS();

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


/* =========================================================
   END
   ========================================================= */
