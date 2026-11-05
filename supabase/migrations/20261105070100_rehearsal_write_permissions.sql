begin;
-- All member writes must use the version-checked aggregate RPCs. Keep SELECT
-- and existing RLS; trusted service-role maintenance remains available.
revoke insert,update,delete on public.rehearsals,public.rehearsal_songs,public.rehearsal_sessions from authenticated;
revoke insert(rehearsal_date),update(rehearsal_date) on public.rehearsals from authenticated;
revoke insert(rehearsal_id,song_id,sort_order,notes),update(song_id,sort_order,notes) on public.rehearsal_songs from authenticated;
revoke insert(rehearsal_song_id,session_type,member_id,nickname_snapshot,sort_order),update(session_type,member_id,nickname_snapshot,sort_order) on public.rehearsal_sessions from authenticated;
commit;
