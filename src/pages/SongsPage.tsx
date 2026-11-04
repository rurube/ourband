import { useState } from 'react'
import { ChevronDown, Clock3, Heart, ListMusic, Music2, Plus, Search } from 'lucide-react'
import { EmptyState, PreviewBadge } from '../components/EmptyState'

export function SongsPage() {
  const [search, setSearch] = useState('')
  const [vocal, setVocal] = useState('전체')
  return <div className="dashboard-page">
    <div className="page-heading"><div><div className="eyebrow">OUR PLAYLIST</div><h1>다음에 함께 연주할 곡 <Music2 size={28} /></h1><p>좋아하는 곡을 추천하고, 우리 밴드의 다음 곡을 골라요.</p></div><button className="primary-button" disabled title="곡 등록은 Phase 4에서 연결됩니다"><Plus size={18} />곡 등록</button></div>
    <PreviewBadge />
    <div className="dashboard-grid">
      <div className="songs-main">
        <div className="popular-grid">
          {['여보컬', '남보컬'].map((type, index) => <section className={`popular-card ${index === 1 ? 'peach' : ''}`} key={type}><span className="card-kicker"><Heart size={15} />{type} 좋아요 1위</span><h2>첫 인기곡을 기다리고 있어요</h2><p>미확정곡 중 좋아요를 받은 곡이 표시돼요.</p><span className="popular-decoration" aria-hidden="true">♪</span></section>)}
        </div>
        <section className="panel song-panel"><div className="section-title"><h2><ListMusic size={20} />희망곡 목록</h2><span className="muted">아직 데이터 미연결</span></div>
          <div className="filter-row"><div className="search-field"><Search size={18} /><input aria-label="곡 제목 또는 가수 검색" placeholder="곡 제목이나 가수를 검색해보세요" value={search} onChange={e => setSearch(e.target.value)} /></div><select aria-label="희망곡 정렬" defaultValue="likes"><option value="likes">좋아요 많은 순</option><option value="recent">최신 등록 순</option><option value="net">순추천순</option></select></div>
          <div className="filter-tabs" role="group" aria-label="보컬 구분">{['전체', '여보컬', '남보컬', '혼성', '연주곡'].map(type => <button key={type} aria-pressed={type === vocal} className={type === vocal ? 'selected' : ''} onClick={() => setVocal(type)}>{type}</button>)}</div>
          <EmptyState icon={Music2} title="우리의 플레이리스트를 준비하고 있어요" description="Phase 4에서 곡 등록·검색·필터가 실제 데이터와 연결됩니다." />
          <p className="panel-note">검색·정렬·보컬 선택은 화면 구성 확인용입니다. 실제 조회는 수행하지 않습니다.</p>
        </section>
        <details className="panel confirmed-panel"><summary><span><Music2 size={18} />합주 확정곡 <span className="count-badge">—</span></span><ChevronDown size={18} /></summary><EmptyState icon={ListMusic} title="확정곡 표시 영역" description="Phase 5에서 확정한 곡을 이곳에서 모아볼 수 있어요." /></details>
      </div>
      <aside className="panel recent-panel"><div className="section-title"><h2><Clock3 size={18} />최근 추가된 곡</h2><span className="small-label">최근 5곡</span></div><EmptyState icon={Plus} title="새로운 곡이 기다려져요" description="등록한 곡의 제목, 가수, 등록 시간과 확정 여부가 표시됩니다." /><div className="tip"><span>작은 취향이 모여,</span><strong>우리만의 셋리스트가 돼요.</strong><Heart size={21} /></div></aside>
    </div>
  </div>
}
