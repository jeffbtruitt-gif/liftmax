// LiftMax — screens, routing and interactions. All data goes through store.js.
import * as S from './store.js';
import { CONFIG } from './config.js';
import { esc, icon, formatLoad, formatDate, toast, sheet, confirmSheet, promptSheet } from './ui.js';

const app = document.getElementById('app');

// Per-screen UI state (which inline ⋯ menu is open). Reset when the route changes.
let ui = { varMenu: null, extraMenu: null };
let lastRouteKey = '';

// ---------------------------------------------------------------- autosave
// Edits save 500ms after typing stops, or immediately when the field loses focus.
const pending = new Map(); // key -> { timer, run }

function scheduleSave(key, run) {
  const prev = pending.get(key);
  if (prev) clearTimeout(prev.timer);
  const entry = { run };
  entry.timer = setTimeout(() => flushSave(key), 500);
  pending.set(key, entry);
}

async function flushSave(key) {
  const entry = pending.get(key);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(key);
  try {
    await entry.run();
  } catch (err) {
    console.error(err);
    toast("Couldn't save — " + err.message);
  }
}

async function flushAll() {
  await Promise.all([...pending.keys()].map(flushSave));
}

function saveFromField(el) {
  const { save, id, field } = el.dataset;
  const key = `${save}:${id}:${field}`;
  const value = el.value;
  if (save === 'var') {
    return [key, async () => {
      const updated = await S.updateVariation(id, { [field]: value });
      const label = document.getElementById('upd-' + id);
      if (label && updated?.updatedAt) label.textContent = 'Updated ' + formatDate(updated.updatedAt);
    }];
  }
  if (save === 'ex') return [key, () => S.updateExercise(id, { [field]: value })];
  return [null, null];
}

app.addEventListener('input', (e) => {
  const el = e.target.closest('[data-save]');
  if (!el) return;
  const [key, run] = saveFromField(el);
  if (key) scheduleSave(key, run);
});

app.addEventListener('focusout', (e) => {
  const el = e.target.closest('[data-save]');
  if (!el) return;
  const { save, id, field } = el.dataset;
  flushSave(`${save}:${id}:${field}`);
});

window.addEventListener('pagehide', () => { flushAll(); });

// Cloud sync: when the app comes back to the foreground, pull changes made on other devices.
let signedIn = false;
let lastRefresh = Date.now();
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'hidden') return flushAll();
  if (!signedIn || !S.requiresAuth() || Date.now() - lastRefresh < 5000) return;
  lastRefresh = Date.now();
  const wasOffline = S.isOffline();
  await flushAll();
  try {
    await S.refresh();
  } catch {
    return;
  }
  if (wasOffline && !S.isOffline()) toast('Back online');
  // Don't yank the screen out from under someone mid-edit.
  const active = document.activeElement;
  const editing = active && app.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
  if (!editing && !document.querySelector('dialog[open]')) render();
});

// ---------------------------------------------------------------- routing

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [name = 'home', id] = parts;
  return { name, id };
}

async function render() {
  await flushAll();
  if (!signedIn) return renderSignIn();
  if (isLocked()) return renderLock();

  const route = parseRoute();
  // Remember whether an exercise was opened from the Exercises tab, so Back returns there.
  if (route.name === 'exercises') cameFromExercises = true;
  else if (route.name !== 'ex') cameFromExercises = false;
  const routeKey = `${route.name}/${route.id || ''}`;
  const sameRoute = routeKey === lastRouteKey;
  if (!sameRoute) ui = { varMenu: null, extraMenu: null };
  const scroller = app.querySelector('.scroll');
  if (lastRouteKey === 'exercises/' && scroller) exercisesScroll = scroller.scrollTop;
  const scrollTop = sameRoute && scroller
    ? scroller.scrollTop
    : routeKey === 'exercises/' ? exercisesScroll : 0;

  let view;
  try {
    view = await (VIEWS[route.name] || viewNotFound)(route.id);
  } catch (err) {
    console.error(err);
    view = { title: 'Error', tab: null, html: errorHTML(err) };
  }
  document.title = view.title ? `${view.title} · LiftMax` : 'LiftMax';
  app.innerHTML = view.html + (view.tab === false ? '' : tabBar(view.tab));
  lastRouteKey = routeKey;

  if (route.name === 'exercises') applyExerciseFilter();
  const newScroller = app.querySelector('.scroll');
  if (newScroller) newScroller.scrollTop = scrollTop;
  if (!sameRoute) app.querySelector('h1')?.focus?.({ preventScroll: true });
}

const rerender = () => render();
let cameFromExercises = false;
let exercisesScroll = 0;

window.addEventListener('hashchange', render);

function tabBar(active) {
  const tab = (key, href, label, ic) =>
    `<a class="tab" href="${href}"${active === key ? ' aria-current="page"' : ''}>${ic()}${label}</a>`;
  return `<nav class="tabbar" aria-label="Main">
    ${tab('days', '#/', 'Days', icon.days)}
    ${tab('exercises', '#/exercises', 'Exercises', icon.list)}
    ${tab('extras', '#/extras', 'Extras', icon.extras)}
    ${tab('workouts', '#/workouts', 'Workouts', icon.workouts)}
  </nav>`;
}

const backButton = (href, label) =>
  `<a class="icon-btn" href="${href}" aria-label="${esc(label)}">${icon.back()}</a>`;

