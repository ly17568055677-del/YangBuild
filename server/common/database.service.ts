import { mkdirSync } from 'fs';
import knex, { type Knex } from 'knex';
import { dirname } from 'path';
import { Model } from 'objection';
import { dbConfig } from '../load-env';
import { prepareSqlite, refreshSqliteCatalog, type SqliteDatabase } from './sqlite-catalog';

export class DatabaseService {
    readonly knex: Knex;

    constructor() {
        mkdirSync(dirname(dbConfig.file), { recursive: true });
        this.knex = knex({
            client: 'better-sqlite3',
            connection: { filename: dbConfig.file },
            useNullAsDefault: true,
            pool: {
                min: 1,
                max: 1,
                afterCreate(connection: SqliteDatabase, done: (error: Error | null, connection: SqliteDatabase) => void) {
                    try {
                        prepareSqlite(connection, dbConfig.database);
                        done(null, connection);
                    } catch (error) {
                        done(error as Error, connection);
                    }
                },
            },
        });
        Model.knex(this.knex);
    }

    table(name: string): string {
        return tableName(name);
    }

    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
        const result = await this.knex.raw(sql, params);
        if (Array.isArray(result)) return result as T[];
        return [];
    }

    async exec(sql: string, params: unknown[] = []): Promise<{ affectedRows: number; insertId: number }> {
        const result = (await this.knex.raw(sql, params)) as { changes?: number; lastInsertRowid?: number | bigint; affectedRows?: number; insertId?: number };
        if (/^\s*(create|drop|alter)\b/i.test(sql)) await this.refreshCatalog();
        return {
            affectedRows: Number(result?.changes ?? result?.affectedRows ?? 0),
            insertId: Number(result?.lastInsertRowid ?? result?.insertId ?? 0),
        };
    }

    async refreshCatalog() {
        const connection = (await this.knex.client.acquireConnection()) as SqliteDatabase;
        try {
            refreshSqliteCatalog(connection, dbConfig.database);
        } finally {
            await this.knex.client.releaseConnection(connection);
        }
    }

    async onModuleDestroy() {
        await this.knex.destroy();
    }
}

export function tableName(name: string): string {
    const prefix = dbConfig.prefix;
    if (name.startsWith(prefix)) return name;
    return prefix + name;
}
