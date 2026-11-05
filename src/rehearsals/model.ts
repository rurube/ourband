export const sessionTypes = [
  { value: 'vocal', label: '보컬' }, { value: 'guitar1', label: '기타 1' }, { value: 'guitar2', label: '기타 2' },
  { value: 'bass', label: '베이스' }, { value: 'drums', label: '드럼' }, { value: 'keyboard', label: '건반' }, { value: 'other', label: '기타 세션' },
] as const
export type SessionType = typeof sessionTypes[number]['value']
export interface Assignment { id?: string; session_type: SessionType; member_id: string | null; nickname_snapshot: string }
export interface Track { id: string; song_id: string; title: string; artist: string; youtube_url: string | null; notes: string; rehearsal_count: number; sessions: Assignment[] }
export interface Rehearsal { id: string; rehearsal_date: string; updated_at: string; tracks: Track[] }
export interface TrackDraft { song_id: string; title: string; artist: string; notes: string; sessions: (Assignment & { key: string })[] }
export function draftsFromRehearsal(rehearsal: Rehearsal): TrackDraft[] {
  return rehearsal.tracks.map(track => ({ song_id: track.song_id, title: track.title, artist: track.artist, notes: track.notes, sessions: track.sessions.map(session => ({ ...session, key: session.id! })) }))
}
export function validateRehearsal(date: string, tracks: TrackDraft[]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1900-01-01' || date > '2100-12-31' || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date) throw new Error('1900~2100년의 올바른 합주 날짜를 선택해주세요.')
  if (tracks.length > 100 || new Set(tracks.map(t => t.song_id)).size !== tracks.length) throw new Error('같은 곡은 한 번만 선택할 수 있으며 최대 100곡입니다.')
  let total = 0
  return tracks.map(track => {
    if (Array.from(track.notes).length > 3000) throw new Error(`${track.title}: 곡별 메모는 최대 3000자입니다.`)
    if (track.sessions.length > 100 || (total += track.sessions.length) > 500) throw new Error('곡당 세션 배정은 최대 100개, 일정 전체는 최대 500개입니다.')
    const members = new Set<string>()
    const sessions = track.sessions.map(session => {
      if (!sessionTypes.some(type => type.value === session.session_type)) throw new Error('세션 종류를 확인해주세요.')
      if (session.member_id) {
        const key = `${session.session_type}:${session.member_id}`
        if (members.has(key)) throw new Error(`${track.title}: 같은 세션에 같은 멤버를 중복 배정할 수 없습니다.`)
        members.add(key)
      } else if (!session.nickname_snapshot.trim() || Array.from(session.nickname_snapshot.trim()).length > 30) throw new Error(`${track.title}: 직접 입력한 닉네임은 1~30자여야 합니다.`)
      return { ...(session.id ? { id: session.id } : {}), session_type: session.session_type, member_id: session.member_id, nickname_snapshot: session.nickname_snapshot.trim() }
    })
    return { song_id: track.song_id, notes: track.notes, sessions }
  })
}
export function formatRehearsalDate(date: string) {
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' }).format(new Date(`${date}T00:00:00+09:00`))
}
