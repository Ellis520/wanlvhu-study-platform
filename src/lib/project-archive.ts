import { Readable } from 'node:stream'
import { ZipArchive } from 'archiver'
import { getStorage } from '@/lib/project'

/** 压缩包内的一份材料：从对象存储的 fileId 取，落到某个目录下 */
export interface ArchiveSource {
  /** 压缩包内目录，如「论文」「图片」「视频」 */
  folder: string
  /** 压缩包内文件名 */
  fileName: string
  fileId: string
}

/** 去掉文件名里不能出现在 zip / 下载头中的字符 */
export function sanitizeName(input: string, fallback = '未命名'): string {
  const cleaned = input
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || fallback
}

/**
 * Content-Disposition 头：中文文件名走 RFC 5987 的 filename*，
 * ASCII 回落保留一份可读名（非 ASCII 用下划线占位）。
 */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

function uniquePath(used: Set<string>, folder: string, fileName: string): string {
  const base = sanitizeName(fileName, '未命名文件')
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const ext = dot > 0 ? base.slice(dot) : ''
  let candidate = folder ? `${folder}/${base}` : base
  let index = 2
  while (used.has(candidate)) {
    candidate = folder ? `${folder}/${stem}-${index}${ext}` : `${stem}-${index}${ext}`
    index += 1
  }
  used.add(candidate)
  return candidate
}

export interface SubmissionZip {
  /** 可直接作为响应体的 zip 流 */
  stream: Readable
  /** 打包完成 / 失败信号，调用方需要挂 catch 防止 unhandled rejection */
  done: Promise<void>
}

/**
 * 把一位学生的材料打包成 zip 流。
 *
 * 学生上传的原始 zip 在上传时就被拆解入库了，所以这里按 fileId 重新取回材料再打包；
 * 视频、图片本身已是压缩格式，统一用 store 模式，避免服务器白耗 CPU 反复压缩。
 */
export function createSubmissionZip(
  sources: ArchiveSource[],
  extraText?: { name: string; content: string },
): SubmissionZip {
  const archive = new ZipArchive({ zlib: { level: 0 } })
  const used = new Set<string>()

  const done = (async () => {
    try {
      if (extraText) archive.append(extraText.content, { name: extraText.name })
      for (const source of sources) {
        const buffer = await getStorage().readFile({ fileId: source.fileId })
        archive.append(buffer, { name: uniquePath(used, source.folder, source.fileName) })
      }
      await archive.finalize()
    } catch (error) {
      archive.abort()
      throw error
    }
  })()

  return { stream: archive, done }
}
