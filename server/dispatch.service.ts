import { adminRoutes } from './admin';
import { CrudService } from './admin/crud.service';
import { crudControllers, resolveCrudAction } from './admin/crud.controller';
import { GeneratorService } from './admin/generator.service';
import { loadCrudControllers } from './admin/load-controllers';
import { AuthService } from './common/auth.service';
import { CaptchaService } from './common/captcha.service';
import { buildCtx, headerToken, parseRoute, UploadFile } from './common/context';
import { DatabaseService } from './common/database.service';
import { table } from './common/model';
import { audienceOf, matchRoute, Route } from './common/route';
import { AppServices } from './common/services';
import { TokenService } from './common/token.service';
import { ApiError, msg, now, RawBody, SseStream } from './common/util';
import { memberRoutes } from './member';

function listed(values: string[] | undefined, action: string) {
    return Boolean(values?.includes('*') || values?.includes(action));
}

const routes = [...adminRoutes, ...memberRoutes];

interface ApiRequest {
    path: string;
    method?: string;
    query: Record<string, unknown>;
    body?: Record<string, unknown>;
    headers: Record<string, string | string[] | undefined>;
    ip?: string;
    socket?: { remoteAddress?: string };
    get?(name: string): string | undefined;
    files?: UploadFile[];
    originalUrl?: string;
}

interface ApiResponse {
    status(code: number): ApiResponse;
    type(contentType: string): ApiResponse;
    send(body: unknown): void;
    json(data: unknown): void;
    setHeader(name: string, value: string): void;
    write(chunk: unknown): boolean;
    end(chunk?: unknown): void;
    flushHeaders(): void;
    on(event: string, listener: () => void): void;
    readonly writableEnded: boolean;
}

export class DispatchService {
    private readonly services: AppServices;

    constructor(
        private readonly database: DatabaseService,
        private readonly auth: AuthService,
        private readonly tokens: TokenService,
        private readonly crud: CrudService,
        private readonly captcha: CaptchaService,
        private readonly generator: GeneratorService,
    ) {
        this.services = { database, auth, tokens, crud, captcha, generator };
    }

    onModuleInit() {
        loadCrudControllers();
    }

    async handle(req: ApiRequest, res: ApiResponse): Promise<'sent' | undefined> {
        const route = parseRoute(req.path);
        if (!route) return;
        if (route.controllerPath === 'ajax' && route.action === 'terminal') {
            await this.terminal(req, res);
            return 'sent';
        }
        const ctx = buildCtx(req, route);
        const controller = ctx.app === 'admin' ? crudControllers.get(ctx.controllerPath) : undefined;
        const crudAction = controller ? resolveCrudAction(controller, ctx.action) : null;
        const matched = crudAction ? undefined : matchRoute(routes, ctx.app, ctx.controllerPath, ctx.action);
        try {
            await this.authorize(ctx, req, matched, controller);
            const data = crudAction ? await crudAction(ctx, this.services) : await this.dispatchRoute(ctx, matched);
            if (data instanceof RawBody) {
                res.status(data.status).type(data.contentType).send(data.body);
                return 'sent';
            }
            if (data instanceof SseStream) {
                await writeSse(res, data);
                return 'sent';
            }
            if (typeof data === 'string') res.json({ code: 1, msg: data, time: now(), data: null });
            else res.json({ code: 1, msg: '', time: now(), data: data ?? null });
            if ((ctx.method === 'POST' || ctx.method === 'DELETE') && ctx.admin && ctx.action !== 'login') await this.adminLog(ctx, req);
        } catch (error) {
            if (!(error instanceof ApiError)) console.error(error);
            const api = error instanceof ApiError ? error : new ApiError(publicError(error));
            res.json({ code: api.code, msg: api.message, time: now(), data: api.data });
        }
    }

