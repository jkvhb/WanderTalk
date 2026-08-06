# General Exact Image Search Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一套不绑定 318 的跨路线精准搜图基准工具，用 20 个节点比较多种图片来源，并保证“同类但不同地点”的图片绝不自动通过。

**Architecture:** 新增一个与正式配图隔离的 `server/imageSearch/` 试验模块。地点档案先驱动查询生成，各图片来源转换为统一候选格式，确定性的地点身份门槛先给出 `exact / needs_review / rejected`，只有 `exact` 才进入内容、许可和性能报告。通俗说：先确认“这是哪儿”，再评价“拍得好不好”，试验不会写入用户现有图片库。

**Tech Stack:** Node.js ES modules、Vitest、原生 `fetch`、现有 Pixabay/Commons 模块、Openverse API；Brave/Mapillary 仅在提供凭据时执行。

---

## 名词通俗说明

- **适配器（adapter）**：把不同网站返回的不同格式，整理成项目统一认识的候选图片资料卡。
- **硬门槛（gate）**：必须满足的条件，不是总分高就能绕过。
- **负例（negative case）**：故意放入的错误图片，例如给金沙江大桥放一张伦敦塔桥，用来证明系统真的会拒绝。
- **并发（concurrency）**：同时处理少量节点，而不是一个节点完全结束后才开始下一个。
- **退避重试（backoff）**：网络临时繁忙时稍等后再试，而不是瞬间连续请求。
- **熔断（circuit breaker）**：某个来源连续故障时暂时停用，避免拖累整个任务。

## 文件边界

- Create: `server/imageSearch/benchmarkPlaces.js` — 20 个跨路线地点档案和档案校验。
- Create: `server/imageSearch/benchmarkPlaces.test.js` — 节点数量、类型、身份字段与负例约束。
- Create: `server/imageSearch/identityGate.js` — 查询生成和地点身份硬门槛。
- Create: `server/imageSearch/identityGate.test.js` — 精准命中、待确认、错图拒绝、道路坐标规则。
- Create: `server/imageSearch/providers.js` — Pixabay、Commons、Openverse、Brave、Mapillary 统一适配。
- Create: `server/imageSearch/providers.test.js` — 响应裁剪、许可信息、缺凭据跳过。
- Create: `server/imageSearch/benchmarkRunner.js` — 并发、缓存、重试、熔断、指标汇总。
- Create: `server/imageSearch/benchmarkRunner.test.js` — 性能控制和失败隔离。
- Create: `server/imageSearch/report.js` — 生成 Markdown/JSON 报告。
- Create: `server/imageSearch/report.test.js` — 报告完整性与错图警报。
- Create: `scripts/image-search-benchmark.js` — 一条命令执行真实对比。
- Modify: `package.json` — 增加 `benchmark:images` 命令。
- Create after live run: `docs/reports/2026-08-06-image-search-source-benchmark.md` — 人类可读结论。
- Create after live run: `docs/reports/2026-08-06-image-search-source-benchmark.json` — 可供程序复算的原始结果。

### Task 1: 建立跨路线地点身份档案

**Files:**
- Create: `server/imageSearch/benchmarkPlaces.js`
- Create: `server/imageSearch/benchmarkPlaces.test.js`

- [ ] **Step 1: Write the failing fixture-contract test**

```js
import { describe, expect, it } from 'vitest'
import { BENCHMARK_PLACES, validateBenchmarkPlaces } from './benchmarkPlaces.js'

describe('跨路线搜图基准地点', () => {
  it('固定覆盖四类路线、20 个不重复节点', () => {
    expect(BENCHMARK_PLACES).toHaveLength(20)
    expect(new Set(BENCHMARK_PLACES.map((p) => p.id)).size).toBe(20)
    expect(new Set(BENCHMARK_PLACES.map((p) => p.routeProfile))).toEqual(
      new Set(['g318', 'g317', 'genyen-south', 'chengdu-city']),
    )
    const counts = Object.fromEntries(['g318', 'g317', 'genyen-south', 'chengdu-city'].map((profile) => [profile, BENCHMARK_PLACES.filter((p) => p.routeProfile === profile).length]))
    expect(counts).toEqual({ g318: 5, g317: 5, 'genyen-south': 5, 'chengdu-city': 5 })
    expect(validateBenchmarkPlaces(BENCHMARK_PLACES)).toEqual([])
  })

  it('严格地点包含身份词和错误地点负例', () => {
    const bridge = BENCHMARK_PLACES.find((p) => p.id === 'g318-zhubalong-jinsha-bridge')
    expect(bridge.requiredTerms).toEqual(expect.arrayContaining(['金沙江大桥', '竹巴笼']))
    expect(bridge.negativeTerms).toEqual(expect.arrayContaining(['London', 'Tower Bridge', '伦敦']))
  })

  it('无名道路节点必须有坐标和道路编号', () => {
    const junction = BENCHMARK_PLACES.find((p) => p.id === 'g318-yingguan-junction')
    expect(junction.nodeType).toBe('road-node')
    expect(junction.coordinates).toEqual(expect.objectContaining({ lng: expect.any(Number), lat: expect.any(Number) }))
    expect(junction.roadRefs).toEqual(expect.arrayContaining(['G318', 'G248']))
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- server/imageSearch/benchmarkPlaces.test.js`  
Expected: FAIL because `benchmarkPlaces.js` does not exist.

- [ ] **Step 3: Implement the fixture and deterministic validation**

Create `BENCHMARK_PLACES` with the 20 names approved in the design. Use a factory so every record has the complete shape without repeating empty arrays:

