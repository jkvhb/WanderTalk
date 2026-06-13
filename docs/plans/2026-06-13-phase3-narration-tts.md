# Phase 3 旁白生成与语音合成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为路书节点编写讲解旁白、用 edge-tts 合成中文语音、记录每段音频时长并缓存，AI（DeepSeek）可生成草稿——为 Phase 4「旁白驱动飞行动画」备好「文本 + 音频 + 时长」输入。

**Architecture:** 新增极简后端 `server/`（Express）：`/api/tts` 用 msedge-tts 合成 mp3、`/api/narration` 以 OpenAI 兼容协议代理 DeepSeek。后端用依赖注入（`createApp({ synthesize, generateNarration })`）让路由可在 mock 下测试；与外部接口真正交互的代码隔离在单独模块。前端旁白锚定到节点（`waypoint.narration`），音色/语速全局（`plan.voice`/`plan.rate`），音频按 `hash(text+voice+rate)` 缓存到 IndexedDB（含 duration）。开发期 Vite `proxy` 转发 `/api`，`concurrently` 一条命令起前后端。

**Tech Stack:** Vue 3, Pinia, idb, Vitest, fake-indexeddb；新增 Express、msedge-tts、concurrently、supertest（dev）。LLM 用 DeepSeek（`https://api.deepseek.com/chat/completions`，OpenAI 兼容）。

**环境备注:** Windows，node 仅在 PowerShell 可用（`D:\node.exe`，v24.14.1，已含全局 `fetch`/`Blob`/`Response`）。所有 node/npm 用 PowerShell；git 两边都可用。设计依据见 [docs/specs/2026-06-13-phase3-narration-tts-design.md](../specs/2026-06-13-phase3-narration-tts-design.md)。

**对 PRD 的偏差（已在 spec 记录，实现末尾写入 CHANGELOG）：** 个人版引入薄后端；TTS 用后端 edge-tts；LLM 用 DeepSeek；旁白按节点锚定并记录音频时长。

---

## File Structure

```
server/                         ★新增后端
├── ttsParams.js                纯函数：resolveVoice / rateToPercent / validateTtsBody
├── ttsParams.test.js           ★
├── synthesize.js               msedge-tts 封装（隔离的外部调用，不单测）
├── narrationPrompt.js          纯函数：buildNarrationMessages
├── narrationPrompt.test.js     ★
├── narration.js                callDeepSeek + makeNarrationGenerator
├── app.js                      createApp({ synthesize, generateNarration }) → Express 实例
├── app.test.js                 ★ supertest 注入假依赖测路由
└── index.js                    入口：装配真实依赖并 listen
src/
├── utils/
│   ├── hash.js                 稳定字符串哈希（缓存 key）★
│   ├── hash.test.js            ★
│   ├── db.js                   ★升级 v2：新增 audioCache + getCachedAudio/setCachedAudio
│   └── db.test.js              ★追加 audioCache 测试
├── composables/
│   ├── audioDuration.js        getAudioDuration(blob)（隔离，便于 mock）★
│   ├── useTts.js               synthesize（缓存感知）+ VOICES ★
│   ├── useTts.test.js          ★
│   ├── useNarration.js         generateNarrationDraft（调 /api/narration）★
│   └── useNarration.test.js    ★
├── stores/
│   ├── trip.js                 ★：waypoint.narration、plan.voice/rate、setNarration/setVoice/setRate/loadPresetNarration
│   └── trip.test.js            ★追加
├── data/
│   ├── preset318Narration.js   318 各节点旁白文案 + 表 ★
│   └── preset318Narration.test.js ★
├── components/
│   └── NarrationDayCard.vue    单天卡片：列节点 + 旁白编辑 + 试听 + AI 生成 ★
└── views/
    └── StudioView.vue          ★整体替换：全局控制 + 按天分组编辑 + 批量合成
vite.config.js                  ★加 server.proxy
package.json                    ★加依赖与脚本
CHANGELOG.md                    ★
```

---

## Task 1: 后端骨架 + 健康检查 + 前后端联跑

**Files:**
- Create: `server/app.js`, `server/index.js`, `server/app.test.js`
- Modify: `vite.config.js`, `package.json`

- [ ] **Step 1: 安装依赖**

PowerShell：

```powershell
npm install express msedge-tts
npm install -D concurrently supertest
```

- [ ] **Step 2: 写失败的测试 `server/app.test.js`**

```js
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from './app'

function makeApp(overrides = {}) {
  return createApp({
    synthesize: async () => Buffer.from('FAKEMP3'),
    generateNarration: async () => [],
    ...overrides,
  })
}

describe('app 健康检查', () => {
  it('GET /api/health 返回 ok', async () => {
    const res = await request(makeApp()).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})
```

- [ ] **Step 3: 运行确认失败**

```powershell
npm test
```

Expected: FAIL，找不到 `./app`。

- [ ] **Step 4: 实现 `server/app.js`**

```js
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
```

注意：`app.js` 引用了 `validateTtsBody`（Task 2 实现）。本任务测试只打 `/api/health`，但 import 必须可解析——所以本步先创建 `server/ttsParams.js` 占位导出（Task 2 再补测试与完整实现）：

```js
// server/ttsParams.js（Task 1 先放最小可用版，Task 2 完善 + 测试）
export function validateTtsBody(body) {
  const text = body?.text ?? body?.ssml
  if (!text || typeof text !== 'string') {
    const err = new Error('缺少 text')
    err.status = 400
    throw err
  }
  return { text, voice: body.voice || 'xiaoxiao', rate: typeof body.rate === 'number' ? body.rate : 1 }
}
export function resolveVoice(slug) {
  return { xiaoxiao: 'zh-CN-XiaoxiaoNeural', yunxi: 'zh-CN-YunxiNeural', xiaoyi: 'zh-CN-XiaoyiNeural' }[slug] || 'zh-CN-XiaoxiaoNeural'
}
export function rateToPercent(rate) {
  const pct = Math.round((rate - 1) * 100)
  return `${pct >= 0 ? '+' : ''}${pct}%`
}
```

- [ ] **Step 5: 实现 `server/index.js`（入口）**

`synthesize`/`narration` 模块在后续任务实现；本步先用占位实现保证可启动：

