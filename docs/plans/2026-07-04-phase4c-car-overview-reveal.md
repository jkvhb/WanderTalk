# Phase 4c 车标总览+圆形揭幕 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用"相机静止总览 + 卡通车标沿路跑 + 走过变色 + 到站圆形揭幕全屏展示页"替换 4b 的追车视角（发卡弯甩镜被手测否决）。

**Architecture:** 相机改为"包围盒式"声明（`{kind:'bounds', sceneId, bounds, pitch, bearing, padFrac}`），adapter 按 sceneId 记忆化 `cameraForBounds` 后一次 `jumpTo`，场景内零相机运动；车标/进度/揭幕由 `sampleAt` 纯函数逐帧输出（`car`/`progress`/`showcase` 三个新字段），store 只加两行可选链透传；揭幕是 `clip-path: circle()`，盖住瞬间相机暗中切下一段包围盒。

**Tech Stack:** Vue3 + Pinia + MapLibre GL 5.24（cameraForBounds / Marker / line-gradient+lineMetrics）+ vitest。

**Spec:** `docs/specs/2026-07-04-phase4c-car-overview-reveal-design.md`（已获批）

---

## 项目约定（执行者必读）

- Windows；npm 走 PowerShell：`D:\node.exe D:\node_modules\npm\bin\npm-cli.js test -- --run [路径]`（下文简写 `npm test -- --run`）；构建 `... run build`。
- 测试与源码同目录，vitest **node 环境**（无 DOM——因此 carMarker/useMapLibre/FlightPlayer 不写单测，靠全量绿+build+手测）。`it()` 中文。
- 每任务一次 commit；信息末尾 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`；多行消息用 PowerShell here-string `@'...'@`（结束符顶格）。
- 基线：171/171 绿。分支 `phase4-animation`。
- **中间态说明**：Task 2 落地后（相机契约变了）浏览器预览会坏掉，直到 Task 4/5 完成——同分支顺序施工，属预期，测试始终全绿即可。
- **不许删除** `chaikinSmooth/resampleByDistance/lerpAngle/edgeWindow` 等已测通用纯函数及其测试（本期部分不再被 flightTimeline 引用，保留在 geo/easing 供后用）。

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/utils/geo.js` | 地理纯函数 | +`boundsOfPath` |
| `src/utils/flightTimeline.js` | 时间轴+采样（契约 v2） | 整体重写 build/sampleAt |
| `src/stores/flight.js` | 播放编排 | applySample +2 行透传 |
| `src/assets/carMarker.js` | 卡通车 DOM 元素工厂 | 新建 |
| `src/composables/useMapLibre.js` | 地图适配器 | bounds 相机/setCar/setProgress/路线三层 |
| `src/components/FlightPlayer.vue` | 播放器 UI | 展示页+圆形揭幕，删旧构图 |
| `CHANGELOG.md` | 记录 | 重写 Unreleased |

## 与 spec 的两处已批注偏差

1. `progress` 在 **outro** 也输出 `{legIndex: 最后一站, frac: 1}`（spec 只写了 fly/dwell）——保证 seek 到任意时刻路线上色是确定态。
2. 进度配色常量放 `useMapLibre.js`（唯一消费方），不放 flightTimeline DEFAULTS。

---

### Task 1: `boundsOfPath`（geo.js）

**Files:**
- Modify: `src/utils/geo.js`
- Test: `src/utils/geo.test.js`

- [ ] **Step 1: 写失败测试**（追加到 geo.test.js；import 并入 `boundsOfPath`）

```js
describe('boundsOfPath', () => {
  it('折线包围盒 [[minLng,minLat],[maxLng,maxLat]]', () => {
    expect(boundsOfPath([[0, 0], [2, 1], [1, -1]])).toEqual([[0, -1], [2, 1]])
  })
  it('extraPoints 参与包围盒', () => {
    expect(boundsOfPath([[0, 0]], [[5, 5], [-1, 2]])).toEqual([[-1, 0], [5, 5]])
  })
  it('空折线仅 extraPoints 也可；全空返回 null', () => {
    expect(boundsOfPath([], [[3, 4]])).toEqual([[3, 4], [3, 4]])
    expect(boundsOfPath([], [])).toBeNull()
    expect(boundsOfPath(null)).toBeNull()
  })
})
```

- [ ] **Step 2:** Run `npm test -- --run src/utils/geo.test.js` → FAIL（未导出）

- [ ] **Step 3: 实现**（追加到 geo.js）

```js
// 折线+附加点的经纬度包围盒 [[minLng,minLat],[maxLng,maxLat]]；无任何点返回 null
export function boundsOfPath(path, extraPoints = []) {
  const pts = [...(path || []), ...(extraPoints || [])]
  if (!pts.length) return null
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const [lng, lat] of pts) {
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  return [[minLng, minLat], [maxLng, maxLat]]
}
```

- [ ] **Step 4:** geo 测试 PASS
- [ ] **Step 5: Commit**

```powershell
git add src/utils/geo.js src/utils/geo.test.js
git commit -m @'
feat(flight): boundsOfPath 经纬度包围盒纯函数

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

### Task 2: flightTimeline 契约 v2（build 包围盒场景 + sampleAt 车标/进度/揭幕/音频窗口）

**Files:**
- Modify: `src/utils/flightTimeline.js`（整体替换）
- Test: `src/utils/flightTimeline.test.js`（整体替换）
- Test: `src/stores/flight.test.js`（仅时序两处，防红）

- [ ] **Step 1: 整体替换 `src/utils/flightTimeline.test.js` 为以下内容**

```js
import { describe, it, expect } from 'vitest'
import { buildFlightTimeline, sampleAt, flyDurationForKm } from './flightTimeline'
import { pathLength } from './geo'

