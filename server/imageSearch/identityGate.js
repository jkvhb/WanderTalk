const TEXT_FIELDS = ['title', 'description', 'sourcePage', 'publisher']
const GENERIC_CLASS_TERMS = new Set([
  'bridge', '桥', 'snowmountain', '雪山', 'lake', '湖泊', 'temple', '寺庙', 'plateau', '高原',
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

function candidateText(candidate) {
  if (candidate === null || typeof candidate !== 'object') return ''

  const tags = Array.isArray(candidate.tags)
    ? candidate.tags.map((tag) => (typeof tag === 'string' ? tag : tag?.name))
    : [candidate.tags]

  return [...TEXT_FIELDS.map((field) => candidate[field]), ...tags]
    .filter((value) => typeof value === 'string')
    .join(' ')
}

function containsTerm(text, term) {
  const normalizedTerm = normalizeText(term?.trim?.())
  return Boolean(normalizedTerm) && normalizeText(text).includes(normalizedTerm)
}

function hasNameEvidence(place, text) {
  return [place?.canonicalName, ...stringList(place?.aliases)].find((name) => {
    const normalizedName = normalizeText(name)
    return normalizedName && !GENERIC_CLASS_TERMS.has(normalizedName) && containsTerm(text, name)
  })
}

function hasContextEvidence(place, text) {
  return [
    ...stringList(place?.adminPath),
    ...stringList(place?.nearbyLandmarks),
    ...stringList(place?.roadRefs),
  ].some((term) => containsTerm(text, term))
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
  const text = candidateText(candidate)
  if (stringList(place?.negativeTerms).some((term) => containsTerm(text, term))) {
    return { status: 'rejected', reason: 'negative-evidence', evidence: [] }
  }

  const matchedName = hasNameEvidence(place, text)
  const textWithoutName = matchedName
    ? normalizeText(text).replaceAll(normalizeText(matchedName), '')
    : text
  const context = hasContextEvidence(place, textWithoutName)
  const closeCoordinates = validCoordinates(place?.coordinates)
    && validCoordinates(candidate?.coordinates)
    && distanceMetres(place.coordinates, candidate.coordinates) <= 1000

  if (place?.nodeType === 'road-node') {
    const roadRefs = stringList(place?.roadRefs)
    const everyRoadRef = roadRefs.length > 0 && roadRefs.every((roadRef) => containsTerm(text, roadRef))
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

  const region = [...stringList(place?.adminPath)]
    .reverse()
    .find((term) => /(?:县|市|区)$/u.test(term.trim()))
    ?.trim()
  const aliases = stringList(place?.aliases).filter((alias, index, all) => {
    const normalized = normalizeText(alias.trim())
    return normalized
      && normalized !== normalizeText(canonicalName)
      && all.findIndex((item) => normalizeText(item.trim()) === normalized) === index
  })
  const nearby = firstDistinct(place?.nearbyLandmarks, [canonicalName])
  const roadRef = firstDistinct(place?.roadRefs)
  const proposed = [
    queryFrom(canonicalName, region),
    ...aliases.map((alias) => queryFrom(alias, region)),
    queryFrom(canonicalName, nearby),
    queryFrom(canonicalName, roadRef),
  ]
  const seen = new Set()

  return proposed.filter((query) => {
    const normalized = normalizeText(query)
    if (!query || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  }).slice(0, 5)
}
