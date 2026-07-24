import { haversine } from './geo'

export function normalizePlaceName(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}·•・]+/gu, '')
}

export function isValidPlaceCoordinate(place) {
  return (
    Number.isFinite(place?.lng) &&
    Number.isFinite(place?.lat) &&
    place.lng >= -180 &&
    place.lng <= 180 &&
    place.lat >= -90 &&
    place.lat <= 90
  )
}

export function placeDistance(a, b) {
  if (!isValidPlaceCoordinate(a) || !isValidPlaceCoordinate(b)) return Number.POSITIVE_INFINITY
  return haversine([a.lng, a.lat], [b.lng, b.lat])
}

export function samePlace(a, b, { sameNameMeters = 1000, sameCoordinateMeters = 50 } = {}) {
  if (!a || !b) return false
  const hasPlaceId = (value) => typeof value === 'string' && value.trim() !== ''
  if (hasPlaceId(a.placeId) && hasPlaceId(b.placeId) && a.placeId === b.placeId) return true

  const distance = placeDistance(a, b)
  if (!Number.isFinite(distance)) return false

  const normalizedAName = normalizePlaceName(a.name)
  const normalizedBName = normalizePlaceName(b.name)
  const sameNameEnabled = Number.isFinite(sameNameMeters) && sameNameMeters >= 0
  const sameCoordinateEnabled =
    Number.isFinite(sameCoordinateMeters) && sameCoordinateMeters >= 0

  return (
    (sameNameEnabled &&
      normalizedAName &&
      normalizedAName === normalizedBName &&
      distance <= sameNameMeters) ||
    (sameCoordinateEnabled && distance <= sameCoordinateMeters)
  )
}
