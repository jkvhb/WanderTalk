# Phase 4 飞行动画引擎（MVP）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在【视频工作室】点"预览"，看到相机沿路线飞行、在每个有旁白的节点停留并播报该段语音、同时浮现信息卡+图片轮播的飞行动画，带片头片尾/全程数据/实时海拔，可播放/暂停/拖进度。

**Architecture:** 动画核心是一组**纯函数**（缓动 `easing` → 弧长采样 `geo` → 时间轴 `flightTimeline` → 路线装配 `flightStops`），全部可在 node 环境单测，零浏览器依赖。`flight` Pinia store 持有时间轴 + 音频 Blob，用一个可注入的 `tick(dt)` 推进时间（生产用 rAF，测试用假时钟），并把副作用（移动相机、播放音频）委托给一个**注入的 adapter**——因此 store 也能单测。MapLibre + 天地图、`<audio>`、canvas 压缩等浏览器代码集中在薄适配器 `useMapLibre.js` / 组件里，靠手动验证。

**Tech Stack:** Vue 3 + Pinia + Vite + Vitest（node 环境 + fake-indexeddb）；MapLibre GL JS；天地图 WGS-84 栅格瓦片；IndexedDB（idb）。坐标统一 WGS-84，与天地图零偏移、零转换。

**约定（沿用本仓库）：** 测试 `npm test`（`vitest run`）；构建 `npm run build`；node 为 `D:\node.exe`；每个任务先写失败测试→实现→测试绿→单独 commit；提交信息末尾带 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。浏览器专属模块（`.vue`、`useMapLibre.js`、canvas 压缩）按本仓库既有惯例**不写单测、手动验证**（Phase 3 的组件同样无单测）。

**关键数据结构（贯穿全程，务必字段一致）：**

```text
camera  = { lng, lat, zoom, pitch }
node    = { lng, lat, name, altitude, address, note, images: [imageId...], narration }
stop    = { node, audioDuration: 秒, routeToHere: [[lng,lat]...] }   // 第一个 stop 的 routeToHere 为 []
opts    = { introDuration, flyDuration, outroDuration, dwellPadding, zoom, pitch,
            intro: { title, subtitle }, outro: { lines: [string...] } }
scene   = { kind:'intro'|'fly'|'dwell'|'outro', start, end, duration, stopIndex, path }
timeline= { totalDuration, scenes:[scene...], stops:[stop...], intro, outro, opts }
sample  = {
  phase:'intro'|'fly'|'dwell'|'outro', t,
  camera,
  activeStopIndex,                       // intro/outro 为 -1
  audio: { stopIndex, playing, offset }, // 不播时 stopIndex=-1, playing=false, offset=0
  card:  { visible, stopIndex, imageIndex },
  altitude,                              // number | null
  overlay,                               // null | {kind:'intro',title,subtitle} | {kind:'outro',lines}
}
adapter = { setCamera(camera), playAudio(blob, offsetSeconds), stopAudio() }
```

---

## File Structure

**新建（纯逻辑，单测）**
- `src/utils/easing.js` — `easeInOutCubic(t)`、`clamp01(t)`
- `src/utils/geo.js` — `haversine(a,b)`、`pathLength(path)`、`pointAlongPath(path,frac)`
- `src/utils/flightTimeline.js` — `buildFlightTimeline(stops,opts)`、`sampleAt(timeline,t)`
- `src/utils/flightStops.js` — `collectNarratedStops(plan)`、`computeTotalDistance(plan)`
- `src/utils/image.js` — `newImageId()`（单测）、`downscaleImage(file)`（浏览器，手动验）
- `src/stores/flight.js` — 播放器 store（注入 adapter + 假时钟，单测）

**新建（浏览器，手动验证）**
- `src/composables/useMapLibre.js` — 天地图 MapLibre 适配器
- `src/components/FlightPlayer.vue` — 16:9 画布 + 叠加层 + 控件

**修改**
- `src/utils/db.js` — DB_VERSION→3，新增 `images` store + `getImage/putImage/deleteImage`
- `src/stores/trip.js` — waypoint 归一化加 `note`/`images`；actions `setNote/addImage/removeImage/setImages`
- `src/stores/settings.js` — 新增 `tiandituKey`
- `src/views/SettingsView.vue` — 天地图 key 输入
- `src/components/NarrationDayCard.vue` — 每节点加图片上传/缩略图/删除 + 备注框
- `src/views/StudioView.vue` — 主区接入 `FlightPlayer` + "▶ 预览"入口
- `package.json` — 依赖 `maplibre-gl`
- `CHANGELOG.md` — Phase 4 条目

---

## Task 1: 缓动函数 easing.js

**Files:**
- Create: `src/utils/easing.js`
- Test: `src/utils/easing.test.js`

- [ ] **Step 1: 写失败测试**

```js
// src/utils/easing.test.js
import { describe, it, expect } from 'vitest'
import { easeInOutCubic, clamp01 } from './easing'

describe('easeInOutCubic', () => {
  it('端点固定为 0 与 1', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
  })
  it('中点为 0.5（对称）', () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 6)
  })
  it('单调递增', () => {
    expect(easeInOutCubic(0.25)).toBeLessThan(easeInOutCubic(0.75))
    expect(easeInOutCubic(0.4)).toBeCloseTo(0.256, 3) // 4*0.4^3
  })
})

describe('clamp01', () => {
  it('夹到 [0,1]', () => {
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(2)).toBe(1)
    expect(clamp01(0.3)).toBe(0.3)
  })
})
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/utils/easing.test.js`
Expected: FAIL（`easeInOutCubic` 未定义 / 模块不存在）

- [ ] **Step 3: 实现**

```js
// src/utils/easing.js
export function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

// 标准 ease-in-out 三次缓动：两端慢、中间快，相机加减速自然
export function easeInOutCubic(t) {
  const x = clamp01(t)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npm test -- src/utils/easing.test.js`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add src/utils/easing.js src/utils/easing.test.js
git commit -m "feat(flight): 缓动函数 easeInOutCubic/clamp01

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 地理插值 geo.js

按弧长在 WGS-84 折线上取插值点——飞行段相机就靠它沿路线移动。

**Files:**
- Create: `src/utils/geo.js`
- Test: `src/utils/geo.test.js`

- [ ] **Step 1: 写失败测试**

```js
// src/utils/geo.test.js
import { describe, it, expect } from 'vitest'
import { haversine, pathLength, pointAlongPath } from './geo'

describe('haversine', () => {
  it('1 度纬度约 111km', () => {
    const d = haversine([0, 0], [0, 1])
    expect(d).toBeGreaterThan(110000)
    expect(d).toBeLessThan(112000)
  })
  it('同点为 0', () => {
    expect(haversine([100, 30], [100, 30])).toBe(0)
  })
})

describe('pathLength', () => {
  it('两点折线 = 两点距离', () => {
    expect(pathLength([[0, 0], [0, 1]])).toBeCloseTo(haversine([0, 0], [0, 1]), 3)
  })
  it('空/单点为 0', () => {
    expect(pathLength([])).toBe(0)
    expect(pathLength([[1, 2]])).toBe(0)
  })
})

describe('pointAlongPath', () => {
  it('frac=0 取首点，frac=1 取末点', () => {
    expect(pointAlongPath([[0, 0], [10, 0]], 0)).toEqual([0, 0])
    expect(pointAlongPath([[0, 0], [10, 0]], 1)).toEqual([10, 0])
  })
  it('frac=0.5 取单段中点', () => {
    const p = pointAlongPath([[0, 0], [10, 0]], 0.5)
    expect(p[0]).toBeCloseTo(5, 3)
    expect(p[1]).toBeCloseTo(0, 6)
  })
  it('frac 越界被夹住', () => {
    expect(pointAlongPath([[0, 0], [10, 0]], -1)).toEqual([0, 0])
    expect(pointAlongPath([[0, 0], [10, 0]], 2)).toEqual([10, 0])
  })
  it('单点折线返回该点', () => {
    expect(pointAlongPath([[3, 4]], 0.7)).toEqual([3, 4])
  })
})
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/utils/geo.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```js
// src/utils/geo.js
import { clamp01 } from './easing'

const R = 6371000 // 地球半径（米）
const toRad = (d) => (d * Math.PI) / 180

