import { blankDraft, draftFromSong, normalizeYouTubeUrl, SongValidationError, validateSongDraft, type SongDraft, type Song } from './model.ts'
function assert(value: boolean, message: string) { if (!value) throw new Error(message) }
function rejects(draft: SongDraft, field: string) {
  try { validateSongDraft(draft) } catch (error) { assert(error instanceof SongValidationError && error.field === field, 'unexpected validation error'); return }
  throw new Error(`Expected ${field} validation failure`)
}
const valid: SongDraft = { ...blankDraft, title: ' 곡 제목 ', artist: ' 가수 ', vocal_type: 'female' }
Deno.test('song payload trims required fields and leaves optional values empty', () => {
  const value = validateSongDraft(valid)
  assert(value.title === '곡 제목' && value.artist === '가수' && value.bpm === null && value.youtube_url === null, 'payload normalization')
  assert(!('id' in value) && !('is_confirmed' in value) && !('created_by' in value), 'metadata mutation must not rewrite identity/state')
})
Deno.test('required and bounded song metadata validates before network writes', () => {
  rejects({ ...valid, title: '  ' }, 'title'); rejects({ ...valid, artist: '' }, 'artist')
  rejects({ ...valid, title: '가'.repeat(201) }, 'title'); rejects({ ...valid, vocal_type: '' }, 'vocal_type')
  rejects({ ...valid, notes: '가'.repeat(3001) }, 'notes')
  assert(validateSongDraft({ ...valid, notes: '🎵'.repeat(3000) }).notes.length === 6000, 'length must count Unicode characters like PostgreSQL')
})
Deno.test('optional BPM permits only integer 1–400', () => {
  assert(validateSongDraft({ ...valid, bpm: '001' }).bpm === 1, 'integer conversion')
  assert(validateSongDraft({ ...valid, bpm: '400' }).bpm === 400, 'max BPM')
  for (const bpm of ['0', '401', '-2', '12.5', '1e2', 'NaN', '+12']) rejects({ ...valid, bpm }, 'bpm')
})
Deno.test('YouTube watch, reordered query, shared, Shorts and embed links canonicalize safely', () => {
  const canonical = 'https://www.youtube.com/watch?v=abcdefghijk'
  for (const url of ['https://youtube.com/watch?v=abcdefghijk', 'https://www.youtube.com/watch?si=share&v=abcdefghijk', 'https://youtu.be/abcdefghijk?si=share', 'https://m.youtube.com/shorts/abcdefghijk', 'https://www.youtube.com/embed/abcdefghijk']) assert(normalizeYouTubeUrl(url) === canonical, 'link canonicalization')
  assert(normalizeYouTubeUrl('https://youtu.be/abcdefghijk?t=90') === canonical + '&t=90', 'preserve start time')
  assert(normalizeYouTubeUrl(' ') === null, 'optional empty URL')
})
Deno.test('unsafe and spoofed video links are rejected', () => {
  for (const url of ['javascript:alert(1)', 'http://youtu.be/abcdefghijk', 'https://youtube.com.evil.invalid/watch?v=abcdefghijk', 'https://youtube.com@evil.invalid/watch?v=abcdefghijk', 'https://user:pass@youtube.com/watch?v=abcdefghijk', 'https://youtube.com:8443/watch?v=abcdefghijk', 'https://youtu.be/short', 'https://youtube.com/watch?v=abcdefghijk&v=12345678901', 'https://youtube.com/playlist?list=abcdefghijk']) rejects({ ...valid, youtube_url: url }, 'youtube_url')
})
Deno.test('editing builds a draft without altering song identity, votes or confirmation', () => {
  const song: Song = { id: 'legacy-1', title: 'Title', artist: 'Artist', vocal_type: 'mixed', bpm: 120, youtube_url: null, notes: 'memo', is_confirmed: true, created_at: '2026-01-01', updated_at: '2026-01-02' }
  const payload = validateSongDraft({ ...draftFromSong(song), title: 'Changed' })
  assert(payload.title === 'Changed' && song.id === 'legacy-1' && song.is_confirmed, 'draft mutation changes original song')
  assert(Object.keys(payload).sort().join(',') === 'artist,bpm,notes,title,vocal_type,youtube_url', 'only metadata fields may be submitted')
})
