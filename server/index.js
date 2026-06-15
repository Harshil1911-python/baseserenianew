const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
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
    share_token TEXT UNIQUE,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sheet_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    position INTEGER NOT NULL,
    FOREIGN KEY (sheet_id) REFERENCES sheets(id)
  );

  CREATE TABLE IF NOT EXISTS rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sheet_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    FOREIGN KEY (sheet_id) REFERENCES sheets(id)
  );

  CREATE TABLE IF NOT EXISTS cells (
    row_id INTEGER NOT NULL,
    column_id INTEGER NOT NULL,
    value TEXT,
    PRIMARY KEY (row_id, column_id),
    FOREIGN KEY (row_id) REFERENCES rows(id),
    FOREIGN KEY (column_id) REFERENCES columns(id)
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

function ownsSheet(userId, sheetId) {
  return db.prepare("SELECT id FROM sheets WHERE id = ? AND user_id = ?").get(sheetId, userId);
}

const DEFAULT_COLUMNS = ["Name", "Company", "Phone", "Gmail", "Notes", "Reminder", "Alarm", "Tags"];
const DEFAULT_ROWS = 8;

function createDefaultSheet(userId, name) {
  const sheet = db.prepare("INSERT INTO sheets (user_id, name, sort_order) VALUES (?, ?, 0)").run(userId, name);
  const sheetId = sheet.lastInsertRowid;
  DEFAULT_COLUMNS.forEach((colName, i) => {
    db.prepare("INSERT INTO columns (sheet_id, name, position) VALUES (?, ?, ?)").run(sheetId, colName, i);
  });
  for (let i = 0; i < DEFAULT_ROWS; i++) {
    db.prepare("INSERT INTO rows (sheet_id, position) VALUES (?, ?)").run(sheetId, i);
  }
  return sheetId;
}

// ---------- Auth routes ----------
app.post("/api/auth/register", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return res.status(400).json({ error: "Account already exists" });

  const hash = bcrypt.hashSync(password, 10);
  const user = db.prepare("INSERT INTO users (email, password) VALUES (?, ?)").run(email, hash);
  createDefaultSheet(user.lastInsertRowid, "Sheet1");

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
  res.json(db.prepare("SELECT id, name, sort_order, share_token FROM sheets WHERE user_id = ? ORDER BY sort_order, id").all(req.user.id));
});

app.post("/api/sheets", auth, (req, res) => {
  const { name } = req.body;
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order),0) AS m FROM sheets WHERE user_id = ?").get(req.user.id).m;
  const sheetId = createDefaultSheet(req.user.id, name || "New Sheet");
  db.prepare("UPDATE sheets SET sort_order = ? WHERE id = ?").run(maxOrder + 1, sheetId);
  res.json(db.prepare("SELECT id, name, sort_order, share_token FROM sheets WHERE id = ?").get(sheetId));
});

app.put("/api/sheets/:id", auth, (req, res) => {
  if (!ownsSheet(req.user.id, req.params.id)) return res.status(404).json({ error: "Sheet not found" });
  db.prepare("UPDATE sheets SET name = ? WHERE id = ?").run(req.body.name, req.params.id);
  res.json(db.prepare("SELECT id, name, sort_order, share_token FROM sheets WHERE id = ?").get(req.params.id));
});

