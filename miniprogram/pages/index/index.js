const storageKey = "news-tree-mini-state-v1";

const colors = ["#4f7cff", "#10a7a7", "#c9902d", "#4e8d5c", "#d95f76", "#8b65d8"];

const defaultTags = [
  { id: "ai", name: "AI", color: "#4f7cff", enabled: true },
  { id: "tech", name: "科技", color: "#10a7a7", enabled: true },
  { id: "finance", name: "财经", color: "#c9902d", enabled: true },
  { id: "world", name: "国际", color: "#4e8d5c", enabled: true },
  { id: "health", name: "健康", color: "#d95f76", enabled: true }
];

const defaultSources = [
  { id: "cctv-news", name: "央视新闻", url: "https://news.cctv.com/", enabled: true },
  { id: "xinhua", name: "新华网", url: "https://www.news.cn/", enabled: true },
  { id: "chinanews", name: "中国新闻网", url: "https://www.chinanews.com.cn/", enabled: true },
  { id: "caixin", name: "财新网", url: "https://www.caixin.com/", enabled: true },
  { id: "36kr", name: "36氪", url: "https://36kr.com/", enabled: true },
  { id: "ithome", name: "IT之家", url: "https://www.ithome.com/", enabled: true }
];

const titles = {
  AI: ["多模态模型进入企业知识库场景", "端侧 AI 芯片发布新一代推理方案", "AI 搜索产品开始强调可验证引用"],
  科技: ["国产操作系统生态新增重要适配", "新型电池材料量产路线披露", "机器人供应链订单明显升温"],
  财经: ["央行公开市场操作释放流动性信号", "新能源汽车板块盘中活跃", "消费电子出口数据环比改善"],
  国际: ["多国就数字贸易规则展开新一轮谈判", "主要经济体公布最新通胀数据", "国际航运价格出现阶段性波动"],
  健康: ["基层医疗数字化服务覆盖面扩大", "睡眠健康消费呈现年轻化趋势", "创新药临床数据公布"]
};

