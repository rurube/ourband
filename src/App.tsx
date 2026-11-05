import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { BandPage } from './pages/BandPage'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { SongsPage } from './pages/SongsPage'
import { RehearsalsPage } from './pages/RehearsalsPage'

export function App() {
  return <Routes>
    <Route element={<Layout />}>
      <Route index element={<Navigate to="/login" replace />} />
      <Route path="login" element={<LoginPage />} />
      <Route element={<RequireAuth />}><Route path="band" element={<BandPage />} />
      <Route path="songs" element={<SongsPage />} />
      <Route path="rehearsals" element={<RehearsalsPage />} /></Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Route>
  </Routes>
}
