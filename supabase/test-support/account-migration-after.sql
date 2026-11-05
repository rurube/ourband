create function pg_temp.assert_true(value boolean,label text) returns text language plpgsql as $$ begin
 if value is distinct from true then raise exception 'FAIL: %',label; end if; return label; end; $$;
select pg_temp.assert_true((select login_id='이전사용자' from public.profiles where id='30000000-0000-0000-0000-000000000001'),'migration preserves old nickname as initial login ID') as assertion;
select pg_temp.assert_true((select nickname='이전사용자' and band_role='leader' from public.band_memberships where user_id='30000000-0000-0000-0000-000000000001'),'migration preserves band nickname and role') as assertion;
select pg_temp.assert_true((select internal_login_email='unchanged@internal.invalid' and recovery_hash=repeat('a',64) from private.account_mapping where auth_user_id='30000000-0000-0000-0000-000000000001'),'migration preserves internal email and recovery hash') as assertion;
select pg_temp.assert_true((select count(*)=1 from public.songs where id='migration-kept-song' and created_by='30000000-0000-0000-0000-000000000001'),'migration preserves song ID and Auth creator UUID') as assertion;
select pg_temp.assert_true((select count(*)=1 from private.votes where song_id='migration-kept-song'),'migration preserves votes') as assertion;
select pg_temp.assert_true((select content='보존 댓글' from private.comments where song_id='migration-kept-song'),'migration preserves comments') as assertion;
select pg_temp.assert_true((select member_id='30000000-0000-0000-0000-000000000001' and nickname_snapshot='이전사용자' from public.rehearsal_sessions where rehearsal_song_id='30000000-0000-0000-0000-000000000030'),'migration preserves rehearsal assignment and nickname snapshot') as assertion;
