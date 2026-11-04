import { setPassword } from '../../../common/auth.service';
import { ApiCtx } from '../../../common/context';
import { table } from '../../../common/model';
import { AppServices } from '../../../common/services';
import { ApiError, msg } from '../../../common/util';
import { AdminController } from '../../crud.controller';

export default class RoutineAdmininfo extends AdminController {
    constructor() {
        super('routine/admininfo');
    }

    index(ctx: ApiCtx, app: AppServices) {
        if (!ctx.admin) throw new ApiError(msg(ctx.lang, 'pleaseLogin'), 303, { type: 'need login' });
        return { info: app.auth.info(ctx.admin, ['id', 'username', 'nickname', 'avatar', 'email', 'mobile', 'motto', 'last_login_time']) };
    }

    async edit(ctx: ApiCtx, app: AppServices) {
        if (!ctx.admin) throw new ApiError(msg(ctx.lang, 'pleaseLogin'), 303, { type: 'need login' });
        if (ctx.method !== 'POST') return this.index(ctx, app);
        const allow = ['nickname', 'avatar', 'email', 'mobile', 'motto'];
        const data: Record<string, unknown> = {};
        for (const field of allow) if (field in ctx.body) data[field] = ctx.body[field];
        if (Object.keys(data).length) await table('admin').query().where('id', ctx.admin.id).patch(data);
        if (ctx.body.password) await setPassword('admin', ctx.admin.id, String(ctx.body.password));
        return msg(ctx.lang, 'updated');
    }
}
