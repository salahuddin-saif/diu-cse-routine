// ============================================================
// DIU CSE ROUTINE
// Section / Teacher / Room Modes
// ============================================================
// Features:
// - Correct day ordering
// - Correct time ordering
// - 11:30-02:30 before 02:30-04:00
// - Main = no subsection label
// - Lab = (N1), (N2)
// - Teacher mode
// - Room mode
// - Search icon
// - Day View / Week View
// - Stylish PNG routine download
// ============================================================


const STORAGE_KEY = 'diu_cse_section';
const MODE_KEY = 'diu_cse_mode';

const COMBINED_URL =
    './data/routine.json?t=' + Date.now();


// ============================================================
// DOM
// ============================================================

const sectionInput =
    document.getElementById('sectionInput');

const showRoutineBtn =
    document.getElementById('showRoutineBtn');

const clearSectionBtn =
    document.getElementById('clearSectionBtn');

const savedChip =
    document.getElementById('savedChip');

const savedSectionSpan =
    document.getElementById('savedSection');

const routineContainer =
    document.getElementById('routineContainer');

const statusBadge =
    document.getElementById('statusBadge');

const statusText =
    document.getElementById('statusText');

const versionNumber =
    document.getElementById('versionNumber');

const lastUpdated =
    document.getElementById('lastUpdated');

const message =
    document.getElementById('message');

const searchIcon =
    document.querySelector(
        '.search-input-wrap i'
    );


// Navigation
const userBtn =
    document.querySelector(
        '.nav-item:first-child'
    );

const teacherBtn =
    document.querySelector(
        '.nav-item .fa-address-card'
    )?.closest('.nav-item');

const roomBtn =
    document.querySelector(
        '.nav-item .fa-door-open'
    )?.closest('.nav-item');


// ============================================================
// STATE
// ============================================================

let routineData = null;

let currentMode = 'section';

let currentSearchTerm = '';

let currentClasses = [];


// ============================================================
// DAYS
// ============================================================

const DAYS = [
    'Saturday',
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday'
];


const DAY_ORDER = {

    Saturday: 0,
    Sunday: 1,
    Monday: 2,
    Tuesday: 3,
    Wednesday: 4,
    Thursday: 5,
    Friday: 6

};


// ============================================================
// TIME ORDER
// ============================================================
//
// IMPORTANT:
// 11:30-02:30 is LAB SLOT
// and MUST come before 02:30-04:00.
//
// ============================================================

const TIME_ORDER = {

    '08:30-10:00': 0,

    '10:00-11:30': 1,

    '11:30-01:00': 2,

    '11:30-02:30': 3,

    '01:00-02:30': 4,

    '02:30-04:00': 5,

    '04:00-05:30': 6

};


// Display columns for download image.
// The long lab slot is intentionally included.

const DISPLAY_TIME_SLOTS = [

    '08:30-10:00',

    '10:00-11:30',

    '11:30-01:00',

    '01:00-02:30',

    '11:30-02:30',

    '02:30-04:00',

    '04:00-05:30'

];


// ============================================================
// INIT
// ============================================================

document.addEventListener(
    'DOMContentLoaded',
    () => {

        currentMode =
            localStorage.getItem(
                MODE_KEY
            ) || 'section';


        updateModeUI();


        const saved =
            localStorage.getItem(
                STORAGE_KEY
            );


        if (saved) {

            sectionInput.value =
                saved;

            savedSectionSpan.textContent =
                saved;

            savedChip.style.display =
                'inline-flex';

        }

        else {

            savedChip.style.display =
                'none';

        }


        loadRoutineData();


        // Search icon
        if (searchIcon) {

            searchIcon.style.cursor =
                'pointer';

            searchIcon.addEventListener(
                'click',
                handleSearch
            );

        }


        // Hidden/show button
        if (showRoutineBtn) {

            showRoutineBtn.addEventListener(
                'click',
                handleSearch
            );

        }


        // Clear
        if (clearSectionBtn) {

            clearSectionBtn.addEventListener(
                'click',
                handleClearSection
            );

        }


        // Enter
        if (sectionInput) {

            sectionInput.addEventListener(
                'keydown',
                e => {

                    if (
                        e.key === 'Enter' ||
                        e.keyCode === 13
                    ) {

                        e.preventDefault();

                        handleSearch();

                    }

                }
            );

        }


        // Modes
        if (userBtn) {

            userBtn.addEventListener(
                'click',
                () =>
                    setMode('section')
            );

        }


        if (teacherBtn) {

            teacherBtn.addEventListener(
                'click',
                () =>
                    setMode('teacher')
            );

        }


        if (roomBtn) {

            roomBtn.addEventListener(
                'click',
                () =>
                    setMode('room')
            );

        }

    }
);


// ============================================================
// MODE
// ============================================================

function setMode(mode) {

    if (
        currentMode === mode
    ) {
        return;
    }


    currentMode = mode;


    localStorage.setItem(
        MODE_KEY,
        mode
    );


    updateModeUI();


    routineContainer.innerHTML =
        '';


    savedChip.style.display =
        'none';


    sectionInput.value =
        '';


    localStorage.removeItem(
        STORAGE_KEY
    );


    if (mode === 'section') {

        sectionInput.placeholder =
            'Enter section (e.g., 70_N)';

        loadRoutineData();

    }


    else if (mode === 'teacher') {

        sectionInput.placeholder =
            'Enter teacher initials (e.g., NSL)';

        showNoRoutine(
            'Teacher Mode',
            'Enter teacher initials to see their classes.'
        );

    }


    else if (mode === 'room') {

        sectionInput.placeholder =
            'Enter room (e.g., KT-516)';

        showNoRoutine(
            'Room Mode',
            'Enter room name to see its schedule.'
        );

    }

}


// ============================================================
// MODE UI
// ============================================================

function updateModeUI() {

    const brand =
        document.querySelector(
            '.brand strong'
        );


    if (brand) {

        if (
            currentMode === 'section'
        ) {

            brand.textContent =
                'Student';

        }

        else if (
            currentMode === 'teacher'
        ) {

            brand.textContent =
                'Teacher';

        }

        else {

            brand.textContent =
                'Room';

        }

    }


    document
        .querySelectorAll(
            '.nav-item'
        )
        .forEach(
            el =>
                el.classList.remove(
                    'active'
                )
        );


    if (
        currentMode === 'section' &&
        userBtn
    ) {

        userBtn.classList.add(
            'active'
        );

    }


    if (
        currentMode === 'teacher' &&
        teacherBtn
    ) {

        teacherBtn.classList.add(
            'active'
        );

    }


    if (
        currentMode === 'room' &&
        roomBtn
    ) {

        roomBtn.classList.add(
            'active'
        );

    }

}


