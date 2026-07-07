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
  { id: 'hit:' + q, tags: 'kw:' + q.slice(2), webformatURL: 'w', largeImageURL: 'l:' + q, pageURL: 'p:' + q },
])
const fetchPixabayImageBlob = vi.fn(async () => new Blob(['img']))
vi.mock('../composables/useImages', () => ({
  generateImageQueries: (...args) => generateImageQueries(...args),
  searchPixabayImages: (...args) => searchPixabayImages(...args),
  fetchPixabayImageBlob: (...args) => fetchPixabayImageBlob(...args),
}))

let idCounter = 0
vi.mock('../utils/image', () => ({
  newImageId: () => 'img_' + idCounter++,
  downscaleImage: vi.fn(async () => ({ blob: new Blob(['x']), mime: 'image/jpeg', w: 10, h: 10 })),
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
})
