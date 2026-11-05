import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Guitar, Save } from 'lucide-react'
import { useAuth, type Profile } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { sessionTypes } from '../rehearsals/model'

export function SessionSettings({ profile }: { profile: Profile }) {
  const [available, setAvailable] = useState<string[]>(profile.available_sessions)
  const [main, setMain] = useState<string|null>(profile.main_session)
  const [message, setMessage] = useState('')
  const running = useRef(false)
  const client = useQueryClient()
  const { refreshIdentity } = useAuth()
  const save = useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error('서버 연결 설정이 필요합니다.')
      if (available.length && (!main || !available.includes(main))) throw new Error('가능한 세션 중 메인 포지션을 하나 선택해주세요.')
      const { error } = await supabase.rpc('set_my_band_sessions', { p_band_id: profile.band_id, p_available: available, p_main: main }).setHeader('x-band-id', profile.band_id).abortSignal(AbortSignal.timeout(20_000))
      if (error) throw new Error(error.code === '42501' ? '이 밴드의 소속을 확인해주세요.' : '포지션을 저장하지 못했습니다. 입력은 유지했으니 다시 시도해주세요.')
    }, retry: false,
    onSuccess: async () => {
      setMessage('이 밴드의 가능 세션과 메인 포지션을 저장했습니다.')
      void client.invalidateQueries({ queryKey: ['band-members',profile.band_id] })
      void client.invalidateQueries({ queryKey: ['rehearsals',profile.band_id,'members'] })
      try { await refreshIdentity() } catch { setMessage('저장은 완료했습니다. 계정·밴드 목록을 새로고침해주세요.') }
    },
  })
  function toggle(value: string, checked: boolean) {
    const next = checked ? [...available,value] : available.filter(item=>item!==value)
    setAvailable(next)
    if (!main || !next.includes(main)) setMain(next[0]??null)
    setMessage('');save.reset()
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if(running.current||save.isPending)return
    running.current=true;setMessage('')
    try { await save.mutateAsync() } catch { /* keep selections */ } finally { running.current=false }
  }
  return <section className="panel band-panel session-settings"><h2><Guitar size={20}/>개인 설정 · 내 포지션</h2><p><strong>{profile.bandName}</strong>에서 가능한 세션을 모두 선택하고 메인 포지션을 하나 지정해주세요. 밴드마다 따로 저장됩니다.</p><form onSubmit={event=>{void submit(event)}}><fieldset disabled={save.isPending}><legend className="sr-only">가능 세션과 메인 포지션</legend><div className="available-session-options">{sessionTypes.map(type=><label key={type.value} className={available.includes(type.value)?'selected':''}><input type="checkbox" checked={available.includes(type.value)} onChange={event=>toggle(type.value,event.target.checked)}/>{type.label}</label>)}</div><label htmlFor="main-session">메인 포지션</label><select id="main-session" value={main??''} disabled={!available.length} required={available.length>0} onChange={event=>{setMain(event.target.value||null);setMessage('');save.reset()}}>{!available.length&&<option value="">가능 세션을 먼저 선택해주세요</option>}{sessionTypes.filter(type=>available.includes(type.value)).map(type=><option key={type.value} value={type.value}>{type.label}</option>)}</select><p className="session-settings-note">모든 체크를 해제하고 저장하면 포지션을 미설정 상태로 되돌릴 수 있어요.</p><button className="primary-button" type="submit"><Save size={15}/>{save.isPending?'저장 중…':'내 포지션 저장'}</button></fieldset></form>{save.error&&<p role="alert" className="form-message error-message">{save.error.message}</p>}{message&&<p role="status" className="form-message">{message}</p>}</section>
}
