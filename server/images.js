// Phase 4d：AI 自动配图后端——DeepSeek 检索词生成 + Pixabay 搜索/下载代理。
// 依赖注入风格与 narration.js 一致，方便 mock 全局 fetch 做单测。

const PIXABAY_URL = 'https://pixabay.com/api/'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // Pixabay 条款要求缓存，同 q+lang 24h 内不重复请求

const searchCache = new Map() // key: `${lang}|${q}` -> { at, data }

export function clearSearchCache() {
  searchCache.clear()
}

// —— imageQuery：批量为节点生成检索词 + 互证关键词 ——
function buildImageQueryMessages(nodes) {
  const system =
    '你是旅行图片检索助手，为路线中的地点生成用于图片搜索引擎（Pixabay）的检索词。要求：\n' +
    '1) 每个节点给出 queries 数组，依次为：中文名、英文名、场景描述（如"雪山草甸"）、区域意象词（更宽泛的兜底词，如"川西高原"）；\n' +
    '2) 每个节点给出 keywords 数组：用于与图片标签互证的中英文关键词（小写英文优先，覆盖地名/景观特征）；\n' +
    '3) 只依据给定信息，不要编造具体事实；\n' +
    '4) 只输出 JSON，格式：{"results":[{"index":数字,"queries":["..."],"keywords":["..."]}]}，不要输出任何额外说明文字。'
  const lines = nodes.map((n, i) => {
    const bits = [`index=${i}`, `节点:${n.name}`]
    if (n.address) bits.push(`地址:${n.address}`)
    if (n.note) bits.push(`备注:${n.note}`)
    return bits.join(' | ')
  })
  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: '节点列表（请为每个节点生成检索词，并原样回填 index）：\n' + lines.join('\n'),
    },
  ]
}

// callLLM({apiKey,model,messages,json}) -> string，同 narration.js 的 callDeepSeek 签名
export function makeImageQueryGenerator({ callLLM }) {
  return async function generateImageQueries({ apiKey, nodes, model }) {
    const content = await callLLM({
      apiKey,
      model,
      messages: buildImageQueryMessages(nodes),
      json: true,
    })
    let parsed
    try {
      parsed = JSON.parse(content)
    } catch {
      throw new Error('AI 返回的不是有效 JSON，请重试')
    }
    const list = Array.isArray(parsed) ? parsed : parsed.results || parsed.list || []
    return list.map((r) => ({
      index: r.index,
      queries: Array.isArray(r.queries) ? r.queries.map((q) => String(q).trim()).filter(Boolean) : [],
      keywords: Array.isArray(r.keywords) ? r.keywords.map((k) => String(k).trim()).filter(Boolean) : [],
    }))
  }
}

// —— Pixabay 搜索代理：字段裁剪 + 24h 内存缓存 ——
export async function searchImages({ apiKey, q, lang }, fetchImpl = fetch) {
  if (!apiKey) {
    const err = new Error('服务端未配置 PIXABAY_KEY，请联系管理员在 .env 中设置')
    err.status = 500
    throw err
  }
  const cacheKey = `${lang || ''}|${q || ''}`
  const cached = searchCache.get(cacheKey)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data
  }

  const url = new URL(PIXABAY_URL)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('q', q || '')
  if (lang) url.searchParams.set('lang', lang)
  url.searchParams.set('image_type', 'photo')
  url.searchParams.set('orientation', 'horizontal')
  url.searchParams.set('per_page', '20')
  url.searchParams.set('safesearch', 'true')

  const res = await fetchImpl(url.toString())
  if (!res.ok) {
    let msg = `Pixabay 请求失败（${res.status}）`
    try {
      const text = await res.text()
      if (text) msg += `：${text}`
    } catch {
      /* 忽略 */
    }
    const err = new Error(msg)
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502
    throw err
  }
  const data = await res.json().catch(() => ({}))
  const hits = Array.isArray(data.hits) ? data.hits : []
  const trimmed = hits.map((h) => ({
    id: h.id,
    tags: h.tags,
    webformatURL: h.webformatURL,
    largeImageURL: h.largeImageURL,
    pageURL: h.pageURL,
  }))
  searchCache.set(cacheKey, { at: Date.now(), data: trimmed })
  return trimmed
}

// —— SSRF 白名单：只允许 pixabay.com / cdn.pixabay.com（含子域）——
export function isAllowedImageHost(rawUrl) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  const host = parsed.hostname.toLowerCase()
  return host === 'pixabay.com' || host === 'cdn.pixabay.com' || host.endsWith('.pixabay.com') || host === 'upload.wikimedia.org'
}

// —— 图片字节下载代理（浏览器直连 CDN 可能被 CORS 拦）——
export async function fetchImageBytes(rawUrl, fetchImpl = fetch) {
  if (!isAllowedImageHost(rawUrl)) {
    const err = new Error('仅允许代理 pixabay.com / cdn.pixabay.com 的图片地址')
    err.status = 400
    throw err
  }
  const res = await fetchImpl(rawUrl)
  if (!res.ok) {
    const err = new Error(`图片下载失败（${res.status}）`)
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502
    throw err
  }
  const contentType = (res.headers?.get?.('content-type')) || 'application/octet-stream'
  const buffer = Buffer.from(await res.arrayBuffer())
  return { contentType, buffer }
}
