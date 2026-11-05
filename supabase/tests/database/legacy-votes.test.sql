\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(1);
\ir ../../test-support/legacy-votes.sql
select pass('Legacy aggregate import, own votes, privacy and ranking verified');
select * from finish();
rollback;
