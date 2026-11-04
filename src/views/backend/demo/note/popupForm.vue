<template>
    <el-dialog
        class="ba-operate-dialog"
        :close-on-click-modal="false"
        :model-value="['Add', 'Edit'].includes(baTable.form.operate!)"
        @close="baTable.toggleForm"
    >
        <template #header>
            <div class="title" v-drag="['.ba-operate-dialog', '.el-dialog__header']" v-zoom="'.ba-operate-dialog'">
                {{ baTable.form.operate ? t(baTable.form.operate) : '' }}
            </div>
        </template>
        <el-scrollbar v-loading="baTable.form.loading" class="ba-table-form-scrollbar">
            <div
                class="ba-operate-form"
                :class="'ba-' + baTable.form.operate + '-form'"
                :style="config.layout.shrink ? '' : 'width: calc(100% - ' + baTable.form.labelWidth! / 2 + 'px)'"
            >
                <el-form
                    v-if="!baTable.form.loading"
                    ref="formRef"
                    @submit.prevent=""
                    @keyup.enter="baTable.onSubmit(formRef)"
                    :model="baTable.form.items"
                    :label-position="config.layout.shrink ? 'top' : 'right'"
                    :label-width="baTable.form.labelWidth + 'px'"
                    :rules="rules"
                >
                    <FormItem
                        :label="t('demo.note.title')"
                        type="string"
                        v-model="baTable.form.items!.title"
                        prop="title"
                        :placeholder="t('Please input field', { field: t('demo.note.title') })"
                    />
                    <FormItem
                        :label="t('demo.note.weigh')"
                        type="number"
                        v-model="baTable.form.items!.weigh"
                        prop="weigh"
                        :placeholder="t('Please input field', { field: t('demo.note.weigh') })"
                    />
                    <FormItem
                        :label="t('demo.note.create_time')"
                        type="datetime"
                        v-model="baTable.form.items!.create_time"
                        prop="create_time"
                        :placeholder="t('Please input field', { field: t('demo.note.create_time') })"
                    />
                    <FormItem
                        :label="t('demo.note.update_time')"
                        type="datetime"
                        v-model="baTable.form.items!.update_time"
                        prop="update_time"
                        :placeholder="t('Please input field', { field: t('demo.note.update_time') })"
                    />
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
