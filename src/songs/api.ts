import { supabase } from '../lib/supabase'
import type { Song, SongCatalog, SongPayload, SongSort, VocalType } from './model'

const columns = 'id,title,artist,bpm,vocal_type,youtube_url,notes,is_confirmed,created_at,updated_at'
export const songKeys = {
  band: (bandId: string) => ['songs', bandId] as const,
  catalog: (bandId: string, filters: CatalogFilters) => ['songs', bandId, 'catalog', filters] as const,
  recent: (bandId: string) => ['songs', bandId, 'recent'] as const,
  detail: (bandId: string, id: string) => ['songs', bandId, 'detail', id] as const,
}
export interface CatalogFilters { search: string; vocal: VocalType | null; sort: SongSort; confirmed: boolean; page: number }
export const pageSize = 20
export const recentSongLimit = 10
export class SongConflictError extends Error {}
interface ApiError { code?: string; message?: string }
function fail(error: ApiError): never {
  if (error.code === '23505') throw new Error('같은 제목과 가수의 곡이 이미 우리 밴드에 등록되어 있어요. 기존 곡을 확인해주세요.')
  if (error.code === '23514' || error.code === '22023') throw new Error('입력값을 확인해주세요. BPM·보컬 구분·영상 링크 형식이 올바르지 않습니다.')
  if (error.code === '42501' || error.code === 'PGRST301') throw new Error('밴드 접근 권한을 확인할 수 없습니다. 다시 로그인해주세요.')
  if (error.code === '57014' || error.message?.includes('abort')) throw new Error('응답 시간이 초과됐습니다. 입력값은 유지되니 잠시 후 다시 시도해주세요.')
  throw new Error('서버에 연결하지 못했거나 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.')
}
function client() {
  if (!supabase) throw new Error('Supabase 연결 설정이 필요합니다.')
  return supabase
}
function timeout(signal?: AbortSignal) {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000)
}
export async function fetchCatalog(bandId: string, filters: CatalogFilters, signal?: AbortSignal): Promise<SongCatalog> {
  const { data, error } = await client().rpc('list_song_catalog', {
    p_search: filters.search, p_vocal: filters.vocal, p_sort: filters.sort,
    p_confirmed: filters.confirmed, p_limit: pageSize, p_offset: filters.page * pageSize,
  }).setHeader('x-band-id', bandId).abortSignal(timeout(signal))
  if (error) fail(error)
  return data as SongCatalog
}
export async function fetchRecentSongs(bandId: string, signal?: AbortSignal): Promise<Song[]> {
  const { data, error } = await client().from('songs').select(columns).eq('band_id', bandId)
    .order('created_at', { ascending: false }).order('id').limit(recentSongLimit).setHeader('x-band-id', bandId).abortSignal(timeout(signal))
  if (error) fail(error)
  return data as Song[]
}
export async function fetchSong(bandId: string, id: string, signal?: AbortSignal): Promise<Song> {
  const { data, error } = await client().from('songs').select(columns).eq('band_id', bandId).eq('id', id).setHeader('x-band-id', bandId).abortSignal(timeout(signal)).maybeSingle()
  if (error) fail(error)
  if (!data) throw new Error('곡을 찾을 수 없거나 접근 권한이 없습니다.')
  return data as Song
}
export async function saveSong(bandId: string, payload: SongPayload, original: Song | null): Promise<Song> {
  const query = original
    ? client().from('songs').update(payload).eq('id', original.id).eq('band_id', bandId).eq('updated_at', original.updated_at)
    : client().from('songs').insert(payload)
  const { data, error } = await query.select(columns).setHeader('x-band-id', bandId).abortSignal(timeout()).maybeSingle()
  if (error) fail(error)
  if (!data) throw new SongConflictError('다른 멤버가 곡을 먼저 수정했거나 접근 권한이 변경됐습니다. 작성 중인 입력값은 유지했습니다.')
  return data as Song
}
