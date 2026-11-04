import { setPassword } from '../../../common/auth.service';
import { ApiCtx } from '../../../common/context';
import { table as db } from '../../../common/model';
import { AppServices } from '../../../common/services';
import { ApiError, asArray, msg } from '../../../common/util';
import { CrudController } from '../../crud.controller';
import type { CrudResource } from '../../resource';

const resource: CrudResource = {
    pk: 'id',
    timestamps: { create: true, update: true },
    key: 'auth/admin',
    table: 'admin',
    alias: 'admin',
    quickSearchField: ['username', 'nickname'],
    preExcludeFields: ['create_time', 'update_time', 'password', 'salt', 'login_failure', 'last_login_time', 'last_login_ip'],
    hiddenFields: ['password', 'salt', 'login_failure'],
    dataLimit: 'allAuthAndOthers',
    dataLimitField: 'id',
    dataLimitFieldAutoFill: false,
};

export default class AuthAdmin extends CrudController {
    constructor() {
        super(resource);
    }

    async index(ctx: ApiCtx, app: AppServices) {
        const data = await app.crud.list(this.resource, ctx);
        const ids = data.list.map((row) => Number(row.id));
        if (!ids.length) return data;
        const access = await db('admin_group_access').query().whereIn('uid', ids).select('uid', 'group_id');
        const groups = await db('admin_group').query().select('id', 'name');
        const names = new Map(groups.map((row) => [Number(row.id), String(row.name)]));
        for (const row of data.list) {
            const mine = access.filter((item) => Number(item.uid) === Number(row.id));
            row.group_arr = mine.map((item) => Number(item.group_id));
            row.group_name_arr = mine.map((item) => names.get(Number(item.group_id)) || '');
        }
        return data;
    }

    async add(ctx: ApiCtx, app: AppServices) {
        return adminSave(this, ctx, app, false);
    }

    async edit(ctx: ApiCtx, app: AppServices) {
        return adminSave(this, ctx, app, true);
    }
}

async function adminSave(controller: AuthAdmin, ctx: ApiCtx, app: AppServices, editing: boolean) {
    if (ctx.method !== 'POST' && editing) {
        const row = await app.crud.find(controller.resource, ctx, ctx.input('id'));
        const access = await db('admin_group_access').query().where('uid', row.id).select('group_id');
        row.group_arr = access.map((item) => Number(item.group_id));
        row.password = '';
        delete row.salt;
        delete row.login_failure;
        return { row };
    }
    if (ctx.method !== 'POST') throw new ApiError(msg(ctx.lang, 'param'));
    const groups = asArray(ctx.body.group_arr).map((item) => Number(item));
    if (editing && ctx.admin && Number(ctx.body.id) === ctx.admin.id && ctx.body.status === 'disable') {
        throw new ApiError('请使用其他管理员账号禁用当前账号');
    }
    let id = Number(ctx.body.id || 0);
    if (editing) await app.crud.update(controller.resource, ctx, id);
    else id = await app.crud.create(controller.resource, ctx);
    if (ctx.body.password) await setPassword('admin', id, String(ctx.body.password));
    await db('admin_group_access').query().where('uid', id).delete();
    for (const groupId of groups) {
        await db('admin_group_access').query().insert({ uid: id, group_id: groupId });
    }
    return msg(ctx.lang, editing ? 'updated' : 'added');
}
