// ---------------------------------------------------------------
// Grades — weighted course grades + semester / cumulative GPA.
//
// Schemes (weights, letter cutoffs) live in data.js (GRADING).
// Everything you enter (scores, exclusions, edited weights, ...) lives in
// localStorage under "syllabusHub.grades" — nothing is sent anywhere.
//
// How a course grade is worked out:
//   * A component's score is the average of its counted, graded items
//     (e.g. the pen pal letters). Single-item components are just that item.
//   * "Current grade" = weighted average of the components you have grades
//     for, re-scaled so ungraded work doesn't count as zero.
//   * Unchecking an item removes it (and, if it was a component's only
//     item, the component's weight) and the rest is re-scaled to 100%.
// ---------------------------------------------------------------
const LS_GRADES_KEY = "syllabusHub.grades";
const gradeUi = { expanded: new Set() };

// ---------- storage ----------
function getGradeState() {
  try { return JSON.parse(localStorage.getItem(LS_GRADES_KEY)) || {}; }
  catch { return {}; }
}
function saveGradeState(gs) {
  localStorage.setItem(LS_GRADES_KEY, JSON.stringify(gs));
}

// ---------- small helpers ----------
const isNum = (v) => typeof v === "number" && isFinite(v);
function toNum(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}
const numOr = (v, d) => (isNum(v) ? v : d);
const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const EPS = 1e-9;

function fmtNum(x, digits = 2) {
  return String(parseFloat(Number(x).toFixed(digits)));
}
function fmtPct(x) { return fmtNum(x, 2) + "%"; }

// ---------- scheme access ----------
function gradeItems(courseId, comp, gs) {
  const base = comp.items.map(it => ({ ...it, key: `${courseId}.${comp.id}.${it.id}`, custom: false }));
  const extra = (gs.custom || [])
    .filter(c => c.course === courseId && c.comp === comp.id)
    .map(c => ({ id: c.id, label: c.label, key: `${courseId}.${comp.id}.${c.id}`, custom: true }));
  return base.concat(extra);
}

function scaleFor(courseId, gs) {
  const ov = (gs.scales || {})[courseId] || {};
  return GRADING[courseId].scale
    .map(([l, m]) => [l, numOr(ov[l], m)])
    .sort((a, b) => b[1] - a[1]);
}

function letterFor(courseId, pct, gs) {
  if (!isNum(pct)) return null;
  const sc = scaleFor(courseId, gs);
  for (const [l, min] of sc) if (pct + EPS >= min) return l;
  return sc[sc.length - 1][0];
}

function pointsFor(letter, gs) {
  const ov = (gs.points || {})[letter];
  return isNum(ov) ? ov : (GRADE_POINTS[letter] ?? 0);
}

// ---------- course grade ----------
function computeCourse(courseId, gs) {
  const g = GRADING[courseId];
  const comps = g.components.map(comp => {
    const weight = numOr((gs.weights || {})[`${courseId}.${comp.id}`], comp.weight);
    const items = gradeItems(courseId, comp, gs).map(it => {
      const st = (gs.items || {})[it.key] || {};
      const p = isNum(st.p) && st.p > 0 ? st.p : 100;
      const e = isNum(st.e) ? st.e : null;
      return { ...it, e, p, off: !!st.off, pct: e === null ? null : (e / p) * 100 };
    });
    const counted = items.filter(i => !i.off);
    const graded = counted.filter(i => i.pct !== null);
    return {
      id: comp.id, name: comp.name, note: comp.note, weight, items,
      counted: counted.length > 0 && weight > 0,
      pct: graded.length ? sum(graded.map(i => i.pct)) / graded.length : null,
      gradedCount: graded.length,
      countedCount: counted.length,
    };
  });

  const active = comps.filter(c => c.counted);
  const W = sum(active.map(c => c.weight));                       // weight that counts
  const gradedComps = active.filter(c => c.pct !== null);
  const G = sum(gradedComps.map(c => c.weight));                  // weight that has a grade
  const E = sum(gradedComps.map(c => (c.weight * c.pct) / 100));  // earned, in course-% points

  let bonus = 0, bonusState = null;
  if (g.bonus) {
    const st = (gs.items || {})[`${courseId}.bonus`] || {};
    bonusState = { e: isNum(st.e) ? st.e : null, off: !!st.off, max: g.bonus.max };
    if (!bonusState.off && bonusState.e !== null) bonus = bonusState.e;
  }

  const hasGrades = G > 0;
  return {
    comps, W, G, E, bonus, bonusState, hasGrades,
    remaining: Math.max(0, W - G),
    current: hasGrades ? (E / G) * 100 + bonus : null,        // grade on work graded so far
    worst: hasGrades ? (E / W) * 100 + bonus : null,          // everything left scores 0%
    best: hasGrades ? ((E + (W - G)) / W) * 100 + bonus : null, // everything left scores 100%
  };
}

