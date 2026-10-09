/**
 * The Binder — email reminders
 *
 * What this does:
 *   1. The Binder website sends this script a snapshot of your tasks and which
 *      ones you've checked off (every time something changes).
 *   2. Every morning, this script emails you ONE digest listing everything that
 *      is due today or overdue and NOT checked off yet.
 *   3. Once you check something off on the site, it drops out of the emails.
 *
 * Setup steps are in SETUP.md (about 5 minutes, one time).
 */

// ----------------------------- SETTINGS --------------------------------
const EMAIL = 'dosadchuk@binghamton.edu';   // where the digest is sent
const SECRET = 'DanNerdy12!'; // must match the "Secret" you type into the site
const TIMEZONE = 'America/New_York';        // used to decide what "today" is
const SEND_HOUR = 7;                        // digest goes out around 7am (runs within that hour)
const INCLUDE_READINGS = false;             // true = also nag about unchecked readings (that's a LOT of email)
// -----------------------------------------------------------------------

const CHUNK_SIZE = 3000; // Script Properties values max out at ~9KB, so snapshots are stored in pieces

/** One-time: run this from the editor to create the daily 7am trigger. */
function setup() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'sendDailyDigest'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('sendDailyDigest')
    .timeBased()
    .atHour(SEND_HOUR)
    .everyDays(1)
    .inTimezone(TIMEZONE)
    .create();
}

/**
 * The website talks to this. The site sends the request "blind" (browsers won't
 * let it read the reply), so every outcome is recorded and the site reads it
 * back through doGet below to confirm what really happened.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  var action = '?';
  var out;
  try {
    lock.waitLock(10000);
    var body = JSON.parse(e.postData.contents);
    action = body.action || '?';

    if (body.token !== SECRET) {
      out = { ok: false, message: 'Wrong secret — the secret on the site must match SECRET in Code.gs exactly.' };
    } else if (action === 'sync' || action === 'test') {
      saveSnapshot_({
        tasks: body.tasks || [],
        done: body.done || [],
        savedAt: new Date().toISOString(),
      });
      if (action === 'sync') {
        out = { ok: true, message: 'Synced ' + (body.tasks || []).length + ' tasks (' + (body.done || []).length + ' checked off).' };
      } else {
        sendDigest_(true);
        out = { ok: true, message: 'Test email sent to ' + EMAIL + ' — check your inbox (and spam, the first time).' };
      }
    } else {
      out = { ok: false, message: 'Unknown action.' };
    }
  } catch (err) {
    out = { ok: false, message: 'Script error: ' + err };
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
  try { record_(action, out); } catch (ignore) {}
  return json_(out);
}

/**
 * Status check. With ?callback=name it answers as JSONP, which is how the site
 * reads it (works from any website, no CORS needed). Opening the web app URL
 * directly in a browser tab also shows this as plain JSON.
 */
