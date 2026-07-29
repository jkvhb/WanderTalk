import { describe, it, expect, vi } from 'vitest'
import { makeChoreographyGenerator } from './choreography'

describe('makeChoreographyGenerator（DeepSeek 批量生成编排配置）', () => {
  it('解析 LLM 的 JSON 输出为原始 results 数组（清洗交给前端 normalize）', async () => {
    const gen = makeChoreographyGenerator({
      callLLM: async () =>
        JSON.stringify({
          results: [
            {
              index: 0,
              config: {
                schemaVersion: 2,
                storyMode: 'sequential',
                imageOrder: [1, 0],
                beats: [{ at: 0, focus: 1 }, { at: 0.5, focus: 0 }],
                emphasis: 'scenery',
              },
            },
          ],
        }),
    })
    const out = await gen({ apiKey: 'sk', nodes: [{ index: 0, narration: '雪山草甸', imageCount: 2 }] })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      index: 0,
      config: { schemaVersion: 2, storyMode: 'sequential', imageOrder: [1, 0], emphasis: 'scenery' },
    })
    expect(out[0].config.beats[1]).toEqual({ at: 0.5, focus: 0 })
  })

  it('兼容直接返回数组', async () => {
    const gen = makeChoreographyGenerator({
      callLLM: async () => '[{"index":0,"tempo":"calm","phases":[{"at":0,"focus":0}],"idle":{}}]',
    })
    const out = await gen({ apiKey: 'sk', nodes: [{ index: 0, narration: 'x', imageCount: 2 }] })
    expect(out[0].index).toBe(0)
    expect(out[0].tempo).toBe('calm')
  })

  it('非 JSON 抛出可读错误', async () => {
    const gen = makeChoreographyGenerator({ callLLM: async () => '抱歉我不会' })
    await expect(gen({ apiKey: 'sk', nodes: [{ index: 0, narration: 'x', imageCount: 2 }] })).rejects.toThrow(
      'JSON',
    )
  })

  it('提示词只允许故事语义，不允许布局和 CSS', async () => {
    const callLLM = vi.fn(async () => '{"results":[]}')
    const gen = makeChoreographyGenerator({ callLLM })
    await gen({
      apiKey: 'sk',
      nodes: [{ index: 3, narration: '翻越折多山，海拔四千三百米', imageCount: 3 }],
    })
    expect(callLLM).toHaveBeenCalledTimes(1)
    const arg = callLLM.mock.calls[0][0]
    expect(arg.json).toBe(true)
    const userMsg = arg.messages.find((m) => m.role === 'user')?.content || ''
    expect(userMsg).toContain('折多山')
    expect(userMsg).toContain('"index":3')
    expect(userMsg).toContain('3')
    const sysMsg = arg.messages.find((m) => m.role === 'system')?.content || ''
    expect(sysMsg).toContain('storyMode')
    expect(sysMsg).toContain('imageOrder')
    expect(sysMsg).toContain('beats')
    expect(sysMsg).toContain('emphasis')
    expect(sysMsg).toContain('不得输出具体坐标、预设名称、CSS')
    expect(sysMsg).not.toContain('route-bloom')
    expect(sysMsg).not.toContain('chapter-slide')
  })
  it('prompts text-only nodes to return empty imageOrder and beats', async () => {
    const callLLM = vi.fn(async () => JSON.stringify({ results: [{ index: 8, config: { imageOrder: [], beats: [] } }] }))
    const gen = makeChoreographyGenerator({ callLLM })

    const out = await gen({ apiKey: 'sk', nodes: [{ index: 8, narration: 'A text-only stop', imageCount: 0 }] })

    expect(out[0].config.imageOrder).toEqual([])
    expect(out[0].config.beats).toEqual([])
    expect(callLLM.mock.calls[0][0].json).toBe(true)
    const sysMsg = callLLM.mock.calls[0][0].messages.find((message) => message.role === 'system')?.content || ''
    expect(sysMsg).toContain('imageCount 为 0 时，imageOrder 和 beats 必须为空数组')
  })

  it('rejects markdown-fenced JSON and JSON followed by explanation', async () => {
    const callLLM = vi
      .fn()
      .mockResolvedValueOnce('```json\n{"results":[]}\n```')
      .mockResolvedValueOnce('{"results":[]}\nThis is the generated choreography.')
    const gen = makeChoreographyGenerator({ callLLM })
    const request = { apiKey: 'sk', nodes: [{ index: 0, narration: 'x', imageCount: 1 }] }

    await expect(gen(request)).rejects.toThrow('JSON')
    await expect(gen(request)).rejects.toThrow('JSON')
    expect(callLLM.mock.calls).toHaveLength(2)
    expect(callLLM.mock.calls[0][0].json).toBe(true)
    expect(callLLM.mock.calls[1][0].json).toBe(true)
  })
})
