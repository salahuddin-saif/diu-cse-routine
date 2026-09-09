// ============================================================
// DIU CSE ROUTINE
// FULL UPDATED SCRIPT
// Section / Teacher / Room / Empty Room Modes
// ============================================================
//
// Features
// ------------------------------------------------------------
// - Section specific JSON loading
// - Combined routine.json fallback
// - Embedded subsection support
// - Teacher mode
// - Room mode
// - Empty room detection
// - Routine/source link support
// - Dynamic semester detection
// - Today green indicator
// - Correct day ordering
// - Correct time ordering
// - 6 standard time columns
// - 11:30-02:30 Lab occupies TWO standard slots
// - Lab colspan=2 in download image
// - Lab rowspan=2 in Week View
// - Main section = no subsection label
// - Lab = (N1), (N2)
// - Search
// - Day View / Week View
// - Fixed professional PNG download design
// - LocalStorage
// - Auto refresh
// - Old JSON + new JSON support
// ============================================================


// ============================================================
// STORAGE
// ============================================================

const STORAGE_KEY = 'diu_cse_section';
const MODE_KEY = 'diu_cse_mode';


// ============================================================
// DATA URLS
// ============================================================

const SECTION_BASE_URL = './data/sections/';

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
    document.querySelector('.search-input-wrap i');


// ============================================================
// NAVIGATION
// ============================================================

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

const emptyRoomBtn =
    document.querySelector(
        '.nav-item .fa-door-closed'
    )?.closest('.nav-item') ||
    document.querySelector(
        '.nav-item .fa-door-open'
    )?.closest('.nav-item[data-mode="empty-room"]') ||
    document.querySelector(
        '.nav-item[data-mode="empty-room"]'
    ) ||
    document.querySelector(
        '.nav-item[data-mode="empty"]'
    );


// ============================================================
// STATE
// ============================================================

let routineData = null;

let currentMode =
    localStorage.getItem(MODE_KEY) ||
    'section';

let currentSearchTerm = '';

let currentClasses = [];

let currentRooms = [];


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
// STANDARD TIME SLOTS
// ============================================================

const TIME_ORDER = {

    '08:30-10:00': 0,
    '10:00-11:30': 1,
    '11:30-01:00': 2,
    '01:00-02:30': 3,
    '02:30-04:00': 4,
    '04:00-05:30': 5

};


const DISPLAY_TIME_SLOTS = [

    '08:30-10:00',
    '10:00-11:30',
    '11:30-01:00',
    '01:00-02:30',
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
            localStorage.getItem(MODE_KEY) ||
            'section';

        updateModeUI();


        const saved =
            localStorage.getItem(STORAGE_KEY);


        if (saved) {

            if (sectionInput) {
                sectionInput.value = saved;
            }

            if (savedSectionSpan) {
                savedSectionSpan.textContent = saved;
            }

            if (savedChip) {
                savedChip.style.display =
                    'inline-flex';
            }

        }

        else {

            if (savedChip) {
                savedChip.style.display =
                    'none';
            }

        }


        loadRoutineData();


        // ----------------------------------------------------
        // Search icon
        // ----------------------------------------------------

        if (searchIcon) {

            searchIcon.style.cursor =
                'pointer';

            searchIcon.addEventListener(
                'click',
                handleSearch
            );

        }


        // ----------------------------------------------------
        // Search button
        // ----------------------------------------------------

        if (showRoutineBtn) {

            showRoutineBtn.addEventListener(
                'click',
                handleSearch
            );

        }


        // ----------------------------------------------------
        // Clear button
        // ----------------------------------------------------

        if (clearSectionBtn) {

            clearSectionBtn.addEventListener(
                'click',
                handleClearSection
            );

        }


        // ----------------------------------------------------
        // Enter key
        // ----------------------------------------------------

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


        // ----------------------------------------------------
        // Student
        // ----------------------------------------------------

        if (userBtn) {

            userBtn.addEventListener(
                'click',
                () =>
                    setMode('section')
            );

        }


        // ----------------------------------------------------
        // Teacher
        // ----------------------------------------------------

        if (teacherBtn) {

            teacherBtn.addEventListener(
                'click',
                () =>
                    setMode('teacher')
            );

        }


        // ----------------------------------------------------
        // Room
        // ----------------------------------------------------

        if (roomBtn) {

            roomBtn.addEventListener(
                'click',
                () =>
                    setMode('room')
            );

        }


        // ----------------------------------------------------
        // Empty Room
        // ----------------------------------------------------

        if (emptyRoomBtn) {

            emptyRoomBtn.addEventListener(
                'click',
                () =>
                    setMode('empty-room')
            );

        }

    }
);


// ============================================================
// MODE
// ============================================================

function setMode(mode) {

    if (currentMode === mode) {
        return;
    }


    currentMode = mode;


    localStorage.setItem(
        MODE_KEY,
        mode
    );


    updateModeUI();


    if (routineContainer) {
        routineContainer.innerHTML = '';
    }


    if (savedChip) {
        savedChip.style.display = 'none';
    }


    if (sectionInput) {
        sectionInput.value = '';
    }


    localStorage.removeItem(
        STORAGE_KEY
    );


    if (mode === 'section') {

        if (sectionInput) {

            sectionInput.placeholder =
                'Enter section (e.g., 70_N)';

        }


        loadRoutineData();

    }

    else if (mode === 'teacher') {

        if (sectionInput) {

            sectionInput.placeholder =
                'Enter teacher initials (e.g., NSL)';

        }


        showNoRoutine(
            'Teacher Mode',
            'Enter teacher initials to see their classes.'
        );

    }

    else if (mode === 'room') {

        if (sectionInput) {

            sectionInput.placeholder =
                'Enter room (e.g., KT-516)';

        }


        showNoRoutine(
            'Room Mode',
            'Enter room name to see its schedule.'
        );

    }

    else if (mode === 'empty-room') {

        if (sectionInput) {

            sectionInput.placeholder =
                'Enter day or room (optional)';

        }


        loadEmptyRooms();

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

        if (currentMode === 'section') {

            brand.textContent =
                'Student';

        }

        else if (currentMode === 'teacher') {

            brand.textContent =
                'Teacher';

        }

        else if (currentMode === 'room') {

            brand.textContent =
                'Room';

        }

        else {

            brand.textContent =
                'Empty Room';

        }

    }


    document
        .querySelectorAll('.nav-item')
        .forEach(
            el =>
                el.classList.remove('active')
        );


    if (
        currentMode === 'section' &&
        userBtn
    ) {

        userBtn.classList.add('active');

    }


    if (
        currentMode === 'teacher' &&
        teacherBtn
    ) {

        teacherBtn.classList.add('active');

    }


    if (
        currentMode === 'room' &&
        roomBtn
    ) {

        roomBtn.classList.add('active');

    }


    if (
        currentMode === 'empty-room' &&
        emptyRoomBtn
    ) {

        emptyRoomBtn.classList.add('active');

    }

}


// ============================================================
// SEARCH
// ============================================================

