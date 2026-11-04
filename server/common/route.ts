import { ApiCtx } from './context';
import { AppServices } from './services';

export interface Route {
    app: 'admin' | 'api';
    controller: string;
    action: string | string[] | '*';
    audience?: 'admin' | 'user' | 'none';
    noLogin?: boolean;
    noPermission?: boolean;
    handle: (ctx: ApiCtx, app: AppServices) => Promise<unknown> | unknown;
}

export function matchRoute(routes: Route[], app: 'admin' | 'api', controller: string, action: string) {
    const hits = routes.filter((route) => {
        if (route.app !== app || route.controller !== controller) return false;
        if (route.action === '*') return true;
        if (Array.isArray(route.action)) return route.action.includes(action);
        return route.action === action;
    });
    return hits.find((route) => route.action !== '*') || hits[0];
}

export function audienceOf(route: Route | undefined, app: 'admin' | 'api'): 'admin' | 'user' | 'none' {
    return route?.audience ?? (app === 'admin' ? 'admin' : 'user');
}
