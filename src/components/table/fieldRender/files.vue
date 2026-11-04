<template>
    <div class="ba-table-render-files">
        <a
            v-for="(item, idx) in links"
            :key="idx"
            class="ba-table-render-file"
            :href="fullUrl(item)"
            target="_blank"
            rel="noopener noreferrer"
        >{{ fileName(item) }}</a>
    </div>
</template>

<script setup lang="ts">
import { TableColumnCtx } from 'element-plus'
import { getCellValue } from '/@/components/table/index'
import { fullUrl } from '/@/utils/common'

interface Props {
    row: TableRow
    field: TableColumn
    column: TableColumnCtx<TableRow>
    index: number
}

const props = defineProps<Props>()
const cellValue = getCellValue(props.row, props.field, props.column, props.index)
const links = (Array.isArray(cellValue) ? cellValue : String(cellValue ?? '').split(','))
    .map((item) => String(item).trim())
    .filter(Boolean)

const fileName = (url: string) => {
    const clean = url.split('?')[0].split('#')[0]
    const name = clean.split('/').filter(Boolean).pop() || url
    try {
        return decodeURIComponent(name)
    } catch {
        return name
    }
}
</script>

<style scoped lang="scss">
.ba-table-render-files {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
}
.ba-table-render-file {
    color: var(--el-color-primary);
    line-height: 1.4;
    text-decoration: none;
    word-break: break-all;
}
</style>
