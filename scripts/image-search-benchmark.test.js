import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { main, runImageSearchBenchmark } from './image-search-benchmark.js'

const places = Array.from({ length: 20 }, (_, index) => ({
  id: `place-${index + 1}`,
  canonicalName: `地点 ${index + 1}`,
}))

const makeRows = (batchElapsedMs, extra = {}) => places.flatMap((place) => [
  {
    placeId: place.id,
    placeName: place.canonicalName,
    provider: 'commons',
    exact: [], needsReview: [], rejected: [], errors: [],
    requestCount: 1, attemptCount: 1, upstreamAttemptCount: 1,
    batchElapsedMs,
    ...extra,
  },
])

function fakeFactories() {
  return Object.fromEntries(['pixabay', 'commons', 'openverse', 'brave', 'mapillary'].map((name) => [
    name,
    vi.fn((options = {}) => ({ name, options, search: vi.fn() })),
  ]))
}

function memoryFs() {
  const files = new Map()
  return {
    files,
    mkdir: vi.fn(async () => {}),
    writeFile: vi.fn(async (file, contents) => { files.set(file, contents) }),
    rename: vi.fn(async (from, to) => {
      files.set(to, files.get(from))
      files.delete(from)
    }),
    unlink: vi.fn(async (file) => { files.delete(file) }),
  }
}

