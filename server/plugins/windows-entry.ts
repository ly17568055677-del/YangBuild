import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { buildLocalIconSprite } from '../../src/components/icon/svg/index'
import { SERVER_ROOT } from '../load-env'

const icons = join(SERVER_ROOT, 'src', 'assets', 'icons')
const sprite = buildLocalIconSprite(existsSync(icons) ? `${icons}/` : '')

export default defineNitroPlugin((nitroApp) => {
    nitroApp.hooks.hook('render:response', (response) => {
        if (typeof response.body !== 'string' || !response.body.includes('<html')) return
        let html = response.body.replace(/\/_nuxt\/([A-Za-z]:\/)/g, '/_nuxt/@fs/$1')
        if (sprite && !html.includes('id="local-icon"')) {
            html = html.replace('<body>', `<body>${sprite}`)
        }
        response.body = html
    })
})