```js
const definePlace = (input) => ({
  aliases: [], adminPath: [], coordinates: null, nearbyLandmarks: [], roadRefs: [],
  requiredTerms: [], negativeTerms: [], visualTraits: [], evidenceUrls: [], ...input,
})

export const BENCHMARK_PLACES = [
  definePlace({ id: 'g318-zhubalong-jinsha-bridge', routeProfile: 'g318', canonicalName: '金沙江大桥（竹巴笼）', aliases: ['竹巴笼金沙江大桥', '金沙江大桥'], adminPath: ['四川省', '甘孜藏族自治州', '巴塘县', '竹巴笼乡'], nearbyLandmarks: ['芒康县', '金沙江'], roadRefs: ['G318'], nodeType: 'named-landmark', requiredTerms: ['金沙江大桥', '竹巴笼'], negativeTerms: ['London', 'Tower Bridge', '伦敦', '伦敦塔桥'], visualTraits: ['跨越金沙江', '川藏公路桥梁'], evidenceUrls: ['docs/reference/318-authoritative-roadbook-v1.md'] }),
  definePlace({ id: 'g318-yingguan-junction', routeProfile: 'g318', canonicalName: 'G318/G248交叉口（营官村）', aliases: ['营官寨三岔路口', '营官村三岔路口'], adminPath: ['四川省', '甘孜藏族自治州', '康定市'], coordinates: { lng: 101.5466692, lat: 30.038074 }, nearbyLandmarks: ['营官村'], roadRefs: ['G318', 'G248'], nodeType: 'road-node', requiredTerms: ['G318', 'G248'], visualTraits: ['道路交叉口'], evidenceUrls: ['https://www.openstreetmap.org/node/634137812'] }),
  definePlace({ id: 'g318-nimagong-viewpoint', routeProfile: 'g318', canonicalName: '尼玛贡神山大型观景台旅游服务区', aliases: ['尼玛贡神山观景台'], adminPath: ['四川省', '甘孜藏族自治州', '雅江县'], nearbyLandmarks: ['日里村', '呷柯乡'], roadRefs: ['G318'], nodeType: 'viewpoint', requiredTerms: ['尼玛贡', '观景台'], visualTraits: ['G318沿线观景平台'], evidenceUrls: ['docs/reference/318-authoritative-roadbook-v1.md'] }),
  definePlace({ id: 'g318-sister-lakes', routeProfile: 'g318', canonicalName: '姊妹湖', aliases: ['海子山姊妹湖', '眼镜湖'], adminPath: ['四川省', '甘孜藏族自治州', '巴塘县'], nearbyLandmarks: ['海子山'], roadRefs: ['G318'], nodeType: 'natural-landmark', requiredTerms: ['姊妹湖', '海子山'], visualTraits: ['相邻双湖'], evidenceUrls: ['docs/reference/318-authoritative-roadbook-v1.md'] }),
  definePlace({ id: 'g318-midui-glacier', routeProfile: 'g318', canonicalName: '米堆冰川', aliases: [], adminPath: ['西藏自治区', '林芝市', '波密县'], nearbyLandmarks: ['米堆村'], roadRefs: ['G318'], nodeType: 'natural-landmark', requiredTerms: ['米堆冰川'], negativeTerms: ['来古冰川'], visualTraits: ['冰川与村落山谷'], evidenceUrls: ['docs/reference/318-authoritative-roadbook-v1.md'] }),
  definePlace({ id: 'g317-zhuokeji', routeProfile: 'g317', canonicalName: '卓克基土司官寨', aliases: ['卓克基官寨'], adminPath: ['四川省', '阿坝藏族羌族自治州', '马尔康市'], nearbyLandmarks: ['卓克基镇'], roadRefs: ['G317'], nodeType: 'cultural-landmark', requiredTerms: ['卓克基', '土司官寨'], visualTraits: ['嘉绒藏族官寨建筑'], evidenceUrls: ['https://www.amap.com/search?query=卓克基土司官寨'] }),
  definePlace({ id: 'g317-larung', routeProfile: 'g317', canonicalName: '喇荣五明佛学院', aliases: ['色达佛学院'], adminPath: ['四川省', '甘孜藏族自治州', '色达县'], nearbyLandmarks: ['喇荣沟'], nodeType: 'cultural-landmark', requiredTerms: ['喇荣', '五明佛学院'], visualTraits: ['山谷密集红色建筑'], evidenceUrls: ['https://www.amap.com/search?query=喇荣五明佛学院'] }),
  definePlace({ id: 'g317-derge-parkhang', routeProfile: 'g317', canonicalName: '德格印经院', aliases: ['德格印经院文化博物馆'], adminPath: ['四川省', '甘孜藏族自治州', '德格县'], nearbyLandmarks: ['更庆镇'], roadRefs: ['G317'], nodeType: 'cultural-landmark', requiredTerms: ['德格', '印经院'], visualTraits: ['藏式印经院建筑'], evidenceUrls: ['https://www.amap.com/search?query=德格印经院'] }),
  definePlace({ id: 'g317-queershan-tunnel', routeProfile: 'g317', canonicalName: '雀儿山隧道', aliases: [], adminPath: ['四川省', '甘孜藏族自治州', '德格县'], nearbyLandmarks: ['雀儿山'], roadRefs: ['G317'], nodeType: 'named-landmark', requiredTerms: ['雀儿山隧道'], visualTraits: ['公路隧道口'], evidenceUrls: ['https://www.amap.com/search?query=雀儿山隧道'] }),
  definePlace({ id: 'g317-zizhu-temple', routeProfile: 'g317', canonicalName: '孜珠寺', aliases: [], adminPath: ['西藏自治区', '昌都市', '丁青县'], nearbyLandmarks: ['孜珠山'], nodeType: 'cultural-landmark', requiredTerms: ['孜珠寺', '丁青'], visualTraits: ['山体寺院群'], evidenceUrls: ['https://www.amap.com/search?query=孜珠寺'] }),
  definePlace({ id: 'genyen-eye', routeProfile: 'genyen-south', canonicalName: '格聂之眼', aliases: [], adminPath: ['四川省', '甘孜藏族自治州', '理塘县'], nearbyLandmarks: ['格聂神山'], nodeType: 'natural-landmark', requiredTerms: ['格聂之眼'], visualTraits: ['圆形水潭与草原'], evidenceUrls: ['https://www.amap.com/search?query=格聂之眼'] }),
  definePlace({ id: 'genyen-mountain', routeProfile: 'genyen-south', canonicalName: '格聂神山', aliases: ['格聂山'], adminPath: ['四川省', '甘孜藏族自治州', '理塘县'], nearbyLandmarks: ['冷古寺'], nodeType: 'natural-landmark', requiredTerms: ['格聂神山'], visualTraits: ['雪山主峰'], evidenceUrls: ['https://www.amap.com/search?query=格聂神山'] }),
  definePlace({ id: 'genyen-lenggu-temple', routeProfile: 'genyen-south', canonicalName: '冷古寺', aliases: ['老冷古寺', '新冷古寺'], adminPath: ['四川省', '甘孜藏族自治州', '理塘县'], nearbyLandmarks: ['格聂神山'], nodeType: 'cultural-landmark', requiredTerms: ['冷古寺', '格聂'], visualTraits: ['格聂山区寺院'], evidenceUrls: ['https://www.amap.com/search?query=冷古寺'] }),
  definePlace({ id: 'genyen-xiazetong', routeProfile: 'genyen-south', canonicalName: '下则通村', aliases: [], adminPath: ['四川省', '甘孜藏族自治州', '理塘县'], nearbyLandmarks: ['格聂南线'], nodeType: 'village', requiredTerms: ['下则通'], visualTraits: ['高原村落'], evidenceUrls: ['https://www.amap.com/search?query=下则通村'] }),
  definePlace({ id: 'genyen-reti-valley', routeProfile: 'genyen-south', canonicalName: '热梯河谷', aliases: [], adminPath: ['四川省', '甘孜藏族自治州', '理塘县'], nearbyLandmarks: ['格聂南线'], nodeType: 'natural-landmark', requiredTerms: ['热梯河谷'], visualTraits: ['河谷与高原道路'], evidenceUrls: ['https://www.amap.com/search?query=热梯河谷'] }),
  definePlace({ id: 'chengdu-museum', routeProfile: 'chengdu-city', canonicalName: '成都博物馆', aliases: ['成都博物馆新馆'], adminPath: ['四川省', '成都市', '青羊区'], nearbyLandmarks: ['天府广场'], nodeType: 'urban-landmark', requiredTerms: ['成都博物馆'], visualTraits: ['现代博物馆建筑'], evidenceUrls: ['https://www.amap.com/search?query=成都博物馆'] }),
  definePlace({ id: 'chengdu-wuhou-shrine', routeProfile: 'chengdu-city', canonicalName: '成都武侯祠博物馆', aliases: ['武侯祠', '成都武侯祠'], adminPath: ['四川省', '成都市', '武侯区'], nearbyLandmarks: ['锦里'], nodeType: 'urban-landmark', requiredTerms: ['武侯祠', '成都'], visualTraits: ['红墙与祠庙建筑'], evidenceUrls: ['https://www.amap.com/search?query=成都武侯祠博物馆'] }),
  definePlace({ id: 'chengdu-dufu-cottage', routeProfile: 'chengdu-city', canonicalName: '成都杜甫草堂博物馆', aliases: ['杜甫草堂', '成都杜甫草堂'], adminPath: ['四川省', '成都市', '青羊区'], nearbyLandmarks: ['浣花溪'], nodeType: 'urban-landmark', requiredTerms: ['杜甫草堂', '成都'], visualTraits: ['中式园林与草堂'], evidenceUrls: ['https://www.amap.com/search?query=成都杜甫草堂博物馆'] }),
  definePlace({ id: 'chengdu-eastern-suburb-memory', routeProfile: 'chengdu-city', canonicalName: '东郊记忆', aliases: ['成都东郊记忆'], adminPath: ['四川省', '成都市', '成华区'], nearbyLandmarks: ['建设南支路'], nodeType: 'urban-landmark', requiredTerms: ['东郊记忆', '成都'], visualTraits: ['工业遗产与文创园区'], evidenceUrls: ['https://www.amap.com/search?query=东郊记忆'] }),
  definePlace({ id: 'chengdu-chunxi-road', routeProfile: 'chengdu-city', canonicalName: '春熙路', aliases: ['成都春熙路'], adminPath: ['四川省', '成都市', '锦江区'], nearbyLandmarks: ['太古里'], nodeType: 'urban-public-space', requiredTerms: ['春熙路', '成都'], visualTraits: ['城市商业步行街'], evidenceUrls: ['https://www.amap.com/search?query=春熙路'] }),
]

export function validateBenchmarkPlaces(places) {
  const errors = []
  const ids = new Set()
  for (const place of places) {
    if (!place.id || ids.has(place.id)) errors.push(`invalid-or-duplicate-id:${place.id || ''}`)
    ids.add(place.id)
    for (const key of ['routeProfile', 'canonicalName', 'nodeType']) {
      if (!place[key]) errors.push(`${place.id}:missing-${key}`)
    }
    for (const key of ['aliases', 'adminPath', 'nearbyLandmarks', 'roadRefs', 'requiredTerms', 'negativeTerms', 'visualTraits', 'evidenceUrls']) {
      if (!Array.isArray(place[key])) errors.push(`${place.id}:invalid-${key}`)
    }
    if (place.nodeType === 'road-node' && (!place.coordinates || place.roadRefs.length === 0)) {
      errors.push(`${place.id}:road-node-needs-coordinate-and-road-ref`)
    }
  }
  return errors
}
```

