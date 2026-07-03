# Phase 4b 设计：飞行相机体验优化（平滑飞行 + 3D 地形 + 节点特写构图）

日期：2026-07-03　状态：已与用户确认
前置：Phase 4 动画引擎 MVP（`2026-06-14-phase4-animation-design.md`）已实现并可播放。

## 背景与问题

用户浏览器验证 Phase 4 MVP 后反馈两个体验问题：

1. **画面全程固定 zoom（9），没有"到节点拉近详细讲解"的感觉。**
2. **飞行段相机严格贴驾车折线走**，318 多发卡弯、折线顶点密集，固定 2.5s 掠过导致画面明显抖动。

讨论中明确的方向升级：镜头朝行进方向（电影感）、3D 地形让山立起来（318 的戏在垭口/峡谷/雪山）、节点停留时"节点偏右 + 实景照片偏左 + 引线相连"的特写构图。

## 范围

**做：**
- 飞行轨迹平滑（消抖）+ 镜头朝行进方向（bearing）
- 飞行/停留双层缩放（fly 拉远 z9 ↔ dwell 拉近 z11.5，缓动过渡）
- 3D 地形（免费高程源，山体起伏）
- 节点停留特写构图：节点偏右、左侧实景照片面板、细引线相连、节点脉冲标记
- 飞行段时长随距离变化（取代固定 2.5s）

**不做（明确推迟/搁置）：**
- 云雾转场（放大时白雾遮挡再散开）——用户认可，**后续再加**
- 等轴测微缩沙盘 / 纪念碑谷风格地标——需逐地标建模 + 换投影，**搁置**
- 实景 3D 建筑——318 沿线无数据覆盖，技术栈不支持，不做
- BGM、9:16 竖屏、移动车标——仍属 Phase 4 第二步，不在本期

**风格底线（用户明确）**：地图是写实风（卫星影像），不加任何插画/卡通元素。新增视觉全部为：真实地图、用户上传的实景照片、极轻量 UI 叠加（标记/引线/面板），与现有海拔 HUD 同一风格族。

## 设计

### A. 飞行段：平滑轨迹 + 朝行进方向

**轨迹平滑**（`src/utils/geo.js` 新增纯函数）：
- `chaikinSmooth(path, iterations=2)`：Chaikin 切角平滑，保留首尾端点。选它不选 Catmull-Rom：实现简单、无过冲、对自交折线稳。
- `resampleByDistance(path, step)`：按弧长等距重采样，`step = max(pathLength/300, 200m)`，控制点数（~300 点内）并让 `pointAlongPath` 匀速推进。
- 飞行用路径 = `resampleByDistance(chaikinSmooth(原始折线))`，在 buildFlightTimeline 装配时一次性预计算存入 scene（`scene.smoothPath`），原始折线仍用于地图上画路线（贴路显示不变，只有**相机中心**走平滑线）。

**镜头朝向**（`geo.js` 新增）：
- `bearingBetween(a, b)`：两点方位角（0=北，顺时针）。
- `bearingAt(path, frac, lookaheadM=2000)`：取 frac 点与前方 lookahead 处点的方位角；近终点时 lookahead 自动缩到剩余长度。前瞻窗口本身即低通，叠加 Chaikin 后的光滑路径，过弯不甩。
- **两端归北**：`sampleAt` 对 fly 段输出 `bearing = lerpAngle(0, pathBearing, w(p))`——按**最短弧**从正北插值到路径方位（不可直接数乘角度，跨 0° 会反转），窗函数 `w(p)` 在 p∈[0,0.15] 从 0→1、p∈[0.85,1] 从 1→0（easeInOutCubic）。`lerpAngle` 落在 `geo.js` 并单测跨 0° 用例。起飞时从正北缓转向行进方向，降落前转回正北——保证 dwell 构图统一（用户确认）。

**飞行时长随距离**（`flightTimeline.js`）：
- `flyDuration(dKm) = clamp(dKm / 50, 2, 6)` 秒（100km≈2s、300km 封顶 6s），取代固定 2.5s。`opts.flyDuration` 保留为兜底（未传路径长度时用）。

### B. 3D 地形

- 高程源：**AWS Terrarium**（`https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png`，免费、全球、无需 key），`raster-dem` + `encoding: 'terrarium'`。
- `useMapLibre` 建图时加 source 并 `map.setTerrain({ source: 'dem', exaggeration: 1.4 })`（用户确认 1.4）。
- **降级**：地形源瓦片加载失败只计入诊断、不弹错误、不阻塞播放（平面照常飞）；`setTerrain` 调用包 try/catch。
- pitch 维持 60，配合地形看山。

