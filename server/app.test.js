import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from './app'

function makeApp(overrides = {}) {
  return createApp({
    synthesize: async () => Buffer.from('FAKEMP3'),
    generateNarration: async () => [],
    generateImageQueries: async () => [],
    searchImages: async () => [],
    searchCommonsImages: async () => [],
    fetchImageBytes: async () => ({ contentType: 'image/jpeg', buffer: Buffer.from('IMG') }),
    generateChoreography: async () => [],
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

describe('POST /api/narration', () => {
  it('缺 apiKey 返回 400', async () => {
    const res = await request(makeApp())
      .post('/api/narration')
      .send({ items: [{ nodeName: 'x', dayNumber: 1 }] })
    expect(res.status).toBe(400)
  })
  it('items 为空返回 400', async () => {
    const res = await request(makeApp()).post('/api/narration').send({ apiKey: 'sk', items: [] })
    expect(res.status).toBe(400)
  })
  it('正常返回 results', async () => {
    const app = makeApp({
      generateNarration: async ({ items }) => items.map((i) => ({ ...i, narration: '稿:' + i.nodeName })),
    })
    const res = await request(app)
      .post('/api/narration')
      .send({ apiKey: 'sk', items: [{ nodeName: '康定', dayNumber: 1 }] })
    expect(res.status).toBe(200)
    expect(res.body.results[0].narration).toBe('稿:康定')
  })
})

describe('POST /api/imageQuery', () => {
  it('缺 apiKey 返回 400', async () => {
    const res = await request(makeApp())
      .post('/api/imageQuery')
      .send({ nodes: [{ name: 'x' }] })
    expect(res.status).toBe(400)
  })
  it('nodes 为空返回 400', async () => {
    const res = await request(makeApp()).post('/api/imageQuery').send({ apiKey: 'sk', nodes: [] })
    expect(res.status).toBe(400)
  })
  it('正常返回 results', async () => {
    const app = makeApp({
      generateImageQueries: async ({ nodes }) =>
        nodes.map((n, i) => ({ index: i, queries: ['q:' + n.name], keywords: ['k'] })),
    })
    const res = await request(app)
      .post('/api/imageQuery')
      .send({ apiKey: 'sk', nodes: [{ name: '康定' }] })
    expect(res.status).toBe(200)
    expect(res.body.results[0].queries[0]).toBe('q:康定')
  })
  it('生成失败透传可读错误', async () => {
    const app = makeApp({
      generateImageQueries: async () => {
        throw new Error('AI 返回的不是有效 JSON，请重试')
      },
    })
    const res = await request(app)
      .post('/api/imageQuery')
      .send({ apiKey: 'sk', nodes: [{ name: 'x' }] })
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/JSON/)
  })
})

describe('POST /api/choreography', () => {
  it('缺 apiKey 返回 400', async () => {
    const res = await request(makeApp())
      .post('/api/choreography')
      .send({ nodes: [{ index: 0, narration: 'x', imageCount: 2 }] })
    expect(res.status).toBe(400)
  })
  it('nodes 为空返回 400', async () => {
    const res = await request(makeApp()).post('/api/choreography').send({ apiKey: 'sk', nodes: [] })
    expect(res.status).toBe(400)
  })
  it('正常返回 results', async () => {
    const app = makeApp({
      generateChoreography: async ({ nodes }) =>
        nodes.map((n) => ({ index: n.index, tempo: 'medium', phases: [{ at: 0, focus: 0 }], idle: {} })),
    })
    const res = await request(app)
      .post('/api/choreography')
      .send({ apiKey: 'sk', nodes: [{ index: 0, narration: '康定', imageCount: 2 }] })
    expect(res.status).toBe(200)
    expect(res.body.results[0]).toMatchObject({ index: 0, tempo: 'medium' })
  })
  it('生成失败透传可读错误', async () => {
    const app = makeApp({
      generateChoreography: async () => {
        throw new Error('AI 返回的不是有效 JSON，请重试')
      },
    })
    const res = await request(app)
      .post('/api/choreography')
      .send({ apiKey: 'sk', nodes: [{ index: 0, narration: 'x', imageCount: 2 }] })
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/JSON/)
  })
})

describe('GET /api/images/search', () => {
  it('缺 q 返回 400', async () => {
    const res = await request(makeApp()).get('/api/images/search')
    expect(res.status).toBe(400)
  })
  it('正常返回搜索结果数组', async () => {
    const app = makeApp({
      searchImages: async ({ q }) => [{ id: 1, tags: 'a', webformatURL: 'w', largeImageURL: 'l', pageURL: 'p:' + q }],
    })
    const res = await request(app).get('/api/images/search').query({ q: 'tibet', lang: 'zh' })
    expect(res.status).toBe(200)
    expect(res.body.results[0].pageURL).toBe('p:tibet')
  })
  it('缺 PIXABAY_KEY 时返回可读 500', async () => {
    const app = makeApp({
      searchImages: async () => {
        const err = new Error('服务端未配置 PIXABAY_KEY，请联系管理员在 .env 中设置')
        err.status = 500
        throw err
      },
    })
    const res = await request(app).get('/api/images/search').query({ q: 'tibet' })
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/PIXABAY_KEY/)
  })
})

describe('GET /api/images/commons', () => {
  it('returns Commons search results', async () => {
    const app = makeApp({ searchCommonsImages: async ({ q }) => [{ id: 'c1', provider: 'commons', title: q }] })
    const res = await request(app).get('/api/images/commons').query({ q: 'bridge' })
    expect(res.status).toBe(200)
    expect(res.body.results[0]).toMatchObject({ provider: 'commons', title: 'bridge' })
  })
})

describe('GET /api/images/fetch', () => {
  it('缺 url 返回 400', async () => {
    const res = await request(makeApp()).get('/api/images/fetch')
    expect(res.status).toBe(400)
  })
  it('非白名单域返回 400', async () => {
    const app = makeApp({
      fetchImageBytes: async () => {
        const err = new Error('仅允许代理 pixabay.com / cdn.pixabay.com 的图片地址')
        err.status = 400
        throw err
      },
    })
    const res = await request(app).get('/api/images/fetch').query({ url: 'https://evil.com/x.jpg' })
    expect(res.status).toBe(400)
  })
  it('正常代理返回图片字节', async () => {
    const app = makeApp({
      fetchImageBytes: async () => ({ contentType: 'image/png', buffer: Buffer.from('PNGDATA') }),
    })
    const res = await request(app)
      .get('/api/images/fetch')
      .query({ url: 'https://cdn.pixabay.com/photo/x.jpg' })
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/image\/png/)
    expect(res.body.toString()).toBe('PNGDATA')
  })
})
