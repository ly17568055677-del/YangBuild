<template>
    <el-main class="layout-main">
        <el-scrollbar class="layout-main-scrollbar" :style="layoutMainScrollbarStyle" ref="layoutMainScrollbarRef">
            <router-view v-slot="{ Component }">
                <transition :name="config.layout.mainAnimation" mode="out-in">
                    <keep-alive :include="state.keepAliveComponentNameList">
                        <component :is="Component" :key="state.componentKey" />
                    </keep-alive>
                </transition>
            </router-view>
        </el-scrollbar>
    </el-main>
</template>

<script setup lang="ts">
import { reactive, onMounted, watch, onBeforeMount, onUnmounted, nextTick } from 'vue'
import { useRoute, type RouteLocationNormalized } from 'vue-router'
import { useConfig } from '/@/stores/config'
import { useNavTabs } from '/@/stores/navTabs'
import { layoutMainScrollbarRef, layoutMainScrollbarStyle } from '/@/stores/refs'
import { eventBus } from '/@/utils/eventBus'

defineOptions({
    name: 'layout/main',
})

const route = useRoute()
const config = useConfig()
const navTabs = useNavTabs()

const state: {
    componentKey: string
    keepAliveComponentNameList: string[]
} = reactive({
    componentKey: route.fullPath,
    keepAliveComponentNameList: [],
})

const addKeepAliveComponentName = function (keepAliveName: string | undefined) {
    if (keepAliveName) {
        let exist = state.keepAliveComponentNameList.find((name: string) => {
            return name === keepAliveName
        })
        if (exist) return
        state.keepAliveComponentNameList.push(keepAliveName)
    }
}

const addActiveRouteKeepAlive = () => {
    if (navTabs.state.activeRoute) {
        const tabView = navTabs.getTabsViewDataByRoute(navTabs.state.activeRoute)
        if (tabView && typeof tabView.meta?.keepalive == 'string') {
            addKeepAliveComponentName(tabView.meta.keepalive)
        }
    }
}

let viewReloadKey = 0

const keepaliveName = (menu?: RouteLocationNormalized) => {
    const name = menu?.meta?.keepalive
    return typeof name === 'string' ? name : ''
}

const dropKeepAlive = (name: string) => {
    if (!name) return
    state.keepAliveComponentNameList = state.keepAliveComponentNameList.filter((item) => item !== name)
}

const reloadCurrentView = (menu: RouteLocationNormalized) => {
    const name = keepaliveName(menu)
    dropKeepAlive(name)
    const fullPath = menu?.fullPath || route.fullPath
    nextTick(() => {
        viewReloadKey += 1
        state.componentKey = `${fullPath}#${viewReloadKey}`
        addKeepAliveComponentName(name)
    })
}

const onTabViewClose = (menu: RouteLocationNormalized) => {
    dropKeepAlive(keepaliveName(menu))
}

onBeforeMount(() => {
    eventBus.on('onTabViewRefresh', reloadCurrentView)
    eventBus.on('onTabViewClose', onTabViewClose)
})

onUnmounted(() => {
    eventBus.off('onTabViewRefresh', reloadCurrentView)
    eventBus.off('onTabViewClose', onTabViewClose)
})

onMounted(() => {
    // 确保刷新页面时也能正确取得当前路由 keepalive 参数（热更新）
    addActiveRouteKeepAlive()
})

watch(
    () => route.fullPath,
    () => {
        state.componentKey = route.fullPath
        addActiveRouteKeepAlive()
    }
)
</script>

<style scoped lang="scss">
.layout-container .layout-main {
    padding: 0 !important;
    overflow: hidden;
    width: 100%;
    height: 100%;
}
.layout-main-scrollbar {
    width: 100%;
    position: relative;
    overflow: hidden;
}
</style>