function doGet(e) {
  var status = status_();
  var cb = e && e.parameter && e.parameter.callback;
  if (cb && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(cb)) {
    return ContentService
      .createTextOutput(cb + '(' + JSON.stringify(status) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_(status);
}

/** Runs on the daily trigger. */
function sendDailyDigest() {
  sendDigest_(false);
}

// ----------------------------- internals -------------------------------

function todayString_() {
  return Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
}

function pendingTasks_(snap, today) {
  var done = {};
  (snap.done || []).forEach(function (k) { done[k] = true; });
  var types = ['assignment', 'exam', 'task'];
  if (INCLUDE_READINGS) types.push('reading');

  return (snap.tasks || [])
    .filter(function (t) {
      return types.indexOf(t.type) !== -1 && t.date <= today && !done[t.key];
    })
    .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
}

function sendDigest_(isTest) {
  var snap = loadSnapshot_();
  var today = todayString_();

  if (!snap) {
    if (isTest) {
      MailApp.sendEmail({
        to: EMAIL,
        name: 'The Binder',
        subject: 'The Binder: test email',
        body: 'Reminders are connected, but the site has not synced any tasks yet. Open the site and hit "Save & sync".',
      });
    }
    return;
  }

  var pending = pendingTasks_(snap, today);
  var dueToday = pending.filter(function (t) { return t.date === today; });
  var overdue = pending.filter(function (t) { return t.date < today; });

  if (pending.length === 0 && !isTest) return; // nothing to nag about

  var subject;
  if (pending.length === 0) {
    subject = 'The Binder: test email — nothing due right now';
  } else {
    var parts = [];
    if (dueToday.length) parts.push(dueToday.length + ' due today');
    if (overdue.length) parts.push(overdue.length + ' overdue');
    subject = 'The Binder: ' + parts.join(', ') + (isTest ? ' (test)' : '');
  }

  var text = [];
  var html = [];
  html.push('<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222">');

  function section(label, items) {
    if (!items.length) return;
    text.push(label.toUpperCase());
    html.push('<h3 style="margin:16px 0 6px">' + esc_(label) + '</h3><ul style="padding-left:18px;margin:0">');
    items.forEach(function (t) {
      var line = (t.course ? t.course + ' — ' : '') + t.title + '  (' + t.date + ')';
      text.push(' • ' + line + (t.detail ? '\n     ' + t.detail : ''));
      html.push('<li style="margin-bottom:6px"><strong>' + esc_(t.course || '') + '</strong> — ' + esc_(t.title) +
        ' <span style="color:#777">(' + esc_(t.date) + ')</span>' +
        (t.detail ? '<br><span style="color:#666;font-size:12px">' + esc_(t.detail) + '</span>' : '') + '</li>');
    });
    html.push('</ul>');
    text.push('');
  }

  section('Due today', dueToday);
  section('Overdue — still not checked off', overdue);

  if (pending.length === 0) {
    text.push('Nothing is due or overdue right now. Reminders are working.');
    html.push('<p>Nothing is due or overdue right now. Reminders are working.</p>');
  } else {
    text.push('Check items off in The Binder to stop these emails.');
    html.push('<p style="color:#777;margin-top:18px">Check items off in The Binder to stop these emails.</p>');
  }
  html.push('</div>');

  MailApp.sendEmail({
    to: EMAIL,
    name: 'The Binder',
    subject: subject,
    body: text.join('\n'),
    htmlBody: html.join(''),
  });
}

function record_(action, out) {
  var props = PropertiesService.getScriptProperties();
  var seq = Number(props.getProperty('seq') || 0) + 1;
  props.setProperties({
    seq: String(seq),
    last_result: JSON.stringify({ seq: seq, at: new Date().toISOString(), action: action, ok: !!out.ok, message: out.message }),
  });
}

function status_() {
  var props = PropertiesService.getScriptProperties();
  var snap = loadSnapshot_();
  var last = null;
  try { last = JSON.parse(props.getProperty('last_result') || 'null'); } catch (err) {}
  var trigger = null;
  try {
    trigger = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'sendDailyDigest'; });
  } catch (err) {}
  return {
    ok: true,
    message: 'The Binder reminder service is running.',
    version: 2,
    seq: Number(props.getProperty('seq') || 0),
    savedAt: snap ? snap.savedAt : null,
    taskCount: snap ? snap.tasks.length : 0,
    doneCount: snap ? snap.done.length : 0,
    dailyTrigger: trigger,
    last: last,
  };
}

function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function saveSnapshot_(snap) {
  var props = PropertiesService.getScriptProperties();
  var str = JSON.stringify(snap);
  var oldCount = Number(props.getProperty('snap_n') || 0);
  var count = Math.ceil(str.length / CHUNK_SIZE);

  var batch = { snap_n: String(count) };
  for (var i = 0; i < count; i++) {
    batch['snap_' + i] = str.substr(i * CHUNK_SIZE, CHUNK_SIZE);
  }
  props.setProperties(batch);
  for (var j = count; j < oldCount; j++) props.deleteProperty('snap_' + j);
}

function loadSnapshot_() {
  var props = PropertiesService.getScriptProperties();
  var count = Number(props.getProperty('snap_n') || 0);
  if (!count) return null;
  var str = '';
  for (var i = 0; i < count; i++) str += props.getProperty('snap_' + i) || '';
  try { return JSON.parse(str); } catch (err) { return null; }
}