Before committing, verify each non-318 canonical name and administrative area against a traceable map or official page. If a colloquial name differs, store it in `aliases`; do not silently replace the approved benchmark category.

- [ ] **Step 4: Run the fixture tests**

Run: `npm test -- server/imageSearch/benchmarkPlaces.test.js`  
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/imageSearch/benchmarkPlaces.js server/imageSearch/benchmarkPlaces.test.js
git commit -m "test(images): add cross-route benchmark places"
```

### Task 2: 实现地点身份硬门槛

**Files:**
- Create: `server/imageSearch/identityGate.js`
- Create: `server/imageSearch/identityGate.test.js`

- [ ] **Step 1: Write failing tests for exact, review, rejected and geo-road cases**

```js
import { describe, expect, it } from 'vitest'
import { buildPlaceQueries, evaluatePlaceIdentity } from './identityGate.js'

const bridge = {
  canonicalName: '金沙江大桥（竹巴笼）', aliases: ['竹巴笼金沙江大桥', '金沙江大桥'],
  adminPath: ['四川省', '甘孜州', '巴塘县', '竹巴笼乡'], nearbyLandmarks: ['芒康县', '金沙江'],
  roadRefs: ['G318'], requiredTerms: ['金沙江大桥', '竹巴笼'],
  negativeTerms: ['London', 'Tower Bridge', '伦敦'], nodeType: 'road-node', coordinates: null,
}

