import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Music2, Save, X } from 'lucide-react'
import { blankDraft, draftFromSong, SongValidationError, validateSongDraft, vocalOptions, type Song, type SongDraft, type SongField, type SongPayload } from './model'
import { fetchSong, saveSong, songKeys, SongConflictError } from './api'

interface Props { bandId: string; initial: Song | null; onClose: () => void; onSaved: (song: Song) => void }
export function SongEditor({ bandId, initial, onClose, onSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const submitting = useRef(false)
  const [original, setOriginal] = useState(initial)
  // Initialized once; list refetches and errors never replace an in-progress draft.
  const [draft, setDraft] = useState<SongDraft>(() => initial ? draftFromSong(initial) : { ...blankDraft })
  const [validation, setValidation] = useState<{ field: SongField; message: string } | null>(null)
  const [reloadError, setReloadError] = useState('')
  const [reloading, setReloading] = useState(false)
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (payload: SongPayload) => saveSong(bandId, payload, original),
    retry: false,
    onSuccess: saved => {
      queryClient.setQueryData(songKeys.detail(bandId, saved.id), saved)
      // Invalidate only this band's song queries. Active lists refresh; other
      // screens and inactive catalog pages do not make immediate network calls.
      void queryClient.invalidateQueries({ queryKey: songKeys.band(bandId) })
      void queryClient.invalidateQueries({ queryKey: ['home-confirmed', bandId] })
      void queryClient.invalidateQueries({ queryKey: ['home-rehearsals', bandId] })
      onSaved(saved)
    },
    onError: () => {
      // A request timeout may occur after a commit. Refresh lists while retaining
      // the draft so the user can see an already-saved/duplicate song safely.
      void queryClient.invalidateQueries({ queryKey: songKeys.band(bandId) })
    },
  })
  const busy = mutation.isPending || reloading
  useEffect(() => {
    const node = dialog.current
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    node?.showModal()
    const title = form.current?.elements.namedItem('title')
    if (title instanceof HTMLElement) title.focus()
    return () => { node?.close(); document.body.style.overflow = overflow }
  }, [])
  function update(field: SongField, value: string) {
    setDraft(old => ({ ...old, [field]: value }))
    if (validation?.field === field) setValidation(null)
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current || busy) return
    setValidation(null); setReloadError('')
    let payload: SongPayload
    try { payload = validateSongDraft(draft) }
    catch (error) {
      if (error instanceof SongValidationError) {
        setValidation({ field: error.field, message: error.message })
        const element = form.current?.elements.namedItem(error.field)
        if (element instanceof HTMLElement) element.focus()
      }
      return
    }
    submitting.current = true
    try { await mutation.mutateAsync(payload) } catch { /* mutation.error is rendered below */ }
    finally { submitting.current = false }
  }
  async function reloadLatest() {
    if (!original || busy) return
    setReloading(true); setReloadError('')
    try {
      const latest = await fetchSong(bandId, original.id)
      setOriginal(latest); setDraft(draftFromSong(latest)); setValidation(null); mutation.reset()
    } catch (error) { setReloadError(error instanceof Error ? error.message : '최신 정보를 불러오지 못했습니다.') }
    finally { setReloading(false) }
  }
  const invalid = (field: SongField) => validation?.field === field
  return <dialog ref={dialog} className="song-dialog" aria-labelledby="song-editor-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <div className="song-dialog-heading"><div><span className="eyebrow">OUR NEXT SONG</span><h2 id="song-editor-title"><Music2 size={22} />{original ? '곡 정보 수정' : '새로운 희망곡'}</h2></div><button type="button" className="icon-button" disabled={busy} aria-label="곡 입력창 닫기" onClick={onClose}><X size={21} /></button></div>
    <p className="song-form-intro">{original ? '우리 밴드의 누구나 곡 정보를 수정할 수 있어요.' : '우리 밴드와 함께 연주하고 싶은 곡을 알려주세요.'} <span>* 필수</span></p>
    <form ref={form} onSubmit={event => { void submit(event) }}>
      <fieldset disabled={busy}>
        <div className="song-form-grid"><div><label htmlFor="song-title">곡 제목 *</label><input id="song-title" name="title" value={draft.title} maxLength={400} required aria-invalid={invalid('title')} aria-describedby={invalid('title') ? 'song-validation' : undefined} onChange={e => update('title', e.target.value)} placeholder="곡 제목" /></div><div><label htmlFor="song-artist">가수 *</label><input id="song-artist" name="artist" value={draft.artist} maxLength={400} required aria-invalid={invalid('artist')} aria-describedby={invalid('artist') ? 'song-validation' : undefined} onChange={e => update('artist', e.target.value)} placeholder="가수 또는 밴드 이름" /></div></div>
        <div className="song-form-grid"><div><label htmlFor="song-vocal">보컬 구분 *</label><select id="song-vocal" name="vocal_type" required value={draft.vocal_type} aria-invalid={invalid('vocal_type')} onChange={e => update('vocal_type', e.target.value)}><option value="" disabled>보컬 구분 선택</option>{vocalOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div><div><label htmlFor="song-bpm">BPM <span>선택</span></label><input id="song-bpm" name="bpm" inputMode="numeric" type="text" pattern="[0-9]*" maxLength={3} value={draft.bpm} aria-invalid={invalid('bpm')} aria-describedby={invalid('bpm') ? 'song-validation' : 'song-bpm-help'} onChange={e => update('bpm', e.target.value)} placeholder="예: 120" /><small id="song-bpm-help">1~400 사이의 정수, 모르면 비워두세요.</small></div></div>
        <label htmlFor="song-youtube">YouTube 링크 <span>선택</span></label><input id="song-youtube" name="youtube_url" type="url" maxLength={2048} value={draft.youtube_url} aria-invalid={invalid('youtube_url')} aria-describedby={invalid('youtube_url') ? 'song-validation' : 'song-youtube-help'} onChange={e => update('youtube_url', e.target.value)} placeholder="https://youtu.be/…" /><small id="song-youtube-help">일반 영상·공유·Shorts·embed 링크를 사용할 수 있어요.</small>
        <label htmlFor="song-notes">특이사항 <span>선택</span></label><textarea id="song-notes" name="notes" rows={4} maxLength={6000} value={draft.notes} aria-invalid={invalid('notes')} onChange={e => update('notes', e.target.value)} placeholder="키 변경, 곡 구성, 함께 참고할 점 등을 적어주세요." /><small className="note-counter">{Array.from(draft.notes).length} / 3000</small>
      </fieldset>
      {validation && <p id="song-validation" className="form-message error-message" role="alert">{validation.message}</p>}
      {mutation.error && <p className="form-message error-message" role="alert">{mutation.error.message}</p>}
      {mutation.error instanceof SongConflictError && <button type="button" className="secondary-button" disabled={busy} onClick={() => { void reloadLatest() }}>최신 내용으로 다시 열기 (입력값 교체)</button>}
      {reloadError && <p className="form-message error-message" role="alert">{reloadError}</p>}
      <div className="song-form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>취소</button><button type="submit" className="primary-button" disabled={busy}><Save size={16} />{reloading ? '불러오는 중…' : mutation.isPending ? '저장 중…' : original ? '수정 저장' : '곡 등록'}</button></div>
    </form>
  </dialog>
}
