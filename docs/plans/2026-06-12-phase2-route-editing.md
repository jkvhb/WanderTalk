# Phase 2 路线编辑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 PRD v2 Phase 2 全部 8 项能力：坐标转换层、高德驾车路线计算（带 IndexedDB 缓存）、多天路线分段编辑、按天分色真实路线渲染、POI 一键添加到路线、地图点击添加节点、IndexedDB 自动保存、路书 JSON 导出/导入。

**Architecture:** 数据模型统一存 WGS-84 坐标（`src/utils/coords.js` 为唯一转换层）；高德 API 输入输出为 GCJ-02，渲染前/查询前转换。trip store 扩展节点/天编辑函数，任何节点改动使当天 `segments`（驾车路线计算结果）失效。驾车路线结果与当前路书都持久化到 IndexedDB（`idb` 封装在 `src/utils/db.js`）。纯逻辑全部 Vitest 覆盖（IndexedDB 用 fake-indexeddb），地图 UI 手动验证。

**Tech Stack:** Vue 3, Pinia, 高德 JS API 2.0（AMap.Driving）, coordtransform, idb, fake-indexeddb（dev）, Vitest。

**环境备注:** Windows 环境，node 仅在 PowerShell 可用（`D:\node.exe`，v24.14.1），所有 node/npm 命令用 PowerShell 执行。git 在 bash 和 PowerShell 均可用。

**对 PRD 的一处裁剪:** 「节点拖拽排序」以上移/下移按钮实现排序能力（store 层 `moveWaypoint` 支持任意位置移动），拖拽手势留到 Phase 6 打磨阶段，避免引入额外拖拽库。

---

## File Structure

```
src/
├── utils/
│   ├── coords.js            坐标转换层（唯一允许跨坐标系的模块）★新增
│   ├── coords.test.js       ★新增
│   ├── format.js            距离/时长格式化 ★新增
│   ├── format.test.js       ★新增
│   ├── db.js                IndexedDB 封装（trip 自动保存 + routeCache）★新增
│   └── db.test.js           ★新增
├── composables/
│   ├── useAmap.js           （已有，不改）
│   ├── useDriving.js        驾车路线计算 + 缓存 ★新增
│   └── useDriving.test.js   ★新增
├── stores/
│   ├── trip.js              扩展：天/节点编辑、segments、JSON 导入导出 ★修改
│   └── trip.test.js         ★追加测试
├── components/
│   ├── DayCard.vue          单天卡片：展开编辑节点/住宿地/删除天 ★新增
│   └── PoiSearchPanel.vue   增加「添加到路线」按钮 ★修改
├── views/
│   └── PlannerView.vue      真实路线渲染、计算按钮、目标天选择、点图添加、JSON 按钮 ★修改
└── App.vue                  启动恢复 + 自动保存 ★修改
CHANGELOG.md                 ★修改
```

---

## Task 1: 坐标转换层

**Files:**
- Create: `src/utils/coords.js`
- Test: `src/utils/coords.test.js`

- [ ] **Step 1: 安装 coordtransform**

PowerShell：

```powershell
npm install coordtransform
```

- [ ] **Step 2: 写失败的测试**

`src/utils/coords.test.js`：

```js
import { describe, it, expect } from 'vitest'
import { gcj02ToWgs84, wgs84ToGcj02, wgs84PathToGcj02, gcj02PathToWgs84 } from './coords'

const CHENGDU = { lng: 104.0665, lat: 30.5728 }

describe('coords', () => {
  it('国内坐标转换产生偏移（50~500m 数量级）', () => {
    const g = wgs84ToGcj02(CHENGDU.lng, CHENGDU.lat)
    const dLng = Math.abs(g.lng - CHENGDU.lng)
    const dLat = Math.abs(g.lat - CHENGDU.lat)
    expect(dLng + dLat).toBeGreaterThan(0.0005)
    expect(dLng + dLat).toBeLessThan(0.02)
  })

  it('round trip 误差小于 1e-4 度', () => {
    const g = wgs84ToGcj02(CHENGDU.lng, CHENGDU.lat)
    const back = gcj02ToWgs84(g.lng, g.lat)
    expect(Math.abs(back.lng - CHENGDU.lng)).toBeLessThan(1e-4)
    expect(Math.abs(back.lat - CHENGDU.lat)).toBeLessThan(1e-4)
  })

  it('境外坐标原样返回', () => {
    const g = wgs84ToGcj02(-122.4194, 37.7749)
    expect(g.lng).toBe(-122.4194)
    expect(g.lat).toBe(37.7749)
  })

  it('路径批量转换保持形状且可逆', () => {
    const path = [[104.0665, 30.5728], [103.001, 29.9877]]
    const gcj = wgs84PathToGcj02(path)
    expect(gcj).toHaveLength(2)
    expect(Array.isArray(gcj[0])).toBe(true)
    const back = gcj02PathToWgs84(gcj)
    expect(back[0][0]).toBeCloseTo(path[0][0], 3)
    expect(back[1][1]).toBeCloseTo(path[1][1], 3)
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

```powershell
npm test
```

Expected: FAIL，找不到 `./coords`。

- [ ] **Step 4: 实现 coords.js**

`src/utils/coords.js`：

```js
import coordtransform from 'coordtransform'

// 数据模型统一存 WGS-84；高德 API 输入输出为 GCJ-02。
// 所有跨坐标系的读写都必须经过本模块。

export function gcj02ToWgs84(lng, lat) {
  const [x, y] = coordtransform.gcj02towgs84(lng, lat)
  return { lng: x, lat: y }
}

export function wgs84ToGcj02(lng, lat) {
  const [x, y] = coordtransform.wgs84togcj02(lng, lat)
  return { lng: x, lat: y }
}

// path: [[lng, lat], ...]
export function wgs84PathToGcj02(path) {
  return path.map(([lng, lat]) => {
    const p = wgs84ToGcj02(lng, lat)
    return [p.lng, p.lat]
  })
}

export function gcj02PathToWgs84(path) {
  return path.map(([lng, lat]) => {
    const p = gcj02ToWgs84(lng, lat)
    return [p.lng, p.lat]
  })
}
```

- [ ] **Step 5: 运行测试确认通过**

```powershell
npm test
```

Expected: PASS，coords 4 个测试通过（总数 15）。

- [ ] **Step 6: 提交**

```bash
git add src/utils/coords.js src/utils/coords.test.js package.json package-lock.json
git commit -m "feat: GCJ-02/WGS-84 坐标转换层"
```

---

## Task 2: 距离/时长格式化工具

**Files:**
- Create: `src/utils/format.js`
- Test: `src/utils/format.test.js`

- [ ] **Step 1: 写失败的测试**

`src/utils/format.test.js`：

```js
import { describe, it, expect } from 'vitest'
import { formatDistance, formatDuration } from './format'

