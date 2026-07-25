import { describe, it, expect, vi } from 'vitest'
import { makeLlmCaller } from './llm'

describe('makeLlmCaller', () => {
  it('默认使用服务端 Kimi K2.6，并按批处理模式关闭思考', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
    }))
    const callLLM = makeLlmCaller({ moonshotApiKey: 'server-kimi-key', fetchImpl })

    const out = await callLLM({
      messages: [{ role: 'user', content: '生成 JSON' }],
      json: true,
    })

    expect(out).toBe('{"ok":true}')
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.moonshot.cn/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer server-kimi-key' }),
      }),
    )
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body).toMatchObject({
      model: 'kimi-k2.6',
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
    })
    expect(body).not.toHaveProperty('temperature')
  })

  it('手动选择 DeepSeek 时使用浏览器传入的备用 Key 和受支持的默认模型', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    }))
    const callLLM = makeLlmCaller({ moonshotApiKey: 'server-kimi-key', fetchImpl })

    await callLLM({
      provider: 'deepseek',
      apiKey: 'browser-deepseek-key',
      messages: [{ role: 'user', content: '你好' }],
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer browser-deepseek-key' }),
      }),
    )
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body).toMatchObject({ model: 'deepseek-v4-flash', temperature: 0.7 })
    expect(body).not.toHaveProperty('thinking')
  })

  it('Kimi 服务端 Key 未配置时返回可读错误，且不会发出网络请求', async () => {
    const fetchImpl = vi.fn()
    const callLLM = makeLlmCaller({ moonshotApiKey: '', fetchImpl })
    await expect(callLLM({ messages: [] })).rejects.toMatchObject({
      message: expect.stringMatching(/MOONSHOT_API_KEY/),
      status: 503,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('DeepSeek 备用模式缺少 Key 时返回设置指引', async () => {
    const callLLM = makeLlmCaller({ moonshotApiKey: 'server-kimi-key', fetchImpl: vi.fn() })
    await expect(callLLM({ provider: 'deepseek', messages: [] })).rejects.toMatchObject({
      message: expect.stringMatching(/DeepSeek API Key/),
      status: 400,
    })
  })
})
