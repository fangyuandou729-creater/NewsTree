import React from "react";
import { createRoot } from "react-dom/client";
import {
  Bookmark,
  BookmarkCheck,
  Bot,
  Camera,
  Eye,
  Flame,
  Leaf,
  Link,
  Newspaper,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sprout,
  Trash2,
  User
} from "lucide-react";
import type { AppState, NewsItem, NewsSource, Tag } from "./types";
import { generateDailyNews } from "./data/seed";
import { generateNewsWithFreeLocalModel, generateNewsWithLlm } from "./data/llmClient";
import { loadState, saveState } from "./data/storage";
import { formatDateTime, nextTreeAfterOrganize } from "./utils";
import "./styles.css";

type View = "tree" | "today" | "favorites" | "settings" | "sources" | "model";

function App() {
  const [state, setState] = React.useState<AppState>(() => loadState());
  const [view, setView] = React.useState<View>("tree");
  const [treeVisit, setTreeVisit] = React.useState(0);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [newTag, setNewTag] = React.useState("");
  const [newSourceName, setNewSourceName] = React.useState("");
  const [newSourceUrl, setNewSourceUrl] = React.useState("");
  const [isOrganizing, setIsOrganizing] = React.useState(false);
  const [newsBatchIndex, setNewsBatchIndex] = React.useState(0);
  const [modelNotice, setModelNotice] = React.useState("");
  const treeSvgRef = React.useRef<SVGSVGElement | null>(null);

  React.useEffect(() => {
    saveState(state);
  }, [state]);

  const selectedNews = state.news.find((item) => item.id === selectedId) ?? state.news[0] ?? null;
  const activeTags = state.tags.filter((tag) => tag.enabled).map((tag) => tag.name);
  const shownNews = state.news.filter((item) => {
    const inView = view === "favorites" ? item.favorite : true;
    const inQuery = query.trim()
      ? `${item.title} ${item.summary} ${item.tags.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())
      : true;
    return inView && inQuery;
  });

  function goToView(nextView: View) {
    setView(nextView);
    if (nextView === "tree") {
      setTreeVisit((value) => value + 1);
    }
  }

  function updateState(updater: (current: AppState) => AppState) {
    setState((current) => updater(current));
  }

  async function organizeNews() {
    if (isOrganizing) {
      return;
    }

    setIsOrganizing(true);
    setModelNotice("");
    const snapshot = state;

    try {
      const freshNews = await organizeWithConfiguredStrategy(snapshot, 0);
      commitNewsBatch(freshNews, true);
      setNewsBatchIndex(0);
      setModelNotice(snapshot.llm.enabled ? "已由自定义大模型完成整理。" : snapshot.llm.useFreeLocalFallback ? "已尝试使用免费本地模型整理。" : "");
    } catch (error) {
      const fallbackNews = generateDailyNews(snapshot.tags, snapshot.sources, 0);
      commitNewsBatch(fallbackNews, true);
      setModelNotice(`大模型调用失败，已回退到本地整理：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setIsOrganizing(false);
      setView("today");
    }
  }

  async function refreshNextNewsBatch() {
    if (isOrganizing) {
      return;
    }

    setIsOrganizing(true);
    setModelNotice("");
    const snapshot = state;
    const nextBatch = newsBatchIndex + 1;

    try {
      const freshNews = await organizeWithConfiguredStrategy(snapshot, nextBatch);
      commitNewsBatch(freshNews, false);
      setNewsBatchIndex(nextBatch);
      setModelNotice(snapshot.llm.enabled ? `已切换到第 ${nextBatch + 1} 批大模型新闻。` : "已切换到下一批新闻。");
    } catch (error) {
      const fallbackNews = generateDailyNews(snapshot.tags, snapshot.sources, nextBatch);
      commitNewsBatch(fallbackNews, false);
      setNewsBatchIndex(nextBatch);
      setModelNotice(`下一批调用失败，已回退到本地整理：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setIsOrganizing(false);
      setView("today");
    }
  }

  async function organizeWithConfiguredStrategy(snapshot: AppState, batchIndex: number) {
    if (snapshot.llm.enabled) {
      return generateNewsWithLlm(snapshot.llm, snapshot.tags, snapshot.sources, batchIndex);
    }
    if (snapshot.llm.useFreeLocalFallback) {
      return generateNewsWithFreeLocalModel(snapshot.llm.systemPrompt, snapshot.tags, snapshot.sources, batchIndex);
    }
    return generateDailyNews(snapshot.tags, snapshot.sources, batchIndex);
  }

  function commitNewsBatch(freshNews: NewsItem[], countAsOrganizedDay: boolean) {
    updateState((current) => {
      const tagStats = { ...current.tree.tagStats };
      freshNews.forEach((item) => {
        item.tags.forEach((tag) => {
          tagStats[tag] = tagStats[tag] ?? { reads: 0, favorites: 0, collected: 0 };
          tagStats[tag] = { ...tagStats[tag], collected: tagStats[tag].collected + 1 };
        });
      });
      return {
        ...current,
        news: freshNews,
        tree: { ...(countAsOrganizedDay ? nextTreeAfterOrganize(current.tree) : current.tree), tagStats }
      };
    });
  }

  function markRead(news: NewsItem) {
    if (news.read) {
      setSelectedId(news.id);
      return;
    }

    updateState((current) => ({
      ...current,
      news: current.news.map((item) => (item.id === news.id ? { ...item, read: true } : item)),
      tree: {
        ...current.tree,
        totalReads: current.tree.totalReads + 1,
        tagStats: updateTagStats(current.tree.tagStats, news.tags, "reads")
      }
    }));
    setSelectedId(news.id);
  }

  function toggleFavorite(news: NewsItem) {
    const nextFavorite = !news.favorite;
    updateState((current) => ({
      ...current,
      news: current.news.map((item) => (item.id === news.id ? { ...item, favorite: nextFavorite } : item)),
      tree: {
        ...current.tree,
        totalFavorites: Math.max(0, current.tree.totalFavorites + (nextFavorite ? 1 : -1)),
        tagStats: updateTagStats(current.tree.tagStats, news.tags, "favorites", nextFavorite ? 1 : -1)
      }
    }));
  }

  function updateUserName(name: string) {
    updateState((current) => ({ ...current, user: { ...current.user, name } }));
  }

  function updateUserAvatar(file: File | null) {
    if (!file || !file.type.startsWith("image/")) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        updateState((current) => ({ ...current, user: { ...current.user, avatarDataUrl: reader.result as string } }));
      }
    });
    reader.readAsDataURL(file);
  }

  function toggleTag(tagId: string) {
    updateState((current) => ({
      ...current,
      tags: current.tags.map((tag) => (tag.id === tagId ? { ...tag, enabled: !tag.enabled } : tag))
    }));
  }

  function addTag() {
    const name = newTag.trim();
    if (!name || state.tags.some((tag) => tag.name === name)) {
      return;
    }
    const color = ["#4f7cff", "#10a7a7", "#c9902d", "#4e8d5c", "#d95f76", "#8b65d8"][state.tags.length % 6];
    updateState((current) => ({
      ...current,
      tags: [...current.tags, { id: crypto.randomUUID(), name, color, enabled: true }]
    }));
    setNewTag("");
  }

  function removeTag(tagId: string) {
    updateState((current) => ({
      ...current,
      tags: current.tags.filter((tag) => tag.id !== tagId)
    }));
  }

  function toggleSource(sourceId: string) {
    updateState((current) => ({
      ...current,
      sources: current.sources.map((source) => (source.id === sourceId ? { ...source, enabled: !source.enabled } : source))
    }));
  }

  function addSource() {
    const name = newSourceName.trim();
    const url = newSourceUrl.trim();
    if (!name || state.sources.some((source) => source.name === name)) {
      return;
    }
    updateState((current) => ({
      ...current,
      sources: [...current.sources, { id: crypto.randomUUID(), name, url, enabled: true }]
    }));
    setNewSourceName("");
    setNewSourceUrl("");
  }

  function removeSource(sourceId: string) {
    updateState((current) => ({
      ...current,
      sources: current.sources.filter((source) => source.id !== sourceId)
    }));
  }

  function updateLlmConfig(field: keyof AppState["llm"], value: string | boolean) {
    updateState((current) => ({
      ...current,
      llm: { ...current.llm, [field]: value }
    }));
  }

  function saveTreeImage() {
    const svg = treeSvgRef.current;
    if (!svg) {
      return;
    }

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const content = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([content], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${state.user.name || "我的"}兴趣树.svg`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const treeAnimationKey = [
    treeVisit,
    state.tree.totalDays,
    state.tree.totalReads,
    state.tree.totalFavorites,
    state.tags.length,
    state.news.length
  ].join("-");

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <label className="brand-mark avatar-upload" title="更换头像">
            {state.user.avatarDataUrl ? <img src={state.user.avatarDataUrl} alt="" /> : <User size={24} />}
            <input type="file" accept="image/*" onChange={(event) => updateUserAvatar(event.target.files?.[0] ?? null)} />
          </label>
          <div>
            <h1>NewsTree</h1>
            <p>{state.user.name || "我的"}兴趣树</p>
          </div>
        </div>

        <nav className="nav">
          <button className={view === "tree" ? "active" : ""} onClick={() => goToView("tree")}><Leaf size={18} />兴趣树主页</button>
          <button className={view === "today" ? "active" : ""} onClick={() => goToView("today")}><Newspaper size={18} />今日新闻</button>
          <button className={view === "favorites" ? "active" : ""} onClick={() => goToView("favorites")}><BookmarkCheck size={18} />收藏夹</button>
          <button className={view === "settings" ? "active" : ""} onClick={() => goToView("settings")}><Settings size={18} />标签设置</button>
          <button className={view === "sources" ? "active" : ""} onClick={() => goToView("sources")}><Link size={18} />新闻来源</button>
          <button className={view === "model" ? "active" : ""} onClick={() => goToView("model")}><Bot size={18} />大模型设置</button>
        </nav>

        <div className="sidebar-panel">
          <span>启用标签</span>
          <div className="tag-cloud">
            {state.tags.filter((tag) => tag.enabled).map((tag) => (
              <span className="tag" style={{ "--tag-color": tag.color } as React.CSSProperties} key={tag.id}>{tag.name}</span>
            ))}
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="toolbar">
          <div>
            <p className="eyebrow">{view === "tree" ? ownerLine(state.user.name) : activeTags.length ? activeTags.join(" / ") : "全部领域"}</p>
            <h2>{viewTitle(view, state.user.name)}</h2>
          </div>
          <div className="toolbar-actions">
            {(view === "today" || view === "favorites") && (
              <label className="search-box">
                <Search size={17} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、摘要、标签" />
              </label>
            )}
            {view === "tree" && <button className="secondary" onClick={saveTreeImage}><Camera size={17} />保存树照片</button>}
            {(view === "today" || view === "favorites") && <button className="secondary" onClick={refreshNextNewsBatch} disabled={isOrganizing}><RefreshCw size={17} />下一批</button>}
            <button className="primary" onClick={organizeNews} disabled={isOrganizing}><RefreshCw size={17} />{isOrganizing ? "整理中" : "整理今日新闻"}</button>
          </div>
        </header>

        {view === "tree" ? (
          <TreeView
            tags={state.tags}
            tree={state.tree}
            userName={state.user.name}
            svgRef={treeSvgRef}
            animationKey={treeAnimationKey}
          />
        ) : view === "settings" ? (
          <SettingsView
            tags={state.tags}
            userName={state.user.name}
            newTag={newTag}
            onUserName={updateUserName}
            onNewTag={setNewTag}
            onAddTag={addTag}
            onToggleTag={toggleTag}
            onRemoveTag={removeTag}
          />
        ) : view === "sources" ? (
          <SourcesView
            sources={state.sources}
            newName={newSourceName}
            newUrl={newSourceUrl}
            onName={setNewSourceName}
            onUrl={setNewSourceUrl}
            onAdd={addSource}
            onToggle={toggleSource}
            onRemove={removeSource}
          />
        ) : view === "model" ? (
          <ModelView llm={state.llm} notice={modelNotice} onChange={updateLlmConfig} />
        ) : (
          <div className="content-grid">
            <NewsList news={shownNews} selectedId={selectedNews?.id ?? null} notice={modelNotice} onRead={markRead} onFavorite={toggleFavorite} />
            <NewsDetail news={selectedNews} onRead={markRead} onFavorite={toggleFavorite} />
          </div>
        )}
      </section>
    </main>
  );
}

function updateTagStats(
  stats: AppState["tree"]["tagStats"],
  tags: string[],
  field: "reads" | "favorites",
  delta = 1
) {
  const next = { ...stats };
  tags.forEach((tag) => {
    next[tag] = next[tag] ?? { reads: 0, favorites: 0, collected: 0 };
    next[tag] = { ...next[tag], [field]: Math.max(0, next[tag][field] + delta) };
  });
  return next;
}

function viewTitle(view: View, userName: string) {
  return {
    tree: `${userName || "我的"}兴趣树`,
    today: "今日热点",
    favorites: "收藏新闻",
    settings: "标签设置",
    sources: "新闻来源",
    model: "大模型设置"
  }[view];
}

function ownerLine(userName: string) {
  const name = userName || "我的";
  return name === "我的" ? "我的成长记录" : `${name}的成长记录`;
}

function NewsList({ news, selectedId, notice, onRead, onFavorite }: {
  news: NewsItem[];
  selectedId: string | null;
  notice: string;
  onRead: (news: NewsItem) => void;
  onFavorite: (news: NewsItem) => void;
}) {
  if (news.length === 0) {
    return (
      <section className="empty-state">
        <Newspaper size={34} />
        <h3>还没有新闻</h3>
        <p>点击右上角整理按钮生成今日新闻简报。</p>
      </section>
    );
  }

  return (
    <section className="news-list">
      {notice && <div className="model-notice">{notice}</div>}
      {news.map((item) => (
        <article className={`news-card ${selectedId === item.id ? "selected" : ""}`} key={item.id} onClick={() => onRead(item)}>
          <div className="news-card-top">
            <span className="heat"><Flame size={15} />{item.heatScore}</span>
            <button className="icon-button" onClick={(event) => { event.stopPropagation(); onFavorite(item); }} title="收藏">
              {item.favorite ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
            </button>
          </div>
          <h3>{item.title}</h3>
          <p>{item.summary}</p>
          <div className="meta-row">
            <span>{item.source}</span>
            <span>{formatDateTime(item.publishedAt)}</span>
            {item.read && <span className="read-mark"><Eye size={14} />已读</span>}
          </div>
          <div className="tag-row">
            {item.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        </article>
      ))}
    </section>
  );
}

function NewsDetail({ news, onRead, onFavorite }: {
  news: NewsItem | null;
  onRead: (news: NewsItem) => void;
  onFavorite: (news: NewsItem) => void;
}) {
  if (!news) {
    return null;
  }

  return (
    <article className="detail-panel">
      <div className="detail-head">
        <span className="heat big"><Flame size={17} />热度 {news.heatScore}</span>
        <button className="secondary" onClick={() => onFavorite(news)}>
          {news.favorite ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
          {news.favorite ? "已收藏" : "收藏"}
        </button>
      </div>
      <h2>{news.title}</h2>
      <p className="detail-summary">{news.summary}</p>
      <div className="detail-meta">
        <span>{news.source}</span>
        <span>{formatDateTime(news.publishedAt)}</span>
        <button onClick={() => onRead(news)}><Eye size={16} />标记阅读</button>
      </div>
      <h3>要点</h3>
      <ul className="points">
        {news.keyPoints.map((point) => <li key={point}>{point}</li>)}
      </ul>
      <h3>分类标签</h3>
      <div className="tag-row spacious">
        {news.tags.map((tag) => <span key={tag}>{tag}</span>)}
      </div>
      <a className="source-link" href={news.url} target="_blank" rel="noreferrer">打开原文链接</a>
    </article>
  );
}

function SettingsView({ tags, userName, newTag, onUserName, onNewTag, onAddTag, onToggleTag, onRemoveTag }: {
  tags: Tag[];
  userName: string;
  newTag: string;
  onUserName: (value: string) => void;
  onNewTag: (value: string) => void;
  onAddTag: () => void;
  onToggleTag: (id: string) => void;
  onRemoveTag: (id: string) => void;
}) {
  return (
    <section className="settings-view">
      <div className="form-section">
        <h3><User size={18} />用户与树名</h3>
        <div className="settings-add">
          <input value={userName} onChange={(event) => onUserName(event.target.value)} placeholder="输入用户名，例如：小林" />
        </div>
      </div>

      <div className="form-section">
        <h3><Leaf size={18} />自定义标签</h3>
        <div className="settings-add">
          <input value={newTag} onChange={(event) => onNewTag(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onAddTag()} placeholder="添加兴趣标签，例如：汽车" />
          <button className="primary" onClick={onAddTag}><Plus size={17} />添加</button>
        </div>
        <div className="settings-list">
          {tags.map((tag) => (
            <div className="tag-setting" key={tag.id}>
              <span className="tag-dot" style={{ background: tag.color }} />
              <strong>{tag.name}</strong>
              <label>
                <input type="checkbox" checked={tag.enabled} onChange={() => onToggleTag(tag.id)} />
                参与整理
              </label>
              <button className="icon-button danger" onClick={() => onRemoveTag(tag.id)} title="删除标签"><Trash2 size={17} /></button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SourcesView({ sources, newName, newUrl, onName, onUrl, onAdd, onToggle, onRemove }: {
  sources: NewsSource[];
  newName: string;
  newUrl: string;
  onName: (value: string) => void;
  onUrl: (value: string) => void;
  onAdd: () => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="settings-view">
      <div className="form-section">
        <h3><Link size={18} />添加新闻来源</h3>
        <div className="source-add">
          <input value={newName} onChange={(event) => onName(event.target.value)} placeholder="来源名称，例如：少数派" />
          <input value={newUrl} onChange={(event) => onUrl(event.target.value)} placeholder="RSS / API / 热榜地址" />
          <button className="primary" onClick={onAdd}><Plus size={17} />添加</button>
        </div>
      </div>
      <div className="settings-list wide">
        {sources.map((source) => (
          <div className="source-setting" key={source.id}>
            <div>
              <strong>{source.name}</strong>
              <span>{source.url || "本地示例源"}</span>
            </div>
            <label>
              <input type="checkbox" checked={source.enabled} onChange={() => onToggle(source.id)} />
              启用
            </label>
            <button className="icon-button danger" onClick={() => onRemove(source.id)} title="删除来源"><Trash2 size={17} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

function ModelView({ llm, notice, onChange }: {
  llm: AppState["llm"];
  notice: string;
  onChange: (field: keyof AppState["llm"], value: string | boolean) => void;
}) {
  return (
    <section className="settings-view model-view">
      <div className="form-section">
        <h3><Bot size={18} />大模型接入</h3>
        <div className="model-switch">
          <label>
            <input type="checkbox" checked={llm.enabled} onChange={(event) => onChange("enabled", event.target.checked)} />
            启用自定义大模型
          </label>
          <span>{llm.enabled ? "整理新闻时会优先调用你填写的接口" : "未启用自定义接口"}</span>
        </div>
        <div className="model-switch model-switch-secondary">
          <label>
            <input type="checkbox" checked={llm.useFreeLocalFallback} onChange={(event) => onChange("useFreeLocalFallback", event.target.checked)} />
            未启用自定义接口时尝试免费本地模型
          </label>
          <span>默认尝试 Ollama：<code>http://localhost:11434/v1</code> / <code>qwen2.5:7b</code></span>
        </div>
      </div>

      <div className="form-section">
        <h3>接口配置</h3>
        <div className="model-grid">
          <label>
            <span>API URL</span>
            <input value={llm.apiUrl} onChange={(event) => onChange("apiUrl", event.target.value)} placeholder="https://token-plan-cn.xiaomimimo.com/v1" />
          </label>
          <label>
            <span>API Key</span>
            <input type="password" value={llm.apiKey} onChange={(event) => onChange("apiKey", event.target.value)} placeholder="sk-..." />
          </label>
        </div>
      </div>

      {notice && <div className="model-notice">{notice}</div>}
      <div className="model-help">
        当前实现兼容 OpenAI 风格接口。用户只需要填写 Base URL 和 API Key，例如 <code>https://token-plan-cn.xiaomimimo.com/v1</code>。程序会自动补全 <code>/chat/completions</code>，并根据 URL 内置选择模型候选与新闻整理 Prompt。
      </div>
    </section>
  );
}

type BranchShape = {
  tag: Tag;
  stat: { reads: number; favorites: number; collected: number };
  path: string;
  side: number;
  endX: number;
  endY: number;
  weight: number;
  leaves: number;
  fruits: FruitShape[];
  labelX: number;
  labelY: number;
  delay: number;
};

type FruitShape = {
  kind: string;
  x: number;
  y: number;
  size: number;
};

function TreeView({ tree, tags, userName, svgRef, animationKey }: {
  tree: AppState["tree"];
  tags: Tag[];
  userName: string;
  svgRef: React.RefObject<SVGSVGElement | null>;
  animationKey: string;
}) {
  const activeTags = tags.filter((tag) => tag.enabled || tree.tagStats[tag.name]);
  const branchCount = Math.max(activeTags.length, Object.keys(tree.tagStats).length);
  const maxCollected = Math.max(1, ...activeTags.map((tag) => {
    const stat = tree.tagStats[tag.name] ?? { collected: 0, reads: 0, favorites: 0 };
    return stat.collected + stat.reads * 1.5 + stat.favorites * 2;
  }));
  const trunkHeight = 188 + Math.min(105, tree.totalDays * 15 + tree.totalReads * 3);
  const treeHeightMeters = Math.max(1, tree.totalDays);
  const rootReach = 84 + Math.min(128, tree.totalFavorites * 18);
  const branchStartY = 450 - trunkHeight * 0.42;
  const baseX = 380;
  const baseY = 504;
  const tagNewsStats = Array.from(new Set([...tags.map((tag) => tag.name), ...Object.keys(tree.tagStats)]))
    .map((name) => {
      const tag = tags.find((item) => item.name === name);
      return {
        name,
        color: tag?.color ?? "#8abf8f",
        enabled: tag?.enabled ?? false,
        collected: tree.tagStats[name]?.collected ?? 0
      };
    })
    .filter((item) => item.enabled || item.collected > 0)
    .sort((a, b) => b.collected - a.collected);
  const branches: BranchShape[] = activeTags.map((tag, index) => {
    const stat = tree.tagStats[tag.name] ?? { collected: 0, reads: 0, favorites: 0 };
    const value = stat.collected + stat.reads * 1.5 + stat.favorites * 2;
    const weight = Math.max(0.22, value / maxCollected);
    const side = index % 2 === 0 ? -1 : 1;
    const tier = Math.floor(index / 2);
    const startY = branchStartY - tier * 48 - (index % 2) * 16;
    const length = 110 + weight * 145 + Math.min(24, stat.favorites * 5);
    const endX = baseX + side * length;
    const endY = startY - 58 - weight * 46;
    const sway = side * (44 + weight * 22);
    const labelX = baseX + side * (118 + tier * 20);
    const labelY = startY - 24 - weight * 10;
    return {
      tag,
      stat,
      path: `M${baseX} ${startY} C${baseX + sway} ${startY - 56}, ${endX - side * 78} ${endY + 26}, ${endX} ${endY}`,
      side,
      endX,
      endY,
      weight,
      leaves: Math.max(2, Math.min(16, Math.ceil((stat.collected + stat.reads + 1) / 2))),
      fruits: makeFruits(tag.name, stat.collected, endX, endY, side),
      labelX,
      labelY,
      delay: 0.55 + index * 0.18
    };
  });

  return (
    <section className="tree-view">
      <div className="tree-stage cartoon-stage">
        <svg key={animationKey} ref={svgRef} viewBox="0 0 760 560" role="img" aria-label="兴趣树">
          <defs>
            <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#33523f" floodOpacity="0.18" />
            </filter>
            <filter id="branchShadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="7" stdDeviation="5" floodColor="#2b332a" floodOpacity="0.2" />
            </filter>
            <radialGradient id="sceneWarmth" cx="50%" cy="38%" r="72%">
              <stop offset="0%" stopColor="#fff8d7" stopOpacity="0.1" />
              <stop offset="58%" stopColor="#fff8d7" stopOpacity="0.03" />
              <stop offset="100%" stopColor="#ffe0a3" stopOpacity="0.36" />
            </radialGradient>
            <linearGradient id="gardenSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#dff4ff" />
              <stop offset="62%" stopColor="#f7fbef" />
              <stop offset="100%" stopColor="#fff3ce" />
            </linearGradient>
            <linearGradient id="gardenHillBack" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#dff5bd" />
              <stop offset="100%" stopColor="#a8da82" />
            </linearGradient>
            <linearGradient id="gardenHillFront" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#b8e989" />
              <stop offset="100%" stopColor="#69be56" />
            </linearGradient>
            <radialGradient id="gardenSun" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff6a6" />
              <stop offset="70%" stopColor="#ffd56b" />
              <stop offset="100%" stopColor="#ffc65d" stopOpacity="0.45" />
            </radialGradient>
            <linearGradient id="trunkGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#9a6845" />
              <stop offset="55%" stopColor="#764c32" />
              <stop offset="100%" stopColor="#4f3223" />
            </linearGradient>
            <linearGradient id="rootGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#5a3828" />
              <stop offset="50%" stopColor="#8a5b3c" />
              <stop offset="100%" stopColor="#5a3828" />
            </linearGradient>
            <linearGradient id="branchWood" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a8794e" />
              <stop offset="45%" stopColor="#7b5538" />
              <stop offset="100%" stopColor="#4d3224" />
            </linearGradient>
            <linearGradient id="branchHighlight" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(255, 222, 160, 0.15)" />
              <stop offset="50%" stopColor="rgba(255, 235, 184, 0.7)" />
              <stop offset="100%" stopColor="rgba(255, 222, 160, 0.18)" />
            </linearGradient>
            <radialGradient id="leafGreen" cx="35%" cy="26%" r="72%">
              <stop offset="0%" stopColor="#c9ff78" />
              <stop offset="48%" stopColor="#66c957" />
              <stop offset="100%" stopColor="#2f8f59" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width="760" height="560" fill="#dff4ff" />
          <rect className="sky-fill" x="0" y="0" width="760" height="172" />
          <path className="sky-curve" d="M0 142 C108 124 168 162 248 145 C338 126 424 126 514 148 C604 170 668 124 760 142 L760 196 L0 196Z" />
          <g className="garden-scene">
            <circle className="garden-sun" cx="660" cy="78" r="42" fill="url(#gardenSun)" />
            <g className="cloud cloud-left">
              <ellipse cx="96" cy="78" rx="46" ry="21" />
              <circle cx="65" cy="77" r="20" />
              <circle cx="103" cy="61" r="24" />
              <circle cx="139" cy="80" r="22" />
            </g>
            <g className="cloud cloud-right">
              <ellipse cx="532" cy="112" rx="56" ry="24" />
              <circle cx="497" cy="110" r="22" />
              <circle cx="537" cy="92" r="27" />
              <circle cx="577" cy="112" r="23" />
            </g>
            <g className="cloud cloud-top">
              <ellipse cx="305" cy="88" rx="38" ry="17" />
              <circle cx="280" cy="88" r="17" />
              <circle cx="312" cy="74" r="20" />
              <circle cx="342" cy="90" r="18" />
            </g>
            <path className="hill-back" d="M0 375 C115 305 216 322 318 374 C432 432 548 324 760 356 L760 560 L0 560Z" fill="url(#gardenHillBack)" />
            <path className="hill-front" d="M0 430 C140 370 242 418 350 438 C474 460 574 380 760 414 L760 560 L0 560Z" fill="url(#gardenHillFront)" />
            <path className="garden-path" d="M340 560 C348 510 362 477 380 446 C398 477 412 510 420 560Z" />
            <g className="garden-flowers">
              <Flower x={74} y={452} color="#ff91a9" />
              <Flower x={122} y={482} color="#ffd36e" />
              <Flower x={650} y={438} color="#f7a1ff" />
              <Flower x={700} y={476} color="#ffb36b" />
              <Flower x={192} y={430} color="#92dfff" />
            </g>
            <g className="sparkles">
              <path d="M190 128 l6 12 l12 6 l-12 6 l-6 12 l-6 -12 l-12 -6 l12 -6Z" />
              <path d="M612 158 l4 8 l8 4 l-8 4 l-4 8 l-4 -8 l-8 -4 l8 -4Z" />
              <path d="M84 174 l4 8 l8 4 l-8 4 l-4 8 l-4 -8 l-8 -4 l8 -4Z" />
              <path d="M430 94 l4 8 l8 4 l-8 4 l-4 8 l-4 -8 l-8 -4 l8 -4Z" />
            </g>
          </g>
          <rect className="tree-scene-warmth" x="0" y="0" width="760" height="560" />
          <ellipse className="tree-glow" cx="380" cy="510" rx="250" ry="38" />
          <text x="380" y="42" textAnchor="middle" className="tree-title">{userName || "我的"}兴趣树</text>
          <g className="tree-height-badge">
            <rect x="307" y="56" width="146" height="32" rx="16" />
            <text x="380" y="77" textAnchor="middle">当前高度 {treeHeightMeters} 米</text>
          </g>

          <g className="roots" filter="url(#softShadow)">
            <path pathLength={1} d={`M${baseX} ${baseY - 10} C${baseX - 48} ${baseY + 2}, ${baseX - 70} ${baseY + 20}, ${baseX - rootReach} ${baseY + 34}`} className="root growth-draw" style={{ animationDelay: "0.05s" }} />
            <path pathLength={1} d={`M${baseX} ${baseY - 8} C${baseX + 48} ${baseY + 2}, ${baseX + 72} ${baseY + 20}, ${baseX + rootReach} ${baseY + 34}`} className="root growth-draw" style={{ animationDelay: "0.12s" }} />
            <path pathLength={1} d={`M${baseX - 8} ${baseY - 2} C${baseX - 16} ${baseY + 18}, ${baseX - 28} ${baseY + 30}, ${baseX - 46} ${baseY + 44}`} className="root small-root growth-draw" style={{ animationDelay: "0.2s" }} />
            <path pathLength={1} d={`M${baseX + 10} ${baseY - 2} C${baseX + 18} ${baseY + 18}, ${baseX + 30} ${baseY + 30}, ${baseX + 50} ${baseY + 44}`} className="root small-root growth-draw" style={{ animationDelay: "0.24s" }} />
          </g>

          <g className="tree-body" filter="url(#softShadow)">
            <path
              pathLength={1}
              d={`M${baseX} ${baseY - 18} C${baseX - 18} ${baseY - 120}, ${baseX - 6} ${baseY - trunkHeight + 58}, ${baseX + 2} ${baseY - trunkHeight}`}
              className="trunk growth-draw"
              style={{ animationDelay: "0.18s" }}
            />
            <path
              pathLength={1}
              d={`M${baseX + 18} ${baseY - 36} C${baseX + 2} ${baseY - 128}, ${baseX + 20} ${baseY - trunkHeight + 72}, ${baseX + 10} ${baseY - trunkHeight + 18}`}
              className="trunk-highlight growth-draw"
              style={{ animationDelay: "0.32s" }}
            />
          </g>

          <g className="branches">
            {branches.map((branch) => (
              <g key={branch.tag.id} className="branch-group">
                <path
                  pathLength={1}
                  d={branch.path}
                  className="branch branch-shadow growth-draw"
                  style={{
                    animationDelay: `${branch.delay}s`,
                    strokeWidth: 20 + branch.weight * 10
                  }}
                />
                <path
                  pathLength={1}
                  d={branch.path}
                  className="branch branch-wood growth-draw"
                  style={{
                    animationDelay: `${branch.delay + 0.02}s`,
                    strokeWidth: 14 + branch.weight * 8
                  }}
                />
                <path
                  pathLength={1}
                  d={branch.path}
                  className="branch branch-bark-highlight growth-draw"
                  style={{
                    animationDelay: `${branch.delay + 0.08}s`,
                    strokeWidth: 3 + branch.weight * 1.5
                  }}
                />
                <path
                  pathLength={1}
                  d={branch.path}
                  stroke={branch.tag.color}
                  className="branch branch-color-vein growth-draw"
                  style={{
                    animationDelay: `${branch.delay + 0.18}s`,
                    strokeWidth: 2.5 + branch.weight * 1.8
                  }}
                />
                {Array.from({ length: branch.leaves }).map((_, leafIndex) => {
                  const cluster = leafIndex % 6;
                  const row = Math.floor(leafIndex / 6);
                  const fan = cluster - 2.5;
                  const offsetX = branch.side * (fan * 18 + row * 6);
                  const offsetY = row * 22 + Math.abs(fan) * 5;
                  const cx = branch.endX - offsetX;
                  const cy = branch.endY + offsetY;
                  const scale = 0.75 + branch.weight * 0.35 + (leafIndex % 3) * 0.04;
                  return (
                    <g
                      key={leafIndex}
                      className="leaf-pop"
                      style={{ animationDelay: `${branch.delay + 0.28 + leafIndex * 0.035}s` }}
                      transform={`translate(${cx} ${cy}) rotate(${branch.side * (12 + fan * 10)}) scale(${scale})`}
                    >
                      <path
                        className="leaf-shape"
                        d="M0 -23 C16 -19 25 -8 22 5 C19 19 6 24 0 25 C-7 18 -20 10 -21 -3 C-22 -17 -12 -22 0 -23Z"
                        fill="url(#leafGreen)"
                      />
                      <path className="leaf-rim" d="M0 -23 C16 -19 25 -8 22 5 C19 19 6 24 0 25 C-7 18 -20 10 -21 -3 C-22 -17 -12 -22 0 -23Z" stroke={branch.tag.color} />
                      <path d="M0 -15 C3 -5 3 8 0 17" className="leaf-vein" />
                    </g>
                  );
                })}
                {branch.fruits.map((fruit, fruitIndex) => (
                  <Fruit
                    key={`${fruit.kind}-${fruitIndex}`}
                    fruit={fruit}
                    delay={branch.delay + 0.52 + fruitIndex * 0.08}
                  />
                ))}
                <text
                  x={branch.labelX}
                  y={branch.labelY}
                  textAnchor="middle"
                  className="branch-label"
                  style={{ animationDelay: `${branch.delay + 0.42}s` }}
                >
                  {branch.tag.name}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>
      <div className="tree-stats">
        <Stat label="整理天数" value={tree.totalDays} />
        <Stat label="阅读新闻" value={tree.totalReads} />
        <Stat label="收藏新闻" value={tree.totalFavorites} />
        <Stat label="兴趣分支" value={branchCount} />
        <div className="tag-news-stat-card">
          <h3>标签新闻数</h3>
          <div className="tag-news-stat-list">
            {tagNewsStats.map((item) => (
              <div className="tag-news-stat" key={item.name} style={{ "--tag-color": item.color } as React.CSSProperties}>
                <span>{item.name}</span>
                <strong>{item.collected}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Flower({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 18 C-2 8 -1 0 0 -10" className="flower-stem" />
      <circle cx="0" cy="-15" r="6" fill={color} />
      <circle cx="-7" cy="-11" r="5" fill={color} />
      <circle cx="7" cy="-11" r="5" fill={color} />
      <circle cx="0" cy="-7" r="5" fill={color} />
      <circle cx="0" cy="-11" r="3" className="flower-core" />
    </g>
  );
}

function makeFruits(tagName: string, newsCount: number, endX: number, endY: number, side: number): FruitShape[] {
  const count = Math.min(8, Math.floor(newsCount / 100));
  return Array.from({ length: count }).map((_, index) => {
    const seed = stableHash(`${tagName}-${index}`);
    const kind = fruitKinds[seed % fruitKinds.length];
    const ring = Math.floor(index / 4);
    const slot = index % 4;
    return {
      kind,
      x: endX + side * (18 + slot * 24 - ring * 10),
      y: endY + 36 + ring * 28 + (slot % 2) * 13,
      size: 12 + (seed % 5)
    };
  });
}

const fruitKinds = ["apple", "orange", "pear", "lemon", "cherry", "peach", "grape", "blueberry", "mango"];

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function Fruit({ fruit, delay }: { fruit: FruitShape; delay: number }) {
  return (
    <g
      className="milestone-fruit"
      style={{ animationDelay: `${delay}s` }}
      transform={`translate(${fruit.x} ${fruit.y}) scale(${fruit.size / 14})`}
    >
      {fruit.kind === "apple" && (
        <>
          <path className="fruit-body apple" d="M0 -11 C10 -17 20 -6 16 7 C13 18 4 21 0 15 C-4 21 -13 18 -16 7 C-20 -6 -10 -17 0 -11Z" />
          <path className="fruit-leaf" d="M1 -13 C6 -22 15 -21 18 -16 C12 -15 7 -13 1 -13Z" />
        </>
      )}
      {fruit.kind === "orange" && <circle className="fruit-body orange" r="15" />}
      {fruit.kind === "pear" && <path className="fruit-body pear" d="M0 -18 C8 -17 11 -9 8 -3 C18 4 15 20 0 22 C-15 20 -18 4 -8 -3 C-11 -9 -8 -17 0 -18Z" />}
      {fruit.kind === "lemon" && <ellipse className="fruit-body lemon" rx="18" ry="12" transform="rotate(-22)" />}
      {fruit.kind === "cherry" && (
        <>
          <path className="fruit-stem" d="M-4 -7 C-3 -17 6 -17 8 -25" />
          <circle className="fruit-body cherry" cx="-7" cy="5" r="10" />
          <circle className="fruit-body cherry" cx="9" cy="8" r="10" />
        </>
      )}
      {fruit.kind === "peach" && <path className="fruit-body peach" d="M0 -17 C16 -15 20 2 10 15 C4 22 -6 22 -12 15 C-22 2 -16 -15 0 -17Z" />}
      {fruit.kind === "grape" && (
        <>
          {[[0, -10], [-9, 0], [9, 0], [0, 8], [-7, 15], [7, 15]].map(([x, y]) => <circle className="fruit-body grape" cx={x} cy={y} r="8" key={`${x}-${y}`} />)}
        </>
      )}
      {fruit.kind === "blueberry" && <circle className="fruit-body blueberry" r="14" />}
      {fruit.kind === "mango" && <path className="fruit-body mango" d="M-5 -18 C12 -16 22 -3 16 11 C9 26 -13 21 -18 6 C-21 -5 -16 -15 -5 -18Z" />}
      <ellipse className="fruit-shine" cx="-5" cy="-6" rx="4" ry="6" />
    </g>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