// What average do I need on the remaining work to reach `targetPct`?
function neededAverage(res, targetPct) {
  if (!res.hasGrades || res.W <= 0) return { kind: "none" };
  if (res.remaining <= EPS) return { kind: "done" };
  const need = (((targetPct - res.bonus) * res.W) / 100 - res.E) / res.remaining * 100;
  if (need <= 0) return { kind: "secured" };
  if (need > 100 + EPS) return { kind: "unreachable", value: need };
  return { kind: "need", value: need, remaining: (res.remaining / res.W) * 100 };
}

// ---------- GPA ----------
function computeGPA(gs) {
  const rows = COURSES.map(c => {
    const res = computeCourse(c.id, gs);
    return {
      id: c.id, res,
      credits: numOr((gs.credits || {})[c.id], GRADING[c.id].credits),
      counts: !(gs.gpaOff || {})[c.id],
      letter: letterFor(c.id, res.current, gs),
      low: letterFor(c.id, res.worst, gs),
      high: letterFor(c.id, res.best, gs),
    };
  });
  const used = rows.filter(r => r.counts && r.letter && r.credits > 0);
  const credits = sum(used.map(r => r.credits));
  const gpaOf = (key) => credits ? sum(used.map(r => pointsFor(r[key], gs) * r.credits)) / credits : null;
  const sem = gpaOf("letter"), low = gpaOf("low"), high = gpaOf("high");

  const pg = toNum((gs.prev || {}).gpa), pc = toNum((gs.prev || {}).credits);
  const havePrev = pg !== null && pc !== null && pc >= 0;
  const cum = (v) => (v !== null && havePrev && pc + credits > 0) ? (pg * pc + v * credits) / (pc + credits) : null;

  return {
    rows, used, credits, sem, low, high,
    cum: cum(sem), cumLow: cum(low), cumHigh: cum(high),
    skippedNoGrades: rows.filter(r => r.counts && !r.letter).length,
    excluded: rows.filter(r => !r.counts).length,
  };
}

// ---------- state mutation helpers ----------
function setItemField(gs, key, field, val) {
  gs.items = gs.items || {};
  const st = { ...(gs.items[key] || {}) };
  if (val === null || val === undefined || val === false) delete st[field]; else st[field] = val;
  if (Object.keys(st).length === 0) delete gs.items[key]; else gs.items[key] = st;
}
function setMapField(gs, map, k1, k2, val) {
  gs[map] = gs[map] || {};
  if (k2 === undefined) {
    if (val === null) delete gs[map][k1]; else gs[map][k1] = val;
  } else {
    gs[map][k1] = { ...(gs[map][k1] || {}) };
    if (val === null) delete gs[map][k1][k2]; else gs[map][k1][k2] = val;
    if (Object.keys(gs[map][k1]).length === 0) delete gs[map][k1];
  }
  if (Object.keys(gs[map]).length === 0) delete gs[map];
}

// ---------- due-date lookup (display only) ----------
function gradeItemDate(courseId, it) {
  if (it.date) return { text: formatDate(it.date), tba: false };
  if (!it.match) return null;
  const ev = getWorkingEvents()
    .filter(e => e.course === courseId && e.title.startsWith(it.match))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!ev) return null;
  return { text: /TBA/i.test(ev.title) ? "date TBA" : formatDate(ev.date), tba: /TBA/i.test(ev.title) };
}