const OPTS = {
  introDuration: 3,
  flyDuration: 2.5,
  outroDuration: 4,
  dwellPadding: 1,
  wipeDuration: 0.5,
  overviewPitch: 25,
  boundsPadFrac: 0.15,
  intro: { title: 'T', subtitle: 'S' },
  outro: { lines: ['L1'] },
}

function twoStops() {
  return [
    { node: { lng: 0, lat: 0, name: 'A', altitude: 100, images: [] }, audioDuration: 2, routeToHere: [] },
    { node: { lng: 1, lat: 0, name: 'B', altitude: 200, images: ['a', 'b'] }, audioDuration: 3, routeToHere: [[0, 0], [1, 0]] },
  ]
}
// 时间轴：intro 0-3 | dwell A 3-7（0.5+2+1+0.5）| fly 7-(7+flyDur) | dwell B 5s | outro 4

describe('flyDurationForKm', () => {
  it('clamp(d/50, 2, 6)：100km=2s、150km=3s、200km=4s、600km 封顶 6s、30km 下限 2s', () => {
    expect(flyDurationForKm(100)).toBe(2)
    expect(flyDurationForKm(150)).toBe(3)
    expect(flyDurationForKm(200)).toBe(4)
    expect(flyDurationForKm(600)).toBe(6)
    expect(flyDurationForKm(30)).toBe(2)
  })
  it('距离缺失/为 0 用兜底值', () => {
    expect(flyDurationForKm(0, 2.5)).toBe(2.5)
    expect(flyDurationForKm(undefined, 2.5)).toBe(2.5)
  })
})

describe('buildFlightTimeline', () => {
  it('场景序列与总时长（dwell 含两端揭幕）', () => {
    const tl = buildFlightTimeline(twoStops(), OPTS)
    expect(tl.scenes.map((s) => s.kind)).toEqual(['intro', 'dwell', 'fly', 'dwell', 'outro'])
    const flyDur = flyDurationForKm(pathLength([[0, 0], [1, 0]]) / 1000)
    // 3 + (0.5+2+1+0.5) + flyDur + (0.5+3+1+0.5) + 4
    expect(tl.totalDuration).toBeCloseTo(16 + flyDur, 6)
  })

  it('场景首尾相接、按时间排列', () => {
    const tl = buildFlightTimeline(twoStops(), OPTS)
    expect(tl.scenes[0].start).toBe(0)
    for (let i = 1; i < tl.scenes.length; i++) {
      expect(tl.scenes[i].start).toBeCloseTo(tl.scenes[i - 1].end, 6)
    }
    expect(tl.scenes.at(-1).end).toBeCloseTo(tl.totalDuration, 6)
  })

  it('保留 stops/intro/outro/opts；缺省 wipe/pitch 生效', () => {
    const tl = buildFlightTimeline(twoStops(), OPTS)
    expect(tl.stops).toHaveLength(2)
    expect(tl.intro.title).toBe('T')
    expect(tl.outro.lines).toEqual(['L1'])
    expect(tl.opts.overviewPitch).toBe(25)
    const dft = buildFlightTimeline(twoStops(), { intro: { title: 'x' }, outro: { lines: [] } })
    expect(dft.opts.wipeDuration).toBeCloseTo(0.7, 6)
    expect(dft.opts.overviewPitch).toBe(25)
    expect(dft.opts.boundsPadFrac).toBeCloseTo(0.15, 6)
  })

  it('包围盒预计算：wholeBounds/legBounds/dwell 换场相机', () => {
    const tl = buildFlightTimeline(twoStops(), OPTS)
    expect(tl.wholeBounds).toEqual([[0, 0], [1, 0]])
    const fly = tl.scenes.find((s) => s.kind === 'fly')
    expect(fly.legBounds).toEqual([[0, 0], [1, 0]])
    const [dwellA, dwellB] = tl.scenes.filter((s) => s.kind === 'dwell')
    expect(dwellA.camBefore.sceneId).toBe('all') // 首节点无来路 → 与 intro 连续
    expect(dwellA.camAfter.sceneId).toBe('leg-1')
    expect(dwellA.camAfter.bounds).toEqual([[0, 0], [1, 0]]) // 回填成功
    expect(dwellB.camBefore.sceneId).toBe('leg-1')
    expect(dwellB.camAfter.sceneId).toBe('all') // 末节点收圆露全程
  })
})

