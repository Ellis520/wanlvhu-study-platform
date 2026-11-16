'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppFrame, useSession } from '@/components/app-frame'
import { ProjectRequirementsCard } from '@/components/project-requirements'
import { apiGet, apiSend, apiStream, apiUploadBinary } from '@/lib/client-api'
import {
  MAX_BUNDLE_SIZE,
  MAX_IMAGES,
  MAX_SUMMARY,
  MAX_TITLE,
  formatSize,
  type ProjectPayload,
} from '@/lib/project-types'
import { resolveFinalScore, scoreSourceLabel } from '@/lib/final-score'

interface ProjectResponse {
  project: ProjectPayload
  trip?: { id: string; title: string; destination: string; start_date: string; end_date: string }
}

interface BundleResponse {
  project: ProjectPayload
  scan: {
    paper: { name: string; size: number } | null
    images: { name: string; size: number }[]
    video: { name: string; size: number } | null
    ignored: string[]
    notes: string[]
  }
  bundle: { name: string; size: number }
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`
}

function parseStatusText(status: string, chars: number): string {
  if (status === 'success') return `正文已解析 · ${chars} 字`
  if (status === 'pending') return '正文解析中…'
  if (status === 'failed') return '正文解析失败，生成评分时会重试'
  return '正文还没解析，第一次生成 AI 评分时自动解析'
}

function ProjectContent() {
  const session = useSession()
  const [project, setProject] = useState<ProjectPayload | null>(null)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [unpacking, setUnpacking] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [scanNotes, setScanNotes] = useState<string[]>([])
  const [scanIgnored, setScanIgnored] = useState<string[]>([])

  const [aiRunning, setAiRunning] = useState(false)
  const [aiText, setAiText] = useState('')
  const [stageText, setStageText] = useState('')

  const bundleInput = useRef<HTMLInputElement>(null)

  const paper = project?.paper ?? null
  const images = useMemo(() => project?.images ?? [], [project])
  const video = project?.video ?? null

  const applyProject = useCallback((payload: ProjectPayload) => {
    setProject(payload)
    setTitle(payload.title)
    setSummary(payload.summary)
    setAiText(payload.ai_review ?? '')
  }, [])

  const load = useCallback(async () => {
    const data = await apiGet<ProjectResponse>('/api/project')
    applyProject(data.project)
  }, [applyProject])

  useEffect(() => {
    let mounted = true
    apiGet<ProjectResponse>('/api/project')
      .then((data) => {
        if (mounted) applyProject(data.project)
      })
      .catch((err: unknown) => {
        if (mounted) setError(err instanceof Error ? err.message : '加载失败')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [applyProject])

  const save = useCallback(
    async (submit: boolean, silent = false): Promise<ProjectPayload | null> => {
      setError('')
      if (!silent) setNotice('')
      // 校验放在进入「提交中」之前：不合格就别把按钮锁住，也不要抛错让界面卡死
      if (submit) {
        const missing = !title.trim() ? '项目名称' : !summary.trim() ? '项目介绍' : ''
        if (missing) {
          setError(`请先填写${missing}，再提交`)
          return null
        }
      }
      if (submit) setSaving(true)
      else setSaveState('saving')
      try {
        const data = await apiSend<{ project: ProjectPayload }>('/api/project', 'POST', {
          title,
          summary,
          paper: paper ? { fileId: paper.fileId, fileName: paper.fileName, size: paper.size } : null,
          images: images.map((item) => ({
            fileId: item.fileId,
            fileName: item.fileName,
            size: item.size,
          })),
          video: video ? { fileId: video.fileId, fileName: video.fileName, size: video.size } : null,
          submit,
        })
        setProject(data.project)
        setSaveState('saved')
        if (!silent) {
          setNotice(
            submit
              ? `已提交第 ${data.project.submit_count} 版，教师现在可以看到最新版本。`
              : '已保存草稿。',
          )
        }
        return data.project
      } catch (err) {
        setSaveState('error')
        setError(err instanceof Error ? err.message : '保存失败')
        return null
      } finally {
        if (submit) setSaving(false)
      }
    },
    [title, summary, paper, images, video],
  )

  /** 上传一个 zip：服务端解包后把论文 / 图片 / 视频分别存好，前端只需要展示结果 */
  const uploadBundle = useCallback(
    async (file: File) => {
      if (file.size > MAX_BUNDLE_SIZE) {
        setError(`压缩包有 ${formatSize(file.size)}，超过 ${formatSize(MAX_BUNDLE_SIZE)} 上限`)
        return
      }
      setUnpacking(true)
      setError('')
      setNotice('')
      setScanNotes([])
      setScanIgnored([])
      try {
        // 先把标题与简介存一遍，避免解包返回后把未保存的文字覆盖掉
        try {
          await save(false, true)
        } catch {
          // 标题可以稍后再存，不影响材料上传
        }
        const data = await apiUploadBinary<BundleResponse>(
          `/api/project/bundle?name=${encodeURIComponent(file.name)}`,
          file,
          'application/zip',
        )
        applyProject(data.project)
        setScanNotes(data.scan.notes)
        setScanIgnored(data.scan.ignored)

        const parts: string[] = []
        if (data.scan.paper) parts.push(`论文「${data.scan.paper.name}」`)
        if (data.scan.images.length > 0) parts.push(`${data.scan.images.length} 张图片`)
        if (data.scan.video) parts.push('1 段视频')
        setNotice(
          parts.length > 0
            ? `已从压缩包里取出${parts.join('、')}。确认无误后点「提交作品」。`
            : '压缩包里没有识别出材料，请检查文件类型。',
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : '压缩包上传失败')
      } finally {
        setUnpacking(false)
      }
    },
    [applyProject, save],
  )

  const handleAiReview = useCallback(async () => {
    setAiRunning(true)
    setAiText('')
    setError('')
    setStageText('')
    try {
      const saved = await save(true, true)
      if (!saved) {
        // 必填项没过或保存失败，错误提示已经显示在页面上
        setAiRunning(false)
        return
      }
      await apiStream('/api/project/ai-review', {
        onDelta: (text) => setAiText((prev) => prev + text),
        onStage: (message) => setStageText(message),
        onWarning: (message) => setNotice(message),
        onError: (message) => {
          setAiRunning(false)
          setStageText('')
          setError(message)
        },
        onDone: async (payload) => {
          setAiRunning(false)
          setStageText('')
          await load()
          if (payload.score != null) {
            setNotice(`AI 评分已生成，总分 ${payload.score}`)
          } else if (payload.partial) {
            setNotice('AI 评价已生成：部分维度证据不足，未给出正式总分')
          }
        },
      })
    } catch (err) {
      setAiRunning(false)
      setStageText('')
      setError(err instanceof Error ? err.message : 'AI 评分失败')
    }
  }, [load, save])

  const status = project?.status === 'submitted' ? '已提交' : '草稿'
  const submitCount = project?.submit_count ?? 0
  const submittedAt = project?.submitted_at ?? null
  /** 评分或教师评价早于最近一次提交时，它们对应的是上一版作品 */
  const aiStale = Boolean(
    project?.ai_reviewed_at && submittedAt && new Date(project.ai_reviewed_at) < new Date(submittedAt),
  )
  const teacherStale = Boolean(
    project?.teacher_reviewed_at && submittedAt && new Date(project.teacher_reviewed_at) < new Date(submittedAt),
  )
  const canReview = Boolean(paper) && project?.status === 'submitted'
  const aiScore = project?.ai_score ?? null
  // 最终成绩：教师评分优先，教师未评分时取历次 AI 评分中的最高分
  const finalScore = resolveFinalScore(project)

  const usedBytes = useMemo(
    () =>
      (paper?.size ?? 0) + (video?.size ?? 0) + images.reduce((acc, item) => acc + item.size, 0),
    [paper, video, images],
  )

  const materialCount = (paper ? 1 : 0) + images.length + (video ? 1 : 0)

  return (
    <div className="space-y-12">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-[11px] tracking-[0.22em] text-muted-foreground">
            {session.profile.display_name} · 研学项目提交
          </p>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value.slice(0, MAX_TITLE))}
            placeholder="在这里填写项目名称"
            aria-label="项目名称"
            className="mt-3 w-full border-none bg-transparent font-serif text-3xl tracking-tight outline-none placeholder:text-muted-foreground/60"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {session.trip.destination} · {session.trip.start_date} 至 {session.trip.end_date} · 论文 /
            图片 / 视频合成一份作品
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="flex items-center gap-2">
            <span className="border border-primary/40 px-2 py-0.5 text-[11px] tracking-wider text-primary">
              {status}
            </span>
            {submitCount > 0 ? (
              <span className="text-[11px] text-muted-foreground">第 {submitCount} 次提交</span>
            ) : null}
            <span className="text-[11px] text-muted-foreground">
              最终成绩{' '}
              <strong className="font-serif text-sm text-primary">{finalScore.score ?? '—'}</strong>
              <span className="text-[10px]">/100</span>
              <span className="ml-1">· {scoreSourceLabel(finalScore.source)}</span>
            </span>
          </span>
          <span className="text-[11px] text-muted-foreground">
            {saveState === 'saving'
              ? '保存中…'
              : saveState === 'saved'
                ? '已保存'
                : saveState === 'error'
                  ? '保存失败'
                  : project?.updated_at
                    ? `上次保存 ${formatWhen(project.updated_at)}`
                    : '尚未保存'}
          </span>
        </div>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-primary">{notice}</p> : null}

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-24 w-full animate-pulse rounded-sm bg-muted/70" />
          ))}
        </div>
      ) : (
        <>
          <ProjectRequirementsCard />

          <section className="eco-card p-5 sm:p-6">
            <label htmlFor="project-summary" className="font-serif text-lg">
              项目介绍
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              三到五句话说清这个项目：你研究的是哪一段水脉、用了什么办法、最后得出什么结论。AI 评分会一起读这段。
            </p>
            <textarea
              id="project-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value.slice(0, MAX_SUMMARY))}
              rows={4}
              className="mt-3 w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-7 outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            <p className="mt-1 text-right text-[11px] text-muted-foreground">
              {summary.length}/{MAX_SUMMARY}
            </p>
          </section>

          <section id="bundle-upload" className="space-y-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif text-xl">上传作品压缩包</h2>
              <span className="text-[11px] text-muted-foreground">
                {materialCount > 0 ? `已解出 ${materialCount} 份材料 · 合计 ${formatSize(usedBytes)}` : `单个 zip ≤${formatSize(MAX_BUNDLE_SIZE)}`}
              </span>
            </div>
            <div className="eco-wave" aria-hidden="true" />

            <div className="eco-card p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <h3 className="font-serif text-base">把论文、图片、视频打成一个 zip 上传</h3>
                  <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
                    电脑上把这些文件放进同一个文件夹（可以带子文件夹，命名随意），右键压缩成 zip
                    后上传即可，系统会按文件类型自动归位：论文进「论文」，照片进「图片」，视频进「视频」。
                  </p>
                  <ul className="mt-2 space-y-1 text-[11px] leading-5 text-muted-foreground">
                    <li>· 论文 1 份，PDF / DOC / DOCX，≤20MB（必交，AI 评分主要读它）</li>
                    <li>· 图片最多 {MAX_IMAGES} 张，单张 ≤10MB</li>
                    <li>· 视频 1 段，≤100MB</li>
                    <li>· 重新上传会整包替换上一版材料，旧文件自动清掉</li>
                  </ul>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button
                    type="button"
                    onClick={() => bundleInput.current?.click()}
                    disabled={unpacking}
                    className="eco-btn-solid rounded-md px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
                  >
                    {unpacking ? '正在上传并解包…' : materialCount > 0 ? '重新上传压缩包' : '选择压缩包'}
                  </button>
                  {unpacking ? (
                    <span className="text-[11px] text-muted-foreground">
                      大文件需要一会儿，请不要关闭页面
                    </span>
                  ) : null}
                </div>
              </div>
              <input
                ref={bundleInput}
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) void uploadBundle(file)
                }}
              />

              {scanNotes.length > 0 ? (
                <ul className="mt-4 space-y-1 border-t border-border pt-3 text-[11px] leading-5 text-primary">
                  {scanNotes.map((note) => (
                    <li key={note}>· {note}</li>
                  ))}
                </ul>
              ) : null}
              {scanIgnored.length > 0 ? (
                <ul className="mt-2 space-y-1 text-[11px] leading-5 text-muted-foreground">
                  {scanIgnored.map((item) => (
                    <li key={item}>· 已跳过 {item}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="eco-rule-t pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="font-serif text-base">解包结果</h3>
                {paper ? (
                  <span className="text-[11px] text-muted-foreground">
                    {parseStatusText(project?.paper_parse_status ?? 'none', project?.paper_text_chars ?? 0)}
                  </span>
                ) : null}
              </div>

              {materialCount === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  还没有材料。把论文、照片、视频打包成一个 zip 上传后，这里会列出解出的每一份文件。
                </p>
              ) : (
                <div className="mt-4 space-y-5">
                  <div>
                    <p className="text-[11px] tracking-[0.16em] text-muted-foreground">论文</p>
                    {paper ? (
                      <div className="mt-2 flex flex-wrap items-center gap-3 border border-border bg-muted/30 px-3 py-2 text-sm">
                        <span className="truncate">{paper.fileName}</span>
                        <span className="text-xs text-muted-foreground">{formatSize(paper.size)}</span>
                        {paper.url ? (
                          <a
                            href={paper.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            预览
                          </a>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-destructive">压缩包里没有论文，提交前必须补上。</p>
                    )}
                  </div>

                  <div>
                    <p className="text-[11px] tracking-[0.16em] text-muted-foreground">
                      现场图片（{images.length}/{MAX_IMAGES}）
                    </p>
                    {images.length > 0 ? (
                      <ul className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                        {images.map((item) => (
                          <li key={item.fileId}>
                            <div className="aspect-square overflow-hidden rounded-sm border border-border bg-muted/40">
                              {item.url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={item.url}
                                  alt={item.fileName}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <span className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
                                  无法预览
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">压缩包里没有图片。</p>
                    )}
                  </div>

                  <div>
                    <p className="text-[11px] tracking-[0.16em] text-muted-foreground">现场视频</p>
                    {video ? (
                      <div className="mt-2 space-y-2">
                        <div className="flex flex-wrap items-center gap-3 border border-border bg-muted/30 px-3 py-2 text-sm">
                          <span className="truncate">{video.fileName}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatSize(video.size)}
                          </span>
                        </div>
                        {video.url ? (
                          <video
                            src={video.url}
                            controls
                            preload="metadata"
                            className="max-h-[420px] w-full rounded-sm border border-border bg-black"
                          />
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">压缩包里没有视频。</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="flex flex-wrap items-center gap-3 border-y border-border py-5">
            <button
              type="button"
              onClick={() => void save(false)}
              disabled={saving || unpacking}
              className="eco-btn-outline rounded-md px-4 py-2 text-sm disabled:opacity-60"
            >
              保存草稿
            </button>
            <button
              type="button"
              onClick={() => {
                if (!paper) {
                  setError('提交前需要先上传论文：把论文（可连同照片、视频）压成一个 zip 上传，解包后会自动识别。')
                  document
                    .getElementById('bundle-upload')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  return
                }
                void save(true)
              }}
              disabled={saving || unpacking}
              className="eco-btn-solid rounded-md px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
            >
              {saving ? '提交中…' : project?.status === 'submitted' ? '重新提交' : '提交作品'}
            </button>
            <button
              type="button"
              onClick={() => void handleAiReview()}
              disabled={aiRunning || !canReview}
              className="eco-btn-outline rounded-md px-4 py-2 text-sm disabled:opacity-60"
              title={canReview ? '生成 AI 评分' : '提交作品后可生成 AI 评分'}
            >
              {aiRunning ? 'AI 正在评分…' : aiScore != null ? '重新生成 AI 评分' : '生成 AI 评分'}
            </button>
            {!paper ? (
              <span className="text-xs text-muted-foreground">提交前请先上传包含论文的压缩包。</span>
            ) : project?.status !== 'submitted' ? (
              <span className="text-xs text-muted-foreground">先提交作品，再生成 AI 评分。</span>
            ) : null}
          </section>

          <section className="grid gap-8 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="eco-card p-5 sm:p-6">
              <div className="flex items-baseline justify-between">
                <h2 className="font-serif text-xl">AI 评分与点评</h2>
                {aiScore != null ? (
                  <span className="font-serif text-3xl text-primary">{aiScore}</span>
                ) : project?.ai_review ? (
                  <span className="text-[11px] text-muted-foreground">未给出正式总分</span>
                ) : null}
              </div>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">
                七维度：项目意识与自主策划 15 · 创意与问题探索 20 · 研学联系与专业融合 15 ·
                研究方法与可行性 15 · 协作与反馈 10 · 工具与人机协同 10 · 过程与反思 15
              </p>
              {stageText ? (
                <p className="mt-4 text-xs tracking-wide text-primary">{stageText}</p>
              ) : null}
              {aiRunning && !aiText ? (
                <div className="mt-4 space-y-2" aria-busy="true">
                  {[0, 1, 2].map((index) => (
                    <div key={index} className="h-3 w-full animate-pulse rounded-sm bg-muted" />
                  ))}
                </div>
              ) : aiText ? (
                <div className="mt-4 whitespace-pre-wrap text-sm leading-8">{aiText}</div>
              ) : (
                <p className="mt-4 text-sm leading-7 text-muted-foreground">
                  {project?.status === 'submitted'
                    ? '还没有生成评分。点上方「生成 AI 评分」，模型会读论文正文、过程记录与回顾卡片，按七维度标准给出建议得分与改进建议。'
                    : '提交作品后即可生成 AI 评分。'}
                </p>
              )}
              {aiStale ? (
                <p className="mt-4 border-l-2 border-primary/50 pl-3 text-[11px] leading-5 text-muted-foreground">
                  这份评分对应你提交的第 {Math.max(submitCount - 1, 1)} 版作品。你已经提交了新版本，点「重新生成 AI 评分」即可拿到最新反馈。
                </p>
              ) : null}
              {project?.ai_reviewed_at ? (
                <p className="mt-4 text-[11px] text-muted-foreground">
                  生成于 {formatWhen(project.ai_reviewed_at)}
                </p>
              ) : null}
            </div>

            <div className="space-y-6">
              <div className="eco-card p-5">
                <h2 className="font-serif text-lg">教师评价</h2>
                {project?.teacher_score != null || project?.teacher_comment ? (
                  <div className="mt-3 space-y-2">
                    {project?.teacher_score != null ? (
                      <p className="font-serif text-2xl text-primary">
                        {project.teacher_score}
                        <span className="text-sm text-muted-foreground">/100</span>
                      </p>
                    ) : null}
                    <p className="whitespace-pre-wrap text-sm leading-7">
                      {project?.teacher_comment || '教师只给了分数，没有留下评语。'}
                    </p>
                    {project?.teacher_reviewed_at ? (
                      <p className="text-[11px] text-muted-foreground">
                        评于 {formatWhen(project.teacher_reviewed_at)}
                      </p>
                    ) : null}
                    {teacherStale ? (
                      <p className="border-l-2 border-primary/50 pl-3 text-[11px] leading-5 text-muted-foreground">
                        你之后又提交了新版本，老师这份评价对应的是旧版本，等待复评。
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    教师还没评价这份作品。提交后教师会看到你的论文、图片与视频。
                  </p>
                )}
              </div>

              <div className="eco-card p-5 text-xs leading-7 text-muted-foreground">
                <p className="font-serif text-base text-foreground">提交说明</p>
                <ul className="mt-2 space-y-1.5">
                  <li>· 每人一份作品，不限次数提交：每次重新提交都会替换成最新一版，教师端同步看到最新材料与提交次数。</li>
                  <li>· 压缩包里必须有论文（PDF / DOC / DOCX），扫描图片版 PDF 无法解析正文。</li>
                  <li>· 图片最多 {MAX_IMAGES} 张、视频 1 段，多出来的会被忽略。</li>
                  <li>· AI 评价依据论文正文、项目介绍、过程记录与回顾卡片；不识别图片与视频内容，证据不足的维度会标注「暂不评分」。</li>
                </ul>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

export default function ProjectPage() {
  return (
    <AppFrame>
      <ProjectContent />
    </AppFrame>
  )
}