```js
import { createApp } from './app.js'

const PORT = process.env.PORT || 8787

// Task 3 / Task 9 会用真实实现替换这两个占位
const synthesize = async () => {
  throw Object.assign(new Error('TTS 尚未接入（Task 3）'), { status: 501 })
}
const generateNarration = async () => {
  throw Object.assign(new Error('AI 旁白尚未接入（Task 9）'), { status: 501 })
}

createApp({ synthesize, generateNarration }).listen(PORT, () => {
  console.log(`[wandertalk-api] listening on http://localhost:${PORT}`)
})
```

- [ ] **Step 6: Vite 代理 `vite.config.js`**

整体替换为：

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  test: {
    environment: 'node',
    globals: true,
  },
})
```

- [ ] **Step 7: `package.json` 脚本**

将 `scripts` 中的 `"dev"` 替换，并新增两条：

```json
    "dev": "concurrently -n web,api -c blue,green \"vite\" \"node server/index.js\"",
    "dev:web": "vite",
    "server": "node server/index.js",
```

- [ ] **Step 8: 运行测试确认通过**

```powershell
npm test
```

Expected: PASS，health 测试通过。

- [ ] **Step 9: 提交**

```bash
git add server/app.js server/index.js server/app.test.js server/ttsParams.js vite.config.js package.json package-lock.json
git commit -m "feat(server): Express 骨架、/api 健康检查与前后端联跑脚本"
```

---

## Task 2: TTS 参数映射（纯函数）

**Files:**
- Modify: `server/ttsParams.js`
- Create: `server/ttsParams.test.js`

- [ ] **Step 1: 写失败的测试 `server/ttsParams.test.js`**

```js
import { describe, it, expect } from 'vitest'
import { resolveVoice, rateToPercent, validateTtsBody } from './ttsParams'

describe('resolveVoice', () => {
  it('已知 slug 映射到 edge-tts voice', () => {
    expect(resolveVoice('xiaoxiao')).toBe('zh-CN-XiaoxiaoNeural')
    expect(resolveVoice('yunxi')).toBe('zh-CN-YunxiNeural')
    expect(resolveVoice('xiaoyi')).toBe('zh-CN-XiaoyiNeural')
  })
  it('未知 slug 回退晓晓', () => {
    expect(resolveVoice('???')).toBe('zh-CN-XiaoxiaoNeural')
  })
})

describe('rateToPercent', () => {
  it('1.0→+0%，1.5→+50%，0.8→-20%', () => {
    expect(rateToPercent(1)).toBe('+0%')
    expect(rateToPercent(1.5)).toBe('+50%')
    expect(rateToPercent(0.8)).toBe('-20%')
  })
})

describe('validateTtsBody', () => {
  it('接受 text 或 ssml，缺省 voice/rate', () => {
    expect(validateTtsBody({ text: '你好' })).toEqual({ text: '你好', voice: 'xiaoxiao', rate: 1 })
    expect(validateTtsBody({ ssml: '<speak/>', voice: 'yunxi', rate: 1.2 })).toEqual({
      text: '<speak/>', voice: 'yunxi', rate: 1.2,
    })
  })
  it('缺 text/ssml 抛 400', () => {
    expect(() => validateTtsBody({})).toThrow('缺少 text')
    try { validateTtsBody({}) } catch (e) { expect(e.status).toBe(400) }
  })
})
```

- [ ] **Step 2: 运行确认失败/通过**

```powershell
npm test
```

Expected: Task 1 已放最小版，本测试应已大体通过；若有差异按测试微调 `server/ttsParams.js`（保持上面三个函数签名与行为不变即可）。

- [ ] **Step 3: 提交**

```bash
git add server/ttsParams.js server/ttsParams.test.js
git commit -m "feat(server): TTS 音色/语速映射与入参校验（纯函数 + 测试）"
```

---

## Task 3: /api/tts 端点（edge-tts 合成）

**Files:**
- Create: `server/synthesize.js`
- Modify: `server/index.js`, `server/app.test.js`

- [ ] **Step 1: 追加 /api/tts 的路由测试到 `server/app.test.js`**

在文件末尾追加：

```js
describe('POST /api/tts', () => {
  it('成功返回 audio/mpeg 字节', async () => {
    const app = makeApp({ synthesize: async ({ text }) => Buffer.from('MP3:' + text) })
    const res = await request(app).post('/api/tts').send({ text: '你好', voice: 'xiaoxiao', rate: 1 })
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/audio\/mpeg/)
    expect(res.body.toString()).toBe('MP3:你好')
  })
  it('缺 text 返回 400', async () => {
    const res = await request(makeApp()).post('/api/tts').send({ voice: 'xiaoxiao' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/text/)
  })
})
```

- [ ] **Step 2: 运行确认通过**

```powershell
npm test
```

Expected: PASS（路由逻辑在 Task 1 已实现，本步补测试）。

- [ ] **Step 3: 实现 `server/synthesize.js`（隔离的真实 edge-tts 调用）**

```js
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { resolveVoice, rateToPercent } from './ttsParams.js'

// 把 {text, voice(slug), rate(倍率)} 合成为 mp3 Buffer。
// 注意：msedge-tts 是逆向微软接口，不同版本 toStream 签名可能不同；
// 若安装版本 API 不一致，只需改本函数（app.test.js 用 mock，不受影响）。
export async function synthesizeToMp3({ text, voice, rate }) {
  const tts = new MsEdgeTTS()
  await tts.setMetadata(resolveVoice(voice), OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
  const { audioStream } = tts.toStream(text, { rate: rateToPercent(rate) })
  const chunks = []
  for await (const chunk of audioStream) chunks.push(chunk)
  return Buffer.concat(chunks)
}
```

- [ ] **Step 4: 接入 `server/index.js`**

把 Task 1 的 `synthesize` 占位替换为真实实现：

