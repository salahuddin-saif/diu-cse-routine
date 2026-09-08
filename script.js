/* =========================================================
   DIU CSE ROUTINE
   FULL UPDATED SCRIPT
   ========================================================= */

const DAYS = [
    'Saturday',
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday'
];


/* =========================================================
   STANDARD TIME SLOTS
   ========================================================= */

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


/* =========================================================
   GLOBAL STATE
   ========================================================= */

let routineData = null;

let currentMode = 'section';
let currentQuery = '';
let currentView = 'day';
let currentSection = '';
let currentSemester = 'Summer 2026';

let autoRefreshTimer = null;


/* =========================================================
   BASIC HELPERS
   ========================================================= */

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
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ');
}


function normalizeDay(day) {
    if (!day) return '';

    const value = String(day)
        .trim()
        .toLowerCase();

    const map = {
        saturday: 'Saturday',
        sunday: 'Sunday',
        monday: 'Monday',
        tuesday: 'Tuesday',
        wednesday: 'Wednesday',
        thursday: 'Thursday',
        friday: 'Friday',

        sat: 'Saturday',
        sun: 'Sunday',
        mon: 'Monday',
        tue: 'Tuesday',
        tues: 'Tuesday',
        wed: 'Wednesday',
        thu: 'Thursday',
        thur: 'Thursday',
        thurs: 'Thursday',
        fri: 'Friday'
    };

    return map[value] || normalizeText(day);
}


function normalizeTime(time) {
    if (!time) return '';

    return String(time)
        .trim()
        .replace(/\s+/g, '')
        .replace(/[–—]/g, '-');
}


/* =========================================================
   TIME HELPERS
   ========================================================= */

function getTimeStartMinutes(time) {
    const normalized =
        normalizeTime(time);

    const match = normalized.match(
        /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/
    );

    if (!match) {
        return 99999;
    }

    const hour =
        parseInt(match[1], 10);

    const minute =
        parseInt(match[2], 10);

    return (
        hour * 60 +
        minute
    );
}


