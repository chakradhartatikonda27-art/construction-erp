const fs = require('node:fs');
const path = require('node:path');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  console.warn('node:sqlite not available in this node runtime:', e.message);
}

const ORIG_DB = path.join(__dirname, '..', 'database', 'erp.sqlite');
let DB_PATH = ORIG_DB;

if (process.env.VERCEL) {
  DB_PATH = path.join('/tmp', 'erp.sqlite');
  if (!fs.existsSync(DB_PATH) && fs.existsSync(ORIG_DB)) {
    try {
      fs.copyFileSync(ORIG_DB, DB_PATH);
    } catch (e) {
      console.warn('Could not copy sqlite DB to /tmp:', e);
    }
  }
}

let db = null;
if (DatabaseSync) {
  try {
    db = new DatabaseSync(DB_PATH);
  } catch (err) {
    console.error('Failed to open database at', DB_PATH, err);
  }
}

// Helper for date manipulation
function addDays(d, n) {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
const uid = () => Math.random().toString(36).slice(2, 8);

const MATS = [
  ['M1', 'Cement OPC 53', 'Bags', 410],
  ['M2', 'TMT Steel Fe500D', 'Kg', 68],
  ['M3', 'River Sand', 'Tons', 1800],
  ['M4', 'Aggregate 20mm', 'Tons', 1500],
  ['M5', 'Red Bricks', 'Nos', 9],
  ['M6', 'Vitrified Tiles', 'm²', 980],
  ['M7', 'Paint (Emulsion)', 'Litres', 380],
  ['M8', 'PVC / Conduit Pipes', 'Mtrs', 120]
];
const mat = id => MATS.find(m => m[0] === id);

const TPL = [
  ['Land Survey & Marking', 5, 5, 0, []],
  ['Excavation', 10, 5, 1, []],
  ['Foundation', 25, 15, 1, [['M1', 60], ['M2', 600], ['M3', 8], ['M4', 12]]],
  ['Pillars & Beams', 30, 12, 1, [['M1', 40], ['M2', 500], ['M3', 5], ['M4', 8]]],
  ['Slab Work', 25, 15, 1, [['M1', 70], ['M2', 700], ['M3', 9], ['M4', 14]]],
  ['Brick Work', 30, 10, 1, [['M1', 25], ['M3', 12], ['M5', 4500]]],
  ['Electrical & Plumbing', 25, 8, 1, [['M8', 60]]],
  ['Plastering', 20, 8, 1, [['M1', 30], ['M3', 14]]],
  ['Flooring', 20, 8, 1, [['M6', 95], ['M1', 10], ['M3', 3]]],
  ['Painting', 15, 6, 1, [['M7', 40]]],
  ['Final Finishing', 10, 5, 1, []],
  ['Handover', 5, 3, 0, []]
];

const USERS = [
  { id: 'u1', name: 'Mohan S.', role: 'owner', cost: 0 },
  { id: 'u2', name: 'Ravi Kumar', role: 'pm', cost: 3500 },
  { id: 'u3', name: 'Anitha Rao', role: 'eng', cost: 2200 },
  { id: 'u4', name: 'Suresh (Supervisor)', role: 'sup', cost: 1500 },
  { id: 'u5', name: 'Lakshmi (Stores)', role: 'store', cost: 1400 },
  { id: 'u6', name: 'Sita Devi', role: 'qa', cost: 2300 },
  { id: 'u7', name: 'Prakash (Accounts)', role: 'acc', cost: 0 }
];

const CITIES = {
  Hyderabad: [17.4326, 78.4071],
  Visakhapatnam: [17.7231, 83.3013],
  Vijayawada: [16.5062, 80.648],
  Kigali: [-1.9441, 30.0619]
};
const TRADES = [
  ['Mason', 900],
  ['Helper', 550],
  ['Electrician', 1000],
  ['Plumber', 950],
  ['Carpenter', 900],
  ['Bar Bender', 850]
];
const NAMES = ['Venkat', 'Kishore', 'Raju', 'Lakshmi', 'Ramesh', 'Naresh', 'Gopal', 'Mahesh', 'Srinu', 'Padma', 'Anil', 'Satish'];

function initSchema() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      cost REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      client TEXT,
      type TEXT,
      city TEXT,
      addr TEXT,
      lat REAL,
      lng REAL,
      radius REAL,
      area REAL,
      floors INTEGER,
      contract REAL,
      budget REAL,
      start TEXT,
      end TEXT,
      status TEXT,
      created TEXT,
      team TEXT
    );

    CREATE TABLE IF NOT EXISTS stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      k INTEGER NOT NULL,
      name TEXT NOT NULL,
      dur INTEGER NOT NULL,
      bill REAL NOT NULL,
      qa INTEGER NOT NULL,
      mats TEXT,
      status TEXT NOT NULL,
      prog REAL NOT NULL,
      ps TEXT NOT NULL,
      pe TEXT NOT NULL,
      "as" TEXT,
      "ae" TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS roster (
      project_id TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      trade TEXT NOT NULL,
      wage REAL NOT NULL,
      PRIMARY KEY (project_id, id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS stock (
      project_id TEXT NOT NULL,
      mat_id TEXT NOT NULL,
      qty REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (project_id, mat_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      d TEXT NOT NULL,
      uid TEXT,
      wid TEXT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      check_in TEXT,
      check_out TEXT,
      hours REAL DEFAULT 0,
      dist REAL DEFAULT 0,
      onsite INTEGER DEFAULT 1,
      pres INTEGER DEFAULT 1,
      leave INTEGER DEFAULT 0,
      cost REAL DEFAULT 0,
      method TEXT
    );

    CREATE TABLE IF NOT EXISTS dprs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      k INTEGER NOT NULL,
      d TEXT NOT NULL,
      by_uid TEXT NOT NULL,
      pct REAL NOT NULL,
      mats TEXT,
      delay TEXT DEFAULT 'None',
      notes TEXT,
      photo TEXT,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      m TEXT NOT NULL,
      qty REAL NOT NULL,
      by_uid TEXT NOT NULL,
      status TEXT NOT NULL,
      vendor TEXT,
      rate REAL DEFAULT 0,
      d TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inspections (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      k INTEGER NOT NULL,
      by_uid TEXT NOT NULL,
      res TEXT NOT NULL,
      d TEXT NOT NULL,
      rem TEXT
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      k INTEGER NOT NULL,
      desc TEXT NOT NULL,
      amt REAL NOT NULL,
      status TEXT NOT NULL,
      d TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      cat TEXT NOT NULL,
      amt REAL NOT NULL,
      d TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      t TEXT NOT NULL,
      d TEXT NOT NULL,
      u TEXT NOT NULL,
      msg TEXT NOT NULL,
      project_id TEXT
    );

    CREATE TABLE IF NOT EXISTS hse (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      d TEXT NOT NULL,
      type TEXT NOT NULL,
      desc TEXT NOT NULL,
      by_uid TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS units (
      project_id TEXT NOT NULL,
      unit_num TEXT NOT NULL,
      status TEXT NOT NULL,
      client TEXT,
      PRIMARY KEY (project_id, unit_num)
    );

    CREATE TABLE IF NOT EXISTS wa_messages (
      id TEXT PRIMARY KEY,
      to_role TEXT NOT NULL,
      t TEXT NOT NULL,
      d TEXT NOT NULL,
      txt TEXT NOT NULL,
      act TEXT,
      status TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS tenders (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      client TEXT NOT NULL,
      type TEXT NOT NULL,
      val REAL NOT NULL,
      emd REAL NOT NULL,
      sub_date TEXT NOT NULL,
      status TEXT NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS drawings (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      dwg_no TEXT NOT NULL,
      title TEXT NOT NULL,
      disc TEXT NOT NULL,
      rev TEXT NOT NULL,
      status TEXT NOT NULL,
      d TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS equipment (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      type TEXT NOT NULL,
      project_id TEXT,
      status TEXT NOT NULL,
      hours REAL DEFAULT 0,
      fuel_cap REAL DEFAULT 0,
      op_name TEXT
    );

    CREATE TABLE IF NOT EXISTS fuel_logs (
      id TEXT PRIMARY KEY,
      eq_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      d TEXT NOT NULL,
      liters REAL NOT NULL,
      cost REAL NOT NULL,
      hours REAL NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS contracts_tbl (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      vendor_name TEXT NOT NULL,
      scope TEXT NOT NULL,
      val REAL NOT NULL,
      ra_billed REAL NOT NULL DEFAULT 0,
      retention REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ncr_records (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      stage_k INTEGER NOT NULL,
      title TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      d TEXT NOT NULL,
      action TEXT
    );

    CREATE TABLE IF NOT EXISTS documents_tbl (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      cat TEXT NOT NULL,
      rev TEXT NOT NULL,
      status TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      d TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS handover_snags (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      unit_num TEXT NOT NULL,
      desc TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      due_date TEXT NOT NULL,
      assigned_to TEXT NOT NULL
    );
  `);
}

function getConfig(k, defaultVal = null) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(k);
  return row ? row.value : defaultVal;
}

function setConfig(k, v) {
  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(k, String(v));
}

function logAudit(msg, projectId = null, user = null) {
  const today = getConfig('today', new Date().toISOString().slice(0, 10));
  const activeUserId = getConfig('me', 'u1');
  let uname = 'System';
  if (user) {
    uname = user;
  } else if (activeUserId) {
    const u = db.prepare('SELECT name FROM users WHERE id = ?').get(activeUserId);
    if (u) uname = u.name;
  }
  db.prepare('INSERT INTO audit_log (t, d, u, msg, project_id) VALUES (?, ?, ?, ?, ?)')
    .run(new Date().toISOString(), today, uname, msg, projectId);
}

function sendWA(toRole, txt, act = null) {
  const today = getConfig('today', new Date().toISOString().slice(0, 10));
  const t = new Date().toTimeString().slice(0, 5);
  const id = uid();
  const actJson = act ? JSON.stringify(act) : null;
  db.prepare('INSERT INTO wa_messages (id, to_role, t, d, txt, act, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, toRole, t, today, txt, actJson, '');
  return id;
}

function createProjectRecord(f) {
  const today = getConfig('today', new Date().toISOString().slice(0, 10));
  const countRow = db.prepare('SELECT COUNT(*) as c FROM projects').get();
  const pId = 'P' + String(countRow.c + 1).padStart(3, '0');
  
  const sc = f.area / 100;
  let cur = f.start || today;
  const stages = [];
  TPL.forEach((t, i) => {
    const s = {
      k: i,
      name: t[0],
      dur: t[1],
      bill: t[2],
      qa: t[3] ? 1 : 0,
      mats: JSON.stringify(t[4].map(m => [m[0], Math.round(m[1] * sc)])),
      status: 'NS',
      prog: 0,
      ps: cur,
      pe: addDays(cur, t[1]),
      as: null,
      ae: null
    };
    stages.push(s);
    cur = s.pe;
  });

  const budget = Math.round(f.contract * 0.85);
  const teamJson = JSON.stringify(f.team || ['u2', 'u3', 'u4', 'u5', 'u6']);

  db.prepare(`
    INSERT INTO projects (id, name, client, type, city, addr, lat, lng, radius, area, floors, contract, budget, start, end, status, created, team)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    pId, f.name, f.client, f.type, f.city, f.addr, f.lat, f.lng, f.radius || 150,
    f.area, f.floors, f.contract, budget, f.start || today, cur, 'Planning', today, teamJson
  );

  const insertStage = db.prepare(`
    INSERT INTO stages (project_id, k, name, dur, bill, qa, mats, status, prog, ps, pe, "as", "ae")
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const s of stages) {
    insertStage.run(pId, s.k, s.name, s.dur, s.bill, s.qa, s.mats, s.status, s.prog, s.ps, s.pe, s.as, s.ae);
  }

  const insertRoster = db.prepare('INSERT INTO roster (project_id, id, name, trade, wage) VALUES (?, ?, ?, ?, ?)');
  for (let i = 0; i < 8; i++) {
    const t = TRADES[i % 6];
    const name = NAMES[(countRow.c * 3 + i) % 12];
    insertRoster.run(pId, 'L' + (i + 1), name, t[0], t[1]);
  }

  const insertStock = db.prepare('INSERT INTO stock (project_id, mat_id, qty) VALUES (?, ?, 0)');
  for (const m of MATS) {
    insertStock.run(pId, m[0]);
  }

  // Units if multi-floor
  if (f.floors >= 1) {
    const insertUnit = db.prepare('INSERT OR IGNORE INTO units (project_id, unit_num, status, client) VALUES (?, ?, ?, ?)');
    for (let fl = 1; fl <= f.floors; fl++) {
      for (let n = 1; n <= 4; n++) {
        insertUnit.run(pId, `${fl}0${n}`, 'Available', '');
      }
    }
  }

  logAudit(`Project ${pId} created: ${f.name} @ ${f.addr || f.city}`, pId);
  return pId;
}

function seedDatabase() {
  db.exec(`
    DELETE FROM config;
    DELETE FROM users;
    DELETE FROM projects;
    DELETE FROM stages;
    DELETE FROM roster;
    DELETE FROM stock;
    DELETE FROM attendance;
    DELETE FROM dprs;
    DELETE FROM prs;
    DELETE FROM inspections;
    DELETE FROM invoices;
    DELETE FROM expenses;
    DELETE FROM audit_log;
    DELETE FROM hse;
    DELETE FROM units;
    DELETE FROM wa_messages;
    DELETE FROM tenders;
    DELETE FROM drawings;
    DELETE FROM equipment;
    DELETE FROM fuel_logs;
    DELETE FROM contracts_tbl;
    DELETE FROM ncr_records;
    DELETE FROM documents_tbl;
    DELETE FROM handover_snags;
  `);

  const today = new Date().toISOString().slice(0, 10);
  setConfig('today', today);
  setConfig('me', 'u1');
  setConfig('ap', 'P003');
  setConfig('lang', 'en');
  setConfig('offline', '0');

  // Seed Users
  const insertUser = db.prepare('INSERT INTO users (id, name, role, cost) VALUES (?, ?, ?, ?)');
  for (const u of USERS) {
    insertUser.run(u.id, u.name, u.role, u.cost);
  }

  // Project 1
  createProjectRecord({
    name: 'Independent Villa – Jubilee Hills',
    client: 'Mr. K. Srinivas',
    type: 'Villa',
    city: 'Hyderabad',
    addr: 'Plot 214, Road 36, Jubilee Hills',
    lat: 17.4326,
    lng: 78.4071,
    radius: 150,
    area: 400,
    floors: 2,
    contract: 12500000,
    start: today,
    team: ['u2', 'u3', 'u4', 'u5', 'u6']
  });

  // Seed Sample Historical Projects
  const rnd = (() => {
    let x = 7;
    return () => (x = (x * 9301 + 49297) % 233280) / 233280;
  })();

  const defs = [
    { name: 'G+5 Apartment – Madhurawada', client: 'Sri Constructions', type: 'Apartment', city: 'Visakhapatnam', addr: 'Survey No. 88, Madhurawada', area: 3000, floors: 5, contract: 35000000, back: 110, done: 5, cur: 100, crew: 12 },
    { name: 'G+15 Residential Tower – Gachibowli', client: 'Skyline Developers', type: 'High-rise', city: 'Hyderabad', addr: 'Plot 12, Financial District, Gachibowli', area: 12000, floors: 15, contract: 260000000, back: 85, done: 3, cur: 40, crew: 20 },
    { name: 'Commercial Complex – Vijayawada', client: 'Krishna Realty', type: 'Commercial', city: 'Vijayawada', addr: 'MG Road, Benz Circle', area: 5000, floors: 6, contract: 98000000, back: 28, done: 2, cur: 50, crew: 15 },
    { name: 'Kigali Heights Block B', client: 'Heights Rwanda Ltd', type: 'Commercial', city: 'Kigali', addr: 'KG 7 Ave, Nyarutarama', area: 4000, floors: 5, contract: 140000000, back: 8, done: 1, cur: 30, crew: 12 }
  ];

  for (const d of defs) {
    const c = CITIES[d.city];
    const pId = createProjectRecord({
      name: d.name,
      client: d.client,
      type: d.type,
      city: d.city,
      addr: d.addr,
      lat: c[0] + (rnd() - 0.5) * 0.01,
      lng: c[1] + (rnd() - 0.5) * 0.01,
      radius: 150,
      area: d.area,
      floors: d.floors,
      contract: d.contract,
      start: addDays(today, -d.back),
      team: ['u2', 'u3', 'u4', 'u5', 'u6']
    });

    db.prepare("UPDATE projects SET status = 'In Progress' WHERE id = ?").run(pId);

    // Expand roster
    let rosterCount = 8;
    while (rosterCount < d.crew) {
      const t = TRADES[rosterCount % 6];
      rosterCount++;
      db.prepare('INSERT INTO roster (project_id, id, name, trade, wage) VALUES (?, ?, ?, ?, ?)')
        .run(pId, 'L' + rosterCount, NAMES[(rosterCount * 3) % 12], t[0], t[1]);
    }

    const stages = db.prepare('SELECT * FROM stages WHERE project_id = ? ORDER BY k ASC').all(pId);

    // Completed stages
    for (let k = 0; k < d.done; k++) {
      const s = stages[k];
      db.prepare("UPDATE stages SET status = 'DONE', prog = 100, \"as\" = ps, \"ae\" = pe WHERE id = ?").run(s.id);
      
      const mats = JSON.parse(s.mats);
      for (const [m, q] of mats) {
        const rate = Math.round(mat(m)[3] * 0.97);
        const recvQ = Math.round(q * 1.03);
        db.prepare('INSERT INTO prs (id, project_id, m, qty, by_uid, status, vendor, rate, d) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run('PR-' + uid(), pId, m, recvQ, 'u3', 'Received', 'Vizag Build Mart', rate, s.ps);
        db.prepare('UPDATE stock SET qty = qty + ? WHERE project_id = ? AND mat_id = ?').run(recvQ, pId, m);
      }

      // DPRs
      [40, 30, 30].forEach((pct, j) => {
        const dDate = addDays(s.ps, Math.min(s.dur - 1, j * Math.floor(s.dur / 3)));
        const dMats = {};
        mats.forEach(([m, q]) => { dMats[m] = Math.round(q * pct / 100); });
        // deduct stock
        Object.entries(dMats).forEach(([m, q]) => {
          db.prepare('UPDATE stock SET qty = MAX(0, qty - ?) WHERE project_id = ? AND mat_id = ?').run(q, pId, m);
        });
        db.prepare('INSERT INTO dprs (id, project_id, k, d, by_uid, pct, mats, delay, notes, photo, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(uid(), pId, k, dDate, j === 1 ? 'u4' : 'u3', pct, JSON.stringify(dMats), j === 2 && k % 3 === 1 ? 'Rain' : 'None', '', '', 'Approved');
      });

      if (s.qa) {
        db.prepare('INSERT INTO inspections (id, project_id, k, by_uid, res, d, rem) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(uid(), pId, k, 'u6', 'Passed', s.pe, 'Inspection OK');
      }

      const invAmt = Math.round(d.contract * s.bill / 100);
      db.prepare('INSERT INTO invoices (id, project_id, k, desc, amt, status, d) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run('INV-' + uid(), pId, k, `Stage billing – ${s.name} (${s.bill}%)`, invAmt, k >= d.done - 1 ? 'Pending' : 'Paid', s.pe);

      // Labour history
      const rList = db.prepare('SELECT * FROM roster WHERE project_id = ?').all(pId);
      for (let dt = s.ps; dt < s.pe && dt <= today; dt = addDays(dt, 4)) {
        for (const w of rList) {
          const pres = rnd() > 0.1;
          const h = pres ? (rnd() > 0.85 ? 10 : 8) : 0;
          const cost = ((Math.min(h, 8) + Math.max(h - 8, 0) * 1.5) / 8) * w.wage;
          db.prepare('INSERT INTO attendance (id, project_id, d, uid, wid, type, name, check_in, check_out, hours, dist, onsite, pres, leave, cost, method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(uid(), pId, dt, null, w.id, 'labour', `${w.name} (${w.trade})`, pres ? '08:30' : null, pres ? '17:30' : null, h, 0, 1, pres ? 1 : 0, 0, cost, 'Manual');
        }
      }
    }

    // Active stage
    const curStage = stages[d.done];
    if (curStage) {
      db.prepare("UPDATE stages SET status = 'IP', \"as\" = ps, prog = ? WHERE id = ?").run(d.cur, curStage.id);
      const curMats = JSON.parse(curStage.mats);
      curMats.forEach(([m, q]) => {
        const recvQ = Math.round(q * (d.cur / 100) * 1.7);
        db.prepare('INSERT INTO prs (id, project_id, m, qty, by_uid, status, vendor, rate, d) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run('PR-' + uid(), pId, m, recvQ, 'u3', 'Received', 'Vizag Build Mart', Math.round(mat(m)[3] * 0.97), addDays(today, -5));
        db.prepare('UPDATE stock SET qty = qty + ? WHERE project_id = ? AND mat_id = ?').run(recvQ, pId, m);
      });

      // Active DPR
      const dMats = {};
      curMats.forEach(([m, q]) => { dMats[m] = Math.round(q * d.cur / 100); });
      Object.entries(dMats).forEach(([m, q]) => {
        db.prepare('UPDATE stock SET qty = MAX(0, qty - ?) WHERE project_id = ? AND mat_id = ?').run(q, pId, m);
      });
      db.prepare('INSERT INTO dprs (id, project_id, k, d, by_uid, pct, mats, delay, notes, photo, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(uid(), pId, d.done, addDays(today, -3), 'u3', d.cur, JSON.stringify(dMats), d.cur < 100 && pId === 'P003' ? 'Labour shortage' : 'None', '', '', 'Approved');

      if (d.cur <= 90) {
        db.prepare('INSERT INTO dprs (id, project_id, k, d, by_uid, pct, mats, delay, notes, photo, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(uid(), pId, d.done, addDays(today, -1), 'u4', 5, '{}', 'None', '', '', 'Submitted');
      }

      if (curMats[0]) {
        db.prepare('INSERT INTO prs (id, project_id, m, qty, by_uid, status, vendor, rate, d) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run('PR-' + uid(), pId, curMats[0][0], Math.round(curMats[0][1] * 0.1), 'u3', 'Requested', null, 0, today);
      }
      if (curMats[1]) {
        db.prepare('INSERT INTO prs (id, project_id, m, qty, by_uid, status, vendor, rate, d) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run('PR-' + uid(), pId, curMats[1][0], Math.round(curMats[1][1] * 0.1), 'u4', 'Approved', null, 0, today);
      }
      if (curMats[2]) {
        db.prepare('INSERT INTO prs (id, project_id, m, qty, by_uid, status, vendor, rate, d) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run('PR-' + uid(), pId, curMats[2][0], Math.round(curMats[2][1] * 0.1), 'u3', 'Ordered', 'Andhra Suppliers', Math.round(mat(curMats[2][0])[3] * 1.04), today);
      }
    }

    // Expenses
    const expIns = db.prepare('INSERT INTO expenses (id, project_id, cat, amt, d) VALUES (?, ?, ?, ?, ?)');
    expIns.run(uid(), pId, 'Machinery rental', Math.round(d.contract * 0.012), addDays(today, -10));
    expIns.run(uid(), pId, 'Fuel', Math.round(d.contract * 0.003), addDays(today, -10));
    expIns.run(uid(), pId, 'Site office & utilities', Math.round(d.contract * 0.002), addDays(today, -10));

    // Units
    if (d.floors >= 5) {
      const uList = db.prepare('SELECT unit_num FROM units WHERE project_id = ?').all(pId);
      uList.forEach((u, i) => {
        const st = i % 3 === 0 ? 'Sold' : i % 5 === 0 ? 'Booked' : 'Available';
        db.prepare('UPDATE units SET status = ? WHERE project_id = ? AND unit_num = ?').run(st, pId, u.unit_num);
      });
    }

    // Staff Attendance
    for (let n = 35; n >= 1; n--) {
      const dDate = addDays(today, -n);
      const dayOfWeek = new Date(dDate + 'T00:00:00Z').getUTCDay();
      if (dayOfWeek === 0) continue;
      ['u3', 'u4'].forEach(uidStr => {
        const rVal = rnd();
        const uObj = USERS.find(x => x.id === uidStr);
        if (rVal < 0.9) {
          db.prepare('INSERT INTO attendance (id, project_id, d, uid, wid, type, name, check_in, check_out, hours, dist, onsite, pres, leave, cost, method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(uid(), pId, dDate, uidStr, null, 'staff', uObj.name, '09:05', '18:10', 8, Math.round(30 + rnd() * 80), 1, 1, 0, uObj.cost, rnd() > 0.5 ? 'QR' : 'Face');
        } else if (rVal < 0.96) {
          db.prepare('INSERT INTO attendance (id, project_id, d, uid, wid, type, name, check_in, check_out, hours, dist, onsite, pres, leave, cost, method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(uid(), pId, dDate, uidStr, null, 'staff', uObj.name, null, null, 0, 0, 1, 0, 1, 0, 'Manual');
        }
      });
    }

    logAudit(`Sample project loaded: ${d.name} at stage ${d.done + 1}`, pId);
  }

  // HSE incidents
  db.prepare('INSERT INTO hse (project_id, d, type, desc, by_uid) VALUES (?, ?, ?, ?, ?)')
    .run('P003', addDays(today, -6), 'Near miss', 'Falling object from level 3 – area barricaded', 'u4');
  db.prepare('INSERT INTO hse (project_id, d, type, desc, by_uid) VALUES (?, ?, ?, ?, ?)')
    .run('P004', addDays(today, -2), 'PPE violation', 'Two workers without helmets – counselled', 'u4');

  // Tenders
  const insertTender = db.prepare('INSERT INTO tenders (id, title, client, type, val, emd, sub_date, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  insertTender.run('T-2026-01', 'Govt Secretariat IT Tower Phase 2', 'AP CRDA', 'Commercial EPC', 145000000, 1450000, addDays(today, 25), 'Bidding', 'Technical bid pre-qualification document under review');
  insertTender.run('T-2026-02', 'Smart City Water Distribution Network', 'GVMC Vizag', 'Infrastructure', 48000000, 480000, addDays(today, 8), 'Submitted', 'EMD submitted via Bank Guarantee. Commercial bid opens Friday');
  insertTender.run('T-2026-03', 'Highway Flyover & Underpass Junction', 'NHAI', 'Infrastructure', 92000000, 920000, addDays(today, 15), 'Evaluation', 'L1 bidder shortlisted. Awaiting letter of intent (LOI)');

  // Drawings
  const insertDwg = db.prepare('INSERT INTO drawings (id, project_id, dwg_no, title, disc, rev, status, d) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  insertDwg.run('DWG-01', 'P003', 'P003-ARC-101', 'Typical Floor Architectural Layout', 'Architectural', 'R2', 'Approved for Construction', addDays(today, -30));
  insertDwg.run('DWG-02', 'P003', 'P003-STR-201', 'Foundation & Column Shear Wall Details', 'Structural', 'R3', 'Approved for Construction', addDays(today, -20));
  insertDwg.run('DWG-03', 'P003', 'P003-MEP-301', 'Electrical Conduit & Fire Hydrant Routing', 'MEP', 'R1', 'In Review', addDays(today, -5));
  insertDwg.run('DWG-04', 'P002', 'P002-STR-104', 'Slab Reinforcement & Beam Schedule', 'Structural', 'R1', 'Approved for Construction', addDays(today, -45));
  insertDwg.run('DWG-05', 'P004', 'P004-ARC-002', 'Basement Parking & Ramp Sections', 'Architectural', 'R0', 'Approved for Construction', addDays(today, -15));

  // Equipment
  const insertEq = db.prepare('INSERT INTO equipment (id, name, code, type, project_id, status, hours, fuel_cap, op_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  insertEq.run('EQ-01', 'Liebherr Tower Crane 40T', 'TC-401', 'Tower Crane', 'P003', 'Active', 1420, 250, 'Ramanathan (Certified Operator)');
  insertEq.run('EQ-02', 'Schwing Stetter Batching Plant M1', 'BP-102', 'Batching Plant', 'P003', 'Active', 980, 400, 'K. Jagannath');
  insertEq.run('EQ-03', 'Putzmeister Boom Pump 36m', 'CP-05', 'Concrete Pump', 'P002', 'Maintenance', 640, 180, 'S. Murthy');
  insertEq.run('EQ-04', 'JCB 3DX EcoXcellence Excavator', 'EX-22', 'Excavator', 'P003', 'Active', 2150, 150, 'G. Naidu');
  insertEq.run('EQ-05', 'Volvo Transit Mixer 7m³', 'TM-08', 'Transit Mixer', 'P004', 'Active', 1890, 200, 'B. Srinivas');
  insertEq.run('EQ-06', 'Kirloskar DG Genset 125 kVA', 'DG-03', 'Generator', 'P003', 'Active', 850, 120, 'Site Electrician');

  // Fuel Logs
  const insertFuel = db.prepare('INSERT INTO fuel_logs (id, eq_id, project_id, d, liters, cost, hours, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  insertFuel.run('FL-01', 'EQ-04', 'P003', addDays(today, -1), 85, 8075, 7.5, 'Foundation trench excavation works');
  insertFuel.run('FL-02', 'EQ-01', 'P003', addDays(today, -2), 60, 5700, 8.0, 'Material lifting for 3rd floor slab shuttering');
  insertFuel.run('FL-03', 'EQ-06', 'P003', addDays(today, -3), 45, 4275, 5.0, 'Grid power outage backup during concrete pour');

  // Contracts
  const insertContract = db.prepare('INSERT INTO contracts_tbl (id, project_id, vendor_name, scope, val, ra_billed, retention, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  insertContract.run('SC-101', 'P003', 'Sri Laxmi Earthmovers', 'Deep Excavation, Shoring & Dewatering', 4200000, 3800000, 190000, 'Active');
  insertContract.run('SC-102', 'P003', 'Apex Bar Bending Works', 'Structural Steel Binding & BBS Fabrication', 6500000, 2600000, 130000, 'Active');
  insertContract.run('SC-103', 'P003', 'Deccan Electricals EPC', 'Internal Conduit, Wiring & Panel Board', 3100000, 800000, 40000, 'Active');
  insertContract.run('SC-104', 'P002', 'Megha Flooring & Tiling', 'Vitrified & Granite Tile Installation', 2800000, 2100000, 105000, 'Active');

  // NCR Records
  const insertNCR = db.prepare('INSERT INTO ncr_records (id, project_id, stage_k, title, severity, status, d, action) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  insertNCR.run('NCR-01', 'P003', 3, 'Honeycombing in Column C3 starter', 'Medium', 'Closed', addDays(today, -12), 'Chipped to sound concrete & micro-concrete grouting certified by structural consultant');
  insertNCR.run('NCR-02', 'P003', 4, 'Cube 7-day test strength variation (Batch #42)', 'High', 'Under Review', addDays(today, -3), 'Core extraction test ordered as per IS 516 protocol');

  // Documents & Approvals
  const insertDoc = db.prepare('INSERT INTO documents_tbl (id, project_id, title, cat, rev, status, uploaded_by, d) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  insertDoc.run('DOC-01', 'P003', 'Contract Agreement & Scope Schedule', 'Legal', 'R1', 'Approved', 'Mohan S. (Owner)', addDays(today, -80));
  insertDoc.run('DOC-02', 'P003', 'Soil Geotechnical Investigation Report', 'Engineering', 'Final', 'Approved', 'Sita Devi (QA)', addDays(today, -75));
  insertDoc.run('DOC-03', 'P003', 'Environmental Clearance & Fire NOC', 'Statutory', 'V2', 'Approved', 'Ravi Kumar (PM)', addDays(today, -60));
  insertDoc.run('DOC-04', 'P003', 'Batching Plant Calibration Certificate', 'Quality', '2026-Q4', 'Approved', 'Sita Devi (QA)', addDays(today, -10));

  // Handover & Snagging
  const insertSnag = db.prepare('INSERT INTO handover_snags (id, project_id, unit_num, desc, severity, status, due_date, assigned_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  insertSnag.run('SNG-01', 'P002', '201', 'Minor hairline paint crack above balcony door', 'Low', 'Resolved', addDays(today, -5), 'Suresh (Supervisor)');
  insertSnag.run('SNG-02', 'P002', '304', 'Master bathroom mixer tap pressure low', 'Medium', 'Open', addDays(today, 2), 'Plumbing Contractor');
  insertSnag.run('SNG-03', 'P002', '402', 'Main entry door lock latch alignment required', 'Low', 'Open', addDays(today, 3), 'Carpentry Gang');

  // WhatsApp Messages
  sendWA('owner', `📊 Daily summary ${today}\n• Projects: 5 (1 delayed)\n• Present today: 24\n• Cost to date: ₹2.4 Cr\n• Pending approvals: 3\n• Alerts: 2`);
}

function getFullState() {
  const today = getConfig('today', new Date().toISOString().slice(0, 10));
  const me = getConfig('me', 'u1');
  const ap = getConfig('ap', 'P003');
  const lang = getConfig('lang', 'en');
  const offline = getConfig('offline', '0') === '1';

  const users = db.prepare('SELECT * FROM users').all();
  const rawProjects = db.prepare('SELECT * FROM projects').all();
  
  const projects = rawProjects.map(p => {
    const pStages = db.prepare('SELECT * FROM stages WHERE project_id = ? ORDER BY k ASC').all(p.id).map(s => ({
      k: s.k,
      name: s.name,
      dur: s.dur,
      bill: s.bill,
      qa: Boolean(s.qa),
      mats: JSON.parse(s.mats || '[]'),
      status: s.status,
      prog: s.prog,
      ps: s.ps,
      pe: s.pe,
      as: s.as,
      ae: s.ae
    }));
    const pRoster = db.prepare('SELECT * FROM roster WHERE project_id = ?').all(p.id);
    return {
      ...p,
      team: JSON.parse(p.team || '[]'),
      stages: pStages,
      roster: pRoster
    };
  });

  const stockRows = db.prepare('SELECT * FROM stock').all();
  const stock = {};
  for (const s of stockRows) {
    if (!stock[s.project_id]) stock[s.project_id] = {};
    stock[s.project_id][s.mat_id] = s.qty;
  }

  const prs = db.prepare('SELECT * FROM prs ORDER BY rowid DESC').all();
  const att = db.prepare('SELECT * FROM attendance ORDER BY d ASC, rowid ASC').all().map(a => ({
    id: a.id,
    pid: a.project_id,
    d: a.d,
    uid: a.uid,
    wid: a.wid,
    type: a.type,
    name: a.name,
    in: a.check_in,
    out: a.check_out,
    hours: a.hours,
    dist: a.dist,
    onsite: Boolean(a.onsite),
    pres: Boolean(a.pres),
    leave: Boolean(a.leave),
    cost: a.cost,
    method: a.method
  }));

  const dprs = db.prepare('SELECT * FROM dprs ORDER BY rowid DESC').all().map(d => ({
    id: d.id,
    pid: d.project_id,
    k: d.k,
    d: d.d,
    by: d.by_uid,
    pct: d.pct,
    mats: JSON.parse(d.mats || '{}'),
    delay: d.delay,
    notes: d.notes,
    photo: d.photo,
    st: d.status
  }));

  const insp = db.prepare('SELECT * FROM inspections ORDER BY rowid DESC').all().map(i => ({
    id: i.id,
    pid: i.project_id,
    k: i.k,
    by: i.by_uid,
    res: i.res,
    d: i.d,
    rem: i.rem
  }));

  const inv = db.prepare('SELECT * FROM invoices ORDER BY rowid DESC').all().map(i => ({
    id: i.id,
    pid: i.project_id,
    k: i.k,
    desc: i.desc,
    amt: i.amt,
    st: i.status,
    d: i.d
  }));

  const exp = db.prepare('SELECT * FROM expenses ORDER BY rowid DESC').all().map(e => ({
    id: e.id,
    pid: e.project_id,
    cat: e.cat,
    amt: e.amt,
    d: e.d
  }));

  const logRows = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 200').all().map(l => ({
    t: l.t,
    d: l.d,
    u: l.u,
    msg: l.msg,
    pid: l.project_id
  }));

  const hse = db.prepare('SELECT * FROM hse ORDER BY id DESC').all().map(h => ({
    pid: h.project_id,
    d: h.d,
    t: h.type,
    desc: h.desc,
    by: h.by_uid
  }));

  const rawUnits = db.prepare('SELECT * FROM units').all();
  const units = {};
  for (const u of rawUnits) {
    if (!units[u.project_id]) units[u.project_id] = [];
    units[u.project_id].push({ n: u.unit_num, s: u.status, c: u.client || '' });
  }

  const wa = db.prepare('SELECT * FROM wa_messages ORDER BY rowid DESC LIMIT 80').all().map(w => ({
    id: w.id,
    to: w.to_role,
    t: w.t,
    d: w.d,
    txt: w.txt,
    act: w.act ? JSON.parse(w.act) : null,
    st: w.status
  }));

  const tenders = db.prepare('SELECT * FROM tenders ORDER BY rowid ASC').all();
  const drawings = db.prepare('SELECT * FROM drawings ORDER BY rowid ASC').all();
  const equipment = db.prepare('SELECT * FROM equipment ORDER BY rowid ASC').all();
  const fuelLogs = db.prepare('SELECT * FROM fuel_logs ORDER BY rowid DESC').all();
  const contracts = db.prepare('SELECT * FROM contracts_tbl ORDER BY rowid ASC').all();
  const ncrs = db.prepare('SELECT * FROM ncr_records ORDER BY rowid DESC').all();
  const documents = db.prepare('SELECT * FROM documents_tbl ORDER BY rowid ASC').all();
  const snags = db.prepare('SELECT * FROM handover_snags ORDER BY rowid ASC').all();

  return {
    today,
    me,
    ap,
    lang,
    offline,
    users,
    projects,
    stock,
    prs,
    att,
    dprs,
    insp,
    inv,
    exp,
    log: logRows,
    hse,
    units,
    wa,
    tenders,
    drawings,
    equipment,
    fuelLogs,
    contracts,
    ncrs,
    documents,
    snags
  };
}

// Check if database needs initial seeding
initSchema();
const projCount = db.prepare('SELECT COUNT(*) as c FROM projects').get().c;
const tenderCount = db.prepare('SELECT COUNT(*) as c FROM tenders').get().c;
const docCount = db.prepare('SELECT COUNT(*) as c FROM documents_tbl').get().c;
if (projCount === 0 || tenderCount === 0 || docCount === 0) {
  seedDatabase();
}

module.exports = {
  db,
  initSchema,
  seedDatabase,
  getFullState,
  getConfig,
  setConfig,
  logAudit,
  sendWA,
  createProjectRecord,
  uid,
  addDays,
  MATS,
  TPL,
  USERS,
  TRADES,
  CITIES
};
