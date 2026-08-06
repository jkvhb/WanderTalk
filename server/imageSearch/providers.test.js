import { describe, expect, it, vi } from 'vitest'
import {
  createBraveProvider,
  createCommonsProvider,
  createMapillaryProvider,
  createOpenverseProvider,
  createPixabayProvider,
} from './providers'

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
        source: 'smithsonian',
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
            Artist: { value: 'Commons author' },
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
      imageUrl: 'https://upload.wikimedia.org/mountain.jpg', author: 'Commons author',
      license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      coordinates: null, publisher: '',
    })
    expectCandidateContract(pixabay.candidates[0])
    expectCandidateContract(commons.candidates[0])
    const pixabayUrl = new URL(pixabayFetch.mock.calls[0][0])
    expect(pixabayUrl.searchParams.get('q')).toBe('unique-pixabay-provider-query')
    expect(pixabayUrl.searchParams.get('lang')).toBe('zh')
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
      id: 'brave-1',
      title: 'Published title',
      description: 'Published description',
      url: 'https://publisher.example/articles/place',
      thumbnail: { src: 'https://img.example/thumb.jpg' },
      source: 'Publisher Name',
      meta_url: { hostname: 'publisher.example' },
    }] }))

    const result = await createBraveProvider({ apiKey: 'brave-key', fetchImpl }).search({
      query: '桥 & 山', place: { canonicalName: 'Must not leak' },
    })

    expect(result.candidates[0]).toMatchObject({
      provider: 'brave', id: 'brave-1', title: 'Published title',
      description: 'Published description', sourcePage: 'https://publisher.example/articles/place',
      imageUrl: 'https://img.example/thumb.jpg', license: '', licenseUrl: '',
      publisher: 'Publisher Name', coordinates: null,
    })
    expectCandidateContract(result.candidates[0])
    const [url, options] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.search.brave.com/res/v1/images/search?q=%E6%A1%A5+%26+%E5%B1%B1&count=20&safesearch=strict')
    expect(options.headers).toEqual({ Accept: 'application/json', 'X-Subscription-Token': 'brave-key' })
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
    const requestUrl = new URL(fetchImpl.mock.calls[0][0])
    expect(requestUrl.origin + requestUrl.pathname).toBe('https://graph.mapillary.com/images')
    expect(requestUrl.searchParams.get('bbox')).toBe('101.53999999999999,30.029999999999998,101.56,30.05')
    expect(requestUrl.searchParams.get('limit')).toBe('20')
    expect(requestUrl.searchParams.get('fields')).toBe('id,thumb_2048_url,computed_geometry,captured_at')
    expect(requestUrl.searchParams.get('access_token')).toBe('map-token')
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
    ['openverse', 429, () => createOpenverseProvider({ fetchImpl: vi.fn(async () => jsonResponse({}, { ok: false, status: 429 })) })],
    ['brave', 500, () => createBraveProvider({ apiKey: 'key', fetchImpl: vi.fn(async () => jsonResponse({}, { ok: false, status: 500 })) })],
  ])('attaches the upstream status to %s errors', async (_name, status, makeProvider) => {
    await expect(makeProvider().search({ query: 'x', place: {} })).rejects.toMatchObject({ status })
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

  it('turns malformed upstream JSON into a readable error', async () => {
    const provider = createOpenverseProvider({
      fetchImpl: vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad JSON') } })),
    })
    await expect(provider.search({ query: 'x', place: {} })).rejects.toThrow(/openverse.*json/i)
  })

  it.each([
    ['pixabay', () => createPixabayProvider({
      apiKey: 'key',
      fetchImpl: vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad JSON') } })),
    })],
    ['commons', () => createCommonsProvider({
      fetchImpl: vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad JSON') } })),
    })],
  ])('does not let the wrapped %s source hide malformed JSON', async (name, makeProvider) => {
    await expect(makeProvider().search({ query: `malformed-${name}`, place: {} }))
      .rejects.toThrow(new RegExp(`${name}.*json`, 'i'))
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
})
