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
src/i18n/         Texts (same keys as Android's strings.xml)
src/ui/           Shared components, formatting, router (#/client/3…), icons, photos
src/screens/      One file per screen (clients, client page, follow-ups, nutrition, program…)
public/fonts/     Plus Jakarta Sans (copied from the Android app)
```

## Rules to keep
- **Backups must stay compatible with the Android app.** Only ever ADD fields to the backup format,
  never rename or remove them, and make the same change in `alex_app/.../data/Backup.kt`.
- **Database changes:** add a new `this.version(n)` block in `db.ts`; never edit an existing one,
  or data already on the phone can't be opened.

## Progress
1. ✅ Data layer + backup import/export (tested with an Android-format backup)
2. ✅ Clients, follow-ups, nutrition screens, program checklist, photos (Home is a temporary backup page)
3. ✅ Prospects + dashboard (Your Work, Appointments, most active, attention lists); backup lives in Settings
4. Settings, Romanian/English, dark mode, home-screen icon + offline (PWA)
