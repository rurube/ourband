-- Fixture created only in the embedded migration test database, before upgrade.
insert into auth.users(id) values('30000000-0000-0000-0000-000000000001');
insert into public.bands(id,name) values('30000000-0000-0000-0000-000000000010','보존 확인 밴드');
insert into public.profiles(id,nickname,band_id,band_role) values('30000000-0000-0000-0000-000000000001','이전사용자','30000000-0000-0000-0000-000000000010','leader');
insert into private.account_mapping(auth_user_id,internal_login_email,nickname_normalized,recovery_hash) values('30000000-0000-0000-0000-000000000001','unchanged@internal.invalid','이전사용자',repeat('a',64));
insert into public.songs(id,title,artist,vocal_type,band_id,created_by) values('migration-kept-song','보존곡','기존 가수','female','30000000-0000-0000-0000-000000000010','30000000-0000-0000-0000-000000000001');
insert into private.votes(song_id,user_id,vote_type) values('migration-kept-song','30000000-0000-0000-0000-000000000001',1);
insert into private.comments(song_id,user_id,content) values('migration-kept-song','30000000-0000-0000-0000-000000000001','보존 댓글');
insert into public.rehearsals(id,rehearsal_date,band_id) values('30000000-0000-0000-0000-000000000020','2025-01-01','30000000-0000-0000-0000-000000000010');
insert into public.rehearsal_songs(id,rehearsal_id,song_id) values('30000000-0000-0000-0000-000000000030','30000000-0000-0000-0000-000000000020','migration-kept-song');
insert into public.rehearsal_sessions(rehearsal_song_id,session_type,member_id,nickname_snapshot) values('30000000-0000-0000-0000-000000000030','vocal','30000000-0000-0000-0000-000000000001','이전사용자');
