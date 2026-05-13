# NewsTree

NewsTree 是一款桌面端新闻整理与兴趣养成应用。它可以按用户自定义标签整理每日热点新闻，支持阅读、收藏、新闻来源管理和大模型 API 接入，并通过一棵“兴趣树”可视化用户的阅读成长。

## 功能特性

- 按兴趣标签整理每日热点新闻
- 自定义标签和新闻来源
- 新闻摘要、要点、热度和标签分类展示
- 阅读记录和收藏夹
- 大模型 API 接入，支持 OpenAI 风格接口
- 未配置大模型时使用本地模拟整理逻辑
- 兴趣树可视化成长：
  - 每整理一天，树高增加 1 米
  - 标签新闻数影响树枝和叶子
  - 收藏影响根系
  - 每个领域新闻数超过 100 条会长出果实
- 保存兴趣树图片，便于分享
- 附带微信小程序端原型

## 技术栈

- React 19
- TypeScript
- Vite
- Electron
- electron-builder
- lucide-react
- 微信小程序原生框架

## 项目结构

```text
NewsTree/
├─ electron/          # Electron 主进程与预加载脚本
├─ miniprogram/       # 微信小程序端原型
├─ public/assets/     # 应用图标和视觉资源
├─ src/               # 桌面端 React 源码
│  ├─ data/           # 默认数据、存储、大模型调用
│  ├─ main.tsx        # 主界面与交互逻辑
│  ├─ styles.css      # 样式
│  └─ types.ts        # 类型定义
├─ package.json
└─ vite.config.ts
```

## 本地运行

安装依赖：

```bash
npm install
```

启动 Vite 开发服务：

```bash
npm run dev
```

构建桌面端：

```bash
npm run build
```

打包 Windows 安装包：

```bash
npm run dist
```

打包产物会生成到 `release/` 目录。该目录已被 `.gitignore` 忽略，不建议直接提交到 Git 仓库。

## 大模型配置

在应用内进入“大模型设置”，填写：

- API URL
- API Key

应用兼容 OpenAI 风格的 Chat Completions 接口。Prompt 架构已内置，用户不需要手动填写。请不要将自己的 API Key 写入源码或提交到仓库。

## 数据存储

桌面端数据保存在浏览器本地存储中，包括：

- 用户名和头像
- 标签设置
- 新闻来源
- 阅读与收藏记录
- 兴趣树成长数据
- 大模型配置

当前仓库不包含个人本地数据，克隆或安装后会从默认空白配置开始。

## 微信小程序

小程序端位于 `miniprogram/`。导入方式见：

[miniprogram/IMPORT.md](miniprogram/IMPORT.md)

小程序端目前是原型版本，包含兴趣树、标签、新闻来源、阅读和收藏等基础交互。

## 发布安装包

如果需要把软件发给别人使用，建议：

1. 本地运行 `npm run dist`
2. 将 `release/NewsTree Setup 0.1.0.exe` 上传到 GitHub Releases
3. 不要把 `.exe` 安装包直接提交到 Git 仓库

## 许可证

本项目使用 MIT License，见 [LICENSE](LICENSE)。