describe('evaluatePlaceIdentity', () => {
  it('名称和地区证据同时命中才自动 exact', () => {
    expect(evaluatePlaceIdentity(bridge, {
      title: '竹巴笼金沙江大桥', description: 'G318 巴塘通往芒康', tags: '金沙江', sourcePage: 'https://example.test/zhubalong',
    }).status).toBe('exact')
  })

  it('只有 bridge 类别相似时直接拒绝', () => {
    expect(evaluatePlaceIdentity(bridge, {
      title: 'Beautiful bridge', description: 'city river crossing', tags: 'bridge, travel', sourcePage: 'https://example.test/bridge',
    }).status).toBe('rejected')
  })

  it('伦敦塔桥即使含 bridge 也被负例拒绝', () => {
    const out = evaluatePlaceIdentity(bridge, { title: 'London Tower Bridge', description: '伦敦著名桥梁', tags: 'bridge' })
    expect(out).toMatchObject({ status: 'rejected', reason: 'negative-evidence' })
  })

  it('仅名称命中但没有地区或来源证据时等待人工确认', () => {
    expect(evaluatePlaceIdentity(bridge, { title: '金沙江大桥', description: '', tags: '' }).status).toBe('needs_review')
  })

  it('无名道路节点以近距离坐标加道路编号通过', () => {
    const road = { canonicalName: 'G318/G248交叉口（营官村）', aliases: [], adminPath: ['康定市'], nearbyLandmarks: ['营官村'], roadRefs: ['G318', 'G248'], requiredTerms: ['G318', 'G248'], negativeTerms: [], nodeType: 'road-node', coordinates: { lng: 101.5466692, lat: 30.038074 } }
    expect(evaluatePlaceIdentity(road, { title: 'G318 G248 junction', coordinates: { lng: 101.5467, lat: 30.0381 } }).status).toBe('exact')
  })
})

describe('buildPlaceQueries', () => {
  it('只使用地点身份信息，不生成宽泛类别兜底词', () => {
    const queries = buildPlaceQueries(bridge)
    expect(queries).toContain('金沙江大桥（竹巴笼） 巴塘县')
    expect(queries.join(' ')).not.toMatch(/高原风光|雪山草原|beautiful bridge/i)
  })
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- server/imageSearch/identityGate.test.js`  
Expected: FAIL because exports do not exist.

- [ ] **Step 3: Implement normalized evidence matching**

```js
function textOf(candidate) {
  return [candidate.title, candidate.description, candidate.tags, candidate.sourcePage, candidate.publisher]
    .filter(Boolean).join(' ').toLowerCase()
}

function hasAny(text, terms = []) {
  return terms.some((term) => term && text.includes(String(term).toLowerCase()))
}

function distanceMeters(a, b) {
  const rad = (n) => (n * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

export function evaluatePlaceIdentity(place, candidate) {
  const text = textOf(candidate)
  if (hasAny(text, place.negativeTerms)) return { status: 'rejected', reason: 'negative-evidence', evidence: [] }

  const nameHit = hasAny(text, [place.canonicalName, ...place.aliases])
  const contextHit = hasAny(text, [...place.adminPath, ...place.nearbyLandmarks, ...place.roadRefs])
  const geoHit = Boolean(place.coordinates && candidate.coordinates && distanceMeters(place.coordinates, candidate.coordinates) <= 1000)
  const roadRefsHit = place.roadRefs.length > 0 && place.roadRefs.every((term) => text.includes(term.toLowerCase()))

  if (place.nodeType === 'road-node' && geoHit && roadRefsHit) {
    return { status: 'exact', reason: 'geo-and-road-evidence', evidence: ['coordinates', 'roadRefs'] }
  }
  if (nameHit && contextHit) return { status: 'exact', reason: 'name-and-context', evidence: ['name', 'context'] }
  if (nameHit || geoHit) return { status: 'needs_review', reason: 'insufficient-independent-evidence', evidence: nameHit ? ['name'] : ['coordinates'] }
  return { status: 'rejected', reason: 'no-place-identity', evidence: [] }
}

export function buildPlaceQueries(place) {
  const region = place.adminPath.at(-2) || place.adminPath.at(-1) || ''
  const queries = [
    `${place.canonicalName} ${region}`,
    ...place.aliases.map((alias) => `${alias} ${region}`),
    ...place.nearbyLandmarks.slice(0, 1).map((near) => `${place.canonicalName} ${near}`),
    ...place.roadRefs.slice(0, 1).map((road) => `${place.canonicalName} ${road}`),
  ]
  return [...new Set(queries.map((q) => q.trim()).filter(Boolean))].slice(0, 5)
}
```

- [ ] **Step 4: Run identity tests and existing image-match tests**

Run: `npm test -- server/imageSearch/identityGate.test.js src/utils/imageMatch.test.js`  
Expected: all tests PASS; existing `imageMatch` remains unchanged because the benchmark gate is isolated.

- [ ] **Step 5: Commit**

```bash
git add server/imageSearch/identityGate.js server/imageSearch/identityGate.test.js
git commit -m "feat(images): add strict place identity gate"
```

### Task 3: 统一五种图片来源

**Files:**
- Create: `server/imageSearch/providers.js`
- Create: `server/imageSearch/providers.test.js`

- [ ] **Step 1: Write failing provider normalization tests**

```js
import { describe, expect, it, vi } from 'vitest'
import {
  createPixabayProvider, createCommonsProvider, createOpenverseProvider,
  createBraveProvider, createMapillaryProvider,
} from './providers.js'

describe('图片来源适配器', () => {
  it('Openverse 保留地点证据和许可字段', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ results: [{ id: 'ov1', title: 'Midui Glacier Tibet', tags: [{ name: '米堆冰川' }], thumbnail: 'https://img.test/1.jpg', foreign_landing_url: 'https://source.test/1', creator: 'A', license: 'by-sa', license_url: 'https://creativecommons.org/licenses/by-sa/4.0/' }] }) }))
    const out = await createOpenverseProvider({ fetchImpl }).search({ query: '米堆冰川 林芝' })
    expect(out.candidates[0]).toMatchObject({ provider: 'openverse', id: 'ov1', title: 'Midui Glacier Tibet', license: 'by-sa', author: 'A' })
  })

  it('Brave 未配置 key 时明确 skipped 且不发请求', async () => {
    const fetchImpl = vi.fn()
    await expect(createBraveProvider({ apiKey: '', fetchImpl }).search({ query: 'x' })).resolves.toMatchObject({ skipped: true, reason: 'missing-credentials' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('Mapillary 未配置 token 时明确 skipped', async () => {
    await expect(createMapillaryProvider({ accessToken: '' }).search({ query: 'x', place: { coordinates: { lng: 1, lat: 2 } } })).resolves.toMatchObject({ skipped: true })
  })

  it('Pixabay 和 Commons 都转换为统一候选格式', async () => {
    const pixabayFetch = vi.fn(async () => ({ ok: true, json: async () => ({ hits: [{ id: 1, tags: '成都博物馆, 成都', pageURL: 'https://pixabay.test/1', webformatURL: 'https://img.test/1.jpg' }] }) }))
    const commonsFetch = vi.fn(async () => ({ ok: true, json: async () => ({ query: { pages: { 2: { pageid: 2, title: 'File:Chengdu Museum.jpg', imageinfo: [{ thumburl: 'https://upload.wikimedia.org/x.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:X', extmetadata: { LicenseShortName: { value: 'CC BY-SA' } } }] } } } }) }))
    const pixabay = await createPixabayProvider({ apiKey: 'pk', fetchImpl: pixabayFetch }).search({ query: '成都博物馆' })
    const commons = await createCommonsProvider({ fetchImpl: commonsFetch }).search({ query: '成都博物馆' })
    expect(pixabay.candidates[0]).toMatchObject({ provider: 'pixabay', id: '1', sourcePage: 'https://pixabay.test/1' })
    expect(commons.candidates[0]).toMatchObject({ provider: 'commons', id: '2', license: 'CC BY-SA' })
  })

  it('Brave 保留原始页面但不伪造许可', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ results: [{ title: '成都博物馆', description: '位于成都天府广场', url: 'https://museum.example/page', thumbnail: { src: 'https://img.example/t.jpg' }, source: 'museum.example' }] }) }))
    const out = await createBraveProvider({ apiKey: 'bk', fetchImpl }).search({ query: '成都博物馆' })
    expect(out.candidates[0]).toMatchObject({ provider: 'brave', sourcePage: 'https://museum.example/page', license: '' })
  })

  it('Mapillary 只保留 API 返回的坐标，不复制目标名称制造证据', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ id: 'm1', thumb_2048_url: 'https://img.test/m1.jpg', computed_geometry: { coordinates: [101.5467, 30.0381] } }] }) }))
    const out = await createMapillaryProvider({ accessToken: 'mt', fetchImpl }).search({ place: { canonicalName: 'G318/G248交叉口（营官村）', coordinates: { lng: 101.5466692, lat: 30.038074 } } })
    expect(out.candidates[0]).toMatchObject({ provider: 'mapillary', title: '', coordinates: { lng: 101.5467, lat: 30.0381 } })
  })
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- server/imageSearch/providers.test.js`  
Expected: FAIL because `providers.js` does not exist.

- [ ] **Step 3: Implement normalized provider contract**

Every provider returns either `{ candidates, elapsedMs }` or `{ skipped: true, reason }`. Use this candidate shape:

```js
import { searchImages } from '../images.js'
import { searchCommonsImages } from '../commonsImages.js'

