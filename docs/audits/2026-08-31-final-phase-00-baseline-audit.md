# 决赛完善 Phase 00｜基线审计

审计日期：2026-08-31  
审计依据：决赛完善版 PRD v2.0、决赛完善 TODO、完整工作流程、README 与当前 `main` 实际代码。  
审计边界：只核对现状，不修改产品逻辑。进入 Phase 01 前需由用户确认本结论。

## 1. 基线结论

- 当前版本具备可运行的完整页面链路、真实原声资产引用、确定性基础编排、三层背景降级、Tone.js 播放、IndexedDB 保存与归档，不需要推倒重来。
- 决赛核心缺口真实存在：基础编曲仍是 `arranger-v1`；没有素材驱动的时长推荐；没有开头／中段／结尾自然声覆盖与最长纯背景间隔规则；结构段落、角色、密度修复和最终统一时间线仍不完整。
- Fun-Music 与千问接口是真实服务端接口；本地动态音符是真实确定性方案。Fun-Music 的“无人声”目前只有请求约束，没有独立内容检测，不能宣称已完成人声风险校验。
- 保存结构已经从旧快照外壳拆为项目、纸卡、声卡、原声资产、声音单元、作品和进度等 IndexedDB 表；但完整 Agent trace、降级原因和执行记录尚未随作品持久化。

## 2. Git、部署与验证基线

### Git

- 分支：`main`
- 本地 HEAD：`82bc653c492f7834fc90788a2e4497da98a09ccd`
- 远程 `origin/main`：`82bc653c492f7834fc90788a2e4497da98a09ccd`
- 工作树：干净，无未提交文件。
- 结论：审计时本地与远程 `main` 一致。

### 公开部署

- README 声明地址：`https://wanwu-shengpu-mock.guohaha777.chatgpt.site/`
- 2026-08-31 实测：HTTP 200，Cloudflare 响应，页面使用 Vinext/Next 响应头。
- 仅凭 HTTP 响应无法证明部署产物精确对应当前提交；仓库目前没有在页面或响应中暴露 commit SHA。

### 自动验证

- `npm run typecheck`：通过。
- `npm run test:domain`：3 个文件、11 项测试通过。
- Vitest 全量：32 个文件、105 项测试通过。
- `npx next build --webpack`：通过，11 条页面/API 路由成功构建。
- `npm run build:sites`：通过。
- `node --test tests/rendered-html.test.mjs`：3 项通过。
- `npm test`：在当前执行环境失败。原因是默认 `next build` 使用 Turbopack，PostCSS 子进程尝试绑定内部端口时收到 `Operation not permitted`；同一代码的 Webpack 生产构建通过。当前不能把默认 `npm test` 记为可重复通过。

## 3. 五条音乐链路

### A. 儿童原声链路｜真实，保留

`声卡／录音 → OriginalAudioAsset → SoundUnit.originalAudioAssetId → CompositionEvent.audioAssetId → Tone.Player`

- 系统示例音频是真实 MP3；用户录音保存在 IndexedDB，播放时生成本地 URL。
- 事件处理使用独立参数，原始资产不被写回。
- 播放器消费 `gainDb`、`semitoneShift`、淡入淡出、循环和轮廓滤波。
- 长短素材会按事件与作品剩余时长裁切或循环，但尚未形成“选段／呼应／交叉淡化”的完整策略。

### B. 确定性编排链路｜真实但需重做核心算法

`arrangeCompositionV1 → attachCompositionContext → Composition.events → ToneCompositionPlayer`

- 固定 BPM 88；按声音出现方式使用固定比例生成事件；以声音序号做简单错峰。
- 15／24／30 秒会改变事件分布边界，但没有自动推荐。
- 没有四段式结构、声音角色、覆盖率、最长空白、密度修复、音区平衡或固定种子实际参与算法。
- 多处修改（切换声音、循环 pattern）会重新运行 V1；儿童直接移动／复制／删除事件的路径会保留当前编排。

### C. Fun-Music 链路｜真实接口，校验不完整

`进入 /compose 自动触发 → FunMusicPolishGenerator.generate → /api/music/generate → 阿里云百炼 Fun-Music → 临时 MP3 → 独立 polishBus`

- 密钥和 endpoint 仅服务端读取；有 endpoint 白名单、访客限频、实例并发与每日限额。
- 请求明确 `is_instrumental: true`；返回值校验 URL 域名、格式元数据、时长与完成状态。
- 播放时裁到作品时长，默认背景增益为 -16 dB，并有儿童声出现时的背景闪避调度。
- 未独立检测返回音频是否含人声、突发响度或实际内容风险；临时 URL 也未转存。

### D. 千问结构化音符链路｜真实接口，作为人工选择后的 Plan B

`失败弹窗选择 Plan B → FunMusicPolishGenerator.fallback → /api/music/plan → 结构化音符 JSON → Zod 边界校验 → Tone.js 合成`

