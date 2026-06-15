import React, { useEffect, useState } from "react";

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

export default function PublicSheet({ shareToken }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/public/${shareToken}`)
      .then(r => { if (!r.ok) throw new Error("Link not found or no longer shared"); return r.json(); })
      .then(setData)
      .catch(e => setError(e.message));
  }, [shareToken]);

  if (error) return <div className="public-error">⚠️ {error}</div>;
  if (!data) return <div className="public-error">Loading…</div>;

  const isDateField = (col) => /reminder|alarm/i.test(col.name);

  const renderDisplay = (row, col) => {
    const val = row.cells[col.id];
    const nameKey = col.name.toLowerCase();
    if (nameKey.includes("phone") && val) {
      return (
        <span className="cell-content">
          <a href={`tel:${val}`} title="Call">📞</a>
          <a href={`https://wa.me/${val.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" title="WhatsApp">💬</a>
          {val}
        </span>
      );
    }
    if ((nameKey.includes("gmail") || nameKey.includes("email")) && val) {
      return (
        <a className="cell-content" href={`https://mail.google.com/mail/?view=cm&fs=1&to=${val}`} target="_blank" rel="noreferrer">
          ✉️ {val}
        </a>
      );
    }
    if (isDateField(col) && val) {
      return <span>{new Date(val).toLocaleString()}</span>;
    }
    return <span>{val}</span>;
  };

  return (
    <div className="app">
      <header>
        <h1>📊 Base Serenia</h1>
        <span className="public-badge">🔒 Read-only shared view — {data.name}</span>
      </header>

      <div className="sheet-area">
        <div className="sheet-wrap">
          <table className="sheet">
            <thead>
              <tr className="col-header-row">
                <th className="corner"></th>
                {data.columns.map((c, i) => <th key={c.id} className="col-letter">{colLetter(i)}</th>)}
              </tr>
              <tr className="field-header-row">
                <th className="row-num"></th>
                {data.columns.map(c => <th key={c.id}>{c.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, idx) => (
                <tr key={row.id}>
                  <td className="row-num">{idx + 1}</td>
                  {data.columns.map(c => (
                    <td key={c.id} className="cell readonly">{renderDisplay(row, c)}</td>
                  ))}
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr><td colSpan={data.columns.length + 1} className="empty">This sheet is empty.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <footer>
          <span>{data.rows.length} row{data.rows.length !== 1 ? "s" : ""}</span>
          <span className="hint">View-only — editing requires sign-in</span>
        </footer>
      </div>
    </div>
  );
}