function getTimeOrder(time) {
    const normalized =
        normalizeTime(time);

    /*
       IMPORTANT:
       11:30-02:30 is a two-slot LAB.

       It starts at:
       11:30-01:00

       Therefore it must be sorted at slot 3.
    */

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


function getClassTimeSlot(cls) {
    return normalizeTime(
        cls?.time ||
        cls?.timeslot ||
        cls?.time_slot ||
        cls?.slot ||
        ''
    );
}


function getSlotIndex(slot) {
    return DISPLAY_TIME_SLOTS.indexOf(
        normalizeTime(slot)
    );
}


/* =========================================================
   LAB HELPERS
   ========================================================= */

function isTwoSlotLab(cls) {
    if (!cls) {
        return false;
    }

    const type =
        normalizeClassType(
            cls.type
        );

    const time =
        getClassTimeSlot(cls);

    return (
        type === 'Lab' &&
        time === '11:30-02:30'
    );
}


function getLabSpanInfo(cls) {
    if (
        !isTwoSlotLab(cls)
    ) {
        return null;
    }

    return {
        startSlot:
            '11:30-01:00',

        endSlot:
            '01:00-02:30',

        colspan: 2,

        startIndex:
            getSlotIndex(
                '11:30-01:00'
            )
    };
}


/* =========================================================
   CLASS FIELD HELPERS
   ========================================================= */

function normalizeClassType(type) {
    const value =
        String(type || '')
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

    return type || '';
}


function getCourseCode(cls) {
    return normalizeText(
        cls?.course_code ||
        cls?.courseCode ||
        cls?.code ||
        cls?.course ||
        ''
    );
}


function getCourseName(cls) {
    return normalizeText(
        cls?.course_name ||
        cls?.courseName ||
        cls?.name ||
        cls?.title ||
        ''
    );
}


function getTeacher(cls) {
    return normalizeText(
        cls?.teacher ||
        cls?.teacher_name ||
        cls?.teacherName ||
        cls?.faculty ||
        ''
    );
}


function getRoom(cls) {
    return normalizeText(
        cls?.room ||
        cls?.room_no ||
        cls?.roomNo ||
        cls?.location ||
        ''
    );
}


function getComment(cls) {
    return normalizeText(
        cls?.comment ||
        cls?.remarks ||
        cls?.note ||
        ''
    );
}


function getSubsection(cls) {
    return normalizeText(
        cls?.subsection ||
        cls?.sub_section ||
        cls?.section ||
        cls?.lab_section ||
        ''
    );
}


/* =========================================================
   SUBSECTION DISPLAY
   ========================================================= */

function getDisplaySubsection(cls) {
    const subsection =
        getSubsection(cls);

    if (!subsection) {
        return '';
    }

    const type =
        normalizeClassType(
            cls.type
        );

    /*
       Main section:
       N -> hidden

       Lab:
       N1 -> (N1)
       N2 -> (N2)
    */

    if (
        subsection.toUpperCase() ===
        'N'
    ) {
        return '';
    }

    if (
        currentSection &&
        subsection.toUpperCase() ===
        currentSection.toUpperCase()
    ) {
        return '';
    }

    if (
        type === 'Lab' &&
        !subsection.startsWith('(')
    ) {
        return `(${subsection})`;
    }

    return subsection.startsWith('(')
        ? subsection
        : `(${subsection})`;
}


/* =========================================================
   SORTING
   ========================================================= */

function sortClasses(classes) {
    return [...classes].sort(
        (a, b) => {

            const dayA =
                DAYS.indexOf(
                    normalizeDay(
                        a.day
                    )
                );

            const dayB =
                DAYS.indexOf(
                    normalizeDay(
                        b.day
                    )
                );

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

            return getCourseCode(a)
                .localeCompare(
                    getCourseCode(b)
                );
        }
    );
}


/* =========================================================
   LOAD DATA
   ========================================================= */

async function loadRoutineData() {
    try {

        const response =
            await fetch(
                `data/routine.json?t=${Date.now()}`,
                {
                    cache: 'no-store'
                }
            );

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}`
            );
        }

        routineData =
            await response.json();

        currentSemester =
            routineData?.semester ||
            routineData?.metadata?.semester ||
            getSemester();

        initializeUI();

        startAutoRefresh();

    } catch (error) {

        console.error(
            'Failed to load routine data:',
            error
        );

        showError(
            'Routine data could not be loaded. Please refresh the page.'
        );
    }
}


/* =========================================================
   SEMESTER
   ========================================================= */

function getSemester() {

    if (!routineData) {
        return 'Summer 2026';
    }

    return (
        routineData.semester ||
        routineData.metadata?.semester ||
        routineData.version_name ||
        'Summer 2026'
    );
}


/* =========================================================
   GET ALL CLASSES
   ========================================================= */

function getAllClasses() {

    if (!routineData) {
        return [];
    }

    if (
        Array.isArray(
            routineData.classes
        )
    ) {
        return routineData.classes;
    }

    const sections =
        routineData.sections;

    if (!sections) {
        return [];
    }

    const allClasses = [];

    if (
        Array.isArray(sections)
    ) {

        sections.forEach(
            section => {

                if (
                    Array.isArray(
                        section.classes
                    )
                ) {

                    section.classes.forEach(
                        cls => {

                            allClasses.push({
                                ...cls,

                                section:
                                    cls.section ||
                                    section.section ||
                                    section.name
                            });

                        }
                    );
                }
            }
        );

        return allClasses;
    }


    if (
        typeof sections ===
        'object'
    ) {

        Object.entries(
            sections
        ).forEach(
            ([sectionName, sectionData]) => {

                if (
                    Array.isArray(
                        sectionData
                    )
                ) {

                    sectionData.forEach(
                        cls => {

                            allClasses.push({
                                ...cls,

                                section:
                                    cls.section ||
                                    sectionName
                            });

                        }
                    );

                } else if (
                    Array.isArray(
                        sectionData?.classes
                    )
                ) {

                    sectionData.classes.forEach(
                        cls => {

                            allClasses.push({
                                ...cls,

                                section:
                                    cls.section ||
                                    sectionName
                            });

                        }
                    );
                }
            }
        );
    }

    return allClasses;
}


/* =========================================================
   GET SECTIONS
   ========================================================= */

function getSections() {

    if (!routineData) {
        return [];
    }

    const sections =
        routineData.sections;

    if (
        Array.isArray(sections)
    ) {

        return sections
            .map(
                s =>
                    typeof s ===
                    'string'
                        ? s
                        : s.section ||
                          s.name ||
                          ''
            )
            .filter(Boolean)
            .sort();
    }


    if (
        sections &&
        typeof sections ===
        'object'
    ) {

        return Object.keys(
            sections
        )
            .filter(Boolean)
            .sort();
    }


    return [
        ...new Set(
            getAllClasses()
                .map(
                    cls =>
                        cls.section
                )
                .filter(Boolean)
        )
    ].sort();
}


/* =========================================================
   FILTER
   ========================================================= */

function filterClasses() {

    let classes =
        getAllClasses();

    const query =
        normalizeText(
            currentQuery
        ).toLowerCase();

    if (!query) {
        return classes;
    }


    if (
        currentMode ===
        'section'
    ) {

        classes =
            classes.filter(
                cls =>
                    normalizeText(
                        cls.section
                    ).toLowerCase() ===
                    query
            );
    }


    else if (
        currentMode ===
        'teacher'
    ) {

        classes =
            classes.filter(
                cls =>
                    getTeacher(cls)
                        .toLowerCase()
                        .includes(query)
            );
    }


    else if (
        currentMode ===
        'room'
    ) {

        classes =
            classes.filter(
                cls =>
                    getRoom(cls)
                        .toLowerCase()
                        .includes(query)
            );
    }

    return classes;
}


/* =========================================================
   INITIALIZE
   ========================================================= */

function initializeUI() {

    populateSectionSelect();

    const savedSection =
        localStorage.getItem(
            'diuCseSelectedSection'
        );

    const sections =
        getSections();


    if (
        savedSection &&
        sections.includes(
            savedSection
        )
    ) {

        currentSection =
            savedSection;

        currentMode =
            'section';

        currentQuery =
            savedSection;

    } else if (
        sections.length
    ) {

        currentSection =
            sections[0];

        currentMode =
            'section';

        currentQuery =
            currentSection;
    }


    updateInputValue();

    renderRoutine();
}


/* =========================================================
   SECTION SELECT
   ========================================================= */

function populateSectionSelect() {

    const select =
        document.getElementById(
            'sectionSelect'
        );

    if (!select) {
        return;
    }

    const sections =
        getSections();

    select.innerHTML =
        sections
            .map(
                section => `
                    <option value="${escapeHtml(section)}">
                        ${escapeHtml(section)}
                    </option>
                `
            )
            .join('');


    if (
        currentSection &&
        sections.includes(
            currentSection
        )
    ) {

        select.value =
            currentSection;
    }
}


/* =========================================================
   INPUT
   ========================================================= */

function updateInputValue() {

    const input =
        document.getElementById(
            'sectionInput'
        ) ||
        document.getElementById(
            'searchInput'
        );

    if (!input) {
        return;
    }

    input.value =
        currentMode ===
        'section'
            ? currentSection
            : currentQuery;
}


/* =========================================================
   MODE
   ========================================================= */

function setMode(mode) {

    currentMode =
        mode;

    const input =
        document.getElementById(
            'sectionInput'
        ) ||
        document.getElementById(
            'searchInput'
        );

    if (input) {

        input.value =
            mode === 'section'
                ? currentSection
                : '';
    }

    currentQuery =
        mode === 'section'
            ? currentSection
            : '';

    renderRoutine();
}


/* =========================================================
   SEARCH
   ========================================================= */

function performSearch() {

    const input =
        document.getElementById(
            'sectionInput'
        ) ||
        document.getElementById(
            'searchInput'
        );

    if (!input) {
        return;
    }

    currentQuery =
        normalizeText(
            input.value
        );


    if (
        currentMode ===
        'section'
    ) {

        currentSection =
            currentQuery;

        localStorage.setItem(
            'diuCseSelectedSection',
            currentSection
        );
    }

    renderRoutine();
}


/* =========================================================
   SECTION CHANGE
   ========================================================= */

function changeSection(value) {

    currentSection =
        value;

    currentMode =
        'section';

    currentQuery =
        value;

    localStorage.setItem(
        'diuCseSelectedSection',
        value
    );

    updateInputValue();

    renderRoutine();
}


/* =========================================================
   VIEW
   ========================================================= */

function setView(view) {

    currentView =
        view;

    document
        .querySelectorAll(
            '[data-view]'
        )
        .forEach(
            button => {

                button.classList.toggle(
                    'active',
                    button.dataset.view ===
                    view
                );
            }
        );

    renderRoutine();
}


/* =========================================================
   MAIN RENDER
   ========================================================= */

function renderRoutine() {

    const classes =
        sortClasses(
            filterClasses()
        );

    const container =
        document.getElementById(
            'viewContent'
        );

    if (!container) {
        return;
    }

    const showComment =
        shouldShowComment();


    if (!classes.length) {

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📚</div>

                <h3>
                    No routine found
                </h3>

                <p>
                    No class was found for the selected
                    ${escapeHtml(currentMode)}.
                </p>
            </div>
        `;

        updateHeader();

        return;
    }


    if (
        currentView ===
        'week'
    ) {

        renderWeekView(
            classes,
            showComment,
            currentMode
        );

    } else {

        renderDayView(
            classes,
            showComment,
            currentMode
        );
    }

    updateHeader();
}


