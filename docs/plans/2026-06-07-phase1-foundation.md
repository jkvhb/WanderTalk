# Phase 1 基础骨架 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建一个可运行的 Vue 3 单页应用骨架，包含三视图导航、设置页（高德 API Key 持久化）、318 预设数据、地图显示与 POI 搜索，并完成开源项目管理基建（LICENSE/README/CI/Git）。

**Architecture:** 纯前端 SPA。Vue 3 Composition API + `<script setup>`；Vue Router 管理三视图；Pinia 管理跨组件状态（设置、路书）；高德地图通过官方 loader 按需加载，API Key 由用户在设置页填写并存入 localStorage，代码零硬编码。纯逻辑（预设数据、store）用 Vitest 做单元测试，地图等 UI 部分靠手动验证。

**Tech Stack:** Vue 3, Vite, Vue Router 4, Pinia, TailwindCSS 3, Vitest, @amap/amap-jsapi-loader, idb（IndexedDB 封装，Phase 2 才用，本期先不引入）。

**环境备注:** Windows 环境，node 仅在 PowerShell 可用（`D:\node.exe`，v24.14.1），所有 node/npm 命令用 PowerShell 执行。git 在 bash 和 PowerShell 均可用。

---

## File Structure

```
318/
├── .github/
│   ├── workflows/ci.yml            CI：lint + build + test
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   └── pull_request_template.md
├── docs/plans/                      实施计划（本文件所在）
├── public/favicon.svg
├── src/
│   ├── main.js                      应用入口，挂载 Pinia + Router
│   ├── App.vue                      根组件，含导航栏 + <router-view>
│   ├── style.css                    Tailwind 指令入口
│   ├── router/index.js              三视图路由
│   ├── stores/
│   │   ├── settings.js              API Key、语音、导出参数；localStorage 持久化
│   │   └── trip.js                  当前路书数据；加载预设
│   ├── data/preset318.js            318 川藏线 9 天预设数据
│   ├── composables/useAmap.js       高德地图加载与初始化封装
│   ├── components/
│   │   ├── NavBar.vue               顶部毛玻璃导航栏
│   │   └── PoiSearchPanel.vue       POI 搜索面板
│   └── views/
│       ├── PlannerView.vue          路线规划（地图 + 侧边栏）
│       ├── StudioView.vue           视频工作室（本期占位）
│       └── SettingsView.vue         设置页
├── tests/                           （Vitest 默认就近或集中，本计划集中放 src 内 *.test.js）
├── .env.example                     环境变量示例（说明 Key 走 UI 而非 env）
├── .gitignore
├── .editorconfig
├── LICENSE                          MIT
├── README.md
├── CHANGELOG.md
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

---

## Task 1: 脚手架与 Git 初始化

**Files:**
- Create: 整个 Vite 项目骨架
- Create: `E:\git-workspace\repos\318\` 下的 git 仓库

- [ ] **Step 1: 用 Vite 创建 Vue 项目到当前目录**

PowerShell（在 `E:\git-workspace\repos\318` 下执行；目录已有 PRD/docs/.claude，用 `.` 安装到当前目录）：

```powershell
npm create vite@latest . -- --template vue
```

如提示目录非空，选择 "Ignore files and continue"。

- [ ] **Step 2: 安装依赖**

```powershell
npm install
```

- [ ] **Step 3: 验证开发服务器能启动**

```powershell
npm run dev
```

Expected: 输出 `Local: http://localhost:5173/`。确认后 Ctrl+C 停止。

- [ ] **Step 4: 初始化 git 仓库**

bash 或 PowerShell：

```bash
git init
git branch -M main
```

- [ ] **Step 5: 提交（此时还没 .gitignore，先不提交，留到 Task 2）**

跳过提交，进入 Task 2 补齐开源文件后一起首次提交。

---

## Task 2: 开源项目管理文件

**Files:**
- Create: `LICENSE`, `README.md`, `CHANGELOG.md`, `.gitignore`, `.editorconfig`, `.env.example`

- [ ] **Step 1: 写 .gitignore**

确保 Vite 默认 `.gitignore` 包含以下内容（不足则补全）：

```gitignore
# Dependencies
node_modules
dist
dist-ssr

# Local env files — 绝不提交任何密钥
*.local
.env
.env.*
!.env.example

# Editor
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# Test
coverage
```

- [ ] **Step 2: 写 LICENSE（MIT）**

`LICENSE`：

```
MIT License

Copyright (c) 2026 jkvhb

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 3: 写 README.md**

`README.md`：

```markdown
# 318路书

> 在地图上规划自驾路线，自动生成带旁白讲解的飞行动画视频。

318路书是一个面向自驾旅行者的路书规划与讲解视频生成工具。在地图上自由规划多日自驾路线、搜索沿途餐饮住宿景点，完成后一键生成「飞行动画 + AI 旁白讲解」的路书视频。

## ✨ 功能

- 🗺️ 基于高德地图的路线规划，沿真实道路计算驾车路线
- 🔍 POI 搜索：餐饮 / 住宿 / 景点 / 加油站 / 观景台
- 📝 旁白编辑 + AI 辅助生成草稿
- 🎬 飞行动画预览，旁白与画面自动同步
- 📹 一键导出讲解视频
- 🚗 内置 318 川藏线 9 天预设路线

