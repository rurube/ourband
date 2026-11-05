create function pg_temp.assert_true(value boolean,label text) returns text language plpgsql as $$ begin
 if value is distinct from true then raise exception 'FAIL: %',label; end if; return label; end; $$;
create function pg_temp.expect_error(statement text,expected_state text,label text) returns text language plpgsql as $$ begin
 begin execute statement; exception when others then if sqlstate=expected_state then return label; end if;
 raise exception 'FAIL: %, expected %, got %',label,expected_state,sqlstate; end;
 raise exception 'FAIL: %, unexpectedly succeeded',label; end; $$;
insert into auth.users(id) values('60000000-0000-0000-0000-000000000001'),('60000000-0000-0000-0000-000000000002'),('60000000-0000-0000-0000-000000000003');
set local role service_role;
select public.auth_signup('60000000-0000-0000-0000-000000000001','phase5a@invalid','phase5_a','리더','Phase5 A',null,repeat('a',64),repeat('b',64));
select public.auth_signup('60000000-0000-0000-0000-000000000002','phase5b@invalid','phase5_b','멤버',null,repeat('b',64),repeat('c',64),null);
select public.auth_signup('60000000-0000-0000-0000-000000000003','phase5c@invalid','phase5_c','외부','Phase5 B',null,repeat('d',64),repeat('e',64));
insert into public.songs(id,band_id,created_by,title,artist,vocal_type,created_at)
select 'phase5_old',band_id,user_id,'Old','Artist','female','2020-01-01' from public.band_memberships where user_id='60000000-0000-0000-0000-000000000001';
insert into public.songs(id,band_id,created_by,title,artist,vocal_type,created_at)
select 'phase5_new',band_id,user_id,'New','Artist','female','2020-01-02' from public.band_memberships where user_id='60000000-0000-0000-0000-000000000001';
insert into public.songs(id,band_id,created_by,title,artist,vocal_type)
select 'phase5_foreign',band_id,user_id,'Foreign','Artist','female' from public.band_memberships where user_id='60000000-0000-0000-0000-000000000003';
insert into private.comments(song_id,user_id,content,created_at) select 'phase5_new','60000000-0000-0000-0000-000000000001','Comment '||n,'2020-01-01'::timestamptz+n*interval '1 second' from generate_series(1,25) n;
reset role;
set local request.jwt.claim.sub='60000000-0000-0000-0000-000000000002';
set local role authenticated;
select pg_temp.assert_true(public.toggle_vote('phase5_new',1::smallint)=1,'member can like a song') as assertion;
select pg_temp.assert_true(public.toggle_vote('phase5_new',1::smallint) is null,'same vote cancels') as assertion;
select public.toggle_vote('phase5_new',1::smallint);
select pg_temp.assert_true(public.toggle_vote('phase5_new',(-1)::smallint)=-1,'opposite vote replaces previous choice') as assertion;
select pg_temp.assert_true((select likes=0 and dislikes=1 from public.get_song_stats(array['phase5_new'])),'vote aggregate agrees after opposite choice') as assertion;
select pg_temp.assert_true((select count(*)=1 from public.get_my_votes(array['phase5_new'])),'only own current vote returned') as assertion;
select pg_temp.expect_error($s$select public.toggle_vote('phase5_foreign',1::smallint)$s$,'23503','foreign band vote rejected') as assertion;
select pg_temp.assert_true((public.list_song_catalog(p_vocal=>'female',p_limit=>1)->'songs'->0->>'likes')::int=0,'zero-like winner can be suppressed by dashboard') as assertion;
select public.toggle_vote('phase5_new',1::smallint);
select public.toggle_vote('phase5_old',1::smallint);
select pg_temp.assert_true(public.list_song_catalog(p_vocal=>'female',p_limit=>1)->'songs'->0->>'id'='phase5_new','popular ties prefer more recent song') as assertion;
update public.songs set is_confirmed=true where id='phase5_new';
select pg_temp.assert_true(public.list_song_catalog(p_vocal=>'female',p_limit=>1)->'songs'->0->>'id'='phase5_old','confirmed song excluded from popularity and wish list') as assertion;
select pg_temp.assert_true((public.list_song_catalog(p_confirmed=>true)->>'total')::int=1,'ordinary member can confirm a song') as assertion;
update public.songs set is_confirmed=false where id='phase5_new';
select pg_temp.assert_true((public.list_song_catalog(p_confirmed=>true)->>'total')::int=0,'ordinary member can release confirmation') as assertion;
select pg_temp.assert_true((select count(*)=20 from public.list_song_comments('phase5_new')),'new comments page is bounded at twenty') as assertion;
select pg_temp.assert_true((select content='Comment 25' from public.list_song_comments('phase5_new',p_limit=>1)),'comments are newest first') as assertion;
select pg_temp.assert_true((select count(*)=5 from public.list_song_comments('phase5_new','2020-01-01 00:00:06+00',(select id from public.list_song_comments('phase5_new',p_limit=>20) where content='Comment 6'))),'keyset cursor retrieves remaining older comments') as assertion;
select pg_temp.assert_true((select not(to_jsonb(c)?'user_id') from public.list_song_comments('phase5_new',p_limit=>1)c),'comment response never includes author ID') as assertion;
select pg_temp.expect_error($s$select public.list_song_comments('phase5_foreign')$s$,'23503','foreign band comments rejected') as assertion;
select pg_temp.expect_error($s$select public.list_song_comments('phase5_new',now(),null)$s$,'22023','partial cursor rejected') as assertion;
select pg_temp.expect_error($s$select public.list_song_comments('phase5_new',p_limit=>51)$s$,'22023','unbounded comment reads rejected') as assertion;
select pg_temp.expect_error($s$select public.add_comment('phase5_new',E' \n\t ')$s$,'22023','whitespace-only comment rejected') as assertion;
select pg_temp.expect_error($s$select public.add_comment('phase5_new',repeat('가',301))$s$,'22023','overlong comment rejected at server') as assertion;
select pg_temp.assert_true((select char_length(content)=300 from public.add_comment('phase5_new',repeat('🎵',300))),'three hundred Unicode characters accepted') as assertion;
select pg_temp.assert_true((select content='새 댓글' from public.add_comment('phase5_new',' 새 댓글 ')),'member can post anonymous trimmed comment') as assertion;
select pg_temp.assert_true((select comment_count=27 from public.get_song_stats(array['phase5_new'])),'comment count reflects new posts') as assertion;
select pg_temp.assert_true((select title='New' from public.songs where id='phase5_new'),'confirmation kept song identity intact') as assertion;
reset role;
set local role anon;
select pg_temp.expect_error($s$select public.list_song_comments('phase5_new')$s$,'42501','anonymous visitor cannot read comments') as assertion;
select pg_temp.expect_error($s$select public.add_comment('phase5_new','blocked')$s$,'42501','anonymous visitor cannot post comments') as assertion;
reset role;
