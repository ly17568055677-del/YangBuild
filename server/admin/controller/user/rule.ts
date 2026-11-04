import { ApiCtx } from '../../../common/context';
import { AppServices } from '../../../common/services';
import { ruleAdd, ruleIndex } from '../../auth-shared';
import { CrudController } from '../../crud.controller';
import type { CrudResource } from '../../resource';

const resource: CrudResource = {
    pk: 'id',
    timestamps: { create: true, update: true },
    key: 'user/rule',
    table: 'user_rule',
    alias: 'user_rule',
    quickSearchField: ['title'],
    preExcludeFields: ['create_time', 'update_time'],
    defaultSort: 'weigh,desc',
    weighField: 'weigh',
};

export default class UserRule extends CrudController {
    constructor() {
        super(resource);
    }

    async index(ctx: ApiCtx, app: AppServices) {
        return ruleIndex(ctx, app, 'user_rule', false);
    }

    async add(ctx: ApiCtx, app: AppServices) {
        return ruleAdd(ctx, app, this.resource, 'user_rule');
    }
}
