import { Clock3, ExternalLink, Heart, Pencil, ThumbsDown } from 'lucide-react'
import { formatSongTime, vocalLabel, type CatalogSong } from './model'

export function SongCard({ song, onEdit }: { song: CatalogSong; onEdit: (song: CatalogSong) => void }) {
  return <article className="song-card" id={`song-${song.id}`} aria-labelledby={`title-${song.id}`}>
    <div className="song-card-top"><span className={`vocal-badge vocal-${song.vocal_type}`}>{vocalLabel(song.vocal_type)}</span>{song.bpm !== null && <span className="bpm-badge">♩ {song.bpm} BPM</span>}{song.is_confirmed && <span className="confirmed-badge">합주 확정</span>}<button type="button" className="song-edit-button" onClick={() => onEdit(song)} aria-label={`${song.title} 곡 정보 수정`}><Pencil size={14} />수정</button></div>
    <h3 id={`title-${song.id}`}>{song.title}</h3><p className="song-artist">{song.artist}</p>
    {song.notes && <details className="song-notes"><summary>특이사항 보기</summary><p>{song.notes}</p></details>}
    <div className="song-card-links">{song.youtube_url && <a href={song.youtube_url} target="_blank" rel="noopener noreferrer" className="youtube-link"><ExternalLink size={14} />YouTube 듣기<span className="sr-only"> (새 탭)</span></a>}</div>
    <div className="song-card-footer"><span className="song-score" aria-label={`좋아요 ${song.likes}개, 별로예요 ${song.dislikes}개`}><span><Heart size={14} />{song.likes}</span><span><ThumbsDown size={14} />{song.dislikes}</span></span><time dateTime={song.created_at} title="등록 시간 · 한국 시간"><Clock3 size={12} />{formatSongTime(song.created_at)}</time></div>
  </article>
}
export function SongSkeleton() {
  return <div className="song-skeleton" aria-hidden="true"><span /><span /><span /></div>
}