function errorHTML(err) {
  return `<header class="hdr-bar left">${backButton('#/', 'Back to days')}</header>
    <div class="scroll pad"><div class="empty-state">Something went wrong.<br>${esc(err.message)}</div></div>`;
}

async function viewNotFound() {
  return {
    title: 'Not found', tab: null,
    html: `<header class="hdr-bar left">${backButton('#/', 'Back to days')}</header>
      <div class="scroll pad"><div class="empty-state">That page doesn't exist anymore.<a class="btn primary" href="#/" style="display:inline-flex;align-items:center">Go to Days</a></div></div>`,
  };
}

// ---------------------------------------------------------------- Home / Days

async function viewHome() {
  const [days, extras] = await Promise.all([S.getDays(), S.getExtrasExercises()]);
  const focus = await Promise.all(days.map((d) => (d.focusExerciseId ? S.getExercise(d.focusExerciseId) : null)));
  const n = extras.length;

  const cards = days.map((d, i) => `
    <a class="day-card" href="#/day/${d.id}">
      <div class="day-num" aria-hidden="true">${d.number}</div>
      <div class="day-body">
        <div class="day-name"><span class="sr-only">Day ${d.number}: </span>${esc(d.name)}</div>
        <div class="day-focus">
          ${icon.target({ size: 14, stroke: '#FF6A00', width: 2.4 })}
          <span class="ellipsis">Focus: ${esc(focus[i]?.name || 'None')}</span>
        </div>
      </div>
      ${icon.chevron()}
    </a>`).join('');

  return {
    title: '', tab: 'days',
    html: `
    <header class="hdr-home">
      <div class="wordmark" role="img" aria-label="LiftMax"><span>LIFT</span><span class="max">MAX</span></div>
      <a class="icon-btn boxed" href="#/settings" aria-label="Settings">${icon.gear()}</a>
    </header>
    <main class="scroll" style="padding:8px 20px 20px">
      <h1 class="sr-only" tabindex="-1">Days</h1>
      <div class="stack">
        <p class="eyebrow" style="padding:4px 2px">Program · ${days.length} days</p>
        ${cards}
        <p class="eyebrow" style="padding:14px 2px 4px">More</p>
        <div class="shortcuts">
          <a class="shortcut" href="#/extras">
            ${icon.extras({ size: 24, stroke: '#FF6A00' })}
            <div style="display:flex;flex-direction:column;gap:2px"><b>Extras</b><span>${n} accessor${n === 1 ? 'y' : 'ies'}</span></div>
          </a>
          <a class="shortcut" href="#/workouts">
            ${icon.workouts({ size: 24, stroke: '#FF6A00' })}
            <div style="display:flex;flex-direction:column;gap:2px"><b>Workouts</b><span>Saved go-to sessions</span></div>
          </a>
        </div>
      </div>
    </main>`,
  };
}

// ---------------------------------------------------------------- Day

const mainOf = (ex, vars = []) => vars.find((v) => v.id === ex.mainVariationId) || vars[0] || null;
const mainFirst = (ex, vars = []) => {
  const m = mainOf(ex, vars);
  return m ? [m, ...vars.filter((v) => v.id !== m.id)] : vars;
};
const loadHTML = (v, cls = 'load') => {
  const text = formatLoad(v);
  return text ? `<span class="${cls}">${esc(text)}</span>` : `<span class="${cls} empty">—</span>`;
};

async function viewDay(id) {
  const day = await S.getDay(id);
  if (!day) return viewNotFound();
  const [exercises, varsBy] = await Promise.all([S.getExercisesForDay(id), S.getVariationsByExercise()]);

  const cards = exercises.map((ex) => {
    const vars = mainFirst(ex, varsBy[ex.id]);
    const main = mainOf(ex, vars);
    if (ex.id === day.focusExerciseId) {
      const plan = (main?.focusPlan || '').trim();
      return `
      <section class="focus-card" aria-label="Focus: ${esc(ex.name)}">
        <div class="focus-head">
          <span class="chip-focus">${icon.target({ size: 12, width: 3 })}Focus</span>
          <span class="hint">Heavier load today</span>
        </div>
        <a class="focus-link" href="#/ex/${ex.id}">
          <span class="name">${esc(ex.name)}</span>${icon.chevron()}
        </a>
        <div class="stack" style="gap:6px">
          ${vars.length ? vars.map((v) => `
            <div class="var-line">
              <span class="vname"><span class="ellipsis">${esc(v.name)}</span>${v.id === main?.id ? '<span class="tag-main">Main</span>' : ''}</span>
              ${loadHTML(v)}
            </div>`).join('') : '<div class="var-line"><span class="vname">No variations yet</span></div>'}
        </div>
        <div class="focus-note${plan ? '' : ' empty'}">
          ${icon.pencil()}
          <span>${plan ? esc(plan) : 'No focus-day plan yet. Add one on the exercise.'}</span>
        </div>
      </section>`;
    }
    return `
    <div class="ex-card">
      <a class="ex-link" href="#/ex/${ex.id}">
        <span class="name">${esc(ex.name)}</span>
        <span class="main">${loadHTML(main)}<span class="vn">${esc(main?.name || '')}</span></span>
      </a>
      <button type="button" class="icon-btn target" data-action="focus" data-day="${day.id}" data-ex="${ex.id}" aria-label="Make ${esc(ex.name)} the focus">${icon.target()}</button>
    </div>`;
  }).join('');

  return {
    title: day.name, tab: 'days',
    html: `
    <header class="hdr-bar left">${backButton('#/', 'Back to days')}<p class="eyebrow">Day ${day.number}</p></header>
    <div class="title-block">
      <h1 class="h1" tabindex="-1">${esc(day.name)}</h1>
      ${day.subtitle ? `<div class="sub">${esc(day.subtitle)}</div>` : ''}
    </div>
    <main class="scroll pad"><div class="stack">
      ${cards}
      <p class="foot-hint">Tap the target on any exercise to move Focus</p>
    </div></main>`,
  };
}

