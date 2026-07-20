import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2, UserRound } from 'lucide-react'
import {
  getErrorMessage,
  handleMutationError,
  supabase,
} from '../lib/supabaseClient'
import type { AppUser, UserRole } from '../types'

type UserManagementProps = {
  isAdmin: boolean
  currentUser: AppUser
}

const roleLabels: Record<UserRole, string> = {
  0: '정지',
  1: '일반',
  2: '관리자',
}

const emptyForm = {
  discord_id: '',
  user_code: '',
  nickname: '',
  role: '1',
}

function UserManagement({ isAdmin, currentUser }: UserManagementProps) {
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AppUser | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: queryError } = await supabase
        .from('users')
        .select('discord_id, user_code, nickname, role')
        .order('role', { ascending: false })
        .order('user_code', { ascending: true })

      if (queryError) throw queryError
      setUsers(
        (data ?? []).map((row) => ({
          discord_id: row.discord_id,
          user_code: Number(row.user_code),
          nickname: row.nickname,
          role: Number(row.role) as UserRole,
        })),
      )
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  function openCreate() {
    if (!isAdmin) {
      window.alert('관리자만 유저를 추가할 수 있습니다.')
      return
    }
    setEditing(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEdit(user: AppUser) {
    if (!isAdmin) {
      window.alert('관리자만 유저를 수정할 수 있습니다.')
      return
    }
    setEditing(user)
    setForm({
      discord_id: user.discord_id,
      user_code: String(user.user_code),
      nickname: user.nickname,
      role: String(user.role),
    })
    setModalOpen(true)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!isAdmin) return

    const userCode = Number(form.user_code)
    const role = Number(form.role) as UserRole
    if (
      !/^\d{17,20}$/.test(form.discord_id) ||
      !Number.isSafeInteger(userCode) ||
      userCode <= 0 ||
      ![0, 1, 2].includes(role) ||
      !form.nickname.trim()
    ) {
      window.alert('입력값을 확인해 주세요.')
      return
    }

    setSaving(true)
    try {
      if (editing) {
        const { error: updateError } = await supabase
          .from('users')
          .update({
            nickname: form.nickname.trim(),
            role,
          })
          .eq('discord_id', editing.discord_id)
        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase.from('users').insert({
          discord_id: form.discord_id,
          user_code: userCode,
          nickname: form.nickname.trim(),
          role,
        })
        if (insertError) throw insertError
      }
      setModalOpen(false)
      await loadUsers()
    } catch (saveError) {
      handleMutationError(saveError, '유저 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(user: AppUser) {
    if (!isAdmin) {
      window.alert('관리자만 유저를 삭제할 수 있습니다.')
      return
    }
    if (user.discord_id === currentUser.discord_id) {
      window.alert('현재 로그인한 계정은 삭제할 수 없습니다.')
      return
    }
    if (!window.confirm(`${user.nickname}(#${user.user_code}) 유저를 삭제할까요까요?`)) {
      return
    }

    try {
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('discord_id', user.discord_id)
      if (deleteError) throw deleteError
      await loadUsers()
    } catch (deleteError) {
      handleMutationError(deleteError, '유저 삭제에 실패했습니다.')
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-sky-400">
            USER CONTROL
          </p>
          <h2 className="mt-1 text-2xl font-bold text-zinc-50">유저 관리</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {isAdmin
              ? '유저 등록, 권한 변경, 삭제가 가능합니다.'
              : '읽기 전용입니다. 관리자만 수정할 수 있습니다.'}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
        >
          <Plus className="h-4 w-4" />
          유저 추가
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/80">
        {loading && (
          <div className="px-6 py-16 text-center text-zinc-400">불러오는 중...</div>
        )}
        {!loading && error && (
          <div className="px-6 py-16 text-center text-rose-300">{error}</div>
        )}
        {!loading && !error && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-950/80 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">닉네임</th>
                  <th className="px-4 py-3">고유번호</th>
                  <th className="px-4 py-3">Discord ID</th>
                  <th className="px-4 py-3">권한</th>
                  <th className="px-4 py-3">관리</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.discord_id}
                    className="border-t border-zinc-800/80 text-zinc-200"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <UserRound className="h-4 w-4 text-zinc-500" />
                        {user.nickname}
                      </div>
                    </td>
                    <td className="px-4 py-3">#{user.user_code}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                      {user.discord_id}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          user.role === 2
                            ? 'bg-amber-500/15 text-amber-300'
                            : user.role === 0
                              ? 'bg-rose-500/15 text-rose-300'
                              : 'bg-zinc-800 text-zinc-300'
                        }`}
                      >
                        {roleLabels[user.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(user)}
                          className="rounded-lg border border-zinc-700 p-2 text-zinc-300 hover:border-zinc-500"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(user)}
                          className="rounded-lg border border-zinc-700 p-2 text-rose-300 hover:border-rose-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6"
          >
            <h3 className="text-lg font-semibold text-zinc-50">
              {editing ? '유저 수정' : '유저 추가'}
            </h3>

            <label className="mt-4 block text-sm text-zinc-300">
              Discord ID
              <input
                value={form.discord_id}
                disabled={Boolean(editing)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    discord_id: event.target.value.replace(/\D/g, ''),
                  }))
                }
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-500 disabled:opacity-60"
                required
              />
            </label>

            <label className="mt-3 block text-sm text-zinc-300">
              고유번호
              <input
                value={form.user_code}
                disabled={Boolean(editing)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    user_code: event.target.value.replace(/\D/g, ''),
                  }))
                }
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-500 disabled:opacity-60"
                required
              />
            </label>

            <label className="mt-3 block text-sm text-zinc-300">
              닉네임
              <input
                value={form.nickname}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    nickname: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-500"
                required
              />
            </label>

            <label className="mt-3 block text-sm text-zinc-300">
              권한
              <select
                value={form.role}
                onChange={(event) =>
                  setForm((current) => ({ ...current, role: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-500"
              >
                <option value="1">일반</option>
                <option value="2">관리자</option>
                <option value="0">정지</option>
              </select>
            </label>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}

export default UserManagement
