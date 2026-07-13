create table if not exists public.media_only_channels (
  guild_id text not null,
  channel_id text not null,
  added_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, channel_id)
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

drop trigger if exists set_media_only_channels_updated_at on public.media_only_channels;

create trigger set_media_only_channels_updated_at
before update on public.media_only_channels
for each row
execute function public.set_updated_at();
