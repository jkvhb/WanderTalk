<script setup>
import { ref } from 'vue'
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()
const amapInput = ref(settings.amapKey)
const amapSecurityInput = ref(settings.amapSecurityCode)
const llmInput = ref(settings.llmKey)
const saved = ref(false)

function save() {
  settings.setAmapKey(amapInput.value)
  settings.setAmapSecurityCode(amapSecurityInput.value)
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
