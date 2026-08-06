const SECRET_KEY = /^(?:api[_-]?key|access[_-]?token|token|authorization)$/i
const SECRET_QUERY_KEY = /^(?:api[_-]?key|access[_-]?token|token|key|authorization)$/i

const list = (value) => Array.isArray(value) ? value : []
const count = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, number) : 0
}

function redactSecrets(value) {
  return String(value ?? '')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, '[REDACTED]')
    .replace(/\b(api[_-]?key|access[_-]?token|token|authorization)\s*[=:]\s*([^\s&,;]+)/gi, '$1=[REDACTED]')
}

function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    for (const key of [...url.searchParams.keys()]) {
      if (SECRET_QUERY_KEY.test(key)) url.searchParams.delete(key)
    }
    url.searchParams.sort()
    return url.toString().replace(/\(/g, '%28').replace(/\)/g, '%29')
  } catch {
    return null
  }
}

function stableSnapshot(value, key = '', seen = new WeakSet()) {
  if (value == null || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string') {
    if (SECRET_KEY.test(key)) return '[REDACTED]'
    if (/^[a-z][a-z0-9+.-]*:/i.test(value.trim())) return safeUrl(value)
    return redactSecrets(value)
  }
  if (typeof value !== 'object') return null
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  if (Array.isArray(value)) {
    const snapshot = value.map((item) => stableSnapshot(item, key, seen))
    seen.delete(value)
    return snapshot
  }
  const snapshot = {}
  for (const objectKey of Object.keys(value).sort()) {
    snapshot[objectKey] = SECRET_KEY.test(objectKey)
      ? '[REDACTED]'
      : stableSnapshot(value[objectKey], objectKey, seen)
  }
  seen.delete(value)
  return snapshot
}

function markdownText(value, fallback = '') {
  const text = redactSecrets(value == null || value === '' ? fallback : value)
  return text
    .replace(/\\/g, '\\\\')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n|\r|\n/g, '<br>')
    .replace(/\|/g, '\\|')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
}

function markdownLink(label, value, fallback = '未提供') {
  const url = safeUrl(value)
  return url ? `[${markdownText(label)}](${url})` : markdownText(fallback)
}

function hasEvidence(value) {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0)
}

function explicitlyNegativeEvidence(value) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === 'negative-evidence'
      || normalized.startsWith('negative:')
      || normalized.startsWith('negative-term:')
  }
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some(explicitlyNegativeEvidence)
  if (value.negative === true) return true
  return ['type', 'kind', 'reason', 'status'].some((field) => explicitlyNegativeEvidence(value[field]))
    || hasEvidence(value.negativeEvidence)
    || hasEvidence(value.matchedNegativeTerms)
}

function releaseGateReasons(rows) {
  const reasons = []
  for (const row of rows) {
    for (const item of list(row?.exact)) {
      if (item?.identityReason === 'negative-evidence'
        || hasEvidence(item?.negativeEvidence)
        || explicitlyNegativeEvidence(item?.identityEvidence)) {
        reasons.push(stableSnapshot({
          placeId: row?.placeId || null,
          placeName: row?.placeName || null,
          provider: row?.provider || null,
          candidateId: item?.id || null,
          title: item?.title || null,
          reason: 'negative candidate entered exact',
        }))
      }
    }
  }
  return reasons
}

function rowStatus(row) {
  if (row?.skipped) return '来源未执行'
  if (list(row?.exact).length > 0) return '精准匹配'
  if (list(row?.needsReview).length > 0) return '待人工确认'
  if (list(row?.rejected).length > 0) return '已拒绝'
  return '素材不足'
}

function normalizeRow(row) {
  const safe = row && typeof row === 'object' && !Array.isArray(row) ? stableSnapshot(row) : {}
  return {
    ...safe,
    placeId: safe.placeId || null,
    placeName: safe.placeName || safe.placeId || '未知地点',
    provider: safe.provider || '未知来源',
    exact: list(safe.exact),
    needsReview: list(safe.needsReview),
    rejected: list(safe.rejected),
    errors: list(safe.errors),
    statusCounts: safe.statusCounts && typeof safe.statusCounts === 'object' && !Array.isArray(safe.statusCounts)
      ? safe.statusCounts : {},
    status: rowStatus(safe),
  }
}

function sourceSummary(rows, override = {}) {
  const grouped = new Map()
  for (const row of rows) {
    if (!grouped.has(row.provider)) grouped.set(row.provider, [])
    grouped.get(row.provider).push(row)
  }
  const enabled = []
  const skipped = []
  const failed = []
  for (const [provider, providerRows] of grouped) {
    const executed = providerRows.filter((row) => !row.skipped)
    if (executed.length === 0) skipped.push(provider)
    else enabled.push(provider)
    if (executed.length > 0 && executed.every((row) => row.errors.length > 0
      && row.exact.length + row.needsReview.length + row.rejected.length === 0)) failed.push(provider)
  }
  const merged = (inferred, supplied) => [...new Set([...inferred, ...list(supplied).map(String)])].sort()
  return {
    enabled: merged(enabled, override.enabled),
    skipped: merged(skipped, override.skipped),
    failed: merged(failed, override.failed),
  }
}

