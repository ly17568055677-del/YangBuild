import { setPassword } from '../common/auth.service';
import { ApiCtx } from '../common/context';
import { raw, table as db } from '../common/model';
import { Route } from '../common/route';
import { AppServices } from '../common/services';
import { deliver, flag, siteBranding, sysConfig, uploadConfig, userInfo } from '../common/support';
import { ApiError, assembleChild, msg, normalizeRow, now, RawBody, truthy, uuid, verifyPassword } from '../common/util';
import { appConfig } from '../load-env';

export const memberRoutes: Route[] = [
    { app: 'api', controller: 'install', action: '*', audience: 'none', handle: (ctx) => { throw new ApiError(msg(ctx.lang, 'notMigrated')); } },
    { app: 'api', controller: 'index', action: 'index', noLogin: true, handle: memberIndex },
    { app: 'api', controller: 'user', action: 'checkin', noLogin: true, handle: checkIn },
    { app: 'api', controller: 'user', action: 'logout', noLogin: true, handle: memberLogout },
    { app: 'api', controller: 'account', action: 'overview', handle: overview },
    { app: 'api', controller: 'account', action: 'profile', handle: profile },
    { app: 'api', controller: 'account', action: 'verification', noPermission: true, handle: verification },
    { app: 'api', controller: 'account', action: 'changebind', noPermission: true, handle: changeBind },
    { app: 'api', controller: 'account', action: 'changepassword', handle: changePassword },
    { app: 'api', controller: 'account', action: 'retrievepassword', noLogin: true, handle: retrievePassword },
    { app: 'api', controller: 'account', action: ['integral', 'balance'], handle: memberLogs },
    { app: 'api', controller: 'common', action: 'captcha', audience: 'none', handle: graphic },
    { app: 'api', controller: 'common', action: 'clickcaptcha', audience: 'none', handle: (ctx, app) => app.captcha.click(String(ctx.input('id') || '')) },
    { app: 'api', controller: 'common', action: 'checkclickcaptcha', audience: 'none', handle: checkClick },
    { app: 'api', controller: 'common', action: 'refreshtoken', audience: 'none', handle: refresh },
    { app: 'api', controller: 'ems', action: 'send', noLogin: true, handle: sendMail },
    { app: 'api', controller: 'sms', action: 'send', noLogin: true, handle: () => { throw new ApiError('未配置短信服务'); } },
];

async function memberIndex(ctx: ApiCtx, app: AppServices) {
    let rules: Record<string, unknown>[] = [];
    let menus: Record<string, unknown>[] = [];
    if (ctx.user) {
        const tree = assembleChild(await app.auth.menus('user', ctx.user));
        for (const item of tree) {
            if (item.type === 'menu_dir') menus.push(item);
            else if (item.type !== 'menu') rules.push(item);
        }
    } else if (truthy(ctx.input('requiredLogin'))) {
        throw new ApiError(msg(ctx.lang, 'pleaseLogin'), 303, { type: 'need login' });
    } else {
        const rows = await db('user_rule')
            .query()
            .where('status', 1)
            .where('no_login_valid', 1)
            .whereRaw(`type IN ('route','nav','button')`)
            .orderBy('weigh', 'desc');
        rules = assembleChild(rows.map((row) => normalizeRow(row as unknown as Record<string, unknown>)));
    }
    const branding = await siteBranding();
    return {
        site: {
            siteName: branding.siteName,
            siteLogo: branding.siteLogo,
            siteFavicon: branding.siteFavicon,
            version: (await sysConfig('version')) || '',
            cdnUrl: `//${ctx.host}`,
            upload: uploadConfig(),
            recordNumber: (await sysConfig('record_number')) || '',
            cdnUrlParams: appConfig.cdnUrlParams,
        },
        openMemberCenter: await flag('open_member_center', appConfig.openMemberCenter),
        userInfo: ctx.user ? userInfo(app.auth, ctx.user) : [],
        rules,
        menus,
    };
}

