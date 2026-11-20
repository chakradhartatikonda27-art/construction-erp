# Global Construction ERP — Full-Stack End-to-End System

A complete full-stack Enterprise Resource Planning (ERP) platform for construction management, featuring:
- **Frontend**: Single-page application with 100% exact UI preservation, interactive Gantt charts, geospatial maps, and Visual MIS Dashboards with dynamic SVG charts.
- **Backend**: High-performance zero-dependency REST API built on Node.js native `node:http`.
- **Database**: Relational SQLite database (`database/erp.sqlite`) utilizing Node.js v24 native `node:sqlite` (DatabaseSync) with WAL mode enabled for instant ACID persistence.

---

## Architecture Overview

```
construction-erp/
├── package.json               # NPM scripts ("start", "seed")
├── index.html                 # Root frontend entrypoint
├── public/
│   └── index.html             # Frontend client connected to /api/* endpoints
├── backend/
│   ├── server.js              # REST API HTTP server & static file host (Port 8080)
│   └── db.js                  # SQLite database initialization, schema, seeds, & queries
└── database/
    └── erp.sqlite             # Persistent relational SQLite database file
```

---

## Getting Started

### Prerequisites
- Node.js v22.5.0 or later (Node v24 recommended, which includes built-in `node:sqlite`). Zero third-party `npm install` packages required!

### Running the Server
```bash
# Start backend server on port 8080 (serves both API & Frontend)
npm start
# or directly:
node backend/server.js
```

### Accessing the Live System
Open your browser at:
👉 **[http://localhost:8080](http://localhost:8080)**

---

## Database Relational Schema

The database stores all operational data across 14 relational tables:

1. `config`: System key-value pairs (`today`, `me`, `ap`, `lang`, `offline`).
2. `users`: System users and role definitions (`id`, `name`, `role`, `cost`).
3. `projects`: Active and completed projects (`id`, `name`, `city`, `lat`, `lng`, `area`, `floors`, `contract`, `start`, `status`, `team`).
4. `stages`: 12 standard construction stages per project (`id`, `project_id`, `name`, `dur`, `bill`, `qa`, `status`, `prog`, `ps`, `pe`, `as`, `ae`, `mats`).
5. `roster`: Site labor workers and wage cards per project.
6. `stock`: Real-time warehouse & site material inventory quantities.
7. `attendance`: Daily labor muster roll & staff check-ins with geo-distance tracking.
8. `dprs`: Daily Progress Reports with stage progress increments, delays, notes, and photos.
9. `prs`: Material Purchase Requisitions, approvals, and PO generation.
10. `inspections`: Quality Assurance (QA/QC) inspection checklists, pass/fail status, and remarks.
11. `invoices`: Milestone stage billing invoices and payment tracking.
12. `expenses`: Site operational petty cash and vendor expenses.
13. `audit_log`: Chronological system change log for compliance and tamper evidence.
14. `hse`: Health, Safety & Environment incident reports and toolbox meeting logs.
15. `units`: Real estate sales inventory tracking (Available, Booked, Sold).
16. `wa_messages`: WhatsApp simulated notifications & actionable approval alerts.

---

## REST API Endpoints

### State & Synchronization
- `GET /api/state` — Returns entire synchronized state tree.
- `POST /api/advance-date` — Advances simulated system date (`+1` or `+7` days) and records audit logs.
- `POST /api/config/user` — Switches active user/role context.
- `POST /api/config/project` — Switches active project context.
- `POST /api/config/lang` — Toggles interface language (EN/TE).
- `POST /api/config/offline` — Toggles offline mode simulation.
- `POST /api/reset` — Re-initializes database schema and reseeds initial sample datasets.

### Projects & Stages
- `GET /api/projects` — List all projects.
- `POST /api/projects` — Create a new construction project and auto-generate 12-stage WBS.
- `POST /api/projects/:id/team` — Assign or update project team roster.
- `POST /api/projects/:id/stages/:k/update` — Update stage status, progress percentage, or dates.

### Field Operations & Labor
- `GET /api/attendance` — Retrieve labor attendance records.
- `POST /api/attendance/checkin` — Check in site engineer or labor muster roll.
- `POST /api/attendance/save-day` — Save full day labor muster roll with overtime and daily wage costs.
- `GET /api/dprs` — List Daily Progress Reports.
- `POST /api/dprs` — Submit Daily Progress Report with progress %, material consumption, delay causes, and photos.

### Procurement & Materials
- `GET /api/stock` — Real-time material inventory levels.
- `GET /api/prs` — Material Purchase Requisitions.
- `POST /api/prs` — Raise new material purchase requisition.
- `POST /api/prs/:id/approve` — Approve PR and assign vendor/rate.
- `POST /api/prs/:id/receive` — Generate Goods Receipt Note (GRN) and increment stock.

### Quality, Finance & CRM
- `GET /api/inspections` / `POST /api/inspections` — QA stage inspections.
- `GET /api/invoices` / `POST /api/invoices/:id/pay` — Client stage billing & payments.
- `GET /api/expenses` / `POST /api/expenses` — Log operational expenses.
- `GET /api/crm/units` / `POST /api/crm/units/book` — Real estate unit booking & sales tracking.
- `GET /api/hse` / `POST /api/hse` — HSE incident & toolbox meeting logging.
- `GET /api/audit-logs` — Full audit trail.
