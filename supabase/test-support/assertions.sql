-- Shared by embedded PostgreSQL and Supabase pgTAP. Run inside a transaction.
-- These helpers run as the CALLER: never SECURITY DEFINER.
create function pg_temp.assert_true(value boolean, label text) returns text
language plpgsql as $$
begin
  if value is distinct from true then raise exception 'FAIL: %', label; end if;
  return label;
end;
$$;
create function pg_temp.expect_error(statement text, expected_state text, label text) returns text
language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = any(string_to_array(expected_state, ',')) then return label; end if;
    raise exception 'FAIL: %, expected %, got % (%)', label, expected_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: %, statement unexpectedly succeeded', label;
end;
$$;

insert into public.bands(id,name) values('00000000-0000-0000-0000-000000000010','테스트 밴드');
alter table public.profiles alter column band_id set default '00000000-0000-0000-0000-000000000010';

insert into auth.users (id) values
 ('00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000003');
insert into public.profiles (id,nickname) values
 ('00000000-0000-0000-0000-000000000001','하루'),
 ('00000000-0000-0000-0000-000000000002','Moon');

select pg_temp.assert_true((select count(*) = 8 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where c.relkind='r' and c.relrowsecurity and (n.nspname,c.relname) in
 (('public','profiles'),('public','songs'),('public','rehearsals'),('public','rehearsal_songs'),('public','rehearsal_sessions'),
  ('private','votes'),('private','comments'),('private','account_mapping'))), 'all 8 app tables have RLS') as assertion;
select pg_temp.expect_error($s$insert into public.profiles(id,nickname) values ('00000000-0000-0000-0000-000000000003',' moon ')$s$,'23505','normalized nickname uniqueness') as assertion;
select pg_temp.expect_error($s$insert into private.account_mapping(auth_user_id,internal_login_email,nickname_normalized) values ('00000000-0000-0000-0000-000000000001','test@internal.invalid','moon')$s$,'23503','account mapping cannot associate another nickname') as assertion;

set local role anon;
select pg_temp.expect_error('select * from public.songs','42501','anon cannot read songs') as assertion;
select pg_temp.expect_error('select * from public.profiles','42501','anon cannot read members') as assertion;
select pg_temp.expect_error('select * from public.rehearsals','42501','anon cannot read rehearsals') as assertion;
select pg_temp.expect_error('select * from public.rehearsal_songs','42501','anon cannot read rehearsal songs') as assertion;
select pg_temp.expect_error('select * from public.rehearsal_sessions','42501','anon cannot read sessions') as assertion;
select pg_temp.expect_error('select * from private.account_mapping','42501','anon cannot read account mapping') as assertion;
select pg_temp.expect_error($s$select public.get_song_stats(array['legacy-1'])$s$,'42501','anon cannot call aggregate RPC') as assertion;
select pg_temp.expect_error($s$select public.toggle_vote('legacy-1',1::smallint)$s$,'42501','anon cannot vote') as assertion;
select pg_temp.expect_error($s$select public.add_comment('legacy-1','hello')$s$,'42501','anon cannot comment') as assertion;
select pg_temp.expect_error($s$select public.get_comments('legacy-1')$s$,'42501','anon cannot read comments') as assertion;
select pg_temp.expect_error($s$select public.get_my_votes(array['legacy-1'])$s$,'42501','anon cannot read own votes RPC') as assertion;
select pg_temp.expect_error($s$insert into public.songs(title,artist,vocal_type) values ('No','No','female')$s$,'42501','anon cannot write songs') as assertion;
reset role;

-- Valid Supabase Auth account without a band profile is NOT a band member.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=0 from public.profiles),'unprovisioned account cannot list members') as assertion;
select pg_temp.expect_error($s$insert into public.profiles(id,nickname) values ('00000000-0000-0000-0000-000000000003','intruder')$s$,'42501','account cannot self-provision membership') as assertion;
select pg_temp.expect_error($s$insert into public.songs(title,artist,vocal_type) values ('No','No','female')$s$,'42501','unprovisioned account cannot add songs') as assertion;
select pg_temp.expect_error($s$select public.get_song_stats(array['legacy-1'])$s$,'42501','aggregate definer RPC rejects nonmember') as assertion;
select pg_temp.expect_error($s$select public.get_comments('legacy-1')$s$,'42501','comment definer RPC rejects nonmember') as assertion;
select pg_temp.expect_error($s$select public.get_my_votes(array['legacy-1'])$s$,'42501','own vote RPC rejects nonmember') as assertion;
select pg_temp.expect_error($s$select public.toggle_vote('legacy-1',1::smallint)$s$,'42501','vote definer RPC rejects nonmember') as assertion;
select pg_temp.expect_error($s$select public.add_comment('legacy-1','hello')$s$,'42501','add comment RPC rejects nonmember') as assertion;
reset role;

