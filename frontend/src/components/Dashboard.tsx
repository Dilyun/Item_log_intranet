import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Radio, RefreshCw } from 'lucide-react'
import {
  formatDateTime,
  formatNumber,
  formatWon,
  getErrorMessage,
  supabase,
} from '../lib/supabaseClient'
import type { TradeLog } from '../types'

type PeriodFilter = 'today' | 'week' | 'month'
type RankTab = 'seller' | 'buyer' | 'item'

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: 'today', label: '오늘' },
  { value: 'week', label: '일주일' },
  { value: 'month', label: '한달' },
]

const RANK_TABS: { value: RankTab; label: string }[] = [
  { value: 'seller', label: '판매자' },
  { value: 'buyer', label: '구매자' },
  { value: 'item', label: '아이템' },
]

type RankRow = {
  key: string
  label: string
  subLabel?: string
  count: number
  quantity: bigint
  amount: bigint
}

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function getPeriodStart(period: PeriodFilter) {
  const start = startOfLocalDay()
  if (period === 'week') {
    start.setDate(start.getDate() - 6)
  } else if (period === 'month') {
    start.setDate(start.getDate() - 29)
  }
  return start.toISOString()
}

function matchesSearch(log: TradeLog, seller: string, buyer: string, item: string) {
  const sellerQuery = seller.trim().toLowerCase()
  const buyerQuery = buyer.trim().toLowerCase()
  const itemQuery = item.trim().toLowerCase()

  if (sellerQuery) {
    const sellerText = `${log.seller_name} ${log.seller_code}`.toLowerCase()
    if (!sellerText.includes(sellerQuery)) return false
  }
  if (buyerQuery) {
    const buyerText = `${log.buyer_name} ${log.buyer_code}`.toLowerCase()
    if (!buyerText.includes(buyerQuery)) return false
  }
  if (itemQuery) {
    if (!log.item_name.toLowerCase().includes(itemQuery)) return false
  }
  return true
}

function buildRankings(logs: TradeLog[], tab: RankTab): RankRow[] {
  const map = new Map<string, RankRow>()

  for (const log of logs) {
    let key = ''
    let label = ''
    let subLabel: string | undefined

    if (tab === 'seller') {
      key = `seller:${log.seller_code}`
      label = log.seller_name
      subLabel = `#${log.seller_code}`
    } else if (tab === 'buyer') {
      key = `buyer:${log.buyer_code}`
      label = log.buyer_name
      subLabel = `#${log.buyer_code}`
    } else {
      key = `item:${log.item_name}`
      label = log.item_name
    }

    const current = map.get(key) ?? {
      key,
      label,
      subLabel,
      count: 0,
      quantity: 0n,
      amount: 0n,
    }
    current.count += 1
    current.quantity += BigInt(log.quantity || 0)
    current.amount += BigInt(log.total_price || 0)
    map.set(key, current)
  }

  return [...map.values()].sort((a, b) => {
    if (a.amount === b.amount) return b.count - a.count
    return a.amount > b.amount ? -1 : 1
  })
}

