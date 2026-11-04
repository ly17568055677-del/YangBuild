import { ApiCtx } from '../../common/context';
import { AppServices } from '../../common/services';
import { flag, siteBranding, sysConfig, uploadConfig } from '../../common/support';
import { ApiError, assembleChild, msg, truthy } from '../../common/util';
import { appConfig } from '../../load-env';
import { AdminController } from '../crud.controller';

export default class Index extends AdminController {
    noLogin = ['login', 'logout'];
    noPermission = ['index', 'login', 'logout'];

    constructor() {
        super('index');
    }

    async index(ctx: ApiCtx, app: AppServices) {
        if (!ctx.admin) throw new ApiError(msg(ctx.lang, 'pleaseLogin'), 303, { type: 'need login' });
        const menus = assembleChild(await app.auth.menus('admin', ctx.admin));
        if (!menus.length) throw new ApiError(msg(ctx.lang, 'noMenu'));
        const info = app.auth.info(ctx.admin, ['id', 'username', 'nickname', 'avatar', 'last_login_time']);
        delete info.token;
        delete info.refresh_token;
        info.super = ctx.admin.super;
        const branding = await siteBranding();
        const version = await sysConfig('version');
        return {
            adminInfo: info,
            menus,
            siteConfig: {
                siteName: branding.siteName || 'BuildAdmin',
                siteLogo: branding.siteLogo,
                siteFavicon: branding.siteFavicon,
                version: version || '',
                apiUrl: appConfig.apiUrl,
                upload: uploadConfig(),
                cdnUrl: `//${ctx.host}`,
                cdnUrlParams: appConfig.cdnUrlParams,
            },
            terminal: { phpDevelopmentServer: false, npmPackageManager: appConfig.npmPackageManager },
        };
    }

    async login(ctx: ApiCtx, app: AppServices) {
        if (ctx.admin) throw new ApiError(msg(ctx.lang, 'alreadyLogin'), 303, { type: 'logged in' });
        const captchaOn = await flag('admin_login_captcha', appConfig.adminLoginCaptcha);
        if (ctx.method !== 'POST') return { captcha: captchaOn, ...(await siteBranding()) };
        if (captchaOn) {
            const ok = await app.captcha.checkClick(String(ctx.body.captchaId || ''), String(ctx.body.captchaInfo || ''));
            if (!ok) throw new ApiError(msg(ctx.lang, 'captcha'));
        }
        const actor = await app.auth.login('admin', String(ctx.body.username || ''), String(ctx.body.password || ''), truthy(ctx.body.keep), ctx.ip, ctx.lang);
        return { userInfo: app.auth.info(actor, ['id', 'username', 'nickname', 'avatar', 'last_login_time']) };
    }

    async logout(ctx: ApiCtx, app: AppServices) {
        if (ctx.method !== 'POST') return null;
        const refresh = String(ctx.body.refreshToken || '');
        if (refresh && ctx.admin) {
            const row = await app.tokens.get(refresh);
            if (row && row.userId === ctx.admin.id && row.type === 'admin-refresh') await app.tokens.delete(refresh);
        }
        if (ctx.admin) await app.tokens.delete(ctx.admin.token);
        return null;
    }
}