-- Legacy ID fixture provisioned by the server/importer.
insert into public.songs(id,title,artist,vocal_type,created_by,updated_at,band_id) values
 ('legacy-1','First Song','Band','female','00000000-0000-0000-0000-000000000001','2000-01-01','00000000-0000-0000-0000-000000000010'),
 ('legacy-2','Second Song','Band','male','00000000-0000-0000-0000-000000000001','2000-01-01','00000000-0000-0000-0000-000000000010');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=2 from public.profiles),'member can list nicknames') as assertion;
select pg_temp.assert_true((select count(*)=2 from public.songs),'member can read songs') as assertion;
insert into public.songs(title,artist,vocal_type) values ('Member Song','Artist','mixed');
select pg_temp.assert_true((select created_by=auth.uid() from public.songs where title='Member Song'),'song creator defaults to authenticated ID') as assertion;
select pg_temp.expect_error($s$insert into public.songs(title,artist,vocal_type) values (' first song ',' BAND ','female')$s$,'23505','normalized song title and artist duplicate rejected') as assertion;
select pg_temp.expect_error($s$update public.songs set id='forged' where id='legacy-1'$s$,'42501','member cannot change song ID') as assertion;
select pg_temp.expect_error($s$update public.songs set created_by=auth.uid() where id='legacy-2'$s$,'42501','member cannot rewrite creator') as assertion;
select pg_temp.expect_error($s$delete from public.songs where id='legacy-2'$s$,'42501','member cannot delete songs and their history') as assertion;
select pg_temp.expect_error($s$update public.songs set created_at=now() where id='legacy-1'$s$,'42501','member cannot forge registration time') as assertion;
select pg_temp.expect_error($s$insert into public.songs(title,artist,vocal_type,bpm) values ('Invalid','Band','female',0)$s$,'23514','invalid BPM rejected') as assertion;
select pg_temp.expect_error($s$insert into public.songs(title,artist,vocal_type) values ('Invalid','Band','invalid')$s$,'23514','invalid vocal type rejected') as assertion;
select pg_temp.expect_error($s$update public.songs set youtube_url='https://youtube.com.evil.invalid/watch?v=abcdefghijk' where id='legacy-1'$s$,'23514','YouTube hostname spoof rejected') as assertion;
select pg_temp.expect_error($s$update public.songs set youtube_url='javascript:alert(1)' where id='legacy-1'$s$,'23514','unsafe link rejected') as assertion;
update public.songs set youtube_url='https://youtu.be/abcdefghijk?t=10' where id='legacy-1';
select pg_temp.assert_true((select youtube_url is not null from public.songs where id='legacy-1'),'valid YouTube short URL accepted') as assertion;
select pg_temp.expect_error('select * from private.votes','42501','private vote records inaccessible even to members') as assertion;
select pg_temp.expect_error('select * from private.comments','42501','raw comment authors inaccessible to members') as assertion;
select pg_temp.expect_error('select * from private.account_mapping','42501','internal email mapping inaccessible to members') as assertion;
select pg_temp.expect_error('select private.require_band_member()','42501','internal definer helper not directly executable') as assertion;
select pg_temp.expect_error($s$select public.toggle_vote('legacy-1',0::smallint)$s$,'22023','invalid vote rejected') as assertion;
select pg_temp.expect_error($s$select public.toggle_vote('legacy-1',null::smallint)$s$,'22023','null vote rejected') as assertion;
select pg_temp.expect_error($s$select public.toggle_vote('missing',1::smallint)$s$,'23503','vote requires existing song') as assertion;
select pg_temp.assert_true(public.toggle_vote('legacy-1',1::smallint)=1,'like can be selected') as assertion;
select pg_temp.assert_true(public.toggle_vote('legacy-1',1::smallint) is null,'same vote toggles off') as assertion;
select pg_temp.assert_true((select count(*)=0 from public.get_my_votes(array['legacy-1'])),'cancel removes own vote') as assertion;
select public.toggle_vote('legacy-1',1::smallint);
select pg_temp.assert_true(public.toggle_vote('legacy-1',-1::smallint)=-1,'opposite vote changes existing vote') as assertion;
select pg_temp.assert_true((select count(*)=1 and min(vote_type)=-1 from public.get_my_votes(array['legacy-1'])),'one own vote per song') as assertion;
select pg_temp.expect_error($s$select public.add_comment('legacy-1',repeat('가',301))$s$,'23514','comment length capped at 300 Unicode characters') as assertion;
select pg_temp.expect_error($s$select public.add_comment('legacy-1','   ')$s$,'23514','blank comment rejected') as assertion;
select public.add_comment('legacy-1','익명 댓글');
select pg_temp.assert_true((select content='익명 댓글' from public.get_comments('legacy-1')),'member can read anonymous comment content') as assertion;
select pg_temp.assert_true((select not (to_jsonb(c) ? 'user_id') from public.get_comments('legacy-1') c),'comment RPC does not expose author ID') as assertion;
select pg_temp.expect_error($s$select public.get_comments('legacy-1',null)$s$,'22023','unbounded comment page rejected') as assertion;
select pg_temp.expect_error($s$select public.get_song_stats(array_fill('legacy-1'::text,array[101]))$s$,'22023','aggregate request bounded to 100 IDs') as assertion;
select pg_temp.assert_true((select count(*)=0 from public.get_song_stats(array[]::text[])),'empty stats request returns no rows') as assertion;

