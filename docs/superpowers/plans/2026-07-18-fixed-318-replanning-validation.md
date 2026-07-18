# Fixed 318 Replanning and Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed 318 preset with the approved nine-day route and prevent duplicate places, duplicate narration, and zero-distance flight scenes at both validation and playback boundaries.

**Architecture:** Keep the existing `days[].waypoints[]` and player contracts, add compatible place metadata, and introduce pure place-identity and plan-validation modules. Validate data before release, filter route-only nodes in generation jobs, and retain a defensive deduplication layer in `collectNarratedStops` so malformed imported plans cannot crash the camera timeline.

**Tech Stack:** Vue 3, Pinia, Vitest 4, MapLibre timeline utilities, existing AMap search/GCJ-02→WGS-84 conversion, JavaScript ES modules.

---

## File map

**Create**

- `docs/reference/fixed318-place-audit.md` — human-readable coordinate/source audit for every fixed route point.
- `src/utils/placeIdentity.js` — normalized place names, coordinate validity, distance, and same-place decisions.
- `src/utils/placeIdentity.test.js` — public behavior tests for place identity.
- `src/utils/planValidation.js` — pure plan validator returning structured issues.
- `src/utils/planValidation.test.js` — validation rule tests.
- `src/data/preset318.test.js` — fixed-route structure and release-gate tests.

**Modify**

- `src/data/preset318.js` — approved nine-day route and compatible place metadata.
- `src/data/preset318Narration.js` — narration for approved showcase stops only.
- `src/stores/trip.js` — normalize and persist `placeId`, `narrate`, `roles`, `routeType`, `source`, `overnightPlaceId`, and `alternatives`.
- `src/stores/trip.test.js` — metadata round-trip and route-only narration tests.
- `src/stores/studio.js` — exclude `narrate:false` route points from AI narration, image, TTS, and choreography jobs.
- `src/stores/studio.test.js` — generation-job eligibility tests.
- `src/utils/flightStops.js` — adjacent-place deduplication and route path compaction.
- `src/utils/flightStops.test.js` — cross-day duplicate and same-name-far-away regression tests.
- `CHANGELOG.md` — note fixed 318 route normalization and validation gate.

Do not modify MapLibre camera behavior, flight timing, image search, choreography vocabulary, or the PDF reference file in this plan.

---

### Task 1: Audit fixed-route places with the existing location tool

**Files:**
- Create: `docs/reference/fixed318-place-audit.md`
- Reference: `docs/318川藏线路书.pdf`
- Reference: `src/composables/useAmap.js`
- Reference: `src/utils/coords.js`

- [ ] **Step 1: Create the audit table with every approved main-route point**

Use this exact column contract:

```markdown
# 固定 318 地点核验表

| Day | placeId | 名称 | 角色 | 主讲 | lng (WGS-84) | lat (WGS-84) | 海拔 | 路书页 | 地点检索结果 | 地图抽查 |
|---:|---|---|---|:---:|---:|---:|---:|---:|---|:---:|
```

Enter these day sequences, preserving the exact `placeId` across day boundaries:

```text
D1 chengdu, yaan, tianquan-service, erlangshan-tunnel, luding, kangding
D2 kangding, zheduo-pass, xinduqiao, yajiang
D3 yajiang, tianlu-18-bends, jianziwan-pass, kazila-pass, litang, maoya-grassland, sister-lakes, batang
D4 batang, jinsha-river-bridge, zongbala-pass, mangkang, lawu-pass, rumei, jueba-pass, dongda-pass, zuogong
D5 zuogong, bangda, yela-pass, nujiang-72, nujiang-bridge, basu
D6 basu, anjiula-pass, ranwu-lake, midui-glacier, bomi
D7 bomi, guxiang-lake, tongmai, lulang, segrila-pass, suosong
D8 suosong, nyingchi, basongtso, gongbo-gyamda
D9 gongbo-gyamda, mila-pass, mozhugongka, lhasa
```

Expected: 52 route occurrences with cross-day identities reused; no generated coordinate values.

- [ ] **Step 2: Resolve missing/changed places through the current AMap UI path**

