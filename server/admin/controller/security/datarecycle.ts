import { CrudController } from '../../crud.controller';
import type { CrudResource } from '../../resource';

const resource: CrudResource = {
    pk: 'id',
    timestamps: { create: true, update: true },
    key: 'security/datarecycle',
    table: 'security_data_recycle',
    alias: 'security_data_recycle',
    quickSearchField: ['name'],
    preExcludeFields: ['create_time', 'update_time'],
};

export default class SecurityDatarecycle extends CrudController {
    constructor() {
        super(resource);
    }
}