// ---------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------
function itemRowHTML(courseId, comp, it, weightCell) {
  const gs = getGradeState();
  const st = (gs.items || {})[it.key] || {};
  const d = gradeItemDate(courseId, it);
  return `
    <div class="g-row ${st.off ? "g-off" : ""}" data-row="${it.key}">
      <label class="g-count" title="Counts toward the course grade (uncheck to leave it out)">
        <input type="checkbox" data-act="toggle" data-key="${it.key}" ${st.off ? "" : "checked"}>
      </label>
      <div class="g-name">${escapeAttr(it.label)}${d ? ` <span class="g-date${d.tba ? " tba" : ""}">${escapeAttr(d.text)}</span>` : ""}${it.custom ? ` <button type="button" class="link-btn danger" data-act="del-custom" data-course="${courseId}" data-comp="${comp.id}" data-id="${it.id}">remove</button>` : ""}</div>
      <div class="g-weight">${weightCell || ""}</div>
      <div class="g-score">
        <input type="number" step="any" inputmode="decimal" placeholder="score" aria-label="Score for ${escapeAttr(it.label)}" data-act="earned" data-key="${it.key}" value="${isNum(st.e) ? st.e : ""}">
        <span>/</span>
        <input type="number" step="any" min="0" inputmode="decimal" aria-label="Points possible for ${escapeAttr(it.label)}" data-act="possible" data-key="${it.key}" value="${isNum(st.p) ? st.p : 100}">
      </div>
      <div class="g-pct" data-bind="item-pct" data-key="${it.key}">—</div>
    </div>`;
}

function weightInputHTML(courseId, comp, gs) {
  const wkey = `${courseId}.${comp.id}`;
  return `<label class="g-w"><input type="number" step="any" min="0" inputmode="decimal" aria-label="Weight of ${escapeAttr(comp.name)}" data-act="weight" data-wkey="${wkey}" value="${numOr((gs.weights || {})[wkey], comp.weight)}"><span>%</span></label>`;
}

function componentHTML(courseId, comp, gs) {
  const items = gradeItems(courseId, comp, gs);
  const wcell = weightInputHTML(courseId, comp, gs);
  const note = comp.note ? `<div class="g-note">${escapeAttr(comp.note)}</div>` : "";
  if (items.length === 1) {
    return `<div class="g-comp">${itemRowHTML(courseId, comp, items[0], wcell)}${note}</div>`;
  }
  const gkey = `${courseId}.${comp.id}`;
  const open = gradeUi.expanded.has(gkey);
  return `
    <div class="g-comp g-group">
      <div class="g-row g-head">
        <button type="button" class="g-expand" data-act="expand" data-gkey="${gkey}" aria-expanded="${open}">${open ? "▾" : "▸"}</button>
        <div class="g-name"><strong>${escapeAttr(comp.name)}</strong> <span class="g-date">${items.length} items</span></div>
        <div class="g-weight">${wcell}</div>
        <div class="g-comp-sum" data-bind="comp-sum" data-comp="${gkey}">—</div>
        <div class="g-pct" data-bind="comp-pct" data-comp="${gkey}">—</div>
      </div>
      ${note}
      <div class="g-children" data-gkey="${gkey}" ${open ? "" : "hidden"}>
        ${items.map(it => itemRowHTML(courseId, comp, it, "")).join("")}
      </div>
    </div>`;
}

