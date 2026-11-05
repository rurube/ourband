begin;
create schema if not exists extensions;

create table public.bands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);
alter table public.bands enable row level security;
revoke all on public.bands from public, anon, authenticated;
grant select on public.bands to authenticated;
grant all on public.bands to service_role;

alter table public.profiles add column band_id uuid references public.bands(id) on delete restrict;
alter table public.profiles add column band_role text not null default 'member' check (band_role in ('leader','member'));
alter table public.songs add column band_id uuid references public.bands(id) on delete restrict;
alter table public.rehearsals add column band_id uuid references public.bands(id) on delete restrict;
-- Preserve any pre-existing single-band data without guessing a leader.
do $$
declare legacy uuid;
begin
  if exists(select 1 from public.profiles) or exists(select 1 from public.songs) or exists(select 1 from public.rehearsals) then
    insert into public.bands(name) values ('기존 밴드') returning id into legacy;
    update public.profiles set band_id=legacy;
    update public.songs set band_id=legacy;
    update public.rehearsals set band_id=legacy;
  end if;
end;
$$;
alter table public.profiles alter column band_id set not null;
alter table public.songs alter column band_id set not null;
alter table public.rehearsals alter column band_id set not null;
create index profiles_band_idx on public.profiles(band_id);
create index songs_band_idx on public.songs(band_id,is_confirmed,vocal_type,created_at desc);
create index rehearsals_band_date_idx on public.rehearsals(band_id,rehearsal_date);
drop index public.songs_title_artist_unique;
create unique index songs_title_artist_unique on public.songs(band_id,lower(btrim(title)),lower(btrim(artist)));
alter table public.rehearsals drop constraint rehearsals_rehearsal_date_key;
alter table public.rehearsals add constraint rehearsals_band_date_unique unique(band_id,rehearsal_date);
alter table private.account_mapping add column recovery_hash text;

create function private.current_band_id() returns uuid language sql stable security definer set search_path='' as $$
  select band_id from public.profiles where id=(select auth.uid());
$$;
revoke all on function private.current_band_id() from public,anon,authenticated;
grant execute on function private.current_band_id() to authenticated;
alter table public.songs alter column band_id set default private.current_band_id();
alter table public.rehearsals alter column band_id set default private.current_band_id();

create policy members_read_band on public.bands for select to authenticated using(id=(select private.current_band_id()));
drop policy members_read_profiles on public.profiles;
create policy members_read_profiles on public.profiles for select to authenticated using(band_id=(select private.current_band_id()));
drop policy members_read_songs on public.songs;
drop policy members_add_songs on public.songs;
drop policy members_edit_songs on public.songs;
create policy members_read_songs on public.songs for select to authenticated using(band_id=(select private.current_band_id()));
create policy members_add_songs on public.songs for insert to authenticated with check(band_id=(select private.current_band_id()) and created_by=(select auth.uid()));
create policy members_edit_songs on public.songs for update to authenticated using(band_id=(select private.current_band_id())) with check(band_id=(select private.current_band_id()));
drop policy members_manage on public.rehearsals;
create policy members_manage on public.rehearsals for all to authenticated using(band_id=(select private.current_band_id())) with check(band_id=(select private.current_band_id()));
drop policy members_manage on public.rehearsal_songs;
create policy members_manage on public.rehearsal_songs for all to authenticated
 using(exists(select 1 from public.rehearsals r where r.id=rehearsal_id and r.band_id=(select private.current_band_id())))
 with check(exists(select 1 from public.rehearsals r join public.songs s on s.id=song_id where r.id=rehearsal_id and r.band_id=s.band_id and r.band_id=(select private.current_band_id())));
