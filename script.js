// DIU CSE Routine – Fixed Search & UI Refresh

const STORAGE_KEY = 'diu_cse_section';
const COMBINED_URL = './data/routine.json?t=' + Date.now();
const SECTIONS_BASE = './data/sections/';

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

// Global data cache
let routineData = null;      // combined JSON (fallback)
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

    // Load initial data (saved or first available)
    loadRoutineData();

    // Event listeners
    showRoutineBtn.addEventListener('click', handleShowRoutine);
    clearSectionBtn.addEventListener('click', handleClearSection);
    sectionInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleShowRoutine();
        }
    });
});

// ============================================================
// LOAD ROUTINE DATA (loads combined JSON once)
// ============================================================

async function loadRoutineData() {
    try {
        setStatus('loading', 'Loading...');
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            await loadSection(saved);
            return;
        }

        // No saved section – load combined and show first
        const response = await fetch(COMBINED_URL);
        if (!response.ok) throw new Error('Failed to load combined data');
        const data = await response.json();
        routineData = data;
        if (data.version) versionNumber.textContent = data.version;
        if (data.updated_at) {
            const date = new Date(data.updated_at);
            lastUpdated.textContent = 'Updated: ' + date.toLocaleString();
        }

        const sections = data.sections || {};
        const keys = Object.keys(sections);
        if (keys.length > 0) {
            const first = keys[0];
            // Display from combined data (no per-section file needed)
            displaySection(first, sections[first]);
            sectionInput.value = first;
            savedSectionSpan.textContent = first;
            savedChip.style.display = 'inline-flex';
            localStorage.setItem(STORAGE_KEY, first);
        } else {
            showNoRoutine('No Data', 'No routine data available.');
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
// LOAD SECTION (per‑file first, then combined fallback)
// ============================================================

async function loadSection(sectionKey) {
    try {
        setStatus('loading', 'Loading...');
        const normalized = sectionKey.toUpperCase().replace(/\s+/g, '_');
        console.log('🔍 Searching for section:', normalized);

        let data = null;
        let found = false;

        // 1. Try per‑section file
        const perSectionUrl = `${SECTIONS_BASE}${normalized}.json?t=${Date.now()}`;
        try {
            const resp = await fetch(perSectionUrl);
            if (resp.ok) {
                data = await resp.json();
                found = true;
                console.log('✅ Found per‑section file:', normalized);
            }
        } catch (e) { /* ignore */ }

        // 2. If not found, try combined JSON
        if (!found) {
            // Ensure combined data is loaded
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
            if (sections[normalized]) {
                const sec = sections[normalized];
                data = {
                    section: normalized,
                    batch: sec.batch || 'Unknown',
                    classes: sec.classes || []
                };
                found = true;
                console.log('✅ Found in combined data:', normalized);
            }
        }

        if (!found) {
            throw new Error(`Section "${normalized}" not found.`);
        }

        // Display the section
        displaySection(normalized, data);
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
// DISPLAY SECTION (clears and rebuilds UI)
// ============================================================

function displaySection(sectionKey, sectionData) {
    // Clear container
    routineContainer.innerHTML = '';

    const classes = sectionData.classes || [];
    if (classes.length === 0) {
        showNoRoutine('No Classes', `No classes for section "${sectionKey}".`);
        return;
    }

    currentSection = sectionKey;
    currentClasses = classes;
    const batch = sectionData.batch || 'Unknown';
    const total = classes.length;
    const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const uniqueDays = [...new Set(classes.map(c => c.day))].filter(d => days.includes(d));
    const perWeek = uniqueDays.length;
    const teachers = [...new Set(classes.map(c => c.teacher).filter(t => t && t !== 'TBA'))];

    let html = '';

    // ----- Enrolled Card -----
    html += `
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
    renderDayView(classes);

    // Tab switching
    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            if (this.dataset.view === 'day') renderDayView(classes);
            else renderWeekView(classes);
        });
    });
}

// ============================================================
// DAY VIEW
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
            const typeClass = cls.type === 'Lab' ? 'type-lab' : 'type-theory';
            const subLabel = cls.sub_section && cls.sub_section !== 'Main' ? ` (${cls.sub_section})` : '';
            html += `
                <div class="class-item">
                    <div class="time"><i class="far fa-clock"></i> ${escapeHtml(cls.time || 'TBA')}</div>
                    <div class="course">${escapeHtml(cls.course)}${subLabel}</div>
                    <div class="details">
                        <span><i class="fas fa-chalkboard-teacher"></i> ${escapeHtml(cls.teacher || 'TBA')}</span>
                        <span><i class="fas fa-door-open"></i> ${escapeHtml(cls.room || 'TBA')}</span>
                        <span><span class="type-tag ${typeClass}">${escapeHtml(cls.type)}</span></span>
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

function renderWeekView(classes) {
    const container = document.getElementById('viewContent');
    if (!container) return;

    const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const grouped = {};
    for (const cls of classes) {
        if (!grouped[cls.day]) grouped[cls.day] = [];
        grouped[cls.day].push(cls);
    }

    const times = [...new Set(classes.map(c => c.time))].filter(t => t !== 'TBA').sort();
    if (times.length === 0) times.push('TBA');

    let html = `<div class="week-view"><table class="week-table"><thead><tr><th>Time</th>`;
    for (const day of days) html += `<th>${day.substring(0, 3)}</th>`;
    html += '</tr></thead><tbody>';
    for (const time of times) {
        html += `<tr><td class="time-col">${escapeHtml(time)}</td>`;
        for (const day of days) {
            const dayClasses = grouped[day] || [];
            const matching = dayClasses.filter(c => c.time === time || (c.time === 'TBA' && time === 'TBA'));
            if (matching.length > 0) {
                html += `<td>`;
                for (const cls of matching) {
                    const tc = cls.type === 'Lab' ? 'type-lab' : 'type-theory';
                    const sub = cls.sub_section && cls.sub_section !== 'Main' ? ` (${cls.sub_section})` : '';
                    html += `<div style="margin-bottom:4px;">
                        <strong>${escapeHtml(cls.course)}</strong>${escapeHtml(sub)}
                        <span class="type-tag ${tc}" style="font-size:0.65rem;">${escapeHtml(cls.type)}</span><br>
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
    loadSection(normalized);
}

function handleClearSection() {
    localStorage.removeItem(STORAGE_KEY);
    savedChip.style.display = 'none';
    sectionInput.value = '';
    showMessage('Saved section cleared.', 'info');
    // Reload to show first section from combined data
    loadRoutineData();
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
        if (saved) loadSection(saved);
    }
}, 5 * 60 * 1000);
