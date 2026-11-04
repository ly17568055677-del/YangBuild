import { CrudController } from '../../crud.controller';
import type { CrudResource } from '../../resource';

const resource: CrudResource = {
    pk: 'id',
    timestamps: { create: true, update: false },
    key: 'auth/adminlog',
    table: 'admin_log',
    alias: 'admin_log',
    quickSearchField: ['title'],
    preExcludeFields: ['create_time', 'admin_id', 'username'],
    dataLimit: 'personal',
    dataLimitField: 'admin_id',
};

export default class AuthAdminlog extends CrudController {
    constructor() {
        super(resource);
    }
}
