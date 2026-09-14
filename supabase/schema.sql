-- Run this SQL in BOTH Supabase projects (dev and production).
-- Dev credentials: .env.development. Production: .env.production.
-- Then Authentication → URL configuration:
--   Site URL: https://shawngester.github.io/wedding-guest-hub/
--   Redirect URLs: https://shawngester.github.io/wedding-guest-hub/
--                  http://localhost:5173/wedding-guest-hub/
-- Enable Email provider (magic link). Confirm email can stay on.

create table if not exists public.allowed_emails (
  email text primary key
);

create table if not exists public.hub_state (
  id int primary key default 1 check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.allowed_emails enable row level security;
alter table public.hub_state enable row level security;

-- Replace these with the Gmail addresses that may open the hub.
insert into public.allowed_emails (email) values
  ('shawnge1001@gmail.com'),
  ('yxu2162@gmail.com')
on conflict (email) do nothing;

create or replace function public.is_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.allowed_emails
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

drop policy if exists "allowed read emails" on public.allowed_emails;
create policy "allowed read emails"
  on public.allowed_emails
  for select
  to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "allowed read hub" on public.hub_state;
create policy "allowed read hub"
  on public.hub_state
  for select
  to authenticated
  using (public.is_allowed());

drop policy if exists "allowed insert hub" on public.hub_state;
create policy "allowed insert hub"
  on public.hub_state
  for insert
  to authenticated
  with check (public.is_allowed());

drop policy if exists "allowed update hub" on public.hub_state;
create policy "allowed update hub"
  on public.hub_state
  for update
  to authenticated
  using (public.is_allowed())
  with check (public.is_allowed());

do $$
begin
  alter publication supabase_realtime add table public.hub_state;
exception
  when duplicate_object then null;
end $$;
