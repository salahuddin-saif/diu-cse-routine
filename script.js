const ROUTINE_URL = './data/routine.json?t=' + Date.now();
const STORAGE_KEY = 'diu_cse_section';

document.addEventListener('DOMContentLoaded', function() {
    // Load saved section
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        document.getElementById('sectionInput').value = saved;
    }
    
    // Load routine
    loadRoutine();
    
    // Event listeners
    document.getElementById('showRoutine').addEventListener('click', showRoutine);
    document.getElementById('clearSection').addEventListener('click', clearSection);
    document.getElementById('sectionInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') showRoutine();
    });
});

async function loadRoutine() {
    try {
        const response = await fetch(ROUTINE_URL);
        if (!response.ok) throw new Error('Failed to load');
        
        const data = await response.json();
        window.routineData = data;
        
        // Update last updated
        if (data.updated_at) {
            const date = new Date(data.updated_at);
            document.getElementById('lastUpdated').textContent = 
                'Last updated: ' + date.toLocaleString();
        }
        
        document.getElementById('status').textContent = '● Ready';
        document.getElementById('status').className = 'status-success';
        
        // Show saved section if exists
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && data.sections) {
            const section = findSection(data.sections, saved);
            if (section) {
                displayRoutine(data.sections[section], section);
            }
        }
        
    } catch (error) {
        document.getElementById('status').textContent = '● Error';
        document.getElementById('status').className = 'status-error';
        showMessage('Routine data is currently unavailable', 'error');
    }
}

function showRoutine() {
    const input = document.getElementById('sectionInput').value.trim();
    if (!input) {
        showMessage('Please enter a section', 'error');
        return;
    }
    
    if (!window.routineData || !window.routineData.sections) {
        showMessage('Routine data not loaded', 'error');
        return;
    }
    
    const section = findSection(window.routineData.sections, input);
    if (section) {
        localStorage.setItem(STORAGE_KEY, input);
        displayRoutine(window.routineData.sections[section], section);
        showMessage('Showing routine for ' + section, 'success');
    } else {
        showMessage('No routine found for "' + input + '"', 'error');
    }
}

function findSection(sections, input) {
    const normalized = input.toUpperCase().replace(/\s+/g, '_');
    const keys = Object.keys(sections);
    
    // Direct match
    if (keys.includes(normalized)) return normalized;
    
    // Case insensitive match
    for (const key of keys) {
        if (key.toUpperCase() === normalized) return key;
    }
    
    return null;
}

function displayRoutine(classes, section) {
    const container = document.getElementById('routineContainer');
    
    if (!classes || classes.length === 0) {
        container.innerHTML = '<div class="no-routine"><p>No classes found</p></div>';
        return;
    }
    
    // Group by day
    const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
    const grouped = {};
    for (const cls of classes) {
        if (!grouped[cls.day]) grouped[cls.day] = [];
        grouped[cls.day].push(cls);
    }
    
    let html = '<h3>Routine for ' + section + '</h3>';
    html += '<div class="routine-table-wrapper"><table class="routine-table">';
    html += '<thead><tr><th>Day</th><th>Time</th><th>Course</th><th>Teacher</th><th>Room</th><th>Type</th></tr></thead><tbody>';
    
    for (const day of days) {
        if (!grouped[day]) continue;
        for (const cls of grouped[day]) {
            const typeClass = cls.type === 'Lab' ? 'type-lab' : 'type-theory';
            html += `<tr>
                <td class="day-cell">${escapeHtml(cls.day)}</td>
                <td>${escapeHtml(cls.time || 'TBA')}</td>
                <td><strong>${escapeHtml(cls.course)}</strong></td>
                <td>${escapeHtml(cls.teacher || 'TBA')}</td>
                <td>${escapeHtml(cls.room || 'TBA')}</td>
                <td><span class="type-tag ${typeClass}">${escapeHtml(cls.type)}</span></td>
            </tr>`;
        }
    }
    
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

function clearSection() {
    localStorage.removeItem(STORAGE_KEY);
    document.getElementById('sectionInput').value = '';
    showMessage('Saved section cleared', 'info');
    
    // Show first section if available
    if (window.routineData && window.routineData.sections) {
        const keys = Object.keys(window.routineData.sections);
        if (keys.length > 0) {
            displayRoutine(window.routineData.sections[keys[0]], keys[0]);
        }
    }
}

function showMessage(msg, type) {
    const el = document.getElementById('message');
    el.textContent = msg;
    el.className = 'status-message ' + type;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 5000);
}

function escapeHtml(text) {
    if (!text) return '-';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