-- Another member can edit song metadata; existing votes/comments retain song ID.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=0 from public.get_my_votes(array['legacy-1'])),'second member cannot read first member vote') as assertion;
select public.toggle_vote('legacy-1',1::smallint);
update public.songs set title='Renamed',is_confirmed=true where id='legacy-1';
select pg_temp.assert_true((select updated_at > '2000-01-01'::timestamptz and is_confirmed from public.songs where id='legacy-1'),'any member can edit and confirm; updated_at refreshed') as assertion;
select pg_temp.assert_true((select likes=1 and dislikes=1 and comment_count=1 from public.get_song_stats(array['legacy-1'])),'aggregate counts include both members without multiplying joins') as assertion;
select pg_temp.assert_true((select count(*)=1 from public.get_comments('legacy-1')),'renaming retains comment relation') as assertion;

insert into public.rehearsals(rehearsal_date) values ((now() at time zone 'Asia/Seoul')::date - 1),
 ((now() at time zone 'Asia/Seoul')::date), ((now() at time zone 'Asia/Seoul')::date + 1);
select pg_temp.expect_error($s$insert into public.rehearsals(rehearsal_date) values ((now() at time zone 'Asia/Seoul')::date)$s$,'23505','one rehearsal per date') as assertion;
insert into public.rehearsal_songs(rehearsal_id,song_id) select id,'legacy-1' from public.rehearsals;
select pg_temp.expect_error($s$insert into public.rehearsal_songs(rehearsal_id,song_id) select id,'legacy-1' from public.rehearsals limit 1$s$,'23505','one occurrence of a song per rehearsal') as assertion;
select pg_temp.assert_true((select rehearsal_count=1 from public.get_song_stats(array['legacy-1'])),'rehearsal count excludes today and future in Seoul timezone') as assertion;
insert into public.rehearsal_sessions(rehearsal_song_id,session_type,member_id,nickname_snapshot)
 select id,'vocal','00000000-0000-0000-0000-000000000001','forged name' from public.rehearsal_songs limit 1;
select pg_temp.assert_true((select nickname_snapshot='하루' from public.rehearsal_sessions limit 1),'member assignment captures actual nickname') as assertion;
insert into public.rehearsal_sessions(rehearsal_song_id,session_type,member_id,nickname_snapshot)
 select rehearsal_song_id,'vocal','00000000-0000-0000-0000-000000000002','Moon' from public.rehearsal_sessions limit 1;
insert into public.rehearsal_sessions(rehearsal_song_id,session_type,nickname_snapshot)
 select rehearsal_song_id,'vocal','게스트' from public.rehearsal_sessions limit 1;
select pg_temp.assert_true((select count(*)=3 from public.rehearsal_sessions),'one session supports multiple members and guest nickname') as assertion;
select pg_temp.expect_error($s$insert into public.rehearsal_sessions(rehearsal_song_id,session_type,member_id,nickname_snapshot) select rehearsal_song_id,'vocal','00000000-0000-0000-0000-000000000001','하루' from public.rehearsal_sessions limit 1$s$,'23505','same member cannot be assigned twice to same session') as assertion;
reset role;

select pg_temp.expect_error($s$insert into private.votes(song_id,user_id,vote_type) values ('legacy-1','00000000-0000-0000-0000-000000000001',1)$s$,'23505','DB unique constraint protects votes independently of RPC') as assertion;
select pg_temp.expect_error($s$delete from public.songs where id='legacy-1'$s$,'23001,23503','history prevents admin song deletion while rehearsals reference it') as assertion;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=0 from public.songs),'nonmember cannot read populated songs') as assertion;
select pg_temp.assert_true((select count(*)=0 from public.rehearsals),'nonmember cannot read populated rehearsals') as assertion;
select pg_temp.assert_true((select count(*)=0 from public.rehearsal_songs),'nonmember cannot read populated rehearsal songs') as assertion;
select pg_temp.assert_true((select count(*)=0 from public.rehearsal_sessions),'nonmember cannot read populated sessions') as assertion;
with changed as (update public.songs set title='intruder' where id='legacy-1' returning id)
 select pg_temp.assert_true((select count(*)=0 from changed),'nonmember cannot edit songs') as assertion;
