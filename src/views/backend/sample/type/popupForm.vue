<template>
    <el-dialog class="ba-operate-dialog" :close-on-click-modal="false" :model-value="['Add', 'Edit'].includes(baTable.form.operate!)" @close="baTable.toggleForm">
        <template #header>
            <div class="title" v-drag="['.ba-operate-dialog', '.el-dialog__header']" v-zoom="'.ba-operate-dialog'">
                {{ baTable.form.operate ? t(baTable.form.operate) : '' }}
            </div>
        </template>
        <el-scrollbar v-loading="baTable.form.loading" class="ba-table-form-scrollbar">
            <div class="ba-operate-form" :class="'ba-' + baTable.form.operate + '-form'" :style="config.layout.shrink ? '' : 'width: calc(100% - ' + baTable.form.labelWidth! / 2 + 'px)'">
                <el-form v-if="!baTable.form.loading" ref="formRef" @submit.prevent="" @keyup.enter="baTable.onSubmit(formRef)" :model="baTable.form.items" :label-position="config.layout.shrink ? 'top' : 'right'" :label-width="baTable.form.labelWidth + 'px'" :rules="rules">
                    <FormItem :label="t('sample.type.string_value')" type="string" v-model="baTable.form.items!.string_value" prop="string_value" :placeholder="t('Please input field', { field: t('sample.type.string_value') })" />
                    <FormItem :label="t('sample.type.password_value')" type="password" v-model="baTable.form.items!.password_value" prop="password_value" :placeholder="t('Please input field', { field: t('sample.type.password_value') })" />
                    <FormItem :label="t('sample.type.number_value')" type="number" v-model="baTable.form.items!.number_value" prop="number_value" :input-attr="{ step: 1 }" :placeholder="t('Please input field', { field: t('sample.type.number_value') })" />
                    <FormItem :label="t('sample.type.float_value')" type="number" v-model="baTable.form.items!.float_value" prop="float_value" :input-attr="{ step: 0.01 }" :placeholder="t('Please input field', { field: t('sample.type.float_value') })" />
                    <FormItem :label="t('sample.type.radio_value')" type="radio" v-model="baTable.form.items!.radio_value" prop="radio_value" :input-attr="{ content: { opt0: t('sample.type.radio_value opt0'), opt1: t('sample.type.radio_value opt1') } }" :placeholder="t('Please select field', { field: t('sample.type.radio_value') })" />
                    <FormItem :label="t('sample.type.checkbox_value')" type="checkbox" v-model="baTable.form.items!.checkbox_value" prop="checkbox_value" :input-attr="{ content: { opt0: t('sample.type.checkbox_value opt0'), opt1: t('sample.type.checkbox_value opt1') } }" :placeholder="t('Please select field', { field: t('sample.type.checkbox_value') })" />
                    <FormItem :label="t('sample.type.switch_value')" type="switch" v-model="baTable.form.items!.switch_value" prop="switch_value" />
                    <FormItem :label="t('sample.type.textarea_value')" type="textarea" v-model="baTable.form.items!.textarea_value" prop="textarea_value" :input-attr="{ rows: 3 }" :placeholder="t('Please input field', { field: t('sample.type.textarea_value') })" />
                    <FormItem :label="t('sample.type.editor_value')" type="editor" v-model="baTable.form.items!.editor_value" prop="editor_value" :placeholder="t('Please input field', { field: t('sample.type.editor_value') })" />
                    <FormItem :label="t('sample.type.array_value')" type="array" v-model="baTable.form.items!.array_value" prop="array_value" :placeholder="t('Please input field', { field: t('sample.type.array_value') })" />
                    <FormItem :label="t('sample.type.date_value')" type="date" v-model="baTable.form.items!.date_value" prop="date_value" :placeholder="t('Please select field', { field: t('sample.type.date_value') })" />
                    <FormItem :label="t('sample.type.time_value')" type="time" v-model="baTable.form.items!.time_value" prop="time_value" :placeholder="t('Please select field', { field: t('sample.type.time_value') })" />
                    <FormItem :label="t('sample.type.datetime_value')" type="datetime" v-model="baTable.form.items!.datetime_value" prop="datetime_value" :placeholder="t('Please select field', { field: t('sample.type.datetime_value') })" />
                    <FormItem :label="t('sample.type.year_value')" type="year" v-model="baTable.form.items!.year_value" prop="year_value" :placeholder="t('Please select field', { field: t('sample.type.year_value') })" />
                    <FormItem :label="t('sample.type.timestamp_value')" type="datetime" v-model="baTable.form.items!.timestamp_value" prop="timestamp_value" :input-attr="{ valueFormat: 'X' }" :placeholder="t('Please select field', { field: t('sample.type.timestamp_value') })" />
                    <FormItem :label="t('sample.type.select_value')" type="select" v-model="baTable.form.items!.select_value" prop="select_value" :input-attr="{ content: { opt0: t('sample.type.select_value opt0'), opt1: t('sample.type.select_value opt1') } }" :placeholder="t('Please select field', { field: t('sample.type.select_value') })" />
                    <FormItem :label="t('sample.type.selects_value')" type="selects" v-model="baTable.form.items!.selects_value" prop="selects_value" :input-attr="{ content: { opt0: t('sample.type.selects_value opt0'), opt1: t('sample.type.selects_value opt1') } }" :placeholder="t('Please select field', { field: t('sample.type.selects_value') })" />
                    <FormItem :label="t('sample.type.admin_id')" type="remoteSelect" v-model="baTable.form.items!.admin_id" prop="admin_id" :input-attr="{ pk: 'admin.id', field: 'username', remoteUrl: '/admin/auth.admin/index' }" :placeholder="t('Please select field', { field: t('sample.type.admin_id') })" />
                    <FormItem :label="t('sample.type.admin_ids')" type="remoteSelects" v-model="baTable.form.items!.admin_ids" prop="admin_ids" :input-attr="{ pk: 'admin.id', field: 'username', remoteUrl: '/admin/auth.admin/index' }" :placeholder="t('Please select field', { field: t('sample.type.admin_ids') })" />
                    <FormItem :label="t('sample.type.city_value')" type="city" v-model="baTable.form.items!.city_value" prop="city_value" :placeholder="t('Please select field', { field: t('sample.type.city_value') })" />
                    <FormItem :label="t('sample.type.image_value')" type="image" v-model="baTable.form.items!.image_value" prop="image_value" />
                    <FormItem :label="t('sample.type.images_value')" type="images" v-model="baTable.form.items!.images_value" prop="images_value" />
                    <FormItem :label="t('sample.type.file_value')" type="file" v-model="baTable.form.items!.file_value" prop="file_value" />
                    <FormItem :label="t('sample.type.files_value')" type="files" v-model="baTable.form.items!.files_value" prop="files_value" />
                    <FormItem :label="t('sample.type.icon_value')" type="icon" v-model="baTable.form.items!.icon_value" prop="icon_value" :input-attr="{ placement: 'top' }" :placeholder="t('Please select field', { field: t('sample.type.icon_value') })" />
                    <FormItem :label="t('sample.type.color_value')" type="color" v-model="baTable.form.items!.color_value" prop="color_value" :placeholder="t('Please input field', { field: t('sample.type.color_value') })" />
                    <FormItem :label="t('sample.type.weigh')" type="number" v-model="baTable.form.items!.weigh" prop="weigh" :input-attr="{ step: 1 }" :placeholder="t('Please input field', { field: t('sample.type.weigh') })" />
                </el-form>
            </div>
        </el-scrollbar>
        <template #footer>
            <div :style="'width: calc(100% - ' + baTable.form.labelWidth! / 1.8 + 'px)'">
                <el-button @click="baTable.toggleForm()">{{ t('Cancel') }}</el-button>
                <el-button v-blur :loading="baTable.form.submitLoading" @click="baTable.onSubmit(formRef)" type="primary">
                    {{ baTable.form.operateIds && baTable.form.operateIds.length > 1 ? t('Save and edit next item') : t('Save') }}
                </el-button>
            </div>
        </template>
    </el-dialog>
</template>

<script setup lang="ts">
import type { FormItemRule } from 'element-plus'
import { inject, reactive, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import FormItem from '/@/components/formItem/index.vue'
import { useConfig } from '/@/stores/config'
import type baTableClass from '/@/utils/baTable'

const config = useConfig()
const formRef = useTemplateRef('formRef')
const baTable = inject('baTable') as baTableClass
const { t } = useI18n()
const rules: Partial<Record<string, FormItemRule[]>> = reactive({})
</script>

<style scoped lang="scss"></style>