function candidate(provider, raw) {
  return {
    provider,
    id: String(raw.id),
    title: raw.title || '',
    description: raw.description || '',
    tags: raw.tags || '',
    sourcePage: raw.sourcePage || '',
    imageUrl: raw.imageUrl || '',
    author: raw.author || '',
    license: raw.license || '',
    licenseUrl: raw.licenseUrl || '',
    coordinates: raw.coordinates || null,
    publisher: raw.publisher || '',
  }
}

export function createOpenverseProvider({ fetchImpl = fetch } = {}) {
  return {
    name: 'openverse',
    async search({ query }) {
      const started = performance.now()
      const url = new URL('https://api.openverse.org/v1/images/')
      url.searchParams.set('q', query)
      url.searchParams.set('page_size', '20')
      const res = await fetchImpl(url)
      if (!res.ok) throw Object.assign(new Error(`Openverse request failed (${res.status})`), { status: res.status })
      const body = await res.json()
      return {
        elapsedMs: Math.round(performance.now() - started),
        candidates: (body.results || []).map((r) => candidate('openverse', {
          id: r.id, title: r.title, description: r.description,
          tags: (r.tags || []).map((t) => t.name || t).join(', '),
          sourcePage: r.foreign_landing_url, imageUrl: r.thumbnail || r.url,
          author: r.creator, license: r.license, licenseUrl: r.license_url,
          publisher: r.source,
        })),
      }
    },
  }
}

export function createPixabayProvider({ apiKey, fetchImpl = fetch } = {}) {
  return {
    name: 'pixabay',
    async search({ query }) {
      if (!apiKey) return { skipped: true, reason: 'missing-credentials' }
      const started = performance.now()
      const rows = await searchImages({ apiKey, q: query, lang: 'zh' }, fetchImpl)
      return {
        elapsedMs: Math.round(performance.now() - started),
        candidates: rows.map((r) => candidate('pixabay', {
          id: r.id, tags: r.tags, sourcePage: r.pageURL,
          imageUrl: r.largeImageURL || r.webformatURL,
        })),
      }
    },
  }
}

export function createCommonsProvider({ fetchImpl = fetch } = {}) {
  return {
    name: 'commons',
    async search({ query }) {
      const started = performance.now()
      const rows = await searchCommonsImages({ q: query }, fetchImpl)
      return {
        elapsedMs: Math.round(performance.now() - started),
        candidates: rows.map((r) => candidate('commons', {
          id: r.id, title: r.title, tags: r.tags, sourcePage: r.pageURL,
          imageUrl: r.largeImageURL || r.webformatURL,
          author: r.attribution?.author, license: r.attribution?.license,
          licenseUrl: r.attribution?.licenseUrl,
        })),
      }
    },
  }
}

export function createBraveProvider({ apiKey, fetchImpl = fetch } = {}) {
  return {
    name: 'brave',
    async search({ query }) {
      if (!apiKey) return { skipped: true, reason: 'missing-credentials' }
      const started = performance.now()
      const url = new URL('https://api.search.brave.com/res/v1/images/search')
      url.searchParams.set('q', query)
      url.searchParams.set('count', '20')
      url.searchParams.set('safesearch', 'strict')
      const res = await fetchImpl(url, { headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey } })
      if (!res.ok) throw Object.assign(new Error(`Brave request failed (${res.status})`), { status: res.status })
      const body = await res.json()
      return {
        elapsedMs: Math.round(performance.now() - started),
        candidates: (body.results || []).map((r, index) => candidate('brave', {
          id: r.id || `${index}:${r.url || r.title || ''}`, title: r.title,
          description: r.description, sourcePage: r.url,
          imageUrl: r.thumbnail?.src || r.properties?.url,
          publisher: r.source || r.meta_url?.hostname,
        })),
      }
    },
  }
}

