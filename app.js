// ---------------------------------------------------------------
// State
// ---------------------------------------------------------------
const state = {
  activeCourses: new Set(COURSES.map(c => c.id)), // which courses are shown
  view: "calendar",
  monthIndex: 0, // index into MONTHS below
  selectedDate: null,
};

const MONTHS = [
  { year: 2026, month: 7 },  // Aug (0-indexed)
  { year: 2026, month: 8 },  // Sep
  { year: 2026, month: 9 },  // Oct
  { year: 2026, month: 10 }, // Nov
  { year: 2026, month: 11 }, // Dec
];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ---------------------------------------------------------------
// Edit persistence — lets you change/add/remove anything from the
// Edit tab instead of hand-editing data.js. Stored in localStorage,
// layered on top of the original data.js contents.
// ---------------------------------------------------------------
const LS_EVENT_OVERRIDES_KEY = "syllabusHub.eventOverrides"; // { [baseId]: {field: value} }
const LS_EVENT_DELETED_KEY = "syllabusHub.eventDeleted";     // [baseId, ...]
const LS_EVENT_ADDED_KEY = "syllabusHub.eventAdded";         // [{id, course, date, type, title, detail}]
const LS_COURSE_OVERRIDES_KEY = "syllabusHub.courseOverrides"; // { [courseId]: {field: value} }

function getEventOverrides() {
  try { return JSON.parse(localStorage.getItem(LS_EVENT_OVERRIDES_KEY)) || {}; }
  catch { return {}; }
}
function saveEventOverrides(o) { localStorage.setItem(LS_EVENT_OVERRIDES_KEY, JSON.stringify(o)); }

function getDeletedEventIds() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_EVENT_DELETED_KEY)) || []); }
  catch { return new Set(); }
}
function saveDeletedEventIds(set) { localStorage.setItem(LS_EVENT_DELETED_KEY, JSON.stringify([...set])); }

function getAddedEvents() {
  try { return JSON.parse(localStorage.getItem(LS_EVENT_ADDED_KEY)) || []; }
  catch { return []; }
}
function saveAddedEvents(list) { localStorage.setItem(LS_EVENT_ADDED_KEY, JSON.stringify(list)); }

function getCourseOverrides() {
  try { return JSON.parse(localStorage.getItem(LS_COURSE_OVERRIDES_KEY)) || {}; }
  catch { return {}; }
}
function saveCourseOverrides(o) { localStorage.setItem(LS_COURSE_OVERRIDES_KEY, JSON.stringify(o)); }

function getEffectiveCourses() {
  const overrides = getCourseOverrides();
  return COURSES.map(c => ({ ...c, ...(overrides[c.id] || {}) }));
}

function courseById(id) { return getEffectiveCourses().find(c => c.id === id); }

// Merges the original data.js EVENTS with any edits/deletions/additions
// made from the Edit tab.
function getWorkingEvents() {
  const overrides = getEventOverrides();
  const deleted = getDeletedEventIds();
  const base = EVENTS
    .map((e, i) => ({ ...e, id: `b${i}` }))
    .filter(e => !deleted.has(e.id))
    .map(e => (overrides[e.id] ? { ...e, ...overrides[e.id] } : e));
  return [...base, ...getAddedEvents()];
}

function eventsForActiveCourses() {
  return getWorkingEvents().filter(e => state.activeCourses.has(e.course))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
}

function eventKey(e) {
  return e.id ? `id__${e.id}` : `${e.course}__${e.date}__${e.title}`;
}

