// DIU CSE Routine – Section, Teacher & Room Modes
// Updated:
// - Correct chronological time sorting
// - Main section shows no "(N)"
// - Lab sections show "(N1)" / "(N2)"
// - Supports new JSON: sub_section, section_letter, type
// - Teacher & Room modes preserved
// - Search icon preserved
// - Existing UI structure preserved

const STORAGE_KEY = 'diu_cse_section';
const MODE_KEY = 'diu_cse_mode'; // 'section', 'teacher', 'room'
const COMBINED_URL = './data/routine.json?t=' + Date.now();

// ============================================================
// DOM ELEMENTS
// ============================================================

const sectionInput = document.getElementById('sectionInput');
const showRoutineBtn = document.getElementById('showRoutineBtn');
const clearSectionBtn = document.getElementById('clearSectionBtn');
const savedChip = document.getElementById('savedChip');
const savedSectionSpan = document.getElementById('savedSection');
const routineContainer = document.getElementById('routineContainer');
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const versionNumber = document.getElementById('versionNumber');
const lastUpdated = document.getElementById('lastUpdated');
const message = document.getElementById('message');
const searchIcon = document.querySelector('.search-input-wrap i');

// Navigation buttons
const userBtn = document.querySelector('.nav-item:first-child');
const teacherBtn = document.querySelector('.nav-item .fa-address-card')?.closest('.nav-item');
const roomBtn = document.querySelector('.nav-item .fa-door-open')?.closest('.nav-item');

let routineData = null;
let currentMode = 'section';
let currentSearchTerm = '';
let currentClasses = [];


// ============================================================
// FIXED DAY ORDER
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
// FIXED TIME ORDER
// ============================================================

const TIME_ORDER = {
    '08:30-10:00': 0,
    '10:00-11:30': 1,
    '11:30-01:00': 2,
    '01:00-02:30': 3,
    '02:30-04:00': 4,
    '04:00-05:30': 5
};


// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

    const savedMode =
        localStorage.getItem(MODE_KEY) || 'section';

    currentMode = savedMode;

    updateModeUI();

    const saved =
        localStorage.getItem(STORAGE_KEY);

    if (saved) {
        sectionInput.value = saved;
        savedSectionSpan.textContent = saved;
        savedChip.style.display = 'inline-flex';
    } else {
        savedChip.style.display = 'none';
    }

    loadRoutineData();


    // Search icon
    if (searchIcon) {
        searchIcon.style.cursor = 'pointer';
        searchIcon.addEventListener(
            'click',
            handleSearch
        );
    }


    // Hidden button
    if (showRoutineBtn) {
        showRoutineBtn.addEventListener(
            'click',
            handleSearch
        );
    }


    // Clear button
    if (clearSectionBtn) {
        clearSectionBtn.addEventListener(
            'click',
            handleClearSection
        );
    }


    // Enter key
    if (sectionInput) {

        sectionInput.addEventListener(
            'keydown',
            (e) => {

                if (
                    e.key === 'Enter' ||
                    e.keyCode === 13
                ) {
                    e.preventDefault();
                    handleSearch();
                }

            }
        );

        sectionInput.addEventListener(
            'keypress',
            (e) => {

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


    // Mode toggles
    if (userBtn) {
        userBtn.addEventListener(
            'click',
            () => setMode('section')
        );
    }

    if (teacherBtn) {
        teacherBtn.addEventListener(
            'click',
            () => setMode('teacher')
        );
    }

    if (roomBtn) {
        roomBtn.addEventListener(
            'click',
            () => setMode('room')
        );
    }

});


// ============================================================
// MODE MANAGEMENT
// ============================================================

function setMode(mode) {

    if (currentMode === mode) return;

    currentMode = mode;

    localStorage.setItem(
        MODE_KEY,
        mode
    );

    updateModeUI();

    routineContainer.innerHTML = '';

    savedChip.style.display = 'none';

    sectionInput.value = '';

    localStorage.removeItem(STORAGE_KEY);

    showMessage(
        `Switched to ${
            mode.charAt(0).toUpperCase() +
            mode.slice(1)
        } Mode`,
        'info'
    );


    if (mode === 'section') {

        sectionInput.placeholder =
            'Enter section (e.g., 70_N)';

        loadRoutineData();

    }

    else if (mode === 'teacher') {

        sectionInput.placeholder =
            'Enter teacher initials (e.g., ABC)';

        showNoRoutine(
            'Teacher Mode',
            'Enter teacher initials to see their classes.'
        );

    }

    else if (mode === 'room') {

        sectionInput.placeholder =
            'Enter room (e.g., KT-201)';

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

    const brandStrong =
        document.querySelector('.brand strong');

    if (brandStrong) {

        if (currentMode === 'section') {
            brandStrong.textContent = 'Student';
        }

        else if (currentMode === 'teacher') {
            brandStrong.textContent = 'Teacher';
        }

        else if (currentMode === 'room') {
            brandStrong.textContent = 'Room';
        }
    }


    document
        .querySelectorAll('.nav-item')
        .forEach(el =>
            el.classList.remove('active')
        );


    if (
        currentMode === 'section' &&
        userBtn
    ) {
        userBtn.classList.add('active');
    }

    else if (
        currentMode === 'teacher' &&
        teacherBtn
    ) {
        teacherBtn.classList.add('active');
    }

    else if (
        currentMode === 'room' &&
        roomBtn
    ) {
        roomBtn.classList.add('active');
    }
}


// ============================================================
// SEARCH DISPATCH
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


    if (currentMode === 'section') {
        loadSection(normalized);
    }

    else if (currentMode === 'teacher') {
        loadTeacher(normalized);
    }

    else if (currentMode === 'room') {
        loadRoom(normalized);
    }
}


// ============================================================
// LOAD ROUTINE DATA
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

            await loadSection(saved);

            return;
        }


        const response =
            await fetch(COMBINED_URL);


        if (!response.ok) {
            throw new Error(
                'Failed to load combined data'
            );
        }


        const data =
            await response.json();


        routineData = data;


        if (
            data.version &&
            versionNumber
        ) {

            versionNumber.textContent =
                String(data.version)
                    .replace(/^v/i, '');
        }


        if (
            data.updated_at &&
            lastUpdated
        ) {

            const date =
                new Date(data.updated_at);

            lastUpdated.textContent =
                'Updated: ' +
                date.toLocaleString();
        }


        if (currentMode === 'section') {

            const sections =
                data.sections || {};

            const keys =
                Object.keys(sections);


            if (keys.length > 0) {

                const firstBase =
                    getBaseSection(keys[0]);


                const merged =
                    mergeSubSections(
                        firstBase
                    );


                if (merged.length > 0) {

                    displaySection(
                        firstBase,
                        merged
                    );


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

                }

                else {

                    showNoRoutine(
                        'No Data',
                        'No routine data available.'
                    );

                }

            }

            else {

                showNoRoutine(
                    'No Data',
                    'No routine data available.'
                );

            }

        }

        else {

            showNoRoutine(
                `${
                    currentMode
                        .charAt(0)
                        .toUpperCase() +
                    currentMode.slice(1)
                } Mode`,
                `Enter ${currentMode} name to see results.`
            );

        }


        setStatus(
            'ready',
            'Ready'
        );


    }

    catch (error) {

        console.error(
            'Failed to load routine:',
            error
        );

        setStatus(
            'error',
            'Error'
        );

        showMessage(
            'Could not load routine data. Please try again.',
            'error'
        );

        showNoRoutine(
            'Error',
            'Data could not be loaded.'
        );

    }
}


// ============================================================
// SECTION LOADING
// ============================================================