// ---------------------------------------------------------------- Exercise

async function viewExercise(id) {
  const ex = await S.getExercise(id);
  if (!ex) return viewNotFound();
  const vars = mainFirst(ex, await S.getVariations(id));
  const main = mainOf(ex, vars);
  const isProgram = !!ex.dayId;

  let crumb, backHref, backLabel, isFocus = false;
  if (isProgram) {
    const day = await S.getDay(ex.dayId);
    crumb = `Day ${day.number} · ${day.name}`;
    backHref = `#/day/${day.id}`;
    backLabel = `Back to ${day.name}`;
    isFocus = day.focusExerciseId === ex.id;
  } else {
    const group = (await S.getExtrasGroups()).find((g) => g.id === ex.extrasGroupId);
    crumb = group ? `Extras · ${group.name}` : 'Extras';
    backHref = '#/extras';
    backLabel = 'Back to extras';
  }
  if (cameFromExercises) {
    backHref = '#/exercises';
    backLabel = 'Back to exercises';
  }

  const tipsUrl = 'https://www.google.com/search?q=' + encodeURIComponent(`${ex.name} form tips`);

  const varCards = vars.map((v) => {
    const isMain = v.id === main?.id;
    const menuOpen = ui.varMenu === v.id;
    return `
    <div class="var-card">
      <div class="var-top">
        <div class="var-title">
          <span class="row"><span class="vname">${esc(v.name)}</span>${isMain ? '<span class="tag-main lg">Main</span>' : ''}</span>
          <span class="updated" id="upd-${v.id}">${v.updatedAt ? 'Updated ' + formatDate(v.updatedAt) : 'Not set yet'}</span>
        </div>
        <div class="var-actions">
          ${isMain ? '' : `<button type="button" class="btn link" data-action="var-main" data-id="${v.id}">Set as main</button>`}
          <button type="button" class="icon-btn muted" data-action="var-menu" data-id="${v.id}" aria-expanded="${menuOpen}" aria-label="Edit or delete ${esc(v.name)}">${icon.more()}</button>
        </div>
      </div>
      ${menuOpen ? `
      <div class="menu-row">
        <button type="button" class="btn" data-action="var-rename" data-id="${v.id}">Rename</button>
        <button type="button" class="btn danger" data-action="var-delete" data-id="${v.id}">Delete variation</button>
      </div>` : ''}
      <div class="fields">
        <label class="field">Weight
          <input class="input" type="text" data-save="var" data-id="${v.id}" data-field="weight" value="${esc(v.weight)}" placeholder="e.g. 35 lbs" autocomplete="off" enterkeyhint="next">
        </label>
        <label class="field">Reps
          <input class="input" type="text" data-save="var" data-id="${v.id}" data-field="reps" value="${esc(v.reps)}" placeholder="e.g. 8" autocomplete="off" inputmode="text" enterkeyhint="done">
        </label>
      </div>
      ${isProgram ? `
      <label class="field focus">Focus-day plan
        <textarea class="textarea focus" rows="3" data-save="var" data-id="${v.id}" data-field="focusPlan" placeholder="What to do when this is the Focus">${esc(v.focusPlan)}</textarea>
      </label>` : ''}
    </div>`;
  }).join('');

  return {
    title: ex.name, tab: cameFromExercises ? 'exercises' : isProgram ? 'days' : 'extras',
    html: `
    <header class="hdr-bar">
      ${backButton(backHref, backLabel)}
      <p class="eyebrow ellipsis" style="text-align:center;min-width:0">${esc(crumb)}</p>
      ${isProgram ? '<span class="spacer44"></span>' : `<button type="button" class="icon-btn" data-action="extra-options" data-id="${ex.id}" aria-label="Exercise options">${icon.more({ size: 22 })}</button>`}
    </header>
    <main class="scroll">
      <section class="ex-hero">
        ${isFocus ? `<span class="chip-focus">${icon.target({ size: 12, width: 3 })}Focus today</span>` : ''}
        <h1 class="h1 sm" tabindex="-1">${esc(ex.name)}</h1>
        <a class="tips-btn" href="${tipsUrl}" target="_blank" rel="noopener noreferrer">
          ${icon.search()} Form &amp; tips ${icon.external()}<span class="sr-only">(opens in a new tab)</span>
        </a>
      </section>
      <section class="section" aria-labelledby="vars-h">
        <div class="section-head">
          <h2 class="eyebrow" id="vars-h">Variations</h2>
          <span class="note">Main shows on the ${isProgram ? 'Day screen' : 'Extras list'}</span>
        </div>
        ${varCards || '<div class="empty-state">No variations yet. Add one to track its weight and reps.</div>'}
        <button type="button" class="btn-dashed" data-action="var-add" data-id="${ex.id}">
          ${icon.plus({ size: 18, stroke: '#FF6A00', width: 2.4 })} Add variation
        </button>
      </section>
      <section class="notes-section">
        <label>
          <span class="eyebrow">General notes</span>
          <textarea class="textarea notes" rows="4" data-save="ex" data-id="${ex.id}" data-field="generalNotes" placeholder="Setup, cues, machine settings…">${esc(ex.generalNotes)}</textarea>
        </label>
      </section>
    </main>`,
  };
}

