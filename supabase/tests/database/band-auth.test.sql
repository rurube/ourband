\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(1);
\ir ../band-auth.sql
select pass('Band isolation and server authentication contracts verified');
select * from finish();
rollback;
