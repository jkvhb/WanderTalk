import { buildPlanNarrationMessages } from './narrationPrompt.js'

// 整条路线一次 LLM 调用，要求 JSON 输出，按 dayNumber+index 回填
export function makePlanNarrationGenerator({ callLLM }) {
  return async function generateNarration({ provider, apiKey, items, model }) {
    const content = await callLLM({
      provider,
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
