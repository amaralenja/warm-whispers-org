create table if not exists public.uaz_config (
  id int primary key default 1,
  server_url text,
  instance_token text,
  updated_at timestamptz not null default now(),
  constraint uaz_config_single_row check (id = 1)
);

grant select, insert, update on public.uaz_config to authenticated;
grant all on public.uaz_config to service_role;

alter table public.uaz_config enable row level security;

drop policy if exists "auth read uaz_config" on public.uaz_config;
create policy "auth read uaz_config" on public.uaz_config
  for select to authenticated using (true);

drop policy if exists "auth write uaz_config" on public.uaz_config;
create policy "auth write uaz_config" on public.uaz_config
  for all to authenticated using (true) with check (true);

insert into public.uaz_config (id) values (1) on conflict (id) do nothing;