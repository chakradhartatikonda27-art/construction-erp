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
  { id: 'u7', name: 'Prakash (Accounts)', role: 'acc', cost: 0 },
  { id: 'u8', name: 'K. Naresh', role: 'plan', cost: 2500 },
  { id: 'u9', name: 'M. Varma', role: 'qs', cost: 2400 }
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

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      client_name TEXT NOT NULL,
      contact_person TEXT,
      phone TEXT,
      email TEXT,
      source TEXT NOT NULL,
      est_value REAL NOT NULL,
      location TEXT,
      assigned_to TEXT,
      status TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      converted_client_id TEXT,
      converted_opp_id TEXT
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact_person TEXT,
      designation TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      gstin TEXT,
      pan TEXT,
      tier TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      lead_id TEXT,
      client_id TEXT,
      client_name TEXT NOT NULL,
      title TEXT NOT NULL,
      scope TEXT NOT NULL,
      est_val REAL NOT NULL,
      stage TEXT NOT NULL,
      win_prob INTEGER NOT NULL,
      responsible_mgr TEXT,
      expected_close TEXT,
      status TEXT NOT NULL,
      converted_project_id TEXT,
      tender_id TEXT,
      bid_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bids (
      id TEXT PRIMARY KEY,
      opp_id TEXT,
      tender_id TEXT,
      client TEXT NOT NULL,
      title TEXT NOT NULL,
      est_cost REAL NOT NULL,
      margin_pct REAL NOT NULL,
      bid_price REAL NOT NULL,
      tech_proposal TEXT,
      fin_proposal TEXT,
      internal_approval TEXT NOT NULL,
      approval_by TEXT,
      submission_date TEXT,
      status TEXT NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS crm_activities (
      id TEXT PRIMARY KEY,
      ref_id TEXT NOT NULL,
      ref_type TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      activity_date TEXT NOT NULL,
      conducted_by TEXT,
      client_attendees TEXT,
      summary TEXT NOT NULL,
      next_action TEXT,
      next_date TEXT,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      assigned_to TEXT NOT NULL,
      assigned_name TEXT,
      assigned_role TEXT,
      start_date TEXT,
      due_date TEXT,
      priority TEXT DEFAULT 'Medium',
      status TEXT DEFAULT 'Not Started',
      progress REAL DEFAULT 0,
      weight REAL DEFAULT 10,
      photo TEXT,
      remarks TEXT,
      delay_reason TEXT,
      created_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS project_milestones (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      target_date TEXT NOT NULL,
      status TEXT DEFAULT 'Pending',
      billing_pct REAL DEFAULT 10,
      weight REAL DEFAULT 15,
      achieved_date TEXT
    );

    CREATE TABLE IF NOT EXISTS project_team_members (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role_title TEXT NOT NULL,
      responsibility TEXT NOT NULL,
      assigned_date TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      daily_rate REAL DEFAULT 0,
      status TEXT DEFAULT 'Active'
    );
  `);

  try { db.exec(`ALTER TABLE tenders ADD COLUMN client_id TEXT DEFAULT ''`); } catch (e) {}
  try { db.exec(`ALTER TABLE tenders ADD COLUMN tender_fee REAL DEFAULT 0`); } catch (e) {}
  try { db.exec(`ALTER TABLE tenders ADD COLUMN eligibility TEXT DEFAULT ''`); } catch (e) {}
  try { db.exec(`ALTER TABLE tenders ADD COLUMN docs_checklist TEXT DEFAULT ''`); } catch (e) {}
  try { db.exec(`ALTER TABLE tenders ADD COLUMN loss_reason TEXT DEFAULT ''`); } catch (e) {}
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

function createLeadRecord(f) {
  const today = getConfig('today', new Date().toISOString().slice(0, 10));
  const countRow = db.prepare('SELECT COUNT(*) as c FROM leads').get();
  const id = f.id || ('LD-' + String(countRow.c + 101));
  db.prepare(`
    INSERT INTO leads (id, title, client_name, contact_person, phone, email, source, est_value, location, assigned_to, status, notes, created_at, converted_client_id, converted_opp_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, f.title, f.client_name, f.contact_person || '', f.phone || '', f.email || '',
    f.source || 'Website Enquiry', Number(f.est_value) || 0, f.location || '',
    f.assigned_to || 'Rajesh Sharma (BDM)', f.status || 'New', f.notes || '',
    f.created_at || today, f.converted_client_id || '', f.converted_opp_id || ''
  );
  logAudit(`Lead created: ${id} - ${f.title} (${f.client_name})`);
  return id;
}

function qualifyLeadRecord(leadId, clientData = {}, oppData = {}) {
  const today = getConfig('today', new Date().toISOString().slice(0, 10));
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
  if (!lead) throw new Error('Lead not found');

  // Check or create client
  let clientId = lead.converted_client_id;
  if (!clientId) {
    const existingClient = db.prepare('SELECT id FROM clients WHERE name = ? COLLATE NOCASE').get(clientData.name || lead.client_name);
    if (existingClient) {
      clientId = existingClient.id;
    } else {
      const clientCount = db.prepare('SELECT COUNT(*) as c FROM clients').get().c;
      clientId = 'CL-' + String(clientCount + 101);
      db.prepare(`
        INSERT INTO clients (id, name, contact_person, designation, phone, email, address, city, gstin, pan, tier, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        clientId, clientData.name || lead.client_name, clientData.contact_person || lead.contact_person,
        clientData.designation || 'Project Director', clientData.phone || lead.phone, clientData.email || lead.email,
        clientData.address || (lead.location || 'Plot 42, Harbour Corridor'), clientData.city || 'Visakhapatnam',
        clientData.gstin || '37AABCA1234F1Z8', clientData.pan || 'AABCA1234F', clientData.tier || 'Tier 1 Enterprise',
        'Active', today
      );
      logAudit(`Client registered from lead: ${clientId} - ${lead.client_name}`);
    }
  }

  // Create Opportunity
  const oppCount = db.prepare('SELECT COUNT(*) as c FROM opportunities').get().c;
  const oppId = 'OPP-' + String(oppCount + 101);
  db.prepare(`
    INSERT INTO opportunities (id, lead_id, client_id, client_name, title, scope, est_val, stage, win_prob, responsible_mgr, expected_close, status, converted_project_id, tender_id, bid_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    oppId, leadId, clientId, lead.client_name, oppData.title || lead.title,
    oppData.scope || 'Civil, Structural RCC, MEP & Architectural Finishes',
    Number(oppData.est_val) || lead.est_value, oppData.stage || 'Qualification',
    Number(oppData.win_prob) || 40, oppData.responsible_mgr || lead.assigned_to,
    oppData.expected_close || addDays(today, 30), 'Active', '', '', '', today
  );

  // Update Lead
  db.prepare(`
    UPDATE leads
    SET status = 'Qualified', converted_client_id = ?, converted_opp_id = ?
    WHERE id = ?
  `).run(clientId, oppId, leadId);

  // Log activity
  const actId = uid();
  db.prepare(`
    INSERT INTO crm_activities (id, ref_id, ref_type, type, title, activity_date, conducted_by, client_attendees, summary, next_action, next_date, status)
    VALUES (?, ?, 'lead', 'Qualification', ?, ?, ?, ?, ?, ?, ?, 'Completed')
  `).run(
    actId, leadId, `Lead Qualified & Converted to ${oppId}`,
    new Date().toISOString().slice(0, 16).replace('T', ' '),
    lead.assigned_to || 'Rajesh Sharma (BDM)', lead.contact_person || lead.client_name,
    `Lead successfully validated: Feasibility confirmed, budget ₹${(lead.est_value/10000000).toFixed(2)} Cr verified, decision maker identified. Client record ${clientId} and Opportunity ${oppId} initialized.`,
    'Prepare estimation & BOQ pricing', addDays(today, 5)
  );

  logAudit(`Lead ${leadId} qualified into Client ${clientId} & Opportunity ${oppId}`);
  return { ok: true, leadId, clientId, oppId };
}

function createClientRecord(f) {
  const today = getConfig('today', new Date().toISOString().slice(0, 10));
  const countRow = db.prepare('SELECT COUNT(*) as c FROM clients').get();
  const id = f.id || ('CL-' + String(countRow.c + 101));
  db.prepare(`
    INSERT INTO clients (id, name, contact_person, designation, phone, email, address, city, gstin, pan, tier, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, f.name, f.contact_person || '', f.designation || 'Director', f.phone || '',
    f.email || '', f.address || '', f.city || 'Visakhapatnam', f.gstin || '',
    f.pan || '', f.tier || 'Tier 1 Enterprise', f.status || 'Active', f.created_at || today
  );
  logAudit(`Client created: ${id} - ${f.name}`);
  return id;
}

function createOpportunityRecord(f) {
  const today = getConfig('today', new Date().toISOString().slice(0, 10));
  const countRow = db.prepare('SELECT COUNT(*) as c FROM opportunities').get();
  const id = f.id || ('OPP-' + String(countRow.c + 101));
  db.prepare(`
    INSERT INTO opportunities (id, lead_id, client_id, client_name, title, scope, est_val, stage, win_prob, responsible_mgr, expected_close, status, converted_project_id, tender_id, bid_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, f.lead_id || '', f.client_id || '', f.client_name, f.title,
    f.scope || 'Civil, Structural RCC, MEP & Architectural Finishes',
    Number(f.est_val) || 0, f.stage || 'Identification', Number(f.win_prob) || 20,
    f.responsible_mgr || 'Rajesh Sharma (BDM)', f.expected_close || addDays(today, 30),
    f.status || 'Active', f.converted_project_id || '', f.tender_id || '', f.bid_id || '',
    f.created_at || today
  );
  logAudit(`Opportunity created: ${id} - ${f.title} (${f.client_name})`);
  return id;
}

function createBidRecord(f) {
  const today = getConfig('today', new Date().toISOString().slice(0, 10));
  const countRow = db.prepare('SELECT COUNT(*) as c FROM bids').get();
  const id = f.id || ('BID-' + String(countRow.c + 101));
  const estCost = Number(f.est_cost) || 0;
  const marginPct = Number(f.margin_pct) || 15;
  const bidPrice = Number(f.bid_price) || Math.round(estCost * (1 + marginPct / 100));

  db.prepare(`
    INSERT INTO bids (id, opp_id, tender_id, client, title, est_cost, margin_pct, bid_price, tech_proposal, fin_proposal, internal_approval, approval_by, submission_date, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, f.opp_id || '', f.tender_id || '', f.client, f.title,
    estCost, marginPct, bidPrice, f.tech_proposal || '12-Stage WBS, BBS, C35 mix design, QA/QC Plan',
    f.fin_proposal || 'Itemized BOQ with firm price clause', f.internal_approval || 'In Review',
    f.approval_by || '', f.submission_date || addDays(today, 7), f.status || 'Draft', f.notes || ''
  );

  if (f.opp_id) {
    db.prepare('UPDATE opportunities SET bid_id = ?, stage = ? WHERE id = ?').run(id, 'Proposal/Bid', f.opp_id);
  }

  logAudit(`Bid created: ${id} - ${f.title} (Quoted ₹${(bidPrice/10000000).toFixed(2)} Cr)`);
  return id;
}

function approveBidRecord(bidId, approvedBy = 'Director / CEO') {
  db.prepare(`
    UPDATE bids
    SET internal_approval = 'Approved by MD', approval_by = ?, status = 'Approved'
    WHERE id = ?
  `).run(approvedBy, bidId);
  logAudit(`Bid approved: ${bidId} by ${approvedBy}`);
  return true;
}

function submitBidRecord(bidId, submissionDate = null) {
  const today = getConfig('today', new Date().toISOString().slice(0, 10));
  const sDate = submissionDate || today;
  db.prepare(`
    UPDATE bids
    SET status = 'Submitted', submission_date = ?
    WHERE id = ?
  `).run(sDate, bidId);

  const bid = db.prepare('SELECT * FROM bids WHERE id = ?').get(bidId);
  if (bid && bid.opp_id) {
    db.prepare(`UPDATE opportunities SET stage = 'Negotiation', win_prob = 80 WHERE id = ?`).run(bid.opp_id);
  }
  if (bid && bid.tender_id) {
    db.prepare(`UPDATE tenders SET status = 'Submitted' WHERE id = ?`).run(bid.tender_id);
  }

  logAudit(`Bid submitted to client: ${bidId} on ${sDate}`);
  return true;
}

function recordBidResult(bidId, status, lossReason = '') {
  db.prepare(`
    UPDATE bids
    SET status = ?
    WHERE id = ?
  `).run(status, bidId);

  const bid = db.prepare('SELECT * FROM bids WHERE id = ?').get(bidId);
  if (bid && bid.opp_id) {
    const oppStage = status === 'Awarded' ? 'Won' : 'Lost';
    const winProb = status === 'Awarded' ? 100 : 0;
    db.prepare(`UPDATE opportunities SET stage = ?, win_prob = ? WHERE id = ?`).run(oppStage, winProb, bid.opp_id);
  }
  if (bid && bid.tender_id) {
    db.prepare(`UPDATE tenders SET status = ?, loss_reason = ? WHERE id = ?`).run(status, lossReason || '', bid.tender_id);
  }

  logAudit(`Bid result recorded: ${bidId} -> ${status} ${lossReason ? '(' + lossReason + ')' : ''}`);
  return true;
}

function convertOpportunityToProject(oppId, customData = {}) {
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(oppId);
  if (!opp) throw new Error('Opportunity not found');

  let contractVal = opp.est_val;
  if (opp.bid_id) {
    const bid = db.prepare('SELECT * FROM bids WHERE id = ?').get(opp.bid_id);
    if (bid && bid.bid_price) contractVal = bid.bid_price;
  }
  if (customData.contract) contractVal = Number(customData.contract);

  const today = getConfig('today', new Date().toISOString().slice(0, 10));

  const pId = createProjectRecord({
    name: customData.name || opp.title,
    client: customData.client || opp.client_name,
    type: customData.type || 'Commercial',
    city: customData.city || 'Visakhapatnam',
    addr: customData.addr || 'Harbour Road, Port Access Corridor',
    lat: customData.lat || 17.6868,
    lng: customData.lng || 83.2185,
    radius: 150,
    area: customData.area || 4500,
    floors: customData.floors || 8,
    contract: contractVal,
    start: today,
    team: ['u2', 'u3', 'u4', 'u5', 'u6']
  });

  // Update opportunity
  db.prepare(`
    UPDATE opportunities
    SET stage = 'Won', status = 'Converted', converted_project_id = ?
    WHERE id = ?
  `).run(pId, oppId);

  // If tender linked, update tender status
  if (opp.tender_id) {
    db.prepare(`UPDATE tenders SET status = 'Awarded' WHERE id = ?`).run(opp.tender_id);
  }

  // If bid linked, update bid status
  if (opp.bid_id) {
    db.prepare(`UPDATE bids SET status = 'Awarded' WHERE id = ?`).run(opp.bid_id);
  }

  // Log CRM Activity
  const actId = uid();
  db.prepare(`
    INSERT INTO crm_activities (id, ref_id, ref_type, type, title, activity_date, conducted_by, client_attendees, summary, next_action, next_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    actId, oppId, 'opportunity', 'Project Conversion',
    `Converted to Active Project ${pId}`,
    new Date().toISOString().slice(0, 16).replace('T', ' '),
    'System / BDM',
    opp.client_name,
    `Successfully converted business opportunity to active enterprise project ${pId} (${customData.name || opp.title}) with ₹${(contractVal/10000000).toFixed(2)} Cr contract value and 12-stage WBS.`,
    'Execute Mobilization & Site Setup',
    addDays(today, 7),
    'Completed'
  );

  logAudit(`Opportunity ${oppId} converted to Active Project ${pId} (${opp.client_name} - ₹${(contractVal/10000000).toFixed(2)} Cr)`, pId);
  sendWA('pm', `🚀 Opportunity Converted! Project ${pId} (${opp.title}) for client ${opp.client_name} is now active with ₹${(contractVal/10000000).toFixed(2)} Cr budget and 12 WBS stages.`, { act: 'viewProject', pid: pId });

  return { ok: true, projectId: pId, oppId };
}

function logCRMActivity(f) {
  const today = getConfig('today', new Date().toISOString().slice(0, 10));
  const id = f.id || uid();
  db.prepare(`
    INSERT INTO crm_activities (id, ref_id, ref_type, type, title, activity_date, conducted_by, client_attendees, summary, next_action, next_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, f.ref_id, f.ref_type || 'opportunity', f.type || 'Meeting', f.title,
    f.activity_date || (new Date().toISOString().slice(0, 16).replace('T', ' ')),
    f.conducted_by || 'Rajesh Sharma (BDM)', f.client_attendees || '',
    f.summary, f.next_action || '', f.next_date || addDays(today, 3), f.status || 'Completed'
  );
  logAudit(`CRM Activity logged: ${f.title} (${f.type})`);
  return id;
}

function createTaskRecord(f) {
  const today = getConfig('today', new Date().toISOString().slice(0, 10));
  const id = f.id || ('TSK-' + uid());
  const assignedUser = db.prepare('SELECT name, role FROM users WHERE id = ?').get(f.assigned_to);
  const assignedName = f.assigned_name || (assignedUser ? assignedUser.name : f.assigned_to);
  const assignedRole = f.assigned_role || (assignedUser ? assignedUser.role : 'Site Staff');
  
  db.prepare(`
    INSERT INTO project_tasks (id, project_id, name, assigned_to, assigned_name, assigned_role, start_date, due_date, priority, status, progress, weight, photo, remarks, delay_reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, f.project_id, f.name, f.assigned_to, assignedName, assignedRole,
    f.start_date || today, f.due_date || addDays(today, 7),
    f.priority || 'Medium', f.status || 'Not Started',
    Number(f.progress) || 0, Number(f.weight) || 10,
    f.photo || '', f.remarks || '', f.delay_reason || '', today
  );

  logAudit(`Task created: ${f.name} assigned to ${assignedName}`, f.project_id);
  sendWA('pm', `📋 New Task Assigned: "${f.name}" to ${assignedName} (Due: ${f.due_date || addDays(today, 7)})`, { act: 'viewTasks', pid: f.project_id });
  return id;
}

function updateTaskProgress(taskId, progress, status, remarks, photo, delayReason) {
  const today = getConfig('today', new Date().toISOString().slice(0, 10));
  const task = db.prepare('SELECT * FROM project_tasks WHERE id = ?').get(taskId);
  if (!task) return null;

  const newProg = Math.min(100, Math.max(0, Number(progress) !== undefined ? Number(progress) : task.progress));
  let newStatus = status || task.status;
  if (newProg === 100 && newStatus !== 'Completed') newStatus = 'Completed';
  if (newProg > 0 && newProg < 100 && newStatus === 'Not Started') newStatus = 'In Progress';

  db.prepare(`
    UPDATE project_tasks 
    SET progress = ?, status = ?, remarks = COALESCE(?, remarks), photo = COALESCE(?, photo), delay_reason = COALESCE(?, delay_reason), completed_at = ?
    WHERE id = ?
  `).run(
    newProg, newStatus, remarks || null, photo || null, delayReason || null,
    newStatus === 'Completed' ? today : null,
    taskId
  );

  logAudit(`Task updated: ${task.name} → ${newProg}% (${newStatus})`, task.project_id);
  if (newStatus === 'Delayed') {
    sendWA('pm', `⚠️ Task Delay Escalation: "${task.name}" is Delayed. Reason: ${delayReason || 'Unspecified'}`, { act: 'viewTasks', pid: task.project_id });
  } else if (newStatus === 'Completed') {
    sendWA('pm', `✅ Task Completed: "${task.name}" marked 100% by ${task.assigned_name}`, { act: 'viewTasks', pid: task.project_id });
  }
  return true;
}

function updateTaskStatus(taskId, status, delayReason) {
  const today = getConfig('today', new Date().toISOString().slice(0, 10));
  const task = db.prepare('SELECT * FROM project_tasks WHERE id = ?').get(taskId);
  if (!task) return null;

  const prog = status === 'Completed' ? 100 : (status === 'Not Started' ? 0 : task.progress);
  db.prepare(`
    UPDATE project_tasks 
    SET status = ?, progress = ?, delay_reason = ?, completed_at = ?
    WHERE id = ?
  `).run(status, prog, delayReason || null, status === 'Completed' ? today : null, taskId);

  logAudit(`Task status changed: ${task.name} → ${status}`, task.project_id);
  return true;
}

function createMilestoneRecord(m) {
  const id = m.id || ('MLS-' + uid());
  db.prepare(`
    INSERT INTO project_milestones (id, project_id, name, target_date, status, billing_pct, weight, achieved_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, m.project_id, m.name, m.target_date, m.status || 'Pending',
    Number(m.billing_pct) || 10, Number(m.weight) || 15, m.achieved_date || null
  );
  logAudit(`Milestone created: ${m.name}`, m.project_id);
  return id;
}

function achieveMilestoneRecord(mstoneId) {
  const today = getConfig('today', new Date().toISOString().slice(0, 10));
  const m = db.prepare('SELECT * FROM project_milestones WHERE id = ?').get(mstoneId);
  if (!m) return null;

  db.prepare('UPDATE project_milestones SET status = "Achieved", achieved_date = ? WHERE id = ?').run(today, mstoneId);
  
  const proj = db.prepare('SELECT * FROM projects WHERE id = ?').get(m.project_id);
  if (proj && m.billing_pct > 0) {
    const invAmt = Math.round(proj.contract * (m.billing_pct / 100));
    const invId = 'INV-' + uid();
    db.prepare('INSERT INTO invoices (id, project_id, k, desc, amt, status, d) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(invId, m.project_id, 0, `Milestone Billing – ${m.name} (${m.billing_pct}%)`, invAmt, 'Pending', today);
    logAudit(`Milestone achieved: ${m.name} → Raised invoice ₹${invAmt.toLocaleString('en-IN')}`, m.project_id);
    sendWA('acc', `💰 Milestone "${m.name}" achieved – invoice raised for ${proj.name}`, { act: 'viewInvoices', pid: m.project_id });
  }

  sendWA('pm', `🏆 Milestone Achieved: "${m.name}" marked complete for project ${m.project_id}!`, { act: 'viewMilestones', pid: m.project_id });
  return true;
}

function assignProjectTeamMember(tm) {
  const today = getConfig('today', new Date().toISOString().slice(0, 10));
  const id = tm.id || ('TM-' + uid());
  db.prepare(`
    INSERT OR REPLACE INTO project_team_members (id, project_id, user_id, name, role_title, responsibility, assigned_date, phone, email, daily_rate, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, tm.project_id, tm.user_id, tm.name, tm.role_title, tm.responsibility,
    tm.assigned_date || today, tm.phone || '', tm.email || '', Number(tm.daily_rate) || 0, tm.status || 'Active'
  );
  logAudit(`Team member assigned: ${tm.name} as ${tm.role_title}`, tm.project_id);
  return id;
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
    DELETE FROM leads;
    DELETE FROM clients;
    DELETE FROM opportunities;
    DELETE FROM bids;
    DELETE FROM crm_activities;
    DELETE FROM project_tasks;
    DELETE FROM project_milestones;
    DELETE FROM project_team_members;
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

  // CRM & Tender Module Seed
  // 1. Leads
  const insertLead = db.prepare(`
    INSERT INTO leads (id, title, client_name, contact_person, phone, email, source, est_value, location, assigned_to, status, notes, created_at, converted_client_id, converted_opp_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertLead.run(
    'LD-101', 'Commercial Complex G+8 Harbour Road', 'ABC Infrastructure Pvt. Ltd.',
    'Mr. Vikram Adani (Director - Projects)', '+91 98490 12345', 'vadani@abcinfra.com',
    'Direct Enquiry', 50000000, 'Visakhapatnam, Andhra Pradesh', 'Rajesh Sharma (BDM)',
    'Qualified', 'Turnkey Civil + Structural + MEP package. Client budget ₹5.00 Cr verified. Technical drawings submitted.',
    addDays(today, -30), 'CL-101', 'OPP-101'
  );
  insertLead.run(
    'LD-102', 'Luxury Waterfront Villas (12 Units)', 'Marina Coastal Living',
    'Mr. P. Venkat Rao', '+91 94401 56789', 'pvr@marinacoastal.com',
    'Referral', 36000000, 'Bheemili Beach Road, Vizag', 'K. Jagannath (BDM)',
    'Contacted', 'Site visit completed. Soil investigation report received. Architectural concept drawings in progress.',
    addDays(today, -12), '', ''
  );
  insertLead.run(
    'LD-103', 'Pharma Cleanroom Production Block C', 'Hetero BioSciences Ltd.',
    'Dr. C. N. Reddy (VP Ops)', '+91 891 2789100', 'cnreddy@heterobio.com',
    'Industrial Trade Expo', 82000000, 'Parawada Pharma City, Vizag', 'Rajesh Sharma (BDM)',
    'New', 'cGMP compliant heavy-duty cleanroom facility. Pre-qualification queries raised.',
    addDays(today, -3), '', ''
  );
  insertLead.run(
    'LD-104', 'Warehouse & Multimodal Logistics Hub 50,000 sqft', 'Gati-KWE Logistics',
    'Mr. Amitav Ghosh (Head Projects)', '+91 98200 44556', 'aghosh@gatikwe.com',
    'Website Enquiry', 24000000, 'Anakapalli Industrial Corridor', 'K. Jagannath (BDM)',
    'Contacted', 'Pre-engineered steel building (PEB) design with laser-screed FM2 concrete floor.',
    addDays(today, -7), '', ''
  );

  // 2. Clients
  const insertClient = db.prepare(`
    INSERT INTO clients (id, name, contact_person, designation, phone, email, address, city, gstin, pan, tier, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertClient.run(
    'CL-101', 'ABC Infrastructure Pvt. Ltd.', 'Mr. Vikram Adani', 'Director (Projects & Infrastructure)',
    '+91 98490 12345', 'vadani@abcinfra.com', 'Plot 42, Port Access Corridor, Harbour Road',
    'Visakhapatnam', '37AABCA1234F1Z8', 'AABCA1234F', 'Tier 1 Enterprise', 'Active', addDays(today, -28)
  );
  insertClient.run(
    'CL-102', 'AP CRDA Amaravati', 'Superintending Engineer (Buildings)', 'Chief Authority',
    '+91 866 2424100', 'se.buildings@apcrda.gov.in', 'CRDA Headquarters, Lenin Center, Governorpet',
    'Vijayawada', '37AAAGA0001E1ZU', 'AAAGA0001E', 'Government PSU', 'Active', addDays(today, -90)
  );
  insertClient.run(
    'CL-103', 'Sri Constructions & Developers', 'Mr. R. Chowdary', 'Managing Director',
    '+91 891 2541234', 'info@sriconstructions.com', 'MVP Colony, Sector 4',
    'Visakhapatnam', '37AABCS5678K1Z2', 'AABCS5678K', 'Tier 2 Commercial', 'Active', addDays(today, -150)
  );
  insertClient.run(
    'CL-104', 'Skyline Developers LLP', 'Mr. K. Varma', 'Partner',
    '+91 98480 99887', 'varma@skylinedev.in', 'Road No. 10, Banjara Hills',
    'Hyderabad', '36AABFS9999M1ZQ', 'AABFS9999M', 'Tier 1 Enterprise', 'Active', addDays(today, -200)
  );

  // 3. Tenders
  const insertTender = db.prepare(`
    INSERT INTO tenders (id, title, client, client_id, type, val, emd, tender_fee, sub_date, eligibility, docs_checklist, status, loss_reason, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertTender.run(
    'T-2026-04', 'Visakhapatnam Port Commercial Complex G+8', 'ABC Infrastructure Pvt. Ltd.', 'CL-101',
    'Commercial EPC', 50000000, 1000000, 25000, addDays(today, -5),
    'Eligible - Meets turnover & tech criteria',
    'Audited Balance Sheets (3 yrs), EMD Bank Guarantee ₹10L, Solvency Cert (₹10 Cr), Tech Credentials for G+8',
    'Awarded', '', 'Tender officially awarded to Siyantech Global at ₹4.85 Cr after commercial negotiations. Letter of Award (LoA) issued.'
  );
  insertTender.run(
    'T-2026-01', 'Govt Secretariat IT Tower Phase 2', 'AP CRDA Amaravati', 'CL-102',
    'Commercial EPC', 145000000, 1450000, 50000, addDays(today, 25),
    'Eligible - Joint Venture / EPC Consortium',
    'Prequalification documents, JV Agreement, Financial capability certificate, Past 5-year works',
    'Bidding', '', 'Technical bid pre-qualification document under review. BOQ estimation underway.'
  );
  insertTender.run(
    'T-2026-02', 'Smart City Water Distribution Network', 'GVMC Vizag', 'CL-103',
    'Infrastructure', 48000000, 480000, 15000, addDays(today, 8),
    'Eligible - Direct Class-1 Civil Contractor',
    'EMD BG ₹4.8L, ISO 9001, Past Pipeline Execution Cert',
    'Submitted', '', 'EMD submitted via Bank Guarantee. Commercial bid opening scheduled for Friday.'
  );
  insertTender.run(
    'T-2026-03', 'Highway Flyover & Underpass Junction', 'NHAI', '',
    'Infrastructure', 92000000, 920000, 30000, addDays(today, -15),
    'Eligible',
    'Highway credentials, machinery ownership proofs, audited reports',
    'Lost', 'Price difference - L1 bidder quoted 7.2% below our cost estimate',
    'Debrief complete: L1 quoted aggressive prices on steel reinforcement.'
  );

  // 4. Opportunities
  const insertOpp = db.prepare(`
    INSERT INTO opportunities (id, lead_id, client_id, client_name, title, scope, est_val, stage, win_prob, responsible_mgr, expected_close, status, converted_project_id, tender_id, bid_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertOpp.run(
    'OPP-101', 'LD-101', 'CL-101', 'ABC Infrastructure Pvt. Ltd.', 'ABC Commercial Hub Construction (G+8)',
    'Turnkey Civil, Structural RCC, MEP & Architectural Finishes for 4,500 sq.m G+8 office tower',
    50000000, 'Won', 100, 'Rajesh Sharma (BDM)', addDays(today, -2), 'Won', '',
    'T-2026-04', 'BID-101', addDays(today, -25)
  );
  insertOpp.run(
    'OPP-102', 'LD-102', '', 'Marina Coastal Living', 'Bheemili Waterfront Luxury Villas',
    'G+2 Villas Civil Structure, Swimming Pools, Landscaping',
    36000000, 'Proposal/Bid', 70, 'K. Jagannath (BDM)', addDays(today, 18), 'Active', '',
    '', 'BID-102', addDays(today, -10)
  );
  insertOpp.run(
    'OPP-103', 'LD-103', '', 'Hetero BioSciences Ltd.', 'Cleanroom Production Block C',
    'Industrial RCC Superstructure, Cleanroom Partitioning, HVAC Ducting',
    82000000, 'Qualification', 45, 'Rajesh Sharma (BDM)', addDays(today, 45), 'Active', '',
    '', '', addDays(today, -2)
  );

  // 5. Bids
  const insertBid = db.prepare(`
    INSERT INTO bids (id, opp_id, tender_id, client, title, est_cost, margin_pct, bid_price, tech_proposal, fin_proposal, internal_approval, approval_by, submission_date, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertBid.run(
    'BID-101', 'OPP-101', 'T-2026-04', 'ABC Infrastructure Pvt. Ltd.',
    'Commercial Building G+8 Turnkey Civil & MEP', 41200000, 17.7, 48500000,
    'Full 12-stage WBS, Bar Bending Schedule, C35/40 High-grade mix design, 3D BIM coordination, HSE & Quality protocols',
    'Itemized BOQ with firm price clause for 12 months, 10% mobilization advance against BG, 5% retention',
    'Approved by MD', 'Director / CEO', addDays(today, -10), 'Awarded',
    'Submitted bid ₹4.92 Cr revised to ₹4.85 Cr during negotiation meeting. Tender awarded to Siyantech.'
  );
  insertBid.run(
    'BID-102', 'OPP-102', '', 'Marina Coastal Living',
    '12 Waterfront Villas Turnkey Works', 29800000, 18.1, 35200000,
    'Coastal grade anti-corrosion concrete treatment, VRV air conditioning, swimming pool waterproofing',
    'Stage-wise milestone payments based on slab completion',
    'Approved by MD', 'Director / CEO', addDays(today, -2), 'Submitted',
    'Presented to client steering committee. Client requested 5-day evaluation window.'
  );
  insertBid.run(
    'BID-103', '', 'T-2026-01', 'AP CRDA Amaravati',
    'Govt Secretariat IT Tower Phase 2', 124000000, 14.5, 142000000,
    'High-rise jump-form shuttering methodology, green building GRIHA-4 compliance',
    'Standard Govt CPWD item rate contract with quarterly price escalation formula',
    'In Review', 'Pending Board Review', addDays(today, 20), 'Draft',
    'BOQ pricing 80% finalized. Bar bending schedules under review by Engineering team.'
  );

  // 6. CRM Activities
  const insertAct = db.prepare(`
    INSERT INTO crm_activities (id, ref_id, ref_type, type, title, activity_date, conducted_by, client_attendees, summary, next_action, next_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertAct.run(
    'ACT-101', 'OPP-101', 'opportunity', 'Negotiation', 'Commercial Price Finalization & Contract Scope Signoff',
    addDays(today, -3) + ' 14:30', 'Rajesh Sharma (BDM) & Suresh Nair (VP Projects)',
    'Mr. Vikram Adani (Director) & Chief Financial Officer',
    'Finalized contract price at ₹4.85 Cr (revised from ₹4.92 Cr). ABC Infra confirmed 10% mobilization advance against Bank Guarantee. Letter of Award (LoA) officially handed over!',
    'Initiate 1-Click Project Conversion and mobilize site engineer team', today, 'Completed'
  );
  insertAct.run(
    'ACT-102', 'OPP-101', 'opportunity', 'Meeting', 'Technical Proposal Presentation & Value Engineering',
    addDays(today, -8) + ' 11:00', 'Rajesh Sharma & Sr. Structural Engineer',
    'Mr. Vikram Adani & Client PM Team',
    'Presented structural optimization for G+8 column grid, reducing steel consumption by 6% without compromising seismic load bearing capacity.',
    'Submit revised commercial offer', addDays(today, -5), 'Completed'
  );
  insertAct.run(
    'ACT-103', 'LD-102', 'lead', 'Site Visit', 'Bheemili Beach Road Topographical & Soil Inspection',
    addDays(today, -4) + ' 10:00', 'K. Jagannath & Geotechnical Surveyor',
    'Mr. P. Venkat Rao',
    'Inspected soil contour and high-tide buffer zones. Client satisfied with boundary assessment and coastal setback clearance.',
    'Submit revised architectural layout', addDays(today, 2), 'Completed'
  );
  insertAct.run(
    'ACT-104', 'OPP-103', 'opportunity', 'Phone Call', 'Pre-RFP Clarification with Hetero Bio Engineering Dept',
    addDays(today, -1) + ' 16:00', 'Rajesh Sharma',
    'Dr. C. N. Reddy',
    'Discussed pharma cleanroom HVAC specifications, HEPA filtration levels and AHU ducting loads for Block C.',
    'Prepare pre-qualification docket', addDays(today, 4), 'Scheduled'
  );

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

  // Seed Project Tasks (Matching Section 4.C Specification)
  const insertTask = db.prepare(`
    INSERT INTO project_tasks (id, project_id, name, assigned_to, assigned_name, assigned_role, start_date, due_date, priority, status, progress, weight, photo, remarks, delay_reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertTask.run(
    'TSK-101', 'P003', 'Site preparation & boundary barricading', 'u4', 'Suresh (Supervisor)', 'Site Supervisor',
    addDays(today, -15), addDays(today, -5), 'High', 'Completed', 100, 15,
    'https://images.unsplash.com/photo-1541888946425-d0fbb18f15f7?w=300',
    'Site cleared, boundary hoarding erected, temporary water and power connections verified.', '', addDays(today, -18)
  );
  insertTask.run(
    'TSK-102', 'P003', 'Deep foundation excavation & trenching', 'u3', 'Anitha Rao', 'Site Engineer',
    addDays(today, -6), addDays(today, 2), 'Urgent', 'In Progress', 85, 20,
    'https://images.unsplash.com/photo-1581094288338-2314dddb7ece?w=300',
    'Excavation depth 4.5m achieved. Sub-grade levelling and dewatering pumps active.', '', addDays(today, -7)
  );
  insertTask.run(
    'TSK-103', 'P003', 'PCC bed & Foundation raft rebar binding', 'u3', 'Anitha Rao', 'Site Engineer',
    addDays(today, 1), addDays(today, 12), 'High', 'In Progress', 35, 25,
    '', 'PCC M15 bed completed. Bottom reinforcement mat tying started as per DWG-STR-201.', '', addDays(today, -1)
  );
  insertTask.run(
    'TSK-104', 'P003', 'Column starter casting & shear wall rebar', 'u4', 'Suresh (Supervisor)', 'Site Supervisor',
    addDays(today, 10), addDays(today, 22), 'Normal', 'Not Started', 0, 20,
    '', 'Shuttering plywood inspection pending. Rebar couplers staged at yard.', '', today
  );
  insertTask.run(
    'TSK-105', 'P003', 'Basement roof slab shuttering & casting', 'u2', 'Ravi Kumar', 'Project Manager',
    addDays(today, 20), addDays(today, 32), 'Urgent', 'Not Started', 0, 20,
    '', 'RMC batching plant calibration confirmed. RERA inspection scheduled prior to pour.', '', today
  );
  insertTask.run(
    'TSK-106', 'P002', 'External plastering & Weather-coat paint', 'u4', 'Suresh (Supervisor)', 'Site Supervisor',
    addDays(today, -10), addDays(today, -2), 'Urgent', 'Delayed', 45, 15,
    '', 'Work delayed due to unseasonal rain and scaffold re-anchoring.', 'Weather & high wind delays', addDays(today, -12)
  );
  insertTask.run(
    'TSK-107', 'P004', 'Commercial retail basement excavation', 'u3', 'Anitha Rao', 'Site Engineer',
    addDays(today, -5), addDays(today, 8), 'High', 'In Progress', 60, 25,
    '', 'Retaining wall piling 70% complete. Soil disposal trucks operational.', '', addDays(today, -6)
  );

  // Seed Project Milestones (Matching Section 4.D Specification)
  const insertMstone = db.prepare(`
    INSERT INTO project_milestones (id, project_id, name, target_date, status, billing_pct, weight, achieved_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertMstone.run('MLS-101', 'P003', 'Site Preparation & Statutory NOCs', addDays(today, -10), 'Achieved', 10, 15, addDays(today, -8));
  insertMstone.run('MLS-102', 'P003', 'Substructure & Raft Foundation Completion', addDays(today, 15), 'Pending', 15, 25, null);
  insertMstone.run('MLS-103', 'P003', 'Ground Floor Slab & Plinth Casting', addDays(today, 45), 'Pending', 20, 20, null);
  insertMstone.run('MLS-104', 'P003', 'Superstructure G+8 Structural Topping Out', addDays(today, 120), 'Pending', 25, 25, null);
  insertMstone.run('MLS-105', 'P003', 'Final Finishing, MEP Testing & Handover', addDays(today, 180), 'Pending', 10, 15, null);

  // Seed Project Team Members (Matching Section 4.E Specification)
  const insertTeamMem = db.prepare(`
    INSERT INTO project_team_members (id, project_id, user_id, name, role_title, responsibility, assigned_date, phone, email, daily_rate, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertTeamMem.run('TM-101', 'P003', 'u1', 'Mohan S.', 'Project Director', 'Overall project monitoring, budget governance & client steering approvals', addDays(today, -60), '+91 98490 11001', 'director@siyantech.com', 0, 'Active');
  insertTeamMem.run('TM-102', 'P003', 'u2', 'Ravi Kumar', 'Project Manager', 'Project execution, schedule management, site safety & QA/QC signoffs', addDays(today, -60), '+91 98490 22002', 'ravi.pm@siyantech.com', 3500, 'Active');
  insertTeamMem.run('TM-103', 'P003', 'u3', 'Anitha Rao', 'Site Engineer', 'Technical activity execution, rebar checks, concrete cube tests & DPR entry', addDays(today, -60), '+91 98490 33003', 'anitha.eng@siyantech.com', 2200, 'Active');
  insertTeamMem.run('TM-104', 'P003', 'u4', 'Suresh (Supervisor)', 'Site Supervisor', 'Daily labour gang coordination, shuttering supervision & material issue', addDays(today, -60), '+91 98490 44004', 'suresh.site@siyantech.com', 1500, 'Active');
  insertTeamMem.run('TM-105', 'P003', 'u8', 'K. Naresh', 'Planning Engineer', 'WBS schedules, 4D BIM timeline, critical path analysis & milestone tracking', addDays(today, -60), '+91 98490 88008', 'naresh.plan@siyantech.com', 2500, 'Active');
  insertTeamMem.run('TM-106', 'P003', 'u9', 'M. Varma', 'Quantity Surveyor', 'BOQ quantities, BBS steel reconciliation, site measurements & RA client bills', addDays(today, -60), '+91 98490 99009', 'varma.qs@siyantech.com', 2400, 'Active');

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
  const leads = db.prepare('SELECT * FROM leads ORDER BY rowid ASC').all();
  const clients = db.prepare('SELECT * FROM clients ORDER BY rowid ASC').all();
  const opportunities = db.prepare('SELECT * FROM opportunities ORDER BY rowid ASC').all();
  const bids = db.prepare('SELECT * FROM bids ORDER BY rowid ASC').all();
  const crmActivities = db.prepare('SELECT * FROM crm_activities ORDER BY rowid DESC').all();
  const tasks = db.prepare('SELECT * FROM project_tasks ORDER BY rowid ASC').all();
  const milestones = db.prepare('SELECT * FROM project_milestones ORDER BY rowid ASC').all();
  const teamMembers = db.prepare('SELECT * FROM project_team_members ORDER BY rowid ASC').all();

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
    snags,
    leads,
    clients,
    opportunities,
    bids,
    crmActivities,
    tasks,
    milestones,
    teamMembers
  };
}

// Check if database needs initial seeding
initSchema();
const projCount = db.prepare('SELECT COUNT(*) as c FROM projects').get().c;
const tenderCount = db.prepare('SELECT COUNT(*) as c FROM tenders').get().c;
const docCount = db.prepare('SELECT COUNT(*) as c FROM documents_tbl').get().c;
let leadCount = 0;
let taskCount = 0;
try {
  leadCount = db.prepare('SELECT COUNT(*) as c FROM leads').get().c;
  taskCount = db.prepare('SELECT COUNT(*) as c FROM project_tasks').get().c;
} catch (e) {
  leadCount = 0;
  taskCount = 0;
}

if (projCount === 0 || tenderCount === 0 || docCount === 0 || leadCount === 0 || taskCount === 0) {
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
  createLeadRecord,
  qualifyLeadRecord,
  createClientRecord,
  createOpportunityRecord,
  createBidRecord,
  approveBidRecord,
  submitBidRecord,
  recordBidResult,
  convertOpportunityToProject,
  logCRMActivity,
  createTaskRecord,
  updateTaskProgress,
  updateTaskStatus,
  createMilestoneRecord,
  achieveMilestoneRecord,
  assignProjectTeamMember,
  uid,
  addDays,
  MATS,
  TPL,
  USERS,
  TRADES,
  CITIES
};
