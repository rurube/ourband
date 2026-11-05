\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(1);
\ir ../../test-support/rehearsals.sql
select pass('Rehearsal atomic writes, assignment identities, permissions and history verified');
select * from finish();
rollback;
