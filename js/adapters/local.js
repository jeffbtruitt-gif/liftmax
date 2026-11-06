// localStorage backend. Implements the generic table adapter interface used by store.js:
//   list(table, where?)  get(table, id)  insert(table, rowOrRows)
//   update(table, id, patch)  remove(table, id)  removeWhere(table, where)
//   dump()  restore(data)
// Rows are plain objects with camelCase fields and a string `id`.

const KEY = 'liftmax.db.v1';
const TABLES = ['days', 'exercises', 'variations', 'extrasGroups', 'workouts'];

let db = null;

function empty() {
  return Object.fromEntries(TABLES.map((t) => [t, []]));
}

function load() {
  if (db) return db;
  try {
    db = JSON.parse(localStorage.getItem(KEY));
  } catch {
    db = null;
  }
  if (!db || typeof db !== 'object') db = empty();
  for (const t of TABLES) if (!Array.isArray(db[t])) db[t] = [];
  return db;
}

function persist() {
  localStorage.setItem(KEY, JSON.stringify(db));
}

const clone = (v) => JSON.parse(JSON.stringify(v));
const matches = (row, where) => !where || Object.entries(where).every(([k, v]) => row[k] === v);

export const localAdapter = {
  name: 'local',
  requiresAuth: false,

  async list(table, where) {
    return clone(load()[table].filter((r) => matches(r, where)));
  },

  async get(table, id) {
    const row = load()[table].find((r) => r.id === id);
    return row ? clone(row) : null;
  },

  async insert(table, rows) {
    const list = Array.isArray(rows) ? rows : [rows];
    load()[table].push(...clone(list));
    persist();
    return clone(rows);
  },

  async update(table, id, patch) {
    const row = load()[table].find((r) => r.id === id);
    if (!row) return null;
    Object.assign(row, clone(patch));
    persist();
    return clone(row);
  },

  async remove(table, id) {
    const d = load();
    d[table] = d[table].filter((r) => r.id !== id);
    persist();
  },

  async removeWhere(table, where) {
    const d = load();
    d[table] = d[table].filter((r) => !matches(r, where));
    persist();
  },

  async dump() {
    return clone(load());
  },

  async restore(data) {
    db = empty();
    for (const t of TABLES) if (Array.isArray(data?.[t])) db[t] = clone(data[t]);
    persist();
  },
};
