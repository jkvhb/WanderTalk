import { preset318 } from '../data/preset318'

export const FIXED_318_PRESET_ID = 'fixed-318'
export const FIXED_318_ROUTE_DATA_VERSION = '2026-08-02-v1'

const ANCHOR_NAMES = [
  '成都',
  '康定',
  '折多山垭口',
  '理塘',
  '巴塘',
  '芒康',
  '东达山',
  '左贡',
  '拉萨',
]

function cloneData(value) {
  if (Array.isArray(value)) return value.map(cloneData)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneData(entry)]),
  )
}

const canonicalPoints = preset318.days.flatMap((day) => day.waypoints)
const canonicalById = new Map(canonicalPoints.map((point) => [point.placeId, point]))
const canonicalByName = new Map()
for (const point of canonicalPoints) {
  if (!canonicalByName.has(point.name)) canonicalByName.set(point.name, point)
}
const LEGACY_NAME_TO_PLACE_ID = new Map([
  // 旧路书把不可直接驾车到达的自然山体中心当作独立节点，导致高德绕行数百公里。
  // 固定318主线把“海子山 + 姊妹湖”视为同一个G318观景区域。
  ['海子山', 'sister-lakes'],
])

function looksLikeLegacyFixed318(plan) {
  if (!plan || typeof plan !== 'object' || !String(plan.name || '').includes('318')) return false
  const names = new Set(
    (plan.days || []).flatMap((day) => (day?.waypoints || []).map((point) => point?.name)),
  )
  return ANCHOR_NAMES.filter((name) => names.has(name)).length >= 6
}

function coordinateChanged(point, canonical) {
  return (
    !Number.isFinite(point?.lng) ||
    !Number.isFinite(point?.lat) ||
    Math.abs(point.lng - canonical.lng) > 1e-7 ||
    Math.abs(point.lat - canonical.lat) > 1e-7
  )
}

function joinUniqueText(first, second) {
  const parts = [first, second]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
  return [...new Set(parts)].join('\n\n')
}

function mergeSamePlace(first, second, canonical) {
  return {
    ...first,
    ...second,
    placeId: canonical.placeId,
    name: canonical.name,
    lng: canonical.lng,
    lat: canonical.lat,
    ...(canonical.altitude == null ? {} : { altitude: canonical.altitude }),
    narration: joinUniqueText(first.narration, second.narration),
    note: joinUniqueText(first.note, second.note),
    images: [...new Set([
      ...(Array.isArray(first.images) ? first.images : []),
      ...(Array.isArray(second.images) ? second.images : []),
    ])],
    choreography: second.choreography ?? first.choreography ?? null,
    source: cloneData(canonical.source),
  }
}

export function migrateFixed318Plan(plan) {
  if (
    !looksLikeLegacyFixed318(plan) ||
    (
      plan.presetId === FIXED_318_PRESET_ID &&
      plan.routeDataVersion === FIXED_318_ROUTE_DATA_VERSION
    )
  ) {
    return { plan, migrated: false, changedDays: [] }
  }

  const migrated = cloneData(plan)
  const changedDays = []
  const usesCanonicalDayStructure = plan.presetId === FIXED_318_PRESET_ID
    && (plan.days || []).length === preset318.days.length
  for (const day of migrated.days || []) {
    let invalidatesSegments = false
    const normalizedPoints = []
    for (const point of day?.waypoints || []) {
      const aliasPlaceId = LEGACY_NAME_TO_PLACE_ID.get(point.name)
      const canonical =
        (point.placeId && canonicalById.get(point.placeId)) ||
        (aliasPlaceId && canonicalById.get(aliasPlaceId)) ||
        canonicalByName.get(point.name)
      if (canonical) {
        if (coordinateChanged(point, canonical) || point.name !== canonical.name) {
          invalidatesSegments = true
        }
        point.placeId = canonical.placeId
        point.name = canonical.name
        point.lng = canonical.lng
        point.lat = canonical.lat
        if (canonical.altitude != null) point.altitude = canonical.altitude
        point.source = cloneData(canonical.source)
        if (!Array.isArray(point.roles)) point.roles = cloneData(canonical.roles)
        if (point.narrate == null) point.narrate = canonical.narrate
        if (!point.routeType) point.routeType = canonical.routeType
      }

      const previous = normalizedPoints.at(-1)
      if (
        canonical &&
        previous?.placeId &&
        previous.placeId === point.placeId
      ) {
        normalizedPoints[normalizedPoints.length - 1] =
          mergeSamePlace(previous, point, canonical)
        invalidatesSegments = true
      } else {
        normalizedPoints.push(point)
      }
    }
    day.waypoints = normalizedPoints
    if (invalidatesSegments) {
      day.segments = null
      changedDays.push(day.dayNumber)
    }
  }

  if (usesCanonicalDayStructure) {
    for (const day of migrated.days) {
      const canonicalDay = preset318.days.find((candidate) => candidate.dayNumber === day.dayNumber)
      if (!canonicalDay) continue
      const existingById = new Map(day.waypoints.map((point) => [point.placeId, point]))
      const beforeIds = day.waypoints.map((point) => point.placeId)
      day.waypoints = canonicalDay.waypoints.map((canonical) => {
        const existing = existingById.get(canonical.placeId)
        if (existing) return existing
        return {
          ...cloneData(canonical),
          narration: '',
          note: '',
          images: [],
          choreography: null,
          audio: null,
        }
      })
      day.overnight = canonicalDay.overnight
      day.overnightPlaceId = canonicalDay.overnightPlaceId
      day.alternatives = cloneData(canonicalDay.alternatives || [])
      const afterIds = day.waypoints.map((point) => point.placeId)
      if (beforeIds.join('|') !== afterIds.join('|')) {
        day.segments = null
        if (!changedDays.includes(day.dayNumber)) changedDays.push(day.dayNumber)
      }
    }
  }
  migrated.presetId = FIXED_318_PRESET_ID
  migrated.routeDataVersion = FIXED_318_ROUTE_DATA_VERSION
  return { plan: migrated, migrated: true, changedDays }
}