function handleSearch() {

    const raw =
        sectionInput?.value.trim() || '';


    if (
        currentMode !== 'empty-room' &&
        !raw
    ) {

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

    else {

        loadEmptyRooms(raw);

    }

}


// ============================================================
// FETCH JSON
// ============================================================

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
            `HTTP ${response.status}`
        );

    }


    return response.json();

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


        routineData =
            await fetchJson(
                COMBINED_URL
            );


        updateMeta(
            routineData
        );


        if (
            currentMode === 'teacher'
        ) {

            showNoRoutine(
                'Teacher Mode',
                'Enter teacher initials to see their classes.'
            );

        }

        else if (
            currentMode === 'room'
        ) {

            showNoRoutine(
                'Room Mode',
                'Enter room name to see its schedule.'
            );

        }

        else if (
            currentMode === 'empty-room'
        ) {

            await loadEmptyRooms();

        }

        else {

            const sections =
                routineData.sections || {};


            const keys =
                Object.keys(sections);


            if (!keys.length) {

                throw new Error(
                    'No routine sections found.'
                );

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

                if (sectionInput) {

                    sectionInput.value =
                        firstBase;

                }


                if (savedSectionSpan) {

                    savedSectionSpan.textContent =
                        firstBase;

                }


                if (savedChip) {

                    savedChip.style.display =
                        'inline-flex';

                }


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

        }


        setStatus(
            'ready',
            'Ready'
        );

    }

    catch (error) {

        console.error(
            'Routine load error:',
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


        const baseSection =
            getBaseSection(
                normalized
            );


        let sectionData =
            null;


        // ----------------------------------------------------
        // SECTION-SPECIFIC JSON
        // ----------------------------------------------------

        const sectionUrls = [

            `${SECTION_BASE_URL}${normalized}.json?t=${Date.now()}`,

            `${SECTION_BASE_URL}${baseSection}.json?t=${Date.now()}`

        ];


        for (
            const url of sectionUrls
        ) {

            try {

                sectionData =
                    await fetchJson(
                        url
                    );

                break;

            }

            catch (sectionError) {

                console.warn(
                    'Section JSON not found:',
                    url
                );

            }

        }


        // ----------------------------------------------------
        // COMBINED FALLBACK
        // ----------------------------------------------------

        if (!sectionData) {

            if (!routineData) {

                routineData =
                    await fetchJson(
                        COMBINED_URL
                    );

                updateMeta(
                    routineData
                );

            }


            const sections =
                routineData.sections || {};


            const matchingKeys =
                Object.keys(sections)
                    .filter(
                        key =>
                            key === normalized ||
                            key === baseSection ||
                            getBaseSection(key) ===
                                baseSection
                    );


            if (!matchingKeys.length) {

                throw new Error(
                    `Section "${normalized}" not found.`
                );

            }


            const all = [];


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


            sectionData = {

                section:
                    baseSection,

                classes:
                    all

            };

        }


        // ----------------------------------------------------
        // EXTRACT
        // ----------------------------------------------------

        const allClasses =
            extractClassesFromData(
                sectionData
            );


        const classes =
            removeDuplicateClasses(
                normalizeClasses(
                    allClasses
                )
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


        if (savedSectionSpan) {

            savedSectionSpan.textContent =
                normalized;

        }


        if (savedChip) {

            savedChip.style.display =
                'inline-flex';

        }


        hideMessage();


        setStatus(
            'ready',
            'Ready'
        );

    }

    catch (error) {

        console.error(
            'Section error:',
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
// EXTRACT CLASSES
// ============================================================

function extractClassesFromData(
    data
) {

    if (!data) {
        return [];
    }


    if (Array.isArray(data)) {
        return data;
    }


    if (Array.isArray(data.classes)) {
        return data.classes;
    }


    if (Array.isArray(data.routine)) {
        return data.routine;
    }


    if (Array.isArray(data.schedule)) {
        return data.schedule;
    }


    if (
        data.sections &&
        typeof data.sections === 'object'
    ) {

        const result = [];


        Object.values(
            data.sections
        )
            .forEach(
                value => {

                    const classes =
                        extractClassesFromData(
                            value
                        );


                    result.push(
                        ...classes
                    );

                }
            );


        return result;

    }


    return [];

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
        routineData.sections || {};


    const all = [];


    Object.entries(
        sections
    )
        .forEach(
            ([key, data]) => {

                if (
                    key === baseSection ||
                    getBaseSection(key) ===
                        baseSection
                ) {

                    all.push(
                        ...extractClassesFromData(
                            data
                        )
                    );

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

            routineData =
                await fetchJson(
                    COMBINED_URL
                );

            updateMeta(
                routineData
            );

        }


        const clean =
            String(initials)
                .toUpperCase()
                .replace(/\s+/g, '');


        const sections =
            routineData.sections || {};


        const results = [];


        Object.entries(
            sections
        )
            .forEach(
                ([section, data]) => {

                    const classes =
                        extractClassesFromData(
                            data
                        );


                    classes.forEach(
                        cls => {

                            const teacher =
                                String(
                                    cls.teacher ||
                                    cls.faculty ||
                                    cls.teacher_initials ||
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
                                        cls._section ||
                                        cls.section ||
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


        if (savedSectionSpan) {

            savedSectionSpan.textContent =
                initials;

        }


        if (savedChip) {

            savedChip.style.display =
                'inline-flex';

        }


        hideMessage();


        setStatus(
            'ready',
            'Ready'
        );

    }

    catch (error) {

        console.error(
            'Teacher error:',
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

            routineData =
                await fetchJson(
                    COMBINED_URL
                );

            updateMeta(
                routineData
            );

        }


        const clean =
            String(roomName)
                .toUpperCase()
                .replace(/\s+/g, '');


        const sections =
            routineData.sections || {};


        const results = [];


        Object.entries(
            sections
        )
            .forEach(
                ([section, data]) => {

                    const classes =
                        extractClassesFromData(
                            data
                        );


                    classes.forEach(
                        cls => {

                            const room =
                                String(
                                    cls.room ||
                                    cls.room_no ||
                                    cls.roomNumber ||
                                    ''
                                )
                                    .toUpperCase()
                                    .replace(
                                        /\s+/g,
                                        ''
                                    );


                            if (
                                room.includes(
                                    clean
                                )
                            ) {

                                results.push({

                                    ...cls,

                                    _section:
                                        cls._section ||
                                        cls.section ||
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


        if (savedSectionSpan) {

            savedSectionSpan.textContent =
                roomName;

        }


        if (savedChip) {

            savedChip.style.display =
                'inline-flex';

        }


        hideMessage();


        setStatus(
            'ready',
            'Ready'
        );

    }

    catch (error) {

        console.error(
            'Room error:',
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
// EMPTY ROOM
// ============================================================

async function loadEmptyRooms(
    filter = ''
) {

    try {

        setStatus(
            'loading',
            'Loading...'
        );


        if (!routineData) {

            routineData =
                await fetchJson(
                    COMBINED_URL
                );

            updateMeta(
                routineData
            );

        }


        const allClasses =
            getAllRoutineClasses();


        const rooms =
            getAllRooms(
                allClasses
            );


        currentRooms =
            rooms;


        if (!rooms.length) {

            throw new Error(
                'No room information found in routine data.'
            );

        }


        const cleanFilter =
            String(filter)
                .trim()
                .toLowerCase();


        const selectedDay =
            getDayFromInput(
                filter
            );


        const emptyByDay = {};


        DAYS.forEach(
            day => {

                const occupied =
                    new Set();


                allClasses.forEach(
                    cls => {

                        const dayName =
                            normalizeDay(
                                cls.day
                            );


                        if (
                            dayName !== day
                        ) {

                            return;

                        }


                        const room =
                            normalizeRoom(
                                cls.room
                            );


                        if (room) {

                            occupied.add(
                                room
                            );

                        }

                    }
                );


                emptyByDay[day] =
                    rooms.filter(
                        room =>
                            !occupied.has(
                                normalizeRoom(
                                    room
                                )
                            )
                    );

            }
        );


        displayEmptyRooms(
            rooms,
            emptyByDay,
            cleanFilter,
            selectedDay
        );


        setStatus(
            'ready',
            'Ready'
        );

    }

    catch (error) {

        console.error(
            'Empty room error:',
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
            'Empty Room',
            'Could not calculate empty rooms.'
        );

    }

}


// ============================================================
// GET ALL ROUTINE CLASSES
// ============================================================

function getAllRoutineClasses() {

    if (!routineData) {
        return [];
    }


    const sections =
        routineData.sections || {};


    const all = [];


    Object.entries(
        sections
    )
        .forEach(
            ([section, data]) => {

                extractClassesFromData(
                    data
                )
                    .forEach(
                        cls => {

                            all.push({

                                ...cls,

                                _section:
                                    cls._section ||
                                    cls.section ||
                                    section

                            });

                        }
                    );

            }
        );


    return removeDuplicateClasses(
        normalizeClasses(all)
    );

}


// ============================================================
// GET ROOMS
// ============================================================

function getAllRooms(
    classes
) {

    const rooms =
        new Set();


    classes.forEach(
        cls => {

            const room =
                String(
                    cls.room || ''
                ).trim();


            if (!room) {
                return;
            }


            room
                .split(
                    /\s*[,/]\s*/
                )
                .forEach(
                    value => {

                        const clean =
                            value.trim();


                        if (clean) {

                            rooms.add(
                                clean
                            );

                        }

                    }
                );

        }
    );


    return [
        ...rooms
    ].sort(
        naturalSort
    );

}


// ============================================================
// EMPTY ROOM DISPLAY
// ============================================================

function displayEmptyRooms(
    rooms,
    emptyByDay,
    filter,
    selectedDay
) {

    let daysToShow =
        DAYS.filter(
            day =>
                emptyByDay[day]
        );


    if (selectedDay) {

        daysToShow =
            [selectedDay];

    }


    if (
        filter &&
        !selectedDay
    ) {

        daysToShow =
            daysToShow.filter(
                day =>
                    emptyByDay[day].some(
                        room =>
                            room
                                .toLowerCase()
                                .includes(
                                    filter
                                )
                    )
            );

    }


    let html = `

        <div class="enrolled-card">

            <div class="card-title">

                <h3>
                    <i class="fas fa-door-open"></i>
                    Empty Rooms
                </h3>

            </div>

            <div class="course-meta">

                <div class="meta-row">

                    <span>Total Rooms</span>

                    <strong>
                        ${rooms.length}
                    </strong>

                </div>

                <div class="meta-row">

                    <span>Today</span>

                    <strong>
                        ${getTodayName()}
                    </strong>

                </div>

            </div>

        </div>

        <div class="day-grid">

    `;


    daysToShow.forEach(
        day => {

            let emptyRooms =
                emptyByDay[day] || [];


            if (
                filter &&
                !selectedDay
            ) {

                emptyRooms =
                    emptyRooms.filter(
                        room =>
                            room
                                .toLowerCase()
                                .includes(
                                    filter
                                )
                    );

            }


            const isToday =
                isTodayDay(day);


            html += `

                <div
                    class="
                        day-card
                        day-section
                        ${isToday ? 'today' : ''}
                    "
                >

                    <div class="day-card-header">

                        <span>

                            <i class="fas fa-calendar-alt"></i>

                            ${escapeHtml(day)}

                            ${
                                isToday
                                    ? `
                                        <span
                                            class="today-dot"
                                            title="Today"
                                        ></span>
                                      `
                                    : ''
                            }

                        </span>

                        <span>
                            ${emptyRooms.length}
                            empty
                        </span>

                    </div>

                    <div class="day-card-body">

                        ${
                            emptyRooms.length

                                ? emptyRooms
                                    .map(
                                        room =>
                                            `

                                                <div
                                                    class="class-item"
                                                >

                                                    <div class="time">

                                                        <i
                                                            class="fas fa-door-open"
                                                        ></i>

                                                        Empty

                                                    </div>

                                                    <div class="course">

                                                        ${escapeHtml(room)}

                                                    </div>

                                                    <div class="details">

                                                        <span>

                                                            <i
                                                                class="fas fa-check-circle"
                                                            ></i>

                                                            Available

                                                        </span>

                                                    </div>

                                                </div>

                                            `
                                    )
                                    .join('')

                                : `

                                    <div
                                        style="
                                            padding:20px;
                                            text-align:center;
                                            color:var(--muted);
                                        "
                                    >
                                        No empty rooms
                                    </div>

                                  `
                        }

                    </div>

                </div>

            `;

        }
    );


    html += `
        </div>
    `;


    routineContainer.innerHTML =
        html;

}


// ============================================================
// DAY FROM INPUT
// ============================================================

function getDayFromInput(
    value
) {

    const clean =
        String(value || '')
            .trim()
            .toLowerCase();


    if (!clean) {
        return '';
    }


    return DAYS.find(
        day =>
            day.toLowerCase() === clean ||
            day
                .substring(0, 3)
                .toLowerCase() === clean
    ) || '';

}


// ============================================================
// DISPLAY SECTION
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


// ============================================================
// DISPLAY TEACHER
// ============================================================

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


// ============================================================
// DISPLAY ROOM
// ============================================================

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


    const teachers = [
        ...new Set(
            classes
                .map(
                    c =>
                        c.teacher
                )
                .filter(Boolean)
        )
    ];


    const days = [
        ...new Set(
            classes
                .map(
                    c =>
                        normalizeDay(
                            c.day
                        )
                )
        )
    ];


    const batch = [
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
            routineData?.version ||
            '5.0'
        )
            .replace(
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


    // --------------------------------------------------------
    // CARD
    // --------------------------------------------------------

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

                    <span>Total Classes</span>

                    <strong>
                        ${classes.length}
                    </strong>

                </div>


                <div class="meta-row">

                    <span>Active Days</span>

                    <strong>
                        ${days.length}
                    </strong>

                </div>


                <div class="meta-row">

                    <span>Routine Version</span>

                    <strong>
                        v${escapeHtml(cleanVersion)}
                    </strong>

                </div>


                <div class="meta-row">

                    <span>Semester</span>

                    <strong>
                        ${escapeHtml(
                            getSemester()
                        )}
                    </strong>

                </div>


                ${
                    batch.length
                        ? `

                            <div class="meta-row">

                                <span>Batch</span>

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

                                <span>Sections</span>

                                <strong>

                                    ${escapeHtml(
                                        [
                                            ...new Set(
                                                classes
                                                    .map(
                                                        c =>
                                                            c._section ||
                                                            c.section ||
                                                            ''
                                                    )
                                            )
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


            ${createRoutineLinkHtml()}

        </div>

    `;


    // --------------------------------------------------------
    // TEACHERS
    // --------------------------------------------------------

    html += `
        <div class="teacher-row">
    `;


    if (teachers.length) {

        teachers.forEach(
            teacher => {

                const initial =
                    String(teacher)
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
                            ${escapeHtml(teacher)}
                        </span>

                    </div>

                `;

            }
        );

    }


    html += `
        </div>
    `;


    // --------------------------------------------------------
    // TABS
    // --------------------------------------------------------

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


            if (grouped[day]) {

                grouped[day].push(
                    cls
                );

            }

        }
    );


    let html =
        `<div class="day-grid">`;


    DAYS.forEach(
        day => {

            const dayClasses =
                sortClasses(
                    grouped[day]
                );


            if (!dayClasses.length) {
                return;
            }


            const today =
                isTodayDay(day);


            html += `

                <div
                    class="
                        day-card
                        day-section
                        ${today ? 'today' : ''}
                    "
                >

                    <div class="day-card-header">

                        <span>

                            <i class="fas fa-calendar-alt"></i>

                            ${escapeHtml(day)}

                            ${
                                today
                                    ? `
                                        <span
                                            class="today-dot"
                                            title="Today"
                                        ></span>
                                      `
                                    : ''
                            }

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
                                                ${escapeHtml(comment)}
                                            </span>

                                          `
                                        : ''
                                }

                            </div>


                            <div class="details">

                                <span>

                                    <i
                                        class="fas fa-chalkboard-teacher"
                                    ></i>

                                    ${escapeHtml(
                                        cls.teacher ||
                                        '?'
                                    )}

                                </span>


                                <span>

                                    <i
                                        class="fas fa-door-open"
                                    ></i>

                                    ${escapeHtml(
                                        cls.room ||
                                        '?'
                                    )}

                                </span>


                                <span>

                                    <span
                                        class="
                                            type-tag
                                            ${typeClass}
                                        "
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


    html += `
        </div>
    `;


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


            if (grouped[day]) {

                grouped[day].push(
                    cls
                );

            }

        }
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

            const today =
                isTodayDay(day);


            html += `

                <th
                    class="
                        ${today ? 'today-column' : ''}
                    "
                >

                    <div class="week-day-header">

                        <span>
                            ${day.substring(0, 3)}
                        </span>

                        ${
                            today
                                ? `
                                    <span
                                        class="today-dot"
                                        title="Today"
                                    ></span>
                                  `
                                : ''
                        }

                    </div>

                </th>

            `;

        }
    );


    html += `

                    </tr>

                </thead>

                <tbody>

    `;


    // --------------------------------------------------------
    // SIX STANDARD SLOTS
    // --------------------------------------------------------

    DISPLAY_TIME_SLOTS.forEach(
        slot => {

            const slotIndex =
                DISPLAY_TIME_SLOTS.indexOf(
                    slot
                );


            html += `

                <tr>

                    <td class="time-col">
                        ${escapeHtml(slot)}
                    </td>

            `;


            DAYS.forEach(
                day => {

                    const isToday =
                        isTodayDay(day);


                    // ------------------------------------------------
                    // Second half of two-slot lab
                    // ------------------------------------------------

                    if (
                        slotIndex === 3 &&
                        hasTwoSlotLab(
                            grouped[day]
                        )
                    ) {

                        return;

                    }


                    const matching =
                        sortClasses(
                            grouped[day].filter(
                                cls =>
                                    getClassTimeSlot(
                                        cls
                                    ) === slot ||
                                    (
                                        slot ===
                                            '11:30-01:00' &&
                                        isTwoSlotLab(
                                            cls
                                        )
                                    )
                            )
                        );


                    const lab =
                        matching.find(
                            cls =>
                                isTwoSlotLab(
                                    cls
                                )
                        );


                    // ------------------------------------------------
                    // TWO SLOT LAB
                    // ------------------------------------------------

                    if (
                        lab &&
                        slot ===
                            '11:30-01:00'
                    ) {

                        const comment =
                            getDisplayComment(
                                lab,
                                showComment,
                                mode
                            );


                        html += `

                            <td
                                rowspan="2"
                                class="
                                    routine-cell
                                    lab-cell
                                    ${
                                        isToday
                                            ? 'today-column'
                                            : ''
                                    }
                                "
                            >

                                <strong>
                                    ${escapeHtml(
                                        lab.course
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
                                                ${escapeHtml(comment)}
                                            </span>

                                          `
                                        : ''
                                }


                                <span
                                    class="
                                        type-tag
                                        type-lab
                                    "
                                    style="
                                        font-size:.65rem;
                                    "
                                >
                                    Lab
                                </span>


                                <br>


                                <span
                                    style="
                                        font-size:.8rem;
                                        color:var(--muted);
                                    "
                                >

                                    ${escapeHtml(
                                        lab.teacher ||
                                        '?'
                                    )}

                                    •

                                    ${escapeHtml(
                                        lab.room ||
                                        '?'
                                    )}

                                </span>

                            </td>

                        `;


                        return;

                    }


                    // ------------------------------------------------
                    // NORMAL CLASSES
                    // ------------------------------------------------

                    if (matching.length) {

                        html += `

                            <td
                                class="
                                    ${
                                        isToday
                                            ? 'today-column'
                                            : ''
                                    }
                                "
                            >

                        `;


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
                                                        ${escapeHtml(comment)}
                                                    </span>

                                                  `
                                                : ''
                                        }


                                        <span
                                            class="
                                                type-tag
                                                ${
                                                    isLab
                                                        ? 'type-lab'
                                                        : 'type-theory'
                                                }
                                            "
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


                        html += `
                            </td>
                        `;

                    }

                    else {

                        html += `

                            <td
                                class="
                                    ${
                                        isToday
                                            ? 'today-column'
                                            : ''
                                    }
                                "
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


            html += `
                </tr>
            `;

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
// TWO SLOT LAB
// ============================================================

function isTwoSlotLab(
    cls
) {

    if (!cls) {
        return false;
    }


    const type =
        normalizeClassType(
            cls.type
        );


    const time =
        getClassTimeSlot(
            cls
        );


    return (
        type === 'Lab' &&
        normalizeTime(time) ===
            '11:30-02:30'
    );

}


function hasTwoSlotLab(
    classes
) {

    return (
        Array.isArray(classes) &&
        classes.some(
            cls =>
                isTwoSlotLab(cls)
        )
    );

}


// ============================================================
// SUBSECTION LABEL
// ============================================================

function getDisplayComment(
    cls,
    showComment,
    mode
) {

    // --------------------------------------------------------
    // Teacher / Room mode
    // --------------------------------------------------------

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


    let sub =
        cls.sub_section ??
        cls.subSection ??
        cls.subsection ??
        'Main';


    sub =
        String(sub).trim();


    // --------------------------------------------------------
    // Main = nothing
    // --------------------------------------------------------

    if (
        !sub ||
        sub.toLowerCase() === 'main'
    ) {

        return '';

    }


    let letter =
        cls.section_letter ||
        extractSectionLetter(
            cls.section
        );


    letter =
        String(letter || '')
            .trim()
            .charAt(0)
            .toUpperCase();


    // --------------------------------------------------------
    // 1 => N1
    // --------------------------------------------------------

    if (/^\d+$/.test(sub)) {

        return letter
            ? `(${letter}${sub})`
            : `(${sub})`;

    }


    // --------------------------------------------------------
    // N1 => N1
    // --------------------------------------------------------

    if (
        /^[A-Za-z]\d+$/.test(sub)
    ) {

        return `(${sub.toUpperCase()})`;

    }


    return '';

}


// ============================================================
// NORMALIZE CLASSES
// ============================================================

function normalizeClasses(
    classes
) {

    if (!Array.isArray(classes)) {
        return [];
    }


    return classes.map(
        cls => {

            const section =
                cls.section ||
                cls.section_name ||
                cls.sectionName ||
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
                String(sub).toLowerCase() ===
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
                        cls.courseCode ||
                        ''
                    ).trim(),

                teacher:
                    String(
                        cls.teacher ||
                        cls.faculty ||
                        cls.teacher_initials ||
                        ''
                    ).trim(),

                room:
                    String(
                        cls.room ||
                        cls.room_no ||
                        cls.roomNumber ||
                        ''
                    ).trim(),

                section:
                    section,

                sub_section:
                    String(sub).trim(),

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
                        cls.classType ||
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


    return String(type).trim();

}


// ============================================================
// SORT
// ============================================================

function sortClasses(
    classes
) {

    return [
        ...classes
    ].sort(
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
            )
                .localeCompare(
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
        normalized ===
        '11:30-02:30'
    ) {

        return TIME_ORDER[
            '11:30-01:00'
        ];

    }


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
        Number(match[1]);


    const minute =
        Number(match[2]);


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
        )
            .match(
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


    const result = [];


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

                cls.sub_section || '',

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
// ROOM NORMALIZE
// ============================================================

function normalizeRoom(
    room
) {

    return String(
        room || ''
    )
        .trim()
        .toUpperCase()
        .replace(
            /\s+/g,
            ''
        );

}


// ============================================================
// NATURAL SORT
// ============================================================

function naturalSort(
    a,
    b
) {

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


// ============================================================
// TODAY
// ============================================================

function getTodayName() {

    const today =
        new Date();


    return [

        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday'

    ][
        today.getDay()
    ];

}


function isTodayDay(
    day
) {

    return (
        normalizeDay(day) ===
        getTodayName()
    );

}


// ============================================================
// DYNAMIC SEMESTER
// ============================================================

function getSemester() {

    const candidates = [

        routineData?.semester,

        routineData?.meta?.semester,

        routineData?.metadata?.semester,

        routineData?.academic?.semester

    ];


    for (
        const value of candidates
    ) {

        if (
            value !== null &&
            value !== undefined &&
            String(value).trim()
        ) {

            return normalizeSemesterName(
                String(value).trim()
            );

        }

    }


    const updated =
        routineData?.updated_at ||
        routineData?.updatedAt ||
        routineData?.last_updated;


    if (updated) {

        const date =
            new Date(updated);


        if (
            !Number.isNaN(
                date.getTime()
            )
        ) {

            return detectSemesterFromDate(
                date
            );

        }

    }


    return detectSemesterFromDate(
        new Date()
    );

}


// ============================================================
// SEMESTER DETECTOR
// ============================================================

function detectSemesterFromDate(
    date
) {

    const month =
        date.getMonth() + 1;


    const year =
        date.getFullYear();


    let semester;


    if (
        month >= 1 &&
        month <= 4
    ) {

        semester = 'Spring';

    }

    else if (
        month >= 5 &&
        month <= 8
    ) {

        semester = 'Summer';

    }

    else {

        semester = 'Fall';

    }


    return `${semester} ${year}`;

}


// ============================================================
// SEMESTER NORMALIZER
// ============================================================

function normalizeSemesterName(
    value
) {

    const text =
        String(value).trim();


    const lower =
        text.toLowerCase();


    let semester;


    if (
        lower.includes('fall') ||
        lower.includes('autumn')
    ) {

        semester = 'Fall';

    }

    else if (
        lower.includes('summer')
    ) {

        semester = 'Summer';

    }

    else if (
        lower.includes('spring') ||
        lower.includes('winter')
    ) {

        semester = 'Spring';

    }


    const yearMatch =
        text.match(
            /\b(20\d{2})\b/
        );


    const year =
        yearMatch
            ? yearMatch[1]
            : new Date()
                .getFullYear();


    return semester
        ? `${semester} ${year}`
        : text;

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
            String(data.version)
                .replace(
                    /^v/i,
                    ''
                );

    }


    const updated =
        data.updated_at ||
        data.updatedAt ||
        data.last_updated;


    if (
        updated &&
        lastUpdated
    ) {

        const date =
            new Date(updated);


        if (
            !Number.isNaN(
                date.getTime()
            )
        ) {

            lastUpdated.textContent =
                'Updated: ' +
                date.toLocaleString();

        }

        else {

            lastUpdated.textContent =
                'Updated: ' +
                String(updated);

        }

    }

}


// ============================================================
// ROUTINE / SOURCE LINK
// ============================================================

function getRoutineLink() {

    if (!routineData) {
        return '';
    }


    const candidates = [

        routineData.routine_url,

        routineData.routineUrl,

        routineData.source_url,

        routineData.sourceUrl,

        routineData.notice_url,

        routineData.noticeUrl,

        routineData.pdf_url,

        routineData.pdfUrl,

        routineData.url,

        routineData.link,

        routineData.source,

        routineData.meta?.routine_url,

        routineData.meta?.source_url,

        routineData.meta?.notice_url,

        routineData.meta?.url,

        routineData.metadata?.routine_url,

        routineData.metadata?.source_url,

        routineData.metadata?.url

    ];


    return candidates.find(
        value =>
            typeof value === 'string' &&
            /^https?:\/\//i.test(
                value.trim()
            )
    ) || '';

}


// ============================================================
// ROUTINE LINK HTML
// ============================================================

function createRoutineLinkHtml() {

    const url =
        getRoutineLink();


    if (!url) {
        return '';
    }


    return `

        <div
            style="
                margin-top:12px;
            "
        >

            <a
                href="${escapeAttribute(url)}"
                target="_blank"
                rel="noopener noreferrer"
                class="routine-link"
            >

                <i
                    class="fas fa-external-link-alt"
                ></i>

                View Official Routine Source

            </a>

        </div>

    `;

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


    let imageElement =
        null;


    try {

        showMessage(
            'Preparing routine image...',
            'info'
        );


        await loadHtml2Canvas();


        imageElement =
            createRoutineDownloadCard();


        document.body.appendChild(
            imageElement
        );


        // ----------------------------------------------------
        // Allow browser to render everything
        // ----------------------------------------------------

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
                imageElement,
                {

                    scale: 2.5,

                    backgroundColor:
                        '#f5f7fb',

                    useCORS:
                        true,

                    allowTaint:
                        false,

                    logging:
                        false,

                    imageTimeout:
                        15000,

                    width:
                        imageElement.offsetWidth,

                    height:
                        imageElement.offsetHeight,

                    scrollX:
                        0,

                    scrollY:
                        0,

                    windowWidth:
                        imageElement.offsetWidth,

                    windowHeight:
                        imageElement.offsetHeight

                }
            );


        if (imageElement) {

            imageElement.remove();

            imageElement =
                null;

        }


        const link =
            document.createElement(
                'a'
            );


        let fileName =
            currentMode === 'section'
                ? currentSearchTerm
                : (
                    currentClasses[0]?.section ||
                    currentSearchTerm ||
                    'routine'
                );


        fileName =
            String(fileName)
                .replace(
                    /[^a-zA-Z0-9_-]/g,
                    '_'
                );


        link.download =
            `DIU-CSE-Routine-${fileName}.png`;


        link.href =
            canvas.toDataURL(
                'image/png',
                1.0
            );


        document.body.appendChild(
            link
        );


        link.click();


        link.remove();


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


        if (imageElement) {

            imageElement.remove();

        }


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
                    () => resolve(),
                    {
                        once: true
                    }
                );


                existing.addEventListener(
                    'error',
                    () =>
                        reject(
                            new Error(
                                'html2canvas failed to load.'
                            )
                        ),
                    {
                        once: true
                    }
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
                () =>
                    resolve();


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
// CREATE DOWNLOAD CARD
// ============================================================
//
// IMPORTANT
// ------------------------------------------------------------
// PNG TABLE:
//
//              TIME
//       ┌──────┬──────┬──────┬──────┬──────┬──────┐
// DAY   │ 08:30│10:00 │11:30 │01:00 │02:30 │04:00 │
//       ├──────┼──────┼──────┼──────┼──────┼──────┤
// SAT   │      │      │      │      │      │      │
// SUN   │      │      │      │      │      │      │
//       └──────┴──────┴──────┴──────┴──────┴──────┘
//
// 11:30-02:30 LAB:
//
//        ┌───────────────┐
//        │      LAB      │
//        │    colspan=2  │
//        └───────────────┘
//
// This design is completely independent from website CSS.
// ============================================================

function createRoutineDownloadCard() {

    const wrapper =
        document.createElement(
            'div'
        );


    // --------------------------------------------------------
    // OUTER FIXED CANVAS
    // --------------------------------------------------------

    wrapper.style.position =
        'fixed';

    wrapper.style.left =
        '-100000px';

    wrapper.style.top =
        '0';

    wrapper.style.width =
        '1600px';

    wrapper.style.minWidth =
        '1600px';

    wrapper.style.boxSizing =
        'border-box';

    wrapper.style.padding =
        '42px';

    wrapper.style.background =
        '#f5f7fb';

    wrapper.style.fontFamily =
        'Arial, Helvetica, sans-serif';

    wrapper.style.color =
        '#172033';

    wrapper.style.lineHeight =
        '1.4';


    // --------------------------------------------------------
    // BASIC DATA
    // --------------------------------------------------------

    const section =
        currentMode === 'section'
            ? currentSearchTerm
            : (
                currentClasses[0]?.section ||
                currentSearchTerm ||
                'Routine'
            );


    const semester =
        getSemester();


    const version =
        String(
            routineData?.version ||
            versionNumber?.textContent ||
            '5.0'
        )
            .replace(
                /^v/i,
                ''
            );


    const sorted =
        sortClasses(
            normalizeClasses(
                currentClasses
            )
        );


    const teachers = [
        ...new Set(
            sorted
                .map(
                    cls =>
                        String(
                            cls.teacher || ''
                        ).trim()
                )
                .filter(Boolean)
        )
    ];


    const activeDays = [
        ...new Set(
            sorted
                .map(
                    cls =>
                        normalizeDay(
                            cls.day
                        )
                )
                .filter(Boolean)
        )
    ];


    // --------------------------------------------------------
    // CELL MAP
    // --------------------------------------------------------

    const cellMap = {};


    DAYS.forEach(
        day => {

            cellMap[day] = {};


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


            const time =
                getClassTimeSlot(
                    cls
                );


            if (
                !cellMap[day]
            ) {

                return;

            }


            // ------------------------------------------------
            // Two-slot lab
            // ------------------------------------------------

            if (
                isTwoSlotLab(
                    cls
                )
            ) {

                cellMap[day][
                    '11:30-01:00'
                ]
                    .push(
                        cls
                    );

                return;

            }


            if (
                cellMap[day][time]
            ) {

                cellMap[day][time]
                    .push(
                        cls
                    );

            }

        }
    );


    // --------------------------------------------------------
    // FIXED COLOR SYSTEM
    // --------------------------------------------------------

    const COLORS = {

        page:
            '#f5f7fb',

        white:
            '#ffffff',

        navy:
            '#172033',

        navy2:
            '#24314a',

        header:
            '#202b42',

        text:
            '#172033',

        muted:
            '#667085',

        border:
            '#d9dee8',

        borderDark:
            '#c7ceda',

        time:
            '#eef2f7',

        today:
            '#f0fdf4',

        todayBorder:
            '#22c55e',

        theoryBg:
            '#eef5ff',

        theoryText:
            '#2456a6',

        labBg:
            '#fff7df',

        labText:
            '#9a6700',

        empty:
            '#f8fafc',

        emptyText:
            '#a0a8b5'

    };


    // --------------------------------------------------------
    // CELL CONTENT HELPER
    // --------------------------------------------------------

    function cellContent(
        items
    ) {

        if (!items.length) {

            return `

                <div
                    style="
                        min-height:62px;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        color:${COLORS.emptyText};
                        font-size:20px;
                        font-weight:500;
                    "
                >
                    —
                </div>

            `;

        }


        return items
            .map(
                cls => {

                    const isLab =
                        normalizeClassType(
                            cls.type
                        ) === 'Lab';


                    const comment =
                        getDisplayComment(
                            cls,
                            currentMode !==
                                'section',
                            currentMode
                        );


                    const bg =
                        isLab
                            ? COLORS.labBg
                            : COLORS.theoryBg;


                    const tagBg =
                        isLab
                            ? '#f9e8ad'
                            : '#dceaff';


                    const tagColor =
                        isLab
                            ? COLORS.labText
                            : COLORS.theoryText;


                    return `

                        <div
                            style="
                                background:${bg};
                                border:1px solid ${COLORS.border};
                                border-radius:10px;
                                padding:10px 11px;
                                margin-bottom:7px;
                                box-sizing:border-box;
                            "
                        >

                            <div
                                style="
                                    font-size:15px;
                                    font-weight:800;
                                    color:${COLORS.text};
                                    line-height:1.25;
                                    margin-bottom:6px;
                                    word-break:break-word;
                                "
                            >

                                ${escapeHtml(
                                    cls.course ||
                                    'N/A'
                                )}

                                ${
                                    comment
                                        ? `

                                            <span
                                                style="
                                                    font-size:11px;
                                                    font-weight:700;
                                                    color:${COLORS.muted};
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


                            <span
                                style="
                                    display:inline-block;
                                    background:${tagBg};
                                    color:${tagColor};
                                    border-radius:20px;
                                    padding:3px 7px;
                                    font-size:9px;
                                    font-weight:800;
                                    letter-spacing:.5px;
                                    margin-bottom:6px;
                                "
                            >
                                ${
                                    isLab
                                        ? 'LAB'
                                        : 'THEORY'
                                }
                            </span>


                            <div
                                style="
                                    color:${COLORS.muted};
                                    font-size:11px;
                                    line-height:1.5;
                                    word-break:break-word;
                                "
                            >

                                <div>
                                    <b>
                                        ${escapeHtml(
                                            cls.teacher ||
                                            'TBA'
                                        )}
                                    </b>
                                </div>

                                <div>
                                    ${escapeHtml(
                                        cls.room ||
                                        'TBA'
                                    )}
                                </div>

                            </div>

                        </div>

                    `;

                }
            )
            .join('');

    }


    // --------------------------------------------------------
    // BUILD HTML
    // --------------------------------------------------------

    let html = `

        <div
            style="
                width:100%;
                box-sizing:border-box;
                background:${COLORS.white};
                border:1px solid ${COLORS.border};
                border-radius:20px;
                overflow:hidden;
            "
        >

            <!-- =================================================
                 HEADER
                 ================================================= -->

            <div
                style="
                    background:${COLORS.navy};
                    color:#ffffff;
                    padding:32px 36px 28px;
                    box-sizing:border-box;
                "
            >

                <div
                    style="
                        font-size:13px;
                        font-weight:800;
                        letter-spacing:1.8px;
                        color:#cbd5e1;
                        margin-bottom:8px;
                    "
                >
                    DAFFODIL INTERNATIONAL UNIVERSITY
                </div>


                <div
                    style="
                        font-size:27px;
                        font-weight:800;
                        line-height:1.2;
                        margin-bottom:6px;
                    "
                >
                    Department of Computer Science & Engineering
                </div>


                <div
                    style="
                        font-size:16px;
                        color:#dbe3ef;
                    "
                >
                    CSE Class Routine
                </div>


                <div
                    style="
                        display:flex;
                        gap:10px;
                        margin-top:22px;
                    "
                >

                    <div
                        style="
                            background:${COLORS.navy2};
                            border:1px solid #3a4861;
                            border-radius:8px;
                            padding:8px 13px;
                            font-size:12px;
                            font-weight:800;
                        "
                    >
                        SECTION:
                        ${escapeHtml(section)}
                    </div>


                    <div
                        style="
                            background:${COLORS.navy2};
                            border:1px solid #3a4861;
                            border-radius:8px;
                            padding:8px 13px;
                            font-size:12px;
                            font-weight:800;
                        "
                    >
                        ${escapeHtml(
                            semester
                        )}
                    </div>


                    <div
                        style="
                            background:${COLORS.navy2};
                            border:1px solid #3a4861;
                            border-radius:8px;
                            padding:8px 13px;
                            font-size:12px;
                            font-weight:800;
                        "
                    >
                        VERSION
                        ${escapeHtml(version)}
                    </div>

                </div>

            </div>


            <!-- =================================================
                 SUMMARY
                 ================================================= -->

            <div
                style="
                    display:flex;
                    gap:10px;
                    padding:20px 24px;
                    background:#ffffff;
                    border-bottom:1px solid ${COLORS.border};
                    box-sizing:border-box;
                "
            >

                <div
                    style="
                        flex:1;
                        border:1px solid ${COLORS.border};
                        border-radius:9px;
                        padding:10px 14px;
                        background:#ffffff;
                    "
                >

                    <div
                        style="
                            font-size:10px;
                            color:${COLORS.muted};
                            font-weight:700;
                            text-transform:uppercase;
                        "
                    >
                        Total Classes
                    </div>

                    <div
                        style="
                            font-size:18px;
                            font-weight:800;
                            color:${COLORS.text};
                        "
                    >
                        ${sorted.length}
                    </div>

                </div>


                <div
                    style="
                        flex:1;
                        border:1px solid ${COLORS.border};
                        border-radius:9px;
                        padding:10px 14px;
                        background:#ffffff;
                    "
                >

                    <div
                        style="
                            font-size:10px;
                            color:${COLORS.muted};
                            font-weight:700;
                            text-transform:uppercase;
                        "
                    >
                        Active Days
                    </div>

                    <div
                        style="
                            font-size:18px;
                            font-weight:800;
                            color:${COLORS.text};
                        "
                    >
                        ${activeDays.length}
                    </div>

                </div>


                <div
                    style="
                        flex:3;
                        border:1px solid ${COLORS.border};
                        border-radius:9px;
                        padding:10px 14px;
                        background:#ffffff;
                        box-sizing:border-box;
                    "
                >

                    <div
                        style="
                            font-size:10px;
                            color:${COLORS.muted};
                            font-weight:700;
                            text-transform:uppercase;
                            margin-bottom:3px;
                        "
                    >
                        Teachers
                    </div>

                    <div
                        style="
                            font-size:12px;
                            font-weight:700;
                            color:${COLORS.text};
                            white-space:nowrap;
                            overflow:hidden;
                        "
                    >
                        ${escapeHtml(
                            teachers.join(
                                '  •  '
                            ) ||
                            'N/A'
                        )}
                    </div>

                </div>

            </div>


            <!-- =================================================
                 TABLE AREA
                 ================================================= -->

            <div
                style="
                    padding:24px;
                    background:#ffffff;
                    box-sizing:border-box;
                "
            >

                <table
                    style="
                        width:100%;
                        border-collapse:collapse;
                        table-layout:fixed;
                        border:1px solid ${COLORS.borderDark};
                        font-size:12px;
                    "
                >

                    <colgroup>

                        <col
                            style="
                                width:115px;
                            "
                        >

                        <col>
                        <col>
                        <col>
                        <col>
                        <col>
                        <col>

                    </colgroup>


                    <!-- TABLE HEADER -->

                    <thead>

                        <tr>

                            <th
                                style="
                                    height:48px;
                                    padding:8px;
                                    background:${COLORS.header};
                                    color:#ffffff;
                                    border:1px solid ${COLORS.header};
                                    text-align:center;
                                    font-size:12px;
                                    font-weight:800;
                                    vertical-align:middle;
                                "
                            >
                                DAY / TIME
                            </th>

    `;


    // --------------------------------------------------------
    // TIME HEADERS
    // --------------------------------------------------------

    DISPLAY_TIME_SLOTS.forEach(
        slot => {

            html += `

                <th
                    style="
                        height:48px;
                        padding:7px 4px;
                        background:${COLORS.header};
                        color:#ffffff;
                        border:1px solid #34415a;
                        text-align:center;
                        font-size:11px;
                        font-weight:800;
                        line-height:1.25;
                        vertical-align:middle;
                    "
                >
                    ${escapeHtml(slot)}
                </th>

            `;

        }
    );


    html += `

                        </tr>

                    </thead>


                    <tbody>

    `;


    // --------------------------------------------------------
    // DAY ROWS
    // --------------------------------------------------------

    DAYS.forEach(
        day => {

            const today =
                isTodayDay(day);


            html += `

                <tr>

                    <!-- DAY -->

                    <td
                        style="
                            height:90px;
                            padding:8px;
                            background:${
                                today
                                    ? '#e9fbed'
                                    : COLORS.time
                            };
                            border:1px solid ${COLORS.borderDark};
                            text-align:center;
                            vertical-align:middle;
                            font-weight:800;
                            box-sizing:border-box;
                        "
                    >

                        <div
                            style="
                                font-size:14px;
                                color:${COLORS.text};
                                line-height:1.25;
                            "
                        >
                            ${escapeHtml(day)}
                        </div>


                        ${
                            today
                                ? `

                                    <div
                                        style="
                                            display:inline-block;
                                            margin-top:5px;
                                            padding:2px 7px;
                                            border-radius:20px;
                                            background:#dcfce7;
                                            color:#15803d;
                                            font-size:9px;
                                            font-weight:800;
                                        "
                                    >
                                        TODAY
                                    </div>

                                  `
                                : ''
                        }

                    </td>

            `;


            let skipNextSlot =
                false;


            DISPLAY_TIME_SLOTS.forEach(
                (slot, index) => {

                    // ------------------------------------------------
                    // Skip second half of 11:30-02:30 lab
                    // ------------------------------------------------

                    if (skipNextSlot) {

                        skipNextSlot =
                            false;

                        return;

                    }


                    const items =
                        cellMap[day][slot] ||
                        [];


                    const lab =
                        items.find(
                            cls =>
                                isTwoSlotLab(
                                    cls
                                )
                        );


                    // ------------------------------------------------
                    // TWO SLOT LAB
                    // ------------------------------------------------

                    if (
                        slot ===
                            '11:30-01:00' &&
                        lab
                    ) {

                        const comment =
                            getDisplayComment(
                                lab,
                                currentMode !==
                                    'section',
                                currentMode
                            );


                        html += `

                            <td
                                colspan="2"
                                style="
                                    height:90px;
                                    padding:9px;
                                    background:${COLORS.labBg};
                                    border:1px solid ${COLORS.borderDark};
                                    vertical-align:top;
                                    box-sizing:border-box;
                                "
                            >

                                <div
                                    style="
                                        min-height:70px;
                                        box-sizing:border-box;
                                        border:1px solid #eadca9;
                                        border-radius:10px;
                                        padding:10px;
                                        background:#fffaf0;
                                    "
                                >

                                    <div
                                        style="
                                            font-size:15px;
                                            font-weight:800;
                                            color:${COLORS.text};
                                            margin-bottom:5px;
                                            line-height:1.25;
                                            word-break:break-word;
                                        "
                                    >

                                        ${escapeHtml(
                                            lab.course ||
                                            'N/A'
                                        )}

                                        ${
                                            comment
                                                ? `

                                                    <span
                                                        style="
                                                            font-size:11px;
                                                            color:${COLORS.muted};
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


                                    <span
                                        style="
                                            display:inline-block;
                                            background:#f9e8ad;
                                            color:${COLORS.labText};
                                            border-radius:20px;
                                            padding:3px 8px;
                                            font-size:9px;
                                            font-weight:800;
                                            margin-bottom:6px;
                                        "
                                    >
                                        LAB
                                    </span>


                                    <div
                                        style="
                                            font-size:11px;
                                            color:${COLORS.muted};
                                            line-height:1.5;
                                        "
                                    >

                                        <b>
                                            ${escapeHtml(
                                                lab.teacher ||
                                                'TBA'
                                            )}
                                        </b>

                                        <br>

                                        ${escapeHtml(
                                            lab.room ||
                                            'TBA'
                                        )}

                                    </div>

                                </div>

                            </td>

                        `;


                        // ------------------------------------------------
                        // 11:30-01:00 + 01:00-02:30
                        // ------------------------------------------------

                        skipNextSlot =
                            true;


                        return;

                    }


                    // ------------------------------------------------
                    // NORMAL CELL
                    // ------------------------------------------------

                    const bg =
                        today
                            ? COLORS.today
                            : COLORS.white;


                    html += `

                        <td
                            style="
                                height:90px;
                                padding:7px;
                                background:${bg};
                                border:1px solid ${COLORS.borderDark};
                                vertical-align:top;
                                box-sizing:border-box;
                            "
                        >

                            ${cellContent(items)}

                        </td>

                    `;

                }
            );


            html += `

                </tr>

            `;

        }
    );


    html += `

                    </tbody>

                </table>


                <!-- =================================================
                     LEGEND
                     ================================================= -->

                <div
                    style="
                        display:flex;
                        align-items:center;
                        gap:18px;
                        margin-top:18px;
                        padding:12px 14px;
                        background:#f8fafc;
                        border:1px solid ${COLORS.border};
                        border-radius:9px;
                        font-size:11px;
                        color:${COLORS.muted};
                    "
                >

                    <span
                        style="
                            display:flex;
                            align-items:center;
                            gap:6px;
                        "
                    >

                        <span
                            style="
                                width:11px;
                                height:11px;
                                border-radius:3px;
                                background:${COLORS.theoryBg};
                                border:1px solid #c8dafa;
                                display:inline-block;
                            "
                        ></span>

                        Theory

                    </span>


                    <span
                        style="
                            display:flex;
                            align-items:center;
                            gap:6px;
                        "
                    >

                        <span
                            style="
                                width:11px;
                                height:11px;
                                border-radius:3px;
                                background:${COLORS.labBg};
                                border:1px solid #eadca9;
                                display:inline-block;
                            "
                        ></span>

                        Lab

                    </span>


                    <span
                        style="
                            display:flex;
                            align-items:center;
                            gap:6px;
                        "
                    >

                        <span
                            style="
                                width:11px;
                                height:11px;
                                border-radius:3px;
                                background:${COLORS.today};
                                border:1px solid #bbf7d0;
                                display:inline-block;
                            "
                        ></span>

                        Today

                    </span>

                </div>


                <!-- =================================================
                     FOOTER
                     ================================================= -->

                <div
                    style="
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                        margin-top:18px;
                        padding-top:15px;
                        border-top:1px solid ${COLORS.border};
                        font-size:10px;
                        color:${COLORS.muted};
                    "
                >

                    <span>
                        Generated by DIU CSE Routine
                    </span>


                    <span>
                        ${escapeHtml(
                            new Date()
                                .toLocaleString()
                        )}
                    </span>

                </div>

            </div>

        </div>

    `;


    wrapper.innerHTML =
        html;


    return wrapper;

}


// ============================================================
// CLEAR
// ============================================================

function handleClearSection() {

    if (sectionInput) {

        sectionInput.value =
            '';

    }


    localStorage.removeItem(
        STORAGE_KEY
    );


    if (savedChip) {

        savedChip.style.display =
            'none';

    }


    if (savedSectionSpan) {

        savedSectionSpan.textContent =
            '';

    }


    currentSearchTerm =
        '';


    currentClasses =
        [];


    if (routineContainer) {

        routineContainer.innerHTML =
            '';

    }


    showNoRoutine(
        'Search Routine',
        currentMode === 'section'
            ? 'Enter your section to view the routine.'
            : currentMode === 'teacher'
                ? 'Enter teacher initials to view the routine.'
                : currentMode === 'room'
                    ? 'Enter room name to view the routine.'
                    : 'Enter a day or room to search empty rooms.'
    );

}


// ============================================================
// STATUS
// ============================================================

function setStatus(
    type,
    text
) {

    if (statusText) {

        statusText.textContent =
            text;

    }


    if (statusBadge) {

        statusBadge.classList.remove(
            'loading',
            'ready',
            'error'
        );


        statusBadge.classList.add(
            type
        );

    }

}


// ============================================================
// MESSAGE
// ============================================================

function showMessage(
    text,
    type = 'info'
) {

    if (!message) {
        return;
    }


    message.textContent =
        text;


    message.className =
        `message ${type}`;


    message.style.display =
        'block';

}


function hideMessage() {

    if (!message) {
        return;
    }


    message.style.display =
        'none';

}


// ============================================================
// NO ROUTINE
// ============================================================

function showNoRoutine(
    title,
    text
) {

    if (!routineContainer) {
        return;
    }


    routineContainer.innerHTML = `

        <div
            class="enrolled-card"
            style="
                text-align:center;
                padding:40px 25px;
            "
        >

            <div
                style="
                    width:64px;
                    height:64px;
                    margin:0 auto 18px;
                    border-radius:50%;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    background:var(--soft-bg,#f1f5f9);
                    color:var(--primary,#2563eb);
                    font-size:25px;
                "
            >

                <i
                    class="fas fa-calendar-alt"
                ></i>

            </div>


            <h3
                style="
                    margin-bottom:8px;
                "
            >
                ${escapeHtml(title)}
            </h3>


            <p
                style="
                    color:var(--muted);
                    margin:0;
                "
            >
                ${escapeHtml(text)}
            </p>

        </div>

    `;

}


// ============================================================
// ESCAPE HTML
// ============================================================

function escapeHtml(
    value
) {

    return String(
        value ?? ''
    )
        .replace(
            /&/g,
            '&amp;'
        )
        .replace(
            /</g,
            '&lt;'
        )
        .replace(
            />/g,
            '&gt;'
        )
        .replace(
            /"/g,
            '&quot;'
        )
        .replace(
            /'/g,
            '&#039;'
        );

}


// ============================================================
// ESCAPE ATTRIBUTE
// ============================================================

function escapeAttribute(
    value
) {

    return String(
        value ?? ''
    )
        .replace(
            /&/g,
            '&amp;'
        )
        .replace(
            /"/g,
            '&quot;'
        )
        .replace(
            /</g,
            '&lt;'
        )
        .replace(
            />/g,
            '&gt;'
        );

}


// ============================================================
// AUTO REFRESH
// ============================================================
//
// Reload routine data periodically without losing the current
// section/mode.
//
// ============================================================

const AUTO_REFRESH_INTERVAL =
    5 * 60 * 1000;


setInterval(
    async () => {

        try {

            if (
                document.visibilityState !==
                'visible'
            ) {

                return;

            }


            // ------------------------------------------------
            // SECTION
            // ------------------------------------------------

            if (
                currentMode ===
                'section'
            ) {

                const saved =
                    localStorage.getItem(
                        STORAGE_KEY
                    );


                if (saved) {

                    routineData =
                        null;


                    await loadSection(
                        saved
                    );

                }

            }


            // ------------------------------------------------
            // TEACHER
            // ------------------------------------------------

            else if (
                currentMode ===
                'teacher'
            ) {

                if (
                    currentSearchTerm
                ) {

                    routineData =
                        null;


                    await loadTeacher(
                        currentSearchTerm
                    );

                }

            }


            // ------------------------------------------------
            // ROOM
            // ------------------------------------------------

            else if (
                currentMode ===
                'room'
            ) {

                if (
                    currentSearchTerm
                ) {

                    routineData =
                        null;


                    await loadRoom(
                        currentSearchTerm
                    );

                }

            }


            // ------------------------------------------------
            // EMPTY ROOM
            // ------------------------------------------------

            else if (
                currentMode ===
                'empty-room'
            ) {

                routineData =
                    null;


                await loadEmptyRooms(
                    sectionInput?.value ||
                    ''
                );

            }

        }

        catch (error) {

            console.warn(
                'Auto refresh failed:',
                error
            );

        }

    },
    AUTO_REFRESH_INTERVAL
);


// ============================================================
// EXPOSE DOWNLOAD FUNCTION
// ============================================================

window.downloadSection =
    downloadSection;


// ============================================================
// END
// ============================================================
