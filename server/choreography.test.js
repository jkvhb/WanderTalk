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
                tempo: 'lively',
                transition: {
                  enter: 'photo-cascade',
                  anchor: 'image-focus',
                  direction: 'forward',
                  energy: 'accent',
                  layout: 'scattered-cards',
                  exit: 'follow-route',
                  unexpected: 'preserve-me',
                },
                phases: [
                  { at: 0, focus: 0, accent: 'none' },
                  { at: 0.5, focus: 1, accent: 'pulse' },
                ],
                idle: { drift: 0.6, breathe: 0.4 },
              },
            },
          ],
        }),
    })
    const out = await gen({ apiKey: 'sk', nodes: [{ index: 0, narration: '雪山草甸', imageCount: 2 }] })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ index: 0, config: { tempo: 'lively' } })
    expect(out[0].config.transition).toEqual({
      enter: 'photo-cascade',
      anchor: 'image-focus',
      direction: 'forward',
      energy: 'accent',
      layout: 'scattered-cards',
      exit: 'follow-route',
      unexpected: 'preserve-me',
    })
    expect(out[0].config.phases[1]).toMatchObject({ at: 0.5, focus: 1, accent: 'pulse' })
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

  it('提示词包含节点旁白与图片数，且要求 JSON 输出', async () => {
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
    expect(userMsg).toContain('index=3')
    expect(userMsg).toContain('3')
    const sysMsg = arg.messages.find((m) => m.role === 'system')?.content || ''
    // 系统提示词内嵌词汇表语义：tempo 三档 + phases + idle
    expect(sysMsg).toContain('calm')
    expect(sysMsg).toContain('lively')
    expect(sysMsg).toContain('phases')
    expect(sysMsg).toContain('idle')
    expect(sysMsg).toContain('transition')
    expect(sysMsg).toContain('route-bloom')
    expect(sysMsg).toContain('chapter-slide')
    expect(sysMsg).toContain('directional-wipe')
    expect(sysMsg).toContain('photo-cascade')
    expect(sysMsg).toContain('soft-dissolve')
    expect(sysMsg).toContain('layer-unfold')
    expect(sysMsg).toContain('enter')
    expect(sysMsg).toContain('anchor')
    expect(sysMsg).toContain('route-end')
    expect(sysMsg).toContain('screen-center')
    expect(sysMsg).toContain('image-focus')
    expect(sysMsg).toContain('direction')
    expect(sysMsg).toContain('forward')
    expect(sysMsg).toContain('left')
    expect(sysMsg).toContain('right')
    expect(sysMsg).toContain('up')
    expect(sysMsg).toContain('down')
    expect(sysMsg).toContain('energy')
    expect(sysMsg).toContain('medium')
    expect(sysMsg).toContain('accent')
    expect(sysMsg).toContain('layout')
    expect(sysMsg).toContain('text-first')
    expect(sysMsg).toContain('hero-image')
    expect(sysMsg).toContain('scattered-cards')
    expect(sysMsg).toContain('sequential-cards')
    expect(sysMsg).toContain('exit')
    expect(sysMsg).toContain('return-map')
    expect(sysMsg).toContain('follow-route')
    expect(sysMsg).toContain('map/road geography')
    expect(sysMsg).toContain('need images')
    expect(sysMsg).toContain('text-only stop')
    expect(sysMsg).toContain('next-route direction')
    expect(sysMsg).toContain('calm tends to soft-dissolve')
  })
  it('prompts text-only nodes to return empty phases and preserves them', async () => {
    const callLLM = vi.fn(async () => JSON.stringify({ results: [{ index: 8, config: { phases: [] } }] }))
    const gen = makeChoreographyGenerator({ callLLM })

    const out = await gen({ apiKey: 'sk', nodes: [{ index: 8, narration: 'A text-only stop', imageCount: 0 }] })

    expect(out[0].config.phases).toEqual([])
    expect(callLLM.mock.calls[0][0].json).toBe(true)
    const sysMsg = callLLM.mock.calls[0][0].messages.find((message) => message.role === 'system')?.content || ''
    expect(sysMsg).toContain('when imageCount is 0, return "phases": []')
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
