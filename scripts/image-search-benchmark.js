import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as nodeFs from 'node:fs/promises'
import { BENCHMARK_PLACES, validateBenchmarkPlaces } from '../server/imageSearch/benchmarkPlaces.js'
import { buildPlaceQueries } from '../server/imageSearch/identityGate.js'
import {
  createBraveProvider,
  createCommonsProvider,
  createMapillaryProvider,
  createOpenverseProvider,
  createPixabayProvider,
} from '../server/imageSearch/providers.js'
import { createBenchmarkRunner } from '../server/imageSearch/benchmarkRunner.js'
import { buildBenchmarkReport } from '../server/imageSearch/report.js'

const REPORT_BASENAME = '2026-08-06-image-search-source-benchmark'

const DEFAULT_PROVIDER_FACTORIES = {
  pixabay: createPixabayProvider,
  commons: createCommonsProvider,
  openverse: createOpenverseProvider,
  brave: createBraveProvider,
  mapillary: createMapillaryProvider,
}

function sourceStatusForEnv(env) {
  const enabled = ['commons', 'openverse']
  const skipped = []
  if (env.PIXABAY_KEY) enabled.push('pixabay')
  else skipped.push('pixabay')
  if (env.BRAVE_SEARCH_KEY || env.BRAVE_API_KEY || env.BRAVE_SEARCH_API_KEY) enabled.push('brave')
  else skipped.push('brave')
  if (env.MAPILLARY_ACCESS_TOKEN || env.MAPILLARY_TOKEN) enabled.push('mapillary')
  else skipped.push('mapillary')
  return { enabled: enabled.sort(), skipped: skipped.sort(), failed: [] }
}

function batchElapsed(rows) {
  const values = rows
    .map((row) => Number(row?.batchElapsedMs))
    .filter((value) => Number.isFinite(value) && value >= 0)
  return values.length ? Math.max(...values) : null
}

