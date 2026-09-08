// ============================================================
// DIU CSE ROUTINE - STUDENT VIEW
// ============================================================

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


// ============================================================
// DAY ORDER
// ============================================================

const DAYS = [
    'Saturday',
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday'
];

const DAY_ORDER = {
    Saturday: 0,
    Sunday: 1,
    Monday: 2,
    Tuesday: 3,
    Wednesday: 4,
    Thursday: 5,
    Friday: 6
};


// ============================================================
// TIME ORDER
// ============================================================
//
// IMPORTANT:
// Never use localeCompare() for routine times.
//
// Correct order:
// 08:30-10:00
// 10:00-11:30
// 11:30-01:00
// 01:00-02:30
// 02:30-04:00
// 04:00-05:30
// ============================================================

const TIME_ORDER = {
    '08:30-10:00': 0,
    '10:00-11:30': 1,
    '11:30-01:00': 2,
    '01:00-02:30': 3,
    '02:30-04:00': 4,
    '04:00-05:30': 5
};


// ============================================================
// PAGE LOAD
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

    const saved =
        localStorage.getItem(STORAGE_KEY);

    if (saved) {

        sectionInput.value = saved;

        loadSection(saved);

    } else {

        showNoRoutine(
            'Enter a section',
            'Type your section (e.g., 70_N) and click "Show Routine".'
        );

    }


    showRoutineBtn.addEventListener(
        'click',
        handleShowRoutine
    );


    clearSectionBtn.addEventListener(
        'click',
        handleClearSection
    );


    sectionInput.addEventListener(
        'keypress',
        (e) => {

            if (e.key === 'Enter') {

                handleShowRoutine();

            }

        }
    );

});


// ============================================================
// LOAD SECTION
// ============================================================

async function loadSection(sectionKey) {

    try {

        setStatus(
            'loading',
            'Loading...'
        );


        // ----------------------------------------------------
        // Try section JSON first
        // ----------------------------------------------------

        const perSectionUrl =
            `${SECTIONS_BASE}${sectionKey}.json?t=${Date.now()}`;


        let data = null;
        let found = false;


        try {

            const response =
                await fetch(perSectionUrl);


            if (response.ok) {

                data =
                    await response.json();

                found = true;

            }

        } catch (error) {

            // Fallback below

        }


        // ----------------------------------------------------
        // Fallback to routine.json
        // ----------------------------------------------------

        if (!found) {

            const combinedResponse =
                await fetch(COMBINED_URL);


            if (!combinedResponse.ok) {

                throw new Error(
                    'Failed to load routine data.'
                );

            }


            const combined =
                await combinedResponse.json();


            if (
                combined.sections &&
                combined.sections[sectionKey]
            ) {

                const secData =
                    combined.sections[sectionKey];


                data = {

                    section:
                        sectionKey,

                    batch:
                        secData.batch ||
                        extractBatchFromSection(
                            sectionKey
                        ),

                    classes:
                        secData.classes ||
                        []

                };


                found = true;


                if (combined.version) {

                    versionNumber.textContent =
                        combined.version;

                }


                if (combined.updated_at) {

                    const date =
                        new Date(
                            combined.updated_at
                        );

                    lastUpdated.textContent =
                        'Updated: ' +
                        date.toLocaleString();

                }

            }

        }


        if (!found) {

            throw new Error(
                `Section "${sectionKey}" not found.`
            );

        }


        // ----------------------------------------------------
        // Normalize classes
        // ----------------------------------------------------

        data.classes =
            normalizeClasses(
                data.classes || []
            );


        currentSectionData =
            data;


        setStatus(
            'ready',
            'Ready'
        );


        hideMessage();


        displayRoutine(data);


        localStorage.setItem(
            STORAGE_KEY,
            sectionKey
        );


    } catch (error) {

        console.error(
            'Failed to load section:',
            error
        );


        setStatus(
            'error',
            'Error'
        );


        showMessage(
            error.message,
            'error'
        );


        showNoRoutine(
            'Section Not Found',
            `No routine data for "${sectionKey}". Please check the section name.`
        );

    }

}


