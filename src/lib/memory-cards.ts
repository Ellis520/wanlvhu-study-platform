export interface MemoryCard {
  /** 站点唯一键，数据库 memory_checkins.card_id 使用 */
  id: string
  /** 卡片序号，从 1 开始 */
  order: number
  /** 日期标签 */
  day: string
  /** 时间标签 */
  time: string
  /** 站点名称 */
  title: string
  /** 站点副标题 / 地点 */
  subtitle: string
  /** 环节类型：在路上 / 场馆 / 工程 / 产业 / 村落 / 社区 / 总结 */
  kind: string
  /** 场景意象，用于卡片背景氛围描述（叙事段） */
  scene: string
  /** 引导语：这一段想让学生回忆什么 */
  prompt: string
  /** 拍什么：3 条取景建议 */
  shots: string[]
  /** 主题色（卡片光晕与按钮） */
  accent: string
  /** 卡片顶部色带渐变 */
  gradient: string
}

export const MEMORY_CARDS: MemoryCard[] = [
  {
    id: 'departure',
    order: 1,
    day: '11/14',
    time: '08:00 - 10:30',
    title: '向河源出发，把问题带进山水',
    subtitle: '中大南校 — 河源',
    kind: '在路上',
    scene:
      '从中大南校出发，两个半小时的车程，连接起校园与河源。我们带着对远方的期待，也带着课堂里尚未展开的问题：一方山水怎样滋养一座城市，人们又如何选择与自然相处？',
    prompt:
      '回看启程的照片，你还记得当时的心情吗？写下最初的期待，看看两天的旅程为它添上了怎样的答案。',
    shots: ['校门口集合的合影与行李箱', '车窗外掠过的田野与山影', '同座同学睡着或聊天的样子'],
    accent: '#5d8a6a',
    gradient: 'linear-gradient(135deg, #e8f1e4 0%, #cfe3d3 55%, #b8d4bd 100%)',
  },
  {
    id: 'heyuan-museum',
    order: 2,
    day: '11/14',
    time: '10:30 - 11:30',
    title: '在岁月的展柜前，读懂一座城',
    subtitle: '河源市博物馆',
    kind: '场馆',
    scene:
      '器物留住岁月，也留下人们依水而居、因地谋生的痕迹。走进河源的历史，我们试着理解：一座城市今天的模样，如何从它拥有的山川、资源与生活传统中慢慢生长？',
    prompt:
      '回想让你驻足的一件展品或一个故事，分享它怎样帮助你认识河源，也想一想，这份文化记忆值得我们如何珍惜。',
    shots: ['最打动你的一件展品', '展厅里的老地图或客家迁徙路线', '你和讲解牌的同框'],
    accent: '#8a6a4a',
    gradient: 'linear-gradient(135deg, #f3ece0 0%, #e6d8c3 55%, #d8c4a6 100%)',
  },
  {
    id: 'dinosaur-museum',
    order: 3,
    day: '11/14',
    time: '11:35 - 12:30',
    title: '一枚恐龙蛋，漫长时光的来信',
    subtitle: '河源恐龙博物馆',
    kind: '场馆',
    scene:
      '在恐龙蛋与化石面前，时间忽然有了另一种尺度。这些远古生命留下的线索，一旦损毁，便难以重来；而它们带给科学、教育与一座城市的意义，又远远超出展柜本身。',
    prompt:
      '哪件展品最让你惊叹？留下一张照片，谈谈你的发现：面对这样珍贵的自然遗产，我们可以怎样让更多人认识它，也让它长久地留下来？',
    shots: ['蛋化石墙的震撼全景', '你最喜欢的一枚蛋化石特写', '恐龙元素出现在文创或街头的细节'],
    accent: '#a8663f',
    gradient: 'linear-gradient(135deg, #f7e8dd 0%, #eed4c0 55%, #e0b99c 100%)',
  },
  {
    id: 'xinfengjiang-dam',
    order: 4,
    day: '11/14',
    time: '14:10 - 15:00',
    title: '一坝横江，水有了更多去处',
    subtitle: '新丰江大坝',
    kind: '工程',
    scene:
      '江水来到大坝，连接起防洪、发电与供水，也连接着不同地方、不同人群的需要。一份水资源往往承载着多重期待，而这些期待并不总是一致。',
    prompt:
      '回想眼前的工程与身后的湖水，分享现场最触动你的细节，再想一想：当这些需要不能同时满足时，我们应当怎样权衡，又该听见谁的声音？',
    shots: ['坝顶与湖面的开阔视角', '坝体结构的细节', '你和讲解员/展板数据的合影'],
    accent: '#3f7d8c',
    gradient: 'linear-gradient(135deg, #e2f0f2 0%, #c8e2e6 55%, #a9cfd6 100%)',
  },
  {
    id: 'nongfu-spring',
    order: 5,
    day: '11/14',
    time: '15:05 - 15:45',
    title: '一瓶水，从湖山走向日常',
    subtitle: '农夫山泉万绿湖生产工厂',
    kind: '产业',
    scene:
      '我们熟悉一瓶水的价格，却很少追问它从哪里来。来到生产工厂，水源、设备、包装与运输，把湖山和日常生活连在了一起。',
    prompt:
      '回想参观中最吸引你的环节：一湖好水如何成为产品，产品的价值又依靠哪些人的劳动与自然的馈赠？分享你的发现，也为这瓶水背后的环境与资源，留下一点思考。',
    shots: ['自动化灌装线的动态瞬间', '取水点或水源保护区的标识', '工厂里与「水」有关的标语'],
    accent: '#2f7f9c',
    gradient: 'linear-gradient(135deg, #e4f2f7 0%, #cfe8f0 55%, #b6dbe8 100%)',
  },
  {
    id: 'heyuan-hitech',
    order: 6,
    day: '11/14',
    time: '15:50 - 17:00',
    title: '在园区里，寻找发展的下一种可能',
    subtitle: '河源高新区',
    kind: '产业',
    scene:
      '从一家企业走向一片园区，我们开始看见产业之间的联系，也看见一座城市对未来的选择。资源能够吸引企业，技术、人才与协作又让新的可能生长。',
    prompt:
      '参观中，哪个项目或细节让你眼前一亮？请用自己的观察，谈谈河源怎样把资源优势变成发展的动力，又怎样让这份动力走得更长远。',
    shots: ['园区沙盘或产业模型', '展厅里的产品陈列', '园区建筑与山的同框'],
    accent: '#5a6f8c',
    gradient: 'linear-gradient(135deg, #eaeef5 0%, #d6deea 55%, #bfcbdc 100%)',
  },
  {
    id: 'jiulihu',
    order: 7,
    day: '11/15',
    time: '08:55 - 09:25',
    title: '九里湖畔，清澈背后的功夫',
    subtitle: '九里湖水环境治理提升工程',
    kind: '工程',
    scene:
      '清澈的水面容易被看见，治理与维护的功夫却常常藏在身后。九里湖这一站，让我们留意那些为环境改善付出的投入，以及改善之后由大家共享的收获。',
    prompt:
      '回想现场的设施与介绍，哪个细节让你重新理解「治理」二字？分享你的观察：为了让这份清澈长久留下，谁可以参与，又该怎样共同承担？',
    shots: ['治理后的水面与沉水植物', '工程介绍牌上的前后对比图', '步道、湿地与远山的层次'],
    accent: '#4a8a5c',
    gradient: 'linear-gradient(135deg, #e6f3e6 0%, #cfe8d2 55%, #b2d8ba 100%)',
  },
  {
    id: 'xingang-town',
    order: 8,
    day: '11/15',
    time: '09:30 - 10:15',
    title: '湖畔新港，把日子安放在风景里',
    subtitle: '新港镇',
    kind: '村落',
    scene:
      '小镇的街巷里，有居民的日常，也有来访者对湖光山色的向往。一处空间如何使用，一项设施为谁而建，都关系着人们怎样分享这里的环境与发展机会。',
    prompt:
      '回看新港镇的照片，哪个细节最打动你？如果由你为这座湖畔小镇添上一笔，你会怎样兼顾居民的便利、游客的体验与湖水的安宁？',
    shots: ['远眺点俯瞰镇与湖', '码头上的船与渔民', '镇上的街巷与日常'],
    accent: '#6b8299',
    gradient: 'linear-gradient(135deg, #eaf0f4 0%, #d3e0e8 55%, #b9cdd9 100%)',
  },
  {
    id: 'wanlvhu',
    order: 9,
    day: '11/15',
    time: '10:20 - 12:30',
    title: '万绿湖上，看见水色，也看见守护',
    subtitle: '万绿湖',
    kind: '水域',
    scene:
      '把记忆放回湖面，让目光越过水色，望向岸边的山林与村落。这一湖水连接着远近人家的生活，它的价值，也藏在清洁水源、生态栖息与人们心中的安宁里。',
    prompt:
      '哪一个画面最值得你留住？分享照片与感受，再想一想：享用这份好水的人，可以怎样回应守护它的人，让保护的付出得到珍视？',
    shots: ['湖面由浅到深的绿色层次', '船尾留下的水痕', '同船同学看风景的侧脸'],
    accent: '#1f6f6b',
    gradient: 'linear-gradient(135deg, #dff0ec 0%, #bfe3dc 55%, #96cfc6 100%)',
  },
  {
    id: 'nanyuan-village',
    order: 10,
    day: '11/15',
    time: '14:30 - 15:10',
    title: '南园古村，让旧时光有新的生活',
    subtitle: '南园古村',
    kind: '村落',
    scene:
      '老屋的门窗、院落与街巷，留着岁月的纹理。新的使用方式进入古村，也带来一个温柔而具体的问题：怎样让文化被珍惜，让空间有生机，也让生活在这里的人有所收获？',
    prompt:
      '选一个你记住的新旧相遇的细节，谈谈你心中的古村活化：哪些可以改变，哪些值得认真留下？',
    shots: ['青砖巷子与屋檐的光影', '被改造利用的老屋内部', '村里的猫、老人或小店'],
    accent: '#96703f',
    gradient: 'linear-gradient(135deg, #f6efe1 0%, #e9dcc4 55%, #d9c6a3 100%)',
  },
  {
    id: 'tangchao',
    order: 11,
    day: '11/15',
    time: '15:20 - 16:30',
    title: '糖巢，把一个点子种进乡土',
    subtitle: '糖巢创客社区',
    kind: '社区',
    scene:
      '一个空间重新亮起灯，一个点子找到愿意尝试的人，乡村便多了一种生长的可能。在糖巢，我们把目光投向创意、人才与地方资源相遇的时刻。',
    prompt:
      '哪个项目最让你想停下来了解？分享你的发现，也试着想象：如果把自己的所学带到这里，你想做些什么，让新的事业与当地人的生活一同变好？',
    shots: ['创客空间的工作场景', '与本地物产结合的产品', '你和店主的合影（先征得同意）'],
    accent: '#a4643f',
    gradient: 'linear-gradient(135deg, #f7ebe2 0%, #eed7c6 55%, #dfbda4 100%)',
  },
  {
    id: 'return-summary',
    order: 12,
    day: '11/15',
    time: '16:30 - 19:00',
    title: '归途，把山水带回心里',
    subtitle: '返程路上',
    kind: '总结',
    scene:
      '归途中，再把两天的见闻慢慢串起：一湖水可以连接怎样的生活，一座古村可以拥有怎样的明天，一次发展的选择又会留下怎样的影响？这些问题，因为亲眼所见而有了分量。',
    prompt:
      '选出最触动你的一处地方、一张照片，讲讲它改变了你的哪些想法。也为未来留下一句约定：你愿意从什么小事开始，回应这趟旅程的收获？',
    shots: ['返程车窗外最后的风景', '你最珍贵的一张研学照片', '和同伴的合照'],
    accent: '#4f6f8a',
    gradient: 'linear-gradient(135deg, #ebf1f2 0%, #d8e3e6 55%, #c0d1d8 100%)',
  },
]

export const TOTAL_CARDS = MEMORY_CARDS.length

export function findCard(cardId: string): MemoryCard | undefined {
  return MEMORY_CARDS.find((card) => card.id === cardId)
}
