// Verify cross-band overview reads using disposable Auth/DB fixtures only.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
const url=process.env.TEST_SUPABASE_URL,key=process.env.TEST_SUPABASE_PUBLISHABLE_KEY,secret=process.env.TEST_SUPABASE_SERVICE_KEY
if(!url||!key||!secret)throw new Error('Remote test credentials required')
const make=k=>createClient(url,k,{auth:{persistSession:false,autoRefreshToken:false}})
const admin=make(secret),users=[],bands=[],nonce=randomUUID().replaceAll('-',''),codeA='a'.repeat(64),codeB='b'.repeat(64)
let passes=0,homeClient
function check(value,label){assert.ok(value,label);passes++;console.log(`PASS: ${label}`)}
async function result(request){const r=await request;assert.ifError(r.error);return r.data}
try{
 for(let i=0;i<2;i++){
  const email=`home-${nonce}-${i}@accounts.ourband.invalid`,password=`Qa1!${randomUUID()}`
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(created.error);users.push(created.data.user.id)
  await result(admin.rpc('auth_register_account',{p_user:users[i],p_email:email,p_login_id:`home${i}_${nonce.slice(0,16)}`,p_recovery_hash:'c'.repeat(64)}))
  if(i===0){const client=make(key);await result(client.auth.signInWithPassword({email,password}));homeClient=client}
 }
 const a=await result(admin.rpc('auth_add_membership',{p_user:users[0],p_nickname:'A leader',p_band_name:`QA home A ${nonce}`,p_invite_hash:null,p_code_hash:codeA}));bands.push(a)
 const b=await result(admin.rpc('auth_add_membership',{p_user:users[1],p_nickname:'B leader',p_band_name:`QA home B ${nonce}`,p_invite_hash:null,p_code_hash:codeB}));bands.push(b)
 await result(admin.rpc('auth_add_membership',{p_user:users[0],p_nickname:'B member',p_band_name:null,p_invite_hash:codeB,p_code_hash:null}))
 const c=await result(admin.rpc('auth_add_membership',{p_user:users[1],p_nickname:'C leader',p_band_name:`QA home C ${nonce}`,p_invite_hash:null,p_code_hash:'d'.repeat(64)}));bands.push(c)
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
 for(const band of bands){
  const tracks=await result(admin.from('songs').insert(Array.from({length:8},(_,i)=>({band_id:band,created_by:users[0],title:`Song ${i}`,artist:'QA Artist',vocal_type:'mixed',is_confirmed:i<7}))).select('id'))
  const rehearsal=await result(admin.from('rehearsals').insert({band_id:band,rehearsal_date:today}).select('id').single())
  await result(admin.from('rehearsals').insert({band_id:band,rehearsal_date:'2000-01-01'}))
  await result(admin.from('rehearsal_songs').insert({rehearsal_id:rehearsal.id,song_id:tracks[7].id,sort_order:0}))
 }
 const client=homeClient
 const own=await result(client.from('band_memberships').select('band_id').eq('user_id',users[0]));check(own.length===2,'overview bootstrap includes all own memberships only')
 const views=await Promise.all([a,b].map(async band=>{
  const confirmed=await client.from('songs').select('id,title,artist',{count:'exact'}).eq('band_id',band).eq('is_confirmed',true).order('title').order('id').range(0,5).setHeader('x-band-id',band);assert.ifError(confirmed.error)
  check(confirmed.count===7&&confirmed.data.length===6,'confirmed list is scoped and paginated with exact total')
  const next=await result(client.from('songs').select('id').eq('band_id',band).eq('is_confirmed',true).order('title').order('id').range(6,11).setHeader('x-band-id',band));check(next.length===1&&!confirmed.data.some(x=>x.id===next[0].id),'next page exposes remaining confirmed song without duplication')
  const dates=await result(client.from('rehearsals').select('id,rehearsal_date,rehearsal_songs(id,sort_order,songs(id,title,artist))').eq('band_id',band).gte('rehearsal_date',today).setHeader('x-band-id',band))
  check(dates.length===1&&dates[0].rehearsal_date===today,'today is included in upcoming schedules')
  check(dates[0].rehearsal_songs[0].songs.title==='Song 7','schedule displays assigned songs independently of global confirmation flag')
  const past=await result(client.from('rehearsals').select('id').eq('band_id',band).lt('rehearsal_date',today).setHeader('x-band-id',band));check(past.length===1,'past schedule is available separately')
  return confirmed.data.map(x=>x.id)
 }))
 check(!views[0].some(id=>views[1].includes(id)),'concurrent overview reads keep two bands isolated')
 const foreign=await result(client.from('rehearsals').select('id').eq('band_id',c).setHeader('x-band-id',c));check(foreign.length===0,'unjoined band schedules are inaccessible')
 const forged=await result(client.from('songs').select('id').eq('band_id',a).setHeader('x-band-id',b));check(forged.length===0,'mismatched band header cannot expose another band')
 console.log(`Remote main overview: ${passes} checks passed.`)
}finally{
 let failed=false
 for(const band of bands){if((await admin.from('rehearsals').delete().eq('band_id',band)).error)failed=true;if((await admin.from('songs').delete().eq('band_id',band)).error)failed=true}
 for(const user of users)if((await admin.auth.admin.deleteUser(user)).error)failed=true
 for(const band of bands)if((await admin.from('bands').delete().eq('id',band)).error)failed=true
 if(failed)throw new Error('QA cleanup needs follow-up')
 console.log('Only overview QA fixtures cleaned up.')
}
