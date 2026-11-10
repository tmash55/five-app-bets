-- UNJ-1418: streaks and push notifications.
-- Apply with `npx supabase db push` from this app's folder once it has a project.

-- One streak per user. The app keeps a local copy and writes the newer one here,
-- so a reinstall or a second device keeps the streak.
create table if not exists public.user_streaks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_streaks enable row level security;

create policy "Users read their own streak"
  on public.user_streaks for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert their own streak"
  on public.user_streaks for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own streak"
  on public.user_streaks for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Expo push tokens, one row per device. A device that signs in to another
-- account moves its row to that account (upsert on token).
create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_id_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

create policy "Users read their own push tokens"
  on public.push_tokens for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Devices register through this function rather than a table policy, so a
-- token can move to the account now signed in on that device without letting
-- users update each other's rows.
create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

create policy "Users remove their own push tokens"
  on public.push_tokens for delete
  to authenticated
  using ((select auth.uid()) = user_id);
