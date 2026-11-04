import { CrudController } from '../../crud.controller';
import type { CrudResource } from '../../resource';

const resource: CrudResource = {
    pk: 'id',
    timestamps: { create: true, update: false },
    key: 'routine/attachment',
    table: 'attachment',
    alias: 'attachment',
    quickSearchField: ['name'],
    preExcludeFields: ['topic', 'url', 'storage', 'sha1'],
    defaultSort: 'last_upload_time,desc',
    joins: [
        { as: 'admin', nest: 'admin', table: 'admin', local: 'admin_id', foreign: 'id', fields: ['id', 'nickname', 'username'] },
        { as: 'user', nest: 'user', table: 'user', local: 'user_id', foreign: 'id', fields: ['id', 'nickname', 'username'] },
    ],
    afterSelect: async (rows, ctx) => {
        for (const row of rows) {
            const name = String(row.name || '');
            const suffix = name.includes('.') ? name.split('.').pop()!.toLowerCase() : 'file';
            row.suffix = /^[a-z0-9]+$/.test(suffix) ? suffix : 'file';
            const url = String(row.url || '');
            row.full_url = /^((?:[a-z]+:)?\/\/|data:image\/)/i.test(url) ? url : `//${ctx.host}${url.startsWith('/') ? url : `/${url}`}`;
        }
    },
};

export default class RoutineAttachment extends CrudController {
    constructor() {
        super(resource);
    }
}