// 两点 [lng,lat] 间的大圆距离（米）
export function haversine([lng1, lat1], [lng2, lat2]) {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// 折线总长（米）
export function pathLength(path) {
  if (!path || path.length < 2) return 0
  let sum = 0
  for (let i = 0; i < path.length - 1; i++) sum += haversine(path[i], path[i + 1])
  return sum
}

// 按弧长比例 frac∈[0,1] 在折线上线性插值取点，返回 [lng,lat]
export function pointAlongPath(path, frac) {
  if (!path || path.length === 0) return null
  if (path.length === 1) return path[0]
  const total = pathLength(path)
  if (total === 0) return path[0]
  const target = clamp01(frac) * total
  let acc = 0
  for (let i = 0; i < path.length - 1; i++) {
    const segLen = haversine(path[i], path[i + 1])
    if (acc + segLen >= target) {
      const t = segLen === 0 ? 0 : (target - acc) / segLen
      return [
        path[i][0] + (path[i + 1][0] - path[i][0]) * t,
        path[i][1] + (path[i + 1][1] - path[i][1]) * t,
      ]
    }
    acc += segLen
  }
  return path[path.length - 1]
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npm test -- src/utils/geo.test.js`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add src/utils/geo.js src/utils/geo.test.js
git commit -m "feat(flight): geo 弧长插值 haversine/pathLength/pointAlongPath

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 时间轴装配 buildFlightTimeline

把有序 stops 装配成 intro → (fly?+dwell)×N → outro 的场景序列，算出每个场景的绝对起止时间。dwell 时长 = 该段音频时长 + padding（确定性同步的核心）。

**Files:**
- Create: `src/utils/flightTimeline.js`
- Test: `src/utils/flightTimeline.test.js`

- [ ] **Step 1: 写失败测试**

```js
// src/utils/flightTimeline.test.js
import { describe, it, expect } from 'vitest'
import { buildFlightTimeline } from './flightTimeline'

const OPTS = {
  introDuration: 3,
  flyDuration: 2.5,
  outroDuration: 4,
  dwellPadding: 1,
  zoom: 9,
  pitch: 60,
  intro: { title: 'T', subtitle: 'S' },
  outro: { lines: ['L1'] },
}

function twoStops() {
  return [
    { node: { lng: 0, lat: 0, name: 'A', altitude: 100, images: [] }, audioDuration: 2, routeToHere: [] },
    { node: { lng: 1, lat: 0, name: 'B', altitude: 200, images: ['a', 'b'] }, audioDuration: 3, routeToHere: [[0, 0], [1, 0]] },
  ]
}

describe('buildFlightTimeline', () => {
  it('首个 stop 无 routeToHere → 无 fly 场景；总时长正确', () => {
    const tl = buildFlightTimeline(twoStops(), OPTS)
    const kinds = tl.scenes.map((s) => s.kind)
    // intro, dwell(A), fly(B), dwell(B), outro
    expect(kinds).toEqual(['intro', 'dwell', 'fly', 'dwell', 'outro'])
    // 3 + (2+1) + 2.5 + (3+1) + 4 = 16.5
    expect(tl.totalDuration).toBeCloseTo(16.5, 6)
  })

  it('场景首尾相接、按时间排列', () => {
    const tl = buildFlightTimeline(twoStops(), OPTS)
    expect(tl.scenes[0].start).toBe(0)
    for (let i = 1; i < tl.scenes.length; i++) {
      expect(tl.scenes[i].start).toBeCloseTo(tl.scenes[i - 1].end, 6)
    }
    expect(tl.scenes.at(-1).end).toBeCloseTo(tl.totalDuration, 6)
  })

  it('保留 stops/intro/outro/opts 供采样使用', () => {
    const tl = buildFlightTimeline(twoStops(), OPTS)
    expect(tl.stops).toHaveLength(2)
    expect(tl.intro.title).toBe('T')
    expect(tl.outro.lines).toEqual(['L1'])
    expect(tl.opts.zoom).toBe(9)
  })

  it('opts 缺省值可用（只给 intro/outro 内容）', () => {
    const tl = buildFlightTimeline(twoStops(), { intro: { title: 'x' }, outro: { lines: [] } })
    expect(tl.totalDuration).toBeGreaterThan(0)
    expect(tl.opts.flyDuration).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/utils/flightTimeline.test.js`
Expected: FAIL（`buildFlightTimeline` 未定义）

- [ ] **Step 3: 实现 buildFlightTimeline（sampleAt 下个任务补）**

```js
// src/utils/flightTimeline.js
import { easeInOutCubic, clamp01 } from './easing'
import { pointAlongPath } from './geo'

const DEFAULTS = {
  introDuration: 3,
  flyDuration: 2.5,
  outroDuration: 4,
  dwellPadding: 0.8,
  zoom: 9,
  pitch: 60,
  intro: { title: '', subtitle: '' },
  outro: { lines: [] },
}

// stops: [{ node, audioDuration, routeToHere }]（有序，首个 routeToHere 通常为 []）
// 返回 { totalDuration, scenes, stops, intro, outro, opts }
export function buildFlightTimeline(stops, opts = {}) {
  const o = { ...DEFAULTS, ...opts }
  o.intro = { ...DEFAULTS.intro, ...(opts.intro || {}) }
  o.outro = { ...DEFAULTS.outro, ...(opts.outro || {}) }

  const scenes = []
  let t = 0
  const push = (kind, duration, stopIndex, path) => {
    scenes.push({ kind, start: t, end: t + duration, duration, stopIndex, path: path ?? null })
    t += duration
  }

  push('intro', o.introDuration, -1)
  stops.forEach((s, i) => {
    if (s.routeToHere && s.routeToHere.length >= 2) {
      push('fly', o.flyDuration, i, s.routeToHere)
    }
    push('dwell', (s.audioDuration || 0) + o.dwellPadding, i)
  })
  push('outro', o.outroDuration, -1)

  return { totalDuration: t, scenes, stops, intro: o.intro, outro: o.outro, opts: o }
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npm test -- src/utils/flightTimeline.test.js`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add src/utils/flightTimeline.js src/utils/flightTimeline.test.js
git commit -m "feat(flight): buildFlightTimeline 装配 intro/fly/dwell/outro 场景

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 时间轴采样 sampleAt

给定时间 `t`，输出该时刻的相位、相机、活动节点、音频/卡片/海拔/叠加层状态。这是音画同步的"读出端"。

**Files:**
- Modify: `src/utils/flightTimeline.js`（追加 `sampleAt`，并在文件顶部已 import easing/geo）
- Test: `src/utils/flightTimeline.test.js`（追加 describe）

- [ ] **Step 1: 追加失败测试**

```js
// 追加到 src/utils/flightTimeline.test.js 末尾
import { sampleAt } from './flightTimeline'

describe('sampleAt', () => {
  const tl = buildFlightTimeline(twoStops(), OPTS)
  // 时间线：intro 0-3 | dwell A 3-6 | fly B 6-8.5 | dwell B 8.5-12.5 | outro 12.5-16.5

  it('intro 段：片头叠加层 + 相机在首节点', () => {
    const s = sampleAt(tl, 1)
    expect(s.phase).toBe('intro')
    expect(s.overlay).toEqual({ kind: 'intro', title: 'T', subtitle: 'S' })
    expect(s.camera).toMatchObject({ lng: 0, lat: 0, zoom: 9, pitch: 60 })
    expect(s.card.visible).toBe(false)
    expect(s.audio.playing).toBe(false)
  })

  it('dwell A：卡片可见、播放 stop0、offset 为段内偏移、海拔为节点海拔', () => {
    const s = sampleAt(tl, 4) // dwell A 始于 3
    expect(s.phase).toBe('dwell')
    expect(s.activeStopIndex).toBe(0)
    expect(s.audio).toEqual({ stopIndex: 0, playing: true, offset: 1 })
    expect(s.card).toMatchObject({ visible: true, stopIndex: 0 })
    expect(s.altitude).toBe(100)
  })

  it('fly B：相机沿 routeToHere 缓动、海拔在两节点间插值', () => {
    const s = sampleAt(tl, 7) // fly 6-8.5, p=0.4
    expect(s.phase).toBe('fly')
    expect(s.activeStopIndex).toBe(1)
    expect(s.camera.lng).toBeCloseTo(0.256, 3) // easeInOutCubic(0.4)=0.256，单段线性
    expect(s.camera.lat).toBeCloseTo(0, 6)
    expect(s.altitude).toBe(126) // round(100 + 100*0.256)
    expect(s.audio.playing).toBe(false)
  })

  it('dwell B：图片索引随段内进度在图片数内均分切换', () => {
    expect(sampleAt(tl, 9).card.imageIndex).toBe(0) // p=(9-8.5)/4=0.125 → 0
    expect(sampleAt(tl, 12).card.imageIndex).toBe(1) // p=0.875 → 1
  })

  it('outro 段：片尾叠加层 + 相机在末节点', () => {
    const s = sampleAt(tl, 16.5)
    expect(s.phase).toBe('outro')
    expect(s.overlay).toEqual({ kind: 'outro', lines: ['L1'] })
    expect(s.camera).toMatchObject({ lng: 1, lat: 0 })
  })

  it('t 越界被夹住', () => {
    expect(sampleAt(tl, -5).phase).toBe('intro')
    expect(sampleAt(tl, 999).phase).toBe('outro')
  })
})
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/utils/flightTimeline.test.js`
Expected: FAIL（`sampleAt` 未定义）

- [ ] **Step 3: 实现 sampleAt（追加到 flightTimeline.js）**

```js
// 追加到 src/utils/flightTimeline.js
function sceneAt(timeline, tc) {
  let scene = timeline.scenes[0]
  for (const sc of timeline.scenes) {
    if (tc >= sc.start) scene = sc
    else break
  }
  return scene
}

const NO_AUDIO = { stopIndex: -1, playing: false, offset: 0 }
const NO_CARD = { visible: false, stopIndex: -1, imageIndex: 0 }

export function sampleAt(timeline, t) {
  const total = timeline.totalDuration
  const tc = Math.max(0, Math.min(t, total))
  const scene = sceneAt(timeline, tc)
  const p = scene.duration > 0 ? clamp01((tc - scene.start) / scene.duration) : 0
  const { zoom, pitch } = timeline.opts
  const first = timeline.stops[0].node
  const last = timeline.stops[timeline.stops.length - 1].node

  if (scene.kind === 'intro') {
    return {
      phase: 'intro', t: tc,
      camera: { lng: first.lng, lat: first.lat, zoom, pitch },
      activeStopIndex: -1, audio: { ...NO_AUDIO }, card: { ...NO_CARD },
      altitude: first.altitude ?? null,
      overlay: { kind: 'intro', title: timeline.intro.title, subtitle: timeline.intro.subtitle },
    }
  }

  if (scene.kind === 'outro') {
    return {
      phase: 'outro', t: tc,
      camera: { lng: last.lng, lat: last.lat, zoom, pitch },
      activeStopIndex: -1, audio: { ...NO_AUDIO }, card: { ...NO_CARD },
      altitude: last.altitude ?? null,
      overlay: { kind: 'outro', lines: timeline.outro.lines },
    }
  }

  const i = scene.stopIndex
  const node = timeline.stops[i].node

  if (scene.kind === 'fly') {
    const eased = easeInOutCubic(p)
    const pos = pointAlongPath(scene.path, eased) || [node.lng, node.lat]
    const prevAlt = timeline.stops[i - 1]?.node.altitude
    const altitude =
      typeof prevAlt === 'number' && typeof node.altitude === 'number'
        ? Math.round(prevAlt + (node.altitude - prevAlt) * eased)
        : node.altitude ?? null
    return {
      phase: 'fly', t: tc,
      camera: { lng: pos[0], lat: pos[1], zoom, pitch },
      activeStopIndex: i, audio: { ...NO_AUDIO }, card: { ...NO_CARD },
      altitude, overlay: null,
    }
  }

  // dwell
  const imgCount = node.images?.length ?? 0
  const imageIndex = imgCount > 0 ? Math.min(imgCount - 1, Math.floor(p * imgCount)) : 0
  return {
    phase: 'dwell', t: tc,
    camera: { lng: node.lng, lat: node.lat, zoom, pitch },
    activeStopIndex: i,
    audio: { stopIndex: i, playing: true, offset: tc - scene.start },
    card: { visible: true, stopIndex: i, imageIndex },
    altitude: node.altitude ?? null,
    overlay: null,
  }
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npm test -- src/utils/flightTimeline.test.js`
Expected: PASS（build + sample 全绿）

- [ ] **Step 5: commit**

```bash
git add src/utils/flightTimeline.js src/utils/flightTimeline.test.js
git commit -m "feat(flight): sampleAt 按时刻输出相机/卡片/音频/海拔/叠加层

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 路线装配 flightStops

从 `trip.plan` 抽出**有旁白的节点**并算出每段 `routeToHere`（优先用已算路线 `day.segments[i].path`，否则相邻节点直线），以及全程总里程。

**Files:**
- Create: `src/utils/flightStops.js`
- Test: `src/utils/flightStops.test.js`

- [ ] **Step 1: 写失败测试**

```js
// src/utils/flightStops.test.js
import { describe, it, expect } from 'vitest'
import { collectNarratedStops, computeTotalDistance } from './flightStops'

// 一个两天的小路书；只给部分节点写旁白
function makePlan() {
  return {
    days: [
      {
        dayNumber: 1,
        segments: null,
        waypoints: [
          { name: 'A', lng: 0, lat: 0, altitude: 100, narration: '甲' },
          { name: 'B', lng: 1, lat: 0, altitude: 200, narration: '' }, // 无旁白，跳过
          { name: 'C', lng: 2, lat: 0, altitude: 300, narration: '丙' },
        ],
      },
      {
        dayNumber: 2,
        segments: null,
        waypoints: [
          { name: 'C', lng: 2, lat: 0, altitude: 300, narration: '' },
          { name: 'D', lng: 3, lat: 0, altitude: 400, narration: '丁' },
        ],
      },
    ],
  }
}

describe('collectNarratedStops', () => {
  it('只收集有旁白的节点，按全局顺序', () => {
    const stops = collectNarratedStops(makePlan())
    expect(stops.map((s) => s.node.name)).toEqual(['A', 'C', 'D'])
  })

  it('首个 stop 的 routeToHere 为空（无飞行）', () => {
    const stops = collectNarratedStops(makePlan())
    expect(stops[0].routeToHere).toEqual([])
  })

  it('routeToHere 串联中间被跳过的节点（直线兜底）', () => {
    const stops = collectNarratedStops(makePlan())
    // A→C 经过 B：A-B 段 + B-C 段，去重接点
    expect(stops[1].routeToHere).toEqual([[0, 0], [1, 0], [2, 0]])
  })

  it('node 带 narration/altitude/images 等字段', () => {
    const s = collectNarratedStops(makePlan())[0].node
    expect(s).toMatchObject({ name: 'A', lng: 0, lat: 0, altitude: 100, narration: '甲' })
    expect(s.images).toEqual([])
  })

  it('优先使用 day.segments[i].path', () => {
    const plan = {
      days: [
        {
          dayNumber: 1,
          segments: [{ fromName: 'A', toName: 'B', path: [[0, 0], [0.5, 0.5], [1, 0]], distance: 1, duration: 1 }],
          waypoints: [
            { name: 'A', lng: 0, lat: 0, altitude: 0, narration: '甲' },
            { name: 'B', lng: 1, lat: 0, altitude: 0, narration: '乙' },
          ],
        },
      ],
    }
    expect(collectNarratedStops(plan)[1].routeToHere).toEqual([[0, 0], [0.5, 0.5], [1, 0]])
  })

  it('无 plan 返回空数组', () => {
    expect(collectNarratedStops(null)).toEqual([])
  })
})

describe('computeTotalDistance', () => {
  it('无 segments 时用直线距离累加', () => {
    expect(computeTotalDistance(makePlan())).toBeGreaterThan(0)
  })
  it('有 segments 时累加 segment.distance', () => {
    const plan = {
      days: [{ dayNumber: 1, segments: [{ distance: 1000 }, { distance: 2000 }], waypoints: [{}, {}, {}] }],
    }
    expect(computeTotalDistance(plan)).toBe(3000)
  })
})
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/utils/flightStops.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```js
// src/utils/flightStops.js
import { haversine } from './geo'

// 把 plan 里所有「有旁白」的节点按全局顺序收集成 stops。
// routeToHere = 上一个有旁白节点 → 当前节点之间、串联沿途各 leg 的折线。
// 每个 leg 优先用同一天的 day.segments[i].path（segments[i] 连接 waypoints[i]→[i+1]），否则两点直线。
export function collectNarratedStops(plan) {
  if (!plan?.days) return []

  const flat = []
  plan.days.forEach((day) => {
    ;(day.waypoints || []).forEach((wp, i) => flat.push({ wp, day, i }))
  })

  const legPath = (k) => {
    const a = flat[k]
    const b = flat[k + 1]
    if (a.day === b.day) {
      const seg = a.day.segments?.[a.i]
      if (seg?.path?.length) return seg.path
    }
    return [[a.wp.lng, a.wp.lat], [b.wp.lng, b.wp.lat]]
  }

  const stops = []
  let prevFlat = -1
  flat.forEach((entry, k) => {
    if (!entry.wp.narration) return
    let routeToHere = []
    if (prevFlat >= 0) {
      for (let j = prevFlat; j < k; j++) {
        const lp = legPath(j)
        routeToHere =
          routeToHere.length && lp.length ? routeToHere.concat(lp.slice(1)) : routeToHere.concat(lp)
      }
    }
    const wp = entry.wp
    stops.push({
      node: {
        lng: wp.lng,
        lat: wp.lat,
        name: wp.name,
        altitude: wp.altitude,
        address: wp.address ?? '',
        note: wp.note ?? '',
        images: Array.isArray(wp.images) ? wp.images : [],
        narration: wp.narration,
      },
      routeToHere,
    })
    prevFlat = k
  })
  return stops
}

// 全程总里程（米）：有 segments 用其 distance，否则相邻节点直线累加
export function computeTotalDistance(plan) {
  if (!plan?.days) return 0
  let total = 0
  for (const day of plan.days) {
    if (day.segments?.length) {
      for (const s of day.segments) total += s.distance || 0
    } else {
      const wps = day.waypoints || []
      for (let i = 0; i < wps.length - 1; i++) {
        total += haversine([wps[i].lng, wps[i].lat], [wps[i + 1].lng, wps[i + 1].lat])
      }
    }
  }
  return total
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npm test -- src/utils/flightStops.test.js`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add src/utils/flightStops.js src/utils/flightStops.test.js
git commit -m "feat(flight): flightStops 收集有旁白节点 + 总里程

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: IndexedDB images store（DB v3）

**Files:**
- Modify: `src/utils/db.js`
- Test: `src/utils/db.test.js`（追加 describe）

- [ ] **Step 1: 追加失败测试**

```js
// 追加到 src/utils/db.test.js
import { putImage, getImage, deleteImage } from './db'

describe('db images', () => {
  it('putImage / getImage 往返', async () => {
    expect(await getImage('img_x')).toBeUndefined()
    const blob = new Blob(['x'], { type: 'image/jpeg' })
    await putImage('img_x', { blob, mime: 'image/jpeg', w: 100, h: 80 })
    const got = await getImage('img_x')
    expect(got.w).toBe(100)
    expect(got.h).toBe(80)
    expect(got.mime).toBe('image/jpeg')
  })

  it('deleteImage 后读取为空', async () => {
    await putImage('img_y', { blob: new Blob(['y']), mime: 'image/jpeg', w: 1, h: 1 })
    await deleteImage('img_y')
    expect(await getImage('img_y')).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/utils/db.test.js`
Expected: FAIL（`putImage` 未导出）

- [ ] **Step 3: 实现（bump 版本 + 新 store + 三个函数）**

`src/utils/db.js` — 把 `const DB_VERSION = 2` 改成 `3`，在 `upgrade` 里增加 images store，并在文件末尾追加三个函数：

```js
const DB_VERSION = 3
```

```js
      upgrade(db) {
        if (!db.objectStoreNames.contains('trip')) db.createObjectStore('trip')
        if (!db.objectStoreNames.contains('routeCache')) db.createObjectStore('routeCache')
        if (!db.objectStoreNames.contains('audioCache')) db.createObjectStore('audioCache')
        if (!db.objectStoreNames.contains('images')) db.createObjectStore('images')
      },
```

```js
// —— 节点图片（按 id 存 Blob，节点只存 id 数组）——
export async function getImage(id) {
  return (await getDb()).get('images', id)
}

export async function putImage(id, entry) {
  return (await getDb()).put('images', entry, id)
}

export async function deleteImage(id) {
  return (await getDb()).delete('images', id)
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npm test -- src/utils/db.test.js`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add src/utils/db.js src/utils/db.test.js
git commit -m "feat(db): DB v3 新增 images store（getImage/putImage/deleteImage）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: image.js — newImageId（单测）+ downscaleImage（手动验）

**Files:**
- Create: `src/utils/image.js`
- Test: `src/utils/image.test.js`

- [ ] **Step 1: 写失败测试（只测纯函数 newImageId）**

```js
// src/utils/image.test.js
import { describe, it, expect } from 'vitest'
import { newImageId } from './image'

describe('newImageId', () => {
  it('以 img_ 前缀开头', () => {
    expect(newImageId()).toMatch(/^img_/)
  })
  it('多次调用不重复', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newImageId()))
    expect(ids.size).toBe(50)
  })
})
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/utils/image.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现（newImageId 可测；downscaleImage 浏览器专用，随附）**

```js
// src/utils/image.js
let counter = 0

// 唯一图片 id：时间戳 + 自增 + 随机，确保同一毫秒多次调用也不撞
export function newImageId() {
  counter = (counter + 1) % 1e6
  return `img_${Date.now().toString(36)}_${counter.toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

// 浏览器专用：把上传文件等比缩放到最长边 maxEdge，输出 JPEG。测试不覆盖（无 canvas）。
export async function downscaleImage(file, maxEdge = 1280, quality = 0.82) {
  const bitmap = await createImageBitmap(file)
  let w = bitmap.width
  let h = bitmap.height
  const scale = Math.min(1, maxEdge / Math.max(w, h))
  w = Math.round(w * scale)
  h = Math.round(h * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality))
  bitmap.close?.()
  return { blob, mime: 'image/jpeg', w, h }
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npm test -- src/utils/image.test.js`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add src/utils/image.js src/utils/image.test.js
git commit -m "feat(image): newImageId（单测）+ downscaleImage canvas 压缩

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: trip store 节点 note / images

**Files:**
- Modify: `src/stores/trip.js`
- Test: `src/stores/trip.test.js`（追加 describe）

- [ ] **Step 1: 追加失败测试**

```js
// 追加到 src/stores/trip.test.js（文件已有 setActivePinia(createPinia()) 的 beforeEach）
describe('trip store 节点 note/images', () => {
  it('归一化为每个节点补 note=\"\" 与 images=[]', () => {
    const t = useTripStore()
    t.loadPreset318()
    const wp = t.plan.days[0].waypoints[0]
    expect(wp.note).toBe('')
    expect(wp.images).toEqual([])
  })

  it('setNote 设置备注', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.setNote(1, 0, '  山路十八弯  ')
    expect(t.plan.days[0].waypoints[0].note).toBe('山路十八弯')
  })

  it('addImage / removeImage / setImages', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.addImage(1, 0, 'img_a')
    t.addImage(1, 0, 'img_b')
    expect(t.plan.days[0].waypoints[0].images).toEqual(['img_a', 'img_b'])
    t.removeImage(1, 0, 'img_a')
    expect(t.plan.days[0].waypoints[0].images).toEqual(['img_b'])
    t.setImages(1, 0, ['img_b', 'img_c'])
    expect(t.plan.days[0].waypoints[0].images).toEqual(['img_b', 'img_c'])
  })

  it('importJson 不丢 note/images（归一化补齐）', () => {
    const t = useTripStore()
    t.importJson(JSON.stringify({ name: 'x', days: [{ waypoints: [{ name: 'A', lng: 1, lat: 2 }] }] }))
    expect(t.plan.days[0].waypoints[0].images).toEqual([])
    expect(t.plan.days[0].waypoints[0].note).toBe('')
  })
})
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/stores/trip.test.js`
Expected: FAIL（`setNote` 不是函数 / note 为 undefined）

- [ ] **Step 3: 实现**

在 `normalizeDay` 的 waypoint 映射里补两个字段：

```js
    waypoints: (day.waypoints ?? []).map((w) => ({
      ...w,
      narration: w.narration ?? '',
      prevNarration: w.prevNarration ?? '',
      address: w.address ?? '',
      note: w.note ?? '',
      images: Array.isArray(w.images) ? w.images : [],
    })),
```

在 `// —— 旁白 ——` 区块附近新增 actions（紧跟 `restorePrevNarration` 之后即可）：

```js
  // —— 节点备注 / 图片（动画信息卡用）——
  function setNote(dayNumber, index, text) {
    const day = findDay(dayNumber)
    const wp = day?.waypoints[index]
    if (wp) wp.note = text.trim()
  }

  function addImage(dayNumber, index, imageId) {
    const day = findDay(dayNumber)
    const wp = day?.waypoints[index]
    if (wp && !wp.images.includes(imageId)) wp.images.push(imageId)
  }

  function removeImage(dayNumber, index, imageId) {
    const day = findDay(dayNumber)
    const wp = day?.waypoints[index]
    if (wp) wp.images = wp.images.filter((id) => id !== imageId)
  }

  function setImages(dayNumber, index, ids) {
    const day = findDay(dayNumber)
    const wp = day?.waypoints[index]
    if (wp) wp.images = [...ids]
  }
```

在 `return { ... }` 里追加导出：`setNote, addImage, removeImage, setImages,`

- [ ] **Step 4: 运行，确认通过**

Run: `npm test -- src/stores/trip.test.js`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add src/stores/trip.js src/stores/trip.test.js
git commit -m "feat(trip): 节点 note/images 数据模型与 actions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: settings 天地图 key

**Files:**
- Modify: `src/stores/settings.js`
- Test: `src/stores/settings.test.js`（追加用例）
- Modify: `src/views/SettingsView.vue`（手动验证表单）

- [ ] **Step 1: 追加失败测试**

```js
// 追加到 src/stores/settings.test.js 内的 describe('settings store', ...)
  it('天地图 key：默认空、可写回 localStorage、hasTiandituKey 反映状态', () => {
    const s = useSettingsStore()
    expect(s.tiandituKey).toBe('')
    expect(s.hasTiandituKey).toBe(false)
    s.setTiandituKey('  tdt-123  ')
    expect(s.tiandituKey).toBe('tdt-123')
    expect(s.hasTiandituKey).toBe(true)
    expect(localStorage.getItem('318:tiandituKey')).toBe('tdt-123')
  })
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/stores/settings.test.js`
Expected: FAIL（`tiandituKey` 为 undefined）

- [ ] **Step 3: 实现 settings store**

`src/stores/settings.js`：

- `KEYS` 增加：`tiandituKey: '318:tiandituKey',`
- 新增 ref：`const tiandituKey = ref(localStorage.getItem(KEYS.tiandituKey) || '')`
- 新增 computed：`const hasTiandituKey = computed(() => tiandituKey.value.trim().length > 0)`
- 新增 action：

```js
  function setTiandituKey(v) {
    tiandituKey.value = v.trim()
    localStorage.setItem(KEYS.tiandituKey, tiandituKey.value)
  }
```

- `return { ... }` 追加：`tiandituKey, hasTiandituKey, setTiandituKey,`

- [ ] **Step 4: 运行，确认通过**

Run: `npm test -- src/stores/settings.test.js`
Expected: PASS

- [ ] **Step 5: SettingsView 加输入（手动验证，无单测）**

`src/views/SettingsView.vue`：

`<script setup>` 内 `const llmInput = ref(settings.llmKey)` 之后加：

```js
const tiandituInput = ref(settings.tiandituKey)
```

`save()` 内加一行：`settings.setTiandituKey(tiandituInput.value)`

在 DeepSeek 那个 `<div>` 之后、`<div class="flex items-center gap-3">` 之前插入：

```html
      <div>
        <label class="block text-sm font-medium mb-1">天地图 API Key（飞行动画底图）</label>
        <input
          v-model="tiandituInput"
          type="text"
          placeholder="在天地图开放平台申请的浏览器端 tk"
          class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-accent focus:outline-none text-sm"
        />
        <p class="text-xs text-gray-400 mt-1">
          前往 <a href="https://console.tianditu.gov.cn/" target="_blank" class="text-accent">天地图开放平台</a> 申请「浏览器端」key；飞行动画底图（WGS-84，与路线零偏移）使用它。
        </p>
      </div>
```

- [ ] **Step 6: 手动验证**

`npm run dev` → 设置页 → 填天地图 key → 保存 → 刷新页面仍在（localStorage）。

- [ ] **Step 7: commit**

```bash
git add src/stores/settings.js src/stores/settings.test.js src/views/SettingsView.vue
git commit -m "feat(settings): 天地图 key 配置项

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: flight store —— buildFromPlan

收集有旁白节点 → 查 `audioCache` 拿每段音频 Blob+时长 → 缺音频则标记 `needsSynth` 并拒绝构建 → 否则装配时间轴并保存 Blob。

**Files:**
- Create: `src/stores/flight.js`
- Test: `src/stores/flight.test.js`

- [ ] **Step 1: 写失败测试（mock db 的 getCachedAudio）**

```js
// src/stores/flight.test.js
import 'fake-indexeddb/auto'
import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// 默认所有音频都命中缓存（每段 2 秒）
const audioStore = new Map()
vi.mock('../utils/db', () => ({
  getCachedAudio: vi.fn(async (k) =>
    audioStore.has(k) ? audioStore.get(k) : { blob: new Blob(['x'], { type: 'audio/mpeg' }), duration: 2 },
  ),
}))

import { useFlightStore } from './flight'
import { useTripStore } from './trip'
import { audioKey } from '../composables/useTts'

describe('flight store buildFromPlan', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    audioStore.clear()
  })

  it('全部命中缓存 → 构建出时间轴、needsSynth 为空', async () => {
    const trip = useTripStore()
    trip.loadPreset318()
    trip.loadPresetNarration()
    const flight = useFlightStore()
    const ok = await flight.buildFromPlan()
    expect(ok).toBe(true)
    expect(flight.timeline.totalDuration).toBeGreaterThan(0)
    expect(flight.needsSynth).toEqual([])
    // 片头标题来自路书名
    expect(flight.timeline.intro.title).toContain('318')
    // 片尾包含里程/天数信息
    expect(flight.timeline.outro.lines.join(' ')).toMatch(/天/)
  })

  it('无旁白 → 返回 false 且给出错误', async () => {
    const trip = useTripStore()
    trip.loadPreset318() // 未写旁白
    const flight = useFlightStore()
    const ok = await flight.buildFromPlan()
    expect(ok).toBe(false)
    expect(flight.error).toBeTruthy()
  })

  it('部分节点缺音频 → needsSynth 列出名字、返回 false', async () => {
    const { getCachedAudio } = await import('../utils/db')
    const trip = useTripStore()
    trip.loadPreset318()
    trip.loadPresetNarration()
    const firstWp = trip.plan.days[0].waypoints[0]
    const missingKey = audioKey(firstWp.narration, trip.plan.voice, trip.plan.rate)
    getCachedAudio.mockImplementation(async (k) =>
      k === missingKey ? undefined : { blob: new Blob(['x'], { type: 'audio/mpeg' }), duration: 2 },
    )
    const flight = useFlightStore()
    const ok = await flight.buildFromPlan()
    expect(ok).toBe(false)
    expect(flight.needsSynth).toContain(firstWp.name)
  })
})
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/stores/flight.test.js`
Expected: FAIL（`./flight` 不存在）

- [ ] **Step 3: 实现 flight store（本任务只写 state + buildFromPlan；播放在 Task 11）**

```js
// src/stores/flight.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useTripStore } from './trip'
import { audioKey } from '../composables/useTts'
import { getCachedAudio } from '../utils/db'
import { collectNarratedStops, computeTotalDistance } from '../utils/flightStops'
import { buildFlightTimeline, sampleAt } from '../utils/flightTimeline'
import { formatDistance } from '../utils/format'

export const useFlightStore = defineStore('flight', () => {
  const timeline = ref(null)
  const audioBlobs = ref([]) // 按 stopIndex 索引的音频 Blob
  const t = ref(0)
  const playing = ref(false)
  const speed = ref(1)
  const sample = ref(null)
  const needsSynth = ref([])
  const error = ref('')

  const totalDuration = computed(() => timeline.value?.totalDuration ?? 0)
  const progress = computed(() => (totalDuration.value ? t.value / totalDuration.value : 0))

  // 收集有旁白节点 → 查音频缓存 → 装配时间轴。成功返回 true。
  async function buildFromPlan() {
    error.value = ''
    needsSynth.value = []
    const trip = useTripStore()
    if (!trip.plan) {
      error.value = '还没有路书'
      return false
    }
    const stops0 = collectNarratedStops(trip.plan)
    if (!stops0.length) {
      error.value = '没有任何带旁白的节点，请先在旁白工作台撰写并合成'
      return false
    }

    const { voice, rate } = trip.plan
    const stops = []
    const blobs = []
    const missing = []
    for (const s of stops0) {
      const cached = await getCachedAudio(audioKey(s.node.narration, voice, rate))
      if (cached && cached.blob && cached.blob.size > 0) {
        stops.push({ ...s, audioDuration: cached.duration })
        blobs.push(cached.blob)
      } else {
        missing.push(s.node.name)
      }
    }
    if (missing.length) {
      needsSynth.value = missing
      error.value = `有 ${missing.length} 个节点尚未合成语音，请先在旁白工作台「批量合成」`
      return false
    }

    const totalMeters = computeTotalDistance(trip.plan)
    const tl = buildFlightTimeline(stops, {
      intro: { title: trip.plan.name, subtitle: trip.plan.description },
      outro: {
        lines: [`共 ${trip.plan.days.length} 天`, `总里程约 ${formatDistance(totalMeters)}`, `${stops.length} 处讲解`],
      },
    })
    loadTimeline(tl, blobs)
    return true
  }

  // 直接载入已装配的时间轴与音频（buildFromPlan 内部用；也便于单测注入）
  let adapter = null
  let audioStop = -1
  function loadTimeline(tl, blobs) {
    timeline.value = tl
    audioBlobs.value = blobs || []
    t.value = 0
    audioStop = -1
    applySample()
  }

  // —— 播放相关在 Task 11 实现 —— 先放占位，确保导出稳定
  function applySample() {
    if (!timeline.value) return
    sample.value = sampleAt(timeline.value, t.value)
  }
  function attach(a) {
    adapter = a
    applySample()
  }

  return {
    timeline, audioBlobs, t, playing, speed, sample, needsSynth, error,
    totalDuration, progress,
    buildFromPlan, loadTimeline, attach,
  }
})
```

> 说明：`adapter`/`audioStop` 等私有变量本任务先声明，Task 11 会填充播放逻辑。`applySample` 此刻只更新 `sample`。

- [ ] **Step 4: 运行，确认通过**

Run: `npm test -- src/stores/flight.test.js`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add src/stores/flight.js src/stores/flight.test.js
git commit -m "feat(flight): flight store buildFromPlan（查音频缓存+装配时间轴+needsSynth）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: flight store —— 播放（attach/tick/play/pause/seek/setSpeed）

用可注入的 `tick(dt)` 推进时间（生产用 rAF，测试用假时钟），把相机/音频副作用委托给注入的 adapter。

**Files:**
- Modify: `src/stores/flight.js`
- Test: `src/stores/flight.test.js`（追加 describe）

- [ ] **Step 1: 追加失败测试**

```js
// 追加到 src/stores/flight.test.js
import { buildFlightTimeline } from '../utils/flightTimeline'

function tinyTimeline() {
  // intro 3 | dwell A (2+1=3) | fly B 2.5 | dwell B (3+1=4) | outro 4 = 16.5
  const stops = [
    { node: { lng: 0, lat: 0, name: 'A', altitude: 100, images: [] }, audioDuration: 2, routeToHere: [] },
    { node: { lng: 1, lat: 0, name: 'B', altitude: 200, images: [] }, audioDuration: 3, routeToHere: [[0, 0], [1, 0]] },
  ]
  return buildFlightTimeline(stops, {
    introDuration: 3, flyDuration: 2.5, outroDuration: 4, dwellPadding: 1,
    intro: { title: 'T', subtitle: '' }, outro: { lines: [] },
  })
}

describe('flight store 播放', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function setup() {
    const flight = useFlightStore()
    const adapter = { setCamera: vi.fn(), playAudio: vi.fn(), stopAudio: vi.fn() }
    const blob0 = new Blob(['0'])
    const blob1 = new Blob(['1'])
    flight.attach(adapter)
    flight.loadTimeline(tinyTimeline(), [blob0, blob1])
    return { flight, adapter, blob0, blob1 }
  }

  it('载入后立刻把相机设到 t=0（intro）', () => {
    const { adapter } = setup()
    expect(adapter.setCamera).toHaveBeenCalled()
  })

  it('seek 进 dwell A → 播放 blob0、offset 正确', () => {
    const { flight, adapter, blob0 } = setup()
    flight.seek(4) // dwell A 始于 3
    expect(adapter.playAudio).toHaveBeenCalledWith(blob0, 1)
    expect(flight.sample.phase).toBe('dwell')
  })

  it('seek 离开 dwell → 停止音频', () => {
    const { flight, adapter } = setup()
    flight.seek(4)
    flight.seek(1) // 回到 intro
    expect(adapter.stopAudio).toHaveBeenCalled()
  })

  it('play + tick 推进时间，到末尾自动停止并夹在 totalDuration', () => {
    const { flight } = setup()
    flight.play()
    flight.tick(4) // t=4 → dwell A
    expect(flight.sample.phase).toBe('dwell')
    flight.tick(100) // 越过末尾
    expect(flight.playing).toBe(false)
    expect(flight.t).toBeCloseTo(flight.totalDuration, 6)
  })

  it('setSpeed 影响推进步长', () => {
    const { flight } = setup()
    flight.setSpeed(2)
    flight.play()
    flight.tick(1) // 实际推进 2 秒
    expect(flight.t).toBeCloseTo(2, 6)
  })

  it('暂停后 tick 不再推进', () => {
    const { flight } = setup()
    flight.play()
    flight.tick(1)
    flight.pause()
    const frozen = flight.t
    flight.tick(5)
    expect(flight.t).toBe(frozen)
  })
})
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/stores/flight.test.js`
Expected: FAIL（`seek`/`tick`/`play` 未定义）

- [ ] **Step 3: 实现（替换 Task 10 的占位 applySample/attach，补全播放）**

把 flight.js 里「`// —— 播放相关在 Task 11 实现 ——`」整段（含占位 `applySample`、`attach` 与 `return`）替换为：

```js
  let rafId = null

  // 把当前 t 的采样应用到 adapter：移动相机 + 按需播/停音频
  function applySample() {
    if (!timeline.value) return
    const s = sampleAt(timeline.value, t.value)
    sample.value = s
    if (!adapter) return
    adapter.setCamera(s.camera)
    if (s.audio.playing) {
      if (s.audio.stopIndex !== audioStop) {
        audioStop = s.audio.stopIndex
        const b = audioBlobs.value[audioStop]
        if (b) adapter.playAudio(b, s.audio.offset)
      }
    } else if (audioStop !== -1) {
      audioStop = -1
      adapter.stopAudio()
    }
  }

  function attach(a) {
    adapter = a
    applySample()
  }
  function detach() {
    pause()
    adapter = null
  }

  // 假时钟可直接调用；rAF 循环每帧也调它
  function tick(dt) {
    if (!playing.value || !timeline.value) return
    const nt = t.value + dt * speed.value
    if (nt >= timeline.value.totalDuration) {
      t.value = timeline.value.totalDuration
      playing.value = false
      applySample()
      return
    }
    t.value = nt
    applySample()
  }

  function startLoop() {
    if (typeof requestAnimationFrame === 'undefined') return // node 测试环境：靠手动 tick
    let prev = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const step = (ts) => {
      tick((ts - prev) / 1000)
      prev = ts
      if (playing.value) rafId = requestAnimationFrame(step)
    }
    rafId = requestAnimationFrame(step)
  }

  function play() {
    if (!timeline.value) return
    if (t.value >= timeline.value.totalDuration) {
      t.value = 0
      audioStop = -1
    }
    playing.value = true
    startLoop()
  }

  function pause() {
    playing.value = false
    if (rafId != null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(rafId)
    rafId = null
    if (adapter) adapter.stopAudio()
    audioStop = -1
  }

  function seek(tv) {
    if (!timeline.value) return
    t.value = Math.max(0, Math.min(tv, timeline.value.totalDuration))
    audioStop = -1
    if (adapter) adapter.stopAudio()
    applySample()
  }

  function setSpeed(s) {
    speed.value = s
  }

  return {
    timeline, audioBlobs, t, playing, speed, sample, needsSynth, error,
    totalDuration, progress,
    buildFromPlan, loadTimeline, attach, detach, tick, play, pause, seek, setSpeed,
  }
})
```

> 注意：删掉 Task 10 里原先那段占位 `function applySample(){...}` / `function attach(){...}` / `return {...}`，避免重复定义。`adapter`、`audioStop` 的 `let` 声明（Task 10 已写在 `loadTimeline` 上方）保留。

- [ ] **Step 4: 运行，确认通过**

Run: `npm test -- src/stores/flight.test.js`
Expected: PASS（buildFromPlan + 播放全绿）

- [ ] **Step 5: 跑全量测试确认未回归**

Run: `npm test`
Expected: PASS（全部既有 + 新增）

- [ ] **Step 6: commit**

```bash
git add src/stores/flight.js src/stores/flight.test.js
git commit -m "feat(flight): flight store 播放（tick/play/pause/seek/setSpeed + adapter 注入）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: MapLibre + 天地图适配器 useMapLibre.js（手动验证）

浏览器专属，无单测。提供 `setCamera`/`drawRoute`/`destroy`，是 flight store adapter 的"相机"部分。

**Files:**
- Modify: `package.json`（依赖 maplibre-gl）
- Create: `src/composables/useMapLibre.js`

- [ ] **Step 1: 安装 maplibre-gl**

Run: `npm install maplibre-gl`
Expected: `package.json` 的 `dependencies` 出现 `maplibre-gl`，`npm install` 无错。

- [ ] **Step 2: 实现适配器**

```js
// src/composables/useMapLibre.js
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// 天地图 WMTS 瓦片（Web Mercator "w"）。MapLibre 不支持 {s}，手动展开子域 t0~t7。
function tdtTiles(layer, tk) {
  return ['0', '1', '2', '3', '4', '5', '6', '7'].map(
    (s) =>
      `https://t${s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
      `&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles` +
      `&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${tk}`,
  )
}

// 建一张只读（不可手势交互）的天地图，供逐帧 jumpTo 驱动。
export function createFlightMap({ container, tk, center = [102, 30], onError }) {
  const style = {
    version: 8,
    sources: {
      img: { type: 'raster', tiles: tdtTiles('img', tk), tileSize: 256 }, // 影像
      cia: { type: 'raster', tiles: tdtTiles('cia', tk), tileSize: 256 }, // 中文注记
    },
    layers: [
      { id: 'img', type: 'raster', source: 'img' },
      { id: 'cia', type: 'raster', source: 'cia' },
    ],
  }

  const map = new maplibregl.Map({
    container,
    style,
    center,
    zoom: 8,
    pitch: 60,
    attributionControl: false,
    interactive: false, // 相机完全由动画驱动
  })
  if (onError) map.on('error', (e) => onError(e?.error?.message || '天地图瓦片加载失败（检查网络/VPN/key）'))

  function setCamera({ lng, lat, zoom, pitch, bearing }) {
    map.jumpTo({ center: [lng, lat], zoom, pitch, bearing: bearing ?? 0 })
  }

  // paths: [[ [lng,lat]... ], ...] 多段路线折线
  function drawRoute(paths) {
    const features = (paths || [])
      .filter((p) => p && p.length > 1)
      .map((p) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: p }, properties: {} }))
    const data = { type: 'FeatureCollection', features }
    const add = () => {
      if (map.getSource('route')) {
        map.getSource('route').setData(data)
        return
      }
      map.addSource('route', { type: 'geojson', data })
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#ff5a36', 'line-width': 3, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })
    }
    if (map.isStyleLoaded()) add()
    else map.once('load', add)
  }

  function destroy() {
    try {
      map.remove()
    } catch {
      /* 忽略 */
    }
  }

  return { map, setCamera, drawRoute, destroy }
}
```

- [ ] **Step 3: 构建确认依赖可解析**

Run: `npm run build`
Expected: 构建成功（maplibre-gl 被打包，无解析错误）。

- [ ] **Step 4: commit**

```bash
git add package.json package-lock.json src/composables/useMapLibre.js
git commit -m "feat(flight): MapLibre + 天地图适配器 useMapLibre（setCamera/drawRoute）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: FlightPlayer.vue（手动验证）

16:9 画布 = MapLibre 地图 + 叠加层（信息卡含 Ken Burns 轮播、海拔 HUD、片头/片尾卡）+ 控件（▶/⏸、进度条、时间、倍速）。组件创建 adapter（相机用 useMapLibre，音频用 `<audio>`）并 attach 给 flight store。

**Files:**
- Create: `src/components/FlightPlayer.vue`

- [ ] **Step 1: 实现组件**

```vue
<!-- src/components/FlightPlayer.vue -->
<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useFlightStore } from '../stores/flight'
import { useSettingsStore } from '../stores/settings'
import { createFlightMap } from '../composables/useMapLibre'
import { getImage } from '../utils/db'

const emit = defineEmits(['close'])
const flight = useFlightStore()
const settings = useSettingsStore()

const mapEl = ref(null)
const state = ref('loading') // loading | no-key | error | ready
const mapError = ref('')
let mapAdapter = null
let audioEl = null

const sample = computed(() => flight.sample)
const card = computed(() => sample.value?.card)
const overlay = computed(() => sample.value?.overlay)
const altitude = computed(() => sample.value?.altitude)
const showAltitude = computed(
  () => altitude.value != null && ['fly', 'dwell'].includes(sample.value?.phase),
)

// 当前卡片对应的节点（取名/地址/备注）
const activeNode = computed(() => {
  const i = card.value?.stopIndex
  if (i == null || i < 0) return null
  return flight.timeline?.stops?.[i]?.node ?? null
})

function fmt(sec) {
  if (!Number.isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// —— 图片轮播：卡片切换节点时加载该节点图片 Blob → objectURL —— 
const imgUrls = ref([])
function revokeImgs() {
  imgUrls.value.forEach((u) => URL.revokeObjectURL(u))
  imgUrls.value = []
}
watch(
  () => card.value?.stopIndex,
  async (idx) => {
    revokeImgs()
    if (idx == null || idx < 0) return
    const ids = flight.timeline?.stops?.[idx]?.node?.images || []
    const urls = []
    for (const id of ids) {
      const e = await getImage(id)
      if (e?.blob) urls.push(URL.createObjectURL(e.blob))
    }
    imgUrls.value = urls
  },
)
const currentImg = computed(() => imgUrls.value[card.value?.imageIndex ?? 0] || null)

function buildAdapter() {
  return {
    setCamera: (cam) => mapAdapter?.setCamera(cam),
    playAudio: (blob, offset) => {
      stopAudioEl()
      audioEl = new Audio(URL.createObjectURL(blob))
      audioEl.currentTime = offset || 0
      audioEl.play().catch(() => {})
    },
    stopAudio: stopAudioEl,
  }
}
function stopAudioEl() {
  if (audioEl) {
    try {
      audioEl.pause()
    } catch {
      /* 忽略 */
    }
    audioEl = null
  }
}

onMounted(async () => {
  if (!settings.tiandituKey) {
    state.value = 'no-key'
    return
  }
  const ok = await flight.buildFromPlan()
  if (!ok) {
    state.value = 'error'
    return
  }
  // 初始相机 = 首节点
  const first = flight.timeline.stops[0].node
  mapAdapter = createFlightMap({
    container: mapEl.value,
    tk: settings.tiandituKey,
    center: [first.lng, first.lat],
    onError: (m) => {
      mapError.value = m
    },
  })
  // 画全程路线
  mapAdapter.drawRoute(flight.timeline.stops.map((s) => s.routeToHere).filter((p) => p.length > 1))
  flight.attach(buildAdapter())
  flight.seek(0)
  state.value = 'ready'
})

onBeforeUnmount(() => {
  flight.pause()
  flight.detach()
  stopAudioEl()
  revokeImgs()
  mapAdapter?.destroy()
})

function toggle() {
  flight.playing ? flight.pause() : flight.play()
}
</script>

<template>
  <div class="absolute inset-0 flex flex-col bg-black">
    <!-- 顶栏 -->
    <div class="flex items-center justify-between px-3 py-2 text-white/80 text-sm bg-black/40">
      <span>飞行动画预览</span>
      <button class="px-2 py-0.5 rounded hover:bg-white/10" @click="emit('close')">✕ 关闭</button>
    </div>

    <!-- 16:9 舞台 -->
    <div class="flex-1 flex items-center justify-center overflow-hidden">
      <div class="relative w-full" style="aspect-ratio:16/9; max-height:100%">
        <div ref="mapEl" class="absolute inset-0"></div>

        <!-- 瓦片错误提示 -->
        <p v-if="mapError" class="absolute top-2 left-2 right-2 text-xs text-red-200 bg-red-900/60 rounded px-2 py-1">
          {{ mapError }}
        </p>

        <!-- 状态：无 key / 错误 -->
        <div v-if="state === 'no-key'" class="absolute inset-0 flex items-center justify-center text-center text-white/80 p-6">
          <div>
            <p class="mb-2">尚未配置天地图 key。</p>
            <RouterLink to="/settings" class="text-accent underline">前往「设置」填写 →</RouterLink>
          </div>
        </div>
        <div v-else-if="state === 'error'" class="absolute inset-0 flex items-center justify-center text-center text-white/80 p-6">
          <div>
            <p class="mb-2">{{ flight.error }}</p>
            <ul v-if="flight.needsSynth.length" class="text-xs text-white/60">
              <li v-for="n in flight.needsSynth" :key="n">· {{ n }}</li>
            </ul>
          </div>
        </div>

        <!-- 片头/片尾叠加层 -->
        <div
          v-if="overlay?.kind === 'intro'"
          class="absolute inset-0 flex flex-col items-center justify-center bg-black/35 text-white text-center px-8"
        >
          <h2 class="text-3xl font-bold drop-shadow">{{ overlay.title }}</h2>
          <p v-if="overlay.subtitle" class="mt-2 text-white/80">{{ overlay.subtitle }}</p>
        </div>
        <div
          v-else-if="overlay?.kind === 'outro'"
          class="absolute inset-0 flex flex-col items-center justify-center bg-black/45 text-white text-center gap-1"
        >
          <p v-for="(l, i) in overlay.lines" :key="i" :class="i === 0 ? 'text-2xl font-bold' : 'text-white/80'">{{ l }}</p>
        </div>

        <!-- 海拔 HUD -->
        <div v-if="showAltitude" class="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-black/50 text-white text-sm">
          海拔 <span class="font-semibold">{{ altitude }}</span> m
        </div>

        <!-- 节点信息卡 + 图片轮播 -->
        <div
          v-if="card?.visible && activeNode"
          class="absolute left-4 bottom-16 w-72 rounded-xl overflow-hidden bg-black/55 text-white shadow-lg backdrop-blur-sm"
        >
          <div v-if="currentImg" class="relative h-40 overflow-hidden">
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

        <!-- 控件条 -->
        <div v-if="state === 'ready'" class="absolute left-0 right-0 bottom-0 flex items-center gap-3 px-4 py-2 bg-black/50 text-white">
          <button class="w-8 text-lg" @click="toggle">{{ flight.playing ? '⏸' : '▶' }}</button>
          <input
            type="range"
            class="flex-1"
            min="0"
            :max="flight.totalDuration"
            step="0.1"
            :value="flight.t"
            @input="flight.seek(Number($event.target.value))"
          />
          <span class="text-xs tabular-nums">{{ fmt(flight.t) }} / {{ fmt(flight.totalDuration) }}</span>
          <select
            :value="flight.speed"
            @change="flight.setSpeed(Number($event.target.value))"
            class="bg-transparent border border-white/30 rounded text-xs px-1 py-0.5"
          >
            <option class="text-black" :value="0.5">0.5x</option>
            <option class="text-black" :value="1">1x</option>
            <option class="text-black" :value="1.5">1.5x</option>
            <option class="text-black" :value="2">2x</option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes kenburns {
  from { transform: scale(1) translate(0, 0); }
  to { transform: scale(1.12) translate(-2%, -2%); }
}
.kb-img { animation: kenburns 6s ease-out forwards; }
</style>
```

- [ ] **Step 2: 构建确认无语法错误**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 3: commit**

```bash
git add src/components/FlightPlayer.vue
git commit -m "feat(flight): FlightPlayer 16:9 画布+信息卡轮播+海拔HUD+片头尾+控件

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 14: NarrationDayCard 加图片上传 + 备注（手动验证）

每个节点增加：备注输入框 + 图片缩略图（上传/删除）。上传走 `downscaleImage` 压缩 → `putImage` 存库 → `trip.addImage` 记 id。

**Files:**
- Modify: `src/components/NarrationDayCard.vue`

- [ ] **Step 1: 在 `<script setup>` 顶部补依赖**

在现有 import 之后加：

```js
import { reactive } from 'vue'
import { downscaleImage, newImageId } from '../utils/image'
import { putImage, getImage, deleteImage } from '../utils/db'
```

- [ ] **Step 2: 在 `<script setup>` 内补缩略图加载与上传逻辑**

```js
// 缩略图 objectURL 缓存：key=imageId
const thumbs = reactive({})
async function ensureThumb(id) {
  if (thumbs[id]) return
  const e = await getImage(id)
  if (e?.blob) thumbs[id] = URL.createObjectURL(e.blob)
}
// 每次渲染节点时把其图片的缩略图准备好
function loadThumbs() {
  for (const w of props.day.waypoints) for (const id of w.images || []) ensureThumb(id)
}
loadThumbs()

async function onUpload(i, ev) {
  const files = Array.from(ev.target.files || [])
  ev.target.value = '' // 允许重复选同一文件
  error.value = ''
  busy.value = `${props.day.dayNumber}-${i}`
  try {
    for (const file of files) {
      const { blob, mime, w, h } = await downscaleImage(file)
      const id = newImageId()
      await putImage(id, { blob, mime, w, h })
      trip.addImage(props.day.dayNumber, i, id)
      await ensureThumb(id)
    }
  } catch (e) {
    error.value = '图片处理失败：' + e.message
  } finally {
    busy.value = ''
  }
}

async function onRemoveImage(i, id) {
  trip.removeImage(props.day.dayNumber, i, id)
  await deleteImage(id)
  if (thumbs[id]) {
    URL.revokeObjectURL(thumbs[id])
    delete thumbs[id]
  }
}
```

- [ ] **Step 3: 在 `<template>` 节点的 `<textarea>` 之后插入备注框 + 图片区**

把节点循环里 `</textarea>` 之后、`</div>`（v-for 项的闭合）之前插入：

```html
        <textarea
          :value="w.note"
          @change="trip.setNote(day.dayNumber, i, $event.target.value)"
          rows="1"
          placeholder="节点备注（信息卡显示，可选）"
          class="w-full px-2 py-1 rounded border border-gray-100 focus:border-accent focus:outline-none text-[11px] resize-y text-gray-500"
        ></textarea>

        <div class="flex flex-wrap items-center gap-1.5">
          <div v-for="id in w.images" :key="id" class="relative group">
            <img v-if="thumbs[id]" :src="thumbs[id]" class="w-12 h-12 object-cover rounded border border-gray-200" alt="" />
            <div v-else class="w-12 h-12 rounded border border-gray-200 bg-gray-50"></div>
            <button
              class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/60 text-white text-[10px] leading-none opacity-0 group-hover:opacity-100 transition"
              title="删除图片"
              @click="onRemoveImage(i, id)"
            >×</button>
          </div>
          <label class="w-12 h-12 rounded border border-dashed border-gray-300 flex items-center justify-center text-gray-300 text-lg cursor-pointer hover:border-accent hover:text-accent transition">
            +
            <input type="file" accept="image/*" multiple class="hidden" @change="onUpload(i, $event)" />
          </label>
        </div>
```

- [ ] **Step 4: 手动验证**

`npm run dev` → 视频工作室 → 展开某天 → 某节点上传 1~2 张图 → 出现缩略图；删除可移除；刷新页面后缩略图仍在（库里持久）；备注输入后刷新仍在。

- [ ] **Step 5: commit**

```bash
git add src/components/NarrationDayCard.vue
git commit -m "feat(narration): 节点图片上传/缩略图/删除 + 备注（动画信息卡素材）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 15: StudioView 接入预览入口 + CHANGELOG + 全量验证 + 版本说明

**Files:**
- Modify: `src/views/StudioView.vue`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: StudioView 主区接入 FlightPlayer**

`<script setup>` 顶部 import 增加：

```js
import FlightPlayer from '../components/FlightPlayer.vue'
```

`<script setup>` 内增加状态与入口：

```js
const showPlayer = ref(false)
function startPreview() {
  uiError.value = ''
  if (narratedCount.value === 0) {
    uiError.value = '请先撰写并「批量合成」旁白，再预览飞行动画'
    return
  }
  showPlayer.value = true
}
```

把模板里原占位主区：

```html
    <div class="flex-1 flex items-center justify-center text-gray-300 text-sm p-6 text-center">
      旁白写好并合成后，Phase 4 将在这里用音频时长驱动飞行动画预览。
    </div>
```

替换为：

```html
    <div class="flex-1 relative">
      <FlightPlayer v-if="showPlayer" @close="showPlayer = false" />
      <div v-else class="h-full flex flex-col items-center justify-center gap-3 text-gray-400 text-sm p-6 text-center">
        <p>旁白写好并「批量合成」后，预览与语音同步的飞行动画。</p>
        <button
          @click="startPreview"
          class="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition"
        >▶ 预览飞行动画</button>
        <p class="text-xs text-gray-300">需先在「设置」配置天地图 key</p>
      </div>
    </div>
```

- [ ] **Step 2: 手动验证完整链路**

`npm run dev`，准备：设置页填好天地图 key；工作室加载 318 预设 → 加载预设文案（或 AI 生成）→ 批量合成全部旁白（等完成 ✓）。然后：

1. 点「▶ 预览飞行动画」→ 进入 16:9 播放器，天地图底图出现、路线红线贴合。
2. 自动从片头标题开始 → 飞到首节点 → 停留并播报语音、信息卡浮现（有图则 Ken Burns 轮播）→ 飞下一段……→ 片尾里程卡。
3. 海拔 HUD 在飞行/停留时显示并随高度变化。
4. ▶/⏸ 可暂停继续；拖进度条可跳转（音频随之切换）；倍速 0.5/1/1.5/2 生效。
5. 关闭返回；未配 key 时给出去设置页提示；漏合成节点时列出待合成节点名。

把验证结论（通过/问题）记到本任务备注，问题就地修复后重验。

- [ ] **Step 3: 更新 CHANGELOG**

在 `CHANGELOG.md` 顶部加 `0.4.0` 段（沿用既有格式），要点：

```markdown
## [0.4.0] - 2026-06-15

### 新增（Phase 4：旁白驱动的飞行动画 MVP）
- 视频工作室「▶ 预览飞行动画」：MapLibre + 天地图（WGS-84，与路线零偏移）渲染 16:9 飞行动画。
- 音画同步（确定性 MVP）：每个有旁白节点 = 飞行段（固定时长，相机沿路线缓动）+ 停留段（时长=该段语音时长，停留时播报）。
- 节点信息卡 + 图片轮播（Ken Burns 缓动）：节点可上传图片（压缩存 IndexedDB images store）与备注，作为画面视觉重心。
- 片头标题卡 + 片尾全程数据（天数/总里程/讲解段数）+ 实时海拔 HUD。
- 播放控制：播放/暂停、进度拖拽、0.5~2x 倍速。
- 设置新增「天地图 key」。

### 技术
- 动画核心纯函数化（easing / geo 弧长插值 / flightTimeline / flightStops），与地图引擎解耦、全量单测；flight store 用注入式 adapter + 假时钟单测。
- IndexedDB 升级 v3：新增 images store。

### 与 PRD v2 的偏差（见 docs/specs/2026-06-14-phase4-animation-design.md）
- 瓦片源用天地图（WGS-84）替代 PRD 的高德瓦片（高德瓦片实为 GCJ-02、与 WGS-84 路线对不齐）。
- 文字叠加层升级为「信息卡 + 图片轮播」；同步机制 MVP 采用「到点停留式」；新增片头尾/海拔 HUD。
- 第二步（非本期）：路上段+到达段分拍、BGM、9:16 竖屏、移动车标、地形图层。
```

- [ ] **Step 4: 全量测试 + 构建**

Run: `npm test`
Expected: 全绿（含新增 easing/geo/flightTimeline/flightStops/flight/db/image/trip/settings 用例）。

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 5: commit**

```bash
git add src/views/StudioView.vue CHANGELOG.md
git commit -m "feat(studio): 接入飞行动画预览入口 + Phase 4 CHANGELOG

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6: 收尾（合并 + 打 tag，待用户确认后执行）**

实现完、手动验证通过后，按既有发布流程：

```bash
git checkout main
git merge --no-ff phase4-animation
# 把 package.json version 改为 0.4.0 并 commit（chore: 发布 v0.4.0）
git tag v0.4.0
git push origin main --tags
```

> 合并/打 tag/推送属对外动作，**执行前向用户确认**。

---

## 自检（写完计划后对照 spec）

**Spec 覆盖**
- 渲染 MapLibre+天地图 → Task 12/13 ✓
- 同步机制（飞行段固定时长 + 停留=音频时长）→ Task 3/4（buildFlightTimeline dwell=audioDuration+pad；fly 固定时长）✓
- 解耦 + 单测 → Task 1/2/3/4/5/10/11（纯函数 + 注入 adapter/假时钟）✓
- 节点信息卡 + 图片轮播(Ken Burns) → Task 13（卡片+kb-img）+ Task 6/7/14（图片存储与上传）✓
- 片头片尾 + 全程数据 → Task 4（intro/outro overlay）+ Task 10（outro.lines 里程/天数）+ Task 13 ✓
- 实时海拔 → Task 4（fly 插值/dwell 节点海拔）+ Task 13（HUD）✓
- 16:9 → Task 13（aspect-ratio:16/9）✓
- 前置批量合成 → Task 10（needsSynth）+ Task 13/15（提示）✓
- 天地图 key 设置 → Task 9 ✓
- 数据流 1/2/3 → Task 10（build）→ Task 11（tick→sample→adapter）→ Task 13（进度条 seek）✓
- 坐标零转换 → 全程 WGS-84，天地图 WGS-84，未引入 coords 转换 ✓
- 错误处理（无 key / 未合成 / 瓦片失败）→ Task 13（state no-key/error + onError）✓
- 测试策略所列各项 → 对应各 Task 的 *.test.js ✓

**占位扫描**：无 TODO/TBD；每个代码步骤含完整代码。

**类型/签名一致性**：`camera{lng,lat,zoom,pitch}`、`sample.audio{stopIndex,playing,offset}`、`adapter{setCamera,playAudio(blob,offset),stopAudio}`、`stop{node,audioDuration,routeToHere}`、`timeline{totalDuration,scenes,stops,intro,outro,opts}` 在 Task 3/4/10/11/13 间一致；`getImage/putImage/deleteImage`、`newImageId/downscaleImage`、`setNote/addImage/removeImage/setImages`、`tiandituKey/setTiandituKey/hasTiandituKey` 命名前后一致。
