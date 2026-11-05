// Disposable Auth/REST verification for Phase 5. Never uses existing user data.
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
function pass(label){passes++;console.log(`PASS: ${label}`)}
function check(value,label){assert.ok(value,label);pass(label)}
async function result(request){const r=await request;assert.ifError(r.error);return r.data}
const scoped=(client,band,name,args)=>client.rpc(name,args).setHeader('x-band-id',band)
try{
 for(let i=0;i<2;i++){
  const email=`phase5-${nonce}-${i}@accounts.ourband.invalid`,password=`Qa1!${randomUUID()}`
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(created.error);users.push(created.data.user.id)
  await result(admin.rpc('auth_register_account',{p_user:users[i],p_email:email,p_login_id:`p5${i}_${nonce}`,p_recovery_hash:'c'.repeat(64)}))
  const client=make(key);await result(client.auth.signInWithPassword({email,password}));clients.push(client)
 }
 const a=await result(admin.rpc('auth_add_membership',{p_user:users[0],p_nickname:'리더',p_band_name:`QA Phase5 A ${nonce}`,p_invite_hash:null,p_code_hash:'a'.repeat(64)}));bands.push(a)
 const b=await result(admin.rpc('auth_add_membership',{p_user:users[1],p_nickname:'다른 리더',p_band_name:`QA Phase5 B ${nonce}`,p_invite_hash:null,p_code_hash:'b'.repeat(64)}));bands.push(b)
 await result(admin.rpc('auth_add_membership',{p_user:users[1],p_nickname:'A 멤버',p_band_name:null,p_invite_hash:'a'.repeat(64),p_code_hash:null}))
 await result(admin.rpc('auth_add_membership',{p_user:users[0],p_nickname:'B 멤버',p_band_name:null,p_invite_hash:'b'.repeat(64),p_code_hash:null}))
 const foreign=await result(admin.rpc('auth_add_membership',{p_user:users[1],p_nickname:'외부',p_band_name:`QA Phase5 C ${nonce}`,p_invite_hash:null,p_code_hash:'d'.repeat(64)}));bands.push(foreign)
 async function song(band,title,vocal,created='2020-01-01T00:00:00Z') {return result(admin.from('songs').insert({band_id:band,created_by:users[0],title,artist:'QA Artist',vocal_type:vocal,created_at:created}).select().single())}
 const old=await song(a,'Older female','female'),newer=await song(a,'Newer female','female','2020-01-02T00:00:00Z'),male=await song(a,'Male','male'),outside=await song(foreign,'Foreign','female')
 const c0=clients[0],c1=clients[1],vote=(c,id,type,band=a)=>scoped(c,band,'toggle_vote',{p_song_id:id,p_vote_type:type}),stats=()=>result(scoped(c0,a,'get_song_stats',{p_song_ids:[newer.id]}))
 check(await result(vote(c0,newer.id,1))===1,'like selected')
 check(await result(vote(c0,newer.id,1))===null,'same like cancels')
 await result(vote(c0,newer.id,1));check(await result(vote(c0,newer.id,-1))===-1,'opposite vote changes selection')
 let s=(await stats())[0];check(Number(s.likes)===0&&Number(s.dislikes)===1,'counts agree with opposite vote')
 await result(vote(c0,newer.id,-1))
 const pair=await Promise.all([result(vote(c0,newer.id,1)),result(vote(c0,newer.id,1))]);check(pair.includes(1)&&pair.includes(null),'simultaneous same-button votes serialize into select and cancel')
 check((await stats())[0].likes===0,'simultaneous requests do not duplicate vote')
 await result(vote(c0,newer.id,1));await result(vote(c1,newer.id,-1))
 const mine=await result(scoped(c0,a,'get_my_votes',{p_song_ids:[newer.id]}));check(mine.length===1&&mine[0].vote_type===1,'own vote query does not expose other member votes')
 check(Object.keys(mine[0]).sort().join(',')==='song_id,vote_type','own vote response omits voter identifiers')
 check((await vote(c0,outside.id,1)).error?.code==='23503','unjoined band vote rejected')
 check((await vote(c0,newer.id,1,b)).error?.code==='23503','another joined band header cannot vote in selected song band')
 check((await c0.schema('private').from('votes').select('*')).error,'private raw votes inaccessible')
 await result(vote(c0,old.id,1))
 let top=await result(scoped(c0,a,'list_song_catalog',{p_vocal:'female',p_limit:1}));check(top.songs[0].id===newer.id,'popular tie uses newest registration')
 const maleTop=await result(scoped(c0,a,'list_song_catalog',{p_vocal:'male',p_limit:1}));check(maleTop.songs[0].likes===0,'zero-like male candidate is correctly suppressed by client')
 const confirmed=await result(c1.from('songs').update({is_confirmed:true}).eq('id',newer.id).eq('updated_at',newer.updated_at).select().setHeader('x-band-id',a).single());check(confirmed.is_confirmed,'ordinary member confirms song')
 top=await result(scoped(c0,a,'list_song_catalog',{p_vocal:'female',p_limit:1}));check(top.songs[0].id===old.id,'confirmed winner excluded from popularity')
 check((await result(scoped(c0,a,'list_song_catalog',{p_confirmed:true}))).songs[0].id===newer.id,'confirmed song moves into separate catalog')
 const stale=await result(c0.from('songs').update({is_confirmed:false}).eq('id',newer.id).eq('updated_at',newer.updated_at).select().setHeader('x-band-id',a));check(stale.length===0,'stale confirmation update cannot overwrite newer song')
 await result(c0.from('songs').update({is_confirmed:false}).eq('id',newer.id).eq('updated_at',confirmed.updated_at).setHeader('x-band-id',a))
 check((await result(scoped(c0,a,'list_song_catalog',{p_confirmed:true}))).total===0,'confirmation release returns song to wish list')
 const comment=(client,content)=>scoped(client,a,'add_comment',{p_song_id:newer.id,p_content:content})
 const unicode=await result(comment(c0,'🎵'.repeat(300)));check(Array.from(unicode[0].content).length===300,'300 Unicode characters accepted')
 check((await comment(c0,'🎵'.repeat(301))).error?.code==='22023','301 Unicode characters rejected')
 check((await comment(c0,' \n\t ')).error?.code==='22023','whitespace-only comment rejected')
 const writes=await Promise.all([result(comment(c0,'<script>alert(1)</script>')),result(comment(c1,'멤버의 익명 댓글'))]);check(writes.every(rows=>!('user_id' in rows[0])),'comment writes return anonymous content only')
 const sameTime='2000-01-01T00:00:00Z'
 await Promise.all(Array.from({length:25},(_,i)=>result(comment(c0,`page comment ${i}`))))
 const first=await result(scoped(c0,a,'list_song_comments',{p_song_id:newer.id}));check(first.length===20,'comment page limited to 20')
 check(first.every(x=>Object.keys(x).sort().join(',')==='content,created_at,id,song_id'),'read comment payload never exposes identity')
 const tail=first.at(-1),cursor={p_song_id:newer.id,p_before_time:tail.created_at,p_before_id:tail.id}
 await result(comment(c1,'new after first page'))
 const second=await result(scoped(c0,a,'list_song_comments',cursor));check(second.length===8&&!second.some(x=>first.some(y=>y.id===x.id)),'cursor pagination remains stable after a new insertion')
 const latest=await result(scoped(c0,a,'list_song_comments',{p_song_id:newer.id,p_limit:1}));check(latest[0].content==='new after first page','newly posted comment appears first')
 s=(await stats())[0];check(Number(s.comment_count)===29,'comment count reflects all writes')
 check((await scoped(c0,a,'list_song_comments',{p_song_id:outside.id})).error?.code==='23503','cross-band comment read rejected')
 check((await scoped(c0,b,'add_comment',{p_song_id:newer.id,p_content:'blocked'})).error?.code==='23503','cross-band comment write rejected')
 check((await scoped(c0,a,'list_song_comments',{p_song_id:newer.id,p_limit:51})).error?.code==='22023','unbounded comment request rejected')
 check((await scoped(c0,a,'list_song_comments',{p_song_id:newer.id,p_before_time:sameTime})).error?.code==='22023','partial cursor rejected')
 const anon=make(key);check((await scoped(anon,a,'list_song_comments',{p_song_id:newer.id})).error,'anonymous visitor cannot read comments')
 check((await scoped(anon,a,'toggle_vote',{p_song_id:newer.id,p_vote_type:1})).error,'anonymous visitor cannot vote')
 const remaining=await result(scoped(c0,a,'get_my_votes',{p_song_ids:[newer.id]}));check(remaining[0].vote_type===1,'confirmation changes preserve existing vote relation')
 console.log(`Remote Phase 5: ${passes} checks passed.`)
}finally{
 let failed=false
 for(const band of bands){if((await admin.from('rehearsals').delete().eq('band_id',band)).error)failed=true;if((await admin.from('songs').delete().eq('band_id',band)).error)failed=true}
 for(const user of users)if((await admin.auth.admin.deleteUser(user)).error)failed=true
 for(const band of bands)if((await admin.from('bands').delete().eq('id',band)).error)failed=true
 if(failed)throw new Error('Phase5 QA cleanup needs follow-up')
 console.log('Only this run’s Phase 5 QA fixtures cleaned up.')
}
