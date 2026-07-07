# Changelog

本项目所有重要变更记录于此。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

第四阶段续：AI 自动配图（Pixabay），V1 只改检索词不改文本。

### Added
- 视频工作室「AI 自动配图（仅无图节点）」：一键为所有无图节点各配最多 3 张 Pixabay 免费商用图片，全自动、后台静默，只看进度
- 后端 `POST /api/imageQuery`：DeepSeek 批量为无图节点生成检索词（中文名/英文名/场景描述/区域意象词兜底）+ 互证关键词
- 后端 `GET /api/images/search`：Pixabay 搜索代理，字段裁剪 + 同 q+lang 24h 内存缓存（满足 Pixabay 条款）
- 后端 `GET /api/images/fetch`：图片字节下载代理（域白名单仅 pixabay.com/cdn.pixabay.com，防 SSRF），选中图片强制下载入库（不热链，符合 Pixabay 使用条款）
- `scoreImageMatch`/`pickImages`（`src/utils/imageMatch.js`）：Pixabay 标签串与节点关键词做子串宽松互证计分，替代视觉模型判图
- 检索词降级链：中文名 → 英文名 → 场景描述 → 区域意象词，命中即止；单节点全部落空则跳过、保持文字版展示页
- `.env.example` 新增 `PIXABAY_KEY`（服务端专用，前端不可见）

### Changed
- 配图流程幂等：重跑「AI 自动配图」只处理仍无图的节点，已有图（含手动上传）不受影响

### 不做（本期，见 docs/specs/2026-07-05-phase4d-auto-images-design.md）
- 改旁白文本（"边写边搜改文本"归 Phase 5 编排层）、逐节点手动重搜按钮、LLM 逐图裁判、图片来源署名 UI

## [0.4.0] - 2026-07-05

第四阶段：旁白驱动的飞行动画（MVP 之后经 4b/4c 两轮手测迭代，以下「最终形态」为发布态）。

### Added（飞行动画·最终形态）
- 旅行段「总览+车标」：相机按段静止总览（俯视 25°、fitBounds），卡通车标沿真实路线跑、已走路段实时变色，时长随距离 clamp(km/50, 2~6s)
- 到站「圆形揭幕」：以到站点为圆心揭幕展开全屏展示页（实景照片+标题/海拔/地址/备注/旁白文本）；收圆后镜头 easeTo 平滑滑动至下一段总览（时长 min(3s, 段时长×70%)，可见的镜头平移非硬切）
- 语音窗口与揭幕对齐：盖住后开讲、收圆前留静默
- 3D 地形：AWS Terrarium 高程（免费无 key）+ setTerrain(1.4)，失败自动降级平面

### Added（基础能力·Phase 4 MVP）
- 视频工作室「▶ 预览飞行动画」：MapLibre + 天地图（WGS-84，与路线零偏移）渲染飞行动画
- 节点图片上传（压缩存 IndexedDB images store）与备注，作为展示页素材
- 片头标题卡 + 片尾全程数据（天数/总里程/讲解段数）+ 飞行段海拔 HUD
- 播放控制：播放/暂停、进度拖拽、0.5~2x 倍速
- 设置新增「天地图 key」

### Changed
- 动画核心纯函数化（easing / geo 弧长插值+累计弧长表 / flightTimeline 包围盒相机+揭幕曲线 / flightStops），与地图引擎解耦、全量单测（179）；flight store 用注入式 adapter + 假时钟单测
- 4b 的"镜头朝行进方向沿路飞"与"暗中换场"经手测否决后废弃（发卡弯甩镜/硬切突兀），演进为总览车标+可见滑动
- IndexedDB 升级 v3：新增 images store
- 视频工作室预览组件按需懒加载（MapLibre 不进首屏包）

### Fixed
- 天地图 429 QPS 限流静默降级（不再弹红色横幅）；节点标记/揭幕圆心锚定路线终点而非 POI 坐标
- MapLibre 容器黑屏根治：等容器非零尺寸再建图 + 容器用 w-full h-full（maplibre-gl.css 会覆盖 absolute）

### 与 PRD v2 的偏差（见 docs/specs/ 下 Phase 4 三份设计文档）
- 瓦片源用天地图（WGS-84）替代 PRD 的高德瓦片（高德瓦片实为 GCJ-02、与 WGS-84 路线对不齐）
- 呈现形态演进为「总览车标+圆形揭幕展示页」；卡通车标为唯一获批非写实元素
- 后续增强池：云雾转场、展示页图片编排动效、BGM、9:16 竖屏、动画导出

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
