const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const dbLayer = require('./db.js');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function parseJSON(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

function sendJSON(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function sendText(res, text, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(text);
}

function serveStatic(req, res, filePath) {
  let fPath = filePath;
  if (fPath === '/' || fPath === '') fPath = '/index.html';
  const fullPath = path.join(PUBLIC_DIR, fPath);

  // Security check
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(fullPath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };

  fs.stat(fullPath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA
      const indexFallback = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(indexFallback, (err2, content) => {
        if (err2) {
          res.writeHead(404);
          res.end('Not Found');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(content);
        }
      });
      return;
    }

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(fullPath).pipe(res);
  });
}

function getActiveRole() {
  const activeUserId = dbLayer.getConfig('me', 'u1');
  const user = dbLayer.db.prepare('SELECT role FROM users WHERE id = ?').get(activeUserId);
  return user ? user.role : 'owner';
}

function checkPerm(res, action) {
  const role = getActiveRole();
  if (role === 'owner') return true; // Owner has all permissions across all modules
  const PERM_ROLES = {
    createProject: ['pm'],
    team: ['pm'],
    stage: ['pm'],
    handover: ['pm'],
    dprApprove: ['pm'],
    approve: ['pm'],
    raisePR: ['pm', 'eng', 'sup', 'store'],
    po: ['pm', 'acc', 'store'],
    grn: ['store', 'pm'],
    dpr: ['eng', 'sup', 'pm'],
    labour: ['eng', 'sup', 'pm'],
    qa: ['qa', 'pm', 'eng'],
    bill: ['acc'],
    expense: ['acc', 'pm'],
    contracts: ['pm', 'acc'],
    drawings: ['pm', 'eng', 'qa'],
    tenders: ['pm'],
    equipment: ['pm', 'sup'],
    documents: ['pm', 'eng', 'qa', 'acc', 'store'],
    crm: ['pm']
  };
  const allowed = PERM_ROLES[action] || [];
  if (!allowed.includes(role)) {
    sendJSON(res, { ok: false, error: `Permission Denied: '${action}' is restricted for role '${role}'. Owner or authorized role required.` }, 403);
    return false;
  }
  return true;
}

