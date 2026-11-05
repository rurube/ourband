import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { fetchMembers, fetchRehearsal, rehearsalKeys, saveRehearsal } from './api'
import { draftsFromRehearsal, withUpdatedSessions, type Rehearsal, type Track, type TrackDraft } from './model'
import { SessionFields } from './SessionFields'

export function InlineSessions({ band, rehearsal, track }: { band: string; rehearsal: Rehearsal; track: Track }) {
  const client = useQueryClient()
  const [draft,setDraft] = useState<{base: Rehearsal; track:TrackDraft}|null>(null)
  const [message,setMessage] = useState('')
  const [readError,setReadError] = useState('')
  const [committed,setCommitted] = useState(false)
  const [reloading,setReloading] = useState(false)
  const running = useRef(false)
  const current = draft?.track ?? draftsFromRehearsal(rehearsal).find(item=>item.song_id===track.song_id)!
  const members=useQuery({queryKey:rehearsalKeys.members(band),queryFn:({signal})=>fetchMembers(band,signal)})
  async function readSaved() {
    const fresh=await fetchRehearsal(band,rehearsal.id)
    client.setQueriesData<Rehearsal>({queryKey:rehearsalKeys.detail(band,rehearsal.id)},fresh)
    setDraft(null);setCommitted(false);setReadError('')
    void client.invalidateQueries({queryKey:['rehearsals',band,'dates']})
  }
  const mutation=useMutation({
    mutationFn:async()=>{
      if(!draft)throw new Error('변경할 세션을 선택해주세요.')
      const latest=await fetchRehearsal(band,rehearsal.id)
      const tracks=withUpdatedSessions(draft.base,latest,track.song_id,draft.track.sessions)
      return saveRehearsal(band,latest.rehearsal_date,tracks,latest)
    },retry:false,
    onSuccess:async()=>{
      setCommitted(true);setMessage('세션 배정을 저장했습니다.')
      try{await readSaved()}catch{setReadError('저장은 완료했습니다. 저장된 배정을 다시 불러와 확인해주세요.')}
    },
  })
  async function submit(event:FormEvent){event.preventDefault();if(running.current||mutation.isPending||!draft||committed)return;running.current=true;setMessage('');setReadError('');try{await mutation.mutateAsync()}catch{/* keep input */}finally{running.current=false}}
  async function reload(){if(mutation.isPending||reloading)return;setReloading(true);setReadError('');try{await readSaved();mutation.reset();setMessage('저장된 세션 배정을 불러왔습니다.')}catch(error){setReadError((error as Error).message)}finally{setReloading(false)}}
  return <form className="inline-sessions" onSubmit={event=>{void submit(event)}}><fieldset disabled={mutation.isPending||committed||reloading} aria-label={`${track.title} 세션 바로 배정`}><legend>세션 바로 배정</legend><p className="inline-session-hint">멤버나 게스트를 바로 선택한 뒤 세션 저장을 눌러주세요.</p>{members.error&&<p role="alert" className="form-message error-message">{members.error.message}<button type="button" className="text-button" onClick={()=>{void members.refetch()}}>멤버 다시 불러오기</button></p>}<SessionFields track={current} members={members.data??[]} onChange={next=>{setDraft(old=>({base:old?.base??rehearsal,track:next}));setMessage('');mutation.reset()}}/><div className="inline-session-actions"><button type="submit" className="primary-button" disabled={!draft}><Save size={14}/>{mutation.isPending?'저장 중…':'세션 저장'}</button>{draft&&<span>저장하지 않은 변경사항이 있습니다.</span>}</div></fieldset>{(draft||committed||mutation.error||readError)&&<button type="button" className="text-button" disabled={mutation.isPending||reloading} onClick={()=>{void reload()}}>{reloading?'불러오는 중…':'작성 내용 대신 저장된 배정 불러오기'}</button>}{(mutation.error||readError)&&<p role="alert" className="form-message error-message">{readError||mutation.error?.message}</p>}{message&&<p role="status" className="form-message">{message}</p>}</form>
}
