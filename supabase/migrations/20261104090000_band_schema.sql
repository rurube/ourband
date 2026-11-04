-- Phase 2: single-band schema. Apply as the migration owner (postgres).
-- No Auth users, invitation codes or demo records are provisioned here.
begin;

create schema if not exists private;
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;
grant usage on schema public to authenticated, service_role;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 30),
  nickname_normalized text generated always as (lower(btrim(nickname))) stored,
  created_at timestamptz not null default now(),
  constraint profiles_nickname_unique unique (nickname_normalized),
  constraint profiles_id_nickname_unique unique (id, nickname_normalized)
);

create table private.account_mapping (
  auth_user_id uuid primary key references public.profiles(id) on delete cascade,
  internal_login_email text not null unique check (char_length(internal_login_email) <= 254),
  nickname_normalized text not null unique,
  created_at timestamptz not null default now(),
  constraint account_mapping_nickname_fk foreign key (auth_user_id, nickname_normalized)
    references public.profiles(id, nickname_normalized) on update cascade on delete cascade
);

create table public.songs (
  -- text preserves legacy Google Sheets IDs during the later import phase.
  id text primary key default gen_random_uuid()::text check (char_length(id) between 1 and 200),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  artist text not null check (char_length(btrim(artist)) between 1 and 200),
  bpm smallint check (bpm between 1 and 400),
  vocal_type text not null check (vocal_type in ('female', 'male', 'mixed', 'instrumental')),
  youtube_url text check (youtube_url is null or (
    char_length(youtube_url) <= 2048 and youtube_url ~
    '^https://((www\.|m\.)?youtube\.com/(watch\?v=[A-Za-z0-9_-]{11}(&[^[:space:]]*)?|(shorts|embed)/[A-Za-z0-9_-]{11}(\?[^[:space:]]*)?)|youtu\.be/[A-Za-z0-9_-]{11}(\?[^[:space:]]*)?)$'
  )),
  notes text not null default '' check (char_length(notes) <= 3000),
  is_confirmed boolean not null default false,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index songs_title_artist_unique on public.songs (lower(btrim(title)), lower(btrim(artist)));
create index songs_created_at_idx on public.songs (created_at desc, id);
create index songs_confirmed_vocal_idx on public.songs (is_confirmed, vocal_type, created_at desc);
create index songs_title_search_idx on public.songs using gin (title extensions.gin_trgm_ops);
create index songs_artist_search_idx on public.songs using gin (artist extensions.gin_trgm_ops);
create index songs_created_by_idx on public.songs (created_by);

create table private.votes (
  song_id text not null references public.songs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vote_type smallint not null check (vote_type in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (song_id, user_id)
);
create index votes_user_id_idx on private.votes (user_id);

create table private.comments (
  id uuid primary key default gen_random_uuid(),
  song_id text not null references public.songs(id) on delete cascade,
  user_id uuid default auth.uid() references public.profiles(id) on delete set null,
  content text not null check (char_length(btrim(content)) between 1 and 300),
  created_at timestamptz not null default now()
);
create index comments_song_created_idx on private.comments (song_id, created_at, id);
create index comments_user_id_idx on private.comments (user_id);

create table public.rehearsals (
  id uuid primary key default gen_random_uuid(),
  rehearsal_date date not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rehearsal_songs (
  id uuid primary key default gen_random_uuid(),
  rehearsal_id uuid not null references public.rehearsals(id) on delete cascade,
  song_id text not null references public.songs(id) on delete restrict,
  sort_order integer not null default 0 check (sort_order >= 0),
  notes text not null default '' check (char_length(notes) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rehearsal_id, song_id)
);
create index rehearsal_songs_song_idx on public.rehearsal_songs (song_id, rehearsal_id);
create index rehearsal_songs_order_idx on public.rehearsal_songs (rehearsal_id, sort_order, id);

create table public.rehearsal_sessions (
  id uuid primary key default gen_random_uuid(),
  rehearsal_song_id uuid not null references public.rehearsal_songs(id) on delete cascade,
  session_type text not null check (session_type in ('vocal','guitar1','guitar2','bass','drums','keyboard','other')),
  member_id uuid references public.profiles(id) on delete set null,
  nickname_snapshot text not null check (char_length(btrim(nickname_snapshot)) between 1 and 30),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rehearsal_sessions_song_order_idx on public.rehearsal_sessions (rehearsal_song_id, session_type, sort_order, id);
create index rehearsal_sessions_member_idx on public.rehearsal_sessions (member_id);
create unique index rehearsal_sessions_member_unique on public.rehearsal_sessions (rehearsal_song_id, session_type, member_id) where member_id is not null;
-- Guest names need not be unique: a deleted member becomes a guest snapshot,
-- and that transition must not fail if an identical guest name already exists.

-- Assigned members always use their actual nickname at the time of saving.
create function private.capture_session_nickname() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.member_id is not null then
    select nickname into new.nickname_snapshot from public.profiles where id = new.member_id;
    if not found then
      raise exception 'Unknown member' using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.capture_session_nickname() from public, anon, authenticated;
create trigger capture_session_nickname before insert or update on public.rehearsal_sessions
  for each row execute function private.capture_session_nickname();

-- This helper deliberately reads profiles as its owner to avoid recursive RLS.
create function private.is_band_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()));
$$;
revoke all on function private.is_band_member() from public, anon, authenticated;
grant execute on function private.is_band_member() to authenticated;

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.touch_updated_at() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['songs','rehearsals','rehearsal_songs','rehearsal_sessions'] loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()', t);
  end loop;
end;
$$;
create trigger touch_updated_at before update on private.votes for each row execute function private.touch_updated_at();

-- Supabase defaults may grant broad table privileges: revoke before narrow grants.
revoke all on public.profiles, public.songs, public.rehearsals, public.rehearsal_songs,
  public.rehearsal_sessions, private.votes, private.comments, private.account_mapping
  from public, anon, authenticated;

grant select on public.profiles, public.songs, public.rehearsals, public.rehearsal_songs, public.rehearsal_sessions to authenticated;
grant insert (title, artist, bpm, vocal_type, youtube_url, notes, is_confirmed),
  update (title, artist, bpm, vocal_type, youtube_url, notes, is_confirmed) on public.songs to authenticated;
grant insert (rehearsal_date), update (rehearsal_date), delete on public.rehearsals to authenticated;
grant insert (rehearsal_id, song_id, sort_order, notes), update (song_id, sort_order, notes), delete on public.rehearsal_songs to authenticated;
grant insert (rehearsal_song_id, session_type, member_id, nickname_snapshot, sort_order),
  update (session_type, member_id, nickname_snapshot, sort_order), delete on public.rehearsal_sessions to authenticated;
grant all on public.profiles, public.songs, public.rehearsals, public.rehearsal_songs,
  public.rehearsal_sessions, private.votes, private.comments, private.account_mapping to service_role;

alter table public.profiles enable row level security;
alter table public.songs enable row level security;
alter table public.rehearsals enable row level security;
alter table public.rehearsal_songs enable row level security;
alter table public.rehearsal_sessions enable row level security;
alter table private.votes enable row level security;
alter table private.comments enable row level security;
alter table private.account_mapping enable row level security;

create policy members_read_profiles on public.profiles for select to authenticated using ((select private.is_band_member()));
create policy members_read_songs on public.songs for select to authenticated using ((select private.is_band_member()));
create policy members_add_songs on public.songs for insert to authenticated with check ((select private.is_band_member()) and created_by = (select auth.uid()));
create policy members_edit_songs on public.songs for update to authenticated using ((select private.is_band_member())) with check ((select private.is_band_member()));

do $$
declare t text;
begin
  foreach t in array array['rehearsals','rehearsal_songs','rehearsal_sessions'] loop
    execute format('create policy members_manage on public.%I for all to authenticated using ((select private.is_band_member())) with check ((select private.is_band_member()))', t);
  end loop;
end;
$$;
-- Defense in depth: private tables have NO client grants, even for their own rows.
create policy own_votes on private.votes for all to authenticated
  using ((select private.is_band_member()) and user_id = (select auth.uid()))
  with check ((select private.is_band_member()) and user_id = (select auth.uid()));
create policy own_comments on private.comments for insert to authenticated
  with check ((select private.is_band_member()) and user_id = (select auth.uid()));
-- account_mapping deliberately has no end-user policy.
commit;
