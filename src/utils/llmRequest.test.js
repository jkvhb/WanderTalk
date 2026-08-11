import { describe, expect, it } from 'vitest'
import { missingLlmKeyMessage, resolveLlmRequest } from './llmRequest'

describe('LLM 请求设置', () => {
  it('选择 Kimi 时只发送浏览器保存的 Kimi Key', () => {
    expect(resolveLlmRequest({
      llmProvider: 'kimi',
      kimiKey: 'kimi-test-key',
      llmKey: 'deepseek-test-key',
    })).toEqual({ provider: 'kimi', apiKey: 'kimi-test-key' })
  })

  it('选择 DeepSeek 时只发送 DeepSeek Key', () => {
    expect(resolveLlmRequest({
      llmProvider: 'deepseek',
      kimiKey: 'kimi-test-key',
      llmKey: 'deepseek-test-key',
    })).toEqual({ provider: 'deepseek', apiKey: 'deepseek-test-key' })
  })

  it('Kimi 未填浏览器 Key 时允许服务端兜底，DeepSeek 未填时前端提示', () => {
    expect(missingLlmKeyMessage({ llmProvider: 'kimi', kimiKey: '' })).toBe('')
    expect(missingLlmKeyMessage({ llmProvider: 'deepseek', llmKey: '' })).toMatch(/DeepSeek API Key/)
  })
})
