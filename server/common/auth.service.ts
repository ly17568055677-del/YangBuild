import { appConfig } from '../load-env';
import { tableName } from './database.service';
import { raw, table } from './model';
import { TokenService } from './token.service';
import { ApiError, hashPassword, insertedId, msg, normalizeRow, now, verifyPassword } from './util';

export interface Actor {
    kind: 'admin' | 'user';
    id: number;
    token: string;
    refreshToken: string;
    row: Record<string, unknown>;
    ruleIds: string[];
    super: boolean;
}

export class AuthService {
    constructor(private readonly tokens: TokenService) {}

    async init(kind: 'admin' | 'user', plain: string, lang: string): Promise<{ actor: Actor | null; expired: boolean }> {
        if (!plain) return { actor: null, expired: false };
        const token = await this.tokens.get(plain);
        if (!token) return { actor: null, expired: false };
        if (this.tokens.expired(token)) return { actor: null, expired: true };
        if (token.type !== kind) return { actor: null, expired: false };
        const name = kind === 'admin' ? 'admin' : 'user';
        const found = await table(name).query().where('id', token.userId).first();
        if (!found) return { actor: null, expired: false };
        const row = normalizeRow(found as unknown as Record<string, unknown>);
        if (String(row.status) !== 'enable') {
            throw new ApiError(msg(lang, 'accountDisabled'));
        }
        const actor = await this.decorate(kind, row, plain, '');
        return { actor, expired: false };
    }

    async login(kind: 'admin' | 'user', username: string, password: string, keep: boolean, ip: string, lang: string): Promise<Actor> {
        const found = await table(kind).query().where('username', username).first();
        if (!found) throw new ApiError(msg(lang, 'badPassword'));
        const row = normalizeRow(found as unknown as Record<string, unknown>);
        if (String(row.status) === 'disable') throw new ApiError(msg(lang, 'accountDisabled'));

        const retry = kind === 'admin' ? appConfig.adminLoginRetry : appConfig.userLoginRetry;
        const lastLogin = Number(row.last_login_time || 0);
        let failures = Number(row.login_failure || 0);
        if (retry && lastLogin && failures > 0 && now() - lastLogin >= 86400) {
            failures = 0;
            await table(kind).query().where('id', row.id).patch({ login_failure: 0 });
        }
        if (retry && failures >= retry) throw new ApiError(msg(lang, 'retryLater'));

        if (!verifyPassword(password, String(row.password || ''), String(row.salt || ''))) {
            await table(kind).query().where('id', row.id).patch({ login_failure: raw('login_failure + 1'), last_login_time: now(), last_login_ip: ip });
            throw new ApiError(msg(lang, 'badPassword'));
        }

        const sso = kind === 'admin' ? appConfig.adminSso : appConfig.userSso;
        if (sso) {
            await this.tokens.clear(kind, Number(row.id));
            await this.tokens.clear(`${kind}-refresh`, Number(row.id));
        }
        const issued = await this.tokens.issue(kind, Number(row.id), keep);
        await table(kind).query().where('id', row.id).patch({ login_failure: 0, last_login_time: now(), last_login_ip: ip });
        row.last_login_time = now();
        row.last_login_ip = ip;
        row.login_failure = 0;
        return this.decorate(kind, row, issued.token, issued.refreshToken);
    }