function escapeAttr(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function todayISO() {
  // Local date (not UTC) so "today"/"overdue" flips at local midnight,
  // not at ~8pm Eastern.
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// ---------------------------------------------------------------
// Planner persistence (localStorage — this is a static site, not
// a Claude.ai artifact, so localStorage is fine here)
// ---------------------------------------------------------------
const LS_DONE_KEY = "syllabusHub.doneTasks";
const LS_CUSTOM_KEY = "syllabusHub.customTasks";

function getDoneSet() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_DONE_KEY)) || []); }
  catch { return new Set(); }
}
function saveDoneSet(set) {
  localStorage.setItem(LS_DONE_KEY, JSON.stringify([...set]));
  scheduleReminderSync();
}
function getCustomTasks() {
  try { return JSON.parse(localStorage.getItem(LS_CUSTOM_KEY)) || []; }
  catch { return []; }
}
function saveCustomTasks(tasks) {
  localStorage.setItem(LS_CUSTOM_KEY, JSON.stringify(tasks));
  scheduleReminderSync();
}

// ---------------------------------------------------------------
// Course filter tabs
// ---------------------------------------------------------------
function renderCourseTabs() {
  const nav = document.getElementById("course-filter");
  nav.innerHTML = "";

  const allChip = document.createElement("button");
  allChip.className = "tab-chip" + (state.activeCourses.size === COURSES.length ? " active" : "");
  allChip.textContent = "All courses";
  allChip.onclick = () => {
    state.activeCourses = new Set(COURSES.map(c => c.id));
    renderAll();
  };
  nav.appendChild(allChip);

  getEffectiveCourses().forEach(c => {
    const chip = document.createElement("button");
    const isActive = state.activeCourses.has(c.id);
    chip.className = "tab-chip" + (isActive && state.activeCourses.size < COURSES.length ? " active" : "");
    chip.style.color = isActive ? c.color : "";
    chip.innerHTML = `<span class="dot" style="background:${c.color}"></span>${c.code}`;
    chip.onclick = () => {
      // toggle: if only this one active, go back to all; else isolate to this one
      if (state.activeCourses.size === 1 && state.activeCourses.has(c.id)) {
        state.activeCourses = new Set(COURSES.map(x => x.id));
      } else {
        state.activeCourses = new Set([c.id]);
      }
      renderAll();
    };
    nav.appendChild(chip);
  });
}

// ---------------------------------------------------------------
// Course info panel — full instructor/meeting/textbook details.
// Separate from the per-session reading citations in the schedule,
// since "Craighead 3" only makes sense once you know what book that is.
// ---------------------------------------------------------------
function renderCourseInfo() {
  const wrap = document.getElementById("course-info-body");
  const visible = getEffectiveCourses().filter(c => state.activeCourses.has(c.id));
  wrap.innerHTML = visible.map(c => `
    <div class="course-info-card" style="border-left-color:${c.color}">
      <div class="course-info-head">
        <span class="dot" style="background:${c.color}"></span>
        <strong style="color:${c.color}">${c.code}</strong> — ${c.name}
      </div>
      <div class="course-info-meta">${c.instructor} · ${c.meets} · ${c.room}</div>
      ${c.textbooks && c.textbooks.length ? `
        <div class="course-info-books-label">Required textbooks / materials</div>
        <ul class="course-info-books">
          ${c.textbooks.map(t => `<li>${t}</li>`).join("")}
        </ul>
      ` : ""}
    </div>
  `).join("");
}

