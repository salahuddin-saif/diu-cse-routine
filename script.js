// DIU CSE Routine - Student View

const ROUTINE_URL = './data/routine.json?t=' + Date.now();
const STORAGE_KEY = 'diu_cse_section';

const sectionInput = document.getElementById('sectionInput');
const showRoutineBtn = document.getElementById('showRoutineBtn');
const clearSectionBtn = document.getElementById('clearSectionBtn');
const routineContainer = document.getElementById('routineContainer');
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const versionNumber = document.getElementById('versionNumber');
const lastUpdated = document.getElementById('lastUpdated');
const message = document.getElementById('message');

let routineData = null;

document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) sectionInput.value = saved;
    loadRoutineData();
    showRoutineBtn.addEventListener('click', handleShowRoutine);
    clearSectionBtn.addEventListener('click', handleClearSection);
    sectionInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') handleShowRoutine();
    });
});

async function loadRoutineData() {
    try {
        setStatus('loading', 'Loading...');
        const response = await fetch(ROUTINE_URL);
        if (!response.ok) throw new Error('Failed to load');
        const data = await response.json();
        routineData = data;
        if (data.version) versionNumber.textContent = data.version;
        if (data.updated_at) {
            const date = new Date(data.updated_at);
            lastUpdated.textContent = 'Updated: ' + date.toLocaleString();
        }
        setStatus('ready', 'Ready');
        hideMessage();
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && data.sections) {
            const section = findSection(data.sections, saved);
            if (section) displayRoutine(section, data.sections[section]);
        } else if (data.sections && Object.keys(data.sections).length > 0) {
            const first = Object.keys(data.sections)[0];
            displayRoutine(first, data.sections[first]);
        }
    } catch (error) {
        setStatus('error', 'Error');
        showMessage('Routine data is currently unavailable.', 'error');
        showNoRoutine('Could not load routine data', 'Please try again later.');
    }
}

function handleShowRoutine() {
    const section = sectionInput.value.trim();
    if (!section) { showMessage('Please enter your section.', 'error'); return; }
    if (!routineData || !routineData.sections) { showMessage('Routine data not loaded.', 'error'); return; }
    const matched = findSection(routineData.sections, section);
    if (matched) {
        localStorage.setItem(STORAGE_KEY, section);
        displayRoutine(matched, routineData.sections[matched]);
        showMessage('Showing routine for ' + matched, 'success');
    } else {
        showMessage('No routine found for "' + section + '"', 'error');
        showNoRoutine('Section Not Found', 'No routine data for "' + section + '"');
    }
}

function handleClearSection() {
    localStorage.removeItem(STORAGE_KEY);
    sectionInput.value = '';
    showMessage('Saved section cleared.', 'info');
    if (routineData && routineData.sections) {
        const keys = Object.keys(routineData.sections);
        if (keys.length > 0) displayRoutine(keys[0], routineData.sections[keys[0]]);
    }
}

function findSection(sections, input) {
    const normalized = input.trim().toUpperCase().replace(/\s+/g, '_');
    const keys = Object.keys(sections);
    if (keys.includes(normalized)) return normalized;
    for (const key of keys) {
        if (key.toUpperCase() === normalized) return key;
    }
    return null;
}

function displayRoutine(sectionKey, sectionData) {
    let classes = sectionData.classes || sectionData;
    if (!classes || classes.length === 0) {
        showNoRoutine('No Classes Found', 'No classes for "' + sectionKey + '"');
        return;
    }
    
    const batch = sectionData.batch || 'Unknown';
    const section = sectionData.section || sectionKey;
    
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
                        <span class="badge">${batch}_${section}</span>
                    </div>
                    <div class="profile-details">
                        <span><i class="fas fa-layer-group"></i> Batch: <strong>${batch}</strong></span>
                        <span><i class="fas fa-tag"></i> Section: <strong>${section}</strong></span>
                        <span><i class="fas fa-book"></i> Total Courses: <strong>${total}</strong></span>
                        <span><i class="fas fa-code-branch"></i> Version: <strong>v${routineData?.version || '5.0'}</strong></span>
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
            html += `
                <div class="class-item">
                    <div class="time"><i class="far fa-clock"></i> ${escapeHtml(cls.time || 'TBA')}</div>
                    <div class="course">${escapeHtml(cls.course)}</div>
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
                    html += `<div style="margin-bottom:4px;"><strong>${escapeHtml(cls.course)}</strong><span class="type-tag ${tc}" style="font-size:0.65rem;">${escapeHtml(cls.type)}</span><br><span style="font-size:0.8rem;color:var(--gray-600);">${escapeHtml(cls.teacher)} • ${escapeHtml(cls.room)}</span></div>`;
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
    routineContainer.innerHTML = `<div class="no-routine"><div class="icon">📅</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(msg)}</p></div>`;
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

setInterval(() => {
    if (!document.hidden) loadRoutineData();
}, 5 * 60 * 1000);
