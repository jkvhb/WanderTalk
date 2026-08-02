# Authoritative 318 Route Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把用户审定的《318 川藏线权威底稿 v1》变成可运行的九天主路线，补齐 46 个主线节点，使用高德地点搜索确认新增节点，并逐段重新计算真实驾车路线。

**Architecture:** 现有 `preset318` 继续作为播放器和编辑器使用的运行数据，避免整体改造。新增一份权威节点清单（通俗讲：AI 规划阶段的“任务单”），将已核验地点直接映射到当前预设，只对营官寨三岔路口和尼玛贡神山观景台调用高德地点搜索；全部地点就绪后才生成新路书。路线重算后由独立纯函数检查缺段、直线兜底、终点偏移和异常绕行，错误会阻止后续文案、配图和视频生成。

**Tech Stack:** Vue 3、Pinia、AMap JS API 2.0、Vitest、现有 WGS-84/GCJ-02 坐标转换与 IndexedDB 路线缓存。

**通俗解释：** WGS-84 是项目保存和视频地图使用的坐标；GCJ-02 是高德地图返回的国内偏移坐标。地点搜索结果必须先转换为 WGS-84，才能避免路线与视频地图错位。

---

## File map

- `src/data/authoritative318.js`：46 个不重复主线节点、每天顺序、讲解等级、内容底稿和图片身份要求。
- `src/data/authoritative318.test.js`：保证节点一个不少、跨日引用正确、可选支线不混入主线。
- `src/composables/usePlaceResolve.js`：通过高德文本搜索解析尚未核验的地点。
- `src/composables/usePlaceResolve.test.js`：搜索候选过滤、歧义和坐标转换测试。
- `src/utils/authoritative318Plan.js`：把权威节点清单和地点解析结果编译成当前 `days[].waypoints[]` 路书。
- `src/utils/authoritative318Plan.test.js`：缺地点阻断、跨日复用和生成字段测试。
- `src/utils/routeQuality.js`：检查已计算道路是否完整可信。
- `src/utils/routeQuality.test.js`：缺段、直线、终点偏移和异常绕行测试。
- `src/data/preset318.js`：浏览器确认两个新增地点后，把核验结果固化为下一版默认预设。
- `src/data/preset318.test.js`：九天、46 个唯一节点和发布校验回归。
- `src/stores/trip.js`：增加从零加载权威路书入口和路线校验结果。
- `src/stores/trip.test.js`：确保从零加载不会继承旧文案、图片、语音编排或路线。
- `src/views/PlannerView.vue`：权威底稿加载、地点解析、路线重算进度和成功/部分成功/失败显示。
- `src/utils/fixed318Migration.js`：提升版本并保持旧用户内容迁移兼容。
- `src/utils/fixed318Migration.test.js`：旧内容保留和新节点补齐测试。
- `docs/reference/fixed318-place-audit.md`：记录新增地点证据和本轮九天路线结果。

---

### Task 1: Encode the approved 46-node authority list

**Files:**
- Create: `src/data/authoritative318.js`
- Create: `src/data/authoritative318.test.js`

- [ ] **Step 1: Write the failing authority-list test**

```js
import { describe, expect, it } from 'vitest'
import { authoritative318 } from './authoritative318'

describe('authoritative318', () => {
  it('keeps nine consecutive days and 46 unique main-route places', () => {
    expect(authoritative318.days.map((day) => day.dayNumber)).toEqual([1,2,3,4,5,6,7,8,9])
    const ids = authoritative318.days.flatMap((day) => day.nodes.map((node) => node.placeId))
    expect(new Set(ids).size).toBe(46)
    expect(ids).toContain('yingguanzhai-junction')
    expect(ids).toContain('nimagong-viewpoint')
  })

  it('gives every node a narration tier and visual identity brief', () => {
    for (const node of authoritative318.days.flatMap((day) => day.nodes)) {
      expect(['A', 'B', 'C']).toContain(node.narrationLevel)
      expect(node.contentBrief.trim()).not.toBe('')
      expect(node.imageIdentity.trim()).not.toBe('')
      expect(node.sourcePages.length).toBeGreaterThan(0)
    }
  })

  it('keeps optional branches outside the daily node sequence', () => {
    const ids = authoritative318.days.flatMap((day) => day.nodes.map((node) => node.placeId))
    expect(ids).not.toContain('laigu-glacier')
    expect(ids).not.toContain('daocheng-yading')
    expect(authoritative318.alternatives.map((item) => item.placeId)).toContain('laigu-glacier')
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- --run src/data/authoritative318.test.js`  
Expected: FAIL because `src/data/authoritative318.js` does not exist.