// ---------------------------------------------------------------
// Countdown strip
// ---------------------------------------------------------------
function renderCountdown() {
  const el = document.getElementById("countdown-strip");
  const today = todayISO();
  const upcoming = eventsForActiveCourses()
    .filter(e => e.type !== "note" && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (upcoming.length === 0) {
    el.innerHTML = `<span class="cd-empty">No upcoming deadlines for the selected course(s).</span>`;
    return;
  }

  const showingAll = state.activeCourses.size === COURSES.length;
  const count = showingAll ? Math.min(4, upcoming.length) : 1;

  el.innerHTML = upcoming.slice(0, count).map(next => {
    const days = Math.round((new Date(next.date) - new Date(today)) / 86400000);
    const course = courseById(next.course);
    return `
      <div class="cd-item">
        <span class="cd-days">T–${days}</span>
        <span>day${days === 1 ? "" : "s"} until <strong style="color:${course.color}">${course.code}</strong>: ${next.title} (${formatDate(next.date)})</span>
      </div>
    `;
  }).join("");
}

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// ---------------------------------------------------------------
// Calendar view
// ---------------------------------------------------------------
const TYPE_PRIORITY = { exam: 0, assignment: 1, reading: 2, note: 3 };
const MAX_CAL_ITEMS = 4;

function renderMonthTabs() {
  const wrap = document.getElementById("month-tabs");
  wrap.innerHTML = MONTHS.map((m, i) =>
    `<button class="month-tab ${i === state.monthIndex ? "active" : ""}" data-month-index="${i}">${MONTH_NAMES[m.month].slice(0, 3)}</button>`
  ).join("");
  wrap.querySelectorAll(".month-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      state.monthIndex = Number(btn.dataset.monthIndex);
      renderCalendar();
    });
  });
}

function renderCalendar() {
  const { year, month } = MONTHS[state.monthIndex];
  document.getElementById("month-label").textContent = `${MONTH_NAMES[month]} ${year}`;
  renderMonthTabs();

  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";
  WEEKDAYS.forEach(w => {
    const el = document.createElement("div");
    el.className = "cal-weekday";
    el.textContent = w;
    grid.appendChild(el);
  });

  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const events = eventsForActiveCourses();
  const today = todayISO();

  for (let i = 0; i < startWeekday; i++) {
    const el = document.createElement("div");
    el.className = "cal-day empty";
    grid.appendChild(el);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayEvents = events.filter(e => e.date === iso)
      .slice()
      .sort((a, b) => TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type]);
    const cell = document.createElement("div");
    cell.className = "cal-day" + (iso === today ? " today" : "") + (iso === state.selectedDate ? " selected" : "");
    cell.innerHTML = `<div class="day-num">${day}</div>`;
    if (dayEvents.length) {
      const list = document.createElement("div");
      list.className = "cal-events";
      dayEvents.slice(0, MAX_CAL_ITEMS).forEach(e => {
        const course = courseById(e.course);
        const row = document.createElement("div");
        row.className = `cal-ev cal-ev-${e.type}`;
        row.style.setProperty("--course-color", course.color);
        row.title = `${course.code}: ${e.title}`;
        row.innerHTML = `<span class="cal-ev-marker"></span><span class="cal-ev-text">${e.title}</span>`;
        list.appendChild(row);
      });
      if (dayEvents.length > MAX_CAL_ITEMS) {
        const more = document.createElement("div");
        more.className = "cal-more";
        more.textContent = `+${dayEvents.length - MAX_CAL_ITEMS} more`;
        list.appendChild(more);
      }
      cell.appendChild(list);
    }
    cell.onclick = () => {
      state.selectedDate = iso;
      renderCalendar();
      renderDayDetail();
    };
    grid.appendChild(cell);
  }
}