async function requestHandler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // API Router
  if (pathname.startsWith('/api/')) {
    try {
      // 1. Get full state
      if (pathname === '/api/state' && req.method === 'GET') {
        return sendJSON(res, dbLayer.getFullState());
      }

      // 2. Create Project
      if (pathname === '/api/projects' && req.method === 'POST') {
        if (!checkPerm(res, 'createProject')) return;
        const body = await parseJSON(req);
        const pId = dbLayer.createProjectRecord(body);
        dbLayer.setConfig('ap', pId);
        return sendJSON(res, { ok: true, id: pId, state: dbLayer.getFullState() });
      }

      // 3. Assign team
      const teamMatch = pathname.match(/^\/api\/projects\/([^/]+)\/team$/);
      if (teamMatch && req.method === 'POST') {
        if (!checkPerm(res, 'team')) return;
        const pId = teamMatch[1];
        const body = await parseJSON(req);
        dbLayer.db.prepare('UPDATE projects SET team = ? WHERE id = ?').run(JSON.stringify(body.team || []), pId);
        dbLayer.logAudit(`Team updated: ${(body.team || []).join(', ')}`, pId);
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      // 4. Start Stage
      const startMatch = pathname.match(/^\/api\/projects\/([^/]+)\/stages\/(\d+)\/start$/);
      if (startMatch && req.method === 'POST') {
        if (!checkPerm(res, 'stage')) return;
        const pId = startMatch[1];
        const k = parseInt(startMatch[2], 10);
        const today = dbLayer.getConfig('today');
        
        // Ensure previous stage is done if k > 0
        if (k > 0) {
          const prev = dbLayer.db.prepare('SELECT status FROM stages WHERE project_id = ? AND k = ?').get(pId, k - 1);
          if (prev && prev.status !== 'DONE') {
            return sendJSON(res, { ok: false, error: 'Previous stage must be complete first' }, 400);
          }
        }

        const stage = dbLayer.db.prepare('SELECT name FROM stages WHERE project_id = ? AND k = ?').get(pId, k);
        dbLayer.db.prepare('UPDATE stages SET status = "IP", "as" = ? WHERE project_id = ? AND k = ?').run(today, pId, k);
        dbLayer.db.prepare('UPDATE projects SET status = "In Progress" WHERE id = ? AND status = "Planning"').run(pId);
        dbLayer.logAudit(`Stage started: ${stage ? stage.name : k}`, pId);
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      // 5. Complete Stage
      const doneMatch = pathname.match(/^\/api\/projects\/([^/]+)\/stages\/(\d+)\/complete$/);
      if (doneMatch && req.method === 'POST') {
        if (!checkPerm(res, 'stage')) return;
        const pId = doneMatch[1];
        const k = parseInt(doneMatch[2], 10);
        const today = dbLayer.getConfig('today');

        const stage = dbLayer.db.prepare('SELECT * FROM stages WHERE project_id = ? AND k = ?').get(pId, k);
        const proj = dbLayer.db.prepare('SELECT * FROM projects WHERE id = ?').get(pId);

        if (!stage) return sendJSON(res, { ok: false, error: 'Stage not found' }, 404);
        if (stage.prog < 100) return sendJSON(res, { ok: false, error: 'Progress must be 100%' }, 400);

        // Check QA requirement
        if (stage.qa) {
          const insp = dbLayer.db.prepare('SELECT res FROM inspections WHERE project_id = ? AND k = ? AND res = "Passed"').get(pId, k);
          if (!insp) return sendJSON(res, { ok: false, error: 'QA approval required first' }, 400);
        }

        dbLayer.db.prepare('UPDATE stages SET status = "DONE", "ae" = ? WHERE project_id = ? AND k = ?').run(today, pId, k);
        
        // Generate Stage Invoice
        const invAmt = Math.round(proj.contract * stage.bill / 100);
        const invId = 'INV-' + dbLayer.uid();
        dbLayer.db.prepare('INSERT INTO invoices (id, project_id, k, desc, amt, status, d) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(invId, pId, k, `Stage billing – ${stage.name} (${stage.bill}%)`, invAmt, 'Pending', today);

        dbLayer.logAudit(`Stage completed: ${stage.name} → invoice ₹${invAmt.toLocaleString('en-IN')} raised`, pId);
        dbLayer.sendWA('acc', `💰 Stage "${stage.name}" complete – invoice raised for ${proj.name.split('–')[0]}`);
        dbLayer.sendWA('owner', `✅ Stage complete: ${stage.name} (${proj.name.split('–')[0]})`);

        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      // 6. Handover
      const handoverMatch = pathname.match(/^\/api\/projects\/([^/]+)\/handover$/);
      if (handoverMatch && req.method === 'POST') {
        if (!checkPerm(res, 'handover')) return;
        const pId = handoverMatch[1];
        const today = dbLayer.getConfig('today');
        const proj = dbLayer.db.prepare('SELECT * FROM projects WHERE id = ?').get(pId);

        dbLayer.db.prepare('UPDATE stages SET status = "DONE", prog = 100, "as" = COALESCE("as", ?), "ae" = ? WHERE project_id = ? AND k = 11')
          .run(today, today, pId);
        dbLayer.db.prepare('UPDATE projects SET status = "Completed" WHERE id = ?').run(pId);

        const s11 = dbLayer.db.prepare('SELECT * FROM stages WHERE project_id = ? AND k = 11').get(pId);
        const invAmt = Math.round(proj.contract * (s11 ? s11.bill : 3) / 100);
        const invId = 'INV-' + dbLayer.uid();
        dbLayer.db.prepare('INSERT INTO invoices (id, project_id, k, desc, amt, status, d) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(invId, pId, 11, 'Final billing – Handover (3%)', invAmt, 'Pending', today);

        dbLayer.logAudit(`PROJECT COMPLETED & HANDED OVER: ${proj.name}`, pId);
        dbLayer.sendWA('owner', `🎉 PROJECT COMPLETED & HANDED OVER: ${proj.name}`);
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      // 6a. Project Tasks: Create Task
      if (pathname === '/api/tasks' && req.method === 'POST') {
        const body = await parseJSON(req);
        const taskId = dbLayer.createTaskRecord(body);
        return sendJSON(res, { ok: true, id: taskId, state: dbLayer.getFullState() });
      }

      // 6b. Project Tasks: Update Progress, Photo, Remarks, Delay
      const taskUpdateMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/update$/);
      if (taskUpdateMatch && req.method === 'POST') {
        const taskId = taskUpdateMatch[1];
        const body = await parseJSON(req);
        dbLayer.updateTaskProgress(taskId, body.progress, body.status, body.remarks, body.photo, body.delay_reason);
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      // 6c. Project Tasks: Status Toggle
      const taskStatusMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/status$/);
      if (taskStatusMatch && req.method === 'POST') {
        const taskId = taskStatusMatch[1];
        const body = await parseJSON(req);
        dbLayer.updateTaskStatus(taskId, body.status, body.delay_reason);
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      // 6d. Project Milestones: Create Milestone
      if (pathname === '/api/milestones' && req.method === 'POST') {
        const body = await parseJSON(req);
        const mlsId = dbLayer.createMilestoneRecord(body);
        return sendJSON(res, { ok: true, id: mlsId, state: dbLayer.getFullState() });
      }

      // 6e. Project Milestones: Achieve Milestone
      const mlsAchieveMatch = pathname.match(/^\/api\/milestones\/([^/]+)\/achieve$/);
      if (mlsAchieveMatch && req.method === 'POST') {
        const mlsId = mlsAchieveMatch[1];
        dbLayer.achieveMilestoneRecord(mlsId);
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      // 6f. Project Team: Assign Team Member
      if (pathname === '/api/projects/team-member' && req.method === 'POST') {
        const body = await parseJSON(req);
        const tmId = dbLayer.assignProjectTeamMember(body);
        return sendJSON(res, { ok: true, id: tmId, state: dbLayer.getFullState() });
      }

      // 7. Staff Check-in
      if (pathname === '/api/attendance/checkin' && req.method === 'POST') {
        const body = await parseJSON(req);
        const today = dbLayer.getConfig('today');
        const meId = dbLayer.getConfig('me');
        const user = dbLayer.db.prepare('SELECT * FROM users WHERE id = ?').get(meId);

        const existing = dbLayer.db.prepare('SELECT id FROM attendance WHERE project_id = ? AND d = ? AND uid = ?').get(body.projectId, today, meId);
        if (existing) {
          return sendJSON(res, { ok: false, error: 'Already checked in today' }, 400);
        }

        const t = new Date().toTimeString().slice(0, 5);
        const id = dbLayer.uid();
        const dist = Math.round(body.dist || (body.onsite ? 35 : 3000));
        const onsite = body.onsite !== undefined ? (body.onsite ? 1 : 0) : 1;
        const pres = onsite;

        dbLayer.db.prepare(`
          INSERT INTO attendance (id, project_id, d, uid, wid, type, name, check_in, check_out, hours, dist, onsite, pres, leave, cost, method)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, body.projectId, today, meId, null, 'staff', user.name, t, null, 0, dist, onsite, pres, 0, 0, body.method || 'GPS');

        dbLayer.logAudit(`${user.name} checked in via ${body.method || 'GPS'} ${onsite ? 'at site' : 'OFF-SITE – not counted'}`, body.projectId);
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      // 8. Staff Check-out
      if (pathname === '/api/attendance/checkout' && req.method === 'POST') {
        const body = await parseJSON(req);
        const today = dbLayer.getConfig('today');
        const meId = dbLayer.getConfig('me');
        const user = dbLayer.db.prepare('SELECT * FROM users WHERE id = ?').get(meId);
        const t = new Date().toTimeString().slice(0, 5);

        dbLayer.db.prepare(`
          UPDATE attendance SET check_out = ?, hours = 8, cost = ?
          WHERE project_id = ? AND d = ? AND uid = ?
        `).run(t, user.cost, body.projectId, today, meId);

        dbLayer.logAudit(`${user.name} checked out (8 hrs)`, body.projectId);
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      // 9. Labour Attendance
      if (pathname === '/api/attendance/labour' && req.method === 'POST') {
        if (!checkPerm(res, 'labour')) return;
        const body = await parseJSON(req);
        const today = dbLayer.getConfig('today');
        const pId = body.projectId;

        dbLayer.db.prepare('DELETE FROM attendance WHERE project_id = ? AND d = ? AND type = "labour"').run(pId, today);

        let n = 0, c = 0;
        const insertLab = dbLayer.db.prepare(`
          INSERT INTO attendance (id, project_id, d, uid, wid, type, name, check_in, check_out, hours, dist, onsite, pres, leave, cost, method)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const w of body.records) {
          const wObj = dbLayer.db.prepare('SELECT * FROM roster WHERE project_id = ? AND id = ?').get(pId, w.wid);
          if (!wObj) continue;
          const pres = w.pres ? 1 : 0;
          const h = pres ? Number(w.hours || 8) : 0;
          const cost = ((Math.min(h, 8) + Math.max(h - 8, 0) * 1.5) / 8) * wObj.wage;

          insertLab.run(dbLayer.uid(), pId, today, null, w.wid, 'labour', `${wObj.name} (${wObj.trade})`, pres ? '08:30' : null, pres ? '17:30' : null, h, 0, 1, pres, 0, cost, 'Manual');
          if (pres) { n++; c += cost; }
        }

        dbLayer.logAudit(`Labour attendance saved: ${n} present, cost ₹${Math.round(c).toLocaleString('en-IN')}`, pId);
        return sendJSON(res, { ok: true, count: n, cost: c, state: dbLayer.getFullState() });
      }

      // 10. Quick Labour Copy
      if (pathname === '/api/attendance/labour/quick' && req.method === 'POST') {
        if (!checkPerm(res, 'labour')) return;
        const body = await parseJSON(req);
        const today = dbLayer.getConfig('today');
        const pId = body.projectId;

        const lastLabRow = dbLayer.db.prepare('SELECT d FROM attendance WHERE project_id = ? AND type = "labour" AND d < ? ORDER BY d DESC LIMIT 1').get(pId, today);
        if (!lastLabRow) {
          return sendJSON(res, { ok: false, error: 'No earlier attendance to copy' }, 400);
        }

        const prevRecords = dbLayer.db.prepare('SELECT * FROM attendance WHERE project_id = ? AND d = ? AND type = "labour"').all(pId, lastLabRow.d);
        dbLayer.db.prepare('DELETE FROM attendance WHERE project_id = ? AND d = ? AND type = "labour"').run(pId, today);

        let n = 0, c = 0;
        const insertLab = dbLayer.db.prepare(`
          INSERT INTO attendance (id, project_id, d, uid, wid, type, name, check_in, check_out, hours, dist, onsite, pres, leave, cost, method)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const rec of prevRecords) {
          insertLab.run(dbLayer.uid(), pId, today, null, rec.wid, 'labour', rec.name, rec.check_in, rec.check_out, rec.hours, 0, 1, rec.pres, 0, rec.cost, 'Manual');
          if (rec.pres) { n++; c += rec.cost; }
        }

        dbLayer.logAudit(`Labour attendance copied from ${lastLabRow.d}: ${n} present`, pId);
        return sendJSON(res, { ok: true, count: n, state: dbLayer.getFullState() });
      }

      // 11. Staff Attendance Bulk Save
      if (pathname === '/api/attendance/staff-mark' && req.method === 'POST') {
        if (!checkPerm(res, 'labour')) return;
        const body = await parseJSON(req);
        const today = dbLayer.getConfig('today');
        const pId = body.projectId;

        dbLayer.db.prepare('DELETE FROM attendance WHERE project_id = ? AND d = ? AND type = "staff"').run(pId, today);
        const insertStaff = dbLayer.db.prepare(`
          INSERT INTO attendance (id, project_id, d, uid, wid, type, name, check_in, check_out, hours, dist, onsite, pres, leave, cost, method)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let n = 0;
        for (const item of body.records) {
          const user = dbLayer.db.prepare('SELECT * FROM users WHERE id = ?').get(item.uid);
          if (!user) continue;
          const isP = item.val === 'P';
          const isL = item.val === 'L';
          insertStaff.run(dbLayer.uid(), pId, today, item.uid, null, 'staff', user.name, isP ? '09:00' : null, null, isP ? 8 : 0, 0, 1, isP ? 1 : 0, isL ? 1 : 0, isP ? user.cost : 0, 'Manual');
          if (isP) n++;
        }

        dbLayer.logAudit(`Staff attendance marked for ${today}: ${n} present`, pId);
        return sendJSON(res, { ok: true, count: n, state: dbLayer.getFullState() });
      }

      // 12. Submit DPR
      if (pathname === '/api/dpr' && req.method === 'POST') {
        if (!checkPerm(res, 'dpr')) return;
        const body = await parseJSON(req);
        const today = dbLayer.getConfig('today');
        const meId = dbLayer.getConfig('me');
        const pId = body.projectId;
        const k = parseInt(body.k, 10);
        const pct = parseFloat(body.pct);

        const stage = dbLayer.db.prepare('SELECT * FROM stages WHERE project_id = ? AND k = ?').get(pId, k);
        const proj = dbLayer.db.prepare('SELECT name FROM projects WHERE id = ?').get(pId);
        const user = dbLayer.db.prepare('SELECT name FROM users WHERE id = ?').get(meId);

        // Check stock availability
        const mats = body.mats || {};
        for (const [mId, qty] of Object.entries(mats)) {
          const st = dbLayer.db.prepare('SELECT qty FROM stock WHERE project_id = ? AND mat_id = ?').get(pId, mId);
          if (!st || st.qty < qty) {
            return sendJSON(res, { ok: false, error: `Not enough stock of ${mId}` }, 400);
          }
        }

        const dprId = dbLayer.uid();
        dbLayer.db.prepare(`
          INSERT INTO dprs (id, project_id, k, d, by_uid, pct, mats, delay, notes, photo, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(dprId, pId, k, today, meId, pct, JSON.stringify(mats), body.delay || 'None', body.notes || '', body.photo || '', 'Submitted');

        dbLayer.logAudit(`DPR submitted: ${stage.name} +${pct}%`, pId);
        dbLayer.sendWA('pm', `📋 DPR from ${user.name}: ${stage.name} +${pct}% (${proj.name.split('–')[0]}). Approve?`, { k: 'dpr', id: dprId });

        return sendJSON(res, { ok: true, id: dprId, state: dbLayer.getFullState() });
      }

      // 13. Approve / Reject DPR
      const apprDprMatch = pathname.match(/^\/api\/dpr\/([^/]+)\/approve$/);
      if (apprDprMatch && req.method === 'POST') {
        if (!checkPerm(res, 'dprApprove')) return;
        const dprId = apprDprMatch[1];
        const body = await parseJSON(req);
        const ok = Boolean(body.ok);

        const dpr = dbLayer.db.prepare('SELECT * FROM dprs WHERE id = ?').get(dprId);
        if (!dpr) return sendJSON(res, { ok: false, error: 'DPR not found' }, 404);

        const stage = dbLayer.db.prepare('SELECT * FROM stages WHERE project_id = ? AND k = ?').get(dpr.project_id, dpr.k);
        const proj = dbLayer.db.prepare('SELECT name FROM projects WHERE id = ?').get(dpr.project_id);

        if (ok) {
          const mats = JSON.parse(dpr.mats || '{}');
          // Deduct stock
          for (const [mId, q] of Object.entries(mats)) {
            dbLayer.db.prepare('UPDATE stock SET qty = MAX(0, qty - ?) WHERE project_id = ? AND mat_id = ?').run(q, dpr.project_id, mId);
          }

          const newProg = Math.min(100, stage.prog + dpr.pct);
          dbLayer.db.prepare('UPDATE stages SET prog = ? WHERE project_id = ? AND k = ?').run(newProg, dpr.project_id, dpr.k);
          dbLayer.db.prepare('UPDATE dprs SET status = "Approved" WHERE id = ?').run(dprId);

          dbLayer.logAudit(`DPR approved: ${stage.name} now ${newProg}% · stock & cost updated`, dpr.project_id);

          if (newProg >= 100 && stage.qa) {
            dbLayer.sendWA('qa', `🔍 ${stage.name} is 100% – ready for inspection (${proj.name.split('–')[0]})`);
          }
        } else {
          dbLayer.db.prepare('UPDATE dprs SET status = "Rejected" WHERE id = ?').run(dprId);
          dbLayer.logAudit(`DPR rejected: ${stage.name}`, dpr.project_id);
        }

        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      // 14. Bulk Approve DPRs
      if (pathname === '/api/dpr/bulk-approve' && req.method === 'POST') {
        if (!checkPerm(res, 'dprApprove')) return;
        const submitted = dbLayer.db.prepare('SELECT * FROM dprs WHERE status = "Submitted"').all();
        let n = 0;
        for (const d of submitted) {
          const stage = dbLayer.db.prepare('SELECT * FROM stages WHERE project_id = ? AND k = ?').get(d.project_id, d.k);
          const mats = JSON.parse(d.mats || '{}');
          for (const [mId, q] of Object.entries(mats)) {
            dbLayer.db.prepare('UPDATE stock SET qty = MAX(0, qty - ?) WHERE project_id = ? AND mat_id = ?').run(q, d.project_id, mId);
          }
          const newProg = Math.min(100, stage.prog + d.pct);
          dbLayer.db.prepare('UPDATE stages SET prog = ? WHERE project_id = ? AND k = ?').run(newProg, d.project_id, d.k);
          dbLayer.db.prepare('UPDATE dprs SET status = "Approved" WHERE id = ?').run(d.id);
          n++;
        }
        return sendJSON(res, { ok: true, count: n, state: dbLayer.getFullState() });
      }

      // 15. Material PR Raise
      if (pathname === '/api/materials/request' && req.method === 'POST') {
        if (!checkPerm(res, 'raisePR')) return;
        const body = await parseJSON(req);
        const today = dbLayer.getConfig('today');
        const meId = dbLayer.getConfig('me');
        const user = dbLayer.db.prepare('SELECT name FROM users WHERE id = ?').get(meId);

        const countPR = dbLayer.db.prepare('SELECT COUNT(*) as c FROM prs').get().c;
        const prId = 'PR-' + (countPR + 231);

        dbLayer.db.prepare(`
          INSERT INTO prs (id, project_id, m, qty, by_uid, status, vendor, rate, d)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(prId, body.projectId, body.m, body.qty, meId, 'Requested', null, 0, today);

        dbLayer.logAudit(`Material request ${prId}: ${body.qty} of ${body.m}`, body.projectId);
        dbLayer.sendWA('pm', `🧱 Material request ${prId}: ${body.qty} from ${user.name}. Approve?`, { k: 'pr', id: prId });

        return sendJSON(res, { ok: true, id: prId, state: dbLayer.getFullState() });
      }

      // 16. PR Approve / Reject
      const prApprMatch = pathname.match(/^\/api\/materials\/pr\/([^/]+)\/approve$/);
      if (prApprMatch && req.method === 'POST') {
        if (!checkPerm(res, 'approve')) return;
        const prId = prApprMatch[1];
        const body = await parseJSON(req);
        const st = body.ok ? 'Approved' : 'Rejected';
        dbLayer.db.prepare('UPDATE prs SET status = ? WHERE id = ?').run(st, prId);
        const pr = dbLayer.db.prepare('SELECT project_id FROM prs WHERE id = ?').get(prId);
        dbLayer.logAudit(`${prId} ${st.toLowerCase()}`, pr ? pr.project_id : null);
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      // 17. Issue PO
      const poMatch = pathname.match(/^\/api\/materials\/pr\/([^/]+)\/po$/);
      if (poMatch && req.method === 'POST') {
        if (!checkPerm(res, 'po')) return;
        const prId = poMatch[1];
        const body = await parseJSON(req);
        dbLayer.db.prepare('UPDATE prs SET status = "Ordered", vendor = ?, rate = ? WHERE id = ?').run(body.vendor, body.rate, prId);
        const pr = dbLayer.db.prepare('SELECT project_id FROM prs WHERE id = ?').get(prId);
        dbLayer.logAudit(`PO issued for ${prId} to ${body.vendor} @ ₹${body.rate}`, pr ? pr.project_id : null);
        dbLayer.sendWA('store', `🚚 PO issued to ${body.vendor} for ${prId}. Expect delivery – receive on arrival.`);
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      // 18. GRN Goods Receipt
      const grnMatch = pathname.match(/^\/api\/materials\/pr\/([^/]+)\/grn$/);
      if (grnMatch && req.method === 'POST') {
        if (!checkPerm(res, 'grn')) return;
        const prId = grnMatch[1];
        const pr = dbLayer.db.prepare('SELECT * FROM prs WHERE id = ?').get(prId);
        if (!pr) return sendJSON(res, { ok: false, error: 'PR not found' }, 404);

        dbLayer.db.prepare('UPDATE prs SET status = "Received" WHERE id = ?').run(prId);
        dbLayer.db.prepare('UPDATE stock SET qty = qty + ? WHERE project_id = ? AND mat_id = ?').run(pr.qty, pr.project_id, pr.m);
        dbLayer.logAudit(`GRN posted ${prId}: ${pr.qty} ${pr.m} from ${pr.vendor} → site stock +`, pr.project_id);
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      // 19. Bulk PR Action
      if (pathname === '/api/materials/bulk-approve' && req.method === 'POST') {
        if (!checkPerm(res, 'approve')) return;
        dbLayer.db.prepare('UPDATE prs SET status = "Approved" WHERE status = "Requested"').run();
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }
      if (pathname === '/api/materials/bulk-grn' && req.method === 'POST') {
        if (!checkPerm(res, 'grn')) return;
        const ordered = dbLayer.db.prepare('SELECT * FROM prs WHERE status = "Ordered"').all();
        for (const pr of ordered) {
          dbLayer.db.prepare('UPDATE prs SET status = "Received" WHERE id = ?').run(pr.id);
          dbLayer.db.prepare('UPDATE stock SET qty = qty + ? WHERE project_id = ? AND mat_id = ?').run(pr.qty, pr.project_id, pr.m);
        }
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      // 20. QA Inspection
      if (pathname === '/api/qa/inspect' && req.method === 'POST') {
        if (!checkPerm(res, 'qa')) return;
        const body = await parseJSON(req);
        const today = dbLayer.getConfig('today');
        const meId = dbLayer.getConfig('me');
        const ok = Boolean(body.ok);
        const id = dbLayer.uid();

        dbLayer.db.prepare(`
          INSERT INTO inspections (id, project_id, k, by_uid, res, d, rem)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, body.projectId, body.k, meId, ok ? 'Passed' : 'Failed', today, body.rem || (ok ? 'Inspection OK' : 'Defects found – rework'));

        const stage = dbLayer.db.prepare('SELECT name FROM stages WHERE project_id = ? AND k = ?').get(body.projectId, body.k);

        if (!ok) {
          dbLayer.db.prepare('UPDATE stages SET prog = 90 WHERE project_id = ? AND k = ?').run(body.projectId, body.k);
          dbLayer.logAudit(`QA FAILED: ${stage ? stage.name : ''} – NCR raised, rework needed (prog reset to 90%)`, body.projectId);
        } else {
          dbLayer.logAudit(`QA approved: ${stage ? stage.name : ''}`, body.projectId);
        }

        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      // 21. Invoice Payment
      const payMatch = pathname.match(/^\/api\/billing\/invoice\/([^/]+)\/pay$/);
      if (payMatch && req.method === 'POST') {
        if (!checkPerm(res, 'bill')) return;
        const invId = payMatch[1];
        const inv = dbLayer.db.prepare('SELECT * FROM invoices WHERE id = ?').get(invId);
        if (!inv) return sendJSON(res, { ok: false, error: 'Invoice not found' }, 404);

        dbLayer.db.prepare('UPDATE invoices SET status = "Paid" WHERE id = ?').run(invId);
        dbLayer.logAudit(`Payment received ₹${Math.round(inv.amt).toLocaleString('en-IN')} for ${invId}`, inv.project_id);
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      // 22. RA Bill
      if (pathname === '/api/billing/ra' && req.method === 'POST') {
        if (!checkPerm(res, 'bill')) return;
        const body = await parseJSON(req);
        const today = dbLayer.getConfig('today');
        const invId = 'INV-' + dbLayer.uid();

        dbLayer.db.prepare(`
          INSERT INTO invoices (id, project_id, k, desc, amt, status, d)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(invId, body.projectId, -1, body.desc, body.amt, 'Pending', today);

        const proj = dbLayer.db.prepare('SELECT name FROM projects WHERE id = ?').get(body.projectId);
        dbLayer.logAudit(`RA bill raised: ₹${Math.round(body.amt).toLocaleString('en-IN')} for ${proj.name}`, body.projectId);
        dbLayer.sendWA('owner', `🧾 New bill ₹${Math.round(body.amt).toLocaleString('en-IN')} raised for ${proj.name.split('–')[0]}`);

        return sendJSON(res, { ok: true, id: invId, state: dbLayer.getFullState() });
      }

      // 23. Add Expense
      if (pathname === '/api/expenses' && req.method === 'POST') {
        if (!checkPerm(res, 'expense')) return;
        const body = await parseJSON(req);
        const today = dbLayer.getConfig('today');
        const id = dbLayer.uid();

        dbLayer.db.prepare(`
          INSERT INTO expenses (id, project_id, cat, amt, d)
          VALUES (?, ?, ?, ?, ?)
        `).run(id, body.projectId, body.cat, body.amt, today);

        dbLayer.logAudit(`Expense: ${body.cat} ₹${Math.round(body.amt).toLocaleString('en-IN')}`, body.projectId);
        return sendJSON(res, { ok: true, id, state: dbLayer.getFullState() });
      }

      // 24. Book Unit
      if (pathname === '/api/crm/unit/book' && req.method === 'POST') {
        const body = await parseJSON(req);
        const unit = dbLayer.db.prepare('SELECT * FROM units WHERE project_id = ? AND unit_num = ?').get(body.projectId, body.unitNum);
        if (!unit) return sendJSON(res, { ok: false, error: 'Unit not found' }, 404);

        const nextStatus = unit.status === 'Available' ? 'Booked' : unit.status === 'Booked' ? 'Sold' : 'Sold';
        dbLayer.db.prepare('UPDATE units SET status = ? WHERE project_id = ? AND unit_num = ?').run(nextStatus, body.projectId, body.unitNum);

        dbLayer.logAudit(`Unit ${body.unitNum} ${nextStatus === 'Booked' ? 'booked' : 'sold'}`, body.projectId);
        return sendJSON(res, { ok: true, nextStatus, state: dbLayer.getFullState() });
      }

      // 25. HSE Report
      if (pathname === '/api/hse' && req.method === 'POST') {
        const body = await parseJSON(req);
        const today = dbLayer.getConfig('today');
        const meId = dbLayer.getConfig('me');

        dbLayer.db.prepare('INSERT INTO hse (project_id, d, type, desc, by_uid) VALUES (?, ?, ?, ?, ?)')
          .run(body.projectId, today, body.type, body.desc || '—', meId);

        dbLayer.logAudit(`HSE report: ${body.type}`, body.projectId);
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      // 25b. Tender Create & Status
      if (pathname === '/api/tenders' && req.method === 'POST') {
        if (!checkPerm(res, 'tenders')) return;
        const b = await parseJSON(req);
        const count = dbLayer.db.prepare('SELECT COUNT(*) as c FROM tenders').get().c;
        const tId = b.id || ('T-' + new Date().getFullYear() + '-' + String(count + 1).padStart(2, '0'));
        dbLayer.db.prepare(`
          INSERT INTO tenders (id, title, client, client_id, type, val, emd, tender_fee, sub_date, eligibility, docs_checklist, status, loss_reason, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          tId, b.title, b.client, b.client_id || '', b.type || 'Commercial EPC',
          b.val || 0, b.emd || 0, b.tender_fee || 0, b.sub_date || '',
          b.eligibility || 'Eligible', b.docs_checklist || '', b.status || 'Bidding',
          b.loss_reason || '', b.notes || ''
        );
        dbLayer.logAudit(`Tender registered: ${tId} - ${b.title}`);
        return sendJSON(res, { ok: true, id: tId, state: dbLayer.getFullState() });
      }

      if (pathname === '/api/tenders/status' && req.method === 'POST') {
        if (!checkPerm(res, 'tenders')) return;
        const b = await parseJSON(req);
        dbLayer.db.prepare(`
          UPDATE tenders SET status = ?, loss_reason = ? WHERE id = ?
        `).run(b.status, b.loss_reason || '', b.id);
        dbLayer.logAudit(`Tender ${b.id} status updated to ${b.status}`);
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      // CRM: Leads
      if (pathname === '/api/crm/leads' && req.method === 'POST') {
        if (!checkPerm(res, 'crm')) return;
        const b = await parseJSON(req);
        const leadId = dbLayer.createLeadRecord(b);
        return sendJSON(res, { ok: true, id: leadId, state: dbLayer.getFullState() });
      }

      if (pathname === '/api/crm/leads/qualify' && req.method === 'POST') {
        if (!checkPerm(res, 'crm')) return;
        const b = await parseJSON(req);
        const result = dbLayer.qualifyLeadRecord(b.leadId, b.clientData, b.oppData);
        return sendJSON(res, { ok: true, result, state: dbLayer.getFullState() });
      }

      // CRM: Clients
      if (pathname === '/api/crm/clients' && req.method === 'POST') {
        if (!checkPerm(res, 'crm')) return;
        const b = await parseJSON(req);
        const clientId = dbLayer.createClientRecord(b);
        return sendJSON(res, { ok: true, id: clientId, state: dbLayer.getFullState() });
      }

      // CRM: Opportunities
      if (pathname === '/api/crm/opportunities' && req.method === 'POST') {
        if (!checkPerm(res, 'crm')) return;
        const b = await parseJSON(req);
        const oppId = dbLayer.createOpportunityRecord(b);
        return sendJSON(res, { ok: true, id: oppId, state: dbLayer.getFullState() });
      }

      // CRM: Bids
      if (pathname === '/api/crm/bids' && req.method === 'POST') {
        if (!checkPerm(res, 'crm')) return;
        const b = await parseJSON(req);
        const bidId = dbLayer.createBidRecord(b);
        return sendJSON(res, { ok: true, id: bidId, state: dbLayer.getFullState() });
      }

      if (pathname === '/api/crm/bids/approve' && req.method === 'POST') {
        if (!checkPerm(res, 'crm')) return;
        const b = await parseJSON(req);
        dbLayer.approveBidRecord(b.id, b.approvedBy);
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      if (pathname === '/api/crm/bids/submit' && req.method === 'POST') {
        if (!checkPerm(res, 'crm')) return;
        const b = await parseJSON(req);
        dbLayer.submitBidRecord(b.id, b.submissionDate);
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      if (pathname === '/api/crm/bids/result' && req.method === 'POST') {
        if (!checkPerm(res, 'crm')) return;
        const b = await parseJSON(req);
        dbLayer.recordBidResult(b.id, b.status, b.lossReason);
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      // CRM: Flagship Conversion to Active Project
      if (pathname === '/api/crm/convert-to-project' && req.method === 'POST') {
        if (!checkPerm(res, 'createProject')) return;
        const b = await parseJSON(req);
        const result = dbLayer.convertOpportunityToProject(b.oppId, b.customData || {});
        return sendJSON(res, { ok: true, result, state: dbLayer.getFullState() });
      }

      // CRM: Activities & Follow-ups
      if (pathname === '/api/crm/activities' && req.method === 'POST') {
        if (!checkPerm(res, 'crm')) return;
        const b = await parseJSON(req);
        const actId = dbLayer.logCRMActivity(b);
        return sendJSON(res, { ok: true, id: actId, state: dbLayer.getFullState() });
      }

      // 25c. Drawing Upload
      if (pathname === '/api/drawings' && req.method === 'POST') {
        if (!checkPerm(res, 'drawings')) return;
        const b = await parseJSON(req);
        const dId = 'DWG-' + Math.floor(100 + Math.random() * 900);
        const today = dbLayer.getConfig('today');
        dbLayer.db.prepare('INSERT INTO drawings (id, project_id, dwg_no, title, disc, rev, status, d) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(dId, b.projectId, b.dwgNo, b.title, b.disc, b.rev || 'R0', b.status || 'Approved for Construction', today);
        dbLayer.logAudit(`Drawing added: ${b.dwgNo} (${b.title})`, b.projectId);
        return sendJSON(res, { ok: true, id: dId, state: dbLayer.getFullState() });
      }

      // 25d. Equipment Add / Update
      if (pathname === '/api/equipment' && req.method === 'POST') {
        if (!checkPerm(res, 'equipment')) return;
        const b = await parseJSON(req);
        const eqId = b.id || ('EQ-' + Math.floor(10 + Math.random() * 90));
        dbLayer.db.prepare('INSERT OR REPLACE INTO equipment (id, name, code, type, project_id, status, hours, fuel_cap, op_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(eqId, b.name, b.code, b.type, b.projectId, b.status || 'Active', b.hours || 0, b.fuelCap || 0, b.opName || '');
        dbLayer.logAudit(`Equipment registered: ${b.name} (${b.code})`, b.projectId);
        return sendJSON(res, { ok: true, id: eqId, state: dbLayer.getFullState() });
      }

      // 25e. Fuel Log
      if (pathname === '/api/equipment/fuel' && req.method === 'POST') {
        if (!checkPerm(res, 'equipment')) return;
        const b = await parseJSON(req);
        const fId = 'FL-' + Math.floor(100 + Math.random() * 900);
        const today = dbLayer.getConfig('today');
        dbLayer.db.prepare('INSERT INTO fuel_logs (id, eq_id, project_id, d, liters, cost, hours, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(fId, b.eqId, b.projectId, today, b.liters, b.cost || (b.liters * 95), b.hours || 0, b.notes || '');
        dbLayer.logAudit(`Fuel logged: ${b.liters}L for ${b.eqId}`, b.projectId);
        return sendJSON(res, { ok: true, id: fId, state: dbLayer.getFullState() });
      }

      // 25f. Contract Create / RA Bill
      if (pathname === '/api/contracts' && req.method === 'POST') {
        if (!checkPerm(res, 'contracts')) return;
        const b = await parseJSON(req);
        const cId = 'SC-' + Math.floor(100 + Math.random() * 900);
        dbLayer.db.prepare('INSERT INTO contracts_tbl (id, project_id, vendor_name, scope, val, ra_billed, retention, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(cId, b.projectId, b.vendorName, b.scope, b.val, b.raBilled || 0, b.retention || 0, b.status || 'Active');
        dbLayer.logAudit(`Subcontract created: ${b.vendorName} - ${b.scope}`, b.projectId);
        return sendJSON(res, { ok: true, id: cId, state: dbLayer.getFullState() });
      }

      if (pathname === '/api/contracts/ra-bill' && req.method === 'POST') {
        if (!checkPerm(res, 'contracts')) return;
        const b = await parseJSON(req);
        const contract = dbLayer.db.prepare('SELECT * FROM contracts_tbl WHERE id = ?').get(b.contractId);
        if (contract) {
          const newBilled = contract.ra_billed + b.billAmt;
          const newRet = contract.retention + (b.billAmt * 0.05);
          dbLayer.db.prepare('UPDATE contracts_tbl SET ra_billed = ?, retention = ? WHERE id = ?').run(newBilled, newRet, b.contractId);
          dbLayer.logAudit(`RA Bill recorded: ₹${Math.round(b.billAmt).toLocaleString('en-IN')} for ${contract.vendor_name}`, contract.project_id);
        }
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      // 25g. NCR Create / Resolve
      if (pathname === '/api/qa/ncr' && req.method === 'POST') {
        if (!checkPerm(res, 'qa')) return;
        const b = await parseJSON(req);
        const nId = b.id || ('NCR-' + Math.floor(10 + Math.random() * 90));
        const today = dbLayer.getConfig('today');
        if (b.action === 'resolve') {
          dbLayer.db.prepare('UPDATE ncr_records SET status = "Closed", action = ? WHERE id = ?').run(b.resolution || 'Resolved & verified by QA', b.id);
          dbLayer.logAudit(`NCR ${b.id} closed`);
        } else {
          dbLayer.db.prepare('INSERT INTO ncr_records (id, project_id, stage_k, title, severity, status, d, action) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(nId, b.projectId, b.stageK || 0, b.title, b.severity || 'Medium', 'Open', today, b.action || '');
          dbLayer.logAudit(`NCR raised: ${b.title}`, b.projectId);
        }
        return sendJSON(res, { ok: true, id: nId, state: dbLayer.getFullState() });
      }

      // 25h. Documents
      if (pathname === '/api/documents' && req.method === 'POST') {
        if (!checkPerm(res, 'documents')) return;
        const b = await parseJSON(req);
        const docId = b.id || ('DOC-' + Math.floor(10 + Math.random() * 90));
        const today = dbLayer.getConfig('today');
        const meUser = dbLayer.db.prepare('SELECT name FROM users WHERE id = ?').get(dbLayer.getConfig('me'));
        dbLayer.db.prepare('INSERT INTO documents_tbl (id, project_id, title, cat, rev, status, uploaded_by, d) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(docId, b.projectId, b.title, b.cat || 'General', b.rev || 'R1', b.status || 'Approved', (meUser ? meUser.name : 'Staff'), today);
        dbLayer.logAudit(`Document uploaded: ${b.title}`, b.projectId);
        return sendJSON(res, { ok: true, id: docId, state: dbLayer.getFullState() });
      }

      // 25i. Snagging
      if (pathname === '/api/snags' && req.method === 'POST') {
        if (!checkPerm(res, 'qa')) return;
        const b = await parseJSON(req);
        const sId = b.id || ('SNG-' + Math.floor(10 + Math.random() * 90));
        const today = dbLayer.getConfig('today');
        if (b.action === 'resolve') {
          dbLayer.db.prepare('UPDATE handover_snags SET status = "Resolved" WHERE id = ?').run(b.id);
          dbLayer.logAudit(`Snag ${b.id} resolved`, b.projectId);
        } else {
          dbLayer.db.prepare('INSERT INTO handover_snags (id, project_id, unit_num, desc, severity, status, due_date, assigned_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(sId, b.projectId, b.unitNum, b.desc, b.severity || 'Low', 'Open', b.dueDate || dbLayer.addDays(today, 5), b.assignedTo || 'Site Supervisor');
          dbLayer.logAudit(`Snag logged: Unit ${b.unitNum} - ${b.desc}`, b.projectId);
        }
        return sendJSON(res, { ok: true, id: sId, state: dbLayer.getFullState() });
      }

      // 26. WhatsApp Action
      if (pathname === '/api/whatsapp/action' && req.method === 'POST') {
        const body = await parseJSON(req);
        const msg = dbLayer.db.prepare('SELECT * FROM wa_messages WHERE id = ?').get(body.messageId);
        if (msg && msg.act) {
          const act = JSON.parse(msg.act);
          const ok = Boolean(body.ok);
          if (act.k === 'dpr') {
            const dpr = dbLayer.db.prepare('SELECT * FROM dprs WHERE id = ?').get(act.id);
            if (dpr) {
              const stage = dbLayer.db.prepare('SELECT * FROM stages WHERE project_id = ? AND k = ?').get(dpr.project_id, dpr.k);
              if (ok) {
                const mats = JSON.parse(dpr.mats || '{}');
                for (const [mId, q] of Object.entries(mats)) {
                  dbLayer.db.prepare('UPDATE stock SET qty = MAX(0, qty - ?) WHERE project_id = ? AND mat_id = ?').run(q, dpr.project_id, mId);
                }
                const newProg = Math.min(100, stage.prog + dpr.pct);
                dbLayer.db.prepare('UPDATE stages SET prog = ? WHERE project_id = ? AND k = ?').run(newProg, dpr.project_id, dpr.k);
                dbLayer.db.prepare('UPDATE dprs SET status = "Approved" WHERE id = ?').run(act.id);
              } else {
                dbLayer.db.prepare('UPDATE dprs SET status = "Rejected" WHERE id = ?').run(act.id);
              }
            }
          } else if (act.k === 'pr') {
            dbLayer.db.prepare('UPDATE prs SET status = ? WHERE id = ?').run(ok ? 'Approved' : 'Rejected', act.id);
          }
          dbLayer.db.prepare('UPDATE wa_messages SET status = ? WHERE id = ?').run(ok ? 'Approved from WhatsApp' : 'Rejected from WhatsApp', body.messageId);
        }
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      // 27. System Controls
      if (pathname === '/api/system/advance-date' && req.method === 'POST') {
        const body = await parseJSON(req);
        const current = dbLayer.getConfig('today');
        const nextDate = dbLayer.addDays(current, body.days || 1);
        dbLayer.setConfig('today', nextDate);
        dbLayer.logAudit(`Date advanced to ${nextDate}`);
        return sendJSON(res, { ok: true, today: nextDate, state: dbLayer.getFullState() });
      }

      if (pathname === '/api/system/switch-user' && req.method === 'POST') {
        const body = await parseJSON(req);
        dbLayer.setConfig('me', body.userId);
        const user = dbLayer.db.prepare('SELECT name, role FROM users WHERE id = ?').get(body.userId);
        dbLayer.logAudit(`Signed in as ${user ? user.role : body.userId}`);
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      if (pathname === '/api/system/switch-project' && req.method === 'POST') {
        const body = await parseJSON(req);
        dbLayer.setConfig('ap', body.projectId);
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      if (pathname === '/api/system/lang' && req.method === 'POST') {
        const body = await parseJSON(req);
        dbLayer.setConfig('lang', body.lang || 'en');
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      if (pathname === '/api/system/reset' && req.method === 'POST') {
        dbLayer.seedDatabase();
        return sendJSON(res, { ok: true, state: dbLayer.getFullState() });
      }

      // If no route matched
      return sendJSON(res, { error: 'Endpoint not found' }, 404);
    } catch (apiErr) {
      console.error('API Error:', apiErr);
      return sendJSON(res, { ok: false, error: apiErr.message }, 500);
    }
  }

  // Static File Serving
  serveStatic(req, res, pathname);
}

const server = http.createServer(requestHandler);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Global Construction ERP Full-Stack Server running on port ${PORT}`);
    console.log(`Serving API on /api/* and frontend on /`);
  });
}

module.exports = { server, requestHandler };
