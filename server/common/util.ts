import { createHash, createHmac, randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { tokenConfig } from '../load-env';

export class ApiError extends Error {
    constructor(
        message: string,
        public code = 0,
        public data: unknown = null,
    ) {
        super(message);
    }
}

export class RawBody {
    constructor(
        public body: Buffer | string,
        public contentType: string,
        public status = 200,
    ) {}
}

export class SseStream {
    constructor(public run: (write: (chunk: string) => void, signal: AbortSignal) => Promise<void>) {}
}

export function now(): number {
    return Math.floor(Date.now() / 1000);
}

export function md5(value: string): string {
    return createHash('md5').update(value).digest('hex');
}

export function uuid(): string {
    return randomUUID();
}

export function encryptToken(token: string): string {
    return createHmac(tokenConfig.algo, tokenConfig.key).update(token).digest('hex');
}

export function hashPassword(password: string): string {
    return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string, salt = ''): boolean {
    if (!hash) return false;
    if (hash.startsWith('$') || hash.startsWith('$2')) {
        const normalized = hash.startsWith('$2y$') ? `$2a$${hash.slice(4)}` : hash;
        try {
            return bcrypt.compareSync(password, normalized);
        } catch {
            return false;
        }
    }
    return md5(md5(password) + salt) === hash;
}

export function insertedId(created: unknown): number {
    if (Array.isArray(created)) return Number(created[0] || 0);
    if (created && typeof created === 'object' && 'id' in created) return Number((created as { id?: unknown }).id || 0);
    return Number(created || 0);
}

export function qi(name: string): string {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw new ApiError('字段名不合法');
    }
    return `\`${name}\``;
}

export function camelToSnake(value: string): string {
    return value.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`).replace(/^_/, '');
}

export function snakeToCamel(value: string): string {
    return value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

export function normalizeValue(value: unknown): unknown {
    if (typeof value === 'bigint') {
        const asNumber = Number(value);
        return Number.isSafeInteger(asNumber) ? asNumber : value.toString();
    }
    if (value instanceof Date) return Math.floor(value.getTime() / 1000);
    if (Buffer.isBuffer(value)) return value.toString('utf8');
    if (typeof value === 'string' && /^-?\d+$/.test(value)) {
        const asNumber = Number(value);
        if (Number.isSafeInteger(asNumber)) return asNumber;
    }
    return value;
}

export function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
    const source = typeof (row as { $toJson?: unknown }).$toJson === 'function' ? (row as { $toJson: () => Record<string, unknown> }).$toJson() : row;
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
        next[key] = normalizeValue(value);
    }
    return next;
}

export function asArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null || value === '') return [];
    if (typeof value === 'object') return Object.values(value as Record<string, unknown>);
    return String(value).split(',').filter((item) => item !== '');
}

export function truthy(value: unknown): boolean {
    if (value === undefined || value === null || value === '' || value === false || value === 0) return false;
    const text = String(value).toLowerCase();
    return text !== '0' && text !== 'false';
}

export function assembleChild(rows: Record<string, unknown>[], pid = 'pid', pk = 'id'): Record<string, unknown>[] {
    const list = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
        list.set(String(row[pk]), { ...row });
    }
    const tree: Record<string, unknown>[] = [];
    for (const item of list.values()) {
        const parentId = item[pid] == null || item[pid] === '' ? '0' : String(item[pid]);
        const parent = parentId === '0' ? undefined : list.get(parentId);
        if (parent && String(item[pk]) !== parentId) {
            const children = (parent.children as Record<string, unknown>[]) || [];
            children.push(item);
            parent.children = children;
        } else if (parentId === '0') {
            tree.push(item);
        }
    }
    return tree;
}

export function fileUnitToByte(value: string): number {
    const matched = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]*)$/);
    if (!matched) return Number(value) || 0;
    const size = Number(matched[1]);
    const unit = matched[2].toLowerCase();
    const table: Record<string, number> = { b: 1, k: 1024, kb: 1024, m: 1024 ** 2, mb: 1024 ** 2, g: 1024 ** 3, gb: 1024 ** 3 };
    return Math.floor(size * (table[unit] || 1));
}

export function parseJson(value: unknown): unknown {
    if (typeof value !== 'string' || !value) return value;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

export function langOf(header: unknown): string {
    const value = Array.isArray(header) ? header[0] : header;
    return String(value || 'zh-cn').toLowerCase();
}

const messages: Record<string, Record<string, string>> = {
    'zh-cn': {
        loginOk: '登录成功！',
        pleaseLogin: '请先登录！',
        noPermission: '没有权限操作！',
        tokenExpired: 'Token 已过期，请重新登录',
        loginExpired: '登录已过期，请重新登录',
        badPassword: '用户名或密码不正确',
        accountDisabled: '账户已被禁用',
        retryLater: '登录失败次数过多，请一天后再试',
        alreadyLogin: '您已经登录，无需重复登录~',
        added: '添加成功',
        updated: '更新成功',
        deleted: '删除成功',
        notFound: '记录未找到',
        param: '参数错误',
        captcha: '验证码错误',
        noRows: '没有记录被更新',
        noAdd: '没有记录被添加',
        noDel: '没有记录被删除',
        uploaded: '文件上传成功',
        memberOff: '会员中心已关闭',
        notMigrated: '该功能未迁移到 TypeScript 后端',
        aiOff: 'CRUD AI 未配置',
        weighSort: '请先使用 weigh 字段排序后再操作',
        mailOff: '邮件发送服务不可用',
        frequentMail: '邮件发送过于频繁',
        passwordChanged: '密码已修改，请重新登录~',
        dataUpdated: '资料已更新~',
        cacheCleaned: '缓存已清理~',
        noMenu: '无后台菜单，请联系超级管理员！',
        'Remark lang': '从左侧菜单进入功能。当前页在右侧卡片里打开。',
    },
    en: {
        loginOk: 'Login succeeded!',
        pleaseLogin: 'Please login first',
        noPermission: 'You have no permission',
        tokenExpired: 'Token expiration',
        loginExpired: 'Login expired, please login again.',
        badPassword: 'Incorrect user name or password!',
        accountDisabled: 'Account disabled',
        retryLater: 'Please try again after 1 day',
        alreadyLogin: 'You have already logged in. There is no need to log in again~',
        added: 'Added successfully',
        updated: 'Update successful',
        deleted: 'Deleted successfully',
        notFound: 'Record not found',
        param: 'Parameter error',
        captcha: 'Captcha error',
        noRows: 'No rows updated',
        noAdd: 'No rows were added',
        noDel: 'No rows were deleted',
        uploaded: 'File uploaded successfully',
        memberOff: 'Member center disabled',
        notMigrated: 'This feature has not been migrated',
        aiOff: 'CRUD AI is not configured',
        weighSort: 'Please use the weigh field to sort before operating',
        mailOff: 'Mail sending service unavailable',
        frequentMail: 'Frequent email sending',
        passwordChanged: 'Password has been changed, please login again~',
        dataUpdated: 'Data updated successfully~',
        cacheCleaned: 'Cache cleaned~',
        noMenu: 'No background menu, please contact super administrator!',
        'Remark lang': 'Open a feature from the left menu. The current page stays in the card on the right.',
    },
};

export function msg(lang: string, key: string): string {
    const pack = lang.startsWith('en') ? messages.en : messages['zh-cn'];
    return pack[key] || messages['zh-cn'][key] || key;
}
