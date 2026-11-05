\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(1);
\ir ../../test-support/standalone-signup.sql
select pass('Account signup without a band and first membership verified');
select * from finish();
rollback;
