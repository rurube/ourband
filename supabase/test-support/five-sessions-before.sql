insert into auth.users(id) values('a0000000-0000-0000-0000-000000000001');
select public.auth_signup('a0000000-0000-0000-0000-000000000001','five@invalid','five_sessions','Old guitarist','Five migration',null,repeat('a',64),repeat('b',64));
update public.band_memberships set available_sessions=array['guitar1','guitar2','bass'],main_session='guitar2' where user_id='a0000000-0000-0000-0000-000000000001';
insert into public.songs(id,band_id,created_by,title,artist,vocal_type) select 'five_session_song',band_id,user_id,'Five song','Artist','female' from public.band_memberships where user_id='a0000000-0000-0000-0000-000000000001';
insert into public.rehearsals(id,band_id,rehearsal_date) select 'a0000000-0000-0000-0000-000000000002',band_id,'2001-01-01' from public.band_memberships where user_id='a0000000-0000-0000-0000-000000000001';
insert into public.rehearsal_songs(id,rehearsal_id,song_id) values('a0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000002','five_session_song');
insert into public.rehearsal_sessions(id,rehearsal_song_id,session_type,member_id,nickname_snapshot) values
 ('a0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000003','guitar1','a0000000-0000-0000-0000-000000000001','forged'),
 ('a0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000003','guitar2','a0000000-0000-0000-0000-000000000001','forged'),
 ('a0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000003','guitar1',null,'Same guest'),
 ('a0000000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000003','guitar2',null,'Same guest');
update public.band_memberships set nickname='New guitarist' where user_id='a0000000-0000-0000-0000-000000000001';
