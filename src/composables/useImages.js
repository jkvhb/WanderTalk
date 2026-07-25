// Phase 4d：AI 自动配图——前端 API 薄封装，对齐 useNarration.js 的写法。

export async function generateImageQueries(nodes, { provider = 'kimi', apiKey = '', model } = {}) {
  const res = await fetch('/api/imageQuery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, apiKey, model, nodes }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `生成检索词失败（${res.status}）`)
  return data.results
}

export async function searchPixabayImages(q, lang) {
  const params = new URLSearchParams({ q })
  if (lang) params.set('lang', lang)
  const res = await fetch(`/api/images/search?${params.toString()}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `搜索失败（${res.status}）`)
  return data.results
}

// 返回 Blob（供 downscaleImage 使用）
export async function fetchPixabayImageBlob(url) {
  const res = await fetch(`/api/images/fetch?${new URLSearchParams({ url }).toString()}`)
  if (!res.ok) {
    let msg = `图片下载失败（${res.status}）`
    try {
      const data = await res.json()
      if (data?.error) msg = data.error
    } catch {
      /* 忽略 */
    }
    throw new Error(msg)
  }
  return res.blob()
}

export async function searchCommonsImages(q) {
  const res = await fetch(`/api/images/commons?${new URLSearchParams({ q }).toString()}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Commons search failed (${res.status})`)
  return data.results
}
