\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(1);
\ir ../song-catalog.sql
select pass('Band catalog pagination, literal search and aggregate privacy verified');
select * from finish();
rollback;