describe('formatDistance', () => {
  it('小于 1km 显示米', () => {
    expect(formatDistance(850)).toBe('850m')
  })
  it('1km 以上保留一位小数', () => {
    expect(formatDistance(1500)).toBe('1.5km')
    expect(formatDistance(85300)).toBe('85.3km')
  })
  it('整数公里去掉 .0', () => {
    expect(formatDistance(2000)).toBe('2km')
  })
  it('100km 以上取整', () => {
    expect(formatDistance(176000)).toBe('176km')
  })
})

describe('formatDuration', () => {
  it('小于 1 小时显示分钟', () => {
    expect(formatDuration(300)).toBe('5分钟')
  })
  it('小时+分钟', () => {
    expect(formatDuration(18720)).toBe('5小时12分')
  })
  it('整小时', () => {
    expect(formatDuration(7200)).toBe('2小时')
  })
  it('分钟四舍五入到 60 时进位', () => {
    expect(formatDuration(7170)).toBe('2小时')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
npm test
```

Expected: FAIL，找不到 `./format`。

- [ ] **Step 3: 实现 format.js**

`src/utils/format.js`：

```js
export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)}m`
  const km = meters / 1000
  if (km >= 100) return `${Math.round(km)}km`
  return `${km.toFixed(1).replace(/\.0$/, '')}km`
}

export function formatDuration(seconds) {
  let h = Math.floor(seconds / 3600)
  let m = Math.round((seconds % 3600) / 60)
  if (m === 60) {
    h += 1
    m = 0
  }
  if (h === 0) return `${m}分钟`
  if (m === 0) return `${h}小时`
  return `${h}小时${m}分`
}
```

- [ ] **Step 4: 运行测试确认通过**

```powershell
npm test
```

Expected: PASS，format 8 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add src/utils/format.js src/utils/format.test.js
git commit -m "feat: 距离与时长格式化工具"
```

---

## Task 3: IndexedDB 封装

**Files:**
- Create: `src/utils/db.js`
- Test: `src/utils/db.test.js`

- [ ] **Step 1: 安装 idb 与 fake-indexeddb**

PowerShell：

```powershell
npm install idb
npm install -D fake-indexeddb
```

- [ ] **Step 2: 写失败的测试**

`src/utils/db.test.js`（注意 `fake-indexeddb/auto` 必须最先 import，它向 node 环境注入 indexedDB 全局对象）：

```js
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { saveTrip, loadTrip, clearTrip, getCachedRoute, setCachedRoute } from './db'

describe('db', () => {
  it('saveTrip / loadTrip round trip', async () => {
    expect(await loadTrip()).toBeUndefined()
    const plan = { name: '测试', days: [{ dayNumber: 1, waypoints: [] }] }
    await saveTrip(plan)
    const loaded = await loadTrip()
    expect(loaded.name).toBe('测试')
    expect(loaded.days).toHaveLength(1)
  })

  it('clearTrip 后读取为空', async () => {
    await saveTrip({ name: 'x', days: [] })
    await clearTrip()
    expect(await loadTrip()).toBeUndefined()
  })

  it('routeCache 读写', async () => {
    expect(await getCachedRoute('a>b')).toBeUndefined()
    await setCachedRoute('a>b', { path: [[1, 2]], distance: 10, duration: 5 })
    const r = await getCachedRoute('a>b')
    expect(r.distance).toBe(10)
    expect(r.path).toEqual([[1, 2]])
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

```powershell
npm test
```

Expected: FAIL，找不到 `./db`。

- [ ] **Step 4: 实现 db.js**

`src/utils/db.js`：

```js
import { openDB } from 'idb'

const DB_NAME = 'wandertalk'
const DB_VERSION = 1
let dbPromise = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('trip')) db.createObjectStore('trip')
        if (!db.objectStoreNames.contains('routeCache')) db.createObjectStore('routeCache')
      },
    })
  }
  return dbPromise
}

export async function saveTrip(plan) {
  return (await getDb()).put('trip', plan, 'current')
}

export async function loadTrip() {
  return (await getDb()).get('trip', 'current')
}

export async function clearTrip() {
  return (await getDb()).delete('trip', 'current')
}

export async function getCachedRoute(key) {
  return (await getDb()).get('routeCache', key)
}

export async function setCachedRoute(key, route) {
  return (await getDb()).put('routeCache', route, key)
}
```

- [ ] **Step 5: 运行测试确认通过**

```powershell
npm test
```

Expected: PASS，db 3 个测试通过。

- [ ] **Step 6: 提交**

```bash
git add src/utils/db.js src/utils/db.test.js package.json package-lock.json
git commit -m "feat: IndexedDB 封装（路书保存与路线缓存）"
```

---

## Task 4: trip store 编辑能力与 JSON 导入导出

**Files:**
- Modify: `src/stores/trip.js`（整体替换）
- Test: `src/stores/trip.test.js`（追加测试）

- [ ] **Step 1: 追加失败的测试**

在 `src/stores/trip.test.js` 末尾（最外层 `describe` 之后）追加：

```js
describe('trip store 编辑', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('newEmptyPlan 创建含 1 个空天的路书', () => {
    const t = useTripStore()
    t.newEmptyPlan()
    expect(t.dayCount).toBe(1)
    expect(t.plan.days[0].waypoints).toEqual([])
    expect(t.plan.days[0].segments).toBeNull()
  })

  it('loadPreset318 归一化后每天都有 segments 字段', () => {
    const t = useTripStore()
    t.loadPreset318()
    for (const day of t.plan.days) {
      expect(day.segments).toBeNull()
    }
  })

  it('addDay 在末尾追加空天并连续编号', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.addDay()
    expect(t.dayCount).toBe(10)
    expect(t.plan.days[9].dayNumber).toBe(10)
    expect(t.plan.days[9].waypoints).toEqual([])
  })

  it('removeDay 删除并重排 dayNumber', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.removeDay(2)
    expect(t.dayCount).toBe(8)
    expect(t.plan.days.map((d) => d.dayNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    // 原 Day 3（理塘）现在是 Day 2
    expect(t.plan.days[1].overnight).toBe('理塘')
  })

  it('addWaypoint 添加节点并使当天 segments 失效', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.setDaySegments(1, [{ fromName: 'a', toName: 'b', path: [], distance: 1, duration: 1 }])
    t.addWaypoint(1, { name: '新节点', lng: 103.5, lat: 30.1 })
    expect(t.plan.days[0].waypoints.at(-1).name).toBe('新节点')
    expect(t.plan.days[0].segments).toBeNull()
  })

  it('removeWaypoint 删除节点并使 segments 失效', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.setDaySegments(1, [])
    t.removeWaypoint(1, 0)
    expect(t.plan.days[0].waypoints[0].name).toBe('雅安')
    expect(t.plan.days[0].segments).toBeNull()
  })

  it('moveWaypoint 上移/下移节点', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.moveWaypoint(1, 0, 1)
    expect(t.plan.days[0].waypoints[0].name).toBe('雅安')
    expect(t.plan.days[0].waypoints[1].name).toBe('成都')
    // 越界移动不生效
    t.moveWaypoint(1, 0, -1)
    expect(t.plan.days[0].waypoints[0].name).toBe('雅安')
  })

  it('updateWaypoint 仅改名不清除 segments，改坐标清除', () => {
    const t = useTripStore()
    t.loadPreset318()
    const segs = [{ fromName: 'a', toName: 'b', path: [], distance: 1, duration: 1 }]
    t.setDaySegments(1, segs)
    t.updateWaypoint(1, 0, { name: '成都市' })
    expect(t.plan.days[0].segments).not.toBeNull()
    t.updateWaypoint(1, 0, { lng: 104.1 })
    expect(t.plan.days[0].segments).toBeNull()
  })

  it('setOvernight 修改住宿地', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.setOvernight(1, ' 康定城 ')
    expect(t.plan.days[0].overnight).toBe('康定城')
  })

  it('exportJson / importJson round trip', () => {
    const t = useTripStore()
    t.loadPreset318()
    const json = t.exportJson()
    t.clear()
    t.importJson(json)
    expect(t.dayCount).toBe(9)
    expect(t.plan.days[0].waypoints[0].name).toContain('成都')
  })

  it('importJson 拒绝非法 JSON', () => {
    const t = useTripStore()
    expect(() => t.importJson('not json')).toThrow('不是有效的 JSON 文件')
  })

  it('importJson 拒绝缺少 days 的数据', () => {
    const t = useTripStore()
    expect(() => t.importJson('{"name":"x"}')).toThrow('days')
  })

  it('importJson 拒绝缺少坐标的节点', () => {
    const t = useTripStore()
    const bad = JSON.stringify({ days: [{ waypoints: [{ name: 'x' }] }] })
    expect(() => t.importJson(bad)).toThrow('name / lng / lat')
  })

  it('replacePlan 归一化外部数据', () => {
    const t = useTripStore()
    t.replacePlan({ days: [{ waypoints: [{ name: 'a', lng: 100, lat: 30 }] }] })
    expect(t.plan.name).toBe('未命名路书')
    expect(t.plan.days[0].dayNumber).toBe(1)
    expect(t.plan.days[0].segments).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
npm test
```

Expected: FAIL，`newEmptyPlan` / `addDay` 等不是函数。

- [ ] **Step 3: 整体替换 trip.js**

`src/stores/trip.js`：

```js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { preset318 } from '../data/preset318'

// 单天结构归一化：保证 dayNumber 连续、segments 字段存在。
function normalizeDay(day, i) {
  return {
    dayNumber: i + 1,
    overnight: day.overnight ?? '',
    waypoints: (day.waypoints ?? []).map((w) => ({ ...w })),
    segments: day.segments ?? null,
  }
}

function normalizePlan(raw) {
  return {
    name: raw.name ?? '未命名路书',
    description: raw.description ?? '',
    days: (raw.days ?? []).map(normalizeDay),
  }
}

export const useTripStore = defineStore('trip', () => {
  const plan = ref(null)

  const dayCount = computed(() => plan.value?.days.length ?? 0)

  const allWaypoints = computed(() => {
    if (!plan.value) return []
    return plan.value.days.flatMap((d) => d.waypoints)
  })

  function findDay(dayNumber) {
    return plan.value?.days.find((d) => d.dayNumber === dayNumber)
  }

  function loadPreset318() {
    plan.value = normalizePlan(structuredClone(preset318))
  }

  function newEmptyPlan() {
    plan.value = normalizePlan({ name: '我的路书', days: [{}] })
  }

  function replacePlan(raw) {
    plan.value = normalizePlan(raw)
  }

  function clear() {
    plan.value = null
  }

  // —— 天编辑 ——
  function addDay() {
    if (!plan.value) return
    plan.value.days.push(normalizeDay({}, plan.value.days.length))
  }

  function removeDay(dayNumber) {
    if (!plan.value) return
    plan.value.days = plan.value.days
      .filter((d) => d.dayNumber !== dayNumber)
      .map(normalizeDay)
  }

  function setOvernight(dayNumber, name) {
    const day = findDay(dayNumber)
    if (day) day.overnight = name.trim()
  }

  // —— 节点编辑（节点增删/换序/改坐标都会让当天已算路线失效）——
  function addWaypoint(dayNumber, wp) {
    const day = findDay(dayNumber)
    if (!day) return
    day.waypoints.push({ ...wp })
    day.segments = null
  }

  function removeWaypoint(dayNumber, index) {
    const day = findDay(dayNumber)
    if (!day) return
    day.waypoints.splice(index, 1)
    day.segments = null
  }

  function updateWaypoint(dayNumber, index, patch) {
    const day = findDay(dayNumber)
    const wp = day?.waypoints[index]
    if (!wp) return
    Object.assign(wp, patch)
    if ('lng' in patch || 'lat' in patch) day.segments = null
  }

  function moveWaypoint(dayNumber, index, dir) {
    const day = findDay(dayNumber)
    if (!day) return
    const target = index + dir
    if (target < 0 || target >= day.waypoints.length) return
    const [wp] = day.waypoints.splice(index, 1)
    day.waypoints.splice(target, 0, wp)
    day.segments = null
  }

  function setDaySegments(dayNumber, segments) {
    const day = findDay(dayNumber)
    if (day) day.segments = segments
  }

  // —— JSON 导入导出 ——
  function exportJson() {
    return JSON.stringify(plan.value, null, 2)
  }

  function importJson(text) {
    let raw
    try {
      raw = JSON.parse(text)
    } catch {
      throw new Error('不是有效的 JSON 文件')
    }
    if (!raw || !Array.isArray(raw.days)) {
      throw new Error('缺少 days 数组，不是有效的路书文件')
    }
    for (const day of raw.days) {
      for (const w of day.waypoints ?? []) {
        if (!w.name || typeof w.lng !== 'number' || typeof w.lat !== 'number') {
          throw new Error('路书数据格式错误：节点缺少 name / lng / lat')
        }
      }
    }
    plan.value = normalizePlan(raw)
  }

  return {
    plan,
    dayCount,
    allWaypoints,
    loadPreset318,
    newEmptyPlan,
    replacePlan,
    clear,
    addDay,
    removeDay,
    setOvernight,
    addWaypoint,
    removeWaypoint,
    updateWaypoint,
    moveWaypoint,
    setDaySegments,
    exportJson,
    importJson,
  }
})
```

- [ ] **Step 4: 运行测试确认全部通过**

```powershell
npm test
```

Expected: PASS，trip store 原有 4 个 + 新增 14 个测试全部通过。

- [ ] **Step 5: 提交**

```bash
git add src/stores/trip.js src/stores/trip.test.js
git commit -m "feat: 路书编辑（增删天/节点排序/导入导出）"
```

---

## Task 5: 驾车路线计算

**Files:**
- Create: `src/composables/useDriving.js`
- Test: `src/composables/useDriving.test.js`

- [ ] **Step 1: 写失败的测试**

`src/composables/useDriving.test.js`：

```js
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { planDrivingRoute, routeCacheKey } from './useDriving'

// 构造假 AMap：Driving.search 行为可定制，并统计调用次数
function makeFakeAMap(impl) {
  let calls = 0
  class Driving {
    search(origin, destination, cb) {
      calls++
      impl(origin, destination, cb, calls)
    }
  }
  return { AMap: { Driving }, getCalls: () => calls }
}

describe('useDriving', () => {
  it('routeCacheKey 对坐标做 5 位小数归一', () => {
    const k = routeCacheKey(
      { lng: 104.066512345, lat: 30.5728 },
      { lng: 103.001, lat: 29.9877 },
    )
    expect(k).toBe('104.06651,30.57280>103.00100,29.98770')
  })

  it('返回 WGS-84 路径与距离时长', async () => {
    const { AMap } = makeFakeAMap((o, d, cb) => {
      cb('complete', {
        routes: [{
          distance: 85000,
          time: 5400,
          steps: [{ path: [{ lng: o[0], lat: o[1] }, { lng: d[0], lat: d[1] }] }],
        }],
      })
    })
    const from = { name: '成都', lng: 104.0665, lat: 30.5728 }
    const to = { name: '雅安', lng: 103.001, lat: 29.9877 }
    const route = await planDrivingRoute(AMap, from, to)
    expect(route.distance).toBe(85000)
    expect(route.duration).toBe(5400)
    // 请求坐标是 GCJ-02，结果转回 WGS-84 后应接近原始坐标
    expect(route.path[0][0]).toBeCloseTo(104.0665, 3)
    expect(route.path[0][1]).toBeCloseTo(30.5728, 3)
    expect(route.path[1][0]).toBeCloseTo(103.001, 3)
  })

  it('第二次调用走缓存，不再请求高德', async () => {
    const { AMap, getCalls } = makeFakeAMap((o, d, cb) => {
      cb('complete', {
        routes: [{ distance: 1000, time: 100, steps: [{ path: [{ lng: o[0], lat: o[1] }] }] }],
      })
    })
    const from = { lng: 101.11111, lat: 30.11111 }
    const to = { lng: 101.22222, lat: 30.22222 }
    await planDrivingRoute(AMap, from, to)
    await planDrivingRoute(AMap, from, to)
    expect(getCalls()).toBe(1)
  })

  it('失败后自动重试一次', async () => {
    const { AMap, getCalls } = makeFakeAMap((o, d, cb, n) => {
      if (n === 1) cb('error', 'CUQPS_HAS_EXCEEDED_THE_LIMIT')
      else cb('complete', {
        routes: [{ distance: 1, time: 1, steps: [{ path: [{ lng: o[0], lat: o[1] }] }] }],
      })
    })
    const route = await planDrivingRoute(AMap, { lng: 102.3, lat: 30.3 }, { lng: 102.4, lat: 30.4 })
    expect(route.distance).toBe(1)
    expect(getCalls()).toBe(2)
  })

  it('重试仍失败则抛出错误', async () => {
    const { AMap } = makeFakeAMap((o, d, cb) => {
      cb('error', 'INVALID_USER_KEY')
    })
    await expect(
      planDrivingRoute(AMap, { lng: 102.5, lat: 30.5 }, { lng: 102.6, lat: 30.6 }),
    ).rejects.toThrow('INVALID_USER_KEY')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
npm test
```

Expected: FAIL，找不到 `./useDriving`。

- [ ] **Step 3: 实现 useDriving.js**

`src/composables/useDriving.js`：

```js
import { wgs84ToGcj02, gcj02PathToWgs84 } from '../utils/coords'
import { getCachedRoute, setCachedRoute } from '../utils/db'

// 缓存 key：WGS-84 坐标保留 5 位小数（约 1m 精度）
export function routeCacheKey(from, to) {
  return `${from.lng.toFixed(5)},${from.lat.toFixed(5)}>${to.lng.toFixed(5)},${to.lat.toFixed(5)}`
}

function searchDriving(AMap, origin, destination) {
  return new Promise((resolve, reject) => {
    const driving = new AMap.Driving()
    driving.search(origin, destination, (status, result) => {
      if (status === 'complete' && result.routes?.length) {
        resolve(result.routes[0])
      } else {
        const info = typeof result === 'string' ? result : result?.info || status
        reject(new Error(info || '驾车路线查询失败'))
      }
    })
  })
}

// from/to 为 WGS-84 waypoint；返回 { path: [[lng,lat]...](WGS-84), distance: 米, duration: 秒 }。
// 结果写入 IndexedDB 缓存；失败等 1 秒自动重试一次（应对限流）。
export async function planDrivingRoute(AMap, from, to) {
  const key = routeCacheKey(from, to)
  const cached = await getCachedRoute(key)
  if (cached) return cached

  const o = wgs84ToGcj02(from.lng, from.lat)
  const d = wgs84ToGcj02(to.lng, to.lat)
  const origin = [o.lng, o.lat]
  const destination = [d.lng, d.lat]

  let route0
  try {
    route0 = await searchDriving(AMap, origin, destination)
  } catch {
    await new Promise((r) => setTimeout(r, 1000))
    route0 = await searchDriving(AMap, origin, destination)
  }

  // steps[].path 元素在 JSAPI 2.0 中是 LngLat 对象（{lng, lat}），兼容数组形式
  const gcjPath = route0.steps
    .flatMap((s) => s.path || [])
    .map((p) => (Array.isArray(p) ? p : [p.lng, p.lat]))

  const route = {
    path: gcj02PathToWgs84(gcjPath),
    distance: route0.distance,
    duration: route0.time,
  }
  await setCachedRoute(key, route)
  return route
}
```

- [ ] **Step 4: 运行测试确认通过**

```powershell
npm test
```

Expected: PASS，useDriving 5 个测试通过（其中重试测试约 1~2 秒）。

- [ ] **Step 5: 提交**

```bash
git add src/composables/useDriving.js src/composables/useDriving.test.js
git commit -m "feat: 高德驾车路线计算与 IndexedDB 缓存"
```

---

## Task 6: PlannerView 真实路线渲染与计算按钮

**Files:**
- Modify: `src/views/PlannerView.vue`（整体替换）

- [ ] **Step 1: 整体替换 PlannerView.vue**

```vue
<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useSettingsStore } from '../stores/settings'
import { useTripStore } from '../stores/trip'
import { loadAmap } from '../composables/useAmap'
import { planDrivingRoute } from '../composables/useDriving'
import { wgs84ToGcj02 } from '../utils/coords'
import { wgs84PathToGcj02 } from '../utils/coords'
import PoiSearchPanel from '../components/PoiSearchPanel.vue'

const settings = useSettingsStore()
const trip = useTripStore()
const mapEl = ref(null)
const error = ref('')
const calcError = ref('')
const calculating = ref(false)
let map = null
let AMapRef = null
let overlays = [] // 当前绘制在地图上的 marker / polyline，便于清除

// 每天一种颜色，循环使用
const DAY_COLORS = [
  '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1',
]

const tab = ref('route') // 'route' | 'search'

onMounted(async () => {
  if (!settings.hasAmapKey) {
    error.value = '尚未配置高德 API Key'
    return
  }
  try {
    const AMap = await loadAmap(settings.amapKey, settings.amapSecurityCode)
    AMapRef = AMap
    map = new AMap.Map(mapEl.value, {
      zoom: 6,
      center: [101.5, 30.0],
      mapStyle: 'amap://styles/normal',
    })
    map.addControl(new AMap.Scale())
    map.addControl(new AMap.ToolBar({ position: 'RB' }))
    if (trip.plan) drawPlan()
  } catch (e) {
    error.value = '地图加载失败：' + e.message
  }
})

onBeforeUnmount(() => {
  clearOverlays()
  if (map) { map.destroy(); map = null }
})

// 路线数据（含节点编辑、segments 计算结果）变化时重绘
watch(() => trip.plan, () => {
  if (map) drawPlan()
}, { deep: true })

function clearOverlays() {
  if (map && overlays.length) map.remove(overlays)
  overlays = []
}

// 数据模型存 WGS-84；高德地图显示前转 GCJ-02
function toGcj(w) {
  const p = wgs84ToGcj02(w.lng, w.lat)
  return [p.lng, p.lat]
}

function drawPlan() {
  if (!map || !AMapRef) return
  clearOverlays()
  if (!trip.plan) return

  const AMap = AMapRef
  trip.plan.days.forEach((day, i) => {
    const color = DAY_COLORS[i % DAY_COLORS.length]

    if (day.segments?.length) {
      // 已计算的真实驾车路线
      for (const seg of day.segments) {
        overlays.push(
          new AMap.Polyline({
            path: wgs84PathToGcj02(seg.path),
            strokeColor: color,
            strokeWeight: 5,
            strokeOpacity: 0.85,
            lineJoin: 'round',
          }),
        )
      }
    } else if (day.waypoints.length > 1) {
      // 未计算路线时退化为虚线直连
      overlays.push(
        new AMap.Polyline({
          path: day.waypoints.map(toGcj),
          strokeColor: color,
          strokeWeight: 4,
          strokeOpacity: 0.5,
          strokeStyle: 'dashed',
          lineJoin: 'round',
        }),
      )
    }

    day.waypoints.forEach((w) => {
      const marker = new AMap.Marker({
        position: toGcj(w),
        title: `Day ${day.dayNumber} · ${w.name}`,
        anchor: 'bottom-center',
      })
      marker.on('click', () => {
        const info = new AMap.InfoWindow({
          content: `<div style="font-size:13px;padding:2px 4px;line-height:1.6">
            <b>${w.name}</b><br>
            Day ${day.dayNumber}${day.overnight ? ' · 宿' + day.overnight : ''}
            ${w.altitude ? '<br>海拔 ' + w.altitude + 'm' : ''}
          </div>`,
          offset: new AMap.Pixel(0, -30),
        })
        info.open(map, marker.getPosition())
      })
      overlays.push(marker)
    })
  })

  if (overlays.length) {
    map.add(overlays)
    map.setFitView(overlays, false, [40, 40, 40, 40])
  }
}

function loadPreset() {
  trip.loadPreset318()
}

// 逐天逐段计算驾车路线；已算过的天跳过；失败保留已算结果，可重试
async function calcRoutes() {
  if (!AMapRef || !trip.plan || calculating.value) return
  calculating.value = true
  calcError.value = ''
  try {
    for (const day of trip.plan.days) {
      if (day.segments?.length || day.waypoints.length < 2) continue
      const segments = []
      for (let i = 0; i < day.waypoints.length - 1; i++) {
        const from = day.waypoints[i]
        const to = day.waypoints[i + 1]
        const route = await planDrivingRoute(AMapRef, from, to)
        segments.push({ fromName: from.name, toName: to.name, ...route })
      }
      trip.setDaySegments(day.dayNumber, segments)
    }
  } catch (e) {
    calcError.value = '路线计算失败：' + e.message + '（已算好的天已保留，可重试）'
  } finally {
    calculating.value = false
  }
}

function flyTo(poi) {
  if (!map) return
  map.setZoomAndCenter(14, [poi.lng, poi.lat])
}
</script>

<template>
  <div class="flex h-full">
    <!-- 侧边栏 -->
    <aside class="w-80 shrink-0 border-r border-black/5 bg-white/60 overflow-auto p-4 space-y-4">
      <div class="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button
          @click="tab = 'route'"
          :class="['flex-1 py-1.5 rounded-md text-sm transition', tab === 'route' ? 'bg-white shadow-sm' : 'text-gray-500']"
        >路线</button>
        <button
          @click="tab = 'search'"
          :class="['flex-1 py-1.5 rounded-md text-sm transition', tab === 'search' ? 'bg-white shadow-sm' : 'text-gray-500']"
        >搜索</button>
      </div>

      <!-- 路线标签 -->
      <template v-if="tab === 'route'">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">路线</h2>
          <button
            @click="loadPreset"
            class="text-xs px-2.5 py-1 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition"
          >加载 318 预设</button>
        </div>
        <div v-if="trip.plan" class="space-y-2">
          <p class="text-xs text-gray-500">{{ trip.plan.name }}</p>
          <button
            @click="calcRoutes"
            :disabled="calculating"
            class="w-full py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >{{ calculating ? '计算中…' : '计算驾车路线' }}</button>
          <p v-if="calcError" class="text-xs text-red-500">{{ calcError }}</p>
          <div
            v-for="day in trip.plan.days"
            :key="day.dayNumber"
            class="rounded-lg border border-gray-100 p-2.5"
          >
            <div class="text-sm font-medium">Day {{ day.dayNumber }} · 宿{{ day.overnight }}</div>
            <div class="text-xs text-gray-400 mt-0.5">
              {{ day.waypoints.map(w => w.name).join(' → ') }}
            </div>
          </div>
        </div>
        <p v-else class="text-sm text-gray-400">点击「加载 318 预设」开始。</p>
      </template>

      <!-- 搜索标签 -->
      <template v-else>
        <PoiSearchPanel @select="flyTo" />
      </template>
    </aside>

    <!-- 地图 -->
    <div class="flex-1 relative">
      <div ref="mapEl" class="absolute inset-0"></div>
      <div
        v-if="error"
        class="absolute inset-0 flex flex-col items-center justify-center text-center gap-2 bg-gray-50"
      >
        <p class="text-gray-500">{{ error }}</p>
        <RouterLink to="/settings" class="text-sm text-accent">前往设置 →</RouterLink>
      </div>
    </div>
  </div>
</template>
```

注意：两个 coords import 合并为一行 `import { wgs84ToGcj02, wgs84PathToGcj02 } from '../utils/coords'`。

- [ ] **Step 2: 运行测试与构建**

```powershell
npm test
npm run build
```

Expected: 测试全过，构建成功。

- [ ] **Step 3: 手动验证（需高德 Key）**

```powershell
npm run dev
```

Expected:
- 加载 318 预设 → 地图显示按天分色的**虚线**直连 + 标记点
- 点「计算驾车路线」→ 按钮变「计算中…」，完成后虚线变为沿真实道路的实线
- 点击任意标记 → InfoWindow 显示名称 / Day / 海拔
- 刷新页面重进 → 再点「计算驾车路线」时秒回（IndexedDB 缓存命中，注意此时路书尚未自动保存，需重新加载预设）

- [ ] **Step 4: 提交**

```bash
git add src/views/PlannerView.vue
git commit -m "feat: 真实驾车路线渲染与按天分色绘制"
```

---

## Task 7: DayCard 路线编辑 UI

**Files:**
- Create: `src/components/DayCard.vue`
- Modify: `src/views/PlannerView.vue`

- [ ] **Step 1: 创建 DayCard.vue**

`src/components/DayCard.vue`：

```vue
<script setup>
import { ref, computed } from 'vue'
import { useTripStore } from '../stores/trip'
import { formatDistance, formatDuration } from '../utils/format'

const props = defineProps({
  day: { type: Object, required: true },
  color: { type: String, default: '#3b82f6' },
})

const trip = useTripStore()
const expanded = ref(false)

const summary = computed(() => {
  const segs = props.day.segments
  if (!segs?.length) return null
  const dist = segs.reduce((s, x) => s + x.distance, 0)
  const dur = segs.reduce((s, x) => s + x.duration, 0)
  return `${formatDistance(dist)} · ${formatDuration(dur)}`
})
</script>

<template>
  <div class="rounded-lg border border-gray-100 overflow-hidden">
    <button
      class="w-full flex items-center gap-2 p-2.5 text-left hover:bg-gray-50 transition"
      @click="expanded = !expanded"
    >
      <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: color }"></span>
      <span class="text-sm font-medium flex-1">
        Day {{ day.dayNumber }}<template v-if="day.overnight"> · 宿{{ day.overnight }}</template>
      </span>
      <span v-if="summary" class="text-xs text-gray-400 shrink-0">{{ summary }}</span>
      <span class="text-gray-300 text-xs">{{ expanded ? '▲' : '▼' }}</span>
    </button>

    <div v-if="!expanded" class="px-2.5 pb-2 text-xs text-gray-400 -mt-1">
      {{ day.waypoints.map((w) => w.name).join(' → ') || '暂无节点' }}
    </div>

    <div v-else class="px-2.5 pb-2.5 space-y-2 border-t border-gray-50 pt-2">
      <label class="flex items-center gap-2 text-xs text-gray-500">
        住宿地
        <input
          :value="day.overnight"
          @change="trip.setOvernight(day.dayNumber, $event.target.value)"
          class="flex-1 px-2 py-1 rounded border border-gray-200 focus:border-accent focus:outline-none text-xs"
          placeholder="如：康定"
        />
      </label>

      <div
        v-for="(w, i) in day.waypoints"
        :key="i"
        class="flex items-center gap-1"
      >
        <span class="text-[10px] text-gray-300 w-4 text-right shrink-0">{{ i + 1 }}</span>
        <input
          :value="w.name"
          @change="trip.updateWaypoint(day.dayNumber, i, { name: $event.target.value })"
          class="flex-1 min-w-0 px-2 py-1 rounded border border-gray-200 focus:border-accent focus:outline-none text-xs"
        />
        <button
          class="text-gray-300 hover:text-accent disabled:opacity-30 px-0.5"
          :disabled="i === 0"
          title="上移"
          @click="trip.moveWaypoint(day.dayNumber, i, -1)"
        >↑</button>
        <button
          class="text-gray-300 hover:text-accent disabled:opacity-30 px-0.5"
          :disabled="i === day.waypoints.length - 1"
          title="下移"
          @click="trip.moveWaypoint(day.dayNumber, i, 1)"
        >↓</button>
        <button
          class="text-gray-300 hover:text-red-500 px-0.5"
          title="删除节点"
          @click="trip.removeWaypoint(day.dayNumber, i)"
        >✕</button>
      </div>
      <p v-if="!day.waypoints.length" class="text-xs text-gray-400">
        在「搜索」中添加 POI，或用「点图添加节点」加入途经点。
      </p>

      <div v-if="day.segments?.length" class="space-y-0.5 pt-1 border-t border-gray-50">
        <p v-for="(s, i) in day.segments" :key="i" class="text-[11px] text-gray-400">
          {{ s.fromName }} → {{ s.toName }}：{{ formatDistance(s.distance) }} · {{ formatDuration(s.duration) }}
        </p>
      </div>

      <button
        class="text-xs text-red-400 hover:text-red-600 transition"
        @click="trip.removeDay(day.dayNumber)"
      >删除 Day {{ day.dayNumber }}</button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 在 PlannerView 中替换天列表**

`src/views/PlannerView.vue` 的 import 区追加：

```js
import DayCard from '../components/DayCard.vue'
```

将路线标签中的天列表循环（`<div v-for="day in trip.plan.days" ...>` 整个块）替换为：

```vue
          <DayCard
            v-for="(day, i) in trip.plan.days"
            :key="day.dayNumber"
            :day="day"
            :color="DAY_COLORS[i % DAY_COLORS.length]"
          />
          <button
            @click="trip.addDay()"
            class="w-full py-1.5 rounded-lg border border-dashed border-gray-300 text-sm text-gray-400 hover:border-accent hover:text-accent transition"
          >+ 添加一天</button>
```

- [ ] **Step 3: 运行测试与构建**

```powershell
npm test
npm run build
```

Expected: 全部通过。

- [ ] **Step 4: 手动验证（需高德 Key）**

```powershell
npm run dev
```

Expected:
- 每天显示为可展开卡片，标题带当天颜色圆点；已计算路线的天显示「176km · 5小时12分」摘要
- 展开后可：改住宿地、改节点名、↑↓ 调整顺序、✕ 删除节点、删除整天
- 节点变动后该天路线退回虚线（segments 失效），再点「计算驾车路线」只重算该天
- 「+ 添加一天」追加空天

- [ ] **Step 5: 提交**

```bash
git add src/components/DayCard.vue src/views/PlannerView.vue
git commit -m "feat: 多天路线分段编辑 UI"
```

---

## Task 8: POI 添加到路线

**Files:**
- Modify: `src/components/PoiSearchPanel.vue`
- Modify: `src/views/PlannerView.vue`

- [ ] **Step 1: PoiSearchPanel 增加 add 事件**

`src/components/PoiSearchPanel.vue` 中 `const emit = defineEmits(['select'])` 改为：

```js
const emit = defineEmits(['select', 'add'])
```

结果列表 `<li>` 整体替换为（行点击飞到位置不变，新增 ＋ 按钮添加到路线）：

```vue
      <li
        v-for="r in results"
        :key="r.id"
        class="rounded-lg border border-gray-100 p-2.5 hover:border-accent/40 cursor-pointer transition"
        @click="emit('select', r)"
      >
        <div class="flex items-center gap-2">
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium">{{ r.name }}</div>
            <div class="text-xs text-gray-400 mt-0.5 truncate">{{ r.address || '无地址信息' }}</div>
          </div>
          <button
            class="shrink-0 text-xs px-2 py-1 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition"
            title="添加到路线"
            @click.stop="emit('add', r)"
          >＋</button>
        </div>
      </li>
```

- [ ] **Step 2: PlannerView 增加目标天选择器与添加逻辑**

`src/views/PlannerView.vue` script 修改：

import 区的 coords 导入增加 `gcj02ToWgs84`：

```js
import { wgs84ToGcj02, wgs84PathToGcj02, gcj02ToWgs84 } from '../utils/coords'
```

在 `const tab = ref('route')` 下方追加：

```js
const targetDay = ref(1)

// 天数变化（删除天等）时保证 targetDay 始终有效
watch(
  () => trip.plan?.days.map((d) => d.dayNumber) ?? [],
  (nums) => {
    if (!nums.includes(targetDay.value)) targetDay.value = nums[0] ?? 1
  },
)

// POI 坐标来自高德搜索（GCJ-02），入库前转 WGS-84
function addPoiToRoute(poi) {
  if (!trip.plan) trip.newEmptyPlan()
  const p = gcj02ToWgs84(poi.lng, poi.lat)
  trip.addWaypoint(targetDay.value, { name: poi.name, lng: p.lng, lat: p.lat })
}
```

模板中，标签切换条（`<div class="flex gap-1 bg-gray-100 rounded-lg p-1">...</div>`）下方追加目标天选择器（两个标签页都可见）：

```vue
      <div v-if="trip.plan" class="flex items-center gap-2 text-xs text-gray-500">
        目标天
        <select
          v-model.number="targetDay"
          class="flex-1 px-2 py-1 rounded border border-gray-200 text-xs focus:outline-none focus:border-accent bg-white"
        >
          <option v-for="d in trip.plan.days" :key="d.dayNumber" :value="d.dayNumber">
            Day {{ d.dayNumber }}{{ d.overnight ? ' · 宿' + d.overnight : '' }}
          </option>
        </select>
      </div>
```

搜索标签中 `<PoiSearchPanel @select="flyTo" />` 改为：

```vue
        <PoiSearchPanel @select="flyTo" @add="addPoiToRoute" />
```

- [ ] **Step 3: 运行测试与构建**

```powershell
npm test
npm run build
```

Expected: 全部通过。

- [ ] **Step 4: 手动验证（需高德 Key）**

```powershell
npm run dev
```

Expected:
- 切到「搜索」，搜「康定 酒店」，结果行出现 ＋ 按钮
- 选择目标天 Day 1，点 ＋ → 切回「路线」，Day 1 末尾出现该 POI，地图出现对应标记
- 没有路书时点 ＋ → 自动创建「我的路书」（1 天）并添加

- [ ] **Step 5: 提交**

```bash
git add src/components/PoiSearchPanel.vue src/views/PlannerView.vue
git commit -m "feat: POI 一键添加到路线"
```

---

## Task 9: 地图点击添加节点

**Files:**
- Modify: `src/views/PlannerView.vue`

- [ ] **Step 1: 增加添加节点模式**

`src/views/PlannerView.vue` script，在 `const targetDay = ref(1)` 下方追加：

```js
const addNodeMode = ref(false)
```

`onMounted` 中 `map.addControl(new AMap.ToolBar({ position: 'RB' }))` 之后追加：

```js
    map.on('click', onMapClick)
```

script 中追加函数（放在 `addPoiToRoute` 之后）：

```js
// 地图点击坐标是 GCJ-02，入库前转 WGS-84
function onMapClick(e) {
  if (!addNodeMode.value) return
  if (!trip.plan) trip.newEmptyPlan()
  const p = gcj02ToWgs84(e.lnglat.getLng(), e.lnglat.getLat())
  trip.addWaypoint(targetDay.value, { name: '自定义节点', lng: p.lng, lat: p.lat })
  addNodeMode.value = false
}
```

- [ ] **Step 2: 地图上加模式切换按钮**

模板中 `<div ref="mapEl" class="absolute inset-0"></div>` 之后追加：

```vue
      <button
        v-if="!error"
        @click="addNodeMode = !addNodeMode"
        :class="['absolute top-3 left-3 z-10 px-3 py-1.5 rounded-lg text-xs shadow-sm transition',
                 addNodeMode ? 'bg-accent text-white' : 'bg-white/90 text-gray-600 hover:text-accent']"
      >{{ addNodeMode ? '点击地图添加到 Day ' + targetDay + '…（再点取消）' : '📍 点图添加节点' }}</button>
```

- [ ] **Step 3: 运行测试与构建**

```powershell
npm test
npm run build
```

Expected: 全部通过。

- [ ] **Step 4: 手动验证（需高德 Key）**

```powershell
npm run dev
```

Expected:
- 地图左上角出现「📍 点图添加节点」按钮
- 点击进入模式（按钮变蓝），点击地图任意位置 → 目标天末尾出现「自定义节点」，标记落点与点击处一致（坐标转换往返无可见漂移），模式自动退出
- 展开 DayCard 可重命名该节点

- [ ] **Step 5: 提交**

```bash
git add src/views/PlannerView.vue
git commit -m "feat: 地图点击添加自定义节点"
```

---

## Task 10: IndexedDB 自动保存与启动恢复

**Files:**
- Modify: `src/App.vue`（整体替换）

- [ ] **Step 1: 整体替换 App.vue**

```vue
<script setup>
import { onMounted, watch } from 'vue'
import NavBar from './components/NavBar.vue'
import { useTripStore } from './stores/trip'
import { loadTrip, saveTrip } from './utils/db'

const trip = useTripStore()
let saveTimer = null

onMounted(async () => {
  // 启动恢复：仅在当前没有路书时恢复，避免覆盖
  try {
    const saved = await loadTrip()
    if (saved && !trip.plan) trip.replacePlan(saved)
  } catch (e) {
    console.warn('路书恢复失败：', e)
  }

  // 自动保存：深度监听 500ms 防抖；JSON 序列化剥离 Vue Proxy（IndexedDB 无法克隆 Proxy）
  watch(
    () => trip.plan,
    (val) => {
      clearTimeout(saveTimer)
      if (!val) return
      saveTimer = setTimeout(() => {
        saveTrip(JSON.parse(JSON.stringify(val))).catch((e) => console.warn('自动保存失败：', e))
      }, 500)
    },
    { deep: true },
  )
})
</script>

<template>
  <div class="flex flex-col h-full">
    <NavBar />
    <main class="flex-1 min-h-0 overflow-auto">
      <RouterView />
    </main>
  </div>
</template>
```

- [ ] **Step 2: 运行测试与构建**

```powershell
npm test
npm run build
```

Expected: 全部通过。

- [ ] **Step 3: 手动验证（需高德 Key）**

```powershell
npm run dev
```

Expected:
- 加载预设 + 计算路线 + 改几个节点 → 关闭标签页重新打开 → 路线（含已算驾车路径、编辑结果）完整恢复
- DevTools → Application → IndexedDB → `wandertalk` 库中可见 `trip` 与 `routeCache` 两个 store

- [ ] **Step 4: 提交**

```bash
git add src/App.vue
git commit -m "feat: 路书 IndexedDB 自动保存与启动恢复"
```

---

## Task 11: JSON 导出/导入 UI

**Files:**
- Modify: `src/views/PlannerView.vue`

- [ ] **Step 1: 增加导出/导入逻辑**

`src/views/PlannerView.vue` script，在 `const addNodeMode = ref(false)` 下方追加：

```js
const importFileEl = ref(null)
const importError = ref('')
```

script 中追加函数（放在 `onMapClick` 之后）：

```js
function exportJson() {
  const blob = new Blob([trip.exportJson()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${trip.plan?.name || 'wandertalk'}-路书.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function onImportFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  importError.value = ''
  try {
    trip.importJson(await file.text())
  } catch (err) {
    importError.value = err.message
  }
}
```

- [ ] **Step 2: 路线标签底部加按钮**

模板路线标签内，`+ 添加一天` 按钮所在块之后、`</template>` 之前（即 `v-if="trip.plan"` 块的外面、路线标签的最后）追加：

```vue
        <div class="flex gap-2 pt-1">
          <button
            @click="exportJson"
            :disabled="!trip.plan"
            class="flex-1 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:border-accent hover:text-accent transition disabled:opacity-40"
          >导出 JSON</button>
          <button
            @click="importFileEl.click()"
            class="flex-1 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:border-accent hover:text-accent transition"
          >导入 JSON</button>
          <input
            ref="importFileEl"
            type="file"
            accept=".json,application/json"
            class="hidden"
            @change="onImportFile"
          />
        </div>
        <p v-if="importError" class="text-xs text-red-500">{{ importError }}</p>
```

- [ ] **Step 3: 运行测试与构建**

```powershell
npm test
npm run build
```

Expected: 全部通过。

- [ ] **Step 4: 手动验证（需高德 Key）**

```powershell
npm run dev
```

Expected:
- 「导出 JSON」下载 `318 川藏线（成都 → 拉萨）-路书.json`，内容含 days/waypoints/segments
- 清空路书后「导入 JSON」选择刚导出的文件 → 路线完整恢复（含已算路径）
- 导入非 JSON 文件 → 红字提示「不是有效的 JSON 文件」，不崩溃

- [ ] **Step 5: 提交**

```bash
git add src/views/PlannerView.vue
git commit -m "feat: 路书 JSON 导出与导入"
```

---

## Task 12: 收尾：CHANGELOG、全量验证与推送

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 更新 CHANGELOG**

在 `CHANGELOG.md` 的 `## [Unreleased]` → `### Added` 列表末尾追加：

```markdown
- GCJ-02 ↔ WGS-84 坐标转换层，数据模型统一存储 WGS-84
- 高德驾车路线计算：沿真实道路绘制、距离/时长展示、IndexedDB 缓存
- 多天路线分段编辑：增删天数、节点重命名/排序/删除、住宿地编辑
- POI 搜索结果一键添加到指定天
- 地图点击添加自定义节点
- 路书 IndexedDB 自动保存与启动恢复
- 路书 JSON 导出/导入
```

- [ ] **Step 2: 全量验证**

```powershell
npm test
npm run build
```

Expected: 全部测试通过（11 个原有 + 约 34 个新增），构建成功。

- [ ] **Step 3: 提交并推送**

```bash
git add CHANGELOG.md
git commit -m "docs: 更新 CHANGELOG（Phase 2 路线编辑）"
git push origin main
```

- [ ] **Step 4: 验证 CI**

GitHub Actions CI 应自动运行并通过（`npm ci && npm test && npm run build`）。

---

## Self-Review

**Spec coverage（对照 PRD v2 Phase 2 共 8 项）：**
- ✅ 坐标转换层（coordtransform）→ Task 1
- ✅ 高德驾车路线计算（含 IndexedDB 缓存）→ Task 3, 5, 6
- ✅ 多天路线分段编辑（增删天数、节点排序）→ Task 4, 7（拖拽以上移/下移按钮替代，已在头部声明）
- ✅ 地图渲染路线（按天分色、点击详情）→ Task 6
- ✅ POI 添加到路线 → Task 8
- ✅ 地图点击添加节点 → Task 9
- ✅ IndexedDB 自动保存 → Task 10
- ✅ 路书 JSON 导出/导入 → Task 4（逻辑）, 11（UI）

**Placeholder scan:** 无 TBD/TODO；所有代码步骤含完整代码。

**Type consistency:**
- segment 结构 `{ fromName, toName, path: [[lng,lat]...], distance(米), duration(秒) }` 在 useDriving.js、trip store 测试、PlannerView.calcRoutes、DayCard 中一致。
- `planDrivingRoute(AMap, from, to)` 与 `routeCacheKey(from, to)` 签名在实现、测试、PlannerView 中一致。
- db.js 接口 `saveTrip/loadTrip/clearTrip/getCachedRoute/setCachedRoute` 在实现、测试、useDriving、App.vue 中一致。
- coords.js 四个函数名在所有调用方一致。
- trip store 新函数 `newEmptyPlan/replacePlan/addDay/removeDay/setOvernight/addWaypoint/removeWaypoint/updateWaypoint/moveWaypoint/setDaySegments/exportJson/importJson` 在 store、测试、DayCard、PlannerView、App.vue 中一致。

**备注:** 高德 JSAPI 2.0 的 `Driving` 结果结构（`routes[0].steps[].path`）按官方文档处理并兼容数组/LngLat 两种元素形式；限流（CUQPS）通过失败后 1 秒重试一次 + 缓存复用缓解。
