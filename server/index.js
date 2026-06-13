import { createApp } from './app.js'
import { synthesizeToMp3 } from './synthesize.js'

const PORT = process.env.PORT || 8787

const synthesize = (args) => synthesizeToMp3(args)
const generateNarration = async () => {
  throw Object.assign(new Error('AI 旁白尚未接入（Task 8）'), { status: 501 })
}

createApp({ synthesize, generateNarration }).listen(PORT, () => {
  console.log(`[wandertalk-api] listening on http://localhost:${PORT}`)
})
