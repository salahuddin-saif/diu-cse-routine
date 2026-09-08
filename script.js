/* =========================================================
   DIU CSE ROUTINE - FULL SCRIPT
   ========================================================= */

const DATA_URL = "./data/routine.json";

const DAYS = [
    "Saturday",
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday"
];

/*
 * IMPORTANT:
 * Only normal DIU time slots are used here.
 *
 * Lab:
 * 11:30-02:30 = 11:30-01:00 + 01:00-02:30
 *
 * So Lab will NOT get its own separate column.
 */
const TIME_SLOTS = [
    "08:30-10:00",
    "10:00-11:30",
    "11:30-01:00",
    "01:00-02:30",
    "02:30-04:00",
    "04:00-05:30"
];

const DAY_ORDER = {};
DAYS.forEach((day, index) => {
    DAY_ORDER[day] = index;
});

const TIME_ORDER = {};
TIME_SLOTS.forEach((time, index) => {
    TIME_ORDER[time] = index;
});


let routineData = null;
let currentMode = "section";
let currentSelection = "";
let searchTimer = null;


/* =========================================================
   INITIALIZE
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    initializeApp();
});


async function initializeApp() {

    setupEvents();

    await loadRoutineData();

    restoreSavedSelection();

}


/* =========================================================
   EVENTS
   ========================================================= */

function setupEvents() {

    const showBtn = document.getElementById("showRoutineBtn");

    if (showBtn) {
        showBtn.addEventListener("click", () => {
            showSelectedRoutine();
        });
    }


    const sectionInput = document.getElementById("sectionInput");

    if (sectionInput) {

        sectionInput.addEventListener("keydown", (event) => {

            if (event.key === "Enter") {
                event.preventDefault();
                showSelectedRoutine();
            }

        });

    }


    const clearBtn = document.getElementById("clearSectionBtn");

    if (clearBtn) {

        clearBtn.addEventListener("click", () => {

            localStorage.removeItem("diuRoutineSelection");

            currentSelection = "";

            if (sectionInput) {
                sectionInput.value = "";
            }

            setMessage("Saved routine cleared.");

            renderWelcome();

        });

    }


    /*
     * Search icon / search input
     */
    const searchInput = document.getElementById("searchInput");

    if (searchInput) {

        searchInput.addEventListener("input", () => {

            clearTimeout(searchTimer);

            searchTimer = setTimeout(() => {

                performSearch(searchInput.value);

            }, 200);

        });


        searchInput.addEventListener("keydown", (event) => {

            if (event.key === "Enter") {

                event.preventDefault();

                performSearch(searchInput.value);

            }

        });

    }


    /*
     * Mode navigation
     */
    document.addEventListener("click", (event) => {

        const modeButton = event.target.closest("[data-mode]");

        if (!modeButton) {
            return;
        }

        const mode = modeButton.dataset.mode;

        if (!mode) {
            return;
        }

        switchMode(mode);

    });

}


/* =========================================================
   LOAD DATA
   ========================================================= */

async function loadRoutineData() {

    setStatus("Loading", "loading");

    try {

        const response = await fetch(
            `${DATA_URL}?v=${Date.now()}`,
            {
                cache: "no-store"
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        routineData = await response.json();

        setStatus("Online", "online");

        updateHeader();

        populateSearchData();

    } catch (error) {

        console.error("Routine loading error:", error);

        setStatus("Offline", "error");

        showError(
            "Could not load routine data.",
            "Please check your internet connection or data/routine.json."
        );

    }

}


/* =========================================================
   HEADER
   ========================================================= */

function updateHeader() {

    if (!routineData) {
        return;
    }


    const versionElement =
        document.getElementById("versionNumber");

    if (versionElement) {

        const version =
            routineData.version ??
            routineData.meta?.version ??
            "5.0";

        versionElement.textContent =
            String(version).replace(/^v/i, "");

    }


    const updatedElement =
        document.getElementById("lastUpdated");

    if (updatedElement) {

        const updated =
            routineData.updated_at ??
            routineData.meta?.updated_at ??
            "";

        if (updated) {

            updatedElement.textContent =
                `Updated ${formatUpdatedDate(updated)}`;

        }

    }

}


/* =========================================================
   STATUS
   ========================================================= */

function setStatus(text, type = "online") {

    const statusText =
        document.getElementById("statusText");

    if (statusText) {
        statusText.textContent = text;
    }


    const badge =
        document.getElementById("statusBadge");

    if (badge) {

        badge.classList.remove(
            "online",
            "loading",
            "error"
        );

        badge.classList.add(type);

    }

}


/* =========================================================
   MODE
   ========================================================= */

function switchMode(mode) {

    const allowedModes = [
        "section",
        "teacher",
        "room"
    ];

    if (!allowedModes.includes(mode)) {
        mode = "section";
    }

    currentMode = mode;


    document
        .querySelectorAll("[data-mode]")
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.mode === mode
            );

        });


    updateSearchUI();


    const input =
        document.getElementById("sectionInput");

    if (input) {

        if (mode === "section") {
            input.placeholder = "e.g., 70_N";
        }

        if (mode === "teacher") {
            input.placeholder = "e.g., NSL";
        }

        if (mode === "room") {
            input.placeholder = "e.g., KT-516";
        }

    }


    const label =
        document.querySelector(".search-box label");

    if (label) {

        if (mode === "section") {

            label.innerHTML =
                `<i class="fas fa-user-graduate"></i> Enter your section`;

        } else if (mode === "teacher") {

            label.innerHTML =
                `<i class="fas fa-chalkboard-teacher"></i> Search teacher`;

        } else {

            label.innerHTML =
                `<i class="fas fa-door-open"></i> Search room`;

        }

    }


    renderWelcome();

}


