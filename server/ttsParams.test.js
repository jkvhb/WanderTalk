import { describe, it, expect } from 'vitest'
import { resolveVoice, rateToPercent, validateTtsBody } from './ttsParams'

describe('resolveVoice', () => {
  it('已知 slug 映射到 edge-tts voice', () => {
    expect(resolveVoice('xiaoxiao')).toBe('zh-CN-XiaoxiaoNeural')
    expect(resolveVoice('yunxi')).toBe('zh-CN-YunxiNeural')
    expect(resolveVoice('xiaoyi')).toBe('zh-CN-XiaoyiNeural')
  })
  it('未知 slug 回退晓晓', () => {
    expect(resolveVoice('???')).toBe('zh-CN-XiaoxiaoNeural')
  })
})

describe('rateToPercent', () => {
  it('1.0→+0%，1.5→+50%，0.8→-20%', () => {
    expect(rateToPercent(1)).toBe('+0%')
    expect(rateToPercent(1.5)).toBe('+50%')
    expect(rateToPercent(0.8)).toBe('-20%')
  })
})

describe('validateTtsBody', () => {
  it('接受 text 或 ssml，缺省 voice/rate', () => {
    expect(validateTtsBody({ text: '你好' })).toEqual({ text: '你好', voice: 'xiaoxiao', rate: 1 })
    expect(validateTtsBody({ ssml: '<speak/>', voice: 'yunxi', rate: 1.2 })).toEqual({
      text: '<speak/>',
      voice: 'yunxi',
      rate: 1.2,
    })
  })
  it('缺 text/ssml 抛 400', () => {
    expect(() => validateTtsBody({})).toThrow('缺少 text')
    try {
      validateTtsBody({})
    } catch (e) {
      expect(e.status).toBe(400)
    }
  })
})
