# Phase 4b 飞行相机体验优化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 飞行动画消抖（Chaikin 平滑轨迹）+ 镜头朝行进方向（bearing 两端归北）+ 双层缩放（fly z9 ↔ dwell z11.5）+ 3D 地形（Terrarium, exaggeration 1.4）+ 节点特写构图（节点偏右 / 左照片面板 / 引线 / 脉冲标记）+ 飞行时长随距离。

**Architecture:** 全部相机逻辑落在纯函数层（`easing.js` / `geo.js` / `flightTimeline.js`，vitest 全覆盖）；`sampleAt` 输出的 camera 扩展为 `{lng,lat,zoom,pitch,bearing,padding:{leftFrac}}`，flight store **零改动**原样透传；`useMapLibre` 负责把 leftFrac 换算像素、透传 bearing、装配地形并暴露 `project()`；`FlightPlayer.vue` 只做 UI（面板/引线/标记）。

**Tech Stack:** Vue3 + Pinia + MapLibre GL JS + 天地图栅格 + AWS Terrarium raster-dem + vitest。

**Spec:** `docs/specs/2026-07-03-phase4-flight-camera-design.md`（已获用户批准）

## 项目约定（执行者必读）

- Windows；npm 命令走 PowerShell：`D:\node.exe D:\node_modules\npm\bin\npm-cli.js test -- --run`（可加测试文件路径过滤）。下文简写 `npm test -- --run`。
- 测试与源码同目录（`src/utils/geo.js` ↔ `src/utils/geo.test.js`），vitest，`it()` 描述用中文。
- 每任务一次 commit，信息末尾带 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`（多行消息用 PowerShell here-string `@'...'@`，结束符顶格）。
- `useMapLibre.js` / `FlightPlayer.vue` **无单测**（依赖真实 WebGL/DOM），验证方式 = 全量测试仍绿 + `npm run build` 成功 + 末尾手测清单。
- **风格底线：写实。不加任何插画/卡通元素**；新 UI 叠加与现有海拔 HUD 同风格（黑半透明、白字、细线）。

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/utils/easing.js` | 缓动纯函数 | +`edgeWindow` |
| `src/utils/geo.js` | 地理纯函数 | +`chaikinSmooth` `resampleByDistance` `bearingBetween` `bearingAt` `lerpAngle` |
| `src/utils/flightTimeline.js` | 时间轴装配与采样 | fly 时长随距离、scene.smoothPath 预计算、sampleAt 相机曲线 |
| `src/composables/useMapLibre.js` | 地图适配器 | setCamera 支持 bearing/padding、+`project()`、+3D 地形（降级） |
| `src/components/FlightPlayer.vue` | 播放器 UI | 左侧照片面板、引线 SVG、脉冲标记 |
| `CHANGELOG.md` | 记录 | Unreleased 加 Phase 4b 条目 |

---

### Task 1: `edgeWindow` 窗函数（easing.js）

**Files:**
- Modify: `src/utils/easing.js`
- Test: `src/utils/easing.test.js`

- [ ] **Step 1: 写失败测试**（追加到 `src/utils/easing.test.js` 末尾）

```js
import { edgeWindow } from './easing' // 并入文件顶部现有 import：{ clamp01, easeInOutCubic, edgeWindow }

describe('edgeWindow', () => {
  it('两端为 0，中段平台为 1', () => {
    expect(edgeWindow(0)).toBe(0)
    expect(edgeWindow(1)).toBe(0)
    expect(edgeWindow(0.5)).toBe(1)
    expect(edgeWindow(0.15)).toBe(1)
    expect(edgeWindow(0.85)).toBe(1)
  })
  it('上升沿/下降沿单调且经过中点 0.5', () => {
    expect(edgeWindow(0.075)).toBeCloseTo(0.5, 6) // easeInOutCubic(0.5)=0.5
    expect(edgeWindow(0.925)).toBeCloseTo(0.5, 6)
    expect(edgeWindow(0.03)).toBeLessThan(edgeWindow(0.06))
    expect(edgeWindow(0.94)).toBeGreaterThan(edgeWindow(0.97))
  })
  it('edge 可配；越界输入被夹住', () => {
    expect(edgeWindow(0.2, 0.4)).toBeCloseTo(easeInOutCubic(0.5), 6)
    expect(edgeWindow(-1)).toBe(0)
    expect(edgeWindow(2)).toBe(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- --run src/utils/easing.test.js`
Expected: FAIL（`edgeWindow` 未导出）

- [ ] **Step 3: 最小实现**（追加到 `src/utils/easing.js`）

```js
// 两端归零窗：p∈[0,edge] 缓升 0→1，中段恒 1，p∈[1-edge,1] 缓降 1→0。
// 用于 fly 段两端与 dwell 相机（zoom/bearing/padding）的无缝衔接。
export function edgeWindow(p, edge = 0.15) {
  const x = clamp01(p)
  if (x < edge) return easeInOutCubic(x / edge)
  if (x > 1 - edge) return easeInOutCubic((1 - x) / edge)
  return 1
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- --run src/utils/easing.test.js`
Expected: PASS（全部）

- [ ] **Step 5: Commit**

