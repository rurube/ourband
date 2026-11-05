\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(1);
\ir ../../test-support/song-engagement.sql
select pass('Voting, anonymous cursor comments, popularity and confirmation verified');
select * from finish();
rollback;