## 🚀 快速开始

\`\`\`bash
git clone https://github.com/jkvhb/318.git
cd 318
npm install
npm run dev
\`\`\`

打开 http://localhost:5173 ，在「设置」页填入你的高德地图 API Key 即可使用。

## 🔑 获取高德 API Key

1. 访问 [高德开放平台](https://lbs.amap.com/) 注册账号
2. 创建应用，添加 Key，服务平台选「Web 端 (JS API)」
3. 把 Key 填入应用「设置」页

> ⚠️ API Key 仅保存在你的浏览器本地（localStorage），不会上传到任何服务器。

## 🛠️ 技术栈

Vue 3 · Vite · Pinia · Vue Router · TailwindCSS · 高德地图 JS API · MapLibre GL JS

## 📄 许可证

[MIT](./LICENSE) © jkvhb
```

- [ ] **Step 4: 写 CHANGELOG.md**

`CHANGELOG.md`：

```markdown
# Changelog

本项目所有重要变更记录于此。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added
- 项目初始化：Vue 3 + Vite + TailwindCSS 脚手架
- 三视图导航：路线规划 / 视频工作室 / 设置
- 设置页：高德 API Key 本地持久化
- 318 川藏线 9 天预设数据
- 高德地图显示与 POI 搜索
```

- [ ] **Step 5: 写 .editorconfig**

`.editorconfig`：

```ini
root = true

[*]
charset = utf-8
indent_style = space
indent_size = 2
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 6: 写 .env.example**

`.env.example`：

```
# 318路书 不通过环境变量配置密钥。
# 高德 API Key、LLM API Key 等均在应用「设置」页填写，保存在浏览器 localStorage。
# 本文件仅作占位说明，未来公开版接入后端代理时会在此补充后端环境变量。
```

- [ ] **Step 7: 更新 package.json 元信息**

修改 `package.json`，加入开源元信息：

```json
{
  "name": "318-roadbook",
  "version": "0.1.0",
  "description": "在地图上规划自驾路线，自动生成带旁白讲解的飞行动画视频",
  "license": "MIT",
  "author": "jkvhb",
  "repository": {
    "type": "git",
    "url": "https://github.com/jkvhb/318.git"
  },
  "keywords": ["travel", "roadtrip", "map", "vue", "318", "川藏线"]
}
```

保留 Vite 生成的 `scripts`、`dependencies`、`devDependencies` 字段，仅合并上述元信息。

- [ ] **Step 8: 首次提交**

```bash
git add .gitignore LICENSE README.md CHANGELOG.md .editorconfig .env.example package.json package-lock.json index.html vite.config.js public src docs .claude
git commit -m "chore: 初始化项目脚手架与开源管理文件"
```

---

## Task 3: TailwindCSS 接入

**Files:**
- Create: `tailwind.config.js`, `postcss.config.js`
- Modify: `src/style.css`

- [ ] **Step 1: 安装 Tailwind**

```powershell
npm install -D tailwindcss@3 postcss autoprefixer
npx tailwindcss init -p
```

Expected: 生成 `tailwind.config.js` 和 `postcss.config.js`。

- [ ] **Step 2: 配置 content 路径**

`tailwind.config.js`：

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#0071e3',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'PingFang SC', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 3: 替换 src/style.css 为 Tailwind 指令**

`src/style.css`（整体替换）：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #app {
  height: 100%;
  margin: 0;
}

body {
  background: #f5f5f7;
  color: #1d1d1f;
}
```

- [ ] **Step 4: 验证 Tailwind 生效**

临时在 `src/App.vue` 模板放一个 `<div class="text-accent text-2xl">Tailwind OK</div>`，运行 `npm run dev` 确认蓝色大字显示，确认后删除该临时元素。

- [ ] **Step 5: 提交**

```bash
git add tailwind.config.js postcss.config.js src/style.css package.json package-lock.json
git commit -m "chore: 接入 TailwindCSS"
```

---

## Task 4: Vitest 测试环境

**Files:**
- Modify: `vite.config.js`, `package.json`
- Create: `src/data/sanity.test.js`（临时验证用）

- [ ] **Step 1: 安装 Vitest**

```powershell
npm install -D vitest
```

- [ ] **Step 2: 在 vite.config.js 加 test 配置**

`vite.config.js`：

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    globals: true,
  },
})
```

- [ ] **Step 3: 在 package.json scripts 加 test**

确保 `scripts` 含：

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: 写一个 sanity 测试**

`src/data/sanity.test.js`：

```js
import { describe, it, expect } from 'vitest'