// ---------------------------------------------------------------- Exercises (all, A–Z)

let exercisesQuery = '';

async function viewAllExercises() {
  const days = await S.getDays();
  const [groups, dayExercises, extras, varsBy] = await Promise.all([
    S.getExtrasGroups(),
    Promise.all(days.map((d) => S.getExercisesForDay(d.id))),
    S.getExtrasExercises(), S.getVariationsByExercise(),
  ]);
  const dayById = Object.fromEntries(days.map((d) => [d.id, d]));
  const groupById = Object.fromEntries(groups.map((g) => [g.id, g]));
  const all = [...dayExercises.flat(), ...extras].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const where = (ex) => {
    if (ex.dayId) {
      const d = dayById[ex.dayId];
      return d ? `Day ${d.number} · ${d.name}` : 'Program';
    }
    const g = groupById[ex.extrasGroupId];
    return g ? `Extras · ${g.name}` : 'Extras';
  };

  const cards = all.map((ex) => {
    const vars = mainFirst(ex, varsBy[ex.id]);
    const main = mainOf(ex, vars);
    const search = [ex.name, where(ex), ...vars.map((v) => v.name)].join(' ').toLowerCase();
    const rows = vars.map((v) => `
      <div class="all-row">
        <span class="all-vname">
          <span class="ellipsis">${esc(v.name)}</span>${v.id === main?.id ? '<span class="tag-main">Main</span>' : ''}
        </span>
        <label class="all-field"><span class="sr-only">${esc(ex.name)}, ${esc(v.name)} weight</span>
          <input class="input sm" type="text" data-save="var" data-id="${v.id}" data-field="weight" value="${esc(v.weight)}" placeholder="Weight" autocomplete="off" enterkeyhint="done">
        </label>
        <label class="all-field reps"><span class="sr-only">${esc(ex.name)}, ${esc(v.name)} reps</span>
          <input class="input sm" type="text" data-save="var" data-id="${v.id}" data-field="reps" value="${esc(v.reps)}" placeholder="Reps" autocomplete="off" enterkeyhint="done">
        </label>
      </div>`).join('');
    return `
    <section class="all-card" data-search="${esc(search)}" aria-label="${esc(ex.name)}">
      <a class="all-head" href="#/ex/${ex.id}">
        <span class="all-title">
          <span class="name">${esc(ex.name)}</span>
          <span class="where">${esc(where(ex))}</span>
        </span>
        ${icon.chevron()}
      </a>
      ${rows || '<div class="all-row"><span class="all-vname" style="color:var(--muted)">No variations yet</span></div>'}
    </section>`;
  }).join('');

  const n = all.length;
  return {
    title: 'Exercises', tab: 'exercises',
    html: `
    <header class="hdr-title">
      <div style="display:flex;flex-direction:column;gap:4px">
        <h1 class="h1" tabindex="-1">Exercises</h1>
        <div class="sub">${n} exercises, A–Z · edit weights here</div>
      </div>
    </header>
    <div class="search-wrap">
      <label class="search">
        ${icon.search({ stroke: '#9AA3AE' })}
        <span class="sr-only">Search exercises</span>
        <input type="search" id="ex-search" value="${esc(exercisesQuery)}" placeholder="Search exercises or variations" autocomplete="off" enterkeyhint="search">
      </label>
    </div>
    <main class="scroll pad"><div class="stack" id="all-list">
      ${cards}
      <div class="empty-state hidden" id="all-empty">No exercises match that search.</div>
    </div></main>`,
  };
}

function applyExerciseFilter() {
  const q = exercisesQuery.trim().toLowerCase();
  let shown = 0;
  app.querySelectorAll('.all-card').forEach((card) => {
    const match = !q || card.dataset.search.includes(q.replace(/\s+/g, ' '));
    card.classList.toggle('hidden', !match);
    if (match) shown++;
  });
  document.getElementById('all-empty')?.classList.toggle('hidden', shown > 0);
}

app.addEventListener('input', (e) => {
  if (e.target.id !== 'ex-search') return;
  exercisesQuery = e.target.value;
  applyExerciseFilter();
});

// ---------------------------------------------------------------- Extras