```js
import { createApp } from './app.js'
import { synthesizeToMp3 } from './synthesize.js'

const PORT = process.env.PORT || 8787

const synthesize = (args) => synthesizeToMp3(args)
const generateNarration = async () => {
  throw Object.assign(new Error('AI 旁白尚未接入（Task 9）'), { status: 501 })
}

createApp({ synthesize, generateNarration }).listen(PORT, () => {
  console.log(`[wandertalk-api] listening on http://localhost:${PORT}`)
})
```

- [ ] **Step 5: 手动验证（需联网）**

```powershell
npm run server
```

另开 PowerShell：

```powershell
Invoke-WebRequest -Uri http://localhost:8787/api/tts -Method Post -ContentType 'application/json' -Body '{"text":"你好，这里是川藏线","voice":"xiaoxiao","rate":1}' -OutFile test.mp3
```

Expected: 生成可播放的 `test.mp3`。验证后删除：`Remove-Item test.mp3`。若 msedge-tts 报错，按其 README 调整 `synthesize.js`（仅此文件）。

- [ ] **Step 6: 提交**

```bash
git add server/synthesize.js server/index.js server/app.test.js
git commit -m "feat(server): /api/tts 接入 msedge-tts 合成 mp3"
```

---

## Task 4: 前端哈希工具 + IndexedDB audioCache

**Files:**
- Create: `src/utils/hash.js`, `src/utils/hash.test.js`
- Modify: `src/utils/db.js`, `src/utils/db.test.js`

- [ ] **Step 1: 写失败的测试 `src/utils/hash.test.js`**

```js
import { describe, it, expect } from 'vitest'
import { hashKey } from './hash'

describe('hashKey', () => {
  it('确定性：同输入同输出', () => {
    expect(hashKey('abc')).toBe(hashKey('abc'))
  })
  it('不同输入不同输出', () => {
    expect(hashKey('abc')).not.toBe(hashKey('abd'))
  })
  it('返回非空十六进制字符串', () => {
    expect(hashKey('你好 xiaoxiao 1')).toMatch(/^[0-9a-f]+$/)
  })
})
```

- [ ] **Step 2: 实现 `src/utils/hash.js`**

```js
// FNV-1a 32 位，足够做缓存 key（非加密用途）
export function hashKey(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}
```

- [ ] **Step 3: 追加 audioCache 测试到 `src/utils/db.test.js`**

在文件末尾（最外层 describe 之后）追加：

```js
import { getCachedAudio, setCachedAudio } from './db'

describe('db audioCache', () => {
  it('setCachedAudio / getCachedAudio round trip', async () => {
    expect(await getCachedAudio('k1')).toBeUndefined()
    const blob = new Blob(['x'], { type: 'audio/mpeg' })
    await setCachedAudio('k1', { blob, duration: 2.5, mime: 'audio/mpeg' })
    const got = await getCachedAudio('k1')
    expect(got.duration).toBe(2.5)
    expect(got.mime).toBe('audio/mpeg')
  })
})
```

- [ ] **Step 4: 升级 `src/utils/db.js` 到 v2**

整体替换：

```js
import { openDB } from 'idb'

const DB_NAME = 'wandertalk'
const DB_VERSION = 2
let dbPromise = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('trip')) db.createObjectStore('trip')
        if (!db.objectStoreNames.contains('routeCache')) db.createObjectStore('routeCache')
        if (!db.objectStoreNames.contains('audioCache')) db.createObjectStore('audioCache')
      },
    })
  }
  return dbPromise
}

export async function saveTrip(plan) {
  return (await getDb()).put('trip', plan, 'current')
}

export async function loadTrip() {
  return (await getDb()).get('trip', 'current')
}

export async function clearTrip() {
  return (await getDb()).delete('trip', 'current')
}

export async function getCachedRoute(key) {
  return (await getDb()).get('routeCache', key)
}

export async function setCachedRoute(key, route) {
  return (await getDb()).put('routeCache', route, key)
}

export async function getCachedAudio(key) {
  return (await getDb()).get('audioCache', key)
}

export async function setCachedAudio(key, entry) {
  return (await getDb()).put('audioCache', entry, key)
}
```

- [ ] **Step 5: 运行测试确认通过**

```powershell
npm test
```

Expected: PASS，hash 3 个 + db audioCache 1 个新增通过，原 db 测试不变。

- [ ] **Step 6: 提交**

```bash
git add src/utils/hash.js src/utils/hash.test.js src/utils/db.js src/utils/db.test.js
git commit -m "feat: 缓存哈希工具与 IndexedDB audioCache（v2）"
```

---

## Task 5: 前端 TTS 适配器 useTts

**Files:**
- Create: `src/composables/audioDuration.js`, `src/composables/useTts.js`, `src/composables/useTts.test.js`

- [ ] **Step 1: 实现 `src/composables/audioDuration.js`（隔离，便于 mock）**

```js
// 用 <audio> 元素读取 Blob 的时长（秒）。浏览器环境专用；测试中 mock 本模块。
export function getAudioDuration(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(audio.duration) ? audio.duration : 0)
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(0)
    }
    audio.src = url
  })
}
```

- [ ] **Step 2: 写失败的测试 `src/composables/useTts.test.js`**

```js
import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock 时长测量，避免依赖真实音频解码
vi.mock('./audioDuration', () => ({ getAudioDuration: vi.fn(async () => 1.5) }))

import { synthesize, VOICES } from './useTts'

