import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { svgBuilder } from './src/components/icon/svg/index'
import { customHotUpdate } from './src/utils/vite'

const srcDir = fileURLToPath(new URL('./src', import.meta.url))
const assetsDir = fileURLToPath(new URL('./src/assets', import.meta.url))

export default defineNuxtConfig({
    compatibilityDate: '2026-10-14',
    ssr: false,
    devtools: { enabled: false },
    devServer: {
        port: 8002,
        host: '127.0.0.1',
    },
    alias: {
        '/@': srcDir,
        assets: assetsDir,
    },
    hooks: {
        'vite:extendConfig'(config) {
            config.plugins ||= []
            config.plugins.push(customHotUpdate())
            const icons = svgBuilder(join(assetsDir, 'icons') + '/')
            if (icons) config.plugins.push(icons)
        },
    },
    app: {
        head: {
            title: 'BuildAdmin',
        },
    },
    vite: {
        resolve: {
            alias: {
                assets: assetsDir,
            },
        },
        define: {
            'import.meta.env.VITE_AXIOS_BASE_URL': JSON.stringify('getCurrentDomain'),
        },
        optimizeDeps: {
            include: [
                '@element-plus/icons-vue',
                '@vueuse/core',
                'axios',
                'echarts',
                'element-plus',
                'element-plus/es/locale/lang/en',
                'element-plus/es/locale/lang/zh-cn',
                'lodash-es',
                'mitt',
                'nprogress',
                'pinia',
                'pinia-plugin-persistedstate',
                'vue-i18n',
            ],
        },
    },
})
