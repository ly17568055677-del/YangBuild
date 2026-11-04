<template>
    <img class="site-logo" :src="src" alt="" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import defaultLogo from '/@/assets/logo.png'
import { useSiteConfig } from '/@/stores/siteConfig'
import { fullUrl } from '/@/utils/common'

const siteConfig = useSiteConfig()
const src = computed(() => (siteConfig.siteLogo ? fullUrl(siteConfig.siteLogo) : defaultLogo))
</script>

<style scoped>
.site-logo {
    object-fit: contain;
}
</style>