// ============================================================
// SEARCH
// ============================================================

function handleSearch() {

    const raw =
        sectionInput.value.trim();


    if (!raw) {

        showMessage(
            'Please enter something to search.',
            'error'
        );

        return;

    }


    const normalized =
        raw
            .toUpperCase()
            .replace(/\s+/g, '_');


    if (
        currentMode === 'section'
    ) {

        loadSection(
            normalized
        );

    }


    else if (
        currentMode === 'teacher'
    ) {

        loadTeacher(
            normalized
        );

    }


    else {

        loadRoom(
            normalized
        );

    }

}


// ============================================================
// LOAD DATA
// ============================================================

async function loadRoutineData() {

    try {

        setStatus(
            'loading',
            'Loading...'
        );


        const saved =
            localStorage.getItem(
                STORAGE_KEY
            );


        if (
            saved &&
            currentMode === 'section'
        ) {

            await loadSection(
                saved
            );

            return;

        }


        const response =
            await fetch(
                COMBINED_URL
            );


        if (!response.ok) {

            throw new Error(
                'Failed to load routine data.'
            );

        }


        routineData =
            await response.json();


        updateMeta(
            routineData
        );


        if (
            currentMode !== 'section'
        ) {

            showNoRoutine(
                currentMode === 'teacher'
                    ? 'Teacher Mode'
                    : 'Room Mode',
                `Enter ${
                    currentMode === 'teacher'
                        ? 'teacher initials'
                        : 'room name'
                } to see results.`
            );

            setStatus(
                'ready',
                'Ready'
            );

            return;

        }


        const sections =
            routineData.sections ||
            {};


        const keys =
            Object.keys(
                sections
            );


        if (!keys.length) {

            showNoRoutine(
                'No Data',
                'No routine data available.'
            );

            return;

        }


        const firstBase =
            getBaseSection(
                keys[0]
            );


        const merged =
            mergeSubSections(
                firstBase
            );


        if (merged.length) {

            sectionInput.value =
                firstBase;


            savedSectionSpan.textContent =
                firstBase;


            savedChip.style.display =
                'inline-flex';


            localStorage.setItem(
                STORAGE_KEY,
                firstBase
            );


            currentSearchTerm =
                firstBase;


            currentClasses =
                merged;


            displaySection(
                firstBase,
                merged
            );

        }


        else {

            showNoRoutine(
                'No Data',
                'No routine data available.'
            );

        }


        setStatus(
            'ready',
            'Ready'
        );

    }

    catch (error) {

        console.error(
            error
        );


        setStatus(
            'error',
            'Error'
        );


        showMessage(
            'Could not load routine data.',
            'error'
        );


        showNoRoutine(
            'Error',
            'Routine data could not be loaded.'
        );

    }

}


// ============================================================
// LOAD SECTION
// ============================================================

async function loadSection(
    sectionKey
) {

    try {

        setStatus(
            'loading',
            'Loading...'
        );


        const normalized =
            String(sectionKey)
                .toUpperCase()
                .replace(/\s+/g, '_');


        if (!routineData) {

            const response =
                await fetch(
                    COMBINED_URL
                );


            if (!response.ok) {

                throw new Error(
                    'Combined data not found.'
                );

            }


            routineData =
                await response.json();


            updateMeta(
                routineData
            );

        }


        const sections =
            routineData.sections ||
            {};


        const baseSection =
            getBaseSection(
                normalized
            );


        let matchingKeys =
            Object.keys(
                sections
            ).filter(
                key =>
                    key === normalized ||
                    key === baseSection ||
                    getBaseSection(key) ===
                        baseSection
            );


        if (
            matchingKeys.length === 0
        ) {

            const fallback =
                Object.keys(
                    sections
                ).find(
                    key =>
                        key
                            .toUpperCase()
                            .startsWith(
                                normalized
                            )
                );


            if (fallback) {

                matchingKeys.push(
                    fallback
                );

            }

        }


        if (
            matchingKeys.length === 0
        ) {

            throw new Error(
                `Section "${normalized}" not found.`
            );

        }


        const all =
            [];


        matchingKeys.forEach(
            key => {

                const data =
                    sections[key];


                const classes =
                    Array.isArray(data)
                        ? data
                        : data?.classes;


                if (
                    Array.isArray(classes)
                ) {

                    all.push(
                        ...classes
                    );

                }

            }
        );


        const classes =
            removeDuplicateClasses(
                normalizeClasses(all)
            );


        if (!classes.length) {

            throw new Error(
                `No classes found for "${normalized}".`
            );

        }


        currentSearchTerm =
            baseSection;


        currentClasses =
            classes;


        displaySection(
            baseSection,
            classes
        );


        localStorage.setItem(
            STORAGE_KEY,
            normalized
        );


        savedSectionSpan.textContent =
            normalized;


        savedChip.style.display =
            'inline-flex';


        hideMessage();


        setStatus(
            'ready',
            'Ready'
        );

    }

    catch (error) {

        console.error(
            error
        );


        setStatus(
            'error',
            'Error'
        );


        showMessage(
            error.message,
            'error'
        );


        showNoRoutine(
            'Section Not Found',
            `No data for "${sectionKey}".`
        );

    }

}


// ============================================================
// MERGE SUBSECTIONS
// ============================================================

function mergeSubSections(
    baseSection
) {

    if (!routineData) {
        return [];
    }


    const sections =
        routineData.sections ||
        {};


    const all =
        [];


    Object.entries(
        sections
    ).forEach(
        ([key, data]) => {

            if (
                key === baseSection ||
                getBaseSection(key) ===
                    baseSection
            ) {

                const classes =
                    Array.isArray(data)
                        ? data
                        : data?.classes;


                if (
                    Array.isArray(classes)
                ) {

                    all.push(
                        ...classes
                    );

                }

            }

        }
    );


    return removeDuplicateClasses(
        normalizeClasses(all)
    );

}


// ============================================================
// TEACHER
// ============================================================