describe('sampleAt · 契约 v2', () => {
  const tl = buildFlightTimeline(twoStops(), OPTS)
  const flyDur = flyDurationForKm(pathLength([[0, 0], [1, 0]]) / 1000)
  const flyStart = 7 // intro 3 + dwell A 4
  const dwellBStart = flyStart + flyDur

  it('intro：全程包围盒总览相机 + 片头叠加层，无车/进度/揭幕', () => {
    const s = sampleAt(tl, 1)
    expect(s.phase).toBe('intro')
    expect(s.camera).toMatchObject({ kind: 'bounds', sceneId: 'all', pitch: 25, bearing: 0, padFrac: 0.15 })
    expect(s.camera.bounds).toEqual([[0, 0], [1, 0]])
    expect(s.car).toBeNull()
    expect(s.progress).toBeNull()
    expect(s.showcase).toBeNull()
    expect(s.audio.playing).toBe(false)
    expect(s.overlay).toEqual({ kind: 'intro', title: 'T', subtitle: 'S' })
  })

  it('fly：相机静止在段包围盒，车沿路线走、朝向正东，进度=车进度', () => {
    const s = sampleAt(tl, flyStart + flyDur * 0.5)
    expect(s.phase).toBe('fly')
    expect(s.camera).toMatchObject({ kind: 'bounds', sceneId: 'leg-1', pitch: 25 })
    expect(s.car.lng).toBeCloseTo(0.5, 3) // eased(0.5)=0.5
    expect(s.car.lat).toBeCloseTo(0, 6)
    expect(s.car.headingDeg).toBeCloseTo(90, 1)
    expect(s.car.frac).toBeCloseTo(0.5, 6)
    expect(s.progress).toEqual({ legIndex: 1, frac: s.car.frac })
    expect(s.showcase).toBeNull()
    expect(s.altitude).toBe(150) // round(100 + 100*0.5)
  })

  it('dwell 揭幕曲线：两端 0→1→0，盖住期间恒 1', () => {
    const dA = 3
    expect(sampleAt(tl, dA + 0.0001).showcase.revealFrac).toBeCloseTo(0, 2)
    expect(sampleAt(tl, dA + 0.25).showcase.revealFrac).toBeCloseTo(0.5, 6) // 半程=easeInOutCubic(0.5)
    expect(sampleAt(tl, dA + 0.5).showcase.revealFrac).toBe(1)
    expect(sampleAt(tl, dA + 2).showcase.revealFrac).toBe(1)
    expect(sampleAt(tl, dA + 3.75).showcase.revealFrac).toBeCloseTo(0.5, 6)
  })

  it('dwell 相机暗中换场：盖住前=进场画面，盖住后=下一段', () => {
    expect(sampleAt(tl, 3.2).camera.sceneId).toBe('all') // 首节点盖住前与 intro 连续
    expect(sampleAt(tl, 3.6).camera.sceneId).toBe('leg-1')
    expect(sampleAt(tl, dwellBStart + 0.2).camera.sceneId).toBe('leg-1')
    expect(sampleAt(tl, dwellBStart + 0.7).camera.sceneId).toBe('all') // 末节点盖住后露全程
  })

  it('语音窗口后移：揭幕期间不播，盖住后开播、offset 扣除 wipe', () => {
    expect(sampleAt(tl, 3.3).audio.playing).toBe(false)
    expect(sampleAt(tl, 4).audio).toEqual({ stopIndex: 0, playing: true, offset: 0.5 }) // audioStart=3.5
    expect(sampleAt(tl, 5.6).audio.playing).toBe(false) // 窗口 3.5~5.5
  })

  it('dwell 进度=该段走满；图片索引随进度切换', () => {
    expect(sampleAt(tl, 4).progress).toEqual({ legIndex: 0, frac: 1 })
    expect(sampleAt(tl, dwellBStart + 0.5).showcase.imageIndex).toBe(0) // p=0.1
    expect(sampleAt(tl, dwellBStart + 4.4).showcase.imageIndex).toBe(1) // p=0.88
  })

  it('outro：全程总览 + 片尾 + 全程走完的上色态', () => {
    const s = sampleAt(tl, tl.totalDuration)
    expect(s.phase).toBe('outro')
    expect(s.camera.sceneId).toBe('all')
    expect(s.overlay).toEqual({ kind: 'outro', lines: ['L1'] })
    expect(s.progress).toEqual({ legIndex: 1, frac: 1 })
    expect(s.car).toBeNull()
  })

  it('t 越界被夹住', () => {
    expect(sampleAt(tl, -5).phase).toBe('intro')
    expect(sampleAt(tl, 999).phase).toBe('outro')
  })
})
```

- [ ] **Step 2: 同步 `src/stores/flight.test.js` 两处时序（防止 Step 5 时套件红）**

`tinyTimeline()` 的 opts 增加 `wipeDuration: 0.5`，注释更新：

```js
function tinyTimeline() {
  // intro 3 | dwell A (0.5+2+1+0.5=4) → 3~7 | fly ~2.22 | dwell B (0.5+3+1+0.5=5) | outro 4
  const stops = [
    { node: { lng: 0, lat: 0, name: 'A', altitude: 100, images: [] }, audioDuration: 2, routeToHere: [] },
    { node: { lng: 1, lat: 0, name: 'B', altitude: 200, images: [] }, audioDuration: 3, routeToHere: [[0, 0], [1, 0]] },
  ]
  return buildFlightTimeline(stops, {
    introDuration: 3, flyDuration: 2.5, outroDuration: 4, dwellPadding: 1, wipeDuration: 0.5,
    intro: { title: 'T', subtitle: '' }, outro: { lines: [] },
  })
}
```

`seek 进 dwell A` 用例的断言改为（音频窗口后移 0.5s）：

```js
    expect(adapter.playAudio).toHaveBeenCalledWith(blob0, 0.5)
```

- [ ] **Step 3:** Run `npm test -- --run src/utils/flightTimeline.test.js` → FAIL（契约 v2 不存在）

- [ ] **Step 4: 整体替换 `src/utils/flightTimeline.js` 为以下内容**

```js
import { easeInOutCubic, clamp01, edgeWindow } from './easing'
import { pointAlongPath, pathLength, bearingAt, boundsOfPath } from './geo'

const DEFAULTS = {
  introDuration: 3,
  flyDuration: 2.5, // 兜底：路径长度为 0 时的旅行段时长
  outroDuration: 4,
  dwellPadding: 0.8,
  wipeDuration: 0.7, // 圆形揭幕单程时长（dwell 两端各一次）
  overviewPitch: 25, // 总览俯仰角（用户拍板"接近俯视"，常量可调）
  boundsPadFrac: 0.15, // fitBounds 外扩比例（相对容器短边），给 pitch 形变留余量
  intro: { title: '', subtitle: '' },
  outro: { lines: [] },
}

// 旅行段时长随距离：clamp(d_km/50, 2, 6) 秒；距离缺失/为 0 用兜底
export function flyDurationForKm(dKm, fallback = 2.5) {
  if (!(dKm > 0)) return fallback
  return Math.min(6, Math.max(2, dKm / 50))
}

