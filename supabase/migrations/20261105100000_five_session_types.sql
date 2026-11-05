begin;
-- No unidentified instrument is silently reassigned to guitar.
do $$ begin
 if exists(select 1 from public.rehearsal_sessions where session_type='other') then
  raise exception 'Unclassified session assignments require review before conversion';
 end if;
end $$;
-- Preserve a saved nickname when only the session type or order is changed.
create or replace function private.capture_session_nickname() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.member_id is not distinct from old.member_id and new.nickname_snapshot is not distinct from old.nickname_snapshot then return new; end if;
 end if;
 if new.member_id is not null then
  select m.nickname into new.nickname_snapshot from public.band_memberships m
   join public.rehearsals r on r.band_id=m.band_id join public.rehearsal_songs rs on rs.rehearsal_id=r.id
   where m.user_id=new.member_id and rs.id=new.rehearsal_song_id;
  if not found then raise exception 'Invalid band relation' using errcode='23514'; end if;
 end if;
 return new;
end; $$;
-- A member assigned to both old guitar slots becomes one guitarist. Guest
-- snapshots remain separate; matching names do not prove matching people.
with duplicates as (
 select id,row_number() over(partition by rehearsal_song_id,member_id order by case session_type when 'guitar1' then 0 else 1 end,sort_order,id) n
 from public.rehearsal_sessions where session_type in ('guitar1','guitar2') and member_id is not null
) delete from public.rehearsal_sessions s using duplicates d where s.id=d.id and d.n>1;
alter table public.rehearsal_sessions drop constraint rehearsal_sessions_session_type_check;
update public.rehearsal_sessions set session_type='guitar' where session_type in ('guitar1','guitar2');
alter table public.rehearsal_sessions add constraint rehearsal_sessions_session_type_check check(session_type in ('vocal','guitar','bass','drums','keyboard'));

alter table public.band_memberships drop constraint band_member_sessions_valid;
with converted as (
 select band_id,user_id,
  array(select allowed from unnest(array['vocal','guitar','bass','drums','keyboard']) allowed
   where allowed=any(array(select case when old_type in ('guitar1','guitar2') then 'guitar' else old_type end from unnest(m.available_sessions) old_type where old_type<>'other'))) available,
  case when main_session in ('guitar1','guitar2') then 'guitar' when main_session='other' then null else main_session end main
 from public.band_memberships m
), desired as (
 select *,case when main=any(available) then main else available[1] end as final_main from converted
)
update public.band_memberships m set available_sessions=d.available,main_session=d.final_main from desired d
 where m.band_id=d.band_id and m.user_id=d.user_id and (m.available_sessions,m.main_session) is distinct from (d.available,d.final_main);
create or replace function private.valid_member_sessions(p_available text[],p_main text)
returns boolean language sql immutable set search_path='' as $$
 select p_available is not null
 and coalesce(array_ndims(p_available),1)=1
 and not exists(select 1 from unnest(p_available) s where s is null or s not in ('vocal','guitar','bass','drums','keyboard'))
 and cardinality(p_available)=(select count(distinct s) from unnest(p_available) s)
 and ((cardinality(p_available)=0 and p_main is null) or (cardinality(p_available)>0 and p_main is not null and p_main=any(p_available)));
$$;
alter table public.band_memberships add constraint band_member_sessions_valid check(private.valid_member_sessions(available_sessions,main_session));
create or replace function public.set_my_band_sessions(p_band_id uuid,p_available text[],p_main text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); canonical text[];
begin
 if actor is null or not exists(select 1 from public.band_memberships where band_id=p_band_id and user_id=actor) then
  raise exception 'Band membership required' using errcode='42501';
 end if;
 if private.valid_member_sessions(p_available,p_main) is distinct from true then
  raise exception 'Choose valid sessions and exactly one main position' using errcode='22023';
 end if;
 select coalesce(array_agg(s order by n),'{}') into canonical from unnest(array['vocal','guitar','bass','drums','keyboard']) with ordinality as options(s,n) where s=any(p_available);
 update public.band_memberships set available_sessions=canonical,main_session=p_main where band_id=p_band_id and user_id=actor;
 if not found then raise exception 'Band membership required' using errcode='42501'; end if;
