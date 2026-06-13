import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { resolveVoice, rateToPercent, plainText } from './ttsParams.js'

// 把 {text, voice(slug), rate(倍率)} 合成为 mp3 Buffer。
// 隔离的真实 edge-tts 调用（app.test.js 用 mock，不依赖网络）。
// 重要：Edge 免费朗读接口不支持内联 SSML，带标签会返回空音频，
// 故合成前用 plainText 清洗为纯文本；空结果按 422 抛出，避免给前端空音频。
export async function synthesizeToMp3({ text, voice, rate }) {
  const clean = plainText(text)
  if (!clean) {
    throw Object.assign(new Error('文案为空或仅含标记，无法合成'), { status: 422 })
  }
  const tts = new MsEdgeTTS()
  await tts.setMetadata(resolveVoice(voice), OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
  const { audioStream } = tts.toStream(clean, { rate: rateToPercent(rate) })
  const chunks = []
  for await (const chunk of audioStream) chunks.push(chunk)
  const buf = Buffer.concat(chunks)
  if (buf.length === 0) {
    throw Object.assign(new Error('合成结果为空（edge-tts 未返回音频）'), { status: 422 })
  }
  return buf
}
