import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Package, Plus, Save, Settings2, Trash2 } from 'lucide-react'
import {
  formatWon,
  getErrorMessage,
  handleMutationError,
  supabase,
} from '../lib/supabaseClient'
import type { FactionSettings, Item } from '../types'

type SettingsProps = {
  isAdmin: boolean
}

type ItemDraft = {
  name: string
  price: string
}

function Settings({ isAdmin }: SettingsProps) {
  const [items, setItems] = useState<Item[]>([])
  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>({})
  const [faction, setFaction] = useState<FactionSettings | null>(null)
  const [emoji, setEmoji] = useState('')
  const [rate, setRate] = useState('50')
  const [newItemName, setNewItemName] = useState('')
  const [newItemPrice, setNewItemPrice] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingItem, setSavingItem] = useState<string | null>(null)
  const [savingFaction, setSavingFaction] = useState(false)
  const [addingItem, setAddingItem] = useState(false)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [itemsResult, factionResult] = await Promise.all([
        supabase.from('items').select('*').order('item_name', { ascending: true }),
        supabase
          .from('faction_settings')
          .select('*')
          .order('id', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ])

      if (itemsResult.error) throw itemsResult.error
      if (factionResult.error) throw factionResult.error

      const nextItems = (itemsResult.data ?? []) as Item[]
      setItems(nextItems)
      setDrafts(
        Object.fromEntries(
          nextItems.map((item) => [
            item.item_name,
            {
              name: item.item_name,
              price: String(item.price_per_unit),
            },
          ]),
        ),
      )

      if (factionResult.data) {
        const nextFaction = factionResult.data as FactionSettings
        setFaction(nextFaction)
        setEmoji(nextFaction.faction_emoji)
        setRate(String(nextFaction.public_account_rate))
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  async function saveItem(originalName: string) {
    if (!isAdmin) {
      window.alert('관리자만 아이템을 수정할 수 있습니다.')
      return
    }

    const draft = drafts[originalName]
    if (!draft) return

    const nextName = draft.name.trim()
    const priceText = draft.price.replaceAll(',', '')
    if (!nextName) {
      window.alert('아이템 이름을 입력해 주세요.')
      return
    }
    if (!/^\d+$/.test(priceText)) {
      window.alert('단가는 숫자만 입력해 주세요.')
      return
    }

    setSavingItem(originalName)
    try {
      const { error: updateError } = await supabase
        .from('items')
        .update({
          item_name: nextName,
          price_per_unit: priceText,
        })
        .eq('item_name', originalName)
      if (updateError) throw updateError
      await loadSettings()
    } catch (saveError) {
      handleMutationError(saveError, '아이템 저장에 실패했습니다.')
    } finally {
      setSavingItem(null)
    }
  }

  async function addItem(event: FormEvent) {
    event.preventDefault()
    if (!isAdmin) {
      window.alert('관리자만 아이템을 추가할 수 있습니다.')
      return
    }

    const name = newItemName.trim()
    const priceText = newItemPrice.replaceAll(',', '')
    if (!name || !/^\d+$/.test(priceText)) {
      window.alert('아이템 이름과 숫자 단가를 입력해 주세요.')
      return
    }

    setAddingItem(true)
    try {
      const { error: insertError } = await supabase.from('items').insert({
        item_name: name,
        price_per_unit: priceText,
      })
      if (insertError) throw insertError
      setNewItemName('')
      setNewItemPrice('')
      await loadSettings()
    } catch (saveError) {
      handleMutationError(saveError, '아이템 추가에 실패했습니다.')
    } finally {
      setAddingItem(false)
    }
  }

  async function deleteItem(itemName: string) {
    if (!isAdmin) {
      window.alert('관리자만 아이템을 삭제할 수 있습니다.')
      return
    }
    if (!window.confirm(`"${itemName}" 아이템을 삭제할까요?`)) return

    try {
      const { error: deleteError } = await supabase
        .from('items')
        .delete()
        .eq('item_name', itemName)
      if (deleteError) throw deleteError
      await loadSettings()
    } catch (deleteError) {
      handleMutationError(deleteError, '아이템 삭제에 실패했습니다.')
    }
  }

  async function saveFaction(event: FormEvent) {
    event.preventDefault()
    if (!isAdmin) {
      window.alert('관리자만 설정을 수정할 수 있습니다.')
      return
    }

    const nextRate = Number(rate)
    if (!emoji.trim() || !Number.isInteger(nextRate) || nextRate < 0 || nextRate > 100) {
      window.alert('이모지와 0~100 사이 비율을 입력해 주세요.')
      return
    }

    setSavingFaction(true)
    try {
      if (faction) {
        const { error: updateError } = await supabase
          .from('faction_settings')
          .update({
            faction_emoji: emoji.trim(),
            public_account_rate: nextRate,
          })
          .eq('id', faction.id)
        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase.from('faction_settings').insert({
          faction_emoji: emoji.trim(),
          public_account_rate: nextRate,
        })
        if (insertError) throw insertError
      }
      await loadSettings()
      window.alert('설정이 저장되었습니다.')
    } catch (saveError) {
      handleMutationError(saveError, '설정 저장에 실패했습니다.')
    } finally {
      setSavingFaction(false)
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
        <p className="text-xs font-semibold tracking-[0.2em] text-violet-300">
          CONFIG
        </p>
        <h2 className="mt-1 text-2xl font-bold text-zinc-50">아이템 / 팩션 설정</h2>
        <p className="mt-1 text-sm text-zinc-400">
          아이템 이름·단가 수정, 새 아이템 추가, 팩션 설정을 관리합니다.
        </p>
      </div>

      <form
        onSubmit={saveFaction}
        className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6"
      >
        <div className="mb-4 flex items-center gap-2 text-zinc-50">
          <Settings2 className="h-5 w-5 text-violet-300" />
          <h3 className="text-lg font-semibold">팩션 설정</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-zinc-300">
            팩션 이모지
            <input
              value={emoji}
              onChange={(event) => setEmoji(event.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-500"
              placeholder="예: 🐍"
            />
          </label>
          <label className="block text-sm text-zinc-300">
            공금 비율 (%)
            <input
              value={rate}
              onChange={(event) => setRate(event.target.value.replace(/\D/g, ''))}
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-500"
              inputMode="numeric"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={savingFaction}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {savingFaction ? '저장 중...' : '팩션 설정 저장'}
        </button>
      </form>

      <form
        onSubmit={addItem}
        className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6"
      >
        <div className="mb-4 flex items-center gap-2 text-zinc-50">
          <Plus className="h-5 w-5 text-emerald-300" />
          <h3 className="text-lg font-semibold">아이템 추가</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr_auto]">
          <label className="block text-sm text-zinc-300">
            아이템 이름
            <input
              value={newItemName}
              onChange={(event) => setNewItemName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-500"
              placeholder="예: 📦 신규 박스"
              required
            />
          </label>
          <label className="block text-sm text-zinc-300">
            단가
            <input
              value={newItemPrice}
              onChange={(event) =>
                setNewItemPrice(event.target.value.replace(/[^\d]/g, ''))
              }
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-500"
              placeholder="12000000"
              inputMode="numeric"
              required
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={addingItem}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              {addingItem ? '추가 중...' : '추가'}
            </button>
          </div>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/80">
        <div className="flex items-center gap-2 border-b border-zinc-800 px-6 py-4 text-zinc-50">
          <Package className="h-5 w-5 text-sky-300" />
          <h3 className="text-lg font-semibold">아이템 목록</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-950/80 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">현재 이름</th>
                <th className="px-4 py-3">이름 수정</th>
                <th className="px-4 py-3">현재 단가</th>
                <th className="px-4 py-3">단가 수정</th>
                <th className="px-4 py-3">저장</th>
                <th className="px-4 py-3">삭제</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const draft = drafts[item.item_name] ?? {
                  name: item.item_name,
                  price: String(item.price_per_unit),
                }
                return (
                  <tr key={item.item_name} className="border-t border-zinc-800/80">
                    <td className="px-4 py-3 text-zinc-100">{item.item_name}</td>
                    <td className="px-4 py-3">
                      <input
                        value={draft.name}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [item.item_name]: {
                              ...draft,
                              name: event.target.value,
                            },
                          }))
                        }
                        className="w-full min-w-48 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-500"
                      />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-emerald-300">
                      {formatWon(item.price_per_unit)}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={draft.price}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [item.item_name]: {
                              ...draft,
                              price: event.target.value.replace(/[^\d]/g, ''),
                            },
                          }))
                        }
                        className="w-full min-w-36 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={savingItem === item.item_name}
                        onClick={() => void saveItem(item.item_name)}
                        className="rounded-xl border border-zinc-700 px-3 py-2 text-zinc-200 hover:border-emerald-500 disabled:opacity-50"
                      >
                        {savingItem === item.item_name ? '저장 중' : '저장'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void deleteItem(item.item_name)}
                        className="rounded-xl border border-zinc-700 p-2 text-rose-300 hover:border-rose-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

export default Settings
