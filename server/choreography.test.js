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
              tempo: 'lively',
              phases: [
                { at: 0, focus: 0, accent: 'none' },
                { at: 0.5, focus: 1, accent: 'pulse' },
              ],
              idle: { drift: 0.6, breathe: 0.4 },
            },
          ],
        }),
    })
    const out = await gen({ apiKey: 'sk', nodes: [{ index: 0, narration: '雪山草甸', imageCount: 2 }] })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ index: 0, tempo: 'lively' })
    expect(out[0].phases[1]).toMatchObject({ at: 0.5, focus: 1, accent: 'pulse' })
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
  })
})