// stops: [{ node, audioDuration, routeToHere }]（有序，首个 routeToHere 通常为 []）
// 返回 { totalDuration, scenes, stops, wholeBounds, intro, outro, opts }
export function buildFlightTimeline(stops, opts = {}) {
  const o = { ...DEFAULTS, ...opts }
  o.intro = { ...DEFAULTS.intro, ...(opts.intro || {}) }
  o.outro = { ...DEFAULTS.outro, ...(opts.outro || {}) }

  // 全程包围盒 = 所有路线点 ∪ 所有节点坐标（intro/outro/无来路节点的相机）
  const allRoutePts = []
  stops.forEach((s) => {
    if (s.routeToHere) allRoutePts.push(...s.routeToHere)
  })
  const wholeBounds = boundsOfPath(allRoutePts, stops.map((s) => [s.node.lng, s.node.lat]))

  const scenes = []
  let t = 0
  const push = (kind, duration, stopIndex, extra) => {
    scenes.push({ kind, start: t, end: t + duration, duration, stopIndex, ...extra })
    t += duration
  }

  push('intro', o.introDuration, -1)
  stops.forEach((s, i) => {
    let legBounds = null
    if (s.routeToHere && s.routeToHere.length >= 2) {
      const meters = pathLength(s.routeToHere)
      const prev = stops[i - 1]?.node
      // 段包围盒 = 路线 ∪ 两端节点（POI 可能离路几十米，纳入保证可见）
      legBounds = boundsOfPath(s.routeToHere, [
        [s.node.lng, s.node.lat],
        ...(prev ? [[prev.lng, prev.lat]] : []),
      ])
      push('fly', flyDurationForKm(meters / 1000, o.flyDuration), i, { path: s.routeToHere, legBounds })
    }
    // dwell = 揭幕开 + 语音 + 停顿 + 揭幕收；相机在盖住瞬间暗中换场
    const nextHasLeg = stops[i + 1]?.routeToHere && stops[i + 1].routeToHere.length >= 2
    push('dwell', o.wipeDuration + (s.audioDuration || 0) + o.dwellPadding + o.wipeDuration, i, {
      audioDuration: s.audioDuration || 0,
      camBefore: legBounds ? { sceneId: `leg-${i}`, bounds: legBounds } : { sceneId: 'all', bounds: wholeBounds },
      camAfter: nextHasLeg ? { sceneId: `leg-${i + 1}`, bounds: null } : { sceneId: 'all', bounds: wholeBounds },
    })
  })
  push('outro', o.outroDuration, -1)

  // 回填 camAfter 的"下一段包围盒"（下一段 fly 场景在本 dwell 之后才 push）
  scenes.forEach((sc) => {
    if (sc.kind === 'dwell' && sc.camAfter.bounds == null) {
      const next = scenes.find((x) => x.kind === 'fly' && `leg-${x.stopIndex}` === sc.camAfter.sceneId)
      sc.camAfter = { ...sc.camAfter, bounds: next ? next.legBounds : wholeBounds }
    }
  })

  return { totalDuration: t, scenes, stops, wholeBounds, intro: o.intro, outro: o.outro, opts: o }
}

function sceneAt(timeline, tc) {
  let scene = timeline.scenes[0]
  for (const sc of timeline.scenes) {
    if (tc >= sc.start) scene = sc
    else break
  }
  return scene
}

const NO_AUDIO = { stopIndex: -1, playing: false, offset: 0 }

// 包围盒式相机：adapter 按 sceneId 记忆化 cameraForBounds，场景内相机静止（零抖动的根）
function boundsCamera(entry, o) {
  return {
    kind: 'bounds',
    sceneId: entry.sceneId,
    bounds: entry.bounds,
    pitch: o.overviewPitch,
    bearing: 0,
    padFrac: o.boundsPadFrac,
  }
}

// 给定时刻 t，输出该刻的相位/相机/车标/进度/揭幕/音频/海拔/叠加层（契约 v2）
export function sampleAt(timeline, t) {
  const total = timeline.totalDuration
  const tc = Math.max(0, Math.min(t, total))
  const scene = sceneAt(timeline, tc)
  const p = scene.duration > 0 ? clamp01((tc - scene.start) / scene.duration) : 0
  const o = timeline.opts
  const first = timeline.stops[0].node
  const last = timeline.stops[timeline.stops.length - 1].node
  const ALL = { sceneId: 'all', bounds: timeline.wholeBounds }

  if (scene.kind === 'intro') {
    return {
      phase: 'intro', t: tc,
      camera: boundsCamera(ALL, o),
      car: null, progress: null, showcase: null,
      activeStopIndex: -1, audio: { ...NO_AUDIO },
      altitude: first.altitude ?? null,
      overlay: { kind: 'intro', title: timeline.intro.title, subtitle: timeline.intro.subtitle },
    }
  }

  if (scene.kind === 'outro') {
    return {
      phase: 'outro', t: tc,
      camera: boundsCamera(ALL, o),
      car: null, showcase: null,
      progress: { legIndex: timeline.stops.length - 1, frac: 1 }, // 全程走完的上色态（seek 幂等）
      activeStopIndex: -1, audio: { ...NO_AUDIO },
      altitude: last.altitude ?? null,
      overlay: { kind: 'outro', lines: timeline.outro.lines },
    }
  }

  const i = scene.stopIndex
  const node = timeline.stops[i].node

  if (scene.kind === 'fly') {
    const eased = easeInOutCubic(p) // 车出站/进站缓入缓出
    const pos = pointAlongPath(scene.path, eased) || [node.lng, node.lat]
    const prevAlt = timeline.stops[i - 1]?.node.altitude
    const altitude =
      typeof prevAlt === 'number' && typeof node.altitude === 'number'
        ? Math.round(prevAlt + (node.altitude - prevAlt) * eased)
        : node.altitude ?? null
    return {
      phase: 'fly', t: tc,
      camera: boundsCamera({ sceneId: `leg-${i}`, bounds: scene.legBounds }, o),
      car: { lng: pos[0], lat: pos[1], headingDeg: bearingAt(scene.path, eased, 500), frac: eased },
      progress: { legIndex: i, frac: eased },
      showcase: null,
      activeStopIndex: i, audio: { ...NO_AUDIO },
      altitude, overlay: null,
    }
  }

  // dwell：揭幕(开) → 讲解 → 揭幕(收)；盖住瞬间相机暗中切下一段
  const wipe = o.wipeDuration
  const revealFrac = edgeWindow(p, scene.duration > 0 ? wipe / scene.duration : 0)
  const covered = tc - scene.start >= wipe
  const audioStart = scene.start + wipe // 语音窗口后移：盖住后才开讲
  const playing = scene.audioDuration > 0 && tc >= audioStart && tc < audioStart + scene.audioDuration
  const imgCount = node.images?.length ?? 0
  const imageIndex = imgCount > 0 ? Math.min(imgCount - 1, Math.floor(p * imgCount)) : 0
  return {
    phase: 'dwell', t: tc,
    camera: boundsCamera(covered ? scene.camAfter : scene.camBefore, o),
    car: null,
    progress: { legIndex: i, frac: 1 },
    showcase: { stopIndex: i, imageIndex, revealFrac },
    activeStopIndex: i,
    audio: playing ? { stopIndex: i, playing: true, offset: tc - audioStart } : { ...NO_AUDIO },
    altitude: node.altitude ?? null,
    overlay: null,
  }
}
```

- [ ] **Step 5:** 全量 `npm test -- --run` → 全绿（flightTimeline 新测试 + store 时序更新后的旧测试）
- [ ] **Step 6: Commit**

```powershell
git add src/utils/flightTimeline.js src/utils/flightTimeline.test.js src/stores/flight.test.js
git commit -m @'
feat(flight): 时间轴契约 v2——包围盒相机/车标/进度/圆形揭幕/语音窗口后移

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

