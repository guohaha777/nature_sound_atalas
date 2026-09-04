# Mock 替换说明

演示元数据集中在 `src/mocks/mockData.ts`，公开静态清单位于 `public/demo/demo-world-v1.json`，避免页面和领域规则出现散落数据。

## 正式声卡

逐项替换 `MOCK_SOUND_CARDS`，保留声音配方枚举和 `templateVersion`。正式数据建议由 manifest adapter 读取，而不是继续写进页面。

## 正式原声

当前牛、风、森林鸟声、苹果落地和自行车已作为不可变 MP3 示例资产接入，用户已确认可公开使用：

1. `OriginalAudioAsset` 已记录文件路径、时长、SHA-256 和许可状态。
2. sample player 只位于 `src/audio`，页面不导入 Tone.js。
3. 原声文件保持不可变；移调、增益和包络只写入播放事件。
4. 后续替换资产时必须同时更新 manifest、SHA-256、时长和许可引用。

## AI 接入状态

当前 `CompositionRoot` 已接入真实的 `AceStepPolishGenerator`（本机 ACE-Step 的 lego 任务，先把孩子的编排离线渲染成混音再送给模型，所以背景听得见原声）和 `HybridCompositionAdvisor`。`FunMusicPolishGenerator` 已不在默认路径上。`MockPolishGenerator` 仅保留为开发测试适配器，不再是公开版本的默认路径。联网模型通过服务端环境变量启用，未配置或调用失败时使用明确标记的本地降级结果。后续替换模型仍必须保持：

- `live_ai`、`cached_demo_ai`、`local_fallback` 三种来源真实标记；
- 原声和 AI 背景进入独立 bus；
- AI 失败不阻塞作品保存；
- 无歌词、无人声、无抢占性主旋律约束。

`src/mocks/mockData.ts` 目前仍提供演示声卡、示例声音元数据和初始化快照；这些属于公开说明的示例数据，不代表实时模型输出。正式学校部署时应替换初始化示例，并保留来源与授权字段。
