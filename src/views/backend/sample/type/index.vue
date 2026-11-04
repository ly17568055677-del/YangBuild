<template>
    <div class="default-main ba-table-box">
        <el-alert class="ba-table-alert" v-if="baTable.table.remark" :title="baTable.table.remark" type="info" show-icon />
        <TableHeader :buttons="['refresh', 'add', 'edit', 'delete', 'comSearch', 'quickSearch', 'columnDisplay']" :quick-search-placeholder="t('Quick search placeholder', { fields: t('sample.type.quick Search Fields') })"></TableHeader>
        <Table ref="tableRef"></Table>
        <PopupForm />
    </div>
</template>

<script setup lang="ts">
import { onMounted, provide, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import PopupForm from './popupForm.vue'
import { baTableApi } from '/@/api/common'
import { defaultOptButtons } from '/@/components/table'
import TableHeader from '/@/components/table/header/index.vue'
import Table from '/@/components/table/index.vue'
import baTableClass from '/@/utils/baTable'

defineOptions({
    name: 'sample/type',
})

const { t } = useI18n()
const tableRef = useTemplateRef('tableRef')
const optButtons: OptButton[] = defaultOptButtons(['weigh-sort', 'edit', 'delete'])
const baTable = new baTableClass(
    new baTableApi('/admin/sample.type/'),
    {
        pk: 'id',
        column: [
            { type: 'selection', align: 'center', operator: false },
            { label: t('sample.type.id'), prop: 'id', align: 'center', operator: '=' },
            { label: t('sample.type.string_value'), prop: 'string_value', align: 'center', operator: 'LIKE' },
            { label: t('sample.type.number_value'), prop: 'number_value', align: 'center', operator: '=' },
            { label: t('sample.type.float_value'), prop: 'float_value', align: 'center', operator: '=' },
            { label: t('sample.type.radio_value'), prop: 'radio_value', align: 'center', operator: '=', render: 'tag', replaceValue: { "opt0": t('sample.type.radio_value opt0'), "opt1": t('sample.type.radio_value opt1') } },
            { label: t('sample.type.checkbox_value'), prop: 'checkbox_value', align: 'center', operator: 'FIND_IN_SET', render: 'tags', replaceValue: { "opt0": t('sample.type.checkbox_value opt0'), "opt1": t('sample.type.checkbox_value opt1') } },
            { label: t('sample.type.switch_value'), prop: 'switch_value', align: 'center', operator: '=', render: 'switch', replaceValue: { "0": t('sample.type.switch_value 0'), "1": t('sample.type.switch_value 1') } },
            { label: t('sample.type.textarea_value'), prop: 'textarea_value', align: 'center', operator: false },
            { label: t('sample.type.array_value'), prop: 'array_value', align: 'center', operator: false, formatter: (row, column, cellValue) => Array.isArray(cellValue) ? JSON.stringify(cellValue) : (cellValue ?? '') },
            { label: t('sample.type.date_value'), prop: 'date_value', align: 'center', operator: 'RANGE', comSearchRender: 'date' },
            { label: t('sample.type.time_value'), prop: 'time_value', align: 'center', operator: 'RANGE', comSearchRender: 'time' },
            { label: t('sample.type.datetime_value'), prop: 'datetime_value', align: 'center', operator: 'RANGE', comSearchRender: 'datetime' },
            { label: t('sample.type.year_value'), prop: 'year_value', align: 'center', operator: 'RANGE', formatter: (row, column, cellValue) => { const text = cellValue == null || cellValue === '' ? '' : String(cellValue); const matched = text.match(/^(-?\d+)(?:\.0+)?$/); return matched ? matched[1] : text } },
            { label: t('sample.type.timestamp_value'), prop: 'timestamp_value', align: 'center', operator: 'RANGE', render: 'datetime', timeFormat: 'yyyy-mm-dd hh:MM:ss' },
            { label: t('sample.type.select_value'), prop: 'select_value', align: 'center', operator: '=', render: 'tag', replaceValue: { "opt0": t('sample.type.select_value opt0'), "opt1": t('sample.type.select_value opt1') } },
            { label: t('sample.type.selects_value'), prop: 'selects_value', align: 'center', operator: 'FIND_IN_SET', render: 'tags', replaceValue: { "opt0": t('sample.type.selects_value opt0'), "opt1": t('sample.type.selects_value opt1') } },
            { label: t('sample.type.admin_id'), prop: 'admin_id_rel.username', align: 'center', operator: 'LIKE' },
            { label: t('sample.type.admin_ids'), prop: 'admin_ids', align: 'center', operator: 'FIND_IN_SET', formatter: (row, column, cellValue) => { const named = row[String(column.property || '') + '_text']; if (named) return named; if (Array.isArray(cellValue)) return cellValue.join('、'); return cellValue ?? '' } },
            { label: t('sample.type.city_value'), prop: 'city_value', align: 'center', operator: false, formatter: (row, column, cellValue) => { const named = row[String(column.property || '') + '_text']; if (named) return named; if (Array.isArray(cellValue)) return cellValue.join('、'); return cellValue ?? '' } },
            { label: t('sample.type.image_value'), prop: 'image_value', align: 'center', operator: false, render: 'image' },
            { label: t('sample.type.images_value'), prop: 'images_value', align: 'center', operator: false, render: 'images' },
            { label: t('sample.type.file_value'), prop: 'file_value', align: 'center', operator: false, render: 'file' },
            { label: t('sample.type.files_value'), prop: 'files_value', align: 'center', operator: false, render: 'files' },
            { label: t('sample.type.icon_value'), prop: 'icon_value', align: 'center', operator: false, render: 'icon' },
            { label: t('sample.type.color_value'), prop: 'color_value', align: 'center', operator: false, render: 'color' },
            { label: t('sample.type.weigh'), prop: 'weigh', align: 'center', operator: '=' },
            { label: t('sample.type.update_time'), prop: 'update_time', align: 'center', operator: 'RANGE', render: 'datetime', timeFormat: 'yyyy-mm-dd hh:MM:ss' },
            { label: t('sample.type.create_time'), prop: 'create_time', align: 'center', operator: 'RANGE', render: 'datetime', timeFormat: 'yyyy-mm-dd hh:MM:ss' },
            { label: t('Operate'), align: 'center', width: 140, render: 'buttons', buttons: optButtons, operator: false },
        ],
        dblClickNotEditColumn: [undefined],
        defaultOrder: { prop: 'weigh', order: 'desc' },
    },
    {
        defaultItems: { radio_value: "opt0", checkbox_value: ["opt0","opt1"], switch_value: "1", array_value: [], select_value: "opt0", selects_value: ["opt0","opt1"], weigh: 0 },
    }
)

provide('baTable', baTable)

onMounted(() => {
    baTable.table.ref = tableRef.value
    baTable.mount()
    baTable.getData()?.then(() => {
        baTable.initSort()
        baTable.dragSort()
    })
})
</script>

<style scoped lang="scss"></style>
