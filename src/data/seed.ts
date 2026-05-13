import type { LlmConfig, NewsItem, NewsSource, Tag, TreeStats, UserProfile } from "../types";

export const defaultUser: UserProfile = {
  id: "local-user",
  name: "我的"
};

export const defaultTags: Tag[] = [
  { id: "ai", name: "AI", color: "#4f7cff", enabled: true },
  { id: "tech", name: "科技", color: "#10a7a7", enabled: true },
  { id: "finance", name: "财经", color: "#c9902d", enabled: true },
  { id: "world", name: "国际", color: "#4e8d5c", enabled: true },
  { id: "health", name: "健康", color: "#d95f76", enabled: true },
  { id: "education", name: "教育", color: "#8b65d8", enabled: false },
  { id: "game", name: "游戏", color: "#d65ca7", enabled: false }
];

export const defaultSources: NewsSource[] = [
  { id: "cctv-news", name: "央视新闻", url: "https://news.cctv.com/", enabled: true },
  { id: "xinhua", name: "新华网", url: "https://www.news.cn/", enabled: true },
  { id: "chinanews", name: "中国新闻网", url: "https://www.chinanews.com.cn/", enabled: true },
  { id: "caixin", name: "财新网", url: "https://www.caixin.com/", enabled: true },
  { id: "36kr", name: "36氪", url: "https://36kr.com/", enabled: true },
  { id: "ithome", name: "IT之家", url: "https://www.ithome.com/", enabled: true },
  { id: "bbc-zhongwen", name: "BBC 中文", url: "https://www.bbc.com/zhongwen/simp", enabled: true },
  { id: "zaobao", name: "联合早报即时", url: "https://www.zaobao.com.sg/realtime", enabled: true }
];

export const defaultTree: TreeStats = {
  totalDays: 0,
  totalReads: 0,
  totalFavorites: 0,
  lastOrganizedDate: null,
  tagStats: {}
};

export const defaultLlmConfig: LlmConfig = {
  enabled: false,
  apiUrl: "https://token-plan-cn.xiaomimimo.com/v1",
  apiKey: "",
  model: "auto",
  useFreeLocalFallback: true,
  systemPrompt: `你是 NewsTree 的新闻整理智能体。你的任务是根据用户的兴趣标签和新闻来源，整理当天约 20 条热点新闻。

你必须返回严格 JSON，不要返回 Markdown。

输出结构：
{
  "news": [
    {
      "title": "新闻标题",
      "summary": "80 到 140 字摘要",
      "keyPoints": ["要点1", "要点2", "要点3"],
      "source": "来源名称",
      "url": "新闻或来源链接",
      "publishedAt": "ISO 时间字符串",
      "heatScore": 0到100的整数,
      "tags": ["标签1", "标签2"]
    }
  ]
}

要求：
1. 优先匹配用户启用的兴趣标签。
2. 只使用用户提供的新闻来源名称和链接作为 source/url 候选。
3. 每条新闻必须有摘要、3 条要点、热度分数和标签。
4. 标签只能从用户给出的兴趣标签中选择，最多 3 个。
5. 如果你无法联网或无法确认实时新闻，请生成“待核验”的新闻整理建议，并在摘要里说明需要打开来源核验。`
};

const fallbackTitles = [
  "行业平台发布新趋势报告",
  "关键产品能力进入集中升级期",
  "用户需求变化带动服务模式调整",
  "多方协作项目取得阶段性进展"
];

const titleParts: Record<string, string[]> = {
  AI: [
    "多模态模型进入企业知识库场景",
    "端侧 AI 芯片发布新一代推理方案",
    "开源智能体框架获得开发者关注",
    "AI 搜索产品开始强调可验证引用"
  ],
  科技: [
    "国产操作系统生态新增重要适配",
    "新型电池材料量产路线披露",
    "折叠屏设备进入轻薄竞争阶段",
    "机器人供应链订单明显升温"
  ],
  财经: [
    "央行公开市场操作释放流动性信号",
    "新能源汽车板块盘中活跃",
    "消费电子出口数据环比改善",
    "多家平台调整会员服务策略"
  ],
  国际: [
    "多国就数字贸易规则展开新一轮谈判",
    "主要经济体公布最新通胀数据",
    "国际航运价格出现阶段性波动",
    "区域能源合作项目取得进展"
  ],
  健康: [
    "基层医疗数字化服务覆盖面扩大",
    "睡眠健康消费呈现年轻化趋势",
    "创新药临床数据公布",
    "运动康复服务进入社区场景"
  ],
  教育: [
    "高校推进 AI 通识课程建设",
    "职业教育实训平台升级",
    "多地发布中小学科学教育计划",
    "在线学习工具强调个性化反馈"
  ],
  游戏: [
    "独立游戏节公布入围名单",
    "云游戏服务优化低延迟体验",
    "国产开放世界新作开启测试",
    "电竞赛事商业合作持续扩容"
  ]
};

export function generateDailyNews(tags: Tag[], sources: NewsSource[], batchIndex = 0): NewsItem[] {
  const enabledTags = tags.filter((tag) => tag.enabled);
  const tagPool = enabledTags.length > 0 ? enabledTags : tags;
  const enabledSources = sources.filter((source) => source.enabled);
  const sourcePool = enabledSources.length > 0 ? enabledSources : defaultSources;
  const today = new Date();
  const isoToday = today.toISOString();
  const result: NewsItem[] = [];
  const offset = batchIndex * 3;

  for (let index = 0; index < 22; index += 1) {
    const shiftedIndex = index + offset;
    const tag = tagPool[shiftedIndex % tagPool.length];
    const source = sourcePool[(shiftedIndex + batchIndex) % sourcePool.length];
    const candidates = titleParts[tag.name] ?? fallbackTitles;
    const title = candidates[shiftedIndex % candidates.length];
    const secondary = tagPool[(shiftedIndex + 2) % tagPool.length]?.name ?? tag.name;
    const heatScore = Math.min(99, 62 + (((shiftedIndex + batchIndex) * 7) % 34) + (index < 5 ? 5 : 0));
    const publishedAt = new Date(today.getTime() - (shiftedIndex + batchIndex * 11) * 37 * 60 * 1000).toISOString();

    result.push({
      id: `${today.toISOString().slice(0, 10)}-${batchIndex}-${tag.id}-${source.id}-${index}`,
      title,
      summary: `${title}。这条新闻来自${source.name}，与${tag.name}领域密切相关，近期热度上升，值得关注后续影响。`,
      keyPoints: [
        `核心变化集中在${tag.name}方向，短期内会影响相关产品与服务。`,
        `多个信号显示市场关注度正在提升，热度评分为 ${heatScore}。`,
        `建议继续跟踪${secondary}等相邻领域的连锁反应。`
      ],
      source: source.name,
      url: source.url,
      publishedAt,
      fetchedAt: isoToday,
      heatScore,
      tags: Array.from(new Set([tag.name, secondary])),
      read: false,
      favorite: false
    });
  }

  return result.sort((a, b) => b.heatScore - a.heatScore).slice(0, 20);
}
