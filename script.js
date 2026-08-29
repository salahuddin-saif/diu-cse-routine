// DIU CSE Routine - Student View

const ROUTINE_URL = './data/routine.json?t=' + Date.now();
const STORAGE_KEY = 'diu_cse_section';

// DOM Elements
const sectionInput = document.getElementById('sectionInput');
const showRoutineBtn = document.getElementById('showRoutineBtn');
const clearSectionBtn = document.getElementById('clearSectionBtn');
const routineContainer = document.getElementById('routineContainer');
const statusBadge = document.getElementById('statusBadge');
const versionBadge = document.getElementById('versionNumber');
const lastUpdated = document.getElementById('lastUpdated');
const message = document.getElementById('message');

let routineData = null;
let selectedSection = null;
let currentView = 'day';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        sectionInput.value = saved;
    }
    
    loadRoutineData();
    
    showRoutineBtn.addEventListener('click', handleShowRoutine);
    clearSectionBtn.addEventListener('click', handleClearSection);
    sectionInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleShowRoutine();
    });
});

async function loadRoutineData() {
    try {
        setStatus('loading', 'Loading routine data...');
        
        const response = await fetch(ROUTINE_URL);
        if (!response.ok) throw new Error('Failed to load');
        
        const data = await response.json();
        routineData = data;
        
        // Update version
        if (data.version) {
            versionBadge.textContent = data.version;
        }
        
        // Update last updated
        if (data.updated_at) {
            const date = new Date(data.updated_at);
            lastUpdated.textContent = `Updated: ${date.toLocaleString()}`;
        }
        
        setStatus('success', 'Ready');
        hideMessage();
        
        // Show saved section
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && data.sections) {
            const section = findMatchingSection(data.sections, saved);
            if (section) {
                displayStudentRoutine(section, data.sections[section]);
            }
        } else if (data.sections && Object.keys(data.sections).length > 0) {
            // Show first section
            const first = Object.keys(data.sections)[0];
            displayStudentRoutine(first, data.sections[first]);
        }
        
    } catch (error) {
        console.error('Failed to load routine:', error);
        setStatus('error', 'Error loading data');
        showMessage('Routine data is currently unavailable. Please try again later.', 'error');
        showNoRoutine('Could not load routine data', 'The routine data could not be loaded.');
    }
}

function handleShowRoutine() {
    const section = sectionInput.value.trim();
    if (!section) {
        showMessage('Please enter your section (e.g., 70_N).', 'error');
        return;
    }
    
    if (!routineData || !routineData.sections) {
        showMessage('Routine data is not loaded yet.', 'error');
        return;
    }
    
    const matched = findMatchingSection(routineData.sections, section);
    if (matched) {
        localStorage.setItem(STORAGE_KEY, section);
        displayStudentRoutine(matched, routineData.sections[matched]);
        showMessage(`Showing routine for ${matched}`, 'success');
    } else {
        showMessage(`No routine found for "${section}". Please check your section.`, 'error');
        showNoRoutine('Section Not Found', `No routine data available for section "${section}"`);
    }
}

function handleClearSection() {
    localStorage.removeItem(STORAGE_KEY);
    sectionInput.value = '';
    showMessage('Saved section cleared.', 'info');
    
    if (routineData && routineData.sections) {
        const sections = Object.keys(routineData.sections);
        if (sections.length > 0) {
            displayStudentRoutine(sections[0], routineData.sections[sections[0]]);
        }
    }
}

function findMatchingSection(sections, input) {
    const normalized = input.trim().toUpperCase().replace(/\s+/g, '_');
    const keys = Object.keys(sections);
    
    // Direct match
    if (keys.includes(normalized)) return normalized;
    
    // Try with batch_section format
    const parts = normalized.split('_');
    if (parts.length === 2) {
        const alternative = `${parts[0]}_${parts[1]}`;
        for (const key of keys) {
            if (key.toUpperCase() === alternative) return key;
        }
    }
    
    // Case insensitive
    for (const key of keys) {
        if (key.toUpperCase() === normalized) return key;
    }
    
    return null;
}

function displayStudentRoutine(sectionKey, sectionData) {
    if (!sectionData || !sectionData.classes || sectionData.classes.length === 0) {
        showNoRoutine('No Classes Found', `No classes found for section "${sectionKey}"`);
        return;
    }
    
    const classes = sectionData.classes;
    const batch = sectionData.batch || 'Unknown';
    const section = sectionData.section || sectionKey;
    
    // Build student profile
    let html = buildStudentProfile(batch, section, classes);
    
    // Add view tabs
    html += `
        <div class="view-tabs">
            <button class="view-tab active" data-view="day">
                <i class="fas fa-calendar-day"></i> Day View
            </button>
            <button class="view-tab" data-view="week">
                <i class="fas fa-calendar-week"></i> Week View
            </button>
        </div>
        <div id="viewContent"></div>
    `;
    
    routineContainer.innerHTML = html;
    
    // Store data for view switching
    window._currentClasses = classes;
    window._currentSection = sectionKey;
    
    // Render initial view (day)
    renderDayView(classes);
    
    // View switching
    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            const view = this.dataset.view;
            if (view === 'day') {
                renderDayView(classes);
            } else {
                renderWeekView(classes);
            }
        });
    });
}