async function loadTeacher(
    initials
) {

    try {

        setStatus(
            'loading',
            'Loading...'
        );


        if (!routineData) {

            const response =
                await fetch(
                    COMBINED_URL
                );


            routineData =
                await response.json();


            updateMeta(
                routineData
            );

        }


        const clean =
            String(initials)
                .toUpperCase()
                .replace(/\s+/g, '');


        const sections =
            routineData.sections ||
            {};


        const results =
            [];


        Object.entries(
            sections
        ).forEach(
            ([section, data]) => {

                const classes =
                    Array.isArray(data)
                        ? data
                        : data?.classes;


                if (
                    !Array.isArray(classes)
                ) {
                    return;
                }


                classes.forEach(
                    cls => {

                        const teacher =
                            String(
                                cls.teacher ||
                                ''
                            )
                                .toUpperCase()
                                .replace(
                                    /\s+/g,
                                    ''
                                );


                        if (
                            teacher.includes(
                                clean
                            )
                        ) {

                            results.push({
                                ...cls,
                                _section:
                                    section
                            });

                        }

                    }
                );

            }
        );


        const classes =
            removeDuplicateClasses(
                normalizeClasses(
                    results
                )
            );


        if (!classes.length) {

            throw new Error(
                `No classes found for teacher "${initials}".`
            );

        }


        currentSearchTerm =
            clean;


        currentClasses =
            classes;


        displayTeacherRoutine(
            clean,
            classes
        );


        localStorage.setItem(
            STORAGE_KEY,
            initials
        );


        savedSectionSpan.textContent =
            initials;


        savedChip.style.display =
            'inline-flex';


        hideMessage();


        setStatus(
            'ready',
            'Ready'
        );

    }

    catch (error) {

        console.error(
            error
        );


        setStatus(
            'error',
            'Error'
        );


        showMessage(
            error.message,
            'error'
        );


        showNoRoutine(
            'Teacher Not Found',
            `No data for "${initials}".`
        );

    }

}


// ============================================================
// ROOM
// ============================================================

async function loadRoom(
    roomName
) {

    try {

        setStatus(
            'loading',
            'Loading...'
        );


        if (!routineData) {

            const response =
                await fetch(
                    COMBINED_URL
                );


            routineData =
                await response.json();


            updateMeta(
                routineData
            );

        }


        const clean =
            String(roomName)
                .toUpperCase()
                .replace(/\s+/g, '');


        const sections =
            routineData.sections ||
            {};


        const results =
            [];


        Object.entries(
            sections
        ).forEach(
            ([section, data]) => {

                const classes =
                    Array.isArray(data)
                        ? data
                        : data?.classes;


                if (
                    !Array.isArray(classes)
                ) {
                    return;
                }


                classes.forEach(
                    cls => {

                        const room =
                            String(
                                cls.room ||
                                ''
                            )
                                .toUpperCase()
                                .replace(
                                    /\s+/g,
                                    ''
                                );


                        if (
                            room.includes(clean)
                        ) {

                            results.push({
                                ...cls,
                                _section:
                                    section
                            });

                        }

                    }
                );

            }
        );


        const classes =
            removeDuplicateClasses(
                normalizeClasses(
                    results
                )
            );


        if (!classes.length) {

            throw new Error(
                `No classes found for room "${roomName}".`
            );

        }


        currentSearchTerm =
            clean;


        currentClasses =
            classes;


        displayRoomRoutine(
            clean,
            classes
        );


        localStorage.setItem(
            STORAGE_KEY,
            roomName
        );


        savedSectionSpan.textContent =
            roomName;


        savedChip.style.display =
            'inline-flex';


        hideMessage();


        setStatus(
            'ready',
            'Ready'
        );

    }

    catch (error) {

        console.error(
            error
        );


        setStatus(
            'error',
            'Error'
        );


        showMessage(
            error.message,
            'error'
        );


        showNoRoutine(
            'Room Not Found',
            `No data for "${roomName}".`
        );

    }

}


// ============================================================
// DISPLAY
// ============================================================

function displaySection(
    section,
    classes
) {

    displayRoutine(
        classes,
        section,
        false,
        'section'
    );

}


function displayTeacherRoutine(
    teacher,
    classes
) {

    displayRoutine(
        classes,
        teacher,
        true,
        'teacher'
    );

}


function displayRoomRoutine(
    room,
    classes
) {

    displayRoutine(
        classes,
        room,
        true,
        'room'
    );

}


// ============================================================
// MAIN DISPLAY
// ============================================================