### Task 3: flight store 透传 setCar/setProgress

**Files:**
- Modify: `src/stores/flight.js`
- Test: `src/stores/flight.test.js`

- [ ] **Step 1: 写失败测试**（追加到「flight store 播放」describe 内）

```js
  it('透传 setCar/setProgress：fly 有车、dwell 车为 null 且进度走满', () => {
    const flight = useFlightStore()
    const adapter = {
      setCamera: vi.fn(), playAudio: vi.fn(), stopAudio: vi.fn(),
      setCar: vi.fn(), setProgress: vi.fn(),
    }
    flight.attach(adapter)
    flight.loadTimeline(tinyTimeline(), [new Blob(['0']), new Blob(['1'])])
    flight.seek(8) // fly 段（7 ~ 约 9.22）
    expect(adapter.setCar).toHaveBeenLastCalledWith(
      expect.objectContaining({ lng: expect.any(Number), headingDeg: expect.any(Number) }),
    )
    expect(adapter.setProgress).toHaveBeenLastCalledWith(expect.objectContaining({ legIndex: 1 }))
    flight.seek(4) // dwell A
    expect(adapter.setCar).toHaveBeenLastCalledWith(null)
    expect(adapter.setProgress).toHaveBeenLastCalledWith({ legIndex: 0, frac: 1 })
  })

  it('旧 adapter 无 setCar/setProgress 也不报错（可选链）', () => {
    const flight = useFlightStore()
    flight.attach({ setCamera: vi.fn(), playAudio: vi.fn(), stopAudio: vi.fn() })
    expect(() => flight.loadTimeline(tinyTimeline(), [])).not.toThrow()
  })
```

- [ ] **Step 2:** Run `npm test -- --run src/stores/flight.test.js` → FAIL（setCar 未被调用）

- [ ] **Step 3: 实现**——`src/stores/flight.js` 的 `applySample` 中，`adapter.setCamera(s.camera)` 之后加两行：

```js
    adapter.setCamera(s.camera)
    adapter.setCar?.(s.car ?? null)
    adapter.setProgress?.(s.progress ?? null)
```

- [ ] **Step 4:** 全量 `npm test -- --run` → 全绿
- [ ] **Step 5: Commit**

