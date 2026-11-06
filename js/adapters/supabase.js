// Supabase backend — same table interface as adapters/local.js, plus sign-in.
//
// The whole dataset is small (a few dozen rows), so this adapter loads every table once
// into memory after sign-in and serves reads from there — screens stay instant. Writes go
// to Supabase first and update memory only once the server accepts them, so the screen
// never shows something that didn't save. A copy of the last good load is kept on the
// device so the app still opens (read-only) without a connection.

const TABLES = {
  days: 'lm_days',
  exercises: 'lm_exercises',
  variations: 'lm_variations',
  extrasGroups: 'lm_extras_groups',
  workouts: 'lm_workouts',
};

const toSnake = (s) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const toCamel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const clone = (v) => JSON.parse(JSON.stringify(v));
const matches = (row, where) => !where || Object.entries(where).every(([k, v]) => row[k] === v);

// Server -> app: camelCase, and drop user_id (the database fills it in from the session).
const fromRow = (row) => {
  const out = {};
  for (const [k, v] of Object.entries(row)) if (k !== 'user_id') out[toCamel(k)] = v;
  return out;
};
// App -> server: snake_case, never send a userId (RLS + column default own that).
const toRow = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (k !== 'userId') out[toSnake(k)] = v;
  return out;
};

export async function createSupabaseAdapter({ url, anonKey }) {
  if (!url || !anonKey) throw new Error('Supabase url and anonKey are missing in js/config.js');
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const sb = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'liftmax.auth' },
  });

  let cache = null;
  let user = null;
  let offline = false;

  const snapshotKey = () => `liftmax.snapshot.${user?.id}`;

  const check = ({ data, error }) => {
    if (error) {
      const msg = /fetch|network/i.test(error.message) ? 'No connection — change not saved' : error.message;
      throw new Error(msg);
    }
    return data;
  };

  const ensureOnline = () => {
    if (offline) throw new Error("You're offline — changes can't be saved until you reconnect");
  };

  const table = (t) => {
    if (!cache) throw new Error('Data not loaded yet');
    return cache[t];
  };

  const saveSnapshot = () => {
    try { localStorage.setItem(snapshotKey(), JSON.stringify(cache)); } catch {}
  };

  return {
    name: 'supabase',
    requiresAuth: true,
    get offline() { return offline; },

    // ---- auth ----
    async getUser() {
      const { data } = await sb.auth.getSession();
      user = data.session?.user ?? null;
      return user;
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password' : error.message);
      user = data.user;
      return user;
    },
    async signOut() {
      try { localStorage.removeItem(snapshotKey()); } catch {}
      await sb.auth.signOut();
      user = null;
      cache = null;
    },

    // ---- loading ----
    /** Loads every table into memory. Falls back to the on-device copy when offline. */
    async load() {
      try {
        const entries = await Promise.all(
          Object.entries(TABLES).map(async ([t, name]) => [t, check(await sb.from(name).select('*')).map(fromRow)]),
        );
        cache = Object.fromEntries(entries);
        offline = false;
        saveSnapshot();
      } catch (err) {
        let snap = null;
        try { snap = JSON.parse(localStorage.getItem(snapshotKey())); } catch {}
        if (!snap) throw err;
        cache = snap;
        offline = true;
      }
    },

    // ---- table interface ----
    async list(t, where) {
      return clone(table(t).filter((r) => matches(r, where)));
    },

    async get(t, id) {
      const row = table(t).find((r) => r.id === id);
      return row ? clone(row) : null;
    },

    async insert(t, rows) {
      ensureOnline();
      const list = Array.isArray(rows) ? rows : [rows];
      if (list.length) check(await sb.from(TABLES[t]).insert(list.map(toRow)));
      table(t).push(...clone(list));
      saveSnapshot();
      return clone(rows);
    },

    async update(t, id, patch) {
      ensureOnline();
      check(await sb.from(TABLES[t]).update(toRow(patch)).eq('id', id));
      const row = table(t).find((r) => r.id === id);
      if (!row) return null;
      Object.assign(row, clone(patch));
      saveSnapshot();
      return clone(row);
    },

    async remove(t, id) {
      ensureOnline();
      check(await sb.from(TABLES[t]).delete().eq('id', id));
      cache[t] = table(t).filter((r) => r.id !== id);
      saveSnapshot();
    },

    async removeWhere(t, where) {
      ensureOnline();
      let q = sb.from(TABLES[t]).delete();
      for (const [k, v] of Object.entries(where)) q = v === null ? q.is(toSnake(k), null) : q.eq(toSnake(k), v);
      check(await q);
      cache[t] = table(t).filter((r) => !matches(r, where));
      saveSnapshot();
    },

    async dump() {
      return clone(cache);
    },

    /** Replaces all of this user's data. Children are deleted first, parents inserted first. */
    async restore(data) {
      ensureOnline();
      for (const t of ['variations', 'exercises', 'extrasGroups', 'days', 'workouts']) {
        check(await sb.from(TABLES[t]).delete().not('id', 'is', null));
      }
      cache = Object.fromEntries(Object.keys(TABLES).map((t) => [t, []]));
      for (const t of ['days', 'extrasGroups', 'exercises', 'variations', 'workouts']) {
        const rows = (data?.[t] || []).map((r) => {
          const { userId, ...rest } = r;
          return rest;
        });
        if (rows.length) await this.insert(t, rows);
      }
      saveSnapshot();
    },
  };
}
