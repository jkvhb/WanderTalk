# Phase 4e 设计：展示页编排动效（动效词汇表 + LLM 配参）

日期：2026-07-05　状态：架构三决策已由用户拍板（词汇表路线 / 每节点按讲解文本个性化 / LLM 输出 JSON 不输出代码）
前置：Phase 4d 自动配图已完成（每个节点最多 3 张图可用）。用户意象："图片像小孩子坐不住乱动，但又有一定的秩序"。

## 目标

到站展示页的图片不再静态铺底，而是**有节奏地编排运动**：错峰入场、缓慢漂移、随讲解推进切换焦点——每个节点的动效由 LLM 依据该节点讲解文本个性化配置（如叙事舒缓段=慢漂移、感叹亮点段=明快弹入+强调脉冲）。

## 架构铁律

1. **LLM 只输出受限 JSON 配置，绝不输出代码/CSS**——词汇表（预设集）是我们写死的参数化确定性动画，LLM 的工作 = 选词 + 调参 + 分相位。
2. **确定性**：同一配置+同一 seed（旁白文本哈希）每次播放动效完全一致（将来导出视频不跑偏）。
3. **兜底**：LLM 失败/配置非法 → `normalizeChoreography` 清洗 → 仍不可用则 `defaultChoreography`（均分相位、中速），展示页永不因动效缺失而坏。
4. 只用 GPU 合成属性（transform/opacity），不碰布局属性；卡片 pointer-events:none；整体仍在圆形揭幕 clip 之下。

## 配置契约（LLM 输出，客户端 normalize 后存节点）

```json
{ "results": [ {
  "index": 0,
  "tempo": "calm" | "medium" | "lively",
  "phases": [ { "at": 0.0, "focus": 0, "accent": "none" | "pulse" } ],
  "idle": { "drift": 0.5, "breathe": 0.3 }
} ] }
```

- `phases`：`at` 为旁白进度比例（升序、首个必须 0），`focus` 为焦点图片下标；LLM 依文本结构分相位（开场/描述/收尾）。
- `normalizeChoreography(raw, imageCount)`：clamp 全部数值、focus 越界取模、at 排序去重且首个置 0、tempo 非法取 medium、缺字段补默认；`defaultChoreography(imageCount)`：medium、相位均分、drift/breathe 0.4/0.3。

## 词汇表 v1（`src/utils/choreography.js`，全参数化+seed 确定性）

| 预设 | 作用 | 参数源 |
|---|---|---|
| `scatterLayout` | ≥2 张图：卡片在画面**中上/右侧安全区**散落基位（避开左下文字块与底部控件），带 seed 抖动的位置/旋转 | seed |
| `staggerIn` | 入场：卡片按序错峰滑入+淡入 | tempo→间隔/时长 |
| `driftFloat` | 待机：缓慢平移+微旋转往返 | idle.drift→振幅，tempo→周期，seed→相位差 |
| `breathe` | 待机：缩放呼吸 | idle.breathe→振幅 |
| `focusSwitch` | 相位切换：焦点卡放大上浮（scale~1.15、z 顶层、全亮），非焦点卡退后微暗 | phases |
| `pulseAccent` | 相位切换瞬间焦点卡短促强调（一次性小弹跳） | accent==='pulse' |

- `compileChoreography(config, { imageCount, seed })` 纯函数 → 每张卡的 `{ base:{xPct,yPct,rotDeg,z}, drift:{dxPct,dyPct,dRotDeg,periodS,delayS}, breathe:{amp,periodS}, enter:{delayS,durS} }` + 相位表。seed=`hashString(旁白文本)`，配 `mulberry32` 伪随机（新增 `src/utils/rand.js`，纯函数可测）。
- 1 张图：不散落，全屏铺底仅 `breathe` 微呼吸（尊重此前"撤 Ken Burns"的反馈，幅度≤2%）。
- 0 张图：文字版不动效。

## 播放期驱动

- `sampleAt` 的 `showcase` 增加 **`narrationFrac`**：`clamp01((tc - audioStart) / audioDuration)`（audioDuration 0 → 0）——纯函数改动+单测。
- 组件：待机动效走 CSS animation（compile 给定 duration/delay，自走不占 JS 帧）；焦点切换由 `narrationFrac` 对照相位表响应式驱动（class 切换+transition）。有编排配置时隐藏右侧缩略图列（卡片本身就是图）；无配置节点回落现状（静态铺底+缩略图）。

## 生成与存储

- 后端 `POST /api/choreography`：镜像 `/api/imageQuery` 模式，DeepSeek 一次批量：入参 `{ nodes: [{ index, narration(去 SSML,截断~300字), imageCount }] }` → 上述 JSON；系统提示词内嵌词汇表语义说明（与前端 choreography.js 的词汇表人工保持同步，文件头注释互相指路）。
- studio store `choreoJob`（对齐 imageJob）：收集"有旁白且 ≥1 张图"的节点 → 批量生成 → normalize → `trip.setChoreography(dayNumber, index, { config, narrationHash })`；**按 narrationHash 幂等**（旁白没改的节点跳过）；进度/错误进任务态。
- UI：视频工作室侧栏「AI 编排动效」按钮 + 三态文案，对齐自动配图块。

## 测试策略

- 纯函数全测：`rand`（同 seed 同序列）、`normalizeChoreography`（非法/越界/缺字段/排序）、`defaultChoreography`、`compileChoreography`（确定性=同入参同输出、卡片数、安全区边界、1 图分支）、`sampleAt.narrationFrac`（窗口前 0/窗口中比例/窗口后 1）。
- server：`/api/choreography` 解析与防御（mock fetch，对齐 imageQuery 测试）。
- store：choreoJob 幂等（hash 同跳过）、进度、错误不炸（mock api）。
- 展示页视觉：浏览器手测。

## 不做（本期）

逐句节拍同步（edge-tts 词级时间戳，V2 连带逐句字幕）、文字块动效、卡片交互（点击放大等）、导出渲染器对 CSS 待机动画的逐帧重放（导出阶段再统一处理）。
