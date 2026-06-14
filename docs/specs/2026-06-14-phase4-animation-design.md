# Phase 4 设计：旁白驱动的飞行动画（MVP）

> 状态：已评审通过，待落实现计划（writing-plans）。
> 关联：PRD v2「十、分阶段开发计划 · Phase 4 动画引擎」。PRD_v2.html 保留原貌，对 PRD 的偏差见末尾。

## 目标

在【视频工作室】里点"预览"，看到一段**与旁白同步的飞行动画**：相机沿路线飞行，在每个有旁白的节点**停留并播报该段语音**，同时浮现**信息卡 + 图片轮播**作为视觉重心；带片头片尾、全程数据、实时海拔；可播放/暂停/拖进度。

这是产品的核心价值（旁白↔动画高度同步）。MVP 用**确定性的音频时长**驱动节奏，不依赖模型"理解节奏"。

## 已定关键决策

1. **渲染**：MapLibre GL JS + **天地图**栅格瓦片（WGS-84，与路线零偏移；国内访问快；canvas 利于 Phase 5 录制）。设置页新增天地图 key。
2. **同步机制（MVP）**：每个有旁白的节点 = **飞行段**（固定时长 ~2.5s，相机沿路线缓动移动）+ **停留段**（时长 = 该段旁白音频时长，音频在停留时播放）。"路上段+到达段"分拍是第二步，架构预留。
3. **解耦**：动画核心（缓动 / 时间轴 / 采样 / 播放器状态）与地图引擎无关、可单测；MapLibre 适配器很薄。
4. **节点信息卡**（停留时浮现）：节点名 + 海拔 + 地址 + 可选备注 + **图片轮播（Ken Burns 缓动）**。图片按节点上传、存 IndexedDB（上传压缩），节点存图片 id。
5. **片头片尾 + 全程数据**：开场标题卡、结尾总里程/天数（复用 Phase 2 的距离/时长）。
6. **实时海拔指示**：飞行中显示当前海拔。
7. **画幅**：默认 16:9（9:16 竖屏作后续）。
8. **前置**：节点旁白需先"批量合成"（时间轴依赖音频时长，取自 `audioCache`）。

## 架构与文件

### 动画核心（纯逻辑，可单测）

- `src/utils/easing.js`：`easeInOutCubic(t)` 等缓动函数。
- `src/utils/geo.js`：`pointAlongPath(path, frac)` —— 按弧长在 WGS-84 折线上取插值点；`pathLength(path)`。
- `src/utils/flightTimeline.js`：
  - `buildFlightTimeline(stops, opts)` → `{ totalDuration, scenes[] }`。`stops` = 有序的有旁白节点，每项 `{ node:{lng,lat,name,altitude,address,note,images[]}, audioDuration, routeToHere:[[lng,lat]...] }`。scenes 含 intro / 每节点的 fly+dwell / outro。
  - `sampleAt(timeline, t)` → `{ phase:'intro'|'fly'|'dwell'|'outro', camera:{lng,lat,zoom,pitch}, activeStopIndex, audio:{stopIndex,playing}, card:{visible,stop,imageIndex}, altitude, overlay:{kind,title,stats} }`。
  - fly：相机中心沿 `routeToHere` 按 `easeInOutCubic(progress)` 走，zoom/pitch 固定。dwell：相机大致保持（可轻微推近），`imageIndex` 在停留时长内按图片数均分切换。
  - 这是同步的"心脏"，全部纯函数、重点单测。

### 地图适配器（薄，浏览器）

- `src/composables/useMapLibre.js`：用天地图栅格源建 MapLibre 地图（影像 `img` + 中文注记 `cia` 两层，WMTS，带 tk=天地图key）；`setCamera({center,zoom,pitch})` 用 `map.jumpTo`（逐帧驱动，非 flyTo）；绘制路线折线。

  天地图瓦片 URL（Web Mercator，子域 t0~t7）：
  `https://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=KEY`（注记层 LAYER=cia）。

### 播放器（Pinia store）

- `src/stores/flight.js`：
  - `buildFromPlan()`：收集有旁白节点 → 查 `audioCache`（`audioKey(narration,voice,rate)`）拿音频 Blob 与时长 → 取每段路线折线（trip.plan 各天 `segments[].path`，无则相邻节点直线）→ `buildFlightTimeline`。缺音频的节点 → 标记 `needsSynth`。
  - rAF 循环：按 `dt * speed` 推进 `t` → `sampleAt` → 调适配器 `setCamera` + 音频播放（进入某节点 dwell 时播该段音频、离开停止）+ 暴露 card/altitude/overlay 给组件。
  - `play() / pause() / seek(t) / setSpeed()`。
  - 可单测：用假时钟推进 + mock 适配器/音频，验证 t 推进、相机/卡片/音频状态切换、seek。

