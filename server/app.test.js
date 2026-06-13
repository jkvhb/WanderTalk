import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from './app'

function makeApp(overrides = {}) {
  return createApp({
    synthesize: async () => Buffer.from('FAKEMP3'),
    generateNarration: async () => [],
    ...overrides,
  })
}

describe('app 健康检查', () => {
  it('GET /api/health 返回 ok', async () => {
    const res = await request(makeApp()).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})

describe('POST /api/tts', () => {
  it('成功返回 audio/mpeg 字节', async () => {
    const app = makeApp({ synthesize: async ({ text }) => Buffer.from('MP3:' + text) })
    const res = await request(app).post('/api/tts').send({ text: '你好', voice: 'xiaoxiao', rate: 1 })
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/audio\/mpeg/)
    expect(res.body.toString()).toBe('MP3:你好')
  })
  it('缺 text 返回 400', async () => {
    const res = await request(makeApp()).post('/api/tts').send({ voice: 'xiaoxiao' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/text/)
  })
})
