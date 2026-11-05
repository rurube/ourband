import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ChevronDown, ExternalLink, Guitar, Pencil, Plus, RefreshCw, Trash2, Users } from 'lucide-react'
import { EmptyState } from '../components/EmptyState'
import { useAuth } from '../auth/AuthProvider'
import { seoulToday } from '../home/api'
import { deleteRehearsal, fetchDates, fetchRehearsal, rehearsalKeys, rehearsalPageSize, type RehearsalDate } from '../rehearsals/api'
import { formatRehearsalDate, sessionTypes, type Rehearsal } from '../rehearsals/model'
import { InlineSessions } from '../rehearsals/InlineSessions'
import { RehearsalEditor } from '../rehearsals/RehearsalEditor'
import { refreshRehearsals } from '../rehearsals/refresh'

function RehearsalContents({ band, id, past, today }: { band: string; id: string; past: boolean; today: string }) {
  const detail = useQuery({ queryKey: [...rehearsalKeys.detail(band,id),today], queryFn: ({ signal }) => fetchRehearsal(band,id,signal) })
  return <div className="rehearsal-contents">{detail.error && <p className="form-message error-message" role="alert">{detail.error.message}<button className="text-button" onClick={() => { void detail.refetch() }}>다시 시도</button></p>}{detail.data ? <>
    {!detail.data.tracks.length && <p className="home-empty">아직 이 날짜에 선택한 곡이 없습니다. 일정 수정에서 합주곡을 추가해주세요.</p>}
    <ol className="rehearsal-track-list">{detail.data.tracks.map(track => <li key={track.id}><div className="rehearsal-track-heading"><h3>{track.title}</h3>{!past && <span className="rehearsal-count"><Guitar size={14} />합주 {track.rehearsal_count}회</span>}</div><p className="song-artist">{track.artist}</p>{track.youtube_url && <a className="youtube-link" href={track.youtube_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />YouTube 듣기</a>}
      {track.notes && <p className="rehearsal-track-notes">{track.notes}</p>}
      <InlineSessions band={band} rehearsal={detail.data} track={track}/>
    </li>)}</ol>
  </> : detail.isPending ? <p role="status">합주곡과 세션을 불러오고 있어요…</p> : null}</div>
}
export function RehearsalsPage() {
  const { profile } = useAuth(); const band = profile!.band_id
  const client = useQueryClient()
  const [past,setPast] = useState(false); const [page,setPage] = useState(0); const [today,setToday] = useState(seoulToday)
  const [open,setOpen] = useState<string|null>(null)
  const [editor,setEditor] = useState<{initial:Rehearsal|null}|null>(null)
  const [opening,setOpening] = useState(false); const loadingEditor = useRef(false)
  const [notice,setNotice] = useState(''); const [error,setError] = useState('')
  const [removing,setRemoving] = useState<RehearsalDate|null>(null); const deleting = useRef(false)
  const deletePanel = useRef<HTMLElement>(null)
  useEffect(()=>{if(removing){deletePanel.current?.scrollIntoView({block:'center'});deletePanel.current?.focus()}},[removing])
  useEffect(() => {
    const update=()=>{if(document.visibilityState==='visible')setToday(seoulToday())}
    const timer=setInterval(update,60_000);document.addEventListener('visibilitychange',update)
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',update)}
  },[])
  const dates=useQuery({queryKey:rehearsalKeys.dates(band,past,today,page),queryFn:({signal})=>fetchDates(band,past,today,page,signal)})
  const pages=Math.max(1,Math.ceil((dates.data?.total??0)/rehearsalPageSize))
  useEffect(()=>{if(dates.data&&!dates.isFetching&&page>=pages)setPage(pages-1)},[dates.data,dates.isFetching,page,pages])
  const deletion=useMutation({mutationFn:(original:RehearsalDate)=>deleteRehearsal(band,original),retry:false,onSuccess:()=>{setRemoving(null);setOpen(null);setNotice('합주 일정을 삭제했습니다. 원본 희망곡·투표·댓글은 유지됩니다.');void refreshRehearsals(client,band)},onError:()=>{void refreshRehearsals(client,band)}})
  async function edit(id:string){
    if(loadingEditor.current)return
    loadingEditor.current=true;setOpening(true);setError('')
    try{const detail=await client.fetchQuery({queryKey:rehearsalKeys.detail(band,id),queryFn:({signal})=>fetchRehearsal(band,id,signal),staleTime:0});setEditor({initial:detail})}catch(e){setError((e as Error).message)}finally{loadingEditor.current=false;setOpening(false)}
  }
  return <div className="dashboard-page"><div className="page-heading"><div><div className="eyebrow">LET’S PLAY TOGETHER · {profile?.bandName}</div><h1>우리의 합주 일정 <CalendarDays size={28}/></h1><p>날짜별 합주곡과 여러 명의 세션 배정을 함께 준비해요.</p></div><button className="primary-button" disabled={opening||deletion.isPending} onClick={()=>{setError('');setEditor({initial:null})}}><Plus size={18}/>일정 등록</button></div>
    {notice&&<p className="form-message song-success" role="status">{notice}</p>}{error&&<p className="form-message error-message" role="alert">{error}</p>}
    <div className="dashboard-grid"><section className="panel rehearsal-panel"><div className="section-title"><h2><CalendarDays size={19}/>밴드 합주 <span className="count-badge">{dates.data?.total??'—'}</span></h2><button className="icon-button" aria-label="합주 일정 새로고침" disabled={dates.isFetching} onClick={()=>{void refreshRehearsals(client,band)}}><RefreshCw size={16}/></button></div><div className="rehearsal-tabs" role="group" aria-label="합주 기간">{[false,true].map(value=><button key={String(value)} aria-pressed={past===value} className={past===value?'selected':''} onClick={()=>{setPast(value);setPage(0);setOpen(null)}}>{value?'지난 합주':'합주 예정'}</button>)}</div><p className="panel-note">한국 날짜 기준 · 오늘의 합주는 예정에 포함됩니다.</p>
      {dates.error&&<p role="alert" className="form-message error-message">{dates.error.message}<button className="text-button" onClick={()=>{void dates.refetch()}}>다시 시도</button></p>}
      {dates.isPending?<p role="status" className="home-empty">일정을 불러오고 있어요…</p>:dates.data?.items.length?<>{dates.data.items.map((date,index)=>{const pinned=!past&&page===0&&index===0;const expanded=pinned||open===date.id;return <article className="rehearsal-date-card" key={date.id}><div className="rehearsal-date-heading">{pinned?<div className="rehearsal-expand rehearsal-pinned"><CalendarDays size={18}/><strong>{formatRehearsalDate(date.rehearsal_date)}</strong><span className="confirmed-badge">{date.rehearsal_date===today?'오늘 합주':'가장 가까운 합주'}</span></div>:<button className="rehearsal-expand" aria-expanded={expanded} aria-controls={`rehearsal-${date.id}`} onClick={()=>setOpen(open===date.id?null:date.id)}><CalendarDays size={18}/><strong>{formatRehearsalDate(date.rehearsal_date)}</strong>{date.rehearsal_date===today&&<span className="confirmed-badge">오늘</span>}<ChevronDown size={17}/></button>}<div className="rehearsal-date-actions"><button className="text-button" disabled={opening||deletion.isPending} onClick={()=>{void edit(date.id)}}><Pencil size={14}/>날짜·곡 수정</button><button className="text-button" disabled={deletion.isPending} onClick={()=>{deletion.reset();setRemoving(date)}}><Trash2 size={14}/>삭제</button></div></div>{expanded&&<div id={`rehearsal-${date.id}`}><RehearsalContents band={band} id={date.id} past={past} today={today}/></div>}</article>})}<nav className="song-pagination" aria-label="합주 일정 페이지"><button disabled={page===0||dates.isFetching} onClick={()=>{setPage(page-1);setOpen(null)}}>이전</button><span>{page+1} / {pages}</span><button disabled={page>=pages-1||dates.isFetching} onClick={()=>{setPage(page+1);setOpen(null)}}>다음</button></nav></>:!dates.error?<EmptyState icon={CalendarDays} title={past?'지난 합주가 없습니다':'다음 합주를 잡아볼까요?'} description="일정 등록에서 날짜와 합주곡을 선택할 수 있어요."/>:null}
    </section><aside className="panel session-guide"><h2><Users size={19}/>세션도 함께 준비해요</h2><p>한 세션에 여러 멤버를 배정하거나 게스트 닉네임을 직접 입력할 수 있습니다.</p><div className="session-tags">{sessionTypes.map(type=><span key={type.value}>{type.label}</span>)}</div><div className="guide-note"><Guitar size={17}/><p>예정곡의 <strong>합주 N회</strong>는 오늘 이전의 실제 합주 날짜 수입니다. 곡 제목을 바꿔도 기록은 유지됩니다.</p></div></aside></div>
    {removing&&<section ref={deletePanel} tabIndex={-1} className="panel rehearsal-delete-confirm" role="region" aria-label="일정 삭제 확인"><h2>{formatRehearsalDate(removing.rehearsal_date)} 삭제</h2><p>이 날짜의 합주곡·세션 배정도 삭제됩니다. 원본 희망곡과 투표·댓글은 유지됩니다.</p><form onSubmit={event=>{event.preventDefault();if(deleting.current||deletion.isPending)return;deleting.current=true;void deletion.mutateAsync(removing).catch(()=>{}).finally(()=>{deleting.current=false})}}><fieldset disabled={deletion.isPending}><label className="consent-check"><input type="checkbox" required/>이 일정과 배정을 삭제하는 것을 확인했습니다.</label><div className="song-form-actions"><button type="button" className="secondary-button" onClick={()=>setRemoving(null)}>취소</button><button type="submit" className="primary-button">{deletion.isPending?'삭제 중…':'확인한 일정 삭제'}</button></div></fieldset></form>{deletion.error&&<p className="form-message error-message" role="alert">{deletion.error.message}</p>}</section>}
    {editor&&<RehearsalEditor band={band} initial={editor.initial} onClose={()=>setEditor(null)} onSaved={(id,date)=>{setEditor(null);setOpen(id);setPast(date<today);setPage(0);setNotice(`${formatRehearsalDate(date)} · 합주 일정과 배정을 저장했습니다.`)}}/>}
  </div>
}
