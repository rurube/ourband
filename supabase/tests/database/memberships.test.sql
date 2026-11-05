\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(1);
\ir ../../test-support/memberships.sql
select pass('Account ID, per-band identity, request isolation and consentful recovery verified');
select * from finish();
rollback;
