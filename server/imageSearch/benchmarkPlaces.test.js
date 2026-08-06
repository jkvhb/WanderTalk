import { describe, expect, it } from 'vitest'
import { BENCHMARK_PLACES, validateBenchmarkPlaces } from './benchmarkPlaces'

const EXPECTED_ROUTE_PLACES = {
  g318: ['金沙江大桥（竹巴笼）', 'G318/G248交叉口（营官村）', '尼玛贡神山大型观景台旅游服务区', '姊妹湖', '米堆冰川'],
  g317: ['卓克基土司官寨', '喇荣五明佛学院', '德格印经院', '雀儿山隧道', '孜珠寺'],
  'genyen-south': ['格聂之眼', '格聂神山', '冷古寺', '下则通村', '热梯河谷'],
  'chengdu-city': ['成都博物馆', '成都武侯祠博物馆', '成都杜甫草堂博物馆', '东郊记忆', '春熙路'],
}

const EXPECTED_IDENTITIES = {
  'jinsha-river-bridge-zhubalong': ['金沙江大桥（竹巴笼）', '四川省', '金沙江大桥'],
  'yingguancun-g318-g248-junction': ['G318/G248交叉口（营官村）', '营官村', 'G318'],
  'nimagong-viewpoint-service-area': ['尼玛贡神山大型观景台旅游服务区', '雅江县', '尼玛贡神山'],
  'sister-lakes': ['姊妹湖', '海子山', '姊妹湖'],
  'midui-glacier': ['米堆冰川', '波密县', '米堆冰川'],
  'zhuokeji-chieftain-fortress': ['卓克基土司官寨', '马尔康市', '卓克基'],
  'larung-gar-buddhist-academy': ['喇荣五明佛学院', '色达县', '喇荣'],
  'derge-parkhang': ['德格印经院', '德格县', '印经院'],
  'queershan-tunnel': ['雀儿山隧道', '德格县', '雀儿山隧道'],
  'zizhu-temple': ['孜珠寺', '丁青县', '孜珠寺'],
  'genyen-eye': ['格聂之眼', '理塘县', '格聂之眼'],
  'mount-genyen': ['格聂神山', '巴塘县', '格聂神山'],
  'lenggu-temple': ['冷古寺', '理塘县', '冷古寺'],
  'xiazetong-village': ['下则通村', '格聂镇', '下则通村'],
  'reti-valley': ['热梯河谷', '巴塘县', '热梯河谷'],
  'chengdu-museum': ['成都博物馆', '天府广场', '成都博物馆'],
  'chengdu-wuhou-shrine-museum': ['成都武侯祠博物馆', '武侯区', '武侯祠'],
  'chengdu-dufu-thatched-cottage-museum': ['成都杜甫草堂博物馆', '青羊区', '杜甫草堂'],
  'dongjiao-memory': ['东郊记忆', '成华区', '东郊记忆'],
  'chunxi-road': ['春熙路', '锦江区', '春熙路'],
}

const LIST_FIELDS = [
  'aliases',
  'adminPath',
  'nearbyLandmarks',
  'roadRefs',
  'requiredTerms',
  'negativeTerms',
  'visualTraits',
  'evidenceUrls',
]

function validPlace(overrides = {}) {
  const source = BENCHMARK_PLACES[0]
  return {
    ...source,
    ...Object.fromEntries(LIST_FIELDS.map((field) => [field, [...source[field]]])),
    id: 'validator-test-place',
    coordinates: null,
    ...overrides,
  }
}

