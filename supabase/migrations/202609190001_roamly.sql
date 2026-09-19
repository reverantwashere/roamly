-- Roamly beta: run this in the Supabase SQL editor or through the Supabase CLI.
-- Application data is deliberately separate from auth.users. The browser only
-- receives the project URL and publishable/anon key; RLS protects every row.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Traveller',
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('trips', 'vehicles', 'expenses', 'fuelRecords', 'savedPlaces')),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists entities_user_kind_created_idx
  on public.entities (user_id, kind, created_at);
create unique index if not exists saved_places_per_user_idx
  on public.entities (user_id, (data->>'placeId')) where kind = 'savedPlaces';

alter table public.profiles enable row level security;
alter table public.entities enable row level security;

drop policy if exists "Users manage their own profile" on public.profiles;
create policy "Users manage their own profile" on public.profiles
  for all to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists "Users manage their own Roamly data" on public.entities;
create policy "Users manage their own Roamly data" on public.entities
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, profile)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email, 'Traveller'), '@', 1), 'Traveller'),
    jsonb_build_object('currency', 'INR', 'country', 'India', 'city', 'Kochi', 'visibility', 'Private')
  ) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();
drop trigger if exists entities_set_updated_at on public.entities;
create trigger entities_set_updated_at before update on public.entities
  for each row execute procedure public.set_updated_at();
