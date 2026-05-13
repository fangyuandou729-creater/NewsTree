import type { LlmConfig, NewsItem, NewsSource, Tag } from "../types";

type LlmNewsResponse = {
  news?: Array<Partial<NewsItem>>;
};

type ChatPayload = {
  model: string;
  temperature: number;
  max_tokens: number;
  response_format?: { type: "json_object" };
  messages: Array<{ role: "system" | "user"; content: string }>;
};

export async function generateNewsWithLlm(config: LlmConfig, tags: Tag[], sources: NewsSource[], batchIndex = 0): Promise<NewsItem[]> {
  if (!config.enabled || !config.apiUrl.trim() || !config.model.trim()) {
    throw new Error("大模型配置不完整");
  }

  const enabledTags = tags.filter((tag) => tag.enabled);
  const enabledSources = sources.filter((source) => source.enabled);
  const today = new Date();
  const basePayload: ChatPayload = {
    model: config.model.trim(),
    temperature: 0.3,
    max_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: config.systemPrompt },
      {
        role: "user",
        content: JSON.stringify({
          date: today.toISOString().slice(0, 10),
          targetCount: 20,
          batchIndex,
          batchInstruction: batchIndex > 0 ? "请换一批新闻角度，不要重复上一批标题和摘要。" : "请整理第一批当天热点新闻。",
          interests: enabledTags.map((tag) => tag.name),
          sources: enabledSources.map((source) => ({ name: source.name, url: source.url })),
          outputLanguage: "zh-CN"
        })
      }
    ]
  };

  const data = await requestChatCompletion(config, basePayload);
  const content = data?.choices?.[0]?.message?.content ?? data?.output_text ?? data?.content;
  const parsed = parseJsonContent(content);
  return normalizeLlmNews(parsed, enabledTags, enabledSources);
}

export async function generateNewsWithFreeLocalModel(systemPrompt: string, tags: Tag[], sources: NewsSource[], batchIndex = 0): Promise<NewsItem[]> {
  return generateNewsWithLlm({
    enabled: true,
    apiUrl: "http://localhost:11434/v1",
    apiKey: "",
    model: "qwen2.5:7b",
    systemPrompt,
    useFreeLocalFallback: true
  }, tags, sources, batchIndex);
}

async function requestChatCompletion(config: LlmConfig, basePayload: ChatPayload) {
  const url = toChatCompletionsUrl(config.apiUrl);
  const headers = buildHeaders(config);
  const modelCandidates = buildModelCandidates(basePayload.model, url);
  const errors: string[] = [];

  for (const model of modelCandidates) {
    const payload = { ...basePayload, model };
    const first = await postChatPayload(url, headers, payload);
    if (first.ok) {
      return first.data;
    }

    errors.push(`${model}: ${first.error}`);
    if (shouldRetryWithoutJsonMode(first.error)) {
      const retry = await postChatPayload(url, headers, withoutJsonMode(payload));
      if (retry.ok) {
        return retry.data;
      }
      errors.push(`${model} 无 JSON 模式: ${retry.error}`);
    }
  }

  throw new Error(`大模型请求失败：${errors.slice(0, 4).join("；")}`);
}

async function postChatPayload(url: string, headers: Record<string, string>, payload: ChatPayload) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  const text = await response.text();

  if (!response.ok) {
    return {
      ok: false as const,
      error: `${response.status} ${response.statusText}${text ? ` - ${truncate(text, 240)}` : ""}`
    };
  }

  try {
    return { ok: true as const, data: text ? JSON.parse(text) : {} };
  } catch {
    return { ok: false as const, error: `返回内容不是 JSON：${truncate(text, 160)}` };
  }
}

function withoutJsonMode(payload: ChatPayload): ChatPayload {
  const next = { ...payload };
  delete next.response_format;
  return next;
}

function shouldRetryWithoutJsonMode(error: string) {
  return /response_format|json_object|json mode|Param Incorrect/i.test(error);
}

