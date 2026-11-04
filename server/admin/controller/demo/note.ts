import { CrudController } from '../../crud.controller';
import type { CrudResource } from '../../resource';

/* <resource> */
export const resource: CrudResource = {
    "key": "demo/note",
    "table": "demo_note",
    "pk": "id",
    "alias": "demo_note",
    "quickSearchField": [
        "id",
        "title",
        "weigh"
    ],
    "preExcludeFields": [
        "create_time",
        "update_time"
    ],
    "timestamps": {
        "create": true,
        "update": true
    }
};
/* </resource> */

export default class Note extends CrudController {
    constructor() {
        super(resource);
    }

    // 重写动作时保留同名方法，例如 async add(ctx, app) { return super.add(ctx, app) }
}
