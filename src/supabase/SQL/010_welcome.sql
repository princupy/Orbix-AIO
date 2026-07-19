create table if not exists public.welcome_settings (
  guild_id text primary key,
  enabled boolean not null default true,
  channel_id text,
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_welcome_settings_updated_at on public.welcome_settings;
create trigger set_welcome_settings_updated_at
before update on public.welcome_settings
for each row
execute function public.set_updated_at();
