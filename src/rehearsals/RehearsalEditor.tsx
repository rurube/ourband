import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Save, Trash2, X } from 'lucide-react'
import { fetchCatalog, pageSize } from '../songs/api'
import { fetchMembers, fetchRehearsal, rehearsalKeys, saveRehearsal, RehearsalConflictError } from './api'
import { draftsFromRehearsal, type Rehearsal, type TrackDraft } from './model'
import { seoulToday } from '../home/api'
import { SessionFields } from './SessionFields'
import { refreshRehearsals } from './refresh'

function SongPicker({ band, selected, onAdd }: { band: string; selected: string[]; onAdd: (song: { id: string; title: string; artist: string }) => void }) {
  const [input, setInput] = useState(''); const [search, setSearch] = useState(''); const [confirmed, setConfirmed] = useState(false); const [page, setPage] = useState(0)
  useEffect(() => { const timer = setTimeout(() => { setSearch(input.trim()); setPage(0) }, 300); return () => clearTimeout(timer) }, [input])
  const query = useQuery({ queryKey: ['rehearsals', band, 'picker', search, confirmed, page], queryFn: ({ signal }) => fetchCatalog(band, { search, confirmed, page, vocal: null, sort: 'recent' }, signal) })
  return <section className="rehearsal-picker"><h3>합주곡 추가</h3><label htmlFor="rehearsal-song-search">곡 제목·가수 검색</label><input id="rehearsal-song-search" value={input} maxLength={200} onChange={e => setInput(e.target.value)} placeholder="등록된 희망곡에서 선택하세요" /><label className="rehearsal-inline-check"><input type="checkbox" checked={confirmed} onChange={e => { setConfirmed(e.target.checked); setPage(0) }} />합주 확정곡에서 찾기</label>
    {query.isPending ? <p role="status">곡을 찾고 있어요…</p> : query.error ? <p role="alert" className="error-message">{query.error.message}<button type="button" className="text-button" onClick={() => { void query.refetch() }}>다시 시도</button></p> : <><ul className="picker-song-list">{query.data?.songs.map(song => <li key={song.id}><span><strong>{song.title}</strong><small>{song.artist}</small></span><button type="button" className="text-button" disabled={selected.includes(song.id) || selected.length >= 100} onClick={() => onAdd(song)}>{selected.includes(song.id) ? '선택됨' : '추가'}</button></li>)}</ul>{!query.data?.songs.length && <p>해당하는 곡이 없습니다. 희망곡 화면에서 곡을 먼저 등록해주세요.</p>}<div className="song-pagination"><button type="button" disabled={page === 0 || query.isFetching} onClick={() => setPage(page - 1)}>이전</button><span>{page + 1} / {Math.max(1,Math.ceil((query.data?.total ?? 0)/pageSize))}</span><button type="button" disabled={(page + 1) * pageSize >= (query.data?.total ?? 0) || page >= 5000 || query.isFetching} onClick={() => setPage(page + 1)}>다음</button></div></>}
  </section>
}
export function RehearsalEditor({ band, initial, onClose, onSaved }: { band: string; initial: Rehearsal | null; onClose: () => void; onSaved: (id: string, date: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null); const running = useRef(false)
  const [original, setOriginal] = useState(initial)
  const [date, setDate] = useState(initial?.rehearsal_date ?? seoulToday())
  const [tracks, setTracks] = useState<TrackDraft[]>(() => initial ? draftsFromRehearsal(initial) : [])
  const [error, setError] = useState(''); const [reloading, setReloading] = useState(false)
  const client = useQueryClient()
  const members = useQuery({ queryKey: rehearsalKeys.members(band), queryFn: ({ signal }) => fetchMembers(band, signal) })
  const mutation = useMutation({ mutationFn: () => saveRehearsal(band, date, tracks, original), retry: false, onSuccess: id => { void refreshRehearsals(client, band); onSaved(id, date) } })
  const busy = mutation.isPending || reloading
  useEffect(() => { const node = dialog.current; const overflow = document.body.style.overflow; document.body.style.overflow='hidden'; node?.showModal(); return () => { node?.close(); document.body.style.overflow=overflow } }, [])
  async function submit(event: FormEvent) { event.preventDefault(); if (running.current || busy) return; running.current=true; setError(''); try { await mutation.mutateAsync() } catch { /* keep draft */ } finally { running.current=false } }
  async function reload() {
    if (!original || busy) return
    setReloading(true); setError('')
    try { const latest=await fetchRehearsal(band,original.id); setOriginal(latest); setDate(latest.rehearsal_date); setTracks(draftsFromRehearsal(latest)); mutation.reset() } catch(e) { setError((e as Error).message) } finally { setReloading(false) }
  }
  function move(index: number, direction: number) { setTracks(old => { const next=[...old]; [next[index],next[index+direction]]=[next[index+direction],next[index]]; return next }) }
  return <dialog ref={dialog} className="song-dialog rehearsal-dialog" aria-labelledby="rehearsal-editor-heading" onCancel={e => { e.preventDefault(); if (!busy) onClose() }}><div className="song-dialog-heading"><h2 id="rehearsal-editor-heading">{initial ? '합주 일정 수정' : '새 합주 일정'}</h2><button type="button" className="icon-button" aria-label="일정 편집 닫기" disabled={busy} onClick={onClose}><X size={21} /></button></div><p className="song-form-intro">같은 밴드의 날짜당 일정 하나를 관리합니다. 곡 선택과 세션 배정을 한 번에 저장해요.</p>
    <form onSubmit={e => { void submit(e) }}><fieldset disabled={busy}><label htmlFor="rehearsal-date">합주 날짜</label><input id="rehearsal-date" type="date" value={date} min="1900-01-01" max="2100-12-31" required onChange={e => setDate(e.target.value)} />
      <SongPicker band={band} selected={tracks.map(t => t.song_id)} onAdd={song => setTracks(old => old.some(t => t.song_id === song.id) ? old : [...old,{song_id:song.id,title:song.title,artist:song.artist,notes:'',sessions:[]}])} />
      <h3 className="rehearsal-selected-heading">선택한 합주곡 · {tracks.length}곡</h3>{!tracks.length && <p className="home-empty">곡 없이 날짜만 먼저 등록해도 괜찮아요.</p>}
      {members.error && <p className="form-message error-message" role="alert">{members.error.message}<button type="button" className="text-button" onClick={() => { void members.refetch() }}>멤버 다시 불러오기</button></p>}
      {tracks.map((track,index) => <details className="track-editor" key={track.song_id}><summary>{index+1}. {track.title}<span> · {track.artist} · 세션 {track.sessions.length}개</span></summary><div className="track-editor-body"><div className="track-order-controls"><button type="button" className="text-button" disabled={index===0} onClick={() => move(index,-1)}><ArrowUp size={14} />위로</button><button type="button" className="text-button" disabled={index===tracks.length-1} onClick={() => move(index,1)}><ArrowDown size={14} />아래로</button><button type="button" className="text-button" onClick={() => setTracks(old => old.filter(t => t.song_id !== track.song_id))}><Trash2 size={14} />이 날짜에서 곡 빼기</button></div><label>곡별 메모<textarea rows={2} value={track.notes} onChange={event => setTracks(old => old.map(t => t.song_id===track.song_id ? {...t,notes:event.target.value} : t))}/></label><small>{Array.from(track.notes).length} / 3000자</small><SessionFields track={track} members={members.data ?? []} onChange={next => setTracks(old => old.map(t => t.song_id===track.song_id ? next : t))} /></div></details>)}
      {(error || mutation.error) && <p role="alert" className="form-message error-message">{error || mutation.error?.message}</p>}
      {mutation.error instanceof RehearsalConflictError && <div className="form-message"><p>최신 내용을 불러오면 작성 중인 입력을 대체합니다.</p><button className="secondary-button" type="button" onClick={() => { void reload() }}>작성 내용 대신 최신 일정 불러오기</button></div>}
      <div className="song-form-actions"><button className="secondary-button" type="button" onClick={onClose}>취소</button><button className="primary-button" type="submit"><Save size={16} />{busy ? '저장 중…' : '일정·곡·세션 저장'}</button></div>
    </fieldset></form>
  </dialog>
}