/* =========================================================
   COMMENT
   ========================================================= */

function shouldShowComment() {
    return true;
}


/* =========================================================
   HEADER
   ========================================================= */

function updateHeader() {

    const title =
        document.getElementById(
            'routineTitle'
        );

    if (!title) {
        return;
    }


    if (
        currentMode ===
        'section'
    ) {

        title.textContent =
            currentSection
                ? `Section ${currentSection}`
                : 'DIU CSE Routine';

    }

    else if (
        currentMode ===
        'teacher'
    ) {

        title.textContent =
            currentQuery
                ? `Teacher: ${currentQuery}`
                : 'Teacher Routine';

    }

    else if (
        currentMode ===
        'room'
    ) {

        title.textContent =
            currentQuery
                ? `Room: ${currentQuery}`
                : 'Room Routine';
    }
}


/* =========================================================
   CLASS CARD
   ========================================================= */

function createClassCard(
    cls,
    showComment = true,
    mode = 'section'
) {

    const type =
        normalizeClassType(
            cls.type
        );

    const code =
        getCourseCode(cls);

    const name =
        getCourseName(cls);

    const teacher =
        getTeacher(cls);

    const room =
        getRoom(cls);

    const time =
        getClassTimeSlot(cls);

    const subsection =
        getDisplaySubsection(cls);

    const comment =
        getComment(cls);


    let html = `
        <div class="routine-class ${
            type === 'Lab'
                ? 'lab-class'
                : 'theory-class'
        }">
    `;


    if (code) {

        html += `
            <div class="course-code">
                ${escapeHtml(code)}
            </div>
        `;
    }


    if (name) {

        html += `
            <div class="course-name">
                ${escapeHtml(name)}
            </div>
        `;
    }


    if (type) {

        html += `
            <div class="class-type">
                ${escapeHtml(type)}
            </div>
        `;
    }


    if (subsection) {

        html += `
            <span class="subsection">
                ${escapeHtml(subsection)}
            </span>
        `;
    }


    if (
        mode !== 'teacher' &&
        teacher
    ) {

        html += `
            <div class="teacher">
                ${escapeHtml(teacher)}
            </div>
        `;
    }


    if (
        mode !== 'room' &&
        room
    ) {

        html += `
            <div class="room">
                Room: ${escapeHtml(room)}
            </div>
        `;
    }


    if (time) {

        html += `
            <div class="class-time">
                ${escapeHtml(time)}
            </div>
        `;
    }


    if (
        showComment &&
        comment
    ) {

        html += `
            <div class="comment">
                ${escapeHtml(comment)}
            </div>
        `;
    }


    html += `
        </div>
    `;

    return html;
}


