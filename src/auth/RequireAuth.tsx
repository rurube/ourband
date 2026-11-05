import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { useState } from 'react'

export function RequireAuth({ requireBand = true }: { requireBand?: boolean }) {
  const { session, account, profile, loading, error, retry, logout } = useAuth()
  const [logoutError, setLogoutError] = useState('')
  if (loading) return <div className="auth-loading" role="status"><span className="loading-line" />계정과 밴드를 불러오고 있어요…</div>
  if (!session) return <Navigate to="/login" replace />
  if (error || !account) return <section className="panel auth-error"><h1>계정 정보를 확인해주세요</h1><p role="alert">{logoutError || error || '가입 정보가 아직 준비되지 않았습니다.'}</p><button className="primary-button" onClick={retry}>다시 시도</button><button className="secondary-button" onClick={() => { void logout().catch((e: Error) => setLogoutError(e.message)) }}>로그아웃</button></section>
  if (requireBand && !profile) return <Navigate to="/band" replace />
  return <Outlet key={`${session.user.id}:${requireBand ? profile?.band_id : 'account'}`} />
}
