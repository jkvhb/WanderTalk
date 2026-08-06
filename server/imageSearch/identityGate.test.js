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

    for (const generic of ['bridge', '桥', 'snow mountain', '雪山', 'lake', '湖泊', 'temple', '寺庙', 'plateau', '高原']) {
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
})

describe('buildPlaceQueries', () => {
  it('builds deterministic, unique, identity-rich queries capped at five', () => {
    const place = placeById('jinsha-river-bridge-zhubalong')
    const first = buildPlaceQueries(place)

    expect(first).toEqual([
      '金沙江大桥（竹巴笼） 芒康县',
      '竹巴笼金沙江大桥 芒康县',
      '金沙江大桥 芒康县',
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
