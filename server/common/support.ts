import { existsSync, readFileSync, writeFileSync } from 'fs';
import nodemailer from 'nodemailer';
import { join } from 'path';
import { appConfig, dbConfig, SERVER_ROOT } from '../load-env';
import { Actor, AuthService } from './auth.service';
import { table } from './model';
import { ApiError, fileUnitToByte, msg, normalizeRow, parseJson, truthy } from './util';

export function dbName() {
    return dbConfig.database;
}

export function mask(value: string) {
    if (value.length <= 2) return '****';
    return value.slice(0, 1) + '****' + value.slice(-1);
}

export function decodeConfig(row: Record<string, unknown>): Record<string, unknown> {
    const type = String(row.type || '');
    let value = row.value;
    if (['checkbox', 'array', 'selects'].includes(type)) value = value ? parseJson(value) : [];
    else if (type === 'switch') value = Boolean(Number(value));
    else if (type === 'editor') value = value || '';
    else if (['city', 'remoteSelects'].includes(type)) value = value ? String(value).split(',') : [];
    row.value = value ?? '';
    if (['radio', 'checkbox', 'select', 'selects'].includes(type) && typeof row.content === 'string' && row.content) {
        row.content = parseJson(row.content);
    }
    return row;
}

export async function siteBranding() {
    const siteName = await sysConfig('site_name');
    const siteLogo = await sysConfig('site_logo');
    const siteFavicon = await sysConfig('site_favicon');
    return {
        siteName: siteName ? String(siteName) : '',
        siteLogo: siteLogo ? String(siteLogo) : '',
        siteFavicon: siteFavicon ? String(siteFavicon) : '',
    };
}

export async function sysConfig(name: string): Promise<unknown> {
    const row = await table('config').query().where('name', name).first();
    if (!row) return null;
    return decodeConfig(normalizeRow(row as unknown as Record<string, unknown>)).value;
}

export async function flag(name: string, fallback: boolean): Promise<boolean> {
    const value = await sysConfig(name);
    if (value === null || value === undefined || value === '') return fallback;
    return truthy(value) || value === true;
}

export async function ruleRemark(name: string, lang = 'zh-cn'): Promise<string> {
    const row = await table('admin_rule').query().where('name', name).select('remark').first();
    return msg(lang, String(row?.remark || ''));
}

export function uploadConfig() {
    return {
        maxSize: fileUnitToByte('10mb'),
        saveName: '/storage/{topic}/{year}{mon}{day}/{fileName}{fileSha1}{.suffix}',
        allowedSuffixes: 'jpg,png,bmp,jpeg,gif,webp,zip,rar,wav,mp4,mp3',
        allowedMimeTypes: [],
        mode: 'local',
    };
}

export function userInfo(auth: AuthService, actor: Actor) {
    const data = auth.info(actor, [
        'id',
        'username',
        'nickname',
        'email',
        'mobile',
        'avatar',
        'gender',
        'birthday',
        'money',
        'score',
        'join_time',
        'motto',
        'last_login_time',
        'last_login_ip',
    ]);
    data.money = (Number(data.money || 0) / 100).toFixed(2);
    if (!data.avatar) data.avatar = appConfig.defaultAvatar;
    return data;
}

export async function mailConfig() {
    const rows = await table('config').query().where('group', 'mail').select('name', 'value');
    if (!rows.length) return null;
    const config: Record<string, unknown> = {};
    for (const row of rows) config[String(row.name)] = row.value;
    if (Object.values(config).some((item) => !item)) return null;
    return config;
}

export async function deliver(to: string, subject: string, text: string) {
    const config = await mailConfig();
    if (!config) throw new ApiError(msg('zh-cn', 'mailOff'));
    const transport = nodemailer.createTransport({
        host: String(config.smtp_server),
        port: Number(config.smtp_port || 465),
        secure: String(config.smtp_verification).toUpperCase() === 'SSL',
        auth: { user: String(config.smtp_user), pass: String(config.smtp_pass) },
    });
    await transport.sendMail({ from: String(config.smtp_sender_mail), to, subject, text });
}

export function writeEntrance(previous: string, next: string) {
    if (!previous || previous === next || !/^\/[a-zA-Z0-9]+$/.test(next)) return;
    const file = join(SERVER_ROOT, 'src', 'router', 'static', 'adminBase.ts');
    if (!existsSync(file)) return;
    const content = readFileSync(file, 'utf8').replace(`export const adminBaseRoutePath = '${previous}'`, `export const adminBaseRoutePath = '${next}'`);
    writeFileSync(file, content, 'utf8');
}
