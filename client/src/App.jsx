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

  const loadSheets = useCallback(async () => {
    const res = await fetch("/api/sheets", { headers: authHeaders });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();
    setSheets(data);
    if (data.length && !activeSheet) setActiveSheet(data[0].id);
  }, [token]);

  useEffect(() => { if (token) loadSheets(); }, [token]);

  // Ask for notification permission once logged in
  useEffect(() => {
    if (token && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [token]);

  // Poll all sheets' records every 30s for due reminders/alarms
  useEffect(() => {
    if (!token) return;
    const check = async () => {
      try {
        const sheetsRes = await fetch("/api/sheets", { headers: authHeaders });
        const sheetsData = await sheetsRes.json();
        for (const sheet of sheetsData) {
          const recRes = await fetch(`/api/sheets/${sheet.id}/records`, { headers: authHeaders });
          const records = await recRes.json();
          const now = Date.now();
          for (const r of records) {
            for (const field of ["reminder", "alarm"]) {
              const val = r[field];
              if (!val) continue;
              const t = new Date(val).getTime();
              const key = `${r.id}-${field}`;
              if (t <= now && t > now - 5 * 60 * 1000 && !notified.current.has(key)) {
                notified.current.add(key);
                const title = field === "alarm" ? `⏰ Alarm: ${r.name}` : `🔔 Reminder: ${r.name}`;
                const body = `${sheet.name} · ${r.company || ""} ${r.notes ? "— " + r.notes : ""}`;
                if ("Notification" in window && Notification.permission === "granted") {
                  new Notification(title, { body });
                } else {
                  console.log(title, body);
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

  const logout = () => {
    localStorage.removeItem("bs_token");
    localStorage.removeItem("bs_email");
    setToken(""); setEmail(""); setSheets([]); setActiveSheet(null);
  };

  const addSheet = async () => {
    const name = prompt("Sheet name:", `Sheet${sheets.length + 1}`);
    if (!name) return;
    const res = await fetch("/api/sheets", { method: "POST", headers: authHeaders, body: JSON.stringify({ name }) });
    const sheet = await res.json();
    setSheets([...sheets, sheet]);
    setActiveSheet(sheet.id);
  };

  const renameSheet = async (sheet) => {
    const name = prompt("Rename sheet:", sheet.name);
    if (!name || name === sheet.name) return;
    await fetch(`/api/sheets/${sheet.id}`, { method: "PUT", headers: authHeaders, body: JSON.stringify({ name }) });
    setSheets(sheets.map(s => s.id === sheet.id ? { ...s, name } : s));
  };

  const deleteSheet = async (sheet) => {
    if (sheets.length <= 1) return alert("Cannot delete the only sheet.");
    if (!confirm(`Delete "${sheet.name}" and all its rows?`)) return;
    const res = await fetch(`/api/sheets/${sheet.id}`, { method: "DELETE", headers: authHeaders });
    if (!res.ok) { const d = await res.json(); return alert(d.error); }
    const remaining = sheets.filter(s => s.id !== sheet.id);
    setSheets(remaining);
    if (activeSheet === sheet.id) setActiveSheet(remaining[0]?.id);
  };

  if (!token) return <Login onAuth={onAuth} />;

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
