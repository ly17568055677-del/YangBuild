import { ApiCtx } from '../common/context';
import { ApiError, camelToSnake, qi, truthy } from '../common/util';
import { CrudResource } from './resource';

export interface Clause {
    sql: string;
    params: unknown[];
}

const aliases: Record<string, string> = {
    ne: '<>',
    eq: '=',
    gt: '>',
    egt: '>=',
    lt: '<',
    elt: '<=',
};

export function mainAlias(resource: CrudResource): string {
    return resource.alias || resource.table;
}

export function resolveField(field: string, alias: string): { alias: string; column: string } {
    if (!field.includes('.')) return { alias, column: field };
    const parts = field.split('.');
    const column = parts.pop() || '';
    const owner = parts.map((item) => camelToSnake(item)).join('_');
    return { alias: owner || alias, column };
}

export function buildWhere(resource: CrudResource, ctx: ApiCtx, allowed: Set<string>, limitIds: number[]): Clause[] {
    const alias = mainAlias(resource);
    const pk = resource.pk || 'id';
    const clauses: Clause[] = [];
    const quick = String(ctx.input('quickSearch') || '');
    if (quick) {
        const fields = (resource.quickSearchField?.length ? resource.quickSearchField : [pk]).map((field) => resolveField(field, alias));
        const safe = fields.filter((field) => allowed.has(`${field.alias}.${field.column}`));
        if (safe.length) {
            const like = `%${quick.replace(/[%_\\]/g, '\\$&')}%`;
            clauses.push({
                sql: safe.map((field) => `${qi(field.alias)}.${qi(field.column)} LIKE ?`).join(' OR '),
                params: safe.map(() => like),
            });
        }
    }

    const initValue = ctx.input('initValue');
    if (initValue !== undefined && initValue !== '' && !(Array.isArray(initValue) && initValue.length === 0)) {
        const initKey = String(ctx.input('initKey') || pk);
        const target = resolveField(initKey, alias);
        const operator = String(ctx.input('initOperator') || 'in').toUpperCase();
        const values = Array.isArray(initValue) ? initValue : String(initValue).split(',');
        if (allowed.has(`${target.alias}.${target.column}`)) {
            if (operator === 'IN' || operator === 'NOT IN') {
                clauses.push({
                    sql: `${qi(target.alias)}.${qi(target.column)} ${operator} (${values.map(() => '?').join(',')})`,
                    params: values,
                });
            } else {
                clauses.push({
                    sql: `${qi(target.alias)}.${qi(target.column)} = ?`,
                    params: [initValue],
                });
            }
        }
    }

    const search = ctx.input('search');
    const items = Array.isArray(search) ? search : search && typeof search === 'object' ? Object.values(search) : [];
    for (const item of items as Record<string, unknown>[]) {
        if (!item || item.operator === undefined || !item.field) continue;
        let operator = aliases[String(item.operator)] || String(item.operator);
        if (operator === 'false' || operator === 'FALSE') continue;
        const target = resolveField(String(item.field), alias);
        const qualified = `${target.alias}.${target.column}`;
        if (!allowed.has(qualified)) continue;
        const left = `${qi(target.alias)}.${qi(target.column)}`;
        const val = item.val;
        if (item.render === 'datetime') {
            if (operator === 'RANGE') {
                const parts = String(val ?? '').split(',');
                if (!parts[1]) continue;
                const range = parts.map((part) => toUnix(part)).filter((part) => part > 0);
                if (range.length < 2) continue;
                clauses.push({ sql: `${left} BETWEEN ? AND ?`, params: range });
            } else {
                clauses.push({ sql: `${left} = ?`, params: [toUnix(String(val ?? ''))] });
            }
            continue;
        }
        if (operator === 'RANGE' || operator === 'NOT RANGE') {
            const parts = String(val ?? '').split(',');
            const not = operator === 'NOT RANGE';
            if (parts[0] === '' && parts.length > 1) {
                clauses.push({ sql: `${left} ${not ? '>' : '<='} ?`, params: [parts[1]] });
            } else if (parts[1] === '' || parts.length < 2) {
                clauses.push({ sql: `${left} ${not ? '<' : '>='} ?`, params: [parts[0]] });
            } else {
                clauses.push({ sql: `${left} ${not ? 'NOT BETWEEN' : 'BETWEEN'} ? AND ?`, params: [parts[0], parts[1]] });
            }
            continue;
        }
        switch (operator) {
            case '=':
            case '<>':
                clauses.push({ sql: `${left} ${operator} ?`, params: [String(val ?? '')] });
                break;
            case 'LIKE':
            case 'NOT LIKE':
                clauses.push({ sql: `${left} ${operator} ?`, params: [`%${String(val ?? '').replace(/[%_\\]/g, '\\$&')}%`] });
                break;
            case '>':
            case '>=':
            case '<':
            case '<=':
                clauses.push({ sql: `${left} ${operator} ?`, params: [Number.parseInt(String(val ?? '0'), 10) || 0] });
                break;
            case 'FIND_IN_SET':
                for (const one of Array.isArray(val) ? val : [val]) {
                    clauses.push({ sql: `FIND_IN_SET(?, ${left})`, params: [one] });
                }
                break;
            case 'IN':
            case 'NOT IN': {
                const values = Array.isArray(val) ? val : String(val ?? '').split(',');
                if (!values.length) break;
                clauses.push({ sql: `${left} ${operator} (${values.map(() => '?').join(',')})`, params: values });
                break;
            }
            case 'NULL':
                clauses.push({ sql: `${left} IS NULL`, params: [] });
                break;
            case 'NOT NULL':
                clauses.push({ sql: `${left} IS NOT NULL`, params: [] });
                break;
            default:
                break;
        }
    }

    if (limitIds.length && resource.dataLimitField) {
        clauses.push({
            sql: `${qi(alias)}.${qi(resource.dataLimitField)} IN (${limitIds.map(() => '?').join(',')})`,
            params: limitIds,
        });
    }
    return clauses;
}