/* =========================================================
   SEARCH UI
   ========================================================= */

function updateSearchUI() {

    const input =
        document.getElementById("sectionInput");

    if (!input) {
        return;
    }

    /*
     * Search icon can be added by existing HTML.
     * We keep the original input functional as well.
     */

}


/* =========================================================
   SHOW SELECTED ROUTINE
   ========================================================= */

function showSelectedRoutine() {

    const input =
        document.getElementById("sectionInput");

    if (!input || !routineData) {
        return;
    }


    const value =
        input.value.trim();

    if (!value) {

        setMessage(
            currentMode === "section"
                ? "Please enter a section."
                : currentMode === "teacher"
                    ? "Please enter a teacher."
                    : "Please enter a room."
        );

        return;

    }


    currentSelection = value;

    saveSelection(value);

    setMessage("");

    renderCurrentMode();

}


/* =========================================================
   SAVE / RESTORE
   ========================================================= */

function saveSelection(value) {

    localStorage.setItem(
        "diuRoutineSelection",
        JSON.stringify({
            mode: currentMode,
            value: value
        })
    );

}


function restoreSavedSelection() {

    try {

        const saved =
            JSON.parse(
                localStorage.getItem(
                    "diuRoutineSelection"
                )
            );

        if (!saved) {

            const oldValue =
                localStorage.getItem("section");

            if (oldValue) {

                currentMode = "section";
                currentSelection = oldValue;

                const input =
                    document.getElementById("sectionInput");

                if (input) {
                    input.value = oldValue;
                }

                renderCurrentMode();

                return;

            }

            renderWelcome();

            return;
        }


        currentMode =
            saved.mode || "section";

        currentSelection =
            saved.value || "";


        const input =
            document.getElementById("sectionInput");

        if (input) {
            input.value = currentSelection;
        }


        switchMode(currentMode);


        if (currentSelection) {
            renderCurrentMode();
        }

    } catch (error) {

        console.warn(
            "Could not restore saved routine:",
            error
        );

        renderWelcome();

    }

}


/* =========================================================
   RENDER CURRENT MODE
   ========================================================= */

function renderCurrentMode() {

    if (!routineData) {
        return;
    }


    if (!currentSelection) {

        renderWelcome();

        return;

    }


    if (currentMode === "section") {

        renderSection(currentSelection);

        return;

    }


    if (currentMode === "teacher") {

        renderTeacher(currentSelection);

        return;

    }


    if (currentMode === "room") {

        renderRoom(currentSelection);

        return;

    }

}


/* =========================================================
   GET ALL CLASSES
   ========================================================= */

function getAllClasses() {

    if (!routineData) {
        return [];
    }


    let sections =
        routineData.sections;


    if (Array.isArray(sections)) {
        return normalizeClasses(sections);
    }


    if (
        sections &&
        typeof sections === "object"
    ) {

        const all = [];

        Object.entries(sections).forEach(
            ([sectionName, classes]) => {

                if (!Array.isArray(classes)) {
                    return;
                }

                classes.forEach(item => {

                    all.push({
                        ...item,
                        section:
                            item.section ||
                            sectionName
                    });

                });

            }
        );

        return normalizeClasses(all);

    }


    return [];

}


/* =========================================================
   NORMALIZE CLASSES
   ========================================================= */

function normalizeClasses(classes) {

    return classes
        .map(item => {

            const copy = {
                ...item
            };


            copy.day =
                normalizeDay(copy.day);


            copy.time =
                normalizeTime(copy.time);


            copy.type =
                normalizeType(copy.type);


            copy.sub_section =
                normalizeSubSection(
                    copy.sub_section
                );


            return copy;

        })
        .filter(item => {

            return (
                item.day &&
                item.time &&
                item.course
            );

        });

}


/* =========================================================
   NORMALIZE DAY
   ========================================================= */

function normalizeDay(day) {

    if (!day) {
        return "";
    }


    const value =
        String(day)
            .trim()
            .toLowerCase();


    const found =
        DAYS.find(
            item =>
                item.toLowerCase() === value
        );


    return found || String(day).trim();

}


/* =========================================================
   NORMALIZE TIME
   ========================================================= */

function normalizeTime(time) {

    if (!time) {
        return "";
    }


    let value =
        String(time)
            .trim()
            .replace(/\s+/g, "")
            .replace(/[–—]/g, "-");


    /*
     * Convert common formats to DIU format.
     */
    const replacements = {
        "8:30-10:00": "08:30-10:00",
        "08:30-10:00": "08:30-10:00",

        "10:00-11:30": "10:00-11:30",

        "11:30-01:00": "11:30-01:00",
        "11:30-1:00": "11:30-01:00",

        "01:00-02:30": "01:00-02:30",
        "1:00-2:30": "01:00-02:30",

        "02:30-04:00": "02:30-04:00",
        "2:30-4:00": "02:30-04:00",

        "04:00-05:30": "04:00-05:30",
        "4:00-5:30": "04:00-05:30",

        /*
         * This is intentionally retained.
         * Lab renderer will split it across 2 slots.
         */
        "11:30-02:30": "11:30-02:30",
        "11:30-2:30": "11:30-02:30"
    };


    if (replacements[value]) {
        return replacements[value];
    }


    return String(time).trim();

}


