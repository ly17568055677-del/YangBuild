import { ApiCtx } from '../../../common/context';
import { table as db } from '../../../common/model';
import { AppServices } from '../../../common/services';
import { ApiError, msg, normalizeRow } from '../../../common/util';
import { CrudController } from '../../crud.controller';
import type { CrudResource } from '../../resource';

const resource: CrudResource = {
    pk: 'id',
    timestamps: { create: true, update: false },
    key: 'user/scorelog',
    table: 'user_score_log',
    alias: 'user_score_log',
    quickSearchField: ['user.username', 'user.nickname'],
    preExcludeFields: ['create_time', 'before', 'after'],
    joins: [{ as: 'user', nest: 'user', table: 'user', local: 'user_id', foreign: 'id', fields: ['id', 'username', 'nickname'] }],
    blockDelete: true,
};

export default class UserScorelog extends CrudController {
    constructor() {
        super(resource);
    }

    async add(ctx: ApiCtx, app: AppServices) {
        if (ctx.method !== 'POST') {
            const user = await db('user').query().where('id', ctx.input('userId')).select('id', 'username', 'nickname').first();
            if (!user) throw new ApiError('找不到该会员');
            return { user: normalizeRow(user as unknown as Record<string, unknown>) };
        }
        await app.crud.create(this.resource, ctx);
        return msg(ctx.lang, 'added');
    }
}