```powershell
git add src/stores/flight.js src/stores/flight.test.js
git commit -m @'
feat(flight): store 透传 setCar/setProgress（可选链，store 保持零语义）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

### Task 4: carMarker 元素工厂 + useMapLibre（bounds 相机/车标/进度上色）（无单测）

**Files:**
- Create: `src/assets/carMarker.js`
- Modify: `src/composables/useMapLibre.js`

- [ ] **Step 1: 新建 `src/assets/carMarker.js`**

```js
// 卡通车标（用户拍板的唯一非写实元素）：直立、不随地图旋转/俯仰（游戏加载条式），
// 由 setFlip 按行进水平方向左右翻转（默认车头朝右/东）。
export function createCarElement(size = 44) {
  const el = document.createElement('div')
  el.style.width = `${size}px`
  el.style.height = `${size}px`
  el.style.pointerEvents = 'none'
  el.innerHTML = `<svg viewBox="0 0 44 44" width="${size}" height="${size}" style="display:block">
    <ellipse cx="22" cy="39" rx="15" ry="3" fill="rgba(0,0,0,0.3)"/>
    <path d="M13 19 Q15 10 22 10 Q30 10 32 19 Z" fill="#ff5a5a" stroke="#ffffff" stroke-width="2.5"/>
    <rect x="5" y="18" width="34" height="14" rx="7" fill="#ff5a5a" stroke="#ffffff" stroke-width="2.5"/>
    <path d="M16 18 Q17 13 22 13 Q27 13 28 18 Z" fill="#dff3ff"/>
    <circle cx="13" cy="33" r="5" fill="#2b2f36" stroke="#ffffff" stroke-width="2"/>
    <circle cx="31" cy="33" r="5" fill="#2b2f36" stroke="#ffffff" stroke-width="2"/>
    <circle cx="13" cy="33" r="1.8" fill="#cfd6df"/>
    <circle cx="31" cy="33" r="1.8" fill="#cfd6df"/>
  </svg>`
  const svg = el.firstElementChild
  return {
    el,
    setFlip(faceLeft) {
      svg.style.transform = faceLeft ? 'scaleX(-1)' : ''
    },
  }
}
```

- [ ] **Step 2: useMapLibre.js——顶部 import 与常量**

`import maplibregl ...` 之后加：

```js
import { createCarElement } from '../assets/carMarker'
```

`tdtTiles` 函数之后加：

```js
// 路线进度配色：已走=青绿、未走=橙
const ROUTE_DONE = '#5DCAA5'
const ROUTE_TODO = '#ff5a36'
```

- [ ] **Step 3: 替换 `applyCamera` 为双模式（bounds 记忆化 + 兼容旧点相机）**

把现有 `applyCamera` 整个替换为：

```js
  let lastBoundsSceneId = null
  let lastBoundsCam = null
  function applyCamera(cam) {
    if (!map) return
    if (cam?.kind === 'bounds') {
      if (!cam.bounds) return
      if (cam.sceneId != null && cam.sceneId === lastBoundsSceneId) return // 场景内相机静止
      const short = Math.min(container.clientWidth || 0, container.clientHeight || 0)
      let fitted = null
      try {
        // 注：cameraForBounds 按 bearing=0 平面拟合；pitch 由 jumpTo 附加，
        // 25° 俯仰的形变靠 padFrac 外扩兜住（手测可调 boundsPadFrac）。
        fitted = map.cameraForBounds(cam.bounds, { padding: Math.round(short * (cam.padFrac ?? 0.15)) })
      } catch {
        /* 包围盒非法时保持原相机 */
      }
      if (!fitted) return
      map.jumpTo({
        center: fitted.center,
        zoom: fitted.zoom,
        pitch: cam.pitch ?? 25,
        bearing: cam.bearing ?? 0,
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
      })
      lastBoundsSceneId = cam.sceneId ?? null
      lastBoundsCam = cam
      return
    }
    // 兼容旧点相机 {lng,lat,zoom,pitch,bearing,padding:{leftFrac}}
    lastBoundsSceneId = null
    lastBoundsCam = null
    const w = container.clientWidth || 0
    const left = Math.round((cam.padding?.leftFrac ?? 0) * w)
    map.jumpTo({
      center: [cam.lng, cam.lat],
      zoom: cam.zoom,
      pitch: cam.pitch ?? 60,
      bearing: cam.bearing ?? 0,
      padding: { top: 0, bottom: 0, left, right: 0 },
    })
  }
```

- [ ] **Step 4: ResizeObserver 回调补"包围盒相机重算"**

现有 `else { map.resize() }` 分支改为：

```js
      } else {
        map.resize()
        // 容器尺寸变了，包围盒相机需按新尺寸重算
        if (lastBoundsCam) {
          lastBoundsSceneId = null
          applyCamera(lastBoundsCam)
        }
      }
```

- [ ] **Step 5: 路线三层重构**——把现有 `applyRoute` 整个替换为：

```js
  const emptyFC = () => ({ type: 'FeatureCollection', features: [] })
  const fcOfLegs = (legs) => ({
    type: 'FeatureCollection',
    features: legs.map((p) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: p }, properties: {} })),
  })
  const lineOf = (p) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: p || [] }, properties: {} })

  let legPaths = []
  let curLegIndex = null
  // paths: 每站一条来路折线，与 stops 下标对齐（短/空段占位 null，保证 legIndex 对得上）
  function applyRoute(paths) {
    legPaths = (paths || []).map((p) => (p && p.length > 1 ? p : null))
    curLegIndex = null
    const ensure = (id, data, lineMetrics) => {
      if (map.getSource(id)) map.getSource(id).setData(data)
      else map.addSource(id, { type: 'geojson', data, ...(lineMetrics ? { lineMetrics: true } : {}) })
    }
    ensure('route-todo', fcOfLegs(legPaths.filter(Boolean)))
    ensure('route-done', emptyFC())
    ensure('route-current', lineOf([]), true) // lineMetrics：line-progress 渐变要用
    const layer = (id, source, paint) => {
      if (!map.getLayer(id)) {
        map.addLayer({ id, type: 'line', source, paint, layout: { 'line-cap': 'round', 'line-join': 'round' } })
      }
    }
    layer('route-todo-line', 'route-todo', { 'line-color': ROUTE_TODO, 'line-width': 3, 'line-opacity': 0.45 })
    layer('route-done-line', 'route-done', { 'line-color': ROUTE_DONE, 'line-width': 3.5, 'line-opacity': 0.95 })
    layer('route-current-line', 'route-current', {
      'line-width': 4,
      'line-gradient': ['step', ['line-progress'], ROUTE_DONE, 0.0000001, ROUTE_TODO],
    })
  }