function renderDayDetail() {
  const el = document.getElementById("day-detail");
  if (!state.selectedDate) {
    el.innerHTML = `<p class="muted">Click a date to see what's due.</p>`;
    return;
  }
  const dayEvents = eventsForActiveCourses()
    .filter(e => e.date === state.selectedDate)
    .slice()
    .sort((a, b) => TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type]);
  if (dayEvents.length === 0) {
    el.innerHTML = `<h3>${formatDate(state.selectedDate)}</h3><p class="muted">Nothing on the calendar this day.</p>`;
    return;
  }
  el.innerHTML = `<h3>${formatDate(state.selectedDate)}</h3>` + dayEvents.map(e => {
    const c = courseById(e.course);
    return `
      <div class="day-event">
        <div class="bar" style="background:${c.color}"></div>
        <div>
          <div class="badge badge-${e.type}">${e.type}</div>
          <div class="ev-title">${e.title}</div>
          <div class="ev-course">${c.code} — ${c.name}</div>
          ${e.detail ? `<div class="muted" style="margin-top:4px">${e.detail}</div>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

// ---------------------------------------------------------------
// List view
// ---------------------------------------------------------------
function renderList() {
  const tbody = document.querySelector("#list-table tbody");
  tbody.innerHTML = "";
  eventsForActiveCourses().forEach(e => {
    const c = courseById(e.course);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDate(e.date)}</td>
      <td><span class="course-pill" style="color:${c.color}"><span class="dot" style="background:${c.color}"></span>${c.code}</span></td>
      <td>
        <div style="font-weight:600">${e.title}</div>
        ${e.detail ? `<div class="muted">${e.detail}</div>` : ""}
      </td>
      <td><span class="type-badge ${e.type}">${e.type}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------------------------------------------------------------
// Planner view
// ---------------------------------------------------------------
function renderPlanner() {
  const list = document.getElementById("planner-list");
  list.innerHTML = "";
  const done = getDoneSet();
  const today = todayISO();

  const syllabusItems = eventsForActiveCourses()
    .filter(e => PLANNER_TYPES.includes(e.type))
    .map(e => ({
      key: eventKey(e),
      title: e.title,
      detail: e.detail,
      date: e.date,
      courseId: e.course,
      custom: false,
    }));

  const customItems = getCustomTasks()
    .filter(t => state.activeCourses.size === COURSES.length || true) // custom tasks always shown
    .map(t => ({ key: `custom__${t.id}`, title: t.title, date: t.date, courseId: null, custom: true, id: t.id }));

  const all = [...syllabusItems, ...customItems].sort((a, b) => a.date.localeCompare(b.date));

  if (all.length === 0) {
    list.innerHTML = `<p class="muted">Nothing here yet.</p>`;
    return;
  }

  all.forEach(item => {
    const isDone = done.has(item.key);
    const li = document.createElement("li");
    li.className = "planner-item" + (isDone ? " done" : "");
    const course = item.courseId ? courseById(item.courseId) : null;
    const overdue = !isDone && item.date < today;
    li.innerHTML = `
      <input type="checkbox" ${isDone ? "checked" : ""} data-key="${item.key}">
      <div>
        <div class="p-title">${course ? `<span class="p-course-dot" style="background:${course.color}"></span>` : ""}${item.title}</div>
        ${item.detail ? `<div class="p-detail">${item.detail}</div>` : ""}
        <div class="p-meta ${overdue ? "overdue" : ""}">${course ? course.code + " · " : "Your task · "}${formatDate(item.date)}${overdue ? " · overdue" : ""}</div>
      </div>
    `;
    li.querySelector("input").addEventListener("change", (ev) => {
      const d = getDoneSet();
      if (ev.target.checked) d.add(item.key); else d.delete(item.key);
      saveDoneSet(d);
      renderPlanner();
    });
    list.appendChild(li);
  });
}

document.getElementById("custom-task-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const titleInput = document.getElementById("custom-task-title");
  const dateInput = document.getElementById("custom-task-date");
  const tasks = getCustomTasks();
  tasks.push({ id: Date.now().toString(36), title: titleInput.value.trim(), date: dateInput.value });
  saveCustomTasks(tasks);
  titleInput.value = "";
  dateInput.value = "";
  renderPlanner();
});

// ---------------------------------------------------------------
// View switching
// ---------------------------------------------------------------
document.querySelectorAll(".view-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    state.view = btn.dataset.view;
    document.querySelectorAll(".view-tab").forEach(b => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".view").forEach(v => v.hidden = true);
    document.getElementById(`view-${state.view}`).hidden = false;
    renderActiveView();
  });
});

function renderActiveView() {
  if (state.view === "calendar") { renderCalendar(); renderDayDetail(); }
  else if (state.view === "list") renderList();
  else if (state.view === "planner") renderPlanner();
  else if (state.view === "edit") renderEditView();
}

