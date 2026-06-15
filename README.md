# Base Serenia

A lightweight, fully customizable Excel-style data platform built with
React (Vite) + Node/Express + SQLite (better-sqlite3) + JWT auth.

## Features
- **Login / Register** — private accounts, JWT auth, bcrypt password hashing
- **Fully custom columns** — no fixed schema. Add, rename (✏️), or delete (×) any column.
  Default new sheet starts with Name, Company, Phone, Gmail, Notes, Reminder, Alarm, Tags —
  edit or remove any of these freely.
- **Add Row / Add Column** buttons, plus click any empty padding cell to add a row
- **Multiple sheets** — Excel-style tabs at the bottom; add, rename (double-click), delete
- **Inline cell editing** — click to select, Enter/F2/double-click to edit
- **Keyboard navigation** — Arrow keys or Ctrl+W/A/S/D to move between cells (W=up, A=left, S=down, D=right),
  Tab/Shift+Tab to move across, Enter to confirm and move down, Escape to cancel
- **Sort** — click a column name to sort ascending/descending
- **Search** — filter rows across all columns live
- **Public read-only share links** — generate a link per sheet; anyone with the link
  can view (not edit) the data at `/share/<token>`. Revoke anytime.
- **CSV export** — download any sheet as .csv (columns = your custom column names)
- **CSV import** — upload a .csv; matches existing columns by name (case-insensitive)
  and creates new columns automatically for unrecognized headers
- **Reminders & Alarms** — any column named "Reminder" or "Alarm" (or containing those
  words) gets datetime pickers and triggers browser notifications when due,
  plus red highlighting when overdue
- Phone-like columns get call (📞) and WhatsApp (💬) quick links
- Gmail/Email-like columns open Gmail compose directly to that address
- Grid displays a minimum of ~8 rows by default, even when empty, for a real-sheet feel

## Local development
```
cd server && npm install && npm start     # backend on :5000
cd client && npm install && npm run dev   # frontend on :5173
```

## Deploy on Render
1. Push this folder to a GitHub repo.
2. New Web Service on Render, connect the repo.
3. **Environment**: Node
4. **Build Command**: `npm run build`
5. **Start Command**: `npm start`
6. (Optional) Set env var `JWT_SECRET` to a random string for production.

Render installs client deps, builds the React app into `server/public`,
installs server deps, and starts Express which serves both the API and
the frontend (including `/share/<token>` public pages) on one port.

Note: SQLite (`server/serenia.db`) lives on the container's local disk.
On Render's free tier this resets on redeploys/restarts. For permanent
storage, use a paid plan with a persistent disk, or migrate to PostgreSQL.

## How columns work
Each sheet has its own set of columns (name + position), stored independently
of any fixed schema. Cell values are stored per row/column pair. Renaming a
column doesn't move data; deleting a column deletes only that column's data.

Columns whose name contains "phone", "gmail"/"email", "reminder", or "alarm"
get special rendering (call/WhatsApp links, Gmail compose links, datetime
pickers + notifications) — this matching is name-based, so you can rename
columns to opt in or out of these behaviors.
