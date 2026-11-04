import mitt from 'mitt'
import type { RouteLocationNormalized } from 'vue-router'

type Events = {
    onTabViewRefresh: RouteLocationNormalized
    onTabViewClose: RouteLocationNormalized
}

export const eventBus = mitt<Events>()
