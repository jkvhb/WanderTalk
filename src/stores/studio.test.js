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

import { useStudioStore } from './studio'
import { useTripStore } from './trip'

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
})
