// store.js — the ONLY module that reads or writes data.
// Screens call these functions; the backend (localStorage or Supabase) is picked in config.js
// and hidden behind a small table adapter (see js/adapters/). Every function is async so the
// Supabase backend drops in without changing any screen code.

import { CONFIG } from './config.js';
import { localAdapter } from './adapters/local.js';
import { SEED_DAYS, SEED_EXTRAS, guessEquipment } from './seed.js';

let A = localAdapter;

const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const now = () => new Date().toISOString();
const byPosition = (a, b) => (a.position ?? 0) - (b.position ?? 0);
const nextPosition = (rows) => rows.reduce((m, r) => Math.max(m, r.position ?? 0), -1) + 1;

// ---------- setup ----------

export async function init() {
  if (CONFIG.backend === 'supabase') {
    const { createSupabaseAdapter } = await import('./adapters/supabase.js');
    A = await createSupabaseAdapter(CONFIG.supabase);
  } else {
    A = localAdapter;
  }
  const days = await A.list('days');
  if (!days.length) await seed();
}

export function backendName() {
  return A.name;
}

function makeExercise({ name, dayId = null, extrasGroupId = null, position, variationName }) {
  const exId = uid();
  const variation = {
    id: uid(), exerciseId: exId, name: variationName,
    weight: '', reps: '', focusPlan: '', position: 0, updatedAt: null,
  };
  const exercise = {
    id: exId, name, dayId, extrasGroupId, position, generalNotes: '', mainVariationId: variation.id,
  };
  return { exercise, variation };
}

async function seed() {
  const days = [], exercises = [], variations = [], groups = [];
  for (const d of SEED_DAYS) {
    const dayId = uid();
    let focusId = null;
    d.exercises.forEach(([name, equip], i) => {
      const { exercise, variation } = makeExercise({ name, dayId, position: i, variationName: equip });
      if (name === d.focus) focusId = exercise.id;
      exercises.push(exercise);
      variations.push(variation);
    });
    days.push({ id: dayId, number: d.number, name: d.name, subtitle: d.subtitle, focusExerciseId: focusId });
  }
  SEED_EXTRAS.forEach((g, gi) => {
    const groupId = uid();
    groups.push({ id: groupId, name: g.name, position: gi });
    g.exercises.forEach(([name, equip], i) => {
      const { exercise, variation } = makeExercise({ name, extrasGroupId: groupId, position: i, variationName: equip });
      exercises.push(exercise);
      variations.push(variation);
    });
  });
  await A.insert('days', days);
  await A.insert('extrasGroups', groups);
  await A.insert('exercises', exercises);
  await A.insert('variations', variations);
}

// ---------- days ----------

export async function getDays() {
  return (await A.list('days')).sort((a, b) => a.number - b.number);
}

export async function getDay(id) {
  return A.get('days', id);
}

export async function setFocus(dayId, exerciseId) {
  return A.update('days', dayId, { focusExerciseId: exerciseId });
}

// ---------- exercises ----------

export async function getExercise(id) {
  return A.get('exercises', id);
}

export async function getExercisesForDay(dayId) {
  return (await A.list('exercises', { dayId })).sort(byPosition);
}

export async function getExtrasExercises() {
  return (await A.list('exercises', { dayId: null })).sort(byPosition);
}

export async function updateExercise(id, patch) {
  const allowed = {};
  for (const k of ['name', 'generalNotes']) if (k in patch) allowed[k] = patch[k];
  return A.update('exercises', id, allowed);
}

// ---------- variations ----------

export async function getVariations(exerciseId) {
  return (await A.list('variations', { exerciseId })).sort(byPosition);
}

/** Variations for many exercises at once: { [exerciseId]: Variation[] } */
export async function getVariationsByExercise() {
  const map = {};
  for (const v of (await A.list('variations')).sort(byPosition)) (map[v.exerciseId] ||= []).push(v);
  return map;
}

export async function addVariation(exerciseId, name) {
  const existing = await getVariations(exerciseId);
  const v = {
    id: uid(), exerciseId, name: name.trim(), weight: '', reps: '', focusPlan: '',
    position: nextPosition(existing), updatedAt: null,
  };
  await A.insert('variations', v);
  const ex = await getExercise(exerciseId);
  if (ex && !ex.mainVariationId) await A.update('exercises', exerciseId, { mainVariationId: v.id });
  return v;
}

