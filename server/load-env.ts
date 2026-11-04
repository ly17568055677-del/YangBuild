import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

function climb(start: string): string {
    let dir = start;
    for (let i = 0; i < 8; i++) {
        if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'src'))) return dir;
        const parent = resolve(dir, '..');
        if (parent === dir) break;
        dir = parent;
    }
    return '';
}

function serverRoot(): string {
    const starts = [process.cwd()];
    try {
        starts.push(fileURLToPath(new URL('.', import.meta.url)));
    } catch {
        // 打包后的 import.meta.url 可能无法当成磁盘路径
    }
    for (const start of starts) {
        const found = climb(start);
        if (found) return found;
    }
    return process.cwd();
}

export const SERVER_ROOT = serverRoot();

dotenv.config({ path: join(SERVER_ROOT, '.env') });

export const dbConfig = {
    client: 'sqlite' as const,
    file: process.env.DB_FILE || join(SERVER_ROOT, 'data', 'app.sqlite'),
    database: process.env.DB_DATABASE || 'sqlite',
    prefix: process.env.DB_PREFIX || 'ba_',
};

export const tokenConfig = {
    key: process.env.TOKEN_KEY || 'tcbDgmqLVzuAdNH39o0QnhOisvSCFZ7I',
    algo: process.env.TOKEN_ALGO || 'ripemd160',
};

export const appConfig = {
    port: Number(process.env.PORT || 8001),
    adminTokenKeep: 60 * 60 * 24 * 3,
    userTokenKeep: 60 * 60 * 24 * 3,
    refreshTokenKeep: 60 * 60 * 24 * 30,
    adminLoginRetry: 10,
    userLoginRetry: 10,
    adminLoginCaptcha: true,
    userLoginCaptcha: true,
    adminSso: false,
    userSso: false,
    openMemberCenter: true,
    cors: (process.env.CORS_ORIGIN || 'localhost,127.0.0.1').split(',').map((item) => item.trim()).filter(Boolean),
    apiUrl: process.env.BUILDADMIN_API_URL || 'https://buildadmin.com',
    cdnUrlParams: process.env.CDN_URL_PARAMS || '',
    defaultAvatar: '/static/images/avatar.png',
    npmPackageManager: 'pnpm',
};
