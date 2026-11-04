import { CrudController } from '../../crud.controller';
import type { CrudResource } from '../../resource';

const resource: CrudResource = {
    pk: 'id',
    timestamps: { create: true, update: true },
    key: 'security/sensitivedata',
    table: 'security_sensitive_data',
    alias: 'security_sensitive_data',
    quickSearchField: ['name'],
    jsonFields: ['data_fields'],
    preExcludeFields: ['create_time', 'update_time'],
};

export default class SecuritySensitivedata extends CrudController {
    constructor() {
        super(resource);
    }
}
