# Client Tracker (iPhone / web)

Web version of the Android Client Tracker app (`..\alex_app`), made to be added to the iPhone
home screen. All data stays on the phone (IndexedDB); nothing is sent to a server. After the first
visit the app works fully offline.

## Run
```powershell
npm install
npm run dev      # http://localhost:5173 (also reachable from a phone on the same Wi-Fi)
npm test         # tests
npm run build    # production files in dist/ (incl. sw.js for offline use)
npm run preview  # serve dist/ on http://localhost:4173 to try the production build
```

## Put it on the iPhone
The app is published at **https://panda69inbambus.github.io/Follow-Up-App/** (GitHub Pages).
Only app code is online — client data never leaves the phone.
1. On the iPhone open the address in **Safari** → Share → **Add to Home Screen**.
2. Open it from the home screen icon (not from Safari), then Settings → Restore from backup if needed.

## New versions
1. Increase `version` in `package.json` and commit.
2. Push to `main`: GitHub Actions (`.github/workflows/deploy.yml`) tests, builds and publishes it.
3. The phone downloads the new version in the background the next time the app is opened with
   internet, and uses it from the start after that. Data is kept.

## Code layout
```
src/data/
  types.ts        Data model — 1:1 copy of the Android Room entities
  db.ts           IndexedDB schema (Dexie)
  repository.ts   All data operations — mirrors Android's Repository.kt
  backup.ts       Backup import/export — SAME JSON format as the Android app
  dates.ts        'YYYY-MM-DD' date helpers
src/i18n/         Texts: en.ts + ro.ts (same keys as Android's strings.xml)
src/ui/           Shared components, formatting, router (#/client/3…), icons, photos,
                  settings (theme/style/language), dashboard maths, pwa.ts
src/screens/      One file per screen
src/sw-template.js  Offline service worker; the build fills in the file list (vite.config.ts)
public/           Fonts (from the Android app), icons, manifest
```

## Rules to keep
- **Backups must stay compatible with the Android app.** Only ever ADD fields to the backup format,
  never rename or remove them, and make the same change in `alex_app/.../data/Backup.kt`.
- **Database changes:** add a new `this.version(n)` block in `db.ts`; never edit an existing one,
  or data already on the phone can't be opened.
- **New texts** go in both `en.ts` and `ro.ts` (the build fails if Romanian is missing one).

## Progress
1. ✅ Data layer + backup import/export (tested with an Android-format backup)
2. ✅ Clients, follow-ups, nutrition screens, program checklist, photos
3. ✅ Prospects + dashboard (Your Work, Appointments, most active, attention lists)
4. ✅ Settings (theme, Glass/Solid, transparency, language, backup), Romanian, home-screen icon, offline
