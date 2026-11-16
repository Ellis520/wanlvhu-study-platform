import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { authenticatedRole } from 'drizzle-orm/supabase'

/** 教师身份判定（profiles 的 SELECT 策略对 authenticated 全开放，不会递归） */
const isTeacher = sql`EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'teacher')`

/** 用户档案：角色（student / teacher）、姓名、学号与头像 */
export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey(),
    display_name: text('display_name').notNull(),
    role: text('role').notNull().default('student'),
    class_name: text('class_name').notNull().default(''),
    /** 学号：必须与班级名册一致，学生认领名册行后写入 */
    student_code: text('student_code'),
    /** 预置头像标识（见 src/lib/avatar.ts），为空表示没选 */
    avatar_preset: text('avatar_preset'),
    /** 上传头像的对象存储 fileId，优先于预置头像 */
    avatar_file_id: text('avatar_file_id'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('profiles_role_idx').on(table.role),
    pgPolicy('profiles_select_authenticated', {
      for: 'select',
      to: authenticatedRole,
      using: sql`true`,
    }),
    pgPolicy('profiles_insert_self', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`(SELECT auth.uid()) = ${table.id}`,
    }),
    pgPolicy('profiles_update_self', {
      for: 'update',
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.id}`,
    }),
  ],
)

/** 研学项目（本次：万绿湖绿色发展区） */
export const studyTrips = pgTable(
  'study_trips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    destination: text('destination').notNull(),
    start_date: text('start_date').notNull(),
    end_date: text('end_date').notNull(),
    summary: text('summary').notNull().default(''),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('study_trips_start_date_idx').on(table.start_date),
    pgPolicy('study_trips_select_authenticated', {
      for: 'select',
      to: authenticatedRole,
      using: sql`true`,
    }),
  ],
)

/** 三阶段关键点记录：stage = before / during / after，answers 为关键点键值 */
export const stageRecords = pgTable(
  'stage_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .default(sql`auth.uid()`)
      .references(() => profiles.id, { onDelete: 'cascade' }),
    trip_id: uuid('trip_id')
      .notNull()
      .references(() => studyTrips.id, { onDelete: 'cascade' }),
    stage: text('stage').notNull(),
    answers: jsonb('answers').notNull().default(sql`'{}'::jsonb`),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('stage_records_user_trip_stage_key').on(table.user_id, table.trip_id, table.stage),
    index('stage_records_trip_idx').on(table.trip_id),
    pgPolicy('stage_records_owner_select', {
      for: 'select',
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id} OR ${isTeacher}`,
    }),
    pgPolicy('stage_records_owner_insert', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
    pgPolicy('stage_records_owner_update', {
      for: 'update',
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
    pgPolicy('stage_records_owner_delete', {
      for: 'delete',
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ],
)

/** 研学报告：学生自撰 + 规则评分 + AI 点评 + 教师评语 */
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .default(sql`auth.uid()`)
      .references(() => profiles.id, { onDelete: 'cascade' }),
    trip_id: uuid('trip_id')
      .notNull()
      .references(() => studyTrips.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default('万绿湖绿色发展区研学报告'),
    highlights: text('highlights').notNull().default(''),
    reflection: text('reflection').notNull().default(''),
    action_plan: text('action_plan').notNull().default(''),
    rule_score: integer('rule_score'),
    rule_detail: jsonb('rule_detail'),
    ai_review: text('ai_review'),
    ai_score: integer('ai_score'),
    status: text('status').notNull().default('draft'),
    submitted_at: timestamp('submitted_at', { withTimezone: true }),
    teacher_comment: text('teacher_comment'),
    teacher_score: integer('teacher_score'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('reports_user_trip_key').on(table.user_id, table.trip_id),
    index('reports_trip_idx').on(table.trip_id),
    index('reports_status_idx').on(table.status),
    pgPolicy('reports_owner_select', {
      for: 'select',
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id} OR ${isTeacher}`,
    }),
    pgPolicy('reports_owner_insert', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
    pgPolicy('reports_owner_update', {
      for: 'update',
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id} OR ${isTeacher}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id} OR ${isTeacher}`,
    }),
    pgPolicy('reports_owner_delete', {
      for: 'delete',
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ],
)


/** 回顾美好时刻：每个学生在每个研学站点的打卡、感悟与照片（照片存对象存储 fileId） */
export const memoryCheckins = pgTable(
  'memory_checkins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .default(sql`auth.uid()`)
      .references(() => profiles.id, { onDelete: 'cascade' }),
    trip_id: uuid('trip_id')
      .notNull()
      .references(() => studyTrips.id, { onDelete: 'cascade' }),
    card_id: text('card_id').notNull(),
    card_order: integer('card_order').notNull().default(0),
    reflection: text('reflection').notNull().default(''),
    photo_file_ids: jsonb('photo_file_ids').notNull().default(sql`'[]'::jsonb`),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('memory_checkins_user_card_key').on(table.user_id, table.trip_id, table.card_id),
    index('memory_checkins_trip_idx').on(table.trip_id),
    index('memory_checkins_user_idx').on(table.user_id),
    pgPolicy('memory_checkins_owner_select', {
      for: 'select',
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
    pgPolicy('memory_checkins_owner_insert', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
    pgPolicy('memory_checkins_owner_update', {
      for: 'update',
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
    pgPolicy('memory_checkins_owner_delete', {
      for: 'delete',
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ],
)


/**
 * 分享圈动态：文案 + 媒体（图片 / 视频，存对象存储 fileId）。
 * 可见性：分享圈是全体登录用户的公共广场——同学、老师、后加入的同学都能看到彼此的动态，
 * 写入与删除仍严格限定在作者本人。
 */
export const posts = pgTable(
  'posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .default(sql`auth.uid()`)
      .references(() => profiles.id, { onDelete: 'cascade' }),
    class_name: text('class_name').notNull().default(''),
    content: text('content').notNull().default(''),
    media: jsonb('media').notNull().default(sql`'[]'::jsonb`),
    /**
     * 「欢迎来看看我的研学之旅」卡片快照：AI 总结 + 12 站摘录与照片 fileId。
     * 普通动态为 null；快照落库是为了让同班同学与老师在不具备 memory_checkins 读权限时也能看到回顾。
     */
    journey: jsonb('journey'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('posts_user_idx').on(table.user_id),
    index('posts_class_idx').on(table.class_name),
    index('posts_created_at_idx').on(table.created_at),
    pgPolicy('posts_public_select', {
      for: 'select',
      to: authenticatedRole,
      using: sql`true`,
    }),
    pgPolicy('posts_owner_insert', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
    pgPolicy('posts_owner_delete', {
      for: 'delete',
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
    pgPolicy('posts_owner_update', {
      for: 'update',
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ],
)


/** 动态可见判定：只有能看到该条动态的人，才能看到 / 写入它的点赞与评论 */
const visiblePost = (postIdColumn: unknown) =>
  sql`EXISTS (SELECT 1 FROM posts p WHERE p.id = ${postIdColumn})`


/** 点赞 */
export const postLikes = pgTable(
  'post_likes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    post_id: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .default(sql`auth.uid()`)
      .references(() => profiles.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('post_likes_post_user_key').on(table.post_id, table.user_id),
    index('post_likes_post_idx').on(table.post_id),
    pgPolicy('post_likes_visible_select', {
      for: 'select',
      to: authenticatedRole,
      using: visiblePost(table.post_id),
    }),
    pgPolicy('post_likes_owner_insert', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id} AND ${visiblePost(table.post_id)}`,
    }),
    pgPolicy('post_likes_owner_delete', {
      for: 'delete',
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ],
)


/** 收藏（只有本人能看到自己的收藏） */
export const postFavorites = pgTable(
  'post_favorites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    post_id: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .default(sql`auth.uid()`)
      .references(() => profiles.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('post_favorites_post_user_key').on(table.post_id, table.user_id),
    index('post_favorites_user_idx').on(table.user_id),
    pgPolicy('post_favorites_owner_select', {
      for: 'select',
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
    pgPolicy('post_favorites_owner_insert', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id} AND ${visiblePost(table.post_id)}`,
    }),
    pgPolicy('post_favorites_owner_delete', {
      for: 'delete',
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ],
)


/** 评论：动态作者可以删除任何一条挂在自己动态下的评论 */
export const postComments = pgTable(
  'post_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    post_id: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .default(sql`auth.uid()`)
      .references(() => profiles.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('post_comments_post_idx').on(table.post_id),
    index('post_comments_created_at_idx').on(table.created_at),
    pgPolicy('post_comments_visible_select', {
      for: 'select',
      to: authenticatedRole,
      using: visiblePost(table.post_id),
    }),
    pgPolicy('post_comments_owner_insert', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id} AND ${visiblePost(table.post_id)}`,
    }),
    pgPolicy('post_comments_delete', {
      for: 'delete',
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id} OR EXISTS (SELECT 1 FROM posts p WHERE p.id = ${table.post_id} AND p.user_id = (SELECT auth.uid()))`,
    }),
  ],
)


/**
 * 研学项目提交：每人每个研学项目一份作品。
 * 论文（PDF / Word）走对象存储并解析出正文供 AI 评分，图片与视频作为附件。
 * 学生本人可读写，教师可读并可写评语。
 */
export const projectSubmissions = pgTable(
  'project_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .default(sql`auth.uid()`)
      .references(() => profiles.id, { onDelete: 'cascade' }),
    trip_id: uuid('trip_id')
      .notNull()
      .references(() => studyTrips.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    summary: text('summary').notNull().default(''),
    /** 论文：{ fileId, fileName, size } */
    paper: jsonb('paper'),
    /** 图片附件：[{ fileId, fileName, size }] */
    images: jsonb('images').notNull().default(sql`'[]'::jsonb`),
    /** 视频：{ fileId, fileName, size } */
    video: jsonb('video'),
    /** 论文解析出的正文，用于 AI 评分与教师阅读 */
    paper_text: text('paper_text').notNull().default(''),
    /** none / pending / success / failed */
    paper_parse_status: text('paper_parse_status').notNull().default('none'),
    paper_parse_task_id: text('paper_parse_task_id'),
    /** draft / submitted */
    status: text('status').notNull().default('draft'),
    submitted_at: timestamp('submitted_at', { withTimezone: true }),
    /** 提交次数：每次点「提交 / 重新提交」+1，用于区分评分对应哪一版 */
    submit_count: integer('submit_count').notNull().default(0),
    ai_score: integer('ai_score'),
    /** 历次 AI 评分中的最高分：教师没给分时，最终成绩用它 */
    best_ai_score: integer('best_ai_score'),
    ai_review: text('ai_review'),
    ai_reviewed_at: timestamp('ai_reviewed_at', { withTimezone: true }),
    teacher_score: integer('teacher_score'),
    teacher_comment: text('teacher_comment'),
    teacher_reviewed_at: timestamp('teacher_reviewed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('project_submissions_user_trip_key').on(table.user_id, table.trip_id),
    index('project_submissions_trip_idx').on(table.trip_id),
    index('project_submissions_status_idx').on(table.status),
    index('project_submissions_submitted_at_idx').on(table.submitted_at),
    pgPolicy('project_submissions_owner_select', {
      for: 'select',
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id} OR ${isTeacher}`,
    }),
    pgPolicy('project_submissions_owner_insert', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
    pgPolicy('project_submissions_owner_update', {
      for: 'update',
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id} OR ${isTeacher}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id} OR ${isTeacher}`,
    }),
    pgPolicy('project_submissions_owner_delete', {
      for: 'delete',
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ],
)


/**
 * 班级名册：全班 37 名学生都要完成「过程记录」与「项目作品」两项任务。
 * 教师端按名册逐人展示完成情况——还没注册的学生也留在名册里，标记为未完成。
 * reference_score 是系统内部参考分（最高分样例用于 AI 评分校准），不下发给教师端和学生端。
 */
export const classRoster = pgTable(
  'class_roster',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    student_no: integer('student_no').notNull(),
    display_name: text('display_name').notNull(),
    class_name: text('class_name').notNull().default(''),
    /** 学号，页面上的身份标识统一用它代替班级名 */
    student_code: text('student_code'),
    user_id: uuid('user_id').references(() => profiles.id, { onDelete: 'set null' }),
    reference_score: integer('reference_score'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('class_roster_student_no_key').on(table.student_no),
    index('class_roster_name_idx').on(table.display_name),
    index('class_roster_user_idx').on(table.user_id),
    pgPolicy('class_roster_teacher_select', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${isTeacher}`,
    }),
    // 学生按学号认领名册行需要读名单（列级授权只给姓名/学号等，参考分读不到）
    pgPolicy('class_roster_authenticated_select', {
      for: 'select',
      to: authenticatedRole,
      using: sql`true`,
    }),
  ],
)
