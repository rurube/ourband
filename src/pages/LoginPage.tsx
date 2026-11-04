import { useState, type FormEvent } from 'react'
import { ArrowRight, CalendarDays, Eye, EyeOff, Heart, LockKeyhole, Music2, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState('')
  const signup = mode === 'signup'
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('지금은 화면 미리보기 단계예요. 실제 회원가입과 로그인은 Phase 3에서 연결됩니다. 입력한 정보는 전송하거나 저장하지 않습니다.')
  }
  return <div className="login-page">
    <section className="welcome">
      <div className="eyebrow"><span />OUR LITTLE BAND SPACE</div>
      <h1>좋아하는 곡이<br />우리의 <span>합주</span>가 되는 곳<span className="heading-dot">.</span></h1>
      <p className="welcome-description">다음엔 어떤 곡을 연주할까요?<br />곡을 모으고, 마음을 나누고, 함께 소리를 맞춰요.</p>
      <div className="music-art" aria-hidden="true">
        <span className="art-spark spark-one">✦</span><span className="art-spark spark-two">✧</span>
        <div className="record-sleeve"><div className="record"><div className="record-center"><Music2 size={30} /></div></div><span className="record-caption">OUR NEXT TRACK</span></div>
        <div className="floating-note"><Heart size={18} fill="currentColor" /><span>같이 연주하고 싶은 곡</span></div>
        <div className="floating-calendar"><CalendarDays size={19} /><span>우리의 다음 합주</span><span className="tiny-dot" /></div>
      </div>
      <div className="welcome-features"><span><Music2 size={15} />희망곡 모아보기</span><span><Heart size={15} />취향 나누기</span><span><CalendarDays size={15} />합주 준비하기</span></div>
    </section>
    <section className="auth-card" aria-labelledby="auth-heading">
      <span className="auth-icon"><Sparkles size={24} /></span>
      <h2 id="auth-heading">{signup ? '우리 밴드에 합류해요' : '다시 만나서 반가워요'}</h2>
      <p className="auth-description">{signup ? '초대 코드로 함께할 준비를 해주세요.' : '닉네임과 PIN으로 우리 밴드에 들어오세요.'}</p>
      <div className="auth-tabs" role="group" aria-label="인증 화면 선택">
        <button type="button" aria-pressed={!signup} className={!signup ? 'selected' : ''} onClick={() => { setMode('login'); setMessage('') }}>로그인</button>
        <button type="button" aria-pressed={signup} className={signup ? 'selected' : ''} onClick={() => { setMode('signup'); setMessage('') }}>회원가입</button>
      </div>
      <form onSubmit={submit}>
        <label htmlFor="nickname">닉네임</label>
        <input id="nickname" name="nickname" placeholder="밴드에서 사용하는 닉네임" autoComplete="username" maxLength={30} required />
        <div className="field-label"><label htmlFor="pin">개인 PIN</label><span>숫자 6~12자리</span></div>
        <div className="password-field"><input id="pin" name="pin" type={visible ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete={signup ? 'new-password' : 'current-password'} placeholder="PIN을 입력해주세요" title="숫자 6~12자리를 입력해주세요" required /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'PIN 숨기기' : 'PIN 표시'} aria-pressed={visible}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
        {signup && <><label htmlFor="invite">밴드 초대 코드</label><input id="invite" name="invite" type="password" placeholder="전달받은 초대 코드" autoComplete="off" required /></>}
        <button className="primary-button auth-submit" type="submit">{signup ? '회원가입 UI 확인' : '로그인 UI 확인'}<ArrowRight size={18} /></button>
        {message && <p role="status" className="form-message">{message}</p>}
      </form>
      <p className="auth-footnote"><LockKeyhole size={14} />이메일 없이, 우리끼리 편하게.</p>
      <div className="preview-link"><span>먼저 둘러보고 싶으신가요?</span><Link to="/songs">화면 미리보기<ArrowRight size={14} /></Link></div>
    </section>
  </div>
}