document.getElementById("month-prev").addEventListener("click", () => {
  state.monthIndex = Math.max(0, state.monthIndex - 1);
  renderCalendar();
});
document.getElementById("month-next").addEventListener("click", () => {
  state.monthIndex = Math.min(MONTHS.length - 1, state.monthIndex + 1);
  renderCalendar();
});

// ---------------------------------------------------------------
// Edit view — change/add/remove courses and events, no code editing
// ---------------------------------------------------------------
function renderEditView() {
  renderEditCourses();
  renderEditEvents();
  populateNewEventCourseSelect();
}

function renderEditCourses() {
  const wrap = document.getElementById("edit-courses");
  wrap.innerHTML = "";
  const overrides = getCourseOverrides();

  getEffectiveCourses().forEach(c => {
    const isOverridden = !!overrides[c.id];
    const card = document.createElement("div");
    card.className = "edit-course-card";
    card.innerHTML = `
      <div class="edit-course-head">
        <span class="dot" style="background:${c.color}"></span>
        <strong>${c.code}</strong>
        ${isOverridden ? `<button type="button" class="link-btn" data-revert-course="${c.id}">reset</button>` : ""}
      </div>
      <div class="edit-course-fields">
        <label>Name<input type="text" data-course="${c.id}" data-field="name" value="${escapeAttr(c.name)}"></label>
        <label>Instructor<input type="text" data-course="${c.id}" data-field="instructor" value="${escapeAttr(c.instructor)}"></label>
        <label>Meets<input type="text" data-course="${c.id}" data-field="meets" value="${escapeAttr(c.meets)}"></label>
        <label>Room<input type="text" data-course="${c.id}" data-field="room" value="${escapeAttr(c.room)}"></label>
        <label class="color-field">Color<input type="color" data-course="${c.id}" data-field="color" value="${c.color}"></label>
      </div>
    `;
    wrap.appendChild(card);
  });

  wrap.querySelectorAll("input[data-course]").forEach(inp => {
    inp.addEventListener("change", () => {
      const o = getCourseOverrides();
      o[inp.dataset.course] = { ...(o[inp.dataset.course] || {}), [inp.dataset.field]: inp.value };
      saveCourseOverrides(o);
      renderAll();
    });
  });
  wrap.querySelectorAll("[data-revert-course]").forEach(btn => {
    btn.addEventListener("click", () => {
      const o = getCourseOverrides();
      delete o[btn.dataset.revertCourse];
      saveCourseOverrides(o);
      renderAll();
    });
  });
}

function renderEditEvents() {
  const wrap = document.getElementById("edit-events");
  wrap.innerHTML = "";
  const overrides = getEventOverrides();
  const events = getWorkingEvents().slice().sort((a, b) => a.date.localeCompare(b.date));
  const courses = getEffectiveCourses();

  if (events.length === 0) {
    wrap.innerHTML = `<p class="muted">No events yet — add one below.</p>`;
    return;
  }

  events.forEach(e => {
    const course = courseById(e.course);
    const isBase = e.id && e.id.startsWith("b");
    const isEdited = isBase && overrides[e.id];
    const row = document.createElement("div");
    row.className = "edit-event-row";
    row.innerHTML = `
      <span class="dot" style="background:${course ? course.color : "#999"}"></span>
      <select data-id="${e.id}" data-field="course">
        ${courses.map(c => `<option value="${c.id}" ${c.id === e.course ? "selected" : ""}>${c.code}</option>`).join("")}
      </select>
      <input type="date" data-id="${e.id}" data-field="date" value="${e.date}">
      <select data-id="${e.id}" data-field="type">
        <option value="assignment" ${e.type === "assignment" ? "selected" : ""}>Assignment</option>
        <option value="exam" ${e.type === "exam" ? "selected" : ""}>Exam</option>
        <option value="reading" ${e.type === "reading" ? "selected" : ""}>Reading</option>
        <option value="note" ${e.type === "note" ? "selected" : ""}>Note</option>
      </select>
      <input type="text" data-id="${e.id}" data-field="title" value="${escapeAttr(e.title)}" placeholder="Title">
      <input type="text" data-id="${e.id}" data-field="detail" value="${escapeAttr(e.detail || "")}" placeholder="Detail">
      <span class="edit-event-actions">
        ${isEdited ? `<button type="button" class="link-btn" data-revert-event="${e.id}">reset</button>` : ""}
        <button type="button" class="link-btn danger" data-delete-event="${e.id}">delete</button>
      </span>
    `;
    wrap.appendChild(row);
  });

  wrap.querySelectorAll("[data-id]").forEach(inp => {
    inp.addEventListener("change", () => updateEvent(inp.dataset.id, inp.dataset.field, inp.value));
  });
  wrap.querySelectorAll("[data-revert-event]").forEach(btn => {
    btn.addEventListener("click", () => {
      const o = getEventOverrides();
      delete o[btn.dataset.revertEvent];
      saveEventOverrides(o);
      renderAll();
    });
  });
  wrap.querySelectorAll("[data-delete-event]").forEach(btn => {
    btn.addEventListener("click", () => deleteEvent(btn.dataset.deleteEvent));
  });
}

