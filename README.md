# 万物声谱｜概念 MVP

让孩子用六个能理解的选择记录生活声音，再把多个原声编排成短曲。AI 背景始终是独立、可关闭、低增益的一层。

## 当前版本

这是供 UI、叙事和交互确认的 Mock 版本：

- 4 张示例声卡、来源候选、音频配方和 AI 结果统一位于 `src/mocks/mockData.ts`。
- 声音由浏览器实时合成，不代表最终原声素材。
- AI 背景由 Mock adapter 返回，界面始终如实标记为缓存示例或本地兜底。
- 用户提供的森林参考图位于 `public/forest-background.png`。

## 结构

```text
app/           路由入口，只挂载页面壳
src/page-shells/ 页面组合，不接触 Tone、Dexie 或 AI adapter
src/features/ 用例端口与跨能力编排边界
src/domain/   六字段、音乐映射、确定性编排
src/audio/    唯一 Tone 播放器与 original/polish bus
src/storage/  Dexie 数据库与 Repository
src/services/ 外部能力适配器；当前只有 mock
src/components/ 无业务副作用的通用 UI
src/mocks/    所有待替换 Mock 数据
src/app/      Composition Root，唯一实例化具体 adapter 的位置
```

依赖方向保持为：路由 → 页面壳 → feature/domain；`audio`、`storage`、`services` 通过端口接入，由 `src/app/CompositionRoot.tsx` 统一组装。

## 本地运行

```bash
npm install
npm run dev
```

## 验证

```bash
npm run typecheck
npm run test:domain
npm run build
```

## 替换 Mock

请先阅读 `docs/mock-replacement.md`。正式素材接入前不要把 Mock 结果改名为“实时 AI”，也不要把合成音色标记为儿童真实原声。

