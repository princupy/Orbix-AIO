-- Analytics aggregation helpers for the dashboard (read side).
-- Requires 011_dashboard.sql (command_usage, member_snapshots, message_activity).
-- Safe to run multiple times.

-- Latest member/online count per calendar day (UTC) over the last N days.
create or replace function public.member_snapshots_daily(p_guild_id text, p_days integer default 14)
returns table (day date, member_count integer, online_count integer)
language sql
stable
as $$
  select distinct on ((captured_at at time zone 'utc')::date)
    (captured_at at time zone 'utc')::date as day,
    member_count,
    online_count
  from public.member_snapshots
  where guild_id = p_guild_id
    and captured_at >= (now() - make_interval(days => p_days))
  order by (captured_at at time zone 'utc')::date asc, captured_at desc;
$$;

-- Most-used commands over the last N days.
create or replace function public.command_usage_top(p_guild_id text, p_days integer default 7, p_limit integer default 8)
returns table (command text, uses bigint)
language sql
stable
as $$
  select command, count(*) as uses
  from public.command_usage
  where guild_id = p_guild_id
    and created_at >= (now() - make_interval(days => p_days))
  group by command
  order by uses desc, command asc
  limit p_limit;
$$;

-- Command invocations per calendar day (UTC) over the last N days.
create or replace function public.command_usage_daily(p_guild_id text, p_days integer default 14)
returns table (day date, count bigint)
language sql
stable
as $$
  select (created_at at time zone 'utc')::date as day, count(*) as count
  from public.command_usage
  where guild_id = p_guild_id
    and created_at >= (now() - make_interval(days => p_days))
  group by (created_at at time zone 'utc')::date
  order by (created_at at time zone 'utc')::date asc;
$$;
