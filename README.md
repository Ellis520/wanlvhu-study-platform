# 万绿湖研学记录与评价平台

围绕河源万绿湖两日研学的全栈学习平台。学生按阶段记录、回顾十二个时刻、交流并提交作品；教师查看班级进度、评价作品并下载材料。

本仓库来自超星诺亚平台的实际项目导出，不是另行制作的离线示例。默认保留现有 Next.js 全栈结构，以模块化单体组织页面、API、业务服务和数据库。它仍依赖超星平台认证、AI、文件解析与对象存储服务，下载源码不等于已完成独立部署。

## 技术栈

- Next.js 16 App Router、React 19、TypeScript 5。
- Tailwind CSS 4、shadcn/ui、Radix UI。
- Supabase Auth / PostgreSQL / Row Level Security。
- Drizzle ORM 与 SQL migrations。
- 超星平台 SDK 提供模型、文档解析与对象存储。
- yauzl 解析上传 ZIP，archiver 打包教师下载材料。

## 已核对功能

| 模块 | 能力 |
| --- | --- |
| 研学概览 | 行程、三阶段进度、作品状态 |
| 过程记录 | 出发前、学习中、参观后，共19个字段，停笔自动保存 |
| 回顾时刻 | 十二节点、感悟、照片、打卡、AI文字回顾与分享 |
| 分享圈 | 图文和视频动态、全部/我的/收藏视图，点赞和评论 |
| 项目提交 | ZIP解包、论文解析、图片视频、版本重交、七维AI反馈 |
| 学习情况 | 过程汇总、报告正文、规则反馈、教师分和AI分来源 |
| 教师端 | 名册、完成状态、报告与作品评价、作品材料ZIP下载 |

学生端页面已只读核对；教师端通过源代码核对，未以学生账号尝试越权访问。

## 快速开始

要求 Node.js 24、pnpm 9。仅使用 pnpm。

```sh
pnpm install --frozen-lockfile --ignore-scripts
cp .env.example .env.local
# 按 docs/DEPLOYMENT.md 配置真实服务，不要提交 .env.local
pnpm dev
```

Windows PowerShell 可使用 `Copy-Item .env.example .env.local`。

```sh
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm build
pnpm start
```

平台专用脚本保留为 `pnpm dev:coder`、`pnpm build:coder`、`pnpm start:coder`。默认命令使用标准 Next.js CLI，避免要求本地具备 Bash 和平台 CLI。

## 目录

```text
src/app/             页面、布局、HTTP API
src/components/      业务组件与UI基础组件
src/lib/             认证、业务服务、评分、平台适配
src/db/              Drizzle数据库模型与RLS定义
drizzle/             SQL迁移，已去掉真实名册数据
tests/               可复现的规则测试
docs/                架构、部署、接口与导出差异说明
.github/workflows/   自动检查
public/             平台原有静态素材
```

## 导出整理版的重要差异

- 不包含真实学生名册、学号回填、历史成绩、密钥、会话或上传附件。
- 移除了按姓名限制评分区间及隐藏班级分数锚点。评分只保留公开标准与材料证据。
- 禁止用户通过资料补全接口自授教师身份，并提供数据库角色变更防护迁移。
- 新数据库默认没有真实名册，须由可信管理员线下配置后才能完成学生核验。
- 这些差异仅存在于此仓库副本，没有修改或部署平台现有运行版本。

详细内容见 [导出与迁移说明](docs/EXPORT_NOTES.md)、[安全说明](SECURITY.md)。

## 授权与素材

当前仓库为私有备份，未声明开源许可。原平台SDK、第三方代码与图片素材仍受各自许可或权利约束，不能据此推定全部内容可以公开再分发。