For each place, search the exact Chinese name plus county/prefecture disambiguation. Copy the WGS-84 result after the existing coordinate conversion layer, not the raw GCJ-02 response. Retain current preset coordinates only when the displayed POI and route location match.

Mandatory manual checks:

```text
天路十八弯：must be west of 雅江 and before 剪子弯山
毛垭大草原：must be west of 理塘 on the 巴塘 direction
宗巴拉山：must be between 金沙江大桥 and 芒康
米堆冰川：must be the 波密县 glacier access point, not another similarly named glacier
索松村：must be inside the 雅鲁藏布大峡谷 route area
巴松措：must be the 工布江达县 lake access point
墨竹工卡：must be east of 拉萨 on the G318 corridor
```

Expected: every row has finite `lng/lat`, a selected search result, and “通过” in the map-check column.

- [ ] **Step 3: Verify route order in the planner without saving it as product data**

Build each day temporarily in the existing planner and calculate driving paths. Confirm no day doubles back unexpectedly except the intentional 索松村 branch, and record any required route-point adjustment in the audit table.

Expected: all nine days calculate a route; no route segment starts and ends at the same physical place.

- [ ] **Step 4: Commit the audit artifact**

```bash
git add docs/reference/fixed318-place-audit.md
git commit -m "docs(route): 核验固定318地点坐标与顺序"
```

---

### Task 2: Add a single place-identity module

**Files:**
- Create: `src/utils/placeIdentity.js`
- Create: `src/utils/placeIdentity.test.js`
- Reference: `src/utils/geo.js`

- [ ] **Step 1: Write the failing public-interface tests**

```js
import { describe, expect, it } from 'vitest'
import { isValidPlaceCoordinate, normalizePlaceName, samePlace } from './placeIdentity'

describe('placeIdentity', () => {
  it('规范化名称只消除格式差异，不把不同景点强行合并', () => {
    expect(normalizePlaceName(' 怒江 72 拐 ')).toBe('怒江72拐')
    expect(normalizePlaceName('鲁朗林海')).not.toBe(normalizePlaceName('鲁朗'))
  })

  it('优先用 placeId 判断同一地点', () => {
    expect(samePlace(
      { placeId: 'litang', name: '理塘县', lng: 100.27, lat: 29.997 },
      { placeId: 'litang', name: '理塘', lng: 100.271, lat: 29.998 },
    )).toBe(true)
  })

  it('旧数据在名称相同且一公里内时视为同一地点，同名远点不合并', () => {
    expect(samePlace(
      { name: '理塘', lng: 100.27, lat: 29.997 },
      { name: ' 理塘 ', lng: 100.2702, lat: 29.9972 },
    )).toBe(true)
    expect(samePlace(
      { name: '幸福村', lng: 100, lat: 30 },
      { name: '幸福村', lng: 101, lat: 31 },
    )).toBe(false)
  })

  it('不同 placeId 但坐标几乎重合时仍视为同一物理地点', () => {
    expect(samePlace(
      { placeId: 'old-id', name: '旧名称', lng: 91.14, lat: 29.65 },
      { placeId: 'new-id', name: '新名称', lng: 91.1401, lat: 29.6501 },
    )).toBe(true)
  })

  it('校验经纬度范围', () => {
    expect(isValidPlaceCoordinate({ lng: 91.14, lat: 29.65 })).toBe(true)
    expect(isValidPlaceCoordinate({ lng: 181, lat: 29.65 })).toBe(false)
    expect(isValidPlaceCoordinate({ lng: 91.14, lat: Number.NaN })).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -- --run src/utils/placeIdentity.test.js
```

Expected: FAIL because `./placeIdentity` does not exist.

- [ ] **Step 3: Implement the minimal identity module**

