// ============================================================
// STORAGE
// ============================================================
const STORAGE_KEY = 'diu_cse_section';
const MODE_KEY = 'diu_cse_mode';

// ============================================================
// DATA URLS
// ============================================================
const SECTION_BASE_URL = './data/sections/';
const COMBINED_URL = './data/routine.json?t=' + Date.now();

// ============================================================
// DOM
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

// ============================================================
// NAVIGATION
// ============================================================
const userBtn = document.querySelector('.nav-item[data-mode="section"]');
const teacherBtn = document.querySelector('.nav-item[data-mode="teacher"]');
const roomBtn = document.querySelector('.nav-item[data-mode="room"]');
const emptyRoomBtn = document.querySelector('.nav-item[data-mode="empty-room"]');

// ============================================================
// STATE
// ============================================================
let routineData = null;
let currentMode = localStorage.getItem(MODE_KEY) || 'section';
let currentSearchTerm = '';
let currentClasses = [];
let currentRooms = [];

// ============================================================
// DAYS
// ============================================================
const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DAY_ORDER = { Saturday: 0, Sunday: 1, Monday: 2, Tuesday: 3, Wednesday: 4, Thursday: 5, Friday: 6 };

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
document.addEventListener('DOMContentLoaded', () => {
    currentMode = localStorage.getItem(MODE_KEY) || 'section';
    updateModeUI();

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        if (sectionInput) sectionInput.value = saved;
        if (savedSectionSpan) savedSectionSpan.textContent = saved;
        if (savedChip) savedChip.style.display = 'inline-flex';
    } else {
        if (savedChip) savedChip.style.display = 'none';
    }

    loadRoutineData();

    // Search icon click
    document.querySelector('.search-input-wrap i')?.addEventListener('click', handleSearch);

    // Buttons
    showRoutineBtn?.addEventListener('click', handleSearch);
    clearSectionBtn?.addEventListener('click', handleClearSection);

    // Enter key
    sectionInput?.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            handleSearch();
        }
    });

    // Mode switches
    userBtn?.addEventListener('click', () => setMode('section'));
    teacherBtn?.addEventListener('click', () => setMode('teacher'));
    roomBtn?.addEventListener('click', () => setMode('room'));
    emptyRoomBtn?.addEventListener('click', () => setMode('empty-room'));
});

// ============================================================
// MODE
// ============================================================
function setMode(mode) {
    if (currentMode === mode) return;
    currentMode = mode;
    localStorage.setItem(MODE_KEY, mode);
    updateModeUI();

    if (routineContainer) routineContainer.innerHTML = '';
    if (savedChip) savedChip.style.display = 'none';
    if (sectionInput) sectionInput.value = '';
    localStorage.removeItem(STORAGE_KEY);

    if (mode === 'section') {
        sectionInput.placeholder = 'Enter section (e.g., 70_N)';
        loadRoutineData();
    } else if (mode === 'teacher') {
        sectionInput.placeholder = 'Enter teacher initials (e.g., NSL)';
        showNoRoutine('Teacher Mode', 'Enter teacher initials to see their classes.');
    } else if (mode === 'room') {
        sectionInput.placeholder = 'Enter room (e.g., KT-516)';
        showNoRoutine('Room Mode', 'Enter room name to see its schedule.');
    } else if (mode === 'empty-room') {
        sectionInput.placeholder = 'Enter day or room (optional)';
        loadEmptyRooms();
    }
}

// ============================================================
// MODE UI
// ============================================================
function updateModeUI() {
    const brand = document.querySelector('.brand strong');
    if (brand) {
        if (currentMode === 'section') brand.textContent = 'Student';
        else if (currentMode === 'teacher') brand.textContent = 'Teacher';
        else if (currentMode === 'room') brand.textContent = 'Room';
        else brand.textContent = 'Empty Room';
    }

    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    if (currentMode === 'section' && userBtn) userBtn.classList.add('active');
    if (currentMode === 'teacher' && teacherBtn) teacherBtn.classList.add('active');
    if (currentMode === 'room' && roomBtn) roomBtn.classList.add('active');
    if (currentMode === 'empty-room' && emptyRoomBtn) emptyRoomBtn.classList.add('active');
}

// ============================================================
// SEARCH
// ============================================================
function handleSearch() {
    const raw = sectionInput?.value.trim() || '';
    if (currentMode !== 'empty-room' && !raw) {
        showMessage('Please enter something to search.', 'error');
        return;
    }
    const normalized = raw.toUpperCase().replace(/\s+/g, '_');
    if (currentMode === 'section') loadSection(normalized);
    else if (currentMode === 'teacher') loadTeacher(normalized);
    else if (currentMode === 'room') loadRoom(normalized);
    else loadEmptyRooms(raw);
}

// ============================================================
// FETCH JSON
// ============================================================
async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

// ============================================================
// LOAD ROUTINE DATA
// ============================================================
async function loadRoutineData() {
    try {
        setStatus('loading', 'Loading...');
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && currentMode === 'section') {
            await loadSection(saved);
            return;
        }

        routineData = await fetchJson(COMBINED_URL);
        updateMeta(routineData);

        if (currentMode === 'teacher') {
            showNoRoutine('Teacher Mode', 'Enter teacher initials to see their classes.');
        } else if (currentMode === 'room') {
            showNoRoutine('Room Mode', 'Enter room name to see its schedule.');
        } else if (currentMode === 'empty-room') {
            await loadEmptyRooms();
        } else {
            const sections = routineData.sections || {};
            const keys = Object.keys(sections);
            if (!keys.length) throw new Error('No routine sections found.');
            const firstBase = getBaseSection(keys[0]);
            const merged = mergeSubSections(firstBase);
            if (merged.length) {
                if (sectionInput) sectionInput.value = firstBase;
                if (savedSectionSpan) savedSectionSpan.textContent = firstBase;
                if (savedChip) savedChip.style.display = 'inline-flex';
                localStorage.setItem(STORAGE_KEY, firstBase);
                currentSearchTerm = firstBase;
                currentClasses = merged;
                displaySection(firstBase, merged);
            } else {
                showNoRoutine('No Data', 'No routine data available.');
            }
        }
        setStatus('ready', 'Ready');
    } catch (error) {
        console.error('Routine load error:', error);
        setStatus('error', 'Error');
        showMessage('Could not load routine data.', 'error');
        showNoRoutine('Error', 'Routine data could not be loaded.');
    }
}

