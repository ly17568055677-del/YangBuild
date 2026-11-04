import { ApiCtx } from '../../../common/context';
import { AppServices } from '../../../common/services';
import { AdminController } from '../../crud.controller';
import { crudAiConfig, crudAiStream } from '../../crud-ai';

export default class CrudCrud extends AdminController {
    constructor() {
        super('crud/crud');
    }

    async generate(ctx: ApiCtx, app: AppServices) {
        const plan = app.generator.prepare(ctx);
        await app.generator.syncTable(plan);
        app.crud.forget(plan.tableName);
        app.generator.writeCode(plan);
        await app.generator.publishMenu(plan);
        return { crudLog: await app.generator.finishLog(plan) };
    }

    getfiledata(ctx: ApiCtx, app: AppServices) {
        return app.generator.getFileData(String(ctx.input('table') || ''));
    }

    parsefielddata(ctx: ApiCtx, app: AppServices) {
        return app.generator.parseFieldData(String(ctx.input('table') || ctx.body.table || ''));
    }

    generatecheck(ctx: ApiCtx, app: AppServices) {
        return app.generator.generateCheck(ctx);
    }

    logstart(ctx: ApiCtx, app: AppServices) {
        return app.generator.logStart(ctx);
    }

    delete(ctx: ApiCtx, app: AppServices) {
        return app.generator.remove(ctx);
    }

    checkcrudlog(ctx: ApiCtx, app: AppServices) {
        return app.generator.checkCrudLog(String(ctx.input('table') || ''), String(ctx.input('connection') || 'sqlite'));
    }

    uploadcompleted(ctx: ApiCtx, app: AppServices) {
        return app.generator.uploadCompleted(ctx);
    }

    aiconfig(ctx: ApiCtx) {
        return crudAiConfig(ctx);
    }

    aistream(ctx: ApiCtx) {
        return crudAiStream(ctx);
    }
}