/* =========================================================
   NORMALIZE TYPE
   ========================================================= */

function normalizeType(type) {

    if (!type) {
        return "Theory";
    }


    const value =
        String(type)
            .trim()
            .toLowerCase();


    if (value.includes("lab")) {
        return "Lab";
    }


    return "Theory";

}


/* =========================================================
   NORMALIZE SUB SECTION
   ========================================================= */

function normalizeSubSection(value) {

    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return "";
    }


    let text =
        String(value).trim();


    /*
     * N1 / N2
     */
    text = text
        .replace(/^N/i, "")
        .trim();


    /*
     * Main should not be displayed.
     */
    if (
        text.toLowerCase() === "main" ||
        text === "0"
    ) {
        return "";
    }


    return text;

}


/* =========================================================
   SECTION NAME
   ========================================================= */

function getSectionName(item) {

    return (
        item.section_name ||
        item.section_full ||
        item.section_id ||
        item.section ||
        ""
    );

}


/* =========================================================
   SECTION PARSER
   ========================================================= */

function parseSectionName(name) {

    const value =
        String(name || "")
            .trim()
            .toUpperCase();


    /*
     * Examples:
     * 70_N
     * 70N
     * 70_N1
     */

    let match =
        value.match(
            /^(\d+)[_\-\s]?([A-Z]+)$/
        );


    if (match) {

        return {
            batch: match[1],
            letter: match[2],
            full: `${match[1]}_${match[2]}`
        };

    }


    return {
        batch: "",
        letter: "",
        full: value
    };

}


/* =========================================================
   GET CLASS SECTION
   ========================================================= */

function getClassSection(item) {

    /*
     * If JSON already contains a full section name.
     */
    if (
        item.section_name &&
        String(item.section_name).includes("_")
    ) {

        return String(item.section_name)
            .trim()
            .toUpperCase();

    }


    if (
        item.section &&
        String(item.section).includes("_")
    ) {

        return String(item.section)
            .trim()
            .toUpperCase();

    }


    const batch =
        item.batch !== undefined &&
        item.batch !== null
            ? String(item.batch).trim()
            : "";


    const letter =
        item.section_letter ||
        (
            item.section &&
            !String(item.section).match(/^\d+$/)
                ? String(item.section).trim()
                : ""
        );


    if (batch && letter) {

        return `${batch}_${letter}`
            .toUpperCase();

    }


    return String(
        item.section || ""
    ).trim().toUpperCase();

}


/* =========================================================
   FIND SECTION
   ========================================================= */

function findSectionClasses(section) {

    const target =
        String(section)
            .trim()
            .toUpperCase();


    const targetParsed =
        parseSectionName(target);


    return getAllClasses()
        .filter(item => {

            const itemSection =
                getClassSection(item);


            if (itemSection === target) {
                return true;
            }


            /*
             * Compare normalized forms.
             */
            const parsed =
                parseSectionName(itemSection);


            return (
                parsed.batch === targetParsed.batch &&
                parsed.letter === targetParsed.letter &&
                parsed.batch !== ""
            );

        });

}


/* =========================================================
   FIND TEACHER
   ========================================================= */

function findTeacherClasses(teacher) {

    const target =
        String(teacher)
            .trim()
            .toUpperCase();


    return getAllClasses()
        .filter(item => {

            const value =
                String(
                    item.teacher || ""
                )
                    .trim()
                    .toUpperCase();


            return (
                value === target ||
                value.includes(target)
            );

        });

}


/* =========================================================
   FIND ROOM
   ========================================================= */

function findRoomClasses(room) {

    const target =
        String(room)
            .trim()
            .toUpperCase();


    return getAllClasses()
        .filter(item => {

            const value =
                String(
                    item.room || ""
                )
                    .trim()
                    .toUpperCase();


            return (
                value === target ||
                value.includes(target)
            );

        });

}


/* =========================================================
   SORT CLASSES
   ========================================================= */

function sortClasses(classes) {

    return [...classes].sort(
        (a, b) => {

            const dayA =
                DAY_ORDER[a.day] ??
                999;


            const dayB =
                DAY_ORDER[b.day] ??
                999;


            if (dayA !== dayB) {
                return dayA - dayB;
            }


            const timeA =
                getTimeStartIndex(a.time);


            const timeB =
                getTimeStartIndex(b.time);


            if (timeA !== timeB) {
                return timeA - timeB;
            }


            /*
             * Lab before Theory if same start time.
             */
            if (
                a.type === "Lab" &&
                b.type !== "Lab"
            ) {
                return -1;
            }


            if (
                b.type === "Lab" &&
                a.type !== "Lab"
            ) {
                return 1;
            }


            return String(a.course || "")
                .localeCompare(
                    String(b.course || "")
                );

        }
    );

}


/* =========================================================
   TIME START INDEX
   ========================================================= */

