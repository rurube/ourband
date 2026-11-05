begin;
create index comments_song_recent_idx on private.comments(song_id,created_at desc,id desc);
-- Keyset pagination avoids shifting/duplicating old comments when a new one arrives.
-- Only anonymous content is returned; no author field leaves the private schema.
create function public.list_song_comments(p_song_id text,p_before_time timestamptz default null,p_before_id uuid default null,p_limit integer default 20)
returns table(id uuid,song_id text,content text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_band_member();
 if p_limit is null or p_limit not between 1 and 50 or (p_before_time is null)<>(p_before_id is null) then
  raise exception 'Invalid comment page' using errcode='22023';
 end if;
 if not exists(select 1 from public.songs s where s.id=p_song_id and s.band_id=private.current_band_id()) then
  raise exception 'Song unavailable' using errcode='23503';
 end if;
 return query select c.id,c.song_id,c.content,c.created_at from private.comments c
 where c.song_id=p_song_id and (p_before_time is null or (c.created_at,c.id)<(p_before_time,p_before_id))
 order by c.created_at desc,c.id desc limit p_limit;
end; $$;
create or replace function public.add_comment(p_song_id text,p_content text)
returns table(id uuid,song_id text,content text,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare member uuid:=private.require_band_member();
begin
 if not exists(select 1 from public.songs s where s.id=p_song_id and s.band_id=private.current_band_id()) then
  raise exception 'Song unavailable' using errcode='23503';
 end if;
 if p_content is null or char_length(p_content) not between 1 and 300 or p_content !~ '[^[:space:]]' then
  raise exception 'Comment must contain 1 to 300 characters' using errcode='22023';
 end if;
 return query insert into private.comments as c(song_id,user_id,content) values(p_song_id,member,btrim(p_content))
 returning c.id,c.song_id,c.content,c.created_at;
end; $$;
revoke all on function public.list_song_comments(text,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function public.list_song_comments(text,timestamptz,uuid,integer) to authenticated;
commit;
