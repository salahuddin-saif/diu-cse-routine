// DIU CSE Routine – Section, Teacher & Room Modes

const STORAGE_KEY = 'diu_cse_section';
const MODE_KEY = 'diu_cse_mode'; // 'section', 'teacher', 'room'
const COMBINED_URL = './data/routine.json?t=' + Date.now();

// DOM Elements
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
let currentMode = 'section'; // 'section', 'teacher', 'room'
let currentSearchTerm = '';
let currentClasses = [];

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    // Restore mode
    const savedMode = localStorage.getItem(MODE_KEY) || 'section';
    currentMode = savedMode;
    updateModeUI();

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        sectionInput.value = saved;
        savedSectionSpan.textContent = saved;
        savedChip.style.display = 'inline-flex';
    } else {
        savedChip.style.display = 'none';
    }

    loadRoutineData();

    // --- Event Listeners ---
    // Search icon click
    if (searchIcon) {
        searchIcon.style.cursor = 'pointer';
        searchIcon.addEventListener('click', handleSearch);
    }
    // Hidden button
    if (showRoutineBtn) {
        showRoutineBtn.addEventListener('click', handleSearch);
    }
    // Clear button
    clearSectionBtn.addEventListener('click', handleClearSection);

    // Enter key
    sectionInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            handleSearch();
        }
    });
    sectionInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            handleSearch();
        }
    });

    // Mode toggles
    if (userBtn) {
        userBtn.addEventListener('click', () => setMode('section'));
    }
    if (teacherBtn) {
        teacherBtn.addEventListener('click', () => setMode('teacher'));
    }
    if (roomBtn) {
        roomBtn.addEventListener('click', () => setMode('room'));
    }
});

// ============================================================
// MODE MANAGEMENT
// ============================================================

function setMode(mode) {
    if (currentMode === mode) return;
    currentMode = mode;
    localStorage.setItem(MODE_KEY, mode);
    updateModeUI();
    // Clear current data
    routineContainer.innerHTML = '';
    savedChip.style.display = 'none';
    sectionInput.value = '';
    localStorage.removeItem(STORAGE_KEY);
    showMessage(`Switched to ${mode.charAt(0).toUpperCase() + mode.slice(1)} Mode`, 'info');
    // Show appropriate placeholder
    if (mode === 'section') {
        sectionInput.placeholder = 'Enter section (e.g., 70_N)';
        loadRoutineData(); // reload first section
    } else if (mode === 'teacher') {
        sectionInput.placeholder = 'Enter teacher initials (e.g., ABC)';
        showNoRoutine('Teacher Mode', 'Enter teacher initials to see their classes.');
    } else if (mode === 'room') {
        sectionInput.placeholder = 'Enter room (e.g., KT-201)';
        showNoRoutine('Room Mode', 'Enter room name to see its schedule.');
    }
}

function updateModeUI() {
    // Update header label
    const brandStrong = document.querySelector('.brand strong');
    if (brandStrong) {
        if (currentMode === 'section') brandStrong.textContent = 'Student';
        else if (currentMode === 'teacher') brandStrong.textContent = 'Teacher';
        else if (currentMode === 'room') brandStrong.textContent = 'Room';
    }
    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    if (currentMode === 'section' && userBtn) userBtn.classList.add('active');
    else if (currentMode === 'teacher' && teacherBtn) teacherBtn.classList.add('active');
    else if (currentMode === 'room' && roomBtn) roomBtn.classList.add('active');
}

// ============================================================
// SEARCH DISPATCH
// ============================================================

function handleSearch() {
    const raw = sectionInput.value.trim();
    if (!raw) {
        showMessage('Please enter something to search.', 'error');
        return;
    }
    const normalized = raw.toUpperCase().replace(/\s+/g, '_');

    if (currentMode === 'section') {
        loadSection(normalized);
    } else if (currentMode === 'teacher') {
        loadTeacher(normalized);
    } else if (currentMode === 'room') {
        loadRoom(normalized);
    }
}

// ============================================================
// LOAD ROUTINE DATA (combined JSON once)
// ============================================================