function escapeCsvCell(value: string | number) {
  const text = String(value)
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

function downloadTradeLogsCsv(logs: TradeLog[], periodLabel: string) {
  const header = [
    'id',
    'seller_code',
    'seller_name',
    'buyer_code',
    'buyer_name',
    'item_name',
    'quantity',
    'total_price',
    'created_at',
  ]

  const rows = logs.map((log) =>
    [
      log.id,
      log.seller_code,
      log.seller_name,
      log.buyer_code,
      log.buyer_name,
      log.item_name,
      log.quantity,
      String(log.total_price),
      log.created_at,
    ]
      .map(escapeCsvCell)
      .join(','),
  )

  const csv = `\uFEFF${[header.join(','), ...rows].join('\n')}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-')
  const link = document.createElement('a')
  link.href = url
  link.download = `trade-logs-${periodLabel}-${stamp}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function Dashboard() {
  const [logs, setLogs] = useState<TradeLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [live, setLive] = useState(false)

  const [period, setPeriod] = useState<PeriodFilter>('today')
  const [rankTab, setRankTab] = useState<RankTab>('seller')
  const [sellerQuery, setSellerQuery] = useState('')
  const [buyerQuery, setBuyerQuery] = useState('')
  const [itemQuery, setItemQuery] = useState('')
  const [appliedSeller, setAppliedSeller] = useState('')
  const [appliedBuyer, setAppliedBuyer] = useState('')
  const [appliedItem, setAppliedItem] = useState('')

  const loadLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let query = supabase
        .from('trade_logs')
        .select('*')
        .gte('created_at', getPeriodStart(period))
        .order('created_at', { ascending: false })
        .limit(500)

      const seller = appliedSeller.trim()
      const buyer = appliedBuyer.trim()
      const item = appliedItem.trim()

      if (seller) {
        const sellerCode = Number.parseInt(seller, 10)
        if (Number.isSafeInteger(sellerCode) && String(sellerCode) === seller) {
          query = query.eq('seller_code', sellerCode)
        } else {
          query = query.ilike('seller_name', `%${seller}%`)
        }
      }
      if (buyer) {
        const buyerCode = Number.parseInt(buyer, 10)
        if (Number.isSafeInteger(buyerCode) && String(buyerCode) === buyer) {
          query = query.eq('buyer_code', buyerCode)
        } else {
          query = query.ilike('buyer_name', `%${buyer}%`)
        }
      }
      if (item) {
        query = query.ilike('item_name', `%${item}%`)
      }

      const { data, error: queryError } = await query
      if (queryError) throw queryError
      setLogs((data ?? []) as TradeLog[])
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [period, appliedSeller, appliedBuyer, appliedItem])

  useEffect(() => {
    void loadLogs()
  }, [loadLogs])

  useEffect(() => {
    const channel = supabase
      .channel('trade-logs-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trade_logs' },
        (payload) => {
          const next = payload.new as TradeLog
          const periodStart = new Date(getPeriodStart(period)).getTime()
          if (new Date(next.created_at).getTime() < periodStart) return
          if (!matchesSearch(next, appliedSeller, appliedBuyer, appliedItem)) {
            return
          }

          setLogs((current) => {
            if (current.some((log) => log.id === next.id)) return current
            return [next, ...current].slice(0, 500)
          })
        },
      )
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED')
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [period, appliedSeller, appliedBuyer, appliedItem])

  function applySearch() {
    setAppliedSeller(sellerQuery)
    setAppliedBuyer(buyerQuery)
    setAppliedItem(itemQuery)
  }

  function resetSearch() {
    setSellerQuery('')
    setBuyerQuery('')
    setItemQuery('')
    setAppliedSeller('')
    setAppliedBuyer('')
    setAppliedItem('')
  }

  const totalAmount = logs.reduce(
    (sum, log) => sum + BigInt(log.total_price || 0),
    0n,
  )
  const periodLabel =
    PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? '오늘'
  const rankings = useMemo(() => buildRankings(logs, rankTab), [logs, rankTab])
  const topRankings = rankings.slice(0, 10)

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-emerald-400">
            LIVE MONITOR
          </p>
          <h2 className="mt-1 text-2xl font-bold text-zinc-50">실시간 거래 로그</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {periodLabel} 기준 로그를 조회합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            onClick={() => downloadTradeLogsCsv(logs, periodLabel)}
            disabled={logs.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            CSV 내보내기
          </button>
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

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-2 text-sm text-zinc-400">기간</p>
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPeriod(option.value)}
              className={`rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                period === option.value
                  ? 'bg-emerald-500 text-zinc-950'
                  : 'border border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="block text-sm text-zinc-300">
            판매자 검색
            <input
              value={sellerQuery}
              onChange={(event) => setSellerQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applySearch()
              }}
              placeholder="이름 또는 고유번호"
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-500"
            />
          </label>
          <label className="block text-sm text-zinc-300">
            구매자 검색
            <input
              value={buyerQuery}
              onChange={(event) => setBuyerQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applySearch()
              }}
              placeholder="이름 또는 고유번호"
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-500"
            />
          </label>
          <label className="block text-sm text-zinc-300">
            아이템 검색
            <input
              value={itemQuery}
              onChange={(event) => setItemQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applySearch()
              }}
              placeholder="아이템명"
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-500"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={applySearch}
            className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            검색
          </button>
          <button
            type="button"
            onClick={resetSearch}
            className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-300 hover:border-zinc-500"
          >
            초기화
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
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

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-zinc-50">기간별 합계 / 순위</h3>
            <p className="mt-1 text-sm text-zinc-500">
              현재 조회된 {periodLabel} 로그 기준으로 금액순 Top 10을 표시합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {RANK_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setRankTab(tab.value)}
                className={`rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                  rankTab === tab.value
                    ? 'bg-sky-500 text-zinc-950'
                    : 'border border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="mt-6 py-10 text-center text-sm text-zinc-500">
            불러오는 중...
          </div>
        ) : topRankings.length === 0 ? (
          <div className="mt-6 py-10 text-center text-sm text-zinc-500">
            순위 데이터가 없습니다.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-950/80 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">순위</th>
                  <th className="px-4 py-3 font-semibold">
                    {RANK_TABS.find((tab) => tab.value === rankTab)?.label}
                  </th>
                  <th className="px-4 py-3 font-semibold">거래 건수</th>
                  <th className="px-4 py-3 font-semibold">총 수량</th>
                  <th className="px-4 py-3 font-semibold">총 금액</th>
                </tr>
              </thead>
              <tbody>
                {topRankings.map((row, index) => (
                  <tr
                    key={row.key}
                    className="border-t border-zinc-800/80 text-zinc-200"
                  >
                    <td className="px-4 py-3 tabular-nums text-zinc-400">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-50">{row.label}</div>
                      {row.subLabel ? (
                        <div className="text-xs text-zinc-500">{row.subLabel}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatNumber(row.count)}건
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatNumber(row.quantity)}EA
                    </td>
                    <td className="px-4 py-3 tabular-nums text-emerald-300">
                      {formatWon(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
            조건에 맞는 거래 로그가 없습니다.
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
