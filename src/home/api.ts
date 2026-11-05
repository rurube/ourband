import { supabase } from '../lib/supabase'
export const overviewPageSize = 6
export interface OverviewSong { id: string; title: string; artist: string }
export interface OverviewRehearsal { id: string; rehearsal_date: string; rehearsal_songs: { id: string; sort_order: number; songs: OverviewSong | null }[] }
export function seoulToday() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
export async function fetchConfirmed(bandId: string, page: number, signal: AbortSignal) {
  if (!supabase) throw new Error('서버 연결 설정이 없습니다.')
  const { data, count, error } = await supabase.from('songs').select('id,title,artist', { count: 'exact' }).eq('band_id', bandId).eq('is_confirmed', true).order('title').order('id').range(page * overviewPageSize, (page + 1) * overviewPageSize - 1).setHeader('x-band-id', bandId).abortSignal(AbortSignal.any([signal, AbortSignal.timeout(20_000)]))
  if (error) throw new Error('확정곡을 불러오지 못했습니다.')
  return { items: data as OverviewSong[], total: count ?? 0 }
}
export async function fetchRehearsals(bandId: string, page: number, past: boolean, today: string, signal: AbortSignal) {
  if (!supabase) throw new Error('서버 연결 설정이 없습니다.')
  let request = supabase.from('rehearsals').select('id,rehearsal_date,rehearsal_songs(id,sort_order,songs(id,title,artist))', { count: 'exact' }).eq('band_id', bandId)
  request = past ? request.lt('rehearsal_date', today) : request.gte('rehearsal_date', today)
  const { data, count, error } = await request.order('rehearsal_date', { ascending: !past }).order('id').range(page * overviewPageSize, (page + 1) * overviewPageSize - 1).setHeader('x-band-id', bandId).abortSignal(AbortSignal.any([signal, AbortSignal.timeout(20_000)]))
  if (error) throw new Error('합주 일정을 불러오지 못했습니다.')
  return { items: data as unknown as OverviewRehearsal[], total: count ?? 0 }
}
