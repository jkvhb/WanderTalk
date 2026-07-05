# Phase 4c 设计：车标总览 + 圆形揭幕（替换追车视角）

日期：2026-07-04　状态：三项关键决策已由用户拍板
前置：Phase 4b（`2026-07-03-phase4-flight-camera-design.md`）已实现；用户手测否决其飞行段呈现。

## 背景与教训

Phase 4b 的"镜头朝行进方向沿路飞"在川藏线上**结构性失败**：318 的发卡弯是公里级真实几何，平滑只能磨掉顶点锯齿磨不掉弯本身，镜头随行进方向转向 → 每个发卡弯画面甩转 180°，用户实测"抖动极其严重"。结论：追车视角方案废弃。

新方案（用户提出，2026-07-04 定稿）的核心洞察：**把抖动从相机转移到车标**——相机在总览时静止（零抖动），车标在发卡弯上扭动反而自然可爱（游戏加载条式的旅行叙事）。

## 已拍板决策

| 决策 | 结论 |
|---|---|
| 方案形态 | **方案一**：总览+车标跑路+走过变色，到站**圆形揭幕**全屏展示页承载讲解 |
| 车标风格 | **B 卡通可爱风**：明显大于路线的萌系车（用户明确放宽"零插画"底线，仅限车标这一个元素） |
| 总览视角 | **接近俯视 pitch≈25°** 先试（常量，可调）；3D 地形保持开启 |
| 展示页范围 | **MVP：照片+文字**（全屏照片暗化+标题/海拔/地址/备注/旁白文本带/缩略图）；视频/艺术字后续 |

## 分相位呈现（时间轴骨架 intro/fly/dwell/outro 不变）

### intro / outro
相机 = **全程路线包围盒**总览（pitch 25、正北），叠加现有片头/片尾字幕。比 4b 的"首节点特写"更有"即将启程"的叙事感。

### fly（旅行段）
- **相机静止**：`jumpTo` 到"当前段包围盒"（前节点→本节点的路线 ∪ 两端节点坐标，外扩 15%），pitch 25、bearing 0。整段零相机运动。
- **车标**沿**原始驾车路线**跑（`pointAlongPath(path, easeInOutCubic(p))`——用原始折线不用 smoothPath，车在发卡弯上扭动是特色不是缺陷）。
- **车标形态**：直立卡通车（SVG：圆润红车身+白描边+黑轮），~44px，**不随地图旋转/俯仰**（viewport 对齐，游戏加载条式）；按水平行进方向**左右翻转**（向西开脸朝左）。DOM Marker 实现。
- **走过变色**：当前段路线用 `lineMetrics` + `line-gradient`（`['step',['line-progress'],已走色,frac,未走色]`，每帧 `setPaintProperty`）；已完成段整段"已走色"，未来段"未走色"半透明。已走=青绿 `#5DCAA5`，未走=橙 `#ff5a36`。
- 时长沿用 `flyDurationForKm`（clamp(km/50, 2~6s)）；海拔 HUD 保留（插值显示）。

### dwell（到站讲解）
1. 车到站 → **圆形揭幕**：展示页以"路线终点的屏幕坐标"为圆心，`clip-path: circle(r at x y)` 半径 0→全屏（`wipeDuration` 默认 0.7s，easeInOutCubic）。
2. 全屏**展示页**（MVP）：全屏实景照片（`card.imageIndex` 轮播沿用、无 Ken Burns）+ 自动压暗层；左下标题+海拔 chip+地址+备注；底部旁白文本带（静态截断 2 行，逐句同步后续做）；右侧缩略图列；左上"正在讲解 · 第 x/n 站"。**无照片节点**：深色底纯文字排版（同布局去图）。
3. **语音窗口后移**：dwell 时长 = `wipeDuration + audioDuration + dwellPadding + wipeDuration`；音频在 `[wipeDuration, wipeDuration+audioDuration]` 窗口内播放（`audio.offset = tc - start - wipeDuration`，窗口外 playing=false）。
4. **相机整段不动 + 段间可见滑动**（2026-07-05 手测修订，取代原"暗中换场"设计——用户实测暗切"折痕突兀"，镜头运动必须看得见）：dwell 全程相机保持进场画面（有来路的节点=当前段包围盒；**首节点=全程包围盒**，与 intro 连续），收圆露出的仍是进场画面（车停在站点）；下一场景开始时 sceneId 变化触发 adapter 的 **`easeTo`（约 1.2s）**，镜头平滑滑动到新一段总览——车起步、镜头跟着滑走。末站讲完后 outro 触发滑动拉远到全程总览。
5. 揭幕圆心 = 该节点路线终点的屏幕投影；首节点无路线时退回节点坐标（与 4b 锚点规则一致）。
6. `revealFrac = edgeWindow(p, wipeDuration/duration)`（复用现有窗函数）。
7. 已知取舍：**连续无来路的讲解点**之间（无 fly 段），相机在揭幕盖住时切到全程总览并保持到下一个有路段——确定性优先；若实际观感突兀，后续可改为相邻两点的局部包围盒。

