# 浏览器本地 Kimi Key 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在设置页增加浏览器本地 Kimi Key，并让所有 AI 请求安全复用它，同时保留服务端环境变量备用。

**Architecture:** 设置 store 分别保存 Kimi 与 DeepSeek Key；一个纯函数统一决定当前模型该发送哪个 Key，避免各页面自行判断。服务端对 Kimi 采用“请求 Key 优先、环境变量备用”，两者都缺失时拒绝联网。

**Tech Stack:** Vue 3、Pinia、Express、Vitest、浏览器 localStorage。

---

### Task 1: 浏览器本地保存 Kimi Key

**Files:**
- Modify: `src/stores/settings.js`
- Test: `src/stores/settings.test.js`

- [ ] **Step 1: 写失败测试**

增加测试，验证 `kimiKey` 默认空、`setKimiKey()` 去除首尾空格后写入 `318:kimiKey`、`clearKimiKey()` 同时清空 store 和 localStorage，并且不影响 `llmKey`。

```js
it('Kimi Key 可独立保存和清除', () => {
  const s = useSettingsStore()
  s.setKimiKey('  kimi-secret  ')
  s.setLlmKey('deepseek-secret')
  expect(s.kimiKey).toBe('kimi-secret')
  expect(localStorage.getItem('318:kimiKey')).toBe('kimi-secret')
  s.clearKimiKey()
  expect(s.kimiKey).toBe('')
  expect(localStorage.getItem('318:kimiKey')).toBeNull()
  expect(s.llmKey).toBe('deepseek-secret')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm.cmd test -- src/stores/settings.test.js`  
Expected: FAIL，提示 `setKimiKey` 不存在。

- [ ] **Step 3: 最小实现**

在 `KEYS` 增加 `kimiKey: '318:kimiKey'`，增加 `kimiKey` ref、`hasKimiKey` computed，以及：

```js
function setKimiKey(v) {
  kimiKey.value = v.trim()
  if (kimiKey.value) localStorage.setItem(KEYS.kimiKey, kimiKey.value)
  else localStorage.removeItem(KEYS.kimiKey)
}
function clearKimiKey() {
  kimiKey.value = ''
  localStorage.removeItem(KEYS.kimiKey)
}
```

- [ ] **Step 4: 运行测试并提交**

Run: `npm.cmd test -- src/stores/settings.test.js`  
Expected: PASS。

Commit: `feat(settings): persist browser-local Kimi key`

### Task 2: 所有前端 AI 操作使用当前模型对应的 Key

**Files:**
- Create: `src/utils/llmRequest.js`
- Create: `src/utils/llmRequest.test.js`
- Modify: `src/views/StudioView.vue`
- Modify: `src/components/NarrationDayCard.vue`

- [ ] **Step 1: 写纯函数失败测试**

```js
expect(resolveLlmRequest({ llmProvider: 'kimi', kimiKey: 'k', llmKey: 'd' }))
  .toEqual({ provider: 'kimi', apiKey: 'k' })
expect(resolveLlmRequest({ llmProvider: 'deepseek', kimiKey: 'k', llmKey: 'd' }))
  .toEqual({ provider: 'deepseek', apiKey: 'd' })
expect(missingLlmKeyMessage({ llmProvider: 'kimi', kimiKey: '' }))
  .toMatch(/Kimi API Key/)
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm.cmd test -- src/utils/llmRequest.test.js`  
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现并接入页面**

`resolveLlmRequest(settings)` 只返回当前模型及其 Key；`missingLlmKeyMessage(settings)` 返回空字符串或对应模型的设置提示。Studio 的批量文案、自动配图、动效编排和单节点文案全部复用这两个函数，不再把 Kimi 的 `apiKey` 强制置空。

- [ ] **Step 4: 运行相关测试并提交**

Run: `npm.cmd test -- src/utils/llmRequest.test.js src/composables/useNarration.test.js src/stores/studio.test.js`  
Expected: PASS。

Commit: `feat(ai): send provider-specific browser key`

### Task 3: 服务端安全接受浏览器 Kimi Key

**Files:**
- Modify: `server/llm.js`
- Test: `server/llm.test.js`
- Test: `server/app.test.js`

- [ ] **Step 1: 写失败测试**

验证 Kimi 请求携带浏览器 Key 时优先使用它；未携带时使用 `MOONSHOT_API_KEY`；两者都缺失时返回“请在设置中填写 Kimi API Key”，且不调用网络。

```js
const callLLM = makeLlmCaller({ moonshotApiKey: 'server-key', fetchImpl })
await callLLM({ provider: 'kimi', apiKey: 'browser-key', messages: [] })
expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer browser-key')
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm.cmd test -- server/llm.test.js server/app.test.js`  
Expected: FAIL，实际仍使用服务端 Key。

- [ ] **Step 3: 最小实现**

```js
const resolvedKey = provider === 'kimi' ? (apiKey || moonshotApiKey) : apiKey
```

更新缺 Key 文案，保持 Authorization 只在服务端发往官方模型接口，不记录 Key。

- [ ] **Step 4: 运行测试并提交**

Run: `npm.cmd test -- server/llm.test.js server/app.test.js`  
Expected: PASS。

Commit: `feat(server): allow browser Kimi key with env fallback`

### Task 4: 设置页输入、清除与最终回归

**Files:**
- Modify: `src/views/SettingsView.vue`

- [ ] **Step 1: 增加设置界面**

Kimi 被选中时显示密码输入框、清除按钮和安全说明；保存按钮调用 `setKimiKey()`。页面说明明确“仅当前浏览器保存；恶意扩展或同源脚本仍可能读取”。DeepSeek 输入保持原样。

- [ ] **Step 2: 全量验证**

Run: `npm.cmd test`  
Expected: 全部 PASS。

Run: `npm.cmd run build`  
Expected: 构建成功，仅允许现有的大包体积提示。

- [ ] **Step 3: 检查敏感信息与提交**

确认源码、测试快照、Git diff 中没有真实 Key，只出现 `browser-key` 等假数据。

Commit: `feat(settings): add Kimi key controls`
