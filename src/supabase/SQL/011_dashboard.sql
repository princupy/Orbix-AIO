-- Dashboard support tables (module toggles, moderation cases, and analytics).

-- Per-guild module on/off switches. `modules` is a JSON map of
-- { "moderation": true, "automod": false, ... }. A missing key means enabled.
create table if not exists public.guild_modules (
  guild_id text primary key,
  modules jsonb not null default '{}'::jsonb,
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

drop trigger if exists set_guild_modules_updated_at on public.guild_modules;
create trigger set_guild_modules_updated_at
before update on public.guild_modules
for each row
execute function public.set_updated_at();

-- Moderation case log (warn / mute / unmute / kick / ban / unban / timeout).
create table if not exists public.moderation_cases (
  id bigint generated always as identity primary key,
  guild_id text not null,
  case_type text not null,
  target_id text not null,
  target_tag text,
  moderator_id text,
  moderator_tag text,
  reason text,
  duration_ms bigint,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists moderation_cases_guild_created_idx
  on public.moderation_cases (guild_id, created_at desc);
create index if not exists moderation_cases_guild_target_idx
  on public.moderation_cases (guild_id, target_id);
create index if not exists moderation_cases_guild_type_idx
  on public.moderation_cases (guild_id, case_type);

-- Per-command usage events (powers the command-usage analytics).
create table if not exists public.command_usage (
  id bigint generated always as identity primary key,
  guild_id text not null,
  command text not null,
  user_id text,
  created_at timestamptz not null default now()
);

create index if not exists command_usage_guild_created_idx
  on public.command_usage (guild_id, created_at desc);
create index if not exists command_usage_guild_command_idx
  on public.command_usage (guild_id, command);

-- Periodic member/online snapshots (powers the member-growth chart).
create table if not exists public.member_snapshots (
  id bigint generated always as identity primary key,
  guild_id text not null,
  member_count integer not null default 0,
  online_count integer,
  captured_at timestamptz not null default now()
);

create index if not exists member_snapshots_guild_captured_idx
  on public.member_snapshots (guild_id, captured_at desc);

-- Daily message counts per guild (powers the message-activity chart).
create table if not exists public.message_activity (
  guild_id text not null,
  day date not null,
  count bigint not null default 0,
  primary key (guild_id, day)
);

-- Atomic daily increment used by the bot when a message is seen.
create or replace function public.increment_message_activity(p_guild_id text, p_day date, p_amount integer default 1)
returns void
language plpgsql
as $$
begin
  insert into public.message_activity (guild_id, day, count)
  values (p_guild_id, p_day, p_amount)
  on conflict (guild_id, day)
  do update set count = public.message_activity.count + p_amount;
end;
$$;