// ============================================================
// NORMALIZE CLASSES
// ============================================================

function normalizeClasses(classes) {

    return classes.map(cls => {

        return {

            ...cls,

            day:
                normalizeDay(cls.day),

            time:
                normalizeTime(cls.time),

            course:
                String(
                    cls.course || ''
                ).trim(),

            teacher:
                String(
                    cls.teacher || ''
                ).trim(),

            room:
                String(
                    cls.room || ''
                ).trim(),

            section:
                String(
                    cls.section || ''
                ).trim(),

            sub_section:
                String(
                    cls.sub_section || 'Main'
                ).trim(),

            batch:
                String(
                    cls.batch || ''
                ).trim(),

            section_letter:
                String(
                    cls.section_letter || ''
                ).trim(),

            type:
                normalizeClassType(
                    cls.type
                )

        };

    });

}


// ============================================================
// NORMALIZE DAY
// ============================================================

function normalizeDay(day) {

    if (!day) return '';

    const value =
        String(day)
            .trim()
            .toLowerCase();


    for (const validDay of DAYS) {

        if (
            validDay.toLowerCase() === value
        ) {

            return validDay;

        }

    }


    return String(day).trim();

}


// ============================================================
// NORMALIZE TIME
// ============================================================

function normalizeTime(time) {

    if (!time) return 'TBA';

    return String(time)
        .trim()
        .replace(/\s+/g, '');

}


// ============================================================
// NORMALIZE TYPE
// ============================================================

function normalizeClassType(type) {

    if (!type) return 'Theory';

    return String(type)
        .trim()
        .toLowerCase() === 'lab'
        ? 'Lab'
        : 'Theory';

}


// ============================================================
// BATCH FROM SECTION
// ============================================================

function extractBatchFromSection(section) {

    if (!section) return 'Unknown';

    const match =
        String(section).match(
            /^(\d+)_/
        );

    return match
        ? match[1]
        : 'Unknown';

}


// ============================================================
// SHOW ROUTINE
// ============================================================

function handleShowRoutine() {

    const section =
        sectionInput.value.trim();


    if (!section) {

        showMessage(
            'Please enter your section (e.g., 70_N).',
            'error'
        );

        return;

    }


    const normalized =
        section
            .toUpperCase()
            .replace(/\s+/g, '_');


    loadSection(normalized);

}


// ============================================================
// CLEAR SECTION
// ============================================================

function handleClearSection() {

    localStorage.removeItem(
        STORAGE_KEY
    );


    sectionInput.value = '';

    currentSectionData = null;


    showMessage(
        'Saved section cleared.',
        'info'
    );


    showNoRoutine(
        'Enter a section',
        'Type your section and click "Show Routine".'
    );

}


// ============================================================
// DISPLAY ROUTINE
// ============================================================

function displayRoutine(data) {

    const classes =
        data.classes || [];


    if (classes.length === 0) {

        showNoRoutine(
            'No Classes Found',
            `No classes for section "${data.section || 'Unknown'}".`
        );

        return;

    }


    const batch =
        data.batch ||
        extractBatchFromSection(
            data.section
        );


    const section =
        data.section || 'Unknown';


    let html =
        buildProfile(
            batch,
            section,
            classes
        );


    // Keep Enrolled Courses exactly in this part
    html +=
        buildCourses(classes);


    // Keep Day View / Week View exactly below courses
    html += `

        <div class="view-tabs">

            <button
                class="view-tab active"
                data-view="day"
            >
                <i class="fas fa-calendar-day"></i>
                Day View
            </button>


            <button
                class="view-tab"
                data-view="week"
            >
                <i class="fas fa-calendar-week"></i>
                Week View
            </button>

        </div>


        <div id="viewContent"></div>

    `;


    routineContainer.innerHTML =
        html;


    renderDayView(classes);


    // --------------------------------------------------------
    // View buttons
    // --------------------------------------------------------

    document
        .querySelectorAll('.view-tab')
        .forEach(tab => {

            tab.addEventListener(
                'click',
                function () {

                    document
                        .querySelectorAll(
                            '.view-tab'
                        )
                        .forEach(t => {

                            t.classList.remove(
                                'active'
                            );

                        });


                    this.classList.add(
                        'active'
                    );


                    if (
                        this.dataset.view ===
                        'day'
                    ) {

                        renderDayView(
                            classes
                        );

                    } else {

                        renderWeekView(
                            classes
                        );

                    }

                }
            );

        });

}


