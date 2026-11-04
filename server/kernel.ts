import { getQuery, getRequestIP, getRequestURL, readBody, readMultipartFormData, type H3Event } from 'h3'
import type { ServerResponse } from 'http'
import { CrudService } from './admin/crud.service'
import { GeneratorService } from './admin/generator.service'
import { AuthService } from './common/auth.service'
import { CaptchaService } from './common/captcha.service'
import type { UploadFile } from './common/context'
import { DatabaseService } from './common/database.service'
import { nestQuery } from './common/query'
import { TokenService } from './common/token.service'
import { DispatchService } from './dispatch.service'

const holders = globalThis as typeof globalThis & { __rechangeDatabase?: DatabaseService | null }
let starting: Promise<DispatchService> | null = null

export async function shutdown() {
    const current = holders.__rechangeDatabase || null
    holders.__rechangeDatabase = null
    starting = null
    if (current) await current.onModuleDestroy()
}

function kernel(): Promise<DispatchService> {
    if (!starting) {
        starting = Promise.resolve().then(async () => {
            if (holders.__rechangeDatabase) await holders.__rechangeDatabase.onModuleDestroy()
            const database = new DatabaseService()
            holders.__rechangeDatabase = database
            const tokens = new TokenService()
            const auth = new AuthService(tokens)
            const crud = new CrudService(database, auth)
            const captcha = new CaptchaService()
            const generator = new GeneratorService(database)
            const dispatch = new DispatchService(database, auth, tokens, crud, captcha, generator)
            dispatch.onModuleInit()
            return dispatch
        })
    }
    return starting
}

function responseOf(res: ServerResponse) {
    const wrapper = {
        status(code: number) {
            res.statusCode = code
            return wrapper
        },
        type(contentType: string) {
            res.setHeader('Content-Type', contentType)
            return wrapper
        },
        send(body: unknown) {
            if (!res.writableEnded) res.end(body)
        },
        json(data: unknown) {
            if (res.writableEnded) return
            if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(data))
        },
        setHeader(name: string, value: string) {
            res.setHeader(name, value)
        },
        write(chunk: unknown) {
            return res.write(chunk)
        },
        end(chunk?: unknown) {
            if (!res.writableEnded) res.end(chunk)
        },
        flushHeaders() {
            res.flushHeaders()
        },
        on(event: string, listener: () => void) {
            res.on(event, listener)
        },
        get writableEnded() {
            return res.writableEnded
        },
    }
    return wrapper
}

export async function handleLegacy(event: H3Event) {
    const dispatch = await kernel()
    const url = getRequestURL(event)
    const header = event.node.req.headers['content-type'] || ''
    const body: Record<string, unknown> = {}
    const files: UploadFile[] = []
    if (String(header).includes('multipart/form-data')) {
        const parts = (await readMultipartFormData(event)) || []
        for (const part of parts) {
            if (part.filename) {
                files.push({
                    originalname: part.filename,
                    buffer: part.data,
                    size: part.data.length,
                    mimetype: part.type || 'application/octet-stream',
                })
            } else if (part.name) {
                body[part.name] = part.data.toString('utf8')
            }
        }
    } else if (event.method !== 'GET' && event.method !== 'HEAD') {
        const parsed = await readBody(event).catch(() => ({}))
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) Object.assign(body, parsed)
    }
    const req = {
        path: url.pathname,
        method: event.method,
        query: nestQuery(getQuery(event) as Record<string, unknown>),
        body,
        headers: event.node.req.headers,
        ip: getRequestIP(event, { xForwardedFor: true }) || '',
        socket: event.node.req.socket,
        get(name: string) {
            const value = event.node.req.headers[name.toLowerCase()]
            return Array.isArray(value) ? value[0] : value
        },
        files,
        originalUrl: event.node.req.url || url.pathname,
    }
    await dispatch.handle(req, responseOf(event.node.res))
}
