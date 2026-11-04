<template>
    <div class="ba-editor" :style="style">
        <Toolbar :editor="editorRef" :defaultConfig="toolbarConfig" :mode="mode" />
        <Editor
            v-model="html"
            :defaultConfig="mergedEditorConfig"
            :mode="mode"
            :style="contentStyle"
            @onCreated="handleCreated"
        />
    </div>
</template>

<script setup lang="ts">
import '@wangeditor/editor/dist/css/style.css'
import type { IDomEditor, IEditorConfig, IToolbarConfig } from '@wangeditor/editor'
import { Editor, Toolbar } from '@wangeditor/editor-for-vue'
import type { CSSProperties } from 'vue'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { fileUpload } from '/@/api/common'
import { fullUrl } from '/@/utils/common'
import { uuid } from '/@/utils/random'

interface Props {
    modelValue?: string | null
    height?: string
    mode?: 'default' | 'simple'
    toolbarConfig?: Partial<IToolbarConfig>
    editorConfig?: Partial<IEditorConfig>
    editorStyle?: CSSProperties
    style?: CSSProperties
    placeholder?: string
    disabled?: boolean
    fileForceLocal?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    modelValue: '',
    height: '320px',
    mode: 'default',
    toolbarConfig: () => ({}),
    editorConfig: () => ({}),
    editorStyle: () => ({}),
    style: () => ({}),
    placeholder: '',
    disabled: false,
    fileForceLocal: false,
})

const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void
}>()

const editorRef = shallowRef<IDomEditor>()
const html = ref('')

const contentStyle = computed<CSSProperties>(() => ({
    height: props.height,
    overflowY: 'hidden',
    ...props.editorStyle,
}))

const insertUploadedFile = async (file: File, insertFn: (url: string, alt: string, href: string) => void) => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fileUpload(fd, { uuid: uuid() }, props.fileForceLocal)
    if (res.code != 1) return
    const url = fullUrl(res.data.file.url)
    insertFn(url, file.name, url)
}

const mergedEditorConfig = computed<Partial<IEditorConfig>>(() => {
    const custom = props.editorConfig || {}
    return {
        placeholder: props.placeholder,
        readOnly: props.disabled,
        ...custom,
        MENU_CONF: {
            uploadImage: {
                customUpload: insertUploadedFile,
            },
            uploadVideo: {
                customUpload: insertUploadedFile,
            },
            ...(custom.MENU_CONF || {}),
        },
    }
})

watch(
    () => props.modelValue,
    (value) => {
        const next = value == null ? '' : String(value)
        if (next !== html.value) html.value = next
    },
    { immediate: true }
)

watch(html, (value) => {
    const current = props.modelValue == null ? '' : String(props.modelValue)
    if (value !== current) emit('update:modelValue', value)
})

const handleCreated = (editor: IDomEditor) => {
    editorRef.value = editor
}

onBeforeUnmount(() => {
    editorRef.value?.destroy()
})
</script>

<style scoped lang="scss">
.ba-editor {
    width: 100%;
    border: 1px solid var(--el-border-color);
    line-height: normal;

    &.w-e-full-screen-container {
        z-index: 9999;
    }
}

html.dark .ba-editor {
    --w-e-textarea-bg-color: var(--ba-bg-color);
    --w-e-textarea-color: var(--el-text-color-primary);
    --w-e-textarea-border-color: var(--el-border-color);
    --w-e-textarea-slight-border-color: var(--el-border-color-lighter);
    --w-e-textarea-slight-color: var(--el-text-color-regular);
    --w-e-textarea-slight-bg-color: var(--el-fill-color-light);
    --w-e-toolbar-color: var(--el-text-color-primary);
    --w-e-toolbar-bg-color: var(--ba-bg-color-overlay);
    --w-e-toolbar-active-color: var(--el-text-color-primary);
    --w-e-toolbar-active-bg-color: var(--el-fill-color);
    --w-e-toolbar-border-color: var(--el-border-color);
}
</style>
