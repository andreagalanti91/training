create table if not exists public.scores (
  user_id    uuid not null references auth.users (id) on delete cascade,
  week       integer not null,
  session_id text not null,
  block      integer not null default 0,
  kind       text not null check (kind in ('time','amrap','load','reps','watts','pace','distance')),
  value      numeric not null,
  display    text not null check (char_length(display) <= 40),
  division   text not null default '' check (char_length(division) <= 30),
  note       text not null default '' check (char_length(note) <= 140),
  name       text not null default '' check (char_length(name) <= 40),
  updated_at timestamptz not null default now(),
  primary key (user_id, week, session_id, block)
);

create index if not exists scores_board on public.scores (week, session_id, block, value);

alter table public.scores enable row level security;

drop policy if exists "scores_read_all" on public.scores;
create policy "scores_read_all" on public.scores
  for select to authenticated using (true);

drop policy if exists "scores_insert_own" on public.scores;
create policy "scores_insert_own" on public.scores
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "scores_update_own" on public.scores;
create policy "scores_update_own" on public.scores
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "scores_delete_own" on public.scores;
create policy "scores_delete_own" on public.scores
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.scores to authenticated;
revoke all on public.scores from anon;
