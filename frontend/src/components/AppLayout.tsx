import { NavLink, Outlet } from 'react-router-dom'
import {
  Calculator,
  LayoutDashboard,
  LogOut,
  Settings as SettingsIcon,
  Users,
} from 'lucide-react'
import intranetLogo from '../assets/intranet_logo.png'
import { useAuth } from '../auth/AuthContext'

const navItems = [
  { to: '/logs', label: '실시간 로그', icon: LayoutDashboard, adminOnly: false },
  { to: '/calculator', label: '계산기', icon: Calculator, adminOnly: false },
  { to: '/users', label: '유저 관리', icon: Users, adminOnly: true },
  { to: '/settings', label: '설정', icon: SettingsIcon, adminOnly: true },
]

function AppLayout() {
  const { user, isAdmin, logout } = useAuth()

  if (!user) return null

  const visibleItems = navItems.filter((item) => !item.adminOnly || isAdmin)

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <aside className="hidden w-64 shrink-0 border-r border-zinc-800 bg-zinc-900 p-5 md:flex md:flex-col">
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
              <h1 className="mt-1 text-xl font-bold">인트라넷</h1>
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
          {visibleItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                    isActive
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'text-zinc-300 hover:bg-zinc-800'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        <button
          type="button"
          onClick={() => void logout()}
          className="mt-auto flex w-full items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2.5 text-sm text-zinc-300 hover:border-zinc-500"
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
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-zinc-900 text-zinc-400'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>

        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AppLayout
