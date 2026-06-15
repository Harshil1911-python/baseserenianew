import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";

const COL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function colLetter(idx) {
  let s = "";
  idx++;
  while (idx > 0) {
    const rem = (idx - 1) % 26;
    s = COL_LETTERS[rem] + s;
    idx = Math.floor((idx - 1) / 26);
  }
  return s;
}

const DEFAULT_MIN_ROWS = 8;

export default function Sheet({ token, sheetId, search }) {
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [editCell, setEditCell] = useState(null); // {rowId, colId}
  const [editColId, setEditColId] = useState(null);
  const [sort, setSort] = useState({ colId: null, dir: 1 });
  const inputRef = useRef(null);
  const colInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const gridRef = useRef(null);

  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = useCallback(async () => {
    const res = await fetch(`/api/sheets/${sheetId}/data`, { headers: authHeaders });
    const data = await res.json();
    setColumns(data.columns);
    setRows(data.rows);
    if (data.rows.length && data.columns.length) {
      setEditCell({ rowId: data.rows[0].id, colId: data.columns[0].id, viewing: true });
    }
  }, [sheetId, token]);

  useEffect(() => { load(); setSort({ colId: null, dir: 1 }); setEditCell(null); }, [sheetId]);
  useEffect(() => { if (editCell && inputRef.current) { inputRef.current.focus(); inputRef.current.select?.(); } }, [editCell]);
  useEffect(() => { if (editColId && colInputRef.current) { colInputRef.current.focus(); colInputRef.current.select(); } }, [editColId]);

  const isDateField = (col) => col && (col.type === "datetime" || /reminder|alarm/i.test(col.name));

  // ----- filter + sort -----
  const filtered = useMemo(() => {
    const q = (search || "").toLowerCase();
    let list = rows.filter(r => !q || columns.some(c => (r.cells[c.id] || "").toLowerCase().includes(q)));
    if (sort.colId) {
      list = [...list].sort((a, b) => {
        const av = (a.cells[sort.colId] || "").toLowerCase();
        const bv = (b.cells[sort.colId] || "").toLowerCase();
        if (av < bv) return -1 * sort.dir;
        if (av > bv) return 1 * sort.dir;
        return 0;
      });
    }
    return list;
  }, [rows, columns, search, sort]);

  const toggleSort = (colId) => setSort(s => s.colId === colId ? { colId, dir: -s.dir } : { colId, dir: 1 });

  // ----- cell updates -----
  const updateCell = async (rowId, colId, value) => {
    setRows(rs => rs.map(r => r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r));
    await fetch(`/api/cells`, {
      method: "PUT", headers: authHeaders,
      body: JSON.stringify({ row_id: rowId, column_id: colId, value }),
    });
  };

  // ----- rows -----
  const addRow = async () => {
    const res = await fetch(`/api/sheets/${sheetId}/rows`, { method: "POST", headers: authHeaders });
    const row = await res.json();
    setRows(rs => [...rs, row]);
  };

  const delRow = async (rowId) => {
    if (!confirm("Delete this row?")) return;
    await fetch(`/api/rows/${rowId}`, { method: "DELETE", headers: authHeaders });
    setRows(rs => rs.filter(r => r.id !== rowId));
  };

  // ----- columns -----
  const addColumn = async () => {
    const res = await fetch(`/api/sheets/${sheetId}/columns`, {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ name: `Column ${columns.length + 1}` }),
    });
    const col = await res.json();
    setColumns(cs => [...cs, col]);
  };

  const renameColumn = async (colId, name) => {
    setColumns(cs => cs.map(c => c.id === colId ? { ...c, name } : c));
    await fetch(`/api/columns/${colId}`, { method: "PUT", headers: authHeaders, body: JSON.stringify({ name }) });
  };

  const delColumn = async (colId) => {
    if (columns.length <= 1) return alert("Sheet must have at least one column.");
    if (!confirm("Delete this column and all its data?")) return;
    await fetch(`/api/columns/${colId}`, { method: "DELETE", headers: authHeaders });
    setColumns(cs => cs.filter(c => c.id !== colId));
  };

  // ----- CSV -----
  const exportCsv = async () => {
    const res = await fetch(`/api/sheets/${sheetId}/export`, { headers: authHeaders });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `base-serenia-sheet-${sheetId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const res = await fetch(`/api/sheets/${sheetId}/import`, {
      method: "POST", headers: authHeaders, body: JSON.stringify({ csv: text }),
    });
    const data = await res.json();
    if (res.ok) { alert(`Imported ${data.imported} row(s).`); load(); }
    else alert(data.error || "Import failed");
    e.target.value = "";
  };

  // ----- Keyboard navigation -----
  const moveTo = useCallback((rowIdx, colIdx) => {
    const clampedRow = Math.max(0, Math.min(filtered.length - 1, rowIdx));
    const clampedCol = Math.max(0, Math.min(columns.length - 1, colIdx));
    const row = filtered[clampedRow];
    const col = columns[clampedCol];
    if (row && col) setEditCell({ rowId: row.id, colId: col.id, viewing: true });
  }, [filtered, columns]);

  const handleGridKeyDown = (e) => {
    if (!editCell) return;
    const rowIdx = filtered.findIndex(r => r.id === editCell.rowId);
    const colIdx = columns.findIndex(c => c.id === editCell.colId);
    if (rowIdx === -1 || colIdx === -1) return;

    const isTyping = !editCell.viewing;
    if (isTyping) {
      // While typing in an input, only handle Escape/Enter (handled by input itself)
      return;
    }

    const ctrl = e.ctrlKey || e.metaKey;
    let handled = true;
    if (ctrl && e.key.toLowerCase() === "w") moveTo(rowIdx - 1, colIdx);
    else if (ctrl && e.key.toLowerCase() === "s") moveTo(rowIdx + 1, colIdx);
    else if (ctrl && e.key.toLowerCase() === "a") moveTo(rowIdx, colIdx - 1);
    else if (ctrl && e.key.toLowerCase() === "d") moveTo(rowIdx, colIdx + 1);
    else if (e.key === "ArrowUp") moveTo(rowIdx - 1, colIdx);
    else if (e.key === "ArrowDown") moveTo(rowIdx + 1, colIdx);
    else if (e.key === "ArrowLeft") moveTo(rowIdx, colIdx - 1);
    else if (e.key === "ArrowRight") moveTo(rowIdx, colIdx + 1);
    else if (e.key === "Tab") moveTo(rowIdx, colIdx + (e.shiftKey ? -1 : 1));
    else if (e.key === "Enter" || e.key === "F2") setEditCell({ ...editCell, viewing: false });
    else if (e.key === "Escape") setEditCell(null);
    else if (e.key.length === 1 && !ctrl && !e.altKey) {
      // Start typing replaces content
      setEditCell({ ...editCell, viewing: false, initial: e.key });
    } else handled = false;

    if (handled) e.preventDefault();
  };

  const renderInput = (rowId, colId, value, isDate, initial) => {
    const commit = (val) => updateCell(rowId, colId, val);
    return (
      <input
        ref={inputRef}
        className="cell-input"
        type={isDate ? "datetime-local" : "text"}
        defaultValue={initial !== undefined ? initial : (value || "")}
        autoFocus
        onBlur={e => { commit(e.target.value); setEditCell({ rowId, colId, viewing: true }); }}
        onKeyDown={e => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(e.target.value);
            const rowIdx = filtered.findIndex(r => r.id === rowId);
            moveTo(rowIdx + 1, columns.findIndex(c => c.id === colId));
          } else if (e.key === "Escape") {
            setEditCell({ rowId, colId, viewing: true });
          } else if (e.key === "Tab") {
            e.preventDefault();
            commit(e.target.value);
            const rowIdx = filtered.findIndex(r => r.id === rowId);
            const colIdx = columns.findIndex(c => c.id === colId);
            moveTo(rowIdx, colIdx + (e.shiftKey ? -1 : 1));
          }
        }}
      />
    );
  };

  const renderDisplay = (row, col) => {
    const val = row.cells[col.id];
    const nameKey = col.name.toLowerCase();
    if (nameKey.includes("phone") && val) {
      return (
        <span className="cell-content">
          <a href={`tel:${val}`} title="Call" onClick={e => e.stopPropagation()}>📞</a>
          <a href={`https://wa.me/${val.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" title="WhatsApp" onClick={e => e.stopPropagation()}>💬</a>
          {val}
        </span>
      );
    }
    if ((nameKey.includes("gmail") || nameKey.includes("email")) && val) {
      return (
        <a className="cell-content" href={`https://mail.google.com/mail/?view=cm&fs=1&to=${val}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
          ✉️ {val}
        </a>
      );
    }
    if (isDateField(col) && val) {
      const isPast = new Date(val).getTime() < Date.now();
      return <span className={isPast ? "overdue" : ""}>{new Date(val).toLocaleString()}</span>;
    }
    return <span>{val}</span>;
  };

  // Pad visible rows/columns to a minimum so the grid looks like a real sheet
  const displayCols = columns;
  const padRows = Math.max(0, DEFAULT_MIN_ROWS - filtered.length);

  return (
    <div className="sheet-area">
      <div className="toolbar">
        <button onClick={addRow}>➕ Add Row</button>
        <button onClick={addColumn}>➕ Add Column</button>
        <button onClick={exportCsv}>⬇️ Export CSV</button>
        <button onClick={() => fileInputRef.current.click()}>⬆️ Import CSV</button>
        <input ref={fileInputRef} type="file" accept=".csv" onChange={importCsv} style={{ display: "none" }} />
      </div>

      <div className="sheet-wrap" ref={gridRef} tabIndex={0} onKeyDown={handleGridKeyDown}>
        <table className="sheet">
          <thead>
            <tr className="col-header-row">
              <th className="corner"></th>
              {displayCols.map((c, i) => <th key={c.id} className="col-letter">{colLetter(i)}</th>)}
              <th className="col-letter action-col"></th>
            </tr>
            <tr className="field-header-row">
              <th className="row-num"></th>
              {displayCols.map(c => (
                <th key={c.id} className="col-name-cell">
                  {editColId === c.id ? (
                    <input
                      ref={colInputRef}
                      className="col-name-input"
                      defaultValue={c.name}
                      autoFocus
                      onBlur={e => { renameColumn(c.id, e.target.value || c.name); setEditColId(null); }}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") e.target.blur(); }}
                    />
                  ) : (
                    <div className="col-name-display">
                      <span className="sortable" onClick={() => toggleSort(c.id)}>
                        {c.name}{sort.colId === c.id ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                      </span>
                      <span className="col-edit" onClick={() => setEditColId(c.id)} title="Rename column">✏️</span>
                      <span className="col-del" onClick={() => delColumn(c.id)} title="Delete column">×</span>
                    </div>
                  )}
                </th>
              ))}
              <th className="action-col"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, idx) => (
              <tr key={row.id}>
                <td className="row-num">{idx + 1}</td>
                {displayCols.map(col => {
                  const active = editCell && editCell.rowId === row.id && editCell.colId === col.id;
                  const editing = active && !editCell.viewing;
                  return (
                    <td
                      key={col.id}
                      className={`cell ${active ? "active" : ""}`}
                      onClick={() => setEditCell({ rowId: row.id, colId: col.id, viewing: true })}
                      onDoubleClick={() => setEditCell({ rowId: row.id, colId: col.id, viewing: false })}
                    >
                      {editing
                        ? renderInput(row.id, col.id, row.cells[col.id], isDateField(col), editCell.initial)
                        : renderDisplay(row, col)}
                    </td>
                  );
                })}
                <td className="action-col">
                  <button className="del-btn" title="Delete row" onClick={() => delRow(row.id)}>🗑️</button>
                </td>
              </tr>
            ))}

            {Array.from({ length: padRows }).map((_, i) => (
              <tr key={`pad-${i}`} className="pad-row">
                <td className="row-num">{filtered.length + i + 1}</td>
                {displayCols.map(c => <td key={c.id} className="cell pad-cell" onClick={addRow}></td>)}
                <td className="action-col"></td>
              </tr>
            ))}

            {filtered.length === 0 && search && (
              <tr><td colSpan={displayCols.length + 2} className="empty">No matches for "{search}"</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <footer>
        <span>{rows.length} row{rows.length !== 1 ? "s" : ""} · {columns.length} column{columns.length !== 1 ? "s" : ""}</span>
        <span className="hint">Click a cell · Arrow keys or Ctrl+W/A/S/D to move · Enter to edit</span>
      </footer>
    </div>
  );
}
