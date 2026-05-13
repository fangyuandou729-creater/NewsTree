import type { AppState, NewsItem, NewsSource, Tag, TreeStats, UserProfile } from "../types";
import { defaultLlmConfig, defaultSources, defaultTags, defaultTree, defaultUser } from "./seed";

const storageKey = "news-tree-state-v3";

function reviveState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Partial<AppState>;
  if (!Array.isArray(candidate.tags) || !Array.isArray(candidate.news) || !candidate.tree) {
    return null;
  }

  return {
    user: { ...defaultUser, ...((candidate.user as UserProfile | undefined) ?? {}) },
    tags: candidate.tags as Tag[],
    sources: normalizeSources(Array.isArray(candidate.sources) ? (candidate.sources as NewsSource[]) : defaultSources),
    llm: { ...defaultLlmConfig, ...(candidate.llm ?? {}) },
    news: candidate.news as NewsItem[],
    tree: candidate.tree as TreeStats
  };
}

function normalizeSources(sources: NewsSource[]) {
  const hasOnlyExampleSources = sources.length === 0 || sources.every((source) => source.url.includes("example.com"));
  if (hasOnlyExampleSources) {
    return defaultSources;
  }

  const realDefaultsById = new Map(defaultSources.map((source) => [source.id, source]));
  return sources.map((source) => {
    if (source.url.includes("example.com")) {
      return realDefaultsById.get(source.id) ?? source;
    }
    return source;
  });
}

export function loadState(): AppState {
  try {
    const stored = window.localStorage.getItem(storageKey);
    const parsed = stored ? reviveState(JSON.parse(stored)) : null;
    if (parsed) {
      return parsed;
    }
  } catch {
    // Ignore corrupt local state and restore defaults.
  }

  return {
    user: defaultUser,
    tags: defaultTags,
    sources: defaultSources,
    llm: defaultLlmConfig,
    news: [],
    tree: defaultTree
  };
}

export function saveState(state: AppState) {
  window.localStorage.setItem(storageKey, JSON.stringify(state));
}
