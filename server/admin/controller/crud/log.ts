import { CrudController } from '../../crud.controller';
import type { CrudResource } from '../../resource';

const resource: CrudResource = {
    pk: 'id',
    timestamps: { create: true, update: false },
    key: 'crud/log',
    table: 'crud_log',
    alias: 'crud_log',
    quickSearchField: ['table_name', 'comment'],
    jsonFields: ['table', 'fields'],
    defaultSort: 'id,desc',
};

export default class CrudLog extends CrudController {
    constructor() {
        super(resource);
    }
}