```powershell
git add src/utils/easing.js src/utils/easing.test.js
git commit -m @'
feat(flight): edgeWindow 两端归零窗函数（fly 段相机衔接用）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

### Task 2: `chaikinSmooth` 切角平滑（geo.js）

**Files:**
- Modify: `src/utils/geo.js`
- Test: `src/utils/geo.test.js`

- [ ] **Step 1: 写失败测试**（追加到 `src/utils/geo.test.js`；import 行并入 `chaikinSmooth`）

```js
describe('chaikinSmooth', () => {
  it('首尾端点不变', () => {
    const out = chaikinSmooth([[0, 0], [1, 0], [1, 1]], 2)
    expect(out[0]).toEqual([0, 0])
    expect(out.at(-1)).toEqual([1, 1])
  })
  it('顶点数按迭代增长：3 点 1 次迭代 → 6 点', () => {
    expect(chaikinSmooth([[0, 0], [1, 0], [1, 1]], 1)).toHaveLength(6)
  })
  it('切掉尖角：原拐点 [1,0] 不再出现', () => {
    const out = chaikinSmooth([[0, 0], [1, 0], [1, 1]], 1)
    expect(out.some(([x, y]) => x === 1 && y === 0)).toBe(false)
  })
  it('共线输入输出仍共线（lat 全 0）', () => {
    const out = chaikinSmooth([[0, 0], [0.5, 0], [1, 0]], 2)
    out.forEach(([, lat]) => expect(lat).toBe(0))
  })
  it('少于 3 点原样返回副本', () => {
    const p = [[0, 0], [1, 0]]
    const out = chaikinSmooth(p, 2)
    expect(out).toEqual(p)
    expect(out).not.toBe(p)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- --run src/utils/geo.test.js`
Expected: FAIL（`chaikinSmooth` 未导出）

- [ ] **Step 3: 最小实现**（追加到 `src/utils/geo.js`）

```js
// Chaikin 切角平滑：每条边取 1/4、3/4 两点替代原顶点，保留首尾端点。
// 相机中心走它而非原始驾车折线，消除发卡弯逐顶点抖动。经纬度小范围内线性插值足够。
export function chaikinSmooth(path, iterations = 2) {
  if (!path || path.length < 3) return path ? [...path] : []
  let pts = path
  for (let k = 0; k < iterations; k++) {
    const out = [pts[0]]
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i]
      const [bx, by] = pts[i + 1]
      out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25])
      out.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75])
    }
    out.push(pts[pts.length - 1])
    pts = out
  }
  return pts
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- --run src/utils/geo.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add src/utils/geo.js src/utils/geo.test.js
git commit -m @'
feat(flight): chaikinSmooth 切角平滑（相机轨迹消抖）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

### Task 3: `resampleByDistance` 等距重采样（geo.js）

**Files:**
- Modify: `src/utils/geo.js`
- Test: `src/utils/geo.test.js`

- [ ] **Step 1: 写失败测试**（追加；import 并入 `resampleByDistance`）

```js
describe('resampleByDistance', () => {
  it('相邻点距≈step、首尾保持', () => {
    const step = 11119 // ≈0.1 度经度
    const out = resampleByDistance([[0, 0], [1, 0]], step)
    expect(out[0]).toEqual([0, 0])
    expect(out.at(-1)).toEqual([1, 0])
    for (let i = 1; i < out.length; i++) {
      const d = haversine(out[i - 1], out[i])
      expect(Math.abs(d - step) / step).toBeLessThan(0.02)
    }
  })
  it('总长近似不变（±1%）', () => {
    const path = [[0, 0], [0.5, 0.2], [1, 0]]
    const out = resampleByDistance(path, 5000)
    expect(Math.abs(pathLength(out) - pathLength(path)) / pathLength(path)).toBeLessThan(0.01)
  })
  it('退化输入：少于 2 点或 step 非正 → 原样副本', () => {
    expect(resampleByDistance([[1, 2]], 100)).toEqual([[1, 2]])
    expect(resampleByDistance([[0, 0], [1, 0]], 0)).toEqual([[0, 0], [1, 0]])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- --run src/utils/geo.test.js`
Expected: FAIL（`resampleByDistance` 未导出）

- [ ] **Step 3: 最小实现**（追加到 `src/utils/geo.js`）

```js
// 按弧长等距重采样：输出相邻点距≈step 的折线，首尾保持。
// 目的：控制点数（性能）并让 pointAlongPath 的 frac 推进对应匀速前进。
export function resampleByDistance(path, step) {
  if (!path || path.length < 2 || !(step > 0)) return path ? [...path] : []
  const total = pathLength(path)
  if (total === 0) return [path[0], path[path.length - 1]]
  const n = Math.max(1, Math.round(total / step))
  const out = []
  for (let i = 0; i <= n; i++) out.push(pointAlongPath(path, i / n))
  return out
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- --run src/utils/geo.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add src/utils/geo.js src/utils/geo.test.js
git commit -m @'
feat(flight): resampleByDistance 弧长等距重采样

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

### Task 4: 方位角三件套 `bearingBetween` / `bearingAt` / `lerpAngle`（geo.js）

**Files:**
- Modify: `src/utils/geo.js`
- Test: `src/utils/geo.test.js`

- [ ] **Step 1: 写失败测试**（追加；import 并入三个新函数）

```js
describe('bearingBetween', () => {
  it('正北 0°、正东 90°、正南 180°、正西 270°', () => {
    expect(bearingBetween([0, 0], [0, 1])).toBeCloseTo(0, 4)
    expect(bearingBetween([0, 0], [1, 0])).toBeCloseTo(90, 4)
    expect(bearingBetween([0, 1], [0, 0])).toBeCloseTo(180, 4)
    expect(bearingBetween([1, 0], [0, 0])).toBeCloseTo(270, 4)
  })
})

