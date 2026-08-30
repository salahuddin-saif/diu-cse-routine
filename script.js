// DIU CSE Routine - mobile student dashboard
const STORAGE_KEY = 'diu_cse_section';
const DAY_KEY = 'diu_cse_selected_day';
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
const savedSection = document.getElementById('savedSection');

let currentSectionData = null;
let selectedDay = localStorage.getItem(DAY_KEY) || null;

document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        sectionInput.value = saved;
        if (savedSection) savedSection.textContent = saved;
        loadSection(saved);
    } else {
        showNoRoutine('Enter a section', 'Type your section (e.g., 70_N) and press Enter.');
        setStatus('ready', 'Online');
    }

    showRoutineBtn.addEventListener('click', handleShowRoutine);
    clearSectionBtn.addEventListener('click', handleClearSection);
    sectionInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') handleShowRoutine();
    });
});

async function loadSection(sectionKey) {
    try {
        setStatus('loading', 'Loading...');
        let data = null;

        try {
            const resp = await fetch(`${SECTIONS_BASE}${sectionKey}.json?t=${Date.now()}`);
            if (resp.ok) data = await resp.json();
        } catch (_) {}

        if (!data) {
            const resp = await fetch(COMBINED_URL);
            if (!resp.ok) throw new Error('Failed to load routine data');
            const combined = await resp.json();
            if (combined.sections && combined.sections[sectionKey]) {
                const sec = combined.sections[sectionKey];
                data = {section: sectionKey, batch: sec.batch || 'Unknown', classes: sec.classes || []};
                if (combined.version) versionNumber.textContent = combined.version;
                if (combined.updated_at) {
                    lastUpdated.textContent = 'Updated: ' + new Date(combined.updated_at).toLocaleString();
                }
            }
        }

        if (!data) throw new Error(`Section "${sectionKey}" not found.`);
        currentSectionData = data;
        setStatus('ready', 'Online');
        hideMessage();
        displayRoutine(data);
        localStorage.setItem(STORAGE_KEY, sectionKey);
        if (savedSection) savedSection.textContent = sectionKey;
    } catch (error) {
        console.error(error);
        setStatus('error', 'Error');
        showMessage(error.message, 'error');
        showNoRoutine('Section Not Found', `No routine data for "${sectionKey}".`);
    }
}

function handleShowRoutine() {
    const value = sectionInput.value.trim();
    if (!value) {
        showMessage('Please enter your section (e.g., 70_N).', 'error');
        return;
    }
    const normalized = value.toUpperCase().replace(/\s+/g, '_');
    loadSection(normalized);
}

function handleClearSection() {
    localStorage.removeItem(STORAGE_KEY);
    sectionInput.value = '';
    if (savedSection) savedSection.textContent = 'No section';
    currentSectionData = null;
    showMessage('Saved section cleared.', 'info');
    showNoRoutine('Enter a section', 'Type your section and press Enter.');
}

function displayRoutine(data) {
    const classes = data.classes || [];
    if (!classes.length) {
        showNoRoutine('No Classes Found', `No classes for section "${data.section || '-'}".`);
        return;
    }

    const days = getDaysWithClasses(classes);
    if (!selectedDay || !days.includes(selectedDay)) selectedDay = days[0];

    routineContainer.innerHTML =
        buildProfile(data.batch || 'Unknown', data.section || '-', classes) +
        buildTeacherRow(classes) +
        `<div class="view-tabs">
            <button class="view-tab active" data-view="day"><i class="fas fa-calendar-day"></i> Day View</button>
            <button class="view-tab" data-view="week"><i class="fas fa-calendar-week"></i> Week View</button>
        </div>
        <div id="viewContent"></div>`;

    renderDayView(classes);
    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            if (tab.dataset.view === 'day') renderDayView(classes);
            else renderWeekView(classes);
        });
    });
}

