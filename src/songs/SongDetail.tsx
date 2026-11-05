import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, X } from 'lucide-react'
import { fetchSong, songKeys } from './api'
import { formatSongTime, type Song } from './model'
import { addComment, commentPageSize, engagementKeys, fetchComments, type CommentCursor } from './engagement-api'
import { validateComment } from './engagement-model'
import { refreshEngagement } from './Engagement'
import { SongCollection } from './SongCollection'
import { SongSkeleton } from './SongCard'

function Comments({ bandId, songId }: { bandId: string; songId: string }) {
  const [draft, setDraft] = useState('')
  const [validation, setValidation] = useState('')
  const submitting = useRef(false)
  const client = useQueryClient()
  const key = engagementKeys.comments(bandId, songId)
  const comments = useInfiniteQuery({
    queryKey: key, initialPageParam: null as CommentCursor,
    queryFn: ({ pageParam, signal }) => fetchComments(bandId, songId, pageParam, signal),
    getNextPageParam: last => last.length === commentPageSize ? { created_at: last[last.length - 1].created_at, id: last[last.length - 1].id } : undefined,
  })
  const mutation = useMutation({
    mutationFn: (content: string) => addComment(bandId, songId, content), retry: false,
    onSuccess: async () => {
      setDraft('')
      // Return to the newest page so the new comment is immediately visible.
      await Promise.all([client.resetQueries({ queryKey: key, exact: true }), refreshEngagement(client, bandId)])
    },
  })
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current || mutation.isPending) return
    setValidation('')
    let content: string
    try { content = validateComment(draft) } catch (error) { setValidation((error as Error).message); return }
    submitting.current = true
    try { await mutation.mutateAsync(content) } catch { /* draft is retained */ } finally { submitting.current = false }
  }
  return <section className="song-comments" aria-labelledby="comments-heading"><div className="home-section-heading"><h3 id="comments-heading"><MessageCircle size={18} />익명 댓글</h3><button type="button" className="text-button" disabled={comments.isFetching} onClick={() => { void client.resetQueries({ queryKey: key, exact: true }) }}>최신 댓글 새로고침</button></div><p>작성자 이름은 표시되지 않아요. 최근 댓글부터 보여드립니다.</p>
    <form onSubmit={event => { void submit(event) }}><label htmlFor="comment-draft">댓글 남기기</label><textarea id="comment-draft" rows={3} value={draft} disabled={mutation.isPending} onChange={event => { setDraft(event.target.value); setValidation('') }} placeholder="곡에 대한 생각을 나눠보세요" aria-describedby="comment-count" /><div className="comment-form-footer"><span id="comment-count" className={Array.from(draft).length > 300 ? 'error-message' : ''}>{Array.from(draft).length} / 300자</span><button className="primary-button" type="submit" disabled={mutation.isPending || !draft.trim() || Array.from(draft.trim()).length > 300}>{mutation.isPending ? '등록 중…' : '익명으로 등록'}</button></div></form>
    {(validation || mutation.error) && <p role="alert" className="form-message error-message">{validation || mutation.error?.message}</p>}
    {mutation.isSuccess && <p role="status" className="form-message">댓글을 등록했습니다.</p>}
    {comments.isPending ? <p role="status">댓글을 불러오고 있어요…</p> : comments.error ? <p role="alert" className="form-message error-message">{comments.error.message}<button className="text-button" onClick={() => { void comments.refetch() }}>다시 시도</button></p> : <>
      {!comments.data?.pages[0]?.length && <p className="home-empty">첫 댓글을 남겨보세요.</p>}
      <ul className="anonymous-comments">{comments.data?.pages.flat().map(comment => <li key={comment.id}><span>익명</span><time dateTime={comment.created_at}>{formatSongTime(comment.created_at)}</time><p>{comment.content}</p></li>)}</ul>
      {comments.hasNextPage && <button type="button" className="secondary-button" disabled={comments.isFetchingNextPage} onClick={() => { void comments.fetchNextPage() }}>{comments.isFetchingNextPage ? '불러오는 중…' : '이전 댓글 더 보기'}</button>}
    </>}
  </section>
}
export function SongDetail({ bandId, id, onClose, onEdit, onStatus }: { bandId: string; id: string; onClose: () => void; onEdit: (song: Song) => void; onStatus: (message: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const song = useQuery({ queryKey: songKeys.detail(bandId, id), queryFn: ({ signal }) => fetchSong(bandId, id, signal), staleTime: 0 })
  useEffect(() => {
    const node = dialog.current; const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'; node?.showModal()
    return () => { node?.close(); document.body.style.overflow = overflow }
  }, [])
  return <dialog ref={dialog} className="song-dialog song-detail-dialog" aria-labelledby="song-detail-heading" onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="song-dialog-heading"><h2 id="song-detail-heading">곡 상세</h2><button type="button" className="icon-button" aria-label="곡 상세 닫기" onClick={onClose}><X size={21} /></button></div>
    {song.isPending ? <SongSkeleton /> : song.error ? <p role="alert" className="form-message error-message">{song.error.message}<button className="text-button" onClick={() => { void song.refetch() }}>다시 시도</button></p> : song.data ? <><SongCollection detail bandId={bandId} songs={[{ ...song.data, likes: 0, dislikes: 0 }]} onEdit={onEdit} onOpen={() => {}} onStatus={onStatus} /><Comments bandId={bandId} songId={id} /></> : null}
  </dialog>
}