async function loadRoutineData() {
    try {
        setStatus('loading', 'Loading...');
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && currentMode === 'section') {
            await loadSection(saved);
            return;
        }

        const response = await fetch(COMBINED_URL);
        if (!response.ok) throw new Error('Failed to load combined data');
        const data = await response.json();
        routineData = data;
        if (data.version) versionNumber.textContent = data.version;
        if (data.updated_at) {
            const date = new Date(data.updated_at);
            lastUpdated.textContent = 'Updated: ' + date.toLocaleString();
        }

        if (currentMode === 'section') {
            const sections = data.sections || {};
            const keys = Object.keys(sections);
            if (keys.length > 0) {
                const firstBase = keys[0];
                const merged = mergeSubSections(firstBase);
                if (merged.length > 0) {
                    displaySection(firstBase, merged);
                    sectionInput.value = firstBase;
                    savedSectionSpan.textContent = firstBase;
                    savedChip.style.display = 'inline-flex';
                    localStorage.setItem(STORAGE_KEY, firstBase);
                } else {
                    showNoRoutine('No Data', 'No routine data available.');
                }
            } else {
                showNoRoutine('No Data', 'No routine data available.');
            }
        } else {
            // Teacher or room mode: show empty state
            showNoRoutine(`${currentMode.charAt(0).toUpperCase() + currentMode.slice(1)} Mode`, `Enter ${currentMode} name to see results.`);
        }
        setStatus('ready', 'Ready');
    } catch (error) {
        console.error('Failed to load routine:', error);
        setStatus('error', 'Error');
        showMessage('Could not load routine data. Please try again.', 'error');
        showNoRoutine('Error', 'Data could not be loaded.');
    }
}

// ============================================================
// SECTION LOADING (with sub-section merging)
// ============================================================

async function loadSection(sectionKey) {
    try {
        setStatus('loading', 'Loading...');
        const normalized = sectionKey.toUpperCase().replace(/\s+/g, '_');
        console.log('🔍 Searching for section:', normalized);

        if (!routineData) {
            const resp = await fetch(COMBINED_URL);
            if (!resp.ok) throw new Error('Combined data not found');
            routineData = await resp.json();
            if (routineData.version) versionNumber.textContent = routineData.version;
            if (routineData.updated_at) {
                const date = new Date(routineData.updated_at);
                lastUpdated.textContent = 'Updated: ' + date.toLocaleString();
            }
        }

        const sections = routineData.sections || {};
        const matchingKeys = Object.keys(sections).filter(k => k.startsWith(normalized) || k === normalized);
        if (matchingKeys.length === 0) {
            const fallbackKey = Object.keys(sections).find(k => k.startsWith(normalized) || normalized.startsWith(k));
            if (fallbackKey) matchingKeys.push(fallbackKey);
        }

        if (matchingKeys.length === 0) {
            throw new Error(`Section "${normalized}" not found.`);
        }

        const mergedClasses = [];
        for (const key of matchingKeys) {
            const secData = sections[key];
            if (secData && Array.isArray(secData)) {
                mergedClasses.push(...secData);
            } else if (secData && secData.classes) {
                mergedClasses.push(...secData.classes);
            }
        }

        if (mergedClasses.length === 0) {
            throw new Error(`No classes found for section "${normalized}".`);
        }

        const baseSection = normalized.replace(/_\d+$/, '');
        const displayKey = baseSection !== normalized ? baseSection : normalized;

        currentSearchTerm = displayKey;
        currentClasses = mergedClasses;
        displaySection(displayKey, mergedClasses);

        localStorage.setItem(STORAGE_KEY, normalized);
        savedSectionSpan.textContent = normalized;
        savedChip.style.display = 'inline-flex';
        setStatus('ready', 'Ready');
        hideMessage();

    } catch (error) {
        console.error('❌ Failed to load section:', error);
        setStatus('error', 'Error');
        showMessage(error.message, 'error');
        showNoRoutine('Section Not Found', `No data for "${sectionKey}".`);
    }
}

// ============================================================
// TEACHER LOADING
// ============================================================

