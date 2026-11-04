import { CalendarDays, LogIn, Music2, Sparkles } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'

const navigation = [
  { to: '/songs', label: '희망곡', icon: Music2 },
  { to: '/rehearsals', label: '합주 관리', icon: CalendarDays },
]

export function Layout() {
  const { pathname } = useLocation()
  useEffect(() => {
    const title = pathname === '/songs' ? '희망곡' : pathname === '/rehearsals' ? '합주 관리' : '로그인'
    document.title = `${title} · 우리의 합주`
    window.scrollTo(0, 0)
  }, [pathname])

  return <>
    <a href="#main" className="skip-link" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus() }}>본문으로 건너뛰기</a>
    <header className="site-header">
      <div className="header-inner">
        <NavLink to="/login" className="brand" aria-label="우리의 합주 홈">
          <span className="brand-icon"><Music2 size={23} /></span>
          <span>우리의 합주<small>MY BAND, OUR SOUND</small></span>
        </NavLink>
        <nav className="desktop-nav" aria-label="주 메뉴">
          {navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Icon size={17} />{label}</NavLink>)}
        </nav>
        <NavLink to="/login" className="login-link"><LogIn size={16} /><span>로그인</span></NavLink>
      </div>
    </header>
    <div className="phase-notice"><Sparkles size={14} /><span>Phase 1 · 화면 미리보기 <span className="notice-detail">— 실제 인증과 데이터 저장은 아직 연결되지 않았어요.</span></span></div>
    <main id="main" className="main-container" tabIndex={-1}><Outlet /></main>
    <footer className="site-footer"><Music2 size={14} />함께 고르고, 함께 맞추고, 우리의 음악으로.</footer>
    <nav className="mobile-nav" aria-label="모바일 메뉴">
      {navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={20} />{label}</NavLink>)}
      <NavLink to="/login" className={({ isActive }) => isActive ? 'active' : ''}><LogIn size={20} />로그인</NavLink>
    </nav>
  </>
}
