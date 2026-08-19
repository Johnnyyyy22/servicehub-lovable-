const SS = SpreadsheetApp.getActiveSpreadsheet();
const DISPATCH = "Daily Dispatch";
const NOTIFY_LIST = "Notification List";
const TRANSFER_DEST = ["Running Good/Done", "Not/Running with Parts"];
const TZ = Session.getScriptTimeZone();

const HEADER = [
  "Date of Service",    // A
  "Engineer ID",        // B
  "EE Name",             // C
  "Area",                // D
  "Account",              // E
  "Machine Model",        // F
  "Purpose",              // G
  "Remarks",              // H
  "STATUS",               // I
  "LOG IN",               // J
  "LOG OUT",              // K
  "TIME SPENT",           // L
  "LOCATION",             // M
];

// =====================================================================
//  Anti-spoofing: plausibility check for logout coordinates.
//  Rough bounding box covering the Philippine archipelago. Adjust if
//  engineers legitimately work outside this range.
// =====================================================================
const PH_BOUNDS = {
  minLat: 4.5,
  maxLat: 21.5,
  minLng: 116.0,
  maxLng: 127.0,
};

function parseLocationParam_(raw) {
  if (!raw) return null;
  const parts = String(raw).split(",").map(function (s) {
    return parseFloat(s.trim());
  });
  if (parts.length !== 2) return null;
  const lat = parts[0];
  const lng = parts[1];
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat: lat, lng: lng };
}

function isPlausiblePhilippinesLocation_(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (isNaN(lat) || isNaN(lng)) return false;
  if (lat < PH_BOUNDS.minLat || lat > PH_BOUNDS.maxLat) return false;
  if (lng < PH_BOUNDS.minLng || lng > PH_BOUNDS.maxLng) return false;
  return true;
}

// =====================================================================
//  keepWarm  —  triggered every 10 minutes by Apps Script time trigger.
// =====================================================================
function keepWarm() {
  // Just touch the spreadsheet so the script runtime stays alive.
  SS.getName();
}

// =====================================================================
//                       Sheet helpers
// =====================================================================
function findSheet_(name) {
  name = String(name || "").trim();
  if (!name) return null;
  let sh = SS.getSheetByName(name);
  if (sh) return sh;
  const lower = name.toLowerCase();
  for (const s of SS.getSheets()) {
    if (String(s.getName()).trim().toLowerCase() === lower) return s;
  }
  return null;
}

// =====================================================================
//  formatDataRange_
//  Applies number formats to DATA ROWS ONLY (row 2 downward).
// =====================================================================
function formatDataRange_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return;
  sh.getRange(2, 1, last - 1, 1).setNumberFormat("MM/dd/yyyy");
  sh.getRange(2, 10, last - 1, 2).setNumberFormat("h:mm:ss AM/PM");
  sh.getRange(2, 12, last - 1, 1).setNumberFormat("@");
  sh.getRange(2, 13, last - 1, 1).setNumberFormat("@"); // LOCATION column
}

// =====================================================================
//  normalizeHeaders_  —  MANUAL USE ONLY via setupTabs().
// =====================================================================
function normalizeHeaders_(sh) {
  const name = sh.getName();
  if (name !== DISPATCH && TRANSFER_DEST.indexOf(name) === -1) return;

  const lastColNow = Math.max(1, sh.getLastColumn());
  const lastRow = sh.getLastRow();
  const current = sh.getRange(1, 1, 1, lastColNow).getValues()[0]
                     .map(v => String(v || "").trim());

  let ordered = current.length >= HEADER.length;
  if (ordered) {
    for (let i = 0; i < HEADER.length; i++) {
      if (current[i] !== HEADER[i]) { ordered = false; break; }
    }
  }
  if (ordered) {
    if (lastRow >= 2) formatDataRange_(sh);
    return;
  }

  const allRows = (lastRow >= 2 && lastColNow > 0)
    ? sh.getRange(2, 1, lastRow - 1, lastColNow).getValues()
    : [];

  const projected = allRows.map(row => HEADER.map(h => {
    const idx = current.indexOf(h);
    return idx === -1 ? "" : row[idx];
  }));

  sh.clear();
  sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER]);
  if (projected.length > 0) {
    sh.getRange(2, 1, projected.length, HEADER.length).setValues(projected);
  }
  formatDataRange_(sh);
}