app.delete("/api/sheets/:id", auth, (req, res) => {
  if (!ownsSheet(req.user.id, req.params.id)) return res.status(404).json({ error: "Sheet not found" });
  const count = db.prepare("SELECT COUNT(*) AS c FROM sheets WHERE user_id = ?").get(req.user.id).c;
  if (count <= 1) return res.status(400).json({ error: "Cannot delete the only sheet" });
  const colIds = db.prepare("SELECT id FROM columns WHERE sheet_id = ?").all(req.params.id).map(c => c.id);
  const rowIds = db.prepare("SELECT id FROM rows WHERE sheet_id = ?").all(req.params.id).map(r => r.id);
  const delCells = db.prepare("DELETE FROM cells WHERE row_id = ?");
  rowIds.forEach(id => delCells.run(id));
  db.prepare("DELETE FROM rows WHERE sheet_id = ?").run(req.params.id);
  db.prepare("DELETE FROM columns WHERE sheet_id = ?").run(req.params.id);
  db.prepare("DELETE FROM sheets WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// Generate / revoke a public share link for a sheet
app.post("/api/sheets/:id/share", auth, (req, res) => {
  if (!ownsSheet(req.user.id, req.params.id)) return res.status(404).json({ error: "Sheet not found" });
  const token = crypto.randomBytes(12).toString("hex");
  db.prepare("UPDATE sheets SET share_token = ? WHERE id = ?").run(token, req.params.id);
  res.json({ share_token: token });
});

app.delete("/api/sheets/:id/share", auth, (req, res) => {
  if (!ownsSheet(req.user.id, req.params.id)) return res.status(404).json({ error: "Sheet not found" });
  db.prepare("UPDATE sheets SET share_token = NULL WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ---------- Full sheet data (columns + rows + cells) ----------
function getSheetData(sheetId) {
  const columns = db.prepare("SELECT * FROM columns WHERE sheet_id = ? ORDER BY position, id").all(sheetId);
  const rowsList = db.prepare("SELECT * FROM rows WHERE sheet_id = ? ORDER BY position, id").all(sheetId);
  const rowIds = rowsList.map(r => r.id);
  let cellsByRow = {};
  if (rowIds.length) {
    const placeholders = rowIds.map(() => "?").join(",");
    const cellRows = db.prepare(`SELECT * FROM cells WHERE row_id IN (${placeholders})`).all(...rowIds);
    for (const c of cellRows) {
      (cellsByRow[c.row_id] ||= {})[c.column_id] = c.value;
    }
  }
  return {
    columns,
    rows: rowsList.map(r => ({ id: r.id, position: r.position, cells: cellsByRow[r.id] || {} })),
  };
}

app.get("/api/sheets/:id/data", auth, (req, res) => {
  if (!ownsSheet(req.user.id, req.params.id)) return res.status(404).json({ error: "Sheet not found" });
  res.json(getSheetData(req.params.id));
});

// Public read-only view via share token
app.get("/api/public/:token", (req, res) => {
  const sheet = db.prepare("SELECT * FROM sheets WHERE share_token = ?").get(req.params.token);
  if (!sheet) return res.status(404).json({ error: "Link not found" });
  res.json({ name: sheet.name, ...getSheetData(sheet.id) });
});

// ---------- Columns ----------
app.post("/api/sheets/:id/columns", auth, (req, res) => {
  if (!ownsSheet(req.user.id, req.params.id)) return res.status(404).json({ error: "Sheet not found" });
  const { name, type } = req.body;
  const maxPos = db.prepare("SELECT COALESCE(MAX(position),-1) AS m FROM columns WHERE sheet_id = ?").get(req.params.id).m;
  const r = db.prepare("INSERT INTO columns (sheet_id, name, type, position) VALUES (?, ?, ?, ?)")
    .run(req.params.id, name || "New Column", type || "text", maxPos + 1);
  res.json(db.prepare("SELECT * FROM columns WHERE id = ?").get(r.lastInsertRowid));
});

app.put("/api/columns/:id", auth, (req, res) => {
  const col = db.prepare("SELECT c.* FROM columns c JOIN sheets s ON c.sheet_id = s.id WHERE c.id = ? AND s.user_id = ?")
    .get(req.params.id, req.user.id);
  if (!col) return res.status(404).json({ error: "Column not found" });
  const { name, type } = req.body;
  db.prepare("UPDATE columns SET name = COALESCE(?, name), type = COALESCE(?, type) WHERE id = ?")
    .run(name, type, req.params.id);
  res.json(db.prepare("SELECT * FROM columns WHERE id = ?").get(req.params.id));
});

app.delete("/api/columns/:id", auth, (req, res) => {
  const col = db.prepare("SELECT c.* FROM columns c JOIN sheets s ON c.sheet_id = s.id WHERE c.id = ? AND s.user_id = ?")
    .get(req.params.id, req.user.id);
  if (!col) return res.status(404).json({ error: "Column not found" });
  const count = db.prepare("SELECT COUNT(*) AS c FROM columns WHERE sheet_id = ?").get(col.sheet_id).c;
  if (count <= 1) return res.status(400).json({ error: "Sheet must have at least one column" });
  db.prepare("DELETE FROM cells WHERE column_id = ?").run(req.params.id);
  db.prepare("DELETE FROM columns WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ---------- Rows ----------
app.post("/api/sheets/:id/rows", auth, (req, res) => {
  if (!ownsSheet(req.user.id, req.params.id)) return res.status(404).json({ error: "Sheet not found" });
  const maxPos = db.prepare("SELECT COALESCE(MAX(position),-1) AS m FROM rows WHERE sheet_id = ?").get(req.params.id).m;
  const r = db.prepare("INSERT INTO rows (sheet_id, position) VALUES (?, ?)").run(req.params.id, maxPos + 1);
  res.json({ id: r.lastInsertRowid, position: maxPos + 1, cells: {} });
});

app.delete("/api/rows/:id", auth, (req, res) => {
  const row = db.prepare("SELECT r.* FROM rows r JOIN sheets s ON r.sheet_id = s.id WHERE r.id = ? AND s.user_id = ?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "Row not found" });
  db.prepare("DELETE FROM cells WHERE row_id = ?").run(req.params.id);
  db.prepare("DELETE FROM rows WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ---------- Cells ----------
app.put("/api/cells", auth, (req, res) => {
  const { row_id, column_id, value } = req.body;
  const row = db.prepare("SELECT r.* FROM rows r JOIN sheets s ON r.sheet_id = s.id WHERE r.id = ? AND s.user_id = ?")
    .get(row_id, req.user.id);
  if (!row) return res.status(404).json({ error: "Row not found" });
  db.prepare(`
    INSERT INTO cells (row_id, column_id, value) VALUES (?, ?, ?)
    ON CONFLICT(row_id, column_id) DO UPDATE SET value = excluded.value
  `).run(row_id, column_id, value);
  res.json({ success: true });
});

// ---------- CSV import / export ----------
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

app.get("/api/sheets/:id/export", auth, (req, res) => {
  if (!ownsSheet(req.user.id, req.params.id)) return res.status(404).json({ error: "Sheet not found" });
  const { columns, rows: rowsList } = getSheetData(req.params.id);
  const lines = [columns.map(c => toCsvValue(c.name)).join(",")];
  for (const r of rowsList) {
    lines.push(columns.map(c => toCsvValue(r.cells[c.id])).join(","));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="sheet-${req.params.id}.csv"`);
  res.send(lines.join("\n"));
});

// Import CSV: first row = column names. Creates any columns that don't exist (by name match), appends rows.
app.post("/api/sheets/:id/import", auth, (req, res) => {
  if (!ownsSheet(req.user.id, req.params.id)) return res.status(404).json({ error: "Sheet not found" });
  const { csv } = req.body;
  if (!csv) return res.status(400).json({ error: "No CSV data provided" });

  const lines = csv.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 1) return res.json({ imported: 0 });

  const headerNames = parseCsvLine(lines[0]).map(h => h.trim());
  let columns = db.prepare("SELECT * FROM columns WHERE sheet_id = ? ORDER BY position").all(req.params.id);
  let maxPos = columns.length ? Math.max(...columns.map(c => c.position)) : -1;

  const colIdForHeader = headerNames.map(h => {
    let existing = columns.find(c => c.name.toLowerCase() === h.toLowerCase());
    if (existing) return existing.id;
    maxPos++;
    const r = db.prepare("INSERT INTO columns (sheet_id, name, position) VALUES (?, ?, ?)").run(req.params.id, h || "Column", maxPos);
    const newCol = { id: r.lastInsertRowid, name: h, position: maxPos };
    columns.push(newCol);
    return newCol.id;
  });

  let maxRowPos = db.prepare("SELECT COALESCE(MAX(position),-1) AS m FROM rows WHERE sheet_id = ?").get(req.params.id).m;
  let count = 0;
  const insertCell = db.prepare(`
    INSERT INTO cells (row_id, column_id, value) VALUES (?, ?, ?)
    ON CONFLICT(row_id, column_id) DO UPDATE SET value = excluded.value
  `);
  const tx = db.transaction(() => {
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (!cols.some(v => v && v.trim())) continue;
      maxRowPos++;
      const rowRes = db.prepare("INSERT INTO rows (sheet_id, position) VALUES (?, ?)").run(req.params.id, maxRowPos);
      const rowId = rowRes.lastInsertRowid;
      cols.forEach((val, idx) => {
        if (idx < colIdForHeader.length) insertCell.run(rowId, colIdForHeader[idx], val);
      });
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
