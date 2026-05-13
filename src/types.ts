export type Tag = {
  id: string;
  name: string;
  color: string;
  enabled: boolean;
};

export type NewsSource = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
};

export type UserProfile = {
  id: string;
  name: string;
  avatarDataUrl?: string;
};

export type LlmConfig = {
  enabled: boolean;
  apiUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  useFreeLocalFallback: boolean;
};

export type NewsItem = {
  id: string;
  title: string;
  summary: string;
  keyPoints: string[];
  source: string;
  url: string;
  publishedAt: string;
  fetchedAt: string;
  heatScore: number;
  tags: string[];
  read: boolean;
  favorite: boolean;
};

export type TreeStats = {
  totalDays: number;
  totalReads: number;
  totalFavorites: number;
  lastOrganizedDate: string | null;
  tagStats: Record<string, { reads: number; favorites: number; collected: number }>;
};

export type AppState = {
  user: UserProfile;
  tags: Tag[];
  sources: NewsSource[];
  llm: LlmConfig;
  news: NewsItem[];
  tree: TreeStats;
};
