// TTS 参数：音色 slug → edge-tts voice、语速倍率 → 百分比、入参校验。
// 纯函数，单测见 ttsParams.test.js。

const VOICE_MAP = {
  xiaoxiao: 'zh-CN-XiaoxiaoNeural',
  yunxi: 'zh-CN-YunxiNeural',
  xiaoyi: 'zh-CN-XiaoyiNeural',
}

export function resolveVoice(slug) {
  return VOICE_MAP[slug] || VOICE_MAP.xiaoxiao
}

export function rateToPercent(rate) {
  const pct = Math.round((rate - 1) * 100)
  return `${pct >= 0 ? '+' : ''}${pct}%`
}

export function validateTtsBody(body) {
  const text = body?.text ?? body?.ssml
  if (!text || typeof text !== 'string') {
    const err = new Error('缺少 text')
    err.status = 400
    throw err
  }
  return {
    text,
    voice: body.voice || 'xiaoxiao',
    rate: typeof body.rate === 'number' ? body.rate : 1,
  }
}
