import { Model, raw } from 'objection';
import { tableName } from './database.service';

const models = new Map<string, typeof Model>();

export class Row extends Model {}

export function table(name: string): typeof Row {
    const full = tableName(name);
    const cached = models.get(full);
    if (cached) return cached as typeof Row;
    const model = class extends Row {
        static get tableName() {
            return full;
        }
    };
    models.set(full, model);
    return model;
}

export { raw };
