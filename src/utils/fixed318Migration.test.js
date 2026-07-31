import { describe, expect, it } from 'vitest'
import { migrateFixed318Plan } from './fixed318Migration'

function legacyFixed318() {
  return {
    name: '318 川藏线（成都 → 拉萨）',
    voice: 'yunxi',
    days: [
      {
        dayNumber: 1,
        segments: [{ path: [[104.06, 30.57], [101.95, 30.05]] }],
        waypoints: [
          { name: '成都', lng: 104.0665, lat: 30.5728 },
          { name: '康定', lng: 101.9576, lat: 30.0556 },
          { name: '折多山垭口', lng: 101.8, lat: 30.038 },
          { name: '理塘', lng: 100.27, lat: 29.997 },
          { name: '巴塘', lng: 99.108, lat: 30.004 },
        ],
      },
      {
        dayNumber: 2,
        segments: [{ path: [[99.108, 30.004], [97.841, 29.671]] }],
        waypoints: [
          { name: '芒康', lng: 98.593, lat: 29.68 },
          {
            name: '东达山',
            lng: 98.15,
            lat: 29.72,
            narration: '保留我的东达山旁白',
            images: ['img-a'],
            choreography: { config: { storyMode: 'hero' }, narrationHash: 'abc' },
          },
          { name: '左贡', lng: 97.841, lat: 29.671 },
          { name: '拉萨', lng: 91.1409, lat: 29.6456 },
        ],
      },
    ],
  }
}

describe('migrateFixed318Plan', () => {
  it('把旧版相邻的海子山与姊妹湖合并到G318主线节点，并保留两边内容', () => {
    const source = legacyFixed318()
    source.presetId = 'fixed-318'
    source.routeDataVersion = '2026-07-22'
    source.days[0].waypoints.splice(
      4,
      0,
      {
        name: '海子山',
        lng: 99.560745,
        lat: 30.256014,
        narration: '先翻越海子山。',
        note: '旧海子山备注',
        images: ['haizi-a'],
      },
      {
        name: '姊妹湖',
        lng: 99.551793,
        lat: 30.299644,
        narration: '再看见姊妹湖。',
        note: '旧姊妹湖备注',
        images: ['lake-a'],
      },
    )

    const result = migrateFixed318Plan(source)
    const merged = result.plan.days[0].waypoints.filter(
      (point) => point.placeId === 'sister-lakes',
    )

    expect(result.migrated).toBe(true)
    expect(result.plan.routeDataVersion).toBe('2026-07-31')
    expect(result.changedDays).toContain(1)
    expect(result.plan.days[0].segments).toBeNull()
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      name: '姊妹湖',
      lng: 99.551793,
      lat: 30.299644,
      images: ['haizi-a', 'lake-a'],
    })
    expect(merged[0].narration).toContain('先翻越海子山')
    expect(merged[0].narration).toContain('再看见姊妹湖')
    expect(merged[0].note).toContain('旧海子山备注')
    expect(merged[0].note).toContain('旧姊妹湖备注')
  })

  it('更新旧版固定318坐标、清除受影响路线并保留用户内容', () => {
    const source = legacyFixed318()
    const result = migrateFixed318Plan(source)
    const dongda = result.plan.days[1].waypoints[1]

    expect(result.migrated).toBe(true)
    expect(result.changedDays).toEqual([1, 2])
    expect(dongda).toMatchObject({
      placeId: 'dongda-pass',
      lng: 98.003489,
      lat: 29.709959,
      narration: '保留我的东达山旁白',
      images: ['img-a'],
      choreography: { config: { storyMode: 'hero' }, narrationHash: 'abc' },
    })
    expect(result.plan.days[1].segments).toBeNull()
    expect(result.plan.voice).toBe('yunxi')
    expect(source.days[1].waypoints[1].lng).toBe(98.15)
  })

  it('不修改普通自定义路书', () => {
    const custom = {
      name: '我的周末路线',
      days: [{ dayNumber: 1, waypoints: [{ name: '东达山', lng: 1, lat: 2 }] }],
    }
    const result = migrateFixed318Plan(custom)

    expect(result.migrated).toBe(false)
    expect(result.plan).toBe(custom)
  })
})
