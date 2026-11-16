import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import * as yauzl from 'yauzl'
import { PROJECT_FILE_URL_TTL, getStorage } from '@/lib/project'
import {
  IMAGE_EXT,
  MAX_BUNDLE_SIZE,
  MAX_IMAGE_SIZE,
  MAX_IMAGES,
  MAX_PAPER_SIZE,
  MAX_VIDEO_SIZE,
  PAPER_EXT,
  VIDEO_EXT,
  fileExt,
  formatSize,
  type ProjectFile,
} from '@/lib/project-types'

export { MAX_BUNDLE_SIZE }

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  '3gp': 'video/3gpp',
}

export type BundleKind = 'paper' | 'image' | 'video'

export interface BundleEntry {
  /** zip 内的完整路径 */
  path: string
  /** 原始文件名 */
  name: string
  size: number
  ext: string
  kind: BundleKind
}

export interface BundleScan {
  paper: BundleEntry | null
  images: BundleEntry[]
  video: BundleEntry | null
  /** 压缩包里被忽略的文件（不属于论文 / 图片 / 视频，或超大） */
  ignored: string[]
  /** 给学生看的提示，例如「图片超过 9 张，已取前 9 张」 */
  notes: string[]
}

/** 把一个可读流落盘到临时目录，返回路径与字节数 */
export async function spoolToTemp(
  body: ReadableStream<Uint8Array>,
  suffix = '.zip',
): Promise<{ filePath: string; size: number; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-bundle-'))
  const filePath = path.join(dir, `upload${suffix}`)
  let size = 0

  const source = Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0])
  source.on('data', (chunk: Buffer) => {
    size += chunk.length
  })
  await pipeline(source, createWriteStream(filePath))

  return {
    filePath,
    size,
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true })
    },
  }
}

function openZip(filePath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, decodeStrings: true }, (error, zip) => {
      if (error || !zip) reject(error ?? new Error('压缩包无法打开'))
      else resolve(zip)
    })
  })
}

function kindOf(ext: string): BundleKind | null {
  if (PAPER_EXT.includes(ext)) return 'paper'
  if (IMAGE_EXT.includes(ext)) return 'image'
  if (VIDEO_EXT.includes(ext)) return 'video'
  return null
}

/** 只读一遍目录：把能识别的材料按类型挑出来，不在这里读文件内容 */
export async function scanBundle(filePath: string): Promise<BundleScan> {
  const zip = await openZip(filePath)
  const found: BundleEntry[] = []

  await new Promise<void>((resolve, reject) => {
    zip.on('entry', (entry: yauzl.Entry) => {
      const full = entry.fileName.replace(/\\/g, '/')
      const base = path.posix.basename(full)
      // 跳过目录、macOS 元数据、隐藏文件
      if (full.endsWith('/') || full.startsWith('__MACOSX/') || base.startsWith('.')) {
        zip.readEntry()
        return
      }
      const ext = fileExt(base)
      const kind = kindOf(ext)
      const size = entry.uncompressedSize
      if (kind && size > 0) {
        found.push({ path: full, name: base, size, ext, kind })
      }
      zip.readEntry()
    })
    zip.on('end', () => resolve())
    zip.on('error', (error: Error) => reject(error))
    zip.readEntry()
  })

  zip.close()

  const notes: string[] = []
  const ignored: string[] = []

  const papers = found
    .filter((item) => item.kind === 'paper')
    .sort((a, b) => b.size - a.size)
  const paper = papers[0] ?? null
  if (papers.length > 1) {
    notes.push(`压缩包里有 ${papers.length} 份论文，已用最大的「${paper?.name}」。`)
  }
  if (paper && paper.size > MAX_PAPER_SIZE) {
    throw new Error(
      `论文「${paper.name}」有 ${formatSize(paper.size)}，超过 ${formatSize(MAX_PAPER_SIZE)} 上限，请压缩后再打包`,
    )
  }

  const imageCandidates = found
    .filter((item) => item.kind === 'image')
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true }))
  const usableImages = imageCandidates.filter((item) => {
    if (item.size > MAX_IMAGE_SIZE) {
      ignored.push(`${item.name}（${formatSize(item.size)}，超过 ${formatSize(MAX_IMAGE_SIZE)}）`)
      return false
    }
    return true
  })
  const images = usableImages.slice(0, MAX_IMAGES)
  if (usableImages.length > MAX_IMAGES) {
    notes.push(`压缩包里有 ${usableImages.length} 张图片，只取前 ${MAX_IMAGES} 张。`)
  }

  const videos = found
    .filter((item) => item.kind === 'video')
    .sort((a, b) => b.size - a.size)
  const video = videos[0] ?? null
  if (videos.length > 1) {
    notes.push(`压缩包里有 ${videos.length} 段视频，只取其中一段。`)
  }
  if (video && video.size > MAX_VIDEO_SIZE) {
    throw new Error(
      `视频「${video.name}」有 ${formatSize(video.size)}，超过 ${formatSize(MAX_VIDEO_SIZE)} 上限，请压缩后再打包`,
    )
  }

  return { paper, images, video, ignored, notes }
}

/** 第二遍读取：只把选中的条目解出来（一次一个，避免整包进内存） */
export async function readEntry(filePath: string, entryPath: string): Promise<Buffer> {
  const zip = await openZip(filePath)

  return new Promise<Buffer>((resolve, reject) => {
    let settled = false
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      zip.close()
      reject(error)
    }

    zip.on('entry', (entry: yauzl.Entry) => {
      if (entry.fileName.replace(/\\/g, '/') !== entryPath) {
        zip.readEntry()
        return
      }
      zip.openReadStream(entry, (error, stream) => {
        if (error || !stream) {
          fail(error ?? new Error(`读取「${entryPath}」失败`))
          return
        }
        const chunks: Buffer[] = []
        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('end', () => {
          if (settled) return
          settled = true
          zip.close()
          resolve(Buffer.concat(chunks))
        })
        stream.on('error', (streamError: Error) => fail(streamError))
      })
    })
    zip.on('end', () => fail(new Error(`压缩包里找不到「${entryPath}」`)))
    zip.on('error', (error: Error) => fail(error))
    zip.readEntry()
  })
}

/** 把压缩包里的一个条目传到对象存储，返回入库用的文件元数据 */
export async function uploadEntry(
  filePath: string,
  entry: BundleEntry,
  userId: string,
): Promise<ProjectFile> {
  const buffer = await readEntry(filePath, entry.path)
  const safeExt = entry.ext || 'bin'
  const safeName = `project-${entry.kind}-${userId.slice(0, 8)}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${safeExt}`

  const uploaded = await getStorage().uploadFile({
    fileContent: buffer,
    fileName: safeName,
    contentType: MIME[safeExt] ?? 'application/octet-stream',
  })

  return { fileId: uploaded.fileId, fileName: entry.name, size: entry.size || buffer.length }
}

/** 文件临时访问链接（前端展示 / 教师预览用） */
export async function signFileUrl(fileId: string): Promise<string | null> {
  try {
    const info = await getStorage().getFile({ fileId, expiresInSeconds: PROJECT_FILE_URL_TTL })
    return info.url
  } catch {
    return null
  }
}
