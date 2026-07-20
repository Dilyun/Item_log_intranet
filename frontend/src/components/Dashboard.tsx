import { useCallback, useEffect, useState } from 'react'
import { Activity, Radio, RefreshCw } from 'lucide-react'
import {
  formatDateTime,
  formatNumber,
  formatWon,
  getErrorMessage,
  supabase,
} from '../lib/supabaseClient'
import type { TradeLog } from '../types'

function Dashboard() {
  const [logs, setLogs] = useState<TradeLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [live, setLive] = useState(false)

  const loadLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: queryError } = await supabase
        .from('trade_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (queryError) throw queryError
      setLogs((data ?? []) as TradeLog[])
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLogs()

    const channel = supabase
      .channel('trade-logs-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trade_logs' },
        (payload) => {
          const next = payload.new as TradeLog
          setLogs((current) => {
            if (current.some((log) => log.id === next.id)) return current
            return [next, ...current].slice(0, 100)
          })
        },
      )
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED')
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadLogs])

  const totalAmount = logs.reduce(
    (sum, log) => sum + BigInt(log.total_price || 0),
    0n,
  )

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-emerald-400">
            LIVE MONITOR
          </p>
          <h2 className="mt-1 text-2xl font-bold text-zinc-50">실시간 거래 로그</h2>
          <p className="mt-1 text-sm text-zinc-400">
            최신 거래부터 최대 100건까지 표시합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
              live
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            {live ? 'Realtime 연결됨' : '연결 대기'}
          </span>
          <button
            type="button"
            onClick={() => void loadLogs()}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-500"
          >
            <RefreshCw className="h-4 w-4" />
            새로고침
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
            <Activity className="h-5 w-5" />
          </div>
          <p className="text-sm text-zinc-400">표시 중인 로그</p>
          <p className="mt-1 text-2xl font-bold text-zinc-50">{logs.length}</p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
          <p className="text-sm text-zinc-400">총 수량</p>
          <p className="mt-1 text-2xl font-bold text-zinc-50">
            {formatNumber(
              logs.reduce((sum, log) => sum + BigInt(log.quantity || 0), 0n),
            )}
            EA
          </p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
          <p className="text-sm text-zinc-400">총 거래 금액</p>
          <p className="mt-1 text-2xl font-bold text-zinc-50">
            {formatWon(totalAmount.toString())}
          </p>
        </article>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/80">
        {loading && (
          <div className="px-6 py-16 text-center text-zinc-400">불러오는 중...</div>
        )}
        {!loading && error && (
          <div className="px-6 py-16 text-center text-rose-300">{error}</div>
        )}
        {!loading && !error && logs.length === 0 && (
          <div className="px-6 py-16 text-center text-zinc-400">
            아직 거래 로그가 없습니다.
          </div>
        )}
        {!loading && !error && logs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-950/80 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">판매자</th>
                  <th className="px-4 py-3 font-semibold">구매자</th>
                  <th className="px-4 py-3 font-semibold">아이템</th>
                  <th className="px-4 py-3 font-semibold">수량</th>
                  <th className="px-4 py-3 font-semibold">금액</th>
                  <th className="px-4 py-3 font-semibold">시간</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-t border-zinc-800/80 text-zinc-200 hover:bg-zinc-800/40"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-50">{log.seller_name}</div>
                      <div className="text-xs text-zinc-500">#{log.seller_code}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-50">{log.buyer_name}</div>
                      <div className="text-xs text-zinc-500">#{log.buyer_code}</div>
                    </td>
                    <td className="px-4 py-3 text-zinc-200">{log.item_name}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatNumber(log.quantity)}EA
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-emerald-300">
                      {formatWon(log.total_price)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-zinc-400">
                      {formatDateTime(log.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

export default Dashboard
