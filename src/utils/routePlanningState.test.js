import { describe, expect, it } from 'vitest'
import { shouldForceRefreshRoutes } from './routePlanningState'

describe('shouldForceRefreshRoutes', () => {
  it('已有任意一天路线时，再点击计算视为主动刷新', () => {
    expect(shouldForceRefreshRoutes([{ segments: null }, { segments: [] }])).toBe(true)
  })

  it('所有日期都未计算时允许使用有效缓存', () => {
    expect(shouldForceRefreshRoutes([{ segments: null }, { segments: null }])).toBe(false)
  })
})