export function orderSql(resource: CrudResource, ctx: ApiCtx, allowed: Set<string>): string {
    const alias = mainAlias(resource);
    const pk = resource.pk || 'id';
    const order = parseOrder(ctx.input('order') || resource.defaultSort || {});
    const guarantee = resource.orderGuarantee || { [pk]: 'desc' as const };
    for (const [field, direction] of Object.entries(guarantee)) {
        if (!(field in order)) order[field] = direction;
    }
    const parts: string[] = [];
    for (const [field, direction] of Object.entries(order)) {
        const target = resolveField(field, alias);
        if (!allowed.has(`${target.alias}.${target.column}`)) continue;
        const dir = String(direction).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
        parts.push(`${qi(target.alias)}.${qi(target.column)} ${dir}`);
    }
    if (!parts.length) parts.push(`${qi(alias)}.${qi(pk)} DESC`);
    return parts.join(', ');
}

export function parseOrder(order: unknown): Record<string, 'asc' | 'desc'> {
    if (!order) return {};
    if (typeof order === 'string') {
        const [field, direction] = order.split(',');
        if (!field) return {};
        return { [field]: direction === 'desc' ? 'desc' : 'asc' };
    }
    if (typeof order === 'object') {
        const result: Record<string, 'asc' | 'desc'> = {};
        for (const [field, direction] of Object.entries(order as Record<string, unknown>)) {
            result[field] = String(direction).toLowerCase() === 'desc' ? 'desc' : 'asc';
        }
        return result;
    }
    return {};
}

export function pageLimit(ctx: ApiCtx): { page: number; limit: number } {
    const initValue = ctx.input('initValue');
    const limit = Math.min(Math.max(Number(ctx.input('limit') || 10) || 10, 1), initValue ? 999999 : 200);
    const page = Math.max(Number(ctx.input('page') || 1) || 1, 1);
    return { page, limit };
}

export function assertId(value: unknown): string {
    const text = String(value ?? '');
    if (!text || text === 'undefined') throw new ApiError('记录未找到');
    return text;
}

export function isSelect(ctx: ApiCtx): boolean {
    return truthy(ctx.input('select'));
}

function toUnix(value: string): number {
    if (/^\d+$/.test(value)) return Number(value);
    const time = Date.parse(value.replace(/-/g, '/'));
    return Number.isNaN(time) ? 0 : Math.floor(time / 1000);
}