function buildStudentProfile(batch, section, classes) {
    const totalCourses = classes.length;
    const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
    const uniqueDays = [...new Set(classes.map(c => c.day))].filter(d => days.includes(d));
    const classesPerWeek = uniqueDays.length;
    
    return `
        <div class="student-profile">
            <div class="profile-header">
                <div class="profile-info">
                    <div class="student-name">
                        <i class="fas fa-user-graduate" style="color: var(--primary-light);"></i>
                        Student
                    </div>
                    <div class="student-details">
                        <span><i class="fas fa-layer-group"></i> Batch: <strong>${escapeHtml(batch)}</strong></span>
                        <span><i class="fas fa-tag"></i> Section: <strong>${escapeHtml(section)}</strong></span>
                        <span><i class="fas fa-book"></i> Total Courses: <strong>${totalCourses}</strong></span>
                        <span><i class="fas fa-code-branch"></i> Routine Version: <strong>v${escapeHtml(routineData?.version || '5.0')}</strong></span>
                        <span><i class="fas fa-calendar-alt"></i> Classes/Week: <strong>${classesPerWeek}</strong></span>
                    </div>
                </div>
                <div class="profile-stats">
                    <div class="stat-item">
                        <div class="stat-number">${totalCourses}</div>
                        <div class="stat-label">Courses</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number">${classesPerWeek}</div>
                        <div class="stat-label">Days</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number">${uniqueDays.length > 0 ? uniqueDays.map(d => d.substring(0, 3)).join(', ') : 'N/A'}</div>
                        <div class="stat-label">Active Days</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderDayView(classes) {
    const container = document.getElementById('viewContent');
    if (!container) return;
    
    const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
    const grouped = {};
    for (const cls of classes) {
        if (!grouped[cls.day]) grouped[cls.day] = [];
        grouped[cls.day].push(cls);
    }
    
    let html = '<div class="day-view-grid">';
    
    for (const day of days) {
        if (!grouped[day]) continue;
        
        html += `
            <div class="day-card">
                <div class="day-card-header">
                    <span>${day}</span>
                    <span>${grouped[day].length} classes</span>
                </div>
                <div class="day-card-body">
        `;
        
        // Sort by time
        const sorted = grouped[day].sort((a, b) => {
            if (a.time === 'TBA') return 1;
            if (b.time === 'TBA') return -1;
            return a.time.localeCompare(b.time);
        });
        
        for (const cls of sorted) {
            const typeClass = cls.type === 'Lab' ? 'type-lab' : 'type-theory';
            html += `
                <div class="class-item">
                    <div class="class-time"><i class="far fa-clock"></i> ${escapeHtml(cls.time || 'TBA')}</div>
                    <div class="class-course">${escapeHtml(cls.course)}</div>
                    <div class="class-details">
                        <span><i class="fas fa-chalkboard-teacher"></i> ${escapeHtml(cls.teacher || 'TBA')}</span>
                        <span><i class="fas fa-door-open"></i> ${escapeHtml(cls.room || 'TBA')}</span>
                        <span><span class="type-tag ${typeClass}">${escapeHtml(cls.type)}</span></span>
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
    
    const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
    const grouped = {};
    for (const cls of classes) {
        if (!grouped[cls.day]) grouped[cls.day] = [];
        grouped[cls.day].push(cls);
    }
    
    // Get all unique times
    const times = [...new Set(classes.map(c => c.time))].filter(t => t !== 'TBA').sort();
    if (times.length === 0) times.push('TBA');
    
    let html = '<div class="week-view"><table class="week-table"><thead><tr><th>Time</th>';
    for (const day of days) {
        html += `<th>${day.substring(0, 3)}</th>`;
    }
    html += '</tr></thead><tbody>';
    
    for (const time of times) {
        html += `<tr><td class="time-col">${escapeHtml(time)}</td>`;
        for (const day of days) {
            const dayClasses = grouped[day] || [];
            const matching = dayClasses.filter(c => c.time === time || (c.time === 'TBA' && time === 'TBA'));
            if (matching.length > 0) {
                html += `<td>`;
                for (const cls of matching) {
                    const typeClass = cls.type === 'Lab' ? 'type-lab' : 'type-theory';
                    html += `<div style="margin-bottom: 4px;">
                        <strong>${escapeHtml(cls.course)}</strong><br>
                        <span style="font-size: 0.8rem; color: var(--gray-600);">${escapeHtml(cls.teacher)} • ${escapeHtml(cls.room)}</span>
                        <span class="type-tag ${typeClass}" style="font-size: 0.65rem;">${escapeHtml(cls.type)}</span>
                    </div>`;
                }
                html += `</td>`;
            } else {
                html += `<td style="color: var(--gray-200);">—</td>`;
            }
        }
        html += '</tr>';
    }
    
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

function showNoRoutine(title, messageText) {
    routineContainer.innerHTML = `
        <div class="no-routine">
            <div class="icon">📅</div>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(messageText)}</p>
        </div>
    `;
}

function setStatus(type, text) {
    statusBadge.className = 'status-badge status-' + type;
    const icons = {
        'loading': '<i class="fas fa-spinner fa-spin"></i>',
        'success': '<i class="fas fa-check-circle"></i>',
        'error': '<i class="fas fa-exclamation-circle"></i>'
    };
    statusBadge.innerHTML = (icons[type] || '') + ' ' + text;
}

function showMessage(text, type) {
    message.textContent = text;
    message.className = 'message show ' + type;
    setTimeout(() => { message.className = 'message'; }, 5000);
}

function hideMessage() {
    message.className = 'message';
}

function escapeHtml(text) {
    if (!text) return '-';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Refresh every 5 minutes
setInterval(() => {
    if (!document.hidden) loadRoutineData();
}, 5 * 60 * 1000);