// ============================================================
// LOAD SECTION
// ============================================================
async function loadSection(sectionKey) {
    try {
        setStatus('loading', 'Loading...');
        const normalized = String(sectionKey).toUpperCase().replace(/\s+/g, '_');
        const baseSection = getBaseSection(normalized);
        let sectionData = null;

        // Try section-specific JSON
        const sectionUrls = [
            `${SECTION_BASE_URL}${normalized}.json?t=${Date.now()}`,
            `${SECTION_BASE_URL}${baseSection}.json?t=${Date.now()}`
        ];
        for (const url of sectionUrls) {
            try {
                sectionData = await fetchJson(url);
                break;
            } catch (e) { console.warn('Section JSON not found:', url); }
        }

        // Fallback to combined
        if (!sectionData) {
            if (!routineData) {
                routineData = await fetchJson(COMBINED_URL);
                updateMeta(routineData);
            }
            const sections = routineData.sections || {};
            const matchingKeys = Object.keys(sections).filter(
                key => key === normalized || key === baseSection || getBaseSection(key) === baseSection
            );
            if (!matchingKeys.length) throw new Error(`Section "${normalized}" not found.`);
            const all = [];
            matchingKeys.forEach(key => {
                const data = sections[key];
                const classes = Array.isArray(data) ? data : data?.classes;
                if (Array.isArray(classes)) all.push(...classes);
            });
            sectionData = { section: baseSection, classes: all };
        }

        const allClasses = extractClassesFromData(sectionData);
        const classes = removeDuplicateClasses(normalizeClasses(allClasses));
        if (!classes.length) throw new Error(`No classes found for "${normalized}".`);

        currentSearchTerm = baseSection;
        currentClasses = classes;
        displaySection(baseSection, classes);

        localStorage.setItem(STORAGE_KEY, normalized);
        if (savedSectionSpan) savedSectionSpan.textContent = normalized;
        if (savedChip) savedChip.style.display = 'inline-flex';
        hideMessage();
        setStatus('ready', 'Ready');
    } catch (error) {
        console.error('Section error:', error);
        setStatus('error', 'Error');
        showMessage(error.message, 'error');
        showNoRoutine('Section Not Found', `No data for "${sectionKey}".`);
    }
}

// ============================================================
// EXTRACT CLASSES
// ============================================================
function extractClassesFromData(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.classes)) return data.classes;
    if (Array.isArray(data.routine)) return data.routine;
    if (Array.isArray(data.schedule)) return data.schedule;
    if (data.sections && typeof data.sections === 'object') {
        const result = [];
        Object.values(data.sections).forEach(value => {
            result.push(...extractClassesFromData(value));
        });
        return result;
    }
    return [];
}

// ============================================================
// MERGE SUBSECTIONS
// ============================================================
function mergeSubSections(baseSection) {
    if (!routineData) return [];
    const sections = routineData.sections || {};
    const all = [];
    Object.entries(sections).forEach(([key, data]) => {
        if (key === baseSection || getBaseSection(key) === baseSection) {
            all.push(...extractClassesFromData(data));
        }
    });
    return removeDuplicateClasses(normalizeClasses(all));
}

// ============================================================
// TEACHER
// ============================================================
async function loadTeacher(initials) {
    try {
        setStatus('loading', 'Loading...');
        if (!routineData) {
            routineData = await fetchJson(COMBINED_URL);
            updateMeta(routineData);
        }
        const clean = String(initials).toUpperCase().replace(/\s+/g, '');
        const sections = routineData.sections || {};
        const results = [];
        Object.entries(sections).forEach(([section, data]) => {
            const classes = extractClassesFromData(data);
            classes.forEach(cls => {
                const teacher = String(cls.teacher || cls.faculty || '').toUpperCase().replace(/\s+/g, '');
                if (teacher.includes(clean)) {
                    results.push({ ...cls, _section: cls._section || cls.section || section });
                }
            });
        });
        const classes = removeDuplicateClasses(normalizeClasses(results));
        if (!classes.length) throw new Error(`No classes found for teacher "${initials}".`);
        currentSearchTerm = clean;
        currentClasses = classes;
        displayTeacherRoutine(clean, classes);
        localStorage.setItem(STORAGE_KEY, initials);
        if (savedSectionSpan) savedSectionSpan.textContent = initials;
        if (savedChip) savedChip.style.display = 'inline-flex';
        hideMessage();
        setStatus('ready', 'Ready');
    } catch (error) {
        console.error('Teacher error:', error);
        setStatus('error', 'Error');
        showMessage(error.message, 'error');
        showNoRoutine('Teacher Not Found', `No data for "${initials}".`);
    }
}