describe('useTts', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('VOICES 含三种音色', () => {
    expect(VOICES.map((v) => v.slug)).toEqual(['xiaoxiao', 'yunxi', 'xiaoyi'])
  })

  it('首次合成调用 /api/tts 并写缓存，二次命中缓存不再请求', async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob(['AUDIO'], { type: 'audio/mpeg' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const args = { text: '独一无二的文案', voice: 'xiaoxiao', rate: 1 }
    const a = await synthesize(args)
    expect(a.duration).toBe(1.5)
    expect(a.blob).toBeInstanceOf(Blob)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const b = await synthesize(args)
    expect(fetchMock).toHaveBeenCalledTimes(1) // 命中缓存
    expect(b.duration).toBe(1.5)
  })

  it('后端报错时抛出可读信息', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'edge-tts 失败' }), { status: 500, headers: { 'Content-Type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(synthesize({ text: '会失败的文案xyz', voice: 'yunxi', rate: 1.2 })).rejects.toThrow('edge-tts 失败')
  })
})
```

- [ ] **Step 3: 运行确认失败**

```powershell
npm test
```

Expected: FAIL，找不到 `./useTts`。

- [ ] **Step 4: 实现 `src/composables/useTts.js`**

```js
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
```

- [ ] **Step 5: 运行测试确认通过**

```powershell
npm test
```

Expected: PASS，useTts 3 个测试通过。

- [ ] **Step 6: 提交**

```bash
git add src/composables/audioDuration.js src/composables/useTts.js src/composables/useTts.test.js
git commit -m "feat: 前端 TTS 适配器 useTts（缓存感知 + 时长测量）"
```

---

## Task 6: 旁白数据模型（trip store）

**Files:**
- Modify: `src/stores/trip.js`, `src/stores/trip.test.js`

- [ ] **Step 1: 追加失败的测试到 `src/stores/trip.test.js`**

在「trip store 编辑」describe 末尾追加：

```js
  it('归一化后每个节点有 narration 字段，路书有 voice/rate', () => {
    const t = useTripStore()
    t.loadPreset318()
    expect(t.plan.voice).toBe('xiaoxiao')
    expect(t.plan.rate).toBe(1)
    expect(t.plan.days[0].waypoints[0].narration).toBe('')
  })

  it('setNarration 设置节点旁白', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.setNarration(1, 0, '  这里是成都  ')
    expect(t.plan.days[0].waypoints[0].narration).toBe('这里是成都')
  })

  it('setVoice / setRate 修改全局音色与语速（rate 夹到 0.5~2）', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.setVoice('yunxi')
    t.setRate(3)
    expect(t.plan.voice).toBe('yunxi')
    expect(t.plan.rate).toBe(2)
    t.setRate(0.1)
    expect(t.plan.rate).toBe(0.5)
  })

  it('exportJson/importJson 保留 narration 与 voice/rate', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.setNarration(1, 0, '成都旁白')
    t.setVoice('xiaoyi')
    const json = t.exportJson()
    t.clear()
    t.importJson(json)
    expect(t.plan.voice).toBe('xiaoyi')
    expect(t.plan.days[0].waypoints[0].narration).toBe('成都旁白')
  })
```

- [ ] **Step 2: 运行确认失败**

```powershell
npm test
```

Expected: FAIL，`plan.voice` 为 undefined / `setNarration` 不是函数。

- [ ] **Step 3: 修改 `src/stores/trip.js`**

修改 `normalizeDay`，让节点带 `narration`：

```js
function normalizeDay(day, i) {
  return {
    dayNumber: i + 1,
    overnight: day.overnight ?? '',
    waypoints: (day.waypoints ?? []).map((w) => ({ ...w, narration: w.narration ?? '' })),
    segments: day.segments ?? null,
  }
}
```

修改 `normalizePlan`，加全局 `voice`/`rate`：

```js
function normalizePlan(raw) {
  return {
    name: raw.name ?? '未命名路书',
    description: raw.description ?? '',
    voice: raw.voice ?? 'xiaoxiao',
    rate: typeof raw.rate === 'number' ? raw.rate : 1,
    days: (raw.days ?? []).map(normalizeDay),
  }
}
```

在节点编辑区追加三个 action（放在 `setDaySegments` 之后）：

```js
  function setNarration(dayNumber, index, text) {
    const day = findDay(dayNumber)
    const wp = day?.waypoints[index]
    if (wp) wp.narration = text.trim()
  }

  function setVoice(slug) {
    if (plan.value) plan.value.voice = slug
  }

  function setRate(rate) {
    if (plan.value) plan.value.rate = Math.max(0.5, Math.min(2, rate))
  }
```

在 `return { ... }` 中加入这三个名字：`setNarration, setVoice, setRate,`。

- [ ] **Step 4: 运行测试确认通过**

```powershell
npm test
```

Expected: PASS，新增 4 个测试通过；原有 trip 测试不变（`replacePlan 归一化` 等仍过，因新字段有默认值）。

- [ ] **Step 5: 提交**

```bash
git add src/stores/trip.js src/stores/trip.test.js
git commit -m "feat: 旁白数据模型（节点 narration + 全局 voice/rate）"
```

---

## Task 7: 318 预设旁白文案

**Files:**
- Create: `src/data/preset318Narration.js`, `src/data/preset318Narration.test.js`
- Modify: `src/stores/trip.js`, `src/stores/trip.test.js`

- [ ] **Step 1: 创建 `src/data/preset318Narration.js`**

```js
// 318 川藏线关键节点旁白文案，按节点名匹配填入。海拔等与 preset318 数据一致，不编造具体数字。
export const preset318Narration = {
  成都: '我们的川藏之旅从天府之国成都出发。这里是 318 国道川藏线的起点，海拔约五百米；从这里向西，将一路攀上世界屋脊。',
  康定: '康定，情歌的故乡，海拔约两千四百米。跑马山下，这座康巴重镇是进藏路上第一个高原门户。',
  折多山垭口: '折多山，海拔四千二百九十八米，川藏线上第一座真正的高山垭口，人称「康巴第一关」。翻过折多山，才算真正进了藏区。',
  新都桥: '新都桥，摄影家的天堂。柔和的光线洒在草原与藏寨之间，这十里风光被誉为最美的光影世界。',
  理塘: '理塘，世界高城，海拔超过四千米。辽阔的草原一直延伸到天边，仓央嘉措曾在诗中写下这片圣洁之地。',
  海子山: '海子山，遍布冰川遗迹的高原荒野，上千个大小海子散落其间，被称作中国最美的高山湖泊群之一。',
  姊妹湖: '姊妹湖，两汪碧蓝的湖水静卧在雪山脚下，如同大地睁开的一双眼睛。',
  巴塘: '巴塘，金沙江畔的高原绿洲，气候温润，是告别四川、进入西藏前的最后一座川西小城。',
  东达山: '东达山，海拔五千一百三十米，是川藏线上海拔最高的垭口之一，终年积雪，空气稀薄。',
  怒江72拐: '著名的怒江七十二拐，盘山公路在陡峭的山壁上层层折叠，从山顶一直甩到谷底，蔚为壮观。',
  然乌湖: '然乌湖，雪山融水汇成的高原冰湖，湖水碧绿如玉，倒映着两岸的雪峰与森林。',
  波密: '波密，藏在喜马拉雅与念青唐古拉之间的「西藏小江南」，雪山、冰川与莽莽林海在此交汇。',
  鲁朗林海: '鲁朗林海，云雾缭绕的原始森林，雪山脚下的牧场与木屋宛如世外桃源。',
  色季拉山: '色季拉山，海拔四千七百多米。天气晴好时，可在此远眺南迦巴瓦峰难得一见的真容。',
  林芝: '林芝，西藏的江南，海拔骤降到三千米。雅鲁藏布江穿城而过，桃花与雪山相映成趣。',
  米拉山: '米拉山，海拔五千零一十三米，是进入拉萨前最后一道高山垭口。翻过它，圣城就在眼前。',
  拉萨: '拉萨，我们旅程的终点。布达拉宫巍然矗立，两千一百公里的川藏线，终于抵达这座阳光之城。',
}
```

- [ ] **Step 2: 写失败的测试 `src/data/preset318Narration.test.js`**

```js
import { describe, it, expect } from 'vitest'
import { preset318Narration } from './preset318Narration'
import { preset318 } from './preset318'

