-- Hybrid ProGram — dati degli utenti su Supabase.
-- Esegui questo script una volta in Supabase → SQL Editor → New query → Run.
-- Ogni utente ha una sola riga con il proprio stato (sessioni fatte, calcolatori, preferenze, profilo).
-- La programmazione NON sta qui: resta in data/program.json, quindi aggiornarla non tocca i dati utente.

-- Se esiste già una tabella user_state creata dal Table Editor (solo id/created_at, senza user_id)
-- la sostituiamo: non contiene dati dell'app.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_state')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'user_id') then
    drop table public.user_state;
  end if;
end $$;

create table if not exists public.user_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

-- Ogni utente vede e modifica solo la propria riga.
drop policy if exists "user_state_select_own" on public.user_state;
create policy "user_state_select_own" on public.user_state
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "user_state_insert_own" on public.user_state;
create policy "user_state_insert_own" on public.user_state
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "user_state_update_own" on public.user_state;
create policy "user_state_update_own" on public.user_state
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Limite di sicurezza sulla dimensione del documento (un anno di dati occupa pochi KB).
alter table public.user_state drop constraint if exists user_state_size;
alter table public.user_state add constraint user_state_size check (pg_column_size(state) < 512000);

grant select, insert, update on public.user_state to authenticated;
revoke all on public.user_state from anon;

-- Score degli allenamenti e classifiche condivise (stesso contenuto di supabase/scores.sql).
create table if not exists public.scores (
  user_id    uuid not null references auth.users (id) on delete cascade,
  week       integer not null,
  session_id text not null,
  block      integer not null default 0,
  kind       text not null,
  value      numeric,
  display    text not null default '' check (char_length(display) <= 40),
  division   text not null default '' check (char_length(division) <= 30),
  note       text not null default '' check (char_length(note) <= 200),
  name       text not null default '' check (char_length(name) <= 40),
  updated_at timestamptz not null default now(),
  primary key (user_id, week, session_id, block)
);

alter table public.scores alter column value drop not null;
alter table public.scores drop constraint if exists scores_kind_check;
alter table public.scores add constraint scores_kind_check
  check (kind in ('time','pace','watts','reps','rounds','split','load','distance','amrap','note'));
alter table public.scores drop constraint if exists scores_note_check;
alter table public.scores add constraint scores_note_check check (char_length(note) <= 200);

create index if not exists scores_board on public.scores (week, session_id, block, kind, value);

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

notify pgrst, 'reload schema';
