<template>
    <div class="wb-profile">
        <img class="wb-avatar" :src="avatar" alt="" />
        <div class="wb-profile-text">
            <div class="wb-name">{{ adminInfo.nickname || adminInfo.username }}</div>
            <div class="wb-role">{{ t('layouts.Workbench') }}</div>
        </div>
    </div>
    <nav class="wb-nav">
        <template v-for="row in rows" :key="row.key">
            <div v-if="row.group" class="wb-group" :style="{ paddingLeft: 16 + row.depth * 12 + 'px' }">{{ row.title }}</div>
            <div
                v-else
                class="wb-item"
                :class="{ active: row.menu && isActive(row.menu) }"
                :style="{ paddingLeft: 16 + row.depth * 12 + 'px' }"
                @click="onPick(row.menu!)"
            >
                <Icon :name="iconOf(row.menu!)" size="16" color="currentColor" />
                <span>{{ row.title }}</span>
            </div>
        </template>
    </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, type RouteRecordRaw } from 'vue-router'
import { useAdminInfo } from '/@/stores/adminInfo'
import { useConfig } from '/@/stores/config'
import { useNavTabs } from '/@/stores/navTabs'
import { fullUrl } from '/@/utils/common'
import { onClickMenu } from '/@/utils/router'

interface MenuRow {
    key: string
    title: string
    group: boolean
    depth: number
    menu?: RouteRecordRaw
}

const emit = defineEmits<{ pick: [] }>()
const { t } = useI18n()
const route = useRoute()
const config = useConfig()
const navTabs = useNavTabs()
const adminInfo = useAdminInfo()

const avatar = computed(() => fullUrl(adminInfo.avatar ? adminInfo.avatar : '/static/images/avatar.png'))

const rows = computed(() => flatten(navTabs.state.tabsViewRoutes))

const flatten = (menus: RouteRecordRaw[], depth = 0, list: MenuRow[] = []) => {
    menus.forEach((menu, index) => {
        const title = String(menu.meta?.title || '')
        const children = menu.children || []
        if (children.length) {
            list.push({ key: `g-${depth}-${index}-${String(menu.path)}`, title, group: true, depth })
            flatten(children, depth + 1, list)
        } else {
            list.push({ key: String(menu.path || `${depth}-${index}`), title, group: false, depth, menu })
        }
    })
    return list
}

const iconOf = (menu: RouteRecordRaw) => {
    const icon = menu.meta?.icon
    return typeof icon === 'string' && icon ? icon : config.layout.menuDefaultIcon
}

const isActive = (menu: RouteRecordRaw) => route.path === menu.path

const onPick = (menu: RouteRecordRaw) => {
    onClickMenu(menu)
    emit('pick')
}
</script>

<style scoped lang="scss">
.wb-profile {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 22px 18px 8px;
}
.wb-avatar {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    object-fit: cover;
    background: var(--el-fill-color-light);
}
.wb-name {
    font-size: 16px;
    font-weight: 700;
    line-height: 1.3;
}
.wb-role {
    margin-top: 4px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
}
.wb-nav {
    padding: 8px 10px 18px;
}
.wb-group {
    margin-top: 14px;
    padding-top: 8px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
}
.wb-item {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    margin-top: 4px;
    border-radius: 8px;
    color: var(--el-text-color-regular);
    cursor: pointer;
    span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    &:hover {
        background: var(--el-fill-color-light);
    }
    &.active {
        background: var(--el-color-primary-light-9);
        color: var(--el-color-primary);
        font-weight: 600;
        box-shadow: inset 3px 0 0 var(--el-color-primary);
    }
}
</style>
