import { describe, it, expect } from 'vitest'
import { makePlanNarrationGenerator } from './narration'

describe('makePlanNarrationGenerator', () => {
  it('解析 LLM 的 JSON 输出为 results（去空格）', async () => {
    const gen = makePlanNarrationGenerator({
      callLLM: async () => '{"list":[{"dayNumber":1,"index":0,"narration":" 你好 "}]}',
    })
    const out = await gen({ apiKey: 'sk', items: [{ dayNumber: 1, index: 0, nodeName: '成都' }] })
    expect(out[0]).toMatchObject({ dayNumber: 1, index: 0, narration: '你好' })
  })

  it('兼容直接返回数组', async () => {
    const gen = makePlanNarrationGenerator({
      callLLM: async () => '[{"dayNumber":2,"index":1,"narration":"x"}]',
    })
    const out = await gen({ apiKey: 'sk', items: [] })
    expect(out[0].dayNumber).toBe(2)
  })

  it('非 JSON 抛出可读错误', async () => {
    const gen = makePlanNarrationGenerator({ callLLM: async () => '抱歉我不会' })
    await expect(gen({ apiKey: 'sk', items: [] })).rejects.toThrow('JSON')
  })
})