describe('sanity', () => {
  it('1 + 1 = 2', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: 运行测试确认通过**

```powershell
npm test
```

Expected: PASS，1 个测试通过。

- [ ] **Step 6: 删除 sanity 测试并提交**

删除 `src/data/sanity.test.js`。

```bash
git add vite.config.js package.json package-lock.json
git commit -m "chore: 接入 Vitest 测试环境"
```

---

## Task 5: 路由与三视图骨架

**Files:**
- Create: `src/router/index.js`, `src/views/PlannerView.vue`, `src/views/StudioView.vue`, `src/views/SettingsView.vue`, `src/components/NavBar.vue`
- Modify: `src/main.js`, `src/App.vue`

- [ ] **Step 1: 安装 vue-router**

```powershell
npm install vue-router@4
```

- [ ] **Step 2: 创建三个视图占位组件**

`src/views/PlannerView.vue`：

```vue
<script setup></script>

<template>
  <div class="h-full p-6">
    <h1 class="text-2xl font-semibold">路线规划</h1>
    <p class="text-gray-500 mt-2">地图与路线编辑区（建设中）</p>
  </div>
</template>
```

`src/views/StudioView.vue`：

```vue
<script setup></script>

<template>
  <div class="h-full p-6">
    <h1 class="text-2xl font-semibold">视频工作室</h1>
    <p class="text-gray-500 mt-2">旁白编辑与动画预览（建设中）</p>
  </div>
</template>
```

`src/views/SettingsView.vue`：

```vue
<script setup></script>

<template>
  <div class="h-full p-6">
    <h1 class="text-2xl font-semibold">设置</h1>
    <p class="text-gray-500 mt-2">API Key 与参数配置（建设中）</p>
  </div>
</template>
```

- [ ] **Step 3: 创建路由**

`src/router/index.js`：

```js
import { createRouter, createWebHistory } from 'vue-router'
import PlannerView from '../views/PlannerView.vue'
import StudioView from '../views/StudioView.vue'
import SettingsView from '../views/SettingsView.vue'

const routes = [
  { path: '/', name: 'planner', component: PlannerView, meta: { title: '路线规划' } },
  { path: '/studio', name: 'studio', component: StudioView, meta: { title: '视频工作室' } },
  { path: '/settings', name: 'settings', component: SettingsView, meta: { title: '设置' } },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})
```

- [ ] **Step 4: 创建导航栏**

`src/components/NavBar.vue`：

```vue
<script setup>
import { RouterLink } from 'vue-router'

const links = [
  { to: '/', label: '路线规划' },
  { to: '/studio', label: '视频工作室' },
  { to: '/settings', label: '设置' },
]
</script>

<template>
  <nav class="sticky top-0 z-50 flex items-center gap-1 px-6 h-14
              bg-white/70 backdrop-blur-xl border-b border-black/5">
    <span class="font-bold text-lg mr-6 bg-gradient-to-r from-accent to-teal-400
                 bg-clip-text text-transparent">318路书</span>
    <RouterLink
      v-for="l in links"
      :key="l.to"
      :to="l.to"
      class="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-black/5 transition"
      active-class="!text-accent !bg-accent/10"
    >
      {{ l.label }}
    </RouterLink>
  </nav>
</template>
```

- [ ] **Step 5: 改造 App.vue**

`src/App.vue`（整体替换）：

```vue
<script setup>
import NavBar from './components/NavBar.vue'
</script>

<template>
  <div class="flex flex-col h-full">
    <NavBar />
    <main class="flex-1 min-h-0 overflow-auto">
      <RouterView />
    </main>
  </div>
</template>
```

- [ ] **Step 6: 在 main.js 挂载 router**

`src/main.js`（整体替换）：

```js
import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'

createApp(App).use(router).mount('#app')
```

- [ ] **Step 7: 验证三视图切换**

```powershell
npm run dev
```

Expected: 顶部导航栏可在三个页面间切换，当前页高亮蓝色。

- [ ] **Step 8: 提交**

```bash
git add src package.json package-lock.json
git commit -m "feat: 三视图路由与导航栏骨架"
```

---

## Task 6: 设置 Store（API Key 持久化）

**Files:**
- Create: `src/stores/settings.js`, `src/stores/settings.test.js`
- Modify: `src/main.js`

- [ ] **Step 1: 安装 Pinia**

```powershell
npm install pinia
```

- [ ] **Step 2: 写失败的测试**

`src/stores/settings.test.js`：

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from './settings'

describe('settings store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = {}
    vi.stubGlobal('localStorage', {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v) },
      removeItem: (k) => { delete store[k] },
    })
  })

  it('默认 amapKey 为空字符串', () => {
    const s = useSettingsStore()
    expect(s.amapKey).toBe('')
  })

  it('setAmapKey 后能从 localStorage 读回', () => {
    const s = useSettingsStore()
    s.setAmapKey('test-key-123')
    expect(s.amapKey).toBe('test-key-123')
    expect(localStorage.getItem('318:amapKey')).toBe('test-key-123')
  })

  it('hasAmapKey 反映 key 是否存在', () => {
    const s = useSettingsStore()
    expect(s.hasAmapKey).toBe(false)
    s.setAmapKey('abc')
    expect(s.hasAmapKey).toBe(true)
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

```powershell
npm test
```

Expected: FAIL，提示找不到 `./settings`。

- [ ] **Step 4: 实现 settings store**

`src/stores/settings.js`：

```js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const KEYS = {
  amapKey: '318:amapKey',
  llmKey: '318:llmKey',
  voice: '318:voice',
}

export const useSettingsStore = defineStore('settings', () => {
  const amapKey = ref(localStorage.getItem(KEYS.amapKey) || '')
  const llmKey = ref(localStorage.getItem(KEYS.llmKey) || '')
  const voice = ref(localStorage.getItem(KEYS.voice) || 'xiaoxiao')

  const hasAmapKey = computed(() => amapKey.value.trim().length > 0)

  function setAmapKey(v) {
    amapKey.value = v.trim()
    localStorage.setItem(KEYS.amapKey, amapKey.value)
  }

  function setLlmKey(v) {
    llmKey.value = v.trim()
    localStorage.setItem(KEYS.llmKey, llmKey.value)
  }

  function setVoice(v) {
    voice.value = v
    localStorage.setItem(KEYS.voice, v)
  }

  return { amapKey, llmKey, voice, hasAmapKey, setAmapKey, setLlmKey, setVoice }
})
```

- [ ] **Step 5: 运行测试确认通过**

```powershell
npm test
```

Expected: PASS，3 个测试通过。

- [ ] **Step 6: 在 main.js 挂载 Pinia**

`src/main.js`（整体替换）：

```js
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import router from './router'

createApp(App).use(createPinia()).use(router).mount('#app')
```

- [ ] **Step 7: 提交**

```bash
git add src package.json package-lock.json
git commit -m "feat: 设置 store 与 API Key 本地持久化"
```

---

## Task 7: 设置页 UI

**Files:**
- Modify: `src/views/SettingsView.vue`

- [ ] **Step 1: 实现设置页**

`src/views/SettingsView.vue`（整体替换）：

```vue
<script setup>
import { ref } from 'vue'
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()
const amapInput = ref(settings.amapKey)
const llmInput = ref(settings.llmKey)
const saved = ref(false)

function save() {
  settings.setAmapKey(amapInput.value)
  settings.setLlmKey(llmInput.value)
  saved.value = true
  setTimeout(() => (saved.value = false), 2000)
}
</script>

<template>
  <div class="max-w-2xl mx-auto p-6 space-y-6">
    <h1 class="text-2xl font-semibold">设置</h1>

    <section class="bg-white rounded-2xl p-6 shadow-sm space-y-4">
      <div>
        <label class="block text-sm font-medium mb-1">高德地图 API Key</label>
        <input
          v-model="amapInput"
          type="text"
          placeholder="在高德开放平台申请的 Web 端 JS API Key"
          class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-accent focus:outline-none text-sm"
        />
        <p class="text-xs text-gray-400 mt-1">
          前往 <a href="https://lbs.amap.com/" target="_blank" class="text-accent">高德开放平台</a> 申请，服务平台选「Web 端 (JS API)」。
        </p>
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">LLM API Key（旁白生成，可选）</label>
        <input
          v-model="llmInput"
          type="password"
          placeholder="Claude / 通义千问 API Key"
          class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-accent focus:outline-none text-sm"
        />
      </div>

      <div class="flex items-center gap-3">
        <button
          @click="save"
          class="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition"
        >
          保存
        </button>
        <span v-if="saved" class="text-sm text-green-600">已保存 ✓</span>
      </div>
    </section>

    <p class="text-xs text-gray-400">
      🔒 所有 Key 仅保存在浏览器本地（localStorage），不会上传到任何服务器。
    </p>
  </div>
</template>
```

- [ ] **Step 2: 验证**

```powershell
npm run dev
```

Expected: 设置页能输入 Key、点保存出现「已保存 ✓」，刷新页面后输入框仍保留之前的值。

- [ ] **Step 3: 提交**

```bash
git add src/views/SettingsView.vue
git commit -m "feat: 设置页 UI 与 Key 输入"
```

---

## Task 8: 318 预设数据

**Files:**
- Create: `src/data/preset318.js`, `src/data/preset318.test.js`

- [ ] **Step 1: 写失败的测试**

`src/data/preset318.test.js`：

```js
import { describe, it, expect } from 'vitest'
import { preset318 } from './preset318'

describe('preset318', () => {
  it('包含 9 天行程', () => {
    expect(preset318.days).toHaveLength(9)
  })

  it('每天都有名称和住宿点', () => {
    for (const day of preset318.days) {
      expect(day.dayNumber).toBeGreaterThan(0)
      expect(day.overnight).toBeTruthy()
      expect(Array.isArray(day.waypoints)).toBe(true)
      expect(day.waypoints.length).toBeGreaterThan(0)
    }
  })

  it('所有 waypoint 坐标在中国西部合理范围内', () => {
    for (const day of preset318.days) {
      for (const wp of day.waypoints) {
        expect(wp.lng).toBeGreaterThan(90)
        expect(wp.lng).toBeLessThan(105)
        expect(wp.lat).toBeGreaterThan(28)
        expect(wp.lat).toBeLessThan(32)
      }
    }
  })

  it('第一天起点是成都，最后一天终点是拉萨', () => {
    const firstDay = preset318.days[0]
    const lastDay = preset318.days[8]
    expect(firstDay.waypoints[0].name).toContain('成都')
    expect(lastDay.waypoints.at(-1).name).toContain('拉萨')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
npm test
```

Expected: FAIL，找不到 `./preset318`。

- [ ] **Step 3: 实现预设数据**

`src/data/preset318.js`（坐标为 WGS-84 近似值，海拔为米）：

```js
// 318 川藏线 9 天预设数据
// 坐标系：WGS-84（高德返回的 GCJ-02 在 Phase 2 接入转换层后会统一为 WGS-84）
// 本预设直接以 WGS-84 近似坐标给出，供快速加载模板使用。

export const preset318 = {
  name: '318 川藏线（成都 → 拉萨）',
  description: '经典川藏南线，全程约 2100km，建议 9~10 天。',
  days: [
    {
      dayNumber: 1,
      overnight: '康定',
      waypoints: [
        { name: '成都', lng: 104.0665, lat: 30.5728, altitude: 500 },
        { name: '雅安', lng: 103.0010, lat: 29.9877, altitude: 620 },
        { name: '泸定', lng: 102.2349, lat: 29.9145, altitude: 1330 },
        { name: '康定', lng: 101.9576, lat: 30.0556, altitude: 2395 },
      ],
    },
    {
      dayNumber: 2,
      overnight: '雅江',
      waypoints: [
        { name: '康定', lng: 101.9576, lat: 30.0556, altitude: 2395 },
        { name: '折多山垭口', lng: 101.8000, lat: 30.0380, altitude: 4298 },
        { name: '新都桥', lng: 101.4960, lat: 30.0500, altitude: 3460 },
        { name: '雅江', lng: 101.0150, lat: 30.0320, altitude: 2530 },
      ],
    },
    {
      dayNumber: 3,
      overnight: '理塘',
      waypoints: [
        { name: '雅江', lng: 101.0150, lat: 30.0320, altitude: 2530 },
        { name: '剪子湾山', lng: 100.5800, lat: 30.0600, altitude: 4659 },
        { name: '卡子拉山', lng: 100.3500, lat: 30.0300, altitude: 4718 },
        { name: '理塘', lng: 100.2700, lat: 29.9970, altitude: 4014 },
      ],
    },
    {
      dayNumber: 4,
      overnight: '巴塘',
      waypoints: [
        { name: '理塘', lng: 100.2700, lat: 29.9970, altitude: 4014 },
        { name: '海子山', lng: 99.7000, lat: 29.5000, altitude: 4685 },
        { name: '姊妹湖', lng: 99.5600, lat: 29.6800, altitude: 4470 },
        { name: '巴塘', lng: 99.1080, lat: 30.0040, altitude: 2575 },
      ],
    },
    {
      dayNumber: 5,
      overnight: '左贡',
      waypoints: [
        { name: '巴塘', lng: 99.1080, lat: 30.0040, altitude: 2575 },
        { name: '金沙江大桥', lng: 98.9300, lat: 29.8200, altitude: 2470 },
        { name: '芒康', lng: 98.5930, lat: 29.6800, altitude: 3870 },
        { name: '东达山', lng: 98.1500, lat: 29.7200, altitude: 5130 },
        { name: '左贡', lng: 97.8410, lat: 29.6710, altitude: 3750 },
      ],
    },
    {
      dayNumber: 6,
      overnight: '八宿',
      waypoints: [
        { name: '左贡', lng: 97.8410, lat: 29.6710, altitude: 3750 },
        { name: '邦达草原', lng: 97.4500, lat: 30.0300, altitude: 4300 },
        { name: '业拉山', lng: 97.1500, lat: 30.0000, altitude: 4658 },
        { name: '怒江72拐', lng: 97.0500, lat: 29.9000, altitude: 3900 },
        { name: '八宿', lng: 96.9230, lat: 30.0530, altitude: 3260 },
      ],
    },
    {
      dayNumber: 7,
      overnight: '波密',
      waypoints: [
        { name: '八宿', lng: 96.9230, lat: 30.0530, altitude: 3260 },
        { name: '然乌湖', lng: 96.7600, lat: 29.4900, altitude: 3850 },
        { name: '波密', lng: 95.7680, lat: 29.8590, altitude: 2720 },
      ],
    },
    {
      dayNumber: 8,
      overnight: '林芝',
      waypoints: [
        { name: '波密', lng: 95.7680, lat: 29.8590, altitude: 2720 },
        { name: '通麦', lng: 95.0300, lat: 30.0400, altitude: 2000 },
        { name: '鲁朗林海', lng: 94.7400, lat: 29.9700, altitude: 3300 },
        { name: '色季拉山', lng: 94.6200, lat: 29.6000, altitude: 4728 },
        { name: '林芝', lng: 94.3620, lat: 29.6490, altitude: 3000 },
      ],
    },
    {
      dayNumber: 9,
      overnight: '拉萨',
      waypoints: [
        { name: '林芝', lng: 94.3620, lat: 29.6490, altitude: 3000 },
        { name: '工布江达', lng: 93.2460, lat: 29.8860, altitude: 3360 },
        { name: '米拉山', lng: 92.6800, lat: 29.8200, altitude: 5013 },
        { name: '拉萨', lng: 91.1409, lat: 29.6456, altitude: 3650 },
      ],
    },
  ],
}
```

- [ ] **Step 4: 运行测试确认通过**

```powershell
npm test
```

Expected: PASS，4 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add src/data/preset318.js src/data/preset318.test.js
git commit -m "feat: 318 川藏线 9 天预设数据"
```

---

## Task 9: 路书 Store（加载预设）

**Files:**
- Create: `src/stores/trip.js`, `src/stores/trip.test.js`

- [ ] **Step 1: 写失败的测试**

`src/stores/trip.test.js`：

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTripStore } from './trip'

describe('trip store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('初始无路书', () => {
    const t = useTripStore()
    expect(t.plan).toBeNull()
    expect(t.dayCount).toBe(0)
  })

  it('loadPreset318 后加载 9 天行程', () => {
    const t = useTripStore()
    t.loadPreset318()
    expect(t.plan).not.toBeNull()
    expect(t.dayCount).toBe(9)
    expect(t.plan.name).toContain('318')
  })

  it('allWaypoints 汇总所有节点', () => {
    const t = useTripStore()
    t.loadPreset318()
    expect(t.allWaypoints.length).toBeGreaterThan(20)
    expect(t.allWaypoints[0].name).toContain('成都')
  })

  it('loadPreset318 是深拷贝，修改不影响原始预设', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.plan.days[0].waypoints[0].name = '修改测试'
    t.loadPreset318()
    expect(t.plan.days[0].waypoints[0].name).toContain('成都')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
npm test
```

Expected: FAIL，找不到 `./trip`。

- [ ] **Step 3: 实现 trip store**

`src/stores/trip.js`：

```js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { preset318 } from '../data/preset318'

export const useTripStore = defineStore('trip', () => {
  const plan = ref(null)

  const dayCount = computed(() => plan.value?.days.length ?? 0)

  const allWaypoints = computed(() => {
    if (!plan.value) return []
    return plan.value.days.flatMap((d) => d.waypoints)
  })

  function loadPreset318() {
    plan.value = structuredClone(preset318)
  }

  function clear() {
    plan.value = null
  }

  return { plan, dayCount, allWaypoints, loadPreset318, clear }
})
```

- [ ] **Step 4: 运行测试确认通过**

```powershell
npm test
```

Expected: PASS，4 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add src/stores/trip.js src/stores/trip.test.js
git commit -m "feat: 路书 store 与预设加载"
```

---

## Task 10: 高德地图集成

**Files:**
- Create: `src/composables/useAmap.js`
- Modify: `src/views/PlannerView.vue`

- [ ] **Step 1: 安装高德 loader**

```powershell
npm install @amap/amap-jsapi-loader
```

- [ ] **Step 2: 写地图加载封装**

`src/composables/useAmap.js`：

```js
import AMapLoader from '@amap/amap-jsapi-loader'

let amapPromise = null

// 按 key 加载高德 JS API，单例缓存。
export function loadAmap(key) {
  if (!key) return Promise.reject(new Error('缺少高德 API Key'))
  if (amapPromise) return amapPromise
  amapPromise = AMapLoader.load({
    key,
    version: '2.0',
    plugins: ['AMap.PlaceSearch', 'AMap.Driving', 'AMap.Scale', 'AMap.ToolBar'],
  })
  return amapPromise
}

// 测试或换 key 时重置。
export function resetAmap() {
  amapPromise = null
}
```

- [ ] **Step 3: 在 PlannerView 显示地图**

`src/views/PlannerView.vue`（整体替换）：

```vue
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink } from 'vue-router'
import { useSettingsStore } from '../stores/settings'
import { useTripStore } from '../stores/trip'
import { loadAmap } from '../composables/useAmap'

const settings = useSettingsStore()
const trip = useTripStore()
const mapEl = ref(null)
const error = ref('')
let map = null

onMounted(async () => {
  if (!settings.hasAmapKey) {
    error.value = '尚未配置高德 API Key'
    return
  }
  try {
    const AMap = await loadAmap(settings.amapKey)
    map = new AMap.Map(mapEl.value, {
      zoom: 6,
      center: [101.5, 30.0],
      mapStyle: 'amap://styles/normal',
    })
    map.addControl(new AMap.Scale())
    map.addControl(new AMap.ToolBar({ position: 'RB' }))
  } catch (e) {
    error.value = '地图加载失败：' + e.message
  }
})

onBeforeUnmount(() => {
  if (map) { map.destroy(); map = null }
})

function loadPreset() {
  trip.loadPreset318()
}
</script>

<template>
  <div class="flex h-full">
    <!-- 侧边栏 -->
    <aside class="w-80 shrink-0 border-r border-black/5 bg-white/60 overflow-auto p-4 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold">路线</h2>
        <button
          @click="loadPreset"
          class="text-xs px-2.5 py-1 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition"
        >
          加载 318 预设
        </button>
      </div>

      <div v-if="trip.plan" class="space-y-2">
        <p class="text-xs text-gray-500">{{ trip.plan.name }}</p>
        <div
          v-for="day in trip.plan.days"
          :key="day.dayNumber"
          class="rounded-lg border border-gray-100 p-2.5"
        >
          <div class="text-sm font-medium">Day {{ day.dayNumber }} · 宿{{ day.overnight }}</div>
          <div class="text-xs text-gray-400 mt-0.5">
            {{ day.waypoints.map(w => w.name).join(' → ') }}
          </div>
        </div>
      </div>
      <p v-else class="text-sm text-gray-400">点击「加载 318 预设」开始。</p>
    </aside>

    <!-- 地图 -->
    <div class="flex-1 relative">
      <div ref="mapEl" class="absolute inset-0"></div>
      <div
        v-if="error"
        class="absolute inset-0 flex flex-col items-center justify-center text-center gap-2 bg-gray-50"
      >
        <p class="text-gray-500">{{ error }}</p>
        <RouterLink to="/settings" class="text-sm text-accent">前往设置 →</RouterLink>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: 验证地图显示**

```powershell
npm run dev
```

Expected: 配置 Key 后，路线规划页显示高德地图，侧边栏点「加载 318 预设」列出 9 天行程；未配置 Key 时显示提示并有「前往设置」链接。

- [ ] **Step 5: 提交**

```bash
git add src/composables/useAmap.js src/views/PlannerView.vue package.json package-lock.json
git commit -m "feat: 高德地图集成与预设路线侧边栏"
```

---

## Task 11: POI 搜索面板

**Files:**
- Create: `src/components/PoiSearchPanel.vue`
- Modify: `src/views/PlannerView.vue`

- [ ] **Step 1: 创建 POI 搜索面板**

`src/components/PoiSearchPanel.vue`：

```vue
<script setup>
import { ref } from 'vue'
import { loadAmap } from '../composables/useAmap'
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()
const keyword = ref('')
const results = ref([])
const loading = ref(false)
const error = ref('')

const categories = [
  { key: '', label: '全部' },
  { key: '餐饮', label: '🍜 餐饮' },
  { key: '酒店', label: '🏠 住宿' },
  { key: '景点', label: '📍 景点' },
  { key: '加油站', label: '⛽ 加油' },
]
const activeCat = ref('')

async function search() {
  if (!keyword.value.trim()) return
  loading.value = true
  error.value = ''
  results.value = []
  try {
    const AMap = await loadAmap(settings.amapKey)
    const query = [activeCat.value, keyword.value].filter(Boolean).join(' ')
    const placeSearch = new AMap.PlaceSearch({ pageSize: 15, pageIndex: 1 })
    placeSearch.search(query, (status, result) => {
      loading.value = false
      if (status === 'complete' && result.poiList) {
        results.value = result.poiList.pois.map((p) => ({
          id: p.id,
          name: p.name,
          address: p.address,
          lng: p.location.lng,
          lat: p.location.lat,
        }))
      } else {
        error.value = '未找到结果'
      }
    })
  } catch (e) {
    loading.value = false
    error.value = e.message
  }
}

const emit = defineEmits(['select'])
</script>

<template>
  <div class="space-y-3">
    <div class="flex gap-2">
      <input
        v-model="keyword"
        @keyup.enter="search"
        placeholder="搜索地点、餐厅、酒店…"
        class="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:border-accent focus:outline-none text-sm"
      />
      <button
        @click="search"
        class="px-3 py-2 rounded-lg bg-accent text-white text-sm hover:opacity-90 transition"
      >
        搜索
      </button>
    </div>

    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="c in categories"
        :key="c.key"
        @click="activeCat = c.key"
        :class="[
          'px-2.5 py-1 rounded-full text-xs transition',
          activeCat === c.key ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
        ]"
      >
        {{ c.label }}
      </button>
    </div>

    <p v-if="loading" class="text-sm text-gray-400">搜索中…</p>
    <p v-if="error" class="text-sm text-red-500">{{ error }}</p>

    <ul class="space-y-1.5">
      <li
        v-for="r in results"
        :key="r.id"
        class="rounded-lg border border-gray-100 p-2.5 hover:border-accent/40 cursor-pointer transition"
        @click="emit('select', r)"
      >
        <div class="text-sm font-medium">{{ r.name }}</div>
        <div class="text-xs text-gray-400 mt-0.5">{{ r.address || '无地址信息' }}</div>
      </li>
    </ul>
  </div>
</template>
```

- [ ] **Step 2: 在 PlannerView 加标签切换（路线 / 搜索）**

修改 `src/views/PlannerView.vue` 的 `<script setup>`，新增导入与状态，并实现 `flyTo`：

在 import 区追加：

```js
import PoiSearchPanel from '../components/PoiSearchPanel.vue'
```

在 `let map = null` 下方追加：

```js
const tab = ref('route') // 'route' | 'search'

function flyTo(poi) {
  if (!map) return
  map.setZoomAndCenter(14, [poi.lng, poi.lat])
}
```

- [ ] **Step 3: 在 PlannerView 侧边栏加标签页 UI**

将侧边栏 `<aside>` 内容改为标签切换结构（整体替换 `<aside>...</aside>`）：

```vue
    <aside class="w-80 shrink-0 border-r border-black/5 bg-white/60 overflow-auto p-4 space-y-4">
      <div class="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button
          @click="tab = 'route'"
          :class="['flex-1 py-1.5 rounded-md text-sm transition', tab === 'route' ? 'bg-white shadow-sm' : 'text-gray-500']"
        >路线</button>
        <button
          @click="tab = 'search'"
          :class="['flex-1 py-1.5 rounded-md text-sm transition', tab === 'search' ? 'bg-white shadow-sm' : 'text-gray-500']"
        >搜索</button>
      </div>

      <!-- 路线标签 -->
      <template v-if="tab === 'route'">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">路线</h2>
          <button
            @click="loadPreset"
            class="text-xs px-2.5 py-1 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition"
          >加载 318 预设</button>
        </div>
        <div v-if="trip.plan" class="space-y-2">
          <p class="text-xs text-gray-500">{{ trip.plan.name }}</p>
          <div
            v-for="day in trip.plan.days"
            :key="day.dayNumber"
            class="rounded-lg border border-gray-100 p-2.5"
          >
            <div class="text-sm font-medium">Day {{ day.dayNumber }} · 宿{{ day.overnight }}</div>
            <div class="text-xs text-gray-400 mt-0.5">
              {{ day.waypoints.map(w => w.name).join(' → ') }}
            </div>
          </div>
        </div>
        <p v-else class="text-sm text-gray-400">点击「加载 318 预设」开始。</p>
      </template>

      <!-- 搜索标签 -->
      <template v-else>
        <PoiSearchPanel @select="flyTo" />
      </template>
    </aside>
```

- [ ] **Step 4: 验证 POI 搜索**

```powershell
npm run dev
```

Expected: 切到「搜索」标签，输入「成都 火锅」搜索能返回结果列表；点击某条结果，地图飞到该位置。

- [ ] **Step 5: 提交**

```bash
git add src/components/PoiSearchPanel.vue src/views/PlannerView.vue
git commit -m "feat: POI 搜索面板"
```

---

## Task 12: GitHub Actions CI 与协作模板

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/feature_request.md`, `.github/pull_request_template.md`

- [ ] **Step 1: 写 CI workflow**

`.github/workflows/ci.yml`：

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
```

- [ ] **Step 2: 写 Bug 模板**

`.github/ISSUE_TEMPLATE/bug_report.md`：

```markdown
---
name: Bug 反馈
about: 报告一个问题
title: '[Bug] '
labels: bug
---

## 问题描述

## 复现步骤
1.
2.

## 期望结果

## 实际结果

## 环境
- 浏览器 / 版本：
- 操作系统：
```

- [ ] **Step 3: 写功能请求模板**

`.github/ISSUE_TEMPLATE/feature_request.md`：

```markdown
---
name: 功能建议
about: 提出一个新功能或改进
title: '[Feature] '
labels: enhancement
---

## 想解决的问题

## 期望的方案

## 备选方案 / 补充说明
```

- [ ] **Step 4: 写 PR 模板**

`.github/pull_request_template.md`：

```markdown
## 变更说明

## 关联 Issue
Closes #

## 自测清单
- [ ] `npm test` 通过
- [ ] `npm run build` 通过
- [ ] 手动验证了相关页面
```

- [ ] **Step 5: 本地验证 CI 命令可跑通**

```powershell
npm ci; npm test; npm run build
```

Expected: 三条命令全部成功，`dist/` 目录生成。

- [ ] **Step 6: 提交**

```bash
git add .github
git commit -m "ci: 添加 GitHub Actions 与协作模板"
```

---

## Task 13: 推送到 GitHub

**Files:** 无（仅 git 操作）

- [ ] **Step 1: 在 GitHub 创建空仓库**

由用户在 https://github.com/new 创建名为 `318` 的仓库（不要勾选初始化 README/LICENSE/.gitignore，保持空仓库）。

- [ ] **Step 2: 关联远程并推送**

```bash
git remote add origin https://github.com/jkvhb/318.git
git push -u origin main
```

- [ ] **Step 3: 验证**

打开 https://github.com/jkvhb/318 ，确认代码已上传，Actions 标签页 CI 开始运行并通过。

---

## Self-Review

**Spec coverage（对照 PRD v2 Phase 1）：**
- ✅ Vue 3 + Vite + TailwindCSS 脚手架 → Task 1, 3
- ✅ 三视图路由 + 导航栏 → Task 5
- ✅ 高德地图集成 → Task 10
- ✅ 设置页（API Key 配置）→ Task 6, 7
- ✅ 318 预设数据加载 → Task 8, 9
- ✅ POI 搜索面板 → Task 11
- ✅ 开源项目管理（额外）→ Task 2, 12, 13

**Placeholder scan:** 无 TBD/TODO；所有代码步骤含完整代码。

**Type consistency:**
- 预设数据结构 `{ name, description, days: [{ dayNumber, overnight, waypoints: [{ name, lng, lat, altitude }] }] }` 在 preset318.js、preset318.test.js、trip.js、PlannerView.vue 中一致。
- settings store 方法 `setAmapKey/setLlmKey/setVoice` 与 `hasAmapKey` 在 store、测试、SettingsView 中一致。
- `loadAmap(key)` 签名在 useAmap.js、PlannerView.vue、PoiSearchPanel.vue 中一致。
- trip store `loadPreset318/plan/dayCount/allWaypoints` 在 store、测试、PlannerView 中一致。

**备注:** 318 预设坐标为人工近似值，仅作模板；真实精度由 Phase 2 接入高德路线规划与坐标转换层后保证。