/* =========================================================
   DAY VIEW
   ========================================================= */

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

            if (!grouped[day]) {
                grouped[day] = [];
            }

            grouped[day].push(
                cls
            );
        }
    );


    let html = '';


    DAYS.forEach(
        day => {

            const dayClasses =
                sortClasses(
                    grouped[day] || []
                );

            if (
                !dayClasses.length
            ) {
                return;
            }


            html += `
                <section class="day-section">

                    <div class="day-heading">
                        ${escapeHtml(day)}
                    </div>

                    <div class="day-routine">
            `;


            dayClasses.forEach(
                cls => {

                    html +=
                        createClassCard(
                            cls,
                            showComment,
                            mode
                        );
                }
            );


            html += `
                    </div>

                </section>
            `;
        }
    );


    container.innerHTML =
        html;
}


/* =========================================================
   WEEK VIEW
   ========================================================= */

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

            if (!grouped[day]) {
                grouped[day] = [];
            }

            grouped[day].push(
                cls
            );
        }
    );


    /*
       Track cells already occupied by rowspan.
    */

    const occupied = {};

    DAYS.forEach(
        day => {
            occupied[day] = {};
        }
    );


    let html = `
        <div class="week-table-wrapper">

            <table class="week-table">

                <thead>

                    <tr>

                        <th class="time-col">
                            Time
                        </th>
    `;


    DAYS.forEach(
        day => {

            html += `
                <th>
                    ${escapeHtml(day)}
                </th>
            `;
        }
    );


    html += `
                    </tr>

                </thead>

                <tbody>
    `;


    /*
       ONLY 6 standard rows.
    */

    for (
        let slotIndex = 0;
        slotIndex <
        DISPLAY_TIME_SLOTS.length;
        slotIndex++
    ) {

        const slot =
            DISPLAY_TIME_SLOTS[
                slotIndex
            ];


        html += `
            <tr>

                <td class="time-col">
                    ${escapeHtml(slot)}
                </td>
        `;


        for (
            const day of DAYS
        ) {

            /*
               This slot is already occupied
               by a previous rowspan.
            */

            if (
                occupied[day][
                    slotIndex
                ]
            ) {
                continue;
            }


            const dayClasses =
                sortClasses(
                    grouped[day] || []
                );


            /*
               Find two-slot LAB.
            */

            const spanningLab =
                slot ===
                '11:30-01:00'
                    ? dayClasses.find(
                        cls =>
                            isTwoSlotLab(
                                cls
                            )
                    )
                    : null;


            if (spanningLab) {

                /*
                   Occupy second slot.
                */

                if (
                    slotIndex + 1 <
                    DISPLAY_TIME_SLOTS.length
                ) {

                    occupied[day][
                        slotIndex + 1
                    ] = true;
                }


                html += `
                    <td
                        class="routine-cell lab-cell"
                        rowspan="2"
                    >
                        ${createClassCard(
                            spanningLab,
                            showComment,
                            mode
                        )}
                    </td>
                `;

                continue;
            }


            /*
               Normal classes.
            */

            const normalClasses =
                dayClasses.filter(
                    cls => {

                        const classTime =
                            getClassTimeSlot(
                                cls
                            );

                        return (
                            classTime ===
                                slot &&
                            !isTwoSlotLab(
                                cls
                            )
                        );
                    }
                );


            if (
                normalClasses.length
            ) {

                html += `
                    <td class="routine-cell">
                `;


                normalClasses.forEach(
                    cls => {

                        html +=
                            createClassCard(
                                cls,
                                showComment,
                                mode
                            );
                    }
                );


                html += `
                    </td>
                `;

            } else {

                html += `
                    <td class="routine-cell empty-cell">
                        —
                    </td>
                `;
            }
        }


        html += `
            </tr>
        `;
    }


    html += `
                </tbody>

            </table>

        </div>
    `;


    container.innerHTML =
        html;
}


