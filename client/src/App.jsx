import React, { useEffect, useState, useRef, useCallback } from "react";
import Login from "./Login.jsx";
import Sheet from "./Sheet.jsx";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("bs_token") || "");
  const [email, setEmail] = useState(localStorage.getItem("bs_email") || "");
  const [sheets, setSheets] = useState([]);
  const [activeSheet, setActiveSheet] = useState(null);
  const [search, setSearch] = useState("");
  const notified = useRef(new Set());

  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const logout = () => {
    localStorage.removeItem("bs_token");
    localStorage.removeItem("bs_email");
    setToken(""); setEmail(""); setSheets([]); setActiveSheet(null);
  };

  const loadSheets = useCallback(async () => {
    const res = await fetch("/api/sheets", { headers: authHeaders });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();
    setSheets(data);
    setActiveSheet(prev => prev ?? (data[0] ? data[0].id : null));
  }, [token]);

  useEffect(() => { if (token) loadSheets(); }, [token]);

  useEffect(() => {
    if (token && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [token]);

  // Poll for due reminders/alarms across all sheets
  useEffect(() => {
    if (!token) return;
    const check = async () => {
      try {
        const sheetsRes = await fetch("/api/sheets", { headers: authHeaders });
        const sheetsData = await sheetsRes.json();
        for (const sheet of sheetsData) {
          const dataRes = await fetch(`/api/sheets/${sheet.id}/data`, { headers: authHeaders });
          const { columns, rows: rowsList } = await dataRes.json();
          const dateCols = columns.filter(c => /reminder|alarm/i.test(c.name));
          const now = Date.now();
          for (const row of rowsList) {
            for (const col of dateCols) {
              const val = row.cells[col.id];
              if (!val) continue;
              const t = new Date(val).getTime();
              const key = `${row.id}-${col.id}`;
              if (t <= now && t > now - 5 * 60 * 1000 && !notified.current.has(key)) {
                notified.current.add(key);
                const isAlarm = /alarm/i.test(col.name);
                const title = isAlarm ? `⏰ ${col.name} due` : `🔔 ${col.name} due`;
                const body = `${sheet.name} · row ${rowsList.indexOf(row) + 1}`;
                if ("Notification" in window && Notification.permission === "granted") {
                  new Notification(title, { body });
                }
              }
            }
          }
        }
      } catch (e) { /* ignore */ }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [token]);

  const onAuth = (tok, mail) => {
    localStorage.setItem("bs_token", tok);
    localStorage.setItem("bs_email", mail);
    setToken(tok);
    setEmail(mail);
  };

  const addSheet = async () => {
    const name = prompt("Sheet name:", `Sheet${sheets.length + 1}`);
    if (!name) return;
    const res = await fetch("/api/sheets", { method: "POST", headers: authHeaders, body: JSON.stringify({ name }) });
    const sheet = await res.json();
    setSheets(s => [...s, sheet]);
    setActiveSheet(sheet.id);
  };

  const renameSheet = async (sheet) => {
    const name = prompt("Rename sheet:", sheet.name);
    if (!name || name === sheet.name) return;
    await fetch(`/api/sheets/${sheet.id}`, { method: "PUT", headers: authHeaders, body: JSON.stringify({ name }) });
    setSheets(s => s.map(x => x.id === sheet.id ? { ...x, name } : x));
  };

  const deleteSheet = async (sheet) => {
    if (sheets.length <= 1) return alert("Cannot delete the only sheet.");
    if (!confirm(`Delete "${sheet.name}" and all its data?`)) return;
    const res = await fetch(`/api/sheets/${sheet.id}`, { method: "DELETE", headers: authHeaders });
    if (!res.ok) { const d = await res.json(); return alert(d.error); }
    const remaining = sheets.filter(s => s.id !== sheet.id);
    setSheets(remaining);
    if (activeSheet === sheet.id) setActiveSheet(remaining[0]?.id ?? null);
  };

  const shareSheet = async (sheet) => {
    if (sheet.share_token) {
      const url = `${window.location.origin}/share/${sheet.share_token}`;
      if (confirm(`Share link:\n${url}\n\nCopy to clipboard? (Cancel to revoke the link instead)`)) {
        navigator.clipboard?.writeText(url);
      } else if (confirm("Revoke this share link? Anyone with the old link will lose access.")) {
        await fetch(`/api/sheets/${sheet.id}/share`, { method: "DELETE", headers: authHeaders });
        setSheets(s => s.map(x => x.id === sheet.id ? { ...x, share_token: null } : x));
      }
      return;
    }
    const res = await fetch(`/api/sheets/${sheet.id}/share`, { method: "POST", headers: authHeaders });
    const data = await res.json();
    setSheets(s => s.map(x => x.id === sheet.id ? { ...x, share_token: data.share_token } : x));
    const url = `${window.location.origin}/share/${data.share_token}`;
    navigator.clipboard?.writeText(url);
    alert(`Read-only link created and copied:\n${url}`);
  };

  if (!token) return <Login onAuth={onAuth} />;

  const current = sheets.find(s => s.id === activeSheet);

  return (
    <div className="app">
      <header>
        <h1>📊 Base Serenia</h1>
        <input className="search" placeholder="Find in sheet..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="user-area">
          <span className="user-email">{email}</span>
          <button className="logout-btn" onClick={logout}>Log out</button>
        </div>
      </header>

      {current && (
        <div className="share-bar">
          <button onClick={() => shareSheet(current)}>
            {current.share_token ? "🔗 Manage share link" : "🔗 Get share link"}
          </button>
          {current.share_token && <span className="share-active">Public link active</span>}
        </div>
      )}

      {activeSheet && <Sheet token={token} sheetId={activeSheet} search={search} />}

      <div className="sheet-tabs">
        {sheets.map(s => (
          <div
            key={s.id}
            className={`tab ${s.id === activeSheet ? "active" : ""}`}
            onClick={() => setActiveSheet(s.id)}
            onDoubleClick={() => renameSheet(s)}
          >
            {s.name}
            <span className="tab-close" onClick={(e) => { e.stopPropagation(); deleteSheet(s); }}>×</span>
          </div>
        ))}
        <button className="add-tab" onClick={addSheet}>+</button>
      </div>
    </div>
  );
}
