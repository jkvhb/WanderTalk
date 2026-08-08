import { describe, expect, it, vi } from 'vitest'
import { createBenchmarkRunner } from './benchmarkRunner.js'

it('分别统计来源搜索尝试与真实上游 HTTP 调用', async () => {
  const provider = {
    name: 'split-source',
    upstreamAttemptCount: () => 2,
    search: async () => ({ candidates: [] }),
  }
  const runner = createBenchmarkRunner({ providers: [provider] })
  const [row] = await runner.run([{ id: 'edge' }], () => ['q'])

  expect(row).toMatchObject({ attemptCount: 1, upstreamAttemptCount: 2 })
})
import { createMapillaryProvider } from './providers.js'

describe('搜图基准执行器', () => {
  it('记录每行首次/三张精准图时间和整批真实墙钟时间', async () => {
    let now = 0
    const place = {
      id: 'midui', canonicalName: '米堆冰川', aliases: [],
      adminPath: ['西藏自治区', '林芝市', '波密县'], nearbyLandmarks: [], roadRefs: [],
      negativeTerms: [], nodeType: 'natural-landmark', coordinates: null,
    }
    const exact = (id) => ({
      id, provider: 'fake', title: '米堆冰川', description: '波密县',
      imageUrl: `https://img.example/${id}.jpg`,
    })
    const search = vi.fn(async ({ query }) => {
      now += query === 'first' ? 20 : 30
      return { candidates: query === 'first' ? [exact('one')] : [exact('two'), exact('three')] }
    })
    const runner = createBenchmarkRunner({
      providers: [{ name: 'fake', search }],
      clock: () => now,
    })

    const [row] = await runner.run([place], () => ['first', 'second'])

    expect(row).toMatchObject({
      firstExactMs: 20,
      threeExactMs: 50,
      batchElapsedMs: 50,
      elapsedMs: 50,
    })
  })

  it('并发批次总墙钟时间不等于各行耗时之和', async () => {
    vi.useFakeTimers()
    try {
      const search = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
        return { candidates: [] }
      })
      const runner = createBenchmarkRunner({
        providers: [{ name: 'fake', search }], concurrency: 2,
      })

      const running = runner.run([{ id: 'a' }, { id: 'b' }], () => ['q'])
      await vi.advanceTimersByTimeAsync(100)
      const rows = await running

      expect(rows.map((row) => row.elapsedMs)).toEqual([100, 100])
      expect(rows.map((row) => row.batchElapsedMs)).toEqual([100, 100])
      expect(rows[0].batchElapsedMs).not.toBe(rows.reduce((sum, row) => sum + row.elapsedMs, 0))
    } finally {
      vi.useRealTimers()
    }
  })

  it('缓存合并请求仍为每行记录本次实际等待时间', async () => {
    let now = 0
    let release
    const pending = new Promise((resolve) => { release = resolve })
    const place = {
      id: 'midui', canonicalName: '米堆冰川', aliases: [],
      adminPath: ['西藏自治区', '林芝市', '波密县'], nearbyLandmarks: [], roadRefs: [],
      negativeTerms: [], nodeType: 'natural-landmark', coordinates: null,
    }
    const search = vi.fn(() => pending)
    const runner = createBenchmarkRunner({
      providers: [{ name: 'fake', search }], concurrency: 2, clock: () => now,
    })

    const running = runner.run([place, { ...place }], () => ['same'])
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1))
    now = 40
    release({ candidates: [{
      id: 'one', provider: 'fake', title: '米堆冰川', description: '波密县',
      imageUrl: 'https://img.example/one.jpg',
    }] })
    const rows = await running

    expect(rows.map((row) => row.elapsedMs)).toEqual([40, 40])
    expect(rows.map((row) => row.firstExactMs)).toEqual([40, 40])
    expect(rows.reduce((sum, row) => sum + row.cacheHits, 0)).toBe(1)
  })

  it('缓存命中的最终失败保留行失败状态但不重复统计错误和调用', async () => {
    const search = vi.fn(async () => { throw Object.assign(new Error('bad query'), { status: 400 }) })
    const runner = createBenchmarkRunner({
      providers: [{ name: 'fake', search }], concurrency: 2,
    })

    const rows = await runner.run([{ id: 'same' }, { id: 'same' }], () => ['q'])

    expect(rows.map((row) => row.hadFinalFailure)).toEqual([true, true])
    expect(rows.map((row) => row.failedQueryCount)).toEqual([1, 1])
    expect(rows.reduce((sum, row) => sum + row.errors.length, 0)).toBe(1)
    expect(rows.reduce((sum, row) => sum + row.attemptCount, 0)).toBe(1)
    expect(rows.reduce((sum, row) => sum + row.requestCount, 0)).toBe(1)
  })

  it('同一来源、地点和查询的并发请求只访问上游一次', async () => {
    let release
    const pending = new Promise((resolve) => { release = resolve })
    const search = vi.fn(async () => {
      await pending
      return { candidates: [], elapsedMs: 5 }
    })
    const runner = createBenchmarkRunner({ providers: [{ name: 'fake', search }], concurrency: 2 })

    const first = runner.searchOnce({ query: '米堆冰川 林芝', place: { id: 'midui' } }, 'fake')
    const second = runner.searchOnce({ query: '米堆冰川 林芝', place: { id: 'midui' } }, 'fake')
    release()

    const [firstResult, secondResult] = await Promise.all([first, second])
    expect(search).toHaveBeenCalledTimes(1)
    expect(firstResult.cacheHit).toBe(false)
    expect(secondResult.cacheHit).toBe(true)
  })

  it('429 与 5xx 按指数退避重试，并在缓存命中时保留真实重试次数', async () => {
    const search = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('busy'), { status: 429 }))
      .mockRejectedValueOnce(Object.assign(new Error('down'), { status: 503 }))
      .mockResolvedValueOnce({ candidates: [], elapsedMs: 8 })
    const sleep = vi.fn(async () => {})
    const runner = createBenchmarkRunner({ providers: [{ name: 'fake', search }], retries: 2, sleep })
    const input = { query: 'x', place: { id: 'a' } }

    const fresh = await runner.searchOnce(input, 'fake')
    const cached = await runner.searchOnce(input, 'fake')

    expect(search).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([300, 600])
    expect(fresh).toMatchObject({ retryCount: 2, cacheHit: false })
    expect(cached).toMatchObject({ retryCount: 2, cacheHit: true })
  })

  it('永久错误不重试，并转换为结构化结果而不是拒绝整个任务', async () => {
    const search = vi.fn(async () => { throw Object.assign(new Error('bad request'), { status: 400 }) })
    const sleep = vi.fn(async () => {})
    const runner = createBenchmarkRunner({ providers: [{ name: 'fake', search }], retries: 3, sleep })

    await expect(runner.searchOnce({ query: 'x', place: { id: 'a' } }, 'fake')).resolves.toMatchObject({
      error: 'bad request', status: 400, retryCount: 0, cacheHit: false,
    })
    expect(search).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('未知来源返回可诊断的结构化错误', async () => {
    const runner = createBenchmarkRunner({ providers: [] })

    await expect(runner.searchOnce({ query: 'x', place: { id: 'a' } }, 'missing')).resolves.toEqual({
      error: 'Unknown provider: missing',
      status: 500,
      attemptCount: 0,
      upstreamAttemptCount: 0,
      retryCount: 0,
      timeoutCount: 0,
      statusCounts: {},
      cacheHit: false,
    })
  })

  it('并发下限为 1，并稳定保持地点与来源的输入顺序', async () => {
    const slow = {
      name: 'slow',
      search: vi.fn(async ({ place }) => {
        await new Promise((resolve) => setTimeout(resolve, place.id === 'a' ? 5 : 0))
        return { candidates: [], elapsedMs: 1 }
      }),
    }
    const fast = { name: 'fast', search: vi.fn(async () => ({ candidates: [], elapsedMs: 1 })) }
    const runner = createBenchmarkRunner({ providers: [slow, fast], concurrency: 0 })

    const rows = await runner.run(
      [{ id: 'a', canonicalName: 'A' }, { id: 'b', canonicalName: 'B' }],
      () => ['query'],
    )

    expect(rows.map(({ placeId, provider }) => `${placeId}:${provider}`)).toEqual([
      'a:slow', 'a:fast', 'b:slow', 'b:fast',
    ])
  })

  it('只在收集到 3 张 exact 后停止后续查询，needs_review 不占配额', async () => {
    const place = {
      id: 'midui',
      canonicalName: '米堆冰川',
      aliases: [],
      adminPath: ['西藏自治区', '林芝市', '波密县'],
      nearbyLandmarks: [],
      roadRefs: [],
      negativeTerms: [],
      nodeType: 'natural-landmark',
      coordinates: null,
    }
    const exact = (id) => ({ id, title: '米堆冰川', description: '波密县', imageUrl: `https://img/${id}.jpg` })
    const review = (id) => ({ id, title: '米堆冰川', imageUrl: `https://img/${id}.jpg` })
    const search = vi.fn(async ({ query }) => ({
      candidates: query === 'q1'
        ? [exact('e1')]
        : query === 'q2'
          ? [review('r1'), review('r2')]
          : query === 'q3'
            ? [exact('e2'), exact('e3')]
            : [exact('must-not-run')],
      elapsedMs: 1,
    }))
    const runner = createBenchmarkRunner({ providers: [{ name: 'fake', search }] })

    const [row] = await runner.run([place], () => ['q1', 'q2', 'q3', 'q4'])

    expect(row.exact.map(({ id }) => id)).toEqual(['e1', 'e2', 'e3'])
    expect(row.needsReview.map(({ id }) => id)).toEqual(['r1', 'r2'])
    expect(search.mock.calls.map(([input]) => input.query)).toEqual(['q1', 'q2', 'q3'])
  })

  it('一个来源达到最终失败阈值后熔断，但其他来源和整次运行继续', async () => {
    const broken = {
      name: 'broken',
      search: vi.fn(async () => { throw Object.assign(new Error('down'), { status: 503 }) }),
    }
    const good = { name: 'good', search: vi.fn(async () => ({ candidates: [], elapsedMs: 1 })) }
    const runner = createBenchmarkRunner({
      providers: [broken, good],
      concurrency: 1,
      retries: 0,
      failureThreshold: 2,
      sleep: async () => {},
    })

    const rows = await runner.run(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      () => ['q'],
    )

    expect(broken.search).toHaveBeenCalledTimes(2)
    expect(good.search).toHaveBeenCalledTimes(4)
    expect(rows.filter((row) => row.provider === 'broken').map((row) => row.skipped)).toEqual([
      null, null, 'circuit-open', 'circuit-open',
    ])
    expect(rows.filter((row) => row.provider === 'good').every((row) => row.errors.length === 0)).toBe(true)
  })

  it('来源主动跳过的结果会在本次基准中缓存，不重复检查同一请求', async () => {
    const search = vi.fn(async () => ({ skipped: true, reason: 'missing-credentials' }))
    const runner = createBenchmarkRunner({ providers: [{ name: 'optional', search }] })
    const input = { query: 'x', place: { id: 'a' } }

    const first = await runner.searchOnce(input, 'optional')
    const second = await runner.searchOnce(input, 'optional')

    expect(first).toMatchObject({ skipped: true, reason: 'missing-credentials', cacheHit: false })
    expect(second).toMatchObject({ skipped: true, reason: 'missing-credentials', cacheHit: true })
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('批量执行不会超过配置的并发上限', async () => {
    let active = 0
    let maximum = 0
    const provider = (name) => ({
      name,
      search: vi.fn(async () => {
        active += 1
        maximum = Math.max(maximum, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
        return { candidates: [], elapsedMs: 5 }
      }),
    })
    const runner = createBenchmarkRunner({
      providers: [provider('one'), provider('two'), provider('three')],
      concurrency: 2,
    })

    await runner.run([{ id: 'a' }, { id: 'b' }], () => ['q'])

    expect(maximum).toBe(2)
  })

  it('同一来源的不同地点可以用满 run 的并发额度', async () => {
    let active = 0
    let maximum = 0
    let barrierOpen = false
    const waiters = []
    const search = vi.fn(async () => {
      active += 1
      maximum = Math.max(maximum, active)
      await new Promise((resolve) => {
        if (barrierOpen) resolve()
        else waiters.push(resolve)
      })
      active -= 1
      return { candidates: [], elapsedMs: 1 }
    })
    const runner = createBenchmarkRunner({ providers: [{ name: 'one', search }], concurrency: 3 })

    const running = runner.run([{ id: 'a' }, { id: 'b' }, { id: 'c' }], () => ['q'])
    let barrierError
    try {
      await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(3), { timeout: 200 })
    } catch (error) {
      barrierError = error
    } finally {
      barrierOpen = true
      waiters.splice(0).forEach((resolve) => resolve())
    }
    await running
    if (barrierError) throw barrierError

    expect(maximum).toBe(3)
  })

  it('缓存仅属于当前基准执行器，不会跨实例共享', async () => {
    const search = vi.fn(async () => ({ candidates: [], elapsedMs: 1 }))
    const provider = { name: 'pixabay', search }
    const firstRunner = createBenchmarkRunner({ providers: [provider] })
    const secondRunner = createBenchmarkRunner({ providers: [provider] })
    const input = { query: '金沙江大桥 竹巴笼', place: { id: 'bridge' } }

    await firstRunner.searchOnce(input, 'pixabay')
    await firstRunner.searchOnce(input, 'pixabay')
    await secondRunner.searchOnce(input, 'pixabay')

    expect(search).toHaveBeenCalledTimes(2)
  })

  it('熔断只统计连续最终失败，成功会重置连续失败次数', async () => {
    const search = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('temporary'), { status: 503 }))
      .mockResolvedValueOnce({ candidates: [], elapsedMs: 1 })
      .mockRejectedValueOnce(Object.assign(new Error('final-a'), { status: 400 }))
      .mockResolvedValueOnce({ candidates: [], elapsedMs: 1 })
      .mockRejectedValueOnce(Object.assign(new Error('final-c'), { status: 400 }))
      .mockRejectedValueOnce(Object.assign(new Error('final-d'), { status: 400 }))
    const runner = createBenchmarkRunner({
      providers: [{ name: 'fake', search }],
      retries: 1,
      failureThreshold: 2,
      sleep: async () => {},
    })

    await expect(runner.searchOnce({ query: 'retry-success', place: { id: 'a' } }, 'fake'))
      .resolves.not.toHaveProperty('error')
    await expect(runner.searchOnce({ query: 'final-a', place: { id: 'b' } }, 'fake'))
      .resolves.toMatchObject({ error: 'final-a' })
    await expect(runner.searchOnce({ query: 'success-between', place: { id: 'c' } }, 'fake'))
      .resolves.not.toHaveProperty('error')
    await expect(runner.searchOnce({ query: 'final-c', place: { id: 'd' } }, 'fake'))
      .resolves.toMatchObject({ error: 'final-c' })
    await expect(runner.searchOnce({ query: 'final-d', place: { id: 'e' } }, 'fake'))
      .resolves.toMatchObject({ error: 'final-d' })
    await expect(runner.searchOnce({ query: 'after-open', place: { id: 'f' } }, 'fake'))
      .resolves.toMatchObject({ skipped: true, reason: 'circuit-open' })
    expect(search).toHaveBeenCalledTimes(6)
  })

  it('同一候选图跨查询重复出现时只计作一张 exact', async () => {
    const place = {
      id: 'midui', canonicalName: '米堆冰川', aliases: [],
      adminPath: ['西藏自治区', '林芝市', '波密县'], nearbyLandmarks: [], roadRefs: [],
      negativeTerms: [], nodeType: 'natural-landmark', coordinates: null,
    }
    const exact = (id) => ({ id, title: '米堆冰川', description: '波密县', imageUrl: `https://img/${id}.jpg` })
    const search = vi.fn(async ({ query }) => ({
      candidates: query === 'q1' ? [exact('e1')]
        : query === 'q2' ? [exact('e1')]
          : [exact('e2'), exact('e3')],
      elapsedMs: 1,
    }))
    const runner = createBenchmarkRunner({ providers: [{ name: 'fake', search }] })

    const [row] = await runner.run([place], () => ['q1', 'q2', 'q3'])

    expect(row.exact.map(({ id }) => id)).toEqual(['e1', 'e2', 'e3'])
    expect(search).toHaveBeenCalledTimes(3)
  })

  it('缓存命中不重复累计此前请求的 retryCount 和 requestCount', async () => {
    const search = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('busy'), { status: 429 }))
      .mockRejectedValueOnce(Object.assign(new Error('down'), { status: 503 }))
      .mockResolvedValueOnce({ candidates: [], elapsedMs: 1 })
    const runner = createBenchmarkRunner({
      providers: [{ name: 'fake', search }],
      retries: 2,
      sleep: async () => {},
    })

    const [freshRow, cachedRow] = await runner.run([{ id: 'a' }, { id: 'a' }], () => ['same', 'same'])

    expect(freshRow).toMatchObject({
      requestCount: 1,
      attemptCount: 3,
      retryCount: 2,
      timeoutCount: 0,
      statusCounts: { 429: 1, '5xx': 1 },
      cacheHits: 0,
    })
    expect(cachedRow).toMatchObject({
      requestCount: 0,
      attemptCount: 0,
      retryCount: 0,
      timeoutCount: 0,
      statusCounts: {},
      cacheHits: 1,
      errors: [],
    })
    expect(search).toHaveBeenCalledTimes(3)
  })

  it('并发请求按完成顺序计算连续失败，不等待更早的悬挂请求', async () => {
    const deferred = () => {
      let resolve
      let reject
      const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
      })
      return { promise, resolve, reject }
    }
    const firstSuccess = deferred()
    const secondFailure = deferred()
    const thirdFailure = deferred()
    const pending = { first: firstSuccess, second: secondFailure, third: thirdFailure }
    const search = vi.fn(({ query }) => pending[query]?.promise
      || Promise.resolve({ candidates: [], elapsedMs: 1 }))
    const runner = createBenchmarkRunner({
      providers: [{ name: 'fake', search }], retries: 0, failureThreshold: 2,
    })

    const first = runner.searchOnce({ query: 'first', place: { id: 'a' } }, 'fake')
    const second = runner.searchOnce({ query: 'second', place: { id: 'b' } }, 'fake')
    const third = runner.searchOnce({ query: 'third', place: { id: 'c' } }, 'fake')
    secondFailure.reject(Object.assign(new Error('second'), { status: 400 }))
    thirdFailure.reject(Object.assign(new Error('third'), { status: 400 }))
    await Promise.all([second, third])

    const after = await runner.searchOnce({ query: 'after', place: { id: 'd' } }, 'fake')
    firstSuccess.resolve({ candidates: [], elapsedMs: 1 })
    await first

    expect(after).toMatchObject({ skipped: true, reason: 'circuit-open' })
    expect(search).toHaveBeenCalledTimes(3)
  })

  it('来源忽略 signal 并永久悬挂时仍会超时、abort 并结束请求', async () => {
    let receivedSignal
    const search = vi.fn(({ signal }) => {
      receivedSignal = signal
      return new Promise(() => {})
    })
    const runner = createBenchmarkRunner({
      providers: [{ name: 'hanging', search }],
      retries: 0,
      requestTimeoutMs: 10,
    })

    const result = await Promise.race([
      runner.searchOnce({ query: 'x', place: { id: 'a' } }, 'hanging'),
      new Promise((resolve) => setTimeout(() => resolve({ testTimedOut: true }), 100)),
    ])

    expect(result).toMatchObject({
      status: 'timeout', timeoutCount: 1, attemptCount: 1, retryCount: 0, cacheHit: false,
    })
    expect(result.statusCounts).toEqual({ timeout: 1 })
    expect(receivedSignal).toBeInstanceOf(AbortSignal)
    expect(receivedSignal.aborted).toBe(true)
  })

  it('单个来源悬挂不会阻止整批结束，并在行指标中记录 timeout', async () => {
    const hanging = { name: 'hanging', search: vi.fn(() => new Promise(() => {})) }
    const good = { name: 'good', search: vi.fn(async () => ({ candidates: [], elapsedMs: 1 })) }
    const runner = createBenchmarkRunner({
      providers: [hanging, good], concurrency: 2, retries: 0, requestTimeoutMs: 10,
    })

    const rows = await runner.run([{ id: 'a' }], () => ['q'])
    const timedOut = rows.find((row) => row.provider === 'hanging')

    expect(rows).toHaveLength(2)
    expect(timedOut).toMatchObject({
      requestCount: 1,
      attemptCount: 1,
      retryCount: 0,
      timeoutCount: 1,
      statusCounts: { timeout: 1 },
      errors: [expect.objectContaining({ status: 'timeout' })],
    })
    expect(rows.find((row) => row.provider === 'good').errors).toEqual([])
  })

  it('同一 canonical imageUrl 即使 ID 不同也只计作一张 exact', async () => {
    const place = {
      id: 'midui', canonicalName: '米堆冰川', aliases: [],
      adminPath: ['西藏自治区', '林芝市', '波密县'], nearbyLandmarks: [], roadRefs: [],
      negativeTerms: [], nodeType: 'natural-landmark', coordinates: null,
    }
    const exact = (id, imageUrl) => ({ id, provider: 'fake', title: '米堆冰川', description: '波密县', imageUrl })
    const search = vi.fn(async () => ({ candidates: [
      exact('one', 'HTTPS://IMG.EXAMPLE:443/a/../photo.jpg#first'),
      exact('two', 'https://img.example/photo.jpg#second'),
      exact('three', 'https://img.example/three.jpg'),
      exact('four', 'https://img.example/four.jpg'),
    ] }))
    const runner = createBenchmarkRunner({ providers: [{ name: 'fake', search }] })

    const [row] = await runner.run([place], () => ['q'])

    expect(row.exact.map(({ id }) => id)).toEqual(['one', 'three', 'four'])
  })

  it('没有稳定 provider+id 或有效图片 URL 的候选不得占用 exact 配额', async () => {
    const place = {
      id: 'midui', canonicalName: '米堆冰川', aliases: [],
      adminPath: ['西藏自治区', '林芝市', '波密县'], nearbyLandmarks: [], roadRefs: [],
      negativeTerms: [], nodeType: 'natural-landmark', coordinates: null,
    }
    const candidate = (id, imageUrl) => ({
      id, provider: 'fake', title: '米堆冰川', description: '波密县', imageUrl,
    })
    const search = vi.fn(async () => ({ candidates: [
      candidate('', 'not-a-url'),
      candidate('one', 'https://img.example/one.jpg'),
      candidate('two', 'https://img.example/two.jpg'),
      candidate('three', 'https://img.example/three.jpg'),
    ] }))
    const runner = createBenchmarkRunner({ providers: [{ name: 'fake', search }] })

    const [row] = await runner.run([place], () => ['q'])

    expect(row.exact.map(({ id }) => id)).toEqual(['one', 'two', 'three'])
    expect(row.needsReview).toEqual([
      expect.objectContaining({ identityReason: 'unstable-candidate-identity' }),
    ])
  })

  it('重试 sleep 抛错时返回结构化失败，不拒绝 searchOnce', async () => {
    const search = vi.fn(async () => { throw Object.assign(new Error('upstream'), { status: 503 }) })
    const sleep = vi.fn(async () => { throw new Error('timer unavailable') })
    const runner = createBenchmarkRunner({ providers: [{ name: 'fake', search }], retries: 2, sleep })

    await expect(runner.searchOnce({ query: 'q', place: { id: 'a' } }, 'fake')).resolves.toMatchObject({
      error: 'Retry sleep failed: timer unavailable',
      status: 'sleep-error',
      attemptCount: 1,
      retryCount: 0,
      statusCounts: { '5xx': 1 },
    })
  })

  it('provider 返回非对象或非数组 candidates 时形成结构化行错误', async () => {
    const runner = createBenchmarkRunner({ providers: [
      { name: 'null-result', search: vi.fn(async () => null) },
      { name: 'bad-candidates', search: vi.fn(async () => ({ candidates: {} })) },
    ] })

    const rows = await runner.run([{ id: 'a' }], () => ['q'])

    expect(rows.map((row) => row.errors)).toEqual([
      [expect.objectContaining({ status: 'invalid-provider-result' })],
      [expect.objectContaining({ status: 'invalid-provider-result' })],
    ])
  })

  it('queryBuilder 异常和无效返回形成行错误，查询会去空并去重', async () => {
    const search = vi.fn(async () => ({ candidates: [] }))
    const runner = createBenchmarkRunner({ providers: [{ name: 'fake', search }] })
    const queryBuilder = (place) => {
      if (place.id === 'throws') throw new Error('cannot build')
      if (place.id === 'undefined') return undefined
      if (place.id === 'empty') return ['', '  ', null]
      return [' q ', 'q', '', 3, 'z']
    }

    const running = runner.run([
      { id: 'throws' }, { id: 'undefined' }, { id: 'empty' }, { id: 'valid' },
    ], queryBuilder)
    await expect(running).resolves.toHaveLength(4)
    const rows = await running

    expect(rows.slice(0, 3).map((row) => row.errors[0]?.status)).toEqual([
      'query-builder-error', 'invalid-queries', 'no-valid-queries',
    ])
    expect(search.mock.calls.map(([input]) => input.query)).toEqual(['q', 'z'])
  })

  it('缓存命中的历史最终错误不会重复写入另一行', async () => {
    const search = vi.fn(async () => { throw Object.assign(new Error('bad'), { status: 400 }) })
    const runner = createBenchmarkRunner({ providers: [{ name: 'fake', search }] })

    const [freshRow, cachedRow] = await runner.run([{ id: 'same' }, { id: 'same' }], () => ['q'])

    expect(freshRow.errors).toEqual([expect.objectContaining({ message: 'bad', status: 400 })])
    expect(cachedRow).toMatchObject({
      errors: [], requestCount: 0, attemptCount: 0, retryCount: 0, cacheHits: 1,
    })
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('重复 provider name 在创建执行器时给出清晰错误', () => {
    const provider = (name) => ({ name, search: vi.fn(async () => ({ candidates: [] })) })

    expect(() => createBenchmarkRunner({ providers: [provider('same'), provider('same')] }))
      .toThrow('Duplicate provider name: same')
  })

  it('负数 retries 规范化为 0，不产生额外尝试', async () => {
    const search = vi.fn(async () => { throw Object.assign(new Error('down'), { status: 503 }) })
    const sleep = vi.fn(async () => {})
    const runner = createBenchmarkRunner({ providers: [{ name: 'fake', search }], retries: -10, sleep })

    const result = await runner.searchOnce({ query: 'q', place: { id: 'a' } }, 'fake')

    expect(result).toMatchObject({ attemptCount: 1, retryCount: 0 })
    expect(search).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('首个请求悬挂时两个快速最终失败仍会熔断大量后续 jobs', async () => {
    let releaseFirst
    const firstGate = new Promise((resolve) => { releaseFirst = resolve })
    let callCount = 0
    const search = vi.fn(async () => {
      callCount += 1
      if (callCount === 1) return firstGate
      throw Object.assign(new Error('down'), { status: 400 })
    })
    const runner = createBenchmarkRunner({
      providers: [{ name: 'fake', search }],
      concurrency: 3,
      retries: 0,
      failureThreshold: 2,
      requestTimeoutMs: 1000,
    })
    const places = Array.from({ length: 100 }, (_, index) => ({ id: `place-${index}` }))

    const running = runner.run(places, () => ['q'])
    await vi.waitFor(() => expect(search.mock.calls.length).toBeGreaterThanOrEqual(3))
    await new Promise((resolve) => setImmediate(resolve))
    releaseFirst({ candidates: [], elapsedMs: 1 })
    const rows = await running

    expect(rows).toHaveLength(100)
    expect(search.mock.calls.length).toBeLessThanOrEqual(3)
    expect(rows.filter((row) => row.skipped === 'circuit-open').length).toBeGreaterThanOrEqual(97)
  })

  it('provider cacheKey 合并上游请求，但缓存候选仍按当前 place 重新判定', async () => {
    const coordinates = { lng: 95.1, lat: 30.2 }
    const firstPlace = {
      id: 'midui', canonicalName: '米堆冰川', aliases: [], adminPath: ['西藏自治区', '林芝市', '波密县'],
      nearbyLandmarks: [], roadRefs: [], negativeTerms: [], nodeType: 'natural-landmark', coordinates,
    }
    const secondPlace = {
      id: 'sister', canonicalName: '姊妹湖', aliases: [], adminPath: ['四川省', '甘孜州', '巴塘县'],
      nearbyLandmarks: [], roadRefs: [], negativeTerms: [], nodeType: 'natural-landmark', coordinates,
    }
    const search = vi.fn(async () => ({ candidates: [{
      provider: 'geo', id: 'photo', title: '米堆冰川', description: '波密县',
      imageUrl: 'https://img.example/photo.jpg',
    }] }))
    const provider = {
      name: 'geo',
      cacheKey: ({ place }) => `${place.coordinates.lng},${place.coordinates.lat}`,
      search,
    }
    const runner = createBenchmarkRunner({ providers: [provider], concurrency: 2 })

    const [firstRow, secondRow] = await runner.run([firstPlace, secondPlace], (place) => [`query-${place.id}`])

    expect(search).toHaveBeenCalledTimes(1)
    expect(firstRow).toMatchObject({ requestCount: 1, attemptCount: 1, cacheHits: 0 })
    expect(secondRow).toMatchObject({ requestCount: 0, attemptCount: 0, cacheHits: 1 })
    expect(firstRow.exact).toHaveLength(1)
    expect(secondRow.exact).toHaveLength(0)
    expect(secondRow.rejected).toHaveLength(1)
  })

  it('run 收到非数组 places 时安全返回空结果', async () => {
    const runner = createBenchmarkRunner({
      providers: [{ name: 'fake', search: vi.fn(async () => ({ candidates: [] })) }],
    })

    await expect(runner.run(undefined, () => ['q'])).resolves.toEqual([])
    await expect(runner.run({ id: 'not-an-array' }, () => ['q'])).resolves.toEqual([])
  })

  it('searchOnce 收到 undefined input 时返回结构化错误', async () => {
    const search = vi.fn(async () => ({ candidates: [] }))
    const runner = createBenchmarkRunner({ providers: [{ name: 'fake', search }] })

    await expect(runner.searchOnce(undefined, 'fake')).resolves.toMatchObject({
      error: 'Invalid benchmark search input',
      status: 'invalid-input',
      attemptCount: 0,
      retryCount: 0,
      cacheHit: false,
    })
    expect(search).not.toHaveBeenCalled()
  })

  it('Mapillary 同一坐标的不同查询只产生一次逻辑请求和一次上游 attempt', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }))
    const provider = createMapillaryProvider({ accessToken: 'token', fetchImpl })
    const coordinates = { lng: 101.55, lat: 30.04 }
    const runner = createBenchmarkRunner({ providers: [provider], concurrency: 2 })

    const [freshRow, cachedRow] = await runner.run([
      { id: 'first', canonicalName: '甲', coordinates },
      { id: 'second', canonicalName: '乙', coordinates: { ...coordinates } },
    ], (place) => [`query-${place.id}`])

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(freshRow).toMatchObject({ requestCount: 1, attemptCount: 1, cacheHits: 0 })
    expect(cachedRow).toMatchObject({ requestCount: 0, attemptCount: 0, cacheHits: 1 })
  })
})