/* =========================================================
   DOWNLOAD ROUTINE
   ========================================================= */

async function downloadSection() {

    const classes =
        sortClasses(
            filterClasses()
        );


    if (!classes.length) {

        alert(
            'No routine available to download.'
        );

        return;
    }


    /*
       Load html2canvas.
    */

    if (
        typeof html2canvas ===
        'undefined'
    ) {

        await loadHtml2Canvas();
    }


    const card =
        createRoutineDownloadCard(
            classes,
            currentMode
        );


    document.body.appendChild(
        card
    );


    try {

        const canvas =
            await html2canvas(
                card,
                {
                    /*
                       Dark background.
                    */

                    backgroundColor:
                        '#0f172a',

                    scale: 2,

                    useCORS: true,

                    logging: false,

                    /*
                       Better text rendering.
                    */

                    letterRendering: true
                }
            );


        const link =
            document.createElement(
                'a'
            );


        const sectionName =
            currentSection ||
            currentQuery ||
            'routine';


        const safeName =
            sectionName
                .replace(
                    /[^a-zA-Z0-9_-]+/g,
                    '_'
                );


        link.download =
            `DIU_CSE_Routine_${safeName}.png`;


        link.href =
            canvas.toDataURL(
                'image/png'
            );


        link.click();

    } catch (error) {

        console.error(
            'Routine download failed:',
            error
        );

        alert(
            'Could not generate routine image.'
        );

    } finally {

        card.remove();
    }
}


/* =========================================================
   HTML2CANVAS LOADER
   ========================================================= */

function loadHtml2Canvas() {

    return new Promise(
        (resolve, reject) => {

            const existing =
                document.querySelector(
                    'script[data-html2canvas]'
                );


            if (existing) {

                existing.addEventListener(
                    'load',
                    resolve
                );

                existing.addEventListener(
                    'error',
                    reject
                );

                return;
            }


            const script =
                document.createElement(
                    'script'
                );


            script.src =
                'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';


            script.dataset.html2canvas =
                'true';


            script.onload =
                resolve;

            script.onerror =
                reject;


            document.head.appendChild(
                script
            );
        }
    );
}


/* =========================================================
   DOWNLOAD IMAGE CARD
   ========================================================= */

