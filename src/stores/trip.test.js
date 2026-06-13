import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTripStore } from './trip'

describe('trip store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('初始无路书', () => {
    const t = useTripStore()
    expect(t.plan).toBeNull()
    expect(t.dayCount).toBe(0)
  })

  it('loadPreset318 后加载 9 天行程', () => {
    const t = useTripStore()
    t.loadPreset318()
    expect(t.plan).not.toBeNull()
    expect(t.dayCount).toBe(9)
    expect(t.plan.name).toContain('318')
  })

  it('allWaypoints 汇总所有节点', () => {
    const t = useTripStore()
    t.loadPreset318()
    expect(t.allWaypoints.length).toBeGreaterThan(20)
    expect(t.allWaypoints[0].name).toContain('成都')
  })

  it('loadPreset318 是深拷贝，修改不影响原始预设', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.plan.days[0].waypoints[0].name = '修改测试'
    t.loadPreset318()
    expect(t.plan.days[0].waypoints[0].name).toContain('成都')
  })
})

describe('trip store 编辑', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('newEmptyPlan 创建含 1 个空天的路书', () => {
    const t = useTripStore()
    t.newEmptyPlan()
    expect(t.dayCount).toBe(1)
    expect(t.plan.days[0].waypoints).toEqual([])
    expect(t.plan.days[0].segments).toBeNull()
  })

  it('loadPreset318 归一化后每天都有 segments 字段', () => {
    const t = useTripStore()
    t.loadPreset318()
    for (const day of t.plan.days) {
      expect(day.segments).toBeNull()
    }
  })

  it('addDay 在末尾追加空天并连续编号', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.addDay()
    expect(t.dayCount).toBe(10)
    expect(t.plan.days[9].dayNumber).toBe(10)
    expect(t.plan.days[9].waypoints).toEqual([])
  })

  it('removeDay 删除并重排 dayNumber', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.removeDay(2)
    expect(t.dayCount).toBe(8)
    expect(t.plan.days.map((d) => d.dayNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    // 原 Day 3（理塘）现在是 Day 2
    expect(t.plan.days[1].overnight).toBe('理塘')
  })

  it('addWaypoint 添加节点并使当天 segments 失效', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.setDaySegments(1, [{ fromName: 'a', toName: 'b', path: [], distance: 1, duration: 1 }])
    t.addWaypoint(1, { name: '新节点', lng: 103.5, lat: 30.1 })
    expect(t.plan.days[0].waypoints.at(-1).name).toBe('新节点')
    expect(t.plan.days[0].segments).toBeNull()
  })

  it('insertWaypointAt 在指定位置插入并使 segments 失效', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.setDaySegments(1, [{ fromName: 'a', toName: 'b', path: [], distance: 1, duration: 1 }])
    // Day 1 原首节点为「成都」，在其后（下标 1）插入
    t.insertWaypointAt(1, 1, { name: '世纪城地铁站', lng: 104.06, lat: 30.57 })
    expect(t.plan.days[0].waypoints[1].name).toBe('世纪城地铁站')
    expect(t.plan.days[0].segments).toBeNull()
  })

  it('insertWaypointAt 下标越界时夹到首/尾', () => {
    const t = useTripStore()
    t.loadPreset318()
    const n = t.plan.days[0].waypoints.length
    t.insertWaypointAt(1, -5, { name: '最前', lng: 100, lat: 30 })
    expect(t.plan.days[0].waypoints[0].name).toBe('最前')
    t.insertWaypointAt(1, 999, { name: '最后', lng: 101, lat: 30 })
    expect(t.plan.days[0].waypoints.at(-1).name).toBe('最后')
    expect(t.plan.days[0].waypoints.length).toBe(n + 2)
  })

  it('removeWaypoint 删除节点并使 segments 失效', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.setDaySegments(1, [])
    t.removeWaypoint(1, 0)
    expect(t.plan.days[0].waypoints[0].name).toBe('雅安')
    expect(t.plan.days[0].segments).toBeNull()
  })

  it('moveWaypoint 上移/下移节点', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.moveWaypoint(1, 0, 1)
    expect(t.plan.days[0].waypoints[0].name).toBe('雅安')
    expect(t.plan.days[0].waypoints[1].name).toBe('成都')
    // 越界移动不生效
    t.moveWaypoint(1, 0, -1)
    expect(t.plan.days[0].waypoints[0].name).toBe('雅安')
  })

  it('updateWaypoint 仅改名不清除 segments，改坐标清除', () => {
    const t = useTripStore()
    t.loadPreset318()
    const segs = [{ fromName: 'a', toName: 'b', path: [], distance: 1, duration: 1 }]
    t.setDaySegments(1, segs)
    t.updateWaypoint(1, 0, { name: '成都市' })
    expect(t.plan.days[0].segments).not.toBeNull()
    t.updateWaypoint(1, 0, { lng: 104.1 })
    expect(t.plan.days[0].segments).toBeNull()
  })

  it('setOvernight 修改住宿地', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.setOvernight(1, ' 康定城 ')
    expect(t.plan.days[0].overnight).toBe('康定城')
  })

  it('exportJson / importJson round trip', () => {
    const t = useTripStore()
    t.loadPreset318()
    const json = t.exportJson()
    t.clear()
    t.importJson(json)
    expect(t.dayCount).toBe(9)
    expect(t.plan.days[0].waypoints[0].name).toContain('成都')
  })

  it('importJson 拒绝非法 JSON', () => {
    const t = useTripStore()
    expect(() => t.importJson('not json')).toThrow('不是有效的 JSON 文件')
  })

  it('importJson 拒绝缺少 days 的数据', () => {
    const t = useTripStore()
    expect(() => t.importJson('{"name":"x"}')).toThrow('days')
  })

  it('importJson 拒绝缺少坐标的节点', () => {
    const t = useTripStore()
    const bad = JSON.stringify({ days: [{ waypoints: [{ name: 'x' }] }] })
    expect(() => t.importJson(bad)).toThrow('name / lng / lat')
  })

  it('replacePlan 归一化外部数据', () => {
    const t = useTripStore()
    t.replacePlan({ days: [{ waypoints: [{ name: 'a', lng: 100, lat: 30 }] }] })
    expect(t.plan.name).toBe('未命名路书')
    expect(t.plan.days[0].dayNumber).toBe(1)
    expect(t.plan.days[0].segments).toBeNull()
  })

  it('归一化后每个节点有 narration 字段，路书有 voice/rate', () => {
    const t = useTripStore()
    t.loadPreset318()
    expect(t.plan.voice).toBe('xiaoxiao')
    expect(t.plan.rate).toBe(1)
    expect(t.plan.days[0].waypoints[0].narration).toBe('')
  })

  it('setNarration 设置节点旁白（去空格）', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.setNarration(1, 0, '  这里是成都  ')
    expect(t.plan.days[0].waypoints[0].narration).toBe('这里是成都')
  })

  it('setVoice / setRate 修改全局音色与语速（rate 夹到 0.5~2）', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.setVoice('yunxi')
    t.setRate(3)
    expect(t.plan.voice).toBe('yunxi')
    expect(t.plan.rate).toBe(2)
    t.setRate(0.1)
    expect(t.plan.rate).toBe(0.5)
  })

  it('exportJson/importJson 保留 narration 与 voice/rate', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.setNarration(1, 0, '成都旁白')
    t.setVoice('xiaoyi')
    const json = t.exportJson()
    t.clear()
    t.importJson(json)
    expect(t.plan.voice).toBe('xiaoyi')
    expect(t.plan.days[0].waypoints[0].narration).toBe('成都旁白')
  })
})
