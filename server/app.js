import express from 'express'
import { validateTtsBody } from './ttsParams.js'

// 依赖注入：synthesize({text,voice,rate})→Buffer(mp3)；generateNarration({apiKey,items,model})→[{nodeName,dayNumber,narration}]
export function createApp({ synthesize, generateNarration }) {
  const app = express()
  app.use(express.json({ limit: '1mb' }))

  app.get('/api/health', (req, res) => res.json({ ok: true }))

  app.post('/api/tts', async (req, res) => {
    try {
      const { text, voice, rate } = validateTtsBody(req.body)
      const mp3 = await synthesize({ text, voice, rate })
      res.set('Content-Type', 'audio/mpeg').send(mp3)
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message })
    }
  })

  app.post('/api/narration', async (req, res) => {
    try {
      const { apiKey, items, model } = req.body || {}
      if (!apiKey) {
        const err = new Error('缺少 LLM API Key，请在「设置」中填写')
        err.status = 400
        throw err
      }
      if (!Array.isArray(items) || items.length === 0) {
        const err = new Error('items 不能为空')
        err.status = 400
        throw err
      }
      const results = await generateNarration({ apiKey, items, model })
      res.json({ results })
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message })
    }
  })

  return app
}
