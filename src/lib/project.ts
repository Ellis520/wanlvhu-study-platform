import { getStorage } from '@/lib/storage'
import {
  MAX_IMAGES,
  type ProjectFile,
  type ProjectFileWithUrl,
  type ProjectParseStatus,
  type ProjectPayload,
  type ProjectStatus,
} from '@/lib/project-types'


export const PROJECT_FILE_URL_TTL = 60 * 60 * 12

/** 论文正文入库前的截断长度：评分只用前 15000 字，避免超长文档拖慢模型 */
export const MAX_PAPER_TEXT_CHARS = 15000

const toFile = (input: unknown): ProjectFile | null => {
  if (!input || typeof input !== 'object') return null
  const row = input as Record<string, unknown>
  const fileId = typeof row.fileId === 'string' ? row.fileId.trim() : ''
  if (!fileId) return null
  const fileName = typeof row.fileName === 'string' ? row.fileName.trim() : ''
  const size = Number(row.size)
  return { fileId, fileName: fileName || '未命名文件', size: Number.isFinite(size) ? size : 0 }
}

export function normalizeFile(input: unknown): ProjectFile | null {
  return toFile(input)
}

export function normalizeFiles(input: unknown, max: number = MAX_IMAGES): ProjectFile[] {
  if (!Array.isArray(input)) return []
  return input
    .map(toFile)
    .filter((item): item is ProjectFile => item !== null)
    .slice(0, max)
}

async function withUrl(file: ProjectFile | null): Promise<ProjectFileWithUrl | null> {
  if (!file) return null
  try {
    const info = await getStorage().getFile({ fileId: file.fileId, expiresInSeconds: PROJECT_FILE_URL_TTL })
    return { ...file, url: info.url }
  } catch {
    return { ...file, url: null }
  }
}

/** 把库里的行整理成前端契约：文件访问链接现签现用，不落库 */
export async function toProjectPayload(row: Record<string, unknown> | null): Promise<ProjectPayload> {
  if (!row) {
    return {
      id: null,
      title: '',
      summary: '',
      paper: null,
      images: [],
      video: null,
      status: 'draft',
      submitted_at: null,
      submit_count: 0,
      ai_score: null,
      best_ai_score: null,
      ai_review: null,
      ai_reviewed_at: null,
      teacher_score: null,
      teacher_comment: null,
      teacher_reviewed_at: null,
      paper_parse_status: 'none',
      paper_text_chars: 0,
      updated_at: null,
    }
  }

  const images = normalizeFiles(row.images)
  const [paper, video, imageList] = await Promise.all([
    withUrl(toFile(row.paper)),
    withUrl(toFile(row.video)),
    Promise.all(images.map((item) => withUrl(item))),
  ])

  return {
    id: (row.id as string) ?? null,
    title: (row.title as string) ?? '',
    summary: (row.summary as string) ?? '',
    paper,
    images: imageList.filter((item): item is ProjectFileWithUrl => item !== null),
    video,
    status: ((row.status as ProjectStatus) ?? 'draft') as ProjectStatus,
    submitted_at: (row.submitted_at as string) ?? null,
    ai_score: (row.ai_score as number | null) ?? null,
    best_ai_score: (row.best_ai_score as number | null) ?? null,
    ai_review: (row.ai_review as string | null) ?? null,
    ai_reviewed_at: (row.ai_reviewed_at as string) ?? null,
    teacher_score: (row.teacher_score as number | null) ?? null,
    teacher_comment: (row.teacher_comment as string | null) ?? null,
    teacher_reviewed_at: (row.teacher_reviewed_at as string) ?? null,
    submit_count: (row.submit_count as number | null) ?? 0,
    paper_parse_status: ((row.paper_parse_status as ProjectParseStatus) ?? 'none') as ProjectParseStatus,
    paper_text_chars: ((row.paper_text as string) ?? '').length,
    updated_at: (row.updated_at as string) ?? null,
  }
}

/**
 * 项目提交页展示用的字段清单。
 * paper_text 只用于算「正文是否已解析」的长度，不会返给前端展示。
 */
export const PROJECT_COLUMNS =
  'id, title, summary, paper, images, video, status, submitted_at, submit_count, ai_score, best_ai_score, ai_review, ai_reviewed_at, teacher_score, teacher_comment, teacher_reviewed_at, paper_parse_status, paper_text, updated_at'

export { getStorage } from '@/lib/storage'