function gradeCourseHTML(c, gs) {
  const g = GRADING[c.id];
  if (!g) return "";
  const target = (gs.targets || {})[c.id] || "A";
  const credits = numOr((gs.credits || {})[c.id], g.credits);
  const letters = g.scale.map(([l]) => l);
  const sc = scaleFor(c.id, gs);
  const bonusRow = g.bonus ? (() => {
    const st = (gs.items || {})[`${c.id}.bonus`] || {};
    return `
      <div class="g-comp"><div class="g-row g-bonus ${st.off ? "g-off" : ""}">
        <label class="g-count"><input type="checkbox" data-act="toggle" data-key="${c.id}.bonus" ${st.off ? "" : "checked"}></label>
        <div class="g-name">${escapeAttr(g.bonus.label)} <span class="g-date">0–${g.bonus.max} pts, added to final</span></div>
        <div class="g-weight"></div>
        <div class="g-score"><input type="number" step="any" min="0" max="${g.bonus.max}" inputmode="decimal" placeholder="pts" aria-label="${escapeAttr(g.bonus.label)}" data-act="earned" data-key="${c.id}.bonus" value="${isNum(st.e) ? st.e : ""}"></div>
        <div class="g-pct"></div>
      </div><div class="g-note">${escapeAttr(g.bonus.note)}</div></div>`;
  })() : "";

  return `
  <section class="g-course" data-course="${c.id}" style="border-left-color:${c.color}">
    <div class="g-course-head">
      <div><strong style="color:${c.color}">${escapeAttr(c.code)}</strong> — ${escapeAttr(c.name)}</div>
      <div class="g-result"><span class="g-big" data-bind="course-pct">—</span><span class="g-letter" data-bind="course-letter"></span></div>
    </div>
    <div class="g-sub" data-bind="course-sub">No grades entered yet.</div>
    <div class="g-sub warn" data-bind="course-weights" hidden></div>

    <div class="g-opts">
      <label class="g-inline"><input type="checkbox" data-act="gpa" data-course="${c.id}" ${(gs.gpaOff || {})[c.id] ? "" : "checked"}> Counts toward GPA</label>
      <label class="g-inline">Credits <input type="number" step="any" min="0" class="g-credits" data-act="credits" data-course="${c.id}" value="${credits}"></label>
      ${g.creditsNote ? `<span class="g-hint">${escapeAttr(g.creditsNote)}</span>` : ""}
    </div>

    <div class="g-table-head"><span></span><span>Item</span><span>Weight</span><span>Score</span><span>%</span></div>
    ${g.components.map(comp => componentHTML(c.id, comp, gs)).join("")}
    ${bonusRow}

    <div class="g-need">
      <span>What do I need for</span>
      <select data-act="target" data-course="${c.id}">${letters.map(l => `<option ${l === target ? "selected" : ""}>${l}</option>`).join("")}</select>
      <span data-bind="need">—</span>
    </div>

    <form class="g-add" data-course="${c.id}">
      <select name="comp" aria-label="Add to">${g.components.map(comp => `<option value="${comp.id}">${escapeAttr(comp.name)}</option>`).join("")}</select>
      <input type="text" name="label" placeholder="Add another graded item (e.g. extra credit)" required>
      <button type="submit" class="btn btn-ghost btn-small">Add item</button>
    </form>

    <div class="g-foot">
      <details class="g-scale">
        <summary>Letter cutoffs (edit)</summary>
        <div class="g-hint">${escapeAttr(g.scaleNote || "")}</div>
        <div class="g-scale-grid">
          ${sc.map(([l, min]) => `<label>${l}<input type="number" step="any" data-act="scale-min" data-course="${c.id}" data-letter="${l}" value="${min}"><span>%+</span></label>`).join("")}
        </div>
        <button type="button" class="link-btn" data-act="reset-scale" data-course="${c.id}">reset cutoffs</button>
      </details>
      <button type="button" class="link-btn danger" data-act="reset-course" data-course="${c.id}">clear all scores for this course</button>
    </div>
  </section>`;
}

function gradesSummaryHTML(gs) {
  const prev = gs.prev || {};
  const letters = Object.keys(GRADE_POINTS);
  return `
  <section class="g-summary">
    <div class="g-summary-top">
      <div><div class="g-stat-label">Semester GPA</div><div class="g-stat-value" data-bind="gpa-sem">—</div><div class="g-stat-sub" data-bind="gpa-range"></div></div>
      <div><div class="g-stat-label">Credits counted</div><div class="g-stat-value small" data-bind="gpa-credits">0</div></div>
      <div><div class="g-stat-label">Cumulative GPA</div><div class="g-stat-value" data-bind="gpa-cum">—</div><div class="g-stat-sub" data-bind="gpa-cum-range"></div></div>
    </div>
    <div class="g-stat-sub" data-bind="gpa-note"></div>
    <div class="g-prev">
      <span>Optional — your GPA before this semester:</span>
      <label class="g-inline">GPA <input type="number" step="any" min="0" max="4.333" data-act="prev-gpa" value="${isNum(prev.gpa) ? prev.gpa : ""}"></label>
      <label class="g-inline">Credits <input type="number" step="any" min="0" data-act="prev-credits" value="${isNum(prev.credits) ? prev.credits : ""}"></label>
    </div>
    <details class="g-scale">
      <summary>Grade points per letter (edit)</summary>
      <div class="g-hint">Binghamton's 4.0 scale with +/- grades. The D- value isn't on the published list, so it's a placeholder.</div>
      <div class="g-scale-grid">
        ${letters.map(l => `<label>${l}<input type="number" step="any" data-act="points" data-letter="${l}" value="${pointsFor(l, gs)}"></label>`).join("")}
      </div>
      <button type="button" class="link-btn" data-act="reset-points">reset points</button>
    </details>
    <div class="g-stat-sub">GPA uses the grade you have <em>so far</em> in each course. Untick "Counts toward GPA" on a course for pass/fail or audit.</div>
  </section>`;
}

