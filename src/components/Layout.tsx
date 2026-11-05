import { CalendarDays, LogIn, LogOut, Music2, Sparkles, Users } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'

const navigation = [
  { to: '/songs', label: '희망곡', icon: Music2 },
  { to: '/rehearsals', label: '합주 관리', icon: CalendarDays },
  { to: '/band', label: '우리 밴드', icon: Users },
]

export function Layout() {
  const { session, account, profile, memberships, selectBand, logout } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function signOut() {
    if (busy) return
    setBusy(true); setError('')
    try { await logout() } catch (e) { setError(e instanceof Error ? e.message : '로그아웃하지 못했습니다.') } finally { setBusy(false) }
  }
  const { pathname } = useLocation()
  useEffect(() => {
    const title = pathname === '/songs' ? '희망곡' : pathname === '/rehearsals' ? '합주 관리' : pathname === '/band' ? '내 계정과 밴드' : '로그인'
    document.title = `${title} · 우리의 합주`
    window.scrollTo(0, 0)
  }, [pathname])

  return <>
    <a href="#main" className="skip-link" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus() }}>본문으로 건너뛰기</a>
    <header className="site-header">
      <div className="header-inner">
        <NavLink to={session ? "/songs" : "/login"} className="brand" aria-label="우리의 합주 홈">
          <span className="brand-icon"><Music2 size={23} /></span>
          <span>우리의 합주<small>MY BAND, OUR SOUND</small></span>
        </NavLink>
        {session && <nav className="desktop-nav" aria-label="주 메뉴">
          {navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Icon size={17} />{label}</NavLink>)}
        </nav>}
        <div className="account-area">{account && <span className="account-name">{profile?.nickname ?? account.login_id}</span>}{session ? <button className="login-link" disabled={busy} onClick={() => { void signOut() }}><LogOut size={16} /><span>{busy ? '처리 중' : '로그아웃'}</span></button> : <NavLink to="/login" className="login-link"><LogIn size={16} /><span>로그인</span></NavLink>}</div>
      </div>
      {session && <div className="band-switch-strip"><label htmlFor="active-band">현재 밴드</label><select id="active-band" aria-label="현재 밴드 선택" value={profile?.band_id ?? ''} onChange={e => selectBand(e.target.value)}>{!memberships.length && <option value="">참여한 밴드 없음</option>}{memberships.map(item => <option key={item.band_id} value={item.band_id}>{item.bandName} · {item.nickname} ({item.band_role === 'leader' ? '리더' : '멤버'})</option>)}</select><NavLink to="/band">밴드 추가·내 계정</NavLink></div>}
    </header>
    <div className="phase-notice"><Sparkles size={14} /><span>Phase 4 · 우리 밴드의 희망곡 <span className="notice-detail">— 곡 등록·수정·검색을 사용할 수 있어요. 합주·투표 기능은 준비 중입니다.</span></span></div>
    {error && <p className="form-message error-message" role="alert">{error}</p>}
    <main id="main" className="main-container" tabIndex={-1}><Outlet /></main>
    <footer className="site-footer"><Music2 size={14} />함께 고르고, 함께 맞추고, 우리의 음악으로.</footer>
    <nav className="mobile-nav" aria-label="모바일 메뉴">
      {session && navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={20} />{label}</NavLink>)}
      {!session && <NavLink to="/login" className={({ isActive }) => isActive ? 'active' : ''}><LogIn size={20} />로그인</NavLink>}
    </nav>
  </>
}
