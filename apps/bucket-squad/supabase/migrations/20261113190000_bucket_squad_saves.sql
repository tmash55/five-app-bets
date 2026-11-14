-- Bucket Squad: the whole game save, kept in a signed-in grown-up's account.
--
-- One row per account. The app reads it when it starts and after sign-in, and
-- writes it a few seconds after the game changes. `rev` makes every write
-- conditional ("update ... where rev = the rev I last saw"), so two devices
-- never overwrite each other without noticing; the trigger below makes the
-- database insist on it too.
--
-- Nothing about the person is stored here: no name, no email. The account
-- itself lives in auth.users and deleting it removes this row (on delete cascade).

create table public.bucket_squad_saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- the save exactly as the app keeps it on the device (src/state/logic.ts SaveData)
  data jsonb not null,
  -- SaveData.version when it was written, so a later app can tell old saves apart
  schema_version integer not null default 1,
  -- goes up by one on every write
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  -- which kind of device wrote it last ("ios", "android", "web"); never a device name
  device text,
  -- the copy that lost when a grown-up chose between two saved games, kept in case it is wanted back
  backup jsonb,
  constraint bucket_squad_saves_data_object check (jsonb_typeof(data) = 'object'),
  constraint bucket_squad_saves_data_size check (pg_column_size(data) <= 1048576),
  constraint bucket_squad_saves_backup_object check (backup is null or jsonb_typeof(backup) = 'object'),
  constraint bucket_squad_saves_backup_size check (backup is null or pg_column_size(backup) <= 1048576),
  constraint bucket_squad_saves_schema_version_positive check (schema_version >= 1),
  constraint bucket_squad_saves_rev_positive check (rev >= 1),
  constraint bucket_squad_saves_device_short check (device is null or char_length(device) <= 32)
);

comment on table public.bucket_squad_saves is
  'Bucket Squad: one game save per account (players, coins, packs, uniforms, squad, tour, ladder, missions, shop, settings). Written only by the signed-in owner of the row; rev must go up by one on every update. No name or email is stored here.';
comment on column public.bucket_squad_saves.data is 'The save as the app keeps it on the device (SaveData). The app repairs it when it reads it.';
comment on column public.bucket_squad_saves.rev is 'Optimistic concurrency: 1 on insert, old rev + 1 on every update. The app updates with "where rev = <last rev it saw>".';
comment on column public.bucket_squad_saves.backup is 'The save that lost when a grown-up picked between this device''s game and the saved game.';
comment on column public.bucket_squad_saves.device is 'The platform that wrote the save last (ios, android or web). Never a device name.';

-- the rev rule and the time of the last write, enforced by the database
create function public.bucket_squad_saves_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.rev <> 1 then
      raise exception 'bucket_squad_saves: a new save starts at rev 1' using errcode = 'check_violation';
    end if;
  else
    if new.user_id <> old.user_id then
      raise exception 'bucket_squad_saves: a save cannot change owner' using errcode = 'check_violation';
    end if;
    if new.rev <> old.rev + 1 then
      raise exception 'bucket_squad_saves: rev must go up by one' using errcode = 'check_violation';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.bucket_squad_saves_before_write() is 'Bucket Squad: keeps rev going up by one and stamps updated_at.';

create trigger bucket_squad_saves_before_write
  before insert or update on public.bucket_squad_saves
  for each row execute function public.bucket_squad_saves_before_write();

-- the trigger function is only ever run by the trigger
revoke execute on function public.bucket_squad_saves_before_write() from public, anon, authenticated;

alter table public.bucket_squad_saves enable row level security;

-- signed-out visitors get nothing; a signed-in person sees and changes only their own row
revoke all on table public.bucket_squad_saves from anon;
grant select, insert, update, delete on table public.bucket_squad_saves to authenticated;

create policy "Bucket Squad: read own save"
  on public.bucket_squad_saves for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Bucket Squad: create own save"
  on public.bucket_squad_saves for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Bucket Squad: update own save"
  on public.bucket_squad_saves for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Bucket Squad: delete own save"
  on public.bucket_squad_saves for delete
  to authenticated
  using ((select auth.uid()) = user_id);