/** Updates name / weight / reps / focusPlan. updatedAt changes only when weight or reps change. */
export async function updateVariation(id, patch) {
  const current = await A.get('variations', id);
  if (!current) return null;
  const allowed = {};
  for (const k of ['name', 'weight', 'reps', 'focusPlan']) if (k in patch) allowed[k] = patch[k];
  const loadChanged =
    ('weight' in allowed && allowed.weight !== current.weight) ||
    ('reps' in allowed && allowed.reps !== current.reps);
  if (loadChanged) allowed.updatedAt = now();
  return A.update('variations', id, allowed);
}

/** Deletes a variation. If it was the main one, the next variation becomes main. */
export async function deleteVariation(id) {
  const v = await A.get('variations', id);
  if (!v) return;
  await A.remove('variations', id);
  const ex = await getExercise(v.exerciseId);
  if (ex && ex.mainVariationId === id) {
    const rest = await getVariations(v.exerciseId);
    const next = rest.find((r) => r.position > v.position) || rest[0] || null;
    await A.update('exercises', ex.id, { mainVariationId: next ? next.id : null });
  }
}

export async function setMainVariation(exerciseId, variationId) {
  return A.update('exercises', exerciseId, { mainVariationId: variationId });
}

// ---------- extras ----------

export async function getExtrasGroups() {
  return (await A.list('extrasGroups')).sort(byPosition);
}

export async function addExtrasGroup(name) {
  const groups = await getExtrasGroups();
  const g = { id: uid(), name: name.trim(), position: nextPosition(groups) };
  await A.insert('extrasGroups', g);
  return g;
}

export async function renameExtrasGroup(id, name) {
  return A.update('extrasGroups', id, { name: name.trim() });
}

/** Deletes a group and every exercise (and variation) in it. */
export async function deleteExtrasGroup(id) {
  const exercises = await A.list('exercises', { extrasGroupId: id });
  for (const ex of exercises) await deleteExtraExercise(ex.id);
  await A.remove('extrasGroups', id);
}

export async function addExtraExercise(name, groupId) {
  const siblings = await A.list('exercises', { extrasGroupId: groupId });
  const { exercise, variation } = makeExercise({
    name: name.trim(), extrasGroupId: groupId, position: nextPosition(siblings),
    variationName: guessEquipment(name),
  });
  await A.insert('exercises', exercise);
  await A.insert('variations', variation);
  return exercise;
}

export async function moveExtraExercise(id, groupId) {
  const siblings = await A.list('exercises', { extrasGroupId: groupId });
  return A.update('exercises', id, { extrasGroupId: groupId, position: nextPosition(siblings) });
}

/** Only extras can be deleted; the 5 program days' exercises are fixed. */
export async function deleteExtraExercise(id) {
  const ex = await getExercise(id);
  if (!ex || ex.dayId) return;
  await A.removeWhere('variations', { exerciseId: id });
  await A.remove('exercises', id);
}

// ---------- workouts ----------

export async function getWorkouts() {
  return (await A.list('workouts')).sort(byPosition);
}

export async function getWorkout(id) {
  return A.get('workouts', id);
}

/** New workouts go to the top of the list. */
export async function addWorkout({ title, notes }) {
  const list = await getWorkouts();
  const top = list.reduce((m, w) => Math.min(m, w.position ?? 0), 1);
  const w = { id: uid(), title, notes, position: top - 1, updatedAt: now() };
  await A.insert('workouts', w);
  return w;
}

export async function updateWorkout(id, { title, notes }) {
  return A.update('workouts', id, { title, notes, updatedAt: now() });
}

export async function deleteWorkout(id) {
  return A.remove('workouts', id);
}

// ---------- backup ----------

export async function exportData() {
  return { app: 'liftmax', version: 1, exportedAt: now(), data: await A.dump() };
}

export async function importData(json) {
  const data = json?.data ?? json;
  if (!Array.isArray(data?.days) || !Array.isArray(data?.exercises)) {
    throw new Error("That file doesn't look like a LiftMax backup.");
  }
  await A.restore(data);
}

export async function resetAll() {
  await A.restore({});
  await seed();
}
