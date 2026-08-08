import { describe, expect, it } from 'vitest'
import { createBenchmarkRunner } from './benchmarkRunner.js'
import { buildBenchmarkReport } from './report.js'

it('汇总首张精准图耗时时忽略没有精准结果的空时间', () => {
  const report = buildBenchmarkReport([
    { placeId: 'none', provider: 'a', exact: [], firstExactMs: null },
    { placeId: 'hit', provider: 'b', exact: [{ id: 'x' }], firstExactMs: 45 },
  ])

  expect(report.json.summary.firstExactMs).toBe(45)
})

describe('搜图基准报告', () => {
  it('生成可复核的基础摘要并区分逻辑查询与真实接口调用', () => {
    const report = buildBenchmarkReport([{
      placeId: 'bridge',
      placeName: '金沙江大桥（竹巴笼）',
      provider: 'openverse',
      exact: [],
      needsReview: [],
      rejected: [],
      errors: [],
      requestCount: 2,
      attemptCount: 4,
      retryCount: 2,
      timeoutCount: 1,
      statusCounts: { 429: 1, '5xx': 1, timeout: 1 },
      cacheHits: 3,
      elapsedMs: 120,
      firstExactMs: 45,
      threeExactMs: 90,
      batchElapsedMs: 150,
    }], {
      now: () => new Date('2026-08-07T01:02:03.000Z'),
      cachedRunElapsedMs: 25,
    })

    expect(report.json.generatedAt).toBe('2026-08-07T01:02:03.000Z')
    expect(report.json.summary).toMatchObject({
      places: 1,
      logicalQueries: 2,
      attemptCount: 4,
      retries: 2,
      timeouts: 1,
      statusCounts: { 429: 1, '5xx': 1, timeout: 1 },
      cacheHits: 3,
      firstExactMs: 45,
      threeExactMs: 90,
      batchElapsedMs: 150,
      cachedRunElapsedMs: 25,
    })
    expect(report.json.summary).not.toHaveProperty('totalElapsedMs')
    expect(report.json.releaseGate).toEqual({ passed: true, reasons: [] })
    expect(report.markdown).toContain('接口调用总数：4')
    expect(report.markdown).toContain('逻辑查询数：2')
    expect(report.markdown).toContain('金沙江大桥（竹巴笼）')
    expect(report.markdown).toContain('| 达到三张精准图片时间(ms) | 90 |')
    expect(report.markdown).toContain('| 整批真实墙钟耗时(ms) | 150 |')
    expect(report.markdown).toContain('| 缓存复跑耗时(ms) | 25 |')
    expect(report.markdown).not.toContain('| 总耗时(ms) |')
  })

  it.each([
    { identityReason: 'negative-evidence' },
    { negativeEvidence: ['London'] },
    { negativeEvidence: 'London' },
    { matchedNegativeTerms: ['London'] },
    { identityEvidence: [{ type: 'negative-evidence', value: 'Tower Bridge' }] },
    { identityEvidence: { checks: [{ matchedNegativeTerms: ['Tower Bridge'] }] } },
  ])('任何负面身份凭据进入 exact 都会触发发布硬闸门', (item) => {
    let thrown
    try {
      buildBenchmarkReport([{
        placeId: 'bridge', placeName: '金沙江大桥', provider: 'bad', exact: [item],
        needsReview: [], rejected: [], errors: [],
      }])
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect(thrown.message).toMatch(/negative candidate entered exact/i)
    expect(thrown.report.json.releaseGate.passed).toBe(false)
    expect(thrown.report.json.releaseGate.reasons).not.toHaveLength(0)
  })

  it('汇总启用、跳过、失败来源，并按优先级标记每行状态', () => {
    const base = { placeId: 'p', placeName: '地点', requestCount: 0, attemptCount: 0 }
    const report = buildBenchmarkReport([
      { ...base, provider: 'pixabay', exact: [{ id: 'e' }], needsReview: [{ id: 'r' }], rejected: [], errors: [] },
      { ...base, provider: 'commons', exact: [], needsReview: [{ id: 'r' }], rejected: [], errors: [] },
      { ...base, provider: 'openverse', exact: [], needsReview: [], rejected: [{ id: 'x' }], errors: [] },
      { ...base, provider: 'brave', exact: [], needsReview: [], rejected: [], errors: [], skipped: 'missing-key' },
      { ...base, provider: 'mapillary', exact: [], needsReview: [], rejected: [], errors: [{ status: 503, message: 'down' }] },
    ])

    expect(report.json.sources).toEqual({
      enabled: ['commons', 'mapillary', 'openverse', 'pixabay'],
      skipped: ['brave'],
      failed: ['mapillary'],
    })
    expect(report.json.rows.map((row) => row.status)).toEqual([
      '精准匹配', '待人工确认', '已拒绝', '来源未执行', '素材不足',
    ])
    expect(report.markdown).toContain('启用来源：commons、mapillary、openverse、pixabay')
    expect(report.markdown).toContain('跳过来源：brave')
    expect(report.markdown).toContain('失败来源：mapillary')
    for (const label of ['精准匹配', '待人工确认', '已拒绝', '素材不足', '来源未执行']) {
      expect(report.markdown).toContain(label)
    }
  })

  it('逐地点列出候选身份凭据、来源页、作者、许可和最终错误', () => {
    const report = buildBenchmarkReport([{
      placeId: 'midui', placeName: '米堆冰川', provider: 'commons', elapsedMs: 88,
      exact: [{
        id: 'photo-1', title: '米堆冰川全景', identityReason: 'name-and-context-evidence',
        identityEvidence: ['name', 'context'], sourcePage: 'https://example.com/source',
        author: '摄影者甲', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      }],
      needsReview: [], rejected: [],
      errors: [{ query: '米堆冰川', status: 503, message: 'temporary outage' }],
    }])

    for (const expected of [
      '米堆冰川全景', 'name-and-context-evidence', 'name、context', '摄影者甲',
      '[来源页](https://example.com/source)',
      '[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)',
      '503', 'temporary outage',
    ]) expect(report.markdown).toContain(expected)
  })

  it('固定输出20个地点分节以及无结果、待确认、来源未执行清单', () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({
      placeId: `p-${index}`,
      placeName: `地点${index + 1}`,
      provider: index === 3 ? 'brave' : 'pixabay',
      exact: index === 0 ? [{ id: 'exact' }] : [],
      needsReview: index === 1 ? [{ id: 'review' }] : [],
      rejected: index === 2 ? [{ id: 'rejected' }] : [],
      errors: [],
      skipped: index === 3 ? 'missing-key' : null,
    }))

    const report = buildBenchmarkReport(rows)

    for (let index = 1; index <= 20; index += 1) {
      expect(report.markdown.match(new RegExp(`^## 地点${index}$`, 'gm'))).toHaveLength(1)
    }
    expect(report.json.lists.needsReview).toEqual([
      expect.objectContaining({ placeId: 'p-1', provider: 'pixabay' }),
    ])
    expect(report.json.lists.unexecuted).toEqual([
      expect.objectContaining({ placeId: 'p-3', provider: 'brave', reason: 'missing-key' }),
    ])
    expect(report.json.lists.noResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ placeId: 'p-2', status: '已拒绝' }),
      expect.objectContaining({ placeId: 'p-4', status: '素材不足' }),
    ]))
    expect(report.markdown).toContain('### 无结果清单')
    expect(report.markdown).toContain('### 待人工确认清单')
    expect(report.markdown).toContain('### 来源未执行清单')
  })

  it('转义外部 Markdown 内容并从 Markdown 与 JSON 中清除密钥', () => {
    const report = buildBenchmarkReport([{
      placeId: 'unsafe', placeName: '坏|地点\n## 注入标题', provider: 'source|x',
      exact: [{
        id: 'x', title: '危险|标题\n[伪链接](https://evil.example)',
        identityReason: 'name-and-context-evidence', identityEvidence: ['name|context'],
        sourcePage: 'https://example.com/p_(x)?token=TOPSECRET&ok=1',
        author: '作者\n# 假标题', license: 'CC [BY](fake)',
        licenseUrl: 'javascript:alert(1)',
      }],
      needsReview: [], rejected: [],
      errors: [{ status: 500, message: 'Bearer sk-live-secret access_token=MAPSECRET' }],
    }])
    const serialized = JSON.stringify(report.json)

    expect(report.markdown).not.toContain('\n## 注入标题')
    expect(report.markdown).not.toContain('\n# 假标题')
    expect(report.markdown).toContain('坏\\|地点<br>## 注入标题')
    expect(report.markdown).toContain('危险\\|标题<br>\\[伪链接\\]\\(https://evil.example\\)')
    expect(report.markdown).toContain('https://example.com/p_%28x%29?ok=1')
    expect(report.markdown).not.toContain('javascript:')
    for (const secret of ['TOPSECRET', 'sk-live-secret', 'MAPSECRET']) {
      expect(report.markdown).not.toContain(secret)
      expect(serialized).not.toContain(secret)
    }
  })

  it('不修改输入，并返回与后续输入变更隔离的稳定 JSON 快照', () => {
    const rows = [{
      placeId: 'x', placeName: '节点', provider: 'pixabay',
      exact: [{ id: 'one', title: '原始标题', identityEvidence: ['name'] }],
      needsReview: [], rejected: [], errors: [], statusCounts: { 429: 1 },
    }]
    const original = structuredClone(rows)
    const now = () => new Date('2026-08-07T00:00:00.000Z')
    const report = buildBenchmarkReport(rows, { now })
    const snapshot = JSON.stringify(report.json)

    expect(rows).toEqual(original)
    expect(buildBenchmarkReport(rows, { now }).json).toEqual(report.json)
    rows[0].exact[0].title = '后来修改'
    rows[0].errors.push({ message: '后来错误' })
    expect(JSON.stringify(report.json)).toBe(snapshot)
    expect(report.json.rows[0].exact[0].title).toBe('原始标题')
  })

  it('空输入和缺字段行仍安全生成可诊断报告', () => {
    const empty = buildBenchmarkReport(undefined, { now: () => 'invalid-date' })
    expect(empty.json.summary).toMatchObject({
      places: 0, sources: 0, logicalQueries: 0, attemptCount: 0, finalErrors: 0,
    })
    expect(empty.json.generatedAt).toBe('1970-01-01T00:00:00.000Z')
    expect(empty.markdown).toContain('### 无结果清单')

    expect(() => buildBenchmarkReport([null, 42, { placeName: '只有名称' }]))
      .not.toThrow()
    expect(() => buildBenchmarkReport([], null)).not.toThrow()
    const nullOptions = buildBenchmarkReport([], { sourceStatus: null, cachedRunElapsedMs: null })
    expect(nullOptions.json.summary.cachedRunElapsedMs).toBeNull()
    expect(nullOptions.markdown).toContain('| 缓存复跑耗时(ms) | 无 |')
  })

  it('不根据标题类别猜测负例，发布闸门只读取明确身份凭据', () => {
    const report = buildBenchmarkReport([{
      placeId: 'bridge', placeName: '某桥', provider: 'source',
      exact: [{ title: 'London Tower Bridge', identityReason: 'name-and-context-evidence' }],
      needsReview: [], rejected: [], errors: [],
    }])

    expect(report.json.releaseGate).toEqual({ passed: true, reasons: [] })
  })

  it('地点总状态跨来源聚合时 exact 优先于 review，跳过来源仍单独显示', () => {
    const common = { placeId: 'p', placeName: '聚合地点', rejected: [], errors: [] }
    const report = buildBenchmarkReport([
      { ...common, provider: 'commons', exact: [], needsReview: [{ id: 'review' }] },
      { ...common, provider: 'pixabay', exact: [{ id: 'exact' }], needsReview: [] },
      { ...common, provider: 'brave', exact: [], needsReview: [], skipped: 'missing-key' },
    ])

    expect(report.json.places).toEqual([
      expect.objectContaining({ placeId: 'p', placeName: '聚合地点', status: '精准匹配' }),
    ])
    expect(report.markdown).toContain('地点状态：精准匹配')
    expect(report.markdown).toContain('brave：来源未执行')
  })

  it('仅将身份精准且来源与许可证据完整的图片计为 direct-use', () => {
    const report = buildBenchmarkReport([{
      placeId: 'p', placeName: '节点', provider: 'pixabay',
      exact: [
        {
          id: 'direct', title: '完整图片', imageUrl: 'https://img.example/direct.jpg',
          sourcePage: 'https://pixabay.com/photos/direct', license: 'Pixabay Content License',
          licenseUrl: 'https://pixabay.com/service/terms/',
        },
        {
          id: 'discovery', title: '许可链接缺失', imageUrl: 'https://img.example/discovery.jpg',
          sourcePage: 'https://example.com/discovery', license: '未知许可', licenseUrl: '',
        },
        {
          id: 'unsafe-url', title: '链接含凭据', imageUrl: 'https://img.example/unsafe.jpg',
          sourcePage: 'https://example.com/unsafe?token=secret', license: 'CC BY 4.0',
          licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        },
      ],
      needsReview: [{ id: 'review', imageUrl: 'https://img.example/review.jpg' }],
      rejected: [], errors: [],
    }])

    expect(report.json.summary).toMatchObject({
      directUseCandidates: 1,
      discoveryOnlyCandidates: 2,
    })
    expect(report.json.usage.directUseCandidates).toEqual([
      expect.objectContaining({ candidateId: 'direct', placeId: 'p', provider: 'pixabay' }),
    ])
    expect(report.json.usage.discoveryOnlyCandidates).toEqual([
      expect.objectContaining({ candidateId: 'discovery' }),
      expect.objectContaining({ candidateId: 'unsafe-url' }),
    ])
    expect(report.markdown).toContain('可直接使用候选：1')
    expect(report.markdown).toContain('仅发现候选：2')
    expect(report.markdown).toContain('仍须逐图遵守许可条款、署名要求及第三方权利限制')
  })

  it('缓存命中的最终失败仍将来源列为失败且不重复 finalErrors', async () => {
    const runner = createBenchmarkRunner({
      providers: [{
        name: 'fake',
        search: async () => { throw Object.assign(new Error('bad query'), { status: 400 }) },
      }],
      concurrency: 2,
    })
    const rows = await runner.run([{ id: 'same' }, { id: 'same' }], () => ['q'])

    const report = buildBenchmarkReport(rows)

    expect(report.json.sources.failed).toEqual(['fake'])
    expect(report.json.summary.finalErrors).toBe(1)
    expect(report.json.rows.map((row) => row.hadFinalFailure)).toEqual([true, true])
  })

  it('直接消费 runner 的真实时间证据而不重新推算', async () => {
    let now = 0
    const place = {
      id: 'midui', canonicalName: '米堆冰川', aliases: [],
      adminPath: ['西藏自治区', '林芝市', '波密县'], nearbyLandmarks: [], roadRefs: [],
      negativeTerms: [], nodeType: 'natural-landmark', coordinates: null,
    }
    const runner = createBenchmarkRunner({
      providers: [{
        name: 'fake',
        search: async () => {
          now = 30
          return { candidates: ['one', 'two', 'three'].map((id) => ({
            id, provider: 'fake', title: '米堆冰川', description: '波密县',
            imageUrl: `https://img.example/${id}.jpg`,
          })) }
        },
      }],
      clock: () => now,
    })
    const rows = await runner.run([place], () => ['q'])

    const report = buildBenchmarkReport(rows, { cachedRunElapsedMs: 4 })

    expect(report.json.summary).toMatchObject({
      firstExactMs: 30, threeExactMs: 30, batchElapsedMs: 30, cachedRunElapsedMs: 4,
    })
    expect(report.json.rows[0]).toMatchObject({
      firstExactMs: 30, threeExactMs: 30, batchElapsedMs: 30,
    })
  })
})
