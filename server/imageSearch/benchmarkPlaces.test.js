import { describe, expect, it } from 'vitest'
import { BENCHMARK_PLACES, validateBenchmarkPlaces } from './benchmarkPlaces'

const EXPECTED_ROUTE_PLACES = {
  g318: ['金沙江大桥（竹巴笼）', 'G318/G248交叉口（营官村）', '尼玛贡神山大型观景台旅游服务区', '姊妹湖', '米堆冰川'],
  g317: ['卓克基土司官寨', '喇荣五明佛学院', '德格印经院', '雀儿山隧道', '孜珠寺'],
  'genyen-south': ['格聂之眼', '格聂神山', '冷古寺', '下则通村', '热梯河谷'],
  'chengdu-city': ['成都博物馆', '成都武侯祠博物馆', '成都杜甫草堂博物馆', '东郊记忆', '春熙路'],
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
})

describe('validateBenchmarkPlaces', () => {
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
