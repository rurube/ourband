-- Non-mutating post-deployment check. Run with supabase db query --remote --read-only --file supabase/verify.sql.
select
  (select count(*) from pg_tables where rowsecurity and
    ((schemaname = 'public' and tablename in ('profiles','songs','rehearsals','rehearsal_songs','rehearsal_sessions','bands'))
      or (schemaname = 'private' and tablename in ('account_mapping','votes','comments','band_invites','auth_rate_limits')))) as rls_table_count,
  (select count(*) from public.bands) as bands,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.songs) as songs,
  (select count(*) from public.rehearsals) as rehearsals,
  (select count(*) from public.rehearsal_songs) as rehearsal_songs,
  (select count(*) from public.rehearsal_sessions) as rehearsal_sessions,
  (select count(*) from private.votes) as votes,
  (select count(*) from private.comments) as comments,
  (select count(*) from private.account_mapping) as account_mappings,
  (select count(*) from auth.users) as auth_users,
  (select count(*) from pg_publication_tables where schemaname='private'
    and tablename in ('votes','comments','account_mapping')) as private_realtime_table_count;
