import { describe, expect, it } from 'vitest'
import { BENCHMARK_PLACES } from './benchmarkPlaces'
import { buildPlaceQueries, evaluatePlaceIdentity } from './identityGate'

const placeById = (id) => BENCHMARK_PLACES.find((place) => place.id === id)

describe('evaluatePlaceIdentity', () => {
  it('accepts the 金沙江大桥 only when its name and independent route context agree', () => {
    const place = placeById('jinsha-river-bridge-zhubalong')

    expect(evaluatePlaceIdentity(place, {
      title: '金沙江大桥',
      description: 'G318 巴塘至竹巴笼路段跨江大桥',
    })).toEqual({
      status: 'exact',
      reason: 'name-and-context-evidence',
      evidence: ['name', 'context'],
    })
  })

  it('rejects negative evidence before otherwise matching identity evidence', () => {
    const place = placeById('jinsha-river-bridge-zhubalong')

    for (const title of ['London Tower Bridge 金沙江大桥 巴塘', '伦敦塔桥 金沙江大桥 竹巴笼']) {
      expect(evaluatePlaceIdentity(place, { title })).toEqual({
        status: 'rejected',
        reason: 'negative-evidence',
        evidence: [],
      })
    }
  })

  it('rejects a same-category glacier candidate carrying a known wrong location', () => {
    expect(evaluatePlaceIdentity(placeById('midui-glacier'), {
      title: '米堆冰川与来古冰川',
      description: '波密县冰川旅行',
    })).toEqual({
      status: 'rejected',
      reason: 'negative-evidence',
      evidence: [],
    })
  })

  it('never treats generic class words in English, Chinese or tags as a place name', () => {
    const bridge = placeById('jinsha-river-bridge-zhubalong')
    const museum = placeById('chengdu-museum')

    expect(evaluatePlaceIdentity(bridge, {
      title: 'Beautiful bridge',
      tags: ['bridge', { name: '桥' }, null, {}],
    })).toEqual({ status: 'rejected', reason: 'insufficient-identity-evidence', evidence: [] })

    for (const generic of ['bridge', '桥', 'snow mountain', '雪山', 'lake', '湖泊', 'temple', '寺庙', 'plateau', '高原', '博物馆']) {
      expect(evaluatePlaceIdentity(museum, { title: generic, description: '成都' }).status).not.toBe('exact')
    }

    for (const generic of ['bridge', '桥', 'snow mountain', '雪山', 'lake', '湖泊', 'temple', '寺庙', 'plateau', '高原', 'museum', '博物馆']) {
      expect(evaluatePlaceIdentity({
        canonicalName: generic,
        aliases: [],
        adminPath: ['成都市'],
        nearbyLandmarks: [],
        roadRefs: [],
        negativeTerms: [],
        nodeType: 'named-landmark',
      }, { title: `${generic} 成都市` }).status).toBe('rejected')
    }
  })

  it('sends name-only candidates to review for insufficient independent evidence', () => {
    expect(evaluatePlaceIdentity(placeById('jinsha-river-bridge-zhubalong'), {
      title: '金沙江大桥',
    })).toEqual({
      status: 'needs_review',
      reason: 'insufficient-independent-evidence',
      evidence: ['name'],
    })
  })

  it('does not treat a short alias embedded in another CJK proper name as name evidence', () => {
    const village = placeById('xiazetong-village')

    expect(evaluatePlaceIdentity(village, { title: '上则通村', description: '理塘县' })).toEqual({
      status: 'rejected',
      reason: 'insufficient-identity-evidence',
      evidence: [],
    })
    expect(evaluatePlaceIdentity(village, { title: '则通村', description: '理塘县' })).toEqual({
      status: 'exact',
      reason: 'name-and-context-evidence',
      evidence: ['name', 'context'],
    })
    expect(evaluatePlaceIdentity(village, { title: '航拍：则通村；川西村落', description: '理塘县' }).status).toBe('exact')
  })

  it('does not embed a canonical CJK name inside a longer unknown proper-name token', () => {
    const place = placeById('chunxi-road')

    expect(evaluatePlaceIdentity(place, { title: '春熙路口', description: '成都市' })).toEqual({
      status: 'rejected',
      reason: 'insufficient-identity-evidence',
      evidence: [],
    })
    expect(evaluatePlaceIdentity(place, { title: '春熙路夜景', description: '成都市' })).toEqual({
      status: 'exact',
      reason: 'name-and-context-evidence',
      evidence: ['name', 'context'],
    })
  })

  it('matches multiword ASCII names flexibly but enforces alphanumeric boundaries', () => {
    const place = {
      canonicalName: 'Foo Bridge',
      aliases: ['Bar Crossing'],
      adminPath: ['Example City'],
      nearbyLandmarks: [],
      roadRefs: [],
      negativeTerms: [],
      nodeType: 'named-landmark',
    }
    const exact = {
      status: 'exact',
      reason: 'name-and-context-evidence',
      evidence: ['name', 'context'],
    }
    const rejected = {
      status: 'rejected',
      reason: 'insufficient-identity-evidence',
      evidence: [],
    }

    expect(evaluatePlaceIdentity(place, { title: 'Photo of Foo Bridge', description: 'Example City' })).toEqual(exact)
    expect(evaluatePlaceIdentity(place, { title: 'Photo of Foo—Bridge', description: 'Example City' })).toEqual(exact)
    expect(evaluatePlaceIdentity(place, { title: 'Photo of Bar Crossing', description: 'Example City' })).toEqual(exact)
    expect(evaluatePlaceIdentity(place, { title: 'Foo Bridge2', description: 'Example City' })).toEqual(rejected)
    expect(evaluatePlaceIdentity(place, { title: 'XFoo Bridge', description: 'Example City' })).toEqual(rejected)
  })

  it('uses close coordinates and every configured road reference as the road-node hard gate', () => {
    const junction = placeById('yingguancun-g318-g248-junction')

    expect(evaluatePlaceIdentity(junction, {
      description: 'Junction of G318 and G248',
      coordinates: { lng: 101.547, lat: 30.038 },
    })).toEqual({
      status: 'exact',
      reason: 'geo-and-road-evidence',
      evidence: ['coordinates', 'roadRefs'],
    })

    expect(evaluatePlaceIdentity(junction, {
      title: 'Road junction',
      coordinates: { lng: 101.547, lat: 30.038 },
    })).toEqual({
      status: 'needs_review',
      reason: 'close-coordinate-only',
      evidence: ['coordinates'],
    })

    expect(evaluatePlaceIdentity(junction, { description: 'G318 / G248 road junction' })).toEqual({
      status: 'rejected',
      reason: 'insufficient-identity-evidence',
      evidence: [],
    })
  })

  it('requires exact alphanumeric road-reference boundaries', () => {
    const junction = placeById('yingguancun-g318-g248-junction')

    expect(evaluatePlaceIdentity(junction, {
      description: 'Junction of G3180 and G2489',
      coordinates: { lng: 101.547, lat: 30.038 },
    })).toEqual({
      status: 'needs_review',
      reason: 'close-coordinate-only',
      evidence: ['coordinates'],
    })
  })

  it('ignores far and invalid coordinates without throwing or creating geo evidence', () => {
    const junction = placeById('yingguancun-g318-g248-junction')
    const invalidCoordinates = [null, {}, { lng: '101.54', lat: 30.03 }, { lng: NaN, lat: 30 }, { lng: 181, lat: 30 }]

    expect(evaluatePlaceIdentity(junction, {
      description: 'G318 G248',
      coordinates: { lng: 102.5, lat: 31 },
    })).toEqual({ status: 'rejected', reason: 'insufficient-identity-evidence', evidence: [] })

    for (const coordinates of invalidCoordinates) {
      expect(() => evaluatePlaceIdentity(junction, { description: 'G318 G248', coordinates })).not.toThrow()
      expect(evaluatePlaceIdentity(junction, { description: 'G318 G248', coordinates }).evidence).not.toContain('coordinates')
    }
  })

  it('allows a close coordinate to create review, but never exact, for a non-road node', () => {
    const place = {
      ...placeById('chengdu-museum'),
      coordinates: { lng: 104.072, lat: 30.663 },
    }

    expect(evaluatePlaceIdentity(place, {
      title: 'Unidentified building',
      coordinates: { lng: 104.0721, lat: 30.6631 },
    })).toEqual({
      status: 'needs_review',
      reason: 'close-coordinate-only',
      evidence: ['coordinates'],
    })
  })

  it('requires a full city landmark name plus independent administrative or nearby context', () => {
    const museum = placeById('chengdu-museum')

    expect(evaluatePlaceIdentity(museum, {
      title: '成都博物馆',
      description: '青羊区 天府广场',
      tags: [{ name: '城市地标' }, 'museum'],
    })).toEqual({
      status: 'exact',
      reason: 'name-and-context-evidence',
      evidence: ['name', 'context'],
    })
    expect(evaluatePlaceIdentity(museum, { title: '博物馆', description: '成都' }).status).toBe('rejected')
  })

  it('normalizes string and object tags safely as candidate text evidence', () => {
    expect(evaluatePlaceIdentity(placeById('midui-glacier'), {
      tags: [{ name: '米堆冰川' }, '波密县', {}, null, 42],
    })).toEqual({
      status: 'exact',
      reason: 'name-and-context-evidence',
      evidence: ['name', 'context'],
    })
  })

  it('treats malformed encoded text and malformed candidates as ordinary missing evidence', () => {
    const place = placeById('midui-glacier')

    expect(() => evaluatePlaceIdentity(place, { sourcePage: 'https://example.test/%E0%A4%A' })).not.toThrow()
    expect(evaluatePlaceIdentity(place, null)).toEqual({
      status: 'rejected',
      reason: 'insufficient-identity-evidence',
      evidence: [],
    })
  })

  it('does not turn percent-encoded source-page metadata into identity evidence', () => {
    const result = evaluatePlaceIdentity(placeById('midui-glacier'), {
      sourcePage: 'https://example.test/%E7%B1%B3%E5%A0%86%E5%86%B0%E5%B7%9D?where=%E6%B3%A2%E5%AF%86%E5%8E%BF',
    })

    expect(result).toEqual({
      status: 'rejected',
      reason: 'insufficient-identity-evidence',
      evidence: [],
    })
  })
})

