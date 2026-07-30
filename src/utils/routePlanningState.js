export function shouldForceRefreshRoutes(days) {
  return Array.isArray(days) && days.some((day) => Array.isArray(day?.segments))
}
