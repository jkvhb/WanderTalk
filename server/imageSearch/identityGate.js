const TEXT_FIELDS = ['title', 'description', 'publisher']
const GENERIC_CLASS_TERMS = new Set([
  'bridge', '桥', 'snowmountain', '雪山', 'lake', '湖泊', 'temple', '寺庙', 'plateau', '高原',
  'museum', '博物馆',
])
const SAFE_NAME_SUFFIXES = [
  '景区', '风景区', '实景', '照片', '图片', '航拍', '夜景', '风光', '游记', '攻略',
]
const SAFE_NAME_PREFIXES = ['航拍', '实拍', '探访', '走进']
const BROAD_ADMIN_TERMS = new Set([
  '中国', '中华人民共和国', 'china', 'peoplesrepublicofchina', 'prc',
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
  const escaped = roadRef.trim().normalize('NFKC').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'iu').test(text.normalize('NFKC'))
}

function fieldTokens(field) {
  return field.split(/[\p{P}\p{S}\s]+/u).map(normalizeText).filter(Boolean)
}

function hasOnlySafeSuffixes(value) {
  const suffixes = SAFE_NAME_SUFFIXES.map(normalizeText).sort((first, second) => second.length - first.length)
  let remaining = value
  while (remaining) {
    const suffix = suffixes.find((candidate) => remaining.startsWith(candidate))
    if (!suffix) return false
    remaining = remaining.slice(suffix.length)
  }
  return true
}

function isAcceptedCjkPhrase(phrase, normalizedName) {
  const candidates = [phrase]
  for (const prefix of SAFE_NAME_PREFIXES.map(normalizeText)) {
    if (phrase.startsWith(prefix)) candidates.push(phrase.slice(prefix.length))
  }

  return candidates.some((candidate) => candidate.startsWith(normalizedName)
    && hasOnlySafeSuffixes(candidate.slice(normalizedName.length)))
}

function containsCjkName(fields, name) {
  const normalizedName = normalizeText(name)

  return fields.some((field) => {
    const tokens = fieldTokens(field)
    return tokens.some((_, start) => {
      let phrase = ''
      for (let end = start; end < tokens.length; end += 1) {
        phrase += tokens[end]
        if (isAcceptedCjkPhrase(phrase, normalizedName)) return true
      }
      return false
    })
  })
}

function containsAsciiName(fields, name) {
  const parts = name
    .normalize('NFKC')
    .trim()
    .split(/[\p{P}\p{S}\s]+/u)
    .filter(Boolean)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (parts.length === 0) return false

  const phrase = parts.join('[\\p{P}\\p{S}\\s]+')
  const pattern = new RegExp(`(?:^|[^a-z0-9])${phrase}(?=$|[^a-z0-9])`, 'iu')
  return fields.some((field) => pattern.test(field.normalize('NFKC')))
}

function hasNameEvidence(place, fields) {
  const canonicalName = place?.canonicalName
  const normalizedCanonical = normalizeText(canonicalName)
  if (normalizedCanonical
    && !GENERIC_CLASS_TERMS.has(normalizedCanonical)
    && (/[a-z]/iu.test(canonicalName)
      ? containsAsciiName(fields, canonicalName)
      : containsCjkName(fields, canonicalName))) {
    return canonicalName
  }

  return stringList(place?.aliases).find((alias) => {
    const normalizedAlias = normalizeText(alias)
    if (!normalizedAlias || GENERIC_CLASS_TERMS.has(normalizedAlias)) return false

    return /[a-z]/iu.test(alias)
      ? containsAsciiName(fields, alias)
      : containsCjkName(fields, alias)
  })
}

function isBroadAdminTerm(term) {
  const normalized = normalizeText(term)
  if (!normalized) return true
  if (BROAD_ADMIN_TERMS.has(normalized)) return true
  return /(?:省|自治区|自治州)$/u.test(term.trim())
    || /(?:province|autonomousregion|autonomousprefecture|country|nation|state)$/iu.test(normalized)
}

function isNamedLocalLevel(term) {
  const trimmed = term.trim()
  const normalized = normalizeText(trimmed)
  return /(?:市|县|区|镇|乡|村)$/u.test(trimmed)
    || /(?:city|county|district|town|township|village)$/iu.test(normalized)
}

function hasContextEvidence(place, text) {
  const localAdminTerms = stringList(place?.adminPath).filter((term) => !isBroadAdminTerm(term))

  return [
    ...localAdminTerms,
    ...stringList(place?.nearbyLandmarks),
  ].some((term) => containsTerm(text, term))
    || stringList(place?.roadRefs).some((roadRef) => containsRoadRef(text, roadRef))
}

function withoutConfiguredNames(place, fields) {
  const variants = [place?.canonicalName, ...stringList(place?.aliases)]
    .map(normalizeText)
    .filter(Boolean)
    .filter((variant, index, all) => all.indexOf(variant) === index)
    .sort((first, second) => second.length - first.length)

  return fields.map((field) => variants.reduce(
    (remaining, variant) => remaining.replaceAll(variant, ''),
    normalizeText(field),
  )).join(' ')
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

  const matchedName = hasNameEvidence(place, fields)
  const textWithoutName = withoutConfiguredNames(place, fields)
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
  if (!canonicalName || GENERIC_CLASS_TERMS.has(normalizeText(canonicalName))) return []

  const preciseAdminTerms = stringList(place?.adminPath).filter((term) => !isBroadAdminTerm(term))
  const preferredRegions = preciseAdminTerms.some(isNamedLocalLevel)
    ? preciseAdminTerms.filter(isNamedLocalLevel)
    : preciseAdminTerms
  const regions = preferredRegions.reduce((result, term) => {
    const trimmed = term.trim()
    const normalized = normalizeText(trimmed)
    if (!result.some((region) => normalizeText(region) === normalized)) {
      result.push(trimmed)
    }
    return result
  }, []).slice(-2)
  const configuredAliases = stringList(place?.aliases)
  const aliases = configuredAliases.filter((alias, index, all) => {
    const normalized = normalizeText(alias.trim())
    return normalized
      && normalized !== normalizeText(canonicalName)
      && !GENERIC_CLASS_TERMS.has(normalized)
      && all.findIndex((item) => normalizeText(item.trim()) === normalized) === index
  })
  const nearby = firstDistinct(place?.nearbyLandmarks, [canonicalName, ...configuredAliases])
  const roadRef = firstDistinct(place?.roadRefs)
  const primaryRegion = regions[0]
  const canonicalRegionQueries = regions.map((region) => queryFrom(canonicalName, region))
  const proposed = [
    ...canonicalRegionQueries,
    ...(aliases[0] && primaryRegion ? [queryFrom(aliases[0], primaryRegion)] : []),
    ...(nearby ? [queryFrom(canonicalName, nearby)] : []),
    ...(roadRef ? [queryFrom(canonicalName, roadRef)] : []),
    ...(primaryRegion ? aliases.slice(1).map((alias) => queryFrom(alias, primaryRegion)) : []),
  ]
  const seen = new Set()
  const bareTerms = new Set([
    canonicalName,
    ...aliases,
    ...regions,
    nearby,
    roadRef,
  ].map(normalizeText).filter(Boolean))

  return proposed.filter((query) => {
    const normalized = normalizeText(query)
    if (!query || bareTerms.has(normalized) || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  }).slice(0, 5)
}
