-- Hybrid ProGram — programmazione gestita dal coach (dashboard coach.html).
-- Esegui una volta in Supabase → SQL Editor (è idempotente: si può rieseguire).
-- Le settimane in public.program_weeks si sommano a data/program.json: a parità di numero vince il database.

-- Coach abilitati: solo loro scrivono la programmazione.
create table if not exists public.coaches (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.coaches enable row level security;
drop policy if exists "coaches_select_own" on public.coaches;
create policy "coaches_select_own" on public.coaches
  for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.coaches to authenticated;
revoke all on public.coaches from anon;

create or replace function public.is_coach() returns boolean
  language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.coaches where user_id = (select auth.uid())) $$;
grant execute on function public.is_coach() to authenticated;

-- Settimane: bozza o pubblicata; publish_at nel futuro = pubblicazione programmata.
create table if not exists public.program_weeks (
  number      integer primary key check (number > 0),
  data        jsonb not null,
  status      text not null default 'draft' check (status in ('draft', 'published')),
  publish_at  timestamptz,
  source_text text not null default '',
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);
alter table public.program_weeks drop constraint if exists program_weeks_size;
alter table public.program_weeks add constraint program_weeks_size check (pg_column_size(data) < 512000);

alter table public.program_weeks enable row level security;

-- Gli atleti vedono solo le settimane pubblicate (e già uscite); il coach vede tutto.
drop policy if exists "program_read" on public.program_weeks;
create policy "program_read" on public.program_weeks
  for select to authenticated
  using ((status = 'published' and (publish_at is null or publish_at <= now())) or (select public.is_coach()));

drop policy if exists "program_insert_coach" on public.program_weeks;
create policy "program_insert_coach" on public.program_weeks
  for insert to authenticated with check ((select public.is_coach()));

drop policy if exists "program_update_coach" on public.program_weeks;
create policy "program_update_coach" on public.program_weeks
  for update to authenticated using ((select public.is_coach())) with check ((select public.is_coach()));

-- Si cancellano solo le bozze: una settimana pubblicata si ritira (torna bozza), così i progressi restano agganciati.
drop policy if exists "program_delete_draft" on public.program_weeks;
create policy "program_delete_draft" on public.program_weeks
  for delete to authenticated using ((select public.is_coach()) and status = 'draft');

grant select, insert, update, delete on public.program_weeks to authenticated;
revoke all on public.program_weeks from anon;

-- Storico: ogni salvataggio conserva la versione precedente.
create table if not exists public.program_history (
  id          bigint generated always as identity primary key,
  number      integer not null,
  data        jsonb not null,
  status      text not null,
  publish_at  timestamptz,
  source_text text not null default '',
  saved_at    timestamptz not null default now(),
  saved_by    uuid references auth.users (id) on delete set null
);
create index if not exists program_history_number on public.program_history (number, saved_at desc);
alter table public.program_history enable row level security;
drop policy if exists "history_read_coach" on public.program_history;
create policy "history_read_coach" on public.program_history
  for select to authenticated using ((select public.is_coach()));
grant select on public.program_history to authenticated;
revoke all on public.program_history from anon;

create or replace function public.program_weeks_touch() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  if tg_op = 'UPDATE' then
    insert into public.program_history (number, data, status, publish_at, source_text, saved_by)
    values (old.number, old.data, old.status, old.publish_at, old.source_text, old.updated_by);
  end if;
  return new;
end $$;
drop trigger if exists program_weeks_touch on public.program_weeks;
create trigger program_weeks_touch before insert or update on public.program_weeks
  for each row execute function public.program_weeks_touch();

-- Abilitare un coach (sostituisci l'email):
-- insert into public.coaches (user_id) select id from auth.users where email = 'coach@esempio.it' on conflict do nothing;

notify pgrst, 'reload schema';
