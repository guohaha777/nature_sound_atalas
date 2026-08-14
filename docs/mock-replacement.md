# Mock 替换说明

演示元数据集中在 `src/mocks/mockData.ts`，公开静态清单位于 `public/demo/demo-world-v1.json`，避免页面和领域规则出现散落数据。

## 正式声卡

逐项替换 `MOCK_SOUND_CARDS`，保留六字段枚举和 `templateVersion`。正式数据建议由 manifest adapter 读取，而不是继续写进页面。

## 正式原声

当前牛、风、森林鸟声、苹果落地和自行车已作为不可变 MP3 示例资产接入，用户已确认可公开使用：

1. `OriginalAudioAsset` 已记录文件路径、时长、SHA-256 和许可状态。
2. sample player 只位于 `src/audio`，页面不导入 Tone.js。
3. 原声文件保持不可变；移调、增益和包络只写入播放事件。
4. 后续替换资产时必须同时更新 manifest、SHA-256、时长和许可引用。

## 正式 AI

以真实 adapter 实现 `PolishGenerationPort`，再在 `src/app/CompositionRoot.tsx` 替换 `MockPolishGenerator`。必须保持：

- `live_ai`、`cached_demo_ai`、`local_fallback` 三种来源真实标记；
- 原声和 AI 背景进入独立 bus；
- AI 失败不阻塞作品保存；
- 无歌词、无人声、无抢占性主旋律约束。

确认所有正式数据接入后，可删除 `src/mocks/mockData.ts` 和 `src/services/mock/`。