async function loadTeacher(initials) {
    try {
        setStatus('loading', 'Loading...');
        const clean = initials.toUpperCase().replace(/\s+/g, '');
        console.log('🔍 Searching for teacher:', clean);

        if (!routineData) {
            const resp = await fetch(COMBINED_URL);
            if (!resp.ok) throw new Error('Combined data not found');
            routineData = await resp.json();
        }

        const sections = routineData.sections || {};
        let allClasses = [];
        for (const [secKey, secData] of Object.entries(sections)) {
            const classes = secData.classes || secData;
            if (!Array.isArray(classes)) continue;
            for (const cls of classes) {
                const teacher = (cls.teacher || '').toUpperCase();
                if (teacher.includes(clean)) {
                    const enriched = { ...cls, _section: secKey };
                    allClasses.push(enriched);
                }
            }
        }

        if (allClasses.length === 0) {
            throw new Error(`No classes found for teacher "${initials}".`);
        }

        currentSearchTerm = clean;
        currentClasses = allClasses;
        displayTeacherRoutine(clean, allClasses);
        localStorage.setItem(STORAGE_KEY, initials);
        savedSectionSpan.textContent = initials;
        savedChip.style.display = 'inline-flex';
        setStatus('ready', 'Ready');
        hideMessage();

    } catch (error) {
        console.error('❌ Failed to load teacher:', error);
        setStatus('error', 'Error');
        showMessage(error.message, 'error');
        showNoRoutine('Teacher Not Found', `No data for "${initials}".`);
    }
}

// ============================================================
// ROOM LOADING
// ============================================================

async function loadRoom(roomName) {
    try {
        setStatus('loading', 'Loading...');
        const clean = roomName.toUpperCase().replace(/\s+/g, '');
        console.log('🔍 Searching for room:', clean);

        if (!routineData) {
            const resp = await fetch(COMBINED_URL);
            if (!resp.ok) throw new Error('Combined data not found');
            routineData = await resp.json();
        }

        const sections = routineData.sections || {};
        let allClasses = [];
        for (const [secKey, secData] of Object.entries(sections)) {
            const classes = secData.classes || secData;
            if (!Array.isArray(classes)) continue;
            for (const cls of classes) {
                const room = (cls.room || '').toUpperCase();
                if (room.includes(clean)) {
                    const enriched = { ...cls, _section: secKey };
                    allClasses.push(enriched);
                }
            }
        }

        if (allClasses.length === 0) {
            throw new Error(`No classes found for room "${roomName}".`);
        }

        currentSearchTerm = clean;
        currentClasses = allClasses;
        displayRoomRoutine(clean, allClasses);
        localStorage.setItem(STORAGE_KEY, roomName);
        savedSectionSpan.textContent = roomName;
        savedChip.style.display = 'inline-flex';
        setStatus('ready', 'Ready');
        hideMessage();

    } catch (error) {
        console.error('❌ Failed to load room:', error);
        setStatus('error', 'Error');
        showMessage(error.message, 'error');
        showNoRoutine('Room Not Found', `No data for "${roomName}".`);
    }
}

// ============================================================
// DISPLAY FUNCTIONS (Generic)
// ============================================================

function displaySection(sectionKey, classes) {
    displayRoutine(classes, sectionKey, false, 'section');
}

function displayTeacherRoutine(initials, classes) {
    displayRoutine(classes, initials, true, 'teacher');
}

function displayRoomRoutine(roomName, classes) {
    displayRoutine(classes, roomName, true, 'room');
}

// ============================================================
// GENERIC DISPLAY ROUTINE
// ============================================================

