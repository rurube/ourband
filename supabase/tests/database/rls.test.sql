\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(1);
-- psql relative include runs the exact same assertions used by npm run test:db.
\ir ../assertions.sql
select pass('All band integrity, grants and RLS assertions completed');
select * from finish();
rollback;
