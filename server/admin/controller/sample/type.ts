import { CrudController } from '../../crud.controller';
import type { CrudResource } from '../../resource';

/* <resource> */
export const resource: CrudResource = {
    "key": "sample/type",
    "table": "sample_type",
    "pk": "id",
    "alias": "sample_type",
    "quickSearchField": [
        "id",
        "string_value",
        "number_value",
        "textarea_value"
    ],
    "preExcludeFields": [
        "create_time",
        "update_time"
    ],
    "timestamps": {
        "create": true,
        "update": true
    },
    "arrayFields": [
        "checkbox_value",
        "selects_value",
        "admin_ids",
        "city_value",
        "images_value",
        "files_value"
    ],
    "jsonFields": [
        "array_value"
    ],
    "joins": [
        {
            "as": "admin_id_rel",
            "nest": "admin_id_rel",
            "table": "admin",
            "local": "admin_id",
            "foreign": "id",
            "fields": [
                "id",
                "username"
            ]
        }
    ],
    "yearFields": [
        "year_value"
    ],
    "cityFields": [
        "city_value"
    ],
    "lookupFields": [
        {
            "field": "admin_ids",
            "table": "admin",
            "pk": "id",
            "label": "username",
            "text": "admin_ids_text"
        }
    ]
};
/* </resource> */

export default class Type extends CrudController {
    constructor() {
        super(resource);
    }

    // 重写动作时保留同名方法，例如 async add(ctx, app) { return super.add(ctx, app) }
}
