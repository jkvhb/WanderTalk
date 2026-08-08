import { evaluatePlaceIdentity } from './identityGate.js'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const isTransient = (status) => status === 'timeout'
  || status === 429
  || (Number.isFinite(status) && status >= 500)

function nonNegativeInteger(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback
}

function positiveInteger(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.max(1, Math.floor(number)) : fallback
}

function atLeastOneInteger(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(1, Math.floor(number)) : fallback
}

function statusCategory(status) {
  if (status === 'timeout') return 'timeout'
  if (status === 429) return '429'
  if (Number.isFinite(status) && status >= 500) return '5xx'
  if (Number.isFinite(status)) return String(status)
  if (typeof status === 'string' && status) return status
  return 'error'
}

function canonicalImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    url.hash = ''
    url.searchParams.sort()
    return url.toString()
  } catch {
    return null
  }
}

function providerId(item, fallbackProvider) {
  if (!item || !['string', 'number', 'bigint'].includes(typeof item.id)) return null
  const id = String(item.id).trim()
  const provider = typeof item.provider === 'string' && item.provider.trim()
    ? item.provider.trim()
    : fallbackProvider
  return id && provider ? `${provider}|${id}` : null
}

async function runPool(items, worker, requestedLimit) {
  const limit = Math.max(1, Math.floor(Number(requestedLimit) || 1))
  const output = new Array(items.length)
  let cursor = 0

  async function consume() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      output[index] = await worker(items[index])
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume))
  return output
}

