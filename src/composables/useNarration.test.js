import { describe, it, expect, vi } from 'vitest'
import { generateNarrationDraft } from './useNarration'

describe('generateNarrationDraft', () => {
  it('成功返回 results 数组', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ results: [{ nodeName: '康定', dayNumber: 1, narration: '稿' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const out = await generateNarrationDraft([{ nodeName: '康定', dayNumber: 1 }], { apiKey: 'sk' })
    expect(out[0].narration).toBe('稿')
  })
  it('失败抛出可读错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'Key 无效' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    )
    await expect(
      generateNarrationDraft([{ nodeName: 'x', dayNumber: 1 }], { apiKey: 'bad' }),
    ).rejects.toThrow('Key 无效')
  })
})
