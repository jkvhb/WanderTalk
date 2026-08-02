import {
  isValidPlaceCoordinate,
  normalizePlaceName,
  samePlace,
} from './placeIdentity'
import { validateCalculatedRoutes } from './routeQuality'

const unnamedPlace = '未命名地点'
const placeName = (waypoint) =>
  typeof waypoint?.name === 'string' && waypoint.name.trim()
    ? waypoint.name
    : unnamedPlace
const makeIssue = (code, dayNumber, waypointIndex, message) => ({
  code,
  severity: 'error',
  dayNumber,
  waypointIndex,
  message,
})
const waypointsOf = (day) =>
  Array.isArray(day?.waypoints) ? day.waypoints : []
const placesMatch = (left, right) =>
  Boolean(left && right && samePlace(left, right))
const hasUsablePlaceId = (value) =>
  typeof value === 'string' && value.trim() !== ''
const hasNarration = (waypoint) =>
  waypoint?.narrate !== false &&
  typeof waypoint?.narration === 'string' &&
  waypoint.narration.trim() !== ''

export function validatePlan(plan) {
  const issues = []
  if (
    !plan ||
    typeof plan !== 'object' ||
    Array.isArray(plan) ||
    !Array.isArray(plan.days)
  ) {
    return [makeIssue('INVALID_PLAN', 0, -1, '规划必须包含 days 数组')]
  }

  const days = plan.days
  if (days.length === 0) {
    return [makeIssue('EMPTY_PLAN', 0, -1, '规划至少需要一天行程')]
  }

  const narratedWaypoints = []

  days.forEach((day, dayIndex) => {
    const dayNumber = dayIndex + 1
    const waypoints = waypointsOf(day)

    if (day?.dayNumber !== dayNumber) {
      issues.push(
        makeIssue(
          'DUPLICATE_DAY_NUMBER',
          dayNumber,
          -1,
          `第 ${dayNumber} 天编号不连续`,
        ),
      )
    }

    if (!Array.isArray(day?.waypoints) || waypoints.length < 2) {
      issues.push(
        makeIssue(
          'EMPTY_DAY',
          dayNumber,
          -1,
          `第 ${dayNumber} 天至少需要两个地点`,
        ),
      )
    }

    waypoints.forEach((waypoint, waypointIndex) => {
      if (!waypoint || !isValidPlaceCoordinate(waypoint)) {
        issues.push(
          makeIssue(
            'INVALID_COORDINATE',
            dayNumber,
            waypointIndex,
            `地点“${placeName(waypoint)}”的坐标无效`,
          ),
        )
      }

      if (waypoint?.routeType === 'optional') {
        issues.push(
          makeIssue(
            'OPTIONAL_IN_MAIN_ROUTE',
            dayNumber,
            waypointIndex,
            `地点“${placeName(waypoint)}”不能作为主路线的可选点`,
          ),
        )
      }

      const appearedEarlier = waypoints
        .slice(0, waypointIndex)
        .some((previous) => placesMatch(previous, waypoint))

      if (appearedEarlier) {
        issues.push(
          makeIssue(
            'DUPLICATE_PLACE',
            dayNumber,
            waypointIndex,
            `地点“${placeName(waypoint)}”在当天重复出现`,
          ),
        )
      }

      if (
        waypointIndex > 0 &&
        placesMatch(waypoints[waypointIndex - 1], waypoint)
      ) {
        issues.push(
          makeIssue(
            'ZERO_DISTANCE_LEG',
            dayNumber,
            waypointIndex,
            `相邻地点“${placeName(waypoint)}”之间距离为零`,
          ),
        )
      }

      if (hasNarration(waypoint)) {
        narratedWaypoints.push({ dayNumber, waypointIndex, waypoint })
      }
    })

    const end = waypoints.at(-1)
    if (end) {
      const overnightPlaceId = day?.overnightPlaceId
      const overnightMatches = hasUsablePlaceId(overnightPlaceId)
        ? hasUsablePlaceId(end?.placeId) &&
          end.placeId === overnightPlaceId
        : Boolean(
            normalizePlaceName(end?.name) &&
              normalizePlaceName(end?.name) ===
                normalizePlaceName(day?.overnight),
          )

      if (!overnightMatches) {
        issues.push(
          makeIssue(
            'OVERNIGHT_MISMATCH',
            dayNumber,
            waypoints.length - 1,
            `当天终点“${placeName(end)}”与住宿地点不匹配`,
          ),
        )
      }
    }
  })

  for (let dayIndex = 1; dayIndex < days.length; dayIndex += 1) {
    const previousEnd = waypointsOf(days[dayIndex - 1]).at(-1)
    const currentStart = waypointsOf(days[dayIndex])[0]
    if (previousEnd && currentStart && !samePlace(previousEnd, currentStart)) {
      issues.push(
        makeIssue(
          'DAY_BOUNDARY_MISMATCH',
          dayIndex + 1,
          0,
          `第 ${dayIndex} 天终点与第 ${dayIndex + 1} 天起点不一致`,
        ),
      )
    }
  }

  narratedWaypoints.forEach((entry, index) => {
    if (
      index > 0 &&
      samePlace(narratedWaypoints[index - 1].waypoint, entry.waypoint)
    ) {
      issues.push(
        makeIssue(
          'DUPLICATE_NARRATION',
          entry.dayNumber,
          entry.waypointIndex,
          `地点“${placeName(entry.waypoint)}”被相邻讲解事件重复介绍`,
        ),
      )
    }
  })

  return issues
}

// 内容、配图和视频生成前使用：除节点结构外，还要求每一段真实驾驶路线完整可信。
export function validatePlanForGeneration(plan) {
  return [...validatePlan(plan), ...validateCalculatedRoutes(plan)]
}