function updateEvent(id, field, value) {
  if (id.startsWith("b")) {
    const o = getEventOverrides();
    o[id] = { ...(o[id] || {}), [field]: value };
    saveEventOverrides(o);
  } else {
    const added = getAddedEvents();
    const idx = added.findIndex(a => a.id === id);
    if (idx > -1) {
      added[idx] = { ...added[idx], [field]: value };
      saveAddedEvents(added);
    }
  }
  renderAll();
}

function deleteEvent(id) {
  if (id.startsWith("b")) {
    const d = getDeletedEventIds();
    d.add(id);
    saveDeletedEventIds(d);
  } else {
    saveAddedEvents(getAddedEvents().filter(a => a.id !== id));
  }
  renderAll();
}

function populateNewEventCourseSelect() {
  const sel = document.getElementById("new-event-course");
  sel.innerHTML = getEffectiveCourses().map(c => `<option value="${c.id}">${c.code}</option>`).join("");
}

document.getElementById("add-event-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const course = document.getElementById("new-event-course").value;
  const date = document.getElementById("new-event-date").value;
  const type = document.getElementById("new-event-type").value;
  const title = document.getElementById("new-event-title").value.trim();
  const detail = document.getElementById("new-event-detail").value.trim();
  if (!title || !date) return;

  const added = getAddedEvents();
  added.push({ id: `c${Date.now().toString(36)}`, course, date, type, title, detail });
  saveAddedEvents(added);
  ev.target.reset();
  renderAll();
});

document.getElementById("btn-reset-edits").addEventListener("click", () => {
  if (!confirm("Reset all your edits, added events, and course changes back to the original syllabus data? This can't be undone.")) return;
  localStorage.removeItem(LS_EVENT_OVERRIDES_KEY);
  localStorage.removeItem(LS_EVENT_DELETED_KEY);
  localStorage.removeItem(LS_EVENT_ADDED_KEY);
  localStorage.removeItem(LS_COURSE_OVERRIDES_KEY);
  renderAll();
});

// ---------------------------------------------------------------
// Email reminders
// The site can't send email itself, so it pushes a snapshot (tasks +
// what's checked off) to a small Google Apps Script (see
// email-reminders/SETUP.md). That script emails a daily digest of
// anything due/overdue that isn't checked off. The URL + secret are
// stored only in this browser (localStorage), never in the repo.
// ---------------------------------------------------------------
const LS_REMINDER_CFG_KEY = "syllabusHub.reminderConfig";   // { url, secret }
const LS_REMINDER_LAST_KEY = "syllabusHub.reminderLastSent"; // last snapshot we pushed

function getReminderConfig() {
  try { return JSON.parse(localStorage.getItem(LS_REMINDER_CFG_KEY)) || {}; }
  catch { return {}; }
}