```js
import { haversine } from './geo'

export function normalizePlaceName(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s·•・,，。.!！?？()（）【】\[\]_-]+/g, '')
}

export function isValidPlaceCoordinate(place) {
  return (
    Number.isFinite(place?.lng) &&
    Number.isFinite(place?.lat) &&
    place.lng >= -180 &&
    place.lng <= 180 &&
    place.lat >= -90 &&
    place.lat <= 90
  )
}

export function placeDistance(a, b) {
  if (!isValidPlaceCoordinate(a) || !isValidPlaceCoordinate(b)) return Number.POSITIVE_INFINITY
  return haversine([a.lng, a.lat], [b.lng, b.lat])
}

export function samePlace(a, b, { sameNameMeters = 1000, sameCoordinateMeters = 50 } = {}) {
  if (!a || !b) return false
  if (a.placeId && b.placeId && a.placeId === b.placeId) return true
  const distance = placeDistance(a, b)
  const sameName = normalizePlaceName(a.name) && normalizePlaceName(a.name) === normalizePlaceName(b.name)
  return (sameName && distance <= sameNameMeters) || distance <= sameCoordinateMeters
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npm test -- --run src/utils/placeIdentity.test.js src/utils/geo.test.js
```

Expected: both test files pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/placeIdentity.js src/utils/placeIdentity.test.js
git commit -m "feat(route): 增加统一地点身份判断"
```

---

### Task 3: Build the pure plan validator

**Files:**
- Create: `src/utils/planValidation.js`
- Create: `src/utils/planValidation.test.js`
- Use: `src/utils/placeIdentity.js`

- [ ] **Step 1: Write the first failing test for valid cross-day continuity**

```js
import { describe, expect, it } from 'vitest'
import { validatePlan } from './planValidation'

const wp = (placeId, name, lng, lat, extra = {}) => ({
  placeId, name, lng, lat, narrate: true, roles: ['stop'], routeType: 'main', ...extra,
})

function validPlan() {
  const a = wp('a', 'A', 100, 30)
  const b = wp('b', 'B', 101, 30, { roles: ['stop', 'overnight'] })
  const bStart = wp('b', 'B', 101, 30, { narrate: false, roles: ['origin'] })
  const c = wp('c', 'C', 102, 30, { roles: ['stop', 'overnight'] })
  return {
    days: [
      { dayNumber: 1, overnight: 'B', overnightPlaceId: 'b', waypoints: [a, b] },
      { dayNumber: 2, overnight: 'C', overnightPlaceId: 'c', waypoints: [bStart, c] },
    ],
  }
}

describe('validatePlan', () => {
  it('接受共享 placeId 且第二天不重复讲解的连续路线', () => {
    expect(validatePlan(validPlan())).toEqual([])
  })
})
```

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- --run src/utils/planValidation.test.js
```

Expected: FAIL because `validatePlan` is missing.

- [ ] **Step 3: Implement issue shape, day numbering, coordinates, empty-day, continuity, and overnight checks**

```js
import { isValidPlaceCoordinate, normalizePlaceName, samePlace } from './placeIdentity'

const issue = (code, severity, dayNumber, waypointIndex, message) => ({
  code, severity, dayNumber, waypointIndex, message,
})

export function validatePlan(plan) {
  const issues = []
  const days = Array.isArray(plan?.days) ? plan.days : []

  days.forEach((day, dayIndex) => {
    const expectedDay = dayIndex + 1
    if (day.dayNumber !== expectedDay) {
      issues.push(issue('DUPLICATE_DAY_NUMBER', 'error', day.dayNumber, -1, `第 ${expectedDay} 天编号不连续`))
    }
    const waypoints = Array.isArray(day.waypoints) ? day.waypoints : []
    if (waypoints.length < 2) {
      issues.push(issue('EMPTY_DAY', 'error', day.dayNumber, -1, '每天至少需要起点和终点'))
    }
    waypoints.forEach((point, index) => {
      if (!isValidPlaceCoordinate(point)) {
        issues.push(issue('INVALID_COORDINATE', 'error', day.dayNumber, index, `${point?.name || '未命名地点'}坐标非法`))
      }
      if (point.routeType === 'optional') {
        issues.push(issue('OPTIONAL_IN_MAIN_ROUTE', 'error', day.dayNumber, index, `${point.name} 是可选支线，不应进入主路线`))
      }
    })
    const end = waypoints.at(-1)
    const overnightMatches = day.overnightPlaceId
      ? end?.placeId === day.overnightPlaceId
      : normalizePlaceName(end?.name) === normalizePlaceName(day.overnight)
    if (end && !overnightMatches) {
      issues.push(issue('OVERNIGHT_MISMATCH', 'error', day.dayNumber, waypoints.length - 1, '住宿地与当天终点不一致'))
    }
  })

  for (let i = 0; i < days.length - 1; i++) {
    const end = days[i].waypoints?.at(-1)
    const start = days[i + 1].waypoints?.[0]
    if (end && start && !samePlace(end, start)) {
      issues.push(issue('DAY_BOUNDARY_MISMATCH', 'error', days[i + 1].dayNumber, 0, '当天起点未接续上一天终点'))
    }
  }

  return issues
}
```

