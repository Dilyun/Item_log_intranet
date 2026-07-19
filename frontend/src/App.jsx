import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { api, getToken, setToken, clearToken } from './api.js'
import Icon from './components/Icon.jsx'
import LoginPage from './components/LoginPage.jsx'
import './App.css'

function formatDate(value) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value))
}

function formatNumber(value) {
  return BigInt(value || 0).toLocaleString('ko-KR')
}

function App() {
  const [user, setUser] = useState(null)
  const [authenticating, setAuthenticating] = useState(true)
  const [authError, setAuthError] = useState('')

  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
    setLogs([])
  }, [])

  // 첫 진입: OAuth 콜백(code)
  useEffect(() => {
    const controller = new AbortController()

    async function bootstrap() {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const state = params.get('state')

      if (code) {
        window.history.replaceState({}, '', window.location.pathname)

        if (state !== sessionStorage.getItem('oauth_state')) {
          setAuthError('인증 상태가 일치하지 않습니다. 다시 시도해 주세요.')
          setAuthenticating(false)
          return
        }
        const userCode = sessionStorage.getItem('oauth_user_code')
        sessionStorage.removeItem('oauth_state')
        sessionStorage.removeItem('oauth_user_code')

        try {
          const response = await api.post(
            '/api/auth/discord',
            { code, redirectUri: window.location.origin, userCode },
            { signal: controller.signal },
          )
          setToken(response.data.token)
          setUser(response.data.user)
        } catch (requestError) {
          if (!axios.isCancel(requestError)) {
            setAuthError(
              requestError.response?.data?.message ||
                '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.',
            )
          }
        } finally {
          if (!controller.signal.aborted) setAuthenticating(false)
        }
        return
      }

      if (!getToken()) {
        setAuthenticating(false)
        return
      }

      try {
        const response = await api.get('/api/me', { signal: controller.signal })
        setUser(response.data.user)
      } catch (requestError) {
        if (!axios.isCancel(requestError)) clearToken()
      } finally {
        if (!controller.signal.aborted) setAuthenticating(false)
      }
    }

    bootstrap()
    return () => controller.abort()
  }, [])

  const loadLogs = useCallback(
    async (signal) => {
      setLoading(true)
      setError('')

      try {
        const response = await api.get('/api/logs', {
          params: { limit: 100 },
          signal,
        })
        setLogs(response.data.data ?? response.data)
      } catch (requestError) {
        if (axios.isCancel(requestError)) return
        if (requestError.response?.status === 401) {
          logout()
          return
        }
        setError(
          requestError.response?.data?.message ||
            '로그를 불러오지 못했습니다. API 주소와 CORS 설정을 확인해 주세요.',
        )
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [logout],
  )

  useEffect(() => {
    if (!user) return
    const controller = new AbortController()
    loadLogs(controller.signal)
    return () => controller.abort()
  }, [user, loadLogs])

  if (authenticating || !user) {
    return <LoginPage authenticating={authenticating} error={authError} />
  }

  return (
    <main className="dashboard">
      <header className="page-header">
        <div>
          <p className="eyebrow">DISCORD ACTIVITY</p>
          <h1>거래 로그 대시보드</h1>
          <p className="subtitle">
            Discord 서버에서 수집된 아이템 거래를 확인합니다.
          </p>
        </div>

        <div className="header-actions">
          <div className="user-chip">
            <img src={user.avatarUrl} alt="" width="34" height="34" />
            <div>
              <strong>{user.globalName}</strong>
              <small>@{user.username}</small>
            </div>
          </div>
          <button className="icon-button" onClick={() => loadLogs()} title="새로고침">
            <Icon name="refresh" />
          </button>
          <button className="icon-button" onClick={logout} title="로그아웃">
            <Icon name="logout" />
          </button>
        </div>
      </header>

      <section className="summary" aria-label="로그 요약">
        <article>
          <Icon name="monitoring" className="summary-icon" />
          <div>
            <span>표시 중인 로그</span>
            <strong>{logs.length}</strong>
          </div>
        </article>
        <article>
          <Icon name="inventory_2" className="summary-icon" />
          <div>
            <span>총 거래 수량</span>
            <strong>
              {formatNumber(
                logs.reduce(
                  (total, log) => total + BigInt(log.quantity || 0),
                  0n,
                ),
              )}
            </strong>
          </div>
        </article>
        <article>
          <Icon name="payments" className="summary-icon" />
          <div>
            <span>총 거래 금액</span>
            <strong>
              {formatNumber(
                logs.reduce(
                  (total, log) => total + BigInt(log.totalPrice || 0),
                  0n,
                ),
              )}
              원
            </strong>
          </div>
        </article>
      </section>

      <section className="log-panel">
        <div className="panel-heading">
          <div>
            <h2>최근 거래</h2>
            <p>최신 거래부터 최대 100개까지 표시됩니다.</p>
          </div>
          {!loading && !error && (
            <span className="status">
              <Icon name="check_circle" />
              연결됨
            </span>
          )}
        </div>

        {loading && (
          <div className="state">
            <Icon name="progress_activity" className="spin" />
            불러오는 중...
          </div>
        )}
        {error && (
          <div className="state error" role="alert">
            <p>
              <Icon name="error" />
              {error}
            </p>
            <button onClick={() => loadLogs()}>다시 시도</button>
          </div>
        )}
        {!loading && !error && logs.length === 0 && (
          <div className="state">
            <Icon name="inbox" />
            아직 수집된 로그가 없습니다.
          </div>
        )}

        {!loading && !error && logs.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>판매자</th>
                  <th>구매자</th>
                  <th>아이템</th>
                  <th>수량</th>
                  <th>금액</th>
                  <th>시간</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <strong>{log.sellerName}</strong>
                      <small>#{log.sellerCode}</small>
                    </td>
                    <td>
                      <strong>{log.buyerName}</strong>
                      <small>#{log.buyerCode}</small>
                    </td>
                    <td className="message">{log.itemName}</td>
                    <td>{formatNumber(log.quantity)}EA</td>
                    <td>{formatNumber(log.totalPrice)}원</td>
                    <td className="date">{formatDate(log.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

export default App
