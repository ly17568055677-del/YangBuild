import { dbConfig } from '../load-env';
import { AuthService } from '../common/auth.service';
import { ApiCtx } from '../common/context';
import { DatabaseService, tableName } from '../common/database.service';
import { raw, table } from '../common/model';
import { ruleRemark } from '../common/support';
import { ApiError, asArray, insertedId, msg, normalizeRow, now, parseJson, qi } from '../common/util';
import { buildWhere, mainAlias, orderSql, pageLimit } from './query';
import { CrudResource, LookupField } from './resource';

interface ColumnMeta {
    name: string;
    nullable: boolean;
    hasDefault: boolean;
    auto: boolean;
    type: string;
}

export class CrudService {
    private readonly columns = new Map<string, ColumnMeta[]>();

    constructor(
        private readonly database: DatabaseService,
        private readonly auth: AuthService,
    ) {}

    async list(resource: CrudResource, ctx: ApiCtx) {
        const { sql, params, allowed } = await this.where(resource, ctx);
        const { page, limit } = pageLimit(ctx);
        const alias = mainAlias(resource);
        const query = table(resource.table).query().alias(alias).whereRaw(sql, params).orderByRaw(orderSql(resource, ctx, allowed));
        for (const join of resource.joins || []) query.leftJoin(`${tableName(join.table)} as ${join.as}`, `${join.as}.${join.foreign}`, `${alias}.${join.local}`);
        const pageRows = await query.select(raw(await this.select(resource))).page(page - 1, limit);
        const list = pageRows.results.map((row) => this.present(resource, normalizeRow(row as unknown as Record<string, unknown>)));
        await this.decorate(resource, list);
        if (resource.afterSelect) await resource.afterSelect(list, ctx);
        return {
            list,
            total: pageRows.total,
            remark: await this.remark(resource.key),
        };
    }

    async find(resource: CrudResource, ctx: ApiCtx, id: unknown) {
        const pk = resource.pk || 'id';
        const alias = mainAlias(resource);
        const query = table(resource.table).query().alias(alias);
        for (const join of resource.joins || []) query.leftJoin(`${tableName(join.table)} as ${join.as}`, `${join.as}.${join.foreign}`, `${alias}.${join.local}`);
        const found = await query.where(`${alias}.${pk}`, id).select(raw(await this.select(resource))).first();
        if (!found) throw new ApiError(msg(ctx.lang, 'notFound'));
        const row = this.present(resource, normalizeRow(found as unknown as Record<string, unknown>));
        await this.decorate(resource, [row]);
        const limitIds = await this.limitIds(resource, ctx);
        if (limitIds.length && resource.dataLimitField && !limitIds.includes(Number(row[resource.dataLimitField]))) {
            throw new ApiError(msg(ctx.lang, 'noPermission'), 401);
        }
        if (resource.afterFind) await resource.afterFind(row, ctx);
        return row;
    }

    async create(resource: CrudResource, ctx: ApiCtx, extra: Record<string, unknown> = {}) {
        const data = await this.writable(resource, { ...ctx.body, ...extra }, false);
        if (resource.dataLimit && resource.dataLimitFieldAutoFill !== false && resource.dataLimitField && ctx.admin) {
            data[resource.dataLimitField] = ctx.admin.id;
        }
        await this.applyMoneyScore(resource, data);
        if (!Object.keys(data).length) throw new ApiError(msg(ctx.lang, 'param'));
        const created = await table(resource.table).query().insert(data);
        const id = insertedId(created);
        if (resource.table !== 'user_money_log' && resource.table !== 'user_score_log') {
            const columns = await this.columnSet(resource.table);
            if (columns.has('weigh')) {
                const current = await table(resource.table).query().where(resource.pk || 'id', id).select('weigh').first();
                if (!Number(current?.weigh || 0)) {
                    await table(resource.table).query().where(resource.pk || 'id', id).patch({ weigh: id });
                }
            }
        }
        return id;
    }