async function viewExtras() {
  const [groups, exercises, varsBy] = await Promise.all([
    S.getExtrasGroups(), S.getExtrasExercises(), S.getVariationsByExercise(),
  ]);

  const groupHTML = groups.map((g) => {
    const items = exercises.filter((e) => e.extrasGroupId === g.id);
    const rows = items.map((it) => {
      const main = mainOf(it, varsBy[it.id]);
      const open = ui.extraMenu === it.id;
      return `
      <div class="list-item">
        <div class="list-row">
          <a class="list-link" href="#/ex/${it.id}">
            <span class="name">${esc(it.name)}</span>
            ${loadHTML(main)}
          </a>
          <button type="button" class="icon-btn muted" style="margin-right:4px" data-action="extra-menu" data-id="${it.id}" aria-expanded="${open}" aria-label="Edit or delete ${esc(it.name)}">${icon.more()}</button>
        </div>
        ${open ? `
        <div class="menu-row three">
          <button type="button" class="btn" data-action="extra-edit" data-id="${it.id}">Edit</button>
          <button type="button" class="btn" data-action="extra-move" data-id="${it.id}">Move group</button>
          <button type="button" class="btn danger" data-action="extra-delete" data-id="${it.id}">Delete</button>
        </div>` : ''}
      </div>`;
    }).join('');
    return `
    <section class="group" aria-label="${esc(g.name)}">
      <div class="group-head">
        <h2 class="eyebrow">${esc(g.name)}</h2>
        <button type="button" class="icon-btn muted" data-action="group-menu" data-id="${g.id}" aria-label="Rename or delete group ${esc(g.name)}">${icon.more({ size: 18 })}</button>
      </div>
      <div class="list">${rows || '<div class="list-empty">No exercises in this group yet.</div>'}</div>
    </section>`;
  }).join('');

  return {
    title: 'Extras', tab: 'extras',
    html: `
    <header class="hdr-title">
      <div style="display:flex;flex-direction:column;gap:4px">
        <h1 class="h1" tabindex="-1">Extras</h1>
        <div class="sub">Swap-ins and accessories</div>
      </div>
      <button type="button" class="icon-btn primary" data-action="extra-add" aria-label="Add extra exercise">${icon.plus()}</button>
    </header>
    <main class="scroll pad"><div class="stack" style="gap:18px">
      ${groupHTML || '<div class="empty-state">No groups yet. Add a group, then add exercises to it.</div>'}
      <button type="button" class="btn-dashed" data-action="group-add">${icon.plus({ size: 18, stroke: '#FF6A00', width: 2.4 })} Add group</button>
    </div></main>`,
  };
}

// ---------------------------------------------------------------- Workouts

async function viewWorkouts() {
  const list = await S.getWorkouts();
  const cards = list.map((w) => `
    <button type="button" class="workout-card" data-action="workout-open" data-id="${w.id}">
      <span class="body">
        <span class="title">${esc(w.title || 'Untitled workout')}</span>
        ${w.notes ? `<span class="preview">${esc(w.notes)}</span>` : ''}
      </span>
      ${icon.chevron()}
    </button>`).join('');

  return {
    title: 'Workouts', tab: 'workouts',
    html: `
    <header class="hdr-title">
      <div style="display:flex;flex-direction:column;gap:4px">
        <h1 class="h1" tabindex="-1">Workouts</h1>
        <div class="sub">Go-to sessions outside the 5 days</div>
      </div>
      <button type="button" class="icon-btn primary" data-action="workout-new" aria-label="New workout">${icon.plus()}</button>
    </header>
    <main class="scroll pad"><div class="stack">
      ${cards || `<div class="empty-state">Save the sessions you repeat — a hotel gym routine, a quick core finisher — and pull them up any time.
        <button type="button" class="btn primary" data-action="workout-new">New workout</button></div>`}
    </div></main>`,
  };
}

async function viewWorkout(id) {
  const isNew = id === 'new';
  const w = isNew ? { title: '', notes: '' } : await S.getWorkout(id);
  if (!w) return viewNotFound();
  return {
    title: w.title || 'New workout', tab: 'workouts',
    html: `
    <header class="hdr-bar">
      <button type="button" class="icon-btn" data-action="workout-back" aria-label="Back to workouts">${icon.back()}</button>
      <p class="eyebrow">${isNew ? 'New workout' : 'Workout'}</p>
      ${isNew ? '<span class="spacer44"></span>' : `<button type="button" class="icon-btn muted" data-action="workout-delete" data-id="${id}" aria-label="Delete workout">${icon.trash()}</button>`}
    </header>
    <h1 class="sr-only" tabindex="-1">${isNew ? 'New workout' : esc(w.title)}</h1>
    <form class="editor scroll" id="workout-form" data-id="${esc(id)}" data-title="${esc(w.title)}" data-notes="${esc(w.notes)}">
      <label class="field">Title
        <input class="input" type="text" name="title" value="${esc(w.title)}" placeholder="e.g. Hotel gym, full body" autocomplete="off">
      </label>
      <label class="field grow" style="display:flex">Notes
        <textarea class="textarea" name="notes" placeholder="Write it out: exercises, weights, sets, reps…">${esc(w.notes)}</textarea>
      </label>
      <button type="submit" class="btn primary big">Save</button>
    </form>`,
  };
}

function workoutForm() {
  const form = document.getElementById('workout-form');
  if (!form) return null;
  return {
    form,
    id: form.dataset.id,
    title: form.elements.title.value.trim(),
    notes: form.elements.notes.value.replace(/\s+$/, ''),
    dirty: form.elements.title.value.trim() !== form.dataset.title || form.elements.notes.value.replace(/\s+$/, '') !== form.dataset.notes,
  };
}

async function saveWorkout() {
  const f = workoutForm();
  if (!f) return;
  const title = f.title || 'Untitled workout';
  if (f.id === 'new') {
    if (!f.title && !f.notes) return goto('#/workouts');
    await S.addWorkout({ title, notes: f.notes });
  } else {
    await S.updateWorkout(f.id, { title, notes: f.notes });
  }
  toast('Workout saved');
  goto('#/workouts');
}

