create table if not exists public.levels (
  guild_id text not null,
  user_id text not null,
  xp integer not null default 0,
  level integer not null default 0,
  total_messages integer not null default 0,
  last_xp_timestamp timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, user_id)
);

create table if not exists public.level_config (
  guild_id text primary key,
  leveling_enabled boolean not null default true,
  xp_min integer not null default 15,
  xp_max integer not null default 25,
  cooldown_seconds integer not null default 60,
  levelup_channel_id text,
  levelup_message text not null default '{mention} reached level {level}!',
  levelup_enabled boolean not null default true,
  stack_roles boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.level_notifications (
  guild_id text not null,
  user_id text not null,
  level integer not null,
  created_at timestamptz not null default now(),
  primary key (guild_id, user_id, level)
);

create table if not exists public.level_roles (
  guild_id text not null,
  level integer not null,
  role_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, level)
);

create table if not exists public.blacklist (
  guild_id text not null,
  type text not null check (type in ('channel', 'role')),
  target_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, type, target_id)
);

create table if not exists public.multipliers (
  guild_id text not null,
  role_id text not null,
  multiplier numeric(6, 2) not null default 1.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, role_id)
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

drop trigger if exists set_levels_updated_at on public.levels;
create trigger set_levels_updated_at
before update on public.levels
for each row
execute function public.set_updated_at();

drop trigger if exists set_level_config_updated_at on public.level_config;
create trigger set_level_config_updated_at
before update on public.level_config
for each row
execute function public.set_updated_at();

drop trigger if exists set_level_roles_updated_at on public.level_roles;
create trigger set_level_roles_updated_at
before update on public.level_roles
for each row
execute function public.set_updated_at();

drop trigger if exists set_blacklist_updated_at on public.blacklist;
create trigger set_blacklist_updated_at
before update on public.blacklist
for each row
execute function public.set_updated_at();

drop trigger if exists set_multipliers_updated_at on public.multipliers;
create trigger set_multipliers_updated_at
before update on public.multipliers
for each row
execute function public.set_updated_at();

create index if not exists levels_guild_xp_idx on public.levels (guild_id, xp desc);
create index if not exists blacklist_guild_type_idx on public.blacklist (guild_id, type);
create index if not exists multipliers_guild_idx on public.multipliers (guild_id);