### C. 节点停留特写构图

相机（`sampleAt` 输出扩展）：
- dwell/intro/outro：`zoom = 11.5`（温和拉近，区县级，用户确认）、`bearing = 0`、`padding = { leftFrac: 0.45 }`——语义化比例，adapter 换算为像素 `padding.left = 容器宽 × 0.45` 传给 `jumpTo`，效果即节点位于画面右侧约 70% 处。
- intro 相机与首个 dwell 完全一致（首节点通常无 fly 段，避免 z9→z11.5 突跳）；outro 同理对齐末节点 dwell。
- fly 段两端过渡：`zoom(p)` 与 `padding(p)` 用与 bearing 相同的窗函数在 dwellZoom↔flyZoom（11.5↔9）、0.45↔0 间缓动，全程无跳变。

UI（`FlightPlayer.vue`）：
- **左侧照片面板**：替换现有左下信息卡位置样式，改为左侧垂直居中面板（约 1/3 宽），内容不变：用户上传实景照片（Ken Burns）+ 节点名/海拔/地址/备注。无照片时只显文字卡（不放占位插画）。
- **引线**：SVG 叠加层，从面板右缘中点连到节点屏幕坐标（`map.project(node)`）。dwell 相机静止，project 在 dwell 进入时算一次 + 监听容器 resize 更新即可。细线（1.5px、半透明白），端点小圆点。
- **节点脉冲标记**：dwell 期间节点处 CSS 脉冲圆环（半透明青绿），与写实底图对比克制。
- fly 期间面板/引线/标记隐藏（与现状一致：卡片仅 dwell 可见）。

### 相机接口扩展

`sampleAt` 返回的 `camera` 从 `{lng,lat,zoom,pitch}` 扩展为 `{lng,lat,zoom,pitch,bearing,padding}`；`useMapLibre.setCamera` 透传 bearing 并换算 padding。flight store 不感知这些字段含义（原样透传 adapter），**store 不改**。

## 文件落点

| 文件 | 改动 |
|---|---|
| `src/utils/geo.js` | +`chaikinSmooth` `resampleByDistance` `bearingBetween` `bearingAt` |
| `src/utils/easing.js` | +窗函数 `edgeWindow(p, edge=0.15)`（两端 0 中间 1） |
| `src/utils/flightTimeline.js` | fly 场景预计算 smoothPath 与距离时长；sampleAt 输出 zoom/bearing/padding 曲线；DEFAULTS 增 `flyZoom:9 dwellZoom:11.5 padLeftFrac:0.45` |
| `src/composables/useMapLibre.js` | setCamera 支持 bearing/padding；terrain 装配 + 降级 |
| `src/components/FlightPlayer.vue` | 左侧照片面板、引线 SVG、脉冲标记 |

## 测试策略

沿用"纯函数核心全量单测、地图引擎手测"的既有约定：
- `chaikinSmooth`：端点不变、顶点数按迭代增长、共线输入输出仍共线
- `resampleByDistance`：相邻点距≈step、首尾保持、总长近似不变
- `bearingBetween/bearingAt`：正北/正东已知值、前瞻越过终点不越界
- `edgeWindow`：p=0/1 → 0，p=0.5 → 1，单调段单调
- `sampleAt`：dwell 相机含 zoom11.5/bearing0/padding；fly 中段 zoom≈9、bearing≈路径方位；fly 两端与相邻 dwell 相机连续（差值 < ε）
- `buildFlightTimeline`：fly 时长 = clamp(d/50,2,6)；scene.smoothPath 存在且端点对齐原折线
- terrain/引线/面板：浏览器手动验证（黑屏教训：容器尺寸、`w-full h-full`）

## 决策记录

- 镜头朝行进方向（非正北锁定）——用户选择，接受转向平滑成本
- 缩放温和档 z9↔z11.5——用户对"街道级会糊+无 3D 数据"的评估认可后选定
- 到点 bearing 归北、飞行时长 clamp(d/50,2,6)、地形夸张 1.4——用户确认三默认值
- 停留构图"节点偏右+照片偏左+引线"确认保留（澄清了示意草图画风≠产品风格的误会）
- 云雾转场：后续增强，不入本期
