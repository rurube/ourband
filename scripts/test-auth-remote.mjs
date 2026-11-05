// Current account/multi-band Auth + REST integration. All mutations are confined
// to freshly created QA accounts/bands, and only acknowledged fixtures are removed.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
const nativeFetch=globalThis.fetch
globalThis.fetch=(input,init={})=>nativeFetch(input,{...init,signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(20_000)]):AbortSignal.timeout(20_000)})
const url=process.env.TEST_SUPABASE_URL, key=process.env.TEST_SUPABASE_PUBLISHABLE_KEY, adminKey=process.env.TEST_SUPABASE_SERVICE_KEY
if(!url||!key||!adminKey)throw new Error('Remote test credentials required in process environment')
const make=apiKey=>createClient(url,apiKey,{auth:{persistSession:false,autoRefreshToken:false,storageKey:`qa-${randomUUID()}`}})
const admin=make(adminKey), nonce=randomUUID().replaceAll('-','').slice(0,12)
const idA=`qaa_${nonce}`, idB=`qab_${nonce}`, idM=`qam_${nonce}`, renamed=`qar_${nonce}`
const names=new Set(), ids=new Set(), bands=new Set();let passes=0
const pin='092863', nextPin='702486'
const legacyId=process.env.LEGACY_QA_LOGIN_ID, legacyUser=process.env.LEGACY_QA_USER_ID, legacyBand=process.env.LEGACY_QA_BAND_ID
if(legacyId&&legacyUser&&legacyBand){if(!legacyId.startsWith('이전QA'))throw new Error('Legacy QA fixture name required');names.add(legacyId);ids.add(legacyUser);bands.add(legacyBand)}
function pass(label){passes++;console.log(`PASS: ${label}`)}
async function call(action,values={},token,origin='https://rurube.github.io'){
 const response=await fetch(`${url}/functions/v1/band-auth`,{method:'POST',headers:{'Content-Type':'application/json',apikey:key,Origin:origin,...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({action,...values})})
 return {ok:response.ok,status:response.status,body:await response.json()}
}
function ok(r,label){assert.equal(r.ok,true,`${label}: ${r.status} ${r.body.error??r.body.code??''} ${r.body.message??''}`);pass(label);return r.body}
function denied(r,label){assert.equal(r.ok,false,label);pass(label)}
async function signup(action,loginId,values){const data=ok(await call(action,{loginId,pin,...values}),`signup ${action}`);names.add(loginId);assert.match(data.recoveryKey,/^[a-f0-9]{40}$/);return data}
async function login(loginId,value=pin){
 const body=ok(await call('login',{loginId,pin:value}),'account ID/PIN login')
 const client=make(key);const result=await client.auth.setSession(body.session);assert.ifError(result.error);ids.add(result.data.user.id)
 const own=await client.from('profiles').select('id,login_id').single();assert.ifError(own.error)
 const memberships=await client.from('band_memberships').select('band_id,nickname,band_role,bands(name)').eq('user_id',own.data.id);assert.ifError(memberships.error)
 for(const m of memberships.data)if(m.band_role==='leader')bands.add(m.band_id)
 return {client,token:body.session.access_token,user:result.data.user,memberships:memberships.data}
}
try{
 if(legacyId&&legacyUser){const legacy=await login(legacyId);assert.equal(legacy.user.id,legacyUser);assert.equal(legacy.memberships[0].nickname,legacyId);pass('real pre-migration account keeps its initial ID, PIN, Auth UUID and band nickname')}
 denied(await call('rotate-invite'),'anonymous privileged action rejected')
 denied(await call('login',{loginId:idA,pin},undefined,'https://evil.invalid'),'unapproved CORS origin rejected')
 await signup('signup',idA,{})
 const alone=await login(idA);assert.equal(alone.memberships.length,0);pass('signup needs no band code or nickname and has zero memberships')
 const blocked=await alone.client.rpc('list_song_catalog');assert.ok(blocked.error);pass('new account cannot access catalog before joining a band')
 const createdA=ok(await call('create-band',{nickname:'동일 닉네임',bandName:`QA accounts ${nonce} A`},alone.token),'new account creates first band after login');bands.add(createdA.bandId)
 const createdB=await signup('signup-create-band',idB,{nickname:'동일 닉네임',bandName:`QA accounts ${nonce} B`})
 const joinedM=await signup('signup-join-band',idM,{nickname:'구성원',bandCode:createdA.bandCode})
 const a=await login(idA), b=await login(idB), m=await login(idM)
 const bandA=a.memberships[0].band_id, bandB=b.memberships[0].band_id
 assert.notEqual(bandA,bandB);pass('identical nicknames allowed in different bands')
 const join=ok(await call('join-band',{nickname:'B에서의 별명',bandCode:createdB.bandCode},a.token),'existing account joins second band without new Auth user')
 assert.equal(join.bandId,bandB)
 const create=ok(await call('create-band',{nickname:'새 밴드 리더',bandName:`QA accounts ${nonce} C`},a.token),'existing account creates additional band as leader');bands.add(create.bandId)
 const fresh=await a.client.from('band_memberships').select('user_id,band_id,nickname,band_role').eq('user_id',a.user.id);assert.ifError(fresh.error)
 assert.equal(fresh.data.length,3);assert.equal(fresh.data.find(row=>row.band_id===bandA).band_role,'leader');assert.equal(fresh.data.find(row=>row.band_id===bandB).band_role,'member');pass('same Auth UUID has independent nicknames and roles in three bands')
 denied(await call('rotate-invite',{bandId:bandB},a.token),'leader elsewhere cannot rotate member band invite')
 denied(await call('join-band',{nickname:'중복 가입',bandCode:createdB.bandCode},a.token),'cannot rejoin same band or overwrite role')
 const own=await a.client.from('profiles').select('id,login_id');assert.ifError(own.error);assert.equal(own.data.length,1);pass('account login identities are private to their owner')
 const invalid=await a.client.rpc('list_song_catalog');assert.ok(invalid.error);pass('ambiguous multiband catalog requires explicit band header')
 const sa=await a.client.from('songs').insert({title:'A song',artist:'Artist',vocal_type:'female'}).setHeader('x-band-id',bandA).select().single();assert.ifError(sa.error)
 const sb=await a.client.from('songs').insert({title:'B song',artist:'Artist',vocal_type:'male'}).setHeader('x-band-id',bandB).select().single();assert.ifError(sb.error)
 assert.equal(sa.data.band_id,bandA);assert.equal(sb.data.band_id,bandB);pass('per-request headers keep concurrent band writes isolated')
 const ca=await a.client.rpc('list_song_catalog').setHeader('x-band-id',bandA), cb=await a.client.rpc('list_song_catalog').setHeader('x-band-id',bandB)
 assert.ifError(ca.error);assert.ifError(cb.error);assert.equal(ca.data.songs[0].id,sa.data.id);assert.equal(cb.data.songs[0].id,sb.data.id);pass('same account reads independent catalogs per selected band')
 const forged=await m.client.rpc('list_song_catalog').setHeader('x-band-id',create.bandId);assert.ok(forged.error);pass('forged header cannot grant membership')
 ok(await call('join-band',{nickname:'멤버의 B 별명',bandCode:createdB.bandCode},m.token),'member account can also join multiple bands')
 const nick=await a.client.rpc('set_band_nickname',{p_band_id:bandA,p_nickname:'A 별명 변경'}).setHeader('x-band-id',bandA);assert.ifError(nick.error)
 const nicks=await a.client.from('band_memberships').select('band_id,nickname').eq('user_id',a.user.id);assert.ifError(nicks.error);assert.equal(nicks.data.find(row=>row.band_id===bandB).nickname,'B에서의 별명');pass('nickname edit affects only selected membership')
 const duplicate=await m.client.rpc('set_band_nickname',{p_band_id:bandA,p_nickname:'A 별명 변경'});assert.equal(duplicate.error?.code,'23505');pass('same-band nickname conflict rejected')
 const device=await login(idA);assert.equal(device.user.id,a.user.id);pass('second device keeps the same account across memberships')
 const refresh=await device.client.auth.refreshSession();assert.ifError(refresh.error);pass('SDK session refresh continues after account model change')
 const raw=await make(key).auth.signInWithPassword({email:a.user.email,password:pin});assert.ok(raw.error);pass('raw PIN cannot bypass Edge request limits')
 // Cross-band memberships do not authorize silent global PIN reset.
 denied(await call('reset-member-pin',{bandId:bandA,memberId:m.user.id,currentPin:pin,pin:nextPin},a.token),'leader cannot reset global account PIN without member consent')
 assert.ifError((await m.client.rpc('request_member_pin_reset',{p_band_id:bandA})).error)
 const requests=await a.client.rpc('get_member_reset_requests',{p_band_id:bandA});assert.ifError(requests.error);assert.equal(requests.data[0].user_id,m.user.id);pass('member can grant a one-time 15-minute reset request')
 ok(await call('reset-member-pin',{bandId:bandA,memberId:m.user.id,currentPin:pin,pin:nextPin},a.token),'leader resets only explicitly approved member account')
 denied(await call('reset-member-pin',{bandId:bandA,memberId:m.user.id,currentPin:pin,pin:nextPin},a.token),'reset approval cannot be replayed')
 denied(await call('login',{loginId:idM,pin}),'previous member PIN stops working')
 const memberChanged=await login(idM,nextPin);assert.equal(memberChanged.user.id,m.user.id);assert.equal(memberChanged.memberships.length,2);pass('common PIN reset preserves all member band memberships')
 const recovered=ok(await call('recover',{loginId:idM,pin,recoveryKey:joinedM.recoveryKey}),'ordinary member recovers own account with account key');assert.match(recovered.recoveryKey,/^[a-f0-9]{40}$/)
 denied(await call('recover',{loginId:idM,pin:nextPin,recoveryKey:joinedM.recoveryKey}),'old member recovery key cannot be reused')
 ok(await call('change-login-id',{loginId:renamed,currentPin:pin},a.token),'account login ID changed after PIN reauthentication');names.delete(idA);names.add(renamed)
 denied(await call('login',{loginId:idA,pin}),'old account ID stops working after rename')
 const newLogin=await login(renamed);assert.equal(newLogin.user.id,a.user.id);assert.equal(newLogin.memberships.length,3);pass('ID change preserves Auth UUID, memberships and PIN')
 const recovery=ok(await call('rotate-recovery',{currentPin:pin},newLogin.token),'recovery key rotation is account-wide');assert.match(recovery.recoveryKey,/^[a-f0-9]{40}$/)
 assert.ifError((await newLogin.client.auth.signOut({scope:'local'})).error);assert.equal((await newLogin.client.auth.getSession()).data.session,null);pass('SDK logout clears session')
 console.log(`Remote account/membership integration: ${passes} checks passed.`)
}finally{
 for(const name of names){const result=await admin.rpc('auth_account_lookup',{p_login_id:name});if(!result.error&&result.data?.[0])ids.add(result.data[0].user_id)}
 for(const id of ids){const rows=await admin.from('band_memberships').select('band_id').eq('user_id',id).eq('band_role','leader');if(!rows.error)for(const row of rows.data)bands.add(row.band_id)}
 let failed=false
 for(const id of bands)if((await admin.from('songs').delete().eq('band_id',id)).error)failed=true
 for(const id of ids)if((await admin.auth.admin.deleteUser(id)).error)failed=true
 for(const id of bands)if((await admin.from('bands').delete().eq('id',id)).error)failed=true
 if(failed)throw new Error('QA cleanup needs follow-up; unrelated accounts and bands were not touched')
 console.log('Only this run’s QA accounts, memberships, bands and songs cleaned up.')
}