app.addEventListener('submit', (e) => {
  if (e.target.id === 'workout-form') {
    e.preventDefault();
    run(saveWorkout);
  }
});

// ---------------------------------------------------------------- Settings

async function viewSettings() {
  const [days, extras, workouts] = await Promise.all([S.getDays(), S.getExtrasExercises(), S.getWorkouts()]);
  const cloud = S.requiresAuth();
  const user = cloud ? await S.currentUser() : null;
  return {
    title: 'Settings', tab: 'days',
    html: `
    <header class="hdr-bar left">${backButton('#/', 'Back to days')}<p class="eyebrow">Settings</p></header>
    <div class="title-block"><h1 class="h1" tabindex="-1">Settings</h1></div>
    <main class="scroll pad"><div class="stack" style="gap:14px">
      ${cloud ? `
      <section class="card">
        <h2>Account</h2>
        <div class="kv"><span>Signed in as</span><span class="ellipsis" style="min-width:0">${esc(user?.email || '')}</span></div>
        <div class="kv"><span>Sync</span><span>${S.isOffline() ? 'Offline — read only' : 'On, all devices'}</span></div>
        <p>Your data saves to the cloud and shows up on any device where you sign in with this account.</p>
        <div class="btns"><button type="button" class="btn" data-action="sign-out">Sign out</button></div>
      </section>` : ''}
      <section class="card">
        <h2>Your data</h2>
        <div class="kv"><span>Stored</span><span>${cloud ? 'Supabase (cloud)' : 'On this device'}</span></div>
        <div class="kv"><span>Program days</span><span>${days.length}</span></div>
        <div class="kv"><span>Extras</span><span>${extras.length}</span></div>
        <div class="kv"><span>Saved workouts</span><span>${workouts.length}</span></div>
        <p>${cloud
          ? 'A backup is a JSON file of everything here — handy before a reset, or to move data between accounts.'
          : 'Data saved on this device stays in this browser. Export a backup before clearing browser data or switching phones.'}</p>
        <div class="btns">
          <button type="button" class="btn" data-action="export">Export backup</button>
          <button type="button" class="btn" data-action="import">Import backup</button>
          <input type="file" id="import-file" accept="application/json,.json" class="hidden" aria-label="Backup file">
        </div>
      </section>
      ${cloud ? '' : `<section class="card">
        <h2>Passcode</h2>
        <p>${CONFIG.passcodeEnabled
          ? 'A passcode is required each time the app opens in a new session.'
          : 'Off. The passcode screen is a stub — turn it on with <code>passcodeEnabled</code> in <code>js/config.js</code>.'}</p>
        ${CONFIG.passcodeEnabled ? '<div class="btns"><button type="button" class="btn" data-action="lock">Lock now</button></div>' : ''}
      </section>`}
      <section class="card">
        <h2>Start over</h2>
        <p>Restores the 5-day starter program and the default extras with empty weights. Deletes your variations, notes and saved workouts.</p>
        <div class="btns"><button type="button" class="btn danger" data-action="reset">Reset all data</button></div>
      </section>
    </div></main>`,
  };
}