describe('图片来源基准 CLI', () => {
  it('dry-run 只验证 20 个地点，严格不创建来源、不联网、不写文件', async () => {
    const providerFactories = fakeFactories()
    const runnerFactory = vi.fn()
    const reportBuilder = vi.fn()
    const fs = memoryFs()

    const result = await runImageSearchBenchmark({
      dryRun: true,
      places,
      providerFactories,
      runnerFactory,
      reportBuilder,
      fs,
    })

    expect(result).toMatchObject({
      dryRun: true,
      places: 20,
      logicalQueries: 0,
      providerAttempts: 0,
      upstreamRequests: 0,
      networkRequests: 0,
    })
    expect(Object.values(providerFactories).every((factory) => factory.mock.calls.length === 0)).toBe(true)
    expect(runnerFactory).not.toHaveBeenCalled()
    expect(reportBuilder).not.toHaveBeenCalled()
    expect(fs.writeFile).not.toHaveBeenCalled()
  })

  it('创建五个来源，公共来源启用，缺凭据来源由适配器标记跳过', async () => {
    const providerFactories = fakeFactories()
    const runner = { run: vi.fn().mockResolvedValue(makeRows(12)) }
    const fs = memoryFs()
    const reportBuilder = vi.fn(() => ({
      markdown: '# report\n',
      json: {
        releaseGate: { passed: true, reasons: [] },
        sources: { enabled: ['commons', 'openverse'], skipped: ['pixabay', 'brave', 'mapillary'], failed: [] },
        summary: { logicalQueries: 20, attemptCount: 20, upstreamAttemptCount: 20 },
      },
    }))

    const result = await runImageSearchBenchmark({
      env: {}, places, providerFactories,
      runnerFactory: vi.fn(() => runner), reportBuilder, fs,
      outputDir: 'out',
    })

    expect(Object.keys(providerFactories)).toHaveLength(5)
    expect(providerFactories.pixabay).toHaveBeenCalledWith(expect.objectContaining({ apiKey: undefined }))
    expect(providerFactories.brave).toHaveBeenCalledWith(expect.objectContaining({ apiKey: undefined }))
    expect(providerFactories.mapillary).toHaveBeenCalledWith(expect.objectContaining({ accessToken: undefined }))
    expect(result.sources).toEqual({ enabled: ['commons', 'openverse'], skipped: ['pixabay', 'brave', 'mapillary'], failed: [] })
  })

  it('同一 runner 先冷跑再暖跑，并把暖跑墙钟时间写入冷跑报告', async () => {
    const coldRows = makeRows(120)
    const warmRows = makeRows(9, { cacheHits: 1, requestCount: 0, attemptCount: 0, upstreamAttemptCount: 0 })
    const runner = { run: vi.fn().mockResolvedValueOnce(coldRows).mockResolvedValueOnce(warmRows) }
    const reportBuilder = vi.fn(() => ({
      markdown: '# report\n',
      json: {
        releaseGate: { passed: true, reasons: [] },
        sources: { enabled: ['commons'], skipped: [], failed: [] },
        summary: { logicalQueries: 20, attemptCount: 24, upstreamAttemptCount: 27 },
      },
    }))

    const result = await runImageSearchBenchmark({
      places,
      providerFactories: fakeFactories(),
      runnerFactory: vi.fn(() => runner),
      reportBuilder,
      fs: memoryFs(), outputDir: 'out',
    })

    expect(runner.run).toHaveBeenCalledTimes(2)
    expect(runner.run.mock.calls[0][0]).toBe(places)
    expect(runner.run.mock.calls[1][0]).toBe(places)
    expect(reportBuilder).toHaveBeenCalledWith(coldRows, expect.objectContaining({ cachedRunElapsedMs: 9 }))
    expect(result).toMatchObject({
      logicalQueries: 20,
      providerAttempts: 24,
      upstreamRequests: 27,
      networkRequests: 27,
    })
  })

  it('成功通过发布闸门后才原子写入固定名称的 Markdown 与 JSON', async () => {
    const fs = memoryFs()
    const report = {
      markdown: '# 精准搜图报告\n',
      json: {
        releaseGate: { passed: true, reasons: [] },
        sources: { enabled: ['commons'], skipped: [], failed: [] },
        summary: { logicalQueries: 1, attemptCount: 1, upstreamAttemptCount: 1 },
      },
    }
    const runner = { run: vi.fn().mockResolvedValue(makeRows(5)) }

    const result = await runImageSearchBenchmark({
      places,
      providerFactories: fakeFactories(),
      runnerFactory: vi.fn(() => runner),
      reportBuilder: vi.fn(() => report),
      fs, outputDir: 'reports',
    })

    const md = path.join('reports', '2026-08-06-image-search-source-benchmark.md')
    const json = path.join('reports', '2026-08-06-image-search-source-benchmark.json')
    expect(fs.files.get(md)).toBe(report.markdown)
    expect(JSON.parse(fs.files.get(json))).toEqual(report.json)
    expect(result.files).toEqual({ markdown: md, json })
    expect(fs.rename).toHaveBeenCalledTimes(2)
  })

  it('发布闸门失败时不写任何临时文件或正式报告', async () => {
    const fs = memoryFs()
    const runner = { run: vi.fn().mockResolvedValue(makeRows(5)) }
    const gateError = Object.assign(new Error('negative candidate entered exact'), {
      report: { json: { releaseGate: { passed: false } } },
    })

    await expect(runImageSearchBenchmark({
      places,
      providerFactories: fakeFactories(),
      runnerFactory: vi.fn(() => runner),
      reportBuilder: vi.fn(() => { throw gateError }),
      fs, outputDir: 'reports',
    })).rejects.toThrow('negative candidate entered exact')

    expect(fs.writeFile).not.toHaveBeenCalled()
    expect(fs.rename).not.toHaveBeenCalled()
    expect(fs.files.size).toBe(0)
  })

  it('runner 默认并发为 4，Pixabay 凭据仅传给对应来源', async () => {
    const providerFactories = fakeFactories()
    const runner = { run: vi.fn().mockResolvedValue(makeRows(1)) }
    const runnerFactory = vi.fn(() => runner)

    await runImageSearchBenchmark({
      env: { PIXABAY_KEY: 'pix-secret' }, places, providerFactories, runnerFactory,
      reportBuilder: vi.fn(() => ({
        markdown: 'ok',
        json: { releaseGate: { passed: true }, sources: {}, summary: {} },
      })),
      fs: memoryFs(), outputDir: 'out',
    })

    expect(runnerFactory).toHaveBeenCalledWith(expect.objectContaining({ concurrency: 4 }))
    expect(providerFactories.pixabay).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'pix-secret' }))
    for (const name of ['commons', 'openverse', 'brave', 'mapillary']) {
      expect(JSON.stringify(providerFactories[name].mock.calls)).not.toContain('pix-secret')
    }
  })

  it('命令行只打印来源状态与计数，不打印任何密钥内容', async () => {
    const messages = []
    const runBenchmark = vi.fn(async () => ({
      dryRun: false,
      places: 20,
      sources: { enabled: ['pixabay', 'commons'], skipped: ['brave'], failed: ['mapillary'] },
      logicalQueries: 40,
      providerAttempts: 44,
      upstreamRequests: 48,
    }))
    const loadEnv = vi.fn()

    await main({
      argv: [],
      logger: { log: (message) => messages.push(message) },
      loadEnv,
      runBenchmark,
    })

    expect(loadEnv).toHaveBeenCalledOnce()
    expect(runBenchmark).toHaveBeenCalledOnce()
    expect(messages.join('\n')).toContain('HTTP 上游请求：48')
    expect(messages.join('\n')).not.toMatch(/key|token|secret|sk-/i)
  })
})
