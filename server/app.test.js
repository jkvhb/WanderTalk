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
