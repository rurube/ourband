import { supabase } from '../lib/supabase'

export type AuthAction = 'login' | 'create-band' | 'join-band' | 'recover' | 'rotate-invite' | 'reset-member-pin' | 'rotate-recovery'
export interface AuthResult {
  session?: { access_token: string; refresh_token: string }
  created?: boolean
  bandCode?: string | null
  recoveryKey?: string | null
  updated?: boolean
}
export async function authRequest(action: AuthAction, values: Record<string, string> = {}): Promise<AuthResult> {
  if (!supabase) throw new Error('Supabase 연결 설정이 없습니다. 관리자에게 문의해주세요.')
  const { data: { session } } = await supabase.auth.getSession()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25_000)
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/band-auth`, {
      method: 'POST', signal: controller.signal,
      headers: {
        'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ action, ...values }),
    })
    const result: unknown = await response.json()
    if (!response.ok) throw new Error(typeof result === 'object' && result && 'error' in result && typeof result.error === 'string' ? result.error : '요청을 처리하지 못했습니다.')
    if (!result || typeof result !== 'object') throw new Error('인증 응답을 확인할 수 없습니다.')
    return result as AuthResult
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('응답 시간이 초과됐습니다. 가입했다면 로그인으로 다시 확인해주세요.')
    if (error instanceof TypeError) throw new Error('서버에 연결하지 못했습니다. 네트워크 상태를 확인해주세요.')
    throw error
  } finally { clearTimeout(timeout) }
}
