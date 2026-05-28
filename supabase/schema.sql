create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_checklists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  input jsonb not null default '{}'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  completed_item_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_checklists_user_updated_idx
  on public.saved_checklists (user_id, updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists saved_checklists_set_updated_at on public.saved_checklists;
create trigger saved_checklists_set_updated_at
before update on public.saved_checklists
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.saved_checklists enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Users can view own checklists" on public.saved_checklists;
create policy "Users can view own checklists"
on public.saved_checklists
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own checklists" on public.saved_checklists;
create policy "Users can insert own checklists"
on public.saved_checklists
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own checklists" on public.saved_checklists;
create policy "Users can update own checklists"
on public.saved_checklists
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own checklists" on public.saved_checklists;
create policy "Users can delete own checklists"
on public.saved_checklists
for delete
to authenticated
using ((select auth.uid()) = user_id);
