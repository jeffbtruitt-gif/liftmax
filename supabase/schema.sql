-- LiftMax schema for Supabase. Mirrors the data model in BUILD_SPEC.md.
-- IDs are text so the app can generate them client-side (same as the localStorage store).
-- Single user: lock these tables down with RLS before putting real data in (see README).

create table if not exists days (
  id text primary key,
  number int not null,
  name text not null,
  subtitle text default '',
  focus_exercise_id text
);

create table if not exists extras_groups (
  id text primary key,
  name text not null,
  position int not null default 0
);

create table if not exists exercises (
  id text primary key,
  name text not null,
  day_id text references days(id) on delete cascade,
  extras_group_id text references extras_groups(id) on delete cascade,
  position int not null default 0,
  general_notes text default '',
  main_variation_id text
);

create table if not exists variations (
  id text primary key,
  exercise_id text not null references exercises(id) on delete cascade,
  name text not null,
  weight text default '',
  reps text default '',
  focus_plan text default '',
  position int not null default 0,
  updated_at timestamptz
);

create table if not exists workouts (
  id text primary key,
  title text not null default '',
  notes text default '',
  position int not null default 0,
  updated_at timestamptz
);
