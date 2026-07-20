import { useEffect, useMemo, useState } from 'react'
import {
  LayoutDashboard,
  LogOut,
  Settings as SettingsIcon,
  Users,
} from 'lucide-react'
import intranetLogo from './assets/intranet_logo.png'
import Dashboard from './components/Dashboard'
import Login from './components/Login'
import Settings from './components/Settings'
import UserManagement from './components/UserManagement'
import {
  cleanOAuthUrl,
  getErrorMessage,
  recoverSessionFromUrl,
  resolveAppUserFromAuth,
  signOut,
  supabase,
} from './lib/supabaseClient'
import type { AppTab, AppUser } from './types'

const allTabs: Array<{
  id: AppTab
  label: string
  icon: typeof LayoutDashboard
  adminOnly?: boolean
}> = [
  { id: 'dashboard', label: '실시간 로그', icon: LayoutDashboard },
  { id: 'users', label: '유저 관리', icon: Users, adminOnly: true },
  { id: 'settings', label: '아이템/진영', icon: SettingsIcon, adminOnly: true },
]

function App() {
  const [user, setUser] = useState<AppUser | null>(null)
  const [booting, setBooting] = useState(true)
  const [authError, setAuthError] = useState('')
  const [tab, setTab] = useState<AppTab>('dashboard')

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

  const isAdmin = useMemo(() => user?.role === 2, [user])
  const visibleTabs = useMemo(
    () => allTabs.filter((item) => !item.adminOnly || isAdmin),
    [isAdmin],
  )

  useEffect(() => {
    if (!isAdmin && (tab === 'users' || tab === 'settings')) {
      setTab('dashboard')
    }
  }, [isAdmin, tab])

  async function logout() {
    try {
      await signOut()
    } finally {
      setUser(null)
      setTab('dashboard')
    }
  }

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        불러오는 중...
      </div>
    )
  }

  if (!user) {
    return <Login error={authError} />
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <aside className="hidden w-64 shrink-0 border-r border-zinc-800 bg-zinc-900/60 p-5 md:block">
          <div className="mb-8">
            <div className="flex items-center gap-3">
              <img
                src={intranetLogo}
                alt="천상회 인트라넷"
                className="h-10 w-10 rounded-xl object-cover"
              />
              <div>
                <p className="text-xs font-semibold tracking-[0.2em] text-emerald-400">
                  천상회
                </p>
                <h1 className="mt-1 text-xl font-bold">인트라넷 대시보드</h1>
              </div>
            </div>
            <p className="mt-3 text-sm text-zinc-400">
              {user.nickname}
              <span className="text-zinc-600"> #{user.user_code}</span>
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {isAdmin ? '관리자 권한' : '일반 권한'}
            </p>
          </div>

          <nav className="space-y-1">
            {visibleTabs.map((item) => {
              const Icon = item.icon
              const active = tab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                    active
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              )
            })}
          </nav>

          <button
            type="button"
            onClick={() => void logout()}
            className="mt-8 flex w-full items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2.5 text-sm text-zinc-300 hover:border-zinc-500"
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </button>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-4 md:hidden">
            <div>
              <p className="text-sm font-semibold text-zinc-50">{user.nickname}</p>
              <p className="text-xs text-zinc-500">#{user.user_code}</p>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300"
            >
              로그아웃
            </button>
          </header>

          <div className="flex gap-2 overflow-x-auto border-b border-zinc-800 px-4 py-3 md:hidden">
            {visibleTabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
                  tab === item.id
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-zinc-900 text-zinc-400'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <main className="flex-1 p-4 md:p-8">
            {tab === 'dashboard' && <Dashboard />}
            {tab === 'users' && isAdmin && (
              <UserManagement isAdmin currentUser={user} />
            )}
            {tab === 'settings' && isAdmin && <Settings isAdmin />}
          </main>
        </div>
      </div>
    </div>
  )
}

export default App