async function exportBackup() {
  const data = await S.exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `liftmax-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

app.addEventListener('change', (e) => {
  if (e.target.id !== 'import-file') return;
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  run(async () => {
    const json = JSON.parse(await file.text());
    const ok = await confirmSheet({
      title: 'Replace all data?',
      message: 'Importing replaces everything in the app with the contents of this backup.',
      confirmLabel: 'Replace',
    });
    if (!ok) return;
    await S.importData(json);
    toast('Backup imported');
    rerender();
  });
});

// ---------------------------------------------------------------- Passcode (stub)

// ---------------------------------------------------------------- Sign-in (cloud sync)

function renderSignIn(message = '') {
  document.title = 'Sign in · LiftMax';
  app.innerHTML = `
  <main class="lock">
    <div class="wordmark" style="font-size:40px" role="img" aria-label="LiftMax"><span>LIFT</span><span class="max">MAX</span></div>
    <form id="signin-form" novalidate>
      <h1 class="sheet-title" style="text-align:center" tabindex="-1">Sign in to sync</h1>
      <label class="field">Email
        <input class="input signin" name="email" type="email" autocomplete="username" inputmode="email" autocapitalize="off" required>
      </label>
      <label class="field">Password
        <input class="input signin" name="password" type="password" autocomplete="current-password" required>
      </label>
      <div class="err" role="alert">${esc(message)}</div>
      <button class="btn primary big" type="submit">Sign in</button>
      <p class="sub" style="text-align:center;font-size:12px;margin:0">Use the same account as your other apps.</p>
    </form>
  </main>`;
  const form = document.getElementById('signin-form');
  form.elements.email.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const err = form.querySelector('.err');
    const btn = form.querySelector('button[type=submit]');
    if (!email || !password) return (err.textContent = 'Enter your email and password');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    err.textContent = '';
    try {
      await S.signIn(email, password);
      await S.init();
      signedIn = true;
      lastRouteKey = '';
      render();
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });
}

// ---------------------------------------------------------------- Passcode (stub, local mode only)

const UNLOCK_KEY = 'liftmax.unlocked';
function isLocked() {
  if (!CONFIG.passcodeEnabled || S.requiresAuth()) return false;
  try { return sessionStorage.getItem(UNLOCK_KEY) !== '1'; } catch { return true; }
}

function renderLock() {
  document.title = 'LiftMax';
  app.innerHTML = `
  <main class="lock">
    <div class="wordmark" style="font-size:40px" role="img" aria-label="LiftMax"><span>LIFT</span><span class="max">MAX</span></div>
    <form id="lock-form">
      <label class="field" for="pass">Enter passcode</label>
      <input class="input" id="pass" type="password" inputmode="numeric" autocomplete="current-password" required>
      <div class="err" role="alert"></div>
      <button class="btn primary big" type="submit">Unlock</button>
    </form>
  </main>`;
  const form = document.getElementById('lock-form');
  form.pass?.focus();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (form.querySelector('#pass').value === String(CONFIG.passcode)) {
      try { sessionStorage.setItem(UNLOCK_KEY, '1'); } catch {}
      lastRouteKey = '';
      render();
    } else {
      form.querySelector('.err').textContent = 'Wrong passcode';
      form.querySelector('#pass').select();
    }
  });
}

// ---------------------------------------------------------------- actions

function goto(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

async function run(fn) {
  try {
    await fn();
  } catch (err) {
    console.error(err);
    toast(err.message || 'Something went wrong');
  }
}

async function groupOptions(includeNew) {
  const groups = await S.getExtrasGroups();
  const opts = groups.map((g) => ({ value: g.id, label: g.name }));
  if (includeNew) opts.push({ value: '__new', label: 'New group…' });
  return opts;
}

async function renameExtra(id) {
  const ex = await S.getExercise(id);
  const name = await promptSheet({ title: 'Edit exercise', label: 'Name', value: ex.name });
  if (name) await S.updateExercise(id, { name });
}

async function moveExtra(id) {
  const ex = await S.getExercise(id);
  const { action, values } = await sheet({
    title: 'Move to group',
    message: ex.name,
    fields: [
      { name: 'group', label: 'Group', type: 'select', value: ex.extrasGroupId, options: await groupOptions(true) },
      { name: 'newGroup', label: 'New group name', placeholder: 'e.g. Mobility', showIf: { field: 'group', value: '__new' } },
    ],
    actions: [{ id: 'ok', label: 'Move', kind: 'primary' }],
  });
  if (action !== 'ok') return;
  let groupId = values.group;
  if (groupId === '__new') groupId = (await S.addExtrasGroup(values.newGroup)).id;
  if (groupId !== ex.extrasGroupId) await S.moveExtraExercise(id, groupId);
}

async function deleteExtra(id) {
  const ex = await S.getExercise(id);
  const ok = await confirmSheet({
    title: `Delete ${ex.name}?`,
    message: 'This removes the exercise, its variations and notes.',
  });
  if (ok) await S.deleteExtraExercise(id);
  return ok;
}

const ACTIONS = {
  async focus(el) {
    await S.setFocus(el.dataset.day, el.dataset.ex);
    rerender();
  },

  // Variations
  async 'var-menu'(el) {
    ui.varMenu = ui.varMenu === el.dataset.id ? null : el.dataset.id;
    rerender();
  },
  async 'var-main'(el) {
    const v = (await S.getVariations(parseRoute().id)).find((x) => x.id === el.dataset.id);
    if (v) await S.setMainVariation(v.exerciseId, v.id);
    rerender();
  },
  async 'var-rename'(el) {
    const v = (await S.getVariations(parseRoute().id)).find((x) => x.id === el.dataset.id);
    const name = await promptSheet({ title: 'Rename variation', label: 'Name', value: v?.name || '' });
    if (name) {
      await S.updateVariation(el.dataset.id, { name });
      ui.varMenu = null;
      rerender();
    }
  },
  async 'var-delete'(el) {
    const v = (await S.getVariations(parseRoute().id)).find((x) => x.id === el.dataset.id);
    const ok = await confirmSheet({
      title: `Delete ${v?.name || 'variation'}?`,
      message: 'Its weight, reps and focus-day plan will be removed.',
    });
    if (!ok) return;
    await S.deleteVariation(el.dataset.id);
    ui.varMenu = null;
    rerender();
  },
  async 'var-add'(el) {
    const name = await promptSheet({ title: 'Add variation', label: 'Name', placeholder: 'e.g. Smith machine', confirmLabel: 'Add' });
    if (!name) return;
    await S.addVariation(el.dataset.id, name);
    await rerender();
    const inputs = app.querySelectorAll('[data-field="weight"]');
    inputs[inputs.length - 1]?.focus();
  },

  // Extras
  async 'extra-menu'(el) {
    ui.extraMenu = ui.extraMenu === el.dataset.id ? null : el.dataset.id;
    rerender();
  },
  async 'extra-edit'(el) { await renameExtra(el.dataset.id); ui.extraMenu = null; rerender(); },
  async 'extra-move'(el) { await moveExtra(el.dataset.id); ui.extraMenu = null; rerender(); },
  async 'extra-delete'(el) { await deleteExtra(el.dataset.id); ui.extraMenu = null; rerender(); },
  async 'extra-options'(el) {
    const id = el.dataset.id;
    const { action } = await sheet({
      title: 'Exercise options', list: true,
      actions: [
        { id: 'rename', label: 'Edit name' },
        { id: 'move', label: 'Move group' },
        { id: 'delete', label: 'Delete exercise', kind: 'danger' },
      ],
    });
    if (action === 'rename') await renameExtra(id);
    if (action === 'move') await moveExtra(id);
    if (action === 'delete') {
      if (await deleteExtra(id)) return goto('#/extras');
    }
    rerender();
  },
  async 'extra-add'() {
    const groups = await groupOptions(true);
    const { action, values } = await sheet({
      title: 'Add extra exercise',
      fields: [
        { name: 'name', label: 'Exercise name', placeholder: 'e.g. Cable Lateral Raise', required: true },
        { name: 'group', label: 'Group', type: 'select', value: groups[0]?.value, options: groups },
        { name: 'newGroup', label: 'New group name', placeholder: 'e.g. Mobility', showIf: { field: 'group', value: '__new' } },
      ],
      actions: [{ id: 'ok', label: 'Add', kind: 'primary' }],
    });
    if (action !== 'ok' || !values.name) return;
    let groupId = values.group;
    if (groupId === '__new') groupId = (await S.addExtrasGroup(values.newGroup)).id;
    await S.addExtraExercise(values.name, groupId);
    rerender();
  },
  async 'group-add'() {
    const name = await promptSheet({ title: 'Add group', label: 'Group name', placeholder: 'e.g. Mobility', confirmLabel: 'Add' });
    if (!name) return;
    await S.addExtrasGroup(name);
    rerender();
  },
  async 'group-menu'(el) {
    const id = el.dataset.id;
    const group = (await S.getExtrasGroups()).find((g) => g.id === id);
    const count = (await S.getExtrasExercises()).filter((e) => e.extrasGroupId === id).length;
    const { action } = await sheet({
      title: group.name, list: true,
      actions: [{ id: 'rename', label: 'Rename group' }, { id: 'delete', label: 'Delete group', kind: 'danger' }],
    });
    if (action === 'rename') {
      const name = await promptSheet({ title: 'Rename group', label: 'Group name', value: group.name });
      if (name) await S.renameExtrasGroup(id, name);
    }
    if (action === 'delete') {
      const ok = count === 0 || (await confirmSheet({
        title: `Delete ${group.name}?`,
        message: `This group has ${count} exercise${count === 1 ? '' : 's'}. Deleting the group deletes ${count === 1 ? 'it' : 'them'} too, with all variations and notes.`,
        confirmLabel: `Delete group and ${count} exercise${count === 1 ? '' : 's'}`,
      }));
      if (ok) await S.deleteExtrasGroup(id);
    }
    rerender();
  },

  // Workouts
  async 'workout-new'() { goto('#/workout/new'); },
  async 'workout-open'(el) { goto(`#/workout/${el.dataset.id}`); },
  async 'workout-back'() {
    const f = workoutForm();
    if (f?.dirty) {
      const { action } = await sheet({
        title: 'Save changes?',
        actions: [{ id: 'save', label: 'Save', kind: 'primary' }, { id: 'discard', label: 'Discard', kind: 'danger' }],
      });
      if (action === 'save') return saveWorkout();
      if (action !== 'discard') return;
    }
    goto('#/workouts');
  },
  async 'workout-delete'(el) {
    const w = await S.getWorkout(el.dataset.id);
    const ok = await confirmSheet({ title: `Delete ${w?.title || 'workout'}?`, message: 'This workout and its notes will be removed.' });
    if (!ok) return;
    await S.deleteWorkout(el.dataset.id);
    toast('Workout deleted');
    goto('#/workouts');
  },

  // Settings
  async export() { await exportBackup(); },
  async import() { document.getElementById('import-file')?.click(); },
  async reset() {
    const ok = await confirmSheet({
      title: 'Reset all data?',
      message: 'Everything goes back to the starter program. Your weights, variations, notes and saved workouts will be deleted. Export a backup first if you might want them.',
      confirmLabel: 'Reset everything',
    });
    if (!ok) return;
    await S.resetAll();
    toast('Reset to starter program');
    goto('#/');
  },
  async 'sign-out'() {
    const ok = await confirmSheet({
      title: 'Sign out?',
      message: 'Your data stays saved in the cloud. Sign in again to see it.',
      confirmLabel: 'Sign out',
      danger: false,
    });
    if (!ok) return;
    await S.signOut();
    signedIn = false;
    location.hash = '#/';
    renderSignIn();
  },
  async lock() {
    try { sessionStorage.removeItem(UNLOCK_KEY); } catch {}
    render();
  },
};

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !app.contains(el)) return;
  const fn = ACTIONS[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  run(async () => {
    await flushAll();
    await fn(el);
  });
});

const VIEWS = {
  home: viewHome,
  day: viewDay,
  ex: viewExercise,
  exercises: viewAllExercises,
  extras: viewExtras,
  workouts: viewWorkouts,
  workout: viewWorkout,
  settings: viewSettings,
};

// ---------------------------------------------------------------- boot

(async function boot() {
  try {
    signedIn = (await S.init()).signedIn;
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="scroll pad" style="padding-top:60px"><div class="empty-state">LiftMax couldn't load its data.<br>${esc(err.message)}
      <button type="button" class="btn primary" onclick="location.reload()">Try again</button></div></div>`;
    return;
  }
  render();
  if (S.isOffline()) toast("You're offline — showing your last synced data", 3500);
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
