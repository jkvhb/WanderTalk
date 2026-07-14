import { createApp } from './app.js'
import { synthesizeToMp3 } from './synthesize.js'
import { makePlanNarrationGenerator, callDeepSeek } from './narration.js'
import { makeImageQueryGenerator, searchImages, fetchImageBytes } from './images.js'
import { makeChoreographyGenerator } from './choreography.js'

// 加载 .env（存在则读取，如 PIXABAY_KEY）；Node 20.6+/22+ 原生支持，找不到文件也不报错退出
try {
  process.loadEnvFile?.()
} catch {
  /* .env 不存在时忽略，PIXABAY_KEY 未配置会在请求 /api/images/search 时给出可读错误 */
}

const PORT = process.env.PORT || 8787
const PIXABAY_KEY = process.env.PIXABAY_KEY || ''

const synthesize = (args) => synthesizeToMp3(args)
const generateNarration = makePlanNarrationGenerator({ callLLM: callDeepSeek })
const generateImageQueries = makeImageQueryGenerator({ callLLM: callDeepSeek })
const generateChoreography = makeChoreographyGenerator({ callLLM: callDeepSeek })
const searchImagesWithKey = ({ q, lang }) => searchImages({ apiKey: PIXABAY_KEY, q, lang })

createApp({
  synthesize,
  generateNarration,
  generateImageQueries,
  searchImages: searchImagesWithKey,
  fetchImageBytes,
  generateChoreography,
}).listen(PORT, () => {
  console.log(`[wandertalk-api] listening on http://localhost:${PORT}`)
})