- [ ] **Step 4: Run and verify the first test passes**

```bash
npm test -- --run src/utils/planValidation.test.js
```

Expected: PASS.

- [ ] **Step 5: Add failing tests for duplicates and zero-distance legs**

Append inside `describe`:

```js
it('报告错误天数、空日、非法坐标和住宿不匹配', () => {
  const plan = validPlan()
  plan.days[0].dayNumber = 2
  plan.days[0].waypoints[0].lng = 181
  plan.days[0].overnightPlaceId = 'wrong-overnight'
  plan.days[1].waypoints = [plan.days[1].waypoints[0]]
  const codes = validatePlan(plan).map((x) => x.code)
  expect(codes).toContain('DUPLICATE_DAY_NUMBER')
  expect(codes).toContain('INVALID_COORDINATE')
  expect(codes).toContain('OVERNIGHT_MISMATCH')
  expect(codes).toContain('EMPTY_DAY')
})
it('报告同日重复地点、重复讲解和零距离路段', () => {
  const plan = validPlan()
  plan.days[0].waypoints[0].narration = '首次介绍'
  plan.days[0].waypoints.splice(1, 0, {
    ...plan.days[0].waypoints[0],
    narration: '重复介绍',
  })
  const codes = validatePlan(plan).map((x) => x.code)
  expect(codes).toContain('DUPLICATE_PLACE')
  expect(codes).toContain('DUPLICATE_NARRATION')
  expect(codes).toContain('ZERO_DISTANCE_LEG')
})

it('报告可选支线误入主线和跨日断裂', () => {
  const plan = validPlan()
  plan.days[0].waypoints[1].routeType = 'optional'
  plan.days[1].waypoints[0] = wp('x', 'X', 110, 40, { narrate: false })
  const codes = validatePlan(plan).map((x) => x.code)
  expect(codes).toContain('OPTIONAL_IN_MAIN_ROUTE')
  expect(codes).toContain('DAY_BOUNDARY_MISMATCH')
})
```

- [ ] **Step 6: Run and verify RED for the new codes**

```bash
npm test -- --run src/utils/planValidation.test.js
```

Expected: FAIL because duplicate and zero-distance rules are not implemented.

- [ ] **Step 7: Add duplicate and zero-distance scanning before `return issues`**

```js
for (const day of days) {
  const points = day.waypoints || []
  for (let i = 0; i < points.length; i++) {
    for (let j = 0; j < i; j++) {
      if (samePlace(points[j], points[i])) {
        issues.push(issue('DUPLICATE_PLACE', 'error', day.dayNumber, i, `${points[i].name} 在同一天重复出现`))
        break
      }
    }
    if (i > 0 && samePlace(points[i - 1], points[i])) {
      issues.push(issue('ZERO_DISTANCE_LEG', 'error', day.dayNumber, i, `${points[i].name} 形成零距离路段`))
    }
  }
}

const narrated = days.flatMap((day) =>
  (day.waypoints || [])
    .map((point, waypointIndex) => ({ point, dayNumber: day.dayNumber, waypointIndex }))
    .filter(({ point }) => point.narrate !== false && Boolean(point.narration)),
)
for (let i = 1; i < narrated.length; i++) {
  if (samePlace(narrated[i - 1].point, narrated[i].point)) {
    const cur = narrated[i]
    issues.push(issue('DUPLICATE_NARRATION', 'error', cur.dayNumber, cur.waypointIndex, `${cur.point.name} 被连续讲解两次`))
  }
}
```

- [ ] **Step 8: Run validator and identity tests**

```bash
npm test -- --run src/utils/planValidation.test.js src/utils/placeIdentity.test.js
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/utils/planValidation.js src/utils/planValidation.test.js
git commit -m "feat(route): 增加结构化规划校验器"
```

