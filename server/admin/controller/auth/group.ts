import { ApiCtx } from '../../../common/context';
import { table as db } from '../../../common/model';
import { AppServices } from '../../../common/services';
import { ruleRemark } from '../../../common/support';
import { assembleChild, normalizeRow, truthy } from '../../../common/util';
import { groupSave } from '../../auth-shared';
import { CrudController } from '../../crud.controller';
import type { CrudResource } from '../../resource';

const resource: CrudResource = {
    pk: 'id',
    timestamps: { create: true, update: true },
    key: 'auth/group',
    table: 'admin_group',
    alias: 'admin_group',
    quickSearchField: ['name'],
    preExcludeFields: ['create_time', 'update_time'],
    defaultSort: 'id,asc',
};

export default class AuthGroup extends CrudController {
    constructor() {
        super(resource);
    }

    async index(ctx: ApiCtx, _app: AppServices) {
        if (truthy(ctx.input('select'))) {
            const rows = await db('admin_group').query().where('status', 1).orderBy('id', 'asc');
            return { options: assembleChild(rows.map((row) => normalizeRow(row as unknown as Record<string, unknown>))) };
        }
        const rows = await db('admin_group').query().orderBy('id', 'asc');
        const rules = await db('admin_rule').query().select('id', 'title');
        const titles = new Map(rules.map((row) => [String(row.id), String(row.title)]));
        const list = rows.map((row) => {
            const item = normalizeRow(row as unknown as Record<string, unknown>);
            const raw = String(item.rules || '');
            if (raw === '*') item.rules = ctx.lang.startsWith('en') ? 'Super administrator' : '超级管理员';
            else if (!raw) item.rules = ctx.lang.startsWith('en') ? 'No permission' : '无权限';
            else {
                const ids = raw.split(',').filter(Boolean);
                const first = titles.get(ids[0]) || ids[0];
                item.rules = ids.length === 1 ? first : `${first}等 ${ids.length} 项`;
            }
            return item;
        });
        const mine = ctx.admin ? await db('admin_group_access').query().where('uid', ctx.admin.id).select('group_id') : [];
        return { list: assembleChild(list), group: mine.map((row) => Number(row.group_id)), remark: await ruleRemark('auth/group') };
    }

    async add(ctx: ApiCtx, app: AppServices) {
        return groupSave(ctx, app, this.resource, 'admin_rule');
    }

    async edit(ctx: ApiCtx, app: AppServices) {
        return groupSave(ctx, app, this.resource, 'admin_rule');
    }
}
