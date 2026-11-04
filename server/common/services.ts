import type { CrudService } from '../admin/crud.service';
import type { GeneratorService } from '../admin/generator.service';
import { AuthService } from './auth.service';
import { CaptchaService } from './captcha.service';
import { DatabaseService } from './database.service';
import { TokenService } from './token.service';

export interface AppServices {
    database: DatabaseService;
    auth: AuthService;
    tokens: TokenService;
    crud: CrudService;
    captcha: CaptchaService;
    generator: GeneratorService;
}
