import { useState, type FormEvent } from 'react'
import { ArrowRight, CalendarDays, Eye, EyeOff, Heart, LockKeyhole, Music2, Sparkles } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { authRequest, type AuthAction } from '../auth/api'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'

type Mode = 'login' | 'join-band' | 'create-band' | 'recover'
export function LoginPage() {
  const { session, loading } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [secrets, setSecrets] = useState<{ bandCode?: string | null; recoveryKey?: string | null } | null>(null)
  const signup = mode === 'join-band' || mode === 'create-band'
  const titles = { login: '다시 만나서 반가워요', 'join-band': '초대받은 밴드에 합류해요', 'create-band': '우리 밴드를 시작해요', recover: '리더 계정을 복구해요' }
  const changeMode = (next: Mode) => { if (!busy && !secrets) { setMode(next); setMessage(''); setError('') } }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return
    const form = event.currentTarget; const fields = new FormData(form)
    const values = Object.fromEntries(Array.from(fields.entries()).map(([key,value]) => [key, String(value)]))
    if (mode !== 'login' && values.pin !== values.pinConfirm) { setError('두 PIN이 일치하지 않습니다.'); return }
    setBusy(true); setMessage(''); setError('')
    try {
      const result = await authRequest(mode as AuthAction, values)
      if (mode === 'login') {
        if (!supabase || !result.session) throw new Error('로그인 응답을 확인할 수 없습니다.')
        const { error } = await supabase.auth.setSession(result.session)
        if (error) throw new Error('세션을 저장하지 못했습니다. 다시 로그인해주세요.')
        form.reset()
      } else if (mode === 'recover') {
        setSecrets({ recoveryKey: result.recoveryKey }); setMessage('PIN을 변경했습니다. 새 복구 키를 보관하고 로그인해주세요.'); form.reset()
      } else {
        setMessage('가입을 완료했습니다. 설정한 닉네임과 PIN으로 로그인해주세요.')
        if (mode === 'create-band') setSecrets({ bandCode: result.bandCode, recoveryKey: result.recoveryKey })
        else setMode('login')
        form.reset()
      }
    } catch (e) { setError(e instanceof Error ? e.message : '인증에 실패했습니다.') }
    finally { setBusy(false) }
  }
  if (loading) return <div className="auth-loading" role="status">로그인 정보를 확인하고 있어요…</div>
  if (session) return <Navigate to="/songs" replace />
  return <div className="login-page">
    <section className="welcome">
      <div className="eyebrow"><span />OUR LITTLE BAND SPACE</div>
      <h1>좋아하는 곡이<br />우리의 <span>합주</span>가 되는 곳<span className="heading-dot">.</span></h1>
      <p className="welcome-description">리더가 밴드를 만들고, 코드로 멤버를 초대해요.<br />우리 밴드의 곡과 합주를 함께 준비하세요.</p>
      <div className="music-art" aria-hidden="true"><span className="art-spark spark-one">✦</span><span className="art-spark spark-two">✧</span><div className="record-sleeve"><div className="record"><div className="record-center"><Music2 size={30} /></div></div><span className="record-caption">OUR NEXT TRACK</span></div><div className="floating-note"><Heart size={18} fill="currentColor" /><span>같이 연주하고 싶은 곡</span></div><div className="floating-calendar"><CalendarDays size={19} /><span>우리의 다음 합주</span><span className="tiny-dot" /></div></div>
      <div className="welcome-features"><span><Music2 size={15} />밴드별 공간</span><span><Heart size={15} />코드로 초대</span><span><CalendarDays size={15} />함께 준비</span></div>
    </section>
    <section className="auth-card" aria-labelledby="auth-heading">
      <span className="auth-icon"><Sparkles size={24} /></span><h2 id="auth-heading">{titles[mode]}</h2>
      <p className="auth-description">{mode === 'create-band' ? '초대 코드 없이 리더로 가입할 수 있어요.' : mode === 'recover' ? '처음 발급받은 리더 복구 키가 필요해요.' : '이메일 없이 닉네임과 개인 PIN으로 이용해요.'}</p>
      <div className="auth-tabs" role="group" aria-label="인증 화면 선택">{([['login','로그인'],['join-band','밴드 가입'],['create-band','밴드 만들기']] as const).map(([value,label]) => <button key={value} disabled={busy || !!secrets} type="button" aria-pressed={mode === value} className={mode === value ? 'selected' : ''} onClick={() => changeMode(value)}>{label}</button>)}</div>
      {secrets ? <div className="one-time-secrets" role="status"><p>{message}</p>
        {secrets.bandCode && <label>밴드 초대 코드 <textarea readOnly aria-label="밴드 초대 코드" value={secrets.bandCode} /><small>멤버에게 전달하세요. 30일간 유효하며 밴드 설정에서 재발급할 수 있어요.</small></label>}
        {secrets.recoveryKey && <label>리더 복구 키 <textarea readOnly aria-label="리더 복구 키" value={secrets.recoveryKey} /><small>이 화면에서 한 번만 표시됩니다. 멤버에게 공유하지 말고 안전하게 보관하세요.</small></label>}
        <button className="primary-button auth-submit" onClick={() => { setSecrets(null); setMode('login'); setMessage('닉네임과 PIN으로 로그인해주세요.') }}>보관했어요 · 로그인하기<ArrowRight size={17} /></button>
      </div> : <form onSubmit={submit}>
        <fieldset disabled={busy}>
          {mode === 'create-band' && <><label htmlFor="bandName">밴드 이름</label><input id="bandName" name="bandName" maxLength={60} placeholder="우리 밴드의 이름" required /></>}
          <label htmlFor="nickname">닉네임</label><input id="nickname" name="nickname" placeholder="전체 서비스에서 중복되지 않는 닉네임" autoComplete="username" maxLength={30} required />
          <div className="field-label"><label htmlFor="pin">{mode === 'recover' ? '새 개인 PIN' : '개인 PIN'}</label><span>숫자 6~12자리</span></div>
          <div className="password-field"><input id="pin" name="pin" type={visible ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="PIN을 입력해주세요" title="숫자 6~12자리를 입력해주세요" required /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'PIN 숨기기' : 'PIN 표시'} aria-pressed={visible}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
          {(signup || mode === 'recover') && <><label htmlFor="pinConfirm">PIN 확인</label><input id="pinConfirm" name="pinConfirm" type="password" inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete="new-password" placeholder="PIN을 한 번 더 입력해주세요" required /></>}
          {mode === 'join-band' && <><label htmlFor="bandCode">밴드 초대 코드</label><input id="bandCode" name="bandCode" type="password" maxLength={100} placeholder="리더에게 받은 밴드 코드" autoComplete="off" required /></>}
          {mode === 'recover' && <><label htmlFor="recoveryKey">리더 복구 키</label><input id="recoveryKey" name="recoveryKey" type="password" maxLength={100} placeholder="보관한 복구 키" autoComplete="off" required /></>}
          <button className="primary-button auth-submit" disabled={!supabase} type="submit">{busy ? '처리 중…' : mode === 'login' ? '로그인' : mode === 'create-band' ? '밴드 만들고 리더로 가입' : mode === 'recover' ? 'PIN 재설정' : '초대받은 밴드에 가입'}<ArrowRight size={18} /></button>
        </fieldset>
      </form>}
      {!supabase && <p className="form-message" role="alert">Supabase 연결 설정이 필요합니다.</p>}
      {error && <p role="alert" className="form-message error-message">{error}</p>}
      {message && !secrets && <p role="status" className="form-message">{message}</p>}
      <p className="auth-footnote"><LockKeyhole size={14} />로그인한 우리 밴드 멤버만 데이터를 볼 수 있어요.</p>
      {!secrets && <div className="preview-link"><span>PIN을 잊으셨나요?</span><button type="button" className="text-button" disabled={busy} onClick={() => changeMode(mode === 'recover' ? 'login' : 'recover')}>{mode === 'recover' ? '로그인으로 돌아가기' : '리더 계정 복구'}</button></div>}
      {mode === 'recover' && <p className="auth-description">구성원의 PIN은 밴드 리더가 초기화할 수 있어요.</p>}
    </section>
  </div>
}