- 成功时来源标为 `symbolic_ai`，不会伪装为 Fun-Music 音频。
- Schema 校验 BPM、时长、事件数、音域、力度、声部和事件越界。
- 当前 fallback 方法会在千问请求失败、响应错误或校验异常时继续使用本地方案。

### E. 本地动态音符链路｜真实且随作品变化，保留并加强

`buildMusicPolishBrief → deriveMusicPolishDirection → buildDeterministicSymbolicPlan → Tone.js 合成`

- 方案使用情绪、音区、pattern、事件位置和声音事件生成和弦、脉冲及回应音，不是单一固定音频。
- 同一摘要可复现；不同摘要通常会改变根音、和弦顺序、密度和回应音。
- 它属于可关闭的背景层，不能替代基础儿童作品。

## 4. 成曲页主要按钮实际调用

| 按钮／自动动作 | 实际链路 | 审计判断 |
|---|---|---|
| 进入成曲页 | `prepareComposition()` → `arrangeCompositionV1()`；随后自动 `generatePolish(false)` 与作品建议请求 | 真调用；基础编曲仍是 V1 |
| 15／24／30 秒 | `setCompositionDuration()` → `resizeCompositionDuration()`，按比例移动事件起点 | 真调用；无推荐、无结构重排 |
| 主播放键 | `playComposition()` → `LazyToneCompositionPlayer` → `ToneCompositionPlayer` | 真播放儿童原声和可选背景 |
| 有背景／无背景 | `togglePolish()` → 调整独立 `polishBus` | 真分轨切换，不改变儿童事件 |
| 重新生成 AI 背景 | `generatePolish(false)` → Fun-Music | 真接口；失败进入选择弹窗 |
| 重试音乐模型 | 再次 `generatePolish(false)` | 真重试 |
| Plan B 智能音符 | `generatePolish(true)` → 千问；失败自动本地动态音符 | 真降级 |
| 只听儿童声音 | 关闭失败弹窗并保留无背景基础作品 | 真降级，不阻塞保存 |
| 保存这首作品 | `saveWork()` → 追加归档 → `DexieDemoRepository.save()` | 真保存；第三方临时背景仍可能过期 |

## 5. 保留／修正／重做

### 保留

- 领域类型和 Zod schema 边界。
- 原声资产不可变引用与用户录音 IndexedDB 存储。
- Tone.js 播放器、原声／背景双总线、事件级高亮和基础背景闪避。
- Fun-Music、千问、确定性本地音符三层来源区分。
- IndexedDB 分表、内存降级、累计归档和保存时固化教学建议。
- 儿童直接移动、复制、删除事件时的“保留儿童编排”原则。

### 修正

- 默认测试脚本的构建可复现性或其环境说明。
- 页面时长文案改为“小小乐段／完整乐段／声音故事”和“约”。
- 最终时间线必须由同一领域结果驱动声谱、播放、背景与归档。
- Fun-Music 音频时长、响度、过期和风险校验；不能把 `provider-request-only` 说成已完成人声检查。
- 背景生成失败原因、降级路径、输入摘要哈希和版本随归档持久化。
- 部署产物增加 commit/version 标识，才能证明线上版本对应仓库提交。

### 重做核心算法（不推倒页面和基础设施）

- 用编曲 V2 替换 `arrangeCompositionV1` 的固定比例铺点逻辑。
- 新增素材驱动的 15／24／30 秒推荐。
- 建立开头／发展／主要变化／收束结构，以及开／中／结自然声覆盖。
- 检测并修复长时间空白、完全重叠、过密和音区失衡。
- 让种子真正参与可复现变化，同时不覆盖儿童手动编辑。

## 6. 最小审计样本

现有仓库音频足以建立第一轮基线，不需要新增素材：

1. 单个短声：牛，1.254 秒。
2. 三个混合声：牛 1.254 秒、苹果落地 3.657 秒、风 18.991 秒。
3. 多个长短不一声音：牛 1.254 秒、苹果落地 3.657 秒、自行车 5.669 秒、风 18.991 秒、树林鸟叫 59.455 秒。

当前自动测试主要验证结构和边界，尚未把这三组样本作为 15／24／30 秒的统一听感／覆盖矩阵。Phase 01 应先把它们固化为领域测试夹具，再实现时长推荐和覆盖规则。

## 7. Phase 00 阶段门判断

- 已完成：资料与代码核对、Git/远程基线、公开地址可用性、五条链路、真实／临时／演示边界、按钮调用表、保留／修正／重做清单、最小样本定义。
- 部分完成：基础测试与替代构建可重复通过。
- 未完全满足：默认 `npm test` 在当前环境不可通过；线上部署与 commit SHA 无法精确对应。

建议：允许进入 Phase 01，但把“测试脚本可复现”和“部署版本可识别”列为阶段 06 前必须关闭的基线债务；Phase 01 不应被这两项阻塞。
