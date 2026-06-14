import { describe, it, expect } from 'vitest'
import { buildPlanNarrationMessages } from './narrationPrompt'

describe('buildPlanNarrationMessages', () => {
  it('system 要求 JSON、第X天、勿重复、以实际位置为准', () => {
    const [system] = buildPlanNarrationMessages([{ dayNumber: 1, index: 0, nodeName: '康定' }])
    expect(system.content).toMatch(/JSON/)
    expect(system.content).toContain('第X天')
    expect(system.content).toMatch(/重复/)
    expect(system.content).toMatch(/实际位置/)
  })
  it('user 列出节点并带真实地址纠偏与 index', () => {
    const [, user] = buildPlanNarrationMessages([
      { dayNumber: 1, index: 1, nodeName: '石棉今知烧烤', address: '雅安市雨城区' },
    ])
    expect(user.content).toContain('石棉今知烧烤')
    expect(user.content).toContain('雅安市')
    expect(user.content).toContain('第1天')
    expect(user.content).toContain('index=1')
  })
})