async function loadSection(sectionKey) {

    try {

        setStatus(
            'loading',
            'Loading...'
        );


        const normalized =
            sectionKey
                .toUpperCase()
                .replace(/\s+/g, '_');


        console.log(
            '🔍 Searching for section:',
            normalized
        );


        if (!routineData) {

            const resp =
                await fetch(COMBINED_URL);


            if (!resp.ok) {
                throw new Error(
                    'Combined data not found'
                );
            }


            routineData =
                await resp.json();


            updateMeta(
                routineData
            );
        }


        const sections =
            routineData.sections || {};


        const baseSection =
            getBaseSection(normalized);


        // Find exact/base section first.
        let matchingKeys =
            Object.keys(sections)
                .filter(
                    key =>
                        key === normalized ||
                        key === baseSection ||
                        getBaseSection(key) === baseSection
                );


        // Fallback
        if (matchingKeys.length === 0) {

            const fallbackKey =
                Object.keys(sections).find(
                    key =>
                        key.startsWith(normalized) ||
                        normalized.startsWith(key)
                );


            if (fallbackKey) {
                matchingKeys.push(
                    fallbackKey
                );
            }
        }


        if (matchingKeys.length === 0) {

            throw new Error(
                `Section "${normalized}" not found.`
            );

        }


        const mergedClasses = [];


        for (
            const key of matchingKeys
        ) {

            const secData =
                sections[key];


            if (
                secData &&
                Array.isArray(secData)
            ) {

                mergedClasses.push(
                    ...secData
                );

            }

            else if (
                secData &&
                Array.isArray(
                    secData.classes
                )
            ) {

                mergedClasses.push(
                    ...secData.classes
                );

            }

        }


        if (
            mergedClasses.length === 0
        ) {

            throw new Error(
                `No classes found for section "${normalized}".`
            );

        }


        // Remove exact duplicates.
        const uniqueClasses =
            removeDuplicateClasses(
                mergedClasses
            );


        currentSearchTerm =
            baseSection;


        currentClasses =
            uniqueClasses;


        displaySection(
            baseSection,
            uniqueClasses
        );


        localStorage.setItem(
            STORAGE_KEY,
            normalized
        );


        savedSectionSpan.textContent =
            normalized;


        savedChip.style.display =
            'inline-flex';


        setStatus(
            'ready',
            'Ready'
        );


        hideMessage();


    }

    catch (error) {

        console.error(
            '❌ Failed to load section:',
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
// MERGE SUB-SECTIONS
// ============================================================

function mergeSubSections(baseSection) {

    if (!routineData) return [];

    const sections =
        routineData.sections || {};


    const all = [];


    for (
        const [key, secData]
        of Object.entries(sections)
    ) {

        if (
            key === baseSection ||
            getBaseSection(key) === baseSection
        ) {

            const classes =
                Array.isArray(secData)
                    ? secData
                    : secData?.classes;


            if (Array.isArray(classes)) {

                all.push(
                    ...classes
                );

            }

        }

    }


    return removeDuplicateClasses(all);
}


// ============================================================
// TEACHER LOADING
// ============================================================

async function loadTeacher(initials) {

    try {

        setStatus(
            'loading',
            'Loading...'
        );


        const clean =
            initials
                .toUpperCase()
                .replace(/\s+/g, '');


        console.log(
            '🔍 Searching for teacher:',
            clean
        );


        if (!routineData) {

            const resp =
                await fetch(COMBINED_URL);


            if (!resp.ok) {
                throw new Error(
                    'Combined data not found'
                );
            }


            routineData =
                await resp.json();


            updateMeta(
                routineData
            );
        }


        const sections =
            routineData.sections || {};


        const allClasses = [];


        for (
            const [secKey, secData]
            of Object.entries(sections)
        ) {

            const classes =
                Array.isArray(secData)
                    ? secData
                    : secData?.classes;


            if (!Array.isArray(classes)) {
                continue;
            }


            for (const cls of classes) {

                const teacher =
                    String(
                        cls.teacher || ''
                    )
                        .toUpperCase()
                        .replace(/\s+/g, '');


                if (
                    teacher.includes(clean)
                ) {

                    const enriched = {
                        ...cls,
                        _section: secKey
                    };


                    allClasses.push(
                        enriched
                    );

                }

            }

        }


        const uniqueClasses =
            removeDuplicateClasses(
                allClasses
            );


        if (
            uniqueClasses.length === 0
        ) {

            throw new Error(
                `No classes found for teacher "${initials}".`
            );

        }


        currentSearchTerm =
            clean;


        currentClasses =
            uniqueClasses;


        displayTeacherRoutine(
            clean,
            uniqueClasses
        );


        localStorage.setItem(
            STORAGE_KEY,
            initials
        );


        savedSectionSpan.textContent =
            initials;


        savedChip.style.display =
            'inline-flex';


        setStatus(
            'ready',
            'Ready'
        );


        hideMessage();


    }

    catch (error) {

        console.error(
            '❌ Failed to load teacher:',
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
// ROOM LOADING
// ============================================================

async function loadRoom(roomName) {

    try {

        setStatus(
            'loading',
            'Loading...'
        );


        const clean =
            roomName
                .toUpperCase()
                .replace(/\s+/g, '');


        console.log(
            '🔍 Searching for room:',
            clean
        );


        if (!routineData) {

            const resp =
                await fetch(COMBINED_URL);


            if (!resp.ok) {
                throw new Error(
                    'Combined data not found'
                );
            }


            routineData =
                await resp.json();


            updateMeta(
                routineData
            );
        }


        const sections =
            routineData.sections || {};


        const allClasses = [];


        for (
            const [secKey, secData]
            of Object.entries(sections)
        ) {

            const classes =
                Array.isArray(secData)
                    ? secData
                    : secData?.classes;


            if (!Array.isArray(classes)) {
                continue;
            }


            for (const cls of classes) {

                const room =
                    String(
                        cls.room || ''
                    )
                        .toUpperCase()
                        .replace(/\s+/g, '');


                if (
                    room.includes(clean)
                ) {

                    const enriched = {
                        ...cls,
                        _section: secKey
                    };


                    allClasses.push(
                        enriched
                    );

                }

            }

        }


        const uniqueClasses =
            removeDuplicateClasses(
                allClasses
            );


        if (
            uniqueClasses.length === 0
        ) {

            throw new Error(
                `No classes found for room "${roomName}".`
            );

        }


        currentSearchTerm =
            clean;


        currentClasses =
            uniqueClasses;


        displayRoomRoutine(
            clean,
            uniqueClasses
        );


        localStorage.setItem(
            STORAGE_KEY,
            roomName
        );


        savedSectionSpan.textContent =
            roomName;


        savedChip.style.display =
            'inline-flex';


        setStatus(
            'ready',
            'Ready'
        );


        hideMessage();


    }

    catch (error) {

        console.error(
            '❌ Failed to load room:',
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
// DISPLAY WRAPPERS
// ============================================================

function displaySection(
    sectionKey,
    classes
) {

    displayRoutine(
        classes,
        sectionKey,
        false,
        'section'
    );
}


function displayTeacherRoutine(
    initials,
    classes
) {

    displayRoutine(
        classes,
        initials,
        true,
        'teacher'
    );
}


function displayRoomRoutine(
    roomName,
    classes
) {

    displayRoutine(
        classes,
        roomName,
        true,
        'room'
    );
}


// ============================================================
// GENERIC DISPLAY ROUTINE
// ============================================================

function displayRoutine(
    classes,
    title,
    showComment,
    mode
) {

    routineContainer.innerHTML = '';


    if (
        !classes ||
        classes.length === 0
    ) {

        showNoRoutine(
            'No Data',
            'No classes found.'
        );

        return;
    }


    // ALWAYS sort before display.
    classes =
        sortClasses(
            normalizeClasses(classes)
        );


    const teachers =
        [
            ...new Set(
                classes
                    .map(c => c.teacher)
                    .filter(
                        t =>
                            t &&
                            t !== '?' &&
                            t !== 'TBA'
                    )
            )
        ];


    const total =
        classes.length;


    const uniqueDays =
        [
            ...new Set(
                classes
                    .map(c => normalizeDay(c.day))
                    .filter(
                        d =>
                            DAYS.includes(d)
                    )
            )
        ];


    const perWeek =
        uniqueDays.length;


    const batches =
        [
            ...new Set(
                classes
                    .map(
                        c =>
                            c.batch ||
                            c.group?.split('_')[0] ||
                            'Unknown'
                    )
            )
        ];


    const batchDisplay =
        batches.length === 1
            ? batches[0]
            : 'Various';


    let html = '';


    // ========================================================
    // ENROLLED CARD
    // ========================================================

    const icon =
        mode === 'teacher'
            ? 'fa-chalkboard-teacher'
            : (
                mode === 'room'
                    ? 'fa-door-open'
                    : 'fa-user-graduate'
            );


    const label =
        mode === 'teacher'
            ? 'Teacher'
            : (
                mode === 'room'
                    ? 'Room'
                    : 'Student'
            );


    const cleanVersion =
        String(
            versionNumber?.textContent ||
            '5.0'
        ).replace(/^v/i, '');


    html += `
        <div class="enrolled-card">

            <div class="card-title">

                <h3>
                    <i class="fas ${icon}"></i>
                    ${escapeHtml(label)} ·
                    ${escapeHtml(title)}
                </h3>

                <button
                    class="cr-btn"
                    onclick="downloadSection()"
                >
                    <i class="fas fa-download"></i>
                </button>

            </div>


            <div class="course-meta">

                <div class="meta-row">
                    <span>Total Classes</span>
                    <strong>${total}</strong>
                </div>


                <div class="meta-row">
                    <span>Active Days</span>
                    <strong>${perWeek}</strong>
                </div>


                <div class="meta-row">
                    <span>Routine Version</span>
                    <strong>v${escapeHtml(cleanVersion)}</strong>
                </div>


                ${
                    batchDisplay !== 'Various'
                        ? `
                            <div class="meta-row">
                                <span>Batch</span>
                                <strong>
                                    ${escapeHtml(batchDisplay)}
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
                                <span>Sections</span>

                                <strong>
                                    ${
                                        [
                                            ...new Set(
                                                classes.map(
                                                    c =>
                                                        c._section ||
                                                        c.section ||
                                                        c.group ||
                                                        '?'
                                                )
                                            )
                                        ]
                                            .map(
                                                escapeHtml
                                            )
                                            .join(', ')
                                    }
                                </strong>

                            </div>
                          `
                        : ''
                }

            </div>


            <div class="download-row">

                <span>
                    <i class="fas fa-download"></i>
                    Download PDF for
                    ${escapeHtml(title)}
                </span>

                <button
                    class="download-btn"
                    onclick="downloadSection()"
                >
                    <i class="fas fa-arrow-down"></i>
                </button>

            </div>

        </div>
    `;


    // ========================================================
    // TEACHER ROW
    // ========================================================

    html += `
        <div class="teacher-row">
    `;


    if (teachers.length > 0) {

        teachers.forEach(t => {

            const initial =
                String(t)
                    .substring(0, 2)
                    .toUpperCase();


            html += `
                <div class="teacher">

                    <div class="avatar">

                        <span>
                            ${escapeHtml(initial)}
                        </span>

                        <span class="online"></span>

                    </div>

                    <span>
                        ${escapeHtml(t)}
                    </span>

                </div>
            `;

        });

    }

    else {

        html += `
            <div class="teacher blank">

                <div class="avatar">?</div>

                <span>No teachers</span>

            </div>
        `;

    }


    html += `</div>`;


    // ========================================================
    // VIEW TABS
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


    // Default Day View
    renderDayView(
        classes,
        showComment,
        mode
    );


    // Tabs
    document
        .querySelectorAll('.view-tab')
        .forEach(tab => {

            tab.addEventListener(
                'click',
                function () {

                    document
                        .querySelectorAll(
                            '.view-tab'
                        )
                        .forEach(t =>
                            t.classList.remove(
                                'active'
                            )
                        );


                    this.classList.add(
                        'active'
                    );


                    if (
                        this.dataset.view ===
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

        });

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


    if (!container) return;


    const grouped = {};


    DAYS.forEach(day => {
        grouped[day] = [];
    });


    for (const cls of classes) {

        const day =
            normalizeDay(cls.day);


        if (!grouped[day]) {
            grouped[day] = [];
        }


        grouped[day].push(
            cls
        );

    }


    let html =
        `<div class="day-grid">`;


    for (const day of DAYS) {

        if (
            !grouped[day] ||
            grouped[day].length === 0
        ) {
            continue;
        }


        // IMPORTANT:
        // Exact fixed chronological sorting.
        const sorted =
            sortClasses(
                grouped[day]
            );


        html += `
            <div class="day-card">

                <div class="day-card-header">

                    <span>
                        <i class="fas fa-calendar-alt"></i>
                        ${day}
                    </span>

                    <span>
                        ${sorted.length} classes
                    </span>

                </div>


                <div class="day-card-body">
        `;


        for (const cls of sorted) {

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


            const timeDisplay =
                cls.start &&
                cls.end
                    ? `${cls.start} – ${cls.end}`
                    : (
                        cls.time ||
                        'TBA'
                    );


            html += `
                <div class="class-item">

                    <div class="time">

                        <i class="far fa-clock"></i>

                        ${escapeHtml(
                            timeDisplay
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
                                            font-size:0.8rem;
                                            color:var(--muted);
                                        "
                                    >
                                        ${escapeHtml(comment)}
                                    </span>
                                  `
                                : ''
                        }

                    </div>


                    <div class="details">

                        <span>
                            <i class="fas fa-chalkboard-teacher"></i>
                            ${escapeHtml(
                                cls.teacher || '?'
                            )}
                        </span>


                        <span>
                            <i class="fas fa-door-open"></i>
                            ${escapeHtml(
                                cls.room || '?'
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


        html += `
                </div>
            </div>
        `;

    }


    html += `</div>`;


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


    if (!container) return;


    const grouped = {};


    DAYS.forEach(day => {
        grouped[day] = [];
    });


    for (const cls of classes) {

        const day =
            normalizeDay(cls.day);


        if (!grouped[day]) {
            grouped[day] = [];
        }


        grouped[day].push(
            cls
        );

    }


    // Build unique time slots
    const timeSlots = [];


    for (const cls of classes) {

        const slot =
            getClassTimeSlot(cls);


        if (
            slot &&
            !timeSlots.includes(slot)
        ) {
            timeSlots.push(slot);
        }

    }


    // NEVER use .sort() alone for routine times.
    timeSlots.sort(
        (a, b) =>
            getTimeOrder(a) -
            getTimeOrder(b)
    );


    let html = `
        <div class="week-view">

            <table class="week-table">

                <thead>

                    <tr>

                        <th>Time</th>
    `;


    for (const day of DAYS) {

        html += `
            <th>
                ${day.substring(0, 3)}
            </th>
        `;

    }


    html += `
                    </tr>

                </thead>

                <tbody>
    `;


    for (const slot of timeSlots) {

        html += `
            <tr>

                <td class="time-col">
                    ${escapeHtml(slot)}
                </td>
        `;


        for (const day of DAYS) {

            const dayClasses =
                grouped[day] || [];


            const matching =
                dayClasses.filter(
                    c =>
                        getClassTimeSlot(c) ===
                        slot
                );


            if (
                matching.length > 0
            ) {

                html += `<td>`;


                const sortedMatching =
                    sortClasses(
                        matching
                    );


                for (
                    const cls
                    of sortedMatching
                ) {

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


                    html += `
                        <div
                            style="
                                margin-bottom:4px;
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
                                                font-size:0.7rem;
                                                color:var(--muted);
                                            "
                                        >
                                            ${escapeHtml(comment)}
                                        </span>
                                      `
                                    : ''
                            }


                            <span
                                class="type-tag ${typeClass}"
                                style="
                                    font-size:0.65rem;
                                "
                            >
                                ${typeLabel}
                            </span>


                            <br>


                            <span
                                style="
                                    font-size:0.8rem;
                                    color:var(--muted);
                                "
                            >
                                ${escapeHtml(
                                    cls.teacher || '?'
                                )}
                                •
                                ${escapeHtml(
                                    cls.room || '?'
                                )}
                            </span>

                        </div>
                    `;

                }


                html += `</td>`;

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


        html += `</tr>`;

    }


    html += `
                </tbody>

            </table>

        </div>
    `;


    container.innerHTML =
        html;
}


// ============================================================
// COMMENT / SUBSECTION LABEL
// ============================================================

function getDisplayComment(
    cls,
    showComment,
    mode
) {

    // Teacher / Room mode:
    // Show section.
    if (showComment) {

        const sec =
            cls._section ||
            cls.section ||
            cls.group ||
            '';


        return sec
            ? `(${sec})`
            : '';
    }


    // ========================================================
    // NEW JSON FORMAT
    // ========================================================

    let sub =
        cls.sub_section ??
        cls.subSection ??
        cls.subsection ??
        'Main';


    sub =
        String(sub).trim();


    // Main = NO "(N)"
    if (
        !sub ||
        sub.toLowerCase() === 'main'
    ) {
        return '';
    }


    let sectionLetter =
        cls.section_letter ||
        extractSectionLetter(
            cls.section
        );


    sectionLetter =
        String(
            sectionLetter || ''
        )
            .trim()
            .charAt(0)
            .toUpperCase();


    // sub_section = "1" → (N1)
    if (/^\d+$/.test(sub)) {

        return sectionLetter
            ? `(${sectionLetter}${sub})`
            : `(${sub})`;

    }


    // sub_section = "N1" → (N1)
    if (
        /^[A-Za-z]\d+$/.test(sub)
    ) {

        return `(${sub.toUpperCase()})`;

    }


    // ========================================================
    // OLD JSON FORMAT FALLBACK
    // ========================================================

    const group =
        cls.group ||
        '';


    if (group) {

        const parts =
            group.split('_');


        if (parts.length > 1) {

            const suffix =
                parts.slice(1).join('_');


            const match =
                suffix.match(
                    /^([A-Z]+)(\d+)$/i
                );


            if (match) {

                return `(${match[1].toUpperCase()}${match[2]})`;

            }


            if (
                suffix &&
                suffix.toLowerCase() !== 'main'
            ) {

                return `(${suffix})`;

            }

        }

    }


    return '';
}


// ============================================================
// NORMALIZE CLASSES
// ============================================================

function normalizeClasses(classes) {

    if (!Array.isArray(classes)) {
        return [];
    }


    return classes.map(cls => {

        const section =
            cls.section ||
            cls.section_name ||
            '';


        let subSection =
            cls.sub_section ??
            cls.subSection ??
            cls.subsection ??
            'Main';


        if (
            subSection === '' ||
            subSection === null ||
            subSection === undefined
        ) {
            subSection = 'Main';
        }


        if (
            String(subSection)
                .toLowerCase() ===
            'main'
        ) {
            subSection = 'Main';
        }


        const sectionLetter =
            cls.section_letter ||
            extractSectionLetter(
                section
            );


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

            section,

            sub_section:
                String(
                    subSection
                ).trim(),

            section_letter:
                sectionLetter,

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

    });

}


// ============================================================
// DAY NORMALIZATION
// ============================================================

function normalizeDay(day) {

    if (!day) return '';


    const value =
        String(day)
            .trim()
            .toLowerCase();


    const map = {

        saturday: 'Saturday',
        sunday: 'Sunday',
        monday: 'Monday',
        tuesday: 'Tuesday',
        wednesday: 'Wednesday',
        thursday: 'Thursday',
        friday: 'Friday'

    };


    return map[value] ||
        String(day).trim();
}


// ============================================================
// TIME NORMALIZATION
// ============================================================

function normalizeTime(time) {

    if (!time) return '';


    return String(time)
        .trim()
        .replace(/\s+/g, '')
        .replace(/[–—]/g, '-');

}


// ============================================================
// CLASS TYPE NORMALIZATION
// ============================================================

function normalizeClassType(type) {

    if (!type) return '';


    const value =
        String(type)
            .trim()
            .toLowerCase();


    if (value.includes('lab')) {
        return 'Lab';
    }


    if (value.includes('theory')) {
        return 'Theory';
    }


    return String(type).trim();
}


// ============================================================
// SORT CLASSES
// ============================================================

function sortClasses(classes) {

    return [...classes].sort(
        (a, b) => {

            const dayA =
                DAY_ORDER[
                    normalizeDay(a.day)
                ] ?? 999;


            const dayB =
                DAY_ORDER[
                    normalizeDay(b.day)
                ] ?? 999;


            if (dayA !== dayB) {
                return dayA - dayB;
            }


            const timeA =
                getTimeOrder(
                    getClassTimeSlot(a)
                );


            const timeB =
                getTimeOrder(
                    getClassTimeSlot(b)
                );


            if (timeA !== timeB) {
                return timeA - timeB;
            }


            return String(
                a.course || ''
            ).localeCompare(
                String(b.course || '')
            );

        }
    );

}


// ============================================================
// TIME ORDER
// ============================================================

function getTimeOrder(time) {

    const normalized =
        normalizeTime(time);


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
// TIME START MINUTES
// ============================================================

function getTimeStartMinutes(time) {

    if (!time) return 9999;


    const match =
        String(time).match(
            /^(\d{1,2}):(\d{2})/
        );


    if (!match) return 9999;


    let hour =
        Number(match[1]);


    const minute =
        Number(match[2]);


    // 01:00 / 02:30 / 04:00 = PM
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
// CLASS TIME SLOT
// ============================================================

function getClassTimeSlot(cls) {

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
// SECTION HELPERS
// ============================================================

function getBaseSection(section) {

    const value =
        String(
            section || ''
        )
            .trim()
            .toUpperCase();


    // 70_N1 -> 70_N
    // 70_N2 -> 70_N
    // But 70_N remains 70_N.

    return value.replace(
        /_\d+$/,
        ''
    );

}


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
// REMOVE DUPLICATES
// ============================================================

function removeDuplicateClasses(
    classes
) {

    const seen =
        new Set();


    const result = [];


    for (
        const cls of classes
    ) {

        const key = [

            cls.day || '',

            getClassTimeSlot(cls),

            cls.course || '',

            cls.teacher || '',

            cls.room || '',

            cls.sub_section ||
                cls.subSection ||
                '',

            cls.section ||
                cls._section ||
                ''

        ].join('|');


        if (seen.has(key)) {
            continue;
        }


        seen.add(key);

        result.push(cls);

    }


    return result;
}


// ============================================================
// UPDATE META
// ============================================================

function updateMeta(data) {

    if (!data) return;


    if (
        data.version &&
        versionNumber
    ) {

        versionNumber.textContent =
            String(data.version)
                .replace(/^v/i, '');

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
// HANDLERS
// ============================================================

function handleClearSection() {

    localStorage.removeItem(
        STORAGE_KEY
    );


    savedChip.style.display =
        'none';


    sectionInput.value = '';


    showMessage(
        'Saved search cleared.',
        'info'
    );


    loadRoutineData();

}


function downloadSection() {

    const label =
        currentSearchTerm ||
        'routine';


    alert(
        `Download PDF for ${label} (coming soon)`
    );

}


// ============================================================
// UI HELPERS
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


function showMessage(
    text,
    type
) {

    if (!message) return;


    message.textContent =
        text;


    message.style.display =
        'block';


    message.className =
        type;


    setTimeout(
        () => {
            message.style.display =
                'none';
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

function escapeHtml(text) {

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

        if (!document.hidden) {

            const saved =
                localStorage.getItem(
                    STORAGE_KEY
                );


            if (!saved) return;


            if (
                currentMode ===
                'section'
            ) {

                loadSection(saved);

            }

            else if (
                currentMode ===
                'teacher'
            ) {

                loadTeacher(saved);

            }

            else if (
                currentMode ===
                'room'
            ) {

                loadRoom(saved);

            }

        }

    },
    5 * 60 * 1000
);