with removed as (delete from public.rehearsals returning id)
 select pg_temp.assert_true((select count(*)=0 from removed),'nonmember cannot delete rehearsals') as assertion;
select pg_temp.expect_error($s$insert into public.rehearsals(rehearsal_date) values ('2040-01-01')$s$,'42501','nonmember cannot create schedule') as assertion;
reset role;

-- Exercise private vote RLS itself independently of the production ACL.
-- Temporary grants are revoked below and all fixtures are rolled back.
grant select, insert, update, delete on private.votes to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=1 and bool_and(user_id=auth.uid()) from private.votes),'vote RLS reads only own rows even if table SELECT is granted') as assertion;
select pg_temp.expect_error($s$insert into private.votes(song_id,user_id,vote_type) values ('legacy-2','00000000-0000-0000-0000-000000000002',1)$s$,'42501','vote RLS rejects forged voter ID') as assertion;
select pg_temp.expect_error($s$update private.votes set user_id='00000000-0000-0000-0000-000000000002' where song_id='legacy-1'$s$,'42501','vote RLS rejects moving own vote to another account') as assertion;
with changed as (update private.votes set vote_type=-1 where user_id='00000000-0000-0000-0000-000000000002' returning user_id)
 select pg_temp.assert_true((select count(*)=0 from changed),'vote RLS cannot update another member vote') as assertion;
with removed as (delete from private.votes where user_id='00000000-0000-0000-0000-000000000002' returning user_id)
 select pg_temp.assert_true((select count(*)=0 from removed),'vote RLS cannot cancel another member vote') as assertion;
reset role;
revoke select, insert, update, delete on private.votes from authenticated;

-- Narrow mutation grants are intentional; profiles are server-provisioned only.
select pg_temp.assert_true(not has_table_privilege('authenticated','public.profiles','INSERT'),'member cannot mint band membership') as assertion;
select pg_temp.assert_true(not has_table_privilege('authenticated','public.profiles','UPDATE'),'member cannot alter nicknames to hijack mapping') as assertion;
select pg_temp.assert_true(not has_column_privilege('authenticated','public.songs','id','UPDATE'),'song identity is immutable to client') as assertion;
select pg_temp.assert_true(not exists(select 1 from pg_publication_tables where schemaname='private' and tablename in ('votes','comments','account_mapping')),'private data absent from Realtime publications') as assertion;
select pg_temp.assert_true(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and p.prosecdef and not ('search_path=""'=any(coalesce(p.proconfig,array[]::text[])))),'all app definer functions pin empty search_path') as assertion;

-- Member can delete an entire rehearsal; song/anonymous comment/votes survive.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
delete from public.rehearsals;
select pg_temp.assert_true((select count(*)=0 from public.rehearsal_songs),'rehearsal deletion cascades rehearsal songs') as assertion;
select pg_temp.assert_true((select count(*)=0 from public.rehearsal_sessions),'rehearsal deletion cascades session assignments') as assertion;
select pg_temp.assert_true((select likes=1 and dislikes=1 and comment_count=1 and rehearsal_count=0 from public.get_song_stats(array['legacy-1'])),'schedule deletion preserves votes and comments') as assertion;
reset role;

-- Retain a historical assignment alongside an identically named guest.
insert into public.rehearsals(rehearsal_date,band_id) values ('2001-01-01','00000000-0000-0000-0000-000000000010');
insert into public.rehearsal_songs(rehearsal_id,song_id) select id,'legacy-1' from public.rehearsals;
insert into public.rehearsal_sessions(rehearsal_song_id,session_type,member_id,nickname_snapshot)
 select id,'vocal','00000000-0000-0000-0000-000000000001','하루' from public.rehearsal_songs;
insert into public.rehearsal_sessions(rehearsal_song_id,session_type,nickname_snapshot)
 select id,'vocal','하루' from public.rehearsal_songs;

-- Account deletion preserves anonymous comment text but removes personal votes.
delete from auth.users where id='00000000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select count(*)=0 from public.profiles where id='00000000-0000-0000-0000-000000000001'),'Auth deletion removes profile') as assertion;
select pg_temp.assert_true((select count(*)=1 from private.votes where song_id='legacy-1'),'Auth deletion removes only own votes') as assertion;
select pg_temp.assert_true((select user_id is null from private.comments where song_id='legacy-1'),'Auth deletion keeps comment anonymous with null author') as assertion;
select pg_temp.assert_true((select created_by is null from public.songs where id='legacy-1'),'Auth deletion preserves song with null creator') as assertion;

select pg_temp.assert_true((select count(*)=2 and bool_and(member_id is null and nickname_snapshot='하루') from public.rehearsal_sessions),'Auth deletion retains nickname snapshots even with same-name guest') as assertion;