// ============================================================
// STUDENT PROFILE
// ============================================================
//
// Kept in the same structure as the existing UI:
//
// Student 70_N
//
// Batch: 70
// Section: 70_N
// Total Classes: 10
// Version: v5.0
// Classes/Week: 4
//
// 10 Classes
// 4 Days
// Sat, Sun, Tue, Wed
// Active Days
// ============================================================

function buildProfile(
    batch,
    section,
    classes
) {

    const total =
        classes.length;


    const uniqueDays =
        [
            ...new Set(
                classes
                    .map(c => c.day)
                    .filter(day =>
                        DAYS.includes(day)
                    )
            )
        ]
        .sort(
            (a, b) =>
                DAY_ORDER[a] -
                DAY_ORDER[b]
        );


    const perWeek =
        uniqueDays.length;


    return `

        <div class="student-profile">

            <div class="profile-top">

                <div>

                    <div class="profile-name">

                        <i class="fas fa-user-graduate"></i>

                        Student

                        <span class="badge">
                            ${escapeHtml(section)}
                        </span>

                    </div>


                    <div class="profile-details">

                        <span>
                            <i class="fas fa-layer-group"></i>
                            Batch:
                            <strong>
                                ${escapeHtml(batch)}
                            </strong>
                        </span>


                        <span>
                            <i class="fas fa-tag"></i>
                            Section:
                            <strong>
                                ${escapeHtml(section)}
                            </strong>
                        </span>


                        <span>
                            <i class="fas fa-book"></i>
                            Total Classes:
                            <strong>
                                ${total}
                            </strong>
                        </span>


                        <span>
                            <i class="fas fa-code-branch"></i>
                            Version:
                            <strong>
                                v${escapeHtml(
                                    versionNumber.textContent ||
                                    '5.0'
                                )}
                            </strong>
                        </span>


                        <span>
                            <i class="fas fa-calendar-alt"></i>
                            Classes/Week:
                            <strong>
                                ${perWeek}
                            </strong>
                        </span>

                    </div>

                </div>


                <div class="profile-stats">

                    <div class="stat-item">

                        <div class="num">
                            ${total}
                        </div>

                        <div class="label">
                            Classes
                        </div>

                    </div>


                    <div class="stat-item">

                        <div class="num">
                            ${perWeek}
                        </div>

                        <div class="label">
                            Days
                        </div>

                    </div>


                    <div class="stat-item">

                        <div class="num">
                            ${uniqueDays
                                .map(day =>
                                    day.substring(0, 3)
                                )
                                .join(', ')
                            }
                        </div>

                        <div class="label">
                            Active Days
                        </div>

                    </div>

                </div>

            </div>

        </div>

    `;

}


// ============================================================
// ENROLLED COURSES
// ============================================================
//
// This section remains above Day View / Week View.
// ============================================================

function buildCourses(classes) {

    const courseMap = {};


    for (const cls of classes) {

        if (!courseMap[cls.course]) {

            courseMap[cls.course] = {

                course:
                    cls.course,

                teacher:
                    cls.teacher ||
                    'TBA',

                type:
                    cls.type ||
                    'Theory'

            };

        }

    }


    const courses =
        Object.values(courseMap);


    let html = `

        <div class="course-section">

            <div class="course-header">

                <h4>
                    <i class="fas fa-list-ul"></i>
                    Enrolled Courses
                </h4>

                <span class="count">
                    ${courses.length} courses
                </span>

            </div>


            <div class="course-grid">

    `;


    for (const course of courses) {

        const typeClass =
            course.type === 'Lab'
                ? 'type-lab'
                : 'type-theory';


        html += `

            <div class="course-tag">

                <span class="code">
                    ${escapeHtml(
                        course.course
                    )}
                </span>


                <span class="teacher">
                    ${escapeHtml(
                        course.teacher
                    )}
                </span>


                <span
                    class="type-tag ${typeClass}"
                >
                    ${escapeHtml(
                        course.type
                    )}
                </span>

            </div>

        `;

    }


    html += `

            </div>

        </div>

    `;


    return html;

}


