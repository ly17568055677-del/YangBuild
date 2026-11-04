import { ruleRemark } from '../../common/support';
import { AdminController } from '../crud.controller';

export default class Dashboard extends AdminController {
    constructor() {
        super('dashboard');
    }

    async index() {
        return { remark: await ruleRemark('dashboard') };
    }
}
