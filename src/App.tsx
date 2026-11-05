import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { BandPage } from './pages/BandPage'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { SongsPage } from './pages/SongsPage'
import { HomePage } from './pages/HomePage'
import { RehearsalsPage } from './pages/RehearsalsPage'

export function App() {
  return <Routes>
    <Route element={<Layout />}>
      <Route index element={<Navigate to="/home" replace />} />
      <Route path="login" element={<LoginPage />} />
      <Route element={<RequireAuth requireBand={false} />}><Route path="home" element={<HomePage />} /><Route path="band" element={<BandPage />} /></Route>
      <Route element={<RequireAuth />}>
      <Route path="songs" element={<SongsPage />} />
      <Route path="rehearsals" element={<RehearsalsPage />} /></Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Route>
  </Routes>
}
