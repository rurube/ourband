import { draftsFromRehearsal, validateRehearsal, withUpdatedSessions, SessionConflictError, type Rehearsal, type TrackDraft } from './model.ts'
function assert(value: boolean, label: string) { if (!value) throw new Error(label) }
function rejects(date: string, tracks: TrackDraft[]) { let failed=false;try{validateRehearsal(date,tracks)}catch{failed=true}assert(failed,'invalid rehearsal must fail before request') }
const track: TrackDraft={song_id:'song_a',title:'Song',artist:'Artist',notes:'',sessions:[]}
Deno.test('rehearsal dates validate actual calendar dates and bounded years',()=>{
  assert(validateRehearsal('2028-02-29',[]).length===0,'valid leap day and empty plan')
  for(const date of ['','2026-02-29','2026-13-01','2026-04-31','1899-12-31','2101-01-01','2026-1-01'])rejects(date,[])
})
Deno.test('wire payload preserves assignment identity and snapshots while omitting display-only fields',()=>{
  const original:Rehearsal={id:'r',rehearsal_date:'2030-01-01',updated_at:'v',tracks:[{id:'rs',song_id:'song_a',title:'Song',artist:'Artist',youtube_url:null,notes:'note',rehearsal_count:7,sessions:[{id:'saved-session',session_type:'vocal',member_id:'member-a',nickname_snapshot:'저장된 이름'}]}]}
  const draft=draftsFromRehearsal(original);draft[0].notes='edited'
  assert(original.tracks[0].notes==='note','draft must not mutate query data')
  const saved=validateRehearsal('2030-01-01',draft)[0]
  assert(saved.sessions[0].id==='saved-session'&&saved.sessions[0].nickname_snapshot==='저장된 이름','existing IDs and snapshot retained')
  assert(!('title' in saved)&&!('key' in saved.sessions[0])&&!('rehearsal_count' in saved),'display data excluded')
})
Deno.test('same session supports multiple people and same person in different session types',()=>{
  const sessions=[{key:'a',session_type:'vocal' as const,member_id:'a',nickname_snapshot:'A'},{key:'b',session_type:'vocal' as const,member_id:'b',nickname_snapshot:'B'},{key:'c',session_type:'guitar1' as const,member_id:'a',nickname_snapshot:'A'},{key:'d',session_type:'vocal' as const,member_id:null,nickname_snapshot:' 게스트 '}]
  assert(validateRehearsal('2030-01-01',[{...track,sessions}])[0].sessions[3].nickname_snapshot==='게스트','guest trim')
  rejects('2030-01-01',[{...track,sessions:[sessions[0],{...sessions[0],key:'e'}]}])
  rejects('2030-01-01',[{...track,sessions:[{...sessions[3],nickname_snapshot:' \t\n'}]}])
})
Deno.test('song duplicates and Unicode limits are enforced without truncating user drafts',()=>{
  rejects('2030-01-01',[track,{...track}])
  assert(validateRehearsal('2030-01-01',[{...track,notes:'🎵'.repeat(3000)}])[0].notes.length===6000,'Unicode notes limit')
  rejects('2030-01-01',[{...track,notes:'가'.repeat(3001)}])
  rejects('2030-01-01',[{...track,sessions:[{key:'a',session_type:'other',member_id:null,nickname_snapshot:'🎵'.repeat(31)}]}])
})

const inlineBase:Rehearsal={id:'rehearsal',rehearsal_date:'2030-01-01',updated_at:'v1',tracks:[{id:'a',song_id:'a',title:'A',artist:'Artist',youtube_url:null,notes:'old note',rehearsal_count:0,sessions:[{id:'vocal-a',session_type:'vocal',member_id:'member-a',nickname_snapshot:'A'}]},{id:'b',song_id:'b',title:'B',artist:'Artist',youtube_url:null,notes:'B note',rehearsal_count:0,sessions:[]}]}
Deno.test('inline session save preserves concurrent date, notes, song ordering and unrelated assignments',()=>{
 const latest=structuredClone(inlineBase);latest.rehearsal_date='2030-01-02';latest.updated_at='v2';latest.tracks.reverse();latest.tracks[1].notes='new note';latest.tracks[0].sessions=[{id:'drummer',session_type:'drums',member_id:'member-b',nickname_snapshot:'B'}]
 const chosen:TrackDraft['sessions']=[{id:'vocal-a',key:'vocal-a',session_type:'vocal',member_id:'member-c',nickname_snapshot:'C'}]
 const merged=withUpdatedSessions(inlineBase,latest,'a',chosen)
 assert(merged[0].song_id==='b'&&merged[0].sessions[0].id==='drummer','preserve latest order and other song')
 assert(merged[1].notes==='new note'&&merged[1].sessions[0].member_id==='member-c','patch only sessions, keep latest notes')
 assert(inlineBase.tracks[0].sessions[0].member_id==='member-a'&&latest.tracks[1].sessions[0].member_id==='member-a','do not mutate cached aggregates')
 const wire=validateRehearsal(latest.rehearsal_date,merged)
 assert(wire[1].sessions[0].id==='vocal-a'&&!('key'in wire[1].sessions[0]),'preserve IDs and strip local keys')
})
Deno.test('inline session save rejects concurrent edits to the same song and removed schedules or tracks',()=>{
 const sessions=draftsFromRehearsal(inlineBase)[0].sessions
 const changed=structuredClone(inlineBase);changed.tracks[0].sessions[0].member_id='different-member'
 const removed=structuredClone(inlineBase);removed.tracks.shift()
 const wrong=structuredClone(inlineBase);wrong.id='other-rehearsal'
 const recreated=structuredClone(inlineBase);recreated.tracks[0].id='recreated-track'
 for(const latest of [changed,removed,wrong,recreated]){let failed=false;try{withUpdatedSessions(inlineBase,latest,'a',sessions)}catch(error){failed=error instanceof SessionConflictError}assert(failed,'must not overwrite or recreate changed assignment')}
})
Deno.test('inline session save allows a new guest without altering existing song notes',()=>{
 const chosen:TrackDraft['sessions']=[{key:'guest',session_type:'keyboard',member_id:null,nickname_snapshot:' Guest '}]
 const merged=withUpdatedSessions(inlineBase,inlineBase,'b',chosen)
 const saved=validateRehearsal(inlineBase.rehearsal_date,merged)
 assert(saved[1].sessions[0].nickname_snapshot==='Guest'&&!('id'in saved[1].sessions[0]),'new guest inserted without invented saved ID')
 assert(saved[1].notes==='B note'&&saved[0].sessions[0].id==='vocal-a','preserve other fields')
})
