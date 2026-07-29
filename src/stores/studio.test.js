import 'fake-indexeddb/auto'
import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../composables/useTts', () => ({
  synthesize: vi.fn(async () => ({ blob: new Blob(['x']), duration: 1 })),
  VOICES: [],
}))
vi.mock('../composables/useNarration', () => ({
  generateNarrationDraft: vi.fn(async (items) =>
    items.map((i) => ({
      nodeName: i.nodeName,
      dayNumber: i.dayNumber,
      index: i.index,
      narration: '稿:' + i.nodeName,
    })),
  ),
}))

const generateImageQueries = vi.fn(async (nodes) =>
  nodes.map((n, i) => ({ index: i, queries: ['q:' + n.name], keywords: ['kw:' + n.name] })),
)
const searchPixabayImages = vi.fn(async (q) => [
  { id: 'hit:' + q, tags: 'kw:' + q.slice(2) + ', ' + q, webformatURL: 'w', largeImageURL: 'l:' + q, pageURL: 'p:' + q },
])
const fetchPixabayImageBlob = vi.fn(async () => new Blob(['img']))
const searchCommonsImages = vi.fn(async () => [])
vi.mock('../composables/useImages', () => ({
  generateImageQueries: (...args) => generateImageQueries(...args),
  searchPixabayImages: (...args) => searchPixabayImages(...args),
  searchCommonsImages: (...args) => searchCommonsImages(...args),
  fetchPixabayImageBlob: (...args) => fetchPixabayImageBlob(...args),
}))

let idCounter = 0
vi.mock('../utils/image', () => ({
  newImageId: () => 'img_' + idCounter++,
  downscaleImage: vi.fn(async () => ({ blob: new Blob(['x']), mime: 'image/jpeg', w: 10, h: 10 })),
}))

const generateChoreographyConfigs = vi.fn()
vi.mock('../composables/useChoreography', () => ({
  generateChoreographyConfigs: (...args) => generateChoreographyConfigs(...args),
}))

import { useStudioStore } from './studio'
import { useTripStore } from './trip'
import { getImage } from '../utils/db'

