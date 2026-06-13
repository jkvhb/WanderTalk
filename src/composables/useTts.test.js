import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock 时长测量，避免依赖真实音频解码
vi.mock('./audioDuration', () => ({ getAudioDuration: vi.fn(async () => 1.5) }))

import { synthesize, VOICES } from './useTts'

describe('useTts', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('VOICES 含三种音色', () => {
    expect(VOICES.map((v) => v.slug)).toEqual(['xiaoxiao', 'yunxi', 'xiaoyi'])
  })

  it('首次合成调用 /api/tts 并写缓存，二次命中缓存不再请求', async () => {
    const fetchMock = vi.fn(
      async () => new Response(new Blob(['AUDIO'], { type: 'audio/mpeg' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const args = { text: '独一无二的文案', voice: 'xiaoxiao', rate: 1 }
    const a = await synthesize(args)
    expect(a.duration).toBe(1.5)
    expect(a.blob).toBeInstanceOf(Blob)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const b = await synthesize(args)
    expect(fetchMock).toHaveBeenCalledTimes(1) // 命中缓存
    expect(b.duration).toBe(1.5)
  })

  it('后端报错时抛出可读信息', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'edge-tts 失败' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(synthesize({ text: '会失败的文案xyz', voice: 'yunxi', rate: 1.2 })).rejects.toThrow(
      'edge-tts 失败',
    )
  })
})