    async update(resource: CrudResource, ctx: ApiCtx, id: unknown, extra: Record<string, unknown> = {}) {
        await this.find(resource, ctx, id);
        await this.sensitive(resource, ctx, id);
        const data = await this.writable(resource, { ...ctx.body, ...extra }, true);
        delete data[resource.pk || 'id'];
        if (!Object.keys(data).length) return;
        await table(resource.table).query().where(resource.pk || 'id', id).patch(data);
    }

    async remove(resource: CrudResource, ctx: ApiCtx, ids: unknown[]) {
        if (resource.blockDelete) throw new ApiError(msg(ctx.lang, 'noDel'));
        if (!ids.length) throw new ApiError(msg(ctx.lang, 'noDel'));
        const limitIds = await this.limitIds(resource, ctx);
        const scoped = () => {
            const query = table(resource.table).query().whereIn(resource.pk || 'id', ids);
            if (limitIds.length && resource.dataLimitField) query.whereIn(resource.dataLimitField, limitIds);
            return query;
        };
        const rows = await scoped().select();
        if (!rows.length) throw new ApiError(msg(ctx.lang, 'noDel'));
        await this.recycle(resource, ctx, rows.map((row) => normalizeRow(row as unknown as Record<string, unknown>)));
        const affected = await scoped().delete();
        if (resource.table === 'attachment') {
            for (const row of rows) await this.removeFile(String(row.url || ''));
        }
        if (!affected) throw new ApiError(msg(ctx.lang, 'noDel'));
        return affected;
    }

    async sort(resource: CrudResource, ctx: ApiCtx) {
        const pk = resource.pk || 'id';
        const weighField = resource.weighField || 'weigh';
        const move = ctx.input('move');
        const target = ctx.input('target');
        const direction = String(ctx.input('direction') || '');
        const order = String(ctx.input('order') || resource.defaultSort || '');
        if (!order.split(',')[0] || order.split(',')[0] !== weighField) throw new ApiError(msg(ctx.lang, 'weighSort'));
        const rows = await table(resource.table).query().whereIn(pk, [move, target]);
        const moveRow = rows.find((row) => String(row[pk]) === String(move));
        const targetRow = rows.find((row) => String(row[pk]) === String(target));
        if (!moveRow || !targetRow || move === target || !direction) throw new ApiError(msg(ctx.lang, 'notFound'));
        const desc = order.split(',')[1] !== 'asc';
        const updateMethod = desc ? (direction === 'up' ? 'dec' : 'inc') : direction === 'up' ? 'inc' : 'dec';
        const weigh = Number(targetRow[weighField] || 0);
        const same = await table(resource.table).query().where(weighField, weigh).orderBy(pk, 'asc').select(pk);
        const count = same.length || 1;
        const cmp = updateMethod === 'dec' ? '<' : '>';
        const delta = updateMethod === 'dec' ? -count : count;
        await table(resource.table).query().where(weighField, cmp, weigh).where(pk, '<>', move).patch({ [weighField]: raw('?? + ?', [weighField, delta]) });
        const ordered = direction === 'down' ? [...same].reverse() : same;
        let moveComplete = 0;
        for (let index = 0; index < ordered.length; index++) {
            const item = ordered[index];
            if (String(item[pk]) === String(move)) continue;
            let rowWeigh = updateMethod === 'dec' ? weigh - index : weigh + index;
            if (String(item[pk]) === String(target)) {
                moveComplete = 1;
                await table(resource.table).query().where(pk, move).patch({ [weighField]: rowWeigh });
            }
            rowWeigh = updateMethod === 'dec' ? rowWeigh - moveComplete : rowWeigh + moveComplete;
            await table(resource.table).query().where(pk, item[pk]).patch({ [weighField]: rowWeigh });
        }
    }

    forget(table: string) {
        this.columns.delete(this.database.table(table));
    }

    async columnSet(table: string): Promise<Set<string>> {
        const meta = await this.columnMeta(table);
        return new Set(meta.map((item) => item.name));
    }

