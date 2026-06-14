# Changelog

本项目所有重要变更记录于此。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.3.0] - 2026-06-14

第三阶段：旁白生成与语音合成（含 UX 修复与 AI 整程生成）。

### Added
- 视频工作室旁白工作台：节点级旁白编辑、晓晓/云希/晓伊 音色与 0.5x~2.0x 语速
- 后端 edge-tts 语音合成（`/api/tts`）+ 音频按内容缓存到 IndexedDB（含时长）
- AI 旁白草稿生成（`/api/narration` 代理 DeepSeek，OpenAI 兼容）
- 318 川藏线预设旁白文案一键填充
- 新增极简后端 `server/`（Express）与前后端联跑脚本（concurrently + Vite proxy）
- 地点搜索历史（聚焦下拉、点击复搜、逐条删除）

### Changed
- 旁白按节点锚定并记录每段音频时长，为 Phase 4「旁白驱动飞行动画」备好输入
- 批量合成 / AI 生成进度移入 store，切换视图任务不中断、进度续显；完成后显示状态、可重跑；AI 重新生成保留上一稿可一键切回
- AI 旁白改为整条路线一次性生成（带「第X天」承接、避免雷同），并存节点真实地址供模型纠偏（名称歧义如「石棉烧烤」实际在雅安）

### Fixed
- 试听/批量合成前清洗 SSML 为纯文本，修复带 `<break>`/`<emphasis>` 的文案合成空音频、试听报「no supported source」（Edge 免费朗读不支持内联 SSML）
- 三视图 `keep-alive` 保活：地图只创建一次，修复来回切换后底图空白（WebGL 上下文耗尽）
- 试听改用共享播放器：切到别段自动停上一段、可手动暂停（消除音频重叠）
- 搜索与任务状态切换视图不再丢失

### 对 PRD v2 的偏差（见 docs/specs/2026-06-13-phase3-narration-tts-design.md）
- 个人版引入薄后端；TTS 用后端 edge-tts（Web Speech 作适配器预留兜底）；LLM 用 DeepSeek；旁白按节点锚定 + 记录音频时长

## [0.2.0] - 2026-06-13

第二阶段：路线编辑与地图交互。

### Added
- GCJ-02 ↔ WGS-84 坐标转换层，数据模型统一存储 WGS-84
- 高德驾车路线计算：沿真实道路绘制、距离/时长展示、IndexedDB 缓存
- 多天路线分段编辑：增删天数、节点重命名/删除、住宿地编辑
- 节点拖拽排序：三横线手柄长按拖动（vuedraggable）
- POI 搜索结果一键添加到指定天
- 地图点击就近搜索 POI，浮窗内选天 + 按位置插入（确定/取消预览）
- 路书 IndexedDB 自动保存与启动恢复
- 路书 JSON 导出/导入

### Fixed
- POI 搜索/路径规划失败时错误信息可读化（修复显示「[object Event]」，并提示安全密钥/网络等可操作方向）

## [0.1.0] - 2026-06-07

第一阶段：项目骨架与地图基础。

### Added
- 项目初始化：Vue 3 + Vite + TailwindCSS 脚手架
- 三视图导航：路线规划 / 视频工作室 / 设置
- 设置页：高德 API Key 本地持久化
- 318 川藏线 9 天预设数据
- 高德地图显示与 POI 搜索
