-- Hybrid ProGram — dati degli utenti su Supabase.
-- Esegui questo script una volta in Supabase → SQL Editor → New query → Run.
-- Ogni utente ha una sola riga con il proprio stato (sessioni fatte, calcolatori, preferenze, profilo).
-- La programmazione NON sta qui: resta in data/program.json, quindi aggiornarla non tocca i dati utente.

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
