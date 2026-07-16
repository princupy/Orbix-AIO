create table if not exists public.ticket_settings (
  guild_id text primary key,
  category_id text,
  support_role_id text,
  log_channel_id text,
  panel_title text not null default '🎫 Support Tickets',
  panel_description text not null default 'Need help? Click the button below to open a private support ticket. Our team will assist you shortly.',
  ticket_counter integer not null default 0,
  max_open integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ticket_max_open_check check (max_open between 1 and 20)
);

create table if not exists public.tickets (
  channel_id text primary key,
  guild_id text not null,
  opener_id text not null,
  claimed_by text,
  ticket_number integer,
  created_at timestamptz not null default now()
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

drop trigger if exists set_ticket_settings_updated_at on public.ticket_settings;
create trigger set_ticket_settings_updated_at
before update on public.ticket_settings
for each row
execute function public.set_updated_at();

create index if not exists tickets_guild_idx
on public.tickets (guild_id);

create index if not exists tickets_guild_opener_idx
on public.tickets (guild_id, opener_id);
