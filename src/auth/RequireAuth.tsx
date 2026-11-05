import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { useState } from 'react'

export function RequireAuth() {
  const { session, profile, loading, error, retry, logout } = useAuth()
  const [logoutError, setLogoutError] = useState('')
  if (loading) return <div className="auth-loading" role="status"><span className="loading-line" />밴드 정보를 불러오고 있어요…</div>
  if (!session) return <Navigate to="/login" replace />
  if (error || !profile) return <section className="panel auth-error"><h1>밴드 정보를 확인해주세요</h1><p role="alert">{logoutError || error || '가입 정보가 아직 준비되지 않았습니다.'}</p><button className="primary-button" onClick={retry}>다시 시도</button><button className="secondary-button" onClick={() => { void logout().catch((e: Error) => setLogoutError(e.message)) }}>로그아웃</button></section>
  return <Outlet />
}