// ============================================================
// ROOM
// ============================================================
async function loadRoom(roomName) {
    try {
        setStatus('loading', 'Loading...');
        if (!routineData) {
            routineData = await fetchJson(COMBINED_URL);
            updateMeta(routineData);
        }
        const clean = String(roomName).toUpperCase().replace(/\s+/g, '');
        const sections = routineData.sections || {};
        const results = [];
        Object.entries(sections).forEach(([section, data]) => {
            const classes = extractClassesFromData(data);
            classes.forEach(cls => {
                const room = String(cls.room || cls.room_no || cls.roomNumber || '').toUpperCase().replace(/\s+/g, '');
                if (room.includes(clean)) {
                    results.push({ ...cls, _section: cls._section || cls.section || section });
                }
            });
        });
        const classes = removeDuplicateClasses(normalizeClasses(results));
        if (!classes.length) throw new Error(`No classes found for room "${roomName}".`);
        currentSearchTerm = clean;
        currentClasses = classes;
        displayRoomRoutine(clean, classes);
        localStorage.setItem(STORAGE_KEY, roomName);
        if (savedSectionSpan) savedSectionSpan.textContent = roomName;
        if (savedChip) savedChip.style.display = 'inline-flex';
        hideMessage();
        setStatus('ready', 'Ready');
    } catch (error) {
        console.error('Room error:', error);
        setStatus('error', 'Error');
        showMessage(error.message, 'error');
        showNoRoutine('Room Not Found', `No data for "${roomName}".`);
    }
}

// ============================================================
// EMPTY ROOM
// ============================================================
async function loadEmptyRooms(filter = '') {
    try {
        setStatus('loading', 'Loading...');
        if (!routineData) {
            routineData = await fetchJson(COMBINED_URL);
            updateMeta(routineData);
        }
        const allClasses = getAllRoutineClasses();
        const rooms = getAllRooms(allClasses);
        currentRooms = rooms;
        if (!rooms.length) throw new Error('No room information found in routine data.');

        const cleanFilter = String(filter).trim().toLowerCase();
        const selectedDay = getDayFromInput(filter);
        const emptyByDay = {};
        DAYS.forEach(day => {
            const occupied = new Set();
            allClasses.forEach(cls => {
                const dayName = normalizeDay(cls.day);
                if (dayName !== day) return;
                const room = normalizeRoom(cls.room);
                if (room) occupied.add(room);
            });
            emptyByDay[day] = rooms.filter(room => !occupied.has(normalizeRoom(room)));
        });

        displayEmptyRooms(rooms, emptyByDay, cleanFilter, selectedDay);
        setStatus('ready', 'Ready');
    } catch (error) {
        console.error('Empty room error:', error);
        setStatus('error', 'Error');
        showMessage(error.message, 'error');
        showNoRoutine('Empty Room', 'Could not calculate empty rooms.');
    }
}

// ============================================================
// GET ALL ROUTINE CLASSES
// ============================================================
function getAllRoutineClasses() {
    if (!routineData) return [];
    const sections = routineData.sections || {};
    const all = [];
    Object.entries(sections).forEach(([section, data]) => {
        extractClassesFromData(data).forEach(cls => {
            all.push({ ...cls, _section: cls._section || cls.section || section });
        });
    });
    return removeDuplicateClasses(normalizeClasses(all));
}

// ============================================================
// GET ROOMS
// ============================================================
function getAllRooms(classes) {
    const rooms = new Set();
    classes.forEach(cls => {
        const room = String(cls.room || '').trim();
        if (!room) return;
        room.split(/\s*[,/]\s*/).forEach(value => {
            const clean = value.trim();
            if (clean) rooms.add(clean);
        });
    });
    return [...rooms].sort(naturalSort);
}

// ============================================================
// EMPTY ROOM DISPLAY
// ============================================================
function displayEmptyRooms(rooms, emptyByDay, filter, selectedDay) {
    let daysToShow = DAYS.filter(day => emptyByDay[day]);
    if (selectedDay) daysToShow = [selectedDay];
    if (filter && !selectedDay) {
        daysToShow = daysToShow.filter(day =>
            emptyByDay[day].some(room => room.toLowerCase().includes(filter))
        );
    }

    let html = `
        <div class="enrolled-card">
            <div class="card-title">
                <h3><i class="fas fa-door-open"></i> Empty Rooms</h3>
            </div>
            <div class="course-meta">
                <div class="meta-row"><span>Total Rooms</span><strong>${rooms.length}</strong></div>
                <div class="meta-row"><span>Today</span><strong>${getTodayName()}</strong></div>
            </div>
        </div>
        <div class="day-grid">
    `;

    daysToShow.forEach(day => {
        let emptyRooms = emptyByDay[day] || [];
        if (filter && !selectedDay) {
            emptyRooms = emptyRooms.filter(room => room.toLowerCase().includes(filter));
        }
        const isToday = isTodayDay(day);
        html += `
            <div class="day-card day-section ${isToday ? 'today' : ''}">
                <div class="day-card-header">
                    <span><i class="fas fa-calendar-alt"></i> ${escapeHtml(day)} ${isToday ? `<span class="today-dot" title="Today"></span>` : ''}</span>
                    <span>${emptyRooms.length} empty</span>
                </div>
                <div class="day-card-body">
                    ${emptyRooms.length ? emptyRooms.map(room => `
                        <div class="class-item">
                            <div class="time"><i class="fas fa-door-open"></i> Empty</div>
                            <div class="course">${escapeHtml(room)}</div>
                            <div class="details"><span><i class="fas fa-check-circle"></i> Available</span></div>
                        </div>
                    `).join('') : `<div style="padding:20px;text-align:center;color:var(--muted);">No empty rooms</div>`}
                </div>
            </div>
        `;
    });

    html += `</div>`;
    routineContainer.innerHTML = html;
}

// ============================================================
// DAY FROM INPUT
// ============================================================
function getDayFromInput(value) {
    const clean = String(value || '').trim().toLowerCase();
    if (!clean) return '';
    return DAYS.find(day => day.toLowerCase() === clean || day.substring(0, 3).toLowerCase() === clean) || '';
}

// ============================================================
// DISPLAY
// ============================================================
function displaySection(section, classes) {
    displayRoutine(classes, section, false, 'section');
}

function displayTeacherRoutine(teacher, classes) {
    displayRoutine(classes, teacher, true, 'teacher');
}

function displayRoomRoutine(room, classes) {
    displayRoutine(classes, room, true, 'room');
}

