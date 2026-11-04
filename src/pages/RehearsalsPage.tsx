import { useState } from 'react'
import { CalendarDays, Guitar, Plus, Users } from 'lucide-react'
import { EmptyState, PreviewBadge } from '../components/EmptyState'

export function RehearsalsPage() {
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  return <div className="dashboard-page">
    <div className="page-heading"><div><div className="eyebrow">LET’S PLAY TOGETHER</div><h1>우리의 합주 일정 <CalendarDays size={28} /></h1><p>함께할 날짜부터 세션 배정까지, 한곳에서 준비해요.</p></div><button className="primary-button" disabled title="일정 등록은 Phase 6에서 연결됩니다"><Plus size={18} />일정 등록</button></div>
    <PreviewBadge />
    <div className="rehearsal-intro"><span className="intro-icon"><Guitar size={32} /></span><div><h2>같은 곡, 함께 만드는 새로운 소리</h2><p>날짜별로 연주할 곡과 멤버를 정리하고 지난 합주도 모아보세요.</p></div><span className="intro-note" aria-hidden="true">♫</span></div>
    <div className="dashboard-grid"><section className="panel rehearsal-panel"><div className="rehearsal-tabs" role="group" aria-label="합주 기간"><button aria-pressed={tab === 'upcoming'} className={tab === 'upcoming' ? 'selected' : ''} onClick={() => setTab('upcoming')}>합주 예정</button><button aria-pressed={tab === 'past'} className={tab === 'past' ? 'selected' : ''} onClick={() => setTab('past')}>지난 합주</button></div><EmptyState icon={CalendarDays} title={tab === 'upcoming' ? '다음 합주를 위한 빈 페이지' : '함께한 기록이 쌓일 공간'} description={tab === 'upcoming' ? '실제 일정 등록과 날짜별 곡 선택은 Phase 6에서 시작됩니다.' : '오늘 이전의 합주가 최근 날짜순으로 표시될 예정입니다.'} /></section>
      <aside className="panel session-guide"><h2><Users size={19} />세션도 함께 준비해요</h2><p>곡마다 여러 멤버를 배정할 수 있도록 구성할 예정이에요.</p><div className="session-tags">{['보컬', '기타 1', '기타 2', '베이스', '드럼', '건반', '기타 세션'].map(session => <span key={session}>{session}</span>)}</div><div className="guide-note"><Guitar size={17} /><p>예정 합주곡 옆에는 지난 날짜의 기록으로 계산한 <strong>합주 N회</strong>가 표시됩니다.</p></div></aside>
    </div>
  </div>
}
