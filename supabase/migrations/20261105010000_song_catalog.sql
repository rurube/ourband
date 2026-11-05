begin;
create index songs_band_confirmed_recent_idx on public.songs(band_id,is_confirmed,created_at desc,id);

-- No client band/user argument: every row and aggregate is scoped to the caller.
-- SECURITY DEFINER is needed only for private vote aggregates, never raw voters.
create function public.list_song_catalog(
 p_search text default '',p_vocal text default null,p_sort text default 'likes',
 p_confirmed boolean default false,p_limit integer default 20,p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b uuid; pattern text; result jsonb;
begin
 perform private.require_band_member();
 b:=private.current_band_id();
 if char_length(coalesce(p_search,''))>200
 or (p_vocal is not null and p_vocal not in ('female','male','mixed','instrumental'))
 or p_sort is null or p_sort not in ('likes','recent','net') or p_confirmed is null
 or p_limit is null or p_limit not between 1 and 100
 or p_offset is null or p_offset not between 0 and 100000 then
  raise exception 'Invalid catalog query' using errcode='22023';
 end if;
 -- Treat %, _ and ! as literal search text. Never interpolate PostgREST filters.
 pattern:='%'||replace(replace(replace(btrim(coalesce(p_search,'')),'!','!!'),'%','!%'),'_','!_')||'%';
 with eligible as materialized (
  select s.id,s.title,s.artist,s.bpm,s.vocal_type,s.youtube_url,s.notes,s.is_confirmed,s.created_at,s.updated_at
  from public.songs s where s.band_id=b and s.is_confirmed=p_confirmed
   and (p_vocal is null or s.vocal_type=p_vocal)
   and (coalesce(btrim(p_search),'')='' or s.title ilike pattern escape '!' or s.artist ilike pattern escape '!')
 ), scored as (
  select e.*,
   (select count(*) from private.votes v where v.song_id=e.id and v.vote_type=1) as likes,
   (select count(*) from private.votes v where v.song_id=e.id and v.vote_type=-1) as dislikes
  from eligible e
 ), page as (
  select s.*,row_number() over(order by
   case when p_sort='likes' then s.likes when p_sort='net' then s.likes-s.dislikes else 0 end desc,
   s.created_at desc,s.id) as position from scored s order by position limit p_limit offset p_offset
 )
 select jsonb_build_object(
  'songs',coalesce((select jsonb_agg(to_jsonb(p)-'position' order by p.position) from page p),'[]'::jsonb),
  'total',(select count(*) from eligible),
  'confirmed_total',(select count(*) from public.songs s where s.band_id=b and s.is_confirmed)
 ) into result;
 return result;
end; $$;
revoke all on function public.list_song_catalog(text,text,text,boolean,integer,integer) from public,anon,authenticated;
grant execute on function public.list_song_catalog(text,text,text,boolean,integer,integer) to authenticated;
commit;
