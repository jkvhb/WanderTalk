import { describe, it, expect } from 'vitest'
import { buildNarrationMessages } from './narrationPrompt'

describe('buildNarrationMessages', () => {
  it('返回 system + user 两条，user 含节点名与天数', () => {
    const msgs = buildNarrationMessages({ nodeName: '折多山垭口', dayNumber: 2, altitude: 4298 })
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe('system')
    expect(msgs[1].role).toBe('user')
    expect(msgs[1].content).toContain('折多山垭口')
    expect(msgs[1].content).toContain('第 2 天')
  })
  it('system 提示要求中文、不编造', () => {
    const [system] = buildNarrationMessages({ nodeName: '康定', dayNumber: 1 })
    expect(system.content).toMatch(/中文/)
    expect(system.content).toMatch(/不要编造|不得编造/)
  })
})
