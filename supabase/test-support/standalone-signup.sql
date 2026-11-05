create function pg_temp.assert_true(value boolean,label text) returns text language plpgsql as $$ begin
 if value is distinct from true then raise exception 'FAIL: %',label; end if; return label; end; $$;
create function pg_temp.expect_error(statement text,expected_state text,label text) returns text language plpgsql as $$ begin
 begin execute statement; exception when others then if sqlstate=expected_state then return label; end if;
 raise exception 'FAIL: %, expected %, got % (%)',label,expected_state,sqlstate,sqlerrm; end;
 raise exception 'FAIL: %, statement unexpectedly succeeded',label; end; $$;
insert into auth.users(id) values('50000000-0000-0000-0000-000000000001');
set local role service_role;
select public.auth_register_account('50000000-0000-0000-0000-000000000001','standalone@internal.invalid','standalone_id',repeat('a',64));
select pg_temp.assert_true((select count(*)=0 from public.band_memberships where user_id='50000000-0000-0000-0000-000000000001'),'signup creates no band membership') as assertion;
select pg_temp.assert_true((select count(*)=1 from public.auth_account_lookup('STANDALONE_ID')),'standalone account supports ID lookup') as assertion;
reset role;
set local request.jwt.claim.sub='50000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.assert_true((select count(*)=1 from public.profiles),'account without band can read own identity') as assertion;
select pg_temp.assert_true((select count(*)=0 from public.band_memberships),'account without band has empty membership list') as assertion;
select pg_temp.assert_true((select count(*)=0 from public.songs),'account without band cannot read band songs') as assertion;
select pg_temp.expect_error($s$select public.auth_register_account('50000000-0000-0000-0000-000000000001','x@invalid','other_id',repeat('a',64))$s$,'42501','browser cannot register account via privileged RPC') as assertion;
reset role;
set local role service_role;
select public.auth_add_membership('50000000-0000-0000-0000-000000000001','첫 별명','First band',null,repeat('b',64));
select pg_temp.assert_true((select count(*)=1 from public.band_memberships where user_id='50000000-0000-0000-0000-000000000001' and band_role='leader' and nickname='첫 별명'),'standalone account can create first band later') as assertion;
reset role;
