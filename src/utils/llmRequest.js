export function resolveLlmRequest(settings) {
  const provider = settings?.llmProvider === 'deepseek' ? 'deepseek' : 'kimi'
  return {
    provider,
    apiKey: provider === 'deepseek'
      ? String(settings?.llmKey || '').trim()
      : String(settings?.kimiKey || '').trim(),
  }
}

export function missingLlmKeyMessage(settings) {
  const request = resolveLlmRequest(settings)
  if (request.provider === 'deepseek' && !request.apiKey) {
    return '请先在「设置」中填写 DeepSeek API Key'
  }
  // Kimi 允许本地服务端的 MOONSHOT_API_KEY 兜底，最终缺失由服务端统一提示。
  return ''
}