function aggregateStatusCounts(rows) {
  const totals = Object.create(null)
  for (const row of rows) {
    for (const [status, value] of Object.entries(row.statusCounts)) {
      totals[status] = (totals[status] || 0) + count(value)
    }
  }
  return Object.fromEntries(Object.entries(totals).sort(([left], [right]) => left.localeCompare(right)))
}

function buildSummary(rows) {
  const firstExactValues = rows
    .map((row) => Number(row.firstExactMs))
    .filter((value) => Number.isFinite(value) && value >= 0)
  return {
    places: new Set(rows.map((row) => row.placeId).filter(Boolean)).size,
    sources: new Set(rows.map((row) => row.provider).filter(Boolean)).size,
    exactCandidates: rows.reduce((sum, row) => sum + row.exact.length, 0),
    reviewCandidates: rows.reduce((sum, row) => sum + row.needsReview.length, 0),
    rejectedCandidates: rows.reduce((sum, row) => sum + row.rejected.length, 0),
    logicalQueries: rows.reduce((sum, row) => sum + count(row.requestCount), 0),
    attemptCount: rows.reduce((sum, row) => sum + count(row.attemptCount), 0),
    retries: rows.reduce((sum, row) => sum + count(row.retryCount), 0),
    timeouts: rows.reduce((sum, row) => sum + count(row.timeoutCount), 0),
    statusCounts: aggregateStatusCounts(rows),
    finalErrors: rows.reduce((sum, row) => sum + row.errors.length, 0),
    cacheHits: rows.reduce((sum, row) => sum + count(row.cacheHits), 0),
    firstExactMs: firstExactValues.length > 0 ? Math.min(...firstExactValues) : null,
    totalElapsedMs: rows.reduce((sum, row) => sum + count(row.elapsedMs), 0),
  }
}

function formatEvidence(value) {
  const evidence = list(value)
  if (evidence.length === 0) return '无'
  return evidence.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join('、')
}

function candidateLines(row) {
  const candidates = [
    ...row.exact.map((item) => ({ label: '精准匹配', item })),
    ...row.needsReview.map((item) => ({ label: '待人工确认', item })),
    ...row.rejected.map((item) => ({ label: '已拒绝', item })),
  ].slice(0, 3)
  return candidates.flatMap(({ label, item }) => {
    const license = safeUrl(item?.licenseUrl)
      ? markdownLink(item?.license || '许可详情', item.licenseUrl)
      : markdownText(item?.license, '未知')
    return [
      `  - ${label} · **${markdownText(item?.title, '无标题')}**`,
      `    - 身份原因：${markdownText(item?.identityReason, 'unknown')}`,
      `    - 身份证据：${markdownText(formatEvidence(item?.identityEvidence))}`,
      `    - 来源页：${markdownLink('来源页', item?.sourcePage)}`,
      `    - 作者：${markdownText(item?.author, '未知')}`,
      `    - 许可：${license}`,
    ]
  })
}

function errorLines(row) {
  return row.errors.map((error) => `  - 错误：${markdownText(error?.status, 'error')} ${markdownText(error?.message, '未知错误')}`)
}

function overallPlaceStatus(rows) {
  if (rows.some((row) => row.exact.length > 0)) return '精准匹配'
  if (rows.some((row) => row.needsReview.length > 0)) return '待人工确认'
  if (rows.every((row) => row.skipped)) return '来源未执行'
  if (rows.some((row) => row.rejected.length > 0)) return '已拒绝'
  return '素材不足'
}

function groupedPlaces(rows) {
  const places = new Map()
  rows.forEach((row, index) => {
    const key = row.placeId || row.placeName || `unknown-${index}`
    if (!places.has(key)) places.set(key, {
      placeId: row.placeId,
      placeName: row.placeName,
      rows: [],
    })
    places.get(key).rows.push(row)
  })
  return [...places.values()]
}

function placeSummaries(rows) {
  return groupedPlaces(rows).map((place) => ({
    placeId: place.placeId,
    placeName: place.placeName,
    status: overallPlaceStatus(place.rows),
    providers: place.rows.map((row) => row.provider),
    exactCandidates: place.rows.reduce((sum, row) => sum + row.exact.length, 0),
    reviewCandidates: place.rows.reduce((sum, row) => sum + row.needsReview.length, 0),
    rejectedCandidates: place.rows.reduce((sum, row) => sum + row.rejected.length, 0),
  }))
}

