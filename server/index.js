const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const db = new Database(path.join(__dirname, "serenia.db"));
db.exec(`
  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, company TEXT, phone TEXT, email TEXT,
    notes TEXT, reminder TEXT, alarm TEXT, tags TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

app.get("/api/records", (req, res) => {
  res.json(db.prepare("SELECT * FROM records ORDER BY id DESC").all());
});

app.post("/api/records", (req, res) => {
  const { name, company, phone, email, notes, reminder, alarm, tags } = req.body;
  const r = db.prepare(`INSERT INTO records (name,company,phone,email,notes,reminder,alarm,tags)
    VALUES (?,?,?,?,?,?,?,?)`).run(name, company, phone, email, notes, reminder, alarm, tags);
  res.json(db.prepare("SELECT * FROM records WHERE id=?").get(r.lastInsertRowid));
});

app.put("/api/records/:id", (req, res) => {
  const { name, company, phone, email, notes, reminder, alarm, tags } = req.body;
  db.prepare(`UPDATE records SET name=?,company=?,phone=?,email=?,notes=?,reminder=?,alarm=?,tags=? WHERE id=?`)
    .run(name, company, phone, email, notes, reminder, alarm, tags, req.params.id);
  res.json(db.prepare("SELECT * FROM records WHERE id=?").get(req.params.id));
});

app.delete("/api/records/:id", (req, res) => {
  db.prepare("DELETE FROM records WHERE id=?").run(req.params.id);
  res.json({ success: true });
});

// Serve frontend build
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Base Serenia running on port ${PORT}`));
