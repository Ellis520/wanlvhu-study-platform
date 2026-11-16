'use client'

import { useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { apiSend, apiUpload } from '@/lib/client-api'
import { AVATAR_OPTIONS, isAvatarKey } from '@/lib/avatar'

export interface ProfileDraft {
  display_name: string
  role: string
  student_code?: string | null
  avatar_preset?: string | null
}

/**
 * 资料补全：超星一键登录只带回姓名，第一次进来要补齐三件事——
 * 姓名（可改成名册里的正式写法）、学号（必须与班级名册对上）、头像。
 * 学号核对通过后才放行，教师端的名单与成绩才不会多出名单外的人。
 */
export function ProfileSetup({
  profile,
  avatarUrl,
  onDone,
}: {
  profile: ProfileDraft
  avatarUrl?: string | null
  onDone: () => void
}) {
  const initialPreset = isAvatarKey(profile.avatar_preset) ? profile.avatar_preset : null
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [role, setRole] = useState<'student' | 'teacher'>(
    profile.role === 'teacher' ? 'teacher' : 'student',
  )
  const [studentCode, setStudentCode] = useState(profile.student_code ?? '')
  const [preset, setPreset] = useState<string | null>(initialPreset)
  const [customUrl, setCustomUrl] = useState<string | null>(
    initialPreset ? null : (avatarUrl ?? null),
  )
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const isStudent = role === 'student'

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('avatar', file)
      const result = await apiUpload<{ url: string }>('/api/profile/avatar', form)
      setCustomUrl(result.url)
      setPreset(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '照片上传失败，请重试')
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = displayName.trim()
    if (!name) {
      setError('请填写姓名')
      return
    }
    const code = studentCode.trim()
    if (isStudent && !/^\d{6,20}$/.test(code)) {
      setError('请填写 6–20 位数字学号')
      return
    }
    setSaving(true)
    setError('')
    try {
      await apiSend('/api/profile', 'PUT', {
        display_name: name,
        role,
        student_code: isStudent ? code : '',
        avatar_preset: preset,
      })
      await getSupabase().auth.updateUser({
        data: {
          display_name: name,
          role,
          profile_setup: true,
        },
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <p className="text-[11px] tracking-[0.22em] text-muted-foreground">首次进入</p>
        <h1 className="mt-3 font-serif text-2xl tracking-tight">登记你的研学身份</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          超星账号只带回姓名。请补上学号与头像——学号要和班级名单一致，核对通过才能进入。
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="space-y-1.5">
            <label htmlFor="display_name" className="text-xs tracking-wide text-muted-foreground">
              姓名
            </label>
            <input
              id="display_name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              maxLength={30}
              placeholder="按名单上的写法填写"
              className="w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>

          <div className="space-y-2">
            <span className="text-xs tracking-wide text-muted-foreground">身份</span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { key: 'student', label: '学生', note: '记录研学过程' },
                  { key: 'teacher', label: '教师', note: '查看全班成绩' },
                ] as const
              ).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setRole(item.key)}
                  className={`rounded-md border px-3 py-2.5 text-left transition-colors ${
                    role === item.key
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                  }`}
                >
                  <span className="block text-sm">{item.label}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {item.note}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {isStudent ? (
            <div className="space-y-1.5">
              <label htmlFor="student_code" className="text-xs tracking-wide text-muted-foreground">
                学号
              </label>
              <input
                id="student_code"
                value={studentCode}
                onChange={(event) => setStudentCode(event.target.value.replace(/\D/g, ''))}
                required
                inputMode="numeric"
                maxLength={20}
                placeholder="例：20260001"
                className="w-full rounded-md border border-input bg-card px-3 py-2.5 font-mono text-sm tracking-wider outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
              />
              <p className="text-[11px] leading-5 text-muted-foreground">
                名单里查不到这个学号就进不去，请对着学生证再确认一遍。
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs tracking-wide text-muted-foreground">头像</span>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="text-[11px] text-primary underline-offset-4 hover:underline disabled:opacity-60"
              >
                {uploading ? '上传中…' : '上传我的照片'}
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleUpload}
              className="hidden"
            />
            <div className="grid grid-cols-4 gap-2">
              {AVATAR_OPTIONS.map((option) => {
                const active = preset === option.key
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      setPreset(option.key)
                      setCustomUrl(null)
                    }}
                    aria-pressed={active}
                    title={option.label}
                    className={`group relative aspect-square overflow-hidden rounded-md border bg-card transition-all ${
                      active
                        ? 'border-primary ring-2 ring-ring/30'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <img
                      src={option.src}
                      alt={option.label}
                      className="h-full w-full object-cover"
                    />
                    {active ? (
                      <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />
                    ) : null}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-pressed={Boolean(customUrl)}
                title={customUrl ? '已用自己上传的照片' : '上传照片'}
                className={`relative aspect-square overflow-hidden rounded-md border bg-card transition-all ${
                  customUrl
                    ? 'border-primary ring-2 ring-ring/30'
                    : 'border-dashed border-border hover:border-primary/40'
                }`}
              >
                {customUrl ? (
                  <img src={customUrl} alt="我的照片" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground">
                    <span className="text-base leading-none">+</span>
                    照片
                  </span>
                )}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              手绘小图来自万绿湖的物种记录，也可以换成自己的照片。
            </p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <button
            type="submit"
            disabled={saving || uploading}
            className="eco-btn-solid w-full rounded-md bg-primary px-4 py-2.5 text-sm text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving ? '核对中…' : '保存并进入'}
          </button>
        </form>
      </div>
    </div>
  )
}
