<template>
    <div hidden></div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'

onMounted(async () => {
    if (document.getElementById('app')) return
    const host = document.createElement('div')
    host.id = 'app'
    document.body.appendChild(host)
    const nuxtRoot = document.getElementById('__nuxt')
    if (nuxtRoot) nuxtRoot.style.height = '0'
    const { bootLegacy } = await import('/@/main')
    await bootLegacy()
})
</script>
