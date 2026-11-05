\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(1);
-- psql relative include runs the exact same assertions used by npm run test:db.
select exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='nickname') as legacy_schema \gset
\if :legacy_schema
\ir ../../test-support/assertions.sql
select pass('All band integrity, grants and RLS assertions completed');
\else
select skip('Historical single-band contract runs in npm test:db before migration; see memberships.test.sql',1);
\endif
select * from finish();
rollback;