Page({
  data: {
    tab: "tree",
    user: { name: "我的", loggedIn: false },
    tags: defaultTags,
    sources: defaultSources,
    news: [],
    tree: { totalDays: 0, totalReads: 0, totalFavorites: 0, lastOrganizedDate: "", tagStats: {} },
    branchCount: 0,
    newTag: "",
    newSourceName: "",
    newSourceUrl: ""
  },

  onLoad() {
    const saved = wx.getStorageSync(storageKey);
    if (saved) {
      this.setData(saved);
    }
    this.refreshBranchCount();
    this.drawTree();
  },

  onReady() {
    this.drawTree();
  },

  persist() {
    wx.setStorageSync(storageKey, this.data);
  },

  switchTab(event) {
    this.setData({ tab: event.currentTarget.dataset.tab }, () => {
      if (this.data.tab === "tree") {
        this.drawTree();
      }
    });
  },

  loginWithWechat() {
    wx.login({
      success: (loginResult) => {
        const app = getApp();
        app.globalData.loginCode = loginResult.code;
        wx.getUserProfile({
          desc: "用于生成你的兴趣树名字",
          success: (profile) => {
            this.setData({
              user: {
                name: profile.userInfo.nickName || this.data.user.name,
                loggedIn: true
              }
            });
            this.persist();
            this.drawTree();
          },
          fail: () => {
            wx.showToast({ title: "已保留本地昵称", icon: "none" });
          }
        });
      }
    });
  },

  updateUserName(event) {
    this.setData({ "user.name": event.detail.value });
    this.persist();
    this.drawTree();
  },

  inputTag(event) {
    this.setData({ newTag: event.detail.value });
  },

  addTag() {
    const name = this.data.newTag.trim();
    if (!name || this.data.tags.some((tag) => tag.name === name)) return;
    const tag = { id: `tag-${Date.now()}`, name, color: colors[this.data.tags.length % colors.length], enabled: true };
    this.setData({ tags: this.data.tags.concat(tag), newTag: "" });
    this.persist();
    this.drawTree();
  },

  toggleTag(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({ tags: this.data.tags.map((tag) => tag.id === id ? { ...tag, enabled: event.detail.value } : tag) });
    this.persist();
  },

  removeTag(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({ tags: this.data.tags.filter((tag) => tag.id !== id) });
    this.persist();
    this.drawTree();
  },

  inputSourceName(event) {
    this.setData({ newSourceName: event.detail.value });
  },

  inputSourceUrl(event) {
    this.setData({ newSourceUrl: event.detail.value });
  },

  addSource() {
    const name = this.data.newSourceName.trim();
    if (!name) return;
    const source = { id: `source-${Date.now()}`, name, url: this.data.newSourceUrl.trim(), enabled: true };
    this.setData({ sources: this.data.sources.concat(source), newSourceName: "", newSourceUrl: "" });
    this.persist();
  },

  toggleSource(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({ sources: this.data.sources.map((source) => source.id === id ? { ...source, enabled: event.detail.value } : source) });
    this.persist();
  },

  removeSource(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({ sources: this.data.sources.filter((source) => source.id !== id) });
    this.persist();
  },

  organizeNews() {
    const enabledTags = this.data.tags.filter((tag) => tag.enabled);
    const tagPool = enabledTags.length ? enabledTags : this.data.tags;
    const enabledSources = this.data.sources.filter((source) => source.enabled);
    const sourcePool = enabledSources.length ? enabledSources : defaultSources;
    const today = new Date().toISOString().slice(0, 10);
    const tagStats = { ...this.data.tree.tagStats };
    const news = [];

    for (let index = 0; index < 20; index += 1) {
      const tag = tagPool[index % tagPool.length];
      const source = sourcePool[index % sourcePool.length];
      const options = titles[tag.name] || ["行业平台发布新趋势报告", "关键产品能力进入集中升级期"];
      const title = options[index % options.length];
      const heatScore = Math.min(99, 62 + ((index * 7) % 34) + (index < 5 ? 5 : 0));
      tagStats[tag.name] = tagStats[tag.name] || { reads: 0, favorites: 0, collected: 0 };
      tagStats[tag.name].collected += 1;
      news.push({
        id: `${today}-${tag.id}-${index}`,
        title,
        summary: `${title}。这条新闻来自${source.name}，与${tag.name}领域相关，值得继续关注。`,
        keyPoints: [`核心变化集中在${tag.name}方向。`, `热度评分为 ${heatScore}。`, "建议继续跟踪后续影响。"],
        source: source.name,
        heatScore,
        tags: [tag.name],
        read: false,
        favorite: false
      });
    }

    const already = this.data.tree.lastOrganizedDate === today;
    this.setData({
      tab: "news",
      news,
      tree: {
        ...this.data.tree,
        totalDays: already ? this.data.tree.totalDays : this.data.tree.totalDays + 1,
        lastOrganizedDate: today,
        tagStats
      }
    });
    this.refreshBranchCount();
    this.persist();
  },

  readNews(event) {
    const id = event.currentTarget.dataset.id;
    const item = this.data.news.find((news) => news.id === id);
    if (!item || item.read) return;
    const tagStats = { ...this.data.tree.tagStats };
    item.tags.forEach((tag) => {
      tagStats[tag] = tagStats[tag] || { reads: 0, favorites: 0, collected: 0 };
      tagStats[tag].reads += 1;
    });
    this.setData({
      news: this.data.news.map((news) => news.id === id ? { ...news, read: true } : news),
      tree: { ...this.data.tree, totalReads: this.data.tree.totalReads + 1, tagStats }
    });
    this.persist();
  },

  toggleFavorite(event) {
    const id = event.currentTarget.dataset.id;
    const item = this.data.news.find((news) => news.id === id);
    if (!item) return;
    const nextFavorite = !item.favorite;
    const tagStats = { ...this.data.tree.tagStats };
    item.tags.forEach((tag) => {
      tagStats[tag] = tagStats[tag] || { reads: 0, favorites: 0, collected: 0 };
      tagStats[tag].favorites = Math.max(0, tagStats[tag].favorites + (nextFavorite ? 1 : -1));
    });
    this.setData({
      news: this.data.news.map((news) => news.id === id ? { ...news, favorite: nextFavorite } : news),
      tree: {
        ...this.data.tree,
        totalFavorites: Math.max(0, this.data.tree.totalFavorites + (nextFavorite ? 1 : -1)),
        tagStats
      }
    });
    this.persist();
  },

  refreshBranchCount() {
    this.setData({ branchCount: Object.keys(this.data.tree.tagStats || {}).length });
  },

  drawTree() {
    wx.createSelectorQuery()
      .select("#treeCanvas")
      .fields({ node: true, size: true })
      .exec((res) => {
        const canvas = res[0] && res[0].node;
        if (!canvas) return;
        const dpr = wx.getSystemInfoSync().pixelRatio || 1;
        const width = res[0].width;
        const height = res[0].height;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        const ctx = canvas.getContext("2d");
        ctx.scale(dpr, dpr);
        this.paintTree(ctx, width, height);
      });
  },

  paintTree(ctx, width, height) {
    const tree = this.data.tree;
    const tags = this.data.tags;
    const stats = tree.tagStats || {};
    const max = Math.max(1, ...Object.values(stats).map((stat) => stat.collected + stat.reads + stat.favorites));

    ctx.fillStyle = "#f2f6ec";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#203027";
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${this.data.user.name || "我的"}兴趣树`, width / 2, 46);

    const baseX = width / 2;
    const baseY = height - 46;
    const trunkTop = 170 - Math.min(70, tree.totalDays * 8);
    ctx.strokeStyle = "#72513b";
    ctx.lineWidth = 30;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.bezierCurveTo(baseX - 18, baseY - 120, baseX - 4, baseY - 210, baseX, trunkTop);
    ctx.stroke();

    ctx.lineWidth = 14;
    const rootWidth = 58 + Math.min(70, tree.totalFavorites * 8);
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.bezierCurveTo(baseX - 40, baseY + 10, baseX - 72, baseY + 18, baseX - rootWidth, baseY + 28);
    ctx.moveTo(baseX, baseY);
    ctx.bezierCurveTo(baseX + 40, baseY + 10, baseX + 72, baseY + 18, baseX + rootWidth, baseY + 28);
    ctx.stroke();

    tags.forEach((tag, index) => {
      const stat = stats[tag.name] || { collected: 0, reads: 0, favorites: 0 };
      const weight = (stat.collected + stat.reads + stat.favorites) / max;
      const side = index % 2 === 0 ? -1 : 1;
      const y = baseY - 95 - index * 32;
      const endX = baseX + side * (80 + weight * 78);
      const endY = y - 34 - weight * 20;
      ctx.strokeStyle = tag.color;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(baseX, y);
      ctx.bezierCurveTo(baseX + side * 35, y - 34, endX - side * 32, endY + 18, endX, endY);
      ctx.stroke();

      const leaves = Math.max(1, Math.min(8, Math.ceil((stat.collected + stat.reads) / 4)));
      ctx.fillStyle = tag.color;
      for (let leaf = 0; leaf < leaves; leaf += 1) {
        ctx.beginPath();
        ctx.ellipse(endX - side * ((leaf % 3) * 18), endY + Math.floor(leaf / 3) * 18, 9 + weight * 4, 15, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#26342c";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = side < 0 ? "right" : "left";
      ctx.fillText(tag.name, endX + side * 10, endY - 10);
    });
  },

  saveTreeImage() {
    wx.createSelectorQuery()
      .select("#treeCanvas")
      .fields({ node: true, size: true })
      .exec((res) => {
        const canvas = res[0] && res[0].node;
        if (!canvas) return;
        wx.canvasToTempFilePath({
          canvas,
          fileType: "png",
          success: (result) => {
            wx.saveImageToPhotosAlbum({
              filePath: result.tempFilePath,
              success: () => wx.showToast({ title: "已保存" }),
              fail: () => wx.showToast({ title: "请允许相册权限", icon: "none" })
            });
          }
        });
      });
  }
});
