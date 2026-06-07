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