function displayRoutine(
    classes,
    title,
    showComment,
    mode
) {

    classes =
        sortClasses(
            normalizeClasses(
                classes
            )
        );


    currentClasses =
        classes;


    if (!classes.length) {

        showNoRoutine(
            'No Data',
            'No classes found.'
        );

        return;

    }


    const teachers =
        [
            ...new Set(
                classes
                    .map(
                        c => c.teacher
                    )
                    .filter(Boolean)
            )
        ];


    const days =
        [
            ...new Set(
                classes.map(
                    c =>
                        normalizeDay(
                            c.day
                        )
                )
            )
        ];


    const batch =
        [
            ...new Set(
                classes
                    .map(
                        c =>
                            c.batch ||
                            extractBatchFromSection(
                                c.section
                            )
                    )
                    .filter(Boolean)
            )
        ];


    const cleanVersion =
        String(
            versionNumber?.textContent ||
            '5.0'
        ).replace(
            /^v/i,
            ''
        );


    const icon =
        mode === 'teacher'
            ? 'fa-chalkboard-teacher'
            : mode === 'room'
                ? 'fa-door-open'
                : 'fa-user-graduate';


    const label =
        mode === 'teacher'
            ? 'Teacher'
            : mode === 'room'
                ? 'Room'
                : 'Student';


    let html = '';


    // ========================================================
    // CARD
    // ========================================================

    html += `

        <div class="enrolled-card">

            <div class="card-title">

                <h3>

                    <i class="fas ${icon}"></i>

                    ${escapeHtml(label)}
                    ·
                    ${escapeHtml(title)}

                </h3>


                <button
                    class="cr-btn"
                    onclick="downloadSection()"
                    title="Download routine image"
                >

                    <i class="fas fa-download"></i>

                </button>

            </div>


            <div class="course-meta">

                <div class="meta-row">

                    <span>
                        Total Classes
                    </span>

                    <strong>
                        ${classes.length}
                    </strong>

                </div>


                <div class="meta-row">

                    <span>
                        Active Days
                    </span>

                    <strong>
                        ${days.length}
                    </strong>

                </div>


                <div class="meta-row">

                    <span>
                        Routine Version
                    </span>

                    <strong>
                        v${escapeHtml(cleanVersion)}
                    </strong>

                </div>


                ${
                    batch.length
                        ? `

                            <div class="meta-row">

                                <span>
                                    Batch
                                </span>

                                <strong>
                                    ${escapeHtml(
                                        batch.join(', ')
                                    )}
                                </strong>

                            </div>

                          `
                        : ''
                }


                ${
                    mode === 'teacher' ||
                    mode === 'room'
                        ? `

                            <div class="meta-row">

                                <span>
                                    Sections
                                </span>

                                <strong>

                                    ${escapeHtml(
                                        [
                                            ...new Set(
                                                classes.map(
                                                    c =>
                                                        c._section ||
                                                        c.section ||
                                                        ''
                                                )
                                            )
                                        ]
                                            .filter(Boolean)
                                            .join(', ')
                                    )}

                                </strong>

                            </div>

                          `
                        : ''
                }

            </div>


            <div class="download-row">

                <span>

                    <i class="fas fa-image"></i>

                    Download routine image

                </span>


                <button
                    class="download-btn"
                    onclick="downloadSection()"
                    title="Download routine image"
                >

                    <i class="fas fa-download"></i>

                </button>

            </div>

        </div>

    `;


    // ========================================================
    // TEACHERS
    // ========================================================

    html += `
        <div class="teacher-row">
    `;


    if (teachers.length) {

        teachers.forEach(
            teacher => {

                const initial =
                    String(
                        teacher
                    )
                        .substring(
                            0,
                            2
                        )
                        .toUpperCase();


                html += `

                    <div class="teacher">

                        <div class="avatar">

                            <span>
                                ${escapeHtml(
                                    initial
                                )}
                            </span>

                            <span class="online"></span>

                        </div>

                        <span>
                            ${escapeHtml(
                                teacher
                            )}
                        </span>

                    </div>

                `;

            }
        );

    }


    html += `
        </div>
    `;


    // ========================================================
    // TABS
    // ========================================================

    html += `

        <div class="view-tabs">

            <button
                class="view-tab active"
                data-view="day"
            >

                <i class="fas fa-calendar-day"></i>

                Day View

            </button>


            <button
                class="view-tab"
                data-view="week"
            >

                <i class="fas fa-calendar-week"></i>

                Week View

            </button>

        </div>


        <div id="viewContent"></div>

    `;


    routineContainer.innerHTML =
        html;


    renderDayView(
        classes,
        showComment,
        mode
    );


    document
        .querySelectorAll(
            '.view-tab'
        )
        .forEach(
            tab => {

                tab.addEventListener(
                    'click',
                    () => {

                        document
                            .querySelectorAll(
                                '.view-tab'
                            )
                            .forEach(
                                t =>
                                    t.classList.remove(
                                        'active'
                                    )
                            );


                        tab.classList.add(
                            'active'
                        );


                        if (
                            tab.dataset.view ===
                            'day'
                        ) {

                            renderDayView(
                                classes,
                                showComment,
                                mode
                            );

                        }

                        else {

                            renderWeekView(
                                classes,
                                showComment,
                                mode
                            );

                        }

                    }
                );

            }
        );

}


// ============================================================
// DAY VIEW
// ============================================================

function renderDayView(
    classes,
    showComment,
    mode
) {

    const container =
        document.getElementById(
            'viewContent'
        );


    if (!container) {
        return;
    }


    const grouped = {};


    DAYS.forEach(
        day => {
            grouped[day] = [];
        }
    );


    classes.forEach(
        cls => {

            const day =
                normalizeDay(
                    cls.day
                );


            if (
                grouped[day]
            ) {

                grouped[day].push(
                    cls
                );

            }

        }
    );


    let html =
        `<div class="day-grid">`;


    // FIX:
    // Always use DAYS order.
    DAYS.forEach(
        day => {

            const dayClasses =
                sortClasses(
                    grouped[day]
                );


            if (
                !dayClasses.length
            ) {
                return;
            }


            html += `

                <div class="day-card">

                    <div class="day-card-header">

                        <span>

                            <i class="fas fa-calendar-alt"></i>

                            ${day}

                        </span>


                        <span>
                            ${dayClasses.length}
                            classes
                        </span>

                    </div>


                    <div class="day-card-body">

            `;


            dayClasses.forEach(
                cls => {

                    const isLab =
                        normalizeClassType(
                            cls.type
                        ) === 'Lab';


                    const typeClass =
                        isLab
                            ? 'type-lab'
                            : 'type-theory';


                    const typeLabel =
                        isLab
                            ? 'Lab'
                            : 'Theory';


                    const comment =
                        getDisplayComment(
                            cls,
                            showComment,
                            mode
                        );


                    const time =
                        getClassTimeSlot(
                            cls
                        );


                    html += `

                        <div class="class-item">

                            <div class="time">

                                <i class="far fa-clock"></i>

                                ${escapeHtml(
                                    time || 'TBA'
                                )}

                            </div>


                            <div class="course">

                                ${escapeHtml(
                                    cls.course
                                )}

                                ${
                                    comment
                                        ? `

                                            <span
                                                style="
                                                    font-size:.8rem;
                                                    color:var(--muted);
                                                    margin-left:4px;
                                                "
                                            >
                                                ${escapeHtml(
                                                    comment
                                                )}
                                            </span>

                                          `
                                        : ''
                                }

                            </div>


                            <div class="details">

                                <span>

                                    <i class="fas fa-chalkboard-teacher"></i>

                                    ${escapeHtml(
                                        cls.teacher ||
                                        '?'
                                    )}

                                </span>


                                <span>

                                    <i class="fas fa-door-open"></i>

                                    ${escapeHtml(
                                        cls.room ||
                                        '?'
                                    )}

                                </span>


                                <span>

                                    <span
                                        class="type-tag ${typeClass}"
                                    >
                                        ${typeLabel}
                                    </span>

                                </span>

                            </div>

                        </div>

                    `;

                }
            );


            html += `

                    </div>

                </div>

            `;

        }
    );


    html +=
        `</div>`;


    container.innerHTML =
        html;

}


// ============================================================
// WEEK VIEW
// ============================================================