export function createBenchmarkRunner({
  providers = [],
  concurrency = 4,
  retries = 2,
  failureThreshold = 3,
  requestTimeoutMs = 15000,
  sleep = wait,
  clock = Date.now,
} = {}) {
  if (!Array.isArray(providers)) throw new TypeError('Providers must be an array')
  const providerNames = new Set()
  providers.forEach((provider, index) => {
    if (!provider || typeof provider !== 'object' || typeof provider.name !== 'string'
      || !provider.name.trim() || typeof provider.search !== 'function') {
      throw new TypeError(`Invalid provider at index ${index}`)
    }
    if (providerNames.has(provider.name)) throw new Error(`Duplicate provider name: ${provider.name}`)
    providerNames.add(provider.name)
  })
  const byName = new Map(providers.map((provider) => [provider.name, provider]))
  const cache = new Map()
  const sourceStates = new Map(providers.map((provider) => [provider.name, {
    consecutiveFailures: 0,
    open: false,
  }]))
  const normalizedRetries = nonNegativeInteger(retries, 2)
  const normalizedConcurrency = atLeastOneInteger(concurrency, 4)
  const normalizedFailureThreshold = atLeastOneInteger(failureThreshold, 3)
  const normalizedRequestTimeoutMs = positiveInteger(requestTimeoutMs, 15000)
  const readTime = () => {
    try {
      const value = Number(typeof clock === 'function' ? clock() : Date.now())
      return Number.isFinite(value) ? value : Date.now()
    } catch {
      return Date.now()
    }
  }
  const elapsed = (startedAt) => Math.max(0, readTime() - startedAt)

  function recordOutcome(state, outcome) {
    // Completion-order semantics prevent an earlier hanging request from blocking protection.
    // Already-started requests finish normally; once open, only later requests are skipped.
    if (outcome === 'failure') state.consecutiveFailures += 1
    else if (outcome === 'success') state.consecutiveFailures = 0
    if (state.consecutiveFailures >= normalizedFailureThreshold) state.open = true
  }

  async function searchOnce(input, providerName) {
    const provider = byName.get(providerName)
    if (!provider || typeof provider.search !== 'function') {
      return {
        error: `Unknown provider: ${providerName}`,
        status: 500,
        attemptCount: 0,
        upstreamAttemptCount: 0,
        retryCount: 0,
        timeoutCount: 0,
        statusCounts: {},
        cacheHit: false,
      }
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return {
        error: 'Invalid benchmark search input',
        status: 'invalid-input', attemptCount: 0, upstreamAttemptCount: 0, retryCount: 0,
        timeoutCount: 0, statusCounts: {}, cacheHit: false,
      }
    }
    let fingerprint
    try {
      fingerprint = typeof provider.cacheKey === 'function'
        ? provider.cacheKey(input)
        : JSON.stringify([input?.place?.id || '', input?.query || ''])
    } catch (error) {
      return {
        error: `Provider cacheKey failed: ${error instanceof Error ? error.message : String(error)}`,
        status: 'cache-key-error', attemptCount: 0, upstreamAttemptCount: 0, retryCount: 0,
        timeoutCount: 0, statusCounts: {}, cacheHit: false,
      }
    }
    const key = `${providerName}|${String(fingerprint ?? '')}`
    const cached = cache.get(key)
    if (cached) return { ...await cached, cacheHit: true }

    const state = sourceStates.get(providerName)
    if (state.open) {
      const skipped = Promise.resolve({
        skipped: true, reason: 'circuit-open', attemptCount: 0, upstreamAttemptCount: 0, retryCount: 0,
        timeoutCount: 0, statusCounts: {},
      })
      cache.set(key, skipped)
      return { ...await skipped, cacheHit: false }
    }
    const execute = async () => {
      let attempt = 0
      let attemptCount = 0
      let upstreamAttemptCount = 0
      let timeoutCount = 0
      const statusCounts = {}
      while (true) {
        const controller = new AbortController()
        let timer
        try {
          attemptCount += 1
          let estimatedUpstreamAttempts = 1
          if (typeof provider.upstreamAttemptCount === 'function') {
            try {
              estimatedUpstreamAttempts = nonNegativeInteger(provider.upstreamAttemptCount(input), 1)
            } catch {
              estimatedUpstreamAttempts = 1
            }
          }
          upstreamAttemptCount += estimatedUpstreamAttempts
          const timeout = new Promise((resolve, reject) => {
            timer = setTimeout(() => {
              controller.abort()
              const error = new Error(`Request timed out after ${normalizedRequestTimeoutMs}ms`)
              error.status = 'timeout'
              reject(error)
            }, normalizedRequestTimeoutMs)
          })
          const result = await Promise.race([
            Promise.resolve().then(() => provider.search({ ...input, signal: controller.signal })),
            timeout,
          ])
          if (!result || typeof result !== 'object' || Array.isArray(result)
            || (!result.skipped && !Array.isArray(result.candidates))) {
            const error = new Error('Provider returned an invalid result; candidates must be an array')
            error.status = 'invalid-provider-result'
            throw error
          }
          return { ...result, attemptCount, upstreamAttemptCount, retryCount: attempt, timeoutCount, statusCounts }
        } catch (error) {
          const category = statusCategory(error?.status)
          statusCounts[category] = (statusCounts[category] || 0) + 1
          if (error?.status === 'timeout') timeoutCount += 1
          if (!isTransient(error?.status) || attempt >= normalizedRetries) {
            return {
              error: error instanceof Error ? error.message : String(error),
              status: typeof error?.status === 'string' ? error.status
                : Number.isFinite(error?.status) ? error.status : 500,
              attemptCount,
              upstreamAttemptCount,
              retryCount: attempt,
              timeoutCount,
              statusCounts,
            }
          }
          try {
            await sleep(300 * 2 ** attempt)
          } catch (sleepError) {
            return {
              error: `Retry sleep failed: ${sleepError instanceof Error ? sleepError.message : String(sleepError)}`,
              status: 'sleep-error',
              attemptCount,
              upstreamAttemptCount,
              retryCount: attempt,
              timeoutCount,
              statusCounts,
            }
          }
          attempt += 1
        } finally {
          clearTimeout(timer)
          controller.abort()
        }
      }
    }
    const pending = execute().then((result) => {
      recordOutcome(state, result.error ? 'failure' : result.skipped ? 'neutral' : 'success')
      return result
    })
    cache.set(key, pending)
    const result = await pending
    return { ...result, cacheHit: false }
  }

  async function run(places, queryBuilder) {
    if (!Array.isArray(places)) return []
    const batchStartedAt = readTime()
    const jobs = places.flatMap((place) => providers.map((provider) => ({ place, providerName: provider.name })))
    const rows = await runPool(jobs, async ({ place, providerName }) => {
      const rowStartedAt = readTime()
      const row = {
        placeId: place.id,
        placeName: place.canonicalName || place.id,
        provider: providerName,
        exact: [],
        needsReview: [],
        rejected: [],
        errors: [],
        skipped: null,
        requestCount: 0,
        attemptCount: 0,
        upstreamAttemptCount: 0,
        retryCount: 0,
        timeoutCount: 0,
        statusCounts: {},
        cacheHits: 0,
        elapsedMs: 0,
        firstExactMs: null,
        threeExactMs: null,
        batchElapsedMs: null,
        hadFinalFailure: false,
        failedQueryCount: 0,
      }
      const seenCandidateIds = new Set()
      const seenImageUrls = new Set()
      let rawQueries
      try {
        rawQueries = queryBuilder(place)
      } catch (error) {
        row.errors.push({
          query: null,
          message: error instanceof Error ? error.message : String(error),
          status: 'query-builder-error',
        })
        return row
      }
      if (!Array.isArray(rawQueries)) {
        row.errors.push({ query: null, message: 'Query builder must return an array', status: 'invalid-queries' })
        return row
      }
      const seenQueries = new Set()
      const queries = rawQueries
        .filter((query) => typeof query === 'string' && query.trim())
        .map((query) => query.trim())
        .filter((query) => {
          if (seenQueries.has(query)) return false
          seenQueries.add(query)
          return true
        })
      if (queries.length === 0) {
        row.errors.push({ query: null, message: 'Query builder returned no valid queries', status: 'no-valid-queries' })
        return row
      }
      for (const query of queries) {
        const startedAt = readTime()
        const result = await searchOnce({ query, place }, providerName)
        row.elapsedMs += elapsed(startedAt)
        if (result.skipped) {
          row.skipped = result.reason
          break
        }
        if (result.cacheHit) row.cacheHits += 1
        else {
          row.requestCount += 1
          row.attemptCount += result.attemptCount || 0
          row.upstreamAttemptCount += result.upstreamAttemptCount || 0
          row.retryCount += result.retryCount || 0
          row.timeoutCount += result.timeoutCount || 0
          for (const [status, count] of Object.entries(result.statusCounts || {})) {
            row.statusCounts[status] = (row.statusCounts[status] || 0) + count
          }
        }
        if (result.error) {
          row.hadFinalFailure = true
          row.failedQueryCount += 1
          if (!result.cacheHit) row.errors.push({ query, message: result.error, status: result.status })
          continue
        }
        const exactBefore = row.exact.length
        for (const item of result.candidates || []) {
          const idKey = providerId(item, providerName)
          const urlKey = canonicalImageUrl(item?.imageUrl)
          if ((idKey && seenCandidateIds.has(idKey)) || (urlKey && seenImageUrls.has(urlKey))) continue
          if (idKey) seenCandidateIds.add(idKey)
          if (urlKey) seenImageUrls.add(urlKey)
          const identity = evaluatePlaceIdentity(place, item)
          const decorated = { ...item, identityReason: identity.reason, identityEvidence: identity.evidence }
          if (identity.status === 'exact' && !idKey && !urlKey) {
            row.needsReview.push({
              ...decorated,
              identityReason: 'unstable-candidate-identity',
            })
          } else if (identity.status === 'exact') row.exact.push(decorated)
          else if (identity.status === 'needs_review') row.needsReview.push(decorated)
          else row.rejected.push(decorated)
        }
        const exactElapsed = elapsed(rowStartedAt)
        if (row.firstExactMs == null && exactBefore === 0 && row.exact.length > 0) {
          row.firstExactMs = exactElapsed
        }
        if (row.threeExactMs == null && exactBefore < 3 && row.exact.length >= 3) {
          row.threeExactMs = exactElapsed
        }
        if (row.exact.length >= 3) {
          row.exact = row.exact.slice(0, 3)
          break
        }
      }
      return row
    }, normalizedConcurrency)
    const batchElapsedMs = elapsed(batchStartedAt)
    return rows.map((row) => ({ ...row, batchElapsedMs }))
  }

  return { searchOnce, run }
}
