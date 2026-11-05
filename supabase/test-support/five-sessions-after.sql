create function pg_temp.assert_true(value boolean,label text) returns text language plpgsql as $$ begin
 if value is distinct from true then raise exception 'FAIL: %',label; end if; return label; end; $$;
select pg_temp.assert_true((select available_sessions=array['guitar','bass'] and main_session='guitar' from public.band_memberships where user_id='a0000000-0000-0000-0000-000000000001'),'old guitar preferences and main merge without duplication') as assertion;
select pg_temp.assert_true((select count(*)=3 and bool_and(session_type='guitar') from public.rehearsal_sessions where rehearsal_song_id='a0000000-0000-0000-0000-000000000003'),'two member slots merge while both guest snapshots remain') as assertion;
select pg_temp.assert_true((select nickname_snapshot='Old guitarist' from public.rehearsal_sessions where id='a0000000-0000-0000-0000-000000000004'),'guitar conversion preserves historic nickname and original member session ID') as assertion;
select pg_temp.assert_true((select count(*)=1 from public.rehearsal_songs where id='a0000000-0000-0000-0000-000000000003'),'song-date relation survives session conversion') as assertion;
select pg_temp.assert_true(private.valid_member_sessions(array['vocal','guitar','bass','drums','keyboard'],'guitar'),'exactly five supported session values remain valid') as assertion;
select pg_temp.assert_true(not private.valid_member_sessions(array['other'],'other') and not private.valid_member_sessions(array['guitar1'],'guitar1'),'removed session values cannot be saved as personal positions') as assertion;
