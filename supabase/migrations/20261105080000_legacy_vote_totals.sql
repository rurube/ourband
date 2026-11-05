begin;
-- Anonymous pre-account votes are an imported baseline, never attributed to Auth users.
-- Replace a snapshot on re-import instead of incrementing counts.
create table private.legacy_song_votes (
 song_id text primary key references public.songs(id) on delete cascade,
 likes bigint not null check(likes>=0),
 dislikes bigint not null check(dislikes>=0),
 source_sha256 text not null check(source_sha256 ~ '^[0-9a-f]{64}$'),
 imported_at timestamptz not null default now()
);
alter table private.legacy_song_votes enable row level security;
revoke all on private.legacy_song_votes from public,anon,authenticated;
grant all on private.legacy_song_votes to service_role;

create or replace function public.get_song_stats(p_song_ids text[])
returns table (song_id text, likes bigint, dislikes bigint, comment_count bigint, rehearsal_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_band_member();
  if p_song_ids is null or cardinality(p_song_ids) > 100 then
    raise exception 'Expected up to 100 song IDs' using errcode = '22023';
  end if;
  return query
    select s.id,
      (select count(*) from private.votes v where v.song_id = s.id and v.vote_type = 1) + coalesce((select l.likes from private.legacy_song_votes l where l.song_id=s.id),0),
      (select count(*) from private.votes v where v.song_id = s.id and v.vote_type = -1) + coalesce((select l.dislikes from private.legacy_song_votes l where l.song_id=s.id),0),
      (select count(*) from private.comments c where c.song_id = s.id),
      (select count(distinct r.rehearsal_date) from public.rehearsal_songs rs
        join public.rehearsals r on r.id = rs.rehearsal_id
        where rs.song_id = s.id and r.rehearsal_date < (now() at time zone 'Asia/Seoul')::date)
    from public.songs s where s.id = any(p_song_ids) and s.band_id=private.current_band_id();
end;
$$;

create or replace function public.list_song_catalog(
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
   (select count(*) from private.votes v where v.song_id=e.id and v.vote_type=1) + coalesce((select l.likes from private.legacy_song_votes l where l.song_id=e.id),0) as likes,
   (select count(*) from private.votes v where v.song_id=e.id and v.vote_type=-1) + coalesce((select l.dislikes from private.legacy_song_votes l where l.song_id=e.id),0) as dislikes
  from eligible e
 ), page as (
  select s.*,row_number() over(order by
   case when p_sort='likes' then s.likes when p_sort='net' then s.likes-s.dislikes else 0 end desc,
   s.created_at desc,s.id) as position from scored s order by position limit p_limit offset p_offset
 )
 select jsonb_build_object(
  'songs',coalesce((select jsonb_agg(to_jsonb(p)-'position' order by p.position) from page p),'[]'::jsonb),
  'total',(select count(*) from eligible),
  'confirmed_total',(select count(*) from public.songs s where s.band_id=b and s.is_confirmed),
  'legacy_vote_total',(select coalesce(sum(l.likes+l.dislikes),0) from private.legacy_song_votes l join public.songs s on s.id=l.song_id where s.band_id=b)
 ) into result;
 return result;
end; $$;
revoke all on function public.list_song_catalog(text,text,text,boolean,integer,integer) from public,anon,authenticated;
grant execute on function public.list_song_catalog(text,text,text,boolean,integer,integer) to authenticated;

commit;
