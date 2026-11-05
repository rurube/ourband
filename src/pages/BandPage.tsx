import { useRef, useState, type FormEvent } from 'react'
import { KeyRound, Plus, RefreshCw, ShieldCheck, Users, UserRound } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { authRequest, type AuthAction } from '../auth/api'
import { supabase } from '../lib/supabase'

interface Member { user_id: string; nickname: string; band_role: 'leader' | 'member' }
interface ResetRequest { user_id: string; expires_at: string }
export function BandPage() {
  const { account, profile, memberships, selectBand, refreshIdentity } = useAuth()
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [code, setCode] = useState<{ value: string; bandName: string } | null>(null)
  const [recovery, setRecovery] = useState('')
  const queryClient = useQueryClient()
  const bandId = profile?.band_id
  const members = useQuery({
    queryKey: ['band-members', bandId], enabled: !!bandId,
    queryFn: async (): Promise<Member[]> => {
      if (!supabase || !bandId) throw new Error('밴드를 선택해주세요.')
      const { data, error } = await supabase.from('band_memberships').select('user_id,nickname,band_role').eq('band_id', bandId).order('created_at').setHeader('x-band-id', bandId).abortSignal(AbortSignal.timeout(20_000))
      if (error) throw new Error('멤버 목록을 불러오지 못했습니다.')
      return data as Member[]
    },
  })
  const requests = useQuery({
    queryKey: ['reset-requests', bandId], enabled: !!bandId && profile?.band_role === 'leader',
    queryFn: async (): Promise<ResetRequest[]> => {
      if (!supabase || !bandId) throw new Error('밴드를 선택해주세요.')
      const { data, error } = await supabase.rpc('get_member_reset_requests', { p_band_id: bandId }).setHeader('x-band-id', bandId).abortSignal(AbortSignal.timeout(20_000))
      if (error) throw new Error('초기화 요청을 불러오지 못했습니다.')
      return data as ResetRequest[]
    },
  })
  const requesting = new Set(requests.data?.filter(item => Date.parse(item.expires_at) > Date.now()).map(item => item.user_id))
  const eligibleMembers = members.data?.filter(member => member.band_role === 'member' && requesting.has(member.user_id)) ?? []
  async function run(task: () => Promise<void>) {
    if (running.current) return
    running.current = true; setBusy(true); setError(''); setMessage('')
    try { await task() } catch (e) { setError(e instanceof Error ? e.message : '요청을 처리하지 못했습니다.') }
    finally { running.current = false; setBusy(false) }
  }
  function values(form: HTMLFormElement) { return Object.fromEntries(Array.from(new FormData(form).entries()).map(([key,value]) => [key,String(value)])) }
  async function edgeForm(event: FormEvent<HTMLFormElement>, action: AuthAction) {
    event.preventDefault()
    const form = event.currentTarget; const input = values(form)
    const currentBandName = profile?.bandName ?? ''
    const currentBandId = bandId
    await run(async () => {
      const result = await authRequest(action, { ...input, ...(currentBandId ? { bandId: currentBandId } : {}) })
      if (result.bandCode) setCode({ value: result.bandCode, bandName: input.bandName || currentBandName })
      if (result.recoveryKey) setRecovery(result.recoveryKey)
      // Never discard a one-time response even if a subsequent read fails.
      if (action === 'create-band' || action === 'join-band') {
        setMessage('밴드 참여를 완료했습니다. 같은 아이디로 계속 이용하세요.')
        form.reset()
        try { await refreshIdentity(result.bandId) } catch { setError('밴드 참여는 완료했습니다. 목록을 새로고침해주세요.') }
      } else if (action === 'change-login-id') {
        setMessage('로그인 아이디를 변경했습니다. 다음 로그인부터 새 아이디를 사용하세요.')
        try { await refreshIdentity() } catch { setError('아이디 변경은 완료했습니다. 계정 정보를 새로고침해주세요.') }
        const field = form.elements.namedItem('currentPin'); if (field instanceof HTMLInputElement) field.value = ''
      } else {
        setMessage(action === 'rotate-recovery' ? '새 계정 복구 키를 보관해주세요. 이전 키는 폐기됐습니다.' : '동의한 구성원의 공통 PIN을 변경했습니다. 새 PIN을 안전하게 전달해주세요.')
        form.reset()
        void queryClient.invalidateQueries({ queryKey: ['reset-requests', currentBandId] })
      }
    })
  }
  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const input = values(event.currentTarget); const targetBand = bandId
    await run(async () => {
      if (!supabase || !targetBand) throw new Error('밴드를 선택해주세요.')
      const nickname = input.nickname.trim()
      if (!nickname || /[\p{Cc}\p{Cf}]/u.test(nickname)) throw new Error('밴드 닉네임을 1~30자로 입력해주세요.')
      const { error } = await supabase.rpc('set_band_nickname', { p_band_id: targetBand, p_nickname: nickname }).setHeader('x-band-id', targetBand)
      if (error) throw new Error(error.code === '23505' ? '이 밴드에서 이미 사용하는 닉네임입니다.' : '닉네임을 변경하지 못했습니다.')
      setMessage('이 밴드의 닉네임을 변경했습니다. 로그인 아이디와 다른 밴드 닉네임은 유지됩니다.')
      void queryClient.invalidateQueries({ queryKey: ['band-members', targetBand] })
      try { await refreshIdentity() } catch { setError('닉네임 변경은 완료했습니다. 계정 정보를 새로고침해주세요.') }
    })
  }
  async function resetApproval(request: boolean) {
    const targetBand = bandId
    await run(async () => {
      if (!supabase || !targetBand) throw new Error('밴드를 선택해주세요.')
      const query = request ? supabase.rpc('request_member_pin_reset', { p_band_id: targetBand }) : supabase.rpc('cancel_member_pin_reset')
      const { error } = await query.setHeader('x-band-id', targetBand)
      if (error) throw new Error('초기화 동의를 처리하지 못했습니다.')
      setMessage(request ? '이 밴드 리더에게 15분 동안 공통 PIN 초기화를 한 번 허용했습니다.' : 'PIN 초기화 동의를 취소했습니다.')
    })
  }
  return <div className="dashboard-page">
    <div className="page-heading"><div><div className="eyebrow">MY ACCOUNT & BANDS</div><h1>내 계정과 밴드 <Users size={27} /></h1><p>아이디는 하나, 역할과 닉네임은 밴드마다 다르게.</p></div></div>
    {error && <p role="alert" className="form-message error-message">{error}</p>}{message && <p role="status" className="form-message">{message}</p>}
    {code && <section className="panel band-panel one-time-panel"><h2>{code.bandName} · 새 초대 코드</h2><label className="secret-field">멤버에게 공유할 코드<textarea aria-label="새 밴드 초대 코드" readOnly value={code.value} /><small>30일간 유효합니다. 같은 밴드에서 재발급했다면 이전 코드는 사용할 수 없습니다.</small></label><button className="text-button" onClick={() => setCode(null)}>보관했어요 · 닫기</button></section>}
    {recovery && <section className="panel band-panel one-time-panel"><h2>새 계정 복구 키</h2><label className="secret-field">본인만 보관할 복구 키<textarea aria-label="새 계정 복구 키" readOnly value={recovery} /><small>모든 밴드에서 사용하는 공통 계정 복구 키입니다. 멤버와 공유하지 마세요.</small></label><button className="text-button" onClick={() => setRecovery('')}>보관했어요 · 닫기</button></section>}
    <div className="band-grid">
      <div>
        <section className="panel band-panel"><h2><Users size={20} />내가 참여한 밴드</h2><ul className="membership-list">{memberships.map(item => <li key={item.band_id}><button aria-pressed={item.band_id === bandId} className={item.band_id === bandId ? 'selected' : ''} onClick={() => selectBand(item.band_id)} disabled={busy}><strong>{item.bandName}</strong><span>{item.nickname} · {item.band_role === 'leader' ? '리더' : '멤버'}</span></button></li>)}</ul>{!memberships.length && <p>아래에서 밴드를 만들거나 초대 코드로 참여해주세요.</p>}<button className="text-button" disabled={busy} onClick={() => { void run(() => refreshIdentity()) }}>계정·밴드 목록 새로고침</button></section>
        <section className="panel band-panel"><h2><UserRound size={20} />내 공통 계정</h2><p>현재 아이디: <strong>{account?.login_id}</strong><br />닉네임을 바꿔도 로그인 아이디는 바뀌지 않습니다.</p>
          <form onSubmit={e => { void edgeForm(e, 'change-login-id') }}><fieldset disabled={busy}><label htmlFor="newLoginId">새 로그인 아이디</label><input id="newLoginId" name="loginId" defaultValue={account?.login_id} autoComplete="username" minLength={4} maxLength={30} pattern="[A-Za-z0-9][A-Za-z0-9_.-]{3,29}" title="영문·숫자로 시작하는 4~30자의 아이디" required /><label htmlFor="idPin">현재 공통 PIN</label><input id="idPin" name="currentPin" type="password" inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete="current-password" required /><button type="submit" className="secondary-button">로그인 아이디 변경</button></fieldset></form>
          <form onSubmit={e => { void edgeForm(e, 'rotate-recovery') }}><fieldset disabled={busy}><label htmlFor="recoveryPin">현재 공통 PIN</label><input id="recoveryPin" name="currentPin" type="password" inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete="current-password" required /><button className="secondary-button" type="submit"><KeyRound size={15} />계정 복구 키 발급·재발급</button></fieldset></form>
          <p>기존에 복구 키를 받지 않은 구성원도 여기서 발급할 수 있어요.</p>
        </section>
      </div>
      <div>
        <section className="panel band-panel"><h2><Plus size={20} />새 밴드 만들기</h2><p>기존 계정으로 다른 밴드의 리더가 될 수 있어요.</p><form onSubmit={e => { void edgeForm(e, 'create-band') }}><fieldset disabled={busy}><label htmlFor="addBandName">밴드 이름</label><input id="addBandName" name="bandName" maxLength={60} required /><label htmlFor="createNickname">이 밴드에서 쓸 닉네임</label><input id="createNickname" name="nickname" maxLength={30} required /><button type="submit" className="primary-button">밴드 만들기</button></fieldset></form></section>
        <section className="panel band-panel"><h2><Users size={20} />다른 밴드 참여하기</h2><form onSubmit={e => { void edgeForm(e, 'join-band') }}><fieldset disabled={busy}><label htmlFor="joinCode">초대 코드</label><input id="joinCode" name="bandCode" type="password" maxLength={100} autoComplete="off" required /><label htmlFor="joinNickname">이 밴드에서 쓸 닉네임</label><input id="joinNickname" name="nickname" maxLength={30} required /><button type="submit" className="primary-button">같은 계정으로 참여</button></fieldset></form></section>
      </div>
    </div>
    {profile && <div className="band-grid" key={bandId}>
      <section className="panel band-panel"><h2>{profile.bandName} · 멤버</h2><p>{profile.nickname} · {profile.band_role === 'leader' ? '리더' : '멤버'}</p>
        <form onSubmit={e => { void rename(e) }}><fieldset disabled={busy}><label htmlFor="myBandNickname">이 밴드의 내 닉네임</label><input id="myBandNickname" name="nickname" defaultValue={profile.nickname} maxLength={30} required /><button className="secondary-button" type="submit">밴드 닉네임 변경</button></fieldset></form>
        {members.isPending ? <p role="status">멤버를 불러오고 있어요…</p> : members.error ? <><p role="alert">{members.error.message}</p><button className="text-button" onClick={() => { void members.refetch() }}>다시 시도</button></> : <ul className="member-list">{members.data.map(member => <li key={member.user_id}><span>{member.nickname}</span><span className="preview-badge">{member.band_role === 'leader' ? '리더' : '멤버'}</span></li>)}</ul>}
      </section>
      <div>
        {profile.band_role === 'leader' ? <>
          <section className="panel band-panel"><h2><ShieldCheck size={20} />이 밴드의 초대 코드</h2><p>새 코드를 발급하면 이 밴드의 이전 코드가 폐기됩니다.</p><button className="primary-button" disabled={busy} onClick={() => { const selectedBand=profile; void run(async () => { const result=await authRequest('rotate-invite',{bandId:selectedBand.band_id}); setCode({value:result.bandCode ?? '',bandName:selectedBand.bandName}); setMessage('이 밴드의 새 초대 코드를 발급했습니다.') }) }}><RefreshCw size={16} />새 초대 코드 발급</button></section>
          <section className="panel band-panel"><h2><KeyRound size={20} />동의한 구성원 PIN 초기화</h2><p>구성원이 아래 동의를 요청한 경우에만 15분 동안 한 번 초기화할 수 있어요. 계정의 모든 밴드 로그인에 적용됩니다.</p><button className="text-button" disabled={busy || requests.isFetching} onClick={() => { void requests.refetch() }}>초기화 요청 새로고침</button>{requests.error && <p role="alert">{requests.error.message}</p>}
            <form onSubmit={e => { void edgeForm(e, 'reset-member-pin') }}><fieldset disabled={busy}><label htmlFor="resetMember">동의한 구성원</label><select id="resetMember" name="memberId" defaultValue="" required><option value="" disabled>초기화 요청을 선택해주세요</option>{eligibleMembers.map(member => <option value={member.user_id} key={member.user_id}>{member.nickname}</option>)}</select><label htmlFor="leaderPin">리더의 현재 공통 PIN</label><input id="leaderPin" name="currentPin" type="password" inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete="current-password" required /><label htmlFor="resetNewPin">구성원의 새 공통 PIN</label><input id="resetNewPin" name="pin" type="password" inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete="new-password" required /><button className="primary-button" disabled={!eligibleMembers.length} type="submit">동의 확인 후 PIN 초기화</button></fieldset></form>
          </section>
        </> : <section className="panel band-panel"><h2><KeyRound size={20} />리더에게 PIN 초기화 요청</h2><p>PIN을 잊었지만 로그인은 유지돼 있다면 이 밴드의 리더에게 도움을 요청할 수 있어요.</p><form onSubmit={e => { e.preventDefault(); void resetApproval(true) }}><fieldset disabled={busy}><label className="consent-check"><input type="checkbox" required />이 밴드 리더가 15분 동안 내 공통 PIN을 한 번 변경하는 데 동의합니다. 모든 밴드 로그인에 영향을 줍니다.</label><button className="secondary-button" type="submit">초기화 동의 요청</button></fieldset></form></section>}
        <button className="text-button" disabled={busy} onClick={() => { void resetApproval(false) }}>내 모든 PIN 초기화 동의 취소</button>
      </div>
    </div>}
  </div>
}
