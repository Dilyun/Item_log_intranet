import { useState } from 'react'
import DiscordIcon from './DiscordIcon.jsx'
import Icon from './Icon.jsx'
import { discordClientId } from '../api.js'

function startDiscordLogin(userCode) {
  const state = crypto.randomUUID()
  sessionStorage.setItem('oauth_state', state)
  sessionStorage.setItem('oauth_user_code', userCode)

  const params = new URLSearchParams({
    client_id: discordClientId,
    redirect_uri: window.location.origin,
    response_type: 'code',
    scope: 'identify',
    state,
    prompt: 'none',
  })

  window.location.assign(
    `https://discord.com/oauth2/authorize?${params.toString()}`,
  )
}

function LoginPage({ authenticating, error }) {
  const [userCode, setUserCode] = useState('')
  const validUserCode = /^\d+$/.test(userCode) && Number(userCode) > 0

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-badge">
          <DiscordIcon size={34} />
        </div>
        <h1>Discord 로그 대시보드</h1>
        <p className="login-description">
          서버 활동 로그를 확인하려면
          <br />
          Discord 계정으로 로그인해 주세요.
        </p>

        {error && (
          <p className="login-error" role="alert">
            <Icon name="error" />
            {error}
          </p>
        )}

        <label className="user-code-field">
          <span>유저 고유번호</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="예: 7259"
            value={userCode}
            onChange={(event) =>
              setUserCode(event.target.value.replace(/\D/g, ''))
            }
            disabled={authenticating}
          />
        </label>

        <button
          className="discord-login-button"
          onClick={() => startDiscordLogin(userCode)}
          disabled={authenticating || !validUserCode}
        >
          <DiscordIcon size={22} />
          {authenticating ? '로그인 중...' : 'Discord로 로그인'}
        </button>

        <p className="login-footnote">
          <Icon name="lock" />
          프로필 확인(identify) 권한만 사용합니다.
        </p>
      </section>
    </main>
  )
}

export default LoginPage