---

### Task 4: Persist metadata and keep route-only nodes out of generation jobs

**Files:**
- Modify: `src/stores/trip.js`
- Modify: `src/stores/trip.test.js`
- Modify: `src/stores/studio.js`
- Modify: `src/stores/studio.test.js`

- [ ] **Step 1: Add a failing trip normalization/round-trip test**

Append to `src/stores/trip.test.js`:

```js
it('归一化并持久化地点身份、角色和住宿地点身份', () => {
  const t = useTripStore()
  t.replacePlan({
    days: [{
      overnight: 'B',
      overnightPlaceId: 'b',
      alternatives: [{ placeId: 'side', name: '支线' }],
      waypoints: [
        { placeId: 'a', name: 'A', lng: 100, lat: 30, narrate: false, roles: ['origin'], routeType: 'main', source: { page: 1 } },
        { placeId: 'b', name: 'B', lng: 101, lat: 30, roles: ['stop', 'overnight'] },
      ],
    }],
  })
  const restored = JSON.parse(t.exportJson())
  expect(restored.days[0]).toMatchObject({ overnightPlaceId: 'b' })
  expect(restored.days[0].alternatives).toEqual([{ placeId: 'side', name: '支线' }])
  expect(restored.days[0].waypoints[0]).toMatchObject({
    placeId: 'a', narrate: false, roles: ['origin'], routeType: 'main', source: { page: 1 },
  })
})
```

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- --run src/stores/trip.test.js
```

Expected: FAIL because day metadata is not normalized/preserved with defaults.

- [ ] **Step 3: Extract waypoint normalization and extend day normalization**

Replace the inline waypoint mapper with:

```js
function normalizeWaypoint(w) {
  return {
    ...w,
    placeId: w.placeId ?? '',
    narration: w.narration ?? '',
    prevNarration: w.prevNarration ?? '',
    narrate: w.narrate ?? true,
    roles: Array.isArray(w.roles) ? [...w.roles] : ['route'],
    routeType: w.routeType ?? 'main',
    source: w.source ?? null,
    address: w.address ?? '',
    note: w.note ?? '',
    images: Array.isArray(w.images) ? w.images : [],
    choreography: w.choreography ?? null,
  }
}