export function createMapillaryProvider({ accessToken, fetchImpl = fetch } = {}) {
  return {
    name: 'mapillary',
    async search({ place }) {
      if (!accessToken) return { skipped: true, reason: 'missing-credentials' }
      if (!place?.coordinates) return { skipped: true, reason: 'missing-coordinates' }
      const started = performance.now()
      const { lng, lat } = place.coordinates
      const delta = 0.01
      const url = new URL('https://graph.mapillary.com/images')
      url.searchParams.set('access_token', accessToken)
      url.searchParams.set('fields', 'id,thumb_2048_url,computed_geometry,captured_at')
      url.searchParams.set('bbox', `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`)
      url.searchParams.set('limit', '20')
      const res = await fetchImpl(url)
      if (!res.ok) throw Object.assign(new Error(`Mapillary request failed (${res.status})`), { status: res.status })
      const body = await res.json()
      return {
        elapsedMs: Math.round(performance.now() - started),
        candidates: (body.data || []).map((r) => candidate('mapillary', {
          id: r.id, title: '', description: r.captured_at ? `captured_at:${r.captured_at}` : '',
          sourcePage: `https://www.mapillary.com/app/?pKey=${r.id}`,
          imageUrl: r.thumb_2048_url,
          coordinates: Array.isArray(r.computed_geometry?.coordinates)
            ? { lng: r.computed_geometry.coordinates[0], lat: r.computed_geometry.coordinates[1] }
            : null,
          publisher: 'Mapillary', license: 'CC BY-SA 4.0',
          licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        })),
      }
    },
  }
}
```

Do not copy `place.canonicalName` into a provider candidate title or description. That would manufacture supporting evidence from the target itself. Mapillary candidates may remain `needs_review` when the API only proves proximity but not the road identity.

Do not add these adapters to `server/app.js` yet. They belong only to the benchmark.

- [ ] **Step 4: Run provider tests**

Run: `npm test -- server/imageSearch/providers.test.js server/images.test.js server/commonsImages.test.js`  
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/imageSearch/providers.js server/imageSearch/providers.test.js
git commit -m "feat(images): normalize benchmark search providers"
```

### Task 4: 实现并发、缓存、重试与来源熔断

**Files:**
- Create: `server/imageSearch/benchmarkRunner.js`
- Create: `server/imageSearch/benchmarkRunner.test.js`

- [ ] **Step 1: Write failing orchestration tests**

```js
import { describe, expect, it, vi } from 'vitest'
import { createBenchmarkRunner } from './benchmarkRunner.js'

describe('搜图基准执行器', () => {
  it('同一来源和查询在单次试验内只请求一次', async () => {
    const search = vi.fn(async () => ({ candidates: [], elapsedMs: 5 }))
    const runner = createBenchmarkRunner({ providers: [{ name: 'fake', search }], concurrency: 2 })
    await runner.searchOnce({ query: '米堆冰川 林芝', place: {} }, 'fake')
    await runner.searchOnce({ query: '米堆冰川 林芝', place: {} }, 'fake')
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('429 临时错误退避后重试，永久错误不重试', async () => {
    const search = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('busy'), { status: 429 }))
      .mockResolvedValueOnce({ candidates: [], elapsedMs: 1 })
    const sleep = vi.fn(async () => {})
    const runner = createBenchmarkRunner({ providers: [{ name: 'fake', search }], sleep })
    await expect(runner.searchOnce({ query: 'x', place: {} }, 'fake')).resolves.toBeTruthy()
    expect(search).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(300)
  })

  it('单一来源连续失败后熔断，但其他来源继续', async () => {
    const broken = { name: 'broken', search: vi.fn(async () => { throw Object.assign(new Error('down'), { status: 503 }) }) }
    const good = { name: 'good', search: vi.fn(async () => ({ candidates: [], elapsedMs: 1 })) }
    const runner = createBenchmarkRunner({ providers: [broken, good], failureThreshold: 2, sleep: async () => {} })
    await runner.run([{ id: 'a' }, { id: 'b' }, { id: 'c' }], () => ['q'])
    expect(broken.search.mock.calls.length).toBeLessThanOrEqual(4)
    expect(good.search).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- server/imageSearch/benchmarkRunner.test.js`  
Expected: FAIL because runner does not exist.

- [ ] **Step 3: Implement bounded orchestration**

Implement `createBenchmarkRunner({ providers, concurrency = 4, retries = 2, failureThreshold = 3, sleep })` with:

