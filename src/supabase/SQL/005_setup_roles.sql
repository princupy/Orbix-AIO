create table if not exists public.setup_role_access (
  guild_id text not null,
  role_id text not null,
  added_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, role_id)
);

create table if not exists public.setup_role_commands (
  guild_id text not null,
  command_name text not null,
  role_id text not null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, command_name),
  constraint setup_role_commands_name_check
    check (command_name ~ '^[a-z0-9_-]{2,32}$')
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

drop trigger if exists set_setup_role_access_updated_at on public.setup_role_access;
create trigger set_setup_role_access_updated_at
before update on public.setup_role_access
for each row
execute function public.set_updated_at();

drop trigger if exists set_setup_role_commands_updated_at on public.setup_role_commands;
create trigger set_setup_role_commands_updated_at
before update on public.setup_role_commands
for each row
execute function public.set_updated_at();

create index if not exists setup_role_access_guild_idx
on public.setup_role_access (guild_id);

create index if not exists setup_role_commands_guild_idx
on public.setup_role_commands (guild_id);