drop policy members_manage on public.rehearsal_sessions;
create policy members_manage on public.rehearsal_sessions for all to authenticated
 using(exists(select 1 from public.rehearsal_songs rs join public.rehearsals r on r.id=rs.rehearsal_id where rs.id=rehearsal_song_id and r.band_id=(select private.current_band_id())))
 with check(exists(select 1 from public.rehearsal_songs rs join public.rehearsals r on r.id=rs.rehearsal_id where rs.id=rehearsal_song_id and r.band_id=(select private.current_band_id()))
 and (member_id is null or exists(select 1 from public.profiles p where p.id=member_id and p.band_id=(select private.current_band_id()))));

-- Constraint triggers also protect service imports and avoid cross-band nicknames
-- leaking through a trigger executing before the RLS WITH CHECK expression.
create function private.check_rehearsal_song_band() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.rehearsals r join public.songs s on s.band_id=r.band_id where r.id=new.rehearsal_id and s.id=new.song_id) then
   raise exception 'Invalid band relation' using errcode='23514';
 end if;
 return new;
end; $$;
revoke all on function private.check_rehearsal_song_band() from public,anon,authenticated;
create trigger check_band before insert or update on public.rehearsal_songs for each row execute function private.check_rehearsal_song_band();
create or replace function private.capture_session_nickname() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.member_id is not null then
   select p.nickname into new.nickname_snapshot from public.profiles p
    join public.rehearsals r on r.band_id=p.band_id join public.rehearsal_songs rs on rs.rehearsal_id=r.id
    where p.id=new.member_id and rs.id=new.rehearsal_song_id;
   if not found then raise exception 'Invalid band relation' using errcode='23514'; end if;
 end if;
 return new;
end; $$;

create table private.band_invites (
 band_id uuid primary key references public.bands(id) on delete cascade,
 code_hash text not null unique check(length(code_hash)=64),
 expires_at timestamptz not null,
 updated_at timestamptz not null default now()
);
create table private.auth_rate_limits (
 bucket text primary key check(length(bucket)=64),
 attempts integer not null check(attempts>0),
 expires_at timestamptz not null
);
create index auth_rate_limits_expiry_idx on private.auth_rate_limits(expires_at);
alter table private.band_invites enable row level security;
alter table private.auth_rate_limits enable row level security;
revoke all on private.band_invites,private.auth_rate_limits from public,anon,authenticated;
grant all on private.band_invites,private.auth_rate_limits to service_role;