function getTimeStartIndex(time) {

    const value =
        normalizeTime(time);


    /*
     * Direct normal slot.
     */
    if (
        Object.prototype.hasOwnProperty.call(
            TIME_ORDER,
            value
        )
    ) {
        return TIME_ORDER[value];
    }


    /*
     * Lab 11:30-02:30 starts at
     * 11:30-01:00.
     */
    if (value === "11:30-02:30") {
        return 2;
    }


    /*
     * Generic fallback:
     * read starting HH:MM.
     */
    const match =
        value.match(/^(\d{1,2}):(\d{2})-/);


    if (!match) {
        return 999;
    }


    let hour =
        parseInt(match[1], 10);

    const minute =
        parseInt(match[2], 10);


    /*
     * DIU afternoon slots are represented
     * using 01/02/04 instead of 13/14/16.
     *
     * Give them a manually ordered fallback.
     */
    const minutes =
        hour * 60 + minute;


    if (minutes === 8 * 60 + 30) return 0;
    if (minutes === 10 * 60) return 1;
    if (minutes === 11 * 60 + 30) return 2;
    if (minutes === 13 * 60) return 3;
    if (minutes === 14 * 60 + 30) return 4;
    if (minutes === 16 * 60) return 5;


    return 999;

}


/* =========================================================
   GET LAB SPAN
   ========================================================= */

function getLabSpan(item) {

    if (
        item.type !== "Lab"
    ) {
        return 1;
    }


    const time =
        normalizeTime(item.time);


    /*
     * Main DIU lab:
     *
     * 11:30-02:30
     *
     * = 11:30-01:00
     * + 01:00-02:30
     */
    if (
        time === "11:30-02:30"
    ) {
        return 2;
    }


    /*
     * Generic check for 2-slot lab.
     */
    if (
        isTwoSlotTime(time)
    ) {
        return 2;
    }


    return 1;

}


/* =========================================================
   CHECK TWO-SLOT TIME
   ========================================================= */

function isTwoSlotTime(time) {

    const value =
        normalizeTime(time);


    return (
        value === "11:30-02:30"
    );

}


/* =========================================================
   DISPLAY TIME
   ========================================================= */

function displayTime(time) {

    return normalizeTime(time);

}


/* =========================================================
   COURSE LABEL
   ========================================================= */

function getCourseLabel(item) {

    let label =
        escapeHTML(
            String(item.course || "")
        );


    /*
     * Main section should NOT show (N).
     *
     * Lab subsection should show (N1)/(N2).
     */
    const sub =
        normalizeSubSection(
            item.sub_section
        );


    if (
        item.type === "Lab" &&
        sub
    ) {

        label +=
            ` <span class="sub-section">(N${escapeHTML(sub)})</span>`;

    }


    return label;

}


/* =========================================================
   TEACHER LABEL
   ========================================================= */

function getTeacherLabel(item) {

    return escapeHTML(
        String(item.teacher || "TBA")
            .trim()
    );

}


/* =========================================================
   ROOM LABEL
   ========================================================= */

function getRoomLabel(item) {

    return escapeHTML(
        String(item.room || "TBA")
            .trim()
    );

}


/* =========================================================
   TYPE LABEL
   ========================================================= */

function getTypeLabel(item) {

    return escapeHTML(
        String(item.type || "Theory")
    );

}


/* =========================================================
   RENDER SECTION
   ========================================================= */

function renderSection(section) {

    const classes =
        sortClasses(
            findSectionClasses(section)
        );


    if (!classes.length) {

        showError(
            "Section not found.",
            `No routine found for "${section}".`
        );

        return;

    }


    const container =
        document.getElementById(
            "routineContainer"
        );


    if (!container) {
        return;
    }


    container.innerHTML =
        createSectionView(
            section,
            classes
        );

}


/* =========================================================
   CREATE SECTION VIEW
   ========================================================= */

function createSectionView(
    section,
    classes
) {

    const grouped =
        groupByDay(classes);


    let html = `
        <div class="routine-header-card">

            <div>
                <div class="routine-kicker">
                    DIU CSE ROUTINE
                </div>

                <h2>
                    Section ${escapeHTML(section)}
                </h2>

                <p>
                    ${escapeHTML(getSemester())}
                </p>
            </div>

            <button
                class="download-btn"
                onclick="downloadSection('${escapeJS(section)}')"
                title="Download routine image"
            >
                <i class="fas fa-download"></i>
                Download routine image
            </button>

        </div>

        <div class="week-view">
    `;


    DAYS.forEach(day => {

        const dayClasses =
            grouped[day] || [];


        html += `
            <section class="day-card">

                <div class="day-card-header">
                    <div>
                        <h3>
                            ${escapeHTML(day)}
                        </h3>

                        <span>
                            ${dayClasses.length}
                            ${dayClasses.length === 1
                                ? "class"
                                : "classes"}
                        </span>
                    </div>
                </div>

                <div class="class-list">
        `;


        if (!dayClasses.length) {

            html += `
                <div class="empty-day">
                    No classes
                </div>
            `;

        } else {

            dayClasses.forEach(item => {

                html += createClassCard(item);

            });

        }


        html += `
                </div>
            </section>
        `;

    });


    html += `
        </div>
    `;


    return html;

}


/* =========================================================
   CLASS CARD
   ========================================================= */