```js
import { evaluatePlaceIdentity } from './identityGate.js'

const transient = (status) => status === 429 || status >= 500
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function runPool(items, worker, limit) {
  const output = new Array(items.length)
  let cursor = 0
  async function consume() {
    while (cursor < items.length) {
      const index = cursor++
      output[index] = await worker(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume))
  return output
}

export function createBenchmarkRunner({ providers, concurrency = 4, retries = 2, failureThreshold = 3, sleep = wait }) {
  const byName = new Map(providers.map((p) => [p.name, p]))
  const cache = new Map()
  const failures = new Map()

  async function searchOnce(input, providerName) {
    const key = `${providerName}|${input.place?.id || ''}|${input.query}`
    if (cache.has(key)) return { ...cache.get(key), cacheHit: true, retryCount: 0 }
    if ((failures.get(providerName) || 0) >= failureThreshold) return { skipped: true, reason: 'circuit-open' }
    const provider = byName.get(providerName)
    let attempt = 0
    while (true) {
      try {
        const result = await provider.search(input)
        failures.set(providerName, 0)
        const measured = { ...result, retryCount: attempt }
        cache.set(key, measured)
        return measured
      } catch (error) {
        failures.set(providerName, (failures.get(providerName) || 0) + 1)
        if (!transient(error.status) || attempt >= retries) {
          return { error: error.message, status: error.status || 500, retryCount: attempt }
        }
        await sleep(300 * 2 ** attempt)
        attempt++
      }
    }
  }

  async function run(places, queryBuilder) {
    const jobs = places.flatMap((place) => providers.map((provider) => ({ place, providerName: provider.name })))
    return runPool(jobs, async ({ place, providerName }) => {
      const row = {
        placeId: place.id, placeName: place.canonicalName || place.id, provider: providerName,
        exact: [], needsReview: [], rejected: [], errors: [], skipped: null,
        requestCount: 0, retryCount: 0, cacheHits: 0, elapsedMs: 0,
      }
      for (const query of queryBuilder(place)) {
        const started = performance.now()
        const result = await searchOnce({ query, place }, providerName)
        row.elapsedMs += Math.round(performance.now() - started)
        if (result.skipped) {
          row.skipped = result.reason
          break
        }
        row.retryCount += result.retryCount || 0
        if (result.cacheHit) row.cacheHits++
        else row.requestCount += 1 + (result.retryCount || 0)
        if (result.error) {
          row.errors.push({ query, message: result.error, status: result.status })
          continue
        }
        for (const item of result.candidates || []) {
          const identity = evaluatePlaceIdentity(place, item)
          const decorated = { ...item, identityReason: identity.reason, identityEvidence: identity.evidence }
          if (identity.status === 'exact') row.exact.push(decorated)
          else if (identity.status === 'needs_review') row.needsReview.push(decorated)
          else row.rejected.push(decorated)
        }
        if (row.exact.length >= 3) {
          row.exact = row.exact.slice(0, 3)
          break
        }
      }
      return row
    }, concurrency)
  }

  return { searchOnce, run }
}
```

`run()` must stop issuing further queries for a place/provider after it has collected 3 `exact` candidates, but must never count `needs_review` toward the quota.

- [ ] **Step 4: Run runner tests**

Run: `npm test -- server/imageSearch/benchmarkRunner.test.js`  
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/imageSearch/benchmarkRunner.js server/imageSearch/benchmarkRunner.test.js
git commit -m "feat(images): add resilient benchmark runner"
```

### Task 5: 生成可复核报告和明显错图警报

**Files:**
- Create: `server/imageSearch/report.js`
- Create: `server/imageSearch/report.test.js`

- [ ] **Step 1: Write failing report tests**

```js
import { describe, expect, it } from 'vitest'
import { buildBenchmarkReport } from './report.js'