function buildModelCandidates(model: string, providerUrl: string) {
  const trimmed = model.trim();
  const isMimoProvider = /xiaomimimo\.com/i.test(providerUrl);
  const candidates = isMimoProvider
    ? [
        "mimo-v2.5-pro",
        "xiaomi/mimo-v2.5-pro",
        "mimo-v2.5",
        "xiaomi/mimo-v2.5",
        "mimo-v2-pro",
        "xiaomi/mimo-v2-pro",
        "mimo-v2-flash",
        "xiaomi/mimo-v2-flash",
        "MiMo-V2.5-Pro",
        "MiMo-V2.5",
        "MiMo-V2-Pro"
      ]
    : [trimmed];
  const lower = trimmed.replace(/^xiaomi\//i, "").toLowerCase();

  if (lower !== trimmed) {
    candidates.push(lower);
  }

  if (!isMimoProvider) {
    candidates.push(trimmed);
  }

  if (/^mimo/i.test(trimmed) || /^xiaomi\/mimo/i.test(trimmed)) {
    if (/v2\.5-pro/i.test(trimmed)) {
      candidates.unshift("mimo-v2.5-pro", "mimo-v2-pro", "mimo-v2-flash");
    } else if (/v2\.5/i.test(trimmed)) {
      candidates.unshift("mimo-v2.5", "mimo-v2-pro", "mimo-v2-flash");
    } else if (/v2-pro/i.test(trimmed)) {
      candidates.unshift("mimo-v2-pro", "mimo-v2-flash");
    } else {
      candidates.push("mimo-v2-flash", "mimo-v2-pro");
    }
  } else {
    candidates.push(trimmed);
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

function toChatCompletionsUrl(url: string) {
  const trimmed = fixKnownProviderUrlTypos(url.trim()).replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed;
  }
  if (/\/v\d+$/i.test(trimmed) || /\/v\d+\.\d+$/i.test(trimmed)) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/chat/completions`;
}

function fixKnownProviderUrlTypos(url: string) {
  return url.replace("xiaomimo.com", "xiaomimimo.com");
}

function buildHeaders(config: LlmConfig) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (config.apiKey.trim()) {
    headers.Authorization = `Bearer ${config.apiKey.trim()}`;
  }
  return headers;
}

function parseJsonContent(content: unknown): LlmNewsResponse {
  if (typeof content === "object" && content !== null) {
    return content as LlmNewsResponse;
  }
  if (typeof content !== "string") {
    throw new Error("大模型没有返回可解析内容");
  }

  const trimmed = content.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "");
  return JSON.parse(trimmed) as LlmNewsResponse;
}

function normalizeLlmNews(response: LlmNewsResponse, tags: Tag[], sources: NewsSource[]): NewsItem[] {
  const allowedTags = new Set(tags.map((tag) => tag.name));
  const sourceByName = new Map(sources.map((source) => [source.name, source]));
  const now = new Date().toISOString();
  const items = Array.isArray(response.news) ? response.news : [];

  return items.slice(0, 20).map((item, index) => {
    const sourceName = typeof item.source === "string" && item.source ? item.source : sources[index % Math.max(1, sources.length)]?.name ?? "用户来源";
    const source = sourceByName.get(sourceName);
    const itemTags = Array.isArray(item.tags)
      ? item.tags.filter((tag): tag is string => typeof tag === "string" && allowedTags.has(tag))
      : [];

    return {
      id: `llm-${Date.now()}-${index}`,
      title: stringOr(item.title, "未命名新闻"),
      summary: stringOr(item.summary, "大模型已整理该新闻，但没有返回摘要。"),
      keyPoints: normalizePoints(item.keyPoints),
      source: sourceName,
      url: stringOr(item.url, source?.url ?? ""),
      publishedAt: normalizeDate(item.publishedAt, now),
      fetchedAt: now,
      heatScore: normalizeHeat(item.heatScore),
      tags: itemTags.length > 0 ? itemTags : tags.slice(0, 1).map((tag) => tag.name),
      read: false,
      favorite: false
    };
  });
}

function stringOr(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizePoints(value: unknown) {
  if (Array.isArray(value)) {
    const points = value.filter((point): point is string => typeof point === "string" && point.trim().length > 0).slice(0, 5);
    if (points.length > 0) {
      return points;
    }
  }
  return ["该新闻需要进一步阅读原文确认。", "请关注事件后续影响。", "可结合相关标签持续跟踪。"];
}

function normalizeDate(value: unknown, fallback: string) {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return fallback;
}

function normalizeHeat(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    return 70;
  }
  return Math.max(0, Math.min(100, Math.round(number)));
}

function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}
