// DIU CSE Routine – Loads from routine.json, merges sub‑sections

const STORAGE_KEY = 'diu_cse_section';
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

let routineData = null;
let currentBaseSection = null;
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

    // --- Event Listeners ---
    // 1. Search icon click
    if (searchIcon) {
        searchIcon.style.cursor = 'pointer';
        searchIcon.addEventListener('click', handleShowRoutine);
    }

    // 2. Hidden button click (fallback)
    if (showRoutineBtn) {
        showRoutineBtn.addEventListener('click', handleShowRoutine);
    }

    // 3. Clear button
    clearSectionBtn.addEventListener('click', handleClearSection);

    // 4. Enter key on input – using 'keydown' (works on mobile)
    sectionInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            handleShowRoutine();
        }
    });
    sectionInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            handleShowRoutine();
        }
    });
});

// ============================================================
// LOAD ROUTINE DATA (combined JSON once)
// ============================================================

async function loadRoutineData() {
    try {
        setStatus('loading', 'Loading...');
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
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

        const sections = data.sections || {};
        const keys = Object.keys(sections);
        if (keys.length > 0) {
            // Show first section (merge all its sub‑sections)
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
        setStatus('ready', 'Ready');
    } catch (error) {
        console.error('Failed to load routine:', error);
        setStatus('error', 'Error');
        showMessage('Could not load routine data. Please try again.', 'error');
        showNoRoutine('Error', 'Data could not be loaded.');
    }
}

// ============================================================
// SECTION LOADING WITH SUB‑SECTION MERGING
// ============================================================

async function loadSection(sectionKey) {
    try {
        setStatus('loading', 'Loading...');
        const normalized = sectionKey.toUpperCase().replace(/\s+/g, '_');
        console.log('🔍 Searching for section:', normalized);

        // Ensure routineData is loaded
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

        // Find all sections that start with the base (e.g., "70_N" matches "70_N", "70_N1", "70_N2")
        const matchingKeys = Object.keys(sections).filter(k => k.startsWith(normalized) || k === normalized);
        if (matchingKeys.length === 0) {
            // Try partial match (e.g., "70_N" might match "70_N1")
            const fallbackKey = Object.keys(sections).find(k => k.startsWith(normalized) || normalized.startsWith(k));
            if (fallbackKey) {
                matchingKeys.push(fallbackKey);
            }
        }

        if (matchingKeys.length === 0) {
            throw new Error(`Section "${normalized}" not found.`);
        }

        // Merge classes from all matching sections
        const mergedClasses = [];
        for (const key of matchingKeys) {
            const secData = sections[key];
            if (secData && Array.isArray(secData)) {
                // If secData is an array of classes
                mergedClasses.push(...secData);
            } else if (secData && secData.classes) {
                mergedClasses.push(...secData.classes);
            }
        }

        if (mergedClasses.length === 0) {
            throw new Error(`No classes found for section "${normalized}".`);
        }

        // Determine the base section name (remove trailing digits after underscore, e.g., "70_N1" -> "70_N")
        const baseSection = normalized.replace(/_\d+$/, '');
        // If no change, use the normalized key
        const displaySectionKey = baseSection !== normalized ? baseSection : normalized;

        // Store the display section key and the merged classes
        currentBaseSection = displaySectionKey;
        currentClasses = mergedClasses;

        // Display the merged routine
        displaySection(displaySectionKey, mergedClasses);

        // Save the original search key (the one user typed) for localStorage
        const saveKey = normalized;
        localStorage.setItem(STORAGE_KEY, saveKey);
        savedSectionSpan.textContent = saveKey;
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
// DISPLAY SECTION (UI rendering)
// ============================================================

function displaySection(sectionKey, classes) {
    routineContainer.innerHTML = '';

    if (!classes || classes.length === 0) {
        showNoRoutine('No Classes', `No classes for section "${sectionKey}".`);
        return;
    }

    // Build a unique list of teachers
    const teachers = [...new Set(classes.map(c => c.teacher).filter(t => t && t !== '?' && t !== 'TBA'))];

    const batch = sectionKey.split('_')[0] || 'Unknown';
    const total = classes.length;
    const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const uniqueDays = [...new Set(classes.map(c => c.day))].filter(d => days.includes(d));
    const perWeek = uniqueDays.length;

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
// DAY VIEW – with sub‑section comment & lab tag
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
            // Determine if lab
            const isLab = cls.type === 'lab' || (cls.type && cls.type.toLowerCase() === 'lab');
            const typeClass = isLab ? 'type-lab' : 'type-theory';
            const typeLabel = isLab ? 'Lab' : 'Theory';

            // Extract sub‑section comment: if the group (section) differs from current base section
            // For example, if base is "70_N" and group is "70_N1", show "(N1)" as comment.
            // We can compute subSection from the group field if present, or from cls.section.
            let subComment = '';
            const group = cls.group || cls.section || '';
            if (group) {
                // Remove batch prefix and underscore from group, e.g., "70_N1" -> "N1"
                const parts = group.split('_');
                if (parts.length > 1) {
                    const suffix = parts[1];
                    // Check if suffix has digits after letters (e.g., "N1")
                    const match = suffix.match(/^([A-Z]+)(\d+)$/);
                    if (match) {
                        subComment = `(${match[1]}${match[2]})`; // e.g., "(N1)"
                    } else if (suffix !== parts[0]) {
                        subComment = `(${suffix})`;
                    }
                }
            }

            // Time display: use start/end or the 'time' field
            const timeDisplay = cls.start && cls.end ? `${cls.start} – ${cls.end}` : (cls.time || 'TBA');

            html += `
                <div class="class-item">
                    <div class="time"><i class="far fa-clock"></i> ${escapeHtml(timeDisplay)}</div>
                    <div class="course">${escapeHtml(cls.course)} <span style="font-size:0.8rem;color:var(--muted);">${escapeHtml(subComment)}</span></div>
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
// WEEK VIEW – with sub‑section comment & lab tag
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

    // Collect unique time slots
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
                    // Sub‑section comment
                    let subComment = '';
                    const group = cls.group || cls.section || '';
                    if (group) {
                        const parts = group.split('_');
                        if (parts.length > 1) {
                            const suffix = parts[1];
                            const match = suffix.match(/^([A-Z]+)(\d+)$/);
                            if (match) subComment = `(${match[1]}${match[2]})`;
                            else if (suffix !== parts[0]) subComment = `(${suffix})`;
                        }
                    }
                    html += `<div style="margin-bottom:4px;">
                        <strong>${escapeHtml(cls.course)}</strong> <span style="font-size:0.7rem;color:var(--muted);">${escapeHtml(subComment)}</span>
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
    loadRoutineData();
}

function downloadSection() {
    if (currentBaseSection) {
        alert(`Download PDF for ${currentBaseSection} (coming soon)`);
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
