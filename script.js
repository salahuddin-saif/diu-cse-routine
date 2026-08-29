// DIU CSE Routine - Frontend JavaScript

const ROUTINE_URL = './data/routine.json?t=' + Date.now();
const STORAGE_KEY = 'diu_cse_section';

// DOM Elements
const sectionInput = document.getElementById('sectionInput');
const showRoutineBtn = document.getElementById('showRoutineBtn');
const clearSectionBtn = document.getElementById('clearSectionBtn');
const routineContainer = document.getElementById('routineContainer');
const statusBadge = document.getElementById('statusBadge');
const lastUpdated = document.getElementById('lastUpdated');
const message = document.getElementById('message');

let routineData = null;
let selectedSection = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Load saved section
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        sectionInput.value = saved;
    }
    
    // Load routine data
    loadRoutineData();
    
    // Event listeners
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
                displayRoutine(data.sections[section], section);
            }
        } else if (data.sections && Object.keys(data.sections).length > 0) {
            // Show first section
            const first = Object.keys(data.sections)[0];
            displayRoutine(data.sections[first], first);
        }
        
    } catch (error) {
        console.error('Failed to load routine:', error);
        setStatus('error', 'Error loading data');
        showMessage('Routine data is currently unavailable. Please try again later.', 'error');
        showNoRoutine('Could not load routine data', 'The routine data could not be loaded. The GitHub Action may not have run yet.');
    }
}

function handleShowRoutine() {
    const section = sectionInput.value.trim();
    if (!section) {
        showMessage('Please enter a section.', 'error');
        return;
    }
    
    if (!routineData || !routineData.sections) {
        showMessage('Routine data is not loaded yet.', 'error');
        return;
    }
    
    const matched = findMatchingSection(routineData.sections, section);
    if (matched) {
        localStorage.setItem(STORAGE_KEY, section);
        displayRoutine(routineData.sections[matched], matched);
        showMessage(`Showing routine for ${matched}`, 'success');
    } else {
        showMessage(`No routine found for "${section}". Please check your section name.`, 'error');
        showNoRoutine('Section Not Found', `No routine data available for section "${section}"`);
    }
}

function handleClearSection() {
    localStorage.removeItem(STORAGE_KEY);
    sectionInput.value = '';
    showMessage('Saved section cleared.', 'info');
    
    // Show first section
    if (routineData && routineData.sections) {
        const sections = Object.keys(routineData.sections);
        if (sections.length > 0) {
            displayRoutine(routineData.sections[sections[0]], sections[0]);
        }
    }
}

function findMatchingSection(sections, input) {
    const normalized = input.trim().toUpperCase().replace(/\s+/g, '_');
    const keys = Object.keys(sections);
    
    // Direct match
    if (keys.includes(normalized)) return normalized;
    
    // Case insensitive
    for (const key of keys) {
        if (key.toUpperCase() === normalized) return key;
    }
    
    return null;
}

function displayRoutine(classes, sectionName) {
    if (!classes || classes.length === 0) {
        showNoRoutine('No Classes Found', `No classes found for section "${sectionName}"`);
        return;
    }
    
    // Group by day
    const dayOrder = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
    const grouped = {};
    for (const cls of classes) {
        if (!grouped[cls.day]) grouped[cls.day] = [];
        grouped[cls.day].push(cls);
    }
    
    // Build HTML
    let html = `
        <div class="routine-header">
            <h3><i class="fas fa-calendar-alt"></i> Routine for ${escapeHtml(sectionName)}</h3>
            <span class="count"><i class="fas fa-clock"></i> ${classes.length} classes</span>
        </div>
        <div class="table-wrapper">
            <table class="routine-table">
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
                <tbody>
    `;
    
    for (const day of dayOrder) {
        if (!grouped[day]) continue;
        for (const cls of grouped[day]) {
            const typeClass = cls.type === 'Lab' ? 'type-lab' : 'type-theory';
            html += `
                <tr>
                    <td class="day-cell">${escapeHtml(cls.day)}</td>
                    <td>${escapeHtml(cls.time || 'TBA')}</td>
                    <td><strong>${escapeHtml(cls.course)}</strong></td>
                    <td>${escapeHtml(cls.teacher || 'TBA')}</td>
                    <td>${escapeHtml(cls.room || 'TBA')}</td>
                    <td><span class="type-tag ${typeClass}">${escapeHtml(cls.type)}</span></td>
                </tr>
            `;
        }
    }
    
    html += '</tbody></table></div>';
    routineContainer.innerHTML = html;
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
