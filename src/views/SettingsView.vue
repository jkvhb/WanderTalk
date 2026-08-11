<script setup>
import { ref } from 'vue'
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()
const amapInput = ref(settings.amapKey)
const amapSecurityInput = ref(settings.amapSecurityCode)
const llmInput = ref(settings.llmKey)
const kimiInput = ref(settings.kimiKey)
const llmProviderInput = ref(settings.llmProvider)
const tiandituInput = ref(settings.tiandituKey)
const saved = ref(false)

function save() {
  settings.setAmapKey(amapInput.value)
  settings.setAmapSecurityCode(amapSecurityInput.value)
  settings.setLlmKey(llmInput.value)
  settings.setKimiKey(kimiInput.value)
  settings.setLlmProvider(llmProviderInput.value)
  settings.setTiandituKey(tiandituInput.value)
  saved.value = true
  setTimeout(() => (saved.value = false), 2000)
}

function clearKimiKey() {
  kimiInput.value = ''
  settings.clearKimiKey()
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
        <label class="block text-sm font-medium mb-1">高德安全密钥 securityJsCode</label>
        <input
          v-model="amapSecurityInput"
          type="text"
          placeholder="与上面 Key 配套的「安全密钥」"
          class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-accent focus:outline-none text-sm"
        />
        <p class="text-xs text-gray-400 mt-1">
          JS API 2.0 必填：POI 搜索、路径规划等服务需要安全密钥。在控制台 Key 详情页与 Key 一同生成。
        </p>
      </div>

      <div class="space-y-2">
        <label class="block text-sm font-medium">默认 AI 模型</label>
        <select
          v-model="llmProviderInput"
          class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-accent focus:outline-none text-sm bg-white"
        >
          <option value="kimi">Kimi K2.6（默认）</option>
          <option value="deepseek">DeepSeek（备用）</option>
        </select>
        <div v-if="llmProviderInput === 'kimi'" class="space-y-2">
          <label class="block text-sm font-medium">Kimi API Key</label>
          <div class="flex gap-2">
            <input
              v-model="kimiInput"
              type="password"
              autocomplete="off"
              placeholder="在 platform.moonshot.cn 申请的 API Key"
              class="min-w-0 flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:border-accent focus:outline-none text-sm"
            />
            <button
              type="button"
              class="shrink-0 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
              @click="clearKimiKey"
            >
              清除
            </button>
          </div>
          <p class="text-xs text-gray-500">
            只保存在当前浏览器；未填写时会尝试使用本地服务端的备用 Key。
          </p>
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">DeepSeek API Key（手动备用）</label>
        <input
          v-model="llmInput"
          type="password"
          placeholder="在 platform.deepseek.com 申请的 API Key"
          class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-accent focus:outline-none text-sm"
        />
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">天地图 API Key（飞行动画底图）</label>
        <input
          v-model="tiandituInput"
          type="text"
          placeholder="在天地图开放平台申请的浏览器端 tk"
          class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-accent focus:outline-none text-sm"
        />
        <p class="text-xs text-gray-400 mt-1">
          前往 <a href="https://console.tianditu.gov.cn/" target="_blank" class="text-accent">天地图开放平台</a> 申请「浏览器端」key；飞行动画底图（WGS-84，与路线零偏移）使用它。
        </p>
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
      🔒 浏览器 Key 不会写入项目或 Git，但恶意浏览器扩展、同源脚本仍可能读取本地数据。请勿使用已经公开过的 Key。
    </p>
  </div>
</template>