function normalizeDay(day, i) {
  return {
    dayNumber: i + 1,
    overnight: day.overnight ?? '',
    overnightPlaceId: day.overnightPlaceId ?? '',
    alternatives: Array.isArray(day.alternatives) ? structuredClone(day.alternatives) : [],
    waypoints: (day.waypoints ?? []).map(normalizeWaypoint),
    segments: day.segments ?? null,
  }
}
```

- [ ] **Step 4: Run trip tests and verify GREEN**

```bash
npm test -- --run src/stores/trip.test.js
```

Expected: all trip tests pass.

- [ ] **Step 5: Add failing tests that route-only nodes are skipped**

In `src/stores/trip.test.js` add:

```js
it('loadPresetNarration 不给 narrate=false 的跨日起点填旁白', () => {
  const t = useTripStore()
  t.loadPreset318()
  t.loadPresetNarration()
  const day2Start = t.plan.days[1].waypoints[0]
  expect(day2Start.narrate).toBe(false)
  expect(day2Start.narration).toBe('')
})
```

Append this exact integration test to `src/stores/studio.test.js`:

```js
it('narrate=false 的路线点不进入旁白、配图、TTS 或动效任务', async () => {
  const trip = useTripStore()
  trip.replacePlan({
    days: [{
      overnight: '讲解点',
      waypoints: [
        { name: '路线点', lng: 100, lat: 30, narrate: false },
        { name: '讲解点', lng: 101, lat: 30, narrate: true },
      ],
    }],
  })
  const studio = useStudioStore()

  await studio.runAiDraftAll('sk')
  expect(studio.aiJob.total).toBe(1)
  expect(trip.plan.days[0].waypoints[0].narration).toBe('')
  expect(trip.plan.days[0].waypoints[1].narration).toBe('稿:讲解点')

  await studio.runImageAutoFillAll('sk')
  expect(studio.imageJob.total).toBe(1)
  expect(trip.plan.days[0].waypoints[0].images).toEqual([])
  expect(trip.plan.days[0].waypoints[1].images).toHaveLength(1)

  await studio.runSynthAll()
  expect(studio.synthJob.total).toBe(1)

  await studio.runChoreographyAll('sk')
  expect(studio.choreoJob.total).toBe(1)
})
```

- [ ] **Step 6: Run focused store tests and verify RED**

```bash
npm test -- --run src/stores/trip.test.js src/stores/studio.test.js
```

Expected: FAIL because current generators consider every waypoint.

- [ ] **Step 7: Apply one shared eligibility predicate in the studio store**

Add near `stripSsml`:

```js
function isContentNode(node) {
  return node?.narrate !== false && node?.routeType !== 'optional'
}
```

Apply `if (!isContentNode(w)) return` at the beginning of each waypoint callback in `nodesForAi`, `nodesNeedingImages`, and `nodesForChoreography`. Apply the same filter in `narratedNodes`. In `loadPresetNarration`, change the assignment condition to:

```js
if (wp.narrate !== false && wp.routeType !== 'optional' && text) wp.narration = text
```

- [ ] **Step 8: Run store tests and full suite**

```bash
npm test -- --run src/stores/trip.test.js src/stores/studio.test.js
npm test
```

Expected: focused tests and full suite pass.

- [ ] **Step 9: Commit**

```bash
git add src/stores/trip.js src/stores/trip.test.js src/stores/studio.js src/stores/studio.test.js
git commit -m "feat(route): 持久化地点角色并过滤路线节点"
```

---

### Task 5: Make narrated-stop collection duplicate-safe

**Files:**
- Modify: `src/utils/flightStops.js`
- Modify: `src/utils/flightStops.test.js`
- Use: `src/utils/placeIdentity.js`

- [ ] **Step 1: Write the failing cross-day duplicate regression test**

Append:

```js
it('跨日相同地点即使误带两份旁白也只讲一次，并保留后续路线', () => {
  const plan = {
    days: [
      {
        dayNumber: 1,
        segments: null,
        waypoints: [
          { placeId: 'a', name: 'A', lng: 100, lat: 30, narration: 'A' },
          { placeId: 'litang', name: '理塘', lng: 100.27, lat: 29.997, narration: '理塘一' },
        ],
      },
      {
        dayNumber: 2,
        segments: null,
        waypoints: [
          { placeId: 'litang', name: '理塘县', lng: 100.27, lat: 29.997, narration: '理塘二' },
          { placeId: 'batang', name: '巴塘', lng: 99.108, lat: 30.004, narration: '巴塘' },
        ],
      },
    ],
  }
  const stops = collectNarratedStops(plan)
  expect(stops.map((x) => x.node.placeId)).toEqual(['a', 'litang', 'batang'])
  expect(stops[2].routeToHere[0]).toEqual([100.27, 29.997])
  expect(stops[2].routeToHere.at(-1)).toEqual([99.108, 30.004])
  expect(stops[2].routeToHere).toHaveLength(2)
})
```

- [ ] **Step 2: Add the same-name-far-away guard test**

```js
it('同名但相距很远且无共同 placeId 的地点不会误合并', () => {
  const plan = {
    days: [{
      dayNumber: 1,
      segments: null,
      waypoints: [
        { name: '幸福村', lng: 100, lat: 30, narration: '甲' },
        { name: '幸福村', lng: 102, lat: 32, narration: '乙' },
      ],
    }],
  }
  expect(collectNarratedStops(plan)).toHaveLength(2)
})
```

- [ ] **Step 3: Run and verify RED**

```bash
npm test -- --run src/utils/flightStops.test.js
```

Expected: first new test returns duplicate `litang`.

- [ ] **Step 4: Implement adjacent dedup and path compaction**

Import `samePlace` and add:

```js
function sameCoordinate(a, b) {
  return a && b && Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9
}