function createClassCard(item) {

    const lab =
        item.type === "Lab";


    return `
        <article class="class-item ${lab ? "lab-class" : "theory-class"}">

            <div class="class-time">
                ${escapeHTML(displayTime(item.time))}
            </div>

            <div class="class-main">

                <div class="course-name">
                    ${getCourseLabel(item)}
                </div>

                <div class="class-meta">

                    <span>
                        <i class="fas fa-user"></i>
                        ${getTeacherLabel(item)}
                    </span>

                    <span>
                        <i class="fas fa-location-dot"></i>
                        ${getRoomLabel(item)}
                    </span>

                    <span class="class-type">
                        ${getTypeLabel(item)}
                    </span>

                </div>

            </div>

        </article>
    `;

}


/* =========================================================
   GROUP BY DAY
   ========================================================= */

function groupByDay(classes) {

    const grouped = {};


    DAYS.forEach(day => {
        grouped[day] = [];
    });


    sortClasses(classes)
        .forEach(item => {

            if (!grouped[item.day]) {
                grouped[item.day] = [];
            }

            grouped[item.day].push(item);

        });


    return grouped;

}


/* =========================================================
   TEACHER VIEW
   ========================================================= */

function renderTeacher(teacher) {

    const classes =
        sortClasses(
            findTeacherClasses(teacher)
        );


    if (!classes.length) {

        showError(
            "Teacher not found.",
            `No routine found for "${teacher}".`
        );

        return;

    }


    const container =
        document.getElementById(
            "routineContainer"
        );


    container.innerHTML = `
        <div class="routine-header-card">

            <div>
                <div class="routine-kicker">
                    TEACHER ROUTINE
                </div>

                <h2>
                    ${escapeHTML(teacher)}
                </h2>

                <p>
                    ${classes.length}
                    ${classes.length === 1 ? "class" : "classes"}
                </p>
            </div>

            <button
                class="download-btn"
                onclick="downloadSearchResult('teacher', '${escapeJS(teacher)}')"
            >
                <i class="fas fa-download"></i>
                Download routine image
            </button>

        </div>

        <div class="day-grid">
            ${createTeacherRoomCards(classes)}
        </div>
    `;

}


/* =========================================================
   ROOM VIEW
   ========================================================= */

function renderRoom(room) {

    const classes =
        sortClasses(
            findRoomClasses(room)
        );


    if (!classes.length) {

        showError(
            "Room not found.",
            `No routine found for "${room}".`
        );

        return;

    }


    const container =
        document.getElementById(
            "routineContainer"
        );


    container.innerHTML = `
        <div class="routine-header-card">

            <div>
                <div class="routine-kicker">
                    ROOM ROUTINE
                </div>

                <h2>
                    ${escapeHTML(room)}
                </h2>

                <p>
                    ${classes.length}
                    ${classes.length === 1 ? "class" : "classes"}
                </p>
            </div>

            <button
                class="download-btn"
                onclick="downloadSearchResult('room', '${escapeJS(room)}')"
            >
                <i class="fas fa-download"></i>
                Download routine image
            </button>

        </div>

        <div class="day-grid">
            ${createTeacherRoomCards(classes)}
        </div>
    `;

}


/* =========================================================
   TEACHER / ROOM CARDS
   ========================================================= */

function createTeacherRoomCards(classes) {

    const grouped =
        groupByDay(classes);


    let html = "";


    DAYS.forEach(day => {

        const dayClasses =
            grouped[day] || [];


        html += `
            <section class="day-card">

                <div class="day-card-header">

                    <div>
                        <h3>
                            ${escapeHTML(day)}
                        </h3>

                        <span>
                            ${dayClasses.length}
                            ${dayClasses.length === 1
                                ? "class"
                                : "classes"}
                        </span>
                    </div>

                </div>

                <div class="class-list">
        `;


        if (!dayClasses.length) {

            html += `
                <div class="empty-day">
                    No classes
                </div>
            `;

        } else {

            dayClasses.forEach(item => {

                html += `
                    <article class="class-item">

                        <div class="class-time">
                            ${escapeHTML(item.time)}
                        </div>

                        <div class="class-main">

                            <div class="course-name">
                                ${getCourseLabel(item)}
                            </div>

                            <div class="class-meta">

                                <span>
                                    <i class="fas fa-user"></i>
                                    ${getTeacherLabel(item)}
                                </span>

                                <span>
                                    <i class="fas fa-location-dot"></i>
                                    ${getRoomLabel(item)}
                                </span>

                                <span>
                                    Section
                                    ${escapeHTML(
                                        getClassSection(item)
                                    )}
                                </span>

                            </div>

                        </div>

                    </article>
                `;

            });

        }


        html += `
                </div>
            </section>
        `;

    });


    return html;

}


/* =========================================================
   DOWNLOAD SECTION AS PNG
   ========================================================= */

async function downloadSection(section) {

    const classes =
        sortClasses(
            findSectionClasses(section)
        );


    if (!classes.length) {

        alert(
            `No routine found for ${section}.`
        );

        return;

    }


    await downloadRoutineTableImage(
        section,
        classes
    );

}


/* =========================================================
   DOWNLOAD SEARCH RESULT
   ========================================================= */