describe('BENCHMARK_PLACES', () => {
  it('contains 20 unique, valid places split evenly across route profiles', () => {
    expect(BENCHMARK_PLACES).toHaveLength(20)
    expect(new Set(BENCHMARK_PLACES.map((place) => place.id))).toHaveProperty('size', 20)
    expect(validateBenchmarkPlaces(BENCHMARK_PLACES)).toEqual([])

    for (const [routeProfile, expectedNames] of Object.entries(EXPECTED_ROUTE_PLACES)) {
      const places = BENCHMARK_PLACES.filter((place) => place.routeProfile === routeProfile)
      expect(places).toHaveLength(5)
      for (const expectedName of expectedNames) {
        expect(places.some((place) => [place.canonicalName, ...place.aliases].includes(expectedName))).toBe(true)
      }
    }
  })

  it('pins every record by exact id and critical identity fields', () => {
    expect(Object.keys(EXPECTED_IDENTITIES)).toHaveLength(20)
    expect(BENCHMARK_PLACES.map(({ id }) => id).sort()).toEqual(Object.keys(EXPECTED_IDENTITIES).sort())

    for (const place of BENCHMARK_PLACES) {
      const [canonicalName, adminToken, requiredTerm] = EXPECTED_IDENTITIES[place.id]
      expect(place.canonicalName).toBe(canonicalName)
      expect(place.adminPath).toContain(adminToken)
      expect(place.requiredTerms).toContain(requiredTerm)
      expect(place.evidenceUrls.length).toBeGreaterThan(0)
    }
  })

  it('deeply freezes the exported identity truth', () => {
    const junction = BENCHMARK_PLACES.find((place) => place.id === 'yingguancun-g318-g248-junction')
    const originalName = junction.canonicalName
    const originalAdminPath = [...junction.adminPath]
    const originalLng = junction.coordinates.lng

    expect(Object.isFrozen(BENCHMARK_PLACES)).toBe(true)
    for (const place of BENCHMARK_PLACES) {
      expect(Object.isFrozen(place)).toBe(true)
      for (const field of LIST_FIELDS) expect(Object.isFrozen(place[field])).toBe(true)
      if (place.coordinates !== null) expect(Object.isFrozen(place.coordinates)).toBe(true)
    }
    expect(() => BENCHMARK_PLACES.push(junction)).toThrow(TypeError)
    expect(() => { junction.canonicalName = 'mutated' }).toThrow(TypeError)
    expect(() => junction.adminPath.push('mutated')).toThrow(TypeError)
    expect(() => { junction.coordinates.lng = 0 }).toThrow(TypeError)
    expect(junction.canonicalName).toBe(originalName)
    expect(junction.adminPath).toEqual(originalAdminPath)
    expect(junction.coordinates.lng).toBe(originalLng)
  })

  it('pins the 金沙江大桥 identity and excludes London bridges', () => {
    const bridge = BENCHMARK_PLACES.find((place) => place.id === 'jinsha-river-bridge-zhubalong')

    expect(bridge).toMatchObject({
      canonicalName: '金沙江大桥（竹巴笼）',
      nodeType: 'named-landmark',
    })
    expect(bridge.requiredTerms).toEqual(expect.arrayContaining(['金沙江大桥', '竹巴笼']))
    expect(bridge.negativeTerms).toEqual(expect.arrayContaining(['London', 'Tower Bridge', '伦敦', '伦敦塔桥']))
  })

  it('pins the unnamed G318/G248 road junction coordinates and road references', () => {
    const junction = BENCHMARK_PLACES.find((place) => place.id === 'yingguancun-g318-g248-junction')

    expect(junction).toMatchObject({
      canonicalName: 'G318/G248交叉口（营官村）',
      nodeType: 'road-node',
      coordinates: { lng: 101.5466692, lat: 30.038074 },
    })
    expect(junction.roadRefs).toEqual(expect.arrayContaining(['G318', 'G248']))
    expect(junction.evidenceUrls).toContain('https://www.openstreetmap.org/node/634137812')
  })

  it('keeps 米堆冰川 distinct from 来古冰川', () => {
    const glacier = BENCHMARK_PLACES.find((place) => place.id === 'midui-glacier')
    expect(glacier.negativeTerms).toContain('来古冰川')
  })

  it('uses only conflicting place identities as negative terms', () => {
    const byId = Object.fromEntries(BENCHMARK_PLACES.map((place) => [place.id, place]))
    expect(byId['yingguancun-g318-g248-junction'].negativeTerms).not.toContain('景区')
    expect(byId['yingguancun-g318-g248-junction'].negativeTerms).not.toContain('观景台')
    expect(byId['sister-lakes'].negativeTerms).not.toContain('任意高原湖泊')
    expect(byId['dongjiao-memory'].negativeTerms).not.toContain('东郊记忆站')
    expect(byId['chunxi-road'].negativeTerms).not.toContain('春熙路站')
    expect(byId['nimagong-viewpoint-service-area'].negativeTerms).not.toContain('尼玛贡布')
    expect(byId['xiazetong-village'].negativeTerms).not.toContain('下则通镇')
    expect(byId['reti-valley'].negativeTerms).not.toContain('热地河谷')
  })

  it('stores each administrative unit as its own token', () => {
    for (const place of BENCHMARK_PLACES) {
      expect(place.adminPath.every((token) => !token.includes('/'))).toBe(true)
    }
  })
})

