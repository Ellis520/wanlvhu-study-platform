'use client'


import { useCallback, useRef, useState } from 'react'
import { ImagePlus, Loader2, Send, Video, X } from 'lucide-react'
import { apiSend, apiUpload } from '@/lib/client-api'
import { formatSize } from '@/lib/feed-format'
import {
  MAX_CONTENT,
  MAX_IMAGE_SIZE,
  MAX_MEDIA,
  MAX_VIDEO_SIZE,
  type FeedPost,
} from '@/lib/feed-types'


interface Draft {
  key: string
  file: File
  previewUrl: string
  type: 'image' | 'video'
}


interface FeedComposerProps {
  onCreated: (post: FeedPost) => void
}


export function FeedComposer({ onCreated }: FeedComposerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [content, setContent] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [uploading, setUploading] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const pick = useCallback(() => inputRef.current?.click(), [])

  const addFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return
      setError('')

      const next: Draft[] = []
      let videoCount = drafts.filter((item) => item.type === 'video').length
      let total = drafts.length

      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith('video/')
        if (isVideo && videoCount >= 1) {
          setError('一条动态只能放 1 段视频')
          continue
        }
        if (!isVideo && !file.type.startsWith('image/')) {
          setError('只支持图片或视频')
          continue
        }
        if (total >= MAX_MEDIA) {
          setError(`最多选择 ${MAX_MEDIA} 个媒体文件`)
          break
        }
        if (isVideo && file.size > MAX_VIDEO_SIZE) {
          setError(`视频 ${file.name} 超过 100MB，请先压缩`)
          continue
        }
        if (!isVideo && file.size > MAX_IMAGE_SIZE) {
          setError(`图片 ${file.name} 超过 10MB`)
          continue
        }
        if (isVideo) videoCount += 1
        total += 1
        next.push({
          key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          previewUrl: URL.createObjectURL(file),
          type: isVideo ? 'video' : 'image',
        })
      }

      if (next.length > 0) setDrafts((prev) => [...prev, ...next])
    },
    [drafts],
  )

  const removeDraft = useCallback((key: string) => {
    setDrafts((prev) => {
      const target = prev.find((item) => item.key === key)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((item) => item.key !== key)
    })
  }, [])

  const submit = useCallback(async () => {
    const text = content.trim()
    if (!text && drafts.length === 0) {
      setError('写点什么或选张照片再发布吧')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const media: { fileId: string; type: 'image' | 'video' }[] = []
      for (let index = 0; index < drafts.length; index += 1) {
        const draft = drafts[index]
        setUploading(`正在上传 ${index + 1}/${drafts.length} · ${formatSize(draft.file.size)}`)
        const form = new FormData()
        form.append('file', draft.file)
        const uploaded = await apiUpload<{ fileId: string; type: 'image' | 'video' }>(
          '/api/feed/media',
          form,
        )
        media.push({ fileId: uploaded.fileId, type: uploaded.type })
      }
      setUploading('正在发布…')

      const data = await apiSend<{ post: FeedPost }>('/api/feed', 'POST', { content: text, media })
      onCreated(data.post)

      drafts.forEach((draft) => URL.revokeObjectURL(draft.previewUrl))
      setDrafts([])
      setContent('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '发布失败，请稍后重试')
    } finally {
      setUploading('')
      setSubmitting(false)
    }
  }, [content, drafts, onCreated])

  return (
    <section className="eco-card p-4 sm:p-5">
      <label htmlFor="feed-content" className="text-[11px] tracking-[0.2em] text-muted-foreground">
        发一条 / 你在湖边看到什么
      </label>
      <textarea
        id="feed-content"
        value={content}
        onChange={(event) => setContent(event.target.value.slice(0, MAX_CONTENT))}
        rows={3}
        className="mt-2 w-full resize-none rounded-sm border border-border bg-card px-3 py-2.5 font-sans text-[15px] leading-7 outline-none focus:ring-1 focus:ring-ring"
      />

      {drafts.length > 0 ? (
        <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {drafts.map((draft) => (
            <div
              key={draft.key}
              className="group relative aspect-square overflow-hidden rounded-sm border border-border bg-muted/40"
            >
              {draft.type === 'video' ? (
                <>
                  <video src={draft.previewUrl} muted playsInline className="h-full w-full object-cover" />
                  <span className="absolute left-1 top-1 rounded-sm bg-foreground/70 px-1 text-[10px] text-background">
                    视频
                  </span>
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={draft.previewUrl} alt="待发布的照片" className="h-full w-full object-cover" />
              )}
              <button
                type="button"
                onClick={() => removeDraft(draft.key)}
                className="absolute right-1 top-1 rounded-sm bg-foreground/70 p-0.5 text-background opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                aria-label="移除"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={pick}
            disabled={submitting}
            className="eco-btn-outline flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs text-foreground disabled:opacity-50"
          >
            <ImagePlus className="h-4 w-4" />
            照片 / 视频
          </button>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Video className="h-3 w-3" />
            视频 ≤100MB
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(event) => {
              addFiles(event.target.files)
              event.target.value = ''
            }}
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] tracking-[0.1em] text-muted-foreground">
            {content.length}/{MAX_CONTENT}
          </span>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="eco-btn-solid flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm text-primary-foreground disabled:opacity-70"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            发布
          </button>
        </div>
      </div>

      {uploading ? (
        <p className="mt-2 text-xs text-muted-foreground">{uploading}</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </section>
  )
}