function buildProfile(batch, section, classes) {
    const courses = [...new Set(classes.map(c => c.course).filter(Boolean))];
    return `<div class="enrolled-card">
        <div class="card-title">
            <h3><i class="fas fa-chevron-down"></i> Enrolled Courses</h3>
            <button class="cr-btn" title="Course registration">♛ CR</button>
        </div>
        <div class="course-meta">
            <div class="meta-row"><span>Batch</span><strong>${escapeHtml(batch)}</strong></div>
            <div class="meta-row"><span>Section</span><strong>${escapeHtml(section)}</strong></div>
            <div class="meta-row"><span>Total Courses</span><strong>${courses.length}</strong></div>
            <div class="meta-row"><span>Routine Version</span><strong>${escapeHtml(versionNumber.textContent || '5.0')}</strong></div>
            <div class="meta-row"><span>Classes per Week</span><strong>${getDaysWithClasses(classes).length}</strong></div>
            <div class="meta-row"><span>Total Classes</span><strong>${classes.length}</strong></div>
        </div>
        <div class="download-row">
            <span>Download PDF for ${escapeHtml(section)}</span>
            <button class="download-btn" id="downloadPdfBtn" title="Print / save as PDF"><i class="fas fa-download"></i></button>
        </div>
    </div>`;
}

function buildTeacherRow(classes) {
    const teachers = [...new Set(classes.map(c => c.teacher).filter(t => t && t !== 'TBA'))];
    if (!teachers.length) return '';
    return `<div class="teacher-row">${teachers.map((teacher, i) => `
        <div class="teacher">
            <div class="avatar">${avatarText(teacher)}<span class="online"></span></div>
            <span>${escapeHtml(teacher)}</span>
        </div>`).join('')}</div>`;
}

function renderDayView(classes) {
    const container = document.getElementById('viewContent');
    if (!container) return;

    const allDays = ['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday'];
    const days = getDaysWithClasses(classes);
    const dateItems = buildDateStrip(allDays, days);

    const dayClasses = classes.filter(c => c.day === selectedDay).slice().sort(compareTimes);
    let html = dateItems + '<div class="timeline">';

    if (!dayClasses.length) {
        html += `<div class="no-routine"><div class="icon">📅</div><h3>No classes</h3><p>No classes scheduled for ${escapeHtml(selectedDay)}.</p></div>`;
    } else {
        for (let i = 0; i < dayClasses.length; i++) {
            if (i > 0) {
                const gap = gapMinutes(dayClasses[i-1].time, dayClasses[i].time);
                if (gap >= 30) {
                    html += `<div class="break-card"><div class="break-title">Break Time ☕</div><div class="break-time">${escapeHtml(dayClasses[i-1].time.split('-')[1] || '')} — ${escapeHtml(dayClasses[i].time.split('-')[0] || '')} (${formatDuration(gap)})</div></div>`;
                }
            }
            html += classRow(dayClasses[i]);
        }
    }
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.date-item').forEach(item => {
        item.addEventListener('click', () => {
            selectedDay = item.dataset.day;
            localStorage.setItem(DAY_KEY, selectedDay);
            renderDayView(classes);
        });
    });

    const active = container.querySelector('.date-item.active');
    if (active) active.scrollIntoView({inline:'center', block:'nearest', behavior:'smooth'});

    const pdfBtn = document.getElementById('downloadPdfBtn');
    if (pdfBtn) pdfBtn.onclick = () => window.print();
}

function buildDateStrip(allDays, activeDays) {
    const now = new Date();
    const current = now.getDay(); // Sun=0
    const saturdayOffset = -((current + 1) % 7);
    const saturday = new Date(now);
    saturday.setDate(now.getDate() + saturdayOffset);

    return `<div class="date-strip">${allDays.map((day, i) => {
        const date = new Date(saturday);
        date.setDate(saturday.getDate() + i);
        const active = day === selectedDay ? 'active' : '';
        return `<button class="date-item ${active}" data-day="${day}" title="${day}">
            <span class="num">${date.getDate()}</span>
            <span class="dow">${day.substring(0,3)}</span>
        </button>`;
    }).join('')}</div>`;
}

