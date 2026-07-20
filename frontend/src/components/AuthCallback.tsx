import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getErrorMessage } from '../lib/supabaseClient'

function AuthCallback() {
  const navigate = useNavigate()
  const { refreshUser, setAuthError } = useAuth()
  const [message, setMessage] = useState('로그인 처리 중...')

  useEffect(() => {
    let active = true

    async function completeLogin() {
      try {
        const appUser = await refreshUser()
        if (!active) return
        if (!appUser) {
          setAuthError('로그인 세션을 만들지 못했습니다. 다시 시도해 주세요.')
          navigate('/', { replace: true })
          return
        }
        navigate('/logs', { replace: true })
      } catch (error) {
        if (!active) return
        const text = getErrorMessage(error)
        setMessage(text)
        setAuthError(text)
        navigate('/', { replace: true })
      }
    }

    void completeLogin()
    return () => {
      active = false
    }
  }, [navigate, refreshUser, setAuthError])

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-center text-zinc-300">
      {message}
    </div>
  )
}

export default AuthCallback
