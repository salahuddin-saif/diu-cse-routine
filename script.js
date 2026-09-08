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
// - Teacher mode
// - Room mode
// - Empty room detection
// - Routine/source link support
// - Correct day ordering
// - Correct time ordering
// - 6 standard time columns
// - 11:30-02:30 Lab occupies TWO standard slots
// - Lab colspan=2 in download
// - Lab rowspan=2 in week view
// - Main section = no subsection label
// - Lab = (N1), (N2)
// - Search
// - Day View / Week View
// - Stylish PNG download
// - LocalStorage
// - Auto refresh
// ============================================================


// ============================================================
// STORAGE
// ============================================================

const STORAGE_KEY = 'diu_cse_section';
const MODE_KEY = 'diu_cse_mode';


// ============================================================
// DATA URLS
// ============================================================
//
// Section files:
// ./data/sections/70_N.json
// ./data/sections/70_B.json
//
// Combined fallback:
// ./data/routine.json
//
// IMPORTANT:
// Do NOT put ?t=Date.now() permanently in the constant.
// cache-busting is handled by fetchJson().
// ============================================================

const SECTION_BASE_URL = './data/sections/';
const COMBINED_URL = './data/routine.json';


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


// Optional empty-room navigation/button.
// Supports several possible HTML class/id names.