// ============================================================
// SORT CLASSES
// ============================================================
//
// JSON order doesn't matter.
//
// UI ALWAYS:
//
// Saturday
// Sunday
// Monday
// Tuesday
// Wednesday
// Thursday
// Friday
//
// And inside each day:
//
// 08:30
// 10:00
// 11:30
// 01:00
// 02:30
// 04:00
// ============================================================

function sortClasses(classes) {

    return [...classes].sort(
        (a, b) => {

            // ------------------------------------------------
            // DAY
            // ------------------------------------------------

            const dayA =
                DAY_ORDER[a.day] ?? 999;


            const dayB =
                DAY_ORDER[b.day] ?? 999;


            if (dayA !== dayB) {

                return dayA - dayB;

            }


            // ------------------------------------------------
            // TIME
            // ------------------------------------------------

            const timeA =
                getTimeOrder(a.time);


            const timeB =
                getTimeOrder(b.time);


            if (timeA !== timeB) {

                return timeA - timeB;

            }


            // ------------------------------------------------
            // COURSE
            // ------------------------------------------------

            return String(
                a.course || ''
            ).localeCompare(
                String(
                    b.course || ''
                )
            );

        }
    );

}


// ============================================================
// GET TIME ORDER
// ============================================================

function getTimeOrder(time) {

    if (!time) return 9999;


    // Exact routine slot
    if (
        Object.prototype.hasOwnProperty.call(
            TIME_ORDER,
            time
        )
    ) {

        return TIME_ORDER[time];

    }


    // --------------------------------------------------------
    // Fallback for custom time
    // --------------------------------------------------------

    const minutes =
        getTimeStartMinutes(time);


    return minutes === 999999
        ? 9999
        : minutes;

}


// ============================================================
// TIME TO MINUTES
// ============================================================

function getTimeStartMinutes(time) {

    if (!time) return 999999;


    const match =
        String(time).match(
            /^(\d{1,2}):(\d{2})/
        );


    if (!match) return 999999;


    let hour =
        parseInt(
            match[1],
            10
        );


    const minute =
        parseInt(
            match[2],
            10
        );


    // Routine uses:
    //
    // 11:30
    // 01:00
    // 02:30
    // 04:00
    //
    // Therefore 01-05 means afternoon.

    if (
        hour >= 1 &&
        hour <= 5
    ) {

        hour += 12;

    }


    return (
        hour * 60 +
        minute
    );

}


// ============================================================
// GET SUB SECTION LABEL
// ============================================================
//
// JSON:
//
// section: "70_N"
// sub_section: "Main"
//      -> nothing
//
// sub_section: "1"
//      -> (N1)
//
// sub_section: "2"
//      -> (N2)
//
// For another section:
//
// 70_F + 1 -> (F1)
// 70_F + 2 -> (F2)
// ============================================================

function getSubSectionLabel(cls) {

    if (
        !cls.sub_section ||
        cls.sub_section === 'Main'
    ) {

        return '';

    }


    let sectionLetter =
        cls.section_letter;


    // If section_letter isn't present,
    // extract it from 70_N.
    if (!sectionLetter) {

        const match =
            String(
                cls.section || ''
            ).match(
                /^\d+_([A-Z])/
            );


        if (match) {

            sectionLetter =
                match[1];

        }

    }


    // --------------------------------------------------------
    // Normal section
    // --------------------------------------------------------

    if (sectionLetter) {

        return `(${sectionLetter}${cls.sub_section})`;

    }


    // --------------------------------------------------------
    // Special section fallback
    // --------------------------------------------------------

    return `(${cls.sub_section})`;

}