function appendPath(target, path) {
  for (const coordinate of path || []) {
    if (!sameCoordinate(target.at(-1), coordinate)) target.push(coordinate)
  }
  return target
}
```

In the flattened loop:

```js
if (!entry.wp.narration || entry.wp.narrate === false || entry.wp.routeType === 'optional') return
if (stops.length && samePlace(stops.at(-1).node, entry.wp)) return
```

Replace route concatenation with:

```js
for (let j = prevFlat; j < k; j++) appendPath(routeToHere, legPath(j))
if (routeToHere.length < 2) routeToHere = []
```

Pass through `placeId`, `roles`, and `source` in `node`.

- [ ] **Step 5: Run flight-stop and timeline tests**

```bash
npm test -- --run src/utils/flightStops.test.js src/utils/flightTimeline.test.js
```

Expected: all tests pass; no flight-timeline contract changes.

- [ ] **Step 6: Commit**

```bash
git add src/utils/flightStops.js src/utils/flightStops.test.js
git commit -m "fix(flight): 合并跨日重复讲解与零距离路径"
```

---

### Task 6: Replace the fixed preset and make validation a release gate

**Files:**
- Modify: `src/data/preset318.js`
- Modify: `src/data/preset318Narration.js`
- Create: `src/data/preset318.test.js`
- Use: `docs/reference/fixed318-place-audit.md`
- Use: `src/utils/planValidation.js`
- Use: `src/utils/flightStops.js`

- [ ] **Step 1: Write the failing preset structure test**

```js
import { describe, expect, it } from 'vitest'
import { preset318 } from './preset318'
import { preset318Narration } from './preset318Narration'
import { collectNarratedStops } from '../utils/flightStops'
import { validatePlan } from '../utils/planValidation'

const EXPECTED = [
  ['成都', '雅安', '天全服务区', '二郎山隧道', '泸定', '康定'],
  ['康定', '折多山垭口', '新都桥', '雅江'],
  ['雅江', '天路十八弯', '剪子湾山', '卡子拉山', '理塘', '毛垭大草原', '姊妹湖', '巴塘'],
  ['巴塘', '金沙江大桥', '宗巴拉山', '芒康', '拉乌山', '如美', '觉巴山', '东达山', '左贡'],
  ['左贡', '邦达草原', '业拉山', '怒江72拐', '怒江大桥', '八宿'],
  ['八宿', '安久拉山', '然乌湖', '米堆冰川', '波密'],
  ['波密', '古乡湖', '通麦', '鲁朗林海', '色季拉山', '索松村'],
  ['索松村', '林芝', '巴松措', '工布江达'],
  ['工布江达', '米拉山', '墨竹工卡', '拉萨'],
]

