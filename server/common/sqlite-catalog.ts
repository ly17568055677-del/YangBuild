export interface SqliteStatement {
    all: (...args: unknown[]) => Record<string, unknown>[];
    get: (...args: unknown[]) => Record<string, unknown> | undefined;
    run: (...args: unknown[]) => unknown;
}

export interface SqliteDatabase {
    exec: (sql: string) => void;
    function: (name: string, cb: (...args: unknown[]) => unknown) => void;
    prepare: (sql: string) => SqliteStatement;
}

export function prepareSqlite(db: SqliteDatabase, schema: string) {
    db.function('FIND_IN_SET', (needle, haystack) => {
        if (needle === undefined || needle === null || haystack === undefined || haystack === null || haystack === '') return 0;
        const parts = String(haystack).split(',');
        const index = parts.findIndex((item) => item === String(needle));
        return index < 0 ? 0 : index + 1;
    });
    db.exec(`CREATE TABLE IF NOT EXISTS schema_note (
        table_name TEXT NOT NULL,
        column_name TEXT NOT NULL DEFAULT '',
        data_type TEXT NOT NULL DEFAULT '',
        column_type TEXT NOT NULL DEFAULT '',
        column_comment TEXT NOT NULL DEFAULT '',
        is_nullable TEXT NOT NULL DEFAULT 'YES',
        column_default TEXT,
        column_key TEXT NOT NULL DEFAULT '',
        extra TEXT NOT NULL DEFAULT '',
        ordinal_position INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (table_name, column_name)
    )`);
    db.exec(`ATTACH DATABASE ':memory:' AS information_schema`);
    db.exec(`CREATE TABLE IF NOT EXISTS information_schema.TABLES (
        TABLE_SCHEMA TEXT,
        TABLE_NAME TEXT,
        TABLE_COMMENT TEXT
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS information_schema.COLUMNS (
        TABLE_SCHEMA TEXT,
        TABLE_NAME TEXT,
        COLUMN_NAME TEXT,
        ORDINAL_POSITION INTEGER,
        COLUMN_DEFAULT TEXT,
        IS_NULLABLE TEXT,
        DATA_TYPE TEXT,
        COLUMN_TYPE TEXT,
        COLUMN_KEY TEXT,
        EXTRA TEXT,
        COLUMN_COMMENT TEXT
    )`);
    refreshSqliteCatalog(db, schema);
}

export function refreshSqliteCatalog(db: SqliteDatabase, schema: string) {
    db.prepare('DELETE FROM information_schema.TABLES').run();
    db.prepare('DELETE FROM information_schema.COLUMNS').run();
    const tables = db.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_note'`).all();
    const insertTable = db.prepare('INSERT INTO information_schema.TABLES (TABLE_SCHEMA, TABLE_NAME, TABLE_COMMENT) VALUES (?, ?, ?)');
    const insertColumn = db.prepare(
        `INSERT INTO information_schema.COLUMNS
        (TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, DATA_TYPE, COLUMN_TYPE, COLUMN_KEY, EXTRA, COLUMN_COMMENT)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const note = db.prepare('SELECT * FROM schema_note WHERE table_name = ?');
    for (const table of tables) {
        const tableName = String(table.name);
        const notes = note.all(tableName);
        const tableNote = notes.find((item) => String(item.column_name || '') === '');
        insertTable.run(schema, tableName, String(tableNote?.column_comment || ''));
        const noted = new Map(notes.filter((item) => String(item.column_name || '') !== '').map((item) => [String(item.column_name), item]));
        const pragma = db.prepare(`PRAGMA table_info(${quoteIdent(tableName)})`).all();
        const createSql = String(table.sql || '');
        const auto = /autoincrement/i.test(createSql);
        for (const column of pragma) {
            const name = String(column.name);
            const saved = noted.get(name);
            const pk = Number(column.pk || 0) > 0;
            const type = String(saved?.data_type || normalizeType(String(column.type || 'text')));
            insertColumn.run(
                schema,
                tableName,
                name,
                Number(saved?.ordinal_position || Number(column.cid || 0) + 1),
                notedDefault(saved, column.dflt_value),
                String(saved?.is_nullable || (Number(column.notnull) ? 'NO' : 'YES')),
                type,
                String(saved?.column_type || column.type || type),
                String(saved?.column_key || (pk ? 'PRI' : '')),
                String(saved?.extra || (pk && auto ? 'auto_increment' : '')),
                String(saved?.column_comment || ''),
            );
        }
    }
}

function notedDefault(saved: { column_default?: unknown } | undefined, pragmaDefault: unknown) {
    if (saved && saved.column_default !== null && saved.column_default !== undefined) return saved.column_default;
    return pragmaDefault ?? null;
}

function quoteIdent(name: string): string {
    return `'${name.replace(/'/g, "''")}'`;
}

function normalizeType(type: string): string {
    const name = type.toLowerCase();
    if (name.includes('int')) return 'int';
    if (name.includes('char') || name.includes('clob') || name.includes('text')) return 'varchar';
    if (name.includes('real') || name.includes('floa') || name.includes('doub') || name.includes('dec')) return 'decimal';
    if (name.includes('blob')) return 'blob';
    return name || 'varchar';
}