// ============================================================
// DAY VIEW
// ============================================================

function renderDayView(classes) {

    const container =
        document.getElementById(
            'viewContent'
        );


    if (!container) return;


    const sortedClasses =
        sortClasses(classes);


    const grouped = {};


    // --------------------------------------------------------
    // Group by day
    // --------------------------------------------------------

    for (const cls of sortedClasses) {

        if (!grouped[cls.day]) {

            grouped[cls.day] = [];

        }


        grouped[cls.day].push(cls);

    }


    let html =
        '<div class="day-grid">';


    // --------------------------------------------------------
    // ALWAYS use Saturday -> Friday
    // --------------------------------------------------------

    for (const day of DAYS) {

        if (!grouped[day]) continue;


        const sorted =
            sortClasses(
                grouped[day]
            );


        html += `

            <div class="day-card">

                <div class="day-card-header">

                    <span class="day-name">

                        <i class="fas fa-calendar-alt"></i>

                        ${day}

                    </span>


                    <span class="count">

                        ${sorted.length}
                        ${sorted.length === 1
                            ? 'class'
                            : 'classes'
                        }

                    </span>

                </div>


                <div class="day-card-body">

        `;


        // ----------------------------------------------------
        // TIME ORDER IS ALREADY SORTED
        // ----------------------------------------------------

        for (const cls of sorted) {

            html +=
                buildClassItem(
                    cls
                );

        }


        html += `

                </div>

            </div>

        `;

    }


    html += '</div>';


    container.innerHTML =
        html;

}


// ============================================================
// CLASS ITEM
// ============================================================

function buildClassItem(cls) {

    const type =
        cls.type === 'Lab'
            ? 'Lab'
            : 'Theory';


    const typeClass =
        type === 'Lab'
            ? 'type-lab'
            : 'type-theory';


    // --------------------------------------------------------
    // Section label
    //
    // Main:
    //      nothing
    //
    // Lab sub section 1:
    //      (N1)
    //
    // Lab sub section 2:
    //      (N2)
    // --------------------------------------------------------

    const subLabel =
        getSubSectionLabel(cls);


    const subHtml =
        subLabel
            ? `
                <span class="sub-section">
                    ${escapeHtml(subLabel)}
                </span>
              `
            : '';


    return `

        <div class="class-item">

            <div class="time">

                <i class="far fa-clock"></i>

                ${escapeHtml(
                    cls.time || 'TBA'
                )}

            </div>


            <div class="course">

                <span class="course-code">

                    ${escapeHtml(
                        cls.course
                    )}

                </span>


                ${subHtml}

            </div>


            <div class="details">

                <span>

                    <i class="fas fa-chalkboard-teacher"></i>

                    ${escapeHtml(
                        cls.teacher || 'TBA'
                    )}

                </span>


                <span>

                    <i class="fas fa-door-open"></i>

                    ${escapeHtml(
                        cls.room || 'TBA'
                    )}

                </span>


                <span>

                    <span
                        class="type-tag ${typeClass}"
                    >
                        ${type}
                    </span>

                </span>

            </div>

        </div>

    `;

}


// ============================================================
// WEEK VIEW
// ============================================================

