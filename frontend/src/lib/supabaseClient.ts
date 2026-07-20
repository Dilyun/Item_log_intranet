import { createClient, type User } from '@supabase/supabase-js'
import type { AppUser, UserRole } from '../types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY 환경 변수가 필요합니다.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})

export function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: string }).message)
  }
  return '알 수 없는 오류가 발생했습니다.'
}

export function isPermissionError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String((error as { code?: string }).code) : ''
  const status =
    'status' in error ? Number((error as { status?: number }).status) : 0
  const message = getErrorMessage(error).toLowerCase()
  return (
    status === 401 ||
    status === 403 ||
    code === '42501' ||
    message.includes('permission') ||
    message.includes('row-level security') ||
    message.includes('rls') ||
    message.includes('not allowed')
  )
}

export function handleMutationError(error: unknown, fallback: string) {
  if (isPermissionError(error)) {
    window.alert('권한이 없습니다. 관리자만 수정할 수 있습니다. (RLS 차단)')
    return
  }
  window.alert(`${fallback}\n${getErrorMessage(error)}`)
}

export function formatWon(value: number | string | bigint) {
  return `${BigInt(value || 0).toLocaleString('ko-KR')}원`
}

export function formatNumber(value: number | string | bigint) {
  return BigInt(value || 0).toLocaleString('ko-KR')
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value))
}

export function getDiscordIdFromAuthUser(user: User) {
  const identity = user.identities?.find((item) => item.provider === 'discord')
  const meta = user.user_metadata ?? {}
  const fromMeta =
    (typeof meta.provider_id === 'string' && meta.provider_id) ||
    (typeof meta.sub === 'string' && meta.sub) ||
    null

  return identity?.id || fromMeta || null
}

export async function resolveAppUserFromAuth(
  authUser: User,
): Promise<AppUser> {
  const discordId = getDiscordIdFromAuthUser(authUser)
  if (!discordId) {
    throw new Error('Discord 계정 정보를 가져오지 못했습니다.')
  }

  const { data, error } = await supabase
    .from('users')
    .select('discord_id, user_code, nickname, role')
    .eq('discord_id', discordId)
    .maybeSingle()

  if (error) throw error
  if (!data) {
    throw new Error(
      `등록되지 않은 Discord 계정입니다. (ID: ${discordId}) 관리자에게 등록을 요청해 주세요.`,
    )
  }
  if (Number(data.role) === 0) {
    throw new Error('정지된 계정입니다.')
  }

  return {
    discord_id: data.discord_id,
    user_code: Number(data.user_code),
    nickname: data.nickname,
    role: Number(data.role) as UserRole,
  }
}

export async function signInWithDiscord() {
  const redirectTo = window.location.origin
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: {
      redirectTo,
      scopes: 'identify',
      skipBrowserRedirect: false,
    },
  })
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

/** OAuth 콜백 URL의 ?code= 를 세션으로 교환한다. */
export async function consumeOAuthCallback() {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const authError = url.searchParams.get('error_description')

  if (authError) {
    throw new Error(authError)
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    url.searchParams.delete('code')
    url.searchParams.delete('state')
    window.history.replaceState({}, '', url.pathname + url.search + url.hash)
    if (error) throw error
  }
}
