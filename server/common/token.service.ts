import { appConfig } from '../load-env';
import { table } from './model';
import { encryptToken, now, uuid } from './util';

export interface TokenRow {
    token: string;
    type: string;
    userId: number;
    createTime: number;
    expireTime: number;
}

export class TokenService {
    async set(plain: string, type: string, userId: number, keepSeconds: number): Promise<void> {
        const expireTime = keepSeconds > 0 ? now() + keepSeconds : 0;
        await table('token').query().insert({
            token: encryptToken(plain),
            type,
            user_id: userId,
            create_time: now(),
            expire_time: expireTime,
        });
        const current = now();
        await table('token')
            .query()
            .where('expire_time', '>', 0)
            .where('expire_time', '<', current)
            .where('create_time', '<', current - 172800)
            .delete();
    }

    async get(plain: string): Promise<TokenRow | null> {
        if (!plain) return null;
        const row = await table('token').query().where('token', encryptToken(plain)).first();
        if (!row) return null;
        return {
            token: plain,
            type: String(row.type),
            userId: Number(row.user_id),
            createTime: Number(row.create_time || 0),
            expireTime: Number(row.expire_time || 0),
        };
    }

    expired(row: TokenRow): boolean {
        return row.expireTime > 0 && row.expireTime <= now();
    }

    async delete(plain: string): Promise<void> {
        if (!plain) return;
        await table('token').query().where('token', encryptToken(plain)).delete();
    }

    async clear(type: string, userId: number): Promise<void> {
        await table('token').query().where('type', type).where('user_id', userId).delete();
    }

    async check(plain: string, type: string, userId: number): Promise<boolean> {
        const row = await this.get(plain);
        if (!row || this.expired(row)) return false;
        return row.type === type && row.userId === userId;
    }

    async issue(type: 'admin' | 'user', userId: number, keep: boolean): Promise<{ token: string; refreshToken: string }> {
        const token = uuid();
        const keepSeconds = type === 'admin' ? appConfig.adminTokenKeep : appConfig.userTokenKeep;
        await this.set(token, type, userId, keepSeconds);
        let refreshToken = '';
        if (keep) {
            refreshToken = uuid();
            await this.set(refreshToken, `${type}-refresh`, userId, appConfig.refreshTokenKeep);
        }
        return { token, refreshToken };
    }
}
