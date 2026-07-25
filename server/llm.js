const PROVIDERS = {
  kimi: {
    url: 'https://api.moonshot.cn/v1/chat/completions',
    defaultModel: 'kimi-k2.6',
    label: 'Kimi',
  },
  deepseek: {
    url: 'https://api.deepseek.com/chat/completions',
    defaultModel: 'deepseek-v4-flash',
    label: 'DeepSeek',
  },
}

function httpError(message, status) {
  const error = new Error(message)
  error.status = status
  return error
}

export function makeLlmCaller({ moonshotApiKey = '', fetchImpl = fetch } = {}) {
  return async function callLLM({
    provider = 'kimi',
    apiKey = '',
    model,
    messages,
    json = false,
  }) {
    const config = PROVIDERS[provider]
    if (!config) throw httpError(`不支持的 AI 供应商：${provider}`, 400)

    const resolvedKey = provider === 'kimi' ? moonshotApiKey : apiKey
    if (!resolvedKey) {
      const message =
        provider === 'kimi'
          ? 'Kimi 尚未在本地服务端配置，请设置 MOONSHOT_API_KEY'
          : '请先在「设置」填写 DeepSeek API Key'
      throw httpError(message, provider === 'kimi' ? 503 : 400)
    }

    const body = {
      model: model || config.defaultModel,
      messages,
    }
    if (provider === 'kimi') {
      body.thinking = { type: 'disabled' }
    } else {
      body.temperature = 0.7
    }
    if (json) body.response_format = { type: 'json_object' }

    const response = await fetchImpl(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resolvedKey}`,
      },
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data?.error?.message || `${config.label} 请求失败（${response.status}）`)
    }
    return data.choices?.[0]?.message?.content ?? ''
  }
}
