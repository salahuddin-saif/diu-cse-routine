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
// - Main section + N1/N2 support
// - Teacher mode
// - Room mode
// - Empty room detection
// - Routine/source link support
// - Dynamic semester detection
// - Today green indicator
// - Correct day ordering
// - Correct time ordering
// - Proper Week View table
// - Proper 2-slot Lab rowspan
// - Professional PNG download design
// - LocalStorage
// - Auto refresh
// - html2canvas download
// ============================================================

(() => {
    "use strict";

    // ============================================================
    // CONFIG
    // ============================================================

    const STORAGE_KEY = "diu_cse_section";
    const MODE_KEY = "diu_cse_mode";

    const SECTION_BASE_URL = "./data/sections/";
    const COMBINED_URL = "./data/routine.json?t=" + Date.now();

    const DAYS = [
        "Saturday",
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday"
    ];

    const TIME_SLOTS = [
        "08:30-10:00",
        "10:00-11:30",
        "11:30-01:00",
        "01:00-02:30",
        "02:30-04:00",
        "04:00-05:30"
    ];

    const DAY_INDEX = {};
    DAYS.forEach((day, index) => {
        DAY_INDEX[day] = index;
    });

    const TIME_INDEX = {};
    TIME_SLOTS.forEach((time, index) => {
        TIME_INDEX[time] = index;
    });

    // ============================================================
    // DOM
    // ============================================================

    const sectionInput =
        document.querySelector("#sectionInput") ||
        document.querySelector("#searchInput");

    const loadBtn =
        document.querySelector("#loadSectionBtn") ||
        document.querySelector("#loadBtn");

    const clearBtn =
        document.querySelector("#clearBtn");

    const savedChip =
        document.querySelector("#savedSection");

    const routineContainer =
        document.querySelector("#routineContainer") ||
        document.querySelector("#routine");

    const statusEl =
        document.querySelector("#status");

    const versionEl =
        document.querySelector("#version");

    const lastUpdatedEl =
        document.querySelector("#lastUpdated");

    const messageEl =
        document.querySelector("#message");

    const searchIcon =
        document.querySelector("#searchIcon");

    const studentNav =
        document.querySelector("#studentMode") ||
        document.querySelector('[data-mode="section"]');

    const teacherNav =
        document.querySelector("#teacherMode") ||
        document.querySelector('[data-mode="teacher"]');

    const roomNav =
        document.querySelector("#roomMode") ||
        document.querySelector('[data-mode="room"]');

    const emptyRoomNav =
        document.querySelector("#emptyRoomMode") ||
        document.querySelector('[data-mode="empty-room"]');

    // ============================================================
    // STATE
    // ============================================================

    let routineData = null;
    let currentMode = localStorage.getItem(MODE_KEY) || "section";
    let currentSearchTerm = "";
    let currentClasses = [];
    let currentRooms = [];

    // ============================================================
    // INIT
    // ============================================================

    document.addEventListener("DOMContentLoaded", init);

    async function init() {
        setupEvents();
        applyModeUI();

        const savedSection = localStorage.getItem(STORAGE_KEY);

        if (savedSection && sectionInput) {
            sectionInput.value = savedSection;
            currentSearchTerm = savedSection;
        }

        await loadRoutineData();

        if (savedSection && currentMode === "section") {
            await loadSection(savedSection, false);
        } else if (currentMode === "teacher" && savedSection) {
            currentSearchTerm = savedSection;
            displayTeacherRoutine(savedSection);
        } else if (currentMode === "room" && savedSection) {
            currentSearchTerm = savedSection;
            displayRoomRoutine(savedSection);
        } else if (currentMode === "empty-room") {
            displayEmptyRooms("");
        }
    }

    // ============================================================
    // EVENTS
    // ============================================================

    function setupEvents() {
        if (loadBtn) {
            loadBtn.addEventListener("click", handleSearch);
        }

        if (searchIcon) {
            searchIcon.addEventListener("click", handleSearch);
        }

        if (clearBtn) {
            clearBtn.addEventListener("click", clearSearch);
        }

        if (sectionInput) {
            sectionInput.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    handleSearch();
                }
            });

            sectionInput.addEventListener("input", () => {
                if (currentMode === "empty-room") {
                    currentSearchTerm = sectionInput.value.trim();
                }
            });
        }

        if (studentNav) {
            studentNav.addEventListener("click", () => {
                setMode("section");
            });
        }

        if (teacherNav) {
            teacherNav.addEventListener("click", () => {
                setMode("teacher");
            });
        }

        if (roomNav) {
            roomNav.addEventListener("click", () => {
                setMode("room");
            });
        }

        if (emptyRoomNav) {
            emptyRoomNav.addEventListener("click", () => {
                setMode("empty-room");
            });
        }
    }

    // ============================================================
    // MODE
    // ============================================================

    function setMode(mode) {
        currentMode = mode;
        localStorage.setItem(MODE_KEY, mode);

        applyModeUI();

        if (!sectionInput) return;

        if (mode === "section") {
            sectionInput.placeholder = "Enter section (e.g., 70_N)";
        }

        if (mode === "teacher") {
            sectionInput.placeholder = "Enter teacher initials (e.g., NSL)";
        }

        if (mode === "room") {
            sectionInput.placeholder = "Enter room (e.g., KT-516)";
        }

        if (mode === "empty-room") {
            sectionInput.placeholder = "Enter day or room (optional)";
            displayEmptyRooms(sectionInput.value.trim());
        }
    }

    function applyModeUI() {
        const navs = [
            [studentNav, "section"],
            [teacherNav, "teacher"],
            [roomNav, "room"],
            [emptyRoomNav, "empty-room"]
        ];

        navs.forEach(([element, mode]) => {
            if (!element) return;

            element.classList.toggle(
                "active",
                currentMode === mode
            );
        });
    }

    // ============================================================
    // SEARCH
    // ============================================================

    async function handleSearch() {
        if (!sectionInput) return;

        const value = sectionInput.value.trim();

        if (!value && currentMode !== "empty-room") {
            showMessage("Please enter a search value.", "warning");
            return;
        }

        currentSearchTerm = value;

        if (currentMode === "section") {
            await loadSection(value, true);
        }

        if (currentMode === "teacher") {
            displayTeacherRoutine(value);
        }

        if (currentMode === "room") {
            displayRoomRoutine(value);
        }

        if (currentMode === "empty-room") {
            displayEmptyRooms(value);
        }
    }

    // ============================================================
    // NORMALIZATION
    // ============================================================

    function normalizeSearch(value) {
        return String(value || "")
            .trim()
            .toUpperCase()
            .replace(/\s+/g, "_");
    }

    function normalizeDay(day) {
        const value = String(day || "")
            .trim()
            .toLowerCase();

        const map = {
            saturday: "Saturday",
            sat: "Saturday",

            sunday: "Sunday",
            sun: "Sunday",

            monday: "Monday",
            mon: "Monday",

            tuesday: "Tuesday",
            tue: "Tuesday",
            tues: "Tuesday",

            wednesday: "Wednesday",
            wed: "Wednesday",

            thursday: "Thursday",
            thu: "Thursday",
            thur: "Thursday",
            thurs: "Thursday",

            friday: "Friday",
            fri: "Friday"
        };

        return map[value] || capitalizeFirst(value);
    }

    function normalizeTime(time) {
        if (!time) return "";

        let value = String(time)
            .trim()
            .replace(/\s+/g, "")
            .replace(/[–—]/g, "-");

        value = value.replace(/\./g, ":");

        const parts = value.split("-");

        if (parts.length !== 2) {
            return String(time).trim();
        }

        return `${normalizeClock(parts[0])}-${normalizeClock(parts[1])}`;
    }

    function normalizeClock(clock) {
        let value = String(clock)
            .trim()
            .toUpperCase();

        value = value.replace(/\s+/g, "");

        let match = value.match(/^(\d{1,2})(?::?(\d{2}))?(AM|PM)?$/);

        if (!match) {
            return value;
        }

        let hour = parseInt(match[1], 10);
        let minute = parseInt(match[2] || "00", 10);
        const meridiem = match[3];

        if (meridiem === "AM" && hour === 12) {
            hour = 0;
        }

        if (meridiem === "PM" && hour !== 12) {
            hour += 12;
        }

        // Routine uses academic 12-hour notation.
        // Keep 01:00 etc. as expected by the standard slots.
        if (!meridiem) {
            return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
        }

        // Convert afternoon values to routine's displayed format.
        if (hour === 13) return `01:${String(minute).padStart(2, "0")}`;
        if (hour === 14) return `02:${String(minute).padStart(2, "0")}`;
        if (hour === 15) return `03:${String(minute).padStart(2, "0")}`;
        if (hour === 16) return `04:${String(minute).padStart(2, "0")}`;
        if (hour === 17) return `05:${String(minute).padStart(2, "0")}`;

        return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }

    function normalizeClassType(type) {
        const value = String(type || "")
            .trim()
            .toLowerCase();

        if (value.includes("lab")) return "Lab";
        if (value.includes("theory")) return "Theory";
        if (value.includes("class")) return "Theory";

        return type ? capitalizeFirst(String(type)) : "";
    }

    // ============================================================
    // FETCH JSON
    // ============================================================

    async function fetchJson(url) {
        const response = await fetch(url, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
    }

    // ============================================================
    // LOAD MAIN ROUTINE
    // ============================================================

    async function loadRoutineData() {
        setStatus("Loading routine...");

        try {
            routineData = await fetchJson(COMBINED_URL);

            updateMeta(routineData);
            setStatus("Routine loaded");

            return routineData;
        } catch (error) {
            console.error("Combined routine failed:", error);

            try {
                const firstSection = await findFirstSection();

                if (firstSection) {
                    routineData = firstSection.data;
                    updateMeta(routineData);
                    setStatus("Routine loaded");
                    return routineData;
                }
            } catch (fallbackError) {
                console.error(fallbackError);
            }

            setStatus("Failed to load routine");
            showMessage(
                "Could not load routine data.",
                "error"
            );

            return null;
        }
    }

    async function findFirstSection() {
        const candidates = [
            "70_N",
            "70_N1",
            "70_N2"
        ];

        for (const section of candidates) {
            try {
                const data = await fetchJson(
                    `${SECTION_BASE_URL}${section}.json?t=${Date.now()}`
                );

                return {
                    section,
                    data
                };
            } catch (_) {}
        }

        return null;
    }

    // ============================================================
    // LOAD SECTION
    // ============================================================

    async function loadSection(section, save = true) {
        const normalized = normalizeSearch(section);

        if (!normalized) return;

        setStatus(`Loading ${normalized}...`);

        let data = null;
        let loadedFrom = "";

        const baseSection = getBaseSection(normalized);

        const urls = [
            `${SECTION_BASE_URL}${normalized}.json?t=${Date.now()}`,
            `${SECTION_BASE_URL}${baseSection}.json?t=${Date.now()}`
        ];

        for (const url of urls) {
            try {
                data = await fetchJson(url);
                loadedFrom = url;
                break;
            } catch (_) {}
        }

        // Combined fallback
        if (!data && routineData) {
            data = findSectionInCombined(
                routineData,
                normalized
            );

            if (data) {
                loadedFrom = "combined";
            }
        }

        // Main section may contain N1/N2
        if (data) {
            const classes = extractClassesFromData(data);

            if (classes.length === 0) {
                const merged = mergeSubSections(
                    baseSection,
                    data
                );

                if (merged.length > 0) {
                    data = {
                        ...data,
                        classes: merged
                    };
                }
            }
        }

        // If N1/N2 requested but only main section exists
        if (!data && routineData) {
            const merged = mergeSubSections(
                baseSection,
                routineData
            );

            if (merged.length > 0) {
                data = {
                    section: normalized,
                    classes: merged
                };
                loadedFrom = "combined";
            }
        }

        if (!data) {
            setStatus("Section not found");

            showMessage(
                `Routine not found for "${normalized}".`,
                "error"
            );

            currentClasses = [];
            return;
        }

        currentSearchTerm = normalized;

        if (save) {
            localStorage.setItem(
                STORAGE_KEY,
                normalized
            );
        }

        updateSavedChip(normalized);

        const classes = normalizeClasses(
            extractClassesFromData(data),
            normalized
        );

        currentClasses = classes;

        displaySection(
            normalized,
            classes,
            data,
            loadedFrom
        );

        setStatus(
            `${normalized} loaded`
        );
    }

    // ============================================================
    // FIND SECTION IN COMBINED DATA
    // ============================================================

    function findSectionInCombined(data, section) {
        const target = normalizeSearch(section);
        const base = getBaseSection(target);

        if (!data || typeof data !== "object") {
            return null;
        }

        if (Array.isArray(data)) {
            return null;
        }

        const sections =
            data.sections ||
            data.data ||
            data.routines ||
            null;

        if (sections && typeof sections === "object") {
            const keys = Object.keys(sections);

            const exactKey = keys.find(
                key => normalizeSearch(key) === target
            );

            if (exactKey) {
                return sections[exactKey];
            }

            const baseKey = keys.find(
                key => normalizeSearch(key) === base
            );

            if (baseKey) {
                return sections[baseKey];
            }
        }

        const directKeys = Object.keys(data);

        const exactKey = directKeys.find(
            key => normalizeSearch(key) === target
        );

        if (exactKey) {
            return data[exactKey];
        }

        const baseKey = directKeys.find(
            key => normalizeSearch(key) === base
        );

        if (baseKey) {
            return data[baseKey];
        }

        return null;
    }

    // ============================================================
    // MERGE SUB SECTIONS
    // ============================================================

    function mergeSubSections(baseSection, sourceData) {
        const result = [];
        const targetBase = normalizeSearch(baseSection);

        if (!sourceData || typeof sourceData !== "object") {
            return result;
        }

        const possibleSections =
            sourceData.sections ||
            sourceData.data ||
            sourceData.routines ||
            sourceData;

        if (
            !possibleSections ||
            typeof possibleSections !== "object" ||
            Array.isArray(possibleSections)
        ) {
            return result;
        }

        Object.keys(possibleSections).forEach(key => {
            const normalizedKey = normalizeSearch(key);

            if (
                normalizedKey === targetBase ||
                getBaseSection(normalizedKey) === targetBase
            ) {
                const classes =
                    extractClassesFromData(
                        possibleSections[key]
                    );

                classes.forEach(cls => {
                    result.push({
                        ...cls,
                        section:
                            cls.section ||
                            key
                    });
                });
            }
        });

        return deduplicateRawClasses(result);
    }

    // ============================================================
    // EXTRACT CLASSES
    // ============================================================

    function extractClassesFromData(data) {
        if (!data) return [];

        if (Array.isArray(data)) {
            return data;
        }

        if (typeof data !== "object") {
            return [];
        }

        const directKeys = [
            "classes",
            "routine",
            "schedule",
            "entries",
            "items"
        ];

        for (const key of directKeys) {
            if (Array.isArray(data[key])) {
                return data[key];
            }
        }

        if (data.sections && typeof data.sections === "object") {
            const result = [];

            Object.keys(data.sections).forEach(section => {
                const classes = extractClassesFromData(
                    data.sections[section]
                );

                classes.forEach(cls => {
                    result.push({
                        ...cls,
                        section:
                            cls.section ||
                            section
                    });
                });
            });

            return result;
        }

        return [];
    }

    // ============================================================
    // NORMALIZE CLASSES
    // ============================================================

    function normalizeClasses(classes, fallbackSection = "") {
        if (!Array.isArray(classes)) {
            return [];
        }

        return classes
            .map(cls => {
                const section =
                    cls.section ||
                    cls._section ||
                    cls.sub_section ||
                    cls.subSection ||
                    fallbackSection ||
                    "";

                const normalizedSection =
                    normalizeSearch(section);

                return {
                    ...cls,

                    day: normalizeDay(
                        cls.day ||
                        cls.weekday ||
                        cls.day_name
                    ),

                    time: normalizeTime(
                        cls.time ||
                        cls.slot ||
                        cls.class_time
                    ),

                    course:
                        cls.course ||
                        cls.course_code ||
                        cls.subject ||
                        cls.code ||
                        "",

                    teacher:
                        cls.teacher ||
                        cls.faculty ||
                        cls.instructor ||
                        "",

                    room:
                        cls.room ||
                        cls.room_no ||
                        cls.roomNumber ||
                        "",

                    section:
                        normalizedSection,

                    sub_section:
                        normalizeSearch(
                            cls.sub_section ||
                            cls.subSection ||
                            ""
                        ),

                    section_letter:
                        cls.section_letter ||
                        cls.sectionLetter ||
                        "",

                    batch:
                        cls.batch ||
                        extractBatchFromSection(
                            normalizedSection
                        ),

                    type:
                        normalizeClassType(
                            cls.type ||
                            cls.class_type ||
                            cls.classType ||
                            ""
                        )
                };
            })
            .filter(cls => cls.day && cls.time)
            .sort(sortClasses);
    }

    // ============================================================
    // SORT
    // ============================================================

    function sortClasses(a, b) {
        const dayA = DAY_INDEX[a.day] ?? 99;
        const dayB = DAY_INDEX[b.day] ?? 99;

        if (dayA !== dayB) {
            return dayA - dayB;
        }

        return getTimeStartMinutes(a.time) -
            getTimeStartMinutes(b.time);
    }

    function getTimeStartMinutes(time) {
        const slot = getClassTimeSlot({
            time
        });

        if (!slot) return 9999;

        return slot.start;
    }

    // ============================================================
    // TIME SLOT
    // ============================================================

    function getClassTimeSlot(cls) {
        let time = normalizeTime(cls.time);

        const parts = time.split("-");

        if (parts.length !== 2) {
            return null;
        }

        const start = parseAcademicTime(parts[0]);
        const end = parseAcademicTime(parts[1]);

        if (
            Number.isNaN(start) ||
            Number.isNaN(end)
        ) {
            return null;
        }

        return {
            start,
            end,
            label: time
        };
    }

    function parseAcademicTime(value) {
        const [hRaw, mRaw] = String(value)
            .split(":");

        let h = parseInt(hRaw, 10);
        const m = parseInt(mRaw || "0", 10);

        if (Number.isNaN(h)) return NaN;

        // Academic routine:
        // 08, 10, 11, 01, 02, 04, 05
        // 01/02 after noon should remain ordered after 11.
        if (h >= 1 && h <= 5) {
            h += 12;
        }

        return h * 60 + m;
    }

    // ============================================================
    // LAB
    // ============================================================

    function isTwoSlotLab(cls) {
        return (
            normalizeClassType(cls.type) === "Lab" &&
            normalizeTime(cls.time) === "11:30-02:30"
        );
    }

    // ============================================================
    // DISPLAY SECTION
    // ============================================================

    function displaySection(
        section,
        classes,
        data,
        loadedFrom
    ) {
        if (!routineContainer) return;

        currentClasses = classes;

        if (classes.length === 0) {
            showNoRoutine(section);
            return;
        }

        const semester =
            detectSemester(data);

        const sourceLink =
            getRoutineLink(data);

        routineContainer.innerHTML = `
            <div class="routine-summary">
                <div class="summary-main">
                    <div class="summary-label">SECTION</div>
                    <div class="summary-value">
                        ${escapeHtml(section)}
                    </div>
                </div>

                <div class="summary-info">
                    <span>
                        ${escapeHtml(semester)}
                    </span>

                    <span>
                        ${classes.length} Classes
                    </span>
                </div>
            </div>

            ${createRoutineLinkHtml(sourceLink)}

            <div class="routine-actions">
                <button
                    type="button"
                    class="routine-tab active"
                    data-tab="day"
                >
                    Day View
                </button>

                <button
                    type="button"
                    class="routine-tab"
                    data-tab="week"
                >
                    Week View
                </button>

                <button
                    type="button"
                    class="routine-download-btn"
                    id="downloadRoutineBtn"
                >
                    Download PNG
                </button>
            </div>

            <div id="routineView"></div>
        `;

        const view = routineContainer.querySelector(
            "#routineView"
        );

        renderDayView(
            view,
            classes,
            section
        );

        const tabs =
            routineContainer.querySelectorAll(
                ".routine-tab"
            );

        tabs.forEach(tab => {
            tab.addEventListener("click", () => {
                tabs.forEach(item =>
                    item.classList.remove("active")
                );

                tab.classList.add("active");

                if (tab.dataset.tab === "week") {
                    renderWeekView(
                        view,
                        classes,
                        section
                    );
                } else {
                    renderDayView(
                        view,
                        classes,
                        section
                    );
                }
            });
        });

        const downloadBtn =
            routineContainer.querySelector(
                "#downloadRoutineBtn"
            );

        if (downloadBtn) {
            downloadBtn.addEventListener(
                "click",
                () => downloadSection(
                    section,
                    classes,
                    data
                )
            );
        }
    }

    // ============================================================
    // DAY VIEW
    // ============================================================

    function renderDayView(
        container,
        classes,
        section
    ) {
        if (!container) return;

        const grouped = {};

        DAYS.forEach(day => {
            grouped[day] = [];
        });

        classes.forEach(cls => {
            if (!grouped[cls.day]) {
                grouped[cls.day] = [];
            }

            grouped[cls.day].push(cls);
        });

        let html = "";

        DAYS.forEach(day => {
            const dayClasses = grouped[day];

            const today =
                isToday(day);

            html += `
                <section class="day-card">
                    <div class="day-card-header">
                        <div>
                            <span class="day-name">
                                ${escapeHtml(day)}
                            </span>

                            ${
                                today
                                    ? `<span class="today-dot"></span>`
                                    : ""
                            }
                        </div>

                        <span class="day-count">
                            ${dayClasses.length}
                        </span>
                    </div>
            `;

            if (dayClasses.length === 0) {
                html += `
                    <div class="empty-day">
                        No class
                    </div>
                `;
            } else {
                dayClasses.forEach(cls => {
                    html += createClassCard(
                        cls,
                        section
                    );
                });
            }

            html += `</section>`;
        });

        container.innerHTML = html;
    }

    function createClassCard(
        cls,
        section
    ) {
        const comment =
            getDisplayComment(
                cls,
                section
            );

        const lab =
            normalizeClassType(cls.type) === "Lab";

        return `
            <article class="class-item ${lab ? "lab-class" : ""}">
                <div class="class-time">
                    ${escapeHtml(cls.time)}
                </div>

                <div class="class-main">
                    <div class="class-course">
                        ${escapeHtml(cls.course)}
                        ${comment
                            ? `<span class="class-section">
                                ${escapeHtml(comment)}
                               </span>`
                            : ""}
                    </div>

                    <div class="class-details">
                        <span>
                            ${escapeHtml(cls.teacher || "—")}
                        </span>

                        <span>
                            ${escapeHtml(cls.room || "—")}
                        </span>

                        ${
                            cls.type
                                ? `<span class="class-type">
                                    ${escapeHtml(cls.type)}
                                   </span>`
                                : ""
                        }
                    </div>
                </div>
            </article>
        `;
    }

    // ============================================================
    // WEEK TABLE MODEL
    // ============================================================

    function buildWeekTableModel(classes) {
        const model = {};

        DAYS.forEach(day => {
            model[day] = {};

            TIME_SLOTS.forEach((slot, index) => {
                model[day][index] = [];
            });
        });

        classes.forEach(cls => {
            const day = normalizeDay(cls.day);

            if (!model[day]) return;

            const normalizedTime =
                normalizeTime(cls.time);

            // 2-slot lab
            if (isTwoSlotLab(cls)) {
                model[day][2].push(cls);

                // Mark the second slot as occupied by
                // the same lab.
                model[day][3].push({
                    ...cls,
                    __continuedLab: true
                });

                return;
            }

            const index =
                TIME_INDEX[normalizedTime];

            if (
                index !== undefined
            ) {
                model[day][index].push(cls);
            }
        });

        return model;
    }

    // ============================================================
    // WEEK VIEW
    // ============================================================

    function renderWeekView(
        container,
        classes,
        section
    ) {
        if (!container) return;

        const model =
            buildWeekTableModel(classes);

        let html = `
            <div class="week-table-wrapper">
                <table class="week-routine-table">
                    <colgroup>
                        <col class="time-col">
                        ${DAYS.map(() =>
                            `<col class="day-col">`
                        ).join("")}
                    </colgroup>

                    <thead>
                        <tr>
                            <th>TIME</th>
                            ${DAYS.map(day => `
                                <th class="${isToday(day) ? "today-header" : ""}">
                                    <span>
                                        ${escapeHtml(day.slice(0, 3))}
                                    </span>
                                    ${
                                        isToday(day)
                                            ? `<i class="today-mini-dot"></i>`
                                            : ""
                                    }
                                </th>
                            `).join("")}
                        </tr>
                    </thead>

                    <tbody>
        `;

        for (
            let slotIndex = 0;
            slotIndex < TIME_SLOTS.length;
            slotIndex++
        ) {
            const slot = TIME_SLOTS[slotIndex];

            html += `
                <tr>
                    <th class="time-cell">
                        ${escapeHtml(slot)}
                    </th>
            `;

            DAYS.forEach(day => {
                const classesAtSlot =
                    model[day]?.[slotIndex] || [];

                // If this is second half of a 2-slot lab,
                // don't create another TD.
                if (
                    slotIndex === 3 &&
                    model[day]?.[2]?.some(
                        isTwoSlotLab
                    )
                ) {
                    return;
                }

                // 2-slot lab starts at 11:30
                const labs =
                    slotIndex === 2
                        ? classesAtSlot.filter(
                            isTwoSlotLab
                        )
                        : [];

                if (labs.length > 0) {
                    const lab = labs[0];

                    const overlap =
                        classesAtSlot.filter(
                            cls => cls !== lab
                        );

                    html += `
                        <td
                            rowspan="2"
                            class="
                                routine-cell
                                lab-cell
                                ${isToday(day) ? "today-cell" : ""}
                            "
                        >
                            ${createWeekClassHtml(
                                lab,
                                section,
                                overlap
                            )}
                        </td>
                    `;

                    return;
                }

                if (classesAtSlot.length === 0) {
                    html += `
                        <td
                            class="
                                routine-cell
                                empty-cell
                                ${isToday(day) ? "today-cell" : ""}
                        ">
                            <span class="empty-mark">—</span>
                        </td>
                    `;

                    return;
                }

                html += `
                    <td
                        class="
                            routine-cell
                            ${isToday(day) ? "today-cell" : ""}
                        "
                    >
                        ${classesAtSlot
                            .map(cls =>
                                createWeekClassHtml(
                                    cls,
                                    section
                                )
                            )
                            .join("")}
                    </td>
                `;
            });

            html += `</tr>`;
        }

        html += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
    }

    function createWeekClassHtml(
        cls,
        section,
        overlap = []
    ) {
        const comment =
            getDisplayComment(
                cls,
                section
            );

        const lab =
            normalizeClassType(cls.type) === "Lab";

        let html = `
            <div class="
                week-class
                ${lab ? "week-lab" : "week-theory"}
            ">
                <div class="week-course">
                    ${escapeHtml(cls.course)}
                    ${
                        comment
                            ? `<small>
                                ${escapeHtml(comment)}
                               </small>`
                            : ""
                    }
                </div>

                <div class="week-teacher">
                    ${escapeHtml(cls.teacher || "—")}
                </div>

                <div class="week-room">
                    ${escapeHtml(cls.room || "—")}
                </div>

                ${
                    lab
                        ? `<span class="week-type">LAB</span>`
                        : ""
                }
            </div>
        `;

        if (overlap.length > 0) {
            html += `
                <div class="week-overlap">
                    +${overlap.length} overlap
                </div>
            `;
        }

        return html;
    }

    // ============================================================
    // TEACHER MODE
    // ============================================================

    function displayTeacherRoutine(search) {
        if (!routineData) return;

        const term =
            normalizeSearch(search);

        const classes =
            getAllRoutineClasses()
                .filter(cls => {
                    const teacher =
                        normalizeSearch(
                            cls.teacher
                        );

                    return (
                        teacher === term ||
                        teacher.includes(term)
                    );
                })
                .map(cls => ({
                    ...cls,
                    _section:
                        cls.section ||
                        cls._section ||
                        ""
                }));

        currentClasses = classes;
        currentSearchTerm = search;

        if (classes.length === 0) {
            showNoRoutine(
                `Teacher: ${search}`
            );
            return;
        }

        displayGenericRoutine(
            `Teacher: ${search}`,
            classes,
            "teacher"
        );
    }

    // ============================================================
    // ROOM MODE
    // ============================================================

    function displayRoomRoutine(search) {
        if (!routineData) return;

        const term =
            normalizeSearch(search);

        const classes =
            getAllRoutineClasses()
                .filter(cls => {
                    const room =
                        normalizeSearch(
                            cls.room
                        );

                    return (
                        room === term ||
                        room.includes(term)
                    );
                })
                .map(cls => ({
                    ...cls,
                    _section:
                        cls.section ||
                        cls._section ||
                        ""
                }));

        currentClasses = classes;
        currentSearchTerm = search;

        if (classes.length === 0) {
            showNoRoutine(
                `Room: ${search}`
            );
            return;
        }

        displayGenericRoutine(
            `Room: ${search}`,
            classes,
            "room"
        );
    }

    // ============================================================
    // GENERIC ROUTINE
    // ============================================================

    function displayGenericRoutine(
        title,
        classes,
        mode
    ) {
        if (!routineContainer) return;

        const normalized =
            normalizeClasses(
                classes
            );

        routineContainer.innerHTML = `
            <div class="routine-summary">
                <div class="summary-main">
                    <div class="summary-label">
                        ${escapeHtml(
                            mode.toUpperCase()
                        )}
                    </div>

                    <div class="summary-value">
                        ${escapeHtml(title.replace(
                            /^[^:]+:\s*/,
                            ""
                        ))}
                    </div>
                </div>

                <div class="summary-info">
                    <span>
                        ${normalized.length} Classes
                    </span>
                </div>
            </div>

            <div class="routine-actions">
                <button
                    type="button"
                    class="routine-tab active"
                    data-tab="day"
                >
                    Day View
                </button>

                <button
                    type="button"
                    class="routine-tab"
                    data-tab="week"
                >
                    Week View
                </button>
            </div>

            <div id="routineView"></div>
        `;

        const view =
            routineContainer.querySelector(
                "#routineView"
            );

        renderDayView(
            view,
            normalized,
            ""
        );

        const tabs =
            routineContainer.querySelectorAll(
                ".routine-tab"
            );

        tabs.forEach(tab => {
            tab.addEventListener("click", () => {
                tabs.forEach(t =>
                    t.classList.remove("active")
                );

                tab.classList.add("active");

                if (tab.dataset.tab === "week") {
                    renderWeekView(
                        view,
                        normalized,
                        ""
                    );
                } else {
                    renderDayView(
                        view,
                        normalized,
                        ""
                    );
                }
            });
        });
    }

    // ============================================================
    // EMPTY ROOM
    // ============================================================

    function displayEmptyRooms(filter = "") {
        if (!routineContainer) return;

        const classes =
            getAllRoutineClasses();

        const rooms =
            getAllRooms(classes);

        currentRooms = rooms;

        const dayFilter =
            getDayFromInput(filter);

        const roomFilter =
            normalizeSearch(filter);

        let html = `
            <div class="empty-room-header">
                <div>
                    <div class="summary-label">
                        EMPTY ROOMS
                    </div>

                    <h2>
                        Available Rooms
                    </h2>
                </div>

                <div class="empty-room-total">
                    ${rooms.length} rooms
                </div>
            </div>
        `;

        DAYS.forEach(day => {
            if (
                dayFilter &&
                day !== dayFilter
            ) {
                return;
            }

            const occupied = new Set();

            classes
                .filter(cls => cls.day === day)
                .forEach(cls => {
                    splitRooms(cls.room)
                        .forEach(room => {
                            occupied.add(
                                normalizeRoom(room)
                            );
                        });
                });

            let available =
                rooms.filter(
                    room =>
                        !occupied.has(
                            normalizeRoom(room)
                        )
                );

            if (
                roomFilter &&
                !dayFilter
            ) {
                available =
                    available.filter(room =>
                        normalizeSearch(room)
                            .includes(roomFilter)
                    );
            }

            html += `
                <section class="empty-room-card">
                    <div class="empty-room-card-header">
                        <div>
                            ${escapeHtml(day)}

                            ${
                                isToday(day)
                                    ? `<span class="today-dot"></span>`
                                    : ""
                            }
                        </div>

                        <span>
                            ${available.length}
                        </span>
                    </div>

                    <div class="room-list">
                        ${
                            available.length
                                ? available
                                    .map(room => `
                                        <span class="room-pill">
                                            ${escapeHtml(room)}
                                        </span>
                                    `)
                                    .join("")
                                : `
                                    <div class="no-room">
                                        No available room
                                    </div>
                                `
                        }
                    </div>
                </section>
            `;
        });

        routineContainer.innerHTML = html;
    }

    function getAllRooms(classes) {
        const set = new Set();

        classes.forEach(cls => {
            splitRooms(cls.room)
                .forEach(room => {
                    const normalized =
                        normalizeRoom(room);

                    if (normalized) {
                        set.add(normalized);
                    }
                });
        });

        return Array.from(set)
            .sort(naturalSort);
    }

    function splitRooms(room) {
        if (!room) return [];

        return String(room)
            .split(/[,/]+/)
            .map(item => item.trim())
            .filter(Boolean);
    }

    function normalizeRoom(room) {
        return String(room || "")
            .trim()
            .toUpperCase()
            .replace(/\s+/g, " ");
    }

    function getDayFromInput(input) {
        const value =
            String(input || "")
                .trim()
                .toLowerCase();

        if (!value) return null;

        const found =
            DAYS.find(day =>
                day.toLowerCase() === value
            );

        if (found) return found;

        return DAYS.find(day =>
            day
                .toLowerCase()
                .startsWith(value)
        ) || null;
    }

    // ============================================================
    // ALL ROUTINE CLASSES
    // ============================================================

    function getAllRoutineClasses() {
        if (!routineData) return [];

        let all = [];

        if (Array.isArray(routineData)) {
            all = routineData;
        } else if (
            routineData.sections &&
            typeof routineData.sections === "object"
        ) {
            Object.keys(
                routineData.sections
            ).forEach(section => {
                const classes =
                    extractClassesFromData(
                        routineData.sections[section]
                    );

                classes.forEach(cls => {
                    all.push({
                        ...cls,
                        section:
                            cls.section ||
                            section
                    });
                });
            });
        } else {
            const extracted =
                extractClassesFromData(
                    routineData
                );

            if (extracted.length) {
                all = extracted;
            } else {
                Object.keys(routineData)
                    .forEach(key => {
                        if (
                            typeof routineData[key] ===
                            "object"
                        ) {
                            const classes =
                                extractClassesFromData(
                                    routineData[key]
                                );

                            classes.forEach(cls => {
                                all.push({
                                    ...cls,
                                    section:
                                        cls.section ||
                                        key
                                });
                            });
                        }
                    });
            }
        }

        return normalizeClasses(
            deduplicateRawClasses(all)
        );
    }

    // ============================================================
    // SECTION COMMENT
    // ============================================================

    function getDisplayComment(
        cls,
        currentSection = ""
    ) {
        const section =
            normalizeSearch(
                cls.section ||
                cls._section ||
                cls.sub_section ||
                ""
            );

        if (!section) {
            return "";
        }

        const current =
            normalizeSearch(
                currentSection
            );

        // In main section mode don't show
        // section label for same/main section.
        if (
            current &&
            section === current
        ) {
            return "";
        }

        const base =
            getBaseSection(
                current || section
            );

        if (
            section === base
        ) {
            return "";
        }

        if (
            section.startsWith(base + "_")
        ) {
            return `(${section.slice(
                base.length + 1
            )})`;
        }

        const suffix =
            section.match(
                /(?:^|_)(N\d+)$/
            );

        if (suffix) {
            return `(${suffix[1]})`;
        }

        return `(${section})`;
    }

    // ============================================================
    // BASE SECTION
    // ============================================================

    function getBaseSection(section) {
        return normalizeSearch(section)
            .replace(/_\d+$/, "");
    }

    function extractBatchFromSection(section) {
        const value =
            normalizeSearch(section);

        const match =
            value.match(/^(\d+)/);

        return match
            ? match[1]
            : "";
    }

    function extractSectionLetter(section) {
        const value =
            normalizeSearch(section);

        const match =
            value.match(/_(N|[A-Z])(?:\d+)?$/);

        return match
            ? match[1]
            : "";
    }

    // ============================================================
    // DUPLICATES
    // ============================================================

    function deduplicateRawClasses(classes) {
        const map = new Map();

        classes.forEach(cls => {
            const key = [
                cls.day,
                cls.time,
                cls.course,
                cls.teacher,
                cls.room,
                cls.sub_section,
                cls.section,
                cls._section
            ]
                .map(value =>
                    normalizeSearch(value)
                )
                .join("|");

            if (!map.has(key)) {
                map.set(key, cls);
            }
        });

        return Array.from(map.values());
    }

    // ============================================================
    // META
    // ============================================================

    function detectSemester(data) {
        const explicit =
            data?.semester ||
            data?.meta?.semester ||
            data?.metadata?.semester;

        if (explicit) {
            return String(explicit);
        }

        const date =
            data?.updated ||
            data?.updatedAt ||
            data?.lastUpdated ||
            data?.meta?.updated ||
            data?.metadata?.updated;

        const parsed =
            date
                ? new Date(date)
                : new Date();

        const month =
            parsed.getMonth() + 1;

        if (month >= 1 && month <= 4) {
            return "Spring";
        }

        if (month >= 5 && month <= 8) {
            return "Summer";
        }

        return "Fall";
    }

    function updateMeta(data) {
        if (!data) return;

        const meta =
            data.meta ||
            data.metadata ||
            data;

        const version =
            meta.version ||
            meta.dataVersion ||
            "";

        const updated =
            meta.updated ||
            meta.updatedAt ||
            meta.lastUpdated ||
            "";

        if (versionEl) {
            versionEl.textContent =
                version
                    ? `v${version}`
                    : "";
        }

        if (lastUpdatedEl) {
            lastUpdatedEl.textContent =
                updated
                    ? formatDate(updated)
                    : "";
        }
    }

    function formatDate(value) {
        const date =
            new Date(value);

        if (Number.isNaN(
            date.getTime()
        )) {
            return String(value);
        }

        return date.toLocaleDateString(
            "en-BD",
            {
                day: "2-digit",
                month: "short",
                year: "numeric"
            }
        );
    }

    // ============================================================
    // SOURCE LINK
    // ============================================================

    function getRoutineLink(data) {
        if (!data) return "";

        const candidates = [
            data.routineLink,
            data.routineUrl,
            data.source,
            data.sourceUrl,
            data.officialUrl,
            data.pdfUrl,
            data.url,

            data.meta?.routineLink,
            data.meta?.routineUrl,
            data.meta?.source,
            data.meta?.sourceUrl,
            data.meta?.officialUrl,
            data.meta?.pdfUrl,
            data.meta?.url,

            data.metadata?.routineLink,
            data.metadata?.routineUrl,
            data.metadata?.source,
            data.metadata?.sourceUrl,
            data.metadata?.officialUrl,
            data.metadata?.pdfUrl,
            data.metadata?.url
        ];

        return candidates.find(
            value =>
                typeof value === "string" &&
                value.trim()
        ) || "";
    }

    function createRoutineLinkHtml(url) {
        if (!url) return "";

        return `
            <div class="routine-source">
                <a
                    href="${escapeAttribute(url)}"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    View Official Routine Source
                </a>
            </div>
        `;
    }

    // ============================================================
    // TODAY
    // ============================================================

    function isToday(day) {
        const jsDay =
            new Date().getDay();

        // JS:
        // 0 Sunday
        // 1 Monday
        // ...
        // 6 Saturday

        const map = [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday"
        ];

        return map[jsDay] === day;
    }

    // ============================================================
    // DOWNLOAD PNG
    // ============================================================

    async function downloadSection(
        section,
        classes,
        data
    ) {
        try {
            setStatus("Preparing PNG...");

            await loadHtml2Canvas();

            const card =
                createRoutineDownloadCard(
                    section,
                    classes,
                    data
                );

            document.body.appendChild(card);

            // Give browser a moment to calculate layout.
            await new Promise(resolve =>
                requestAnimationFrame(() =>
                    requestAnimationFrame(resolve)
                )
            );

            const canvas =
                await window.html2canvas(
                    card,
                    {
                        scale: 2,
                        useCORS: true,
                        allowTaint: false,
                        backgroundColor: "#F8FAFC",
                        logging: false,
                        imageTimeout: 15000,
                        width: card.scrollWidth,
                        height: card.scrollHeight,
                        windowWidth: card.scrollWidth
                    }
                );

            const link =
                document.createElement("a");

            link.download =
                `DIU-CSE-Routine-${section}.png`;

            link.href =
                canvas.toDataURL(
                    "image/png",
                    1.0
                );

            link.click();

            card.remove();

            setStatus("PNG downloaded");
        } catch (error) {
            console.error(
                "PNG download error:",
                error
            );

            showMessage(
                "Could not generate PNG.",
                "error"
            );

            setStatus("PNG failed");
        }
    }

    // ============================================================
    // HTML2CANVAS
    // ============================================================

    function loadHtml2Canvas() {
        if (window.html2canvas) {
            return Promise.resolve();
        }

        return new Promise(
            (resolve, reject) => {
                const script =
                    document.createElement(
                        "script"
                    );

                script.src =
                    "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";

                script.onload =
                    () => resolve();

                script.onerror =
                    () => reject(
                        new Error(
                            "html2canvas could not load"
                        )
                    );

                document.head.appendChild(
                    script
                );
            }
        );
    }

    // ============================================================
    // DOWNLOAD CARD
    // ============================================================

    function createRoutineDownloadCard(
        section,
        classes,
        data
    ) {
        const semester =
            detectSemester(data);

        const version =
            data?.version ||
            data?.meta?.version ||
            data?.metadata?.version ||
            "";

        const updated =
            data?.updated ||
            data?.updatedAt ||
            data?.lastUpdated ||
            data?.meta?.updated ||
            data?.metadata?.updated ||
            "";

        const model =
            buildWeekTableModel(classes);

        const wrapper =
            document.createElement("div");

        wrapper.style.position = "fixed";
        wrapper.style.left = "-100000px";
        wrapper.style.top = "0";
        wrapper.style.width = "1680px";
        wrapper.style.boxSizing = "border-box";
        wrapper.style.padding = "48px";
        wrapper.style.background = "#F8FAFC";
        wrapper.style.fontFamily =
            "Arial, Helvetica, sans-serif";
        wrapper.style.color = "#0F172A";
        wrapper.style.zIndex = "-9999";

        const rows =
            TIME_SLOTS.map(
                (slot, slotIndex) => {
                    let row = `
                        <tr>
                            <td style="
                                width:155px;
                                min-width:155px;
                                padding:18px 14px;
                                text-align:center;
                                vertical-align:middle;
                                background:#F1F5F9;
                                border-right:1px solid #CBD5E1;
                                border-bottom:1px solid #CBD5E1;
                                color:#475569;
                                font-size:16px;
                                font-weight:700;
                                white-space:nowrap;
                            ">
                                ${escapeHtml(slot)}
                            </td>
                    `;

                    DAYS.forEach(day => {
                        const list =
                            model[day]?.[slotIndex] ||
                            [];

                        // second half of rowspan
                        if (
                            slotIndex === 3 &&
                            model[day]?.[2]?.some(
                                isTwoSlotLab
                            )
                        ) {
                            return;
                        }

                        const today =
                            isToday(day);

                        const labs =
                            slotIndex === 2
                                ? list.filter(
                                    isTwoSlotLab
                                )
                                : [];

                        if (labs.length) {
                            const lab =
                                labs[0];

                            const overlap =
                                list.filter(
                                    item =>
                                        item !== lab
                                );

                            row += `
                                <td
                                    rowspan="2"
                                    style="
                                        width:calc((100% - 155px) / 7);
                                        padding:12px;
                                        vertical-align:top;
                                        background:${today ? "#ECFDF5" : "#FFFBEB"};
                                        border-right:1px solid #CBD5E1;
                                        border-bottom:1px solid #CBD5E1;
                                    "
                                >
                                    ${createDownloadClassHtml(
                                        lab,
                                        section,
                                        true,
                                        overlap
                                    )}
                                </td>
                            `;

                            return;
                        }

                        if (!list.length) {
                            row += `
                                <td style="
                                    width:calc((100% - 155px) / 7);
                                    height:92px;
                                    text-align:center;
                                    vertical-align:middle;
                                    background:${today ? "#F0FDF4" : "#FFFFFF"};
                                    border-right:1px solid #CBD5E1;
                                    border-bottom:1px solid #CBD5E1;
                                    color:#CBD5E1;
                                    font-size:22px;
                                ">
                                    —
                                </td>
                            `;

                            return;
                        }

                        row += `
                            <td style="
                                width:calc((100% - 155px) / 7);
                                padding:12px;
                                vertical-align:top;
                                background:${today ? "#ECFDF5" : "#FFFFFF"};
                                border-right:1px solid #CBD5E1;
                                border-bottom:1px solid #CBD5E1;
                            ">
                                ${list
                                    .map(cls =>
                                        createDownloadClassHtml(
                                            cls,
                                            section,
                                            false
                                        )
                                    )
                                    .join("")}
                            </td>
                        `;
                    });

                    row += "</tr>";

                    return row;
                }
            ).join("");

        const dayHeaders =
            DAYS.map(day => {
                const today =
                    isToday(day);

                return `
                    <th style="
                        height:62px;
                        padding:12px 8px;
                        text-align:center;
                        vertical-align:middle;
                        background:${today ? "#DCFCE7" : "#E2E8F0"};
                        border-right:1px solid #CBD5E1;
                        border-bottom:1px solid #CBD5E1;
                        color:${today ? "#166534" : "#334155"};
                        font-size:17px;
                        font-weight:800;
                    ">
                        ${escapeHtml(day)}
                        ${
                            today
                                ? `<div style="
                                    margin-top:5px;
                                    font-size:11px;
                                    font-weight:700;
                                    letter-spacing:1px;
                                ">TODAY</div>`
                                : ""
                        }
                    </th>
                `;
            }).join("");

        wrapper.innerHTML = `
            <div style="
                background:#FFFFFF;
                border:1px solid #E2E8F0;
                border-radius:24px;
                overflow:hidden;
                box-shadow:0 12px 30px rgba(15,23,42,0.08);
            ">

                <!-- HEADER -->
                <div style="
                    padding:36px 42px;
                    background:#0F172A;
                    color:#FFFFFF;
                ">
                    <div style="
                        font-size:18px;
                        font-weight:800;
                        letter-spacing:2px;
                        color:#93C5FD;
                        margin-bottom:8px;
                    ">
                        DIU
                    </div>

                    <div style="
                        font-size:32px;
                        line-height:1.2;
                        font-weight:800;
                        margin-bottom:7px;
                    ">
                        Daffodil International University
                    </div>

                    <div style="
                        font-size:19px;
                        color:#CBD5E1;
                        font-weight:600;
                    ">
                        Department of Computer Science & Engineering
                    </div>

                    <div style="
                        margin-top:26px;
                        display:flex;
                        gap:10px;
                        align-items:center;
                    ">
                        <span style="
                            display:inline-block;
                            padding:10px 18px;
                            border-radius:999px;
                            background:#2563EB;
                            color:#FFFFFF;
                            font-size:16px;
                            font-weight:800;
                        ">
                            SECTION ${escapeHtml(section)}
                        </span>

                        <span style="
                            display:inline-block;
                            padding:10px 18px;
                            border-radius:999px;
                            background:#1E293B;
                            border:1px solid #475569;
                            color:#E2E8F0;
                            font-size:16px;
                            font-weight:700;
                        ">
                            ${escapeHtml(semester)}
                        </span>

                        ${
                            version
                                ? `
                                    <span style="
                                        display:inline-block;
                                        padding:10px 18px;
                                        border-radius:999px;
                                        background:#1E293B;
                                        border:1px solid #475569;
                                        color:#E2E8F0;
                                        font-size:16px;
                                        font-weight:700;
                                    ">
                                        v${escapeHtml(version)}
                                    </span>
                                `
                                : ""
                        }
                    </div>
                </div>

                <!-- TITLE -->
                <div style="
                    padding:28px 42px 20px;
                    background:#FFFFFF;
                ">
                    <div style="
                        font-size:25px;
                        font-weight:800;
                        color:#0F172A;
                    ">
                        Class Routine
                    </div>

                    <div style="
                        margin-top:6px;
                        color:#64748B;
                        font-size:15px;
                    ">
                        Weekly schedule • ${classes.length} classes
                    </div>
                </div>

                <!-- TABLE -->
                <div style="
                    padding:0 28px 30px;
                    background:#FFFFFF;
                ">
                    <table style="
                        width:100%;
                        table-layout:fixed;
                        border-collapse:separate;
                        border-spacing:0;
                        border:1px solid #CBD5E1;
                        border-radius:14px;
                        overflow:hidden;
                        background:#FFFFFF;
                    ">
                        <colgroup>
                            <col style="width:155px;">
                            ${DAYS.map(() =>
                                `<col style="width:auto;">`
                            ).join("")}
                        </colgroup>

                        <thead>
                            <tr>
                                <th style="
                                    height:62px;
                                    padding:12px;
                                    background:#1E293B;
                                    color:#FFFFFF;
                                    border-right:1px solid #475569;
                                    border-bottom:1px solid #475569;
                                    font-size:16px;
                                    font-weight:800;
                                ">
                                    TIME
                                </th>

                                ${dayHeaders}
                            </tr>
                        </thead>

                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>

                <!-- LEGEND -->
                <div style="
                    padding:20px 42px;
                    border-top:1px solid #E2E8F0;
                    background:#F8FAFC;
                    display:flex;
                    align-items:center;
                    gap:26px;
                    font-size:14px;
                    color:#475569;
                    font-weight:600;
                ">
                    <span>
                        <span style="
                            display:inline-block;
                            width:12px;
                            height:12px;
                            border-radius:3px;
                            background:#EFF6FF;
                            border:1px solid #BFDBFE;
                            margin-right:7px;
                        "></span>
                        Theory
                    </span>

                    <span>
                        <span style="
                            display:inline-block;
                            width:12px;
                            height:12px;
                            border-radius:3px;
                            background:#FFFBEB;
                            border:1px solid #FDE68A;
                            margin-right:7px;
                        "></span>
                        Lab
                    </span>

                    <span>
                        <span style="
                            display:inline-block;
                            width:12px;
                            height:12px;
                            border-radius:3px;
                            background:#DCFCE7;
                            border:1px solid #BBF7D0;
                            margin-right:7px;
                        "></span>
                        Today
                    </span>
                </div>

                <!-- FOOTER -->
                <div style="
                    padding:22px 42px 26px;
                    background:#0F172A;
                    color:#94A3B8;
                    font-size:13px;
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                ">
                    <span>
                        Generated by DIU CSE Routine
                    </span>

                    <span>
                        ${
                            updated
                                ? `Last updated: ${escapeHtml(
                                    formatDate(updated)
                                )} • `
                                : ""
                        }
                        Generated:
                        ${escapeHtml(
                            new Date().toLocaleString(
                                "en-BD"
                            )
                        )}
                    </span>
                </div>

            </div>
        `;

        return wrapper;
    }

    // ============================================================
    // DOWNLOAD CLASS HTML
    // ============================================================

    function createDownloadClassHtml(
        cls,
        section,
        isLab = false,
        overlap = []
    ) {
        const comment =
            getDisplayComment(
                cls,
                section
            );

        const background =
            isLab
                ? "#FFFBEB"
                : "#EFF6FF";

        const border =
            isLab
                ? "#FDE68A"
                : "#BFDBFE";

        const accent =
            isLab
                ? "#D97706"
                : "#2563EB";

        const type =
            isLab
                ? "LAB"
                : "THEORY";

        let html = `
            <div style="
                padding:13px 14px;
                margin-bottom:${overlap.length ? "7px" : "0"};
                background:${background};
                border:1px solid ${border};
                border-left:4px solid ${accent};
                border-radius:10px;
                box-sizing:border-box;
            ">
                <div style="
                    font-size:18px;
                    line-height:1.25;
                    font-weight:800;
                    color:#0F172A;
                    margin-bottom:7px;
                ">
                    ${escapeHtml(cls.course)}
                    ${
                        comment
                            ? `<span style="
                                font-size:13px;
                                color:#64748B;
                                font-weight:700;
                                margin-left:4px;
                            ">
                                ${escapeHtml(comment)}
                               </span>`
                            : ""
                    }
                </div>

                <div style="
                    font-size:14px;
                    color:#334155;
                    font-weight:700;
                    line-height:1.45;
                ">
                    ${escapeHtml(
                        cls.teacher || "Teacher —"
                    )}
                </div>

                <div style="
                    margin-top:4px;
                    font-size:14px;
                    color:#475569;
                    font-weight:600;
                ">
                    Room:
                    ${escapeHtml(
                        cls.room || "—"
                    )}
                </div>

                <div style="
                    margin-top:9px;
                    font-size:10px;
                    font-weight:900;
                    letter-spacing:1px;
                    color:${accent};
                ">
                    ${type}
                </div>
            </div>
        `;

        if (overlap.length) {
            html += `
                <div style="
                    padding:8px 10px;
                    border-radius:8px;
                    background:#FEF2F2;
                    border:1px solid #FECACA;
                    color:#B91C1C;
                    font-size:11px;
                    font-weight:800;
                ">
                    ${overlap.length} overlapping class
                </div>
            `;
        }

        return html;
    }

    // ============================================================
    // SAVED CHIP
    // ============================================================

    function updateSavedChip(section) {
        if (!savedChip) return;

        savedChip.textContent =
            section
                ? `Saved: ${section}`
                : "";
    }

    // ============================================================
    // STATUS
    // ============================================================

    function setStatus(message) {
        if (!statusEl) return;

        statusEl.textContent =
            message;
    }

    function showMessage(
        message,
        type = "info"
    ) {
        if (!messageEl) return;

        messageEl.textContent =
            message;

        messageEl.className =
            `message ${type}`;

        messageEl.style.display =
            "block";

        clearTimeout(
            showMessage._timer
        );

        showMessage._timer =
            setTimeout(() => {
                if (messageEl) {
                    messageEl.style.display =
                        "none";
                }
            }, 5000);
    }

    function showNoRoutine(name) {
        if (!routineContainer) return;

        routineContainer.innerHTML = `
            <div class="no-routine">
                <div class="no-routine-icon">
                    📅
                </div>

                <h3>
                    No routine found
                </h3>

                <p>
                    No classes were found for
                    <strong>
                        ${escapeHtml(name)}
                    </strong>.
                </p>
            </div>
        `;
    }

    // ============================================================
    // CLEAR
    // ============================================================

    function clearSearch() {
        if (sectionInput) {
            sectionInput.value = "";
            sectionInput.focus();
        }

        currentSearchTerm = "";
        currentClasses = [];

        if (currentMode === "empty-room") {
            displayEmptyRooms("");
            return;
        }

        if (routineContainer) {
            routineContainer.innerHTML = "";
        }

        setStatus("Ready");
    }

    // ============================================================
    // NATURAL SORT
    // ============================================================

    function naturalSort(a, b) {
        return String(a).localeCompare(
            String(b),
            undefined,
            {
                numeric: true,
                sensitivity: "base"
            }
        );
    }

    // ============================================================
    // HELPERS
    // ============================================================

    function capitalizeFirst(value) {
        if (!value) return "";

        return (
            value.charAt(0).toUpperCase() +
            value.slice(1)
        );
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function escapeAttribute(value) {
        return escapeHtml(value);
    }

    // ============================================================
    // AUTO REFRESH
    // ============================================================

    setInterval(async () => {
        try {
            const previousMode =
                currentMode;

            await loadRoutineData();

            if (
                previousMode === "section"
            ) {
                const saved =
                    localStorage.getItem(
                        STORAGE_KEY
                    );

                if (saved) {
                    await loadSection(
                        saved,
                        false
                    );
                }
            }

            if (
                previousMode === "teacher" &&
                currentSearchTerm
            ) {
                displayTeacherRoutine(
                    currentSearchTerm
                );
            }

            if (
                previousMode === "room" &&
                currentSearchTerm
            ) {
                displayRoomRoutine(
                    currentSearchTerm
                );
            }

            if (
                previousMode === "empty-room"
            ) {
                displayEmptyRooms(
                    currentSearchTerm
                );
            }
        } catch (error) {
            console.error(
                "Auto refresh failed:",
                error
            );
        }
    }, 5 * 60 * 1000);

    // ============================================================
    // GLOBAL DOWNLOAD FUNCTION
    // ============================================================

    window.downloadSection =
        downloadSection;

})();
