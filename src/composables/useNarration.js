export async function generateNarrationDraft(items, { apiKey, model }) {
  const res = await fetch('/api/narration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, model, items }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `生成失败（${res.status}）`)
  return data.results
}
