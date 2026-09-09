/* =========================================================
   DIU CSE ROUTINE - FULL JAVASCRIPT
   ========================================================= */

const STORAGE_KEY = 'diu_cse_section';
const MODE_KEY = 'diu_cse_mode';

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

const TIME_SLOTS = [
    '08:30-10:00',
    '10:00-11:30',
    '11:30-01:00',
    '01:00-02:30',
    '02:30-04:00',
    '04:00-05:30'
];

let routineData = null;
let currentSection = '';
let currentMode = localStorage.getItem(MODE_KEY) || 'section';
let refreshTimer = null;


/* =========================================================
   BASIC HELPERS
   ========================================================= */

function normalizeText(value) {
    return String(value ?? '')
        .trim()
        .replace(/\s+/g, ' ');
}

function normalizeSection(value) {
    return normalizeText(value)
        .toUpperCase()
        .replace(/\s+/g, '_');
}

function getBaseSection(section) {
    return normalizeSection(section).replace(/_\d+$/, '');
}

function normalizeDay(value) {
    const text = normalizeText(value).toLowerCase();

    const map = {
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
        thur: 'Thursday',
        thurs: 'Thursday',
        thursday: 'Thursday',
        fri: 'Friday',
        friday: 'Friday'
    };

    return map[text] || value;
}

function normalizeTime(value) {
    if (!value) return '';

    return String(value)
        .trim()
        .replace(/\s+/g, '')
        .replace(/[–—]/g, '-');
}

function normalizeClassType(value) {
    const type = normalizeText(value).toLowerCase();

    if (type.includes('lab')) return 'Lab';
    if (type.includes('theory')) return 'Theory';

    return value ? normalizeText(value) : 'Theory';
}

function getTimeStartMinutes(time) {
    if (!time) return 99999;

    const normalized = normalizeTime(time);
    const firstPart = normalized.split('-')[0];

    const match = firstPart.match(/^(\d{1,2}):(\d{2})$/);

    if (!match) return 99999;

    let hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);

    if (hour < 8) {
        hour += 12;
    }

    return hour * 60 + minute;
}

function getTimeOrder(time) {
    const normalized = normalizeTime(time);

    const index = TIME_SLOTS.indexOf(normalized);

    if (index !== -1) return index;

    if (normalized === '11:30-02:30') return 2;

    return 999;
}

function getClassTimeSlot(time) {
    const normalized = normalizeTime(time);

    if (normalized === '11:30-02:30') {
        return {
            start: 2,
            span: 2
        };
    }

    const index = TIME_SLOTS.indexOf(normalized);

    if (index !== -1) {
        return {
            start: index,
            span: 1
        };
    }

    return {
        start: -1,
        span: 1
    };
}


/* =========================================================
   SUBSECTION / COMMENT
   ========================================================= */

function getDisplayComment(cls, mode = currentMode) {
    if (!cls) return '';

    if (mode === 'teacher' || mode === 'room') {
        const section =
            cls.section ||
            cls.section_name ||
            cls.sectionName ||
            '';

        return section ? `(${section})` : '';
    }

    if (mode === 'empty-room') {
        return '';
    }

    const section =
        cls.section ||
        cls.section_name ||
        cls.sectionName ||
        '';

    const subsection =
        cls.sub_section ??
        cls.subSection ??
        cls.subsection ??
        cls.subsection_name ??
        '';

    if (!subsection || String(subsection).toLowerCase() === 'main') {
        return '';
    }

    const sec = String(section).toUpperCase();
    const sub = String(subsection).toUpperCase();

    if (/^\d+$/.test(sub)) {
        const lastLetter = sec.match(/[A-Z]$/);

        if (lastLetter) {
            return `(${lastLetter[0]}${sub})`;
        }

        return `(${sub})`;
    }

    if (/^[A-Z]\d+$/.test(sub)) {
        return `(${sub})`;
    }

    return `(${sub})`;
}


/* =========================================================
   NORMALIZE CLASS DATA
   ========================================================= */

function normalizeClasses(classes, fallbackSection = '') {
    if (!Array.isArray(classes)) return [];

    return classes.map(item => {
        const section =
            item.section ||
            item.section_name ||
            item.sectionName ||
            fallbackSection ||
            '';

        const subSection =
            item.sub_section ??
            item.subSection ??
            item.subsection ??
            item.subsection_name ??
            'Main';

        const course =
            item.course ||
            item.course_code ||
            item.courseCode ||
            '';

        const teacher =
            item.teacher ||
            item.faculty ||
            item.teacher_initials ||
            '';

        const room =
            item.room ||
            item.room_no ||
            item.roomNumber ||
            '';

        const type =
            item.type ||
            item.class_type ||
            item.classClassType ||
            'Theory';

        return {
            ...item,

            day: normalizeDay(item.day || item.weekday || ''),
            time: normalizeTime(item.time || item.time_slot || item.timeSlot || ''),
            course: normalizeText(course),
            teacher: normalizeText(teacher),
            room: normalizeText(room),
            type: normalizeClassType(type),

            section: normalizeSection(section),
            sub_section: normalizeText(subSection)
        };
    });
}


