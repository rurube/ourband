begin;
-- Preserve Auth UUIDs, internal email/PIN hashes, songs, votes and history.
create table public.band_memberships (
 band_id uuid not null references public.bands(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 nickname text not null check(char_length(btrim(nickname)) between 1 and 30),
 nickname_normalized text generated always as(lower(btrim(nickname))) stored,
 band_role text not null check(band_role in ('leader','member')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(band_id,user_id),
 unique(band_id,nickname_normalized)
);
create index band_memberships_user_idx on public.band_memberships(user_id,created_at,band_id);
insert into public.band_memberships(band_id,user_id,nickname,band_role,created_at)
 select band_id,id,nickname,band_role,created_at from public.profiles;
create trigger touch_updated_at before update on public.band_memberships for each row execute function private.touch_updated_at();
alter table public.band_memberships enable row level security;
revoke all on public.band_memberships from public,anon,authenticated;
grant select on public.band_memberships to authenticated;
grant all on public.band_memberships to service_role;

create or replace function private.current_band_id() returns uuid language plpgsql stable security definer set search_path='' as $$
declare raw text; requested uuid; available uuid[];
begin
 raw:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-band-id';
 if raw is not null then
  begin requested:=raw::uuid; exception when invalid_text_representation then return null; end;
  return (select m.band_id from public.band_memberships m where m.user_id=(select auth.uid()) and m.band_id=requested);
 end if;
 -- Old single-band clients remain safe; ambiguous requests fail closed.
 select array_agg(m.band_id) into available from public.band_memberships m where m.user_id=(select auth.uid());
 if cardinality(available)=1 then return available[1]; end if;
 return null;
exception when invalid_text_representation then return null;
end; $$;
create function private.has_band_membership(p_band_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.band_memberships where user_id=(select auth.uid()) and band_id=p_band_id);
$$;
revoke all on function private.has_band_membership(uuid) from public,anon,authenticated;
grant execute on function private.has_band_membership(uuid) to authenticated;
create or replace function private.is_band_member() returns boolean language sql stable security definer set search_path='' as $$
 select private.current_band_id() is not null;
$$;
create or replace function private.require_band_member() returns uuid language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or private.current_band_id() is null then raise exception 'Band membership required' using errcode='42501'; end if;
 return auth.uid();
end; $$;
create policy members_read_memberships on public.band_memberships for select to authenticated
 using(user_id=(select auth.uid()) or band_id=(select private.current_band_id()));
drop policy members_read_band on public.bands;
create policy members_read_band on public.bands for select to authenticated using(private.has_band_membership(id));
drop policy members_read_profiles on public.profiles;
create policy own_account_profile on public.profiles for select to authenticated using(id=(select auth.uid()));
drop policy members_manage on public.rehearsal_sessions;
create policy members_manage on public.rehearsal_sessions for all to authenticated
 using(exists(select 1 from public.rehearsal_songs rs join public.rehearsals r on r.id=rs.rehearsal_id where rs.id=rehearsal_song_id and r.band_id=(select private.current_band_id())))
 with check(exists(select 1 from public.rehearsal_songs rs join public.rehearsals r on r.id=rs.rehearsal_id where rs.id=rehearsal_song_id and r.band_id=(select private.current_band_id()))
 and (member_id is null or exists(select 1 from public.band_memberships m where m.user_id=member_id and m.band_id=(select private.current_band_id()))));
create or replace function private.capture_session_nickname() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.member_id is not null then
  select m.nickname into new.nickname_snapshot from public.band_memberships m
   join public.rehearsals r on r.band_id=m.band_id join public.rehearsal_songs rs on rs.rehearsal_id=r.id
   where m.user_id=new.member_id and rs.id=new.rehearsal_song_id;
  if not found then raise exception 'Invalid band relation' using errcode='23514'; end if;
 end if;
 return new;
end; $$;
-- Revoke obsolete server entry points before removing the old account layout.
drop function public.auth_lookup(text);
drop function public.auth_provision(uuid,text,text,text,text,text,text);
drop function public.auth_rotate_invite(uuid,text);
drop function public.auth_reset_target(uuid,uuid);
drop function public.auth_rotate_recovery(uuid,text);
drop function public.auth_replace_recovery(uuid,text,text);
alter table public.profiles rename column nickname to login_id;
alter table public.profiles rename column nickname_normalized to login_id_normalized;
alter table public.profiles rename constraint profiles_nickname_unique to profiles_login_id_unique;
alter table public.profiles rename constraint profiles_id_nickname_unique to profiles_id_login_unique;
alter table private.account_mapping rename column nickname_normalized to login_id_normalized;
alter table public.profiles drop column band_id;
alter table public.profiles drop column band_role;

create table private.pin_reset_requests (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 band_id uuid not null references public.bands(id) on delete cascade,
 request_id uuid not null unique default gen_random_uuid(),
 expires_at timestamptz not null,
 consumed_at timestamptz,
 created_at timestamptz not null default now(),
 foreign key(band_id,user_id) references public.band_memberships(band_id,user_id) on delete cascade
);
alter table private.pin_reset_requests enable row level security;
revoke all on private.pin_reset_requests from public,anon,authenticated;
grant all on private.pin_reset_requests to service_role;

create function public.set_band_nickname(p_band_id uuid,p_nickname text) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.band_memberships set nickname=btrim(p_nickname) where band_id=p_band_id and user_id=(select auth.uid());
 if not found then raise exception 'Membership required' using errcode='42501'; end if;
end; $$;
create function public.request_member_pin_reset(p_band_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.band_memberships where band_id=p_band_id and user_id=(select auth.uid()) and band_role='member') then
  raise exception 'Member required' using errcode='42501';
 end if;
 insert into private.pin_reset_requests(user_id,band_id,expires_at) values(auth.uid(),p_band_id,now()+interval '15 minutes')
 on conflict(user_id) do update set band_id=excluded.band_id,request_id=gen_random_uuid(),expires_at=excluded.expires_at,consumed_at=null,created_at=now();
end; $$;
create function public.cancel_member_pin_reset() returns void language sql security definer set search_path='' as $$
 delete from private.pin_reset_requests where user_id=(select auth.uid());
$$;
create function public.get_member_reset_requests(p_band_id uuid) returns table(user_id uuid,expires_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.band_memberships m where m.user_id=(select auth.uid()) and m.band_id=p_band_id and m.band_role='leader') then raise exception 'Leader required' using errcode='42501'; end if;
 return query select r.user_id,r.expires_at from private.pin_reset_requests r where r.band_id=p_band_id and r.expires_at>now() and r.consumed_at is null;
end; $$;
revoke all on function public.set_band_nickname(uuid,text),public.request_member_pin_reset(uuid),public.cancel_member_pin_reset(),public.get_member_reset_requests(uuid) from public,anon,authenticated;
grant execute on function public.set_band_nickname(uuid,text),public.request_member_pin_reset(uuid),public.cancel_member_pin_reset(),public.get_member_reset_requests(uuid) to authenticated;

create function public.auth_account_lookup(p_login_id text) returns table(user_id uuid,internal_email text,recovery_hash text)
language sql stable security definer set search_path='' as $$
 select p.id,m.internal_login_email,m.recovery_hash from public.profiles p join private.account_mapping m on m.auth_user_id=p.id
 where p.login_id_normalized=lower(btrim(p_login_id));
$$;
create function public.auth_account_by_user(p_user uuid) returns table(internal_email text,recovery_hash text)
language sql stable security definer set search_path='' as $$
 select internal_login_email,recovery_hash from private.account_mapping where auth_user_id=p_user;
$$;
create function public.auth_add_membership(p_user uuid,p_nickname text,p_band_name text,p_invite_hash text,p_code_hash text)
returns uuid language plpgsql security definer set search_path='' as $$
declare b uuid; role_name text;
begin
 if not exists(select 1 from public.profiles where id=p_user) then raise exception 'Account required' using errcode='42501'; end if;
 if p_band_name is not null then
  if p_invite_hash is not null or p_code_hash is null or length(p_code_hash)<>64 then raise exception 'Invalid registration'; end if;
  insert into public.bands(name) values(btrim(p_band_name)) returning id into b;
  role_name:='leader';
  insert into private.band_invites(band_id,code_hash,expires_at) values(b,p_code_hash,now()+interval '30 days');
 else
  select band_id into b from private.band_invites where code_hash=p_invite_hash and expires_at>now() for share;
  if b is null then raise exception 'Invalid invitation' using errcode='22023'; end if;
  role_name:='member';
 end if;
 insert into public.band_memberships(band_id,user_id,nickname,band_role) values(b,p_user,btrim(p_nickname),role_name);
 return b;
end; $$;
create function public.auth_signup(p_user uuid,p_email text,p_login_id text,p_nickname text,p_band_name text,p_invite_hash text,p_recovery_hash text,p_code_hash text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if p_login_id is null or p_login_id !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{3,29}$' or p_recovery_hash is null or length(p_recovery_hash)<>64 then raise exception 'Invalid account'; end if;
 insert into public.profiles(id,login_id) values(p_user,btrim(p_login_id));
 insert into private.account_mapping(auth_user_id,internal_login_email,login_id_normalized,recovery_hash)
 values(p_user,p_email,lower(btrim(p_login_id)),p_recovery_hash);
 return public.auth_add_membership(p_user,p_nickname,p_band_name,p_invite_hash,p_code_hash);
end; $$;
create function public.auth_update_login_id(p_user uuid,p_login_id text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_login_id is null or p_login_id !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{3,29}$' then raise exception 'Invalid account ID' using errcode='22023'; end if;
 update public.profiles set login_id=btrim(p_login_id) where id=p_user;
 if not found then raise exception 'Account required' using errcode='42501'; end if;
end; $$;
create function public.auth_invite_rotate(p_actor uuid,p_band_id uuid,p_hash text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.band_memberships where user_id=p_actor and band_id=p_band_id and band_role='leader') then raise exception 'Leader required' using errcode='42501'; end if;
 insert into private.band_invites(band_id,code_hash,expires_at) values(p_band_id,p_hash,now()+interval '30 days')
 on conflict(band_id) do update set code_hash=excluded.code_hash,expires_at=excluded.expires_at,updated_at=now();
end; $$;
create function public.auth_set_recovery(p_actor uuid,p_hash text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_hash is null or length(p_hash)<>64 then raise exception 'Invalid recovery hash'; end if;
 update private.account_mapping set recovery_hash=p_hash where auth_user_id=p_actor;
 if not found then raise exception 'Account required' using errcode='42501'; end if;
end; $$;
create function public.auth_swap_recovery(p_user uuid,p_expected text,p_next text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_next is null or length(p_next)<>64 then raise exception 'Invalid recovery hash'; end if;
 update private.account_mapping set recovery_hash=p_next where auth_user_id=p_user and recovery_hash=p_expected;
 return found;
end; $$;
create function public.auth_claim_member_reset(p_actor uuid,p_band_id uuid,p_target uuid)
returns table(internal_email text,request_id uuid) language plpgsql security definer set search_path='' as $$
declare claimed uuid;
begin
 if not exists(select 1 from public.band_memberships where user_id=p_actor and band_id=p_band_id and band_role='leader')
 or not exists(select 1 from public.band_memberships where user_id=p_target and band_id=p_band_id and band_role='member') then raise exception 'Not permitted' using errcode='42501'; end if;
 update private.pin_reset_requests r set consumed_at=now() where r.user_id=p_target and r.band_id=p_band_id and r.expires_at>now() and r.consumed_at is null returning r.request_id into claimed;
 if claimed is null then raise exception 'Member approval required' using errcode='42501'; end if;
 return query select m.internal_login_email,claimed from private.account_mapping m where m.auth_user_id=p_target;
end; $$;
create function public.auth_release_member_reset(p_target uuid,p_request uuid) returns void language sql security definer set search_path='' as $$
 update private.pin_reset_requests set consumed_at=null where user_id=p_target and request_id=p_request;
$$;
-- All account/auth mutations go through an explicitly verified Edge user JWT.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'auth_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end; $$;
commit;