function placeSections(rows) {
  return groupedPlaces(rows).flatMap((place) => [
    `## ${markdownText(place.placeName)}`,
    '',
    `- 地点状态：${overallPlaceStatus(place.rows)}`,
    ...place.rows.flatMap((row) => [
      `- ${markdownText(row.provider)}：${row.status}`,
      ...candidateLines(row),
      ...errorLines(row),
    ]),
    '',
  ])
}

function buildLists(rows) {
  const entry = (row, extra = {}) => ({
    placeId: row.placeId,
    placeName: row.placeName,
    provider: row.provider,
    status: row.status,
    ...extra,
  })
  return {
    noResults: rows
      .filter((row) => !row.skipped && row.exact.length === 0 && row.needsReview.length === 0)
      .map((row) => entry(row, { errors: stableSnapshot(row.errors) })),
    needsReview: rows.filter((row) => row.needsReview.length > 0)
      .map((row) => entry(row, { count: row.needsReview.length })),
    unexecuted: rows.filter((row) => row.skipped)
      .map((row) => entry(row, { reason: String(row.skipped) })),
  }
}

function listSection(title, entries) {
  return [
    `### ${title}`,
    '',
    ...(entries.length > 0
      ? entries.map((entry) => `- ${markdownText(entry.placeName)} · ${markdownText(entry.provider)}：${markdownText(entry.reason || entry.status)}`)
      : ['- 无']),
    '',
  ]
}

function generatedAt(options) {
  let value
  try {
    value = typeof options.now === 'function' ? options.now()
      : typeof options.clock === 'function' ? options.clock() : new Date()
  } catch {
    value = new Date(0)
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString()
}

const sourceList = (values) => values.length > 0 ? values.map(markdownText).join('、') : '无'

export function buildBenchmarkReport(inputRows, options = {}) {
  const settings = options && typeof options === 'object' && !Array.isArray(options) ? options : {}
  const rawRows = Array.isArray(inputRows) ? inputRows : []
  const gateReasons = releaseGateReasons(rawRows)
  const rows = rawRows.map(normalizeRow)
  const sources = sourceSummary(rows, settings.sourceStatus)
  const summary = buildSummary(rows)
  const lists = buildLists(rows)
  const places = placeSummaries(rows)
  const createdAt = generatedAt(settings)
  const statusText = Object.entries(summary.statusCounts).map(([status, value]) => `${status}=${value}`).join('、') || '无'
  const lines = [
    '# 多源精准搜图基准报告',
    '',
    `- 执行时间：${createdAt}`,
    `- 启用来源：${sourceList(sources.enabled)}`,
    `- 跳过来源：${sourceList(sources.skipped)}`,
    `- 失败来源：${sourceList(sources.failed)}`,
    '',
    '## 摘要',
    '',
    '| 指标 | 数值 |',
    '|---|---:|',
    `| 节点数 | ${summary.places} |`,
    `| 精准/待确认/已拒绝 | ${summary.exactCandidates}/${summary.reviewCandidates}/${summary.rejectedCandidates} |`,
    `| 首张精准图片时间(ms) | ${summary.firstExactMs ?? '无'} |`,
    `| 总耗时(ms) | ${summary.totalElapsedMs} |`,
    `| 逻辑查询数 | ${summary.logicalQueries} |`,
    `| 接口调用总数 | ${summary.attemptCount} |`,
    `| 重试/超时/最终错误/缓存命中 | ${summary.retries}/${summary.timeouts}/${summary.finalErrors}/${summary.cacheHits} |`,
    `| 状态码统计 | ${markdownText(statusText)} |`,
    '',
    `- 逻辑查询数：${summary.logicalQueries}`,
    `- 接口调用总数：${summary.attemptCount}`,
    '',
    '| 节点 | 来源 | 状态 | 耗时(ms) | 精准/待确认/拒绝 |',
    '|---|---|---|---:|---:|',
    ...rows.map((row) => `| ${markdownText(row.placeName)} | ${markdownText(row.provider)} | ${row.status} | ${count(row.elapsedMs)} | ${row.exact.length}/${row.needsReview.length}/${row.rejected.length} |`),
    '',
    ...placeSections(rows),
    '## 复核清单',
    '',
    ...listSection('无结果清单', lists.noResults),
    ...listSection('待人工确认清单', lists.needsReview),
    ...listSection('来源未执行清单', lists.unexecuted),
  ]
  const report = {
    markdown: `${lines.join('\n')}\n`,
    json: stableSnapshot({
      generatedAt: createdAt,
      releaseGate: { passed: gateReasons.length === 0, reasons: gateReasons },
      summary,
      sources,
      lists,
      places,
      rows,
    }),
  }
  if (gateReasons.length > 0) {
    const first = gateReasons[0]
    const error = new Error(`negative candidate entered exact: ${redactSecrets(first.placeName || 'unknown place')} / ${redactSecrets(first.title || 'untitled')}`)
    error.report = report
    throw error
  }
  return report
}
