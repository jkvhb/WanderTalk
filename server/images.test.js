import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeImageQueryGenerator, searchImages, fetchImageBytes, isAllowedImageHost, clearSearchCache } from './images'

describe('makeImageQueryGenerator（DeepSeek 批量生成检索词）', () => {
  it('解析 LLM 的 JSON 输出为按节点的 queries/keywords', async () => {
    const gen = makeImageQueryGenerator({
      callLLM: async () =>
        JSON.stringify({
          results: [
            {
              index: 0,
              queries: ['稻城亚丁', 'Yading', '雪山草甸', '川西高原'],
              keywords: ['yading', 'daocheng', '稻城'],
            },
          ],
        }),
    })
    const out = await gen({ apiKey: 'sk', nodes: [{ name: '稻城亚丁', address: '甘孜州', note: '' }] })
    expect(out[0]).toMatchObject({
      index: 0,
      queries: ['稻城亚丁', 'Yading', '雪山草甸', '川西高原'],
      keywords: ['yading', 'daocheng', '稻城'],
    })
  })

  it('兼容直接返回数组', async () => {
    const gen = makeImageQueryGenerator({
      callLLM: async () => '[{"index":0,"queries":["a"],"keywords":["a"]}]',
    })
    const out = await gen({ apiKey: 'sk', nodes: [{ name: 'x' }] })
    expect(out[0].index).toBe(0)
  })

  it('非 JSON 抛出可读错误', async () => {
    const gen = makeImageQueryGenerator({ callLLM: async () => '抱歉我不会' })
    await expect(gen({ apiKey: 'sk', nodes: [{ name: 'x' }] })).rejects.toThrow('JSON')
  })
})

describe('isAllowedImageHost（SSRF 白名单）', () => {
  it('允许 pixabay.com 与 cdn.pixabay.com', () => {
    expect(isAllowedImageHost('https://pixabay.com/api/')).toBe(true)
    expect(isAllowedImageHost('https://cdn.pixabay.com/photo/abc.jpg')).toBe(true)
  })

  it('允许子域', () => {
    expect(isAllowedImageHost('https://foo.pixabay.com/x.jpg')).toBe(true)
  })

  it('拒绝其他域', () => {
    expect(isAllowedImageHost('https://evil.com/pixabay.com')).toBe(false)
    expect(isAllowedImageHost('https://notpixabay.com/x.jpg')).toBe(false)
    expect(isAllowedImageHost('https://pixabay.com.evil.com/x.jpg')).toBe(false)
  })

  it('非法 URL 返回 false', () => {
    expect(isAllowedImageHost('not a url')).toBe(false)
    expect(isAllowedImageHost('')).toBe(false)
  })
})

describe('searchImages（Pixabay 搜索代理）', () => {
  beforeEach(() => {
    clearSearchCache()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('只回传裁剪字段，且带 24h 缓存（命中不重复 fetch）', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        hits: [
          {
            id: 1,
            tags: 'tibet, mountain',
            webformatURL: 'w1',
            largeImageURL: 'l1',
            pageURL: 'p1',
            extraField: 'should be dropped',
          },
        ],
      }),
    }))
    const results1 = await searchImages({ apiKey: 'pk', q: 'tibet', lang: 'zh' }, fetchMock)
    expect(results1).toEqual([{ id: 1, tags: 'tibet, mountain', webformatURL: 'w1', largeImageURL: 'l1', pageURL: 'p1' }])
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const results2 = await searchImages({ apiKey: 'pk', q: 'tibet', lang: 'zh' }, fetchMock)
    expect(results2).toEqual(results1)
    expect(fetchMock).toHaveBeenCalledTimes(1) // 缓存命中，未再次调用

    // 24h 后缓存过期，应重新调用
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1000)
    await searchImages({ apiKey: 'pk', q: 'tibet', lang: 'zh' }, fetchMock)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('不同 q 或 lang 不共享缓存', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ hits: [] }),
    }))
    await searchImages({ apiKey: 'pk', q: 'a', lang: 'zh' }, fetchMock)
    await searchImages({ apiKey: 'pk', q: 'b', lang: 'zh' }, fetchMock)
    await searchImages({ apiKey: 'pk', q: 'a', lang: 'en' }, fetchMock)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('缺少 PIXABAY_KEY 抛出可读错误（500）', async () => {
    const fetchMock = vi.fn()
    await expect(searchImages({ apiKey: '', q: 'tibet' }, fetchMock)).rejects.toThrow(/PIXABAY_KEY|key/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('上游错误透传可读信息', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({}),
      text: async () => 'Too Many Requests',
    }))
    await expect(searchImages({ apiKey: 'pk', q: 'tibet' }, fetchMock)).rejects.toThrow()
  })
})

describe('fetchImageBytes（图片字节下载代理）', () => {
  it('非白名单域拒绝（不发起请求）', async () => {
    const fetchMock = vi.fn()
    await expect(fetchImageBytes('https://evil.com/x.jpg', fetchMock)).rejects.toMatchObject({ status: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('白名单域正常代理，返回 content-type 与 buffer', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'image/jpeg']]),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }))
    const result = await fetchImageBytes('https://cdn.pixabay.com/photo/x.jpg', fetchMock)
    expect(result.contentType).toBe('image/jpeg')
    expect(Buffer.from(result.buffer)).toEqual(Buffer.from([1, 2, 3]))
  })
})