function displayRoutine(classes, title, showComment, mode) {
    routineContainer.innerHTML = '';

    if (!classes || classes.length === 0) {
        showNoRoutine('No Data', 'No classes found.');
        return;
    }

    const teachers = [...new Set(classes.map(c => c.teacher).filter(t => t && t !== '?' && t !== 'TBA'))];
    const total = classes.length;
    const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const uniqueDays = [...new Set(classes.map(c => c.day))].filter(d => days.includes(d));
    const perWeek = uniqueDays.length;

    // Determine batch (if all share same, show it)
    const batches = [...new Set(classes.map(c => (c.batch || c.group?.split('_')[0] || 'Unknown')))];
    const batchDisplay = batches.length === 1 ? batches[0] : 'Various';

    let html = '';

    // ----- Enrolled Card -----
    const icon = mode === 'teacher' ? 'fa-chalkboard-teacher' : (mode === 'room' ? 'fa-door-open' : 'fa-user-graduate');
    const label = mode === 'teacher' ? 'Teacher' : (mode === 'room' ? 'Room' : 'Student');
    html += `
        <div class="enrolled-card">
            <div class="card-title">
                <h3><i class="fas ${icon}"></i> ${label} · ${title}</h3>
                <button class="cr-btn" onclick="downloadSection()"><i class="fas fa-download"></i></button>
            </div>
            <div class="course-meta">
                <div class="meta-row"><span>Total Classes</span><strong>${total}</strong></div>
                <div class="meta-row"><span>Active Days</span><strong>${perWeek}</strong></div>
                <div class="meta-row"><span>Routine Version</span><strong>v${versionNumber.textContent || '5.0'}</strong></div>
                ${batchDisplay !== 'Various' ? `<div class="meta-row"><span>Batch</span><strong>${batchDisplay}</strong></div>` : ''}
                ${mode === 'teacher' ? `<div class="meta-row"><span>Sections</span><strong>${[...new Set(classes.map(c => c._section || c.group || '?'))].join(', ')}</strong></div>` : ''}
                ${mode === 'room' ? `<div class="meta-row"><span>Sections</span><strong>${[...new Set(classes.map(c => c._section || c.group || '?'))].join(', ')}</strong></div>` : ''}
            </div>
            <div class="download-row">
                <span><i class="fas fa-download"></i> Download PDF for ${title}</span>
                <button class="download-btn" onclick="downloadSection()"><i class="fas fa-arrow-down"></i></button>
            </div>
        </div>
    `;

    // ----- Teacher Row (avatars) -----
    html += `<div class="teacher-row">`;
    if (teachers.length > 0) {
        teachers.forEach(t => {
            const initial = t.substring(0, 2).toUpperCase();
            html += `
                <div class="teacher">
                    <div class="avatar"><span>${initial}</span><span class="online"></span></div>
                    <span>${t}</span>
                </div>
            `;
        });
    } else {
        html += `<div class="teacher blank"><div class="avatar">?</div><span>No teachers</span></div>`;
    }
    html += `</div>`;

    // ----- View Tabs -----
    html += `
        <div class="view-tabs">
            <button class="view-tab active" data-view="day"><i class="fas fa-calendar-day"></i> Day View</button>
            <button class="view-tab" data-view="week"><i class="fas fa-calendar-week"></i> Week View</button>
        </div>
        <div id="viewContent"></div>
    `;

    routineContainer.innerHTML = html;

    // Render default view (day)
    renderDayView(classes, showComment, mode);

    // Tab switching
    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            if (this.dataset.view === 'day') renderDayView(classes, showComment, mode);
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

    const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const grouped = {};
    for (const cls of classes) {
        if (!grouped[cls.day]) grouped[cls.day] = [];
        grouped[cls.day].push(cls);
    }

    let html = `<div class="day-grid">`;
    for (const day of days) {
        if (!grouped[day]) continue;
        const sorted = grouped[day].sort((a, b) => {
            if (a.time === 'TBA') return 1;
            if (b.time === 'TBA') return -1;
            return a.time.localeCompare(b.time);
        });
        html += `
            <div class="day-card">
                <div class="day-card-header">
                    <span><i class="fas fa-calendar-alt"></i> ${day}</span>
                    <span>${sorted.length} classes</span>
                </div>
                <div class="day-card-body">
        `;
        for (const cls of sorted) {
            const isLab = cls.type === 'lab';
            const typeClass = isLab ? 'type-lab' : 'type-theory';
            const typeLabel = isLab ? 'Lab' : 'Theory';

            let comment = '';
            if (showComment) {
                // For teacher/room mode: show section
                const sec = cls._section || cls.group || '';
                if (sec) comment = `(${sec})`;
            } else {
                // Section mode: show sub-section if exists
                const group = cls.group || cls.section || '';
                if (group) {
                    const parts = group.split('_');
                    if (parts.length > 1) {
                        const suffix = parts[1];
                        const match = suffix.match(/^([A-Z]+)(\d+)$/);
                        if (match) comment = `(${match[1]}${match[2]})`;
                        else if (suffix !== parts[0]) comment = `(${suffix})`;
                    }
                }
            }

            const timeDisplay = cls.start && cls.end ? `${cls.start} – ${cls.end}` : (cls.time || 'TBA');

            html += `
                <div class="class-item">
                    <div class="time"><i class="far fa-clock"></i> ${escapeHtml(timeDisplay)}</div>
                    <div class="course">${escapeHtml(cls.course)} <span style="font-size:0.8rem;color:var(--muted);">${escapeHtml(comment)}</span></div>
                    <div class="details">
                        <span><i class="fas fa-chalkboard-teacher"></i> ${escapeHtml(cls.teacher || '?')}</span>
                        <span><i class="fas fa-door-open"></i> ${escapeHtml(cls.room || '?')}</span>
                        <span><span class="type-tag ${typeClass}">${typeLabel}</span></span>
                    </div>
                </div>
            `;
        }
        html += `</div></div>`;
    }
    html += `</div>`;
    container.innerHTML = html;
}

