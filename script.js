// DIU CSE Routine - Student View with Fallback

const STORAGE_KEY = 'diu_cse_section';
const SECTIONS_BASE = './data/sections/';
const COMBINED_URL = './data/routine.json?t=' + Date.now();

const sectionInput = document.getElementById('sectionInput');
const showRoutineBtn = document.getElementById('showRoutineBtn');
const clearSectionBtn = document.getElementById('clearSectionBtn');
const routineContainer = document.getElementById('routineContainer');
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const versionNumber = document.getElementById('versionNumber');
const lastUpdated = document.getElementById('lastUpdated');
const message = document.getElementById('message');

let currentSectionData = null;

document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        sectionInput.value = saved;
        loadSection(saved);
    } else {
        showNoRoutine('Enter a section', 'Type your section (e.g., 70_N) and click "Show Routine".');
    }

    showRoutineBtn.addEventListener('click', handleShowRoutine);
    clearSectionBtn.addEventListener('click', handleClearSection);
    sectionInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleShowRoutine();
    });
});

async function loadSection(sectionKey) {
    try {
        setStatus('loading', 'Loading...');
        // Try per‑section file first
        const perSectionUrl = `${SECTIONS_BASE}${sectionKey}.json?t=${Date.now()}`;
        let data = null;
        let found = false;

        try {
            const resp = await fetch(perSectionUrl);
            if (resp.ok) {
                data = await resp.json();
                found = true;
            }
        } catch (e) {
            // Per‑section not found, will fallback
        }

        // Fallback: load combined and filter
        if (!found) {
            const combinedResp = await fetch(COMBINED_URL);
            if (!combinedResp.ok) throw new Error('Failed to load routine data');
            const combined = await combinedResp.json();
            if (combined.sections && combined.sections[sectionKey]) {
                const secData = combined.sections[sectionKey];
                data = {
                    section: sectionKey,
                    batch: secData.batch || 'Unknown',
                    classes: secData.classes || []
                };
                found = true;
                // Update version/updated
                if (combined.version) versionNumber.textContent = combined.version;
                if (combined.updated_at) {
                    const date = new Date(combined.updated_at);
                    lastUpdated.textContent = 'Updated: ' + date.toLocaleString();
                }
            }
        }

        if (!found) {
            throw new Error(`Section "${sectionKey}" not found.`);
        }

        currentSectionData = data;
        setStatus('ready', 'Ready');
        hideMessage();
        displayRoutine(data);
        localStorage.setItem(STORAGE_KEY, sectionKey);

    } catch (error) {
        console.error('❌ Failed to load section:', error);
        setStatus('error', 'Error');
        showMessage(error.message, 'error');
        showNoRoutine('Section Not Found', `No routine data for "${sectionKey}". Please check the section name.`);
    }
}

function handleShowRoutine() {
    const section = sectionInput.value.trim();
    if (!section) {
        showMessage('Please enter your section (e.g., 70_N).', 'error');
        return;
    }
    const normalized = section.toUpperCase().replace(/\s+/g, '_');
    loadSection(normalized);
}

function handleClearSection() {
    localStorage.removeItem(STORAGE_KEY);
    sectionInput.value = '';
    currentSectionData = null;
    showMessage('Saved section cleared.', 'info');
    showNoRoutine('Enter a section', 'Type your section and click "Show Routine".');
}

function displayRoutine(data) {
    const classes = data.classes || [];
    if (!classes || classes.length === 0) {
        showNoRoutine('No Classes Found', `No classes for section "${data.section || currentSectionKey}".`);
        return;
    }
    const batch = data.batch || 'Unknown';
    const section = data.section || currentSectionKey;

    let html = buildProfile(batch, section, classes);
    html += buildCourses(classes);
    html += `
        <div class="view-tabs">
            <button class="view-tab active" data-view="day"><i class="fas fa-calendar-day"></i> Day View</button>
            <button class="view-tab" data-view="week"><i class="fas fa-calendar-week"></i> Week View</button>
        </div>
        <div id="viewContent"></div>
    `;
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
}

function buildProfile(batch, section, classes) {
    const total = classes.length;
    const days = ['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday'];
    const uniqueDays = [...new Set(classes.map(c => c.day))].filter(d => days.includes(d));
    const perWeek = uniqueDays.length;
    return `
        <div class="student-profile">
            <div class="profile-top">
                <div>
                    <div class="profile-name">
                        <i class="fas fa-user-graduate"></i> Student
                        <span class="badge">${escapeHtml(batch)}_${escapeHtml(section)}</span>
                    </div>
                    <div class="profile-details">
                        <span><i class="fas fa-layer-group"></i> Batch: <strong>${escapeHtml(batch)}</strong></span>
                        <span><i class="fas fa-tag"></i> Section: <strong>${escapeHtml(section)}</strong></span>
                        <span><i class="fas fa-book"></i> Total Courses: <strong>${total}</strong></span>
                        <span><i class="fas fa-code-branch"></i> Version: <strong>v${escapeHtml(versionNumber.textContent || '5.0')}</strong></span>
                        <span><i class="fas fa-calendar-alt"></i> Classes/Week: <strong>${perWeek}</strong></span>
                    </div>
                </div>
                <div class="profile-stats">
                    <div class="stat-item"><div class="num">${total}</div><div class="label">Courses</div></div>
                    <div class="stat-item"><div class="num">${perWeek}</div><div class="label">Days</div></div>
                    <div class="stat-item"><div class="num">${uniqueDays.map(d => d.substring(0,3)).join(', ')}</div><div class="label">Active Days</div></div>
                </div>
            </div>
        </div>
    `;
}

