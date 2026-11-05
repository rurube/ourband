import { Plus, X } from 'lucide-react'
import type { BandMember } from './api'
import { sessionTypes, type TrackDraft } from './model'

export function SessionFields({ track, members, onChange }: { track: TrackDraft; members: BandMember[]; onChange: (track: TrackDraft) => void }) {
  return (
    <div className="assignment-grid">{sessionTypes.map(type => <section key={type.value} className="assignment-group"><h4>{type.label}</h4>{track.sessions.filter(s => s.session_type === type.value).map(session => <div className="assignment-row" key={session.key}>
      <label><span className="sr-only">{type.label} 멤버</span><select value={session.member_id ?? 'guest'} onChange={e => { const member = members.find(m => m.user_id === e.target.value); onChange({ ...track, sessions: track.sessions.map(s => s.key === session.key ? { ...s, member_id: member?.user_id ?? null, nickname_snapshot: member?.nickname ?? '' } : s) }) }}><option value="guest">직접 닉네임 입력</option>{session.member_id && !members.some(m => m.user_id === session.member_id) && <option value={session.member_id}>소속 확인 필요 · {session.nickname_snapshot}</option>}{members.map(member => <option key={member.user_id} value={member.user_id}>{member.nickname}{member.main_session===type.value?' · 메인':member.available_sessions.includes(type.value)?' · 가능':''}</option>)}</select></label>
      {session.member_id && session.id && members.some(member=>member.user_id===session.member_id&&member.nickname!==session.nickname_snapshot) && <small className="assignment-snapshot">저장된 이름: {session.nickname_snapshot}</small>}
      {!session.member_id && <input aria-label={`${type.label} 직접 입력 닉네임`} value={session.nickname_snapshot} onChange={e => onChange({ ...track, sessions: track.sessions.map(s => s.key === session.key ? { ...s, nickname_snapshot: e.target.value } : s) })} placeholder="게스트 닉네임" />}
      <button className="icon-button" type="button" aria-label={`${type.label} ${session.nickname_snapshot || '빈'} 배정 제거`} onClick={() => onChange({ ...track, sessions: track.sessions.filter(s => s.key !== session.key) })}><X size={15} /></button>
    </div>)}<button type="button" className="text-button" disabled={track.sessions.length >= 100} onClick={() => onChange({ ...track, sessions: [...track.sessions, { key: crypto.randomUUID(), session_type: type.value, member_id: null, nickname_snapshot: '' }] })}><Plus size={13} />{type.label} 배정 추가</button></section>)}</div>
  )
}