    private async columnMeta(table: string): Promise<ColumnMeta[]> {
        const full = this.database.table(table);
        const cached = this.columns.get(full);
        if (cached) return cached;
        const rows = await this.database.query(
            `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, DATA_TYPE, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
            [dbConfig.database, full],
        );
        const meta = rows.map((row) => ({
            name: String(row.COLUMN_NAME),
            nullable: String(row.IS_NULLABLE) === 'YES',
            hasDefault: row.COLUMN_DEFAULT !== null && row.COLUMN_DEFAULT !== undefined,
            auto: String(row.EXTRA || '').toLowerCase().includes('auto_increment'),
            type: String(row.DATA_TYPE || ''),
        }));
        this.columns.set(full, meta);
        return meta;
    }

    async primaryKey(table: string): Promise<string> {
        const rows = await this.database.query(
            `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_KEY = 'PRI' LIMIT 1`,
            [dbConfig.database, this.database.table(table)],
        );
        return String(rows[0]?.COLUMN_NAME || 'id');
    }

    private async where(resource: CrudResource, ctx: ApiCtx) {
        const allowed = await this.allowed(resource);
        const limitIds = await this.limitIds(resource, ctx);
        const clauses = buildWhere(resource, ctx, allowed, limitIds);
        const sql = clauses.length ? clauses.map((item) => `(${item.sql})`).join(' AND ') : '1=1';
        const params = clauses.flatMap((item) => item.params);
        return { sql, params, allowed };
    }

    private async allowed(resource: CrudResource): Promise<Set<string>> {
        const alias = mainAlias(resource);
        const columns = await this.columnSet(resource.table);
        const names = new Set<string>();
        for (const column of columns) names.add(`${alias}.${column}`);
        for (const join of resource.joins || []) {
            const joined = await this.columnSet(join.table);
            for (const column of joined) names.add(`${join.as}.${column}`);
        }
        return names;
    }

    private async select(resource: CrudResource): Promise<string> {
        const alias = mainAlias(resource);
        const parts = [`${qi(alias)}.*`];
        for (const join of resource.joins || []) {
            const columns = await this.columnSet(join.table);
            const fields = (join.fields || ['id', 'username', 'nickname', 'name', 'title', 'avatar']).filter((field) => columns.has(field));
            for (const field of fields) {
                parts.push(`${qi(join.as)}.${qi(field)} AS ${qi(`${join.nest}__${field}`)}`);
            }
        }
        return parts.join(', ');
    }

    private async decorate(resource: CrudResource, rows: Record<string, unknown>[]) {
        for (const field of resource.yearFields || []) {
            for (const row of rows) {
                const value = row[field];
                if (value === null || value === undefined || value === '') continue;
                const matched = String(value).match(/^(-?\d+)(?:\.0+)?$/);
                if (matched) row[field] = matched[1];
            }
        }
        for (const lookup of resource.lookupFields || []) {
            if (!this.lookupSafe(lookup)) continue;
            const ids = new Set<string>();
            for (const row of rows) for (const id of asArray(row[lookup.field])) if (String(id) !== '') ids.add(String(id));
            const names = new Map<string, string>();
            if (ids.size) {
                const found = await table(lookup.table).query().whereIn(lookup.pk, [...ids]).select(lookup.pk, lookup.label);
                for (const item of found) names.set(String(item[lookup.pk]), String(item[lookup.label] ?? ''));
            }
            for (const row of rows) {
                row[lookup.text] = asArray(row[lookup.field])
                    .map((id) => names.get(String(id)) || String(id))
                    .filter((item) => item !== '')
                    .join('、');
            }
        }
        const cityFields = (resource.cityFields || []).filter((field) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(field));
        if (cityFields.length) {
            const ids = new Set<string>();
            for (const row of rows) for (const field of cityFields) for (const id of asArray(row[field])) if (String(id) !== '') ids.add(String(id));
            const names = new Map<string, string>();
            if (ids.size) {
                const found = await table('area').query().whereIn('id', [...ids]).select('id', 'name');
                for (const item of found) names.set(String(item.id), String(item.name ?? ''));
            }
            for (const row of rows) {
                for (const field of cityFields) {
                    row[`${field}_text`] = asArray(row[field])
                        .map((id) => names.get(String(id)) || String(id))
                        .filter((item) => item !== '')
                        .join(' / ');
                }
            }
        }
    }

    private lookupSafe(lookup: LookupField): boolean {
        return [lookup.field, lookup.table, lookup.pk, lookup.label, lookup.text].every((item) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(item));
    }

    private present(resource: CrudResource, row: Record<string, unknown>): Record<string, unknown> {
        const nested: Record<string, Record<string, unknown>> = {};
        for (const [key, value] of Object.entries(row)) {
            const mark = key.indexOf('__');
            if (mark < 0) continue;
            const nest = key.slice(0, mark);
            const field = key.slice(mark + 2);
            nested[nest] = nested[nest] || {};
            nested[nest][field] = value;
            delete row[key];
        }
        Object.assign(row, nested);
        for (const field of resource.jsonFields || []) {
            if (field in row) row[field] = parseJson(row[field]);
        }
        for (const field of resource.arrayFields || []) {
            if (!(field in row) || Array.isArray(row[field])) continue;
            const text = row[field] === undefined || row[field] === null ? '' : String(row[field]);
            row[field] = text === '' ? [] : text.split(',');
        }
        for (const field of resource.centsFields || []) {
            if (row[field] !== undefined && row[field] !== null && row[field] !== '') {
                row[field] = (Number(row[field]) / 100).toFixed(2);
            }
        }
        for (const field of resource.hiddenFields || []) delete row[field];
        return row;
    }

    private async writable(resource: CrudResource, source: Record<string, unknown>, editing: boolean): Promise<Record<string, unknown>> {
        const columns = await this.columnSet(resource.table);
        const exclude = new Set(resource.preExcludeFields || []);
        const data: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(source)) {
            if (!columns.has(key) || exclude.has(key)) continue;
            if (key === (resource.pk || 'id') && !editing) continue;
            data[key] = value;
        }
        const jsonFields = new Set(resource.jsonFields || []);
        for (const field of jsonFields) {
            if (field in data && typeof data[field] !== 'string') data[field] = JSON.stringify(data[field] ?? '');
        }
        for (const [key, value] of Object.entries(data)) {
            if (Array.isArray(value) && !jsonFields.has(key)) data[key] = value.join(',');
        }
        for (const field of resource.yearFields || []) {
            if (!(field in data) || data[field] === '' || data[field] === null || data[field] === undefined) continue;
            const matched = String(data[field]).match(/^(-?\d+)(?:\.0+)?$/);
            if (matched) data[field] = matched[1];
        }
        for (const field of resource.centsFields || []) {
            if (field in data && data[field] !== '' && data[field] !== null && data[field] !== undefined) {
                data[field] = Math.round(Number(data[field]) * 100);
            }
        }
        const stamp = resource.timestamps ?? { create: columns.has('create_time'), update: columns.has('update_time') };
        if (!editing && stamp.create && columns.has('create_time') && data.create_time === undefined) data.create_time = now();
        if (stamp.update && columns.has('update_time')) data.update_time = now();
        if (!editing) await this.requireFields(resource, data, exclude, stamp);
        return data;
    }

    private async requireFields(
        resource: CrudResource,
        data: Record<string, unknown>,
        exclude: Set<string>,
        stamp: { create: boolean; update: boolean },
    ) {
        const meta = await this.columnMeta(resource.table);
        const pk = resource.pk || 'id';
        for (const column of meta) {
            if (this.optionalColumn(resource, column, exclude, stamp, pk)) continue;
            if (column.hasDefault) continue;
            if (blank(data[column.name])) throw new ApiError(`请填写 ${column.name}`);
        }
    }

    private optionalColumn(resource: CrudResource, column: ColumnMeta, exclude: Set<string>, stamp: { create: boolean; update: boolean }, pk: string) {
        if (column.auto || column.nullable || exclude.has(column.name) || column.name === pk) return true;
        if (column.name === resource.dataLimitField && resource.dataLimit && resource.dataLimitFieldAutoFill !== false) return true;
        if (column.name === 'create_time' && stamp.create) return true;
        if (column.name === 'update_time' && stamp.update) return true;
        return false;
    }

    private async limitIds(resource: CrudResource, ctx: ApiCtx): Promise<number[]> {
        if (!resource.dataLimit || !ctx.admin || ctx.admin.super) return [];
        if (resource.dataLimit === 'personal') return [ctx.admin.id];
        return this.auth.dataLimitAdminIds(ctx.admin, resource.dataLimit);
    }

    private async remark(key: string): Promise<string> {
        return ruleRemark(key);
    }

    private async applyMoneyScore(resource: CrudResource, data: Record<string, unknown>) {
        if (resource.table !== 'user_money_log' && resource.table !== 'user_score_log') return;
        const field = resource.table === 'user_money_log' ? 'money' : 'score';
        if (!data.memo) throw new ApiError('变更备注不能为空');
        const user = await table('user').query().where('id', data.user_id).select('id', 'money', 'score').first();
        if (!user) throw new ApiError('找不到该会员');
        const before = Number(user[field] || 0);
        const delta = Number(data[field] || 0);
        const after = before + delta;
        data.before = before;
        data.after = after;
        await table('user').query().where('id', data.user_id).patch({ [field]: after });
    }

    private async recycle(resource: CrudResource, ctx: ApiCtx, rows: Record<string, unknown>[]) {
        const rule = await table('security_data_recycle').query().where('status', 1).where('controller_as', resource.key).first();
        if (!rule) return;
        for (const row of rows) {
            await table('security_data_recycle_log').query().insert({
                admin_id: ctx.admin?.id || 0,
                recycle_id: rule.id,
                data: JSON.stringify(row),
                connection: rule.connection || 'sqlite',
                data_table: rule.data_table,
                primary_key: rule.primary_key,
                ip: ctx.ip,
                useragent: ctx.userAgent,
                create_time: now(),
            });
        }
    }

    private async sensitive(resource: CrudResource, ctx: ApiCtx, id: unknown) {
        const rule = await table('security_sensitive_data').query().where('status', 1).where('controller_as', resource.key).first();
        if (!rule) return;
        const fields = parseJson(rule.data_fields);
        if (!fields || typeof fields !== 'object') return;
        const current = await table(String(rule.data_table)).query().where(String(rule.primary_key), id).first();
        if (!current) return;
        for (const [field, title] of Object.entries(fields as Record<string, string>)) {
            if (!(field in ctx.body)) continue;
            let after = ctx.body[field];
            const before = current[field];
            if (String(before ?? '') === String(after ?? '')) continue;
            if (field.toLowerCase().includes('password')) {
                if (!after) continue;
                after = '******';
            }
            await table('security_sensitive_data_log').query().insert({
                admin_id: ctx.admin?.id || 0,
                sensitive_id: rule.id,
                connection: rule.connection || 'sqlite',
                data_table: rule.data_table,
                primary_key: rule.primary_key,
                data_field: field,
                data_comment: title,
                id_value: id,
                before: before === undefined || before === null ? '' : String(before),
                after: after === undefined || after === null ? '' : String(after),
                ip: ctx.ip,
                useragent: ctx.userAgent,
                create_time: now(),
            });
        }
    }

    private async removeFile(url: string) {
        if (!url || url.includes('..')) return;
        const { existsSync, unlinkSync } = await import('fs');
        const { join } = await import('path');
        const { SERVER_ROOT } = await import('../load-env');
        const relative = url.replace(/^\/+/, '');
        const full = join(SERVER_ROOT, 'public', relative);
        if (existsSync(full)) unlinkSync(full);
    }
}

function blank(value: unknown) {
    return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}