describe('preset318Narration', () => {
  it('每条 key 都能在 preset318 节点名中找到', () => {
    const names = new Set(preset318.days.flatMap((d) => d.waypoints.map((w) => w.name)))
    for (const key of Object.keys(preset318Narration)) {
      expect(names.has(key)).toBe(true)
    }
  })
  it('起点成都与终点拉萨都有文案', () => {
    expect(preset318Narration['成都']).toContain('成都')
    expect(preset318Narration['拉萨']).toContain('拉萨')
  })
})
```

- [ ] **Step 3: 追加 store 测试到 `src/stores/trip.test.js`**

```js
  it('loadPresetNarration 按节点名填入预设文案', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.loadPresetNarration()
    expect(t.plan.days[0].waypoints[0].narration).toContain('成都')
    const lastDay = t.plan.days.at(-1)
    expect(lastDay.waypoints.at(-1).narration).toContain('拉萨')
  })
```

- [ ] **Step 4: 在 `src/stores/trip.js` 实现 `loadPresetNarration`**

顶部 import：

```js
import { preset318Narration } from '../data/preset318Narration'
```

新增 action（放在 `setNarration` 附近）并加入 `return`：

```js
  function loadPresetNarration() {
    if (!plan.value) return
    for (const day of plan.value.days) {
      for (const wp of day.waypoints) {
        const text = preset318Narration[wp.name]
        if (text) wp.narration = text
      }
    }
  }
```

- [ ] **Step 5: 运行测试确认通过**

```powershell
npm test
```

Expected: PASS，preset narration 2 个 + store 1 个通过。

- [ ] **Step 6: 提交**

```bash
git add src/data/preset318Narration.js src/data/preset318Narration.test.js src/stores/trip.js src/stores/trip.test.js
git commit -m "feat: 318 预设旁白文案与一键填充"
```

---

## Task 8: AI 草稿后端 + composable

**Files:**
- Create: `server/narrationPrompt.js`, `server/narrationPrompt.test.js`, `server/narration.js`
- Modify: `server/index.js`, `server/app.test.js`
- Create: `src/composables/useNarration.js`, `src/composables/useNarration.test.js`

- [ ] **Step 1: 写失败的测试 `server/narrationPrompt.test.js`**

```js
import { describe, it, expect } from 'vitest'
import { buildNarrationMessages } from './narrationPrompt'

describe('buildNarrationMessages', () => {
  it('返回 system + user 两条，user 含节点名与天数', () => {
    const msgs = buildNarrationMessages({ nodeName: '折多山垭口', dayNumber: 2, altitude: 4298 })
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe('system')
    expect(msgs[1].role).toBe('user')
    expect(msgs[1].content).toContain('折多山垭口')
    expect(msgs[1].content).toContain('第 2 天')
  })
  it('system 提示要求中文、口语、不编造', () => {
    const [system] = buildNarrationMessages({ nodeName: '康定', dayNumber: 1 })
    expect(system.content).toMatch(/中文/)
    expect(system.content).toMatch(/不要编造|不得编造/)
  })
})
```

- [ ] **Step 2: 实现 `server/narrationPrompt.js`**

```js
export function buildNarrationMessages(item) {
  const system =
    '你是中文旅行讲解撰稿人，为自驾路线视频写旁白。要求：用自然口语的中文；' +
    '每段约 15~30 秒可读完（约 60~120 字）；可使用 <break time="500ms"/> 与 <emphasis> 等 SSML 标签；' +
    '只依据给定信息，不要编造不存在的事实或具体数字；直接输出旁白正文，不要加任何解释或标题。'
  const parts = [
    `节点：${item.nodeName}`,
    `第 ${item.dayNumber} 天`,
    item.overnight ? `当天住宿：${item.overnight}` : '',
    typeof item.altitude === 'number' ? `海拔：约 ${item.altitude} 米` : '',
    item.prevName ? `上一站：${item.prevName}` : '',
    item.nextName ? `下一站：${item.nextName}` : '',
  ].filter(Boolean)
  return [
    { role: 'system', content: system },
    { role: 'user', content: `请为以下节点写一段讲解旁白：\n${parts.join('\n')}` },
  ]
}
```

- [ ] **Step 3: 实现 `server/narration.js`（DeepSeek 调用 + 生成器）**

```js
import { buildNarrationMessages } from './narrationPrompt.js'

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'

export async function callDeepSeek({ apiKey, model = 'deepseek-chat', messages }) {
  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.7 }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || `DeepSeek 请求失败（${res.status}）`)
  return data.choices?.[0]?.message?.content ?? ''
}

// 注入 callLLM 便于测试；逐节点串行生成
export function makeNarrationGenerator({ callLLM }) {
  return async function generateNarration({ apiKey, items, model }) {
    const results = []
    for (const item of items) {
      const content = await callLLM({ apiKey, model, messages: buildNarrationMessages(item) })
      results.push({ nodeName: item.nodeName, dayNumber: item.dayNumber, narration: content.trim() })
    }
    return results
  }
}
```

- [ ] **Step 4: 追加 /api/narration 路由测试到 `server/app.test.js`**

```js
describe('POST /api/narration', () => {
  it('缺 apiKey 返回 400', async () => {
    const res = await request(makeApp()).post('/api/narration').send({ items: [{ nodeName: 'x', dayNumber: 1 }] })
    expect(res.status).toBe(400)
  })
  it('items 为空返回 400', async () => {
    const res = await request(makeApp()).post('/api/narration').send({ apiKey: 'sk', items: [] })
    expect(res.status).toBe(400)
  })
  it('正常返回 results', async () => {
    const app = makeApp({
      generateNarration: async ({ items }) => items.map((i) => ({ ...i, narration: '稿:' + i.nodeName })),
    })
    const res = await request(app).post('/api/narration').send({ apiKey: 'sk', items: [{ nodeName: '康定', dayNumber: 1 }] })
    expect(res.status).toBe(200)
    expect(res.body.results[0].narration).toBe('稿:康定')
  })
})
```

- [ ] **Step 5: 接入 `server/index.js`**

```js
import { createApp } from './app.js'
import { synthesizeToMp3 } from './synthesize.js'
import { makeNarrationGenerator, callDeepSeek } from './narration.js'

