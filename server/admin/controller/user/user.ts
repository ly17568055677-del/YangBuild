import { setPassword } from '../../../common/auth.service';
import { ApiCtx } from '../../../common/context';
import { AppServices } from '../../../common/services';
import { ApiError, msg } from '../../../common/util';
import { appConfig } from '../../../load-env';
import { CrudController } from '../../crud.controller';
import type { CrudResource } from '../../resource';

const resource: CrudResource = {
    pk: 'id',
    timestamps: { create: true, update: true },
    key: 'user/user',
    table: 'user',
    alias: 'user',
    quickSearchField: ['username', 'nickname', 'id'],
    preExcludeFields: ['last_login_time', 'login_failure', 'password', 'salt'],
    hiddenFields: ['password', 'salt'],
    centsFields: ['money'],
    joins: [{ as: 'user_group', nest: 'userGroup', table: 'user_group', local: 'group_id', foreign: 'id', fields: ['id', 'name'] }],
    afterSelect: async (rows) => {
        for (const row of rows) if (!row.avatar) row.avatar = appConfig.defaultAvatar;
    },
    afterFind: async (row) => {
        if (!row.avatar) row.avatar = appConfig.defaultAvatar;
        row.password = '';
    },
};

export default class UserUser extends CrudController {
    constructor() {
        super(resource);
    }

    async add(ctx: ApiCtx, app: AppServices) {
        return memberSave(this, ctx, app);
    }

    async edit(ctx: ApiCtx, app: AppServices) {
        return memberSave(this, ctx, app);
    }
}

async function memberSave(controller: UserUser, ctx: ApiCtx, app: AppServices) {
    if (ctx.method !== 'POST' && ctx.action === 'edit') return { row: await app.crud.find(controller.resource, ctx, ctx.input('id')) };
    if (ctx.method !== 'POST') throw new ApiError(msg(ctx.lang, 'param'));
    const editing = ctx.action === 'edit';
    let id = Number(ctx.body.id || 0);
    if (editing) await app.crud.update(controller.resource, ctx, id);
    else id = await app.crud.create(controller.resource, ctx);
    if (ctx.body.password) await setPassword('user', id, String(ctx.body.password));
    return msg(ctx.lang, editing ? 'updated' : 'added');
}
