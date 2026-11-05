import { useId, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock3, ExternalLink, Heart, MessageCircle, Pencil, ThumbsDown } from 'lucide-react'
import { formatSongTime, vocalLabel, type CatalogSong } from './model'
import { confirmSong } from './engagement-api'
import { refreshSongLists, useVote } from './Engagement'
import { songKeys } from './api'

export function SongCard({ bandId, song, onEdit, onOpen, onStatus, detail = false }: { bandId: string; song: CatalogSong; onEdit: (song: CatalogSong) => void; onOpen: (id: string) => void; onStatus?: (message: string) => void; detail?: boolean }) {
  const titleId = useId()
  const { engagement, pending, vote, error } = useVote(bandId, song.id)
  const client = useQueryClient()
  const saving = useRef(false)
  const confirmation = useMutation({
    mutationFn: (next: boolean) => confirmSong(bandId, song, next), retry: false,
    onSuccess: async saved => {
      client.setQueryData(songKeys.detail(bandId, song.id), saved)
      onStatus?.(`${saved.title} · 합주 ${saved.is_confirmed ? '확정했습니다.' : '확정을 해제했습니다.'}`)
      await Promise.all([refreshSongLists(client, bandId), client.invalidateQueries({ queryKey: ['home-confirmed', bandId] })])
    },
    onError: () => { void refreshSongLists(client, bandId) },
  })
  async function confirm(next: boolean) {
    if (saving.current) return
    saving.current = true
    try { await confirmation.mutateAsync(next) } catch { /* displayed below */ } finally { saving.current = false }
  }
  return <article className="song-card" id={detail ? undefined : `song-${song.id}`} aria-labelledby={titleId}>
    <div className="song-card-top"><span className={`vocal-badge vocal-${song.vocal_type}`}>{vocalLabel(song.vocal_type)}</span>{song.bpm !== null && <span className="bpm-badge">♩ {song.bpm} BPM</span>}{song.is_confirmed && <span className="confirmed-badge">합주 확정</span>}<button type="button" className="song-edit-button" onClick={() => onEdit(song)} aria-label={`${song.title} 곡 정보 수정`}><Pencil size={14} />수정</button></div>
    <h3 id={titleId}>{detail ? song.title : <button type="button" className="song-title-button" onClick={() => onOpen(song.id)}>{song.title}</button>}</h3><p className="song-artist">{song.artist}</p>
    {song.notes && <details className="song-notes"><summary>특이사항 보기</summary><p>{song.notes}</p></details>}
    <div className="song-card-links">{song.youtube_url && <a href={song.youtube_url} target="_blank" rel="noopener noreferrer" className="youtube-link"><ExternalLink size={14} />YouTube 듣기<span className="sr-only"> (새 탭)</span></a>}</div>
    <label className="song-confirm-control"><input type="checkbox" checked={song.is_confirmed} disabled={confirmation.isPending} onChange={event => { void confirm(event.target.checked) }} />{confirmation.isPending ? '저장 중…' : '합주 확정'}</label>
    <div className="song-card-footer"><div className="vote-controls" aria-label={`${song.title} 투표`}>
      <button type="button" aria-pressed={engagement?.vote === 1} disabled={pending || !engagement} className={engagement?.vote === 1 ? 'selected' : ''} onClick={() => { void vote(1) }} aria-label={`좋아요 ${engagement?.likes ?? song.likes}개`}><Heart size={16} fill={engagement?.vote === 1 ? 'currentColor' : 'none'} />좋아요 <span>{engagement?.likes ?? song.likes}</span></button>
      <button type="button" aria-pressed={engagement?.vote === -1} disabled={pending || !engagement} className={engagement?.vote === -1 ? 'selected' : ''} onClick={() => { void vote(-1) }} aria-label={`별로예요 ${engagement?.dislikes ?? song.dislikes}개`}><ThumbsDown size={16} />별로예요 <span>{engagement?.dislikes ?? song.dislikes}</span></button>
      <button type="button" onClick={() => { if (!detail) onOpen(song.id); else document.getElementById('comment-draft')?.focus() }}><MessageCircle size={16} />댓글 <span>{engagement?.comment_count ?? '—'}</span></button>
    </div><time dateTime={song.created_at} title="등록 시간 · 한국 시간"><Clock3 size={12} />{formatSongTime(song.created_at)}</time></div>
    {(error || confirmation.error) && <p role="alert" className="form-message error-message">{confirmation.error?.message ?? error}</p>}
  </article>
}
export function SongSkeleton() { return <div className="song-skeleton" aria-hidden="true"><span /><span /><span /></div> }
