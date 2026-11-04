import { ApiCtx } from '../../../common/context';
import { table as db } from '../../../common/model';
import { AppServices } from '../../../common/services';
import { ApiError, msg, normalizeRow } from '../../../common/util';
import { CrudController } from '../../crud.controller';
import type { CrudResource } from '../../resource';

const resource: CrudResource = {
    pk: 'id',
    timestamps: { create: true, update: false },
    key: 'security/sensitivedatalog',
    table: 'security_sensitive_data_log',
    alias: 'security_sensitive_data_log',
    quickSearchField: ['sensitive.name'],
    joins: [
        { as: 'sensitive', nest: 'sensitive', table: 'security_sensitive_data', local: 'sensitive_id', foreign: 'id', fields: ['id', 'name', 'controller_as'] },
        { as: 'admin', nest: 'admin', table: 'admin', local: 'admin_id', foreign: 'id', fields: ['id', 'nickname', 'username'] },
    ],
    afterSelect: async (rows) => {
        for (const row of rows) row.id_value = `${row.primary_key}=${row.id_value}`;
    },
};

export default class SecuritySensitivedatalog extends CrudController {
    constructor() {
        super(resource);
    }

    async info(ctx: ApiCtx, _app: AppServices) {
        const row = await db('security_sensitive_data_log').query().where('id', ctx.input('id')).first();
        if (!row) throw new ApiError(msg(ctx.lang, 'notFound'));
        return { row: normalizeRow(row as unknown as Record<string, unknown>) };
    }

    async rollback(ctx: ApiCtx, _app: AppServices) {
        const ids = ctx.ids();
        const rows = ids.length ? await db('security_sensitive_data_log').query().whereIn('id', ids) : [];
        let count = 0;
        for (const row of rows) {
            const affected = await db(String(row.data_table)).query().where(String(row.primary_key), row.id_value).patch({ [String(row.data_field)]: row.before });
            if (affected) {
                await db('security_sensitive_data_log').query().where('id', row.id).delete();
                count++;
            }
        }
        if (!count) throw new ApiError('没有记录被回滚');
        return null;
    }
}
