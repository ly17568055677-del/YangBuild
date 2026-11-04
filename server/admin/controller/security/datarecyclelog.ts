import { ApiCtx } from '../../../common/context';
import { table as db } from '../../../common/model';
import { AppServices } from '../../../common/services';
import { ApiError, msg, normalizeRow, parseJson } from '../../../common/util';
import { CrudController } from '../../crud.controller';
import type { CrudResource } from '../../resource';

const resource: CrudResource = {
    pk: 'id',
    timestamps: { create: true, update: false },
    key: 'security/datarecyclelog',
    table: 'security_data_recycle_log',
    alias: 'security_data_recycle_log',
    quickSearchField: ['recycle.name'],
    joins: [
        { as: 'recycle', nest: 'recycle', table: 'security_data_recycle', local: 'recycle_id', foreign: 'id', fields: ['id', 'name', 'controller_as'] },
        { as: 'admin', nest: 'admin', table: 'admin', local: 'admin_id', foreign: 'id', fields: ['id', 'nickname', 'username'] },
    ],
};

export default class SecurityDatarecyclelog extends CrudController {
    constructor() {
        super(resource);
    }

    async restore(ctx: ApiCtx, _app: AppServices) {
        const ids = ctx.ids();
        const rows = ids.length ? await db('security_data_recycle_log').query().whereIn('id', ids) : [];
        let count = 0;
        for (const row of rows) {
            const data = parseJson(row.data);
            if (!data || typeof data !== 'object') continue;
            const record = data as Record<string, unknown>;
            await db(String(row.data_table)).query().insert(record);
            await db('security_data_recycle_log').query().where('id', row.id).delete();
            count++;
        }
        if (!count) throw new ApiError('没有记录被还原');
        return null;
    }

    async info(ctx: ApiCtx, _app: AppServices) {
        const row = await db('security_data_recycle_log').query().where('id', ctx.input('id')).first();
        if (!row) throw new ApiError(msg(ctx.lang, 'notFound'));
        return { row: normalizeRow(row as unknown as Record<string, unknown>) };
    }
}