function renderWeekView(
    classes,
    showComment,
    mode
) {

    const container =
        document.getElementById(
            'viewContent'
        );


    if (!container) {
        return;
    }


    const grouped = {};


    DAYS.forEach(
        day => {
            grouped[day] = [];
        }
    );


    classes.forEach(
        cls => {

            const day =
                normalizeDay(
                    cls.day
                );


            if (
                grouped[day]
            ) {

                grouped[day].push(
                    cls
                );

            }

        }
    );


    const slots = [];


    classes.forEach(
        cls => {

            const slot =
                getClassTimeSlot(
                    cls
                );


            if (
                slot &&
                !slots.includes(slot)
            ) {

                slots.push(
                    slot
                );

            }

        }
    );


    slots.sort(
        (a, b) =>
            getTimeOrder(a) -
            getTimeOrder(b)
    );


    let html = `

        <div class="week-view">

            <table class="week-table">

                <thead>

                    <tr>

                        <th>
                            Time
                        </th>

    `;


    DAYS.forEach(
        day => {

            html += `
                <th>
                    ${day.substring(0, 3)}
                </th>
            `;

        }
    );


    html += `

                    </tr>

                </thead>


                <tbody>

    `;


    slots.forEach(
        slot => {

            html += `

                <tr>

                    <td class="time-col">
                        ${escapeHtml(slot)}
                    </td>

            `;


            DAYS.forEach(
                day => {

                    const matching =
                        sortClasses(
                            grouped[day]
                                .filter(
                                    cls =>
                                        getClassTimeSlot(
                                            cls
                                        ) === slot
                                )
                        );


                    if (
                        matching.length
                    ) {

                        html +=
                            `<td>`;


                        matching.forEach(
                            cls => {

                                const isLab =
                                    normalizeClassType(
                                        cls.type
                                    ) === 'Lab';


                                const comment =
                                    getDisplayComment(
                                        cls,
                                        showComment,
                                        mode
                                    );


                                html += `

                                    <div
                                        style="
                                            margin-bottom:6px;
                                        "
                                    >

                                        <strong>
                                            ${escapeHtml(
                                                cls.course
                                            )}
                                        </strong>

                                        ${
                                            comment
                                                ? `

                                                    <span
                                                        style="
                                                            font-size:.7rem;
                                                            color:var(--muted);
                                                            margin-left:3px;
                                                        "
                                                    >
                                                        ${escapeHtml(
                                                            comment
                                                        )}
                                                    </span>

                                                  `
                                                : ''
                                        }


                                        <span
                                            class="type-tag ${
                                                isLab
                                                    ? 'type-lab'
                                                    : 'type-theory'
                                            }"
                                            style="
                                                font-size:.65rem;
                                            "
                                        >
                                            ${
                                                isLab
                                                    ? 'Lab'
                                                    : 'Theory'
                                            }
                                        </span>


                                        <br>


                                        <span
                                            style="
                                                font-size:.8rem;
                                                color:var(--muted);
                                            "
                                        >

                                            ${escapeHtml(
                                                cls.teacher ||
                                                '?'
                                            )}

                                            •

                                            ${escapeHtml(
                                                cls.room ||
                                                '?'
                                            )}

                                        </span>

                                    </div>

                                `;

                            }
                        );


                        html +=
                            `</td>`;

                    }

                    else {

                        html += `

                            <td
                                style="
                                    color:var(--soft);
                                "
                            >
                                —
                            </td>

                        `;

                    }

                }
            );


            html +=
                `</tr>`;

        }
    );


    html += `

                </tbody>

            </table>

        </div>

    `;


    container.innerHTML =
        html;

}


// ============================================================
// SUBSECTION LABEL
// ============================================================

function getDisplayComment(
    cls,
    showComment,
    mode
) {

    // Teacher / Room mode
    if (showComment) {

        const section =
            cls._section ||
            cls.section ||
            cls.group ||
            '';


        return section
            ? `(${section})`
            : '';

    }


    // --------------------------------------------------------
    // NEW JSON
    // --------------------------------------------------------

    let sub =
        cls.sub_section ??
        cls.subSection ??
        cls.subsection ??
        'Main';


    sub =
        String(sub)
            .trim();


    // Main = NOTHING
    if (
        !sub ||
        sub.toLowerCase() ===
            'main'
    ) {

        return '';

    }


    let letter =
        cls.section_letter ||
        extractSectionLetter(
            cls.section
        );


    letter =
        String(
            letter || ''
        )
            .trim()
            .charAt(0)
            .toUpperCase();


    // 1 => N1
    if (
        /^\d+$/.test(sub)
    ) {

        return letter
            ? `(${letter}${sub})`
            : `(${sub})`;

    }


    // N1 => N1
    if (
        /^[A-Za-z]\d+$/.test(sub)
    ) {

        return `(${sub.toUpperCase()})`;

    }


    return '';

}


// ============================================================
// NORMALIZE
// ============================================================

function normalizeClasses(
    classes
) {

    if (
        !Array.isArray(classes)
    ) {

        return [];

    }


    return classes.map(
        cls => {

            const section =
                cls.section ||
                cls.section_name ||
                '';


            let sub =
                cls.sub_section ??
                cls.subSection ??
                cls.subsection ??
                'Main';


            if (
                sub === null ||
                sub === undefined ||
                sub === ''
            ) {

                sub = 'Main';

            }


            if (
                String(sub)
                    .toLowerCase() ===
                    'main'
            ) {

                sub = 'Main';

            }


            return {

                ...cls,

                day:
                    normalizeDay(
                        cls.day
                    ),

                time:
                    normalizeTime(
                        cls.time
                    ),

                course:
                    String(
                        cls.course ||
                        cls.course_code ||
                        ''
                    ).trim(),

                teacher:
                    String(
                        cls.teacher ||
                        cls.faculty ||
                        ''
                    ).trim(),

                room:
                    String(
                        cls.room ||
                        cls.room_no ||
                        ''
                    ).trim(),

                section:

                    section,

                sub_section:

                    String(
                        sub
                    ).trim(),

                section_letter:

                    cls.section_letter ||
                    extractSectionLetter(
                        section
                    ),

                batch:

                    cls.batch ||
                    extractBatchFromSection(
                        section
                    ),

                type:

                    normalizeClassType(
                        cls.type ||
                        cls.class_type ||
                        ''
                    )

            };

        }
    );

}


// ============================================================
// DAY NORMALIZE
// ============================================================

function normalizeDay(
    day
) {

    if (!day) {
        return '';
    }


    const value =
        String(day)
            .trim()
            .toLowerCase();


    const map = {

        saturday:
            'Saturday',

        sunday:
            'Sunday',

        monday:
            'Monday',

        tuesday:
            'Tuesday',

        wednesday:
            'Wednesday',

        thursday:
            'Thursday',

        friday:
            'Friday'

    };


    return (
        map[value] ||
        String(day).trim()
    );

}


// ============================================================
// TIME NORMALIZE
// ============================================================

function normalizeTime(
    time
) {

    if (!time) {
        return '';
    }


    return String(time)
        .trim()
        .replace(
            /\s+/g,
            ''
        )
        .replace(
            /[–—]/g,
            '-'
        );

}


// ============================================================
// TYPE
// ============================================================