### 组件 / 视图

- `src/components/FlightPlayer.vue`：16:9 画布容器 = MapLibre 地图 + 叠加层（信息卡含 Ken Burns 轮播、海拔 HUD、片头/片尾卡、控件 ▶/⏸ + 进度条 + 时间）。读 flight store。
- `src/components/NarrationDayCard.vue`：每节点加"**图片**"区（上传多图/缩略图/删除/排序）+ 备注框。
- `src/views/StudioView.vue`：主区由占位换成 `FlightPlayer`；"▶ 预览飞行动画"入口（未合成时提示先合成）。
- `src/views/SettingsView.vue` + `stores/settings.js`：加"天地图 key"。

### 数据 & 存储

- trip store `normalizeDay`：节点加 `note: w.note ?? ''`、`images: w.images ?? []`。actions：`setNote`、`addImage`、`removeImage`、`reorderImages`（或 `setImages`）。
- `src/utils/db.js`：升级 DB_VERSION→3，新增 `images` store；`getImage(id)`/`putImage(id,entry)`/`deleteImage(id)`。
- `src/utils/image.js`：`downscaleImage(file, maxEdge=1280)`（canvas 压缩，浏览器，手动验）+ `newImageId()`（可单测）。
- 依赖：`maplibre-gl`（npm）。

## 数据流

1. 路线（有旁白节点）+ `audioCache` 时长 + 路线折线 → `buildFlightTimeline()` → 时间轴。
2. 播放器 rAF：`t` 推进 → `sampleAt(t)` → 相机（适配器 `setCamera`）+ 音频 + 卡片/海拔/片头尾。
3. 进度条 = `seek(t)`；▶/⏸ 开关 rAF。

## 坐标

路线 WGS-84、天地图 WGS-84 → MapLibre 直接用，**零转换**（与现有高德 PlannerView 的 GCJ-02 转换互不影响，两套地图独立）。

## 错误处理

- 未配置天地图 key → FlightPlayer 提示去设置页。
- 节点未合成（无音频时长）→ 提示"请先在旁白工作台批量合成"，不进入播放。
- 瓦片加载失败/超时 → 复用 Phase 3 的可见提示思路（提示网络/VPN/key）。

## 测试策略

- 纯逻辑单测（Vitest）：`easing`、`geo.pointAlongPath/pathLength`、`flightTimeline.buildFlightTimeline/sampleAt`（多个 t 断言相位/相机/活动节点/图片索引）、`flight` store（假时钟 + mock 适配器/音频）、`image.newImageId`、trip store（note/images 归一化与 actions）、db `images` 读写（fake-indexeddb）、settings 天地图 key。
- 手动验证：MapLibre 渲染、相机飞行手感、卡片/轮播/Ken Burns、海拔 HUD、片头尾。

## 范围边界

- **MVP（本期）**：MapLibre+天地图 16:9、到点停留式同步、信息卡+图片轮播(Ken Burns)、海拔 HUD、片头尾+全程数据、播放/暂停/进度、图片上传存储。
- **第二步 / 打磨**：路上段+到达段分拍、BGM、9:16 竖屏、移动车标、天地图地形图层。
- **Phase 5**：视频导出（captureStream → WebM）。MVP 的解耦架构 + MapLibre canvas 为此铺路。

## 对 PRD v2 的调整（偏差记录，供复盘）

PRD_v2.html 保留原貌，偏差仅记于此与 CHANGELOG：

1. **瓦片源用天地图**（WGS-84），替代 PRD「高德免费瓦片（WGS-84 直接用）」——高德瓦片实为 GCJ-02 偏移，与 WGS-84 路线在 MapLibre 中对不齐；天地图为 WGS-84、国内快、零偏移。
2. **文字叠加层升级为"节点信息卡 + 图片轮播(Ken Burns)"**：PRD 原为「地名/海拔渐入渐出」，本设计扩成可上传图片的信息卡作为画面视觉重心（节点图片上传/存储是对 Phase 3 的补漏）。
3. **同步机制 MVP 用"到点停留式"**（确定性按音频时长）；PRD「旁白驱动时间轴」的"路上段+到达段"分拍作为第二步。
4. **新增片头片尾 + 全程数据卡、实时海拔 HUD**（PRD 未明列，属成片质感增强）。
