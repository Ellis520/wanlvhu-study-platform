/** 分享圈的纯类型定义：客户端与服务端共用，不引入任何服务端依赖 */

export interface FeedMedia {
  fileId: string
  type: 'image' | 'video'
  url: string | null
}

export interface FeedComment {
  id: string
  user_id: string
  author: string
  content: string
  created_at: string
  mine: boolean
}

/** 「研学之旅」卡片在列表里只需要封面与概况，详情才展开 12 站 */
export interface FeedJourneySummary {
  title: string
  /** 已写的站数（有感悟或照片的站点） */
  stationCount: number
  /** AI 总结的第一句，用于卡片预览 */
  preview: string
  coverUrl: string | null
}

export interface FeedJourneyCard {
  order: number
  title: string
  day: string
  time: string
  /** AI 给这一站写的一句小结，可能为空（旧快照没有） */
  note: string
  reflection: string
  photos: FeedMedia[]
}

export interface FeedJourney extends FeedJourneySummary {
  summary: string
  cards: FeedJourneyCard[]
}

export interface FeedPost {
  id: string
  user_id: string
  author: string
  author_role: string
  /** 作者头像：上传照片的签名链接或预置手绘图路径，没设置则为空 */
  author_avatar?: string | null
  class_name: string
  content: string
  media: FeedMedia[]
  created_at: string
  mine: boolean
  like_count: number
  liked: boolean
  favored: boolean
  comments: FeedComment[]
  /** 非空表示这是一张「欢迎来看看我的研学之旅」卡片 */
  journey: FeedJourneySummary | null
}

export interface FeedPage {
  posts: FeedPost[]
  nextCursor: string | null
  hasMore: boolean
}

export type FeedScope = 'all' | 'mine' | 'favored'

export const JOURNEY_TITLE = '欢迎来看看我的研学之旅'
export const MAX_MEDIA = 9
export const MAX_CONTENT = 2000
export const MAX_COMMENT = 300
export const MAX_VIDEO_SIZE = 100 * 1024 * 1024
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024