-- Atomic fixed-window limits, called only by the Edge Function's service role.
create function public.auth_take_attempt(p_bucket text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare used integer;
begin
 if length(p_bucket)<>64 or p_limit not between 1 and 1000 or p_seconds not between 1 and 86400 then raise exception 'Invalid limit'; end if;
 delete from private.auth_rate_limits where bucket in(select bucket from private.auth_rate_limits where expires_at<now() limit 100);
 insert into private.auth_rate_limits as l(bucket,attempts,expires_at) values(p_bucket,1,now()+make_interval(secs=>p_seconds))
 on conflict(bucket) do update set attempts=case when l.expires_at<=now() then 1 else l.attempts+1 end,
 expires_at=case when l.expires_at<=now() then now()+make_interval(secs=>p_seconds) else l.expires_at end
 returning attempts into used;
 return used<=p_limit;
end; $$;

create function public.auth_lookup(p_nickname text)
returns table(user_id uuid,internal_email text,band_id uuid,band_role text,recovery_hash text)
language sql stable security definer set search_path='' as $$
 select p.id,m.internal_login_email,p.band_id,p.band_role,m.recovery_hash from public.profiles p
 join private.account_mapping m on m.auth_user_id=p.id where p.nickname_normalized=lower(btrim(p_nickname));
$$;
create function public.auth_invite_band(p_hash text) returns uuid
language sql stable security definer set search_path='' as $$
 select band_id from private.band_invites where code_hash=p_hash and expires_at>now();
$$;
-- Auth creation is outside Postgres; provisioning is atomic here. Edge removes
-- the newly created Auth user if provisioning fails. No client-supplied role.
create function public.auth_provision(p_user_id uuid,p_email text,p_nickname text,p_band_name text,p_invite_hash text,p_recovery_hash text,p_code_hash text)
returns uuid language plpgsql security definer set search_path='' as $$
declare b uuid; role_name text;
begin
 if p_band_name is not null then
   if p_invite_hash is not null or p_recovery_hash is null or length(p_recovery_hash)<>64 or p_code_hash is null or length(p_code_hash)<>64 then raise exception 'Invalid registration'; end if;
   insert into public.bands(name) values(btrim(p_band_name)) returning id into b;
   role_name:='leader';
   insert into private.band_invites(band_id,code_hash,expires_at) values(b,p_code_hash,now()+interval '30 days');
 else
   select band_id into b from private.band_invites where code_hash=p_invite_hash and expires_at>now() for share;
   if b is null then raise exception 'Invalid registration' using errcode='22023'; end if;
   role_name:='member';
 end if;
 insert into public.profiles(id,nickname,band_id,band_role) values(p_user_id,btrim(p_nickname),b,role_name);
 insert into private.account_mapping(auth_user_id,internal_login_email,nickname_normalized,recovery_hash)
   select id,p_email,nickname_normalized,case when role_name='leader' then p_recovery_hash else null end from public.profiles where id=p_user_id;
 return b;
end; $$;
create function public.auth_rotate_invite(p_actor uuid,p_hash text) returns void
language plpgsql security definer set search_path='' as $$
declare b uuid;
begin
 select band_id into b from public.profiles where id=p_actor and band_role='leader';
 if b is null then raise exception 'Leader required' using errcode='42501'; end if;
 insert into private.band_invites(band_id,code_hash,expires_at) values(b,p_hash,now()+interval '30 days')
 on conflict(band_id) do update set code_hash=excluded.code_hash,expires_at=excluded.expires_at,updated_at=now();
end; $$;
create function public.auth_rotate_recovery(p_actor uuid,p_hash text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_hash is null or length(p_hash)<>64 then raise exception 'Invalid recovery hash'; end if;
 update private.account_mapping m set recovery_hash=p_hash where m.auth_user_id=p_actor
 and exists(select 1 from public.profiles p where p.id=p_actor and p.band_role='leader');
 if not found then raise exception 'Leader required' using errcode='42501'; end if;
end; $$;
create function public.auth_reset_target(p_actor uuid,p_target uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare email text;
begin
 select m.internal_login_email into email from public.profiles a join public.profiles t on t.band_id=a.band_id
 join private.account_mapping m on m.auth_user_id=t.id
 where a.id=p_actor and a.band_role='leader' and t.id=p_target and t.band_role='member';
 if email is null then raise exception 'Not permitted' using errcode='42501'; end if;
 return email;
end; $$;

create function public.auth_replace_recovery(p_user uuid,p_expected text,p_next text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_next is null or length(p_next)<>64 then raise exception 'Invalid recovery hash'; end if;
 update private.account_mapping m set recovery_hash=p_next where m.auth_user_id=p_user and m.recovery_hash=p_expected
   and exists(select 1 from public.profiles p where p.id=p_user and p.band_role='leader');
 return found;
end; $$;

drop policy own_votes on private.votes;
create policy own_votes on private.votes for all to authenticated
 using(user_id=(select auth.uid()) and exists(select 1 from public.songs s where s.id=song_id and s.band_id=(select private.current_band_id())))
 with check(user_id=(select auth.uid()) and exists(select 1 from public.songs s where s.id=song_id and s.band_id=(select private.current_band_id())));
drop policy own_comments on private.comments;
create policy own_comments on private.comments for insert to authenticated
 with check(user_id=(select auth.uid()) and exists(select 1 from public.songs s where s.id=song_id and s.band_id=(select private.current_band_id())));

-- Every server RPC is denied to both browser roles, including logged-in leaders.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('auth_take_attempt','auth_lookup','auth_invite_band','auth_provision','auth_rotate_invite','auth_reset_target','auth_replace_recovery','auth_rotate_recovery') loop
   execute format('revoke all on function %s from public,anon,authenticated',f.signature);
   execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end; $$;
commit;