// =====================================================================
//  doGet  —  READ-ONLY. Never writes to any sheet.
// =====================================================================
function doGet(e) {
  // ---- warm-up ping ----
  if (e.parameter.ping === "1") {
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  let sh = findSheet_(e.parameter.sheet) || findSheet_(DISPATCH);
  if (!sh) return ContentService.createTextOutput(JSON.stringify([]))
                  .setMimeType(ContentService.MimeType.JSON);

  const last = sh.getLastRow();
  if (last < 2) {
    return ContentService.createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const body = sh.getRange(2, 1, last - 1, HEADER.length).getValues();

  if (e.parameter.shape === "obj") {
    const idxFor = (label) => HEADER.indexOf(label);
    const out = body.map(row => {
      const o = {};
      HEADER.forEach((h, i) => {
        const v = row[i];
        o[h] = (v instanceof Date) ? v.toISOString() : v;
      });
      o.engineerId    = row[idxFor("Engineer ID")]   || "";
      o.engineerName  = row[idxFor("EE Name")]       || "";
      o.area          = row[idxFor("Area")]          || "";
      o.account       = row[idxFor("Account")]       || "";
      o.machineModel  = row[idxFor("Machine Model")] || "";
      o.purpose       = row[idxFor("Purpose")]       || "";
      o.remarks       = row[idxFor("Remarks")]       || "";
      o.status        = row[idxFor("STATUS")]        || "";
      o.login         = row[idxFor("LOG IN")]        || "";
      o.logout        = row[idxFor("LOG OUT")]       || "";
      o.timeSpent     = row[idxFor("TIME SPENT")]    || "";
      o.location      = row[idxFor("LOCATION")]      || "";
      o.dateOfService = row[idxFor("Date of Service")]|| "";
      return o;
    });
    return ContentService.createTextOutput(JSON.stringify(out))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

// =====================================================================
//                       Recipients
// =====================================================================
function getRecipients_(jobAccount, action) {
  const sheet = findSheet_(NOTIFY_LIST);
  if (!sheet) return [];
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const rows = sheet.getRange(2, 1, last - 1, 3).getValues();
  const out = [];
  rows.forEach(r => {
    const email = String(r[0] || "").trim();
    const role  = String(r[1] || "ADMIN").trim().toUpperCase();
    const scope = String(r[2] || "ALL_ACCOUNTS").trim().toUpperCase();
    if (!email || email.indexOf("@") === -1) return;
    if (scope === "ALL_ACCOUNTS") { out.push(email); return; }
    const allowed = scope.split(",").map(s => s.trim()).filter(Boolean);
    const acc = String(jobAccount || "").trim();
    if (allowed.indexOf(acc) !== -1) out.push(email);
  });
  return Array.from(new Set(out));
}

function sendNotification_(p, rowData, notifyFlag) {
  if (!notifyFlag) return { notify: "skipped" };
  const engName  = String(p["engName"]  || p["engineerName"] || "Unknown Engineer");
  const engEmail = String(p["engEmail"] || p["engineerEmail"] || "");
  const account  = rowData[4] || "(unknown account)";
  const machine  = rowData[5] || "";
  const stamp    = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss");
  let subject = "", bodyLines = [];

  if (p.action === "login") {
    subject = "[Service Hub] " + engName + " logged in to " + account;
    bodyLines = [
      engName + (engEmail ? " <" + engEmail + ">" : "") + " started a service job.",
      "", "Account: " + account, "Machine: " + machine,
      "Login time: " + (p.time || stamp), "",
      "— Service Hub (" + stamp + ")",
    ];
  } else if (p.action === "logout") {
    subject = "[Service Hub] " + engName + " completed " + account + " — " + (p.status || "");
    bodyLines = [
      engName + (engEmail ? " <" + engEmail + ">" : "") + " signed out of a service job.",
      "", "Account: " + account, "Machine: " + machine,
      "Final Status: " + (p.status || "(not set)"),
      "Logout time: " + (p.time || stamp),
      "Location: " + (p.location || "(not provided)"), "",
      "— Service Hub (" + stamp + ")",
    ];
  } else if (p.action === "status") {
    subject = "[Service Hub] " + engName + " updated status on " + account + ": " + p.status;
    bodyLines = [
      engName + (engEmail ? " <" + engEmail + ">" : "") + " updated the service status.",
      "", "Account: " + account, "New Status: " + p.status, "",
      "— Service Hub (" + stamp + ")",
    ];
  } else {
    return { notify: "skipped" };
  }

  const recipients = getRecipients_(account, p.action);
  if (recipients.length === 0) return { notify: "skipped", reason: "no_recipients" };
  try {
    MailApp.sendEmail({
      to: recipients.join(","), subject, body: bodyLines.join("\n"),
      replyTo: engEmail || undefined,
    });
    return { notify: "ok", recipients: recipients.length };
  } catch (err) {
    return { notify: "error", error: String(err && err.message || err) };
  }
}

// =====================================================================
//                       parseTime
// =====================================================================
function parseTime(input) {
  if (input === null || input === undefined || input === "") return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  const s = String(input).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) { const d = new Date(parseInt(s, 10)); if (!isNaN(d.getTime())) return d; }
  if (/^now$/i.test(s)) return new Date();
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*([AaPp][Mm])?$/);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    const sec = m[3] ? parseInt(m[3], 10) : 0;
    const ampm = (m[4] || "").toUpperCase();
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    if (h > 23 || min > 59 || sec > 59) return null;
    const t = new Date(); t.setHours(h, min, sec, 0); return t;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// =====================================================================
//  locateRow_  —  THE FIX.
// =====================================================================
function locateRow_(sh, hintRow, engineerId, engineerName, account, machine) {
  const last = sh.getLastRow();
  if (last < 2) return -1;

  const idKey = String(engineerId || "").trim().toLowerCase();
  const nameKey = String(engineerName || "").trim().toLowerCase();
  const accKey = String(account || "").trim().toLowerCase();
  const machKey = String(machine || "").trim().toLowerCase();

  function engineerMatches(rowEngId, rowEngName) {
    return (idKey && rowEngId === idKey) || (nameKey && rowEngName === nameKey);
  }

  // Fast path: the hinted row is still correct (the normal case).
  if (hintRow >= 2 && hintRow <= last) {
    const row = sh.getRange(hintRow, 1, 1, HEADER.length).getValues()[0];
    const rowEngId = String(row[1] || "").trim().toLowerCase();
    const rowEngName = String(row[2] || "").trim().toLowerCase();
    const rowAcc = String(row[4] || "").trim().toLowerCase();
    if (engineerMatches(rowEngId, rowEngName) && accKey && rowAcc === accKey) {
      return hintRow;
    }
  }

  // Self-heal: search every row for the best engineer+account match,
  // preferring whichever is closest to where we originally expected it.
  const all = sh.getRange(2, 1, last - 1, HEADER.length).getValues();
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < all.length; i++) {
    const row = all[i];
    const r = i + 2;
    const rowEngId = String(row[1] || "").trim().toLowerCase();
    const rowEngName = String(row[2] || "").trim().toLowerCase();
    const rowAcc = String(row[4] || "").trim().toLowerCase();
    const rowMach = String(row[5] || "").trim().toLowerCase();
    if (!engineerMatches(rowEngId, rowEngName)) continue;
    if (!accKey || rowAcc !== accKey) continue;
    const dist = Math.abs(r - hintRow) + (machKey && rowMach !== machKey ? 0.5 : 0);
    if (dist < bestDist) { bestDist = dist; best = r; }
  }
  return best;
}

// =====================================================================
//                       doPost
// =====================================================================
function doPost(e) {
  const p = e.parameter;
  const sh = findSheet_(DISPATCH);
  const hintRow = Number(p.row) + 1;
  const COL = {
    dateOfService: 1, engineerId: 2, engineerName: 3, area: 4,
    account: 5, machine: 6, purpose: 7, remarks: 8,
    status: 9, login: 10, logout: 11, timeSpent: 12,
    location: 13,
  };

  let notifyFlagRaw = p.notify;
  if (notifyFlagRaw === undefined || notifyFlagRaw === null) notifyFlagRaw = "1";
  const notifyFlag = String(notifyFlagRaw) === "1" || notifyFlagRaw === true;

  // Resolve the REAL row for this engineer + account, self-healing if the
  // client's cached position has gone stale since it loaded the list.
  const r = locateRow_(sh, hintRow, p.engineerId, p.engineerName, p.account, p.machine);
  if (r === -1) {
    return ContentService.createTextOutput(
      JSON.stringify({ result: "ROW_NOT_FOUND", ok: false })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  // ---- double-login guard ----
  if (p.action === "login") {
    const curLogin  = sh.getRange(r, COL.login).getValue();
    const curLogout = sh.getRange(r, COL.logout).getValue();
    const hasLogin  = (curLogin instanceof Date) || (curLogin !== "" && curLogin !== null);
    const hasLogout = (curLogout instanceof Date) || (curLogout !== "" && curLogout !== null);
    if (hasLogin && !hasLogout) {
      return ContentService.createTextOutput(
        JSON.stringify({ result: "ALREADY_LOGGED_IN", ok: false })
      ).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ---- anti-spoof guard: block logout entirely on missing/implausible location ----
  if (p.action === "logout") {
    const parsedLoc = parseLocationParam_(p.location);
    if (!parsedLoc || !isPlausiblePhilippinesLocation_(parsedLoc.lat, parsedLoc.lng)) {
      return ContentService.createTextOutput(
        JSON.stringify({ result: "LOCATION_INVALID", ok: false })
      ).setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (p.action === "login") {
    const dt = parseTime(p.time) || new Date();
    sh.getRange(r, COL.login).setValue(dt);
    sh.getRange(r, COL.login).setNumberFormat("h:mm:ss AM/PM");
  }

  if (p.action === "status") {
    sh.getRange(r, COL.status).setValue(p.status);
  }

  if (p.action === "logout") {
    const logoutDt = parseTime(p.time) || new Date();
    sh.getRange(r, COL.logout).setValue(logoutDt);
    sh.getRange(r, COL.logout).setNumberFormat("h:mm:ss AM/PM");
    sh.getRange(r, COL.status).setValue(p.status);

    // Location already validated above — safe to write as-is.
    if (p.location) {
      sh.getRange(r, COL.location).setValue(p.location);
      sh.getRange(r, COL.location).setNumberFormat("@");
    }

    const serviceDate = new Date(logoutDt); serviceDate.setHours(0, 0, 0, 0);
    sh.getRange(r, COL.dateOfService).setValue(serviceDate);
    sh.getRange(r, COL.dateOfService).setNumberFormat("MM/dd/yyyy");

    const loginRaw = sh.getRange(r, COL.login).getValue();
    const loginDt  = loginRaw instanceof Date ? loginRaw : parseTime(loginRaw);
    let spentText = "";
    if (loginDt && !isNaN(loginDt.getTime())) {
      const diffMs = logoutDt.getTime() - loginDt.getTime();
      if (diffMs > 0) {
        const mins = Math.floor(diffMs / 60000);
        const h = Math.floor(mins / 60), m = mins % 60;
        spentText = h + " hr " + m + " mins";
        sh.getRange(r, COL.timeSpent).setValue(spentText);
        sh.getRange(r, COL.timeSpent).setNumberFormat("@");
      }
    }

    // Prepare notify row data (capture before potential deletion)
    let notifyRowData = sh.getRange(r, 1, 1, HEADER.length).getValues()[0];

    const target =
      p.status === "Running Good" ? "Running Good/Done" :
      p.status === "Not Running / Running with Parts for Replacement" ? "Not/Running with Parts" :
      null;

    if (target) {
      const dest = findSheet_(target);
      if (dest) {
        formatDataRange_(dest);

        const cloned = HEADER.map((_, idx) => {
          const v = notifyRowData[idx];
          return (v instanceof Date && !isNaN(v.getTime())) ? new Date(v.getTime()) : v;
        });

        if (!(cloned[COL.dateOfService - 1] instanceof Date)) cloned[COL.dateOfService - 1] = serviceDate;
        if (!(cloned[COL.logout - 1] instanceof Date)) cloned[COL.logout - 1] = logoutDt;
        if (!(cloned[COL.login - 1] instanceof Date)) {
          const cell = sh.getRange(r, COL.login).getValue();
          if (cell instanceof Date) cloned[COL.login - 1] = new Date(cell.getTime());
        }
        if (!cloned[COL.timeSpent - 1] && spentText) cloned[COL.timeSpent - 1] = spentText;
        if (!cloned[COL.timeSpent - 1]) cloned[COL.timeSpent - 1] = "0 hr 0 mins";
        if (!cloned[COL.location - 1] && p.location) cloned[COL.location - 1] = p.location;

        dest.insertRowAfter(1);
        dest.getRange(2, 1, 1, cloned.length).setValues([cloned]);
        dest.getRange(2, 1).setNumberFormat("MM/dd/yyyy");
        dest.getRange(2, 10, 1, 2).setNumberFormat("h:mm:ss AM/PM");
        dest.getRange(2, 12).setNumberFormat("@");
        dest.getRange(2, 13).setNumberFormat("@");
        formatDataRange_(dest);

        // Remove original row from dispatch sheet after cloning
        sh.deleteRow(r);
      }
    }

    const notifyRes = sendNotification_(p, notifyRowData, notifyFlag);
    return ContentService.createTextOutput(
      JSON.stringify({ result: "ok", ok: true, ...notifyRes })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  const notifyRowData = sh.getRange(r, 1, 1, HEADER.length).getValues()[0];
  const notifyRes = sendNotification_(p, notifyRowData, notifyFlag);
  return ContentService.createTextOutput(
    JSON.stringify({ result: "ok", ok: true, ...notifyRes })
  ).setMimeType(ContentService.MimeType.JSON);
}

// =====================================================================
//  setupTabs  —  MANUAL USE ONLY. Run once from the editor.
// =====================================================================
function setupTabs() {
  const sheets = [DISPATCH].concat(TRANSFER_DEST);
  sheets.forEach(n => {
    let sh = findSheet_(n);
    if (!sh) sh = SS.insertSheet(n);
    normalizeHeaders_(sh);
    formatDataRange_(sh);
  });

  const nl = findSheet_(NOTIFY_LIST);
  if (!nl) {
    const s = SS.insertSheet(NOTIFY_LIST);
    s.getRange(1, 1, 1, 3).setValues([["Email", "Role", "Scope"]]);
  }
}
