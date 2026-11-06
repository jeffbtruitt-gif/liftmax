# LiftMax

A mobile-first **reference board, not a log**: where you are right now on every exercise and variation. Single user, no history, no charts. Built from `BUILD_SPEC.md` and the approved mockups in `design/`.

## Run it

No build step — it's plain HTML, CSS and ES modules.

- **GitHub Pages:** Settings → Pages → Deploy from branch → `main` / root. The app lives at `https://<user>.github.io/liftmax/`.
- **Locally:** `python3 -m http.server` in this folder, then open http://localhost:8000. (ES modules don't load from `file://`.)

On a phone, use **Add to Home Screen** — it runs full-screen. Sign in once on each device.

## Screens

| Screen | Route | What it does |
|---|---|---|
| Days | `#/` | 5 fixed program days with each day's Focus, plus shortcuts to Extras and Workouts |
| Day | `#/day/:id` | Focus card (all variations + main's focus-day plan); target button moves Focus |
| Exercise | `#/ex/:id` | Variations (weight, reps, focus-day plan, Set as main, rename/delete), add variation, general notes, Form & tips search |
| Extras | `#/extras` | Accessory exercises in groups — add, edit, move group, delete; add/rename/delete groups |
| Workouts | `#/workouts`, `#/workout/:id` | Saved go-to sessions (title + notes) with an editor |
| Settings | `#/settings` | Account and sign out, export/import a JSON backup, reset to the starter program |

Edits autosave 500 ms after typing stops or when a field loses focus. The only Save button is in the Workouts editor.

## Code layout

```
index.html            app shell
css/styles.css        brand tokens and all styling
js/app.js             routing, screens, interactions
js/ui.js              icons, formatting, bottom-sheet dialogs, toast
js/store.js           the ONLY data-access module (getDays, updateVariation, …)
js/adapters/local.js  localStorage backend (device-only mode)
js/adapters/supabase.js  Supabase backend + sign-in (active)
js/seed.js            fixed starter program and extras
js/config.js          backend choice, Supabase keys, passcode flag
supabase/schema.sql   lm_* tables and RLS policies, as applied
sw.js                 offline cache (network first)
design/               approved mockups (.dc.html)
```

## Cloud sync (Supabase)

LiftMax saves to Supabase so the same data shows up on every device you sign in on.

- **Project:** the shared `kdelwwnpuuvgnamumhec` project, in tables prefixed `lm_` (schema in `supabase/schema.sql`).
- **Sign-in:** email + password, using the same Supabase account as your other apps. The session is remembered per device.
- **Privacy:** every row carries the owner's `user_id`; Row Level Security limits each signed-in user to their own rows, and signed-out requests get nothing. The publishable key in `js/config.js` is safe to ship for that reason.
- **First sign-in** on an empty account seeds the starter program.
- **Speed:** after sign-in the whole dataset (a few dozen rows) loads into memory, so screens are instant. Writes go to the server first; the screen only changes once the save is accepted.
- **Switching devices:** when the app comes back to the foreground it re-reads from the server, so a change made on your phone appears on your laptop.
- **Offline:** the app opens with the last synced copy, read-only. Edits show a "you're offline" message instead of silently failing.

`store.js` holds all the domain rules and talks to a tiny table adapter (`list / get / insert / update / remove / removeWhere / dump / restore`). To go back to device-only storage, set `backend: 'local'` in `js/config.js` — no screen code changes. Settings → Export/Import backup moves data between the two.

## Passcode

Only applies in device-only mode (`backend: 'local'`): `passcodeEnabled` in `js/config.js` turns on a passcode screen. It's a convenience lock, not real security. Cloud mode uses the real Supabase sign-in instead.