function renderWeekView(classes) {

    const container =
        document.getElementById(
            'viewContent'
        );


    if (!container) return;


    const grouped = {};


    for (const cls of classes) {

        if (!grouped[cls.day]) {

            grouped[cls.day] = [];

        }


        grouped[cls.day].push(cls);

    }


    // --------------------------------------------------------
    // Collect unique times
    // --------------------------------------------------------

    const times =
        [
            ...new Set(
                classes
                    .map(c => c.time)
                    .filter(
                        t =>
                            t &&
                            t !== 'TBA'
                    )
            )
        ]
        .sort(
            (a, b) =>
                getTimeOrder(a) -
                getTimeOrder(b)
        );


    if (times.length === 0) {

        times.push('TBA');

    }


    let html = `

        <div class="week-view">

            <table class="week-table">

                <thead>

                    <tr>

                        <th>
                            Time
                        </th>

    `;


    // --------------------------------------------------------
    // Day headers
    // --------------------------------------------------------

    for (const day of DAYS) {

        html += `

            <th>
                ${day.substring(0, 3)}
            </th>

        `;

    }


    html += `

                    </tr>

                </thead>

                <tbody>

    `;


    // --------------------------------------------------------
    // TIME ROWS
    // --------------------------------------------------------

    for (const time of times) {

        html += `

            <tr>

                <td class="time-col">

                    ${escapeHtml(time)}

                </td>

        `;


        // ----------------------------------------------------
        // DAYS
        // ----------------------------------------------------

        for (const day of DAYS) {

            const dayClasses =
                grouped[day] || [];


            const matching =
                dayClasses.filter(
                    cls =>
                        cls.time === time
                );


            if (
                matching.length > 0
            ) {

                html += `<td>`;


                const sorted =
                    sortClasses(
                        matching
                    );


                for (const cls of sorted) {

                    const type =
                        cls.type === 'Lab'
                            ? 'Lab'
                            : 'Theory';


                    const typeClass =
                        type === 'Lab'
                            ? 'type-lab'
                            : 'type-theory';


                    const subLabel =
                        getSubSectionLabel(
                            cls
                        );


                    html += `

                        <div
                            class="week-class"
                            style="margin-bottom:6px;"
                        >

                            <strong>

                                ${escapeHtml(
                                    cls.course
                                )}

                            </strong>


                            ${
                                subLabel
                                    ? `
                                        <span
                                            class="sub-section"
                                        >
                                            ${escapeHtml(
                                                subLabel
                                            )}
                                        </span>
                                      `
                                    : ''
                            }


                            <span
                                class="type-tag ${typeClass}"
                                style="
                                    font-size:0.65rem;
                                "
                            >
                                ${type}
                            </span>


                            <br>


                            <span
                                style="
                                    font-size:0.8rem;
                                    color:var(--gray-600);
                                "
                            >

                                ${escapeHtml(
                                    cls.teacher ||
                                    'TBA'
                                )}

                                •

                                ${escapeHtml(
                                    cls.room ||
                                    'TBA'
                                )}

                            </span>

                        </div>

                    `;

                }


                html += `</td>`;

            } else {

                html += `

                    <td
                        style="
                            color:var(--gray-200);
                        "
                    >
                        —
                    </td>

                `;

            }

        }


        html += `

            </tr>

        `;

    }


    html += `

                </tbody>

            </table>

        </div>

    `;


    container.innerHTML =
        html;

}


// ============================================================
// NO ROUTINE
// ============================================================

function showNoRoutine(
    title,
    msg
) {

    routineContainer.innerHTML = `

        <div class="no-routine">

            <div class="icon">
                📅
            </div>

            <h3>
                ${escapeHtml(title)}
            </h3>

            <p>
                ${escapeHtml(msg)}
            </p>

        </div>

    `;

}


// ============================================================
// STATUS
// ============================================================

function setStatus(
    type,
    text
) {

    statusBadge.className =
        'status ' + type;


    statusText.textContent =
        text;

}


// ============================================================
// MESSAGE
// ============================================================

function showMessage(
    text,
    type
) {

    message.textContent =
        text;


    message.className =
        'show ' + type;


    setTimeout(
        () => {
            message.className = '';
        },
        5000
    );

}


// ============================================================
// HIDE MESSAGE
// ============================================================

function hideMessage() {

    message.className = '';

}


// ============================================================
// ESCAPE HTML
// ============================================================

function escapeHtml(text) {

    if (
        text === null ||
        text === undefined ||
        text === ''
    ) {

        return '-';

    }


    const div =
        document.createElement(
            'div'
        );


    div.textContent =
        String(text);


    return div.innerHTML;

}
