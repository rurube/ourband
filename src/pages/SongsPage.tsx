import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronLeft, ChevronRight, Clock3, Heart, ListMusic, Music2, Plus, RefreshCw, Search } from 'lucide-react'
import { EmptyState } from '../components/EmptyState'
import { useAuth } from '../auth/AuthProvider'
import { fetchCatalog, fetchRecentSongs, fetchSong, pageSize, songKeys, type CatalogFilters } from '../songs/api'
import { formatSongTime, vocalOptions, type Song, type SongSort } from '../songs/model'
import { SongEditor } from '../songs/SongEditor'
import { SongCard, SongSkeleton } from '../songs/SongCard'

const initialFilters: CatalogFilters = { search: '', vocal: null, sort: 'likes', confirmed: false, page: 0 }
export function SongsPage() {
  const { profile } = useAuth()
  const bandId = profile!.band_id
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<CatalogFilters>(initialFilters)
  const [expanded, setExpanded] = useState(false)
  const [confirmedPage, setConfirmedPage] = useState(0)
  const [editor, setEditor] = useState<{ initial: Song | null } | null>(null)
  const [notice, setNotice] = useState('')
  const [detailError, setDetailError] = useState('')
  const [openingId, setOpeningId] = useState<string | null>(null)
  const opening = useRef(false)
  const queryClient = useQueryClient()
  useEffect(() => {
    const timer = setTimeout(() => setFilters(old => old.search === search.trim() ? old : { ...old, search: search.trim(), page: 0 }), 300)
    return () => clearTimeout(timer)
  }, [search])
  const catalog = useQuery({ queryKey: songKeys.catalog(bandId, filters), queryFn: ({ signal }) => fetchCatalog(filters, signal) })
  const confirmedFilters = { ...initialFilters, confirmed: true, sort: 'recent' as const, page: confirmedPage }
  const confirmed = useQuery({ queryKey: songKeys.catalog(bandId, confirmedFilters), enabled: expanded, queryFn: ({ signal }) => fetchCatalog(confirmedFilters, signal) })
  const recent = useQuery({ queryKey: songKeys.recent(bandId), queryFn: ({ signal }) => fetchRecentSongs(bandId, signal) })
  const totalPages = Math.max(1, Math.ceil((catalog.data?.total ?? 0) / pageSize))
  const confirmedTotal = catalog.data?.confirmed_total ?? confirmed.data?.total
  const searching = search.trim() !== filters.search
  // Other members may remove a matching row from the current page. Return to the
  // last valid page, rather than presenting an apparently empty catalog.
  useEffect(() => {
    if (catalog.data && !catalog.isFetching && filters.page >= totalPages) setFilters(old => ({ ...old, page: totalPages - 1 }))
  }, [catalog.data, catalog.isFetching, filters.page, totalPages])
  useEffect(() => {
    if (confirmed.data && !confirmed.isFetching) {
      const last = Math.max(0, Math.ceil(confirmed.data.total / pageSize) - 1)
      if (confirmedPage > last) setConfirmedPage(last)
    }
  }, [confirmed.data, confirmed.isFetching, confirmedPage])
  async function openRecent(id: string) {
    if (opening.current) return
    opening.current = true; setOpeningId(id); setDetailError(''); setNotice('')
    try {
      const song = await queryClient.fetchQuery({ queryKey: songKeys.detail(bandId, id), queryFn: ({ signal }) => fetchSong(bandId, id, signal), staleTime: 0 })
      setEditor({ initial: song })
    } catch (error) { setDetailError(error instanceof Error ? error.message : '곡 정보를 열지 못했습니다.') }
    finally { opening.current = false; setOpeningId(null) }
  }
  function page(next: number) {
    setFilters(old => ({ ...old, page: next }))
    document.getElementById('song-list-heading')?.scrollIntoView({ block: 'start' })
  }
  return <div className="dashboard-page">
    <div className="page-heading"><div><div className="eyebrow">OUR PLAYLIST · {profile?.bandName}</div><h1>다음에 함께 연주할 곡 <Music2 size={28} /></h1><p>우리 밴드의 희망곡을 모으고, 함께 연주할 곡을 찾아요.</p></div><button className="primary-button" onClick={() => { setNotice(''); setEditor({ initial: null }) }} disabled={!!openingId}><Plus size={18} />곡 등록</button></div>
    {notice && <p className="form-message song-success" role="status">{notice}</p>}
    <div className="dashboard-grid">
      <div className="songs-main">
        <div className="popular-grid">{['여보컬', '남보컬'].map((type, index) => <section className={`popular-card ${index === 1 ? 'peach' : ''}`} key={type}><span className="card-kicker"><Heart size={15} />{type} 좋아요 1위<span className="coming-soon-badge">준비 중</span></span><h2>우리 밴드의 인기곡은?</h2><p>투표와 인기곡 대시보드는 다음 업데이트에 열려요.</p><span className="popular-decoration" aria-hidden="true">♪</span></section>)}</div>
        <section className="panel song-panel" aria-busy={catalog.isFetching}>
          <div className="section-title"><h2 id="song-list-heading"><ListMusic size={20} />희망곡 목록 <span className="count-badge">{catalog.data?.total ?? '—'}</span></h2><button className="icon-button" disabled={catalog.isFetching} onClick={() => { void catalog.refetch() }} aria-label="희망곡 새로고침"><RefreshCw size={16} /></button></div>
          <div className="filter-row"><div className="search-field"><Search size={18} /><input aria-label="곡 제목 또는 가수 검색" placeholder="곡 제목이나 가수를 검색해보세요" maxLength={200} value={search} onChange={e => setSearch(e.target.value)} /></div><select aria-label="희망곡 정렬" value={filters.sort} onChange={e => setFilters(old => ({ ...old, sort: e.target.value as SongSort, page: 0 }))}><option value="likes">좋아요 많은 순</option><option value="recent">최신 등록 순</option><option value="net">순추천순</option></select></div>
          <div className="filter-tabs" role="group" aria-label="보컬 구분"><button aria-pressed={filters.vocal === null} className={filters.vocal === null ? 'selected' : ''} onClick={() => setFilters(old => ({ ...old, vocal: null, page: 0 }))}>전체</button>{vocalOptions.map(option => <button key={option.value} aria-pressed={filters.vocal === option.value} className={filters.vocal === option.value ? 'selected' : ''} onClick={() => setFilters(old => ({ ...old, vocal: option.value, page: 0 }))}>{option.label}</button>)}</div>
          <p className="catalog-status" role="status">{searching ? '검색어를 입력하고 있어요…' : catalog.isFetching ? '희망곡을 불러오고 있어요…' : catalog.data ? `${catalog.data.total}곡 · ${filters.page + 1} / ${totalPages}페이지` : ''}</p>
          {catalog.error && <div role="alert" className="form-message error-message">{catalog.error.message}<button className="text-button" onClick={() => { void catalog.refetch() }} disabled={catalog.isFetching}>다시 시도</button></div>}
          {catalog.isPending ? <><SongSkeleton /><SongSkeleton /><SongSkeleton /></> : catalog.data?.songs.length ? <div className="song-list">{catalog.data.songs.map(song => <SongCard key={song.id} song={song} onEdit={initial => { setNotice(''); setEditor({ initial }) }} />)}</div> : !catalog.error ? <EmptyState icon={Music2} title={filters.search || filters.vocal ? '찾으시는 곡이 아직 없어요' : '첫 희망곡을 들려주세요'} description={filters.search || filters.vocal ? '검색어나 보컬 구분을 바꿔보세요.' : '위의 곡 등록 버튼으로 함께 연주하고 싶은 곡을 추가해보세요.'} /> : null}
          {catalog.data && totalPages > 1 && <nav className="song-pagination" aria-label="희망곡 페이지"><button disabled={filters.page === 0 || catalog.isFetching} onClick={() => page(filters.page - 1)}><ChevronLeft size={15} />이전</button><span>{filters.page + 1} / {totalPages}</span><button disabled={filters.page >= totalPages - 1 || filters.page >= 5000 || catalog.isFetching} onClick={() => page(filters.page + 1)}>다음<ChevronRight size={15} /></button></nav>}
          <p className="panel-note">좋아요·별로예요 수는 조회만 할 수 있어요. 투표·댓글 기능은 다음 업데이트에 연결됩니다.</p>
        </section>
        <details className="panel confirmed-panel" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}><summary><span><Music2 size={18} />합주 확정곡 <span className="count-badge">{confirmedTotal ?? '—'}</span></span><ChevronDown size={18} /></summary>
          {expanded && <div className="confirmed-content">{confirmed.isPending ? <SongSkeleton /> : confirmed.error ? <p className="form-message error-message" role="alert">{confirmed.error.message}<button className="text-button" onClick={() => { void confirmed.refetch() }}>다시 시도</button></p> : confirmed.data?.songs.length ? <>{confirmed.data.songs.map(song => <SongCard key={song.id} song={song} onEdit={initial => setEditor({ initial })} />)}<nav className="song-pagination" aria-label="합주 확정곡 페이지"><button disabled={confirmedPage === 0 || confirmed.isFetching} onClick={() => setConfirmedPage(old => old - 1)}>이전</button><span>{confirmedPage + 1} / {Math.max(1, Math.ceil(confirmed.data.total / pageSize))}</span><button disabled={(confirmedPage + 1) * pageSize >= confirmed.data.total || confirmedPage >= 5000 || confirmed.isFetching} onClick={() => setConfirmedPage(old => old + 1)}>다음</button></nav></> : <EmptyState icon={ListMusic} title="아직 합주 확정곡이 없어요" description="확정 상태 변경 기능은 다음 업데이트에 제공됩니다." />}</div>}
        </details>
      </div>
      <aside className="panel recent-panel"><div className="section-title"><h2><Clock3 size={18} />최근 추가된 곡</h2><span className="small-label">최근 5곡</span></div>
        {recent.isPending ? <SongSkeleton /> : recent.error ? <div className="form-message error-message" role="alert">{recent.error.message}<button className="text-button" onClick={() => { void recent.refetch() }}>다시 시도</button></div> : recent.data?.length ? <ul className="recent-song-list">{recent.data.map(song => <li key={song.id}><button disabled={!!openingId} onClick={() => { void openRecent(song.id) }} aria-label={`${song.title} 곡 정보 열기`}><strong>{song.title}</strong><span>{song.artist}</span><time dateTime={song.created_at}>{formatSongTime(song.created_at)}</time>{song.is_confirmed && <span className="confirmed-badge">합주 확정</span>}{openingId === song.id && <span role="status">불러오는 중…</span>}</button></li>)}</ul> : <EmptyState icon={Plus} title="새로운 곡이 기다려져요" description="곡을 등록하면 제목, 가수, 등록 시간과 확정 여부를 볼 수 있어요." />}
        {detailError && <p className="form-message error-message" role="alert">{detailError}</p>}<div className="tip"><span>작은 취향이 모여,</span><strong>우리만의 셋리스트가 돼요.</strong><Heart size={21} /></div>
      </aside>
    </div>
    {editor && <SongEditor key={editor.initial?.id ?? 'new'} bandId={bandId} initial={editor.initial} onClose={() => setEditor(null)} onSaved={song => { setNotice(`${song.title} · ${editor.initial ? '수정했습니다.' : '희망곡을 등록했습니다.'}`); setEditor(null) }} />}
  </div>
}