// ============================================================
// MAIN DISPLAY
// ============================================================
function displayRoutine(classes, title, showComment, mode) {
    classes = sortClasses(normalizeClasses(classes));
    currentClasses = classes;
    if (!classes.length) {
        showNoRoutine('No Data', 'No classes found.');
        return;
    }

    const teachers = [...new Set(classes.map(c => c.teacher).filter(Boolean))];
    const days = [...new Set(classes.map(c => normalizeDay(c.day)))];
    const batch = [...new Set(classes.map(c => c.batch || extractBatchFromSection(c.section)).filter(Boolean))];
    const cleanVersion = String(versionNumber?.textContent || routineData?.version || '5.0').replace(/^v/i, '');
    const icon = mode === 'teacher' ? 'fa-chalkboard-teacher' : mode === 'room' ? 'fa-door-open' : 'fa-user-graduate';
    const label = mode === 'teacher' ? 'Teacher' : mode === 'room' ? 'Room' : 'Student';

    let html = `
        <div class="enrolled-card">
            <div class="card-title">
                <h3><i class="fas ${icon}"></i> ${escapeHtml(label)} · ${escapeHtml(title)}</h3>
                <button class="cr-btn" onclick="downloadSection()" title="Download routine image">
                    <i class="fas fa-download"></i> Download
                </button>
            </div>
            <div class="course-meta">
                <div class="meta-row"><span>Total Classes</span><strong>${classes.length}</strong></div>
                <div class="meta-row"><span>Active Days</span><strong>${days.length}</strong></div>
                <div class="meta-row"><span>Routine Version</span><strong>v${escapeHtml(cleanVersion)}</strong></div>
                <div class="meta-row"><span>Semester</span><strong>${escapeHtml(getSemester())}</strong></div>
                ${batch.length ? `<div class="meta-row"><span>Batch</span><strong>${escapeHtml(batch.join(', '))}</strong></div>` : ''}
                ${mode === 'teacher' || mode === 'room' ? `<div class="meta-row"><span>Sections</span><strong>${escapeHtml([...new Set(classes.map(c => c._section || c.section || ''))].filter(Boolean).join(', '))}</strong></div>` : ''}
            </div>
            <div class="download-row">
                <span><i class="fas fa-image"></i> Download routine image</span>
                <button class="download-btn" onclick="downloadSection()" title="Download routine image">
                    <i class="fas fa-download"></i> PNG
                </button>
            </div>
            ${createRoutineLinkHtml()}
        </div>
        <div class="teacher-row">
            ${teachers.length ? teachers.map(teacher => {
                const initial = String(teacher).substring(0, 2).toUpperCase();
                return `<div class="teacher"><div class="avatar"><span>${escapeHtml(initial)}</span><span class="online"></span></div><span>${escapeHtml(teacher)}</span></div>`;
            }).join('') : ''}
        </div>
        <div class="view-tabs">
            <button class="view-tab active" data-view="day"><i class="fas fa-calendar-day"></i> Day View</button>
            <button class="view-tab" data-view="week"><i class="fas fa-calendar-week"></i> Week View</button>
        </div>
        <div id="viewContent"></div>
    `;

    routineContainer.innerHTML = html;
    renderDayView(classes, showComment, mode);

    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            if (tab.dataset.view === 'day') renderDayView(classes, showComment, mode);
            else renderWeekView(classes, showComment, mode);
        });
    });
}

// ============================================================
// DAY VIEW
// ============================================================
function renderDayView(classes, showComment, mode) {
    const container = document.getElementById('viewContent');
    if (!container) return;
    const grouped = {};
    DAYS.forEach(day => grouped[day] = []);
    classes.forEach(cls => {
        const day = normalizeDay(cls.day);
        if (grouped[day]) grouped[day].push(cls);
    });

    let html = `<div class="day-grid">`;
    DAYS.forEach(day => {
        const dayClasses = sortClasses(grouped[day]);
        if (!dayClasses.length) return;
        const today = isTodayDay(day);
        html += `
            <div class="day-card day-section ${today ? 'today' : ''}">
                <div class="day-card-header">
                    <span><i class="fas fa-calendar-alt"></i> ${escapeHtml(day)} ${today ? `<span class="today-dot" title="Today"></span>` : ''}</span>
                    <span>${dayClasses.length} classes</span>
                </div>
                <div class="day-card-body">
        `;
        dayClasses.forEach(cls => {
            const isLab = normalizeClassType(cls.type) === 'Lab';
            const typeClass = isLab ? 'type-lab' : 'type-theory';
            const typeLabel = isLab ? 'Lab' : 'Theory';
            const comment = getDisplayComment(cls, showComment, mode);
            const time = getClassTimeSlot(cls);
            html += `
                <div class="class-item">
                    <div class="time"><i class="far fa-clock"></i> ${escapeHtml(time || 'TBA')}</div>
                    <div class="course">${escapeHtml(cls.course)} ${comment ? `<span style="font-size:.8rem;color:#64748b;margin-left:4px;">${escapeHtml(comment)}</span>` : ''}</div>
                    <div class="details">
                        <span><i class="fas fa-chalkboard-teacher"></i> ${escapeHtml(cls.teacher || '?')}</span>
                        <span><i class="fas fa-door-open"></i> ${escapeHtml(cls.room || '?')}</span>
                        <span><span class="type-tag ${typeClass}">${typeLabel}</span></span>
                    </div>
                </div>
            `;
        });
        html += `</div></div>`;
    });
    html += `</div>`;
    container.innerHTML = html;
}

