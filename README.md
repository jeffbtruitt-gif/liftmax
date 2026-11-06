# LiftMax

A mobile-first **reference board, not a log**: where you are right now on every exercise and variation. Single user, no history, no charts. Built from `BUILD_SPEC.md` and the approved mockups in `design/`.

## Run it

No build step — it's plain HTML, CSS and ES modules.

- **GitHub Pages:** Settings → Pages → Deploy from branch → `main` / root. The app lives at `https://<user>.github.io/liftmax/`.
- **Locally:** `python3 -m http.server` in this folder, then open http://localhost:8000. (ES modules don't load from `file://`.)

On a phone, use **Add to Home Screen** — it runs full-screen and works offline.

## Screens

| Screen | Route | What it does |
|---|---|---|
| Days | `#/` | 5 fixed program days with each day's Focus, plus shortcuts to Extras and Workouts |
| Day | `#/day/:id` | Focus card (all variations + main's focus-day plan); target button moves Focus |
| Exercise | `#/ex/:id` | Variations (weight, reps, focus-day plan, Set as main, rename/delete), add variation, general notes, Form & tips search |
| Extras | `#/extras` | Accessory exercises in groups — add, edit, move group, delete; add/rename/delete groups |
| Workouts | `#/workouts`, `#/workout/:id` | Saved go-to sessions (title + notes) with an editor |
| Settings | `#/settings` | Export/import a JSON backup, reset to the starter program, passcode status |

Edits autosave 500 ms after typing stops or when a field loses focus. The only Save button is in the Workouts editor.

## Code layout

```
index.html            app shell
css/styles.css        brand tokens and all styling
js/app.js             routing, screens, interactions
js/ui.js              icons, formatting, bottom-sheet dialogs, toast
js/store.js           the ONLY data-access module (getDays, updateVariation, …)
js/adapters/local.js  localStorage backend (default)
js/adapters/supabase.js  Supabase backend (same interface, off by default)
js/seed.js            fixed starter program and extras
js/config.js          backend choice, Supabase keys, passcode flag
supabase/schema.sql   tables for the Supabase backend
sw.js                 offline cache (network first)
design/               approved mockups (.dc.html)
```

## Switching to Supabase

`store.js` holds all the domain rules and talks to a tiny table adapter (`list / get / insert / update / remove / removeWhere / dump / restore`). Both adapters implement it, so no screen code changes.

1. Create a Supabase project and run `supabase/schema.sql` in the SQL editor.
2. Lock the tables down with Row Level Security before storing real data (for one user, enable RLS and add policies that allow only your authenticated user).
3. In `js/config.js` set `backend: 'supabase'` and fill in `supabase.url` and `supabase.anonKey`.
4. To carry data over: Settings → Export backup while on `local`, switch the backend, then Settings → Import backup.

The first load against an empty database seeds the starter program automatically.

## Passcode

`passcodeEnabled` in `js/config.js` turns on a passcode screen (unlocks for the browser session). It's a stub: the code ships to the browser, so it keeps out casual eyes, not attackers. Swap in Supabase Auth when moving to the cloud backend.