function createRoutineDownloadCard(
    classes,
    mode
) {

    const wrapper =
        document.createElement(
            'div'
        );


    /*
       MAIN DOWNLOAD IMAGE
       Dark premium UI.
    */

    wrapper.style.position =
        'fixed';

    wrapper.style.left =
        '-100000px';

    wrapper.style.top =
        '0';

    wrapper.style.width =
        '1600px';

    wrapper.style.padding =
        '45px';

    wrapper.style.boxSizing =
        'border-box';

    wrapper.style.background =
        '#0f172a';

    wrapper.style.color =
        '#f8fafc';

    wrapper.style.fontFamily =
        'Arial, Helvetica, sans-serif';


    /*
       Group by day.
    */

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

            if (!grouped[day]) {
                grouped[day] = [];
            }

            grouped[day].push(
                cls
            );
        }
    );


    /*
       Cell map.
    */

    const cellMap = {};


    DAYS.forEach(
        day => {

            cellMap[day] = {};

            DISPLAY_TIME_SLOTS.forEach(
                slot => {

                    cellMap[day][
                        slot
                    ] = [];
                }
            );
        }
    );


    /*
       Put classes into standard slots.
    */

    classes.forEach(
        cls => {

            const day =
                normalizeDay(
                    cls.day
                );

            if (!cellMap[day]) {
                return;
            }


            const time =
                getClassTimeSlot(
                    cls
                );


            /*
               Two-slot LAB:
               11:30-02:30
               becomes:
               11:30-01:00 + 01:00-02:30
            */

            if (
                isTwoSlotLab(cls)
            ) {

                cellMap[day][
                    '11:30-01:00'
                ].push({
                    class: cls,
                    colspan: 2,
                    spanning: true
                });

                return;
            }


            /*
               Normal class.
            */

            if (
                cellMap[day][time]
            ) {

                cellMap[day][time].push({
                    class: cls,
                    colspan: 1,
                    spanning: false
                });
            }
        }
    );


    /* =====================================================
       IMAGE HEADER
       ===================================================== */

    let html = `

        <div
            style="
                margin-bottom:28px;
                padding:25px 28px;
                border-radius:18px;
                background:#172554;
                border:1px solid #334155;
                box-shadow:0 8px 30px rgba(0,0,0,.25);
            "
        >

            <div
                style="
                    font-size:31px;
                    line-height:1.2;
                    font-weight:800;
                    color:#f8fafc;
                    letter-spacing:.3px;
                "
            >
                DAFFODIL INTERNATIONAL UNIVERSITY
            </div>


            <div
                style="
                    margin-top:8px;
                    font-size:23px;
                    font-weight:700;
                    color:#60a5fa;
                "
            >
                DIU CSE ROUTINE
            </div>


            <div
                style="
                    margin-top:14px;
                    font-size:17px;
                    color:#cbd5e1;
                "
            >
    `;


    if (
        mode === 'section'
    ) {

        html += `
            Section:
            <strong
                style="
                    color:#ffffff;
                "
            >
                ${escapeHtml(
                    currentSection
                )}
            </strong>
        `;

    } else {

        html += `
            ${escapeHtml(
                currentMode
            )}:
            <strong
                style="
                    color:#ffffff;
                "
            >
                ${escapeHtml(
                    currentQuery
                )}
            </strong>
        `;
    }


    html += `

                <span
                    style="
                        color:#64748b;
                        padding:0 10px;
                    "
                >
                    |
                </span>

                Semester:
                <strong
                    style="
                        color:#ffffff;
                    "
                >
                    ${escapeHtml(
                        getSemester()
                    )}
                </strong>

            </div>

        </div>
    `;


    /* =====================================================
       LEGEND
       ===================================================== */

    html += `

        <div
            style="
                display:flex;
                gap:12px;
                margin-bottom:18px;
                font-size:12px;
            "
        >

            <div
                style="
                    padding:7px 13px;
                    border-radius:20px;
                    background:#1e3a8a;
                    color:#bfdbfe;
                    border:1px solid #3b82f6;
                    font-weight:700;
                "
            >
                THEORY
            </div>


            <div
                style="
                    padding:7px 13px;
                    border-radius:20px;
                    background:#4c1d95;
                    color:#ddd6fe;
                    border:1px solid #8b5cf6;
                    font-weight:700;
                "
            >
                LAB
            </div>

        </div>
    `;


    /* =====================================================
       TABLE
       ===================================================== */

    html += `

        <table
            style="
                width:100%;
                border-collapse:separate;
                border-spacing:0;
                table-layout:fixed;
                overflow:hidden;
                border-radius:16px;
                background:#111827;
                border:1px solid #334155;
            "
        >

            <thead>

                <tr>

                    <th
                        style="
                            width:125px;
                            padding:15px 10px;
                            border-right:1px solid #334155;
                            border-bottom:1px solid #475569;
                            background:#1e293b;
                            color:#f8fafc;
                            font-size:14px;
                            font-weight:800;
                        "
                    >
                        DAY
                    </th>
    `;


    /*
       Only 6 standard time columns.
    */

    DISPLAY_TIME_SLOTS.forEach(
        slot => {

            html += `
                <th
                    style="
                        padding:15px 8px;
                        border-right:1px solid #334155;
                        border-bottom:1px solid #475569;
                        background:#1e293b;
                        color:#bfdbfe;
                        font-size:13px;
                        font-weight:800;
                        text-align:center;
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


    /* =====================================================
       TABLE ROWS
       ===================================================== */

    DAYS.forEach(
        (day, dayIndex) => {

            html += `
                <tr>
            `;


            /*
               Day cell.
            */

            const dayBackground =
                dayIndex % 2 === 0
                    ? '#172033'
                    : '#141c2e';


            html += `
                <td
                    style="
                        padding:14px 8px;
                        border-right:1px solid #334155;
                        border-bottom:1px solid #334155;
                        background:${dayBackground};
                        color:#e2e8f0;
                        text-align:center;
                        vertical-align:middle;
                        font-size:14px;
                        font-weight:800;
                    "
                >
                    ${escapeHtml(day)}
                </td>
            `;


            const dayMap =
                cellMap[day];


            /*
               Loop through 6 slots.
            */

            for (
                let i = 0;
                i <
                DISPLAY_TIME_SLOTS.length;
                i++
            ) {

                const slot =
                    DISPLAY_TIME_SLOTS[i];


                const cells =
                    dayMap[slot] || [];


                /*
                   Find spanning Lab.
                */

                const spanningCell =
                    cells.find(
                        item =>
                            item.spanning ===
                            true
                    );


                if (
                    spanningCell &&
                    spanningCell.colspan === 2
                ) {

                    html += `
                        <td
                            colspan="2"
                            style="
                                padding:10px;
                                border-right:1px solid #334155;
                                border-bottom:1px solid #334155;
                                background:#2e1065;
                                vertical-align:middle;
                                text-align:center;
                            "
                        >
                            ${createDownloadClassHtml(
                                spanningCell.class,
                                mode
                            )}
                        </td>
                    `;


                    /*
                       Skip:
                       01:00-02:30
                    */

                    i += 1;

                    continue;
                }


                /*
                   Normal class cell.
                */

                if (
                    cells.length
                ) {

                    html += `
                        <td
                            style="
                                padding:9px;
                                border-right:1px solid #334155;
                                border-bottom:1px solid #334155;
                                background:#111827;
                                vertical-align:middle;
                                text-align:center;
                            "
                        >
                    `;


                    cells.forEach(
                        (item, index) => {

                            if (
                                index > 0
                            ) {

                                html += `
                                    <div
                                        style="
                                            height:1px;
                                            background:#334155;
                                            margin:9px 0;
                                        "
                                    ></div>
                                `;
                            }


                            html +=
                                createDownloadClassHtml(
                                    item.class,
                                    mode
                                );
                        }
                    );


                    html += `
                        </td>
                    `;

                } else {

                    html += `
                        <td
                            style="
                                padding:14px 8px;
                                border-right:1px solid #334155;
                                border-bottom:1px solid #334155;
                                background:#0f172a;
                                color:#475569;
                                text-align:center;
                                vertical-align:middle;
                                font-size:14px;
                            "
                        >
                            —
                        </td>
                    `;
                }
            }


            html += `
                </tr>
            `;
        }
    );


    html += `

            </tbody>

        </table>


        <div
            style="
                margin-top:18px;
                padding:13px;
                text-align:center;
                font-size:11px;
                color:#64748b;
            "
        >
            Generated from DIU CSE Routine
        </div>

    `;


    wrapper.innerHTML =
        html;


    return wrapper;
}


/* =========================================================
   DOWNLOAD CLASS CARD
   ========================================================= */

function createDownloadClassHtml(
    cls,
    mode
) {

    const type =
        normalizeClassType(
            cls.type
        );

    const code =
        getCourseCode(cls);

    const name =
        getCourseName(cls);

    const teacher =
        getTeacher(cls);

    const room =
        getRoom(cls);

    const time =
        getClassTimeSlot(cls);

    const subsection =
        getDisplaySubsection(cls);

    const comment =
        getComment(cls);


    /*
       THEORY = blue
       LAB = purple
    */

    const isLab =
        type === 'Lab';


    const cardBackground =
        isLab
            ? '#3b176d'
            : '#123b70';


    const cardBorder =
        isLab
            ? '#8b5cf6'
            : '#3b82f6';


    const badgeBackground =
        isLab
            ? '#6d28d9'
            : '#1d4ed8';


    let html = `

        <div
            style="
                padding:11px 10px;
                border-radius:11px;
                background:${cardBackground};
                border:1px solid ${cardBorder};
                color:#f8fafc;
                font-family:Arial,Helvetica,sans-serif;
                text-align:left;
                box-shadow:0 3px 10px rgba(0,0,0,.2);
            "
        >
    `;


    /*
       COURSE CODE
    */

    if (code) {

        html += `
            <div
                style="
                    font-size:15px;
                    line-height:1.2;
                    font-weight:800;
                    color:#ffffff;
                    margin-bottom:5px;
                "
            >
                ${escapeHtml(code)}
            </div>
        `;
    }


    /*
       COURSE NAME
    */

    if (name) {

        html += `
            <div
                style="
                    font-size:12px;
                    line-height:1.35;
                    font-weight:600;
                    color:#e2e8f0;
                    margin-bottom:7px;
                "
            >
                ${escapeHtml(name)}
            </div>
        `;
    }


    /*
       TYPE BADGE
    */

    if (type) {

        html += `
            <span
                style="
                    display:inline-block;
                    padding:3px 7px;
                    border-radius:5px;
                    background:${badgeBackground};
                    color:#ffffff;
                    font-size:9px;
                    font-weight:800;
                    letter-spacing:.4px;
                    margin-bottom:6px;
                "
            >
                ${escapeHtml(
                    type.toUpperCase()
                )}
            </span>
        `;
    }


    /*
       SUBSECTION
    */

    if (subsection) {

        html += `
            <div
                style="
                    font-size:10px;
                    font-weight:700;
                    color:#bfdbfe;
                    margin-bottom:4px;
                "
            >
                ${escapeHtml(
                    subsection
                )}
            </div>
        `;
    }


    /*
       TEACHER
    */

    if (
        mode !== 'teacher' &&
        teacher
    ) {

        html += `
            <div
                style="
                    font-size:10px;
                    line-height:1.3;
                    color:#dbeafe;
                    margin-top:3px;
                "
            >
                👨‍🏫 ${escapeHtml(
                    teacher
                )}
            </div>
        `;
    }


    /*
       ROOM
    */

    if (
        mode !== 'room' &&
        room
    ) {

        html += `
            <div
                style="
                    font-size:10px;
                    line-height:1.3;
                    color:#dbeafe;
                    margin-top:3px;
                "
            >
                📍 ${escapeHtml(
                    room
                )}
            </div>
        `;
    }


    /*
       TIME

       For Lab:
       11:30-02:30

       It is still displayed as the
       original full Lab time.
    */

    if (time) {

        html += `
            <div
                style="
                    margin-top:7px;
                    padding-top:6px;
                    border-top:1px solid rgba(255,255,255,.16);
                    font-size:10px;
                    font-weight:700;
                    color:#ffffff;
                "
            >
                🕐 ${escapeHtml(time)}
            </div>
        `;
    }


    /*
       COMMENT
    */

    if (comment) {

        html += `
            <div
                style="
                    margin-top:5px;
                    font-size:9px;
                    line-height:1.3;
                    color:#cbd5e1;
                "
            >
                ${escapeHtml(
                    comment
                )}
            </div>
        `;
    }


    html += `
        </div>
    `;


    return html;
}


/* =========================================================
   ERROR
   ========================================================= */

function showError(message) {

    const container =
        document.getElementById(
            'viewContent'
        );

    if (!container) {
        return;
    }


    container.innerHTML = `
        <div class="error-state">

            <div class="error-icon">
                ⚠️
            </div>

            <h3>
                Error
            </h3>

            <p>
                ${escapeHtml(message)}
            </p>

        </div>
    `;
}


/* =========================================================
   AUTO REFRESH
   ========================================================= */

function startAutoRefresh() {

    if (
        autoRefreshTimer
    ) {

        clearInterval(
            autoRefreshTimer
        );
    }


    /*
       Every 5 minutes.
    */

    autoRefreshTimer =
        setInterval(
            async () => {

                try {

                    const response =
                        await fetch(
                            `data/routine.json?t=${Date.now()}`,
                            {
                                cache:
                                    'no-store'
                            }
                        );


                    if (
                        !response.ok
                    ) {
                        return;
                    }


                    const newData =
                        await response.json();


                    routineData =
                        newData;


                    currentSemester =
                        getSemester();


                    populateSectionSelect();

                    renderRoutine();

                } catch (error) {

                    console.warn(
                        'Auto refresh failed:',
                        error
                    );
                }

            },
            5 * 60 * 1000
        );
}


/* =========================================================
   CLEAR SAVED ROUTINE
   ========================================================= */

function clearSavedRoutine() {

    localStorage.removeItem(
        'diuCseSelectedSection'
    );


    currentSection =
        '';

    currentQuery =
        '';


    const input =
        document.getElementById(
            'sectionInput'
        ) ||
        document.getElementById(
            'searchInput'
        );


    if (input) {
        input.value = '';
    }


    renderRoutine();
}


/* =========================================================
   SEARCH TOGGLE
   ========================================================= */

function toggleSearch() {

    const searchBox =
        document.getElementById(
            'searchBox'
        );


    if (!searchBox) {
        return;
    }


    searchBox.classList.toggle(
        'active'
    );


    if (
        searchBox.classList.contains(
            'active'
        )
    ) {

        const input =
            searchBox.querySelector(
                'input'
            );


        if (input) {

            setTimeout(
                () =>
                    input.focus(),
                50
            );
        }
    }
}


/* =========================================================
   EVENT LISTENERS
   ========================================================= */

document.addEventListener(
    'DOMContentLoaded',
    () => {

        /*
           SECTION SELECT
        */

        const sectionSelect =
            document.getElementById(
                'sectionSelect'
            );


        if (sectionSelect) {

            sectionSelect.addEventListener(
                'change',
                event => {

                    changeSection(
                        event.target.value
                    );
                }
            );
        }


        /*
           SEARCH INPUT
        */

        const searchInput =
            document.getElementById(
                'sectionInput'
            ) ||
            document.getElementById(
                'searchInput'
            );


        if (searchInput) {

            searchInput.addEventListener(
                'keydown',
                event => {

                    if (
                        event.key ===
                        'Enter'
                    ) {

                        performSearch();
                    }
                }
            );
        }


        /*
           SEARCH BUTTON
        */

        const searchButton =
            document.getElementById(
                'searchButton'
            ) ||
            document.getElementById(
                'searchBtn'
            );


        if (searchButton) {

            searchButton.addEventListener(
                'click',
                performSearch
            );
        }


        /*
           DOWNLOAD BUTTON
        */

        const downloadButton =
            document.getElementById(
                'downloadButton'
            ) ||
            document.getElementById(
                'downloadBtn'
            );


        if (downloadButton) {

            downloadButton.addEventListener(
                'click',
                downloadSection
            );
        }


        /*
           CLEAR BUTTON
        */

        const clearButton =
            document.getElementById(
                'clearSaved'
            ) ||
            document.getElementById(
                'clearButton'
            );


        if (clearButton) {

            clearButton.addEventListener(
                'click',
                clearSavedRoutine
            );
        }


        /*
           SEARCH TOGGLE
        */

        const searchToggle =
            document.getElementById(
                'searchToggle'
            ) ||
            document.getElementById(
                'searchIcon'
            );


        if (searchToggle) {

            searchToggle.addEventListener(
                'click',
                toggleSearch
            );
        }


        /*
           VIEW BUTTONS
        */

        document
            .querySelectorAll(
                '[data-view]'
            )
            .forEach(
                button => {

                    button.addEventListener(
                        'click',
                        () => {

                            setView(
                                button.dataset.view
                            );
                        }
                    );
                }
            );


        /*
           MODE BUTTONS
        */

        document
            .querySelectorAll(
                '[data-mode]'
            )
            .forEach(
                button => {

                    button.addEventListener(
                        'click',
                        () => {

                            setMode(
                                button.dataset.mode
                            );
                        }
                    );
                }
            );


        /*
           LOAD ROUTINE
        */

        loadRoutineData();
    }
);


/* =========================================================
   GLOBAL FUNCTIONS
   ========================================================= */

window.downloadSection =
    downloadSection;

window.setView =
    setView;

window.setMode =
    setMode;

window.changeSection =
    changeSection;

window.performSearch =
    performSearch;

window.toggleSearch =
    toggleSearch;

window.clearSavedRoutine =
    clearSavedRoutine;
