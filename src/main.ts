import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { loadLang } from '/@/lang/index'
import { registerIcons } from '/@/utils/common'
import ElementPlus from 'element-plus'
import pinia from '/@/stores/index'
import { eventBus } from '/@/utils/eventBus'
import { directives } from '/@/utils/directives'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/display.css'
import 'font-awesome/css/font-awesome.min.css'
import '/@/styles/index.scss'
// modules import mark, Please do not remove.

export async function bootLegacy() {
    const app = createApp(App)
    app.use(pinia)

    // 全局语言包加载
    await loadLang(app)

    app.use(router)
    app.use(ElementPlus)

    // 全局注册
    directives(app) // 指令
    registerIcons(app) // icons
    app.config.globalProperties.eventBus = eventBus

    app.mount('#app')

    // modules start mark, Please do not remove.
}
