import { ApiCtx } from '../../../common/context';
import { AppServices } from '../../../common/services';
import { ruleAdd, ruleIndex } from '../../auth-shared';
import { CrudController } from '../../crud.controller';
import type { CrudResource } from '../../resource';

const resource: CrudResource = {
    pk: 'id',
    timestamps: { create: true, update: true },
    key: 'auth/rule',
    table: 'admin_rule',
    alias: 'admin_rule',
    quickSearchField: ['title'],
    preExcludeFields: ['create_time', 'update_time'],
    defaultSort: 'weigh,desc',
    weighField: 'weigh',
};

export default class AuthRule extends CrudController {
    constructor() {
        super(resource);
    }

    async index(ctx: ApiCtx, app: AppServices) {
        return ruleIndex(ctx, app, 'admin_rule', true);
    }

    async add(ctx: ApiCtx, app: AppServices) {
        return ruleAdd(ctx, app, this.resource, 'admin_rule');
    }
}
