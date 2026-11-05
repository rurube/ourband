import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface Account { id: string; login_id: string }
export interface Profile { user_id: string; nickname: string; band_id: string; band_role: 'leader' | 'member'; bandName: string; available_sessions: string[]; main_session: string | null }
interface Identity { account: Account; memberships: Profile[] }
interface AuthContextValue {
  session: Session | null; account: Account | null; memberships: Profile[]; profile: Profile | null
  loading: boolean; error: string | null; logout: () => Promise<void>; retry: () => void
  selectBand: (id: string) => void; refreshIdentity: (preferredBand?: string) => Promise<void>
}
const Context = createContext<AuthContextValue | null>(null)
const storageKey = (id: string) => `ourband-selected-band:${id}`
function rememberedBand(id: string | undefined) {
  try { return id ? localStorage.getItem(storageKey(id)) : null } catch { return null }
}
export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!supabase)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [selection, setSelection] = useState<{ userId: string; bandId: string } | null>(null)
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!supabase) return
    let alive = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (alive) { setSession(next); setReady(true); setSessionError(null) }
    })
    void supabase.auth.getSession().then(({ data, error }) => {
      if (alive) { setSession(data.session); setReady(true); if (error) setSessionError('세션을 불러오지 못했습니다. 다시 로그인해주세요.') }
    })
    return () => { alive = false; subscription.unsubscribe() }
  }, [])
  const userId = session?.user.id
  useEffect(() => { queryClient.removeQueries({ predicate: query => query.queryKey[0] !== 'identity' || query.queryKey[1] !== userId }) }, [userId, queryClient])
  const identity = useQuery({
    queryKey: ['identity', userId], enabled: !!userId,
    queryFn: async ({ signal }): Promise<Identity> => {
      if (!supabase || !userId) throw new Error('로그인이 필요합니다.')
      const abort = AbortSignal.any([signal, AbortSignal.timeout(20_000)])
      const { data: account, error } = await supabase.from('profiles').select('id,login_id').eq('id', userId).abortSignal(abort).single()
      if (error || !account) throw new Error('계정 정보를 불러오지 못했습니다. 다시 시도하거나 로그인해주세요.')
      const { data, error: membershipError } = await supabase.from('band_memberships').select('user_id,band_id,nickname,band_role,available_sessions,main_session,bands(name)').eq('user_id', userId).order('created_at').order('band_id').abortSignal(abort)
      if (membershipError || !data) throw new Error('가입한 밴드를 불러오지 못했습니다.')
      type Row = Omit<Profile, 'bandName'> & { bands: { name: string } | null }
      const memberships = (data as unknown as Row[]).map(({ bands, ...row }) => ({ ...row, bandName: bands?.name ?? '이름 없는 밴드' }))
      return { account: account as Account, memberships }
    }, retry: 1, staleTime: 60_000,
  })
  const memberships = session ? identity.data?.memberships ?? [] : []
  // Read persistence once per account. Another tab cannot redirect this tab's
  // active band merely by changing localStorage before a token refresh.
  const remembered = useMemo(() => rememberedBand(userId), [userId])
  const selected = selection && selection.userId === userId ? selection.bandId : remembered
  const profile = memberships.find(item => item.band_id === selected) ?? memberships[0] ?? null
  const activeBand = profile?.band_id
  useEffect(() => {
    // Aborted reads cannot populate the next band's screen. Mutation requests
    // capture their own x-band-id at creation and never consult global state.
    return () => { if (activeBand) void queryClient.cancelQueries({ queryKey: ['songs', activeBand] }) }
  }, [activeBand, queryClient])
  function choose(id: string) {
    if (!userId) return
    setSelection({ userId, bandId: id })
    try { localStorage.setItem(storageKey(userId), id) } catch { /* session still works without storage */ }
  }
  function selectBand(id: string) { if (memberships.some(item => item.band_id === id)) choose(id) }
  async function refreshIdentity(preferredBand?: string) {
    const result = await identity.refetch()
    if (result.error) throw result.error
    if (preferredBand && result.data?.memberships.some(item => item.band_id === preferredBand)) choose(preferredBand)
  }
  const logout = async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw new Error('로그아웃하지 못했습니다. 다시 시도해주세요.')
    }
    setSession(null); setSelection(null); queryClient.clear()
  }
  return <Context.Provider value={{ session, account: session ? identity.data?.account ?? null : null, memberships, profile,
    loading: !ready || (!!session && identity.isPending), error: sessionError ?? identity.error?.message ?? null,
    logout, retry: () => { void identity.refetch() }, selectBand, refreshIdentity,
  }}>{children}</Context.Provider>
}
export function useAuth() {
  const context = useContext(Context)
  if (!context) throw new Error('AuthProvider가 필요합니다.')
  return context
}
