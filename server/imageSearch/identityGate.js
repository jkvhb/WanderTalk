const TEXT_FIELDS = ['title', 'description', 'publisher']
const GENERIC_CLASS_TERMS = new Set([
  'bridge', '桥', 'snowmountain', '雪山', 'lake', '湖泊', 'temple', '寺庙', 'plateau', '高原',
  'museum', '博物馆',
])

function normalizeText(value) {
  if (typeof value !== 'string') return ''

  let decoded = value
  try {
    decoded = decodeURIComponent(value)
  } catch {
    // Malformed percent-encoding is still usable as ordinary text.
  }

  return decoded
    .normalize('NFKC')
    .toLocaleLowerCase('und')
    .replace(/[\p{P}\p{S}\s]+/gu, '')
}

function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

function candidateTextFields(candidate) {
  if (candidate === null || typeof candidate !== 'object') return []

  const tags = Array.isArray(candidate.tags)
    ? candidate.tags.map((tag) => (typeof tag === 'string' ? tag : tag?.name))
    : [candidate.tags]

  return [...TEXT_FIELDS.map((field) => candidate[field]), ...tags]
    .filter((value) => typeof value === 'string')
}

function containsTerm(text, term) {
  const normalizedTerm = normalizeText(term?.trim?.())
  return Boolean(normalizedTerm) && normalizeText(text).includes(normalizedTerm)
}

function containsRoadRef(text, roadRef) {
  if (typeof roadRef !== 'string' || !roadRef.trim()) return false
  const escaped = roadRef.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'iu').test(text.normalize('NFKC'))
}

function hasNameEvidence(place, text, fields) {
  const canonicalName = place?.canonicalName
  const normalizedCanonical = normalizeText(canonicalName)
  if (normalizedCanonical
    && !GENERIC_CLASS_TERMS.has(normalizedCanonical)
    && containsTerm(text, canonicalName)) {
    return canonicalName
  }

  return stringList(place?.aliases).find((alias) => {
    const normalizedAlias = normalizeText(alias)
    if (!normalizedAlias || GENERIC_CLASS_TERMS.has(normalizedAlias)) return false

    return fields.some((field) => normalizeText(field) === normalizedAlias
      || field
        .split(/[\p{P}\p{S}\s]+/u)
        .some((token) => normalizeText(token) === normalizedAlias))
  })
}

function hasContextEvidence(place, text) {
  return [
    ...stringList(place?.adminPath),
    ...stringList(place?.nearbyLandmarks),
  ].some((term) => containsTerm(text, term))
    || stringList(place?.roadRefs).some((roadRef) => containsRoadRef(text, roadRef))
}

function validCoordinates(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Number.isFinite(value.lng)
    && Number.isFinite(value.lat)
    && value.lng >= -180
    && value.lng <= 180
    && value.lat >= -90
    && value.lat <= 90
}

function distanceMetres(first, second) {
  const radians = (degrees) => degrees * Math.PI / 180
  const latDelta = radians(second.lat - first.lat)
  const lngDelta = radians(second.lng - first.lng)
  const firstLat = radians(first.lat)
  const secondLat = radians(second.lat)
  const haversine = Math.sin(latDelta / 2) ** 2
    + Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(lngDelta / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

export function evaluatePlaceIdentity(place, candidate) {
  const fields = candidateTextFields(candidate)
  const text = fields.join(' ')
  if (stringList(place?.negativeTerms).some((term) => containsTerm(text, term))) {
    return { status: 'rejected', reason: 'negative-evidence', evidence: [] }
  }

  const matchedName = hasNameEvidence(place, text, fields)
  const textWithoutName = matchedName
    ? normalizeText(text).replaceAll(normalizeText(matchedName), '')
    : text
  const context = hasContextEvidence(place, textWithoutName)
  const closeCoordinates = validCoordinates(place?.coordinates)
    && validCoordinates(candidate?.coordinates)
    && distanceMetres(place.coordinates, candidate.coordinates) <= 1000

  if (place?.nodeType === 'road-node') {
    const roadRefs = stringList(place?.roadRefs)
    const everyRoadRef = roadRefs.length > 0 && roadRefs.every((roadRef) => containsRoadRef(text, roadRef))
    if (closeCoordinates && everyRoadRef) {
      return { status: 'exact', reason: 'geo-and-road-evidence', evidence: ['coordinates', 'roadRefs'] }
    }
    if (closeCoordinates) {
      return { status: 'needs_review', reason: 'close-coordinate-only', evidence: ['coordinates'] }
    }
    if (matchedName) {
      return { status: 'needs_review', reason: 'insufficient-independent-evidence', evidence: ['name'] }
    }
    return { status: 'rejected', reason: 'insufficient-identity-evidence', evidence: [] }
  }

  if (matchedName && context) {
    return { status: 'exact', reason: 'name-and-context-evidence', evidence: ['name', 'context'] }
  }

  if (matchedName) {
    return { status: 'needs_review', reason: 'insufficient-independent-evidence', evidence: ['name'] }
  }

  if (closeCoordinates) {
    return { status: 'needs_review', reason: 'close-coordinate-only', evidence: ['coordinates'] }
  }

  return { status: 'rejected', reason: 'insufficient-identity-evidence', evidence: [] }
}

function firstDistinct(values, excluded = []) {
  const excludedTerms = new Set(excluded.map(normalizeText).filter(Boolean))
  return stringList(values).find((value) => {
    const normalized = normalizeText(value.trim())
    return normalized && !excludedTerms.has(normalized)
  })?.trim()
}

function queryFrom(...terms) {
  const seen = new Set()
  return terms
    .filter((term) => typeof term === 'string' && term.trim())
    .map((term) => term.trim())
    .filter((term) => {
      const normalized = normalizeText(term)
      if (!normalized || seen.has(normalized)) return false
      seen.add(normalized)
      return true
    })
    .join(' ')
}

export function buildPlaceQueries(place) {
  const canonicalName = typeof place?.canonicalName === 'string' ? place.canonicalName.trim() : ''
  if (!canonicalName) return []

  const regions = stringList(place?.adminPath).reduce((result, term) => {
    const trimmed = term.trim()
    const normalized = normalizeText(trimmed)
    if (/(?:县|市|区)$/u.test(trimmed)
      && !/(?:省|自治区|自治州)$/u.test(trimmed)
      && !result.some((region) => normalizeText(region) === normalized)) {
      result.push(trimmed)
    }
    return result
  }, []).slice(-2)
  const aliases = stringList(place?.aliases).filter((alias, index, all) => {
    const normalized = normalizeText(alias.trim())
    return normalized
      && normalized !== normalizeText(canonicalName)
      && all.findIndex((item) => normalizeText(item.trim()) === normalized) === index
  })
  const nearby = firstDistinct(place?.nearbyLandmarks, [canonicalName])
  const roadRef = firstDistinct(place?.roadRefs)
  const primaryRegion = regions[0]
  const canonicalRegionQueries = regions.length > 0
    ? regions.map((region) => queryFrom(canonicalName, region))
    : [queryFrom(canonicalName)]
  const proposed = [
    ...canonicalRegionQueries,
    queryFrom(aliases[0], primaryRegion),
    queryFrom(canonicalName, nearby),
    queryFrom(canonicalName, roadRef),
    ...aliases.slice(1).map((alias) => queryFrom(alias, primaryRegion)),
  ]
  const seen = new Set()

  return proposed.filter((query) => {
    const normalized = normalizeText(query)
    if (!query || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  }).slice(0, 5)
}
