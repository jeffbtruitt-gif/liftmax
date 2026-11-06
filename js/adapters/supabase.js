// Supabase backend — same interface as adapters/local.js.
// Not active by default. To use it: run supabase/schema.sql in your project,
// then set CONFIG.backend = 'supabase' plus url and anonKey in js/config.js.

const TABLE_NAMES = {
  days: 'days',
  exercises: 'exercises',
  variations: 'variations',
  extrasGroups: 'extras_groups',
  workouts: 'workouts',
};

const toSnake = (s) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const toCamel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const mapKeys = (obj, fn) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [fn(k), v]));
const out = (row) => mapKeys(row, toSnake);
const inn = (row) => mapKeys(row, toCamel);

export async function createSupabaseAdapter({ url, anonKey }) {
  if (!url || !anonKey) throw new Error('Supabase url and anonKey are missing in js/config.js');
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const sb = createClient(url, anonKey);

  const check = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };

  const applyWhere = (q, where) => {
    for (const [k, v] of Object.entries(where || {})) q = v === null ? q.is(toSnake(k), null) : q.eq(toSnake(k), v);
    return q;
  };

  return {
    name: 'supabase',

    async list(table, where) {
      return check(await applyWhere(sb.from(TABLE_NAMES[table]).select('*'), where)).map(inn);
    },

    async get(table, id) {
      const rows = check(await sb.from(TABLE_NAMES[table]).select('*').eq('id', id).limit(1));
      return rows[0] ? inn(rows[0]) : null;
    },

    async insert(table, rows) {
      const list = Array.isArray(rows) ? rows : [rows];
      check(await sb.from(TABLE_NAMES[table]).insert(list.map(out)));
      return rows;
    },

    async update(table, id, patch) {
      const rows = check(await sb.from(TABLE_NAMES[table]).update(out(patch)).eq('id', id).select());
      return rows[0] ? inn(rows[0]) : null;
    },

    async remove(table, id) {
      check(await sb.from(TABLE_NAMES[table]).delete().eq('id', id));
    },

    async removeWhere(table, where) {
      check(await applyWhere(sb.from(TABLE_NAMES[table]).delete(), where));
    },

    async dump() {
      const data = {};
      for (const t of Object.keys(TABLE_NAMES)) data[t] = await this.list(t);
      return data;
    },

    async restore(data) {
      // Children first on delete, parents first on insert.
      for (const t of ['variations', 'exercises', 'extrasGroups', 'days', 'workouts']) {
        check(await sb.from(TABLE_NAMES[t]).delete().not('id', 'is', null));
      }
      for (const t of ['days', 'extrasGroups', 'exercises', 'variations', 'workouts']) {
        if (data?.[t]?.length) await this.insert(t, data[t]);
      }
    },
  };
}
