import { Actor } from './auth.service';
import { asArray, langOf } from './util';

export interface UploadFile {
    originalname: string;
    buffer: Buffer;
    size: number;
    mimetype: string;
}

interface Incoming {
    query: Record<string, unknown>;
    body: Record<string, unknown>;
    ip?: string;
    socket?: { remoteAddress?: string };
    headers: Record<string, string | string[] | undefined>;
    method?: string;
    get?(name: string): string | undefined;
    files?: UploadFile[];
}

export interface ApiCtx {
    app: 'admin' | 'api';
    controllerPath: string;
    action: string;
    method: string;
    query: Record<string, unknown>;
    body: Record<string, unknown>;
    ip: string;
    userAgent: string;
    lang: string;
    host: string;
    files: UploadFile[];
    admin: Actor | null;
    user: Actor | null;
    input(key: string): unknown;
    ids(): unknown[];
}

export function buildCtx(req: Incoming, route: { app: 'admin' | 'api'; controllerPath: string; action: string }): ApiCtx {
    const query = (req.query || {}) as Record<string, unknown>;
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const ctx: ApiCtx = {
        ...route,
        method: String(req.method || 'GET').toUpperCase(),
        query,
        body,
        ip: req.ip || req.socket.remoteAddress || '',
        userAgent: String(req.headers['user-agent'] || '').slice(0, 255),
        lang: langOf(req.headers['think-lang']),
        host: req.get('host') || 'localhost',
        files: req.files || [],
        admin: null,
        user: null,
        input(key: string) {
            if (Object.prototype.hasOwnProperty.call(body, key)) return body[key];
            return query[key];
        },
        ids() {
            return asArray(this.input('ids'));
        },
    };
    return ctx;
}

export function headerToken(req: Incoming, names: string[]): string {
    const headers = req.headers;
    for (const name of names) {
        const value = headers[name.toLowerCase()];
        if (typeof value === 'string' && value) return value;
    }
    const query = req.query as Record<string, unknown>;
    for (const name of names) {
        const value = query[name] ?? query[name.replace(/-/g, '_')];
        if (typeof value === 'string' && value) return value;
    }
    return '';
}

export function parseRoute(path: string): { app: 'admin' | 'api'; controllerPath: string; action: string } | null {
    const clean = path.split('?')[0].replace(/\/+$/, '');
    const parts = clean.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const app = parts[0].toLowerCase();
    if (app !== 'admin' && app !== 'api') return null;
    const action = parts[parts.length - 1];
    const controller = parts.slice(1, -1).join('/').replace(/\./g, '/').toLowerCase();
    if (!controller || !action) return null;
    return { app, controllerPath: controller, action: action.toLowerCase() };
}
