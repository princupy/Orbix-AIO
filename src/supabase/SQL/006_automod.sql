create table if not exists public.automod_settings (
  guild_id text primary key,
  enabled boolean not null default false,
  log_channel_id text,
  mute_duration_seconds integer not null default 600,

  invite_enabled boolean not null default false,
  invite_action text not null default 'delete',

  link_enabled boolean not null default false,
  link_action text not null default 'delete',

  spam_enabled boolean not null default false,
  spam_action text not null default 'mute',
  spam_message_count integer not null default 5,
  spam_interval_seconds integer not null default 5,

  mention_enabled boolean not null default false,
  mention_action text not null default 'delete',
  mention_limit integer not null default 5,

  caps_enabled boolean not null default false,
  caps_action text not null default 'delete',
  caps_percentage integer not null default 70,
  caps_min_length integer not null default 10,

  emoji_enabled boolean not null default false,
  emoji_action text not null default 'delete',
  emoji_limit integer not null default 8,

  duplicate_enabled boolean not null default false,
  duplicate_action text not null default 'delete',
  duplicate_limit integer not null default 3,

  badword_enabled boolean not null default false,
  badword_action text not null default 'delete',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint automod_invite_action_check check (invite_action in ('delete', 'warn', 'mute', 'kick', 'ban')),
  constraint automod_link_action_check check (link_action in ('delete', 'warn', 'mute', 'kick', 'ban')),
  constraint automod_spam_action_check check (spam_action in ('delete', 'warn', 'mute', 'kick', 'ban')),
  constraint automod_mention_action_check check (mention_action in ('delete', 'warn', 'mute', 'kick', 'ban')),
  constraint automod_caps_action_check check (caps_action in ('delete', 'warn', 'mute', 'kick', 'ban')),
  constraint automod_emoji_action_check check (emoji_action in ('delete', 'warn', 'mute', 'kick', 'ban')),
  constraint automod_duplicate_action_check check (duplicate_action in ('delete', 'warn', 'mute', 'kick', 'ban')),
  constraint automod_badword_action_check check (badword_action in ('delete', 'warn', 'mute', 'kick', 'ban'))
);

create table if not exists public.automod_badwords (
  guild_id text not null,
  word text not null,
  added_by text,
  created_at timestamptz not null default now(),
  primary key (guild_id, word),
  constraint automod_badwords_word_check check (char_length(word) between 1 and 64)
);

create table if not exists public.automod_exempt (
  guild_id text not null,
  type text not null check (type in ('role', 'channel')),
  target_id text not null,
  added_by text,
  created_at timestamptz not null default now(),
  primary key (guild_id, type, target_id)
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

drop trigger if exists set_automod_settings_updated_at on public.automod_settings;
create trigger set_automod_settings_updated_at
before update on public.automod_settings
for each row
execute function public.set_updated_at();

create index if not exists automod_badwords_guild_idx
on public.automod_badwords (guild_id);

create index if not exists automod_exempt_guild_type_idx
on public.automod_exempt (guild_id, type);