- [ ] **Step 3: Create the immutable authority list**

Use the approved document fields without putting routes or generated media into this file:

```js
const node = (placeId, name, narrationLevel, sourcePages, contentBrief, imageIdentity, extra = {}) => ({
  placeId,
  name,
  narrationLevel,
  sourcePages,
  contentBrief,
  imageIdentity,
  routeType: 'main',
  ...extra,
})

const identities = [
  { dayNumber: 1, overnightPlaceId: 'kangding', nodes: [
    ['chengdu', '成都', 'A', [1]], ['yaan', '雅安', 'B', [1]],
    ['tianquan-service', '天全服务区', 'C', [2]], ['erlangshan-tunnel', '二郎山隧道', 'B', [2]],
    ['luding', '泸定', 'A', [3]], ['kangding', '康定', 'A', [3, 4]],
  ]},
  { dayNumber: 2, overnightPlaceId: 'yajiang', nodes: [
    ['zheduo-pass', '折多山垭口', 'A', [5]], ['yingguanzhai-junction', '营官寨三岔路口', 'C', [5]],
    ['xinduqiao', '新都桥', 'A', [5, 6]], ['yajiang', '雅江', 'A', [6, 7]],
  ]},
  { dayNumber: 3, overnightPlaceId: 'batang', nodes: [
    ['tianlu-18-bends', '天路十八弯', 'B', [8]], ['jianziwan-pass', '剪子弯山', 'B', [8]],
    ['nimagong-viewpoint', '尼玛贡神山观景台', 'B', [8]], ['kazila-pass', '卡子拉山', 'B', [9]],
    ['litang', '理塘', 'A', [9, 10]], ['maoya-grassland', '毛垭大草原', 'B', [10, 11]],
    ['sister-lakes', '海子山姊妹湖', 'A', [11]], ['batang', '巴塘', 'A', [11, 12]],
  ]},
  { dayNumber: 4, overnightPlaceId: 'zuogong', nodes: [
    ['jinsha-river-bridge', '金沙江大桥', 'A', [12]], ['zongbala-pass', '宗巴拉山', 'B', [13]],
    ['mangkang', '芒康', 'A', [13]], ['lawu-pass', '拉乌山', 'B', [14]],
    ['rumei', '如美镇', 'B', [14]], ['jueba-pass', '觉巴山', 'B', [14]],
    ['dongda-pass', '东达山', 'A', [14]], ['zuogong', '左贡', 'A', [15]],
  ]},
  { dayNumber: 5, overnightPlaceId: 'basu', nodes: [
    ['bangda', '邦达草原', 'B', [16]], ['yela-pass', '业拉山', 'B', [16]],
    ['nujiang-72', '怒江七十二拐', 'A', [16]], ['nujiang-bridge', '怒江大桥', 'A', [16, 17]],
    ['basu', '八宿', 'A', [17]],
  ]},
  { dayNumber: 6, overnightPlaceId: 'bomi', nodes: [
    ['anjiula-pass', '安久拉山', 'B', [18]], ['ranwu-lake', '然乌湖', 'A', [18]],
    ['midui-glacier', '米堆冰川', 'A', [19]], ['bomi', '波密', 'A', [19, 20]],
  ]},
  { dayNumber: 7, overnightPlaceId: 'suosong', nodes: [
    ['guxiang-lake', '古乡湖', 'B', [20]], ['tongmai', '通麦', 'B', [20]],
    ['lulang', '鲁朗林海', 'A', [20, 21]], ['segrila-pass', '色季拉山', 'A', [21]],
    ['suosong', '索松村', 'A', [22]],
  ]},
  { dayNumber: 8, overnightPlaceId: 'gongbo-gyamda', nodes: [
    ['nyingchi', '林芝', 'A', [22, 23]], ['basongtso', '巴松措', 'A', [23]],
    ['gongbo-gyamda', '工布江达', 'A', [23, 24]],
  ]},
  { dayNumber: 9, overnightPlaceId: 'lhasa', nodes: [
    ['mila-pass', '米拉山', 'A', [24]], ['mozhugongka', '墨竹工卡', 'B', [25]],
    ['lhasa', '拉萨', 'A', [25, 26]],
  ]},
]

export const authoritative318 = Object.freeze({
  authorityVersion: '2026-08-02-v1',
  days: identities.map(({ dayNumber, overnightPlaceId, nodes }) => ({
    dayNumber,
    overnightPlaceId,
    nodes: nodes.map(([placeId, name, narrationLevel, sourcePages]) => node(
      placeId,
      name,
      narrationLevel,
      sourcePages,
      contentBriefById[placeId],
      imageIdentityById[placeId],
      unresolvedById[placeId] || {},
    )),
  })),
  alternatives: [
    { placeId: 'laigu-glacier', name: '来古冰川', routeType: 'optional', dayNumber: 6 },
    { placeId: 'daocheng-yading', name: '稻城亚丁', routeType: 'optional', dayNumber: 3 },
  ],
})
```

