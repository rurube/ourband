begin;
-- One locked aggregate save: no partially written dates, tracks or assignments.
create function public.save_rehearsal(p_date date,p_tracks jsonb,p_id uuid default null,p_expected timestamptz default null)
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
   if total_sessions>500 or jsonb_typeof(assignment) is distinct from 'object' or typ is null or typ not in ('vocal','guitar1','guitar2','bass','drums','keyboard','other') then
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

create function public.get_rehearsal_detail(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b uuid:=private.current_band_id(); result jsonb;
begin
 perform private.require_band_member();
 select jsonb_build_object('id',r.id,'rehearsal_date',r.rehearsal_date,'updated_at',r.updated_at,'tracks',coalesce((
  select jsonb_agg(jsonb_build_object('id',rs.id,'song_id',s.id,'title',s.title,'artist',s.artist,'notes',rs.notes,'youtube_url',s.youtube_url,
   'rehearsal_count',(select count(distinct prior.rehearsal_date) from public.rehearsal_songs prs join public.rehearsals prior on prior.id=prs.rehearsal_id where prs.song_id=s.id and prior.band_id=b and prior.rehearsal_date<(now() at time zone 'Asia/Seoul')::date),
   'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',ss.id,'session_type',ss.session_type,'member_id',ss.member_id,'nickname_snapshot',ss.nickname_snapshot) order by ss.sort_order,ss.id)
    from public.rehearsal_sessions ss where ss.rehearsal_song_id=rs.id),'[]'::jsonb)) order by rs.sort_order,rs.id)
  from public.rehearsal_songs rs join public.songs s on s.id=rs.song_id where rs.rehearsal_id=r.id),'[]'::jsonb))
 into result from public.rehearsals r where r.id=p_id and r.band_id=b;
 if result is null then raise exception 'Rehearsal unavailable' using errcode='42501'; end if;
 return result;
end; $$;

create function public.delete_rehearsal(p_id uuid,p_expected timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare r public.rehearsals;
begin
 perform private.require_band_member();
 select * into r from public.rehearsals where id=p_id and band_id=private.current_band_id() for update;
 if not found then raise exception 'Rehearsal unavailable' using errcode='42501'; end if;
 if p_expected is null or r.updated_at<>p_expected then raise exception 'Rehearsal changed' using errcode='40001'; end if;
 delete from public.rehearsals where id=r.id;
end; $$;
revoke all on function public.save_rehearsal(date,jsonb,uuid,timestamptz),public.get_rehearsal_detail(uuid),public.delete_rehearsal(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.save_rehearsal(date,jsonb,uuid,timestamptz),public.get_rehearsal_detail(uuid),public.delete_rehearsal(uuid,timestamptz) to authenticated;
commit;