async function downloadSearchResult(
    mode,
    value
) {

    let classes = [];


    if (mode === "teacher") {

        classes =
            sortClasses(
                findTeacherClasses(value)
            );

    } else if (mode === "room") {

        classes =
            sortClasses(
                findRoomClasses(value)
            );

    }


    if (!classes.length) {

        alert("No routine found.");

        return;

    }


    await downloadRoutineTableImage(
        value,
        classes,
        mode
    );

}


/* =========================================================
   DOWNLOAD ROUTINE TABLE IMAGE
   ========================================================= */

async function downloadRoutineTableImage(
    title,
    classes,
    mode = "section"
) {

    try {

        /*
         * Load html2canvas dynamically if it is not already loaded.
         */
        await ensureHtml2Canvas();


        const exportWrapper =
            document.createElement("div");


        exportWrapper.id =
            "routineExportWrapper";


        exportWrapper.style.position =
            "fixed";

        exportWrapper.style.left =
            "-100000px";

        exportWrapper.style.top =
            "0";

        exportWrapper.style.width =
            "1500px";

        exportWrapper.style.background =
            "#ffffff";

        exportWrapper.style.padding =
            "50px";

        exportWrapper.style.boxSizing =
            "border-box";

        exportWrapper.style.fontFamily =
            "Arial, Helvetica, sans-serif";


        const table =
            createDownloadTable(
                title,
                classes,
                mode
            );


        exportWrapper.innerHTML =
            table;


        document.body.appendChild(
            exportWrapper
        );


        /*
         * Wait for browser to render.
         */
        await new Promise(resolve => {

            requestAnimationFrame(() => {

                requestAnimationFrame(resolve);

            });

        });


        const canvas =
            await html2canvas(
                exportWrapper,
                {
                    backgroundColor: "#ffffff",
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    width: exportWrapper.scrollWidth,
                    height: exportWrapper.scrollHeight
                }
            );


        const link =
            document.createElement("a");


        const safeName =
            String(title)
                .replace(/[^a-z0-9_-]+/gi, "_");


        link.download =
            `DIU_CSE_Routine_${safeName}.png`;


        link.href =
            canvas.toDataURL(
                "image/png"
            );


        link.click();


        exportWrapper.remove();

    } catch (error) {

        console.error(
            "Image download failed:",
            error
        );

        const wrapper =
            document.getElementById(
                "routineExportWrapper"
            );

        if (wrapper) {
            wrapper.remove();
        }


        alert(
            "Could not create routine image."
        );

    }

}


/* =========================================================
   LOAD HTML2CANVAS
   ========================================================= */

function ensureHtml2Canvas() {

    if (
        typeof window.html2canvas ===
        "function"
    ) {

        return Promise.resolve();

    }


    return new Promise(
        (resolve, reject) => {

            const existing =
                document.querySelector(
                    'script[data-html2canvas]'
                );


            if (existing) {

                existing.addEventListener(
                    "load",
                    resolve
                );

                existing.addEventListener(
                    "error",
                    reject
                );

                return;

            }


            const script =
                document.createElement("script");


            script.src =
                "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";


            script.async = true;

            script.dataset.html2canvas =
                "true";


            script.onload =
                () => resolve();


            script.onerror =
                () => reject(
                    new Error(
                        "html2canvas failed to load"
                    )
                );


            document.head.appendChild(
                script
            );

        }
    );

}


/* =========================================================
   CREATE DOWNLOAD TABLE
   ========================================================= */

