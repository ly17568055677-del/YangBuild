import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { SERVER_ROOT } from '../../load-env'

/**
 * 上传文件的运行时读取入口。
 *
 * Nitro 的 node-server 在启动时就把 publicAssets 目录扫描进内存，运行期间新写入
 * public/storage 的文件不会被当作静态资源返回。这里按请求直接读磁盘，开发、
 * 预览和 `.output` 生产模式都能立刻访问到新上传的文件。
 *
 * 生产环境用 Nginx 的 `alias` 直接指向 public/storage 会更快，这条路由作为
 * 没有反向代理时的兜底。
 */
const MIME_TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.rar': 'application/vnd.rar',
    '.txt': 'text/plain; charset=utf-8',
}

export default defineEventHandler((event) => {
    const raw = getRouterParam(event, 'path') || ''
    let decoded = raw
    try {
        decoded = decodeURIComponent(raw)
    } catch {
        // 非法编码按 404 处理
    }

    const base = join(SERVER_ROOT, 'public', 'storage')
    const relative = normalize(decoded).replace(/^([/\\])+/, '')
    const file = join(base, relative)

    const inside = file === base || file.startsWith(base + sep)
    if (!inside || !relative || relative.includes('\0')) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }
    if (!existsSync(file) || !statSync(file).isFile()) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }

    const stat = statSync(file)
    setHeader(event, 'Content-Type', MIME_TYPES[extname(file).toLowerCase()] || 'application/octet-stream')
    setHeader(event, 'Content-Length', stat.size)
    setHeader(event, 'Cache-Control', 'public, max-age=604800')
    setHeader(event, 'Last-Modified', stat.mtime.toUTCString())
    return sendStream(event, createReadStream(file))
})
