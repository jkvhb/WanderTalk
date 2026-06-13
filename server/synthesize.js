import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { resolveVoice, rateToPercent } from './ttsParams.js'

// 把 {text, voice(slug), rate(倍率)} 合成为 mp3 Buffer。
// 隔离的真实 edge-tts 调用（app.test.js 用 mock，不依赖网络）。
// API 对照 msedge-tts@2.0.5：setMetadata 为 async；toStream(input,{rate}) 同步返回 { audioStream }，
// input 可含 SSML（<break>/<emphasis> 等）。
export async function synthesizeToMp3({ text, voice, rate }) {
  const tts = new MsEdgeTTS()
  await tts.setMetadata(resolveVoice(voice), OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
  const { audioStream } = tts.toStream(text, { rate: rateToPercent(rate) })
  const chunks = []
  for await (const chunk of audioStream) chunks.push(chunk)
  return Buffer.concat(chunks)
}