// ============================================================
// WEEK VIEW
// ============================================================
function renderWeekView(classes, showComment, mode) {
    const container = document.getElementById('viewContent');
    if (!container) return;
    const grouped = {};
    DAYS.forEach(day => grouped[day] = []);
    classes.forEach(cls => {
        const day = normalizeDay(cls.day);
        if (grouped[day]) grouped[day].push(cls);
    });

    let html = `<div class="week-view"><table class="week-table"><thead><tr><th>Time</th>`;
    DAYS.forEach(day => {
        const today = isTodayDay(day);
        html += `<th class="${today ? 'today-column' : ''}"><div class="week-day-header"><span>${day.substring(0, 3)}</span>${today ? `<span class="today-dot" title="Today"></span>` : ''}</div></th>`;
    });
    html += `</tr></thead><tbody>`;

    DISPLAY_TIME_SLOTS.forEach((slot, slotIndex) => {
        html += `<tr><td class="time-col">${escapeHtml(slot)}</td>`;
        DAYS.forEach(day => {
            const isToday = isTodayDay(day);
            // Skip second row of two-slot lab
            if (slotIndex === 3 && hasTwoSlotLab(grouped[day])) return;

            const matching = sortClasses(grouped[day].filter(cls =>
                getClassTimeSlot(cls) === slot || (slot === '11:30-01:00' && isTwoSlotLab(cls))
            ));
            const lab = matching.find(cls => isTwoSlotLab(cls));

            if (lab && slot === '11:30-01:00') {
                const comment = getDisplayComment(lab, showComment, mode);
                html += `
                    <td rowspan="2" class="routine-cell lab-cell ${isToday ? 'today-column' : ''}">
                        <strong>${escapeHtml(lab.course)}</strong>
                        ${comment ? `<span style="font-size:.7rem;color:#64748b;margin-left:3px;">${escapeHtml(comment)}</span>` : ''}
                        <span class="type-tag type-lab" style="font-size:.65rem;">Lab</span><br>
                        <span style="font-size:.8rem;color:#64748b;">${escapeHtml(lab.teacher || '?')} • ${escapeHtml(lab.room || '?')}</span>
                    </td>
                `;
                return;
            }

            if (matching.length) {
                html += `<td class="${isToday ? 'today-column' : ''}">`;
                matching.forEach(cls => {
                    const isLab = normalizeClassType(cls.type) === 'Lab';
                    const comment = getDisplayComment(cls, showComment, mode);
                    html += `
                        <div style="margin-bottom:6px;">
                            <strong>${escapeHtml(cls.course)}</strong>
                            ${comment ? `<span style="font-size:.7rem;color:#64748b;margin-left:3px;">${escapeHtml(comment)}</span>` : ''}
                            <span class="type-tag ${isLab ? 'type-lab' : 'type-theory'}" style="font-size:.65rem;">${isLab ? 'Lab' : 'Theory'}</span><br>
                            <span style="font-size:.8rem;color:#64748b;">${escapeHtml(cls.teacher || '?')} • ${escapeHtml(cls.room || '?')}</span>
                        </div>
                    `;
                });
                html += `</td>`;
            } else {
                html += `<td class="${isToday ? 'today-column' : ''}" style="color:#cbd5e1;">—</td>`;
            }
        });
        html += `</tr>`;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

// ============================================================
// TWO SLOT LAB HELPERS
// ============================================================
function isTwoSlotLab(cls) {
    if (!cls) return false;
    const type = normalizeClassType(cls.type);
    const time = getClassTimeSlot(cls);
    return type === 'Lab' && normalizeTime(time) === '11:30-02:30';
}

function hasTwoSlotLab(classes) {
    return Array.isArray(classes) && classes.some(cls => isTwoSlotLab(cls));
}

// ============================================================
// SUBSECTION LABEL
// ============================================================
function getDisplayComment(cls, showComment, mode) {
    if (showComment) {
        const section = cls._section || cls.section || cls.group || '';
        return section ? `(${section})` : '';
    }
    let sub = cls.sub_section ?? cls.subSection ?? cls.subsection ?? 'Main';
    sub = String(sub).trim();
    if (!sub || sub.toLowerCase() === 'main') return '';
    let letter = cls.section_letter || extractSectionLetter(cls.section);
    letter = String(letter || '').trim().charAt(0).toUpperCase();
    if (/^\d+$/.test(sub)) return letter ? `(${letter}${sub})` : `(${sub})`;
    if (/^[A-Za-z]\d+$/.test(sub)) return `(${sub.toUpperCase()})`;
    return '';
}

// ============================================================
// NORMALIZE CLASSES
// ============================================================
function normalizeClasses(classes) {
    if (!Array.isArray(classes)) return [];
    return classes.map(cls => {
        const section = cls.section || cls.section_name || cls.sectionName || '';
        let sub = cls.sub_section ?? cls.subSection ?? cls.subsection ?? 'Main';
        if (sub === null || sub === undefined || sub === '') sub = 'Main';
        if (String(sub).toLowerCase() === 'main') sub = 'Main';
        return {
            ...cls,
            day: normalizeDay(cls.day),
            time: normalizeTime(cls.time),
            course: String(cls.course || cls.course_code || cls.courseCode || '').trim(),
            teacher: String(cls.teacher || cls.faculty || cls.teacher_initials || '').trim(),
            room: String(cls.room || cls.room_no || cls.roomNumber || '').trim(),
            section: section,
            sub_section: String(sub).trim(),
            section_letter: cls.section_letter || extractSectionLetter(section),
            batch: cls.batch || extractBatchFromSection(section),
            type: normalizeClassType(cls.type || cls.class_type || cls.classType || '')
        };
    });
}

// ============================================================
// DAY NORMALIZE
// ============================================================
function normalizeDay(day) {
    if (!day) return '';
    const value = String(day).trim().toLowerCase();
    const map = { saturday: 'Saturday', sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday' };
    return map[value] || String(day).trim();
}

// ============================================================
// TIME NORMALIZE
// ============================================================
function normalizeTime(time) {
    if (!time) return '';
    return String(time).trim().replace(/\s+/g, '').replace(/[–—]/g, '-');
}

// ============================================================
// TYPE
// ============================================================
function normalizeClassType(type) {
    if (!type) return '';
    const value = String(type).trim().toLowerCase();
    if (value.includes('lab')) return 'Lab';
    if (value.includes('theory')) return 'Theory';
    return String(type).trim();
}

// ============================================================
// SORT
// ============================================================
function sortClasses(classes) {
    return [...classes].sort((a, b) => {
        const dayA = DAY_ORDER[normalizeDay(a.day)] ?? 999;
        const dayB = DAY_ORDER[normalizeDay(b.day)] ?? 999;
        if (dayA !== dayB) return dayA - dayB;
        const timeA = getTimeOrder(getClassTimeSlot(a));
        const timeB = getTimeOrder(getClassTimeSlot(b));
        if (timeA !== timeB) return timeA - timeB;
        return String(a.course || '').localeCompare(String(b.course || ''));
    });
}

// ============================================================
// TIME ORDER
// ============================================================
function getTimeOrder(time) {
    const normalized = normalizeTime(time);
    if (normalized === '11:30-02:30') return TIME_ORDER['11:30-01:00'];
    if (Object.prototype.hasOwnProperty.call(TIME_ORDER, normalized)) return TIME_ORDER[normalized];
    return getTimeStartMinutes(normalized);
}

// ============================================================
// TIME START
// ============================================================
function getTimeStartMinutes(time) {
    if (!time) return 9999;
    const match = String(time).match(/^(\d{1,2}):(\d{2})/);
    if (!match) return 9999;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour >= 1 && hour <= 5) hour += 12;
    return hour * 60 + minute;
}

// ============================================================
// CLASS TIME
// ============================================================
function getClassTimeSlot(cls) {
    if (cls.start && cls.end) return normalizeTime(`${cls.start}-${cls.end}`);
    return normalizeTime(cls.time || '');
}

// ============================================================
// SECTION HELPERS
// ============================================================
function getBaseSection(section) {
    return String(section || '').trim().toUpperCase().replace(/_\d+$/, '');
}

function extractBatchFromSection(section) {
    const match = String(section || '').match(/^(\d+)/);
    return match ? match[1] : '';
}

function extractSectionLetter(section) {
    const value = String(section || '').trim();
    const match = value.match(/^\d+[_\-\s]*([A-Za-z])/);
    if (match) return match[1].toUpperCase();
    const fallback = value.match(/([A-Za-z])$/);
    return fallback ? fallback[1].toUpperCase() : '';
}

// ============================================================
// REMOVE DUPLICATE
// ============================================================
function removeDuplicateClasses(classes) {
    const seen = new Set();
    const result = [];
    classes.forEach(cls => {
        const key = [
            cls.day || '',
            getClassTimeSlot(cls),
            cls.course || '',
            cls.teacher || '',
            cls.room || '',
            cls.sub_section || '',
            cls.section || cls._section || ''
        ].join('|');
        if (seen.has(key)) return;
        seen.add(key);
        result.push(cls);
    });
    return result;
}

// ============================================================
// ROOM NORMALIZE
// ============================================================
function normalizeRoom(room) {
    return String(room || '').trim().toUpperCase().replace(/\s+/g, '');
}

// ============================================================
// NATURAL SORT
// ============================================================
function naturalSort(a, b) {
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

// ============================================================
// TODAY
// ============================================================
function getTodayName() {
    const today = new Date();
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][today.getDay()];
}

function isTodayDay(day) {
    return normalizeDay(day) === getTodayName();
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
    for (const value of candidates) {
        if (value !== null && value !== undefined && String(value).trim()) {
            return normalizeSemesterName(String(value).trim());
        }
    }
    const updated = routineData?.updated_at || routineData?.updatedAt || routineData?.last_updated;
    if (updated) {
        const date = new Date(updated);
        if (!Number.isNaN(date.getTime())) return detectSemesterFromDate(date);
    }
    return detectSemesterFromDate(new Date());
}

function detectSemesterFromDate(date) {
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    let semester;
    if (month >= 1 && month <= 4) semester = 'Spring';
    else if (month >= 5 && month <= 8) semester = 'Summer';
    else semester = 'Fall';
    return `${semester} ${year}`;
}

function normalizeSemesterName(value) {
    const text = String(value).trim();
    const lower = text.toLowerCase();
    let semester;
    if (lower.includes('fall') || lower.includes('autumn')) semester = 'Fall';
    else if (lower.includes('summer')) semester = 'Summer';
    else if (lower.includes('spring') || lower.includes('winter')) semester = 'Spring';
    const yearMatch = text.match(/\b(20\d{2})\b/);
    const year = yearMatch ? yearMatch[1] : new Date().getFullYear();
    return semester ? `${semester} ${year}` : text;
}

// ============================================================
// META
// ============================================================
function updateMeta(data) {
    if (!data) return;
    if (data.version && versionNumber) {
        versionNumber.textContent = String(data.version).replace(/^v/i, '');
    }
    const updated = data.updated_at || data.updatedAt || data.last_updated;
    if (updated && lastUpdated) {
        const date = new Date(updated);
        if (!Number.isNaN(date.getTime())) {
            lastUpdated.textContent = 'Updated: ' + date.toLocaleString();
        } else {
            lastUpdated.textContent = 'Updated: ' + String(updated);
        }
    }
}

// ============================================================
// ROUTINE LINK
// ============================================================
function getRoutineLink() {
    if (!routineData) return '';
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
    return candidates.find(value => typeof value === 'string' && /^https?:\/\//i.test(value.trim())) || '';
}

function createRoutineLinkHtml() {
    const url = getRoutineLink();
    if (!url) return '';
    return `<div style="margin-top:12px;"><a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer" class="routine-link"><i class="fas fa-external-link-alt"></i> View Official Routine Source</a></div>`;
}

// ============================================================
// DOWNLOAD ROUTINE IMAGE — UPDATED WITH BETTER STYLING
// ============================================================
async function downloadSection() {
    if (!currentClasses || !currentClasses.length) {
        showMessage('No routine available to download.', 'error');
        return;
    }
    try {
        showMessage('Preparing routine image...', 'info');
        await loadHtml2Canvas();

        const imageElement = createRoutineDownloadCard();
        document.body.appendChild(imageElement);
        await new Promise(resolve => setTimeout(resolve, 300));

        const canvas = await html2canvas(imageElement, {
            scale: 2.5,
            backgroundColor: '#f1f5f9',
            useCORS: true,
            allowTaint: true,
            logging: false,
            width: imageElement.scrollWidth,
            height: imageElement.scrollHeight
        });

        imageElement.remove();

        const link = document.createElement('a');
        const section = currentMode === 'section' ? currentSearchTerm :
            (currentClasses[0]?.section || currentSearchTerm || 'routine');
        link.download = `DIU-CSE-Routine-${section}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

        showMessage('Routine image downloaded successfully.', 'success');
    } catch (error) {
        console.error('Download error:', error);
        showMessage('Could not create routine image.', 'error');
    }
}

// ============================================================
// LOAD HTML2CANVAS
// ============================================================
function loadHtml2Canvas() {
    return new Promise((resolve, reject) => {
        if (window.html2canvas) { resolve(); return; }
        const existing = document.querySelector('script[data-html2canvas]');
        if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('html2canvas failed to load.')));
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.async = true;
        script.dataset.html2canvas = 'true';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Unable to load html2canvas.'));
        document.head.appendChild(script);
    });
}

// ============================================================
// CREATE DOWNLOAD CARD — REFINED STYLING
// ============================================================
function createRoutineDownloadCard() {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-100000px';
    wrapper.style.top = '0';
    wrapper.style.width = '1600px';
    wrapper.style.background = '#f1f5f9';
    wrapper.style.padding = '48px 52px';
    wrapper.style.boxSizing = 'border-box';
    wrapper.style.fontFamily = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    wrapper.style.color = '#0f172a';

    const section = currentMode === 'section' ? currentSearchTerm :
        (currentClasses[0]?.section || currentSearchTerm || 'Routine');
    const semester = getSemester();
    const version = String(routineData?.version || versionNumber?.textContent || '5.0').replace(/^v/i, '');
    const sorted = sortClasses(normalizeClasses(currentClasses));

    // Build cell map
    const cellMap = {};
    DAYS.forEach(day => {
        cellMap[day] = {};
        DISPLAY_TIME_SLOTS.forEach(slot => { cellMap[day][slot] = []; });
    });
    sorted.forEach(cls => {
        const day = normalizeDay(cls.day);
        const slot = getClassTimeSlot(cls);
        if (isTwoSlotLab(cls)) {
            if (cellMap[day]) cellMap[day]['11:30-01:00'].push(cls);
            return;
        }
        if (cellMap[day] && cellMap[day][slot]) cellMap[day][slot].push(cls);
    });

    // ---- BUILD HTML ----
    let html = `
        <div style="background:#ffffff;border-radius:28px;overflow:hidden;box-shadow:0 24px 80px rgba(15,23,42,0.14);border:1px solid #e2e8f0;">

        <!-- HEADER -->
        <div style="padding:36px 44px 30px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);color:#ffffff;">
            <div style="font-size:13px;letter-spacing:2.5px;font-weight:700;opacity:.7;margin-bottom:6px;">DAFFODIL INTERNATIONAL UNIVERSITY</div>
            <div style="font-size:28px;font-weight:800;margin-bottom:4px;letter-spacing:-0.5px;">Department of Computer Science &amp; Engineering</div>
            <div style="font-size:17px;opacity:.85;font-weight:500;">CSE Class Routine</div>
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:22px;">
                <span style="background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.16);padding:8px 18px;border-radius:999px;font-size:14px;font-weight:700;">${escapeHtml(section)}</span>
                <span style="background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.16);padding:8px 18px;border-radius:999px;font-size:14px;font-weight:700;">${escapeHtml(semester)}</span>
                <span style="background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.16);padding:8px 18px;border-radius:999px;font-size:14px;font-weight:700;">Version ${escapeHtml(version)}</span>
            </div>
        </div>

        <!-- TABLE -->
        <div style="padding:30px 36px 40px;">
            <table style="width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;font-size:13.5px;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
                <thead>
                    <tr>
                        <th style="width:140px;padding:16px 14px;background:#0f172a;color:#ffffff;text-align:left;font-weight:700;font-size:14px;border:1px solid #1e293b;">Time</th>
    `;

    DAYS.forEach(day => {
        const today = isTodayDay(day);
        html += `
            <th style="padding:16px 10px;background:#0f172a;color:#ffffff;text-align:center;font-weight:700;font-size:14px;border:1px solid #1e293b;${today ? 'box-shadow:inset 0 -4px 0 #22c55e;' : ''}">
                ${escapeHtml(day.substring(0,3))} ${today ? '•' : ''}
            </th>
        `;
    });

    html += `</tr></thead><tbody>`;

    DISPLAY_TIME_SLOTS.forEach((slot, slotIndex) => {
        html += `<tr><td style="padding:14px 12px;font-weight:700;background:#f8fafc;border:1px solid #e2e8f0;vertical-align:middle;font-size:13px;text-align:center;color:#0f172a;">${escapeHtml(slot)}</td>`;

        DAYS.forEach(day => {
            const today = isTodayDay(day);
            // Skip second row of two-slot lab
            if (slotIndex === 3 && hasTwoSlotLab(cellMap[day]['11:30-01:00'])) return;

            const items = cellMap[day][slot] || [];

            if (!items.length) {
                html += `
                    <td style="padding:14px 10px;border:1px solid #e2e8f0;background:${today ? '#f0fdf4' : '#ffffff'};vertical-align:middle;text-align:center;color:#cbd5e1;font-weight:400;">—</td>
                `;
                return;
            }

            const lab = items.find(cls => isTwoSlotLab(cls));

            // ---- TWO-SLOT LAB ----
            if (lab && slot === '11:30-01:00') {
                const comment = getDisplayComment(lab, currentMode !== 'section', currentMode);
                html += `
                    <td rowspan="2" style="padding:16px 14px;border:1px solid #e2e8f0;background:#fefce8;vertical-align:top;text-align:left;">
                        <div style="font-weight:800;font-size:16px;margin-bottom:6px;color:#0f172a;">${escapeHtml(lab.course)} ${comment ? `<span style="font-size:12px;font-weight:600;color:#64748b;">${escapeHtml(comment)}</span>` : ''}</div>
                        <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:#fef3c7;color:#92400e;font-size:10px;font-weight:800;letter-spacing:0.3px;margin-bottom:8px;">LAB</div>
                        <div style="font-size:12px;line-height:1.6;color:#475569;">${escapeHtml(lab.teacher || '?')}<br>${escapeHtml(lab.room || '?')}</div>
                    </td>
                `;
                return;
            }

            // ---- NORMAL CELL ----
            html += `
                <td style="padding:12px 10px;border:1px solid #e2e8f0;background:${today ? '#f0fdf4' : '#ffffff'};vertical-align:top;">
            `;
            items.forEach(cls => {
                const isLab = normalizeClassType(cls.type) === 'Lab';
                const comment = getDisplayComment(cls, currentMode !== 'section', currentMode);
                html += `
                    <div style="padding:10px 12px;margin-bottom:6px;border:1px solid #e2e8f0;border-radius:10px;background:#ffffff;transition:0.15s;">
                        <div style="font-weight:800;font-size:14px;margin-bottom:4px;color:#0f172a;">${escapeHtml(cls.course)} ${comment ? `<span style="font-size:11px;font-weight:600;color:#64748b;">${escapeHtml(comment)}</span>` : ''}</div>
                        <div style="display:inline-block;padding:3px 9px;border-radius:999px;background:${isLab ? '#fef3c7' : '#dbeafe'};color:${isLab ? '#92400e' : '#1e40af'};font-size:9.5px;font-weight:800;letter-spacing:0.3px;margin-bottom:5px;">${isLab ? 'LAB' : 'THEORY'}</div>
                        <div style="font-size:11.5px;color:#475569;line-height:1.5;">${escapeHtml(cls.teacher || '?')}<br>${escapeHtml(cls.room || '?')}</div>
                    </div>
                `;
            });
            html += `</td>`;
        });

        html += `</tr>`;
    });

    html += `
                </tbody>
            </table>

            <!-- FOOTER -->
            <div style="margin-top:26px;padding-top:18px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:20px;font-size:12px;color:#64748b;">
                <span>Generated by DIU CSE Routine</span>
                <span>${escapeHtml(new Date().toLocaleString())}</span>
            </div>
        </div>
    </div>
    `;

    wrapper.innerHTML = html;
    return wrapper;
}

// ============================================================
// CLEAR
// ============================================================
function handleClearSection() {
    if (sectionInput) sectionInput.value = '';
    localStorage.removeItem(STORAGE_KEY);
    if (savedChip) savedChip.style.display = 'none';
    if (savedSectionSpan) savedSectionSpan.textContent = '';
    currentSearchTerm = '';
    currentClasses = [];
    if (routineContainer) routineContainer.innerHTML = '';
    showNoRoutine(
        'Search Routine',
        currentMode === 'section' ? 'Enter your section to view the routine.' :
        currentMode === 'teacher' ? 'Enter teacher initials to view the routine.' :
        currentMode === 'room' ? 'Enter room name to view the routine.' :
        'Enter a day or room to search empty rooms.'
    );
}

// ============================================================
// STATUS
// ============================================================
function setStatus(type, text) {
    if (statusText) statusText.textContent = text;
    if (statusBadge) {
        statusBadge.classList.remove('loading', 'ready', 'error');
        statusBadge.classList.add(type);
    }
}

// ============================================================
// MESSAGE
// ============================================================
function showMessage(text, type = 'info') {
    if (!message) return;
    message.textContent = text;
    message.className = `message ${type}`;
    message.style.display = 'block';
}

function hideMessage() {
    if (!message) return;
    message.style.display = 'none';
}

// ============================================================
// NO ROUTINE
// ============================================================
function showNoRoutine(title, text) {
    if (!routineContainer) return;
    routineContainer.innerHTML = `
        <div class="enrolled-card" style="text-align:center;padding:50px 30px;">
            <div style="width:68px;height:68px;margin:0 auto 18px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#f1f5f9;color:#2563eb;font-size:28px;"><i class="fas fa-calendar-alt"></i></div>
            <h3 style="margin-bottom:8px;font-size:20px;">${escapeHtml(title)}</h3>
            <p style="color:#64748b;margin:0;font-size:15px;">${escapeHtml(text)}</p>
        </div>
    `;
}

// ============================================================
// ESCAPE
// ============================================================
function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function escapeAttribute(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================================================
// AUTO REFRESH
// ============================================================
const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000;
setInterval(async () => {
    try {
        if (document.visibilityState !== 'visible') return;
        if (currentMode === 'section') {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) { routineData = null; await loadSection(saved); }
        } else if (currentMode === 'teacher') {
            if (currentSearchTerm) { routineData = null; await loadTeacher(currentSearchTerm); }
        } else if (currentMode === 'room') {
            if (currentSearchTerm) { routineData = null; await loadRoom(currentSearchTerm); }
        } else if (currentMode === 'empty-room') {
            routineData = null;
            await loadEmptyRooms(sectionInput?.value || '');
        }
    } catch (error) {
        console.warn('Auto refresh failed:', error);
    }
}, AUTO_REFRESH_INTERVAL);

// ============================================================
// EXPOSE DOWNLOAD
// ============================================================
window.downloadSection = downloadSection;

// ============================================================
// END
// ============================================================