async function removeIfPresent(fs, file) {
  try {
    await fs.unlink(file)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

async function renameIfPresent(fs, from, to) {
  try {
    await fs.rename(from, to)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function writeReports(fs, outputDir, report) {
  const markdown = path.join(outputDir, `${REPORT_BASENAME}.md`)
  const json = path.join(outputDir, `${REPORT_BASENAME}.json`)
  const suffix = `.tmp-${process.pid}-${Date.now()}`
  const markdownTemp = `${markdown}${suffix}`
  const jsonTemp = `${json}${suffix}`
  const markdownBackup = `${markdown}.bak-${process.pid}-${Date.now()}`
  const jsonBackup = `${json}.bak-${process.pid}-${Date.now()}`
  let markdownBackedUp = false
  let jsonBackedUp = false
  let markdownPromoted = false
  let jsonPromoted = false
  await fs.mkdir(outputDir, { recursive: true })
  try {
    await fs.writeFile(markdownTemp, report.markdown, 'utf8')
    await fs.writeFile(jsonTemp, `${JSON.stringify(report.json, null, 2)}\n`, 'utf8')
    markdownBackedUp = await renameIfPresent(fs, markdown, markdownBackup)
    jsonBackedUp = await renameIfPresent(fs, json, jsonBackup)
    await fs.rename(markdownTemp, markdown)
    markdownPromoted = true
    await fs.rename(jsonTemp, json)
    jsonPromoted = true
    await Promise.allSettled([
      removeIfPresent(fs, markdownBackup),
      removeIfPresent(fs, jsonBackup),
    ])
  } catch (error) {
    await Promise.allSettled([
      removeIfPresent(fs, markdownTemp),
      removeIfPresent(fs, jsonTemp),
      ...(markdownPromoted ? [removeIfPresent(fs, markdown)] : []),
      ...(jsonPromoted ? [removeIfPresent(fs, json)] : []),
    ])
    const restoreErrors = []
    if (markdownBackedUp) {
      try { await fs.rename(markdownBackup, markdown) } catch (restoreError) { restoreErrors.push(restoreError) }
    }
    if (jsonBackedUp) {
      try { await fs.rename(jsonBackup, json) } catch (restoreError) { restoreErrors.push(restoreError) }
    }
    if (restoreErrors.length) throw new AggregateError([error, ...restoreErrors], '报告写入失败，且上一版报告未能完整恢复')
    throw error
  }
  return { markdown, json }
}

export async function runImageSearchBenchmark({
  dryRun = false,
  env = process.env,
  outputDir = path.resolve('docs/reports'),
  places = BENCHMARK_PLACES,
  queryBuilder = buildPlaceQueries,
  providerFactories = DEFAULT_PROVIDER_FACTORIES,
  runnerFactory = createBenchmarkRunner,
  reportBuilder = buildBenchmarkReport,
  fs = nodeFs,
  concurrency = 4,
} = {}) {
  if (!Array.isArray(places) || places.length !== 20) {
    throw new Error(`图片基准必须包含 20 个地点，当前为 ${Array.isArray(places) ? places.length : 0}`)
  }
  if (places === BENCHMARK_PLACES) {
    const errors = validateBenchmarkPlaces(places)
    if (errors.length) throw new Error(`图片基准地点校验失败：${errors.join('；')}`)
  }

  const sources = sourceStatusForEnv(env || {})
  if (dryRun) {
    return {
      dryRun: true,
      places: places.length,
      sources,
      logicalQueries: 0,
      providerAttempts: 0,
      upstreamRequests: 0,
      networkRequests: 0,
      files: [],
    }
  }

  const safeEnv = env || {}
  const providers = [
    providerFactories.pixabay({ apiKey: safeEnv.PIXABAY_KEY }),
    providerFactories.commons(),
    providerFactories.openverse(),
    providerFactories.brave({ apiKey: safeEnv.BRAVE_SEARCH_KEY || safeEnv.BRAVE_API_KEY || safeEnv.BRAVE_SEARCH_API_KEY }),
    providerFactories.mapillary({ accessToken: safeEnv.MAPILLARY_ACCESS_TOKEN || safeEnv.MAPILLARY_TOKEN }),
  ]
  const runner = runnerFactory({ providers, concurrency })
  const coldRows = await runner.run(places, queryBuilder)
  const warmRows = await runner.run(places, queryBuilder)
  const report = reportBuilder(coldRows, {
    cachedRunElapsedMs: batchElapsed(warmRows),
    sourceStatus: sources,
  })
  if (report?.json?.releaseGate?.passed === false) {
    throw new Error('图片基准发布闸门未通过')
  }

  const files = await writeReports(fs, outputDir, report)
  const summary = report?.json?.summary || {}
  const upstreamRequests = Number(summary.upstreamAttemptCount) || 0
  return {
    dryRun: false,
    places: places.length,
    sources: report?.json?.sources || sources,
    logicalQueries: Number(summary.logicalQueries) || 0,
    providerAttempts: Number(summary.attemptCount) || 0,
    upstreamRequests,
    networkRequests: upstreamRequests,
    files,
    report,
  }
}

export function loadOptionalEnv(loadEnvFile = process.loadEnvFile?.bind(process)) {
  if (typeof loadEnvFile !== 'function') return false
  try {
    loadEnvFile()
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

export async function main({
  argv = process.argv.slice(2),
  logger = console,
  loadEnv = loadOptionalEnv,
  runBenchmark = runImageSearchBenchmark,
} = {}) {
  loadEnv()
  const dryRun = argv.includes('--dry-run')
  const outputArg = argv.find((arg) => arg.startsWith('--output-dir='))
  const outputDir = outputArg ? path.resolve(outputArg.slice('--output-dir='.length)) : undefined
  const result = await runBenchmark({ dryRun, ...(outputDir ? { outputDir } : {}) })
  logger.log(`启用来源：${result.sources.enabled.join('、') || '无'}`)
  logger.log(`跳过来源：${result.sources.skipped.join('、') || '无'}`)
  logger.log(`失败来源：${result.sources.failed.join('、') || '无'}`)
  logger.log(`地点：${result.places}`)
  logger.log(`逻辑查询：${result.logicalQueries}`)
  logger.log(`来源搜索尝试：${result.providerAttempts}`)
  logger.log(`HTTP 上游请求：${result.upstreamRequests}`)
  if (result.dryRun) logger.log('演练完成：未联网，未写入报告。')
  return result
}

const isDirectRun = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isDirectRun) {
  main().catch((error) => {
    console.error(`图片来源基准失败：${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
