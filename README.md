# Base Serenia

A lightweight, Excel-style data platform: spreadsheet UI for contacts with
Name, Company, Phone, Gmail, Notes, Reminder, Alarm, Tags.

Stack: React (Vite) + Node/Express + SQLite (better-sqlite3) + JWT auth.

## Features
- **Login / Register** — each user has their own private account (JWT auth, bcrypt-hashed passwords)
- **Multiple sheets** — Excel-style tabs at the bottom; add, rename (double-click), delete sheets
- Inline cell editing — click any cell to edit, like a real spreadsheet
- **Sort** — click a column header to sort ascending/descending
- **Search** — filter rows across all fields live
- **CSV export** — download any sheet as a .csv file
- **CSV bulk import** — upload a .csv to add many rows at once (matches headers: Name, Company, Phone, Gmail, Notes, Reminder, Alarm, Tags)
- **Reminders & Alarms** — datetime fields per row; browser notifications fire when due (checked every 30s while the tab is open)
- Click phone → call (tel:) or open WhatsApp
- Click Gmail → opens Gmail compose to that contact directly
- Overdue reminders/alarms highlighted in red

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
the frontend on one port.

Note: SQLite (`server/serenia.db`) lives on the container's local disk.
On Render's free tier this is reset on redeploys/restarts. For permanent
storage, use a paid plan with a persistent disk, or migrate to PostgreSQL.

## CSV format
Header row (case-insensitive): `Name,Company,Phone,Gmail,Notes,Reminder,Alarm,Tags`
Reminder/Alarm should be ISO datetime strings (e.g. `2026-06-20T09:00`).