describe('validateBenchmarkPlaces', () => {
  it.each([null, {}, 'places', 42])('rejects non-array input without throwing: %j', (places) => {
    expect(() => validateBenchmarkPlaces(places)).not.toThrow()
    expect(validateBenchmarkPlaces(places)).toEqual(expect.arrayContaining([expect.stringMatching(/places.*array/i)]))
  })

  it('never throws when array entries are malformed values', () => {
    expect(() => validateBenchmarkPlaces([null, undefined, 42, 'place'])).not.toThrow()
    expect(validateBenchmarkPlaces([null, undefined, 42, 'place']).length).toBeGreaterThan(0)
  })

  it('rejects unsupported route profiles and node types', () => {
    const errors = validateBenchmarkPlaces([
      validPlace({ id: 'bad-route', routeProfile: 'unsupported-route' }),
      validPlace({ id: 'bad-type', nodeType: 'unsupported-type' }),
    ])

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/unsupported routeProfile.*unsupported-route/i),
      expect.stringMatching(/unsupported nodeType.*unsupported-type/i),
    ]))
  })

  it.each(LIST_FIELDS)('rejects non-string and blank elements in %s', (field) => {
    const first = field === 'evidenceUrls' ? 'https://example.com/place' : 'valid'
    const errors = validateBenchmarkPlaces([validPlace({ [field]: [first, ' ', 42] })])

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringMatching(new RegExp(`${field}\\[1\\].*non-blank string`, 'i')),
      expect.stringMatching(new RegExp(`${field}\\[2\\].*non-blank string`, 'i')),
    ]))
  })

  it.each(['requiredTerms', 'adminPath', 'visualTraits', 'evidenceUrls'])('requires non-empty %s', (field) => {
    const errors = validateBenchmarkPlaces([validPlace({ [field]: [] })])
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringMatching(new RegExp(`${field}.*non-empty`, 'i')),
    ]))
  })

  it.each([
    'ftp://example.com/place',
    'example.com/place',
    'docs\\reference\\place.md',
    'docs/../secret.md',
    'https://',
  ])('rejects malformed evidence URL or docs path: %s', (evidenceUrl) => {
    const errors = validateBenchmarkPlaces([validPlace({ evidenceUrls: [evidenceUrl] })])
    expect(errors).toEqual(expect.arrayContaining([expect.stringMatching(/evidenceUrls\[0\].*http.*docs\//i)]))
  })

  it.each([
    {},
    { lng: 1 },
    { lng: Number.NaN, lat: 1 },
    { lng: Number.POSITIVE_INFINITY, lat: 1 },
    { lng: 181, lat: 1 },
    { lng: -181, lat: 1 },
    { lng: 1, lat: 91 },
    { lng: 1, lat: -91 },
  ])('rejects invalid coordinates for every node type: %j', (coordinates) => {
    const errors = validateBenchmarkPlaces([validPlace({ coordinates })])
    expect(errors).toEqual(expect.arrayContaining([expect.stringMatching(/coordinates.*longitude.*latitude/i)]))
  })

  it('reports malformed and duplicate records', () => {
    const malformed = {
      id: 'duplicate',
      routeProfile: '',
      canonicalName: '',
      aliases: 'not-an-array',
      adminPath: [],
      coordinates: null,
      nearbyLandmarks: [],
      roadRefs: [],
      nodeType: '',
      requiredTerms: [],
      negativeTerms: [],
      visualTraits: [],
      evidenceUrls: [],
    }
    const duplicateRoadNode = {
      ...malformed,
      routeProfile: 'test-route',
      canonicalName: 'Test junction',
      aliases: [],
      nodeType: 'road-node',
    }
    const errors = validateBenchmarkPlaces([malformed, duplicateRoadNode, { ...malformed, id: '' }])

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/duplicate id.*duplicate/i),
      expect.stringMatching(/missing id/i),
      expect.stringMatching(/missing routeProfile/i),
      expect.stringMatching(/missing canonicalName/i),
      expect.stringMatching(/missing nodeType/i),
      expect.stringMatching(/aliases.*array/i),
      expect.stringMatching(/road-node.*coordinates/i),
      expect.stringMatching(/road-node.*roadRefs/i),
    ]))
  })
})