function renderGrades() {
  const root = document.getElementById("grades-root");
  if (!root) return;
  const gs = getGradeState();
  const courses = getEffectiveCourses().filter(c => state.activeCourses.has(c.id));
  root.innerHTML = gradesSummaryHTML(gs) + courses.map(c => gradeCourseHTML(c, gs)).join("");
  updateGradeOutputs();
}

// Updates every computed number in place (no DOM rebuild, so typing keeps focus).
function updateGradeOutputs() {
  const root = document.getElementById("grades-root");
  if (!root) return;
  const gs = getGradeState();
  const setText = (scope, bind, text, extra) => {
    scope.querySelectorAll(`[data-bind="${bind}"]${extra || ""}`).forEach(el => { el.textContent = text; });
  };

  COURSES.forEach(c => {
    const card = root.querySelector(`.g-course[data-course="${c.id}"]`);
    if (!card) return;
    const res = computeCourse(c.id, gs);
    const letter = letterFor(c.id, res.current, gs);

    res.comps.forEach(comp => {
      comp.items.forEach(it => {
        setText(card, "item-pct", it.pct === null ? "—" : fmtPct(it.pct), `[data-key="${it.key}"]`);
      });
      const gkey = `${c.id}.${comp.id}`;
      setText(card, "comp-pct", comp.pct === null ? "—" : fmtPct(comp.pct), `[data-comp="${gkey}"]`);
      setText(card, "comp-sum", comp.gradedCount ? `avg of ${comp.gradedCount} of ${comp.countedCount} counted` : "no grades yet", `[data-comp="${gkey}"]`);
    });

    setText(card, "course-pct", res.current === null ? "—" : fmtPct(res.current));
    setText(card, "course-letter", letter || "");

    let sub;
    if (res.current === null) {
      sub = res.W > 0 ? "No grades entered yet." : "Nothing is set to count toward this course.";
    } else if (res.remaining <= EPS) {
      sub = "All counted work is graded — this is your final grade.";
    } else {
      sub = `Graded work is ${fmtNum((res.G / res.W) * 100, 1)}% of the course. If the rest scores 0%–100%, you'd finish between ` +
        `${fmtPct(res.worst)} (${letterFor(c.id, res.worst, gs)}) and ${fmtPct(res.best)} (${letterFor(c.id, res.best, gs)}).`;
    }
    setText(card, "course-sub", sub);

    const wEl = card.querySelector('[data-bind="course-weights"]');
    const off = Math.abs(res.W - 100) > 0.005;
    wEl.hidden = !off || res.W <= 0;
    wEl.textContent = `Counted weights add up to ${fmtNum(res.W, 2)}% — the grade is scaled to 100%.`;

    const target = (gs.targets || {})[c.id] || "A";
    const tMin = scaleFor(c.id, gs).find(([l]) => l === target);
    const n = tMin ? neededAverage(res, tMin[1]) : { kind: "none" };
    const needText = {
      none: "Enter at least one grade to see this.",
      done: "Everything counted is already graded.",
      secured: `${target} is already secured, even with 0% on the rest.`,
      unreachable: `needs ${fmtPct(n.value || 0)} on the rest — out of reach without extra credit.`,
      need: `→ you need an average of ${n.value === undefined ? "" : fmtPct(n.value)} on the remaining ${n.remaining === undefined ? "" : fmtNum(n.remaining, 1)}% of the grade.`,
    }[n.kind];
    setText(card, "need", needText);
  });

  // GPA summary
  const gpa = computeGPA(gs);
  const f2 = (x) => (x === null ? "—" : x.toFixed(2));
  setText(root, "gpa-sem", f2(gpa.sem));
  setText(root, "gpa-range", gpa.sem === null ? "" : `range if the rest scores 0–100%: ${f2(gpa.low)} – ${f2(gpa.high)}`);
  setText(root, "gpa-credits", fmtNum(gpa.credits, 2));
  setText(root, "gpa-cum", f2(gpa.cum));
  setText(root, "gpa-cum-range", gpa.cum === null ? "" : `${f2(gpa.cumLow)} – ${f2(gpa.cumHigh)}`);
  const notes = [];
  if (gpa.excluded) notes.push(`${gpa.excluded} course${gpa.excluded === 1 ? "" : "s"} not counted toward GPA`);
  if (gpa.skippedNoGrades) notes.push(`${gpa.skippedNoGrades} course${gpa.skippedNoGrades === 1 ? "" : "s"} skipped (no grades entered yet)`);
  setText(root, "gpa-note", notes.join(" · "));
}

