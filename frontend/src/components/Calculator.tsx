import { useEffect, useMemo, useState } from 'react'
import { Calculator as CalculatorIcon, Coins, Package } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import {
  formatNumber,
  formatWon,
  getErrorMessage,
  supabase,
} from '../lib/supabaseClient'
import type { Item } from '../types'

const BLACK_MONEY_NAME = '💸 검은 돈'
const BLACK_MONEY_UNIT = 12_000_000n
const BLACK_PUBLIC_RATE = 10n
const BLACK_EXCHANGER_RATE = 10n
const BLACK_REQUESTER_RATE = 80n

const apiUrl = (
  import.meta.env.VITE_API_URL || 'http://localhost:3000'
).replace(/\/$/, '')

function Calculator() {
  const { user } = useAuth()
  const [items, setItems] = useState<Item[]>([])
  const [publicRate, setPublicRate] = useState(50)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selectedItem, setSelectedItem] = useState('')
  const [itemQty, setItemQty] = useState('1')
  const [blackQty, setBlackQty] = useState('1')

  const [sellerCode, setSellerCode] = useState('')
  const [sellerName, setSellerName] = useState('')
  const [buyerCode, setBuyerCode] = useState('')
  const [buyerName, setBuyerName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitMessage, setSubmitMessage] = useState('')
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [itemsResult, factionResult] = await Promise.all([
          supabase.from('items').select('*').order('item_name', { ascending: true }),
          supabase
            .from('faction_settings')
            .select('public_account_rate')
            .order('id', { ascending: true })
            .limit(1)
            .maybeSingle(),
        ])
        if (itemsResult.error) throw itemsResult.error
        if (factionResult.error) throw factionResult.error

        const nextItems = (itemsResult.data ?? []) as Item[]
        setItems(nextItems)
        setPublicRate(Number(factionResult.data?.public_account_rate ?? 50))

        const firstNormal = nextItems.find((item) => item.item_name !== BLACK_MONEY_NAME)
        if (firstNormal) setSelectedItem(firstNormal.item_name)
      } catch (loadError) {
        setError(getErrorMessage(loadError))
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  useEffect(() => {
    if (!user) return
    setSellerCode(String(user.user_code))
    setSellerName(user.nickname)
  }, [user])

  const normalItems = useMemo(
    () => items.filter((item) => item.item_name !== BLACK_MONEY_NAME),
    [items],
  )

  const selected = normalItems.find((item) => item.item_name === selectedItem)
  const qty = BigInt(itemQty || '0')
  const unitPrice = BigInt(selected?.price_per_unit || 0)
  const itemTotal = unitPrice * qty
  const itemPublic = (itemTotal * BigInt(publicRate)) / 100n

  const blackCount = BigInt(blackQty || '0')
  const blackTotal = BLACK_MONEY_UNIT * blackCount
  const blackPublic = (blackTotal * BLACK_PUBLIC_RATE) / 100n
  const blackExchanger = (blackTotal * BLACK_EXCHANGER_RATE) / 100n
  const blackRequester = (blackTotal * BLACK_REQUESTER_RATE) / 100n

  async function lookupNameByCode(
    code: string,
    setName: (value: string) => void,
  ) {
    const parsed = Number.parseInt(code, 10)
    if (!Number.isSafeInteger(parsed) || parsed <= 0) return
    const { data, error: lookupError } = await supabase
      .from('users')
      .select('nickname')
      .eq('user_code', parsed)
      .maybeSingle()
    if (lookupError || !data?.nickname) return
    setName(data.nickname)
  }

  async function submitBlackMoneyLog() {
    setSubmitMessage('')
    setSubmitError('')

    const quantity = Number.parseInt(blackQty || '0', 10)
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      setSubmitError('환전 갯수를 확인해 주세요.')
      return
    }
    if (!sellerCode.trim() || !sellerName.trim()) {
      setSubmitError('판매자(환전자) 고유번호와 이름을 입력해 주세요.')
      return
    }
    if (!buyerCode.trim() || !buyerName.trim()) {
      setSubmitError('구매자(환전 요청자) 고유번호와 이름을 입력해 주세요.')
      return
    }

    setSubmitting(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('로그인 세션이 없습니다. 다시 로그인해 주세요.')
      }

      const response = await fetch(`${apiUrl}/api/black-money-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          seller_code: Number.parseInt(sellerCode, 10),
          seller_name: sellerName.trim(),
          buyer_code: Number.parseInt(buyerCode, 10),
          buyer_name: buyerName.trim(),
          quantity,
        }),
      })

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean
        error?: string
        id?: number
      } | null

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || '로그 저장에 실패했습니다.')
      }

      setSubmitMessage(`환전 로그 #${payload.id} 저장 및 웹훅 발송 완료`)
      setBuyerCode('')
      setBuyerName('')
    } catch (submitErr) {
      setSubmitError(getErrorMessage(submitErr))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="py-16 text-center text-zinc-400">불러오는 중...</div>
  }

  if (error) {
    return <div className="py-16 text-center text-rose-300">{error}</div>
  }

  return (
    <section className="space-y-8">
      <div>
        <p className="text-xs font-semibold tracking-[0.2em] text-amber-300">
          CALCULATOR
        </p>
        <h2 className="mt-1 text-2xl font-bold text-zinc-50">정산 계산기</h2>
        <p className="mt-1 text-sm text-zinc-400">
          일반 물품과 검은 돈 환전 금액을 빠르게 계산합니다.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
        <div className="mb-5 flex items-center gap-2 text-zinc-50">
          <Package className="h-5 w-5 text-sky-300" />
          <h3 className="text-lg font-semibold">일반 물품 계산</h3>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-zinc-300">
            아이템
            <select
              value={selectedItem}
              onChange={(event) => setSelectedItem(event.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-500"
            >
              {normalItems.map((item) => (
                <option key={item.item_name} value={item.item_name}>
                  {item.item_name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-zinc-300">
            수량
            <input
              value={itemQty}
              onChange={(event) =>
                setItemQty(event.target.value.replace(/[^\d]/g, ''))
              }
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-500"
              inputMode="numeric"
            />
          </label>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <ResultCard label="개당 단가" value={formatWon(unitPrice)} />
          <ResultCard label="총 금액" value={formatWon(itemTotal)} highlight />
          <ResultCard
            label={`공동 계좌 입금액 (${publicRate}%)`}
            value={formatWon(itemPublic)}
          />
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          공동 계좌 = 단가 × 수량 × 공계 비율({publicRate}%)
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
        <div className="mb-5 flex items-center gap-2 text-zinc-50">
          <Coins className="h-5 w-5 text-amber-300" />
          <h3 className="text-lg font-semibold">검은 돈 계산기</h3>
        </div>

        <label className="block max-w-xs text-sm text-zinc-300">
          수량
          <input
            value={blackQty}
            onChange={(event) =>
              setBlackQty(event.target.value.replace(/[^\d]/g, ''))
            }
            className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-500"
            inputMode="numeric"
          />
        </label>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ResultCard
            label="총액 (개당 1,200만)"
            value={formatWon(blackTotal)}
            highlight
          />
          <ResultCard
            label="공동 계좌 입금액 (10%)"
            value={formatWon(blackPublic)}
          />
          <ResultCard
            label="환전자 수익 (10%)"
            value={formatWon(blackExchanger)}
          />
          <ResultCard
            label="환전 요청자 수령 (80%)"
            value={formatWon(blackRequester)}
          />
        </div>

        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
          <p className="flex items-center gap-2 text-zinc-200">
            <CalculatorIcon className="h-4 w-4" />
            배분 기준
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>개당 {formatNumber(BLACK_MONEY_UNIT)}원</li>
            <li>공동 계좌 10% · 환전자 10% · 요청자 80%</li>
            <li>
              수량 {formatNumber(blackCount)}EA 기준 합계 검증:{' '}
              {formatWon(blackPublic + blackExchanger + blackRequester)}
            </li>
          </ul>
        </div>

        <div className="mt-6 border-t border-zinc-800 pt-6">
          <h4 className="text-base font-semibold text-zinc-100">
            환전 로그 작성
          </h4>
          <p className="mt-1 text-sm text-zinc-500">
            판매자(환전자/로그 작성자)와 구매자(환전 요청자)를 입력하면 DB에
            저장되고 웹훅이 발송됩니다.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-zinc-300">
              판매자 고유번호
              <input
                value={sellerCode}
                onChange={(event) =>
                  setSellerCode(event.target.value.replace(/[^\d]/g, ''))
                }
                onBlur={() => void lookupNameByCode(sellerCode, setSellerName)}
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-amber-500"
                inputMode="numeric"
              />
            </label>
            <label className="block text-sm text-zinc-300">
              판매자 이름
              <input
                value={sellerName}
                onChange={(event) => setSellerName(event.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-amber-500"
              />
            </label>
            <label className="block text-sm text-zinc-300">
              구매자 고유번호 (환전 요청자)
              <input
                value={buyerCode}
                onChange={(event) =>
                  setBuyerCode(event.target.value.replace(/[^\d]/g, ''))
                }
                onBlur={() => void lookupNameByCode(buyerCode, setBuyerName)}
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-amber-500"
                inputMode="numeric"
              />
            </label>
            <label className="block text-sm text-zinc-300">
              구매자 이름 (환전 요청자)
              <input
                value={buyerName}
                onChange={(event) => setBuyerName(event.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-amber-500"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void submitBlackMoneyLog()}
              disabled={submitting}
              className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? '저장 중...' : '로그 작성'}
            </button>
            <p className="text-xs text-zinc-500">
              물품: {BLACK_MONEY_NAME} · 수량 {formatNumber(blackCount)}개 ·
              환전 총액 {formatWon(blackTotal)}
            </p>
          </div>

          {submitMessage ? (
            <p className="mt-3 text-sm text-emerald-300">{submitMessage}</p>
          ) : null}
          {submitError ? (
            <p className="mt-3 text-sm text-rose-300">{submitError}</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function ResultCard({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <article
      className={`rounded-xl border p-4 ${
        highlight
          ? 'border-emerald-500/30 bg-emerald-500/10'
          : 'border-zinc-800 bg-zinc-950/70'
      }`}
    >
      <p className="text-xs text-zinc-400">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold ${
          highlight ? 'text-emerald-300' : 'text-zinc-50'
        }`}
      >
        {value}
      </p>
    </article>
  )
}

export default Calculator
