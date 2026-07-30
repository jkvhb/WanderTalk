import { preset318 } from '../data/preset318'

export const FIXED_318_PRESET_ID = 'fixed-318'
export const FIXED_318_ROUTE_DATA_VERSION = '2026-07-22'

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
  for (const day of migrated.days || []) {
    let invalidatesSegments = false
    for (const point of day?.waypoints || []) {
      const canonical =
        (point.placeId && canonicalById.get(point.placeId)) ||
        canonicalByName.get(point.name)
      if (!canonical) continue
      if (coordinateChanged(point, canonical)) invalidatesSegments = true
      point.placeId = canonical.placeId
      point.lng = canonical.lng
      point.lat = canonical.lat
      if (canonical.altitude != null) point.altitude = canonical.altitude
      point.source = cloneData(canonical.source)
      if (!Array.isArray(point.roles)) point.roles = cloneData(canonical.roles)
      if (point.narrate == null) point.narrate = canonical.narrate
      if (!point.routeType) point.routeType = canonical.routeType
    }
    if (invalidatesSegments) {
      day.segments = null
      changedDays.push(day.dayNumber)
    }
  }
  migrated.presetId = FIXED_318_PRESET_ID
  migrated.routeDataVersion = FIXED_318_ROUTE_DATA_VERSION
  return { plan: migrated, migrated: true, changedDays }
}