## sampleAt 契约 v2

```
camera:  { kind:'bounds', sceneId, bounds:[[minLng,minLat],[maxLng,maxLat]], pitch, bearing:0 }
car:     null | { lng, lat, headingDeg, frac }          // 仅 fly
progress:null | { legIndex, frac }                       // 仅 fly；dwell 输出 {legIndex, frac:1}
showcase:null | { stopIndex, imageIndex, revealFrac }    // 仅 dwell（替代原 card）
audio / altitude / overlay / phase / activeStopIndex 语义不变（audio 窗口后移见上）
```

- **adapter 扩展**：`setCamera` 识别 bounds 式相机——按 `sceneId` 记忆化 `map.cameraForBounds(bounds,{padding})`；**首个相机/resize 重取景用 `jumpTo`，场景切换用 `easeTo`（约 1.2s 可见滑动）**；新增 `setCar(car|null)`、`setProgress(progress|null)`。
- **store 微改**（4b 是零改动，本期放开）：`applySample` 增加 `adapter.setCar?.(s.car)`、`adapter.setProgress?.(s.progress)` 两行可选链透传，store 仍无语义知识；补两行单测。

## 移除 / 保留（相对 4b）

- **移除使用**：追车相机、fly 段 zoom/bearing/padding 曲线、dwell 拉近+节点偏右、左照片面板+引线+脉冲标记（被展示页整体替代）、`smoothPath` 预计算（车走原始路线）。
- **保留**：`chaikinSmooth/resampleByDistance/edgeWindow` 等纯函数（已测通用件，`edgeWindow` 直接复用于 revealFrac）、`bearingAt/lerpAngle`（车头翻转判定用 `bearingAt`）、`flyDurationForKm`、3D 地形、429/地形错误降级、黑屏修复。
- `geo.js` 新增 `boundsOfPath(path, extraPoints?)` 纯函数（含退化输入处理）。

## 文件落点

| 文件 | 改动 |
|---|---|
| `src/utils/geo.js` | +`boundsOfPath` |
| `src/utils/flightTimeline.js` | 场景预计算段包围盒；sampleAt 输出 v2 契约；DEFAULTS：`overviewPitch:25 wipeDuration:0.7 boundsPadFrac:0.15` 及配色常量 |
| `src/stores/flight.js` | applySample 两行透传 |
| `src/composables/useMapLibre.js` | bounds 相机（cameraForBounds+记忆化）、setCar（DOM Marker+翻转）、setProgress（line-gradient 分段上色）、路线层重构（当前段/已走段/未来段） |
| `src/assets/carMarker.js` | 卡通车 SVG 元素工厂（新文件） |
| `src/components/FlightPlayer.vue` | 移除面板/引线/脉冲；新增全屏展示页 + clip-path 圆形揭幕（revealFrac 驱动，圆心=路线终点 project） |

## 测试策略

- 纯函数全测：`boundsOfPath`（含单点/空）、fly 的 camera bounds/car 位置与 headingDeg/progress frac、dwell 的 revealFrac 曲线（两端 0 中间 1）、**相机换场时机**（揭幕盖住前=当前段、盖住后=下一段/末节点=全程）、**音频窗口后移**（wipe 期间 playing=false、offset 扣除 wipeDuration）、dwell 总时长公式。
- store：setCar/setProgress 透传单测（假 adapter 记录调用）。
- adapter/UI（cameraForBounds、Marker、line-gradient、clip-path）：浏览器手测。

## 风格边界（更新）

写实卫星底图不变；**卡通车标是唯一获批的非写实元素**。展示页排版遵循 2026-07-04 会话中的 mockup（黑透明层+白字，与 HUD 同族）。