end; $$;
create or replace function public.save_rehearsal(p_date date,p_tracks jsonb,p_id uuid default null,p_expected timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_band_member(); b uuid:=private.current_band_id(); r public.rehearsals;
 track jsonb; assignment jsonb; track_pos bigint; session_pos bigint; sid text; rid uuid; aid uuid;
 kept_songs text[]:='{}'; kept_sessions uuid[]; typ text; member uuid; nick text; memo text; total_sessions integer:=0;
begin
 if p_date is null or p_date not between date '1900-01-01' and date '2100-12-31' or jsonb_typeof(p_tracks) is distinct from 'array' or jsonb_array_length(p_tracks)>100 then
  raise exception 'Invalid rehearsal input' using errcode='22023';
 end if;
 if p_id is null then
  if p_expected is not null then raise exception 'Invalid version' using errcode='22023'; end if;
  insert into public.rehearsals(band_id,rehearsal_date) values(b,p_date) returning * into r;
 else
  select * into r from public.rehearsals where id=p_id and band_id=b for update;
  if not found then raise exception 'Rehearsal unavailable' using errcode='42501'; end if;
  if p_expected is null or r.updated_at<>p_expected then raise exception 'Rehearsal changed' using errcode='40001'; end if;
  update public.rehearsals set rehearsal_date=p_date where id=r.id returning * into r;
 end if;
 for track,track_pos in select value,ordinality from jsonb_array_elements(p_tracks) with ordinality loop
  sid:=track->>'song_id'; memo:=coalesce(track->>'notes','');
  if jsonb_typeof(track) is distinct from 'object' or sid is null or sid=any(kept_songs) or char_length(memo)>3000
   or jsonb_typeof(track->'sessions') is distinct from 'array' or jsonb_array_length(track->'sessions')>100 then
   raise exception 'Invalid rehearsal song' using errcode='22023';
  end if;
  if not exists(select 1 from public.songs where id=sid and band_id=b) then raise exception 'Song unavailable' using errcode='42501'; end if;
  kept_songs:=array_append(kept_songs,sid);
  insert into public.rehearsal_songs(rehearsal_id,song_id,sort_order,notes) values(r.id,sid,track_pos-1,memo)
   on conflict(rehearsal_id,song_id) do update set sort_order=excluded.sort_order,notes=excluded.notes returning id into rid;
  -- Remove omitted assignments before inserting replacements. Temporarily clear
  -- changed member slots so swapping two assignments cannot hit the UNIQUE index.
  delete from public.rehearsal_sessions existing where rehearsal_song_id=rid and not exists(
   select 1 from jsonb_array_elements(track->'sessions') incoming where nullif(incoming->>'id','')::uuid=existing.id);
  update public.rehearsal_sessions existing set member_id=null where rehearsal_song_id=rid and member_id is not null and exists(
   select 1 from jsonb_array_elements(track->'sessions') incoming where nullif(incoming->>'id','')::uuid=existing.id
    and (existing.member_id,existing.session_type) is distinct from (nullif(incoming->>'member_id','')::uuid,incoming->>'session_type'));
  kept_sessions:='{}';
  for assignment,session_pos in select value,ordinality from jsonb_array_elements(track->'sessions') with ordinality loop
   total_sessions:=total_sessions+1;
   typ:=assignment->>'session_type'; member:=nullif(assignment->>'member_id','')::uuid; nick:=assignment->>'nickname_snapshot';
   if total_sessions>500 or jsonb_typeof(assignment) is distinct from 'object' or typ is null or typ not in ('vocal','guitar','bass','drums','keyboard') then
    raise exception 'Invalid session' using errcode='22023';
   end if;
   if member is not null then
    if not exists(select 1 from public.band_memberships where band_id=b and user_id=member) then raise exception 'Member unavailable' using errcode='42501'; end if;
   elsif nick is null or char_length(btrim(nick)) not between 1 and 30 or nick !~ '[^[:space:]]' then
    raise exception 'Guest nickname required' using errcode='22023';
   end if;
   aid:=nullif(assignment->>'id','')::uuid;
   if aid is null then
    insert into public.rehearsal_sessions(rehearsal_song_id,session_type,member_id,nickname_snapshot,sort_order)
     values(rid,typ,member,coalesce(btrim(nick),''),session_pos-1) returning id into aid;
   else
    if aid=any(kept_sessions) or not exists(select 1 from public.rehearsal_sessions where id=aid and rehearsal_song_id=rid) then
     raise exception 'Session unavailable' using errcode='42501';
    end if;
    -- Preserve saved nickname snapshots and session IDs when nothing changed.
    update public.rehearsal_sessions set session_type=typ,member_id=member,nickname_snapshot=coalesce(btrim(nick),''),sort_order=session_pos-1
     where id=aid and (session_type,member_id,nickname_snapshot,sort_order) is distinct from (typ,member,coalesce(btrim(nick),''),session_pos::integer-1);
   end if;
   kept_sessions:=array_append(kept_sessions,aid);
  end loop;
  delete from public.rehearsal_sessions where rehearsal_song_id=rid and not(id=any(kept_sessions));
 end loop;
 delete from public.rehearsal_songs where rehearsal_id=r.id and not(song_id=any(kept_songs));
 return r.id;
end; $$;


commit;
