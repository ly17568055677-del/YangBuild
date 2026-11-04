<template>
    <div class="wb" :class="{ 'is-shrink': config.layout.shrink }">
        <header v-show="!navTabs.state.tabFullScreen" class="wb-top">
            <button v-if="config.layout.shrink" class="wb-fold" type="button" @click="menuOpen = true">
                <Icon name="fa fa-indent" size="18" color="var(--el-color-primary)" />
            </button>
            <div class="wb-brand" @click="onHome">
                <SiteLogo />
                <span>{{ siteConfig.siteName }}</span>
            </div>
            <NavMenus />
        </header>
        <div class="wb-body">
            <aside v-show="!navTabs.state.tabFullScreen && !config.layout.shrink" class="wb-side">
                <WorkbenchSide />
            </aside>
            <section class="wb-stage">
                <div v-show="!navTabs.state.tabFullScreen" class="wb-stage-head">
                    <h1>{{ currentTitle }}</h1>
                    <NavTabs ref="layoutNavTabsRef" :class="{ 'is-single': config.layout.tabMode === 'single' }" />
                </div>
                <Main />
            </section>
        </div>
        <div v-if="menuOpen" class="wb-mask" @click="menuOpen = false"></div>
        <aside v-if="menuOpen" class="wb-side is-drawer">
            <WorkbenchSide @pick="menuOpen = false" />
        </aside>
        <CloseFullScreen v-if="navTabs.state.tabFullScreen" />
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import SiteLogo from '/@/components/siteLogo.vue'
import CloseFullScreen from '/@/layouts/backend/components/closeFullScreen.vue'
import NavMenus from '/@/layouts/backend/components/navMenus.vue'
import NavTabs from '/@/layouts/backend/components/navBar/tabs.vue'
import Main from '/@/layouts/backend/router-view/main.vue'
import WorkbenchSide from './workbenchSide.vue'
import { useConfig } from '/@/stores/config'
import { layoutNavTabsRef } from '/@/stores/refs'
import { useNavTabs } from '/@/stores/navTabs'
import { useSiteConfig } from '/@/stores/siteConfig'
import { routePush } from '/@/utils/router'

const { t } = useI18n()
const route = useRoute()
const config = useConfig()
const navTabs = useNavTabs()
const siteConfig = useSiteConfig()
const menuOpen = ref(false)

const currentTitle = computed(() => {
    const title = navTabs.state.activeRoute?.meta?.title || route.meta?.title
    return typeof title === 'string' && title ? title : t('layouts.Workbench')
})

const onHome = () => {
    routePush('/admin/dashboard')
}
</script>

<style scoped lang="scss">
.wb {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--ba-bg-color);
    color: var(--el-text-color-primary);
}
.wb-top {
    display: flex;
    align-items: center;
    height: 60px;
    padding: 0 18px 0 22px;
    background: var(--ba-bg-color-overlay);
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04), 0 8px 24px rgba(15, 23, 42, 0.04);
    z-index: 5;
}
.wb-brand {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    min-width: 0;
    img {
        width: 34px;
        height: 34px;
    }
    span {
        font-size: 18px;
        font-weight: 600;
        white-space: nowrap;
    }
}
.wb-fold {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    margin-right: 8px;
    border: 0;
    border-radius: 8px;
    background: var(--el-color-primary-light-9);
    cursor: pointer;
}
.wb-body {
    display: flex;
    flex: 1;
    min-height: 0;
    gap: 16px;
    padding: 16px;
}
.wb-side {
    width: 240px;
    flex: 0 0 240px;
    background: var(--ba-bg-color-overlay);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
    overflow: auto;
}
.wb-side.is-drawer {
    position: fixed;
    z-index: 20;
    top: 12px;
    bottom: 12px;
    left: 12px;
}
.wb-mask {
    position: fixed;
    inset: 0;
    z-index: 19;
    background: rgba(15, 23, 42, 0.28);
}
.wb-stage {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    background: var(--ba-bg-color-overlay);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
    overflow: hidden;
}
.wb-stage-head {
    display: flex;
    align-items: center;
    gap: 16px;
    min-height: 58px;
    padding: 0 20px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    h1 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        white-space: nowrap;
    }
}
.wb-stage :deep(.layout-main) {
    flex: 1;
    min-height: 0;
    background: transparent;
}
.wb-stage :deep(.default-main) {
    margin: 0;
    padding: 16px 18px 24px;
}
.wb-stage :deep(.nav-tabs) {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
    overflow: auto;
    .nav-tabs-active-box {
        display: none;
    }
    .ba-nav-tab {
        display: flex;
        align-items: center;
        height: 28px;
        padding: 0 12px;
        border-radius: 999px;
        background: var(--el-fill-color-light);
        color: var(--el-text-color-regular);
        cursor: pointer;
        white-space: nowrap;
        &.active {
            background: var(--el-color-primary-light-9);
            color: var(--el-color-primary);
        }
    }
    &.is-single {
        display: none;
    }
}
</style>