function buildReminderPayload() {
  const tasks = getWorkingEvents()
    .filter(e => PLANNER_TYPES.includes(e.type))
    .map(e => {
      const c = courseById(e.course);
      return {
        key: eventKey(e),
        title: e.title,
        detail: String(e.detail || "").slice(0, 160),
        date: e.date,
        course: c ? c.code : "",
        type: e.type,
      };
    });
  getCustomTasks().forEach(t => {
    tasks.push({ key: `custom__${t.id}`, title: t.title, detail: "", date: t.date, course: "Your task", type: "task" });
  });
  return { tasks, done: [...getDoneSet()] };
}

function setReminderStatus(msg, isError) {
  const el = document.getElementById("reminder-status");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("error", !!isError);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Read the script's status via JSONP (a <script> tag). Unlike fetch, this works
// from any website without CORS, and it's how we confirm the script really got
// what we sent. Rejects on network failure or if the reply isn't JSONP
// (wrong URL, deployment not set to "Anyone", or an old Code.gs).
function jsonpGet(baseUrl, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    const cb = "__binderCb" + Date.now().toString(36) + Math.floor(Math.random() * 1e6);
    const script = document.createElement("script");
    let timer;
    const cleanup = () => { clearTimeout(timer); delete window[cb]; script.remove(); };
    window[cb] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error("network")); };
    timer = setTimeout(() => { cleanup(); reject(new Error("timeout")); }, timeoutMs);
    script.src = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}callback=${cb}&_=${Date.now()}`;
    document.head.appendChild(script);
  });
}

const UNREACHABLE_HELP =
  "Couldn't reach your script. Check that (1) the URL is the Web app URL ending in /exec, " +
  "(2) the deployment's \"Who has access\" is set to Anyone, and (3) you pasted the newest Code.gs " +
  "and redeployed (Deploy → Manage deployments → pencil → New version).";

// Sends a request, then asks the script what it recorded.
// Returns { ok: boolean, message }. ok is only true if the script confirmed it.
async function sendToReminders(action) {
  const cfg = getReminderConfig();
  if (!cfg.url || !cfg.secret) return { ok: false, message: "Add your web app URL and secret first." };

  let before;
  try { before = await jsonpGet(cfg.url); }
  catch (err) { return { ok: false, message: UNREACHABLE_HELP }; }

  const body = JSON.stringify({ token: cfg.secret, action, ...buildReminderPayload() });
  try {
    // no-cors + plain-string body = a "simple" request the browser will always send
    // (we can't read the reply, which is why we confirm via jsonpGet below).
    await fetch(cfg.url, { method: "POST", mode: "no-cors", body });
  } catch (err) {
    return { ok: false, message: "Couldn't send — check your internet connection." };
  }

  for (let i = 0; i < 8; i++) {
    await sleep(i === 0 ? 400 : 900);
    let st;
    try { st = await jsonpGet(cfg.url); } catch (err) { continue; }
    if (st.seq > before.seq) { // the script processed our request
      const last = st.last || {};
      if (!last.ok) return { ok: false, message: last.message || "The script rejected the request." };
      let msg = last.message;
      if (action === "sync" && st.dailyTrigger === false) {
        msg += " ⚠ The daily 7am email isn't scheduled yet — run the setup function once in the script editor (SETUP.md step 4).";
      }
      return { ok: true, message: msg };
    }
  }
  return {
    ok: false,
    message: "Sent, but the script never recorded it. Most likely the SECRET/URL belongs to a different deployment, " +
      "or you haven't redeployed the newest Code.gs (Deploy → Manage deployments → New version).",
  };
}

let reminderSyncTimer = null;
let reminderSyncBusy = false;
let reminderFailures = 0;
const REMINDER_MAX_AUTO_RETRIES = 10;
const REMINDER_RETRY_MS = 45000;

function scheduleReminderSync() {
  const cfg = getReminderConfig();
  if (!cfg.url || !cfg.secret) return;
  clearTimeout(reminderSyncTimer);
  reminderSyncTimer = setTimeout(async () => {
    if (reminderSyncBusy) { scheduleReminderSync(); return; }
    const snapshot = JSON.stringify(buildReminderPayload());
    if (snapshot === localStorage.getItem(LS_REMINDER_LAST_KEY)) return; // already confirmed synced
    reminderSyncBusy = true;
    const result = await sendToReminders("sync");
    reminderSyncBusy = false;
    setReminderStatus((result.ok ? "✓ " : "✗ ") + result.message, !result.ok);
    if (result.ok) {
      // Only remember it as synced if the script confirmed it.
      localStorage.setItem(LS_REMINDER_LAST_KEY, snapshot);
      reminderFailures = 0;
    } else if (++reminderFailures <= REMINDER_MAX_AUTO_RETRIES) {
      // Keep trying quietly; a failure should never just sit there.
      reminderSyncTimer = setTimeout(scheduleReminderSync, REMINDER_RETRY_MS);
    }
  }, 1500);
}

// Retry when you come back to the tab or your connection returns.
document.addEventListener("visibilitychange", () => { if (!document.hidden) scheduleReminderSync(); });
window.addEventListener("online", scheduleReminderSync);

function initReminderSettings() {
  const urlEl = document.getElementById("reminder-url");
  const secretEl = document.getElementById("reminder-secret");
  const saveBtn = document.getElementById("btn-reminder-save");
  const testBtn = document.getElementById("btn-reminder-test");
  const cfg = getReminderConfig();
  urlEl.value = cfg.url || "";
  secretEl.value = cfg.secret || "";
  if (cfg.url) setReminderStatus("Settings saved on this browser. Changes sync automatically.");

  const setBusy = (busy) => { saveBtn.disabled = busy; testBtn.disabled = busy; };

  saveBtn.addEventListener("click", async () => {
    const url = urlEl.value.trim();
    const secret = secretEl.value.trim();
    if (!url || !secret) { setReminderStatus("Enter both the web app URL and the secret.", true); return; }
    localStorage.setItem(LS_REMINDER_CFG_KEY, JSON.stringify({ url, secret }));
    localStorage.removeItem(LS_REMINDER_LAST_KEY);
    reminderFailures = 0;
    setBusy(true);
    setReminderStatus("Saved. Syncing…");
    const result = await sendToReminders("sync");
    setBusy(false);
    if (result.ok) localStorage.setItem(LS_REMINDER_LAST_KEY, JSON.stringify(buildReminderPayload()));
    setReminderStatus((result.ok ? "✓ " : "✗ ") + result.message, !result.ok);
  });

  testBtn.addEventListener("click", async () => {
    const url = urlEl.value.trim();
    const secret = secretEl.value.trim();
    if (!url || !secret) { setReminderStatus("Enter both the web app URL and the secret.", true); return; }
    localStorage.setItem(LS_REMINDER_CFG_KEY, JSON.stringify({ url, secret }));
    setBusy(true);
    setReminderStatus("Sending test email…");
    const result = await sendToReminders("test");
    setBusy(false);
    setReminderStatus((result.ok ? "✓ " : "✗ ") + result.message, !result.ok);
  });

  document.getElementById("btn-reminder-off").addEventListener("click", () => {
    localStorage.removeItem(LS_REMINDER_CFG_KEY);
    localStorage.removeItem(LS_REMINDER_LAST_KEY);
    urlEl.value = "";
    secretEl.value = "";
    setReminderStatus("Turned off on this browser. (To stop the emails entirely, delete the trigger in your Apps Script project.)");
  });
}

// ---------------------------------------------------------------
// Init
// ---------------------------------------------------------------
function renderAll() {
  renderCourseTabs();
  renderCourseInfo();
  renderCountdown();
  renderActiveView();
  scheduleReminderSync();
}
initReminderSettings();
renderAll();