function normalizeClassType(
    type
) {

    if (!type) {
        return '';
    }


    const value =
        String(type)
            .trim()
            .toLowerCase();


    if (
        value.includes('lab')
    ) {

        return 'Lab';

    }


    if (
        value.includes('theory')
    ) {

        return 'Theory';

    }


    return String(type)
        .trim();

}


// ============================================================
// SORT
// ============================================================

function sortClasses(
    classes
) {

    return [...classes].sort(
        (a, b) => {

            const dayA =
                DAY_ORDER[
                    normalizeDay(
                        a.day
                    )
                ] ?? 999;


            const dayB =
                DAY_ORDER[
                    normalizeDay(
                        b.day
                    )
                ] ?? 999;


            if (
                dayA !== dayB
            ) {

                return dayA - dayB;

            }


            const timeA =
                getTimeOrder(
                    getClassTimeSlot(
                        a
                    )
                );


            const timeB =
                getTimeOrder(
                    getClassTimeSlot(
                        b
                    )
                );


            if (
                timeA !== timeB
            ) {

                return timeA - timeB;

            }


            return String(
                a.course || ''
            ).localeCompare(
                String(
                    b.course || ''
                )
            );

        }
    );

}


// ============================================================
// TIME ORDER
// ============================================================

function getTimeOrder(
    time
) {

    const normalized =
        normalizeTime(
            time
        );


    if (
        Object.prototype.hasOwnProperty.call(
            TIME_ORDER,
            normalized
        )
    ) {

        return TIME_ORDER[
            normalized
        ];

    }


    return getTimeStartMinutes(
        normalized
    );

}


// ============================================================
// TIME START
// ============================================================

function getTimeStartMinutes(
    time
) {

    if (!time) {
        return 9999;
    }


    const match =
        String(time).match(
            /^(\d{1,2}):(\d{2})/
        );


    if (!match) {
        return 9999;
    }


    let hour =
        Number(
            match[1]
        );


    const minute =
        Number(
            match[2]
        );


    if (
        hour >= 1 &&
        hour <= 5
    ) {

        hour += 12;

    }


    return (
        hour * 60 +
        minute
    );

}


// ============================================================
// CLASS TIME
// ============================================================

function getClassTimeSlot(
    cls
) {

    if (
        cls.start &&
        cls.end
    ) {

        return normalizeTime(
            `${cls.start}-${cls.end}`
        );

    }


    return normalizeTime(
        cls.time || ''
    );

}


// ============================================================
// SECTION
// ============================================================

function getBaseSection(
    section
) {

    return String(
        section || ''
    )
        .trim()
        .toUpperCase()
        .replace(
            /_\d+$/,
            ''
        );

}


// ============================================================
// BATCH
// ============================================================

function extractBatchFromSection(
    section
) {

    const match =
        String(
            section || ''
        ).match(
            /^(\d+)/
        );


    return match
        ? match[1]
        : '';

}


// ============================================================
// SECTION LETTER
// ============================================================

function extractSectionLetter(
    section
) {

    const value =
        String(
            section || ''
        ).trim();


    const match =
        value.match(
            /^\d+[_\-\s]*([A-Za-z])/
        );


    if (match) {

        return match[1]
            .toUpperCase();

    }


    const fallback =
        value.match(
            /([A-Za-z])$/
        );


    return fallback
        ? fallback[1].toUpperCase()
        : '';

}


// ============================================================
// REMOVE DUPLICATE
// ============================================================

function removeDuplicateClasses(
    classes
) {

    const seen =
        new Set();


    const result =
        [];


    classes.forEach(
        cls => {

            const key = [

                cls.day || '',

                getClassTimeSlot(
                    cls
                ),

                cls.course || '',

                cls.teacher || '',

                cls.room || '',

                cls.sub_section ||
                    '',

                cls.section ||
                    cls._section ||
                    ''

            ].join('|');


            if (
                seen.has(key)
            ) {

                return;

            }


            seen.add(key);

            result.push(
                cls
            );

        }
    );


    return result;

}


// ============================================================
// META
// ============================================================

function updateMeta(
    data
) {

    if (!data) {
        return;
    }


    if (
        data.version &&
        versionNumber
    ) {

        versionNumber.textContent =
            String(
                data.version
            ).replace(
                /^v/i,
                ''
            );

    }


    if (
        data.updated_at &&
        lastUpdated
    ) {

        const date =
            new Date(
                data.updated_at
            );


        lastUpdated.textContent =
            'Updated: ' +
            date.toLocaleString();

    }

}


// ============================================================
// SEMESTER
// ============================================================

function getSemester() {

    // If JSON has semester
    if (
        routineData &&
        routineData.semester
    ) {

        return String(
            routineData.semester
        );

    }


    // If JSON has metadata
    if (
        routineData &&
        routineData.meta &&
        routineData.meta.semester
    ) {

        return String(
            routineData.meta.semester
        );

    }


    // Current DIU routine fallback
    return 'Summer 2026';

}


// ============================================================
// DOWNLOAD ROUTINE IMAGE
// ============================================================

async function downloadSection() {

    if (
        !currentClasses ||
        !currentClasses.length
    ) {

        showMessage(
            'No routine available to download.',
            'error'
        );

        return;

    }


    try {

        showMessage(
            'Preparing routine image...',
            'info'
        );


        // ----------------------------------------------------
        // Load html2canvas automatically.
        // No HTML modification required.
        // ----------------------------------------------------

        await loadHtml2Canvas();


        const imageElement =
            createRoutineDownloadCard();


        document.body.appendChild(
            imageElement
        );


        // Give browser time to render fonts/table
        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    300
                )
        );


        const canvas =
            await html2canvas(
                imageElement,
                {

                    scale: 2,

                    backgroundColor:
                        '#ffffff',

                    useCORS: true,

                    allowTaint: true,

                    logging: false,

                    width:
                        imageElement
                            .scrollWidth,

                    height:
                        imageElement
                            .scrollHeight

                }
            );


        imageElement.remove();


        const link =
            document.createElement(
                'a'
            );


        const section =
            currentMode === 'section'
                ? currentSearchTerm
                : (
                    currentClasses[0]?.section ||
                    currentSearchTerm ||
                    'routine'
                );


        link.download =
            `DIU-CSE-Routine-${section}.png`;


        link.href =
            canvas.toDataURL(
                'image/png'
            );


        link.click();


        showMessage(
            'Routine image downloaded successfully.',
            'success'
        );

    }

    catch (error) {

        console.error(
            'Download error:',
            error
        );


        showMessage(
            'Could not create routine image.',
            'error'
        );

    }

}


// ============================================================
// LOAD HTML2CANVAS
// ============================================================

