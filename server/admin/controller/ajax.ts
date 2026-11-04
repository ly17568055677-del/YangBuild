import { createHash } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { ApiCtx } from '../../common/context';
import { raw, table } from '../../common/model';
import { AppServices } from '../../common/services';
import { dbName, mask } from '../../common/support';
import { ApiError, asArray, fileUnitToByte, insertedId, msg, normalizeRow, now, RawBody, truthy } from '../../common/util';
import { dbConfig, SERVER_ROOT } from '../../load-env';
import { AdminController } from '../crud.controller';

export default class Ajax extends AdminController {
    noPermission = ['*'];

    constructor() {
        super('ajax');
    }

    async upload(ctx: ApiCtx, _app: AppServices) {
        const file = ctx.files[0];
        if (!file) throw new ApiError('没有文件被上传');
        const driver = String(ctx.input('driver') || 'local');
        if (driver !== 'local') throw new ApiError(msg(ctx.lang, 'notMigrated'));
        const topic = String(ctx.input('topic') || 'default').replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
        const suffix = extname(file.originalname).replace('.', '').toLowerCase();
        const allow = new Set(['jpg', 'png', 'bmp', 'jpeg', 'gif', 'webp', 'zip', 'rar', 'wav', 'mp4', 'mp3']);
        if (!allow.has(suffix)) throw new ApiError('不允许的文件后缀');
        if (file.size > fileUnitToByte('10mb')) throw new ApiError('文件过大');
        const sha1 = createHash('sha1').update(file.buffer).digest('hex');
        const date = new Date();
        const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
        const base = file.originalname.replace(/\.[^.]+$/, '').slice(0, 15).replace(/[^\w.-]+/g, '') || 'file';
        const url = `/storage/${topic}/${stamp}/${base}${sha1}.${suffix}`;
        const full = join(SERVER_ROOT, 'public', url.replace(/^\//, ''));
        mkdirSync(join(full, '..'), { recursive: true });
        const existed = await table('attachment').query().where('sha1', sha1).where('topic', topic).where('storage', 'local').first();
        let row: Record<string, unknown>;
        if (existed && existsSync(join(SERVER_ROOT, 'public', String(existed.url || '').replace(/^\//, '')))) {
            await table('attachment').query().where('id', existed.id).patch({ quote: raw('quote + 1'), last_upload_time: now() });
            row = normalizeRow(existed as unknown as Record<string, unknown>);
            row.quote = Number(row.quote || 0) + 1;
        } else {
            writeFileSync(full, file.buffer);
            const created = await table('attachment').query().insert({
                topic,
                admin_id: ctx.admin?.id || 0,
                user_id: ctx.user?.id || 0,
                url,
                width: 0,
                height: 0,
                name: file.originalname.slice(0, 100),
                size: file.size,
                mimetype: file.mimetype,
                quote: 1,
                storage: 'local',
                sha1,
                create_time: now(),
                last_upload_time: now(),
            });
            const id = insertedId(created);
            row = { id, topic, url, name: file.originalname, size: file.size, mimetype: file.mimetype, storage: 'local', sha1 };
        }
        delete row.create_time;
        delete row.quote;
        return { file: row };
    }

    async area(ctx: ApiCtx, _app: AppServices) {
        let pid = 0;
        let level = 1;
        const province = ctx.input('province');
        const city = ctx.input('city');
        if (province !== undefined && province !== '') {
            pid = Number(province);
            level = 2;
            if (city !== undefined && city !== '') {
                pid = Number(city);
                level = 3;
            }
        }
        return table('area').query().where('pid', pid).where('level', level).select({ value: 'id', label: 'name' });
    }

    buildsuffixsvg(ctx: ApiCtx): RawBody {
        const suffix = String(ctx.input('suffix') || 'file').slice(0, 8);
        const background = String(ctx.input('background') || '#409eff');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="140"><rect width="120" height="140" rx="8" fill="${background.replace(/[^#a-zA-Z0-9]/g, '')}"/><text x="60" y="78" text-anchor="middle" fill="#fff" font-size="20" font-family="sans-serif">${suffix}</text></svg>`;
        return new RawBody(svg, 'image/svg+xml');
    }

    getdatabaseconnectionlist(ctx: ApiCtx) {
        const name = dbName();
        const quick = String(ctx.input('quickSearch') || '');
        const list = [{ type: 'sqlite', database: mask(name), key: 'sqlite' }].filter((item) => !quick || item.key.includes(quick));
        return { list };
    }

    async gettablepk(ctx: ApiCtx, app: AppServices) {
        const name = String(ctx.input('table') || '');
        if (!name) throw new ApiError(msg(ctx.lang, 'param'));
        return { pk: await app.crud.primaryKey(name) };
    }

    async gettablelist(ctx: ApiCtx, app: AppServices) {
        const quick = String(ctx.input('quickSearch') || '');
        const rows = await app.database.query(`SELECT TABLE_NAME, TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`, [dbName()]);
        const exclude = new Set(asArray(ctx.input('excludeTable')).map(String));
        const list = rows
            .filter((row) => String(row.TABLE_NAME).startsWith(dbConfig.prefix))
            .map((row) => ({
                table: String(row.TABLE_NAME).replace(new RegExp(`^${dbConfig.prefix}`), ''),
                comment: `${row.TABLE_NAME}${row.TABLE_COMMENT ? ` - ${row.TABLE_COMMENT}` : ''}`,
                connection: 'sqlite',
                prefix: dbConfig.prefix,
            }))
            .filter((item) => !exclude.has(item.table) && (!quick || item.comment.toLowerCase().includes(quick.toLowerCase())));
        return { list };
    }

    async gettablefieldlist(ctx: ApiCtx, app: AppServices) {
        const name = String(ctx.input('table') || '');
        if (!name) throw new ApiError(msg(ctx.lang, 'param'));
        const full = name.startsWith(dbConfig.prefix) ? name : dbConfig.prefix + name;
        const columns = await app.database.query(
            `SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
            [dbName(), full],
        );
        const clean = ctx.input('clean') === undefined ? true : truthy(ctx.input('clean'));
        const fieldList: Record<string, unknown> = {};
        for (const column of columns) {
            if (clean) fieldList[String(column.COLUMN_NAME)] = String(column.COLUMN_COMMENT || '').split(':')[0];
            else fieldList[String(column.COLUMN_NAME)] = column;
        }
        return { pk: await app.crud.primaryKey(name), fieldList };
    }

    changeterminalconfig(ctx: ApiCtx) {
        throw new ApiError(msg(ctx.lang, 'notMigrated'));
    }

    clearcache(ctx: ApiCtx) {
        return msg(ctx.lang, 'cacheCleaned');
    }
}
