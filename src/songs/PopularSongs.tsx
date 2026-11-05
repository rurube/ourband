import { useQuery } from '@tanstack/react-query'
import { Heart } from 'lucide-react'
import { engagementKeys, fetchPopular } from './engagement-api'
export function PopularSongs({ bandId, onOpen }: { bandId: string; onOpen: (id: string) => void }) {
  const popular = useQuery({ queryKey: engagementKeys.popular(bandId), queryFn: ({ signal }) => fetchPopular(bandId, signal) })
  return <div className="popular-grid">{['여보컬', '남보컬'].map((type, index) => {
    const song = popular.data?.[index]
    return <section className={`popular-card ${index === 1 ? 'peach' : ''}`} key={type}><span className="card-kicker"><Heart size={15} />{type} 좋아요 1위</span>{popular.isPending ? <p role="status">인기곡을 불러오고 있어요…</p> : popular.error ? <p role="alert">{popular.error.message}<button className="text-button" onClick={() => { void popular.refetch() }}>다시 시도</button></p> : song ? <button className="popular-song-button" onClick={() => onOpen(song.id)}><strong>{song.title}</strong><p>{song.artist} · 좋아요 {song.likes}개</p><span>곡과 댓글 보기 →</span></button> : <><h2>아직 인기곡이 없어요</h2><p>미확정곡에 첫 좋아요를 남겨보세요.</p></>}<span className="popular-decoration" aria-hidden="true">♪</span></section>
  })}</div>
}
