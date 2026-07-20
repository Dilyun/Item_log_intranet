import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function ProtectedRoute() {
  const { user, booting } = useAuth()

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        불러오는 중...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

export function AdminRoute() {
  const { isAdmin } = useAuth()
  if (!isAdmin) {
    return <Navigate to="/logs" replace />
  }
  return <Outlet />
}
