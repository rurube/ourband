begin;
-- Serialized per member+song so concurrent requests cannot create duplicate votes.
-- No user_id argument is accepted. Same button toggles off; opposite changes value.
create or replace function public.toggle_vote(p_song_id text, p_vote_type smallint) returns smallint
language plpgsql security definer set search_path = '' as $$
declare member uuid := private.require_band_member(); current_vote smallint;
begin
  if not exists(select 1 from public.songs s where s.id=p_song_id and s.band_id=private.current_band_id()) then
    raise exception 'Song unavailable' using errcode='23503';
  end if;
  if p_vote_type is null or p_vote_type not in (-1,1) then
    raise exception 'Invalid vote type' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(member::text || ':' || p_song_id, 0));
  select v.vote_type into current_vote from private.votes v where v.song_id = p_song_id and v.user_id = member;
  if current_vote = p_vote_type then
    delete from private.votes where song_id = p_song_id and user_id = member;
    return null;
  end if;
  insert into private.votes (song_id, user_id, vote_type) values (p_song_id, member, p_vote_type)
    on conflict (song_id, user_id) do update set vote_type = excluded.vote_type;
  return p_vote_type;
end;
$$;

-- Maximum 100 requested IDs. No other voter's ID leaves the database.
create or replace function public.get_my_votes(p_song_ids text[]) returns table (song_id text, vote_type smallint)
language plpgsql stable security definer set search_path = '' as $$
declare member uuid := private.require_band_member();
begin
  if p_song_ids is null or cardinality(p_song_ids) > 100 then
    raise exception 'Expected up to 100 song IDs' using errcode = '22023';
  end if;
  return query select v.song_id, v.vote_type from private.votes v where v.user_id = member and v.song_id = any(p_song_ids) and exists(select 1 from public.songs s where s.id=v.song_id and s.band_id=private.current_band_id());
end;
$$;

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
      (select count(*) from private.votes v where v.song_id = s.id and v.vote_type = 1),
      (select count(*) from private.votes v where v.song_id = s.id and v.vote_type = -1),
      (select count(*) from private.comments c where c.song_id = s.id),
      (select count(distinct r.rehearsal_date) from public.rehearsal_songs rs
        join public.rehearsals r on r.id = rs.rehearsal_id
        where rs.song_id = s.id and r.rehearsal_date < (now() at time zone 'Asia/Seoul')::date)
    from public.songs s where s.id = any(p_song_ids) and s.band_id=private.current_band_id();
end;
$$;

create or replace function public.get_comments(p_song_id text, p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, song_id text, content text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_band_member();
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 100000 then
    raise exception 'Invalid pagination' using errcode = '22023';
  end if;
  return query select c.id, c.song_id, c.content, c.created_at from private.comments c
    where c.song_id = p_song_id and exists(select 1 from public.songs s where s.id=c.song_id and s.band_id=private.current_band_id()) order by c.created_at, c.id limit p_limit offset p_offset;
end;
$$;

create or replace function public.add_comment(p_song_id text, p_content text)
returns table (id uuid, song_id text, content text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare member uuid := private.require_band_member();
begin
  if not exists(select 1 from public.songs s where s.id=p_song_id and s.band_id=private.current_band_id()) then
    raise exception 'Song unavailable' using errcode='23503';
  end if;
  return query insert into private.comments as c (song_id, user_id, content)
    values (p_song_id, member, btrim(p_content)) returning c.id, c.song_id, c.content, c.created_at;
end;
$$;

revoke all on function public.toggle_vote(text, smallint), public.get_my_votes(text[]), public.get_song_stats(text[]),
  public.get_comments(text, integer, integer), public.add_comment(text, text) from public, anon, authenticated;
grant execute on function public.toggle_vote(text, smallint), public.get_my_votes(text[]), public.get_song_stats(text[]),
  public.get_comments(text, integer, integer), public.add_comment(text, text) to authenticated;


commit;
