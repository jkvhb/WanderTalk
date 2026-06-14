import { buildPlanNarrationMessages } from './narrationPrompt.js'

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'

export async function callDeepSeek({ apiKey, model = 'deepseek-chat', messages, json = false }) {
  const body = { model, messages, temperature: 0.7 }
  if (json) body.response_format = { type: 'json_object' }
  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || `DeepSeek 请求失败（${res.status}）`)
  return data.choices?.[0]?.message?.content ?? ''
}

// 整条路线一次 LLM 调用，要求 JSON 输出，按 dayNumber+index 回填
export function makePlanNarrationGenerator({ callLLM }) {
  return async function generateNarration({ apiKey, items, model }) {
    const content = await callLLM({
      apiKey,
      model,
      messages: buildPlanNarrationMessages(items),
      json: true,
    })
    let parsed
    try {
      parsed = JSON.parse(content)
    } catch {
      throw new Error('AI 返回的不是有效 JSON，请重试')
    }
    const list = Array.isArray(parsed) ? parsed : parsed.list || parsed.results || []
    return list.map((r) => ({
      dayNumber: r.dayNumber,
      index: r.index,
      nodeName: r.nodeName,
      narration: String(r.narration || '').trim(),
    }))
  }
}
