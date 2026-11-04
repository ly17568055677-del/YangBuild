import { ApiCtx } from '../../common/context';
import { ApiError, msg } from '../../common/util';
import { AdminController } from '../crud.controller';

export default class Module extends AdminController {
    constructor() {
        super('module');
    }

    any(ctx: ApiCtx) {
        throw new ApiError(msg(ctx.lang, 'notMigrated'));
    }
}
