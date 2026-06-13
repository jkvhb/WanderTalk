# Phase 3 设计：旁白生成与语音合成

> 状态：已评审通过，待落实现计划（writing-plans）。
> 关联：PRD v2「十、分阶段开发计划 · Phase 3」。PRD_v2.html 保留原貌不改，本阶段对 PRD 的偏差记录见末尾「对 PRD v2 的调整」一节。

## 目标

为路书的关键节点编写讲解旁白、合成自然中文语音，并记录每段音频时长——为 Phase 4「旁白驱动的飞行动画」提供输入。

本阶段产出：**旁白文本 + 合成音频 + 锚定到节点的时长数据**。不包含动画本身。

**核心约束（来自用户）**：产品命根子是「讲解语音与飞行动画高度同步」——话少则快速飞向下一节点，话多则放慢飞行或在被讲解节点多停留。该同步动画在 Phase 4 实现，但要求 Phase 3 的数据模型必须把旁白锚定到节点、并记录每段音频时长，作为交给 Phase 4 的桥。

## 架构

纯前端 SPA + 新增**薄后端（BFF）**。

- 前端：Vue 3 + Pinia + IndexedDB（沿用现有栈）。
- 后端：`server/`，Express，两个端点，**服务器端不持有任何长期密钥**：
  - `POST /api/tts`：入参 `{ text | ssml, voice, rate }` → Node edge-tts 合成 → 返回 `{ audioBase64(mp3), duration(秒), wordBoundaries? }`。edge-tts 免费、无需 Key。
  - `POST /api/narration`：入参 `{ apiKey, model?, items:[{ nodeName, dayNumber, context... }] }` → 以 OpenAI 兼容协议调用 DeepSeek → 返回每个节点的旁白草稿（SSML）。apiKey 由前端按请求携带。
- 开发期：Vite `server.proxy` 把 `/api` 转发到后端（默认 `http://localhost:8787`），消除 CORS；根 `package.json` 用 `concurrently` 让 `npm run dev` 同时起前端 + 后端。
- 生产期（个人版）：`npm run build` 出静态前端，后端 `node server` 本地单独运行即可。

## 数据模型

- 旁白锚定到**节点（waypoint）**：`waypoint.narration: string`（SSML 或纯文本，可空）。有旁白的节点 = 动画停下讲解处；空 = 一带而过。
- 全局音色/语速存路书：`plan.voice`（默认 `'xiaoxiao'`）、`plan.rate`（默认 `1.0`，范围 `0.5`~`2.0`）。
- 音频缓存：IndexedDB 新增 object store `audioCache`，key = `hash(text + voice + rate)`，value = `{ blob, duration, mime, createdAt }`。改文案 / 换音色 / 调速 → key 变 → 重新合成；命中则秒回。
- 时长来源：优先用后端 edge-tts 返回的 `duration`；前端兜底用 `Audio.loadedmetadata` 或 `decodeAudioData` 实测。

音色与语速映射（edge-tts）：

| slug | 中文名 | edge-tts voice |
| --- | --- | --- |
| xiaoxiao | 晓晓 | zh-CN-XiaoxiaoNeural |
| yunxi | 云希 | zh-CN-YunxiNeural |
| xiaoyi | 晓伊 | zh-CN-XiaoyiNeural |

语速 `0.5`~`2.0` → edge-tts `rate`：`1.5 → "+50%"`、`0.8 → "-20%"`、`1.0 → "+0%"`。

## TTS 适配器（前端）

`src/composables/useTts.js`：

- `synthesize({ text|ssml, voice, rate }) → Promise<{ blob, duration }>`：先查 `audioCache`，命中直接返回；否则 `POST /api/tts`，写缓存，返回。
- `VOICES` 常量：3 个音色的 slug + 中文名 + edge-tts voice id。
- `rateToPercent(rate)` 纯函数：倍率 → edge-tts 百分比字符串。
- 适配器形状预留：将来可加 Web Speech 兜底（浏览器原生，仅用于试听降级——它拿不到可保存音频）或云 TTS（公开版），上层不变。

## Studio 界面（StudioView.vue，现为空壳）

仿 PlannerView 的「侧栏 + 主区」：

- 侧栏（全局）：音色下拉、语速滑块（0.5~2.0，显示倍率）、「AI 生成全部草稿」、「批量合成」（带进度）、「加载 318 预设文案」、整体旁白时长概览。
- 主区：按天分组卡片；每天列出其节点，每个节点一行 = 节点名 + 旁白文本框（可写 SSML）+「试听」+「AI 生成本段」+ 已合成标记与时长（如 `0:18`）。
- 无路书时：提示前往「路线规划」加载/编辑路线。
- 试听：合成（或取缓存）后用 `new Audio(URL.createObjectURL(blob))` 播放。

## AI 草稿（DeepSeek）

