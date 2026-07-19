-- Dashboard activity feed: a compact, queryable record of log events the bot
-- emits (message edits/deletes, bans, kicks, mutes, joins/leaves, voice moves).
-- Powers the Logs tab history; live updates arrive over the Socket.io bridge.

create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  guild_id text not null,
  type text not null,
  title text,
  description text,
  target_id text,
  target_tag text,
  moderator_id text,
  moderator_tag text,
  created_at timestamptz not null default now()
);
 
-- Newest-first paging per guild (id is monotonic, so it doubles as a cursor).
create index if not exists activity_logs_guild_id_idx
  on public.activity_logs (guild_id, id desc);

create index if not exists activity_logs_guild_type_idx
  on public.activity_logs (guild_id, type);
