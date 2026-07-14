// Phase 4e：编排动效——前端 API 薄封装，对齐 useImages.js 的写法。

export async function generateChoreographyConfigs(nodes, { apiKey, model } = {}) {
  const res = await fetch('/api/choreography', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, model, nodes }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `生成编排配置失败（${res.status}）`)
  return data.results
}