function loadHtml2Canvas() {

    return new Promise(
        (resolve, reject) => {

            if (
                window.html2canvas
            ) {

                resolve();

                return;

            }


            const existing =
                document.querySelector(
                    'script[data-html2canvas]'
                );


            if (existing) {

                existing.addEventListener(
                    'load',
                    () => resolve()
                );

                existing.addEventListener(
                    'error',
                    () =>
                        reject(
                            new Error(
                                'html2canvas failed to load.'
                            )
                        )
                );

                return;

            }


            const script =
                document.createElement(
                    'script'
                );


            script.src =
                'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';


            script.async =
                true;


            script.dataset.html2canvas =
                'true';


            script.onload =
                () => resolve();


            script.onerror =
                () =>
                    reject(
                        new Error(
                            'Unable to load html2canvas.'
                        )
                    );


            document.head.appendChild(
                script
            );

        }
    );

}


// ============================================================
// CREATE DOWNLOAD TABLE
// ============================================================

function createRoutineDownloadCard() {

    const wrapper =
        document.createElement(
            'div'
        );


    wrapper.style.position =
        'fixed';

    wrapper.style.left =
        '-100000px';

    wrapper.style.top =
        '0';

    wrapper.style.width =
        '1500px';

    wrapper.style.background =
        '#f8fafc';

    wrapper.style.padding =
        '45px';

    wrapper.style.boxSizing =
        'border-box';

    wrapper.style.fontFamily =
        'Arial, Helvetica, sans-serif';

    wrapper.style.color =
        '#111827';


    const section =
        currentMode === 'section'
            ? currentSearchTerm
            : (
                currentClasses[0]?.section ||
                currentSearchTerm
            );


    const semester =
        getSemester();


    const version =
        String(
            routineData?.version ||
            versionNumber?.textContent ||
            '5.0'
        ).replace(
            /^v/i,
            ''
        );


    const sorted =
        sortClasses(
            normalizeClasses(
                currentClasses
            )
        );


    // --------------------------------------------------------
    // Map classes
    // --------------------------------------------------------

    const cellMap =
        {};


    DAYS.forEach(
        day => {

            cellMap[day] =
                {};

            DISPLAY_TIME_SLOTS.forEach(
                slot => {

                    cellMap[day][slot] =
                        [];

                }
            );

        }
    );


    sorted.forEach(
        cls => {

            const day =
                normalizeDay(
                    cls.day
                );


            const slot =
                getClassTimeSlot(
                    cls
                );


            if (
                cellMap[day] &&
                cellMap[day][slot]
            ) {

                cellMap[day][slot].push(
                    cls
                );

            }

        }
    );


    // --------------------------------------------------------
    // Header
    // --------------------------------------------------------

    wrapper.innerHTML = `

        <div
            style="
                background:#ffffff;
                border-radius:24px;
                overflow:hidden;
                box-shadow:
                    0 20px 60px
                    rgba(15,23,42,.12);
                border:1px solid #e5e7eb;
            "
        >

            <!-- HEADER -->

            <div
                style="
                    padding:38px 42px 30px;
                    background:
                        linear-gradient(
                            135deg,
                            #111827 0%,
                            #1f2937 100%
                        );
                    color:#ffffff;
                "
            >

                <div
                    style="
                        font-size:14px;
                        letter-spacing:2px;
                        font-weight:700;
                        opacity:.75;
                        margin-bottom:8px;
                    "
                >
                    DAFFODIL INTERNATIONAL UNIVERSITY
                </div>


                <div
                    style="
                        font-size:30px;
                        font-weight:800;
                        margin-bottom:8px;
                    "
                >
                    Department of Computer Science & Engineering
                </div>


                <div
                    style="
                        font-size:18px;
                        opacity:.9;
                    "
                >
                    CSE Class Routine
                </div>


                <div
                    style="
                        display:flex;
                        gap:12px;
                        flex-wrap:wrap;
                        margin-top:25px;
                    "
                >

                    <span
                        style="
                            background:rgba(255,255,255,.12);
                            border:1px solid rgba(255,255,255,.18);
                            padding:9px 16px;
                            border-radius:999px;
                            font-size:14px;
                            font-weight:700;
                        "
                    >
                        Section:
                        ${escapeHtml(section)}
                    </span>


                    <span
                        style="
                            background:rgba(255,255,255,.12);
                            border:1px solid rgba(255,255,255,.18);
                            padding:9px 16px;
                            border-radius:999px;
                            font-size:14px;
                            font-weight:700;
                        "
                    >
                        ${escapeHtml(semester)}
                    </span>


                    <span
                        style="
                            background:rgba(255,255,255,.12);
                            border:1px solid rgba(255,255,255,.18);
                            padding:9px 16px;
                            border-radius:999px;
                            font-size:14px;
                            font-weight:700;
                        "
                    >
                        Version v${escapeHtml(version)}
                    </span>

                </div>

            </div>


            <!-- TABLE -->

            <div
                style="
                    padding:28px;
                    background:#ffffff;
                "
            >

                <table
                    style="
                        width:100%;
                        border-collapse:separate;
                        border-spacing:0;
                        table-layout:fixed;
                        font-size:13px;
                    "
                >

                    <thead>

                        <tr>

                            <th
                                style="
                                    width:120px;
                                    background:#111827;
                                    color:#ffffff;
                                    padding:16px 10px;
                                    text-align:center;
                                    border:1px solid #111827;
                                "
                            >
                                DAY
                            </th>

                            ${DISPLAY_TIME_SLOTS.map(
                                slot =>
                                    `

                                    <th
                                        style="
                                            background:#111827;
                                            color:#ffffff;
                                            padding:16px 8px;
                                            text-align:center;
                                            border-left:1px solid #374151;
                                            font-size:12px;
                                        "
                                    >
                                        ${slot}
                                    </th>

                                    `
                            ).join('')}

                        </tr>

                    </thead>


                    <tbody>

                        ${DAYS.map(
                            (day, dayIndex) => `

                            <tr>

                                <td
                                    style="
                                        background:#f1f5f9;
                                        font-weight:800;
                                        font-size:14px;
                                        padding:18px 10px;
                                        text-align:center;
                                        border-left:1px solid #e2e8f0;
                                        border-bottom:1px solid #e2e8f0;
                                        border-right:1px solid #e2e8f0;
                                    "
                                >
                                    ${day}
                                </td>


                                ${DISPLAY_TIME_SLOTS.map(
                                    slot => {

                                        const list =
                                            cellMap[day][slot] ||
                                            [];


                                        if (!list.length) {

                                            return `

                                                <td
                                                    style="
                                                        background:#ffffff;
                                                        text-align:center;
                                                        vertical-align:middle;
                                                        padding:12px 6px;
                                                        border-right:1px solid #e2e8f0;
                                                        border-bottom:1px solid #e2e8f0;
                                                        color:#cbd5e1;
                                                        height:95px;
                                                    "
                                                >
                                                    —
                                                </td>

                                            `;

                                        }


                                        const content =
                                            list
                                                .map(
                                                    cls => {

                                                        const comment =
                                                            getDisplayComment(
                                                                cls,
                                                                currentMode !== 'section',
                                                                currentMode
                                                            );


                                                        const isLab =
                                                            normalizeClassType(
                                                                cls.type
                                                            ) === 'Lab';


                                                        return `

                                                            <div
                                                                style="
                                                                    background:${
                                                                        isLab
                                                                            ? '#f5f3ff'
                                                                            : '#f8fafc'
                                                                    };
                                                                    border:1px solid ${
                                                                        isLab
                                                                            ? '#ddd6fe'
                                                                            : '#e2e8f0'
                                                                    };
                                                                    border-radius:10px;
                                                                    padding:9px;
                                                                    margin-bottom:6px;
                                                                "
                                                            >

                                                                <div
                                                                    style="
                                                                        font-size:14px;
                                                                        font-weight:800;
                                                                        color:#111827;
                                                                    "
                                                                >
                                                                    ${escapeHtml(
                                                                        cls.course
                                                                    )}

                                                                    ${
                                                                        comment
                                                                            ? `
                                                                                <span
                                                                                    style="
                                                                                        font-size:10px;
                                                                                        font-weight:700;
                                                                                        color:#64748b;
                                                                                    "
                                                                                >
                                                                                    ${escapeHtml(
                                                                                        comment
                                                                                    )}
                                                                                </span>
                                                                              `
                                                                            : ''
                                                                    }

                                                                </div>


                                                                <div
                                                                    style="
                                                                        margin-top:4px;
                                                                        font-size:11px;
                                                                        font-weight:700;
                                                                        color:#475569;
                                                                    "
                                                                >
                                                                    ${escapeHtml(
                                                                        cls.teacher ||
                                                                        'TBA'
                                                                    )}
                                                                </div>


                                                                <div
                                                                    style="
                                                                        margin-top:3px;
                                                                        font-size:11px;
                                                                        color:#64748b;
                                                                    "
                                                                >
                                                                    ${escapeHtml(
                                                                        cls.room ||
                                                                        'TBA'
                                                                    )}
                                                                </div>


                                                                <div
                                                                    style="
                                                                        margin-top:5px;
                                                                        display:inline-block;
                                                                        font-size:9px;
                                                                        font-weight:800;
                                                                        padding:3px 7px;
                                                                        border-radius:999px;
                                                                        background:${
                                                                            isLab
                                                                                ? '#ede9fe'
                                                                                : '#e2e8f0'
                                                                        };
                                                                        color:${
                                                                            isLab
                                                                                ? '#6d28d9'
                                                                                : '#475569'
                                                                        };
                                                                    "
                                                                >
                                                                    ${
                                                                        isLab
                                                                            ? 'LAB'
                                                                            : 'THEORY'
                                                                    }
                                                                </div>

                                                            </div>

                                                        `;

                                                    }
                                                )
                                                .join('');


                                        return `

                                            <td
                                                style="
                                                    background:#ffffff;
                                                    vertical-align:top;
                                                    padding:8px;
                                                    border-right:1px solid #e2e8f0;
                                                    border-bottom:1px solid #e2e8f0;
                                                    height:95px;
                                                "
                                            >
                                                ${content}
                                            </td>

                                        `;

                                    }
                                ).join('')}

                            </tr>

                        `
                        ).join('')}

                    </tbody>

                </table>


                <!-- FOOTER -->

                <div
                    style="
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                        margin-top:22px;
                        padding-top:18px;
                        border-top:1px solid #e5e7eb;
                        font-size:11px;
                        color:#64748b;
                    "
                >

                    <span>
                        DIU CSE Routine
                    </span>


                    <span>
                        ${sorted.length} Classes
                    </span>


                    <span>
                        ${escapeHtml(semester)}
                    </span>

                </div>

            </div>

        </div>

    `;


    return wrapper;

}


