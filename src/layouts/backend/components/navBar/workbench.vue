<template>
    <div class="nav-bar">
        <div v-if="config.layout.shrink && config.layout.menuCollapse" class="unfold">
            <Icon @click="onMenuCollapse" name="fa fa-indent" :color="config.getColorVal('menuActiveColor')" size="18" />
        </div>
        <div class="workbench-current">
            <span class="workbench-kicker">{{ t('layouts.Workbench') }}</span>
            <span class="workbench-name">{{ currentTitle }}</span>
        </div>
        <NavTabs v-if="!config.layout.shrink" ref="layoutNavTabsRef" :class="{ 'is-single': config.layout.tabMode === 'single' }" />
        <NavMenus />
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import NavMenus from '../navMenus.vue'
import NavTabs from '/@/layouts/backend/components/navBar/tabs.vue'
import { useConfig } from '/@/stores/config'
import { layoutNavTabsRef } from '/@/stores/refs'
import { useNavTabs } from '/@/stores/navTabs'
import { showShade } from '/@/utils/pageShade'

const { t } = useI18n()
const config = useConfig()
const route = useRoute()
const navTabs = useNavTabs()

const currentTitle = computed(() => {
    const title = navTabs.state.activeRoute?.meta?.title || route.meta?.title
    return typeof title === 'string' && title ? title : t('layouts.Workbench')
})

const onMenuCollapse = () => {
    showShade('ba-aside-menu-shade', () => {
        config.setLayout('menuCollapse', true)
    })
    config.setLayout('menuCollapse', false)
}
</script>

<style scoped lang="scss">
.nav-bar {
    display: flex;
    align-items: center;
    height: 52px;
    width: 100%;
    padding-left: 16px;
    background-color: v-bind('config.getColorVal("headerBarBackground")');
    border-bottom: 1px solid var(--el-border-color-lighter);
    :deep(.nav-tabs) {
        display: flex;
        height: 100%;
        position: relative;
        flex: 1;
        min-width: 0;
        .ba-nav-tab {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 16px;
            cursor: pointer;
            z-index: 1;
            height: 100%;
            user-select: none;
            color: v-bind('config.getColorVal("headerBarTabColor")');
            .close-icon {
                padding: 2px;
                margin: 2px 0 0 4px;
            }
            .close-icon:hover {
                background: var(--ba-color-primary-light);
                color: var(--el-border-color) !important;
                border-radius: 50%;
            }
            &.active {
                color: v-bind('config.getColorVal("headerBarTabActiveColor")');
            }
            &:hover {
                background-color: v-bind('config.getColorVal("headerBarHoverBackground")');
            }
        }
        .nav-tabs-active-box {
            position: absolute;
            height: 52px;
            background-color: v-bind('config.getColorVal("headerBarTabActiveBackground")');
            transition: all 0.2s;
        }
        &.is-single {
            flex: 0 0 0;
            width: 0;
            margin: 0;
            overflow: hidden;
            opacity: 0;
            pointer-events: none;
        }
    }
}
.workbench-current {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 160px;
    margin-right: 12px;
    white-space: nowrap;
}
.workbench-kicker {
    font-size: 12px;
    color: var(--el-text-color-secondary);
}
.workbench-name {
    font-size: 16px;
    font-weight: 600;
    color: v-bind('config.getColorVal("headerBarTabActiveColor")');
}
.unfold {
    align-self: center;
    padding-right: 12px;
}
</style>
