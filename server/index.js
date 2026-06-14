const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const JWT_SECRET = process.env.JWT_SECRET || "base-serenia-dev-secret";
const db = new Database(path.join(__dirname, "serenia.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sheets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sheet_id INTEGER NOT NULL,
    name TEXT, company TEXT, phone TEXT, email TEXT,
    notes TEXT, reminder TEXT, alarm TEXT, tags TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (sheet_id) REFERENCES sheets(id)
  );
`);

// ---------- Auth helpers ----------
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ---------- Auth routes ----------
app.post("/api/auth/register", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return res.status(400).json({ error: "Account already exists" });

  const hash = bcrypt.hashSync(password, 10);
  const user = db.prepare("INSERT INTO users (email, password) VALUES (?, ?)").run(email, hash);

  // Create a default sheet for the new user
  db.prepare("INSERT INTO sheets (user_id, name, sort_order) VALUES (?, ?, ?)").run(user.lastInsertRowid, "Sheet1", 0);

  const token = jwt.sign({ id: user.lastInsertRowid, email }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, email });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, email: user.email });
});

// ---------- Sheet routes ----------
app.get("/api/sheets", auth, (req, res) => {
  res.json(db.prepare("SELECT * FROM sheets WHERE user_id = ? ORDER BY sort_order, id").all(req.user.id));
});

app.post("/api/sheets", auth, (req, res) => {
  const { name } = req.body;
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order),0) AS m FROM sheets WHERE user_id = ?").get(req.user.id).m;
  const r = db.prepare("INSERT INTO sheets (user_id, name, sort_order) VALUES (?, ?, ?)")
    .run(req.user.id, name || "New Sheet", maxOrder + 1);
  res.json(db.prepare("SELECT * FROM sheets WHERE id = ?").get(r.lastInsertRowid));
});

app.put("/api/sheets/:id", auth, (req, res) => {
  const sheet = db.prepare("SELECT * FROM sheets WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!sheet) return res.status(404).json({ error: "Sheet not found" });
  db.prepare("UPDATE sheets SET name = ? WHERE id = ?").run(req.body.name, req.params.id);
  res.json(db.prepare("SELECT * FROM sheets WHERE id = ?").get(req.params.id));
});

app.delete("/api/sheets/:id", auth, (req, res) => {
  const sheet = db.prepare("SELECT * FROM sheets WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!sheet) return res.status(404).json({ error: "Sheet not found" });
  const count = db.prepare("SELECT COUNT(*) AS c FROM sheets WHERE user_id = ?").get(req.user.id).c;
  if (count <= 1) return res.status(400).json({ error: "Cannot delete the only sheet" });
  db.prepare("DELETE FROM records WHERE sheet_id = ?").run(req.params.id);
  db.prepare("DELETE FROM sheets WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ---------- Record routes (scoped to sheet, verified via ownership) ----------
function ownsSheet(userId, sheetId) {
  return db.prepare("SELECT id FROM sheets WHERE id = ? AND user_id = ?").get(sheetId, userId);
}

app.get("/api/sheets/:sheetId/records", auth, (req, res) => {
  if (!ownsSheet(req.user.id, req.params.sheetId)) return res.status(404).json({ error: "Sheet not found" });
  res.json(db.prepare("SELECT * FROM records WHERE sheet_id = ? ORDER BY id DESC").all(req.params.sheetId));
});

app.post("/api/sheets/:sheetId/records", auth, (req, res) => {
  if (!ownsSheet(req.user.id, req.params.sheetId)) return res.status(404).json({ error: "Sheet not found" });
  const { name, company, phone, email, notes, reminder, alarm, tags } = req.body;
  const r = db.prepare(`INSERT INTO records (sheet_id,name,company,phone,email,notes,reminder,alarm,tags)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(req.params.sheetId, name, company, phone, email, notes, reminder, alarm, tags);
  res.json(db.prepare("SELECT * FROM records WHERE id=?").get(r.lastInsertRowid));
});

app.put("/api/records/:id", auth, (req, res) => {
  const rec = db.prepare("SELECT r.* FROM records r JOIN sheets s ON r.sheet_id = s.id WHERE r.id = ? AND s.user_id = ?")
    .get(req.params.id, req.user.id);
  if (!rec) return res.status(404).json({ error: "Record not found" });
  const { name, company, phone, email, notes, reminder, alarm, tags } = req.body;
  db.prepare(`UPDATE records SET name=?,company=?,phone=?,email=?,notes=?,reminder=?,alarm=?,tags=? WHERE id=?`)
    .run(name, company, phone, email, notes, reminder, alarm, tags, req.params.id);
  res.json(db.prepare("SELECT * FROM records WHERE id=?").get(req.params.id));
});

app.delete("/api/records/:id", auth, (req, res) => {
  const rec = db.prepare("SELECT r.* FROM records r JOIN sheets s ON r.sheet_id = s.id WHERE r.id = ? AND s.user_id = ?")
    .get(req.params.id, req.user.id);
  if (!rec) return res.status(404).json({ error: "Record not found" });
  db.prepare("DELETE FROM records WHERE id=?").run(req.params.id);
  res.json({ success: true });
});

// ---------- CSV import / export ----------
const CSV_FIELDS = ["name", "company", "phone", "email", "notes", "reminder", "alarm", "tags"];

function toCsvValue(val) {
  if (val == null) return "";
  const s = String(val);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsvLine(line) {
  const result = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { result.push(cur); cur = ""; }
      else cur += c;
    }
  }
  result.push(cur);
  return result;
}

app.get("/api/sheets/:sheetId/export", auth, (req, res) => {
  if (!ownsSheet(req.user.id, req.params.sheetId)) return res.status(404).json({ error: "Sheet not found" });
  const rows = db.prepare("SELECT * FROM records WHERE sheet_id = ? ORDER BY id").all(req.params.sheetId);
  const header = ["Name", "Company", "Phone", "Gmail", "Notes", "Reminder", "Alarm", "Tags"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(CSV_FIELDS.map(f => toCsvValue(r[f])).join(","));
  }
  const csv = lines.join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="sheet-${req.params.sheetId}.csv"`);
  res.send(csv);
});

app.post("/api/sheets/:sheetId/import", auth, (req, res) => {
  if (!ownsSheet(req.user.id, req.params.sheetId)) return res.status(404).json({ error: "Sheet not found" });
  const { csv } = req.body;
  if (!csv) return res.status(400).json({ error: "No CSV data provided" });

  const lines = csv.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return res.json({ imported: 0 });

  const header = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const colMap = CSV_FIELDS.map(f => {
    const idx = header.findIndex(h => h === f || h === (f === "email" ? "gmail" : f));
    return idx;
  });

  const insert = db.prepare(`INSERT INTO records (sheet_id,name,company,phone,email,notes,reminder,alarm,tags)
    VALUES (?,?,?,?,?,?,?,?,?)`);

  let count = 0;
  const tx = db.transaction(() => {
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const values = CSV_FIELDS.map((f, fi) => colMap[fi] >= 0 ? (cols[colMap[fi]] || "") : "");
      if (!values.some(v => v && v.trim())) continue;
      insert.run(req.params.sheetId, ...values);
      count++;
    }
  });
  tx();

  res.json({ imported: count });
});

// ---------- Serve frontend ----------
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Base Serenia running on port ${PORT}`));