describe('preset318 固定旗舰路线', () => {
  it('严格采用确认的九天主线与住宿顺序', () => {
    expect(preset318.days.map((d) => d.waypoints.map((w) => w.name))).toEqual(EXPECTED)
    expect(preset318.days.map((d) => d.overnight)).toEqual([
      '康定', '雅江', '巴塘', '左贡', '八宿', '波密', '索松村', '工布江达', '拉萨',
    ])
  })

  it('跨日边界复用 placeId，第二天起点不重复讲解', () => {
    for (let i = 1; i < preset318.days.length; i++) {
      const previousEnd = preset318.days[i - 1].waypoints.at(-1)
      const currentStart = preset318.days[i].waypoints[0]
      expect(currentStart.placeId).toBe(previousEnd.placeId)
      expect(currentStart.narrate).toBe(false)
    }
  })

  it('固定预设无规划错误，理塘与米堆冰川各讲一次', () => {
    expect(validatePlan(preset318).filter((x) => x.severity === 'error')).toEqual([])
    const plan = structuredClone(preset318)
    for (const day of plan.days) {
      for (const point of day.waypoints) {
        if (point.narrate !== false && preset318Narration[point.name]) point.narration = preset318Narration[point.name]
      }
    }
    const names = collectNarratedStops(plan).map((x) => x.node.name)
    expect(names.filter((x) => x === '理塘')).toHaveLength(1)
    expect(names.filter((x) => x === '米堆冰川')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- --run src/data/preset318.test.js
```

Expected: route and validation assertions fail against the old preset.

- [ ] **Step 3: Add small data factories and replace the preset from the audited table**

Use these factories at the top of `preset318.js`:

```js
const SOURCE_FILE = '318川藏线路书.pdf'

function point(placeId, name, lng, lat, altitude, { narrate = true, roles = ['route', 'stop'], page } = {}) {
  return {
    placeId,
    name,
    lng,
    lat,
    altitude,
    narrate,
    roles,
    routeType: 'main',
    source: { type: 'user-roadbook', file: SOURCE_FILE, page, coordinateVerified: true },
  }
}

function continuation(value) {
  return { ...value, narrate: false, roles: ['origin', 'route'] }
}
```

Create one canonical point object per `placeId` using only the values marked “通过” in `fixed318-place-audit.md`. Build each day from those objects, use `continuation(previousEnd)` for day 2–9 starts, and set:

```js
{
  dayNumber,
  overnight,
  overnightPlaceId,
  alternatives: [{ placeId, name, reason, sourcePage }],
  waypoints,
}
```

Required alternatives:

```text
D2: 雅哈垭口/冷嘎措；塔公草原/墨石公园/雅拉雪山
D3: 稻城亚丁；色达
D6: 来古冰川
D9: 思金拉措；直贡梯寺
```

Do not place alternatives in `waypoints`.

- [ ] **Step 4: Update narration keys from the roadbook facts**

Ensure every `narrate:true` waypoint has one narration entry and every narration entry satisfies:

```text
1–3 sentences; describes why this point matters in the current route;
uses only stable facts from the cited PDF page;
does not include hotel/restaurant ratings, current prices, opening status, or unverified arrival time;
does not repeat the previous or next point's introduction;
combines 天路十八弯 into its own point and keeps 理塘 narration singular;
mentions 米堆冰川 once and keeps 来古冰川 optional.
```

- [ ] **Step 5: Run preset, store, and flight tests**

```bash
npm test -- --run src/data/preset318.test.js src/stores/trip.test.js src/utils/flightStops.test.js src/utils/flightTimeline.test.js
```

Expected: all focused tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/data/preset318.js src/data/preset318Narration.js src/data/preset318.test.js
git commit -m "feat(route): 重建九天固定318旗舰路线"
```

---

### Task 7: Final integration, documentation, and browser verification

**Files:**
- Modify: `CHANGELOG.md`
- Verify: all files from Tasks 1–6

- [ ] **Step 1: Add the release note**

Under Unreleased/current development:

```markdown
- 重建固定 318 九天主路线，区分讲解点、路线点、住宿点与可选支线。
- 新增地点身份与规划校验器，阻止重复讲解、零距离路段和跨日断裂进入作品。
- 飞行预览增加跨日重复节点兜底，理塘与米堆冰川只展示一次。
```

- [ ] **Step 2: Run all automated verification**

```bash
npm test
npm run build
git diff --check
```

Expected: all tests pass, Vite build exits 0, and diff check reports no unintended whitespace errors.

- [ ] **Step 3: Verify the fixed preset through the browser**

Run:

```bash
npm run dev
```

Manual checklist:

```text
[ ] Nine days appear with approved overnight places.
[ ] Each day calculates a driving route.
[ ] Day 3 shows 理塘 once.
[ ] Day 6 shows 米堆冰川 once.
[ ] Cross-day starts do not get generated narration, images, TTS, or choreography.
[ ] No stationary car segment appears at a day boundary.
[ ] No invalid camera bounds or terrain penetration occurs at former duplicate boundaries.
[ ] Optional branches do not appear in the main flight preview.
[ ] Day 9 ends in 拉萨.
```

- [ ] **Step 4: Inspect the final diff for scope**

```bash
git status --short
git diff --stat 981c534..HEAD
git diff 981c534..HEAD -- src/data src/utils src/stores CHANGELOG.md docs/reference/fixed318-place-audit.md
```

Expected: no MapLibre, choreography rendering, image provider, API-key, PDF, or unrelated user-file changes.

- [ ] **Step 5: Commit documentation**

```bash
git add CHANGELOG.md
git commit -m "docs: 记录固定318路线校验改造"
```

- [ ] **Step 6: Keep manual verification evidence**

Record the tested date, browser, route-calculation outcome, and any accepted warnings in the implementation report. Do not merge or push until the user confirms the new fixed route preview.