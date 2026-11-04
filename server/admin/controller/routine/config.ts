import { ApiCtx } from '../../../common/context';
import { table } from '../../../common/model';
import { AppServices } from '../../../common/services';
import { decodeConfig, deliver, ruleRemark, sysConfig, writeEntrance } from '../../../common/support';
import { ApiError, msg, normalizeRow } from '../../../common/util';
import { AdminController } from '../../crud.controller';

export default class RoutineConfig extends AdminController {
    constructor() {
        super('routine/config');
    }

    async index(_ctx: ApiCtx, _app: AppServices) {
        const group = (await sysConfig('config_group')) as { key: string; value: string }[];
        const rows = await table('config').query().orderBy('weigh', 'desc');
        const list: Record<string, { name: string; title: string; list: unknown[] }> = {};
        const configGroup: Record<string, string> = {};
        for (const item of group || []) {
            list[item.key] = { name: item.key, title: String(item.value), list: [] };
            configGroup[item.key] = String(item.value);
        }
        for (const row of rows) {
            const item = decodeConfig(normalizeRow(row as unknown as Record<string, unknown>));
            if (list[String(item.group)]) list[String(item.group)].list.push(item);
        }
        return { list, remark: await ruleRemark('routine/config'), configGroup, quickEntrance: (await sysConfig('config_quick_entrance')) || [] };
    }

    async add(ctx: ApiCtx, app: AppServices) {
        return this.edit(ctx, app);
    }

    async edit(ctx: ApiCtx, _app: AppServices) {
        if (ctx.method !== 'POST') throw new ApiError(msg(ctx.lang, 'param'));
        const rows = await table('config').query();
        for (const row of rows) {
            const name = String(row.name);
            if (!Object.prototype.hasOwnProperty.call(ctx.body, name)) continue;
            let value = ctx.body[name];
            if (name === 'backend_entrance') writeEntrance(String(await sysConfig('backend_entrance')), String(value));
            if (['checkbox', 'array', 'selects'].includes(String(row.type))) value = JSON.stringify(value ?? []);
            else if (row.type === 'switch') value = value ? '1' : '0';
            else if (Array.isArray(value)) value = value.join(',');
            await table('config').query().where('id', row.id).patch({ value });
        }
        return msg(ctx.lang, 'updated');
    }

    async sendtestmail(ctx: ApiCtx, _app: AppServices) {
        const mail = String(ctx.body.testMail || '');
        if (!mail) throw new ApiError(msg(ctx.lang, 'param'));
        await deliver(mail, '测试邮件', '这是一封测试邮件');
        return null;
    }
}
