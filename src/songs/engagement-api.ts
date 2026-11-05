import { supabase } from '../lib/supabase'
import type { CatalogSong, Song } from './model'
import type { Engagement, Vote } from './engagement-model'
function client() { if (!supabase) throw new Error('Supabase 연결 설정이 필요합니다.'); return supabase }
const timeout = (signal?: AbortSignal) => signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000)
function fail(error: { code?: string }): never {
  if (error.code === '42501' || error.code === '23503') throw new Error('곡이나 밴드 접근 권한을 확인해주세요.')
  if (error.code === '22023' || error.code === '23514') throw new Error('입력 내용을 확인해주세요. 댓글은 최대 300자입니다.')
  throw new Error('요청 결과를 확인하지 못했습니다. 새로고침으로 반영 여부를 확인한 뒤 다시 시도해주세요.')
}
export const engagementKeys = {
  batch: (band: string, ids: string[], userId: string) => ['songs', band, 'engagement-batch', userId, ids] as const,
  state: (band: string, id: string, userId: string) => ['songs', band, 'engagement-state', userId, id] as const,
  comments: (band: string, id: string) => ['songs', band, 'comments', id] as const,
  popular: (band: string) => ['songs', band, 'popular'] as const,
}
export async function fetchEngagement(band: string, ids: string[], signal?: AbortSignal): Promise<Record<string, Engagement>> {
  if (!ids.length) return {}
  const [stats, votes] = await Promise.all([
    client().rpc('get_song_stats', { p_song_ids: ids }).setHeader('x-band-id', band).abortSignal(timeout(signal)),
    client().rpc('get_my_votes', { p_song_ids: ids }).setHeader('x-band-id', band).abortSignal(timeout(signal)),
  ])
  if (stats.error) fail(stats.error); if (votes.error) fail(votes.error)
  const own = new Map((votes.data as { song_id: string; vote_type: -1 | 1 }[]).map(row => [row.song_id, row.vote_type]))
  return Object.fromEntries((stats.data as { song_id: string; likes: number; dislikes: number; comment_count: number }[]).map(row => [row.song_id, { vote: own.get(row.song_id) ?? null, likes: Number(row.likes), dislikes: Number(row.dislikes), comment_count: Number(row.comment_count) }]))
}
export async function toggleVote(band: string, id: string, value: -1 | 1): Promise<Vote> {
  const { data, error } = await client().rpc('toggle_vote', { p_song_id: id, p_vote_type: value }).setHeader('x-band-id', band).abortSignal(timeout())
  if (error) fail(error)
  return data as Vote
}
export async function confirmSong(band: string, song: Song, value: boolean): Promise<Song> {
  const { data, error } = await client().from('songs').update({ is_confirmed: value }).eq('band_id', band).eq('id', song.id).eq('updated_at', song.updated_at).select('id,title,artist,bpm,vocal_type,youtube_url,notes,is_confirmed,created_at,updated_at').setHeader('x-band-id', band).abortSignal(timeout()).maybeSingle()
  if (error) fail(error)
  if (!data) throw new Error('다른 멤버가 곡을 변경했습니다. 새로고침한 내용을 확인하고 다시 시도해주세요.')
  return data as Song
}
export interface AnonymousComment { id: string; song_id: string; content: string; created_at: string }
export type CommentCursor = { created_at: string; id: string } | null
export const commentPageSize = 20
export async function fetchComments(band: string, id: string, cursor: CommentCursor, signal?: AbortSignal): Promise<AnonymousComment[]> {
  const { data, error } = await client().rpc('list_song_comments', { p_song_id: id, p_before_time: cursor?.created_at ?? null, p_before_id: cursor?.id ?? null, p_limit: commentPageSize }).setHeader('x-band-id', band).abortSignal(timeout(signal))
  if (error) fail(error)
  return data as AnonymousComment[]
}
export async function addComment(band: string, id: string, content: string): Promise<AnonymousComment> {
  const { data, error } = await client().rpc('add_comment', { p_song_id: id, p_content: content }).setHeader('x-band-id', band).abortSignal(timeout())
  if (error) fail(error)
  return (data as AnonymousComment[])[0]
}
export async function fetchPopular(band: string, signal?: AbortSignal): Promise<(CatalogSong | null)[]> {
  return Promise.all(['female', 'male'].map(async vocal => {
    const { data, error } = await client().rpc('list_song_catalog', { p_vocal: vocal, p_sort: 'likes', p_confirmed: false, p_limit: 1 }).setHeader('x-band-id', band).abortSignal(timeout(signal))
    if (error) fail(error)
    const song = (data as { songs: CatalogSong[] }).songs[0]
    return song?.likes > 0 ? song : null
  }))
}
