import { useState, type FormEvent } from 'react'
import { KeyRound, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { authRequest } from '../auth/api'
import { supabase } from '../lib/supabase'

interface Member { id: string; nickname: string; band_role: 'leader' | 'member' }
export function BandPage() {
  const { profile } = useAuth()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const [recovery, setRecovery] = useState('')
  const members = useQuery({
    queryKey: ['band-members', profile?.band_id], enabled: !!profile,
    queryFn: async (): Promise<Member[]> => {
      if (!supabase || !profile) throw new Error('로그인이 필요합니다.')
      const { data, error } = await supabase.from('profiles').select('id,nickname,band_role').eq('band_id', profile.band_id).order('created_at')
      if (error) throw new Error('멤버 목록을 불러오지 못했습니다.')
      return data as Member[]
    },
  })
  async function rotate() {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try { const result = await authRequest('rotate-invite'); setCode(result.bandCode ?? ''); setMessage('새 초대 코드가 발급됐습니다. 이전 코드는 사용할 수 없습니다.') }
    catch (e) { setError(e instanceof Error ? e.message : '코드를 발급하지 못했습니다.') }
    finally { setBusy(false) }
  }
  async function reset(event: FormEvent<HTMLFormElement>, action: 'reset-member-pin' | 'rotate-recovery') {
    event.preventDefault(); if (busy) return
    const form = event.currentTarget
    const values = Object.fromEntries(Array.from(new FormData(form).entries()).map(([key,value]) => [key,String(value)]))
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await authRequest(action, values)
      if (action === 'rotate-recovery') { setRecovery(result.recoveryKey ?? ''); setMessage('새 복구 키를 안전하게 보관해주세요. 이전 키는 폐기됐습니다.') }
      else setMessage('구성원의 PIN을 변경했습니다. 새 PIN을 구성원에게 안전하게 전달해주세요.')
      form.reset()
    } catch (e) { setError(e instanceof Error ? e.message : '요청을 처리하지 못했습니다.') }
    finally { setBusy(false) }
  }
  return <div className="dashboard-page">
    <div className="page-heading"><div><div className="eyebrow">OUR BAND</div><h1>{profile?.bandName} <Users size={27} /></h1><p>{profile?.nickname}님은 {profile?.band_role === 'leader' ? '이 밴드의 리더' : '이 밴드의 구성원'}입니다.</p></div></div>
    <div className="band-grid">
      <section className="panel band-panel"><h2><Users size={20} />우리 밴드 멤버</h2>
        {members.isPending ? <p role="status">멤버를 불러오고 있어요…</p> : members.error ? <><p role="alert">{members.error.message}</p><button className="secondary-button" onClick={() => { void members.refetch() }}>다시 시도</button></> : <ul className="member-list">{members.data.map(member => <li key={member.id}><span>{member.nickname}</span><span className="preview-badge">{member.band_role === 'leader' ? '리더' : '멤버'}</span></li>)}</ul>}
      </section>
      {profile?.band_role === 'leader' && <div className="band-controls">
        <section className="panel band-panel"><h2><ShieldCheck size={20} />밴드 멤버 초대</h2><p>초대 코드를 받은 사람은 이 밴드의 구성원으로 가입할 수 있어요. 신뢰하는 멤버에게만 전달하세요.</p><button className="primary-button" disabled={busy} onClick={() => { void rotate() }}><RefreshCw size={16} />{busy ? '처리 중…' : '새 초대 코드 발급'}</button>
          {code && <label className="secret-field">새 밴드 초대 코드<textarea aria-label="새 밴드 초대 코드" value={code} readOnly /><small>30일간 유효합니다. 이 화면을 떠나면 다시 표시되지 않습니다.</small></label>}
        </section>
        <section className="panel band-panel"><h2><KeyRound size={20} />구성원 PIN 초기화</h2><p>리더 본인 PIN을 확인한 뒤 같은 밴드 구성원의 PIN을 변경합니다.</p><form onSubmit={e => { void reset(e, 'reset-member-pin') }}><fieldset disabled={busy}>
          <label htmlFor="member">구성원</label><select id="member" name="memberId" required defaultValue=""><option value="" disabled>구성원을 선택해주세요</option>{members.data?.filter(member => member.band_role === 'member').map(member => <option value={member.id} key={member.id}>{member.nickname}</option>)}</select>
          <label htmlFor="leaderPin">리더 본인 PIN</label><input id="leaderPin" name="leaderPin" type="password" inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete="current-password" required />
          <label htmlFor="newPin">구성원의 새 PIN</label><input id="newPin" name="pin" type="password" inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete="new-password" required /><button type="submit" className="primary-button" disabled={!members.data?.some(m => m.band_role === 'member')}>PIN 초기화</button>
        </fieldset></form></section>
        <section className="panel band-panel"><h2><KeyRound size={20} />리더 복구 키 재발급</h2><p>복구 키를 잃었거나 노출됐을 때 재발급하세요. 이전 키는 즉시 폐기됩니다.</p><form onSubmit={e => { void reset(e, 'rotate-recovery') }}><fieldset disabled={busy}><label htmlFor="recoveryPin">리더 본인 PIN</label><input id="recoveryPin" name="leaderPin" type="password" inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete="current-password" required /><button className="secondary-button" type="submit">새 복구 키 발급</button></fieldset></form>
          {recovery && <label className="secret-field">새 리더 복구 키<textarea aria-label="새 리더 복구 키" value={recovery} readOnly /><small>한 번만 표시됩니다. 멤버에게 공유하지 마세요.</small></label>}
        </section>
      </div>}
    </div>
    {error && <p role="alert" className="form-message error-message">{error}</p>}{message && <p role="status" className="form-message">{message}</p>}
  </div>
}