function classRow(cls) {
    const typeClass = cls.type === 'Lab' ? 'type-lab' : '';
    return `<div class="class-row">
        <div class="time-col">${escapeHtml(cls.time || 'TBA')}</div>
        <div class="class-card">
            <div class="course-name">${escapeHtml(cls.course || 'Course')}</div>
            <div class="info-line"><span>Course</span><strong>${escapeHtml(cls.course || 'TBA')}</strong></div>
            <div class="info-line"><span>Section</span><strong>${escapeHtml(cls.course || '')}(${escapeHtml(cls.batch || '')}_${escapeHtml(cls.section || '')})</strong></div>
            <div class="info-line"><span>Teacher</span><strong class="teacher-link">${escapeHtml(cls.teacher || 'TBA')}</strong></div>
            <div class="info-line"><span>Room</span><strong>${escapeHtml(cls.room || 'TBA')}</strong></div>
            ${cls.type ? `<span class="type-tag ${typeClass}">${escapeHtml(cls.type)}</span>` : ''}
        </div>
    </div>`;
}

function renderWeekView(classes) {
    const days = ['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday'];
    const times = [...new Set(classes.map(c => c.time || 'TBA'))].sort(compareTimeStrings);
    let html = '<div class="week-view"><table class="week-table"><thead><tr><th>Time</th>';
    days.forEach(d => html += `<th>${d.substring(0,3)}</th>`);
    html += '</tr></thead><tbody>';

    times.forEach(time => {
        html += `<tr><td class="time-col">${escapeHtml(time)}</td>`;
        days.forEach(day => {
            const matches = classes.filter(c => c.day === day && c.time === time);
            html += '<td>';
            if (matches.length) matches.forEach(c => {
                html += `<div style="margin-bottom:7px"><strong>${escapeHtml(c.course)}</strong><br><span>${escapeHtml(c.teacher || 'TBA')} • ${escapeHtml(c.room || 'TBA')}</span></div>`;
            }); else html += '—';
            html += '</td>';
        });
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    document.getElementById('viewContent').innerHTML = html;
}

function getDaysWithClasses(classes) {
    const order = ['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday'];
    return order.filter(day => classes.some(c => c.day === day));
}

function compareTimes(a,b) {
    return timeToMinutes(a.time) - timeToMinutes(b.time);
}
function compareTimeStrings(a,b) { return timeToMinutes(a) - timeToMinutes(b); }

function timeToMinutes(value) {
    if (!value || value === 'TBA') return 9999;
    const m = String(value).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?(?:-(\d{1,2}):(\d{2})\s*(AM|PM)?)?/i);
    if (!m) return 9999;
    let h = Number(m[1]), min = Number(m[2]);
    const ap = (m[3] || '').toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return h * 60 + min;
}
function endMinutes(value) {
    if (!value || value === 'TBA') return null;
    const parts = String(value).split('-');
    if (parts.length < 2) return null;
    return timeToMinutes(parts[1]);
}
function gapMinutes(prev, next) {
    const end = endMinutes(prev), start = timeToMinutes(next);
    if (end == null || start === 9999) return 0;
    return Math.max(0, start - end);
}
function formatDuration(min) {
    if (min < 60) return `${min}m`;
    const h = Math.floor(min/60), m = min % 60;
    return `${h}h${m ? ' '+m+'m' : ''}`;
}
function avatarText(t) {
    const letters = String(t).replace(/[^A-Za-z]/g,'');
    return letters.length <= 3 ? letters.toUpperCase() : letters.slice(0,2).toUpperCase();
}
function showNoRoutine(title,msg) {
    routineContainer.innerHTML = `<div class="no-routine"><div class="icon">📅</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(msg)}</p></div>`;
}
function setStatus(type,text) {
    statusBadge.className = 'status ' + type;
    statusText.textContent = text;
}
function showMessage(text,type) {
    message.textContent = text;
    message.className = 'show ' + type;
    setTimeout(() => message.className = '', 4000);
}
function hideMessage(){ message.className = ''; }
function escapeHtml(text) {
    if (text === null || text === undefined || text === '') return '-';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
