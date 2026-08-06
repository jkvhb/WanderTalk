import { describe, expect, it, vi } from 'vitest'
import {
  createBraveProvider,
  createCommonsProvider,
  createMapillaryProvider,
  createOpenverseProvider,
  createPixabayProvider,
} from './providers'
import { clearSearchCache, searchImages } from '../images'

const CANDIDATE_KEYS = [
  'author',
  'coordinates',
  'description',
  'id',
  'imageUrl',
  'license',
  'licenseUrl',
  'provider',
  'publisher',
  'sourcePage',
  'tags',
  'title',
]

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

function expectCandidateContract(candidate) {
  expect(Object.keys(candidate).sort()).toEqual(CANDIDATE_KEYS)
}

describe('benchmark image search providers', () => {
  it('normalizes Openverse source, license, author, and mixed tag values', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      results: [{
        id: 42,
        title: 'Stone bridge',
        description: 'A bridge over a river',
        tags: [{ name: 'bridge' }, { name: ' river ' }, 'historic'],
        foreign_landing_url: 'https://museum.example/bridge',
        thumbnail: 'https://images.example/bridge-thumb.jpg',
        url: 'https://images.example/bridge.jpg',
        creator: 'A. Photographer',
        license: 'cc-by',
        license_url: 'https://creativecommons.org/licenses/by/4.0/',
        provider: 'smithsonian',
      }],
    }))

    const provider = createOpenverseProvider({ fetchImpl })
    const result = await provider.search({ query: '石桥', place: { canonicalName: 'Secret target' } })

    expect(provider.name).toBe('openverse')
    expect(result.candidates).toEqual([{
      provider: 'openverse',
      id: '42',
      title: 'Stone bridge',
      description: 'A bridge over a river',
      tags: 'bridge, river, historic',
      sourcePage: 'https://museum.example/bridge',
      imageUrl: 'https://images.example/bridge-thumb.jpg',
      author: 'A. Photographer',
      license: 'cc-by',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      coordinates: null,
      publisher: 'smithsonian',
    }])
    expect(result.elapsedMs).toEqual(expect.any(Number))
    expect(fetchImpl).toHaveBeenCalledWith('https://api.openverse.org/v1/images/?q=%E7%9F%B3%E6%A1%A5&page_size=20')
  })

  it('normalizes Pixabay and Commons results into the same exact candidate keys', async () => {
    const pixabayFetch = vi.fn(async () => jsonResponse({ hits: [{
      id: 7,
      tags: [' mountain ', { name: 'snow' }],
      pageURL: 'https://pixabay.com/photos/7',
      largeImageURL: 'https://cdn.pixabay.com/photo/7.jpg',
    }] }))
    const commonsFetch = vi.fn(async () => jsonResponse({ query: { pages: {
      8: {
        pageid: 8,
        title: 'File:Mountain.jpg',
        imageinfo: [{
          thumburl: 'https://upload.wikimedia.org/mountain.jpg',
          descriptionurl: 'https://commons.wikimedia.org/wiki/File:Mountain.jpg',
          extmetadata: {
            Artist: { value: '<a href="https://author.example">Commons <b>author</b></a> &amp; Co' },
            LicenseShortName: { value: 'CC BY-SA 4.0' },
            LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' },
          },
        }],
      },
    } } }))

    const pixabay = await createPixabayProvider({ apiKey: 'pix-key', fetchImpl: pixabayFetch })
      .search({ query: 'unique-pixabay-provider-query', place: {} })
    const commons = await createCommonsProvider({ fetchImpl: commonsFetch })
      .search({ query: 'mountain', place: {} })

    expect(pixabay.candidates[0]).toMatchObject({
      provider: 'pixabay', id: '7', title: '', description: '', tags: 'mountain, snow',
      sourcePage: 'https://pixabay.com/photos/7', imageUrl: 'https://cdn.pixabay.com/photo/7.jpg',
      author: '', license: '', licenseUrl: '', coordinates: null, publisher: '',
    })
    expect(commons.candidates[0]).toMatchObject({
      provider: 'commons', id: '8', title: 'Mountain.jpg', tags: 'Mountain.jpg',
      sourcePage: 'https://commons.wikimedia.org/wiki/File:Mountain.jpg',
      imageUrl: 'https://upload.wikimedia.org/mountain.jpg', author: 'Commons author &amp; Co',
      license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      coordinates: null, publisher: '',
    })
    expectCandidateContract(pixabay.candidates[0])
    expectCandidateContract(commons.candidates[0])
    const pixabayUrl = new URL(pixabayFetch.mock.calls[0][0])
    expect(pixabayUrl.searchParams.get('q')).toBe('unique-pixabay-provider-query')
    expect(pixabayUrl.searchParams.get('lang')).toBe('zh')
    expect(pixabayUrl.searchParams.get('key')).toBe('pix-key')
    expect(pixabayUrl.searchParams.get('image_type')).toBe('photo')
    expect(pixabayUrl.searchParams.get('orientation')).toBe('horizontal')
    expect(pixabayUrl.searchParams.get('per_page')).toBe('20')
    expect(pixabayUrl.searchParams.get('safesearch')).toBe('true')
  })

  it.each([
    ['missing', {}],
    ['null', { pageid: null }],
    ['NaN', { pageid: Number.NaN }],
  ])('drops Commons results with %s sentinel page ids', async (_label, pageIdentity) => {
    const fetchImpl = vi.fn(async () => jsonResponse({ query: { pages: {
      malformed: {
        ...pageIdentity,
        title: 'File:Malformed.jpg',
        imageinfo: [{ url: 'https://upload.wikimedia.org/malformed.jpg' }],
      },
    } } }))

    const result = await createCommonsProvider({ fetchImpl })
      .search({ query: 'malformed-page-id', place: {} })

    expect(result.candidates).toEqual([])
  })

  it('skips providers with missing credentials without fetching', async () => {
    const braveFetch = vi.fn()
    const mapillaryFetch = vi.fn()

    await expect(createBraveProvider({ apiKey: '', fetchImpl: braveFetch }).search({ query: 'x', place: {} }))
      .resolves.toEqual({ skipped: true, reason: 'missing-credentials' })
    await expect(createMapillaryProvider({ accessToken: '', fetchImpl: mapillaryFetch }).search({
      query: 'x', place: { coordinates: { lng: 1, lat: 2 } },
    })).resolves.toEqual({ skipped: true, reason: 'missing-credentials' })
    expect(braveFetch).not.toHaveBeenCalled()
    expect(mapillaryFetch).not.toHaveBeenCalled()
  })

  it('preserves Brave source evidence and headers without fabricating a license', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ results: [{
      title: 'Published title',
      description: 'Published description',
      url: 'https://publisher.example/articles/place',
      thumbnail: { src: 'https://img.example/thumb.jpg' },
      properties: { url: 'https://img.example/original.jpg' },
      source: 'Publisher Name',
      meta_url: { hostname: 'publisher.example' },
    }] }))

    const result = await createBraveProvider({ apiKey: 'brave-key', fetchImpl }).search({
      query: '桥 & 山', place: { canonicalName: 'Must not leak' },
    })

    expect(result.candidates[0]).toMatchObject({
      provider: 'brave', id: 'https://img.example/original.jpg', title: 'Published title',
      description: 'Published description', sourcePage: 'https://publisher.example/articles/place',
      imageUrl: 'https://img.example/thumb.jpg', license: '', licenseUrl: '',
      author: '', tags: '', publisher: 'Publisher Name', coordinates: null,
    })
    expectCandidateContract(result.candidates[0])
    const [url, options] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.search.brave.com/res/v1/images/search?q=%E6%A1%A5+%26+%E5%B1%B1&count=20&safesearch=strict')
    expect(options.headers).toEqual({ Accept: 'application/json', 'X-Subscription-Token': 'brave-key' })
  })

  it('retains realistic Brave hits without ids using ordered provider-data fallbacks', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ results: [
      {
        title: 'Source page fallback',
        url: 'https://publisher.example/page',
        properties: { url: 'https://images.example/full.jpg' },
        thumbnail: { src: 'https://images.example/thumb.jpg' },
      },
      {
        title: 'Image URL fallback',
        properties: { url: 'https://images.example/property-only.jpg' },
      },
      {
        title: 'Thumbnail fallback',
        thumbnail: { src: 'https://images.example/thumbnail-only.jpg' },
      },
      {
        id: '   ',
        title: 'Unusable id falls through',
        url: 'https://publisher.example/blank-id',
        thumbnail: { src: 'https://images.example/blank-id.jpg' },
      },
    ] }))

    const result = await createBraveProvider({ apiKey: 'key', fetchImpl })
      .search({ query: 'provider-only-id', place: { canonicalName: 'Never use this' } })

    expect(result.candidates.map(({ id }) => id)).toEqual([
      'https://images.example/full.jpg',
      'https://images.example/property-only.jpg',
      'https://images.example/thumbnail-only.jpg',
      'https://images.example/blank-id.jpg',
    ])
    expect(JSON.stringify(result.candidates)).not.toContain('Never use this')
  })

  it('keeps distinct Brave images from the same source page distinct', async () => {
    const sourcePage = 'https://publisher.example/gallery'
    const fetchImpl = vi.fn(async () => jsonResponse({ results: [
      { url: sourcePage, properties: { url: 'https://images.example/one.jpg' } },
      { url: sourcePage, properties: { url: 'https://images.example/two.jpg' } },
    ] }))

    const result = await createBraveProvider({ apiKey: 'key', fetchImpl })
      .search({ query: 'gallery', place: {} })

    expect(result.candidates.map(({ id }) => id)).toEqual([
      'https://images.example/one.jpg',
      'https://images.example/two.jpg',
    ])
    expect(result.candidates.map(({ sourcePage: page }) => page)).toEqual([sourcePage, sourcePage])
  })

  it('maps Mapillary API coordinates and capture time without copying target evidence', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [{
      id: 9001,
      thumb_2048_url: 'https://scontent.example/mapillary.jpg',
      computed_geometry: { type: 'Point', coordinates: [101.5468, 30.0381] },
      captured_at: 1700000000000,
    }] }))
    const place = { canonicalName: 'Target Name', aliases: ['Alias'], coordinates: { lng: 101.55, lat: 30.04 } }

    const result = await createMapillaryProvider({ accessToken: 'map-token', fetchImpl })
      .search({ query: 'requested target query', place })

    expect(result.candidates[0]).toEqual({
      provider: 'mapillary', id: '9001', title: '', description: 'captured_at: 1700000000000', tags: '',
      sourcePage: 'https://www.mapillary.com/app/?pKey=9001',
      imageUrl: 'https://scontent.example/mapillary.jpg', author: '', license: '', licenseUrl: '',
      coordinates: { lng: 101.5468, lat: 30.0381 }, publisher: 'Mapillary',
    })
    expect(JSON.stringify(result.candidates[0])).not.toMatch(/Target Name|Alias|requested target query/)
    const [rawRequestUrl, options] = fetchImpl.mock.calls[0]
    const requestUrl = new URL(rawRequestUrl)
    expect(requestUrl.origin + requestUrl.pathname).toBe('https://graph.mapillary.com/images')
    expect(requestUrl.searchParams.get('bbox')).toBe('101.53999999999999,30.029999999999998,101.56,30.05')
    expect(requestUrl.searchParams.get('limit')).toBe('20')
    expect(requestUrl.searchParams.get('fields')).toBe('id,thumb_2048_url,computed_geometry,captured_at')
    expect(requestUrl.searchParams.has('access_token')).toBe(false)
    expect(rawRequestUrl).not.toContain('map-token')
    expect(options.headers).toEqual({ Authorization: 'OAuth map-token' })
  })

  it.each(['transport', 'upstream'])('never exposes the Mapillary token in %s errors or URLs', async (failure) => {
    const accessToken = 'secret-mapillary-token'
    let requestedUrl = ''
    let requestedOptions
    const fetchImpl = vi.fn(async (url, options) => {
      requestedUrl = url
      requestedOptions = options
      if (failure === 'transport') throw new Error(`transport failed for ${url}`)
      return jsonResponse({}, { ok: false, status: 503 })
    })

    let caught
    try {
      await createMapillaryProvider({ accessToken, fetchImpl }).search({
        query: 'x', place: { coordinates: { lng: 1, lat: 2 } },
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect(String(caught)).not.toContain(accessToken)
    expect(requestedUrl).not.toContain(accessToken)
    expect(new URL(requestedUrl).searchParams.has('access_token')).toBe(false)
    expect(requestedOptions.headers).toEqual({ Authorization: `OAuth ${accessToken}` })
    if (failure === 'upstream') expect(caught.status).toBe(503)
  })

  it.each([
    [179.999, 89.999],
    [-179.999, -89.999],
  ])('splits antimeridian bboxes and clamps polar latitude for %s,%s', async (lng, lat) => {
    let responseIndex = 0
    const fetchImpl = vi.fn(async () => {
      responseIndex += 1
      return jsonResponse({ data: [
        { id: 'duplicate', thumb_2048_url: 'https://images.example/duplicate.jpg' },
        { id: `unique-${responseIndex}`, thumb_2048_url: `https://images.example/${responseIndex}.jpg` },
      ] })
    })

    const result = await createMapillaryProvider({ accessToken: 'token', fetchImpl })
      .search({ query: 'x', place: { coordinates: { lng, lat } } })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    for (const [rawUrl, options] of fetchImpl.mock.calls) {
      const url = new URL(rawUrl)
      const [west, south, east, north] = url.searchParams.get('bbox').split(',').map(Number)
      expect(west).toBeGreaterThanOrEqual(-180)
      expect(east).toBeLessThanOrEqual(180)
      expect(west).toBeLessThanOrEqual(east)
      expect(south).toBeGreaterThanOrEqual(-90)
      expect(north).toBeLessThanOrEqual(90)
      expect(south).toBeLessThanOrEqual(north)
      expect(url.searchParams.has('access_token')).toBe(false)
      expect(options.headers).toEqual({ Authorization: 'OAuth token' })
    }
    expect(result.candidates.map(({ id }) => id).sort()).toEqual(['duplicate', 'unique-1', 'unique-2'])
  })

  it.each([
    null,
    undefined,
    { lng: Number.NaN, lat: 30 },
    { lng: 181, lat: 30 },
  ])('skips Mapillary when coordinates are missing or invalid: %j', async (coordinates) => {
    const fetchImpl = vi.fn()
    const result = await createMapillaryProvider({ accessToken: 'token', fetchImpl })
      .search({ query: 'x', place: { coordinates } })
    expect(result).toEqual({ skipped: true, reason: 'missing-coordinates' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each([
    ['pixabay', 429, () => createPixabayProvider({ apiKey: 'key', fetchImpl: vi.fn(async () => jsonResponse({}, { ok: false, status: 429 })) }), {}],
    ['commons', 502, () => createCommonsProvider({ fetchImpl: vi.fn(async () => jsonResponse({}, { ok: false, status: 500 })) }), {}],
    ['openverse', 429, () => createOpenverseProvider({ fetchImpl: vi.fn(async () => jsonResponse({}, { ok: false, status: 429 })) }), {}],
    ['brave', 500, () => createBraveProvider({ apiKey: 'key', fetchImpl: vi.fn(async () => jsonResponse({}, { ok: false, status: 500 })) }), {}],
    ['mapillary', 503, () => createMapillaryProvider({ accessToken: 'token', fetchImpl: vi.fn(async () => jsonResponse({}, { ok: false, status: 503 })) }), { coordinates: { lng: 1, lat: 2 } }],
  ])('attaches the upstream status to %s errors', async (_name, status, makeProvider, place) => {
    await expect(makeProvider().search({ query: 'x', place })).rejects.toMatchObject({ status })
  })

  it('drops malformed or incomplete hits and tolerates missing arrays', async () => {
    const openverse = createOpenverseProvider({ fetchImpl: vi.fn(async () => jsonResponse({
      results: [null, {}, { id: 'no-image' }, { url: 'https://img.example/no-id.jpg' },
        { id: 'ok', url: 'https://img.example/ok.jpg', tags: [{ nope: true }, ' clean '], title: null }],
    })) })
    const brave = createBraveProvider({ apiKey: 'key', fetchImpl: vi.fn(async () => jsonResponse({})) })

    const openverseResult = await openverse.search({ query: 'x', place: {} })
    const braveResult = await brave.search({ query: 'x', place: {} })

    expect(openverseResult.candidates).toHaveLength(1)
    expect(openverseResult.candidates[0]).toMatchObject({ id: 'ok', imageUrl: 'https://img.example/ok.jpg', tags: 'clean', title: '' })
    expect(braveResult.candidates).toEqual([])
  })

  it.each([
    ['openverse', () => createOpenverseProvider({
      fetchImpl: vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad JSON') } })),
    }), {}],
    ['brave', () => createBraveProvider({
      apiKey: 'key',
      fetchImpl: vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad JSON') } })),
    }), {}],
    ['mapillary', () => createMapillaryProvider({
      accessToken: 'token',
      fetchImpl: vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad JSON') } })),
    }), { coordinates: { lng: 1, lat: 2 } }],
  ])('turns malformed %s JSON into a readable 502 error', async (name, makeProvider, place) => {
    await expect(makeProvider().search({ query: 'x', place })).rejects.toMatchObject({
      status: 502,
      message: expect.stringMatching(new RegExp(`${name}.*json`, 'i')),
    })
  })

  it.each([
    ['pixabay', () => createPixabayProvider({
      apiKey: 'key',
      fetchImpl: vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad JSON') } })),
    })],
    ['commons', () => createCommonsProvider({
      fetchImpl: vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad JSON') } })),
    })],
  ])('does not let %s hide malformed JSON or its 502 status', async (name, makeProvider) => {
    await expect(makeProvider().search({ query: `malformed-${name}`, place: {} }))
      .rejects.toMatchObject({
        status: 502,
        message: expect.stringMatching(new RegExp(`${name}.*json`, 'i')),
      })
  })

  it('keeps the production Pixabay cache isolated from benchmark searches', async () => {
    clearSearchCache()
    const productionPrimeFetch = vi.fn(async () => jsonResponse({ hits: [{
      id: 'primed', webformatURL: 'https://images.example/primed.jpg',
    }] }))
    const benchmarkFetch = vi.fn(async () => jsonResponse({ hits: [{
      id: 'benchmark', webformatURL: 'https://images.example/benchmark.jpg',
    }] }))
    const productionAfterFetch = vi.fn(async () => jsonResponse({ hits: [{
      id: 'unexpected', webformatURL: 'https://images.example/unexpected.jpg',
    }] }))

    try {
      await searchImages({ apiKey: 'key', q: 'cache-isolation-query', lang: 'zh' }, productionPrimeFetch)
      const benchmarkResult = await createPixabayProvider({ apiKey: 'key', fetchImpl: benchmarkFetch })
        .search({ query: 'cache-isolation-query', place: {} })
      const productionResult = await searchImages(
        { apiKey: 'key', q: 'cache-isolation-query', lang: 'zh' },
        productionAfterFetch,
      )

      expect(benchmarkFetch).toHaveBeenCalledOnce()
      expect(benchmarkResult.candidates[0]).toMatchObject({
        id: 'benchmark', imageUrl: 'https://images.example/benchmark.jpg',
      })
      expect(productionAfterFetch).not.toHaveBeenCalled()
      expect(productionResult).toEqual([expect.objectContaining({ id: 'primed' })])
    } finally {
      clearSearchCache()
    }
  })

  it('preserves native Response JSON promises through the Commons compatibility wrapper', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ query: { pages: {
      77: {
        pageid: 77,
        title: 'File:Native.jpg',
        imageinfo: [{ url: 'https://upload.wikimedia.org/native.jpg' }],
      },
    } } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    const result = await createCommonsProvider({ fetchImpl }).search({ query: 'native-response', place: {} })

    expect(result.candidates).toEqual([expect.objectContaining({ id: '77', title: 'Native.jpg' })])
  })

  it('constructs every factory safely without arguments', async () => {
    expect([
      createPixabayProvider().name,
      createCommonsProvider().name,
      createOpenverseProvider().name,
      createBraveProvider().name,
      createMapillaryProvider().name,
    ]).toEqual(['pixabay', 'commons', 'openverse', 'brave', 'mapillary'])

    await expect(createPixabayProvider().search({ query: 'x', place: {} }))
      .resolves.toEqual({ skipped: true, reason: 'missing-credentials' })
    await expect(createBraveProvider().search({ query: 'x', place: {} }))
      .resolves.toEqual({ skipped: true, reason: 'missing-credentials' })
    await expect(createMapillaryProvider().search({ query: 'x', place: {} }))
      .resolves.toEqual({ skipped: true, reason: 'missing-credentials' })
  })

  it('uses the identical candidate key contract for every provider', async () => {
    const providers = [
      createPixabayProvider({ apiKey: 'key', fetchImpl: vi.fn(async () => jsonResponse({ hits: [{ id: 'p', webformatURL: 'https://p.example/x' }] })) }),
      createCommonsProvider({ fetchImpl: vi.fn(async () => jsonResponse({ query: { pages: { 2: { pageid: 2, imageinfo: [{ url: 'https://upload.wikimedia.org/x.jpg' }] } } } })) }),
      createOpenverseProvider({ fetchImpl: vi.fn(async () => jsonResponse({ results: [{ id: 'o', url: 'https://o.example/x' }] })) }),
      createBraveProvider({ apiKey: 'key', fetchImpl: vi.fn(async () => jsonResponse({ results: [{ id: 'b', properties: { url: 'https://b.example/x' } }] })) }),
      createMapillaryProvider({ accessToken: 'token', fetchImpl: vi.fn(async () => jsonResponse({ data: [{ id: 'm', thumb_2048_url: 'https://m.example/x' }] })) }),
    ]

    const results = await Promise.all(providers.map((provider) => provider.search({
      query: `contract-${provider.name}`,
      place: { coordinates: { lng: 1, lat: 2 } },
    })))
    for (const result of results) expectCandidateContract(result.candidates[0])
  })

  it('passes the benchmark AbortSignal through all five provider fetches', async () => {
    const controller = new AbortController()
    const pixabayFetch = vi.fn(async () => jsonResponse({ hits: [] }))
    const commonsFetch = vi.fn(async () => jsonResponse({ query: { pages: {} } }))
    const openverseFetch = vi.fn(async () => jsonResponse({ results: [] }))
    const braveFetch = vi.fn(async () => jsonResponse({ results: [] }))
    const mapillaryFetch = vi.fn(async () => jsonResponse({ data: [] }))
    const providers = [
      createPixabayProvider({ apiKey: 'key', fetchImpl: pixabayFetch }),
      createCommonsProvider({ fetchImpl: commonsFetch }),
      createOpenverseProvider({ fetchImpl: openverseFetch }),
      createBraveProvider({ apiKey: 'key', fetchImpl: braveFetch }),
      createMapillaryProvider({ accessToken: 'token', fetchImpl: mapillaryFetch }),
    ]

    await Promise.all(providers.map((provider) => provider.search({
      query: 'signal-test', place: { coordinates: { lng: 1, lat: 2 } }, signal: controller.signal,
    })))

    for (const fetchImpl of [pixabayFetch, commonsFetch, openverseFetch, braveFetch, mapillaryFetch]) {
      expect(fetchImpl.mock.calls[0][1]?.signal).toBe(controller.signal)
    }
  })

  it('Mapillary cacheKey depends on coordinate bbox semantics rather than query text', () => {
    const provider = createMapillaryProvider({ accessToken: 'token', fetchImpl: vi.fn() })
    const coordinates = { lng: 101.55, lat: 30.04 }

    const first = provider.cacheKey({ query: 'first query', place: { coordinates } })
    const second = provider.cacheKey({ query: 'different query', place: { coordinates: { ...coordinates } } })
    const elsewhere = provider.cacheKey({ query: 'first query', place: { coordinates: { lng: 101.56, lat: 30.04 } } })

    expect(first).toBe(second)
    expect(first).not.toBe(elsewhere)
    expect(first).not.toContain('query')
  })
})
