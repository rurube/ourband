import { supabase } from '../lib/supabase'
import type { Rehearsal, TrackDraft } from './model'
import { validateRehearsal } from './model'
export const rehearsalKeys = {
  band: (band: string) => ['rehearsals', band] as const,
  dates: (band: string, past: boolean, today: string, page: number) => ['rehearsals', band, 'dates', past, today, page] as const,
  detail: (band: string, id: string) => ['rehearsals', band, 'detail', id] as const,
  members: (band: string) => ['rehearsals', band, 'members'] as const,
}
export interface BandMember { user_id: string; nickname: string }
export interface RehearsalDate { id: string; rehearsal_date: string; updated_at: string }
export const rehearsalPageSize = 6
export class RehearsalConflictError extends Error {}
function client() { if (!supabase) throw new Error('서버 연결 설정이 필요합니다.'); return supabase }
function timeout(signal?: AbortSignal) { return signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) }
function fail(error: { code?: string }): never {
  if (error.code === '40001') throw new RehearsalConflictError('다른 멤버가 일정을 먼저 수정했습니다. 작성 중인 내용은 유지했습니다. 최신 내용을 확인하고 다시 편집해주세요.')
  if (error.code === '23505') throw new Error('같은 밴드에 해당 날짜의 일정이 있거나 같은 곡·세션 멤버가 중복되었습니다.')
  if (error.code === '42501' || error.code === '23503') throw new Error('일정·곡·멤버의 밴드 소속을 확인해주세요. 접근 권한이 변경됐을 수 있습니다.')
  if (error.code === '22023' || error.code === '22007' || error.code === '23514') throw new Error('날짜·곡별 메모·세션 입력 내용을 확인해주세요.')
  throw new Error('요청 결과를 확인하지 못했습니다. 입력은 유지했습니다. 목록을 새로고침해 반영 여부를 확인해주세요.')
}
export async function fetchDates(band: string, past: boolean, today: string, page: number, signal?: AbortSignal) {
  let request = client().from('rehearsals').select('id,rehearsal_date,updated_at', { count: 'exact' }).eq('band_id', band)
  request = past ? request.lt('rehearsal_date', today) : request.gte('rehearsal_date', today)
  const { data, count, error } = await request.order('rehearsal_date', { ascending: !past }).order('id').range(page * rehearsalPageSize, (page + 1) * rehearsalPageSize - 1).setHeader('x-band-id', band).abortSignal(timeout(signal))
  if (error) fail(error)
  return { items: data as RehearsalDate[], total: count ?? 0 }
}
export async function fetchRehearsal(band: string, id: string, signal?: AbortSignal): Promise<Rehearsal> {
  const { data, error } = await client().rpc('get_rehearsal_detail', { p_id: id }).setHeader('x-band-id', band).abortSignal(timeout(signal))
  if (error) fail(error)
  return data as Rehearsal
}
export async function fetchMembers(band: string, signal?: AbortSignal): Promise<BandMember[]> {
  const { data, error } = await client().from('band_memberships').select('user_id,nickname').eq('band_id', band).order('nickname').setHeader('x-band-id', band).abortSignal(timeout(signal))
  if (error) fail(error)
  return data as BandMember[]
}
export async function saveRehearsal(band: string, date: string, tracks: TrackDraft[], original: Rehearsal | null): Promise<string> {
  const payload = validateRehearsal(date, tracks)
  const { data, error } = await client().rpc('save_rehearsal', { p_date: date, p_tracks: payload, p_id: original?.id ?? null, p_expected: original?.updated_at ?? null }).setHeader('x-band-id', band).abortSignal(timeout())
  if (error) fail(error)
  return data as string
}
export async function deleteRehearsal(band: string, original: RehearsalDate) {
  const { error } = await client().rpc('delete_rehearsal', { p_id: original.id, p_expected: original.updated_at }).setHeader('x-band-id', band).abortSignal(timeout())
  if (error) fail(error)
}
