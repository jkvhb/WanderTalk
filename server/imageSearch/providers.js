import { searchCommonsImages } from '../commonsImages.js'

const PIXABAY_URL = 'https://pixabay.com/api/'
const OPENVERSE_URL = 'https://api.openverse.org/v1/images/'
const BRAVE_URL = 'https://api.search.brave.com/res/v1/images/search'
const MAPILLARY_URL = 'https://graph.mapillary.com/images'

function withSignal(options, signal) {
  return signal ? { ...options, signal } : options
}

function stringValue(value) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  return ''
}

function firstStringValue(...values) {
  return values.map(stringValue).find(Boolean) || ''
}

function tagValues(value) {
  if (Array.isArray(value)) return value.flatMap(tagValues)
  if (value && typeof value === 'object') return tagValues(value.name)
  const tag = stringValue(value)
  return tag ? [tag] : []
}

function normalizeTags(value) {
  return tagValues(value).join(', ')
}

function stripHtmlTags(value) {
  return stringValue(value).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

function isUsableId(value) {
  const id = stringValue(value)
  return Boolean(id) && !/^(undefined|null|nan)$/i.test(id)
}

function candidate(provider, values) {
  return {
    provider,
    id: stringValue(values.id),
    title: stringValue(values.title),
    description: stringValue(values.description),
    tags: normalizeTags(values.tags),
    sourcePage: stringValue(values.sourcePage),
    imageUrl: stringValue(values.imageUrl),
    author: stringValue(values.author),
    license: stringValue(values.license),
    licenseUrl: stringValue(values.licenseUrl),
    coordinates: values.coordinates || null,
    publisher: stringValue(values.publisher),
  }
}

function normalizeCandidates(provider, hits, mapHit) {
  if (!Array.isArray(hits)) return []
  return hits
    .filter((hit) => hit && typeof hit === 'object')
    .map((hit) => candidate(provider, mapHit(hit)))
    .filter((hit) => isUsableId(hit.id) && hit.imageUrl)
}

function dedupeCandidates(candidates) {
  const seen = new Set()
  return candidates.filter(({ id }) => {
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function elapsedSince(startedAt) {
  return Date.now() - startedAt
}

function upstreamError(provider, status) {
  const error = new Error(`${provider} request failed (${status})`)
  error.status = status
  return error
}

async function readJson(response, provider) {
  try {
    return await response.json()
  } catch (cause) {
    throw malformedJsonError(provider, cause)
  }
}

function malformedJsonError(provider, cause) {
  const error = new Error(`${provider} returned malformed JSON`)
  error.status = 502
  error.cause = cause
  return error
}

// searchCommonsImages catches json() rejections; this proxy keeps native Response behavior but preserves parse errors.
function preserveCommonsJsonErrors(fetchImpl) {
  return async (...args) => {
    const response = await fetchImpl(...args)
    if (!response?.ok || typeof response.json !== 'function') return response
    return new Proxy(response, {
      get(target, property) {
        if (property !== 'json') return Reflect.get(target, property, target)
        return () => ({
          catch: () => Promise.resolve()
            .then(() => target.json())
            .catch((cause) => { throw malformedJsonError('Commons', cause) }),
        })
      },
    })
  }
}

function validCoordinates(coordinates) {
  return coordinates
    && typeof coordinates === 'object'
    && !Array.isArray(coordinates)
    && Number.isFinite(coordinates.lng)
    && coordinates.lng >= -180
    && coordinates.lng <= 180
    && Number.isFinite(coordinates.lat)
    && coordinates.lat >= -90
    && coordinates.lat <= 90
}

function geometryCoordinates(geometry) {
  const values = geometry?.coordinates
  if (!Array.isArray(values) || values.length < 2) return null
  const [lng, lat] = values
  return validCoordinates({ lng, lat }) ? { lng, lat } : null
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

function mapillaryBboxes({ lng, lat }) {
  const south = clamp(lat - 0.01, -90, 90)
  const north = clamp(lat + 0.01, -90, 90)
  const west = lng - 0.01
  const east = lng + 0.01
  if (east > 180) {
    return [
      [west, south, 180, north],
      [-180, south, east - 360, north],
    ]
  }
  if (west < -180) {
    return [
      [-180, south, east, north],
      [west + 360, south, 180, north],
    ]
  }
  return [[west, south, east, north]]
}

export function createPixabayProvider({ apiKey, fetchImpl = fetch } = {}) {
  return {
    name: 'pixabay',
    async search({ query, signal }) {
      if (!apiKey) return { skipped: true, reason: 'missing-credentials' }
      const startedAt = Date.now()
      const url = new URL(PIXABAY_URL)
      url.searchParams.set('key', apiKey)
      url.searchParams.set('q', stringValue(query))
      url.searchParams.set('lang', 'zh')
      url.searchParams.set('image_type', 'photo')
      url.searchParams.set('orientation', 'horizontal')
      url.searchParams.set('per_page', '20')
      url.searchParams.set('safesearch', 'true')
      const response = signal
        ? await fetchImpl(url.toString(), { signal })
        : await fetchImpl(url.toString())
      if (!response.ok) throw upstreamError('Pixabay', response.status)
      const data = await readJson(response, 'Pixabay')
      return {
        candidates: normalizeCandidates('pixabay', data?.hits, (hit) => ({
          id: hit.id,
          tags: hit.tags,
          sourcePage: hit.pageURL,
          imageUrl: hit.largeImageURL || hit.webformatURL,
        })),
        elapsedMs: elapsedSince(startedAt),
      }
    },
  }
}

export function createCommonsProvider({ fetchImpl = fetch } = {}) {
  return {
    name: 'commons',
    async search({ query, signal }) {
      const startedAt = Date.now()
      const fetchWithSignal = (url, options = {}) => fetchImpl(url, withSignal(options, signal))
      const hits = await searchCommonsImages({ q: query }, preserveCommonsJsonErrors(fetchWithSignal))
      return {
        candidates: normalizeCandidates('commons', hits, (hit) => ({
          id: hit.id,
          title: hit.title,
          tags: hit.tags,
          sourcePage: hit.pageURL,
          imageUrl: hit.largeImageURL || hit.webformatURL,
          author: stripHtmlTags(hit.attribution?.author),
          license: hit.attribution?.license,
          licenseUrl: hit.attribution?.licenseUrl,
        })),
        elapsedMs: elapsedSince(startedAt),
      }
    },
  }
}

export function createOpenverseProvider({ fetchImpl = fetch } = {}) {
  return {
    name: 'openverse',
    async search({ query, signal }) {
      const startedAt = Date.now()
      const url = new URL(OPENVERSE_URL)
      url.searchParams.set('q', stringValue(query))
      url.searchParams.set('page_size', '20')
      const response = signal
        ? await fetchImpl(url.toString(), { signal })
        : await fetchImpl(url.toString())
      if (!response.ok) throw upstreamError('Openverse', response.status)
      const data = await readJson(response, 'Openverse')
      return {
        candidates: normalizeCandidates('openverse', data?.results, (hit) => ({
          id: hit.id,
          title: hit.title,
          description: hit.description,
          tags: hit.tags,
          sourcePage: hit.foreign_landing_url,
          imageUrl: hit.thumbnail || hit.url,
          author: hit.creator,
          license: hit.license,
          licenseUrl: hit.license_url,
          publisher: hit.source || hit.provider,
        })),
        elapsedMs: elapsedSince(startedAt),
      }
    },
  }
}

export function createBraveProvider({ apiKey, fetchImpl = fetch } = {}) {
  return {
    name: 'brave',
    async search({ query, signal }) {
      if (!apiKey) return { skipped: true, reason: 'missing-credentials' }
      const startedAt = Date.now()
      const url = new URL(BRAVE_URL)
      url.searchParams.set('q', stringValue(query))
      url.searchParams.set('count', '20')
      url.searchParams.set('safesearch', 'strict')
      const response = await fetchImpl(url.toString(), withSignal({
        headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
      }, signal))
      if (!response.ok) throw upstreamError('Brave', response.status)
      const data = await readJson(response, 'Brave')
      return {
        candidates: normalizeCandidates('brave', data?.results, (hit) => ({
          id: firstStringValue(hit.id, hit.properties?.url, hit.thumbnail?.src, hit.url),
          title: hit.title,
          description: hit.description,
          tags: hit.tags,
          sourcePage: hit.url,
          imageUrl: hit.thumbnail?.src || hit.properties?.url,
          author: hit.author,
          license: typeof hit.license === 'object' ? hit.license.name : hit.license,
          licenseUrl: hit.license_url || (typeof hit.license === 'object' ? hit.license.url : ''),
          publisher: hit.source || hit.meta_url?.hostname || hit.meta_url?.netloc,
        })),
        elapsedMs: elapsedSince(startedAt),
      }
    },
  }
}

export function createMapillaryProvider({ accessToken, fetchImpl = fetch } = {}) {
  return {
    name: 'mapillary',
    async search({ place, signal }) {
      if (!accessToken) return { skipped: true, reason: 'missing-credentials' }
      if (!validCoordinates(place?.coordinates)) return { skipped: true, reason: 'missing-coordinates' }
      const startedAt = Date.now()
      const responses = await Promise.all(mapillaryBboxes(place.coordinates).map(async (bbox) => {
        const url = new URL(MAPILLARY_URL)
        url.searchParams.set('bbox', bbox.join(','))
        url.searchParams.set('limit', '20')
        url.searchParams.set('fields', 'id,thumb_2048_url,computed_geometry,captured_at')
        let response
        try {
          response = await fetchImpl(url.toString(), withSignal({
            headers: { Authorization: `OAuth ${accessToken}` },
          }, signal))
        } catch {
          throw upstreamError('Mapillary', 502)
        }
        if (!response.ok) throw upstreamError('Mapillary', response.status)
        return readJson(response, 'Mapillary')
      }))
      const hits = responses.flatMap((data) => Array.isArray(data?.data) ? data.data : [])
      return {
        candidates: dedupeCandidates(normalizeCandidates('mapillary', hits, (hit) => ({
          id: hit.id,
          description: hit.captured_at === undefined || hit.captured_at === null
            ? ''
            : `captured_at: ${stringValue(hit.captured_at)}`,
          sourcePage: hit.id === undefined || hit.id === null
            ? ''
            : `https://www.mapillary.com/app/?pKey=${encodeURIComponent(String(hit.id))}`,
          imageUrl: hit.thumb_2048_url,
          coordinates: geometryCoordinates(hit.computed_geometry),
          publisher: 'Mapillary',
        }))),
        elapsedMs: elapsedSince(startedAt),
      }
    },
  }
}
