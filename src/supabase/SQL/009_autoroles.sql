create table if not exists public.autorole_settings (
  guild_id text primary key,
  enabled boolean not null default true,
  all_role_ids text[] not null default '{}',
  bot_role_ids text[] not null default '{}',
  human_role_ids text[] not null default '{}',
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

drop trigger if exists set_autorole_settings_updated_at on public.autorole_settings;
create trigger set_autorole_settings_updated_at
before update on public.autorole_settings
for each row
execute function public.set_updated_at();
