import { Route } from '../common/route';
import Ajax from './controller/ajax';

const ajax = new Ajax();

export const ajaxRoutes: Route[] = [
    { app: 'api', controller: 'ajax', action: 'upload', noPermission: true, handle: (ctx, app) => ajax.upload(ctx, app) },
    { app: 'api', controller: 'ajax', action: 'area', noLogin: true, handle: (ctx, app) => ajax.area(ctx, app) },
    { app: 'api', controller: 'ajax', action: 'buildsuffixsvg', noLogin: true, handle: (ctx, app) => ajax.buildsuffixsvg(ctx, app) },
];