`contentBriefById` and `imageIdentityById` must contain all 46 keys, using the exact “内容底稿”和“图片身份要求” cells from `docs/reference/318-authoritative-roadbook-v1.md`. `unresolvedById` contains exactly two requests:

```js
const unresolvedById = {
  'yingguanzhai-junction': { resolve: { query: '营官寨三岔路口', city: '康定市', aliases: ['营官寨', '营官村'], regionHints: ['康定', '新都桥'] } },
  'nimagong-viewpoint': { resolve: { query: '尼玛贡神山大型观景台旅游服务区', city: '理塘县', aliases: ['尼玛贡神山'], regionHints: ['理塘', '甘孜'] } },
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm.cmd test -- --run src/data/authoritative318.test.js`  
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/authoritative318.js src/data/authoritative318.test.js
git commit -m "feat(route): encode authoritative 318 nodes"
```

---

### Task 2: Resolve the two unverified places through AMap

**Files:**
- Create: `src/composables/usePlaceResolve.js`
- Create: `src/composables/usePlaceResolve.test.js`

- [ ] **Step 1: Write failing candidate-selection tests**

```js
import { describe, expect, it } from 'vitest'
import { choosePlaceCandidate, resolvePlaceByText } from './usePlaceResolve'

describe('choosePlaceCandidate', () => {
  it('requires both an accepted name and the expected region', () => {
    const result = choosePlaceCandidate([
      { name: '尼玛贡神山大型观景台旅游服务区', address: '甘孜州理塘县', location: { lng: 100.7, lat: 30.1 } },
      { name: '尼玛山', address: '云南省', location: { lng: 101, lat: 25 } },
    ], { aliases: ['尼玛贡神山'], regionHints: ['理塘', '甘孜'] })
    expect(result.name).toContain('尼玛贡神山')
  })

  it('returns an ambiguity issue instead of guessing', () => {
    expect(() => choosePlaceCandidate([
      { name: '营官村', address: '康定市新都桥镇', location: { lng: 1, lat: 1 } },
      { name: '营官寨', address: '康定市新都桥镇', location: { lng: 2, lat: 2 } },
    ], { aliases: ['营官'], regionHints: ['康定', '新都桥'] })).toThrow('找到多个可能地点')
  })
})