- 前端把节点上下文（节点名、所属天、住宿地、当天距离/时长、海拔、前后节点）发给 `/api/narration`；后端带用户的 DeepSeek Key 调用。
- system prompt 约束：中文、口语化讲解、约定篇幅（控制时长）、可用 `<break>`/`<emphasis>` SSML、**不得编造不存在的事实**。
- 返回填进对应节点文本框，供用户编辑后再合成。支持「单节点生成」与「全部生成」。

## 318 预设文案

- `src/data/preset318Narration.js`：为川藏线关键节点（折多山、康定、理塘、稻城、然乌、米堆冰川、布达拉宫等）配好开箱即用的旁白文本，与 `preset318` 节点名对应。
- 「加载 318 预设文案」按节点名匹配填入。

## 批量合成 + 缓存

- 遍历有旁白的节点，逐个合成（已缓存跳过），写 `audioCache`，更新进度与时长统计。
- 失败保留已成功的，单段可重试（沿用 Phase 2「计算驾车路线」的容错风格）。

## 错误处理

- 后端不可达（`/api` 连不上）→ 明确提示「后端未启动，请用 `npm run dev` 同时启动前后端」。
- edge-tts 失败（非官方接口，可能波动）→ 可读提示 + 可重试；适配器层预留 Web Speech 降级。
- DeepSeek 报错（Key 无效 / 额度 / 网络）→ 复用类似 `amapErrorMessage` 的可读化（抽通用 `serviceErrorMessage` 或新增 `llmError`）。

## 测试策略

- 后端：rate 映射、voice 映射、narration prompt 构造、入参校验为纯函数，单测覆盖；端点用 supertest + mock（mock edge-tts 与 DeepSeek，不打真实网络）。
- 前端：TTS 适配器（mock fetch + fake-indexeddb 验缓存命中/未命中）、旁白 store actions、缓存 key 哈希、音频时长存取、DeepSeek 响应解析、预设文案按名匹配。沿用现有 Vitest（node 环境 + fake-indexeddb）。
- 地图 / 音频播放等 UI 手动验证。

## 范围边界

- **属于 Phase 3**：旁白文本编辑、语音合成、音频缓存、音频时长、AI 草稿、318 预设文案、Studio 界面、薄后端。
- **不属于 Phase 3（留 Phase 4）**：真正的飞行动画、相机关键帧、旁白驱动时间轴的可视结果、逐字字幕高亮。Phase 3 只保证这些有正确的输入数据（节点锚定的文本 + 音频 + 时长）。

## 任务拆分（writing-plans 再细化）

1. 后端骨架（Express + `/api/tts` via edge-tts）+ Vite proxy + `concurrently` dev 脚本
2. 前端 TTS 适配器 `useTts` + 测试
3. 数据模型：trip store 节点 `narration` / 全局 `voice`·`rate` + `db.js` `audioCache`（含 duration）+ 测试
4. StudioView：按天分组的节点旁白编辑器 + 音色/语速 + 试听
5. 批量合成 + 进度 + 缓存
6. `/api/narration`（DeepSeek）+ AI 草稿（单段/全部）+ 测试
7. 318 预设文案数据 + 加载
8. SSML 支持润色 + 错误处理 + CHANGELOG（含本偏差记录）

## YAGNI / 暂不做

不做多音色混排、不做逐字卡拉OK高亮（Phase 4）、不做云 TTS（公开版）、不做后端鉴权/多用户（公开版）、不做音频单独导出文件（按需再加）。

## 对 PRD v2 的调整（偏差记录，供日后复盘）

PRD_v2.html 保留原貌不改，偏差仅在本 spec 与 CHANGELOG 记录：

1. **个人版引入薄后端**：PRD 个人版定为「纯前端无后端」，后端属公开版。因纯浏览器无法稳定获取可保存的旁白音频（Web Speech API 播得出但拿不到音频数据，无法合进 Phase 5 导出视频；Edge TTS 浏览器直连受 CORS/Origin 限制），故前移一个极简后端（仅 edge-tts + LLM 代理，服务器端零长期密钥）。此即 PRD 所述「公开版」架构的提前落地，迁移成本因此清零。
2. **TTS 改为后端 edge-tts**：替代 PRD「个人版 Edge TTS 浏览器直连」。Web Speech API 由适配器预留为试听降级。
3. **LLM 选 DeepSeek**：PRD 写「Claude / 通义千问」。理由：国内可直连、便宜、OpenAI 兼容易接；后端为 OpenAI 兼容适配器，未来可换。
4. **旁白按节点锚定 + 记录音频时长**：PRD Phase 3 表述为「每段路线下方可编辑文案」，本设计明确为「按节点锚定 + 存每段音频时长」，把 PRD Phase 4「旁白驱动时间轴」的核心关系前移到 Phase 3 数据模型固定下来，确保动画配速（话短快飞 / 话长慢飞或多停留）有数据支撑。