    private async authorize(
        ctx: ReturnType<typeof buildCtx>,
        req: ApiRequest,
        matched: Route | undefined,
        controller?: { noLogin: string[]; noPermission: string[] },
    ) {
        const audience = audienceOf(matched, ctx.app);
        const noLogin = Boolean(matched?.noLogin) || listed(controller?.noLogin, ctx.action);
        const noPermission = Boolean(matched?.noPermission) || noLogin || listed(controller?.noPermission, ctx.action);
        if (audience === 'none') return;
        const token = headerToken(req, audience === 'admin' ? ['batoken', 'ba-token'] : ['ba-user-token']);
        try {
            const result = await this.auth.init(audience, token, ctx.lang);
            if (result.expired && !noLogin) throw new ApiError(msg(ctx.lang, 'tokenExpired'), 409);
            if (audience === 'admin') ctx.admin = result.actor;
            else ctx.user = result.actor;
        } catch (error) {
            if (error instanceof ApiError && error.code === 409) throw error;
            if (!noLogin) throw error;
        }
        if (!noLogin) {
            const actor = audience === 'admin' ? ctx.admin : ctx.user;
            if (!actor) throw new ApiError(msg(ctx.lang, 'pleaseLogin'), 303, { type: 'need login' });
            if (!noPermission && !(await this.auth.allows(actor, `${ctx.controllerPath}/${ctx.action}`))) {
                throw new ApiError(msg(ctx.lang, 'noPermission'), 401);
            }
        }
    }

    private async dispatchRoute(ctx: ReturnType<typeof buildCtx>, matched: Route | undefined) {
        if (matched) return matched.handle(ctx, this.services);
        throw new ApiError(msg(ctx.lang, 'notMigrated'));
    }

    private async adminLog(ctx: ReturnType<typeof buildCtx>, req: ApiRequest) {
        if (!ctx.admin) return;
        const body = { ...ctx.body };
        for (const key of Object.keys(body)) if (/password/i.test(key)) body[key] = '******';
        await table('admin_log').query().insert({
            admin_id: ctx.admin.id,
            username: ctx.admin.row.username || '',
            url: String(req.originalUrl || '').slice(0, 1500),
            title: ctx.action,
            data: JSON.stringify(body).slice(0, 65000),
            ip: ctx.ip,
            useragent: ctx.userAgent,
            create_time: now(),
        });
    }

    private async terminal(req: ApiRequest, res: ApiResponse) {
        const uuidValue = String(req.query.uuid || '');
        const extend = String(req.query.extend || '');
        const command = String(req.query.command || '');
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
        const send = (data: string) => {
            res.write(`data: ${JSON.stringify({ data, uuid: uuidValue, extend, key: command })}\n\n`);
        };
        send('command-link-success');
        const token = String(req.query.batoken || '');
        const actor = token ? await this.auth.init('admin', token, 'zh-cn') : { actor: null, expired: true };
        if (!actor.actor || command !== 'npx.prettier' || extend.includes('..') || !extend.replace(/\\/g, '/').startsWith('./src/')) {
            send('command-exec-error');
            send('command-exec-completed');
            res.end();
            return;
        }
        send('生成文件已写入，跳过外部格式化');
        send('command-exec-success');
        send('command-exec-completed');
        res.end();
    }
}

async function writeSse(res: ApiResponse, stream: SseStream) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const abort = new AbortController();
    res.on('close', () => abort.abort());
    try {
        await stream.run((chunk) => {
            if (!res.writableEnded) res.write(chunk);
        }, abort.signal);
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            res.end();
            return;
        }
        if (!(error instanceof ApiError)) console.error(error);
        if (!res.writableEnded) {
            const message = error instanceof ApiError ? error.message : 'AI 请求失败';
            res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
        }
    }
    res.end();
}

function publicError(error: unknown): string {
    if (process.env.NODE_ENV === 'production') return '服务器错误';
    if (error instanceof Error && error.message) return error.message;
    return String(error || '服务器错误');
}
