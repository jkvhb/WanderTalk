export const ROUTE_DAY_COLORS = [
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
]

export function routeDayColor(dayIndex) {
  const index = Number.isInteger(dayIndex) ? dayIndex : 0
  return ROUTE_DAY_COLORS[((index % ROUTE_DAY_COLORS.length) + ROUTE_DAY_COLORS.length) % ROUTE_DAY_COLORS.length]
}
