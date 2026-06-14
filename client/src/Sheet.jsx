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

export default function Sheet({ token, sheetId, search }) {
  const [rows, setRows] = useState([]);
  const [editCell, setEditCell] = useState(null);
  const [newRow, setNewRow] = useState(empty);
  const [sort, setSort] = useState({ key: null, dir: 1 });
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = () =>
    fetch(`/api/sheets/${sheetId}/records`, { headers: authHeaders })
      .then(r => r.json())
      .then(setRows);

  useEffect(() => { load(); setNewRow(empty); setSort({ key: null, dir: 1 }); }, [sheetId]);
  useEffect(() => { if (editCell && inputRef.current) inputRef.current.focus(); }, [editCell]);

  const filtered = useMemo(() => {
    const q = (search || "").toLowerCase();
    let list = rows.filter(r => FIELDS.some(f => (r[f.key] || "").toLowerCase().includes(q)));
    if (sort.key) {
      list = [...list].sort((a, b) => {
        const av = (a[sort.key] || "").toLowerCase();
        const bv = (b[sort.key] || "").toLowerCase();
        if (av < bv) return -1 * sort.dir;
        if (av > bv) return 1 * sort.dir;
        return 0;
      });
    }
    return list;
  }, [rows, search, sort]);

  const toggleSort = (key) => {
    setSort(s => s.key === key ? { key, dir: -s.dir } : { key, dir: 1 });
  };

  const updateCell = async (row, key, value) => {
    const updated = { ...row, [key]: value };
    setRows(rows.map(r => (r.id === row.id ? updated : r)));
    await fetch(`/api/records/${row.id}`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify(updated),
    });
  };

  const addRow = async (key, value) => {
    const draft = { ...newRow, [key]: value };
    if (!draft.name && !draft.company && !draft.phone && !draft.email) {
      setNewRow(draft);
      return;
    }
    const res = await fetch(`/api/sheets/${sheetId}/records`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(draft),
    });
    const created = await res.json();
    setRows([created, ...rows]);
    setNewRow(empty);
  };

  const delRow = async (id) => {
    if (!confirm("Delete this row?")) return;
    await fetch(`/api/records/${id}`, { method: "DELETE", headers: authHeaders });
    setRows(rows.filter(r => r.id !== id));
  };

  const isDateField = (key) => key === "reminder" || key === "alarm";

  // ----- CSV export -----
  const exportCsvBlob = async () => {
    const res = await fetch(`/api/sheets/${sheetId}/export`, { headers: authHeaders });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `base-serenia-sheet-${sheetId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ----- CSV import -----
  const importCsv = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const res = await fetch(`/api/sheets/${sheetId}/import`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ csv: text }),
    });
    const data = await res.json();
    if (res.ok) {
      alert(`Imported ${data.imported} row(s).`);
      load();
    } else {
      alert(data.error || "Import failed");
    }
    e.target.value = "";
  };

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
      const isPast = new Date(val).getTime() < Date.now();
      return <span className={isPast ? "overdue" : ""}>{new Date(val).toLocaleString()}</span>;
    }
    return <span>{val}</span>;
  };

  return (
    <div className="sheet-area">
      <div className="toolbar">
        <button onClick={exportCsvBlob}>⬇️ Export CSV</button>
        <button onClick={() => fileInputRef.current.click()}>⬆️ Import CSV</button>
        <input ref={fileInputRef} type="file" accept=".csv" onChange={importCsv} style={{ display: "none" }} />
      </div>

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
              {FIELDS.map(f => (
                <th key={f.key} className="sortable" onClick={() => toggleSort(f.key)}>
                  {f.label}{sort.key === f.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                </th>
              ))}
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
                            () => { setEditCell(null); updateCell(row, f.key, row[f.key]); },
                            (v) => setRows(rows.map(r => r.id === row.id ? { ...r, [f.key]: v } : r)),
                            isDateField(f.key) ? "datetime-local" : "text"
                          )
                        : renderDisplay(row, f)}
                    </td>
                  );
                })}
                <td className="action-col">
                  <button className="del-btn" title="Delete row" onClick={() => delRow(row.id)}>🗑️</button>
                </td>
              </tr>
            ))}

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
        <span className="hint">Click a cell to edit · Click a column header to sort</span>
      </footer>
    </div>
  );
}
