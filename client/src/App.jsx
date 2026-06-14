import React, { useEffect, useState, useMemo } from "react";

const FIELDS = [
  { key: "name", label: "Name" },
  { key: "company", label: "Company" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Gmail" },
  { key: "notes", label: "Notes" },
  { key: "reminder", label: "Reminder" },
  { key: "alarm", label: "Alarm" },
  { key: "tags", label: "Tags" },
];

const empty = { name: "", company: "", phone: "", email: "", notes: "", reminder: "", alarm: "", tags: "" };

export default function App() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(empty);

  const load = () => fetch("/api/records").then(r => r.json()).then(setRows);
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => FIELDS.some(f => (r[f.key] || "").toLowerCase().includes(q)));
  }, [rows, search]);

  const save = async () => {
    if (!form.name) return alert("Name is required");
    const url = editingId ? `/api/records/${editingId}` : "/api/records";
    const method = editingId ? "PUT" : "POST";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setForm(empty); setEditingId(null); load();
  };

  const edit = (row) => { setForm(row); setEditingId(row.id); };
  const del = async (id) => { if (confirm("Delete this record?")) { await fetch(`/api/records/${id}`, { method: "DELETE" }); load(); } };
  const cancel = () => { setForm(empty); setEditingId(null); };

  return (
    <div className="app">
      <header>
        <h1>📋 Base Serenia</h1>
        <input className="search" placeholder="Search records..." value={search} onChange={e => setSearch(e.target.value)} />
      </header>

      <section className="form-card">
        <h2>{editingId ? "Edit Record" : "Add New Record"}</h2>
        <div className="form-grid">
          {FIELDS.map(f => (
            <input
              key={f.key}
              placeholder={f.label}
              type={f.key === "reminder" || f.key === "alarm" ? "datetime-local" : "text"}
              value={form[f.key] || ""}
              onChange={e => setForm({ ...form, [f.key]: e.target.value })}
            />
          ))}
        </div>
        <div className="actions">
          <button className="primary" onClick={save}>{editingId ? "Update" : "Add Record"}</button>
          {editingId && <button onClick={cancel}>Cancel</button>}
        </div>
      </section>

      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              {FIELDS.map(f => <th key={f.key}>{f.label}</th>)}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.company}</td>
                <td>
                  {r.phone && (
                    <>
                      <a href={`tel:${r.phone}`}>📞</a>{" "}
                      <a href={`https://wa.me/${r.phone.replace(/\D/g, "")}`} target="_blank">💬</a>{" "}
                      {r.phone}
                    </>
                  )}
                </td>
                <td>
                  {r.email && (
                    <a href={`https://mail.google.com/mail/?view=cm&fs=1&to=${r.email}`} target="_blank">✉️ {r.email}</a>
                  )}
                </td>
                <td>{r.notes}</td>
                <td>{r.reminder && new Date(r.reminder).toLocaleString()}</td>
                <td>{r.alarm && new Date(r.alarm).toLocaleString()}</td>
                <td>{r.tags}</td>
                <td className="row-actions">
                  <button onClick={() => edit(r)}>✏️</button>
                  <button onClick={() => del(r.id)}>🗑️</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="empty">No records found.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <footer>Total records: {rows.length}</footer>
    </div>
  );
}