describe('buildPlaceQueries', () => {
  it('builds deterministic, unique, identity-rich queries capped at five', () => {
    const place = placeById('jinsha-river-bridge-zhubalong')
    const first = buildPlaceQueries(place)

    expect(first).toEqual([
      '金沙江大桥（竹巴笼） 巴塘县',
      '金沙江大桥（竹巴笼） 芒康县',
      '竹巴笼金沙江大桥 巴塘县',
      '金沙江大桥（竹巴笼） 竹巴笼',
      '金沙江大桥（竹巴笼） G318',
    ])
    expect(buildPlaceQueries(place)).toEqual(first)
    expect(new Set(first).size).toBe(first.length)
    expect(first.length).toBeLessThanOrEqual(5)
  })

  it('ignores blank and duplicate terms without adding broad generic fallbacks', () => {
    const queries = buildPlaceQueries({
      canonicalName: '格聂神山',
      aliases: ['', '格聂神山', '格聂山', '  '],
      adminPath: ['中国', '四川省', '理塘县', '理塘县'],
      nearbyLandmarks: ['', '格聂神山', '冷古寺'],
      roadRefs: ['', 'G318', 'G318'],
    })

    expect(queries).toEqual([
      '格聂神山 理塘县',
      '格聂山 理塘县',
      '格聂神山 冷古寺',
      '格聂神山 G318',
    ])
    expect(queries.join(' ')).not.toMatch(/高原风光|雪山草原|beautiful bridge/i)
  })

  it('reserves nearby and road queries before optional aliases consume the limit', () => {
    const queries = buildPlaceQueries({
      canonicalName: '测试地',
      aliases: ['别名一', '别名二', '别名三', '别名四'],
      adminPath: ['中国', '四川省', '理塘县'],
      nearbyLandmarks: ['附近地标'],
      roadRefs: ['G318'],
    })

    expect(queries).toEqual([
      '测试地 理塘县',
      '别名一 理塘县',
      '测试地 附近地标',
      '测试地 G318',
      '别名二 理塘县',
    ])
  })

  it('never emits a region-only query when a place has no aliases', () => {
    const place = {
      canonicalName: '无别名地标',
      aliases: [],
      adminPath: ['中国', '西藏自治区', '林芝市', '波密县'],
      nearbyLandmarks: ['然乌湖'],
      roadRefs: ['G318'],
    }
    const queries = buildPlaceQueries(place)

    expect(queries).toEqual([
      '无别名地标 林芝市',
      '无别名地标 波密县',
      '无别名地标 然乌湖',
      '无别名地标 G318',
    ])
    expect(queries.every((query) => query.includes(place.canonicalName))).toBe(true)
  })

  it('keeps query invariants for every benchmark place', () => {
    for (const place of BENCHMARK_PLACES) {
      const queries = buildPlaceQueries(place)
      expect(queries.length).toBeGreaterThan(0)
      expect(queries.length).toBeLessThanOrEqual(5)
      expect(new Set(queries).size).toBe(queries.length)
      expect(queries.every((query) => query.includes(place.canonicalName) || place.aliases.some((alias) => query.includes(alias)))).toBe(true)
      expect(queries.join(' ')).not.toMatch(/高原风光|雪山草原|beautiful bridge/i)
    }
  })
})
