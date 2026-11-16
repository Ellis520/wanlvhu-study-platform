/** 研学项目提交：论文 / 图片 / 视频，每人每个研学项目一份作品 */

export interface ProjectFile {
  fileId: string
  fileName: string
  size: number
}

export interface ProjectFileWithUrl extends ProjectFile {
  url: string | null
}

export type ProjectStatus = 'draft' | 'submitted'
export type ProjectParseStatus = 'none' | 'pending' | 'success' | 'failed'

export interface ProjectPayload {
  id: string | null
  title: string
  summary: string
  paper: ProjectFileWithUrl | null
  images: ProjectFileWithUrl[]
  video: ProjectFileWithUrl | null
  status: ProjectStatus
  submitted_at: string | null
  /** 已提交次数：每次重新提交 +1，用于提示评分对应哪一版 */
  submit_count: number
  ai_score: number | null
  /** 历次 AI 评分中的最高分：教师没给分时作为最终成绩 */
  best_ai_score: number | null
  ai_review: string | null
  ai_reviewed_at: string | null
  teacher_score: number | null
  teacher_comment: string | null
  teacher_reviewed_at: string | null
  paper_parse_status: ProjectParseStatus
  paper_text_chars: number
  updated_at: string | null
}

export const MAX_TITLE = 60
export const MAX_SUMMARY = 600

/** 论文：PDF / Word，单文件 ≤20MB（与文档解析 25MB 上限留出余量） */
export const MAX_PAPER_SIZE = 20 * 1024 * 1024
/** 图片：单张 ≤10MB，最多 9 张 */
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024
export const MAX_IMAGES = 9
/** 视频：单段 ≤100MB */
export const MAX_VIDEO_SIZE = 100 * 1024 * 1024
/** 作品压缩包：一个 zip 装论文 + 图片 + 视频，总量 ≤200MB */
export const MAX_BUNDLE_SIZE = 200 * 1024 * 1024

export const PAPER_EXT = ['pdf', 'doc', 'docx']
export const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif']
export const VIDEO_EXT = ['mp4', 'mov', 'webm', 'm4v', '3gp']

export function fileExt(name: string): string {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index + 1).toLowerCase() : ''
}

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