function createDownloadTable(
    title,
    classes,
    mode = "section"
) {

    const grouped =
        groupByDay(classes);


    const semester =
        getSemester();


    let subtitle = "";


    if (mode === "section") {

        subtitle =
            `Section ${escapeHTML(title)}`;

    } else if (mode === "teacher") {

        subtitle =
            `Teacher: ${escapeHTML(title)}`;

    } else if (mode === "room") {

        subtitle =
            `Room: ${escapeHTML(title)}`;

    } else {

        subtitle =
            escapeHTML(title);

    }


    let html = `

        <div style="
            width:100%;
            background:#ffffff;
            color:#111827;
        ">

            <div style="
                text-align:center;
                padding:10px 0 30px 0;
            ">

                <div style="
                    font-size:22px;
                    font-weight:700;
                    letter-spacing:1px;
                    margin-bottom:8px;
                ">
                    DAFFODIL INTERNATIONAL UNIVERSITY
                </div>

                <div style="
                    font-size:18px;
                    font-weight:600;
                    margin-bottom:6px;
                ">
                    Department of Computer Science & Engineering
                </div>

                <div style="
                    font-size:28px;
                    font-weight:800;
                    margin-top:20px;
                ">
                    ${subtitle}
                </div>

                <div style="
                    font-size:18px;
                    margin-top:8px;
                ">
                    ${escapeHTML(semester)}
                </div>

            </div>


            <table style="
                width:100%;
                border-collapse:collapse;
                table-layout:fixed;
                font-size:15px;
                background:#ffffff;
            ">

                <thead>

                    <tr>

                        <th style="
                            border:1px solid #1f2937;
                            padding:14px 8px;
                            background:#111827;
                            color:#ffffff;
                            width:105px;
                            font-size:16px;
                        ">
                            Day
                        </th>
    `;


    TIME_SLOTS.forEach(time => {

        html += `
            <th style="
                border:1px solid #1f2937;
                padding:14px 6px;
                background:#111827;
                color:#ffffff;
                font-size:14px;
                line-height:1.3;
            ">
                ${escapeHTML(time)}
            </th>
        `;

    });


    html += `
                    </tr>

                </thead>

                <tbody>
    `;


    DAYS.forEach(day => {

        const dayClasses =
            grouped[day] || [];


        /*
         * Keep classes indexed by their starting normal slot.
         */
        const slotMap = {};


        dayClasses.forEach(item => {

            const startIndex =
                getTimeStartIndex(item.time);


            if (
                startIndex >= 0 &&
                startIndex < TIME_SLOTS.length
            ) {

                if (!slotMap[startIndex]) {
                    slotMap[startIndex] = [];
                }

                slotMap[startIndex].push(item);

            }

        });


        html += `
            <tr>

                <td style="
                    border:1px solid #1f2937;
                    padding:12px 8px;
                    text-align:center;
                    vertical-align:middle;
                    font-weight:800;
                    font-size:17px;
                    background:#f3f4f6;
                ">
                    ${escapeHTML(day)}
                </td>
        `;


        let slotIndex = 0;


        while (
            slotIndex <
            TIME_SLOTS.length
        ) {

            const items =
                slotMap[slotIndex] || [];


            /*
             * If there is a 2-slot Lab beginning here,
             * render it with colspan="2".
             */
            const lab =
                items.find(
                    item =>
                        item.type === "Lab" &&
                        getLabSpan(item) === 2
                );


            if (lab) {

                html += `
                    <td colspan="2" style="
                        border:1px solid #1f2937;
                        padding:10px;
                        vertical-align:middle;
                        text-align:center;
                        background:#f9fafb;
                    ">
                        ${createExportClassHTML(lab)}
                    </td>
                `;


                /*
                 * Skip the second normal slot.
                 */
                slotIndex += 2;

                continue;

            }


            /*
             * Normal single-slot cell.
             */
            html += `
                <td style="
                    border:1px solid #1f2937;
                    padding:10px;
                    vertical-align:middle;
                    text-align:center;
                    background:#ffffff;
                ">
            `;


            if (items.length) {

                items.forEach(
                    (item, index) => {

                        html +=
                            createExportClassHTML(
                                item
                            );


                        if (
                            index <
                            items.length - 1
                        ) {

                            html += `
                                <div style="
                                    border-top:1px dashed #9ca3af;
                                    margin:9px 0;
                                "></div>
                            `;

                        }

                    }
                );

            } else {

                html += `
                    <span style="
                        color:#9ca3af;
                        font-size:13px;
                    ">
                        —
                    </span>
                `;

            }


            html += `
                </td>
            `;


            slotIndex++;

        }


        html += `
            </tr>
        `;

    });


    html += `
                </tbody>

            </table>


            <div style="
                text-align:center;
                font-size:13px;
                color:#6b7280;
                margin-top:18px;
            ">
                Generated from DIU CSE Routine
            </div>

        </div>
    `;


    return html;

}


/* =========================================================
   EXPORT CLASS HTML
   ========================================================= */

function createExportClassHTML(item) {

    const course =
        getPlainCourseLabel(item);


    const teacher =
        escapeHTML(
            String(
                item.teacher || "TBA"
            ).trim()
        );


    const room =
        escapeHTML(
            String(
                item.room || "TBA"
            ).trim()
        );


    const type =
        escapeHTML(
            String(
                item.type || "Theory"
            )
        );


    const time =
        escapeHTML(
            String(
                item.time || ""
            )
        );


    return `
        <div style="
            line-height:1.35;
            min-width:0;
        ">

            <div style="
                font-size:17px;
                font-weight:800;
                margin-bottom:5px;
                word-break:break-word;
            ">
                ${course}
            </div>

            <div style="
                font-size:13px;
                font-weight:600;
                margin-bottom:3px;
            ">
                ${teacher}
            </div>

            <div style="
                font-size:12px;
                margin-bottom:3px;
            ">
                ${room}
            </div>

            <div style="
                font-size:11px;
                font-weight:700;
                text-transform:uppercase;
                letter-spacing:.5px;
                margin-bottom:3px;
            ">
                ${type}
            </div>

            ${
                item.type === "Lab"
                    ? `
                        <div style="
                            font-size:11px;
                            color:#374151;
                        ">
                            ${time}
                        </div>
                    `
                    : ""
            }

        </div>
    `;

}


/* =========================================================
   PLAIN COURSE LABEL FOR EXPORT
   ========================================================= */

function getPlainCourseLabel(item) {

    let label =
        escapeHTML(
            String(item.course || "")
        );


    const sub =
        normalizeSubSection(
            item.sub_section
        );


    /*
     * Main Theory:
     * CSE213
     *
     * Lab:
     * CSE214 (N1)
     */
    if (
        item.type === "Lab" &&
        sub
    ) {

        label +=
            ` (N${escapeHTML(sub)})`;

    }


    return label;

}


/* =========================================================
   SEMESTER
   ========================================================= */

function getSemester() {

    /*
     * If scraper already stores semester,
     * use it.
     */
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


    /*
     * Current DIU routine:
     * Effective from July 2026.
     */
    return "Summer 2026";

}


/* =========================================================
   SEARCH
   ========================================================= */