describe('bearingAt', () => {
  const east = [[0, 0], [1, 0]] // 正东直线，~111km
  it('直线路径任意 frac 都是路径方向', () => {
    expect(bearingAt(east, 0)).toBeCloseTo(90, 2)
    expect(bearingAt(east, 0.5)).toBeCloseTo(90, 2)
  })
  it('前瞻越过终点自动回退取向后窗口，不越界', () => {
    expect(bearingAt(east, 1)).toBeCloseTo(90, 2)
    expect(bearingAt(east, 0.999, 2000)).toBeCloseTo(90, 2)
  })
  it('退化输入返回 0', () => {
    expect(bearingAt([], 0.5)).toBe(0)
    expect(bearingAt([[0, 0], [0, 0]], 0.5)).toBe(0)
  })
})

describe('lerpAngle', () => {
  it('普通插值：0→180 中点 90', () => {
    expect(lerpAngle(0, 180, 0.5)).toBeCloseTo(90, 6)
  })
  it('跨 0° 走最短弧：350→10 中点 0，10→350 中点 0', () => {
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(0, 6)
    expect(lerpAngle(10, 350, 0.5)).toBeCloseTo(0, 6)
  })
  it('端点精确、t 越界被夹住、输出在 [0,360)', () => {
    expect(lerpAngle(350, 10, 0)).toBeCloseTo(350, 6)
    expect(lerpAngle(350, 10, 1)).toBeCloseTo(10, 6)
    expect(lerpAngle(350, 10, 2)).toBeCloseTo(10, 6)
    expect(lerpAngle(0, 270, 0.5)).toBeCloseTo(315, 6) // 最短弧向负方向
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- --run src/utils/geo.test.js`
Expected: FAIL（三个函数未导出）

- [ ] **Step 3: 最小实现**（追加到 `src/utils/geo.js`）

```js
// 两点方位角：0=正北，顺时针 0~360
export function bearingBetween([lng1, lat1], [lng2, lat2]) {
  const f1 = toRad(lat1)
  const f2 = toRad(lat2)
  const dl = toRad(lng2 - lng1)
  const y = Math.sin(dl) * Math.cos(f2)
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

// 路径 frac 处的行进方位：取该点与前方 lookaheadM 处点的方位角。
// 前瞻窗口本身即低通滤波；窗口越过终点时整体回退，保证不越界。
export function bearingAt(path, frac, lookaheadM = 2000) {
  if (!path || path.length < 2) return 0
  const total = pathLength(path)
  if (total === 0) return 0
  const w = Math.min(lookaheadM / total, 1)
  let f0 = clamp01(frac)
  let f1 = f0 + w
  if (f1 > 1) {
    f0 = Math.max(0, 1 - w)
    f1 = 1
  }
  return bearingBetween(pointAlongPath(path, f0), pointAlongPath(path, f1))
}

// 角度按最短弧插值（正确处理跨 0°），返回 [0,360)
export function lerpAngle(a, b, t) {
  const diff = ((((b - a) % 360) + 540) % 360) - 180
  return (((a + diff * clamp01(t)) % 360) + 360) % 360
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- --run src/utils/geo.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add src/utils/geo.js src/utils/geo.test.js
git commit -m @'
feat(flight): bearingBetween/bearingAt/lerpAngle 方位角纯函数

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

### Task 5: 飞行时长随距离 + scene.smoothPath 预计算（flightTimeline.js）

**Files:**
- Modify: `src/utils/flightTimeline.js`
- Test: `src/utils/flightTimeline.test.js`

**注意：本任务会改变 fly 场景时长 → 旧测试「总时长 16.5」必须同步更新**（用 `flyDurationForKm` 计算期望值，不再写死）。

- [ ] **Step 1: 写失败测试**

`src/utils/flightTimeline.test.js` 顶部 import 改为：

```js
import { buildFlightTimeline, sampleAt, flyDurationForKm } from './flightTimeline'
import { pathLength } from './geo'
```

追加新 describe：

```js
describe('flyDurationForKm', () => {
  it('clamp(d/50, 2, 6)：100km=2s、200km=4s、600km 封顶 6s、30km 下限 2s', () => {
    expect(flyDurationForKm(100)).toBe(2)
    expect(flyDurationForKm(200)).toBe(4)
    expect(flyDurationForKm(600)).toBe(6)
    expect(flyDurationForKm(30)).toBe(2)
  })
  it('距离缺失/为 0 用兜底值', () => {
    expect(flyDurationForKm(0, 2.5)).toBe(2.5)
    expect(flyDurationForKm(undefined, 2.5)).toBe(2.5)
  })
})

describe('buildFlightTimeline · smoothPath 与距离时长', () => {
  it('fly 场景时长 = flyDurationForKm(路径公里数)', () => {
    const tl = buildFlightTimeline(twoStops(), OPTS)
    const fly = tl.scenes.find((s) => s.kind === 'fly')
    const dKm = pathLength([[0, 0], [1, 0]]) / 1000
    expect(fly.duration).toBeCloseTo(flyDurationForKm(dKm), 6)
  })
  it('fly 场景带 smoothPath：端点与原折线一致', () => {
    const tl = buildFlightTimeline(twoStops(), OPTS)
    const fly = tl.scenes.find((s) => s.kind === 'fly')
    expect(fly.smoothPath[0]).toEqual([0, 0])
    expect(fly.smoothPath.at(-1)).toEqual([1, 0])
    expect(fly.smoothPath.length).toBeGreaterThan(2) // 已重采样
  })
})
```

同时**修改**旧断言（`buildFlightTimeline` describe 内）：

```js
  it('首个 stop 无 routeToHere → 无 fly 场景；总时长正确', () => {
    const tl = buildFlightTimeline(twoStops(), OPTS)
    const kinds = tl.scenes.map((s) => s.kind)
    expect(kinds).toEqual(['intro', 'dwell', 'fly', 'dwell', 'outro'])
    // 3 + (2+1) + flyDur + (3+1) + 4
    const flyDur = flyDurationForKm(pathLength([[0, 0], [1, 0]]) / 1000)
    expect(tl.totalDuration).toBeCloseTo(14 + flyDur, 6)
  })
```

旧的 `sampleAt` describe 里写死的时刻（`fly 6-8.5`、`dwell B 8.5-12.5` 等）**本任务先不动**——Task 6 会整体重写该 describe。为让本任务测试可跑，把旧 `sampleAt` describe 中受时长影响的 4 个用例（`fly B`、`dwell B 图片索引`、`outro`、`t 越界` 中的 999 仍可用）临时改为用变量计算时刻：

```js
describe('sampleAt', () => {
  const tl = buildFlightTimeline(twoStops(), OPTS)
  const flyDur = flyDurationForKm(pathLength([[0, 0], [1, 0]]) / 1000)
  const flyStart = 6 // intro 3 + dwell A 3
  const dwellBStart = flyStart + flyDur
  // …fly 用例采样 flyStart + flyDur * 0.4；dwell B 用例采样 dwellBStart + 0.5 / dwellBStart + 3.5；outro 采样 dwellBStart + 4 + 4
```

（`fly B` 用例中 `camera.lng` 与 `altitude` 的期望值不变：p=0.4 → eased=0.256，直线路径上位置只由 p 决定，与时长无关。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- --run src/utils/flightTimeline.test.js`
Expected: FAIL（`flyDurationForKm` 未导出、smoothPath 不存在、总时长不匹配）

- [ ] **Step 3: 实现**

`src/utils/flightTimeline.js` 顶部 import 改为：

```js
import { easeInOutCubic, clamp01 } from './easing'
import { pointAlongPath, pathLength, chaikinSmooth, resampleByDistance } from './geo'
```

新增导出（DEFAULTS 之后）：

```js
// 飞行段时长随距离：clamp(d_km/50, 2, 6) 秒；距离缺失/为 0 用兜底（老的固定时长语义）
export function flyDurationForKm(dKm, fallback = 2.5) {
  if (!(dKm > 0)) return fallback
  return Math.min(6, Math.max(2, dKm / 50))
}
```

`buildFlightTimeline` 的 stops.forEach 改为：

```js
  stops.forEach((s, i) => {
    if (s.routeToHere && s.routeToHere.length >= 2) {
      const meters = pathLength(s.routeToHere)
      // 相机走的平滑线：切角 ×2 后按弧长重采样（步长控制在 ~300 点内、不小于 200m）
      const smoothPath = resampleByDistance(chaikinSmooth(s.routeToHere, 2), Math.max(meters / 300, 200))
      const duration = flyDurationForKm(meters / 1000, o.flyDuration)
      scenes.push({ kind: 'fly', start: t, end: t + duration, duration, stopIndex: i, path: s.routeToHere, smoothPath })
      t += duration
    }
    push('dwell', (s.audioDuration || 0) + o.dwellPadding, i)
  })
```

（`push` 辅助函数保留给 intro/dwell/outro 用，不动。）

- [ ] **Step 4: 全量测试确认通过**

Run: `npm test -- --run`
Expected: 全部 PASS（含 flightTimeline 新旧用例）

- [ ] **Step 5: Commit**

```powershell
git add src/utils/flightTimeline.js src/utils/flightTimeline.test.js
git commit -m @'
feat(flight): fly 时长随距离 clamp(d/50,2,6) + 相机平滑线 smoothPath 预计算

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

### Task 6: sampleAt 相机曲线（zoom / bearing / padding）（flightTimeline.js）

**Files:**
- Modify: `src/utils/flightTimeline.js`
- Test: `src/utils/flightTimeline.test.js`

**语义：** 所有相机输出扩展为 `{lng,lat,zoom,pitch,bearing,padding:{leftFrac}}`。dwell/intro/outro 用「特写相机」（dwellZoom 11.5、bearing 0、leftFrac 0.45=节点偏右）；fly 段用 `edgeWindow(p)` 在两端与特写相机无缝衔接、中段拉远至 flyZoom 9、bearing 朝行进方向。

- [ ] **Step 1: 写失败测试**

`src/utils/flightTimeline.test.js`：import 再并入 `edgeWindow` 相关不需要；OPTS 改为新字段名：

```js
const OPTS = {
  introDuration: 3,
  flyDuration: 2.5,
  outroDuration: 4,
  dwellPadding: 1,
  flyZoom: 9,
  dwellZoom: 11.5,
  padLeftFrac: 0.45,
  edge: 0.15,
  pitch: 60,
  intro: { title: 'T', subtitle: 'S' },
  outro: { lines: ['L1'] },
}
```

旧用例断言更新：
- `保留 stops/intro/outro/opts`：`expect(tl.opts.zoom).toBe(9)` → `expect(tl.opts.flyZoom).toBe(9)`
- `intro 段`：`expect(s.camera).toMatchObject({ lng: 0, lat: 0, zoom: 9, pitch: 60 })` → `expect(s.camera).toMatchObject({ lng: 0, lat: 0, zoom: 11.5, pitch: 60, bearing: 0, padding: { leftFrac: 0.45 } })`
- `fly B` 用例：时刻改为 `flyStart + flyDur * 0.5`（p=0.5，中段平台），断言改为：

```js
  it('fly 中段：位置沿平滑线、拉远至 flyZoom、bearing 朝行进方向（正东 90°）', () => {
    const s = sampleAt(tl, flyStart + flyDur * 0.5)
    expect(s.phase).toBe('fly')
    expect(s.camera.lng).toBeCloseTo(0.5, 3) // eased(0.5)=0.5
    expect(s.camera.zoom).toBeCloseTo(9, 6) // w=1 → flyZoom
    expect(s.camera.bearing).toBeCloseTo(90, 1)
    expect(s.camera.padding.leftFrac).toBeCloseTo(0, 6)
    expect(s.altitude).toBe(150) // round(100 + 100*0.5)
  })
```

追加连续性用例：

```js
  it('fly 两端与相邻 dwell 相机连续（zoom/bearing/padding 无跳变）', () => {
    const dwellA = sampleAt(tl, 5.9).camera // dwell A 末尾
    const flyBegin = sampleAt(tl, flyStart + 0.0001).camera // fly p≈0
    expect(flyBegin.zoom).toBeCloseTo(dwellA.zoom, 2)
    expect(flyBegin.bearing).toBeCloseTo(0, 2)
    expect(flyBegin.padding.leftFrac).toBeCloseTo(0.45, 2)
    expect(flyBegin.lng).toBeCloseTo(0, 3)

    const flyEnd = sampleAt(tl, dwellBStart - 0.0001).camera // fly p≈1
    const dwellB = sampleAt(tl, dwellBStart + 0.1).camera
    expect(flyEnd.zoom).toBeCloseTo(dwellB.zoom, 2)
    expect(flyEnd.bearing).toBeCloseTo(0, 2)
    expect(flyEnd.padding.leftFrac).toBeCloseTo(0.45, 2)
    expect(flyEnd.lng).toBeCloseTo(1, 3)
  })
  it('dwell/outro 相机为特写相机', () => {
    expect(sampleAt(tl, 4).camera).toMatchObject({ zoom: 11.5, bearing: 0, padding: { leftFrac: 0.45 } })
    const so = sampleAt(tl, tl.totalDuration)
    expect(so.camera).toMatchObject({ lng: 1, lat: 0, zoom: 11.5, bearing: 0, padding: { leftFrac: 0.45 } })
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- --run src/utils/flightTimeline.test.js`
Expected: FAIL（相机无 bearing/padding、zoom 仍为 9）

- [ ] **Step 3: 实现**

`src/utils/flightTimeline.js`：

import 再并入：

```js
import { easeInOutCubic, clamp01, edgeWindow } from './easing'
import { pointAlongPath, pathLength, chaikinSmooth, resampleByDistance, bearingAt, lerpAngle } from './geo'
```

DEFAULTS 改为：

```js
const DEFAULTS = {
  introDuration: 3,
  flyDuration: 2.5, // 兜底：路径长度为 0 时的 fly 时长
  outroDuration: 4,
  dwellPadding: 0.8,
  flyZoom: 9, // 飞行中段拉远看全局
  dwellZoom: 11.5, // 停留拉近看细节（区县级，用户确认"温和档"）
  padLeftFrac: 0.45, // 左侧留白比例 → 节点位于画面右侧约 70% 处
  edge: 0.15, // fly 段两端过渡窗宽
  pitch: 60,
  intro: { title: '', subtitle: '' },
  outro: { lines: [] },
}
```

`sampleAt` 重写相机部分（函数整体替换为下面版本）：

```js
// 停留/片头/片尾共用的「特写相机」：拉近、正北、节点偏右（左侧留白给照片面板）
function closeupCamera(node, o) {
  return {
    lng: node.lng,
    lat: node.lat,
    zoom: o.dwellZoom,
    pitch: o.pitch,
    bearing: 0,
    padding: { leftFrac: o.padLeftFrac },
  }
}

// 给定时刻 t，输出该刻的相位/相机/活动节点/音频/卡片/海拔/叠加层状态
export function sampleAt(timeline, t) {
  const total = timeline.totalDuration
  const tc = Math.max(0, Math.min(t, total))
  const scene = sceneAt(timeline, tc)
  const p = scene.duration > 0 ? clamp01((tc - scene.start) / scene.duration) : 0
  const o = timeline.opts
  const first = timeline.stops[0].node
  const last = timeline.stops[timeline.stops.length - 1].node

  if (scene.kind === 'intro') {
    return {
      phase: 'intro', t: tc,
      camera: closeupCamera(first, o),
      activeStopIndex: -1, audio: { ...NO_AUDIO }, card: { ...NO_CARD },
      altitude: first.altitude ?? null,
      overlay: { kind: 'intro', title: timeline.intro.title, subtitle: timeline.intro.subtitle },
    }
  }

  if (scene.kind === 'outro') {
    return {
      phase: 'outro', t: tc,
      camera: closeupCamera(last, o),
      activeStopIndex: -1, audio: { ...NO_AUDIO }, card: { ...NO_CARD },
      altitude: last.altitude ?? null,
      overlay: { kind: 'outro', lines: timeline.outro.lines },
    }
  }

  const i = scene.stopIndex
  const node = timeline.stops[i].node

  if (scene.kind === 'fly') {
    const eased = easeInOutCubic(p)
    const line = scene.smoothPath || scene.path
    const pos = pointAlongPath(line, eased) || [node.lng, node.lat]
    // 两端归零窗：起飞时从特写相机缓出（拉远、转向行进方向、撤掉偏右），降落前缓回
    const w = edgeWindow(p, o.edge)
    const zoom = o.dwellZoom + (o.flyZoom - o.dwellZoom) * w
    const bearing = lerpAngle(0, bearingAt(line, eased), w)
    const padding = { leftFrac: o.padLeftFrac * (1 - w) }
    const prevAlt = timeline.stops[i - 1]?.node.altitude
    const altitude =
      typeof prevAlt === 'number' && typeof node.altitude === 'number'
        ? Math.round(prevAlt + (node.altitude - prevAlt) * eased)
        : node.altitude ?? null
    return {
      phase: 'fly', t: tc,
      camera: { lng: pos[0], lat: pos[1], zoom, pitch: o.pitch, bearing, padding },
      activeStopIndex: i, audio: { ...NO_AUDIO }, card: { ...NO_CARD },
      altitude, overlay: null,
    }
  }

  // dwell
  const imgCount = node.images?.length ?? 0
  const imageIndex = imgCount > 0 ? Math.min(imgCount - 1, Math.floor(p * imgCount)) : 0
  return {
    phase: 'dwell', t: tc,
    camera: closeupCamera(node, o),
    activeStopIndex: i,
    audio: { stopIndex: i, playing: true, offset: tc - scene.start },
    card: { visible: true, stopIndex: i, imageIndex },
    altitude: node.altitude ?? null,
    overlay: null,
  }
}
```

- [ ] **Step 4: 全量测试确认通过**

Run: `npm test -- --run`
Expected: 全部 PASS（含 store 测试——store 只透传 camera，不断言字段）

- [ ] **Step 5: Commit**

```powershell
git add src/utils/flightTimeline.js src/utils/flightTimeline.test.js
git commit -m @'
feat(flight): sampleAt 相机曲线——双层缩放/行进方向 bearing/节点偏右 padding

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

### Task 7: useMapLibre 透传 bearing/padding + 暴露 project()（无单测）

**Files:**
- Modify: `src/composables/useMapLibre.js`

- [ ] **Step 1: 修改 `applyCamera` 与返回对象**

`applyCamera` 替换为：

```js
  function applyCamera({ lng, lat, zoom, pitch, bearing, padding }) {
    // padding.leftFrac（0~1，相对容器宽）→ 像素；节点因此偏向画面右侧
    const w = container.clientWidth || 0
    const left = Math.round((padding?.leftFrac ?? 0) * w)
    map.jumpTo({
      center: [lng, lat],
      zoom,
      pitch: pitch ?? 60,
      bearing: bearing ?? 0,
      padding: { top: 0, bottom: 0, left, right: 0 },
    })
  }
```

新增 `project`（`destroy` 之前）：

```js
  // 经纬度 → 舞台容器内像素坐标（引线/脉冲标记锚点用）；未建图返回 null
  function project(lngLat) {
    if (!map) return null
    const p = map.project(lngLat)
    return { x: p.x, y: p.y }
  }
```

返回对象加 `project`：

```js
  return {
    get map() {
      return map
    },
    setCamera,
    drawRoute,
    project,
    destroy,
  }
```

- [ ] **Step 2: 全量测试 + 构建验证**

Run: `npm test -- --run` → 全部 PASS
Run: `npm run build` → `✓ built in …`

- [ ] **Step 3: Commit**

```powershell
git add src/composables/useMapLibre.js
git commit -m @'
feat(flight): setCamera 透传 bearing/padding（leftFrac 换算像素）+ 暴露 project()

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

### Task 8: 3D 地形（Terrarium raster-dem + 降级）（无单测）

**Files:**
- Modify: `src/composables/useMapLibre.js`

- [ ] **Step 1: style.sources 加 dem 源**

```js
    sources: {
      img: { type: 'raster', tiles: imgTiles, tileSize: 256 }, // 影像
      cia: { type: 'raster', tiles: ciaTiles, tileSize: 256 }, // 中文注记
      dem: {
        // AWS Terrarium 高程瓦片：免费、全球、无需 key
        type: 'raster-dem',
        tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        encoding: 'terrarium',
        maxzoom: 12,
      },
    },
```

- [ ] **Step 2: build() 里 load 后启用地形（包 try/catch 降级）+ error 过滤 dem**

`map.on('load', …)` 改为：

```js
    map.on('load', () => {
      map.resize() // 建图后再兜一次尺寸
      try {
        map.setTerrain({ source: 'dem', exaggeration: 1.4 }) // 用户确认 1.4
      } catch (err) {
        console.warn('[FlightMap] 3D 地形启用失败，降级平面继续', err)
      }
      if (pendingCamera) applyCamera(pendingCamera)
      if (pendingRoute) applyRoute(pendingRoute)
    })
```

`map.on('error', …)` 改为（dem 失败只警告、不上抛、不阻塞）：

```js
    map.on('error', (e) => {
      if (e?.sourceId === 'dem') {
        console.warn('[FlightMap] 地形瓦片加载失败（不影响播放，平面继续）', e?.error || e)
        return
      }
      console.error('[FlightMap error]', e?.error || e)
      onError?.(e?.error?.message || String(e?.error || '未知错误'))
    })
```

- [ ] **Step 3: 全量测试 + 构建验证**

Run: `npm test -- --run` → 全部 PASS
Run: `npm run build` → 成功

- [ ] **Step 4: Commit**

```powershell
git add src/composables/useMapLibre.js
git commit -m @'
feat(flight): 3D 地形——Terrarium raster-dem + setTerrain(1.4)，失败降级平面

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

### Task 9: 节点特写 UI——左侧照片面板 + 引线 + 脉冲标记（FlightPlayer.vue，手测）

**Files:**
- Modify: `src/components/FlightPlayer.vue`

- [ ] **Step 1: script 增加锚点计算**

顶部 import 改为（加 `nextTick`）：

```js
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
```

`script setup` 内追加（放在 `activeNode` 之后）：

```js
// —— 节点特写锚点：dwell 时把节点经纬度投到舞台像素，画引线 + 脉冲标记 ——
const stageEl = ref(null)
const panelEl = ref(null)
const anchor = ref(null) // { x1,y1 面板右缘中点, x2,y2 节点 } 舞台内像素

function updateAnchor() {
  const node = activeNode.value
  const stage = stageEl.value?.getBoundingClientRect()
  if (!node || !card.value?.visible || !mapAdapter?.project || !stage) {
    anchor.value = null
    return
  }
  const pt = mapAdapter.project([node.lng, node.lat])
  if (!pt) {
    anchor.value = null
    return
  }
  const panel = panelEl.value?.getBoundingClientRect()
  anchor.value = {
    x2: pt.x,
    y2: pt.y,
    x1: panel ? panel.right - stage.left : 16,
    y1: panel ? panel.top + panel.height / 2 - stage.top : stage.height / 2,
  }
}

// dwell 相机静止：进入/切换停留时算一次即可；窗口尺寸变了再算
watch(
  () => [sample.value?.phase, card.value?.stopIndex, imgUrls.value.length],
  async () => {
    await nextTick()
    updateAnchor()
  },
)
```

`onMounted` 末尾（`state.value = 'ready'` 之前任意处）加：

```js
  window.addEventListener('resize', updateAnchor)
```

`onBeforeUnmount` 里加一行：

```js
  window.removeEventListener('resize', updateAnchor)
```

- [ ] **Step 2: template 改动**

舞台 div 加 ref：

```html
    <div class="flex-1 relative overflow-hidden" ref="stageEl">
```

把现有「节点信息卡 + 图片轮播」整块（`<!-- 节点信息卡 + 图片轮播 -->` 到其闭合 `</div>`）替换为：

```html
        <!-- 引线：照片面板右缘中点 → 节点（写实底图上的轻量叠加）-->
        <svg v-if="anchor" class="absolute inset-0 w-full h-full pointer-events-none">
          <line :x1="anchor.x1" :y1="anchor.y1" :x2="anchor.x2" :y2="anchor.y2"
            stroke="white" stroke-opacity="0.55" stroke-width="1.5" />
          <circle :cx="anchor.x1" :cy="anchor.y1" r="3" fill="white" fill-opacity="0.7" />
        </svg>

        <!-- 节点脉冲标记 -->
        <div v-if="anchor" :style="{ left: anchor.x2 + 'px', top: anchor.y2 + 'px' }"
          class="absolute pointer-events-none" style="transform: translate(-50%, -50%)">
          <span class="absolute -left-2.5 -top-2.5 w-5 h-5 rounded-full bg-teal-300/50 animate-ping"></span>
          <span class="relative block w-2.5 h-2.5 rounded-full bg-teal-200 ring-2 ring-white/80"></span>
        </div>

        <!-- 左侧照片面板：实景照片（Ken Burns）+ 节点名/海拔/地址/备注 -->
        <div
          v-if="card?.visible && activeNode"
          ref="panelEl"
          class="absolute left-4 top-1/2 -translate-y-1/2 w-[30%] max-w-sm rounded-xl overflow-hidden bg-black/55 text-white shadow-lg backdrop-blur-sm"
        >
          <div v-if="currentImg" class="relative h-44 overflow-hidden">
            <img
              :key="card.stopIndex + '-' + card.imageIndex"
              :src="currentImg"
              class="w-full h-full object-cover kb-img"
              alt=""
            />
          </div>
          <div class="p-3">
            <div class="flex items-baseline gap-2">
              <h3 class="text-lg font-semibold">{{ activeNode.name }}</h3>
              <span v-if="activeNode.altitude != null" class="text-xs text-white/70">{{ activeNode.altitude }} m</span>
            </div>
            <p v-if="activeNode.address" class="text-xs text-white/70 mt-0.5">{{ activeNode.address }}</p>
            <p v-if="activeNode.note" class="text-sm text-white/90 mt-1">{{ activeNode.note }}</p>
          </div>
        </div>
```

（内部内容与旧卡片一致：无照片时只显文字，不放占位插画。`kb-img`/`kenburns` 样式已存在，不动。）

- [ ] **Step 3: 全量测试 + 构建验证**

Run: `npm test -- --run` → 全部 PASS
Run: `npm run build` → 成功

- [ ] **Step 4: Commit**

```powershell
git add src/components/FlightPlayer.vue
git commit -m @'
feat(flight): 节点特写构图——左侧照片面板+引线+脉冲标记（节点偏右）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

### Task 10: CHANGELOG + 手动验收

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: `## [Unreleased]` 下追加**

```markdown
### Added（Phase 4b·飞行相机体验优化）
- 飞行镜头朝行进方向（方位角前瞻 + 两端缓动归北），相机中心走 Chaikin 平滑线，消除贴折线抖动
- 双层缩放：飞行拉远 z9 ↔ 停留拉近 z11.5，随距离的飞行时长 clamp(km/50, 2~6s)
- 3D 地形：AWS Terrarium 高程（免费无 key）+ setTerrain(1.4)，垭口雪山立体呈现；加载失败自动降级平面
- 节点特写构图：节点偏画面右侧，左侧实景照片面板（Ken Burns）经细引线相连，节点脉冲标记
```

- [ ] **Step 2: 手动验收清单（浏览器 `npm run dev`，需天地图 key + 已批量合成）**

- [ ] 飞行段不再逐顶点抖动；过弯转向平滑、镜头大体朝行进方向
- [ ] 起飞渐拉远至全局、到点渐拉近，肉眼无跳变；片头/片尾就是特写机位
- [ ] 山体有立体起伏（如康定→折多山段最明显）；开发者工具里把 elevation-tiles 域名 block 后重开预览仍能正常播（平面降级、无红字报错）
- [ ] dwell：节点在画面偏右并有脉冲标记，左侧照片面板，引线两端对齐；窗口缩放后引线仍对齐
- [ ] 拖进度条/倍速/暂停恢复均正常；瓦片消耗可控（注意天地图日配额，别反复整程播放）

- [ ] **Step 3: Commit**

```powershell
git add CHANGELOG.md
git commit -m @'
docs: CHANGELOG 增补 Phase 4b 飞行相机体验优化条目

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

- [ ] **Step 4:（可选）推送备份**

```powershell
git push origin phase4-animation
```

---

## Self-Review 记录

- **Spec 覆盖**：平滑轨迹(T2/T3/T5)、bearing 行进方向+归北(T4/T6)、双层缩放(T1/T6)、飞行时长随距离(T5)、3D 地形+降级(T8)、特写构图节点偏右/照片面板/引线/脉冲(T6 padding + T9)、相机接口扩展(T6/T7)、store 零改动(已核实 store 测试无相机断言)——无遗漏。云雾转场/沙盘按 spec 明确不做。
- **占位符**：无 TBD/TODO；所有代码步骤给全量代码。
- **类型一致性**：`camera.padding = { leftFrac }` 贯穿 T6→T7；`smoothPath` 贯穿 T5→T6；`project()` 返回 `{x,y}` 贯穿 T7→T9；`flyDurationForKm(dKm, fallback)` 签名在 T5 定义、T5/T6 测试同签名使用。OPTS 字段名 `flyZoom/dwellZoom/padLeftFrac/edge` 在 T6 统一替换（T5 阶段旧 OPTS 仍含 `zoom:9`，DEFAULTS 兼容展开不报错，T6 步骤里一并更新）。
