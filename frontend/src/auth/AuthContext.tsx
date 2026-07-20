import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  cleanOAuthUrl,
  getErrorMessage,
  recoverSessionFromUrl,
  resolveAppUserFromAuth,
  signOut,
  supabase,
} from '../lib/supabaseClient'
import type { AppUser } from '../types'

type AuthContextValue = {
  user: AppUser | null
  isAdmin: boolean
  booting: boolean
  authError: string
  setAuthError: (message: string) => void
  refreshUser: () => Promise<AppUser | null>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [booting, setBooting] = useState(true)
  const [authError, setAuthError] = useState('')

  const refreshUser = useCallback(async () => {
    const session = await recoverSessionFromUrl()
    if (!session) {
      setUser(null)
      return null
    }
    const appUser = await resolveAppUserFromAuth(session.user)
    setUser(appUser)
    setAuthError('')
    return appUser
  }, [])

  useEffect(() => {
    let active = true

    async function bootstrap() {
      setBooting(true)
      try {
        const session = await recoverSessionFromUrl()
        if (!active) return
        if (!session) {
          setUser(null)
          return
        }
        const appUser = await resolveAppUserFromAuth(session.user)
        if (active) {
          setUser(appUser)
          setAuthError('')
        }
      } catch (error) {
        cleanOAuthUrl()
        await supabase.auth.signOut()
        if (active) {
          setUser(null)
          setAuthError(getErrorMessage(error))
        }
      } finally {
        if (active) setBooting(false)
      }
    }

    void bootstrap()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return

      void (async () => {
        if (!session) {
          if (active) setUser(null)
          return
        }
        try {
          const appUser = await resolveAppUserFromAuth(session.user)
          if (active) {
            setUser(appUser)
            setAuthError('')
            cleanOAuthUrl()
          }
        } catch (error) {
          await supabase.auth.signOut()
          if (active) {
            setUser(null)
            setAuthError(getErrorMessage(error))
          }
        }
      })()
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const logout = useCallback(async () => {
    await signOut()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      isAdmin: user?.role === 2,
      booting,
      authError,
      setAuthError,
      refreshUser,
      logout,
    }),
    [user, booting, authError, refreshUser, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있습니다.')
  }
  return context
}
