\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(1);
\ir ../../test-support/member-sessions.sql
select pass('Own per-band session preferences, main choice and validation verified');
select * from finish();
rollback;