const PORT = process.env.PORT || 8787

const synthesize = (args) => synthesizeToMp3(args)
const generateNarration = makeNarrationGenerator({ callLLM: callDeepSeek })

createApp({ synthesize, generateNarration }).listen(PORT, () => {
  console.log(`[wandertalk-api] listening on http://localhost:${PORT}`)
})
```

- [ ] **Step 6: 写失败的测试 `src/composables/useNarration.test.js`**

```js
import { describe, it, expect, vi } from 'vitest'
import { generateNarrationDraft } from './useNarration'

describe('generateNarrationDraft', () => {
  it('成功返回 results 数组', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ results: [{ nodeName: '康定', dayNumber: 1, narration: '稿' }] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const out = await generateNarrationDraft([{ nodeName: '康定', dayNumber: 1 }], { apiKey: 'sk' })
    expect(out[0].narration).toBe('稿')
  })
  it('失败抛出可读错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: 'Key 无效' }), { status: 401, headers: { 'Content-Type': 'application/json' } }),
    ))
    await expect(generateNarrationDraft([{ nodeName: 'x', dayNumber: 1 }], { apiKey: 'bad' })).rejects.toThrow('Key 无效')
  })
})
```

- [ ] **Step 7: 实现 `src/composables/useNarration.js`**

```js
export async function generateNarrationDraft(items, { apiKey, model }) {
  const res = await fetch('/api/narration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, model, items }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `生成失败（${res.status}）`)
  return data.results
}
```

- [ ] **Step 8: 运行测试确认通过**

```powershell
npm test
```

Expected: PASS，narrationPrompt 2 + app narration 3 + useNarration 2 通过。

- [ ] **Step 9: 提交**

```bash
git add server/narrationPrompt.js server/narrationPrompt.test.js server/narration.js server/index.js server/app.test.js src/composables/useNarration.js src/composables/useNarration.test.js
git commit -m "feat: AI 旁白草稿（后端 DeepSeek 代理 + 前端 composable）"
```

---

## Task 9: NarrationDayCard 组件

**Files:**
- Create: `src/components/NarrationDayCard.vue`

- [ ] **Step 1: 创建 `src/components/NarrationDayCard.vue`**

```vue
<script setup>
import { ref } from 'vue'
import { useTripStore } from '../stores/trip'
import { synthesize } from '../composables/useTts'
import { generateNarrationDraft } from '../composables/useNarration'
import { useSettingsStore } from '../stores/settings'

const props = defineProps({
  day: { type: Object, required: true },
  color: { type: String, default: '#3b82f6' },
})

const trip = useTripStore()
const settings = useSettingsStore()
const expanded = ref(true)
const busy = ref('') // 当前操作中的「dayNumber-index」标记
const error = ref('')
let audioEl = null

function fmt(sec) {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

async function preview(i) {
  const wp = props.day.waypoints[i]
  if (!wp.narration) return
  error.value = ''
  busy.value = `${props.day.dayNumber}-${i}`
  try {
    const { blob } = await synthesize({ text: wp.narration, voice: trip.plan.voice, rate: trip.plan.rate })
    if (audioEl) audioEl.pause()
    audioEl = new Audio(URL.createObjectURL(blob))
    await audioEl.play()
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = ''
  }
}

async function aiDraft(i) {
  const wp = props.day.waypoints[i]
  if (!settings.llmKey) {
    error.value = '请先在「设置」填写 DeepSeek API Key'
    return
  }
  error.value = ''
  busy.value = `${props.day.dayNumber}-${i}`
  try {
    const prev = props.day.waypoints[i - 1]?.name
    const next = props.day.waypoints[i + 1]?.name
    const [r] = await generateNarrationDraft(
      [{ nodeName: wp.name, dayNumber: props.day.dayNumber, overnight: props.day.overnight, altitude: wp.altitude, prevName: prev, nextName: next }],
      { apiKey: settings.llmKey },
    )
    if (r?.narration) trip.setNarration(props.day.dayNumber, i, r.narration)
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <div class="rounded-lg border border-gray-100 overflow-hidden">
    <button class="w-full flex items-center gap-2 p-2.5 text-left hover:bg-gray-50 transition" @click="expanded = !expanded">
      <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: color }"></span>
      <span class="text-sm font-medium flex-1">Day {{ day.dayNumber }}<template v-if="day.overnight"> · 宿{{ day.overnight }}</template></span>
      <span class="text-gray-300 text-xs">{{ expanded ? '▲' : '▼' }}</span>
    </button>

    <div v-if="expanded" class="px-2.5 pb-2.5 space-y-2 border-t border-gray-50 pt-2">
      <p v-if="error" class="text-xs text-red-500">{{ error }}</p>
      <div v-for="(w, i) in day.waypoints" :key="i" class="space-y-1">
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium flex-1 truncate">{{ w.name }}</span>
          <button
            class="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 transition disabled:opacity-40"
            :disabled="busy === `${day.dayNumber}-${i}`"
            title="AI 生成本段草稿"
            @click="aiDraft(i)"
          >AI</button>
          <button
            class="text-[11px] px-1.5 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 transition disabled:opacity-40"
            :disabled="!w.narration || busy === `${day.dayNumber}-${i}`"
            title="试听本段"
            @click="preview(i)"
          >▶ 试听</button>
        </div>
        <textarea
          :value="w.narration"
          @change="trip.setNarration(day.dayNumber, i, $event.target.value)"
          rows="2"
          placeholder="为该节点写讲解旁白，可用 <break/> <emphasis> SSML…"
          class="w-full px-2 py-1 rounded border border-gray-200 focus:border-accent focus:outline-none text-xs resize-y"
        ></textarea>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 构建确认无误**

```powershell
npm run build
```

Expected: 构建成功（组件此时尚未被引用，仅验证可编译）。

- [ ] **Step 3: 提交**

```bash
git add src/components/NarrationDayCard.vue
git commit -m "feat: NarrationDayCard 节点旁白编辑卡片（试听 + AI 草稿）"
```

---

## Task 10: StudioView 整合（全局控制 + 批量合成）

**Files:**
- Modify: `src/views/StudioView.vue`（整体替换）

- [ ] **Step 1: 整体替换 `src/views/StudioView.vue`**

```vue
<script setup>
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useTripStore } from '../stores/trip'
import { useSettingsStore } from '../stores/settings'
import { synthesize, VOICES } from '../composables/useTts'
import { generateNarrationDraft } from '../composables/useNarration'
import NarrationDayCard from '../components/NarrationDayCard.vue'

const trip = useTripStore()
const settings = useSettingsStore()

const DAY_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1']

const status = ref('')
const error = ref('')
const working = ref(false)

const narratedCount = computed(() => {
  if (!trip.plan) return 0
  return trip.plan.days.reduce((n, d) => n + d.waypoints.filter((w) => w.narration).length, 0)
})

function allNarratedItems() {
  const items = []
  for (const day of trip.plan.days) {
    day.waypoints.forEach((w, i) => {
      if (w.narration) {
        items.push({
          dayNumber: day.dayNumber, index: i, name: w.name, narration: w.narration,
          overnight: day.overnight, altitude: w.altitude,
          prevName: day.waypoints[i - 1]?.name, nextName: day.waypoints[i + 1]?.name,
        })
      }
    })
  }
  return items
}

async function synthAll() {
  if (!trip.plan || working.value) return
  error.value = ''
  working.value = true
  const items = allNarratedItems()
  let done = 0
  try {
    for (const it of items) {
      status.value = `合成中 ${++done}/${items.length}：${it.name}`
      await synthesize({ text: it.narration, voice: trip.plan.voice, rate: trip.plan.rate })
    }
    status.value = `完成：已合成 ${items.length} 段（命中缓存的已跳过）`
  } catch (e) {
    error.value = '批量合成失败：' + e.message + '（已成功的已缓存，可重试）'
  } finally {
    working.value = false
  }
}

async function aiDraftAll() {
  if (!trip.plan || working.value) return
  if (!settings.llmKey) {
    error.value = '请先在「设置」填写 DeepSeek API Key'
    return
  }
  error.value = ''
  working.value = true
  status.value = 'AI 生成全部草稿中…'
  try {
    const items = []
    for (const day of trip.plan.days) {
      day.waypoints.forEach((w, i) => {
        if (!w.narration) {
          items.push({
            nodeName: w.name, dayNumber: day.dayNumber, overnight: day.overnight, altitude: w.altitude,
            prevName: day.waypoints[i - 1]?.name, nextName: day.waypoints[i + 1]?.name, _i: i,
          })
        }
      })
    }
    if (!items.length) { status.value = '所有节点都已有文案'; return }
    const results = await generateNarrationDraft(items, { apiKey: settings.llmKey })
    for (const r of results) {
      const day = trip.plan.days.find((d) => d.dayNumber === r.dayNumber)
      const idx = day?.waypoints.findIndex((w) => w.name === r.nodeName && !w.narration)
      if (day && idx >= 0) trip.setNarration(r.dayNumber, idx, r.narration)
    }
    status.value = `AI 生成完成：${results.length} 段`
  } catch (e) {
    error.value = 'AI 生成失败：' + e.message
  } finally {
    working.value = false
  }
}
</script>

<template>
  <div class="flex h-full">
    <aside class="w-96 shrink-0 border-r border-black/5 bg-white/60 overflow-auto p-4 space-y-4">
      <h1 class="text-lg font-semibold">视频工作室 · 旁白</h1>

      <template v-if="trip.plan">
        <div class="space-y-2 rounded-lg border border-gray-100 p-3">
          <label class="flex items-center gap-2 text-xs text-gray-500">
            音色
            <select
              :value="trip.plan.voice"
              @change="trip.setVoice($event.target.value)"
              class="flex-1 px-2 py-1 rounded border border-gray-200 text-xs focus:outline-none focus:border-accent bg-white"
            >
              <option v-for="v in VOICES" :key="v.slug" :value="v.slug">{{ v.name }}</option>
            </select>
          </label>
          <label class="flex items-center gap-2 text-xs text-gray-500">
            语速 {{ trip.plan.rate.toFixed(1) }}x
            <input
              type="range" min="0.5" max="2" step="0.1"
              :value="trip.plan.rate"
              @input="trip.setRate(Number($event.target.value))"
              class="flex-1"
            />
          </label>
          <p class="text-[11px] text-gray-400">已写旁白 {{ narratedCount }} 段</p>
        </div>

        <div class="space-y-2">
          <button
            @click="aiDraftAll" :disabled="working"
            class="w-full py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm hover:bg-gray-200 transition disabled:opacity-50"
          >AI 生成全部草稿</button>
          <button
            @click="trip.loadPresetNarration()" :disabled="working"
            class="w-full py-1.5 rounded-lg border border-gray-200 text-sm text-gray-500 hover:border-accent hover:text-accent transition disabled:opacity-50"
          >加载 318 预设文案</button>
          <button
            @click="synthAll" :disabled="working || narratedCount === 0"
            class="w-full py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >批量合成全部旁白</button>
        </div>

        <p v-if="status" class="text-xs text-gray-500">{{ status }}</p>
        <p v-if="error" class="text-xs text-red-500">{{ error }}</p>

        <div class="space-y-2">
          <NarrationDayCard
            v-for="(day, i) in trip.plan.days"
            :key="day.dayNumber"
            :day="day"
            :color="DAY_COLORS[i % DAY_COLORS.length]"
          />
        </div>
      </template>

      <div v-else class="text-sm text-gray-400 space-y-2">
        <p>还没有路书。</p>
        <RouterLink to="/" class="text-accent">前往「路线规划」加载或编辑路线 →</RouterLink>
      </div>
    </aside>

    <div class="flex-1 flex items-center justify-center text-gray-300 text-sm p-6 text-center">
      旁白写好并合成后，Phase 4 将在这里用音频时长驱动飞行动画预览。
    </div>
  </div>
</template>
```

- [ ] **Step 2: 测试与构建**

```powershell
npm test
npm run build
```

Expected: 测试全过；构建成功。

- [ ] **Step 3: 手动验证（需联网 + DeepSeek Key）**

```powershell
npm run dev
```

Expected：
- 进「视频工作室」：无路书时提示去路线规划；先在路线规划「加载 318 预设」。
- 回工作室：选音色、拖语速；点「加载 318 预设文案」→ 各节点文本框填入文案。
- 某节点点「▶ 试听」→ 听到该段语音（首次合成略慢，之后命中缓存秒回）。
- 点「AI 生成全部草稿」（已填 Key）→ 空白节点被填入草稿。
- 点「批量合成全部旁白」→ 进度推进，完成提示。
- DevTools → Application → IndexedDB → `wandertalk` → `audioCache` 可见缓存条目。

- [ ] **Step 4: 提交**

```bash
git add src/views/StudioView.vue
git commit -m "feat: 视频工作室旁白工作台（音色/语速、AI 草稿、批量合成）"
```

---

## Task 11: 收尾——设置提示、错误兜底、CHANGELOG、全量验证

**Files:**
- Modify: `src/views/SettingsView.vue`, `CHANGELOG.md`

- [ ] **Step 1: 更新设置页 LLM Key 提示为 DeepSeek**

`src/views/SettingsView.vue` 中把 LLM Key 的 label 与 placeholder 调整为 DeepSeek（保留 store 字段名 `llmKey` 不变）：

将

```vue
        <label class="block text-sm font-medium mb-1">LLM API Key（旁白生成，可选）</label>
```

改为

```vue
        <label class="block text-sm font-medium mb-1">DeepSeek API Key（AI 旁白生成，可选）</label>
```

并把其 `placeholder` 改为 `在 platform.deepseek.com 申请的 API Key`。

- [ ] **Step 2: 更新 `CHANGELOG.md`**

在 `## [Unreleased]` 下新增（若无 Unreleased 内容块则创建）：

```markdown
## [Unreleased]

### Added
- 视频工作室旁白工作台：节点级旁白编辑、晓晓/云希/晓伊 音色与 0.5x~2.0x 语速
- 后端 edge-tts 语音合成（`/api/tts`）+ 音频按内容缓存到 IndexedDB（含时长）
- AI 旁白草稿生成（`/api/narration` 代理 DeepSeek，OpenAI 兼容）
- 318 川藏线预设旁白文案一键填充
- 新增极简后端 `server/`（Express）与前后端联跑脚本（concurrently + Vite proxy）

### Changed
- 旁白按节点锚定并记录每段音频时长，为 Phase 4「旁白驱动飞行动画」备好输入

### 对 PRD v2 的偏差（见 docs/specs/2026-06-13-phase3-narration-tts-design.md）
- 个人版引入薄后端；TTS 用后端 edge-tts（Web Speech 作适配器预留兜底）；LLM 用 DeepSeek；旁白按节点锚定 + 记录音频时长
```

- [ ] **Step 3: 全量验证**

```powershell
npm test
npm run build
```

Expected: 全部测试通过（原有 + Phase 3 新增约 25 个），构建成功。

- [ ] **Step 4: 提交**

```bash
git add src/views/SettingsView.vue CHANGELOG.md
git commit -m "docs: Phase 3 CHANGELOG 与设置页 DeepSeek 提示"
```

---

## Self-Review

**Spec coverage（对照 spec 八项 + 数据模型）：**
- ✅ TTS 适配器封装 → Task 5（useTts，预留 Web Speech 兜底位）
- ✅ Edge TTS 集成 → Task 1/3（后端 msedge-tts，隔离在 synthesize.js）
- ✅ 旁白编辑器 → Task 9/10（NarrationDayCard + StudioView，节点级）
- ✅ SSML 预览 + 试听 → Task 9（textarea 可写 SSML，▶ 试听合成播放）
- ✅ AI 旁白草稿生成 → Task 8（DeepSeek 代理 + composable + 单段/全部）
- ✅ 批量合成 + 缓存 → Task 4/5/10（audioCache + synthAll 进度）
- ✅ 语音选择 + 调速 → Task 6/10（全局 voice/rate，0.5~2 夹取）
- ✅ 318 预设旁白文案 → Task 7
- ✅ 数据模型：节点锚定 + 时长 → Task 6（narration）+ Task 5（duration 入缓存）
- ✅ 薄后端 + 联跑 → Task 1（Express + proxy + concurrently）
- ✅ 错误处理 → useTts/useNarration 可读错误、后端未启动提示、批量失败保留可重试；Task 11 设置提示

**Placeholder scan:** 无 TBD/TODO；唯一外部不确定点是 msedge-tts 的 `toStream` 签名，已隔离在 `server/synthesize.js` 并在 Task 3 标注「仅改此文件、测试用 mock 不受影响」，非逻辑占位。

**Type/接口一致性：**
- TTS：前端 `synthesize({text,voice,rate})→{blob,duration,mime}`（useTts）；后端 `/api/tts` 入 `{text|ssml,voice,rate}` 出 `audio/mpeg`；注入的 `synthesize({text,voice,rate})→Buffer`（app.js / index.js / synthesize.js）一致。
- 缓存：`audioKey(text,voice,rate)`→`hashKey`；`getCachedAudio/setCachedAudio(key, {blob,duration,mime})`（db.js / useTts / 测试）一致。
- 旁白：`waypoint.narration`、`plan.voice`、`plan.rate`；store `setNarration(dayNumber,index,text)`/`setVoice(slug)`/`setRate(rate)`/`loadPresetNarration()`（trip.js / 组件 / 测试）一致。
- AI：前端 `generateNarrationDraft(items,{apiKey,model})→results[]`；后端 `/api/narration` 入 `{apiKey,items,model}` 出 `{results:[{nodeName,dayNumber,narration}]}`；`buildNarrationMessages(item)` 用 `item.nodeName/dayNumber/overnight/altitude/prevName/nextName`（narrationPrompt / narration.js / useNarration / 组件 / StudioView）一致。

**备注：** 后端 `server/*.test.js` 由现有 vitest（node 环境）一并收录，无需改配置；UI 与真实 edge-tts/DeepSeek 网络交互为手动验证。
```
