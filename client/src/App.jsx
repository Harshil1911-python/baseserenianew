import React, { useEffect, useState, useMemo, useRef } from "react";

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

const COLS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const empty = { name: "", company: "", phone: "", email: "", notes: "", reminder: "", alarm: "", tags: "" };

export default function App() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [editCell, setEditCell] = useState(null); // {id, key} or "new-<key>"
  const [newRow, setNewRow] = useState(empty);
  const inputRef = useRef(null);

  const load = () => fetch("/api/records").then(r => r.json()).then(setRows);
  useEffect(() => { load(); }, []);
  useEffect(() => { if (editCell && inputRef.current) inputRef.current.focus(); }, [editCell]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => FIELDS.some(f => (r[f.key] || "").toLowerCase().includes(q)));
  }, [rows, search]);

  const updateCell = async (row, key, value) => {
    const updated = { ...row, [key]: value };
    setRows(rows.map(r => (r.id === row.id ? updated : r)));
    await fetch(`/api/records/${row.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
  };

  const addRow = async (key, value) => {
    const draft = { ...newRow, [key]: value };
    if (!draft.name && !draft.company && !draft.phone && !draft.email) {
      setNewRow(draft);
      return;
    }
    const res = await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const created = await res.json();
    setRows([created, ...rows]);
    setNewRow(empty);
  };

  const delRow = async (id) => {
    if (!confirm("Delete this row?")) return;
    await fetch(`/api/records/${id}`, { method: "DELETE" });
    setRows(rows.filter(r => r.id !== id));
  };

  const isDateField = (key) => key === "reminder" || key === "alarm";

  const renderInput = (value, onCommit, onChange, type = "text") => (
    <input
      ref={inputRef}
      className="cell-input"
      type={type}
      value={value || ""}
      autoFocus
      onChange={e => onChange(e.target.value)}
      onBlur={() => onCommit()}
      onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") { e.target.blur(); } }}
    />
  );

  const renderDisplay = (row, f) => {
    const val = row[f.key];
    if (f.key === "phone" && val) {
      return (
        <span className="cell-content">
          <a href={`tel:${val}`} title="Call" onClick={e => e.stopPropagation()}>📞</a>
          <a href={`https://wa.me/${val.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" title="WhatsApp" onClick={e => e.stopPropagation()}>💬</a>
          {val}
        </span>
      );
    }
    if (f.key === "email" && val) {
      return (
        <a className="cell-content" href={`https://mail.google.com/mail/?view=cm&fs=1&to=${val}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
          ✉️ {val}
        </a>
      );
    }
    if (isDateField(f.key) && val) {
      return <span>{new Date(val).toLocaleString()}</span>;
    }
    return <span>{val}</span>;
  };

  return (
    <div className="app">
      <header>
        <h1>📊 Base Serenia</h1>
        <input className="search" placeholder="Find in sheet..." value={search} onChange={e => setSearch(e.target.value)} />
      </header>

      <div className="sheet-wrap">
        <table className="sheet">
          <thead>
            <tr className="col-header-row">
              <th className="corner"></th>
              {COLS.map(c => <th key={c} className="col-letter">{c}</th>)}
              <th className="col-letter action-col"></th>
            </tr>
            <tr className="field-header-row">
              <th className="row-num"></th>
              {FIELDS.map(f => <th key={f.key}>{f.label}</th>)}
              <th className="action-col"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, idx) => (
              <tr key={row.id}>
                <td className="row-num">{idx + 1}</td>
                {FIELDS.map(f => {
                  const cellId = `${row.id}-${f.key}`;
                  const active = editCell === cellId;
                  return (
                    <td
                      key={f.key}
                      className={`cell ${active ? "active" : ""}`}
                      onClick={() => setEditCell(cellId)}
                    >
                      {active
                        ? renderInput(
                            row[f.key],
                            () => setEditCell(null),
                            (v) => setRows(rows.map(r => r.id === row.id ? { ...r, [f.key]: v } : r)),
                            isDateField(f.key) ? "datetime-local" : "text"
                          )
                        : renderDisplay(row, f)}
                      {active && (
                        <div className="commit-hint" />
                      )}
                    </td>
                  );
                })}
                <td className="action-col">
                  <button className="del-btn" title="Delete row" onClick={() => delRow(row.id)}>🗑️</button>
                </td>
              </tr>
            ))}

            {/* Empty add-row */}
            <tr className="new-row">
              <td className="row-num">{filtered.length + 1}</td>
              {FIELDS.map(f => {
                const cellId = `new-${f.key}`;
                const active = editCell === cellId;
                return (
                  <td
                    key={f.key}
                    className={`cell ${active ? "active" : ""}`}
                    onClick={() => setEditCell(cellId)}
                  >
                    {active
                      ? renderInput(
                          newRow[f.key],
                          () => { setEditCell(null); addRow(f.key, newRow[f.key]); },
                          (v) => setNewRow({ ...newRow, [f.key]: v }),
                          isDateField(f.key) ? "datetime-local" : "text"
                        )
                      : <span className="placeholder">{newRow[f.key] || ""}</span>}
                  </td>
                );
              })}
              <td className="action-col"></td>
            </tr>

            {filtered.length === 0 && search && (
              <tr><td colSpan={10} className="empty">No matches for "{search}"</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <footer>
        <span>{rows.length} row{rows.length !== 1 ? "s" : ""}</span>
        <span className="hint">Click any cell to edit · Press Enter or click away to save</span>
      </footer>
    </div>
  );
}
