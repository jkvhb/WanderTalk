import { evaluatePlaceIdentity } from './identityGate.js'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const isTransient = (status) => status === 429 || (Number.isFinite(status) && status >= 500)

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
  sleep = wait,
} = {}) {
  const byName = new Map(providers.map((provider) => [provider.name, provider]))
  const cache = new Map()
  const sourceStates = new Map(providers.map((provider) => [provider.name, {
    nextSequence: 0,
    nextOutcomeToApply: 0,
    outcomes: new Map(),
    consecutiveFailures: 0,
    open: false,
  }]))
  const normalizedFailureThreshold = Math.max(1, Math.floor(Number(failureThreshold) || 1))

  function recordOutcome(state, sequence, outcome) {
    // Providers remain concurrent. Outcomes are applied in request-start order so network
    // completion order cannot invent or erase a consecutive failure streak. Requests already
    // started before the threshold is observed finish normally; later requests are skipped.
    state.outcomes.set(sequence, outcome)
    while (state.outcomes.has(state.nextOutcomeToApply)) {
      const completed = state.outcomes.get(state.nextOutcomeToApply)
      state.outcomes.delete(state.nextOutcomeToApply)
      state.nextOutcomeToApply += 1
      if (completed === 'failure') state.consecutiveFailures += 1
      else if (completed === 'success') state.consecutiveFailures = 0
      if (state.consecutiveFailures >= normalizedFailureThreshold) state.open = true
    }
  }

  async function searchOnce(input, providerName) {
    const provider = byName.get(providerName)
    if (!provider || typeof provider.search !== 'function') {
      return {
        error: `Unknown provider: ${providerName}`,
        status: 500,
        retryCount: 0,
        cacheHit: false,
      }
    }
    const key = `${providerName}|${input.place?.id || ''}|${input.query || ''}`
    const cached = cache.get(key)
    if (cached) return { ...await cached, cacheHit: true }

    const state = sourceStates.get(providerName)
    if (state.open) {
      const skipped = Promise.resolve({ skipped: true, reason: 'circuit-open', retryCount: 0 })
      cache.set(key, skipped)
      return { ...await skipped, cacheHit: false }
    }
    const sequence = state.nextSequence
    state.nextSequence += 1
    const execute = async () => {
      let attempt = 0
      while (true) {
        try {
          const result = await provider.search(input)
          return { ...result, retryCount: attempt }
        } catch (error) {
          if (!isTransient(error?.status) || attempt >= retries) {
            return {
              error: error instanceof Error ? error.message : String(error),
              status: Number.isFinite(error?.status) ? error.status : 500,
              retryCount: attempt,
            }
          }
          await sleep(300 * 2 ** attempt)
          attempt += 1
        }
      }
    }
    const pending = execute().then((result) => {
      recordOutcome(state, sequence, result.error ? 'failure' : result.skipped ? 'neutral' : 'success')
      return result
    })
    cache.set(key, pending)
    const result = await pending
    return { ...result, cacheHit: false }
  }

  async function run(places, queryBuilder) {
    const jobs = places.flatMap((place) => providers.map((provider) => ({ place, providerName: provider.name })))
    return runPool(jobs, async ({ place, providerName }) => {
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
        retryCount: 0,
        cacheHits: 0,
        elapsedMs: 0,
      }
      const seenCandidates = new Set()
      for (const query of queryBuilder(place)) {
        const startedAt = Date.now()
        const result = await searchOnce({ query, place }, providerName)
        row.elapsedMs += Date.now() - startedAt
        if (result.skipped) {
          row.skipped = result.reason
          break
        }
        if (result.cacheHit) row.cacheHits += 1
        else {
          row.retryCount += result.retryCount || 0
          row.requestCount += 1 + (result.retryCount || 0)
        }
        if (result.error) {
          row.errors.push({ query, message: result.error, status: result.status })
          continue
        }
        for (const item of result.candidates || []) {
          const candidateKey = item?.id || item?.imageUrl
          if (candidateKey && seenCandidates.has(candidateKey)) continue
          if (candidateKey) seenCandidates.add(candidateKey)
          const identity = evaluatePlaceIdentity(place, item)
          const decorated = { ...item, identityReason: identity.reason, identityEvidence: identity.evidence }
          if (identity.status === 'exact') row.exact.push(decorated)
          else if (identity.status === 'needs_review') row.needsReview.push(decorated)
          else row.rejected.push(decorated)
        }
        if (row.exact.length >= 3) {
          row.exact = row.exact.slice(0, 3)
          break
        }
      }
      return row
    }, concurrency)
  }

  return { searchOnce, run }
}
