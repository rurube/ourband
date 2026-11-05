// Explicit deployment verification only. Never included in the Pages build/CI.
// Uses ephemeral test accounts and only deletes IDs/bands created by this run.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const nativeFetch = globalThis.fetch
globalThis.fetch = (input, init = {}) => nativeFetch(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) })

const url = process.env.TEST_SUPABASE_URL
const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY
const adminKey = process.env.TEST_SUPABASE_SERVICE_KEY
if (!url || !key || !adminKey) throw new Error('Remote test credentials must be supplied through the process environment')
const admin = createClient(url, adminKey, { auth: { persistSession: false, autoRefreshToken: false } })
const nonce = randomUUID().slice(0,8)
const names = [`qa-leader-${nonce}`,`qa-member-${nonce}`,`qa-other-${nonce}`]
const createdIds = new Set(); const createdBands = new Set()
const pin = '092863'; const nextPin = '702486'
let passes = 0
const pass = label => { passes++; console.log(`PASS: ${label}`) }
async function call(action, values = {}, token, origin = 'https://rurube.github.io') {
  const response = await fetch(`${url}/functions/v1/band-auth`, {
    method:'POST',headers:{ 'Content-Type':'application/json',apikey:key,Origin:origin,...(token?{Authorization:`Bearer ${token}`}:{}) },
    body:JSON.stringify({action,...values}),
  })
  let body
  try { body=await response.json() } catch { throw new Error(`Non-JSON Edge response (${response.status})`) }
  return { ok:response.ok, status:response.status, body }
}
function ok(result,label) { assert.equal(result.ok,true,`${label}: ${result.status} ${result.body.error ?? result.body.code ?? ''} ${result.body.message ?? ''}`); pass(label); return result.body }
function denied(result,label) { assert.equal(result.ok,false,label);pass(label) }
async function login(nickname,value=pin) {
  const result=ok(await call('login',{nickname,pin:value}),`nickname/PIN login ${nickname.startsWith('qa-member')?'member':'leader'}`)
  assert.ok(result.session?.access_token);assert.ok(result.session?.refresh_token)
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data,error}=await client.auth.setSession(result.session);assert.ifError(error)
  createdIds.add(data.user.id)
  const {data:profile,error:pError}=await client.from('profiles').select('band_id,band_role').eq('id',data.user.id).single();assert.ifError(pError)
  createdBands.add(profile.band_id)
  return {client,token:result.session.access_token,user:data.user,profile}
}
try {
  denied(await call('rotate-invite'),'anonymous privileged action rejected')
  denied(await call('login',{nickname:names[0],pin},undefined,'https://evil.invalid'),'unapproved CORS origin rejected')
  const leaderSignup=ok(await call('create-band',{nickname:names[0],pin,bandName:`QA band ${nonce}`}), 'leader signup without invitation')
  assert.match(leaderSignup.bandCode,/^[a-f0-9]{40}$/);assert.match(leaderSignup.recoveryKey,/^[a-f0-9]{40}$/)
  ok(await call('join-band',{nickname:names[1],pin,bandCode:leaderSignup.bandCode,role:'leader'}),'member joins by band code')
  ok(await call('create-band',{nickname:names[2],pin,bandName:`QA other ${nonce}`}), 'independent band creation')
  const leader=await login(names[0]); const member=await login(names[1]); const other=await login(names[2])
  assert.equal(leader.profile.band_role,'leader');assert.equal(member.profile.band_role,'member');assert.equal(member.profile.band_id,leader.profile.band_id);assert.notEqual(other.profile.band_id,leader.profile.band_id)
  pass('server fixes role and isolates band membership')
  const visible=await member.client.from('profiles').select('id');assert.ifError(visible.error);assert.equal(visible.data.length,2);pass('real REST RLS excludes other band members')
  const anonymous=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  assert.ok((await anonymous.from('profiles').select('id')).error);pass('anonymous REST access denied')
  assert.ok((await member.client.rpc('auth_lookup',{p_nickname:names[0]})).error);pass('private server RPC denied through actual Data API')
  const direct=await anonymous.auth.signInWithPassword({email:leader.user.email,password:pin});assert.ok(direct.error);pass('raw PIN cannot bypass Edge rate limits via Auth endpoint')
  const refreshed=await leader.client.auth.refreshSession();assert.ifError(refreshed.error);assert.equal(refreshed.data.user.id,leader.user.id);pass('Supabase SDK refreshes real session')
  const device=await login(names[0]);assert.equal(device.user.id,leader.user.id);pass('second device resolves same Auth user')
  denied(await call('rotate-invite',{},member.token),'member cannot issue invitation code')
  const rotated=ok(await call('rotate-invite',{},leader.token),'leader rotates invitation')
  assert.notEqual(rotated.bandCode,leaderSignup.bandCode)
  denied(await call('join-band',{nickname:`qa-old-${nonce}`,pin,bandCode:leaderSignup.bandCode}),'previous band code invalid after rotation')
  denied(await call('reset-member-pin',{memberId:member.user.id,pin:nextPin,leaderPin:'000000'},leader.token),'member PIN reset requires leader PIN confirmation')
  denied(await call('reset-member-pin',{memberId:other.user.id,pin:nextPin,leaderPin:pin},leader.token),'cross-band PIN reset rejected')
  ok(await call('reset-member-pin',{memberId:member.user.id,pin:nextPin,leaderPin:pin},leader.token),'leader resets own member PIN')
  denied(await call('login',{nickname:names[1],pin}),'old member PIN stops working')
  const changedMember=await login(names[1],nextPin);assert.equal(changedMember.user.id,member.user.id)
  const recovered=ok(await call('recover',{nickname:names[0],pin:nextPin,recoveryKey:leaderSignup.recoveryKey}),'leader recovery without email')
  assert.notEqual(recovered.recoveryKey,leaderSignup.recoveryKey)
  denied(await call('recover',{nickname:names[0],pin,recoveryKey:leaderSignup.recoveryKey}),'old recovery key cannot be reused')
  denied(await call('login',{nickname:names[0],pin}),'old leader PIN stops working after recovery')
  const recoveredLeader=await login(names[0],nextPin);assert.equal(recoveredLeader.user.id,leader.user.id)
  const newRecovery=ok(await call('rotate-recovery',{leaderPin:nextPin},recoveredLeader.token),'logged-in leader can replace lost recovery key')
  assert.match(newRecovery.recoveryKey,/^[a-f0-9]{40}$/)
  const logout=await recoveredLeader.client.auth.signOut({scope:'local'});assert.ifError(logout.error)
  assert.equal((await recoveredLeader.client.auth.getSession()).data.session,null);pass('SDK logout clears persisted session')
  // New unknown name avoids locking any real account. A thirteenth attempt must
  // return 429 independently of forwarded IP, proving server-side account limits.
  let limited=false
  for(let i=0;i<13;i++) { const r=await call('login',{nickname:`qa-missing-${nonce}`,pin});if(r.status===429){limited=true;break} }
  assert.equal(limited,true);pass('server-side request limit returns HTTP 429')
  console.log(`Remote authentication integration: ${passes} checks passed.`)
} finally {
  // Discover only this run's precisely named accounts, including failed responses
  // after successful provisioning. Do not enumerate or alter unrelated users.
  for(const name of names) {
    const {data,error}=await admin.rpc('auth_lookup',{p_nickname:name})
    if(!error && data?.[0]){createdIds.add(data[0].user_id);createdBands.add(data[0].band_id)}
  }
  let cleanupFailed=false
  for(const id of createdIds) { const {error}=await admin.auth.admin.deleteUser(id);if(error)cleanupFailed=true }
  for(const id of createdBands) { const {error}=await admin.from('bands').delete().eq('id',id);if(error)cleanupFailed=true }
  if(cleanupFailed)throw new Error('Remote test fixture cleanup requires follow-up; no unrelated data was touched')
  console.log('Temporary test accounts and bands cleaned up.')
}
