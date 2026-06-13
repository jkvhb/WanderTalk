import { createApp } from './app.js'

const PORT = process.env.PORT || 8787

// Task 3 / Task 8 会用真实实现替换这两个占位
const synthesize = async () => {
  throw Object.assign(new Error('TTS 尚未接入（Task 3）'), { status: 501 })
}
const generateNarration = async () => {
  throw Object.assign(new Error('AI 旁白尚未接入（Task 8）'), { status: 501 })
}

createApp({ synthesize, generateNarration }).listen(PORT, () => {
  console.log(`[wandertalk-api] listening on http://localhost:${PORT}`)
})