describe('studio store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('runSynthAll 遍历有旁白的节点并记录进度/完成时间', async () => {
    const trip = useTripStore()
    trip.loadPreset318()
    trip.loadPresetNarration()
    const studio = useStudioStore()
    await studio.runSynthAll()
    expect(studio.synthJob.total).toBeGreaterThan(0)
    expect(studio.synthJob.done).toBe(studio.synthJob.total)
    expect(studio.synthJob.finishedAt).toBeTruthy()
    expect(studio.synthJob.running).toBe(false)
  })

  it('runAiDraftAll 为空白节点生成草稿并完成', async () => {
    const trip = useTripStore()
    trip.loadPreset318() // 全空白
    const studio = useStudioStore()
    await studio.runAiDraftAll('sk')
    expect(studio.aiJob.finishedAt).toBeTruthy()
    expect(trip.plan.days[0].waypoints[0].narration).toContain('稿:')
  })

  it('runAiDraftAll regenerateAll 覆盖并把旧稿存入 prevNarration', async () => {
    const trip = useTripStore()
    trip.loadPreset318()
    trip.loadPresetNarration()
    const studio = useStudioStore()
    const before = trip.plan.days[0].waypoints[0].narration
    await studio.runAiDraftAll('sk', { regenerateAll: true })
    expect(trip.plan.days[0].waypoints[0].narration).toContain('稿:')
    expect(trip.plan.days[0].waypoints[0].prevNarration).toBe(before)
  })

  describe('runImageAutoFillAll（AI 自动配图）', () => {
    beforeEach(() => {
      idCounter = 0
      generateImageQueries.mockClear()
      searchPixabayImages.mockClear()
      searchPixabayImages.mockImplementation(async (q) => [
        { id: 'hit:' + q, tags: 'kw:' + q.slice(2) + ', ' + q, webformatURL: 'w', largeImageURL: 'l:' + q, pageURL: 'p:' + q },
      ])
      fetchPixabayImageBlob.mockClear()
    })

    it('全部节点无图：为每个无图节点配图并记录完成状态', async () => {
      const trip = useTripStore()
      trip.loadPreset318()
      const studio = useStudioStore()
      await studio.runImageAutoFillAll('sk')
      expect(studio.imageJob.running).toBe(false)
      expect(studio.imageJob.finishedAt).toBeTruthy()
      expect(studio.imageJob.total).toBeGreaterThan(0)
      expect(studio.imageJob.done).toBe(studio.imageJob.total)
      expect(studio.imageJob.skipped).toBe(0)
      const first = trip.plan.days[0].waypoints[0]
      expect(first.images.length).toBeGreaterThan(0)
      const entry = await getImage(first.images[0])
      expect(entry.source).toMatchObject({ provider: 'pixabay' })
    })

    it('无节点需要配图时提示无事可做，且不调用后端', async () => {
      const trip = useTripStore()
      trip.loadPreset318()
      // 手动给所有节点都塞一张图，模拟"全部已有图"
      trip.plan.days.forEach((d, di) => d.waypoints.forEach((w, wi) => trip.addImage(d.dayNumber, wi, 'existing')))
      const studio = useStudioStore()
      await studio.runImageAutoFillAll('sk')
      expect(generateImageQueries).not.toHaveBeenCalled()
      expect(studio.imageJob.total).toBe(0)
      expect(studio.imageJob.finishedAt).toBeTruthy()
    })

    it('幂等：重跑只处理仍无图的节点', async () => {
      const trip = useTripStore()
      trip.loadPreset318()
      const studio = useStudioStore()
      await studio.runImageAutoFillAll('sk')
      const totalFirstRun = studio.imageJob.total
      expect(totalFirstRun).toBeGreaterThan(0)

      generateImageQueries.mockClear()
      await studio.runImageAutoFillAll('sk')
      // 所有节点都已配图，第二次应为 0（无事可做）
      expect(studio.imageJob.total).toBe(0)
      expect(generateImageQueries).not.toHaveBeenCalled()
    })

    it('某节点所有检索词都落空则跳过（skipped 计数），不影响其他节点', async () => {
      const trip = useTripStore()
      trip.loadPreset318()
      searchPixabayImages.mockImplementation(async (q) => {
        if (q.includes('成都')) return [] // 第一个节点全部落空
        return [{ id: 'hit:' + q, tags: 'kw:' + q.slice(2), webformatURL: 'w', largeImageURL: 'l', pageURL: 'p' }]
      })
      const studio = useStudioStore()
      await studio.runImageAutoFillAll('sk')
      expect(studio.imageJob.skipped).toBeGreaterThanOrEqual(1)
      const first = trip.plan.days[0].waypoints[0]
      expect(first.name).toBe('成都')
      expect(first.images.length).toBe(0)
    })

    it('地标检索只接受能直接佐证地标名的图片，不把泛场景图当作命中', async () => {
      const trip = useTripStore()
      trip.replacePlan({
        days: [{
          dayNumber: 1,
          title: '测试',
          waypoints: [{ name: '金沙江大桥', lng: 99, lat: 29, narration: '测试讲解', images: [] }],
        }],
      })
      generateImageQueries.mockResolvedValueOnce([
        { index: 0, queries: ['金沙江大桥'], keywords: ['大桥', '金沙江'] },
      ])
      searchPixabayImages.mockResolvedValueOnce([
        { id: 'generic-bridge', tags: 'bridge, river, landscape', webformatURL: 'w', largeImageURL: 'l', pageURL: 'p' },
      ])
      searchCommonsImages.mockResolvedValueOnce([])

      const studio = useStudioStore()
      await studio.runImageAutoFillAll('sk')

      expect(trip.plan.days[0].waypoints[0].images).toEqual([])
      expect(studio.imageJob.done).toBe(0)
      expect(studio.imageJob.skipped).toBe(1)
    })
    it('imageQuery 报错时进入 error 状态，不抛出', async () => {
      generateImageQueries.mockRejectedValueOnce(new Error('生成检索词失败'))
      const trip = useTripStore()
      trip.loadPreset318()
      const studio = useStudioStore()
      await expect(studio.runImageAutoFillAll('sk')).resolves.not.toThrow()
      expect(studio.imageJob.error).toMatch(/生成检索词失败/)
      expect(studio.imageJob.running).toBe(false)
    })

    it('进度按节点推进（done/total/current）', async () => {
      const trip = useTripStore()
      trip.loadPreset318()
      const studio = useStudioStore()
      const promise = studio.runImageAutoFillAll('sk')
      // 任务应已标记为 running，total 已知
      expect(studio.imageJob.running).toBe(true)
      expect(studio.imageJob.total).toBeGreaterThan(0)
      await promise
      expect(studio.imageJob.done + studio.imageJob.skipped).toBe(studio.imageJob.total)
    })
  })

  describe('runChoreographyAll（AI 编排动效，Phase 4e）', () => {
    beforeEach(() => {
      generateChoreographyConfigs.mockReset()
      generateChoreographyConfigs.mockImplementation(async (nodes) =>
        nodes.map((n) => ({
          index: n.index,
          schemaVersion: 2,
          storyMode: n.imageCount <= 1 ? 'hero' : 'sequential',
          imageOrder: Array.from({ length: n.imageCount }, (_, i) => i),
          beats: n.imageCount ? [{ at: 0, focus: 0 }] : [],
          emphasis: 'name',
        })),
      )
    })
    // Candidates are content nodes with non-empty SSML-stripped narration, including text-only nodes.
    // 雅安无预设文案，需手动补旁白才能成为候选。
    function setupTrip() {
      const trip = useTripStore()
      trip.loadPreset318()
      trip.loadPresetNarration()
      trip.setNarration(1, 1, '雅安，茶马古道的起点，川藏线从这里正式开始爬升。')
      trip.addImage(1, 0, 'img_a')
      trip.addImage(1, 0, 'img_b')
      trip.addImage(1, 5, 'img_c')
      return trip
    }
    it('processes non-empty SSML-stripped narration, including text-only nodes', async () => {
      const trip = setupTrip()
      const studio = useStudioStore()
      await studio.runChoreographyAll('sk')
      expect(studio.choreoJob.running).toBe(false)
      expect(studio.choreoJob.finishedAt).toBeTruthy()
      expect(studio.choreoJob.total).toBe(17)
      expect(studio.choreoJob.done).toBe(17)
      expect(studio.choreoJob.skipped).toBe(0)
      const wp0 = trip.plan.days[0].waypoints[0]
      expect(wp0.choreography.config.schemaVersion).toBe(2)
      expect(wp0.choreography.config.storyMode).toBe('sequential')
      expect(wp0.choreography.config.beats[0].at).toBe(0)
      expect(wp0.choreography.narrationHash).toBeTruthy()
    })

    it('发给后端的旁白已剥 SSML 标签并截断', async () => {
      const trip = setupTrip()
      trip.setNarration(1, 0, '你好<break time="300ms"/>成都，' + '长'.repeat(500))
      const studio = useStudioStore()
      await studio.runChoreographyAll('sk')
      const payload = generateChoreographyConfigs.mock.calls[0][0]
      const n0 = payload.find((n) => n.index === 0)
      expect(n0.narration).not.toContain('<')
      expect(n0.narration).toContain('你好成都')
      expect(n0.narration.length).toBeLessThanOrEqual(300)
      expect(n0.imageCount).toBe(2)
      expect(n0.images).toEqual([
        { index: 0, title: '', tags: '', description: '', provider: '' },
        { index: 1, title: '', tags: '', description: '', provider: '' },
      ])
    })

    it('无图但有旁白的内容节点也会编排，并以 imageCount: 0 持久化配置', async () => {
      const trip = useTripStore()
      trip.replacePlan({
        days: [{
          dayNumber: 1,
          title: '测试',
          waypoints: [{ name: '文字停靠点', lng: 99, lat: 29, narration: '这里只有旁白，没有图片。', images: [] }],
        }],
      })
      const setChoreography = vi.spyOn(trip, 'setChoreography')
      const studio = useStudioStore()

      await studio.runChoreographyAll('sk')

      expect(generateChoreographyConfigs).toHaveBeenCalledWith([
        { index: 0, narration: '这里只有旁白，没有图片。', imageCount: 0, images: [] },
      ], { apiKey: 'sk' })
      expect(setChoreography).toHaveBeenCalledTimes(1)
      expect(trip.plan.days[0].waypoints[0].choreography.config).toMatchObject({
        schemaVersion: 2, storyMode: 'hero', imageOrder: [], beats: [],
      })
    })

    it('preserves normalized config from indexed result envelopes', async () => {
      const trip = useTripStore()
      trip.replacePlan({
        days: [{
          dayNumber: 1,
          title: '测试',
          waypoints: [{ name: '站点', lng: 99, lat: 29, narration: '两张图的旁白', images: ['img_a', 'img_b'] }],
        }],
      })
      generateChoreographyConfigs.mockImplementation(async (nodes) => nodes.map((n) => ({
        index: n.index,
        config: {
          schemaVersion: 2,
          storyMode: 'parallel',
          imageOrder: [1, 0],
          beats: [{ at: 0, focus: 1 }, { at: 0.5, focus: 0 }],
          emphasis: 'scenery',
        },
      })))
      const studio = useStudioStore()

      await studio.runChoreographyAll('sk')

      const config = trip.plan.days[0].waypoints[0].choreography.config
      expect(config).toEqual({
        schemaVersion: 2,
        storyMode: 'parallel',
        imageOrder: [1, 0],
        beats: [{ at: 0, focus: 1 }, { at: 0.5, focus: 0 }],
        emphasis: 'scenery',
      })
    })

    it('幂等：旁白未改的节点重跑全部跳过，不再调 LLM', async () => {
      setupTrip()
      const studio = useStudioStore()
      await studio.runChoreographyAll('sk')
      generateChoreographyConfigs.mockClear()

      await studio.runChoreographyAll('sk')
      expect(generateChoreographyConfigs).not.toHaveBeenCalled()
      expect(studio.choreoJob.total).toBe(17)
      expect(studio.choreoJob.skipped).toBe(17)
      expect(studio.choreoJob.done).toBe(0)
      expect(studio.choreoJob.finishedAt).toBeTruthy()
    })

    it('旁白修改后仅该节点重新生成', async () => {
      const trip = setupTrip()
      const studio = useStudioStore()
      await studio.runChoreographyAll('sk')
      const oldHash = trip.plan.days[0].waypoints[0].choreography.narrationHash

      trip.setNarration(1, 0, '完全不同的新旁白文本')
      generateChoreographyConfigs.mockClear()
      generateChoreographyConfigs.mockImplementation(async (nodes) =>
        nodes.map((n) => ({
          index: n.index,
          schemaVersion: 2,
          storyMode: 'hero',
          imageOrder: n.imageCount ? [0] : [],
          beats: n.imageCount ? [{ at: 0, focus: 0 }] : [],
          emphasis: 'name',
        })),
      )
      await studio.runChoreographyAll('sk')
      expect(generateChoreographyConfigs).toHaveBeenCalledTimes(1)
      expect(generateChoreographyConfigs.mock.calls[0][0]).toHaveLength(1)
      expect(studio.choreoJob.done).toBe(1)
      expect(studio.choreoJob.skipped).toBe(16)
      const wp0 = trip.plan.days[0].waypoints[0]
      expect(wp0.choreography.config.storyMode).toBe('hero')
      expect(wp0.choreography.narrationHash).not.toBe(oldHash)
    })

    it('LLM 漏掉某节点时用默认配置兜底（normalize 兜底，不留空）', async () => {
      const trip = setupTrip()
      generateChoreographyConfigs.mockImplementation(async () => []) // 全漏
      const studio = useStudioStore()
      await studio.runChoreographyAll('sk')
      expect(studio.choreoJob.done).toBe(17)
      const wp0 = trip.plan.days[0].waypoints[0]
      expect(wp0.choreography.config.schemaVersion).toBe(2)
      expect(wp0.choreography.config.storyMode).toBe('sequential')
      expect(wp0.choreography.config.beats.length).toBeGreaterThan(0)
    })

    it('生成报错时进入 error 状态，不抛出', async () => {
      setupTrip()
      generateChoreographyConfigs.mockRejectedValueOnce(new Error('生成编排配置失败'))
      const studio = useStudioStore()
      await expect(studio.runChoreographyAll('sk')).resolves.not.toThrow()
      expect(studio.choreoJob.error).toMatch(/生成编排配置失败/)
      expect(studio.choreoJob.running).toBe(false)
    })
    it('does not call the LLM when no content node has eligible narration', async () => {
      const trip = useTripStore()
      trip.loadPreset318()
      const studio = useStudioStore()
      await studio.runChoreographyAll('sk')
      expect(generateChoreographyConfigs).not.toHaveBeenCalled()
      expect(studio.choreoJob.total).toBe(0)
      expect(studio.choreoJob.finishedAt).toBeTruthy()
    })
  })

  it('路线点和 optional 点不进入旁白、配图、TTS 或动效任务', async () => {
    const trip = useTripStore()
    trip.replacePlan({
      days: [{
        overnight: '讲解点',
        waypoints: [
          { name: '路线点', lng: 100, lat: 30, narrate: false },
          { name: '可选点', lng: 100.5, lat: 30, routeType: 'optional' },
          { name: '讲解点', lng: 101, lat: 30, narrate: true },
        ],
      }],
    })
    const studio = useStudioStore()

    await studio.runAiDraftAll('sk')
    expect(studio.aiJob.total).toBe(1)
    expect(trip.plan.days[0].waypoints[0].narration).toBe('')
    expect(trip.plan.days[0].waypoints[1].narration).toBe('')
    expect(trip.plan.days[0].waypoints[2].narration).toBe('稿:讲解点')

    await studio.runImageAutoFillAll('sk')
    expect(studio.imageJob.total).toBe(1)
    expect(trip.plan.days[0].waypoints[0].images).toEqual([])
    expect(trip.plan.days[0].waypoints[1].images).toEqual([])
    expect(trip.plan.days[0].waypoints[2].images).toHaveLength(1)

    await studio.runSynthAll()
    expect(studio.synthJob.total).toBe(1)

    generateChoreographyConfigs.mockResolvedValueOnce([])
    await studio.runChoreographyAll('sk')
    expect(studio.choreoJob.total).toBe(1)
  })

})
