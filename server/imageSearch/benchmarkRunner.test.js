import { describe, expect, it, vi } from 'vitest'
import { createBenchmarkRunner } from './benchmarkRunner.js'

describe('搜图基准执行器', () => {
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
      retryCount: 0,
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
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const fallback = setTimeout(release, 20)
    const search = vi.fn(async () => {
      active += 1
      maximum = Math.max(maximum, active)
      if (active === 3) {
        clearTimeout(fallback)
        release()
      }
      await gate
      active -= 1
      return { candidates: [], elapsedMs: 1 }
    })
    const runner = createBenchmarkRunner({ providers: [{ name: 'one', search }], concurrency: 3 })

    await runner.run([{ id: 'a' }, { id: 'b' }, { id: 'c' }], () => ['q'])

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

    const [row] = await runner.run([{ id: 'a' }], () => ['same', 'same'])

    expect(row).toMatchObject({ retryCount: 2, requestCount: 3, cacheHits: 1 })
    expect(search).toHaveBeenCalledTimes(3)
  })

  it('并发请求乱序完成时仍按请求序号判断连续失败', async () => {
    const deferred = () => {
      let resolve
      let reject
      const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
      })
      return { promise, resolve, reject }
    }
    const firstFailure = deferred()
    const middleSuccess = deferred()
    const lastFailure = deferred()
    const pending = { first: firstFailure, middle: middleSuccess, last: lastFailure }
    const search = vi.fn(({ query }) => pending[query]?.promise
      || Promise.resolve({ candidates: [], elapsedMs: 1 }))
    const runner = createBenchmarkRunner({
      providers: [{ name: 'fake', search }], retries: 0, failureThreshold: 2,
    })

    const first = runner.searchOnce({ query: 'first', place: { id: 'a' } }, 'fake')
    const middle = runner.searchOnce({ query: 'middle', place: { id: 'b' } }, 'fake')
    const last = runner.searchOnce({ query: 'last', place: { id: 'c' } }, 'fake')
    firstFailure.reject(Object.assign(new Error('first'), { status: 400 }))
    lastFailure.reject(Object.assign(new Error('last'), { status: 400 }))
    middleSuccess.resolve({ candidates: [], elapsedMs: 1 })
    await Promise.all([first, middle, last])

    const after = await runner.searchOnce({ query: 'after', place: { id: 'd' } }, 'fake')
    expect(after).not.toHaveProperty('skipped')
    expect(search).toHaveBeenCalledTimes(4)
  })
})
