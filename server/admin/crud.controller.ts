import { ApiCtx } from '../common/context';
import { AppServices } from '../common/services';
import { ApiError, msg } from '../common/util';
import { CrudResource, registerResource, resources } from './resource';

const baseActions = new Set(['index', 'add', 'edit', 'del', 'sortable', 'select']);

export class AdminController {
    noLogin: string[] = [];
    noPermission: string[] = [];

    constructor(public readonly key: string) {}
}

export class CrudController extends AdminController {
    constructor(public resource: CrudResource) {
        super(resource.key);
    }

    async index(ctx: ApiCtx, app: AppServices) {
        return app.crud.list(this.resource, ctx);
    }

    async select(ctx: ApiCtx, app: AppServices) {
        return this.index(ctx, app);
    }

    async add(ctx: ApiCtx, app: AppServices) {
        if (ctx.method !== 'POST') throw new ApiError(msg(ctx.lang, 'param'));
        await app.crud.create(this.resource, ctx);
        return msg(ctx.lang, 'added');
    }

    async edit(ctx: ApiCtx, app: AppServices) {
        const pk = this.resource.pk || 'id';
        const row = await app.crud.find(this.resource, ctx, ctx.input(pk) ?? ctx.input('id'));
        if (ctx.method !== 'POST') return { row };
        await app.crud.update(this.resource, ctx, row[pk]);
        return msg(ctx.lang, 'updated');
    }

    async del(ctx: ApiCtx, app: AppServices) {
        await app.crud.remove(this.resource, ctx, ctx.ids());
        return msg(ctx.lang, 'deleted');
    }

    async sortable(ctx: ApiCtx, app: AppServices) {
        await app.crud.sort(this.resource, ctx);
        return null;
    }
}

export const crudControllers = new Map<string, AdminController>();

export function registerController(controller: AdminController) {
    crudControllers.set(controller.key.toLowerCase(), controller);
    if (controller instanceof CrudController) registerResource(controller.resource);
}

export function unregisterController(key: string) {
    const name = key.toLowerCase();
    crudControllers.delete(name);
    resources.delete(name);
}

export function resolveCrudAction(controller: AdminController, action: string) {
    const base = controller instanceof CrudController && baseActions.has(action);
    if (base || declaredOnSubclass(controller, action)) {
        const method = (controller as unknown as Record<string, unknown>)[action];
        if (typeof method === 'function') return (method as (ctx: ApiCtx, app: AppServices) => unknown).bind(controller);
    }
    if (action !== 'any' && declaredOnSubclass(controller, 'any')) {
        const method = (controller as unknown as { any?: (ctx: ApiCtx, app: AppServices) => unknown }).any;
        if (typeof method === 'function') return method.bind(controller);
    }
    return null;
}

function declaredOnSubclass(controller: AdminController, action: string) {
    if (action === 'constructor') return false;
    const stop = controller instanceof CrudController ? CrudController.prototype : AdminController.prototype;
    let proto = Object.getPrototypeOf(controller);
    while (proto && proto !== stop && proto !== Object.prototype) {
        if (Object.prototype.hasOwnProperty.call(proto, action)) return typeof proto[action] === 'function';
        proto = Object.getPrototypeOf(proto);
    }
    return false;
}
