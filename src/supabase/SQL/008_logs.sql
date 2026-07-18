create table if not exists public.log_settings (
  guild_id text primary key,
  message_log_channel_id text,
  mute_log_channel_id text,
  unmute_log_channel_id text,
  ban_log_channel_id text,
  kick_log_channel_id text,
  join_log_channel_id text,
  leave_log_channel_id text,
  voice_log_channel_id text,
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

drop trigger if exists set_log_settings_updated_at on public.log_settings;
create trigger set_log_settings_updated_at
before update on public.log_settings
for each row
execute function public.set_updated_at();
