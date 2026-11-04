import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { SERVER_ROOT } from '../load-env';
import { table } from './model';
import { ApiError, md5, now } from './util';

const seKey = 'BuildAdmin';

export class CaptchaService {
    authCode(str: string, id: string, len = 32): string {
        const key = md5(seKey).slice(5, 13);
        const piece = md5(str).slice(8, 18);
        return md5(key + piece + id).slice(0, len);
    }

    async createLogic(id: string, length = 4): Promise<string> {
        const chars = '2345678abcdefhijkmnpqrstuvwxyzABCDEFGHJKLMNPQRTUVWXY';
        let code = '';
        for (let i = 0; i < length; i++) code += chars[Math.floor(Math.random() * chars.length)];
        const key = this.authCode(seKey, id);
        await this.save(key, this.authCode(code, id, 32), code, now());
        return code;
    }

    async checkLogic(code: string, id: string, len = 32): Promise<boolean> {
        if (!code) return false;
        const key = this.authCode(seKey, id);
        const row = await this.find(key);
        if (!row || String(row.code || '').length !== len) return false;
        if (now() > Number(row.expire_time || 0)) {
            await this.drop(key);
            return false;
        }
        const ok = this.authCode(code.toUpperCase(), id, len) === row.code;
        if (ok) await this.drop(key);
        return ok;
    }

    async logicAge(id: string): Promise<number> {
        const key = this.authCode(seKey, id);
        const row = await table('captcha').query().where('key', key).select('create_time').first();
        if (!row) return 9999;
        return now() - Number(row.create_time || 0);
    }

    async graphic(id: string): Promise<{ body: string; contentType: string }> {
        const chars = '123456789';
        let code = '';
        for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
        const key = this.authCode(seKey, id);
        await this.save(key, this.authCode(code.toUpperCase(), id, 30), code, now());
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="46"><rect width="100%" height="100%" fill="#fff"/>${code
            .split('')
            .map((char, index) => `<text x="${18 + index * 32}" y="32" font-size="28" fill="#333" font-family="sans-serif">${char}</text>`)
            .join('')}</svg>`;
        return { body: svg, contentType: 'image/svg+xml' };
    }

    async click(id: string) {
        const width = 350;
        const height = 200;
        const alphabet = '的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题党程展五果料象员革位入常文总次品式活设及管特件长求老头基资边流路级少图山统接知较将组见计别她手角期根论运农指几九区强放决西被干做必战先回则任取据处队南给色光门即保治北造百规热领七海口东导器压志世金增争济阶油思术极交受联什认六共权收证改清己美再采转更单风切打白教速花带安场身车例真务具万每目至达走积示议声报斗完类八离华名确才科张信马节话米整空元况今集温传土许步群广石记需段研界拉林律叫且究观越织装影算低持音众书布复容儿须际商非验连断深难近矿千周委素技备半办青省列习响约支般史感劳便团往酸历市克何除消构府称太准精值号率族维划选标写存候毛亲快效斯院查江型眼王按格养易置派层片始却专状育厂京识适属圆包火住调满县局照参红细引听该铁价严龙飞';
        const texts: { text: string; x: number; y: number; width: number; height: number; icon: boolean }[] = [];
        for (let i = 0; i < 2; i++) {
            const text = alphabet[Math.floor(Math.random() * alphabet.length)];
            texts.push({ text, x: 30 + i * 140, y: 40 + Math.floor(Math.random() * 110), width: 32, height: 32, icon: true });
        }
        const payload = { width, height, text: texts };
        await this.save(md5(id), md5(texts.map((item) => item.text).join(',')), JSON.stringify(payload), now());
        const bg = background(width, height);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${bg}${texts
            .map(
                (item) =>
                    `<text x="${item.x}" y="${item.y + item.height - 6}" font-size="28" fill="rgba(239,239,234,0.9)" font-family="sans-serif">${item.text}</text>`,
            )
            .join('')}</svg>`;
        return {
            id,
            text: texts.map((item) => item.text),
            base64: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
            width,
            height,
        };
    }

    async checkClick(id: string, info: string, unset = true): Promise<boolean> {
        const key = md5(id);
        const row = await this.find(key);
        if (!row) return false;
        if (now() > Number(row.expire_time || 0)) {
            await this.drop(key);
            return false;
        }
        const stored = JSON.parse(String(row.captcha || '{}')) as {
            width: number;
            height: number;
            text: { x: number; y: number; width: number; height: number; icon: boolean }[];
        };
        const [xy = '', w = '0', h = '0'] = String(info || '').split(';');
        const xPro = Number(w) / stored.width;
        const yPro = Number(h) / stored.height;
        const points = xy.split('-').filter(Boolean);
        if (points.length < stored.text.length) return false;
        for (let index = 0; index < stored.text.length; index++) {
            const [xText, yText] = points[index].split(',');
            const x = Number(xText) / xPro;
            const y = Number(yText) / yPro;
            const item = stored.text[index];
            const y1 = item.icon ? item.y : item.y - item.height;
            const y2 = item.icon ? item.y + item.height : item.y;
            if (x < item.x || x > item.x + item.width || y < y1 || y > y2) {
                await this.drop(key);
                return false;
            }
        }
        if (unset) await this.drop(key);
        return true;
    }

    private async drop(key: string) {
        await table('captcha').query().where('key', key).delete();
    }

    private async find(key: string) {
        return table('captcha').query().where('key', key).first();
    }

    private async save(key: string, code: string, captcha: string, stamp: number) {
        await this.drop(key);
        await table('captcha').query().insert({ key, code, captcha, create_time: stamp, expire_time: stamp + 600 });
    }
}

function background(width: number, height: number): string {
    const file = join(SERVER_ROOT, 'public', 'static', 'images', 'captcha', 'click', 'bgs', '1.png');
    if (!existsSync(file)) return `<rect width="${width}" height="${height}" fill="#8fb7d6"/>`;
    const base64 = readFileSync(file).toString('base64');
    return `<image href="data:image/png;base64,${base64}" width="${width}" height="${height}"/>`;
}

export function needCaptchaError(): ApiError {
    return new ApiError('验证码错误');
}
