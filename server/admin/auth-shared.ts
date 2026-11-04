import { ApiCtx } from '../common/context';
import { table as db } from '../common/model';
import { AppServices } from '../common/services';
import { ruleRemark } from '../common/support';
import { ApiError, asArray, assembleChild, msg, normalizeRow, now, truthy } from '../common/util';
import { CrudResource } from './resource';

export async function groupSave(ctx: ApiCtx, app: AppServices, resource: CrudResource, ruleTable: string) {
    if (ctx.method !== 'POST' && ctx.action === 'edit') {
        const row = await app.crud.find(resource, ctx, ctx.input('id'));
        const rules = String(row.rules || '');
        if (rules && rules !== '*') {
            const ids = rules.split(',').filter(Boolean);
            const parents = ids.length ? await db(ruleTable).query().whereIn('id', ids).select('pid') : [];
            const parentIds = new Set(parents.map((item) => String(item.pid)));
            row.rules = ids.filter((id) => !parentIds.has(id));
        } else if (rules === '*') row.rules = ['*'];
        else row.rules = [];
        return { row };
    }
    if (ctx.method !== 'POST') throw new ApiError(msg(ctx.lang, 'param'));
    if (Array.isArray(ctx.body.rules)) {
        const all = await db(ruleTable).query().select('id');
        const allIds = all.map((item) => String(item.id));
        const checked = asArray(ctx.body.rules).map(String).filter((id) => allIds.includes(id));
        ctx.body.rules = checked.length === allIds.length ? '*' : checked.join(',');
    }
    if (ctx.action === 'edit') {
        await app.crud.update(resource, ctx, ctx.input('id'));
        return msg(ctx.lang, 'updated');
    }
    await app.crud.create(resource, ctx);
    return msg(ctx.lang, 'added');
}

export async function ruleIndex(ctx: ApiCtx, _app: AppServices, table: string, filterAdmin: boolean) {
    const quick = String(ctx.input('quickSearch') || '');
    const model = db(table).query().orderByRaw('weigh DESC, id ASC');
    if (quick) model.where('title', 'like', `%${quick}%`);
    if (filterAdmin && ctx.admin && !ctx.admin.super) {
        const ids = ctx.admin.ruleIds.map(Number).filter((id) => id > 0);
        if (!ids.length) return { list: [], remark: '' };
        model.whereIn('id', ids);
    }
    if (truthy(ctx.input('select'))) model.whereRaw(`type IN ('menu_dir','menu') AND status = 1`);
    const rows = await model;
    const list = assembleChild(rows.map((row) => normalizeRow(row as unknown as Record<string, unknown>)));
    if (truthy(ctx.input('select'))) return { options: list };
    return { list, remark: await ruleRemark(table === 'admin_rule' ? 'auth/rule' : 'user/rule') };
}

export async function ruleAdd(ctx: ApiCtx, app: AppServices, resource: CrudResource, table: string) {
    if (ctx.method !== 'POST') throw new ApiError(msg(ctx.lang, 'param'));
    const id = await app.crud.create(resource, ctx);
    const buttons = asArray(ctx.body.buttons).map(String);
    if (ctx.body.type === 'menu' && buttons.length) {
        const names: Record<string, string> = { index: '查看', add: '添加', edit: '编辑', del: '删除', sortable: '快速排序' };
        for (const button of buttons) {
            if (!names[button]) continue;
            const row: Record<string, unknown> = {
                pid: id,
                type: 'button',
                title: names[button],
                name: `${ctx.body.name}/${button}`,
                path: '',
                icon: '',
                url: '',
                component: '',
                extend: 'none',
                remark: '',
                weigh: 0,
                status: '1',
                update_time: now(),
                create_time: now(),
            };
            if (table === 'admin_rule') {
                row.menu_type = null;
                row.keepalive = 0;
            } else {
                row.menu_type = 'tab';
                row.no_login_valid = 0;
            }
            await db(table).query().insert(row);
        }
    }
    return msg(ctx.lang, 'added');
}
