import { hashKey } from '../utils/hash'
import { getCachedAudio, setCachedAudio } from '../utils/db'
import { getAudioDuration } from './audioDuration'

export const VOICES = [
  { slug: 'xiaoxiao', name: '晓晓（女）' },
  { slug: 'yunxi', name: '云希（男）' },
  { slug: 'xiaoyi', name: '晓伊（女）' },
]

export function audioKey(text, voice, rate) {
  return hashKey(`${voice}|${rate}|${text}`)
}

// 返回 { blob, duration, mime }；命中 IndexedDB 缓存则秒回
export async function synthesize({ text, voice, rate }) {
  const key = audioKey(text, voice, rate)
  const cached = await getCachedAudio(key)
  if (cached) return cached

  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice, rate }),
  })
  if (!res.ok) {
    let msg = `合成失败（${res.status}）`
    try {
      const data = await res.json()
      if (data?.error) msg = data.error
    } catch {
      msg += '：后端未启动？请用 npm run dev 同时启动前后端'
    }
    throw new Error(msg)
  }
  const blob = await res.blob()
  const duration = await getAudioDuration(blob)
  const entry = { blob, duration, mime: blob.type || 'audio/mpeg' }
  await setCachedAudio(key, entry)
  return entry
}
