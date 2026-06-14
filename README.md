# Base Serenia

A lightweight data-storing platform (Excel-like rows/columns) for contacts:
Name, Company, Phone, Gmail, Notes, Reminder, Alarm, Tags.

Stack: React (Vite) + Node/Express + SQLite (better-sqlite3).

## Features
- Add / edit / delete records in a spreadsheet-style table
- Search/filter across all fields instantly
- Click phone number to call (tel:) or open WhatsApp chat
- Click Gmail to open Gmail compose directly to that person
- Reminder & Alarm date-time fields per record
- Tags field for custom labels/categories
- Single SQLite file database (auto-created)

## Local development
```
cd client && npm install && npm run dev   # frontend on :5173
cd server && npm install && npm start     # backend on :5000
```

## Deploy on Render
1. Push this folder to a GitHub repo.
2. New Web Service on Render, connect the repo.
3. Build Command: `npm run build` (root)
4. Start Command: `npm start` (root)
5. Render will install client deps, build the React app into
   `server/public`, install server deps, and start Express which
   serves both API and frontend on one port.

No environment variables needed — SQLite file is created automatically
at `server/serenia.db`.
