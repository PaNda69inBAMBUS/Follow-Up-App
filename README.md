# Client Tracker (iPhone / web)

Web version of the Android Client Tracker app (`..\alex_app`), made to be added to the iPhone
home screen. All data stays on the phone (IndexedDB); nothing is sent to a server.

## Run
```powershell
npm install
npm run dev      # opens on http://localhost:5173 (also reachable from your phone on the same Wi-Fi)
npm test         # data layer tests
npm run build    # production files in dist/
```

## Code layout
```
src/data/
  types.ts        Data model — 1:1 copy of the Android Room entities
  db.ts           IndexedDB schema (Dexie)
  repository.ts   All data operations — mirrors Android's Repository.kt
  backup.ts       Backup import/export — SAME JSON format as the Android app
  dates.ts        'YYYY-MM-DD' date helpers
```

## Rules to keep
- **Backups must stay compatible with the Android app.** Only ever ADD fields to the backup format,
  never rename or remove them, and make the same change in `alex_app/.../data/Backup.kt`.
- **Database changes:** add a new `this.version(n)` block in `db.ts`; never edit an existing one,
  or data already on the phone can't be opened.

## Progress
1. ✅ Data layer + backup import/export (tested with an Android-format backup)
2. Clients, follow-ups, nutrition screens
3. Prospects + dashboard (Your Work, Appointments)
4. Settings, Romanian/English, dark mode, home-screen icon + offline (PWA)
