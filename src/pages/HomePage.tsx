import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, CheckCheck, Home, RefreshCw, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth, type Profile } from '../auth/AuthProvider'
import { fetchConfirmed, fetchRehearsals, overviewPageSize, seoulToday } from '../home/api'

function Pagination({ page, total, change, label }: { page: number; total: number; change: (page: number) => void; label: string }) {
  if (total <= overviewPageSize && page === 0) return null
  return <nav className="song-pagination" aria-label={label}><button disabled={page === 0} onClick={() => change(page - 1)}>이전</button><span>{page + 1} / {Math.max(1, Math.ceil(total / overviewPageSize))}</span><button disabled={(page + 1) * overviewPageSize >= total} onClick={() => change(page + 1)}>다음</button></nav>
}
function BandOverview({ band }: { band: Profile }) {
  const { selectBand } = useAuth()
  const [songPage, setSongPage] = useState(0)
  const [datePage, setDatePage] = useState(0)
  const [past, setPast] = useState(false)
  const today = seoulToday()
  const songs = useQuery({ queryKey: ['home-confirmed', band.band_id, songPage], queryFn: ({ signal }) => fetchConfirmed(band.band_id, songPage, signal), staleTime: 30_000, refetchInterval: 60_000 })
  const dates = useQuery({ queryKey: ['home-rehearsals', band.band_id, past, today, datePage], queryFn: ({ signal }) => fetchRehearsals(band.band_id, datePage, past, today, signal), staleTime: 30_000, refetchInterval: 60_000 })
  return <section className="panel home-band" aria-labelledby={`band-${band.band_id}`}>
    <div className="home-band-heading"><div><h2 id={`band-${band.band_id}`}><Users size={20} />{band.bandName}</h2><p>{band.nickname} · {band.band_role === 'leader' ? '리더' : '멤버'}</p></div><Link className="secondary-button" to="/songs" onClick={() => selectBand(band.band_id)}>이 밴드 희망곡 보기</Link></div>
    <div className="home-band-columns">
      <section><div className="home-section-heading"><h3><CalendarDays size={18} />합주 일정{dates.data && <small>{dates.data.total}건</small>}</h3><button className="text-button" disabled={dates.isFetching} aria-label={`${band.bandName} 일정 새로고침`} onClick={() => { void dates.refetch() }}><RefreshCw size={15} /></button></div>
        <div className="rehearsal-tabs" role="group" aria-label={`${band.bandName} 합주 기간`}>{[false, true].map(value => <button key={String(value)} aria-pressed={past === value} className={past === value ? 'selected' : ''} onClick={() => { setPast(value); setDatePage(0) }}>{value ? '지난 합주' : '다가오는 합주'}</button>)}</div>
        {dates.isPending ? <p role="status">일정을 불러오고 있어요…</p> : dates.error ? <p role="alert" className="error-message">{dates.error.message}</p> : <>
          {!dates.data.items.length && <p className="home-empty">{past ? '지난 합주가 없습니다.' : '등록된 예정 합주가 없습니다.'}</p>}
          <ul className="home-schedule-list">{dates.data.items.map(date => <li key={date.id}><time dateTime={date.rehearsal_date}>{new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' }).format(new Date(`${date.rehearsal_date}T00:00:00+09:00`))}</time>{date.rehearsal_date === today && <span className="confirmed-badge">오늘</span>}
            {date.rehearsal_songs.length ? <ol>{[...date.rehearsal_songs].sort((a,b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)).map(track => <li key={track.id}>{track.songs ? <>{track.songs.title}<span> · {track.songs.artist}</span></> : '곡 정보를 불러올 수 없습니다.'}</li>)}</ol> : <p>이 날짜에 배정된 곡이 없습니다.</p>}</li>)}</ul>
          <Pagination page={datePage} total={dates.data.total} change={setDatePage} label={`${band.bandName} 일정 페이지`} />
        </>}
      </section>
      <section><div className="home-section-heading"><h3><CheckCheck size={18} />합주 확정곡{songs.data && <small>{songs.data.total}곡</small>}</h3><button className="text-button" disabled={songs.isFetching} aria-label={`${band.bandName} 확정곡 새로고침`} onClick={() => { void songs.refetch() }}><RefreshCw size={15} /></button></div><p className="home-section-note">희망곡에서 합주 확정으로 표시한 곡입니다.</p>
        {songs.isPending ? <p role="status">확정곡을 불러오고 있어요…</p> : songs.error ? <p role="alert" className="error-message">{songs.error.message}</p> : <>
          {!songs.data.items.length && <p className="home-empty">아직 확정한 곡이 없습니다.</p>}
          <ul className="home-song-list">{songs.data.items.map(song => <li key={song.id}><strong>{song.title}</strong><span>{song.artist}</span></li>)}</ul>
          <Pagination page={songPage} total={songs.data.total} change={setSongPage} label={`${band.bandName} 확정곡 페이지`} />
        </>}
      </section>
    </div>
  </section>
}
export function HomePage() {
  const { memberships } = useAuth()
  return <div className="dashboard-page home-page"><div className="page-heading"><div><div className="eyebrow">ALL MY BANDS</div><h1>우리의 다음 합주 <Home size={27} /></h1><p>소속된 모든 밴드의 일정과 확정곡을 한눈에 확인하세요.</p></div><Link to="/band" className="secondary-button">밴드 참여·관리</Link></div>
    <p className="home-scope-note">전체 {memberships.length}개 밴드 · 상단에서 선택한 밴드와 관계없이 모두 표시됩니다. 일정은 한국 시간 기준입니다.</p>
    {!memberships.length && <section className="panel home-band"><h2>함께할 밴드에 참여해보세요</h2><p>밴드를 만들거나 초대 코드로 참여하면 이곳에서 일정과 확정곡을 확인할 수 있어요.</p><Link className="primary-button" to="/band">밴드 참여하기</Link></section>}
    {memberships.map(band => <BandOverview key={band.band_id} band={band} />)}
  </div>
}