/* =========================================================
   EXTRACT CLASSES
   ========================================================= */

function extractClassesFromData(data, fallbackSection = '') {
    if (!data) return [];

    if (Array.isArray(data)) {
        return normalizeClasses(data, fallbackSection);
    }

    if (Array.isArray(data.classes)) {
        return normalizeClasses(data.classes, fallbackSection);
    }

    if (Array.isArray(data.routine)) {
        return normalizeClasses(data.routine, fallbackSection);
    }

    if (Array.isArray(data.schedule)) {
        return normalizeClasses(data.schedule, fallbackSection);
    }

    if (data.sections && typeof data.sections === 'object') {
        let result = [];

        Object.entries(data.sections).forEach(([sectionName, sectionData]) => {
            result = result.concat(
                extractClassesFromData(sectionData, sectionName)
            );
        });

        return result;
    }

    return [];
}


/* =========================================================
   MERGE SUB SECTIONS
   ========================================================= */

function mergeSubSections(baseSection) {
    if (!routineData || !routineData.sections) {
        return [];
    }

    let result = [];

    Object.entries(routineData.sections).forEach(
        ([sectionName, sectionData]) => {

            if (
                normalizeSection(sectionName) === normalizeSection(baseSection) ||
                getBaseSection(sectionName) === getBaseSection(baseSection)
            ) {
                result = result.concat(
                    extractClassesFromData(sectionData, sectionName)
                );
            }
        }
    );

    return removeDuplicateClasses(result);
}


/* =========================================================
   REMOVE DUPLICATES
   ========================================================= */

function removeDuplicateClasses(classes) {
    const map = new Map();

    classes.forEach(cls => {
        const key = [
            normalizeDay(cls.day),
            normalizeTime(cls.time),
            normalizeText(cls.course).toUpperCase(),
            normalizeText(cls.teacher).toUpperCase(),
            normalizeText(cls.room).toUpperCase(),
            normalizeText(cls.sub_section).toUpperCase(),
            normalizeText(cls.section).toUpperCase()
        ].join('|');

        if (!map.has(key)) {
            map.set(key, cls);
        }
    });

    return Array.from(map.values());
}


/* =========================================================
   SORT CLASSES
   ========================================================= */

function sortClasses(classes) {
    return [...classes].sort((a, b) => {

        const dayA = DAY_ORDER[normalizeDay(a.day)] ?? 999;
        const dayB = DAY_ORDER[normalizeDay(b.day)] ?? 999;

        if (dayA !== dayB) {
            return dayA - dayB;
        }

        const timeA = getTimeStartMinutes(a.time);
        const timeB = getTimeStartMinutes(b.time);

        if (timeA !== timeB) {
            return timeA - timeB;
        }

        return String(a.course || '').localeCompare(
            String(b.course || '')
        );
    });
}


/* =========================================================
   ROUTINE URL
   ========================================================= */

function getRoutineLink(data = routineData) {
    if (!data) return '';

    const directKeys = [
        'routine_url',
        'routineUrl',
        'source_url',
        'sourceUrl',
        'notice_url',
        'noticeUrl',
        'pdf_url',
        'pdfUrl',
        'url',
        'link',
        'source'
    ];

    for (const key of directKeys) {
        if (data[key]) {
            return data[key];
        }
    }

    const nestedKeys = ['meta', 'metadata'];

    for (const parent of nestedKeys) {
        if (data[parent] && typeof data[parent] === 'object') {

            for (const key of directKeys) {
                if (data[parent][key]) {
                    return data[parent][key];
                }
            }
        }
    }

    return '';
}


/* =========================================================
   LOAD JSON
   ========================================================= */

