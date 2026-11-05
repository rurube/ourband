// Explicit hosted REST verification, never run by Pages or normal CI.
// Every mutation and cleanup is confined to this run's isolated QA bands.
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const nativeFetch = globalThis.fetch
globalThis.fetch = (input, init = {}) => nativeFetch(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) })
const url = process.env.TEST_SUPABASE_URL
const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY
const service = process.env.TEST_SUPABASE_SERVICE_KEY
if (!url || !key || !service) throw new Error('Remote verification credentials are required in process memory')
const client = (apiKey, bandId) => createClient(url, apiKey, { global: { headers: bandId ? { 'x-band-id': bandId } : {} }, auth: { persistSession: false, autoRefreshToken: false, storageKey: `qa-${randomUUID()}` } })
const admin = client(service)
const nonce = randomUUID().slice(0,8)
const ids = new Set(); const bands = new Set(); let checks = 0
function pass(label) { checks++; console.log(`PASS: ${label}`) }
const digest = value => createHash('sha256').update(value).digest('hex')
const inviteHash = digest(randomUUID())
async function account(label, ownBand) {
  const email = `${randomUUID()}@accounts.ourband.invalid`
  const password = `Qa1!${randomUUID().replaceAll('-', '')}${randomUUID().replaceAll('-', '')}`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true }); assert.ifError(error)
  ids.add(data.user.id)
  const provisioned = await admin.rpc('auth_signup', {
    p_user: data.user.id, p_email: email, p_login_id: `qacat_${label}_${nonce}`, p_nickname: `qa-catalog-${label}-${nonce}`,
    p_band_name: ownBand ? `QA catalog ${nonce} ${label}` : null, p_invite_hash: ownBand ? null : inviteHash,
    p_recovery_hash: digest(randomUUID()), p_code_hash: ownBand ? (label === 'a' ? inviteHash : digest(randomUUID())) : null,
  }); assert.ifError(provisioned.error); bands.add(provisioned.data)
  const user = client(key, provisioned.data); const login = await user.auth.signInWithPassword({ email, password }); assert.ifError(login.error)
  return { client: user, id: data.user.id, bandId: provisioned.data }
}
async function catalog(user, args = {}) {
  const { data, error } = await user.client.rpc('list_song_catalog', args); assert.ifError(error); return data
}
try {
  const a = await account('a', true); const member = await account('member', false); const b = await account('b', true)
  assert.equal(a.bandId, member.bandId); assert.notEqual(a.bandId, b.bandId)
  const payload = { title: '테스트_100%!', artist: 'Artist, (Live)', bpm: 123, vocal_type: 'female', youtube_url: 'https://www.youtube.com/watch?v=abcdefghijk', notes: '테스트 메모\n두 번째 줄' }
  const first = await a.client.from('songs').insert(payload).select().single(); assert.ifError(first.error)
  assert.equal(first.data.created_by, a.id); assert.equal(first.data.band_id, a.bandId); pass('song insert uses caller band and creator defaults')
  const second = await member.client.from('songs').insert({ title:'Second', artist:'Band', vocal_type:'male' }).select().single(); assert.ifError(second.error); pass('ordinary member can register song with optional fields empty')
  const other = await b.client.from('songs').insert(payload).select().single(); assert.ifError(other.error); pass('same title and artist permitted in another band')
  const duplicate = await member.client.from('songs').insert({ ...payload, title:' 테스트_100%! ', artist:' artist, (live) ' }); assert.equal(duplicate.error?.code,'23505'); pass('normalized duplicate rejected within own band')
  const unsafe = await a.client.from('songs').insert({ ...payload, title:'Unsafe', youtube_url:'https://youtube.com.evil.invalid/watch?v=abcdefghijk' }); assert.equal(unsafe.error?.code,'23514'); pass('unsafe YouTube hostname rejected by actual DB')
  const invalidBpm = await a.client.from('songs').insert({ ...payload, title:'Invalid BPM', bpm:0 }); assert.equal(invalidBpm.error?.code,'23514'); pass('invalid BPM rejected by actual DB')
  let data = await catalog(a); assert.equal(data.total,2); assert.equal(data.songs.length,2); assert.ok(data.songs.every(song => song.id !== other.data.id)); pass('catalog is scoped to authenticated band')
  assert.ok(!('created_by' in data.songs[0]) && !('user_id' in data.songs[0])); pass('catalog exposes no creator or voter identity')
  assert.equal((await catalog(a,{ p_search:'_100%!' })).total,1); pass('Unicode and SQL wildcard characters are searched literally')
  assert.equal((await catalog(a,{ p_search:'artist, (live)' })).total,1); pass('artist search is case-insensitive and punctuation-safe')
  assert.equal((await catalog(a,{ p_vocal:'male' })).songs[0].id,second.data.id); pass('vocal filter works through REST RPC')
  const paged = await catalog(a,{p_sort:'recent',p_limit:1,p_offset:1}); assert.equal(paged.total,2); assert.equal(paged.songs.length,1); pass('pagination returns one row and full result count')
  assert.equal((await catalog(a,{p_search:'not present'})).songs.length,0); pass('valid empty search returns array')
  assert.ifError((await a.client.rpc('toggle_vote',{p_song_id:first.data.id,p_vote_type:1})).error)
  assert.ifError((await member.client.rpc('toggle_vote',{p_song_id:first.data.id,p_vote_type:-1})).error)
  assert.ifError((await member.client.rpc('add_comment',{p_song_id:first.data.id,p_content:'QA relation preservation'})).error)
  data = await catalog(a,{p_sort:'likes'}); assert.equal(data.songs[0].id,first.data.id); assert.equal(data.songs[0].likes,1); assert.equal(data.songs[0].dislikes,1); pass('likes sort returns real aggregated vote counts')
  assert.equal((await catalog(a,{p_sort:'net'})).songs[0].id,second.data.id); pass('net score ties prefer recent registration')
  const updated = await member.client.from('songs').update({ ...payload,title:'수정한 곡',vocal_type:'mixed',bpm:null }).eq('id',first.data.id).eq('updated_at',first.data.updated_at).select().single(); assert.ifError(updated.error)
  assert.equal(updated.data.id,first.data.id); assert.equal(updated.data.created_by,a.id); assert.equal(updated.data.created_at,first.data.created_at); assert.notEqual(updated.data.updated_at,first.data.updated_at); pass('another member edits metadata while retaining ID, creator and registration time')
  const stale = await a.client.from('songs').update({title:'stale overwrite'}).eq('id',first.data.id).eq('updated_at',first.data.updated_at).select('id'); assert.ifError(stale.error); assert.equal(stale.data.length,0); pass('stale editor cannot overwrite a newer saved version')
  const stats = await a.client.rpc('get_song_stats',{p_song_ids:[first.data.id]}); assert.ifError(stats.error); assert.equal(stats.data[0].likes,1); assert.equal(stats.data[0].dislikes,1); assert.equal(stats.data[0].comment_count,1); pass('song edit preserves existing votes and comment relations')
  const cross = await b.client.from('songs').update({title:'cross band'}).eq('id',first.data.id).select('id'); assert.ifError(cross.error); assert.equal(cross.data.length,0); pass('other band cannot edit song by guessed ID')
  assert.ifError((await admin.from('songs').update({is_confirmed:true}).eq('id',second.data.id)).error)
  data = await catalog(a); assert.equal(data.total,1); assert.equal(data.confirmed_total,1); assert.equal((await catalog(a,{p_confirmed:true})).songs[0].id,second.data.id); pass('confirmed songs excluded from wishlist and retained in separate catalog')
  const recent = await a.client.from('songs').select('id,title,artist,created_at,is_confirmed').eq('band_id',a.bandId).order('created_at',{ascending:false}).limit(5); assert.ifError(recent.error); assert.equal(recent.data.length,2); pass('recent songs query includes confirmation and registration metadata')
  const anonymous = client(key); assert.ok((await anonymous.rpc('list_song_catalog')).error); pass('anonymous cannot access song catalog')
  console.log(`Remote song integration: ${checks} checks passed.`)
} finally {
  let failed=false
  for(const id of bands) { const {error}=await admin.from('songs').delete().eq('band_id',id); if(error)failed=true }
  for(const id of ids) { const {error}=await admin.auth.admin.deleteUser(id); if(error)failed=true }
  for(const id of bands) { const {error}=await admin.from('bands').delete().eq('id',id); if(error)failed=true }
  if(failed)throw new Error('QA fixture cleanup requires follow-up; unrelated bands were not touched')
  console.log('Only this verification run’s QA bands, accounts and songs were cleaned up.')
}
