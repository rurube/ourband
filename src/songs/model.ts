export const vocalOptions = [
  { value: 'female', label: '여보컬' },
  { value: 'male', label: '남보컬' },
  { value: 'mixed', label: '혼성' },
  { value: 'instrumental', label: '연주곡' },
] as const
export type VocalType = typeof vocalOptions[number]['value']
export type SongSort = 'likes' | 'recent' | 'net'
export interface Song {
  id: string; title: string; artist: string; bpm: number | null; vocal_type: VocalType
  youtube_url: string | null; notes: string; is_confirmed: boolean; created_at: string; updated_at: string
}
export interface CatalogSong extends Song { likes: number; dislikes: number }
export interface SongCatalog { songs: CatalogSong[]; total: number; confirmed_total: number }
export interface SongDraft { title: string; artist: string; bpm: string; vocal_type: VocalType | ''; youtube_url: string; notes: string }
export interface SongPayload { title: string; artist: string; bpm: number | null; vocal_type: VocalType; youtube_url: string | null; notes: string }
export type SongField = keyof SongDraft
export class SongValidationError extends Error {
  constructor(public field: SongField, message: string) { super(message) }
}
export const blankDraft: SongDraft = { title: '', artist: '', bpm: '', vocal_type: '', youtube_url: '', notes: '' }
export function draftFromSong(song: Song): SongDraft {
  return { title: song.title, artist: song.artist, bpm: song.bpm === null ? '' : String(song.bpm), vocal_type: song.vocal_type, youtube_url: song.youtube_url ?? '', notes: song.notes }
}
export function normalizeYouTubeUrl(input: string): string | null {
  const value = input.trim()
  if (!value) return null
  const invalid = () => new SongValidationError('youtube_url', '올바른 YouTube HTTPS 영상 링크를 입력해주세요.')
  let url: URL
  try { url = new URL(value) } catch { throw invalid() }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || /\s/.test(value) || value.length > 2048) throw invalid()
  let videoId: string | null = null
  if (url.hostname === 'youtu.be') videoId = url.pathname.match(/^\/([\w-]{11})\/?$/)?.[1] ?? null
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
    if (/^\/watch\/?$/.test(url.pathname) && url.searchParams.getAll('v').length === 1) videoId = url.searchParams.get('v')
    else videoId = url.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})\/?$/)?.[1] ?? null
  }
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw invalid()
  const canonical = new URL('https://www.youtube.com/watch')
  canonical.searchParams.set('v', videoId)
  const start = url.searchParams.get('t') ?? url.searchParams.get('start')
  if (start && /^(?:\d+h)?(?:\d+m)?\d+s?$/.test(start)) canonical.searchParams.set('t', start)
  return canonical.toString()
}
export function validateSongDraft(draft: SongDraft): SongPayload {
  const title = draft.title.trim(); const artist = draft.artist.trim()
  if (!title || Array.from(title).length > 200) throw new SongValidationError('title', '곡 제목을 1~200자로 입력해주세요.')
  if (!artist || Array.from(artist).length > 200) throw new SongValidationError('artist', '가수를 1~200자로 입력해주세요.')
  const rawBpm = draft.bpm.trim()
  if (rawBpm && (!/^\d+$/.test(rawBpm) || Number(rawBpm) < 1 || Number(rawBpm) > 400)) throw new SongValidationError('bpm', 'BPM은 1~400 사이의 정수로 입력해주세요.')
  if (!vocalOptions.some(option => option.value === draft.vocal_type)) throw new SongValidationError('vocal_type', '보컬 구분을 선택해주세요.')
  if (Array.from(draft.notes).length > 3000) throw new SongValidationError('notes', '특이사항은 3000자까지 입력할 수 있어요.')
  return { title, artist, bpm: rawBpm ? Number(rawBpm) : null, vocal_type: draft.vocal_type as VocalType, youtube_url: normalizeYouTubeUrl(draft.youtube_url), notes: draft.notes }
}
export function vocalLabel(type: VocalType) { return vocalOptions.find(option => option.value === type)?.label ?? type }
export function formatSongTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