// ---------------------------------------------------------------
// Events (delegated; attached once)
// ---------------------------------------------------------------
function initGradeEvents() {
  const root = document.getElementById("grades-root");
  if (!root) return;

  root.addEventListener("input", (e) => {
    const t = e.target, act = t.dataset && t.dataset.act;
    if (!act) return;
    const gs = getGradeState();
    const v = toNum(t.value);
    switch (act) {
      case "earned": setItemField(gs, t.dataset.key, "e", v); break;
      case "possible": setItemField(gs, t.dataset.key, "p", v !== null && v > 0 ? v : null); break;
      case "weight": setMapField(gs, "weights", t.dataset.wkey, undefined, v !== null && v >= 0 ? v : null); break;
      case "credits": setMapField(gs, "credits", t.dataset.course, undefined, v !== null && v >= 0 ? v : null); break;
      case "scale-min": setMapField(gs, "scales", t.dataset.course, t.dataset.letter, v); break;
      case "points": setMapField(gs, "points", t.dataset.letter, undefined, v); break;
      case "prev-gpa": setMapField(gs, "prev", "gpa", undefined, v); break;
      case "prev-credits": setMapField(gs, "prev", "credits", undefined, v); break;
      default: return; // checkboxes / selects are handled on "change"
    }
    saveGradeState(gs);
    updateGradeOutputs();
  });

  root.addEventListener("change", (e) => {
    const t = e.target, act = t.dataset && t.dataset.act;
    if (!act) return;
    const gs = getGradeState();
    if (act === "toggle") {
      setItemField(gs, t.dataset.key, "off", t.checked ? null : true);
      saveGradeState(gs); renderGrades();
    } else if (act === "gpa") {
      setMapField(gs, "gpaOff", t.dataset.course, undefined, t.checked ? null : true);
      saveGradeState(gs); renderGrades();
    } else if (act === "target") {
      setMapField(gs, "targets", t.dataset.course, undefined, t.value);
      saveGradeState(gs); updateGradeOutputs();
    }
  });

  root.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const act = t.dataset.act;
    const gs = getGradeState();
    if (act === "expand") {
      const gkey = t.dataset.gkey;
      const panel = root.querySelector(`.g-children[data-gkey="${gkey}"]`);
      const open = panel.hidden;
      panel.hidden = !open;
      t.textContent = open ? "▾" : "▸";
      t.setAttribute("aria-expanded", String(open));
      if (open) gradeUi.expanded.add(gkey); else gradeUi.expanded.delete(gkey);
    } else if (act === "del-custom") {
      gs.custom = (gs.custom || []).filter(c => !(c.course === t.dataset.course && c.comp === t.dataset.comp && c.id === t.dataset.id));
      if (!gs.custom.length) delete gs.custom;
      setItemField(gs, `${t.dataset.course}.${t.dataset.comp}.${t.dataset.id}`, "e", null);
      if (gs.items) delete gs.items[`${t.dataset.course}.${t.dataset.comp}.${t.dataset.id}`];
      saveGradeState(gs); renderGrades();
    } else if (act === "reset-course") {
      if (!confirm("Clear every score and exclusion you've entered for this course?")) return;
      const prefix = t.dataset.course + ".";
      Object.keys(gs.items || {}).forEach(k => { if (k.startsWith(prefix)) delete gs.items[k]; });
      saveGradeState(gs); renderGrades();
    } else if (act === "reset-scale") {
      setMapField(gs, "scales", t.dataset.course, undefined, null);
      saveGradeState(gs); renderGrades();
      const d = root.querySelector(`.g-course[data-course="${t.dataset.course}"] .g-scale`); if (d) d.open = true;
    } else if (act === "reset-points") {
      delete gs.points; saveGradeState(gs); renderGrades();
    }
  });

  root.addEventListener("submit", (e) => {
    const form = e.target.closest("form.g-add");
    if (!form) return;
    e.preventDefault();
    const label = form.elements.label.value.trim();
    if (!label) return;
    const gs = getGradeState();
    const comp = form.elements.comp.value;
    gs.custom = gs.custom || [];
    gs.custom.push({ id: "x" + Date.now().toString(36) + Math.floor(Math.random() * 1000), course: form.dataset.course, comp, label });
    gradeUi.expanded.add(`${form.dataset.course}.${comp}`);
    saveGradeState(gs); renderGrades();
  });
}
initGradeEvents();
