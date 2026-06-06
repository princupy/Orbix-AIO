create table if not exists public.noprefix_users (
  user_id text primary key,
  added_by text,
  duration_key text not null,
  duration_label text not null,
  expires_at timestamptz,
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

drop trigger if exists set_noprefix_users_updated_at on public.noprefix_users;

create trigger set_noprefix_users_updated_at
before update on public.noprefix_users
for each row
execute function public.set_updated_at();
