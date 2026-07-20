import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import AppLayout from './components/AppLayout'
import AuthCallback from './components/AuthCallback'
import Dashboard from './components/Dashboard'
import Login from './components/Login'
import {
  AdminRoute,
  ProtectedRoute,
} from './components/ProtectedRoute'
import Settings from './components/Settings'
import UserManagement from './components/UserManagement'
import { useAuth } from './auth/AuthContext'

function LoginPage() {
  const { user, booting, authError } = useAuth()
  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        불러오는 중...
      </div>
    )
  }
  if (user) return <Navigate to="/logs" replace />
  return <Login error={authError} />
}

function AppRoutes() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/logs" element={<Dashboard />} />
          <Route element={<AdminRoute />}>
            <Route
              path="/users"
              element={
                user ? (
                  <UserManagement isAdmin currentUser={user} />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route path="/settings" element={<Settings isAdmin />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/logs" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

export default App