async function checkIn(ctx: ApiCtx, app: AppServices) {
    if (!(await flag('open_member_center', appConfig.openMemberCenter))) throw new ApiError(msg(ctx.lang, 'memberOff'));
    if (ctx.user) throw new ApiError(msg(ctx.lang, 'alreadyLogin'), 303, { type: 'logged in' });
    const captchaOn = await flag('user_login_captcha', appConfig.userLoginCaptcha);
    if (ctx.method !== 'POST') return { userLoginCaptchaSwitch: captchaOn, accountVerificationType: ['email'] };
    const tab = String(ctx.body.tab || '');
    if (tab === 'login') {
        if (captchaOn) {
            const ok = await app.captcha.checkClick(String(ctx.body.captchaId || ''), String(ctx.body.captchaInfo || ''));
            if (!ok) throw new ApiError(msg(ctx.lang, 'captcha'));
        }
        const actor = await app.auth.login('user', String(ctx.body.username || ''), String(ctx.body.password || ''), truthy(ctx.body.keep), ctx.ip, ctx.lang);
        return { userInfo: userInfo(app.auth, actor), routePath: '/user' };
    }
    if (tab === 'register') {
        const registerType = String(ctx.body.registerType || 'email');
        const account = String(ctx.body[registerType] || '');
        const ok = await app.captcha.checkLogic(String(ctx.body.captcha || ''), `${account}user_register`);
        if (!ok) throw new ApiError('请输入正确的验证码');
        const actor = await app.auth.register(String(ctx.body.username || ''), String(ctx.body.password || ''), String(ctx.body.mobile || ''), String(ctx.body.email || ''));
        return { userInfo: userInfo(app.auth, actor), routePath: '/user' };
    }
    throw new ApiError('未知操作');
}

async function memberLogout(ctx: ApiCtx, app: AppServices) {
    if (ctx.method !== 'POST') return null;
    if (ctx.user) await app.tokens.delete(ctx.user.token);
    return null;
}

async function overview(ctx: ApiCtx, app: AppServices) {
    if (!ctx.user) throw new ApiError(msg(ctx.lang, 'pleaseLogin'), 303, { type: 'need login' });
    const days: string[] = [];
    const score: number[] = [];
    const money: string[] = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - i);
        const start = Math.floor(date.getTime() / 1000);
        const end = start + 86400 - 1;
        days.push(date.toISOString().slice(0, 10));
        const scores = await db('user_score_log')
            .query()
            .where('user_id', ctx.user.id)
            .whereRaw('create_time BETWEEN ? AND ?', [start, end])
            .select(raw('COALESCE(SUM(score), 0) as total'))
            .first();
        const moneys = await db('user_money_log')
            .query()
            .where('user_id', ctx.user.id)
            .whereRaw('create_time BETWEEN ? AND ?', [start, end])
            .select(raw('COALESCE(SUM(money), 0) as total'))
            .first();
        score.push(Number(scores?.total || 0));
        money.push((Number(moneys?.total || 0) / 100).toFixed(2));
    }
    return { days, score, money };
}

async function profile(ctx: ApiCtx, app: AppServices) {
    if (!ctx.user) throw new ApiError(msg(ctx.lang, 'pleaseLogin'), 303, { type: 'need login' });
    if (ctx.method !== 'POST') return { accountVerificationType: ['email'] };
    const allow = ['avatar', 'username', 'nickname', 'gender', 'birthday', 'motto'];
    const data: Record<string, unknown> = {};
    for (const field of allow) if (field in ctx.body) data[field] = ctx.body[field];
    if (!('birthday' in data)) data.birthday = null;
    await db('user').query().where('id', ctx.user.id).patch(data);
    return msg(ctx.lang, 'dataUpdated');
}

async function verification(ctx: ApiCtx, app: AppServices) {
    if (!ctx.user) throw new ApiError(msg(ctx.lang, 'pleaseLogin'), 303, { type: 'need login' });
    const type = String(ctx.body.type || '');
    const account = type === 'email' ? String(ctx.user.row.email || '') : String(ctx.user.row.mobile || '');
    const ok = await app.captcha.checkLogic(String(ctx.body.captcha || ''), `${account}user_${type}_verify`);
    if (!ok) throw new ApiError('请输入正确的验证码');
    const token = uuid();
    await app.tokens.set(token, `${type}-pass`, ctx.user.id, 600);
    return { type, accountVerificationToken: token };
}

async function changeBind(ctx: ApiCtx, app: AppServices) {
    if (!ctx.user) throw new ApiError(msg(ctx.lang, 'pleaseLogin'), 303, { type: 'need login' });
    const type = String(ctx.body.type || '');
    if (type !== 'email' && type !== 'mobile') throw new ApiError(msg(ctx.lang, 'param'));
    const current = String(ctx.user.row[type] || '');
    if (current) {
        const pass = await app.tokens.check(String(ctx.body.accountVerificationToken || ''), `${type}-pass`, ctx.user.id);
        if (!pass) throw new ApiError('修改绑定信息前需要先验证账户');
    } else if (!verifyPassword(String(ctx.body.password || ''), String(ctx.user.row.password || ''), String(ctx.user.row.salt || ''))) {
        throw new ApiError('密码错误');
    }
    const account = String(ctx.body[type] || '');
    const ok = await app.captcha.checkLogic(String(ctx.body.captcha || ''), `${account}user_change_${type}`);
    if (!ok) throw new ApiError('请输入正确的验证码');
    const duplicated = await db('user').query().where(type, account).where('id', '<>', ctx.user.id).select('id').first();
    if (duplicated) throw new ApiError(type === 'email' ? '邮箱已被占用' : '手机号已被占用');
    await db('user').query().where('id', ctx.user.id).patch({ [type]: account });
    await app.tokens.delete(String(ctx.body.accountVerificationToken || ''));
    return null;
}