// ============================================================
// CLEAR
// ============================================================

function handleClearSection() {

    localStorage.removeItem(
        STORAGE_KEY
    );


    savedChip.style.display =
        'none';


    sectionInput.value =
        '';


    showMessage(
        'Saved search cleared.',
        'info'
    );


    loadRoutineData();

}


// ============================================================
// NO ROUTINE
// ============================================================

function showNoRoutine(
    title,
    msg
) {

    routineContainer.innerHTML = `

        <div class="no-routine">

            <div class="icon">
                📅
            </div>

            <h3>
                ${escapeHtml(title)}
            </h3>

            <p>
                ${escapeHtml(msg)}
            </p>

        </div>

    `;

}


// ============================================================
// STATUS
// ============================================================

function setStatus(
    type,
    text
) {

    if (statusBadge) {

        statusBadge.className =
            'status ' + type;

    }


    if (statusText) {

        statusText.textContent =
            text;

    }

}


// ============================================================
// MESSAGE
// ============================================================

function showMessage(
    text,
    type
) {

    if (!message) {
        return;
    }


    message.textContent =
        text;


    message.className =
        type;


    message.style.display =
        'block';


    setTimeout(
        () => {

            if (message) {

                message.style.display =
                    'none';

            }

        },
        5000
    );

}


function hideMessage() {

    if (message) {

        message.style.display =
            'none';

    }

}


// ============================================================
// ESCAPE HTML
// ============================================================

function escapeHtml(
    text
) {

    if (
        text === null ||
        text === undefined ||
        text === ''
    ) {

        return '-';

    }


    const div =
        document.createElement(
            'div'
        );


    div.textContent =
        String(text);


    return div.innerHTML;

}


// ============================================================
// AUTO REFRESH
// ============================================================

setInterval(
    () => {

        if (
            document.hidden
        ) {
            return;
        }


        const saved =
            localStorage.getItem(
                STORAGE_KEY
            );


        if (!saved) {
            return;
        }


        if (
            currentMode === 'section'
        ) {

            loadSection(
                saved
            );

        }


        else if (
            currentMode === 'teacher'
        ) {

            loadTeacher(
                saved
            );

        }


        else if (
            currentMode === 'room'
        ) {

            loadRoom(
                saved
            );

        }

    },
    5 * 60 * 1000
);
