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
