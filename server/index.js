import { createApp } from './app.js'
import { synthesizeToMp3 } from './synthesize.js'
import { makePlanNarrationGenerator } from './narration.js'
import { makeLlmCaller } from './llm.js'
import { makeImageQueryGenerator, searchImages, fetchImageBytes } from './images.js'
import { searchCommonsImages } from './commonsImages.js'
import { makeChoreographyGenerator } from './choreography.js'
import { loadProjectEnv } from './env.js'

// 优先当前目录；从 .worktrees/<分支> 启动时，缺失才回退项目主目录。
loadProjectEnv()

const PORT = process.env.PORT || 8787
const PIXABAY_KEY = process.env.PIXABAY_KEY || ''
const callLLM = makeLlmCaller({ moonshotApiKey: process.env.MOONSHOT_API_KEY || '' })

const synthesize = (args) => synthesizeToMp3(args)
const generateNarration = makePlanNarrationGenerator({ callLLM })
const generateImageQueries = makeImageQueryGenerator({ callLLM })
const generateChoreography = makeChoreographyGenerator({ callLLM })
const searchImagesWithKey = ({ q, lang }) => searchImages({ apiKey: PIXABAY_KEY, q, lang })

createApp({
  synthesize,
  generateNarration,
  generateImageQueries,
  searchImages: searchImagesWithKey,
  searchCommonsImages,
  fetchImageBytes,
  generateChoreography,
}).listen(PORT, () => {
  console.log(`[wandertalk-api] listening on http://localhost:${PORT}`)
})
