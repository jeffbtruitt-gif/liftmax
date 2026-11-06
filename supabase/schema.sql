-- LiftMax schema, as applied to Supabase (migration: liftmax_init).
-- Lives alongside other apps in a shared project, so every table is prefixed lm_.
-- Each row belongs to the signed-in user: user_id defaults to auth.uid(), and RLS
-- only lets a user read or write their own rows. Signed-out (anon) access is revoked.

create table public.lm_days (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  number int not null,
  name text not null,
  subtitle text not null default '',
  focus_exercise_id text
);

create table public.lm_extras_groups (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  position int not null default 0
);

create table public.lm_exercises (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  day_id text references public.lm_days(id) on delete cascade,
  extras_group_id text references public.lm_extras_groups(id) on delete cascade,
  position int not null default 0,
  general_notes text not null default '',
  main_variation_id text
);

create table public.lm_variations (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exercise_id text not null references public.lm_exercises(id) on delete cascade,
  name text not null,
  weight text not null default '',
  reps text not null default '',
  focus_plan text not null default '',
  position int not null default 0,
  updated_at timestamptz
);

create table public.lm_workouts (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '',
  notes text not null default '',
  position int not null default 0,
  updated_at timestamptz
);

create index lm_days_user_idx on public.lm_days(user_id);
create index lm_extras_groups_user_idx on public.lm_extras_groups(user_id);
create index lm_exercises_user_idx on public.lm_exercises(user_id);
create index lm_exercises_day_idx on public.lm_exercises(day_id);
create index lm_exercises_group_idx on public.lm_exercises(extras_group_id);
create index lm_variations_user_idx on public.lm_variations(user_id);
create index lm_variations_exercise_idx on public.lm_variations(exercise_id);
create index lm_workouts_user_idx on public.lm_workouts(user_id);

do $$
declare t text;
begin
  foreach t in array array['lm_days','lm_extras_groups','lm_exercises','lm_variations','lm_workouts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_own_rows', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
