import { shutdown } from '../kernel'

export default defineNitroPlugin((nitroApp) => {
    nitroApp.hooks.hook('close', () => {
        void shutdown()
    })
})
