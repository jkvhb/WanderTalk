import { buildNarrationMessages } from './narrationPrompt.js'

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'

export async function callDeepSeek({ apiKey, model = 'deepseek-chat', messages }) {
  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.7 }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || `DeepSeek 请求失败（${res.status}）`)
  return data.choices?.[0]?.message?.content ?? ''
}

// 注入 callLLM 便于测试；逐节点串行生成
export function makeNarrationGenerator({ callLLM }) {
  return async function generateNarration({ apiKey, items, model }) {
    const results = []
    for (const item of items) {
      const content = await callLLM({ apiKey, model, messages: buildNarrationMessages(item) })
      results.push({ nodeName: item.nodeName, dayNumber: item.dayNumber, narration: content.trim() })
    }
    return results
  }
}