it('converts the chosen AMap coordinate to WGS-84 and keeps search evidence', async () => {
  const AMap = fakeAMapReturning({
    name: '尼玛贡神山大型观景台旅游服务区',
    address: '甘孜州理塘县',
    location: { lng: 100.7, lat: 30.1 },
  })
  const result = await resolvePlaceByText(AMap, {
    query: '尼玛贡神山大型观景台旅游服务区', city: '理塘县',
    aliases: ['尼玛贡神山'], regionHints: ['理塘', '甘孜'],
  }, { now: () => '2026-08-02T00:00:00.000Z' })
  expect(result).toMatchObject({
    name: '尼玛贡神山大型观景台旅游服务区',
    coordinateSystem: 'WGS-84',
    source: {
      provider: 'amap-js-place-search',
      query: '尼玛贡神山大型观景台旅游服务区',
      gcj02: { lng: 100.7, lat: 30.1 },
      checkedAt: '2026-08-02T00:00:00.000Z',
    },
  })
  expect(result.lng).not.toBe(100.7)
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- --run src/composables/usePlaceResolve.test.js`  
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement deterministic AMap text search**

```js
export function choosePlaceCandidate(pois, { aliases, regionHints }) {
  const matches = (pois || []).filter((poi) =>
    aliases.some((alias) => String(poi.name || '').includes(alias)) &&
    regionHints.some((hint) => `${poi.address || ''}${poi.pname || ''}${poi.cityname || ''}${poi.adname || ''}`.includes(hint)),
  )
  if (matches.length === 0) throw new Error('没有找到符合名称和地区的地点')
  if (matches.length > 1) throw new Error('找到多个可能地点，需要人工确认')
  return matches[0]
}

export function resolvePlaceByText(AMap, request, { now = () => new Date().toISOString() } = {}) {
  return new Promise((resolve, reject) => {
    const search = new AMap.PlaceSearch({ pageSize: 10, pageIndex: 1, city: request.city })
    search.search(request.query, (status, result) => {
      if (status !== 'complete') return reject(new Error('高德地点搜索失败'))
      try {
        const poi = choosePlaceCandidate(result.poiList?.pois, request)
        const gcj02 = { lng: Number(poi.location.lng), lat: Number(poi.location.lat) }
        const wgs84 = gcj02ToWgs84(gcj02.lng, gcj02.lat)
        resolve({
          name: poi.name,
          address: poi.address || '',
          ...wgs84,
          coordinateSystem: 'WGS-84',
          source: { provider: 'amap-js-place-search', query: request.query, resultName: poi.name, address: poi.address || '', gcj02, checkedAt: now() },
        })
      }
      catch (error) { reject(error) }
    })
  })
}
```

Convert the selected candidate from GCJ-02 to WGS-84 before storing it. Preserve query, result name, address, original GCJ-02 coordinate and `checkedAt` in `source`.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm.cmd test -- --run src/composables/usePlaceResolve.test.js`  
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/composables/usePlaceResolve.js src/composables/usePlaceResolve.test.js
git commit -m "feat(route): resolve authoritative places with AMap"
```

---

### Task 3: Compile the authority list into the existing plan format

**Files:**
- Create: `src/utils/authoritative318Plan.js`
- Create: `src/utils/authoritative318Plan.test.js`

- [ ] **Step 1: Write failing compiler tests**

```js
import { describe, expect, it } from 'vitest'
import { compileAuthoritative318Plan } from './authoritative318Plan'

it('blocks compilation while a main place is unresolved', () => {
  const result = compileAuthoritative318Plan({ authority, catalog: new Map() })
  expect(result.plan).toBeNull()
  expect(result.issues[0]).toMatchObject({ code: 'UNRESOLVED_MAIN_PLACE' })
})

it('reuses the previous overnight place without narrating it again', () => {
  const result = compileAuthoritative318Plan({ authority, catalog })
  expect(result.issues).toEqual([])
  expect(result.plan.days[0].waypoints.at(-1).placeId).toBe('kangding')
  expect(result.plan.days[1].waypoints[0]).toMatchObject({ placeId: 'kangding', narrate: false })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- --run src/utils/authoritative318Plan.test.js`  
Expected: FAIL because the compiler does not exist.

- [ ] **Step 3: Implement the compiler**

```js
export function compileAuthoritative318Plan({ authority, catalog }) {
  const issues = []
  const days = authority.days.map((day, dayIndex) => {
    const listed = day.nodes.map((spec) => {
      const place = catalog.get(spec.placeId)
      if (!place) {
        issues.push({ code: 'UNRESOLVED_MAIN_PLACE', dayNumber: day.dayNumber, placeId: spec.placeId })
        return null
      }
      return {
        ...place,
        narrationLevel: spec.narrationLevel,
        contentBrief: spec.contentBrief,
        imageIdentity: spec.imageIdentity,
        sourcePages: [...spec.sourcePages],
        narrate: true,
        roles: ['stop'],
        routeType: 'main',
      }
    }).filter(Boolean)
    const previousEnd = dayIndex > 0 ? authority.days[dayIndex - 1].overnightPlaceId : null
    const start = previousEnd ? { ...catalog.get(previousEnd), narrate: false, roles: ['origin', 'route'] } : null
    return {
      dayNumber: day.dayNumber,
      overnight: listed.at(-1)?.name || '',
      overnightPlaceId: day.overnightPlaceId,
      alternatives: authority.alternatives.filter((item) => item.dayNumber === day.dayNumber),
      waypoints: start ? [start, ...listed] : listed,
      segments: null,
    }
  })
  return issues.length ? { plan: null, issues } : { plan: { presetId: 'fixed-318', routeDataVersion: authority.authorityVersion, name: '318 川藏线（成都 → 拉萨）', days }, issues: [] }
}
```

The first day includes Chengdu from `day.nodes`; later days prepend only the previous overnight reference. Do not duplicate the overnight node inside the same day.

- [ ] **Step 4: Run compiler and preset tests**

Run: `npm.cmd test -- --run src/utils/authoritative318Plan.test.js`  
Expected: all tests PASS; the compiled runtime plan has 46 unique main places and passes `validatePlan`.

- [ ] **Step 5: Commit**

```bash
git add src/utils/authoritative318Plan.js src/utils/authoritative318Plan.test.js
git commit -m "feat(route): compile authoritative 318 plan"
```

---

### Task 4: Validate calculated road geometry

**Files:**
- Create: `src/utils/routeQuality.js`
- Create: `src/utils/routeQuality.test.js`
- Modify: `src/utils/planValidation.js`
- Modify: `src/utils/planValidation.test.js`

- [ ] **Step 1: Write failing route-quality tests**

```js
import { describe, expect, it } from 'vitest'
import { validateCalculatedRoutes } from './routeQuality'

it('rejects a missing segment and a two-point straight fallback', () => {
  const issues = validateCalculatedRoutes({ days: [{ dayNumber: 1, waypoints: [a,b,c], segments: [
    { fromName: 'A', toName: 'B', path: [[0,0],[1,1]], distance: 1000, duration: 100 },
  ] }] })
  expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
    'ROUTE_DAY_INCOMPLETE', 'STRAIGHT_LINE_FALLBACK',
  ]))
})

it('rejects a route whose path endpoint is far from the requested place', () => {
  const issues = validateCalculatedRoutes(planWithEndpointOffset)
  expect(issues).toContainEqual(expect.objectContaining({ code: 'ROUTE_ENDPOINT_MISMATCH' }))
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- --run src/utils/routeQuality.test.js`  
Expected: FAIL because `validateCalculatedRoutes` does not exist.

- [ ] **Step 3: Implement route checks**

Checks must return structured issues with `code`, `severity`, `dayNumber`, `segmentIndex`, and `message`:

```js
export function validateCalculatedRoutes(plan) {
  const issues = []
  for (const day of plan?.days || []) {
    const expected = Math.max(0, (day.waypoints?.length || 0) - 1)
    if ((day.segments?.length || 0) !== expected) issues.push(issue('ROUTE_DAY_INCOMPLETE', day))
    for (const [index, segment] of (day.segments || []).entries()) {
      if (!Array.isArray(segment.path) || segment.path.length < 3) issues.push(issue('STRAIGHT_LINE_FALLBACK', day, index))
      // Compare first/last path points with requested waypoints using haversine distance.
      // More than 2 km at either endpoint => ROUTE_ENDPOINT_MISMATCH.
      // Route distance more than 8x geodesic distance and over 80 km => SUSPICIOUS_ROUTE_DETOUR warning.
    }
  }
  return issues
}
```

“异常绕行”只产生 warning，因为山区盘山道路可能确实很长；缺段、直线和终点偏移产生 error。

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm.cmd test -- --run src/utils/routeQuality.test.js src/utils/planValidation.test.js`  
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/routeQuality.js src/utils/routeQuality.test.js src/utils/planValidation.js src/utils/planValidation.test.js
git commit -m "feat(route): validate calculated road geometry"
```

---

### Task 5: Add the from-zero authoritative planning workflow

**Files:**
- Modify: `src/stores/trip.js`
- Modify: `src/stores/trip.test.js`
- Modify: `src/views/PlannerView.vue`

- [ ] **Step 1: Write failing store tests**

```js
it('loads an authoritative plan from zero without generated artifacts', async () => {
  const store = useTripStore()
  await store.loadAuthoritative318({ resolvePlace: fakeResolver })
  for (const point of store.plan.days.flatMap((day) => day.waypoints)) {
    expect(point.narration).toBe('')
    expect(point.images).toEqual([])
    expect(point.choreography).toBeNull()
  }
  expect(store.plan.days.every((day) => day.segments === null)).toBe(true)
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- --run src/stores/trip.test.js`  
Expected: FAIL because `loadAuthoritative318` is missing.

- [ ] **Step 3: Implement the store workflow**

Add `authorityJob` with `state: idle|resolving|ready|partial|failed`, counts and per-place errors. `loadAuthoritative318` resolves only missing catalog entries, compiles the plan, normalizes it, clears all generated artifacts and leaves every `segments` value null.

Build the verified catalog explicitly from the current preset, keyed by `placeId`; this reuses the 44 already-audited coordinates and prevents unnecessary API calls. Only authority nodes absent from this map may call `resolvePlace`. This map is local to the store workflow, so the authority data file never imports the runtime preset and no circular dependency is introduced.

```js
const verifiedCatalog = new Map(
  preset318.days.flatMap((day) => day.waypoints).map((point) => [point.placeId, point]),
)
const pending = authoritative318.days
  .flatMap((day) => day.nodes)
  .filter((node) => !verifiedCatalog.has(node.placeId))
```

```js
async function loadAuthoritative318({ resolvePlace }) {
  authorityJob.value = { state: 'resolving', done: 0, total: pending.length, errors: [] }
  // Resolve pending points one by one; never guess on ambiguity.
  // Compile only when all 46 points are available.
  // On success: plan.value = normalizePlan(result.plan), state = 'ready'.
}
```

- [ ] **Step 4: Replace the planner entry and add clear status UI**

Change the button label to `加载权威 318 底稿（从零生成）`. While resolving, show `正在确认地点 x/y`. Use:

- green check only when all 46 places are compiled;
- yellow state when some places resolved but one or more need confirmation;
- red cross when the request fails and no usable plan is produced.

After loading, the route button must say `计算全部真实驾车路线` because all segments are intentionally empty.

- [ ] **Step 5: Run store tests and build**

Run: `npm.cmd test -- --run src/stores/trip.test.js src/data/authoritative318.test.js src/utils/authoritative318Plan.test.js`  
Expected: all tests PASS.

Run: `npm.cmd run build`  
Expected: production build succeeds; only the existing large-chunk warning may remain.

- [ ] **Step 6: Commit**

```bash
git add src/stores/trip.js src/stores/trip.test.js src/views/PlannerView.vue
git commit -m "feat(planner): load authoritative 318 from zero"
```

---

### Task 6: Recalculate all routes and expose a release gate

**Files:**
- Modify: `src/views/PlannerView.vue`
- Modify: `src/stores/trip.js`
- Modify: `src/stores/trip.test.js`

- [ ] **Step 1: Write failing result-state tests**

Test these exact states:

```js
expect(routeRunState(allSuccess)).toMatchObject({ state: 'success', done: 45, failed: 0 })
expect(routeRunState(oneFailure)).toMatchObject({ state: 'partial', failed: 1 })
expect(routeRunState(allFailed)).toMatchObject({ state: 'failed', done: 0 })
```

- [ ] **Step 2: Verify RED**

Run: `npm.cmd test -- --run src/stores/trip.test.js`  
Expected: FAIL because route run status is not stored.

- [ ] **Step 3: Calculate segment-by-segment without discarding successful days**

Keep the current sequential AMap calculation but record total segments, completed segments, failed segment names and `validateCalculatedRoutes` output. A failed segment must not be replaced with a straight line. Existing successful segments remain visible; the whole plan stays blocked for content generation until errors are zero.

- [ ] **Step 4: Show non-misleading completion states**

The planner displays:

- `✓ 已完成 45/45 路段` only when every segment exists and route validation has no errors;
- `◐ 已完成 x/45 · 失败 y` in amber for partial results;
- `✕ 路线计算失败` in red when no segment succeeds;
- a list such as `Day 3 尼玛贡神山观景台 → 卡子拉山：地点终点偏移`.

- [ ] **Step 5: Run focused and full verification**

Run: `npm.cmd test -- --run src/stores/trip.test.js src/utils/routeQuality.test.js`  
Expected: all tests PASS.

Run: `npm.cmd test`  
Expected: zero failures.

Run: `npm.cmd run build`  
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/views/PlannerView.vue src/stores/trip.js src/stores/trip.test.js
git commit -m "feat(route): gate generation on verified roads"
```

---

### Task 7: Version migration, audit and browser handoff

**Files:**
- Modify: `src/data/preset318.js`
- Modify: `src/data/preset318.test.js`
- Modify: `src/utils/fixed318Migration.js`
- Modify: `src/utils/fixed318Migration.test.js`
- Modify: `docs/reference/fixed318-place-audit.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write the failing migration test**

Create a plan from route version `2026-07-31` containing old narration, images and choreography. After migration, existing places keep those user artifacts, new authority nodes are inserted without generated artifacts, and all affected day routes are cleared.

- [ ] **Step 2: Verify RED**

Run: `npm.cmd test -- --run src/utils/fixed318Migration.test.js`  
Expected: FAIL because the authority version and node sequence changed.

- [ ] **Step 3: Freeze browser-approved places into the default preset**

Only after the browser search has produced one unambiguous candidate for each unresolved point and the user has inspected both markers, manually copy the approved WGS-84 coordinate and complete `source` evidence into `src/data/preset318.js`. Update the exact nine-day identity sequence in `src/data/preset318.test.js` to 46 unique main places. Never freeze an automatically selected ambiguous candidate.

- [ ] **Step 4: Update the fixed route version and migration**

Set `FIXED_318_ROUTE_DATA_VERSION` from the authority version. Preserve existing artifacts by `placeId`; insert missing main nodes from the new canonical plan; set every changed day `segments = null`. Never migrate optional branches into `waypoints`.

- [ ] **Step 5: Record actual evidence after browser calculation**

In `fixed318-place-audit.md`, add the selected AMap POI name, GCJ-02 and normalized WGS-84 coordinates for the two new points, checked date, every day’s newly calculated distance/time, and all warnings reviewed by the user.

- [ ] **Step 6: Final verification**

Run: `npm.cmd test`  
Expected: all tests PASS.

Run: `npm.cmd run build`  
Expected: build succeeds with no new errors.

Run: `git diff --check`  
Expected: no whitespace errors.

- [ ] **Step 7: Commit**

```bash
git add src/data/preset318.js src/data/preset318.test.js src/utils/fixed318Migration.js src/utils/fixed318Migration.test.js docs/reference/fixed318-place-audit.md CHANGELOG.md
git commit -m "docs(route): record authoritative 318 refresh"
```

## Browser acceptance checkpoint

Run from the isolated worktree and perform only the route stage:

1. Click `加载权威 318 底稿（从零生成）`;
2. confirm 46 unique main places and nine days;
3. if AMap returns multiple candidates for 营官寨 or 尼玛贡神山, stop and choose on the map rather than guessing;
4. click `计算全部真实驾车路线`;
5. inspect all nine days and every marker, especially 营官寨、尼玛贡神山、姊妹湖、东达山、索松村 and 巴松措;
6. confirm the status is green only after every segment is complete;
7. do not run narration, image, speech or animation jobs until this checkpoint is approved.

After route approval, create the second plan for authority-aware narration and fact verification. Only after narration approval create the third plan for image search, speech synthesis and chapter animation regeneration.