const emptyRoomBtn =
    document.querySelector(
        '#emptyRoomBtn, .empty-room-btn, .nav-item .fa-door-closed'
    )?.closest(
        '#emptyRoomBtn, .empty-room-btn, .nav-item'
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
//
// IMPORTANT:
// 11:30-02:30 is NOT a separate column.
//
// It occupies:
//   11:30-01:00
//   01:00-02:30
//
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
            localStorage.getItem(
                MODE_KEY
            ) || 'section';


        updateModeUI();


        const saved =
            localStorage.getItem(
                STORAGE_KEY
            );


        if (saved) {

            if (sectionInput) {
                sectionInput.value = saved;
            }

            if (savedSectionSpan) {
                savedSectionSpan.textContent =
                    saved;
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


        // Load initial data.
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


        // Search button
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


        // Enter key
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


        // Student / Section
        if (userBtn) {

            userBtn.addEventListener(
                'click',
                () => setMode('section')
            );

        }


        // Teacher
        if (teacherBtn) {

            teacherBtn.addEventListener(
                'click',
                () => setMode('teacher')
            );

        }


        // Room
        if (roomBtn) {

            roomBtn.addEventListener(
                'click',
                () => setMode('room')
            );

        }


        // Empty Room
        if (emptyRoomBtn) {

            emptyRoomBtn.addEventListener(
                'click',
                () => setMode('empty-room')
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


    currentMode =
        mode;


    localStorage.setItem(
        MODE_KEY,
        mode
    );


    updateModeUI();


    if (routineContainer) {
        routineContainer.innerHTML = '';
    }


    if (savedChip) {
        savedChip.style.display =
            'none';
    }


    if (sectionInput) {
        sectionInput.value = '';
    }


    localStorage.removeItem(
        STORAGE_KEY
    );


    if (
        mode === 'section'
    ) {

        if (sectionInput) {

            sectionInput.placeholder =
                'Enter section (e.g., 70_N)';

        }

        loadRoutineData();

    }


    else if (
        mode === 'teacher'
    ) {

        if (sectionInput) {

            sectionInput.placeholder =
                'Enter teacher initials (e.g., NSL)';

        }

        showNoRoutine(
            'Teacher Mode',
            'Enter teacher initials to see their classes.'
        );

    }


    else if (
        mode === 'room'
    ) {

        if (sectionInput) {

            sectionInput.placeholder =
                'Enter room (e.g., KT-516)';

        }

        showNoRoutine(
            'Room Mode',
            'Enter room name to see its schedule.'
        );

    }


    else if (
        mode === 'empty-room'
    ) {

        if (sectionInput) {

            sectionInput.placeholder =
                'Enter time or room search';

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

        else if (
            currentMode === 'room'
        ) {

            brand.textContent =
                'Room';

        }

        else {

            brand.textContent =
                'Empty Room';

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


    if (
        currentMode === 'empty-room' &&
        emptyRoomBtn
    ) {

        emptyRoomBtn.classList.add(
            'active'
        );

    }

}


// ============================================================
// SEARCH
// ============================================================

function handleSearch() {

    const raw =
        sectionInput?.value.trim() ||
        '';


    // Empty Room mode can work without search.
    if (
        currentMode === 'empty-room'
    ) {

        loadEmptyRooms(
            raw
        );

        return;

    }


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


    else if (
        currentMode === 'room'
    ) {

        loadRoom(
            normalized
        );

    }

}


// ============================================================
// FETCH JSON
// ============================================================

async function fetchJson(
    url
) {

    const separator =
        url.includes('?')
            ? '&'
            : '?';


    const response =
        await fetch(
            url +
            separator +
            't=' +
            Date.now(),
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

            await loadSection(
                saved
            );

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
            currentMode !== 'section'
        ) {

            showNoRoutine(
                currentMode === 'teacher'
                    ? 'Teacher Mode'
                    : currentMode === 'room'
                        ? 'Room Mode'
                        : 'Empty Room',
                `Enter ${
                    currentMode === 'teacher'
                        ? 'teacher initials'
                        : currentMode === 'room'
                            ? 'room name'
                            : 'a time or leave blank'
                } to see results.`
            );


            setStatus(
                'ready',
                'Ready'
            );


            return;

        }


        const sections =
            getSectionsObject(
                routineData
            );


        const keys =
            Object.keys(
                sections
            );


        if (!keys.length) {

            showNoRoutine(
                'No Data',
                'No routine data available.'
            );

            setStatus(
                'ready',
                'Ready'
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


        setStatus(
            'ready',
            'Ready'
        );

    }

    catch (error) {

        console.error(
            'loadRoutineData:',
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
// GET SECTIONS OBJECT
// ============================================================

function getSectionsObject(
    data
) {

    if (!data) {
        return {};
    }


    if (
        data.sections &&
        typeof data.sections === 'object'
    ) {

        return data.sections;

    }


    // Some section JSON files may directly contain
    // a class array.

    if (
        Array.isArray(data)
    ) {

        return {
            _direct: data
        };

    }


    if (
        Array.isArray(data.classes)
    ) {

        return {
            _direct: data.classes
        };

    }


    return {};

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
                .trim()
                .toUpperCase()
                .replace(/\s+/g, '_');


        const baseSection =
            getBaseSection(
                normalized
            );


        // ----------------------------------------------------
        // FIRST: section-specific JSON
        // ----------------------------------------------------

        let sectionJson =
            null;


        const sectionUrls = [

            SECTION_BASE_URL +
                encodeURIComponent(
                    normalized
                ) +
                '.json',

            SECTION_BASE_URL +
                encodeURIComponent(
                    baseSection
                ) +
                '.json'

        ];


        for (
            const url of sectionUrls
        ) {

            try {

                sectionJson =
                    await fetchJson(
                        url
                    );

                break;

            }

            catch (e) {

                // Try next URL.
            }

        }


        let classes =
            [];


        if (sectionJson) {

            const direct =
                extractClassesFromData(
                    sectionJson
                );


            classes.push(
                ...direct
            );

        }


        // ----------------------------------------------------
        // FALLBACK: combined routine.json
        // ----------------------------------------------------

        if (!classes.length) {

            if (!routineData) {

                routineData =
                    await fetchJson(
                        COMBINED_URL
                    );

            }


            updateMeta(
                routineData
            );


            const sections =
                getSectionsObject(
                    routineData
                );


            const matchingKeys =
                Object.keys(
                    sections
                ).filter(
                    key =>
                        key === normalized ||
                        key === baseSection ||
                        getBaseSection(key) ===
                            baseSection
                );


            matchingKeys.forEach(
                key => {

                    classes.push(
                        ...extractClassesFromData(
                            sections[key]
                        )
                    );

                }
            );

        }


        // ----------------------------------------------------
        // Final fallback error
        // ----------------------------------------------------

        if (!classes.length) {

            throw new Error(
                `Section "${normalized}" not found.`
            );

        }


        classes =
            removeDuplicateClasses(
                normalizeClasses(
                    classes
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
            'loadSection:',
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


    if (
        Array.isArray(data.classes)
    ) {

        return data.classes;

    }


    if (
        Array.isArray(data.routine)
    ) {

        return data.routine;

    }


    if (
        Array.isArray(data.schedule)
    ) {

        return data.schedule;

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
        getSectionsObject(
            routineData
        );


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

                all.push(
                    ...extractClassesFromData(
                        data
                    )
                );

            }

        }
    );


    return removeDuplicateClasses(
        normalizeClasses(
            all
        )
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
            normalizeSearch(
                initials
            );


        const sections =
            getSectionsObject(
                routineData
            );


        const results =
            [];


        Object.entries(
            sections
        ).forEach(
            ([section, data]) => {

                const classes =
                    extractClassesFromData(
                        data
                    );


                classes.forEach(
                    cls => {

                        const teacher =
                            normalizeSearch(
                                cls.teacher ||
                                cls.faculty ||
                                cls.instructor ||
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
            'loadTeacher:',
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
            normalizeSearch(
                roomName
            );


        const sections =
            getSectionsObject(
                routineData
            );


        const results =
            [];


        Object.entries(
            sections
        ).forEach(
            ([section, data]) => {

                const classes =
                    extractClassesFromData(
                        data
                    );


                classes.forEach(
                    cls => {

                        const room =
                            normalizeSearch(
                                cls.room ||
                                cls.room_no ||
                                cls.classroom ||
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
            'loadRoom:',
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
//
// Calculates empty rooms from all rooms found in routine data.
//
// If search is:
//   10:00-11:30
//
// it shows rooms with no class in that slot.
//
// If no search is entered:
//   it shows all empty rooms for every slot/day.
// ============================================================

async function loadEmptyRooms(
    search = ''
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
            getAllClasses();


        if (!allClasses.length) {

            throw new Error(
                'No routine classes available.'
            );

        }


        const normalized =
            normalizeClasses(
                allClasses
            );


        currentClasses =
            normalized;


        const rooms =
            collectRooms(
                normalized
            );


        if (!rooms.length) {

            throw new Error(
                'No room information found in routine data.'
            );

        }


        const requestedSlot =
            findMatchingTimeSlot(
                search
            );


        const requestedDay =
            findMatchingDay(
                search
            );


        const result =
            [];


        DAYS.forEach(
            day => {

                if (
                    requestedDay &&
                    day !== requestedDay
                ) {

                    return;

                }


                DISPLAY_TIME_SLOTS.forEach(
                    slot => {

                        if (
                            requestedSlot &&
                            slot !== requestedSlot
                        ) {

                            return;

                        }


                        const occupied =
                            new Set();


                        normalized
                            .filter(
                                cls =>
                                    normalizeDay(
                                        cls.day
                                    ) === day
                            )
                            .forEach(
                                cls => {

                                    const classSlot =
                                        getClassTimeSlot(
                                            cls
                                        );


                                    if (
                                        isTwoSlotLab(
                                            cls
                                        )
                                    ) {

                                        occupied.add(
                                            '11:30-01:00'
                                        );

                                        occupied.add(
                                            '01:00-02:30'
                                        );

                                    }

                                    else if (
                                        classSlot ===
                                        slot
                                    ) {

                                        occupied.add(
                                            slot
                                        );

                                    }

                                }
                            );


                        const empty =
                            rooms.filter(
                                room =>
                                    !isRoomOccupied(
                                        room,
                                        normalized,
                                        day,
                                        slot
                                    )
                            );


                        if (empty.length) {

                            result.push({

                                day,

                                slot,

                                rooms:
                                    empty

                            });

                        }

                    }
                );

            }
        );


        displayEmptyRooms(
            result,
            rooms,
            search
        );


        setStatus(
            'ready',
            'Ready'
        );


        hideMessage();

    }

    catch (error) {

        console.error(
            'loadEmptyRooms:',
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
            error.message
        );

    }

}


// ============================================================
// ROOM OCCUPIED
// ============================================================

function isRoomOccupied(
    room,
    classes,
    day,
    slot
) {

    return classes.some(
        cls => {

            if (
                normalizeDay(
                    cls.day
                ) !== day
            ) {

                return false;

            }


            const clsRoom =
                normalizeSearch(
                    cls.room
                );


            if (
                clsRoom !==
                normalizeSearch(room)
            ) {

                return false;

            }


            if (
                isTwoSlotLab(
                    cls
                )
            ) {

                return (
                    slot ===
                        '11:30-01:00' ||
                    slot ===
                        '01:00-02:30'
                );

            }


            return (
                getClassTimeSlot(
                    cls
                ) === slot
            );

        }
    );

}


// ============================================================
// DISPLAY EMPTY ROOMS
// ============================================================

function displayEmptyRooms(
    results,
    allRooms,
    search
) {

    if (!routineContainer) {
        return;
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

                    <span>
                        Total Rooms
                    </span>

                    <strong>
                        ${allRooms.length}
                    </strong>

                </div>


                <div class="meta-row">

                    <span>
                        Search
                    </span>

                    <strong>
                        ${escapeHtml(
                            search || 'All'
                        )}
                    </strong>

                </div>

            </div>

        </div>


        <div
            class="empty-room-results"
            style="
                display:grid;
                gap:16px;
                margin-top:18px;
            "
        >

    `;


    if (!results.length) {

        html += `

            <div class="no-routine">

                <div class="icon">
                    🚪
                </div>

                <h3>
                    No Empty Room Found
                </h3>

                <p>
                    All rooms are occupied for the selected time/day.
                </p>

            </div>

        `;

    }


    else {

        results.forEach(
            item => {

                html += `

                    <div
                        class="day-card"
                    >

                        <div
                            class="day-card-header"
                        >

                            <span>

                                <i
                                    class="fas fa-calendar-alt"
                                ></i>

                                ${escapeHtml(
                                    item.day
                                )}

                            </span>


                            <span>

                                <i
                                    class="far fa-clock"
                                ></i>

                                ${escapeHtml(
                                    item.slot
                                )}

                            </span>

                        </div>


                        <div
                            class="day-card-body"
                            style="
                                display:flex;
                                flex-wrap:wrap;
                                gap:8px;
                            "
                        >

                            ${item.rooms
                                .map(
                                    room =>
                                        `

                                        <span
                                            style="
                                                display:inline-flex;
                                                align-items:center;
                                                gap:6px;
                                                padding:8px 12px;
                                                border-radius:999px;
                                                background:#dcfce7;
                                                color:#166534;
                                                font-weight:700;
                                                font-size:.85rem;
                                            "
                                        >

                                            <i
                                                class="fas fa-door-open"
                                            ></i>

                                            ${escapeHtml(
                                                room
                                            )}

                                        </span>

                                        `
                                )
                                .join('')}

                        </div>

                    </div>

                `;

            }
        );

    }


    html += `
        </div>
    `;


    routineContainer.innerHTML =
        html;

}


// ============================================================
// DISPLAY SECTION / TEACHER / ROOM
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
                        c =>
                            c.teacher
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
                                c.section ||
                                c._section
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


    let html = `

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


        <div class="teacher-row">

    `;


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

                        <span
                            class="online"
                        ></span>

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


    html += `

        </div>


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


    DAYS.forEach(
        day => {

            const dayClasses =
                sortClasses(
                    grouped[day]
                );


            if (!dayClasses.length) {
                return;
            }


            html += `

                <div class="day-card">

                    <div
                        class="day-card-header"
                    >

                        <span>

                            <i
                                class="fas fa-calendar-alt"
                            ></i>

                            ${day}

                        </span>


                        <span>
                            ${dayClasses.length}
                            classes
                        </span>

                    </div>


                    <div
                        class="day-card-body"
                    >

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


                    const routineLink =
                        getRoutineLink(
                            cls
                        );


                    html += `

                        <div
                            class="class-item"
                        >

                            <div class="time">

                                <i
                                    class="far fa-clock"
                                ></i>

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
                                        class="type-tag ${typeClass}"
                                    >
                                        ${typeLabel}
                                    </span>

                                </span>


                                ${
                                    routineLink
                                        ? `

                                            <a
                                                href="${escapeAttribute(
                                                    routineLink
                                                )}"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title="Open routine/source"
                                                style="
                                                    margin-left:8px;
                                                    text-decoration:none;
                                                "
                                            >

                                                <i
                                                    class="fas fa-external-link-alt"
                                                ></i>

                                            </a>

                                          `
                                        : ''
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
//
// IMPORTANT:
// A 11:30-02:30 Lab occupies TWO rows.
// It is NOT shown as an extra time row.
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


    const slots =
        DISPLAY_TIME_SLOTS;


    // Occupied cells for rowspan handling.
    const occupied = {};


    DAYS.forEach(
        day => {

            occupied[day] = {};

            slots.forEach(
                slot => {

                    occupied[day][slot] =
                        false;

                }
            );

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

                    if (
                        occupied[day][slot]
                    ) {

                        return;

                    }


                    const matching =
                        sortClasses(
                            grouped[day]
                                .filter(
                                    cls => {

                                        if (
                                            isTwoSlotLab(
                                                cls
                                            )
                                        ) {

                                            return (
                                                slot ===
                                                    '11:30-01:00'
                                            );

                                        }


                                        return (
                                            getClassTimeSlot(
                                                cls
                                            ) === slot
                                        );

                                    }
                                )
                        );


                    if (
                        matching.length
                    ) {

                        let cellContent =
                            '';


                        let rowSpan =
                            1;


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


                                const link =
                                    getRoutineLink(
                                        cls
                                    );


                                if (
                                    isTwoSlotLab(
                                        cls
                                    )
                                ) {

                                    rowSpan =
                                        2;


                                    occupied[day][
                                        '01:00-02:30'
                                    ] = true;

                                }


                                cellContent += `

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


                                        ${
                                            link
                                                ? `

                                                    <br>

                                                    <a
                                                        href="${escapeAttribute(
                                                            link
                                                        )}"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style="
                                                            font-size:.72rem;
                                                            text-decoration:none;
                                                        "
                                                    >
                                                        Open routine
                                                    </a>

                                                  `
                                                : ''
                                        }

                                    </div>

                                `;

                            }
                        );


                        html += `

                            <td
                                ${
                                    rowSpan > 1
                                        ? `rowspan="${rowSpan}"`
                                        : ''
                                }
                            >

                                ${cellContent}

                            </td>

                        `;

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

    // Teacher / Room mode:
    // show section.
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
        String(sub)
            .trim();


    // Main = nothing
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
// NORMALIZE CLASSES
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
                cls._section ||
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
                        cls.courseCode ||
                        ''
                    ).trim(),

                teacher:
                    String(
                        cls.teacher ||
                        cls.faculty ||
                        cls.instructor ||
                        ''
                    ).trim(),

                room:
                    String(
                        cls.room ||
                        cls.room_no ||
                        cls.roomNo ||
                        cls.classroom ||
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

        sat:
            'Saturday',

        sunday:
            'Sunday',

        sun:
            'Sunday',

        monday:
            'Monday',

        mon:
            'Monday',

        tuesday:
            'Tuesday',

        tue:
            'Tuesday',

        tues:
            'Tuesday',

        wednesday:
            'Wednesday',

        wed:
            'Wednesday',

        thursday:
            'Thursday',

        thu:
            'Thursday',

        thur:
            'Thursday',

        friday:
            'Friday',

        fri:
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
// TWO-SLOT LAB
// ============================================================

function isTwoSlotLab(
    cls
) {

    if (
        normalizeClassType(
            cls.type
        ) !== 'Lab'
    ) {

        return false;

    }


    const time =
        getClassTimeSlot(
            cls
        );


    return (
        time ===
        '11:30-02:30'
    );

}


// ============================================================
// LAB SPAN INFO
// ============================================================

function getLabSpanInfo() {

    return {

        startSlot:
            '11:30-01:00',

        endSlot:
            '01:00-02:30',

        colspan:
            2,

        startIndex:
            DISPLAY_TIME_SLOTS.indexOf(
                '11:30-01:00'
            )

    };

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


    // Long lab starts at 11:30.
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
// BASE SECTION
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
// ALL CLASSES
// ============================================================

function getAllClasses() {

    if (!routineData) {
        return [];
    }


    const sections =
        getSectionsObject(
            routineData
        );


    const all =
        [];


    Object.entries(
        sections
    ).forEach(
        ([section, data]) => {

            extractClassesFromData(
                data
            ).forEach(
                cls => {

                    all.push({

                        ...cls,

                        _section:
                            cls.section ||
                            section

                    });

                }
            );

        }
    );


    return all;

}


// ============================================================
// COLLECT ROOMS
// ============================================================

function collectRooms(
    classes
) {

    return [
        ...new Set(
            classes
                .map(
                    cls =>
                        String(
                            cls.room || ''
                        ).trim()
                )
                .filter(
                    room =>
                        room &&
                        room !== '-' &&
                        room.toUpperCase() !==
                            'TBA'
                )
        )
    ].sort(
        (a, b) =>
            a.localeCompare(
                b,
                undefined,
                {
                    numeric: true
                }
            )
    );

}


// ============================================================
// NORMALIZE SEARCH
// ============================================================

function normalizeSearch(
    value
) {

    return String(
        value || ''
    )
        .toUpperCase()
        .replace(
            /\s+/g,
            ''
        );

}


// ============================================================
// FIND TIME FROM SEARCH
// ============================================================

function findMatchingTimeSlot(
    value
) {

    const clean =
        normalizeTime(
            value
        );


    if (
        clean ===
        '11:30-02:30'
    ) {

        return null;

    }


    return DISPLAY_TIME_SLOTS.find(
        slot =>
            slot === clean
    ) || null;

}


// ============================================================
// FIND DAY FROM SEARCH
// ============================================================

function findMatchingDay(
    value
) {

    const clean =
        String(
            value || ''
        )
            .trim()
            .toLowerCase();


    return DAYS.find(
        day =>
            day.toLowerCase() ===
                clean ||
            day
                .substring(0, 3)
                .toLowerCase() ===
                clean
    ) || null;

}


// ============================================================
// ROUTINE LINK
// ============================================================
//
// Supports multiple JSON field names so old/new scraper data
// both work.
//
// ============================================================

function getRoutineLink(
    cls
) {

    const candidates = [

        cls.routine_link,

        cls.routineLink,

        cls.routine_url,

        cls.routineUrl,

        cls.source_url,

        cls.sourceUrl,

        cls.pdf_url,

        cls.pdfUrl,

        cls.url,

        cls.link,

        cls.href

    ];


    for (
        const value of candidates
    ) {

        if (
            value &&
            /^https?:\/\//i.test(
                String(value).trim()
            )
        ) {

            return String(
                value
            ).trim();

        }

    }


    return '';

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


        if (!Number.isNaN(date.getTime())) {

            lastUpdated.textContent =
                'Updated: ' +
                date.toLocaleString();

        }

    }

}


// ============================================================
// SEMESTER
// ============================================================

function getSemester() {

    if (
        routineData &&
        routineData.semester
    ) {

        return String(
            routineData.semester
        );

    }


    if (
        routineData &&
        routineData.meta &&
        routineData.meta.semester
    ) {

        return String(
            routineData.meta.semester
        );

    }


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


        await loadHtml2Canvas();


        const imageElement =
            createRoutineDownloadCard();


        document.body.appendChild(
            imageElement
        );


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
                        '#0f172a',

                    useCORS:
                        true,

                    allowTaint:
                        true,

                    logging:
                        false,

                    letterRendering:
                        true,

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
        '1600px';

    wrapper.style.background =
        '#0f172a';

    wrapper.style.padding =
        '45px';

    wrapper.style.boxSizing =
        'border-box';

    wrapper.style.fontFamily =
        'Arial, Helvetica, sans-serif';

    wrapper.style.color =
        '#f8fafc';


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
    // Cell map
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


            if (!cellMap[day]) {
                return;
            }


            // ------------------------------------------------
            // Long Lab
            // ------------------------------------------------

            if (
                isTwoSlotLab(
                    cls
                )
            ) {

                if (
                    cellMap[day][
                        '11:30-01:00'
                    ]
                ) {

                    cellMap[day][
                        '11:30-01:00'
                    ].push({

                        cls,

                        spanning:
                            true,

                        colspan:
                            2

                    });

                }


                return;

            }


            const slot =
                getClassTimeSlot(
                    cls
                );


            if (
                cellMap[day][slot]
            ) {

                cellMap[day][slot].push({

                    cls,

                    spanning:
                        false,

                    colspan:
                        1

                });

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
                    rgba(0,0,0,.35);
            "
        >

            <div
                style="
                    padding:40px 45px 32px;
                    background:
                        linear-gradient(
                            135deg,
                            #0f172a 0%,
                            #172554 55%,
                            #312e81 100%
                        );
                    color:#ffffff;
                "
            >

                <div
                    style="
                        font-size:14px;
                        letter-spacing:2px;
                        font-weight:800;
                        opacity:.75;
                        margin-bottom:9px;
                    "
                >
                    DAFFODIL INTERNATIONAL UNIVERSITY
                </div>


                <div
                    style="
                        font-size:30px;
                        font-weight:900;
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
                            background:#1d4ed8;
                            padding:9px 16px;
                            border-radius:999px;
                            font-size:14px;
                            font-weight:800;
                        "
                    >
                        Section:
                        ${escapeHtml(section)}
                    </span>


                    <span
                        style="
                            background:#6d28d9;
                            padding:9px 16px;
                            border-radius:999px;
                            font-size:14px;
                            font-weight:800;
                        "
                    >
                        ${escapeHtml(semester)}
                    </span>


                    <span
                        style="
                            background:#334155;
                            padding:9px 16px;
                            border-radius:999px;
                            font-size:14px;
                            font-weight:800;
                        "
                    >
                        Version v${escapeHtml(version)}
                    </span>

                </div>

            </div>


            <div
                style="
                    padding:28px;
                    background:#f8fafc;
                "
            >

                <table
                    style="
                        width:100%;
                        border-collapse:separate;
                        border-spacing:0;
                        table-layout:fixed;
                        font-size:13px;
                        overflow:hidden;
                        border-radius:14px;
                    "
                >

                    <thead>

                        <tr>

                            <th
                                style="
                                    width:125px;
                                    background:#0f172a;
                                    color:#ffffff;
                                    padding:16px 8px;
                                    text-align:center;
                                    border:1px solid #1e293b;
                                    font-size:12px;
                                "
                            >
                                DAY
                            </th>


                            ${DISPLAY_TIME_SLOTS.map(
                                slot =>
                                    `

                                    <th
                                        style="
                                            background:#0f172a;
                                            color:#ffffff;
                                            padding:16px 6px;
                                            text-align:center;
                                            border-left:1px solid #334155;
                                            font-size:11px;
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
                            day => {

                                let cells =
                                    '';

                                let i =
                                    0;


                                while (
                                    i <
                                    DISPLAY_TIME_SLOTS.length
                                ) {

                                    const slot =
                                        DISPLAY_TIME_SLOTS[
                                            i
                                        ];


                                    const entries =
                                        cellMap[day][slot] ||
                                        [];


                                    // ------------------------------------------------
                                    // Empty cell
                                    // ------------------------------------------------

                                    if (
                                        !entries.length
                                    ) {

                                        cells += `

                                            <td
                                                style="
                                                    background:#ffffff;
                                                    text-align:center;
                                                    vertical-align:middle;
                                                    padding:12px 6px;
                                                    border-right:1px solid #cbd5e1;
                                                    border-bottom:1px solid #cbd5e1;
                                                    color:#94a3b8;
                                                    height:100px;
                                                "
                                            >
                                                —
                                            </td>

                                        `;


                                        i++;

                                        continue;

                                    }


                                    // ------------------------------------------------
                                    // Entries
                                    // ------------------------------------------------

                                    let colspan =
                                        1;


                                    let content =
                                        '';


                                    entries.forEach(
                                        entry => {

                                            const cls =
                                                entry.cls;


                                            const isLab =
                                                normalizeClassType(
                                                    cls.type
                                                ) === 'Lab';


                                            const comment =
                                                getDisplayComment(
                                                    cls,
                                                    currentMode !== 'section',
                                                    currentMode
                                                );


                                            const link =
                                                getRoutineLink(
                                                    cls
                                                );


                                            if (
                                                entry.spanning
                                            ) {

                                                colspan =
                                                    2;

                                            }


                                            content += `

                                                <div
                                                    style="
                                                        background:${
                                                            isLab
                                                                ? '#3b176d'
                                                                : '#123b70'
                                                        };
                                                        border:1px solid ${
                                                            isLab
                                                                ? '#8b5cf6'
                                                                : '#3b82f6'
                                                        };
                                                        border-radius:12px;
                                                        padding:10px;
                                                        margin-bottom:6px;
                                                        color:#f8fafc;
                                                    "
                                                >

                                                    <div
                                                        style="
                                                            font-size:14px;
                                                            font-weight:900;
                                                            color:#ffffff;
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
                                                                            font-weight:800;
                                                                            color:#cbd5e1;
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
                                                            margin-top:5px;
                                                            font-size:11px;
                                                            font-weight:700;
                                                            color:#e2e8f0;
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
                                                            color:#cbd5e1;
                                                        "
                                                    >
                                                        ${escapeHtml(
                                                            cls.room ||
                                                            'TBA'
                                                        )}
                                                    </div>


                                                    <div
                                                        style="
                                                            margin-top:6px;
                                                            display:inline-block;
                                                            font-size:9px;
                                                            font-weight:900;
                                                            padding:3px 8px;
                                                            border-radius:999px;
                                                            background:${
                                                                isLab
                                                                    ? '#6d28d9'
                                                                    : '#1d4ed8'
                                                            };
                                                            color:#ffffff;
                                                        "
                                                    >
                                                        ${
                                                            isLab
                                                                ? 'LAB'
                                                                : 'THEORY'
                                                        }
                                                    </div>


                                                    ${
                                                        entry.spanning
                                                            ? `
                                                                <div
                                                                    style="
                                                                        margin-top:5px;
                                                                        font-size:9px;
                                                                        font-weight:700;
                                                                        color:#ddd6fe;
                                                                    "
                                                                >
                                                                    11:30-02:30 · 2 SLOT LAB
                                                                </div>
                                                              `
                                                            : ''
                                                    }


                                                    ${
                                                        link
                                                            ? `
                                                                <div
                                                                    style="
                                                                        margin-top:6px;
                                                                        font-size:9px;
                                                                        font-weight:700;
                                                                        color:#bfdbfe;
                                                                    "
                                                                >
                                                                    Routine link available
                                                                </div>
                                                              `
                                                            : ''
                                                    }

                                                </div>

                                            `;

                                        }
                                    );


                                    cells += `

                                        <td
                                            colspan="${colspan}"
                                            style="
                                                background:#ffffff;
                                                vertical-align:top;
                                                padding:8px;
                                                border-right:1px solid #cbd5e1;
                                                border-bottom:1px solid #cbd5e1;
                                                height:100px;
                                            "
                                        >
                                            ${content}
                                        </td>

                                    `;


                                    i +=
                                        colspan;

                                }


                                return `

                                    <tr>

                                        <td
                                            style="
                                                background:#e2e8f0;
                                                color:#0f172a;
                                                font-weight:900;
                                                font-size:14px;
                                                padding:18px 8px;
                                                text-align:center;
                                                border-left:1px solid #cbd5e1;
                                                border-bottom:1px solid #cbd5e1;
                                                border-right:1px solid #cbd5e1;
                                            "
                                        >
                                            ${day}
                                        </td>

                                        ${cells}

                                    </tr>

                                `;

                            }
                        ).join('')}

                    </tbody>

                </table>


                <div
                    style="
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                        margin-top:22px;
                        padding-top:18px;
                        border-top:1px solid #cbd5e1;
                        font-size:11px;
                        color:#475569;
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


    if (savedChip) {

        savedChip.style.display =
            'none';

    }


    if (sectionInput) {

        sectionInput.value =
            '';

    }


    showMessage(
        'Saved search cleared.',
        'info'
    );


    if (
        currentMode ===
        'section'
    ) {

        loadRoutineData();

    }

}


// ============================================================
// NO ROUTINE
// ============================================================

function showNoRoutine(
    title,
    msg
) {

    if (!routineContainer) {
        return;
    }


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
// ESCAPE ATTRIBUTE
// ============================================================

function escapeAttribute(
    value
) {

    return String(
        value || ''
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
            /'/g,
            '&#39;'
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


        if (
            currentMode ===
            'empty-room'
        ) {

            loadEmptyRooms();

            return;

        }


        if (!saved) {

            return;

        }


        if (
            currentMode ===
            'section'
        ) {

            loadSection(
                saved
            );

        }


        else if (
            currentMode ===
            'teacher'
        ) {

            loadTeacher(
                saved
            );

        }


        else if (
            currentMode ===
            'room'
        ) {

            loadRoom(
                saved
            );

        }

    },
    5 * 60 * 1000
);


// ============================================================
// GLOBAL FUNCTIONS
// ============================================================

window.downloadSection =
    downloadSection;

window.setView =
    function (view) {

        if (
            view === 'day'
        ) {

            renderDayView(
                currentClasses,
                currentMode !== 'section',
                currentMode
            );

        }

        else if (
            view === 'week'
        ) {

            renderWeekView(
                currentClasses,
                currentMode !== 'section',
                currentMode
            );

        }

    };

window.setMode =
    setMode;

window.changeSection =
    loadSection;

window.performSearch =
    handleSearch;

window.toggleSearch =
    function () {

        const input =
            document.getElementById(
                'sectionInput'
            );

        if (input) {

            input.focus();

        }

    };

window.clearSavedRoutine =
    handleClearSection;

window.showEmptyRooms =
    loadEmptyRooms;
