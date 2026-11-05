// All writes are confined to acknowledged disposable QA accounts and bands.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
const nativeFetch=globalThis.fetch
globalThis.fetch=(input,init={})=>nativeFetch(input,{...init,signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(20_000)]):AbortSignal.timeout(20_000)})
const url=process.env.TEST_SUPABASE_URL,key=process.env.TEST_SUPABASE_PUBLISHABLE_KEY,secret=process.env.TEST_SUPABASE_SERVICE_KEY
if(!url||!key||!secret)throw new Error('Remote test credentials required')
const make=k=>createClient(url,k,{auth:{persistSession:false,autoRefreshToken:false,storageKey:`qa-${randomUUID()}`}})
const admin=make(secret),users=[],bands=[],clients=[],nonce=randomUUID().replaceAll('-','').slice(0,12)
let passes=0
function check(value,label){assert.ok(value,label);passes++;console.log(`PASS: ${label}`)}
async function result(request){const r=await request;assert.ifError(r.error);return r.data}
const scoped=(client,band,name,args)=>client.rpc(name,args).setHeader('x-band-id',band)
try{
 for(let i=0;i<3;i++){
  const email=`phase6-${nonce}-${i}@accounts.ourband.invalid`,password=`Qa1!${randomUUID()}`
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(created.error);users.push(created.data.user.id)
  await result(admin.rpc('auth_register_account',{p_user:users[i],p_email:email,p_login_id:`p6${i}_${nonce}`,p_recovery_hash:'c'.repeat(64)}))
  const client=make(key);await result(client.auth.signInWithPassword({email,password}));clients.push(client)
 }
 const bandA=await result(admin.rpc('auth_add_membership',{p_user:users[0],p_nickname:'A 리더',p_band_name:`QA Phase6 A ${nonce}`,p_invite_hash:null,p_code_hash:'a'.repeat(64)}));bands.push(bandA)
 const bandB=await result(admin.rpc('auth_add_membership',{p_user:users[1],p_nickname:'B 리더',p_band_name:`QA Phase6 B ${nonce}`,p_invite_hash:null,p_code_hash:'b'.repeat(64)}));bands.push(bandB)
 const bandC=await result(admin.rpc('auth_add_membership',{p_user:users[2],p_nickname:'C 리더',p_band_name:`QA Phase6 C ${nonce}`,p_invite_hash:null,p_code_hash:'d'.repeat(64)}));bands.push(bandC)
 await result(admin.rpc('auth_add_membership',{p_user:users[1],p_nickname:'A 멤버',p_band_name:null,p_invite_hash:'a'.repeat(64),p_code_hash:null}))
 await result(admin.rpc('auth_add_membership',{p_user:users[0],p_nickname:'B 멤버',p_band_name:null,p_invite_hash:'b'.repeat(64),p_code_hash:null}))
 async function song(band,title){return result(admin.from('songs').insert({band_id:band,created_by:users[0],title,artist:'QA Artist',vocal_type:'mixed'}).select().single())}
 const songA=await song(bandA,'첫 합주곡'),songB=await song(bandA,'둘째 합주곡'),outside=await song(bandB,'다른 밴드 곡')
 const a=clients[0],m=clients[1],other=clients[2]
 const get=(id,client=m,band=bandA)=>result(scoped(client,band,'get_rehearsal_detail',{p_id:id}))
 const save=(date,tracks,original=null,client=m,band=bandA)=>scoped(client,band,'save_rehearsal',{p_date:date,p_tracks:tracks,p_id:original?.id??null,p_expected:original?.updated_at??null})
 const remove=(r,client=m,band=bandA)=>scoped(client,band,'delete_rehearsal',{p_id:r.id,p_expected:r.updated_at})
 const tracks=[{song_id:songA.id,notes:'보컬 인트로 메모',sessions:[{session_type:'vocal',member_id:users[0],nickname_snapshot:'forged'},{session_type:'vocal',member_id:users[1],nickname_snapshot:'forged'},{session_type:'guitar1',member_id:null,nickname_snapshot:'게스트 기타'},{session_type:'guitar2',member_id:users[0],nickname_snapshot:'forged'}]},{song_id:songB.id,notes:'',sessions:[]}]
 const id=await result(save('2098-02-01',tracks));let current=await get(id)
 check(current.tracks.length===2,'ordinary member creates date with multiple songs atomically')
 check(current.tracks[0].sessions.length===4,'multiple vocalists, guest and same member in another role supported')
 check(current.tracks[0].sessions[0].nickname_snapshot==='A 리더'&&current.tracks[0].sessions[1].nickname_snapshot==='A 멤버','server captures actual per-band nicknames instead of supplied names')
 check(current.tracks[0].sessions[2].member_id===null&&current.tracks[0].sessions[2].nickname_snapshot==='게스트 기타','guest assignment has saved nickname without member account')
 check((await save('2098-02-01',[])).error?.code==='23505','same band duplicate date rejected')
 const idB=await result(save('2098-02-01',[],null,a,bandB));check(idB!==id,'different band can use same rehearsal date')
 check((await scoped(a,bandA,'get_rehearsal_detail',{p_id:idB})).error?.code==='42501','joined band header cannot read another band schedule')
 check((await scoped(other,bandC,'get_rehearsal_detail',{p_id:id})).error?.code==='42501','unjoined band cannot read schedule')
 const versions=[{...current.tracks[0],notes:'concurrent A'},current.tracks[1]],versionB=[{...current.tracks[0],notes:'concurrent B'},current.tracks[1]]
 const concurrent=await Promise.all([save('2098-02-02',versions,current,a),save('2098-02-02',versionB,current,m)])
 check(concurrent.filter(x=>!x.error).length===1&&concurrent.filter(x=>x.error?.code==='40001').length===1,`concurrent aggregate edits accept exactly one version and reject stale writer (${concurrent.map(x=>x.error?.code??'ok').join(',')})`)
 const old=current;current=await get(id)
 check(current.rehearsal_date==='2098-02-02'&&current.updated_at!==old.updated_at,'accepted save advances date and version')
 check(current.tracks[0].id===old.tracks[0].id&&current.tracks[0].sessions[0].id===old.tracks[0].sessions[0].id,'unchanged song and assignment IDs are stable')
 check((await remove(old)).error?.code==='40001','stale schedule deletion rejected')
 const before=JSON.stringify(current)
 check((await save('2098-02-03',[{song_id:songA.id,notes:'must roll back',sessions:[]},{song_id:outside.id,notes:'',sessions:[]}],current)).error?.code==='42501','foreign song aborts aggregate update')
 check(JSON.stringify(await get(id))===before,'failed update rolls back date notes session deletes and version')
 check((await save('2098-02-03',[{song_id:songA.id,sessions:[{session_type:'vocal',member_id:users[2]}]}])).error?.code==='42501','foreign band member assignment rejected')
 check((await save('2098-02-03',[{song_id:songA.id,sessions:[{session_type:'vocal',nickname_snapshot:'  '}]}])).error?.code==='22023','blank guest name rejected')
 check((await save('2098-02-03',[{song_id:songA.id,sessions:[{session_type:'invalid',nickname_snapshot:'Guest'}]}])).error?.code==='22023','invalid session type rejected')
 check((await save('2098-02-03',[{song_id:songA.id,sessions:[{session_type:'vocal',member_id:users[0]},{session_type:'vocal',member_id:users[0]}]}])).error?.code==='23505','duplicate person in one role rejected by unique constraint')
 check((await save('2098-02-03',[{song_id:songA.id,sessions:[]},{song_id:songA.id,sessions:[]}])).error?.code==='22023','same song cannot appear twice in a date')
 check((await save('2098-02-03',[{song_id:songA.id,notes:'🎵'.repeat(3001),sessions:[]}])).error?.code==='22023','overlong Unicode song notes rejected')
 check((await save('1800-01-01',[])).error?.code==='22023','out-of-range date rejected')
 const absent=await result(m.from('rehearsals').select('id').eq('rehearsal_date','2098-02-03').setHeader('x-band-id',bandA));check(absent.length===0,'failed new saves never leave empty parent dates')
 await result(scoped(m,bandA,'set_band_nickname',{p_band_id:bandA,p_nickname:'바뀐 A 멤버'}))
 await result(save(current.rehearsal_date,current.tracks,current));current=await get(id)
 check(current.tracks[0].sessions[1].nickname_snapshot==='A 멤버','unchanged saved nickname snapshot survives profile rename and date save')
 const swapped=structuredClone(current.tracks);swapped[0].sessions[0].member_id=users[1];swapped[0].sessions[1].member_id=users[0]
 await result(save(current.rehearsal_date,swapped,current));current=await get(id)
 check(current.tracks[0].sessions[0].nickname_snapshot==='바뀐 A 멤버','swapping two occupied member slots succeeds atomically with updated nickname capture')
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
 const historyTrack=[{song_id:songA.id,notes:'',sessions:[]}]
 const pastID=await result(save('2001-01-01',historyTrack));await result(save(today,historyTrack));await result(save('2099-01-01',historyTrack))
 check((await get(id)).tracks[0].rehearsal_count===1,'history counts only distinct dates before today, excluding today and future')
 await result(a.from('songs').update({title:'변경된 곡 제목'}).eq('id',songA.id).setHeader('x-band-id',bandA))
 check((await get(id)).tracks[0].rehearsal_count===1&&(await get(id)).tracks[0].title==='변경된 곡 제목','song rename preserves history and resolves current display title')
 const upcoming=await result(m.from('rehearsals').select('id,rehearsal_date').gte('rehearsal_date',today).order('rehearsal_date').setHeader('x-band-id',bandA));check(upcoming[0].rehearsal_date===today,'today belongs to ascending upcoming schedules')
 const past=await result(m.from('rehearsals').select('id,rehearsal_date').lt('rehearsal_date',today).order('rehearsal_date',{ascending:false}).setHeader('x-band-id',bandA));check(past.length===1&&past[0].id===pastID,'past list uses earlier dates only')
 const home=await result(a.from('rehearsals').select('id,rehearsal_songs(id,sort_order,songs(id,title,artist))').eq('id',id).setHeader('x-band-id',bandA));check(home[0].rehearsal_songs.length===2,'existing all-band home overview reads saved song assignments')
 await result(remove(await get(pastID)));check((await get(id)).tracks[0].rehearsal_count===0,'deleting historical date recalculates rehearsal count')
 await result(scoped(a,bandA,'toggle_vote',{p_song_id:songA.id,p_vote_type:1}));await result(scoped(a,bandA,'add_comment',{p_song_id:songA.id,p_content:'일정 삭제 후에도 보존'}))
 current=await get(id);await result(save(current.rehearsal_date,[current.tracks[1]],current));current=await get(id)
 check(current.tracks.length===1&&current.tracks[0].song_id===songB.id,'removing one date song leaves other track intact')
 const sessions=await result(m.from('rehearsal_sessions').select('id').eq('rehearsal_song_id',old.tracks[0].id).setHeader('x-band-id',bandA));check(sessions.length===0,'removing date song cascades only its session assignments')
 await result(remove(current));check((await scoped(m,bandA,'get_rehearsal_detail',{p_id:id})).error?.code==='42501','schedule can be deleted with current version')
 const stats=await result(scoped(a,bandA,'get_song_stats',{p_song_ids:[songA.id]}));check(stats[0].likes===1&&stats[0].comment_count===1,'schedule deletion preserves original song votes and comments')
 const anon=make(key);check((await scoped(anon,bandA,'save_rehearsal',{p_date:'2098-01-01',p_tracks:[]})).error,'anonymous schedule write denied')
 check((await scoped(a,bandA,'delete_rehearsal',{p_id:idB,p_expected:(await get(idB,a,bandB)).updated_at})).error?.code==='42501','wrong band header cannot delete another joined band schedule')
 check((await m.from('rehearsals').insert({rehearsal_date:'2097-01-01'}).setHeader('x-band-id',bandA)).error?.code==='42501','direct parent writes cannot bypass aggregate version checks')
 check((await m.from('rehearsal_songs').delete().eq('song_id',songA.id).setHeader('x-band-id',bandA)).error?.code==='42501','direct song relationship writes cannot bypass atomic save')
 check((await m.from('rehearsal_sessions').update({nickname_snapshot:'bypass'}).eq('rehearsal_song_id',old.tracks[0].id).setHeader('x-band-id',bandA)).error?.code==='42501','direct session writes cannot bypass aggregate save')
 console.log(`Remote Phase 6: ${passes} checks passed.`)
}finally{
 let failed=false
 for(const band of bands){if((await admin.from('rehearsals').delete().eq('band_id',band)).error)failed=true;if((await admin.from('songs').delete().eq('band_id',band)).error)failed=true}
 for(const user of users)if((await admin.auth.admin.deleteUser(user)).error)failed=true
 for(const band of bands)if((await admin.from('bands').delete().eq('id',band)).error)failed=true
 if(failed)throw new Error('Phase6 QA cleanup needs follow-up')
 console.log('Only this run’s Phase 6 QA fixtures cleaned up.')
}