    async register(username: string, password: string, mobile: string, email: string): Promise<Actor> {
        const exists = await table('user')
            .query()
            .whereRaw("username = ? OR (email <> '' AND email = ?) OR (mobile <> '' AND mobile = ?)", [username, email, mobile])
            .select('id')
            .first();
        if (exists) throw new ApiError('账号、邮箱或手机号已被占用');
        if (!/^[a-zA-Z][a-zA-Z0-9_]{2,15}$/.test(username)) throw new ApiError('用户名格式不正确');
        if (password && !/^(?!.*[&<>"'\n\r]).{6,32}$/.test(password)) throw new ApiError('密码格式不正确');
        const nickname = username.replace(/1[3-9]\d{9}/g, (item) => item.slice(0, 3) + '****' + item.slice(7));
        const created = await table('user').query().insert({
            group_id: 1,
            username,
            nickname,
            email,
            mobile,
            avatar: '',
            gender: 0,
            birthday: null,
            money: 0,
            score: 0,
            last_login_time: null,
            last_login_ip: '',
            login_failure: 0,
            join_ip: '',
            join_time: now(),
            motto: '',
            password: hashPassword(password),
            salt: '',
            status: 'enable',
            update_time: now(),
            create_time: now(),
        });
        const inserted = insertedId(created);
        const issued = await this.tokens.issue('user', inserted, false);
        const saved = await table('user').query().where('id', inserted).first();
        return this.decorate('user', normalizeRow(saved as unknown as Record<string, unknown>), issued.token, issued.refreshToken);
    }

    info(actor: Actor, fields: string[]): Record<string, unknown> {
        const data: Record<string, unknown> = {};
        for (const field of fields) data[field] = actor.row[field] ?? '';
        data.token = actor.token;
        data.refresh_token = actor.refreshToken;
        return data;
    }

    async ruleIds(kind: 'admin' | 'user', id: number): Promise<string[]> {
        if (kind === 'admin') {
            const groups = await table('admin_group_access')
                .query()
                .alias('aga')
                .leftJoin(`${tableName('admin_group')} as ag`, 'ag.id', 'aga.group_id')
                .where('aga.uid', id)
                .where('ag.status', 1)
                .select('ag.rules');
            return uniqueRules(groups.map((item) => String(item.rules || '')));
        }
        const groups = await table('user')
            .query()
            .alias('u')
            .leftJoin(`${tableName('user_group')} as ag`, 'ag.id', 'u.group_id')
            .where('u.id', id)
            .where('ag.status', 1)
            .select('ag.rules');
        return uniqueRules(groups.map((item) => String(item.rules || '')));
    }

    async menus(kind: 'admin' | 'user', actor: Actor): Promise<Record<string, unknown>[]> {
        const ruleTable = kind === 'admin' ? 'admin_rule' : 'user_rule';
        const params: unknown[] = [];
        if (!actor.super) {
            const ids = actor.ruleIds.filter((item) => item !== '*').map((item) => Number(item)).filter((item) => item > 0);
            if (!ids.length) return [];
            params.push(...ids);
        }
        const columns = ['id', 'pid', 'type', 'title', 'name', 'path', 'icon', 'menu_type', 'url', 'component', 'extend'];
        if (kind === 'admin') columns.push('keepalive');
        const query = table(ruleTable).query().where('status', 1).orderByRaw('weigh DESC, id ASC');
        if (params.length) query.whereIn('id', params);
        const rows = await query.select(columns);
        return rows
            .map((row) => {
                const item = normalizeRow(row as unknown as Record<string, unknown>);
                if (item.keepalive) item.keepalive = item.name;
                return item;
            })
            .filter((item) => kind !== 'admin' || !String(item.name || '').toLowerCase().startsWith('modulestore'));
    }

    async allows(actor: Actor, permission: string): Promise<boolean> {
        if (actor.super || actor.ruleIds.includes('*')) return true;
        const ids = actor.ruleIds.map((item) => Number(item)).filter((item) => item > 0);
        if (!ids.length) return false;
        const ruleTable = actor.kind === 'admin' ? 'admin_rule' : 'user_rule';
        const rows = await table(ruleTable).query().where('status', 1).whereIn('id', ids).select('name');
        const target = permission.toLowerCase();
        return rows.some((row) => String(row.name || '').toLowerCase().split('?')[0] === target);
    }

    async childGroupIds(adminId: number): Promise<number[]> {
        const mine = await table('admin_group_access').query().where('uid', adminId).select('group_id');
        const children: number[] = [];
        const walk = async (pid: number) => {
            const rows = await table('admin_group').query().where('pid', pid).where('status', 1).select('id');
            for (const row of rows) {
                const id = Number(row.id);
                children.push(id);
                await walk(id);
            }
        };
        for (const row of mine) await walk(Number(row.group_id));
        return Array.from(new Set(children));
    }

    async groupAdminIds(groupIds: number[]): Promise<number[]> {
        if (!groupIds.length) return [];
        const rows = await table('admin_group_access').query().whereIn('group_id', groupIds).select('uid');
        return rows.map((row) => Number(row.uid));
    }

    async dataLimitAdminIds(actor: Actor, limit: false | string | number): Promise<number[]> {
        if (!limit || actor.super) return [];
        let adminIds: number[] = [];
        if (limit === 'parent') {
            const groups = await this.childGroupIds(actor.id);
            adminIds = await this.groupAdminIds(groups);
        } else if (typeof limit === 'number' && limit > 0) {
            adminIds = await this.groupAdminIds([limit]);
            return adminIds.includes(actor.id) ? [] : [actor.id];
        } else if (limit === 'allAuth' || limit === 'allAuthAndOthers') {
            const groups = await table('admin_group').query().where('status', 1).select('id', 'rules');
            const owned = new Set(actor.ruleIds);
            const matched: number[] = [];
            for (const group of groups) {
                const rules = String(group.rules || '');
                if (rules === '*') continue;
                const groupRules = rules.split(',').filter(Boolean);
                if (groupRules.every((item) => owned.has(item))) {
                    const extra = actor.ruleIds.filter((item) => !groupRules.includes(item));
                    if (limit === 'allAuth' || (limit === 'allAuthAndOthers' && extra.length > 0)) matched.push(Number(group.id));
                }
            }
            adminIds = await this.groupAdminIds(matched);
        }
        adminIds.push(actor.id);
        return Array.from(new Set(adminIds));
    }

    private async decorate(kind: 'admin' | 'user', row: Record<string, unknown>, token: string, refreshToken: string): Promise<Actor> {
        const id = Number(row.id);
        const ruleIds = await this.ruleIds(kind, id);
        return {
            kind,
            id,
            token,
            refreshToken,
            row,
            ruleIds,
            super: ruleIds.includes('*'),
        };
    }
}

function uniqueRules(chunks: string[]): string[] {
    const ids: string[] = [];
    for (const chunk of chunks) {
        for (const item of chunk.split(',')) {
            const text = item.trim();
            if (text) ids.push(text);
        }
    }
    return Array.from(new Set(ids));
}

export async function setPassword(name: 'admin' | 'user', id: number, password: string) {
    await table(name).query().where('id', id).patch({ password: hashPassword(password), salt: '' });
}
