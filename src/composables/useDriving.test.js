import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { planDrivingRoute, routeCacheKey } from './useDriving'

// 构造假 AMap：Driving.search 行为可定制，并统计调用次数
function makeFakeAMap(impl) {
  let calls = 0
  class Driving {
    search(origin, destination, cb) {
      calls++
      impl(origin, destination, cb, calls)
    }
  }
  return { AMap: { Driving }, getCalls: () => calls }
}

describe('useDriving', () => {
  it('routeCacheKey 对坐标做 5 位小数归一', () => {
    const k = routeCacheKey(
      { lng: 104.066512345, lat: 30.5728 },
      { lng: 103.001, lat: 29.9877 },
    )
    expect(k).toBe('104.06651,30.57280>103.00100,29.98770')
  })

  it('返回 WGS-84 路径与距离时长', async () => {
    const { AMap } = makeFakeAMap((o, d, cb) => {
      cb('complete', {
        routes: [{
          distance: 85000,
          time: 5400,
          steps: [{ path: [{ lng: o[0], lat: o[1] }, { lng: d[0], lat: d[1] }] }],
        }],
      })
    })
    const from = { name: '成都', lng: 104.0665, lat: 30.5728 }
    const to = { name: '雅安', lng: 103.001, lat: 29.9877 }
    const route = await planDrivingRoute(AMap, from, to)
    expect(route.distance).toBe(85000)
    expect(route.duration).toBe(5400)
    // 请求坐标是 GCJ-02，结果转回 WGS-84 后应接近原始坐标
    expect(route.path[0][0]).toBeCloseTo(104.0665, 3)
    expect(route.path[0][1]).toBeCloseTo(30.5728, 3)
    expect(route.path[1][0]).toBeCloseTo(103.001, 3)
  })

  it('第二次调用走缓存，不再请求高德', async () => {
    const { AMap, getCalls } = makeFakeAMap((o, d, cb) => {
      cb('complete', {
        routes: [{ distance: 1000, time: 100, steps: [{ path: [{ lng: o[0], lat: o[1] }] }] }],
      })
    })
    const from = { lng: 101.11111, lat: 30.11111 }
    const to = { lng: 101.22222, lat: 30.22222 }
    await planDrivingRoute(AMap, from, to)
    await planDrivingRoute(AMap, from, to)
    expect(getCalls()).toBe(1)
  })

  it('失败后自动重试一次', async () => {
    const { AMap, getCalls } = makeFakeAMap((o, d, cb, n) => {
      if (n === 1) cb('error', 'CUQPS_HAS_EXCEEDED_THE_LIMIT')
      else cb('complete', {
        routes: [{ distance: 1, time: 1, steps: [{ path: [{ lng: o[0], lat: o[1] }] }] }],
      })
    })
    const route = await planDrivingRoute(AMap, { lng: 102.3, lat: 30.3 }, { lng: 102.4, lat: 30.4 })
    expect(route.distance).toBe(1)
    expect(getCalls()).toBe(2)
  })

  it('重试仍失败则抛出错误', async () => {
    const { AMap } = makeFakeAMap((o, d, cb) => {
      cb('error', 'INVALID_USER_KEY')
    })
    await expect(
      planDrivingRoute(AMap, { lng: 102.5, lat: 30.5 }, { lng: 102.6, lat: 30.6 }),
    ).rejects.toThrow('INVALID_USER_KEY')
  })
})
