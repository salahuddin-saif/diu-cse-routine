// DIU CSE Routine – Loads from routine.json (coordinate parser)

const ROUTINE_URL = './data/routine.json?t=' + Date.now();
const STORAGE_KEY = 'diu_cse_section';

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

let routineData = null;
let currentSection = null;
let currentClasses = [];

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        sectionInput.value = saved;
        savedSectionSpan.textContent = saved;
        savedChip.style.display = 'inline-flex';
    } else {
        savedChip.style.display = 'none';
    }

    loadRoutineData();

    showRoutineBtn.addEventListener('click', handleShowRoutine);
    clearSectionBtn.addEventListener('click', handleClearSection);
    sectionInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleShowRoutine();
    });
});

// ============================================================
// DATA LOADING
// ============================================================

async function loadRoutineData() {
    try {
        setStatus('loading', 'Loading...');
        const response = await fetch(ROUTINE_URL);
        if (!response.ok) throw new Error('Failed to load routine data');
        const data = await response.json();
        routineData = data;

        // Update version/update info
        if (data.meta) {
            if (data.meta.version) versionNumber.textContent = data.meta.version;
            if (data.meta.updatedAt) {
                const date = new Date(data.meta.updatedAt);
                lastUpdated.textContent = 'Updated: ' + date.toLocaleString();
            }
        }

        setStatus('ready', 'Ready');
        hideMessage();

        // Show saved section or first available
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && data.sections && data.sections[saved]) {
            displaySection(saved, data.sections[saved]);
        } else if (data.sections) {
            const sections = Object.keys(data.sections);
            if (sections.length > 0) {
                displaySection(sections[0], data.sections[sections[0]]);
            } else {
                showNoRoutine('No Data', 'No routine data available.');
            }
        }
    } catch (error) {
        console.error('Failed to load routine:', error);
        setStatus('error', 'Error');
        showMessage('Routine data is currently unavailable. Please try again later.', 'error');
        showNoRoutine('Could not load routine data', 'Please try again later.');
    }
}

function displaySection(sectionKey, sectionData) {
    const classes = sectionData || [];
    if (classes.length === 0) {
        showNoRoutine('No Classes Found', `No classes found for section "${sectionKey}"`);
        return;
    }

    currentSection = sectionKey;
    currentClasses = classes;

    let html = buildEnrolledCard(sectionKey, classes);
    html += buildTeacherRow(classes);
    html += buildViewTabs();
    html += `<div id="viewContent"></div>`;

    routineContainer.innerHTML = html;
    renderDayView(classes);

    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            if (this.dataset.view === 'day') renderDayView(classes);
            else renderWeekView(classes);
        });
    });

    localStorage.setItem(STORAGE_KEY, sectionKey);
    savedSectionSpan.textContent = sectionKey;
    savedChip.style.display = 'inline-flex';
}

// ============================================================
// UI BUILDERS (matches your existing design)
// ============================================================

function buildEnrolledCard(sectionKey, classes) {
    const batch = sectionKey.split('_')[0] || 'Unknown';
    const total = classes.length;
    const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const uniqueDays = [...new Set(classes.map(c => c.day))].filter(d => days.includes(d));
    const perWeek = uniqueDays.length;

    return `
        <div class="enrolled-card">
            <div class="card-title">
                <h3><i class="fas fa-user-graduate"></i> Student · ${batch}_${sectionKey}</h3>
                <button class="cr-btn" onclick="downloadSection()"><i class="fas fa-download"></i></button>
            </div>
            <div class="course-meta">
                <div class="meta-row"><span>Batch</span><strong>${batch}</strong></div>
                <div class="meta-row"><span>Section</span><strong>${sectionKey}</strong></div>
                <div class="meta-row"><span>Total Courses</span><strong>${total}</strong></div>
                <div class="meta-row"><span>Routine Version</span><strong>v${versionNumber.textContent || '5.0'}</strong></div>
                <div class="meta-row"><span>Classes per Week</span><strong>${perWeek}</strong></div>
            </div>
            <div class="download-row">
                <span><i class="fas fa-download"></i> Download PDF for ${sectionKey}</span>
                <button class="download-btn" onclick="downloadSection()"><i class="fas fa-arrow-down"></i></button>
            </div>
        </div>
    `;
}

