# Phase 4d 设计：AI 自动配图（Pixabay）

日期：2026-07-05　状态：三项关键决策已由用户拍板（见 2026-07-05 会话）
前置：v0.4.0 已发布（展示页以节点图片为视觉主体，无图节点为文字版）。

## 目标

一键为**所有无图节点**自动搜配 **3 张**免费商用图片（Pixabay），全自动填入、后台静默，用户只看到"正在搜索"进度。让展示页素材供给不再依赖手动上传。

## 已拍板决策

| 决策 | 结论 |
|---|---|
| 图库 | Pixabay 官方 API（免费商用，无需署名；**禁止永久热链** → 选中图必须下载入库） |
| 闭环范围 | **V1 只改检索词不改文本**：多轮换词 → 区域意象词降级 → 仍无则文字版兜底；"边写边搜改文本"归 Phase 5 编排层 |
| 填图范围 | 只填无图节点、每点 3 张、全自动（不碰手动上传的图） |
| 图文互证 | 用 Pixabay **标签串**与节点信息互证（无标题/简介可用），不上视觉模型 |

## 架构（沿用"前端编排 + 薄后端"既有模式，同 aiJob/synthJob）

### 后端（server/，Express，key 全部只存 .env）

1. `POST /api/imageQuery`：入参 `{ nodes: [{ name, address, note }] }`（仅无图节点，一次批量）；DeepSeek 一次调用为每个节点生成
   `{ queries: [中文名, 英文名, 场景描述, 区域意象词(兜底)], keywords: [用于标签互证的中英关键词] }`。复用 `server/narration.js` 的 DeepSeek 调用模式（OpenAI 兼容、JSON 输出、防御性解析）。
2. `GET /api/images/search?q=&lang=`：Pixabay 代理（`https://pixabay.com/api/?key=$PIXABAY_KEY&q=...&lang=...&image_type=photo&orientation=horizontal&per_page=20&safesearch=true`）；只回传前端要用的字段 `{ id, tags, webformatURL, largeImageURL, pageURL }`；服务端内存缓存同一 q 24h（Pixabay 条款要求缓存）；上游 429/错误透传可读信息。
3. `GET /api/images/fetch?url=`：图片字节下载代理（浏览器直连 Pixabay CDN 可能被 CORS 拦）。**SSRF 防线：只允许 `https://pixabay.com/` 与 `https://cdn.pixabay.com/` 域**，其余 400。
- `.env` 新增 `PIXABAY_KEY`（用户自备，https://pixabay.com/api/docs/ 注册即得）；`server/README` 或 `.env.example` 有则同步。

### 匹配（纯函数，可测）

`src/utils/imageMatch.js`：
- `scoreImageMatch(tags, keywords)`：Pixabay 标签串（逗号分隔，小写化）与 keywords 的重叠计分（含子串宽松匹配，如 keyword "tibet" 命中 tag "tibetan"），返回 0~1。
- `pickImages(hits, keywords, count=3, threshold)`：按分排序取 top N（≥threshold，阈值经验值 ~0.15 起步、常量可调）；不足 N 时有多少取多少。

### 前端编排（studio store，模式对齐 aiJob/synthJob）

`imageJob { running, done, total, current, error, finishedAt }`；流程：
1. 收集无图节点（`!node.images?.length`）→ 空则提示无事可做；
2. `POST /api/imageQuery` 一次拿全部节点的 queries/keywords；
3. 逐节点：按 queries 顺序 `GET /api/images/search` → `pickImages` → 命中即止；全部 queries 落空 → 该节点跳过（保持文字版）；
4. 选中的每张：`GET /api/images/fetch` 拿 blob → 复用 `downscaleImage` 压缩 → `putImage` 入 IndexedDB（记录 `source: { provider:'pixabay', id, pageURL }`，images store 为对象存储、加字段无需升版本）→ `trip` 节点追加图片 id；
5. 进度逐节点上报（`done/total` + 当前节点名）；任务切视图不中断（store 持有，同现有约定）；完成显示"已配图 x 节点 / 跳过 y 节点"。
- 幂等：重跑仍只处理无图节点。
- UI：视频工作室侧栏新增按钮「AI 自动配图（仅无图节点）」+ 进度/完成/错误三态文案，样式对齐现有 AI 生成块。

## 测试策略

- `imageMatch` 纯函数全测：命中/子串宽松/无重叠/空标签/阈值截断/不足 3 张。
- server：`images` 端点单测（mock 全局 fetch）：search 字段裁剪与缓存、fetch 域白名单 400、imageQuery 的 DeepSeek 响应解析（对齐 `narration.test.js` 的 mock 模式）。
- store：imageJob 编排单测（mock api 层）：空节点列表、逐节点推进、单节点全落空跳过、错误进任务态不炸。
- 浏览器手测：真实 key 下整程配图、展示页出图、进度与幂等。

## 不做（本期）

改旁白文本、逐节点手动重搜按钮（整体重跑已幂等）、LLM 逐图裁判（标签计分够 V1）、图片来源署名 UI（Pixabay 无署名义务，来源已入库留痕）。
