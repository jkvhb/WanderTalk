import { createApp } from './app.js'
import { synthesizeToMp3 } from './synthesize.js'
import { makeNarrationGenerator, callDeepSeek } from './narration.js'

const PORT = process.env.PORT || 8787

const synthesize = (args) => synthesizeToMp3(args)
const generateNarration = makeNarrationGenerator({ callLLM: callDeepSeek })

createApp({ synthesize, generateNarration }).listen(PORT, () => {
  console.log(`[wandertalk-api] listening on http://localhost:${PORT}`)
})