function buildTeacherRow(classes) {
    const teachers = [...new Set(classes.map(c => c.teacher).filter(t => t && t !== '?'))];
    let html = `<div class="teacher-row">`;
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
    return html;
}

function buildViewTabs() {
    return `
        <div class="view-tabs">
            <button class="view-tab active" data-view="day"><i class="fas fa-calendar-day"></i> Day View</button>
            <button class="view-tab" data-view="week"><i class="fas fa-calendar-week"></i> Week View</button>
        </div>
    `;
}

// ============================================================
// VIEW RENDERERS
// ============================================================

function renderDayView(classes) {
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
        const sorted = grouped[day].sort((a, b) => a.start.localeCompare(b.start) || 0);
        html += `
            <div class="day-card">
                <div class="day-card-header">
                    <span><i class="fas fa-calendar-alt"></i> ${day}</span>
                    <span>${sorted.length} classes</span>
                </div>
                <div class="day-card-body">
        `;
        for (const cls of sorted) {
            const typeClass = cls.type === 'lab' ? 'type-lab' : 'type-theory';
            html += `
                <div class="class-item">
                    <div class="time"><i class="far fa-clock"></i> ${cls.start} – ${cls.end}</div>
                    <div class="course">${escapeHtml(cls.course)}</div>
                    <div class="details">
                        <span><i class="fas fa-chalkboard-teacher"></i> ${escapeHtml(cls.teacher || '?')}</span>
                        <span><i class="fas fa-door-open"></i> ${escapeHtml(cls.room || '?')}</span>
                        <span><span class="type-tag ${typeClass}">${cls.type === 'lab' ? 'Lab' : 'Theory'}</span></span>
                    </div>
                </div>
            `;
        }
        html += `</div></div>`;
    }
    html += `</div>`;
    container.innerHTML = html;
}

function renderWeekView(classes) {
    const container = document.getElementById('viewContent');
    if (!container) return;

    const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const grouped = {};
    for (const cls of classes) {
        if (!grouped[cls.day]) grouped[cls.day] = [];
        grouped[cls.day].push(cls);
    }

    // Collect all unique time slots
    const slots = [...new Set(classes.map(c => c.start + '-' + c.end))].sort();

    let html = `<div class="week-view"><table class="week-table"><thead><tr><th>Time</th>`;
    for (const day of days) html += `<th>${day.substring(0, 3)}</th>`;
    html += '</tr></thead><tbody>';

    for (const slot of slots) {
        html += `<tr><td class="time-col">${escapeHtml(slot)}</td>`;
        for (const day of days) {
            const dayClasses = grouped[day] || [];
            const matching = dayClasses.filter(c => (c.start + '-' + c.end) === slot);
            if (matching.length > 0) {
                html += `<td>`;
                for (const cls of matching) {
                    const typeClass = cls.type === 'lab' ? 'type-lab' : 'type-theory';
                    html += `<div style="margin-bottom:4px;">
                        <strong>${escapeHtml(cls.course)}</strong>
                        <span class="type-tag ${typeClass}" style="font-size:0.65rem;">${cls.type === 'lab' ? 'Lab' : 'Theory'}</span><br>
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

function handleShowRoutine() {
    const section = sectionInput.value.trim();
    if (!section) {
        showMessage('Please enter a section (e.g., 70_N).', 'error');
        return;
    }
    const normalized = section.toUpperCase().replace(/\s+/g, '_');
    if (routineData && routineData.sections && routineData.sections[normalized]) {
        displaySection(normalized, routineData.sections[normalized]);
    } else {
        showMessage(`Section "${normalized}" not found.`, 'error');
    }
}

function handleClearSection() {
    localStorage.removeItem(STORAGE_KEY);
    savedChip.style.display = 'none';
    sectionInput.value = '';
    showMessage('Saved section cleared.', 'info');
    loadRoutineData(); // reload to show first section
}

function downloadSection() {
    if (currentSection) {
        alert(`Download PDF for ${currentSection} (coming soon)`);
    }
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
        if (saved) loadRoutineData();
    }
}, 5 * 60 * 1000);