describe('搜图基准报告', () => {
  it('逐节点显示状态、证据、来源、许可和耗时', () => {
    const report = buildBenchmarkReport([{ placeId: 'x', placeName: '金沙江大桥（竹巴笼）', provider: 'openverse', elapsedMs: 120, exact: [], needsReview: [], rejected: [{ title: 'London Tower Bridge', reason: 'negative-evidence' }], errors: [] }])
    expect(report.markdown).toContain('金沙江大桥（竹巴笼）')
    expect(report.markdown).toContain('negative-evidence')
    expect(report.json.summary).toMatchObject({ exactCandidates: 0, rejectedCandidates: 1 })
  })

  it('任何负例进入 exact 时产生硬失败', () => {
    expect(() => buildBenchmarkReport([{ placeId: 'x', placeName: '金沙江大桥', provider: 'bad', exact: [{ title: 'London Tower Bridge', negativeEvidence: ['London'] }], needsReview: [], rejected: [], errors: [] }])).toThrow(/negative candidate entered exact/i)
  })
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- server/imageSearch/report.test.js`  
Expected: FAIL because report builder does not exist.

- [ ] **Step 3: Implement report output**

`buildBenchmarkReport(rows)` must return `{ markdown, json }`. Markdown contains:

1. execution date and enabled/disabled sources;
2. summary table with first-exact time, total time, requests, retries and errors;
3. 20 place sections with top candidates and identity evidence;
4. source/license links;
5. no-result and needs-review lists;
6. a release gate that fails when any known negative candidate appears in `exact`.

Use explicit labels: `精准匹配`、`待人工确认`、`已拒绝`、`素材不足`、`来源未执行`.

Implement the release gate and report structure directly:

```js
const statusLabel = (row) => {
  if (row.skipped) return '来源未执行'
  if (row.exact.length > 0) return '精准匹配'
  if (row.needsReview.length > 0) return '待人工确认'
  return '素材不足'
}

export function buildBenchmarkReport(rows) {
  for (const row of rows) {
    for (const item of row.exact || []) {
      if (item.identityReason === 'negative-evidence' || item.negativeEvidence?.length) {
        throw new Error(`negative candidate entered exact: ${row.placeName} / ${item.title}`)
      }
    }
  }

  const summary = {
    places: new Set(rows.map((r) => r.placeId)).size,
    sources: new Set(rows.map((r) => r.provider)).size,
    exactCandidates: rows.reduce((n, r) => n + (r.exact?.length || 0), 0),
    reviewCandidates: rows.reduce((n, r) => n + (r.needsReview?.length || 0), 0),
    rejectedCandidates: rows.reduce((n, r) => n + (r.rejected?.length || 0), 0),
    requests: rows.reduce((n, r) => n + (r.requestCount || 0), 0),
    retries: rows.reduce((n, r) => n + (r.retryCount || 0), 0),
    errors: rows.reduce((n, r) => n + (r.errors?.length || 0), 0),
  }

  const lines = [
    '# 多源精准搜图基准报告', '',
    `- 节点：${summary.places}`,
    `- 来源：${summary.sources}`,
    `- 精准候选：${summary.exactCandidates}`,
    `- 待确认：${summary.reviewCandidates}`,
    `- 已拒绝：${summary.rejectedCandidates}`,
    `- 请求/重试/错误：${summary.requests}/${summary.retries}/${summary.errors}`,
    '', '| 节点 | 来源 | 状态 | 耗时(ms) | 精准/待确认/拒绝 |',
    '|---|---|---|---:|---:|',
  ]
  for (const row of rows) {
    lines.push(`| ${row.placeName} | ${row.provider} | ${statusLabel(row)} | ${row.elapsedMs || 0} | ${(row.exact?.length || 0)}/${(row.needsReview?.length || 0)}/${(row.rejected?.length || 0)} |`)
    for (const item of [...(row.exact || []), ...(row.needsReview || []), ...(row.rejected || [])].slice(0, 3)) {
      lines.push(`\n- **${row.placeName} · ${item.title || '无标题'}**：${item.identityReason || 'unknown'}；[来源页](${item.sourcePage || '#'})；许可：${item.license || '未知'}`)
    }
    for (const error of row.errors || []) lines.push(`\n- **${row.placeName} · ${row.provider} 错误**：${error.status || ''} ${error.message}`)
  }
  return { markdown: `${lines.join('\n')}\n`, json: { generatedAt: new Date().toISOString(), summary, rows } }
}
```

- [ ] **Step 4: Run report tests**

Run: `npm test -- server/imageSearch/report.test.js`  
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/imageSearch/report.js server/imageSearch/report.test.js
git commit -m "feat(images): report exact-match benchmark evidence"
```

### Task 6: 增加一条命令并执行真实对比

**Files:**
- Create: `scripts/image-search-benchmark.js`
- Modify: `package.json`
- Create: `docs/reports/2026-08-06-image-search-source-benchmark.md`

- [ ] **Step 1: Add CLI smoke test through exported main**

Create `scripts/image-search-benchmark.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { runImageSearchBenchmark } from './image-search-benchmark.js'

describe('image-search benchmark CLI', () => {
  it('dry-run includes 20 places and does not call providers', async () => {
    const out = await runImageSearchBenchmark({ dryRun: true })
    expect(out.placeCount).toBe(20)
    expect(out.networkRequests).toBe(0)
  })
})
```

- [ ] **Step 2: Run test and verify RED**

Run: `npm test -- scripts/image-search-benchmark.test.js`  
Expected: FAIL because script does not exist.

- [ ] **Step 3: Implement CLI and package command**

The script must:

- load `.env` with `process.loadEnvFile()` when available;
- always enable current Pixabay/Commons and Openverse when their prerequisites exist;
- enable Brave only with `BRAVE_SEARCH_KEY`;
- enable Mapillary only with `MAPILLARY_TOKEN`;
- support `--dry-run` without network;
- never download full images or write to IndexedDB;
- write Markdown and JSON only under `docs/reports/` after a live run;
- print enabled, skipped and failed sources separately.

Use this complete entry structure:

```js
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { BENCHMARK_PLACES } from '../server/imageSearch/benchmarkPlaces.js'
import { buildPlaceQueries } from '../server/imageSearch/identityGate.js'
import {
  createPixabayProvider, createCommonsProvider, createOpenverseProvider,
  createBraveProvider, createMapillaryProvider,
} from '../server/imageSearch/providers.js'
import { createBenchmarkRunner } from '../server/imageSearch/benchmarkRunner.js'
import { buildBenchmarkReport } from '../server/imageSearch/report.js'

export async function runImageSearchBenchmark({ dryRun = false, env = process.env } = {}) {
  if (dryRun) return { placeCount: BENCHMARK_PLACES.length, networkRequests: 0 }
  const providers = [
    createPixabayProvider({ apiKey: env.PIXABAY_KEY || '' }),
    createCommonsProvider(),
    createOpenverseProvider(),
    createBraveProvider({ apiKey: env.BRAVE_SEARCH_KEY || '' }),
    createMapillaryProvider({ accessToken: env.MAPILLARY_TOKEN || '' }),
  ]
  const runner = createBenchmarkRunner({ providers, concurrency: 4 })
  const rows = await runner.run(BENCHMARK_PLACES, buildPlaceQueries)
  const report = buildBenchmarkReport(rows)
  const outputDir = path.resolve('docs/reports')
  fs.mkdirSync(outputDir, { recursive: true })
  const base = path.join(outputDir, '2026-08-06-image-search-source-benchmark')
  fs.writeFileSync(`${base}.md`, report.markdown, 'utf8')
  fs.writeFileSync(`${base}.json`, `${JSON.stringify(report.json, null, 2)}\n`, 'utf8')
  return { placeCount: BENCHMARK_PLACES.length, networkRequests: report.json.summary.requests, rows }
}

async function main() {
  try { process.loadEnvFile?.() } catch { /* `.env` is optional for no-key providers */ }
  const dryRun = process.argv.includes('--dry-run')
  const result = await runImageSearchBenchmark({ dryRun })
  console.log(`places=${result.placeCount} networkRequests=${result.networkRequests}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
```

Add to `package.json`:

```json
"benchmark:images": "node scripts/image-search-benchmark.js"
```

- [ ] **Step 4: Verify dry-run and all automated tests**

Run: `npm run benchmark:images -- --dry-run`  
Expected: exit 0, `20 places`, `0 network requests`.

Run: `npm test`  
Expected: all tests PASS.

- [ ] **Step 5: Run the live no-cost baseline**

Run: `npm run benchmark:images`  
Expected: Pixabay/Commons/Openverse execute according to available configuration; Brave/Mapillary show `来源未执行` when credentials are absent; report contains 20 place sections and does not modify trip data.

- [ ] **Step 6: Review the generated report before choosing production sources**

Manually verify at minimum:

- 金沙江大桥 contains no London/Tower Bridge result under `精准匹配`;
- G318/G248 交叉口 does not pass on name similarity alone;
- city landmarks do not match same-name places in other cities;
- `素材不足` is used instead of generic bridge/snow-mountain/lake images;
- every directly usable candidate has a source page and license state.

Record the selected main source, per-node-type fallback source, and rejected providers in the report conclusion. This decision is the input to a separate production-integration spec; do not modify `runImageAutoFillAll` in this benchmark plan.

- [ ] **Step 7: Build and commit evidence**

Run: `npm run build`  
Expected: build succeeds.

```bash
git add package.json scripts/image-search-benchmark.js scripts/image-search-benchmark.test.js docs/reports/2026-08-06-image-search-source-benchmark.md docs/reports/2026-08-06-image-search-source-benchmark.json
git commit -m "test(images): benchmark cross-route search sources"
```

## Final verification

- [ ] Run: `npm test` — expected all tests PASS.
- [ ] Run: `npm run build` — expected production build succeeds.
- [ ] Run: `npm run benchmark:images -- --dry-run` — expected 20 places and zero network calls.
- [ ] Inspect git diff — expected no changes to `src/stores/studio.js`, existing trip data, IndexedDB records, or video assets.
- [ ] Confirm report release gate — expected zero known negative candidates in `exact`.