async function fetchJSON(url) {
    const response = await fetch(url, {
        cache: 'no-store'
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
}

async function loadRoutine(section) {
    const normalized = normalizeSection(section);
    const baseSection = getBaseSection(normalized);

    let data = null;

    /* -----------------------------------------
       1. Exact section JSON
       ----------------------------------------- */

    try {
        data = await fetchJSON(
            `./data/sections/${normalized}.json?t=${Date.now()}`
        );
    } catch (error) {
        data = null;
    }

    /* -----------------------------------------
       2. Base section JSON
       ----------------------------------------- */

    if (!data && baseSection !== normalized) {
        try {
            data = await fetchJSON(
                `./data/sections/${baseSection}.json?t=${Date.now()}`
            );
        } catch (error) {
            data = null;
        }
    }

    /* -----------------------------------------
       3. Combined routine JSON
       ----------------------------------------- */

    if (!data) {
        try {
            data = await fetchJSON(
                `./data/routine.json?t=${Date.now()}`
            );
        } catch (error) {
            throw new Error('Routine data could not be loaded.');
        }
    }

    routineData = data;

    currentSection = normalized;

    updateLastUpdated(data);

    return data;
}


/* =========================================================
   GET CURRENT SECTION CLASSES
   ========================================================= */

function getSectionClasses(section) {
    const normalized = normalizeSection(section);
    const baseSection = getBaseSection(normalized);

    let classes = [];

    if (routineData?.sections) {

        Object.entries(routineData.sections).forEach(
            ([sectionName, sectionData]) => {

                const normalizedName =
                    normalizeSection(sectionName);

                if (
                    normalizedName === normalized ||
                    getBaseSection(normalizedName) === baseSection
                ) {
                    classes = classes.concat(
                        extractClassesFromData(
                            sectionData,
                            sectionName
                        )
                    );
                }
            }
        );
    }

    if (!classes.length) {
        classes = extractClassesFromData(
            routineData,
            normalized
        );
    }

    return removeDuplicateClasses(classes);
}


/* =========================================================
   TEACHER MODE
   ========================================================= */

function getTeacherClasses(query) {
    const search = normalizeText(query).toUpperCase();

    let result = [];

    if (!routineData?.sections) {
        return result;
    }

    Object.entries(routineData.sections).forEach(
        ([sectionName, sectionData]) => {

            const classes = extractClassesFromData(
                sectionData,
                sectionName
            );

            classes.forEach(cls => {

                const teacher = normalizeText(
                    cls.teacher ||
                    cls.faculty ||
                    cls.teacher_initials ||
                    ''
                ).toUpperCase();

                if (
                    teacher === search ||
                    teacher.includes(search)
                ) {
                    result.push(cls);
                }
            });
        }
    );

    return removeDuplicateClasses(result);
}


/* =========================================================
   ROOM MODE
   ========================================================= */

function getRoomClasses(query) {
    const search = normalizeText(query)
        .replace(/\s+/g, '')
        .toUpperCase();

    let result = [];

    if (!routineData?.sections) {
        return result;
    }

    Object.entries(routineData.sections).forEach(
        ([sectionName, sectionData]) => {

            const classes = extractClassesFromData(
                sectionData,
                sectionName
            );

            classes.forEach(cls => {

                const room = normalizeText(
                    cls.room ||
                    cls.room_no ||
                    cls.roomNumber ||
                    ''
                )
                    .replace(/\s+/g, '')
                    .toUpperCase();

                if (
                    room === search ||
                    room.includes(search)
                ) {
                    result.push(cls);
                }
            });
        }
    );

    return removeDuplicateClasses(result);
}


/* =========================================================
   EMPTY ROOM MODE
   ========================================================= */

function getAllClasses() {
    let result = [];

    if (!routineData?.sections) {
        return extractClassesFromData(routineData);
    }

    Object.entries(routineData.sections).forEach(
        ([sectionName, sectionData]) => {

            result = result.concat(
                extractClassesFromData(
                    sectionData,
                    sectionName
                )
            );
        }
    );

    return removeDuplicateClasses(result);
}

function getAllRooms(classes) {
    const rooms = new Set();

    classes.forEach(cls => {

        const room = normalizeText(
            cls.room ||
            cls.room_no ||
            cls.roomNumber ||
            ''
        );

        if (room) {
            rooms.add(room);
        }
    });

    return Array.from(rooms).sort();
}

function getEmptyRooms(query = '') {
    const allClasses = getAllClasses();
    const allRooms = getAllRooms(allClasses);

    const search = normalizeText(query).toUpperCase();

    let selectedDays = DAYS;

    if (search) {
        const matchingDay = DAYS.find(
            day => day.toUpperCase().startsWith(search)
        );

        if (matchingDay) {
            selectedDays = [matchingDay];
        }
    }

    const result = [];

    selectedDays.forEach(day => {

        TIME_SLOTS.forEach(timeSlot => {

            const occupied = new Set();

            allClasses.forEach(cls => {

                if (
                    normalizeDay(cls.day) !== day
                ) {
                    return;
                }

                const classSlot = getClassTimeSlot(cls.time);

                if (classSlot.start === -1) {
                    return;
                }

                const classSlots = [];

                for (
                    let i = classSlot.start;
                    i < classSlot.start + classSlot.span;
                    i++
                ) {
                    classSlots.push(i);
                }

                const currentSlot =
                    TIME_SLOTS.indexOf(timeSlot);

                if (classSlots.includes(currentSlot)) {

                    const room = normalizeText(
                        cls.room ||
                        cls.room_no ||
                        cls.roomNumber ||
                        ''
                    );

                    if (room) {
                        occupied.add(room);
                    }
                }
            });

            allRooms.forEach(room => {

                if (!occupied.has(room)) {

                    result.push({
                        day,
                        time: timeSlot,
                        course: 'EMPTY',
                        teacher: '',
                        room,
                        type: 'Empty Room',
                        section: '',
                        sub_section: 'Main'
                    });
                }
            });
        });
    });

    return result;
}


/* =========================================================
   UPDATE UI
   ========================================================= */

function setStatus(text, type = 'success') {

    const statusText =
        document.getElementById('statusText');

    const statusBadge =
        document.getElementById('statusBadge');

    if (statusText) {
        statusText.textContent = text;
    }

    if (statusBadge) {
        statusBadge.className = `status-badge ${type}`;
    }
}

function updateLastUpdated(data) {

    const versionNumber =
        document.getElementById('versionNumber');

    const lastUpdated =
        document.getElementById('lastUpdated');

    if (versionNumber) {

        versionNumber.textContent =
            data?.version ||
            data?.metadata?.version ||
            data?.meta?.version ||
            '1.0';
    }

    if (lastUpdated) {

        const value =
            data?.last_updated ||
            data?.lastUpdated ||
            data?.updated_at ||
            data?.updatedAt ||
            data?.metadata?.last_updated ||
            data?.metadata?.lastUpdated ||
            data?.meta?.last_updated ||
            data?.meta?.lastUpdated;

        if (value) {
            lastUpdated.textContent = value;
        }
    }
}

function updateSavedChip() {

    const savedSection =
        document.getElementById('savedSection');

    const savedChip =
        document.getElementById('savedChip');

    const saved =
        localStorage.getItem(STORAGE_KEY);

    if (savedSection) {
        savedSection.textContent = saved || '';
    }

    if (savedChip) {
        savedChip.style.display =
            saved ? 'inline-flex' : 'none';
    }
}


/* =========================================================
   MODE
   ========================================================= */

function setMode(mode) {

    currentMode = mode;

    localStorage.setItem(
        MODE_KEY,
        mode
    );

    const input =
        document.getElementById('sectionInput');

    if (!input) return;

    if (mode === 'teacher') {

        input.placeholder =
            'Enter teacher initials (e.g., NSL)';

    } else if (mode === 'room') {

        input.placeholder =
            'Enter room (e.g., KT-516)';

    } else if (mode === 'empty-room') {

        input.placeholder =
            'Enter day or room (optional)';

    } else {

        input.placeholder =
            'Enter section (e.g., 70_N)';
    }

    document
        .querySelectorAll('.nav-item')
        .forEach(item => {
            item.classList.remove('active');
        });

    let activeItem = null;

    if (mode === 'section') {
        activeItem =
            document.querySelector(
                '.nav-item:first-child'
            );
    }

    if (mode === 'teacher') {
        const icon =
            document.querySelector(
                '.nav-item .fa-address-card'
            );

        activeItem =
            icon?.closest('.nav-item');
    }

    if (mode === 'room') {
        const icon =
            document.querySelector(
                '.nav-item .fa-door-open'
            );

        activeItem =
            icon?.closest('.nav-item');
    }

    if (mode === 'empty-room') {

        activeItem =
            document.querySelector(
                '.nav-item[data-mode="empty-room"]'
            ) ||
            document.querySelector(
                '.nav-item[data-mode="empty"]'
            ) ||
            document
                .querySelector('.fa-door-closed')
                ?.closest('.nav-item');
    }

    activeItem?.classList.add('active');
}


/* =========================================================
   RENDER ROUTINE
   ========================================================= */

function renderRoutine(classes, title = '') {

    const container =
        document.getElementById('routineContainer');

    if (!container) return;

    container.innerHTML = '';

    classes = sortClasses(classes);

    if (!classes.length) {

        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar-times"></i>
                <h3>No routine found</h3>
                <p>No classes are available for this search.</p>
            </div>
        `;

        return;
    }

    const wrapper =
        document.createElement('div');

    wrapper.className = 'routine-wrapper';

    const heading =
        document.createElement('div');

    heading.className = 'routine-heading';

    heading.innerHTML = `
        <div>
            <h2>${escapeHTML(title)}</h2>
            <p>${classes.length} class${classes.length === 1 ? '' : 'es'}</p>
        </div>
    `;

    wrapper.appendChild(heading);

    const table =
        document.createElement('table');

    table.className = 'routine-table';

    table.innerHTML = `
        <thead>
            <tr>
                <th>Day</th>
                <th>Time</th>
                <th>Course</th>
                <th>Teacher</th>
                <th>Room</th>
                <th>Type</th>
            </tr>
        </thead>
    `;

    const tbody =
        document.createElement('tbody');

    classes.forEach(cls => {

        const tr =
            document.createElement('tr');

        tr.innerHTML = `
            <td>${escapeHTML(cls.day || '')}</td>
            <td>${escapeHTML(cls.time || '')}</td>
            <td>
                <strong>${escapeHTML(cls.course || '')}</strong>
                ${
                    getDisplayComment(cls)
                        ? `<small>${escapeHTML(
                            getDisplayComment(cls)
                        )}</small>`
                        : ''
                }
            </td>
            <td>${escapeHTML(cls.teacher || '')}</td>
            <td>${escapeHTML(cls.room || '')}</td>
            <td>
                <span class="type-badge ${normalizeClassType(cls.type).toLowerCase()}">
                    ${escapeHTML(normalizeClassType(cls.type))}
                </span>
            </td>
        `;

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);

    wrapper.appendChild(table);
    container.appendChild(wrapper);
}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


/* =========================================================
   CREATE DOWNLOAD IMAGE CARD
   ========================================================= */

function createRoutineDownloadCard(classes, title) {

    const card =
        document.createElement('div');

    card.id = 'routineDownloadCard';

    card.style.cssText = `
        width: 1600px;
        box-sizing: border-box;
        background: #f4f6fa;
        padding: 40px;
        font-family: Arial, Helvetica, sans-serif;
        color: #172033;
    `;

    const sorted =
        sortClasses(classes);

    /* -----------------------------------------
       TODAY
       ----------------------------------------- */

    const todayIndex =
        new Date().getDay();

    const todayName =
        todayIndex === 0
            ? 'Sunday'
            : DAYS[todayIndex === 0 ? 0 : todayIndex];

    /* -----------------------------------------
       HEADER
       ----------------------------------------- */

    const header =
        document.createElement('div');

    header.style.cssText = `
        background: #172033;
        color: #ffffff;
        border-radius: 18px 18px 0 0;
        padding: 30px 34px;
        box-sizing: border-box;
    `;

    header.innerHTML = `
        <div style="
            font-size: 32px;
            font-weight: 800;
            letter-spacing: .3px;
            margin-bottom: 8px;
        ">
            DIU CSE Routine
        </div>

        <div style="
            font-size: 21px;
            font-weight: 500;
            opacity: .92;
        ">
            ${escapeHTML(title)}
        </div>
    `;

    card.appendChild(header);


    /* -----------------------------------------
       TABLE WRAPPER
       ----------------------------------------- */

    const tableWrap =
        document.createElement('div');

    tableWrap.style.cssText = `
        background: #ffffff;
        padding: 24px;
        box-sizing: border-box;
        border-radius: 0 0 18px 18px;
    `;


    /* -----------------------------------------
       TABLE
       ----------------------------------------- */

    const table =
        document.createElement('table');

    table.style.cssText = `
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        table-layout: fixed;
        background: #ffffff;
        border: 1px solid #d7dce5;
        border-radius: 12px;
        overflow: hidden;
    `;


    /* -----------------------------------------
       COLUMN WIDTH
       ----------------------------------------- */

    const colgroup =
        document.createElement('colgroup');

    const dayCol =
        document.createElement('col');

    dayCol.style.width = '145px';

    colgroup.appendChild(dayCol);

    TIME_SLOTS.forEach(() => {

        const col =
            document.createElement('col');

        col.style.width = '1fr';

        colgroup.appendChild(col);
    });

    table.appendChild(colgroup);


    /* -----------------------------------------
       HEADER ROW
       ----------------------------------------- */

    const thead =
        document.createElement('thead');

    const headerRow =
        document.createElement('tr');

    const dayHeader =
        document.createElement('th');

    dayHeader.textContent = 'DAY';

    dayHeader.style.cssText = `
        background: #202b42;
        color: #ffffff;
        height: 68px;
        padding: 12px;
        font-size: 17px;
        font-weight: 800;
        text-align: center;
        vertical-align: middle;
        border-right: 1px solid #46516a;
        border-bottom: 1px solid #46516a;
    `;

    headerRow.appendChild(dayHeader);


    TIME_SLOTS.forEach(slot => {

        const th =
            document.createElement('th');

        th.textContent = slot;

        th.style.cssText = `
            background: #202b42;
            color: #ffffff;
            height: 68px;
            padding: 10px 6px;
            font-size: 15px;
            font-weight: 800;
            text-align: center;
            vertical-align: middle;
            border-right: 1px solid #46516a;
            border-bottom: 1px solid #46516a;
        `;

        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);


    /* -----------------------------------------
       BUILD CELL MAP
       ----------------------------------------- */

    const cellMap = {};

    DAYS.forEach(day => {
        cellMap[day] = {};

        TIME_SLOTS.forEach(slot => {
            cellMap[day][slot] = [];
        });
    });


    sorted.forEach(cls => {

        const day =
            normalizeDay(cls.day);

        if (!cellMap[day]) return;

        const slotInfo =
            getClassTimeSlot(cls.time);

        if (slotInfo.start < 0) return;

        const slot =
            TIME_SLOTS[slotInfo.start];

        if (!cellMap[day][slot]) {
            cellMap[day][slot] = [];
        }

        cellMap[day][slot].push(cls);
    });


    /* -----------------------------------------
       BODY
       ----------------------------------------- */

    const tbody =
        document.createElement('tbody');

    DAYS.forEach(day => {

        const tr =
            document.createElement('tr');

        /* DAY CELL */

        const dayCell =
            document.createElement('td');

        const isToday =
            day === todayName;

        dayCell.style.cssText = `
            background: ${isToday ? '#ecfdf3' : '#f8fafc'};
            color: ${isToday ? '#166534' : '#172033'};
            min-height: 100px;
            padding: 14px 10px;
            text-align: center;
            vertical-align: middle;
            font-size: 18px;
            font-weight: 800;
            border-right: 1px solid #d7dce5;
            border-bottom: 1px solid #d7dce5;
        `;

        dayCell.innerHTML = `
            <div>${escapeHTML(day)}</div>
            ${
                isToday
                    ? `
                        <div style="
                            margin-top: 7px;
                            display: inline-block;
                            padding: 4px 9px;
                            border-radius: 999px;
                            background: #dcfce7;
                            color: #166534;
                            font-size: 11px;
                            font-weight: 800;
                            letter-spacing: .5px;
                        ">
                            TODAY
                        </div>
                    `
                    : ''
            }
        `;

        tr.appendChild(dayCell);


        /* -----------------------------------------
           TIME CELLS
           ----------------------------------------- */

        for (let i = 0; i < TIME_SLOTS.length; i++) {

            const slot =
                TIME_SLOTS[i];

            /*
             * If a 11:30-02:30 lab already occupies
             * 11:30-01:00 + 01:00-02:30,
             * skip the second slot.
             */

            if (
                i === 3 &&
                cellMap[day]['11:30-01:00']?.some(
                    cls => normalizeTime(cls.time) === '11:30-02:30'
                )
            ) {
                continue;
            }


            let classesHere =
                cellMap[day][slot] || [];


            /* -----------------------------------------
               CHECK TWO SLOT LAB
               ----------------------------------------- */

            const twoSlotLab =
                classesHere.find(
                    cls =>
                        normalizeTime(cls.time) === '11:30-02:30'
                );


            const td =
                document.createElement('td');

            const hasClass =
                classesHere.length > 0;


            /* -----------------------------------------
               NORMAL CELL
               ----------------------------------------- */

            if (!twoSlotLab) {

                td.style.cssText = `
                    height: 105px;
                    padding: 8px;
                    text-align: center;
                    vertical-align: middle;
                    border-right: 1px solid #d7dce5;
                    border-bottom: 1px solid #d7dce5;
                    background: ${hasClass ? '#f8fbff' : '#ffffff'};
                `;

                if (hasClass) {

                    td.innerHTML =
                        buildDownloadCellContent(
                            classesHere,
                            false
                        );

                } else {

                    td.innerHTML = `
                        <span style="
                            color: #c4cad4;
                            font-size: 20px;
                            font-weight: 400;
                        ">
                            —
                        </span>
                    `;
                }

                tr.appendChild(td);

            } else {

                /* -----------------------------------------
                   TWO SLOT LAB CELL
                   ----------------------------------------- */

                td.colSpan = 2;

                td.style.cssText = `
                    height: 105px;
                    padding: 8px;
                    text-align: center;
                    vertical-align: middle;
                    border-right: 1px solid #d7dce5;
                    border-bottom: 1px solid #d7dce5;
                    background: #fff8e8;
                `;

                td.innerHTML =
                    buildDownloadCellContent(
                        [twoSlotLab],
                        true
                    );

                tr.appendChild(td);
            }
        }

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);

    tableWrap.appendChild(table);


    /* -----------------------------------------
       LEGEND
       ----------------------------------------- */

    const legend =
        document.createElement('div');

    legend.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 28px;
        padding: 22px 8px 6px;
        font-size: 14px;
        color: #4b5563;
        font-weight: 600;
    `;

    legend.innerHTML = `
        <span style="
            display:flex;
            align-items:center;
            gap:7px;
        ">
            <span style="
                width:14px;
                height:14px;
                border-radius:4px;
                background:#f8fbff;
                border:1px solid #d7dce5;
                display:inline-block;
            "></span>
            Theory
        </span>

        <span style="
            display:flex;
            align-items:center;
            gap:7px;
        ">
            <span style="
                width:14px;
                height:14px;
                border-radius:4px;
                background:#fff8e8;
                border:1px solid #e7d9b5;
                display:inline-block;
            "></span>
            Lab
        </span>

        <span style="
            display:flex;
            align-items:center;
            gap:7px;
        ">
            <span style="
                width:14px;
                height:14px;
                border-radius:4px;
                background:#ecfdf3;
                border:1px solid #b7e4c7;
                display:inline-block;
            "></span>
            Today
        </span>
    `;

    tableWrap.appendChild(legend);


    /* -----------------------------------------
       FOOTER
       ----------------------------------------- */

    const footer =
        document.createElement('div');

    footer.style.cssText = `
        text-align: center;
        padding: 14px 0 2px;
        color: #8a93a3;
        font-size: 12px;
        font-weight: 500;
    `;

    footer.textContent =
        'Daffodil International University • CSE';

    tableWrap.appendChild(footer);

    card.appendChild(tableWrap);

    return card;
}


/* =========================================================
   DOWNLOAD CELL CONTENT
   ========================================================= */

function buildDownloadCellContent(classes, isLab = false) {

    if (!classes || !classes.length) {
        return `
            <span style="
                color:#c4cad4;
                font-size:20px;
            ">—</span>
        `;
    }

    return classes.map(cls => {

        const comment =
            getDisplayComment(
                cls,
                currentMode
            );

        const type =
            normalizeClassType(cls.type);

        const lab =
            type === 'Lab' ||
            isLab;

        const bg =
            lab ? '#fff1cf' : '#eaf4ff';

        const border =
            lab ? '#e8d09b' : '#c8ddf3';

        const accent =
            lab ? '#8a5a00' : '#1d4f91';

        return `
            <div style="
                width:100%;
                box-sizing:border-box;
                background:${bg};
                border:1px solid ${border};
                border-radius:10px;
                padding:10px 8px;
                margin:${classes.length > 1 ? '3px 0' : '0'};
                line-height:1.25;
            ">

                <div style="
                    font-size:18px;
                    font-weight:800;
                    color:#172033;
                    margin-bottom:5px;
                ">
                    ${escapeHTML(cls.course || '—')}
                    ${
                        comment
                            ? `
                                <span style="
                                    font-size:13px;
                                    font-weight:700;
                                    color:${accent};
                                    margin-left:4px;
                                ">
                                    ${escapeHTML(comment)}
                                </span>
                            `
                            : ''
                    }
                </div>

                ${
                    cls.teacher
                        ? `
                            <div style="
                                font-size:13px;
                                font-weight:600;
                                color:#4b5563;
                                margin-bottom:3px;
                            ">
                                ${escapeHTML(cls.teacher)}
                            </div>
                        `
                        : ''
                }

                ${
                    cls.room
                        ? `
                            <div style="
                                font-size:13px;
                                font-weight:700;
                                color:${accent};
                            ">
                                ${escapeHTML(cls.room)}
                            </div>
                        `
                        : ''
                }

                <div style="
                    margin-top:5px;
                    font-size:10px;
                    font-weight:800;
                    letter-spacing:.4px;
                    color:${accent};
                ">
                    ${escapeHTML(type)}
                </div>

            </div>
        `;
    }).join('');
}


/* =========================================================
   DOWNLOAD SECTION
   ========================================================= */

async function downloadSection() {

    if (!routineData) {
        alert('Please load a routine first.');
        return;
    }

    const container =
        document.getElementById('routineContainer');

    if (!container) return;

    const classes =
        getClassesForCurrentMode();

    if (!classes.length) {
        alert('No routine data available.');
        return;
    }

    const title =
        getCurrentTitle();

    const card =
        createRoutineDownloadCard(
            classes,
            title
        );

    card.style.position = 'fixed';
    card.style.left = '-100000px';
    card.style.top = '0';
    card.style.zIndex = '-1';

    document.body.appendChild(card);

    try {

        if (!window.html2canvas) {

            await loadHtml2Canvas();
        }

        const canvas =
            await html2canvas(card, {
                backgroundColor: '#f4f6fa',
                scale: 2,
                useCORS: true,
                logging: false
            });

        const link =
            document.createElement('a');

        const fileName =
            normalizeSection(
                currentSection ||
                'routine'
            );

        link.download =
            `DIU-CSE-Routine-${fileName}.png`;

        link.href =
            canvas.toDataURL('image/png');

        link.click();

    } catch (error) {

        console.error(
            'Download image error:',
            error
        );

        alert(
            'Could not create routine image.'
        );

    } finally {

        card.remove();
    }
}


/* =========================================================
   LOAD HTML2CANVAS
   ========================================================= */

function loadHtml2Canvas() {

    return new Promise((resolve, reject) => {

        if (window.html2canvas) {
            resolve();
            return;
        }

        const script =
            document.createElement('script');

        script.src =
            'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';

        script.onload =
            () => resolve();

        script.onerror =
            () => reject(
                new Error(
                    'html2canvas could not be loaded'
                )
            );

        document.head.appendChild(script);
    });
}


/* =========================================================
   GET CURRENT MODE CLASSES
   ========================================================= */

function getClassesForCurrentMode() {

    const input =
        document.getElementById('sectionInput');

    const value =
        input?.value?.trim() || '';

    if (currentMode === 'teacher') {
        return sortClasses(
            getTeacherClasses(value)
        );
    }

    if (currentMode === 'room') {
        return sortClasses(
            getRoomClasses(value)
        );
    }

    if (currentMode === 'empty-room') {
        return sortClasses(
            getEmptyRooms(value)
        );
    }

    return sortClasses(
        getSectionClasses(
            currentSection || value
        )
    );
}


/* =========================================================
   CURRENT TITLE
   ========================================================= */

function getCurrentTitle() {

    const input =
        document.getElementById('sectionInput');

    const value =
        input?.value?.trim() || '';

    if (currentMode === 'teacher') {

        return `Teacher: ${value}`;
    }

    if (currentMode === 'room') {

        return `Room: ${value}`;
    }

    if (currentMode === 'empty-room') {

        return value
            ? `Empty Room: ${value}`
            : 'Empty Room';
    }

    return `Section: ${currentSection || value}`;
}


/* =========================================================
   SHOW ROUTINE
   ========================================================= */

async function showRoutine() {

    const input =
        document.getElementById('sectionInput');

    const value =
        input?.value?.trim() || '';

    if (!value && currentMode !== 'empty-room') {

        setStatus(
            'Please enter a value.',
            'error'
        );

        return;
    }

    try {

        setStatus(
            'Loading routine...',
            'loading'
        );

        if (
            currentMode === 'teacher' ||
            currentMode === 'room' ||
            currentMode === 'empty-room'
        ) {

            if (!routineData) {

                await loadRoutine(
                    localStorage.getItem(
                        STORAGE_KEY
                    ) || '70_N'
                );
            }

        } else {

            const normalized =
                normalizeSection(value);

            localStorage.setItem(
                STORAGE_KEY,
                normalized
            );

            await loadRoutine(
                normalized
            );
        }

        let classes = [];

        if (currentMode === 'teacher') {

            classes =
                getTeacherClasses(value);

        } else if (currentMode === 'room') {

            classes =
                getRoomClasses(value);

        } else if (currentMode === 'empty-room') {

            classes =
                getEmptyRooms(value);

        } else {

            classes =
                getSectionClasses(
                    currentSection
                );
        }

        classes =
            sortClasses(classes);

        const title =
            getCurrentTitle();

        renderRoutine(
            classes,
            title
        );

        setStatus(
            `${classes.length} class${classes.length === 1 ? '' : 'es'} found`,
            'success'
        );

        updateSavedChip();

    } catch (error) {

        console.error(error);

        setStatus(
            'Failed to load routine.',
            'error'
        );

        const container =
            document.getElementById(
                'routineContainer'
            );

        if (container) {

            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Could not load routine</h3>
                    <p>
                        Please check your section or try again.
                    </p>
                </div>
            `;
        }
    }
}


/* =========================================================
   CLEAR SECTION
   ========================================================= */

function clearSection() {

    localStorage.removeItem(
        STORAGE_KEY
    );

    const input =
        document.getElementById('sectionInput');

    if (input) {
        input.value = '';
    }

    currentSection = '';

    const container =
        document.getElementById(
            'routineContainer'
        );

    if (container) {
        container.innerHTML = '';
    }

    updateSavedChip();

    setStatus(
        'Section cleared.',
        'success'
    );
}


/* =========================================================
   AUTO REFRESH
   ========================================================= */

function startAutoRefresh() {

    if (refreshTimer) {
        clearInterval(refreshTimer);
    }

    refreshTimer =
        setInterval(async () => {

            try {

                if (
                    currentMode === 'section' &&
                    currentSection
                ) {

                    await loadRoutine(
                        currentSection
                    );
                } else if (routineData) {

                    await loadRoutine(
                        localStorage.getItem(
                            STORAGE_KEY
                        ) || '70_N'
                    );
                }

                const classes =
                    getClassesForCurrentMode();

                renderRoutine(
                    classes,
                    getCurrentTitle()
                );

                setStatus(
                    `${classes.length} class${classes.length === 1 ? '' : 'es'} found`,
                    'success'
                );

            } catch (error) {

                console.error(
                    'Auto refresh failed:',
                    error
                );
            }

        }, 5 * 60 * 1000);
}


/* =========================================================
   NAVIGATION EVENTS
   ========================================================= */

function setupNavigation() {

    document
        .querySelectorAll('.nav-item')
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

                    if (
                        item
                            .querySelector(
                                '.fa-address-card'
                            )
                    ) {

                        setMode('teacher');
                        return;
                    }

                    if (
                        item
                            .querySelector(
                                '.fa-door-open'
                            )
                    ) {

                        setMode('room');
                        return;
                    }

                    if (
                        item
                            .querySelector(
                                '.fa-door-closed'
                            )
                    ) {

                        setMode('empty-room');
                        return;
                    }

                    if (
                        item ===
                        document.querySelector(
                            '.nav-item:first-child'
                        )
                    ) {

                        setMode('section');
                    }
                }
            );
        });
}


/* =========================================================
   SEARCH ICON
   ========================================================= */

function setupSearchIcon() {

    const searchIcon =
        document.querySelector(
            '.search-input-wrap i'
        );

    if (!searchIcon) return;

    searchIcon.addEventListener(
        'click',
        showRoutine
    );
}


/* =========================================================
   ENTER KEY
   ========================================================= */

function setupInput() {

    const input =
        document.getElementById(
            'sectionInput'
        );

    if (!input) return;

    input.addEventListener(
        'keydown',
        event => {

            if (event.key === 'Enter') {
                event.preventDefault();
                showRoutine();
            }
        }
    );
}


/* =========================================================
   INITIAL LOAD
   ========================================================= */

async function initialize() {

    setupNavigation();
    setupSearchIcon();
    setupInput();

    const showButton =
        document.getElementById(
            'showRoutineBtn'
        );

    if (showButton) {

        showButton.addEventListener(
            'click',
            showRoutine
        );
    }


    const clearButton =
        document.getElementById(
            'clearSectionBtn'
        );

    if (clearButton) {

        clearButton.addEventListener(
            'click',
            clearSection
        );
    }


    setMode(
        localStorage.getItem(
            MODE_KEY
        ) || 'section'
    );

    updateSavedChip();


    /* -----------------------------------------
       Restore saved section
       ----------------------------------------- */

    const savedSection =
        localStorage.getItem(
            STORAGE_KEY
        );

    const input =
        document.getElementById(
            'sectionInput'
        );

    if (
        savedSection &&
        input &&
        currentMode === 'section'
    ) {

        input.value =
            savedSection;

        try {

            await loadRoutine(
                savedSection
            );

            const classes =
                getSectionClasses(
                    savedSection
                );

            renderRoutine(
                classes,
                `Section: ${savedSection}`
            );

            setStatus(
                `${classes.length} class${classes.length === 1 ? '' : 'es'} found`,
                'success'
            );

        } catch (error) {

            console.error(
                'Initial load failed:',
                error
            );
        }
    }


    startAutoRefresh();
}


/* =========================================================
   GLOBAL DOWNLOAD FUNCTION
   ========================================================= */

window.downloadSection =
    downloadSection;


/* =========================================================
   START
   ========================================================= */

if (
    document.readyState === 'loading'
) {

    document.addEventListener(
        'DOMContentLoaded',
        initialize
    );

} else {

    initialize();
}