function buildCourses(classes) {
    const courseMap = {};
    for (const cls of classes) {
        if (!courseMap[cls.course]) {
            courseMap[cls.course] = { course: cls.course, teacher: cls.teacher || 'TBA', type: cls.type || 'Theory' };
        }
    }
    const courses = Object.values(courseMap);
    let html = `
        <div class="course-section">
            <div class="course-header">
                <h4><i class="fas fa-list-ul"></i> Enrolled Courses</h4>
                <span class="count">${courses.length} courses</span>
            </div>
            <div class="course-grid">
    `;
    for (const c of courses) {
        const tc = c.type === 'Lab' ? 'type-lab' : 'type-theory';
        html += `<div class="course-tag"><span class="code">${escapeHtml(c.course)}</span><span class="teacher">${escapeHtml(c.teacher)}</span><span class="type-tag ${tc}">${escapeHtml(c.type)}</span></div>`;
    }
    html += `</div></div>`;
    return html;
}

function renderDayView(classes) {
    const container = document.getElementById('viewContent');
    if (!container) return;
    const days = ['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday'];
    const grouped = {};
    for (const cls of classes) {
        if (!grouped[cls.day]) grouped[cls.day] = [];
        grouped[cls.day].push(cls);
    }
    let html = '<div class="day-grid">';
    for (const day of days) {
        if (!grouped[day]) continue;
        const sorted = grouped[day].sort((a,b) => {
            if (a.time === 'TBA') return 1;
            if (b.time === 'TBA') return -1;
            return a.time.localeCompare(b.time);
        });
        html += `
            <div class="day-card">
                <div class="day-card-header">
                    <span class="day-name"><i class="fas fa-calendar-alt"></i> ${day}</span>
                    <span class="count">${sorted.length} classes</span>
                </div>
                <div class="day-card-body">
        `;
        for (const cls of sorted) {
            const tc = cls.type === 'Lab' ? 'type-lab' : 'type-theory';
            const subLabel = cls.sub_section && cls.sub_section !== 'Main' ? `<span class="sub-section">(${escapeHtml(cls.sub_section)})</span>` : '';
            html += `
                <div class="class-item">
                    <div class="time"><i class="far fa-clock"></i> ${escapeHtml(cls.time || 'TBA')}</div>
                    <div class="course">${escapeHtml(cls.course)} ${subLabel}</div>
                    <div class="details">
                        <span><i class="fas fa-chalkboard-teacher"></i> ${escapeHtml(cls.teacher || 'TBA')}</span>
                        <span><i class="fas fa-door-open"></i> ${escapeHtml(cls.room || 'TBA')}</span>
                        <span><span class="type-tag ${tc}">${escapeHtml(cls.type)}</span></span>
                    </div>
                </div>
            `;
        }
        html += `</div></div>`;
    }
    html += '</div>';
    container.innerHTML = html;
}

function renderWeekView(classes) {
    const container = document.getElementById('viewContent');
    if (!container) return;
    const days = ['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday'];
    const grouped = {};
    for (const cls of classes) {
        if (!grouped[cls.day]) grouped[cls.day] = [];
        grouped[cls.day].push(cls);
    }
    const times = [...new Set(classes.map(c => c.time))].filter(t => t !== 'TBA').sort();
    if (times.length === 0) times.push('TBA');
    let html = '<div class="week-view"><table class="week-table"><thead><tr><th>Time</th>';
    for (const day of days) html += `<th>${day.substring(0,3)}</th>`;
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
                    const subLabel = cls.sub_section && cls.sub_section !== 'Main' ? ` (${cls.sub_section})` : '';
                    html += `<div style="margin-bottom:4px;">
                        <strong>${escapeHtml(cls.course)}</strong>${escapeHtml(subLabel)}
                        <span class="type-tag ${tc}" style="font-size:0.65rem;">${escapeHtml(cls.type)}</span><br>
                        <span style="font-size:0.8rem;color:var(--gray-600);">${escapeHtml(cls.teacher)} • ${escapeHtml(cls.room)}</span>
                    </div>`;
                }
                html += `</td>`;
            } else {
                html += `<td style="color:var(--gray-200);">—</td>`;
            }
        }
        html += '</tr>';
    }
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

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
    message.className = 'show ' + type;
    setTimeout(() => { message.className = ''; }, 5000);
}

function hideMessage() { message.className = ''; }

function escapeHtml(text) {
    if (!text) return '-';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
