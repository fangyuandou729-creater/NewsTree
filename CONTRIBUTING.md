# Contributing

欢迎为 NewsTree 提交改进。

## 开发流程

1. Fork 或克隆仓库。
2. 安装依赖：

```bash
npm install
```

3. 创建功能分支：

```bash
git checkout -b feature/your-feature
```

4. 修改代码并运行检查：

```bash
npm run build
```

5. 提交 Pull Request。

## 提交建议

- 保持改动聚焦，避免混入无关重构。
- 不要提交 `node_modules/`、`dist/`、`release/` 等生成目录。
- 不要提交 API Key、账号 Token 或个人本地数据。
- UI 改动建议附上截图。

## 代码风格

项目使用 TypeScript + React。请尽量沿用现有组件结构、命名和样式习惯。