async function changePassword(ctx: ApiCtx, app: AppServices) {
    if (!ctx.user || ctx.method !== 'POST') throw new ApiError(msg(ctx.lang, 'param'));
    if (!verifyPassword(String(ctx.body.oldPassword || ''), String(ctx.user.row.password || ''), String(ctx.user.row.salt || ''))) {
        throw new ApiError('旧密码错误');
    }
    const password = String(ctx.body.newPassword || '');
    if (!/^(?!.*[&<>"'\n\r]).{6,32}$/.test(password)) throw new ApiError('密码格式不正确');
    await setPassword('user', ctx.user.id, password);
    await app.tokens.delete(ctx.user.token);
    return msg(ctx.lang, 'passwordChanged');
}

async function retrievePassword(ctx: ApiCtx, app: AppServices) {
    const type = String(ctx.body.type || 'email');
    const account = String(ctx.body.account || '');
    const column = type === 'mobile' ? 'mobile' : 'email';
    const user = await db('user').query().where(column, account).select('id').first();
    if (!user) throw new ApiError('账户不存在');
    const ok = await app.captcha.checkLogic(String(ctx.body.captcha || ''), `${account}user_retrieve_pwd`);
    if (!ok) throw new ApiError('请输入正确的验证码');
    await setPassword('user', Number(user.id), String(ctx.body.password || ''));
    return '密码已修改~';
}

async function memberLogs(ctx: ApiCtx, app: AppServices) {
    if (!ctx.user) throw new ApiError(msg(ctx.lang, 'pleaseLogin'), 303, { type: 'need login' });
    const table = ctx.action === 'integral' ? 'user_score_log' : 'user_money_log';
    const limit = Math.min(Number(ctx.input('limit') || 10), 100);
    const page = Math.max(Number(ctx.input('page') || 1), 1);
    const rows = await db(table).query().where('user_id', ctx.user.id).orderBy('create_time', 'desc').limit(limit).offset((page - 1) * limit);
    const total = await db(table).query().where('user_id', ctx.user.id).resultSize();
    const list = rows.map((row) => {
        const item = normalizeRow(row as unknown as Record<string, unknown>);
        if (table === 'user_money_log') {
            for (const field of ['money', 'before', 'after']) item[field] = (Number(item[field] || 0) / 100).toFixed(2);
        }
        return item;
    });
    return { list, total };
}

async function graphic(ctx: ApiCtx, app: AppServices) {
    const image = await app.captcha.graphic(String(ctx.input('id') || ''));
    return new RawBody(image.body, image.contentType);
}

async function checkClick(ctx: ApiCtx, app: AppServices) {
    const ok = await app.captcha.checkClick(String(ctx.input('id') || ''), String(ctx.input('info') || ''), truthy(ctx.input('unset')));
    if (!ok) throw new ApiError(msg(ctx.lang, 'captcha'));
    return null;
}

async function refresh(ctx: ApiCtx, app: AppServices) {
    const row = await app.tokens.get(String(ctx.body.refreshToken || ''));
    if (!row || row.expireTime < now()) throw new ApiError(msg(ctx.lang, 'loginExpired'));
    const token = uuid();
    if (row.type === 'admin-refresh') await app.tokens.set(token, 'admin', row.userId, appConfig.adminTokenKeep);
    else if (row.type === 'user-refresh') await app.tokens.set(token, 'user', row.userId, appConfig.userTokenKeep);
    else throw new ApiError(msg(ctx.lang, 'loginExpired'));
    return { type: row.type, token };
}

async function sendMail(ctx: ApiCtx, app: AppServices) {
    const email = String(ctx.body.email || '');
    const event = String(ctx.body.event || '');
    const allowed = ['user_register', 'user_change_email', 'user_retrieve_pwd', 'user_email_verify'];
    if (!allowed.includes(event)) throw new ApiError(msg(ctx.lang, 'param'));
    const ok = await app.captcha.checkClick(String(ctx.body.captchaId || ''), String(ctx.body.captchaInfo || ''));
    if (!ok) throw new ApiError(msg(ctx.lang, 'captcha'));
    if ((await app.captcha.logicAge(`${email}${event}`)) < 60) throw new ApiError(msg(ctx.lang, 'frequentMail'));
    const code = await app.captcha.createLogic(`${email}${event}`);
    await deliver(email, '验证码', `您的验证码是 ${code}`);
    return null;
}
