create function pg_temp.assert_true(value boolean,label text) returns text language plpgsql as $$ begin
 if value is distinct from true then raise exception 'FAIL: %',label; end if; return label; end; $$;
create function pg_temp.expect_error(statement text,expected_state text,label text) returns text language plpgsql as $$ begin
 begin execute statement; exception when others then if sqlstate=expected_state then return label; end if;
 raise exception 'FAIL: %, expected %, got % (%)',label,expected_state,sqlstate,sqlerrm; end;
 raise exception 'FAIL: %, statement unexpectedly succeeded',label; end; $$;
insert into auth.users(id) values('20000000-0000-0000-0000-000000000001'),('20000000-0000-0000-0000-000000000002'),('20000000-0000-0000-0000-000000000003');
insert into public.bands(id,name) values('20000000-0000-0000-0000-000000000010','Catalog A'),('20000000-0000-0000-0000-000000000020','Catalog B');
insert into public.profiles(id,nickname,band_id) values
 ('20000000-0000-0000-0000-000000000001','Catalog member A','20000000-0000-0000-0000-000000000010'),
 ('20000000-0000-0000-0000-000000000002','Catalog member B','20000000-0000-0000-0000-000000000010'),
 ('20000000-0000-0000-0000-000000000003','Catalog outsider','20000000-0000-0000-0000-000000000020');
insert into public.songs(id,title,artist,vocal_type,band_id,created_at) values
 ('catalog-1','한글_100%!','Artist, (Live)','female','20000000-0000-0000-0000-000000000010','2026-01-01'),
 ('catalog-2','Second Song','Other Artist','male','20000000-0000-0000-0000-000000000010','2026-01-02'),
 ('catalog-3','Third song','Other Artist','mixed','20000000-0000-0000-0000-000000000010','2026-01-03'),
 ('catalog-b','한글_100%!','Artist, (Live)','female','20000000-0000-0000-0000-000000000020','2026-01-04');
insert into public.songs(id,title,artist,vocal_type,band_id,is_confirmed) values
 ('catalog-confirmed','Confirmed song','Band','instrumental','20000000-0000-0000-0000-000000000010',true);
insert into private.votes(song_id,user_id,vote_type) values
 ('catalog-1','20000000-0000-0000-0000-000000000001',1),('catalog-1','20000000-0000-0000-0000-000000000002',1),
 ('catalog-2','20000000-0000-0000-0000-000000000001',1),('catalog-2','20000000-0000-0000-0000-000000000002',-1);
set local role anon;
select pg_temp.expect_error('select public.list_song_catalog()','42501','anonymous catalog denied') as assertion;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select pg_temp.assert_true((public.list_song_catalog()->>'total')::int=3,'catalog excludes confirmed and other band songs') as assertion;
select pg_temp.assert_true((public.list_song_catalog()->>'confirmed_total')::int=1,'confirmed count scopes to band without search filter') as assertion;
select pg_temp.assert_true(jsonb_array_length(public.list_song_catalog()->'songs')=3,'catalog page includes expected rows') as assertion;
select pg_temp.assert_true(public.list_song_catalog()->'songs'->0->>'id'='catalog-1','default likes sort is real aggregate') as assertion;
select pg_temp.assert_true((public.list_song_catalog()->'songs'->0->>'likes')::int=2,'aggregate counts votes once per member') as assertion;
select pg_temp.assert_true(public.list_song_catalog(p_sort=>'recent')->'songs'->0->>'id'='catalog-3','recent sort uses registration timestamp') as assertion;
select pg_temp.assert_true(public.list_song_catalog(p_sort=>'net')->'songs'->1->>'id'='catalog-3','net ties use latest registration first') as assertion;
select pg_temp.assert_true(public.list_song_catalog(p_limit=>1,p_offset=>1)->'songs'->0->>'id'='catalog-2','pagination returns stable second likes row') as assertion;
select pg_temp.assert_true((public.list_song_catalog(p_limit=>1,p_offset=>1)->>'total')::int=3,'pagination retains total filtered count') as assertion;
select pg_temp.assert_true(jsonb_array_length(public.list_song_catalog(p_offset=>100)->'songs')=0,'past-last page returns empty array') as assertion;
select pg_temp.assert_true((public.list_song_catalog(p_vocal=>'male')->>'total')::int=1,'vocal filter runs in database') as assertion;
select pg_temp.assert_true((public.list_song_catalog(p_search=>'sEcOnD')->>'total')::int=1,'case-insensitive title search') as assertion;
select pg_temp.assert_true((public.list_song_catalog(p_search=>'other artist')->>'total')::int=2,'artist search includes both matching songs') as assertion;
select pg_temp.assert_true((public.list_song_catalog(p_search=>'한글')->>'total')::int=1,'Korean substring search') as assertion;
select pg_temp.assert_true((public.list_song_catalog(p_search=>'_100%!')->>'total')::int=1,'search escapes SQL wildcard and escape characters') as assertion;
select pg_temp.assert_true((public.list_song_catalog(p_search=>'%')->>'total')::int=1,'percent is literal rather than match-all') as assertion;
select pg_temp.assert_true((public.list_song_catalog(p_search=>'Artist, (Live)')->>'total')::int=1,'PostgREST punctuation remains literal search data') as assertion;
select pg_temp.assert_true((public.list_song_catalog(p_search=>'not found')->>'total')::int=0,'empty search result is valid') as assertion;
select pg_temp.assert_true(public.list_song_catalog(p_confirmed=>true)->'songs'->0->>'id'='catalog-confirmed','confirmed songs remain accessible separately') as assertion;
select pg_temp.assert_true(not (public.list_song_catalog()->'songs'->0 ?| array['created_by','user_id','band_id']),'catalog does not leak creator or voter identity') as assertion;
select pg_temp.expect_error($s$select public.list_song_catalog(p_sort=>'unsafe')$s$,'22023','invalid sort rejected') as assertion;
select pg_temp.expect_error($s$select public.list_song_catalog(p_vocal=>'unsafe')$s$,'22023','invalid vocal filter rejected') as assertion;
select pg_temp.expect_error('select public.list_song_catalog(p_limit=>101)','22023','catalog response bounded to 100 songs') as assertion;
select pg_temp.expect_error('select public.list_song_catalog(p_limit=>null)','22023','null limit cannot remove response bound') as assertion;
select pg_temp.expect_error('select public.list_song_catalog(p_offset=>-1)','22023','negative offset rejected') as assertion;
select pg_temp.expect_error('select public.list_song_catalog(p_confirmed=>null)','22023','null confirmation cannot broaden band scope') as assertion;
select pg_temp.expect_error($s$select public.list_song_catalog(p_search=>repeat('가',201))$s$,'22023','search length bounded') as assertion;
reset role;
insert into auth.users(id) values('20000000-0000-0000-0000-000000000004');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
select pg_temp.expect_error('select public.list_song_catalog()','42501','unprovisioned Auth account denied catalog') as assertion;
reset role;
