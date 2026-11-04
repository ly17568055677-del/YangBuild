import { ApiCtx } from '../../../common/context';
import { AppServices } from '../../../common/services';
import { groupSave } from '../../auth-shared';
import { CrudController } from '../../crud.controller';
import type { CrudResource } from '../../resource';

const resource: CrudResource = {
    pk: 'id',
    timestamps: { create: true, update: true },
    key: 'user/group',
    table: 'user_group',
    alias: 'user_group',
    quickSearchField: ['name'],
    preExcludeFields: ['create_time', 'update_time'],
};

export default class UserGroup extends CrudController {
    constructor() {
        super(resource);
    }

    async add(ctx: ApiCtx, app: AppServices) {
        return groupSave(ctx, app, this.resource, 'user_rule');
    }

    async edit(ctx: ApiCtx, app: AppServices) {
        return groupSave(ctx, app, this.resource, 'user_rule');
    }
}