function performSearch(query) {

    if (!routineData) {
        return;
    }


    const value =
        String(query || "").trim();


    if (!value) {

        renderWelcome();

        return;

    }


    const results =
        getSearchResults(value);


    renderSearchResults(
        value,
        results
    );

}


/* =========================================================
   SEARCH RESULTS
   ========================================================= */

function getSearchResults(query) {

    const target =
        query.toLowerCase();


    return getAllClasses()
        .filter(item => {

            const searchable = [

                item.course,
                item.teacher,
                item.room,
                item.section,
                item.section_name,
                item.section_letter,
                item.batch,
                item.day,
                item.time,
                item.type

            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();


            return searchable.includes(
                target
            );

        })
        .sort((a, b) => {

            const dayA =
                DAY_ORDER[a.day] ?? 999;

            const dayB =
                DAY_ORDER[b.day] ?? 999;

            if (dayA !== dayB) {
                return dayA - dayB;
            }

            return (
                getTimeStartIndex(a.time) -
                getTimeStartIndex(b.time)
            );

        });

}


/* =========================================================
   RENDER SEARCH RESULTS
   ========================================================= */

function renderSearchResults(
    query,
    results
) {

    const container =
        document.getElementById(
            "routineContainer"
        );


    if (!container) {
        return;
    }


    if (!results.length) {

        showError(
            "No result found.",
            `Nothing matched "${query}".`
        );

        return;

    }


    container.innerHTML = `

        <div class="routine-header-card">

            <div>

                <div class="routine-kicker">
                    SEARCH RESULTS
                </div>

                <h2>
                    ${escapeHTML(query)}
                </h2>

                <p>
                    ${results.length}
                    ${results.length === 1
                        ? "result"
                        : "results"}
                </p>

            </div>

        </div>

        <div class="day-grid">

            ${createTeacherRoomCards(results)}

        </div>
    `;

}


/* =========================================================
   SEARCH DATA
   ========================================================= */

function populateSearchData() {

    /*
     * Supports datalist if index.html contains it.
     */

    const datalist =
        document.getElementById(
            "searchSuggestions"
        );


    if (!datalist || !routineData) {
        return;
    }


    const values =
        new Set();


    getAllClasses()
        .forEach(item => {

            [
                item.section,
                item.section_name,
                item.teacher,
                item.room,
                item.course
            ]
                .filter(Boolean)
                .forEach(value => {

                    values.add(
                        String(value).trim()
                    );

                });

        });


    datalist.innerHTML =
        [...values]
            .sort(
                (a, b) =>
                    a.localeCompare(b)
            )
            .map(
                value =>
                    `<option value="${escapeHTML(value)}"></option>`
            )
            .join("");

}


/* =========================================================
   WELCOME
   ========================================================= */

function renderWelcome() {

    const container =
        document.getElementById(
            "routineContainer"
        );


    if (!container) {
        return;
    }


    container.innerHTML = `

        <div class="loading-state">

            <div class="spinner"></div>

            <h3>
                ${currentMode === "section"
                    ? "Enter your section"
                    : currentMode === "teacher"
                        ? "Search for a teacher"
                        : "Search for a room"}
            </h3>

            <p>
                ${currentMode === "section"
                    ? "Example: 70_N"
                    : currentMode === "teacher"
                        ? "Example: NSL"
                        : "Example: KT-516"}
            </p>

        </div>

    `;

}


/* =========================================================
   ERROR
   ========================================================= */

function showError(
    title,
    message
) {

    const container =
        document.getElementById(
            "routineContainer"
        );


    if (!container) {
        return;
    }


    container.innerHTML = `

        <div class="loading-state">

            <div style="
                font-size:42px;
                margin-bottom:12px;
            ">
                <i class="fas fa-circle-exclamation"></i>
            </div>

            <h3>
                ${escapeHTML(title)}
            </h3>

            <p>
                ${escapeHTML(message)}
            </p>

        </div>

    `;

}


/* =========================================================
   MESSAGE
   ========================================================= */

function setMessage(text) {

    const element =
        document.getElementById(
            "message"
        );


    if (!element) {
        return;
    }


    element.textContent =
        text || "";

}


/* =========================================================
   DATE FORMAT
   ========================================================= */

function formatUpdatedDate(value) {

    try {

        const date =
            new Date(value);


        if (Number.isNaN(date.getTime())) {
            return String(value);
        }


        return date.toLocaleString(
            "en-BD",
            {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            }
        );

    } catch {

        return String(value);

    }

}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHTML(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


/* =========================================================
   ESCAPE JS
   ========================================================= */

function escapeJS(value) {

    return String(value ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r");

}


/* =========================================================
   GLOBAL FUNCTIONS
   ========================================================= */

window.showSelectedRoutine =
    showSelectedRoutine;

window.switchMode =
    switchMode;

window.downloadSection =
    downloadSection;

window.downloadSearchResult =
    downloadSearchResult;

window.performSearch =
    performSearch;


/* =========================================================
   DEBUG HELPERS
   ========================================================= */

window.DIU_ROUTINE_DEBUG = {

    getAllClasses,

    findSectionClasses,

    findTeacherClasses,

    findRoomClasses,

    sortClasses,

    getLabSpan,

    getSemester,

    routineData: () =>
        routineData

};
