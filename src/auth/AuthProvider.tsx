import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface Profile { id: string; nickname: string; band_id: string; band_role: 'leader' | 'member'; bandName: string }
interface AuthContextValue {
  session: Session | null; profile: Profile | null; loading: boolean; error: string | null
  logout: () => Promise<void>; retry: () => void
}
const Context = createContext<AuthContextValue | null>(null)
export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!supabase)
  const [sessionError, setSessionError] = useState<string | null>(null)
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
  // Remove cached data when a user changes, including cross-tab sign-out.
  useEffect(() => { queryClient.removeQueries({ predicate: query => query.queryKey[0] !== 'profile' || query.queryKey[1] !== userId }) }, [userId, queryClient])
  const profileQuery = useQuery({
    queryKey: ['profile', userId], enabled: !!userId,
    queryFn: async (): Promise<Profile> => {
      if (!supabase || !userId) throw new Error('로그인이 필요합니다.')
      const { data: p, error } = await supabase.from('profiles').select('id,nickname,band_id,band_role').eq('id', userId).single()
      if (error || !p) throw new Error('밴드 회원 정보를 불러오지 못했습니다. 다시 시도하거나 로그인해주세요.')
      const { data: band, error: bandError } = await supabase.from('bands').select('name').eq('id', p.band_id).single()
      if (bandError || !band) throw new Error('밴드 정보를 불러오지 못했습니다.')
      return { id: p.id, nickname: p.nickname, band_id: p.band_id, band_role: p.band_role, bandName: band.name }
    },
    retry: 1, staleTime: 60_000,
  })
  const logout = async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw new Error('로그아웃하지 못했습니다. 다시 시도해주세요.')
    }
    setSession(null); queryClient.clear()
  }
  return <Context.Provider value={{ session, profile: session ? profileQuery.data ?? null : null,
    loading: !ready || (!!session && profileQuery.isPending),
    error: sessionError ?? profileQuery.error?.message ?? null, logout,
    retry: () => { void profileQuery.refetch() },
  }}>{children}</Context.Provider>
}
export function useAuth() {
  const context = useContext(Context)
  if (!context) throw new Error('AuthProvider가 필요합니다.')
  return context
}