```

（`drawRoute` 的 pending 机制不动——它调用的还是 `applyRoute`。旧 `route`/`route-line` 源与图层名弃用，无需迁移。）

- [ ] **Step 6: 新增 setProgress / setCar / destroy 清理 / 返回对象**

`drawRoute` 之后加：

```js
  // 进度上色：progress={legIndex,frac}；null=复位全未走（seek 回 intro）
  function setProgress(progress) {
    if (!map || !map.getSource('route-current')) return
    if (!progress) {
      if (curLegIndex !== null) {
        curLegIndex = null
        map.getSource('route-todo').setData(fcOfLegs(legPaths.filter(Boolean)))
        map.getSource('route-done').setData(emptyFC())
        map.getSource('route-current').setData(lineOf([]))
      }
      return
    }
    const { legIndex, frac } = progress
    if (legIndex !== curLegIndex) {
      curLegIndex = legIndex
      map.getSource('route-done').setData(fcOfLegs(legPaths.slice(0, legIndex).filter(Boolean)))
      map.getSource('route-todo').setData(fcOfLegs(legPaths.slice(legIndex + 1).filter(Boolean)))
      map.getSource('route-current').setData(legPaths[legIndex] ? lineOf(legPaths[legIndex]) : lineOf([]))
    }
    const f = Math.min(Math.max(frac, 0.0000001), 1)
    map.setPaintProperty('route-current-line', 'line-gradient', ['step', ['line-progress'], ROUTE_DONE, f, ROUTE_TODO])
  }

  let carMarker = null
  let carApi = null
  function setCar(car) {
    if (!map) return
    if (!car) {
      if (carMarker) {
        carMarker.remove()
        carMarker = null
        carApi = null
      }
      return
    }
    if (!carMarker) {
      carApi = createCarElement()
      // Marker 默认 viewport 对齐：车标直立、不随地图旋转/俯仰
      carMarker = new maplibregl.Marker({ element: carApi.el, anchor: 'bottom' })
        .setLngLat([car.lng, car.lat])
        .addTo(map)
    } else {
      carMarker.setLngLat([car.lng, car.lat])
    }
    // 车头默认朝右（东）；行进方位在西半侧（180°~360°）时翻转
    carApi.setFlip(car.headingDeg > 180)
  }
```

`destroy()` 里 `map?.remove()` 前加：

```js
    try {
      carMarker?.remove()
    } catch {
      /* 忽略 */
    }
```

返回对象在 `project,` 之后加 `setCar,` 与 `setProgress,`。

- [ ] **Step 7:** 全量 `npm test -- --run` → 全绿；`npm run build` → 成功
- [ ] **Step 8: Commit**

```powershell
git add src/assets/carMarker.js src/composables/useMapLibre.js
git commit -m @'
feat(flight): 包围盒相机(记忆化)+卡通车标 Marker+路线三层进度上色

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

### Task 5: FlightPlayer——全屏展示页 + 圆形揭幕（删旧特写构图）（无单测）

**Files:**
- Modify: `src/components/FlightPlayer.vue`

- [ ] **Step 1: script 改动**

删除整段旧锚点系统：`panelEl` ref、`anchor` ref、`updateAnchor()`、其对应 `watch`（`imgUrls` 之后那个）；保留 `stageEl`。`card` computed 删除。替换/新增为：

```js
// —— 圆形揭幕：圆心=到站点在当前相机下的屏幕投影，最大半径=舞台对角线 ——
const showcase = computed(() => sample.value?.showcase ?? null)
const wipeOrigin = ref({ x: 0, y: 0, maxR: 0 })

function updateWipeOrigin() {
  const stage = stageEl.value?.getBoundingClientRect()
  const i = showcase.value?.stopIndex
  if (!stage || i == null || i < 0 || !mapAdapter?.project) return
  const stop = flight.timeline?.stops?.[i]
  if (!stop) return
  // 圆心锚路线终点（驾车路线吸附道路）；首节点无路线退回节点坐标
  const route = stop.routeToHere
  const lngLat = route?.length ? route[route.length - 1] : [stop.node.lng, stop.node.lat]
  const pt = mapAdapter.project(lngLat)
  if (!pt) return
  wipeOrigin.value = { x: pt.x, y: pt.y, maxR: Math.hypot(stage.width, stage.height) }
}
// 两个时机重算圆心：进入新 dwell（扩圆）；相机暗中换场后（收圆要朝新总览里的同一节点收拢）
watch(
  () => [showcase.value?.stopIndex, sample.value?.camera?.sceneId],
  async () => {
    await nextTick()
    updateWipeOrigin()
  },
)

const wipeStyle = computed(() => {
  const sc = showcase.value
  if (!sc) return null
  const { x, y, maxR } = wipeOrigin.value
  const r = Math.max(0, sc.revealFrac) * (maxR || 0)
  return { clipPath: `circle(${r.toFixed(1)}px at ${x}px ${y}px)` }
})

// 旁白正文剥掉 SSML 标签后展示（<break/> <emphasis> 等来自 Phase 3 文案）
const plainNarration = computed(() => (activeNode.value?.narration || '').replace(/<[^>]+>/g, '').trim())
```

`activeNode` computed 的索引来源从 `card.value?.stopIndex` 改为 `showcase.value?.stopIndex`。
`imgUrls` 的 watch 源从 `() => card.value?.stopIndex` 改为 `() => showcase.value?.stopIndex`。
`currentImg` 改为 `computed(() => imgUrls.value[showcase.value?.imageIndex ?? 0] || null)`。
`showAltitude` 改为只在 fly 显示：`computed(() => altitude.value != null && sample.value?.phase === 'fly')`。
`onMounted`/`onBeforeUnmount` 里 `updateAnchor` 的 resize 监听改绑 `updateWipeOrigin`。
`onMounted` 里 drawRoute 调用改为**不过滤、保持与 stops 下标对齐**（legIndex 语义）：

```js
  mapAdapter.drawRoute(flight.timeline.stops.map((s) => s.routeToHere))
```

- [ ] **Step 2: template 改动**

删除三块：引线 `<svg v-if="anchor">`、脉冲标记 `<div v-if="anchor">`、左侧照片面板 `<div v-if="card?.visible && activeNode" ref="panelEl">`。

在「控件条」注释**之前**插入展示页（必须在控件条之前，保证暂停/进度条浮在其上）：

