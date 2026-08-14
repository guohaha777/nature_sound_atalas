# 万物声谱部署说明

本项目以标准 Next.js 作为默认构建，同时保留 OpenAI Sites / Cloudflare 的 vinext 构建。

## Vercel

- Framework Preset: `Next.js`
- Root Directory: 留空（仓库根目录）
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: 留空
- Node.js Version: `22.x`
- Production Branch: `main`

不要把 `dist`、`dist/client` 或 `.next` 手动填入 Vercel 的 Output Directory。

## Netlify

仓库内的 `netlify.toml` 已包含构建设置：

- Base directory: 留空（仓库根目录）
- Package directory: 留空
- Build command: `npm run build`
- Publish directory: `.next`
- Functions directory: 留空
- Node.js Version: `22.13.0`
- Production Branch: `main`

Netlify 应识别为 Next.js 并启用其 OpenNext 适配器。不要添加 SPA 的 `/* /index.html 200` 重写；本项目不是静态 SPA。

## OpenAI Sites / Cloudflare

- 开发：`npm run dev:sites`
- 构建：`npm run build:sites`
- 启动：`npm run start:sites`

## 环境变量

基础作品流程不依赖 Fun-Music。启用真实 AI 背景时，服务端可配置：

- `FUN_MUSIC_API_KEY`
- `FUN_MUSIC_MODEL`
- `FUN_MUSIC_ALLOWED_USER_ID`
- `FUN_MUSIC_API_ENDPOINT`

`FUN_MUSIC_ALLOWED_USER_ID` 可选：填写时仅允许指定 ChatGPT 用户调用；留空时允许公开访客通过服务端接口调用，并启用单访客、并发和单实例每日限额。无服务器实例之间不共享内存，因此公开评审前仍必须在 API 服务后台设置费用硬上限，评审后撤销或轮换密钥。

不要使用 `NEXT_PUBLIC_` 前缀，也不要提交真实值。

作品、录音与归档保存在浏览器 IndexedDB 中；不同部署域名之间不会共享本地数据。