// ============================================================
// WEEK VIEW
// ============================================================

function renderWeekView(classes, showComment, mode) {
    const container = document.getElementById('viewContent');
    if (!container) return;

    const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const grouped = {};
    for (const cls of classes) {
        if (!grouped[cls.day]) grouped[cls.day] = [];
        grouped[cls.day].push(cls);
    }

    const timeSlots = [];
    for (const cls of classes) {
        const slot = cls.start && cls.end ? `${cls.start}-${cls.end}` : (cls.time || 'TBA');
        if (!timeSlots.includes(slot)) timeSlots.push(slot);
    }
    timeSlots.sort();

    let html = `<div class="week-view"><table class="week-table"><thead><tr><th>Time</th>`;
    for (const day of days) html += `<th>${day.substring(0, 3)}</th>`;
    html += '</tr></thead><tbody>';

    for (const slot of timeSlots) {
        html += `<tr><td class="time-col">${escapeHtml(slot)}</td>`;
        for (const day of days) {
            const dayClasses = grouped[day] || [];
            const matching = dayClasses.filter(c => {
                const cSlot = c.start && c.end ? `${c.start}-${c.end}` : (c.time || 'TBA');
                return cSlot === slot;
            });
            if (matching.length > 0) {
                html += `<td>`;
                for (const cls of matching) {
                    const isLab = cls.type === 'lab';
                    const typeClass = isLab ? 'type-lab' : 'type-theory';
                    const typeLabel = isLab ? 'Lab' : 'Theory';
                    let comment = '';
                    if (showComment) {
                        const sec = cls._section || cls.group || '';
                        if (sec) comment = `(${sec})`;
                    } else {
                        const group = cls.group || cls.section || '';
                        if (group) {
                            const parts = group.split('_');
                            if (parts.length > 1) {
                                const suffix = parts[1];
                                const match = suffix.match(/^([A-Z]+)(\d+)$/);
                                if (match) comment = `(${match[1]}${match[2]})`;
                                else if (suffix !== parts[0]) comment = `(${suffix})`;
                            }
                        }
                    }
                    html += `<div style="margin-bottom:4px;">
                        <strong>${escapeHtml(cls.course)}</strong> <span style="font-size:0.7rem;color:var(--muted);">${escapeHtml(comment)}</span>
                        <span class="type-tag ${typeClass}" style="font-size:0.65rem;">${typeLabel}</span><br>
                        <span style="font-size:0.8rem;color:var(--muted);">${escapeHtml(cls.teacher)} • ${escapeHtml(cls.room)}</span>
                    </div>`;
                }
                html += `</td>`;
            } else {
                html += `<td style="color:var(--soft);">—</td>`;
            }
        }
        html += '</tr>';
    }
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// ============================================================
// HANDLERS
// ============================================================

function handleClearSection() {
    localStorage.removeItem(STORAGE_KEY);
    savedChip.style.display = 'none';
    sectionInput.value = '';
    showMessage('Saved search cleared.', 'info');
    loadRoutineData();
}

function downloadSection() {
    const label = currentSearchTerm || 'routine';
    alert(`Download PDF for ${label} (coming soon)`);
}

// ============================================================
// HELPERS
// ============================================================

function showNoRoutine(title, msg) {
    routineContainer.innerHTML = `
        <div class="no-routine">
            <div class="icon">📅</div>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(msg)}</p>
        </div>
    `;
}

function setStatus(type, text) {
    statusBadge.className = 'status ' + type;
    statusText.textContent = text;
}

function showMessage(text, type) {
    message.textContent = text;
    message.style.display = 'block';
    message.className = type;
    setTimeout(() => { message.style.display = 'none'; }, 5000);
}

function hideMessage() {
    message.style.display = 'none';
}

function escapeHtml(text) {
    if (!text) return '-';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// AUTO-REFRESH (every 5 minutes)
// ============================================================

setInterval(() => {
    if (!document.hidden) {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            if (currentMode === 'section') loadSection(saved);
            else if (currentMode === 'teacher') loadTeacher(saved);
            else if (currentMode === 'room') loadRoom(saved);
        }
    }
}, 5 * 60 * 1000);