```html
        <!-- 节点展示页：圆形揭幕（clip-path 由 revealFrac 逐帧驱动，圆心=到站点投影） -->
        <div v-if="showcase && wipeStyle" class="absolute inset-0 bg-black overflow-hidden" :style="wipeStyle">
          <img v-if="currentImg" :src="currentImg" class="absolute inset-0 w-full h-full object-cover" alt="" />
          <div class="absolute inset-0 bg-black/40"></div>

          <div class="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 text-white/90 text-xs">
            <span class="w-2 h-2 rounded-full bg-teal-300"></span>
            正在讲解 · 第 {{ (showcase.stopIndex ?? 0) + 1 }}/{{ flight.timeline?.stops?.length || 0 }} 站
          </div>

          <div v-if="activeNode" class="absolute left-8 bottom-16 right-40 text-white">
            <div class="flex items-baseline gap-3 flex-wrap">
              <h2 class="text-3xl font-bold drop-shadow">{{ activeNode.name }}</h2>
              <span v-if="activeNode.altitude != null" class="px-3 py-1 rounded-full bg-teal-700/90 text-teal-50 text-sm">
                海拔 {{ activeNode.altitude }} m
              </span>
            </div>
            <p v-if="activeNode.address" class="mt-1 text-sm text-white/70">{{ activeNode.address }}</p>
            <p v-if="activeNode.note" class="mt-2 text-[15px] text-white/90 max-w-2xl">{{ activeNode.note }}</p>
            <p
              v-if="plainNarration"
              class="mt-3 text-sm text-white/80 max-w-3xl"
              style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden"
            >{{ plainNarration }}</p>
          </div>

          <div v-if="imgUrls.length > 1" class="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
            <div
              v-for="(u, idx) in imgUrls"
              :key="u"
              class="w-20 h-14 rounded-md overflow-hidden border-2"
              :class="idx === (showcase.imageIndex ?? 0) ? 'border-teal-300' : 'border-white/25'"
            >
              <img :src="u" class="w-full h-full object-cover" alt="" />
            </div>
          </div>
        </div>
```

- [ ] **Step 3:** 全量 `npm test -- --run` → 全绿；`npm run build` → 成功；再 grep 自检：文件中不再出现 `anchor`、`panelEl`、`card.`（`showcase` 全面接管）。

- [ ] **Step 4: Commit**

```powershell
git add src/components/FlightPlayer.vue
git commit -m @'
feat(flight): 到站圆形揭幕全屏展示页（照片+文字 MVP），移除左面板/引线/脉冲

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

### Task 6: CHANGELOG 重写 Unreleased + 手测清单 + 推送

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1:** 把 `## [Unreleased]` 下现有的 `### Added（Phase 4b·飞行相机体验优化）` 整块（4 个条目）替换为：

```markdown
### Added（Phase 4b+4c·飞行动画体验重构）
- 旅行段「总览+车标」：相机按段静止总览（俯视 25°、fitBounds），卡通车标沿真实路线跑、已走路段实时变色，时长随距离 clamp(km/50, 2~6s)
- 到站「圆形揭幕」：以到站点为圆心揭幕展开全屏展示页（实景照片+标题/海拔/地址/备注/旁白文本），收圆时已暗中切至下一段总览（PPT 式换场）
- 语音窗口与揭幕对齐：盖住后开讲、收圆前留静默
- 3D 地形：AWS Terrarium 高程（免费无 key）+ setTerrain(1.4)，失败自动降级平面

### Changed
- 废弃"镜头朝行进方向沿路飞"（发卡弯致画面甩转，手测否决）；动画核心新增包围盒相机/揭幕曲线/车标进度纯函数，全量单测

### Fixed
- 天地图 429 QPS 限流静默降级（不再弹红色横幅）；节点标记/揭幕圆心锚定路线终点而非 POI 坐标
```

- [ ] **Step 2: Commit + 推送备份**

```powershell
git add CHANGELOG.md
git commit -m @'
docs: CHANGELOG 重写 Unreleased 为 Phase 4b+4c 最终形态

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
git push origin phase4-animation
```

- [ ] **Step 3: 手动验收清单**（浏览器 `npm run dev`，需天地图 key+已合成旁白；注意日配额别反复整程播）

- [ ] 片头是全程路线总览；旅行段相机完全静止、零抖动
- [ ] 卡通车沿路线跑，发卡弯上扭动自然；向西开车头朝左
- [ ] 已走路段青绿、当前段随车渐变、未来段半透明橙
- [ ] 到站圆形揭幕从站点扩开丝滑；讲解声在盖住后才响
- [ ] 收圆后露出的是**下一段**总览（换场无感）；末站收圆露全程
- [ ] 无照片节点展示页为深底文字版；多图节点缩略图随进度切换
- [ ] 拖进度条到任意位置：车/上色/揭幕/语音状态都正确
- [ ] 窗口缩放后总览重新取景、揭幕圆心仍对准站点

---

## Self-Review 记录

- **Spec 覆盖**：boundsOfPath(T1)；wholeBounds/legBounds/camBefore/camAfter/dwell 时长公式/揭幕曲线/换场时机/语音窗口(T2)；store 两行(T3)；卡通车直立+翻转/bounds 相机记忆化+resize 重算/三层进度上色(T4)；展示页 MVP+圆形揭幕+圆心两时机重算+删旧构图+drawRoute 下标对齐(T5)；CHANGELOG(T6)。两处偏差已在头部标注。
- **占位符**：无；全部代码给全文。
- **类型一致性**：`camera{kind,sceneId,bounds,pitch,bearing,padFrac}`、`car{lng,lat,headingDeg,frac}`、`progress{legIndex,frac}`、`showcase{stopIndex,imageIndex,revealFrac}` 贯穿 T2→T3→T4→T5；`setCar/setProgress/createCarElement` 命名一致；`edgeWindow(p, wipe/duration)` 复用既有签名。
- **数值自校**：OPTS(wipe=0.5) 下 dwell A=4(3~7)、revealFrac@+0.25=0.5、audioStart=3.5、seek(4) offset=0.5、dwell B imageIndex 分界 p=0.5——与测试断言一致。
