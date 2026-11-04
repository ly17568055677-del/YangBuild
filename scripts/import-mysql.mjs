import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'
import { dirname, join } from 'path'
import mysql from 'mysql2/promise'

const root = process.cwd()
const envFile = [join(root, '.env'), join(root, '..', 'nuxt', '.env')].find((file) => existsSync(file))
if (!envFile) {
    console.error('未找到 .env。请参照 .env.example 在项目根目录创建 .env，并填写 MySQL 连接信息。')
    process.exit(1)
}
const sourceEnv = readFileSync(envFile, 'utf8')
const env = Object.fromEntries(
    sourceEnv
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
            const index = line.indexOf('=')
            return [line.slice(0, index), line.slice(index + 1)]
        }),
)
for (const key of ['DB_HOST', 'DB_DATABASE', 'DB_USERNAME']) {
    if (!env[key]) {
        console.error(`环境变量 ${key} 未配置，无法从 MySQL 导入。请检查 ${envFile}`)
        process.exit(1)
    }
}
const file = join(root, 'data', 'app.sqlite')
mkdirSync(dirname(file), { recursive: true })
rmSync(file, { force: true })

const source = await mysql.createConnection({
    host: env.DB_HOST,
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_DATABASE,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
})
const schema = env.DB_DATABASE
const [tables] = await source.query(
    `SELECT TABLE_NAME, TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
    [schema],
)
const [columns] = await source.query(
    `SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, DATA_TYPE, COLUMN_TYPE, COLUMN_KEY, EXTRA, COLUMN_COMMENT
     FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    [schema],
)
const [indexes] = await source.query(
    `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX, INDEX_TYPE
     FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND INDEX_NAME <> 'PRIMARY' ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
    [schema],
)

const db = new DatabaseSync(file)
db.exec('PRAGMA foreign_keys = OFF')
db.exec('PRAGMA journal_mode = WAL')
db.exec(`CREATE TABLE schema_note (
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
)`)
const note = db.prepare(
    `INSERT INTO schema_note
    (table_name, column_name, data_type, column_type, column_comment, is_nullable, column_default, column_key, extra, ordinal_position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
)

const byTable = new Map()
for (const column of columns) {
    const list = byTable.get(column.TABLE_NAME) || []
    list.push(column)
    byTable.set(column.TABLE_NAME, list)
}

for (const table of tables) {
    const fields = byTable.get(table.TABLE_NAME) || []
    const primary = fields.filter((field) => field.COLUMN_KEY === 'PRI')
    const lines = fields.map((field) => columnSql(field, primary.length))
    if (primary.length !== 1 || !integerType(primary[0].DATA_TYPE)) {
        if (primary.length) lines.push(`PRIMARY KEY (${primary.map((field) => quote(field.COLUMN_NAME)).join(',')})`)
    }
    db.exec(`CREATE TABLE ${quote(table.TABLE_NAME)} (${lines.join(',')})`)
    note.run(table.TABLE_NAME, '', '', '', table.TABLE_COMMENT || '', 'YES', null, '', '', 0)
    for (const field of fields) {
        note.run(
            table.TABLE_NAME,
            field.COLUMN_NAME,
            field.DATA_TYPE,
            field.COLUMN_TYPE,
            field.COLUMN_COMMENT || '',
            field.IS_NULLABLE,
            field.COLUMN_DEFAULT,
            field.COLUMN_KEY,
            field.EXTRA || '',
            field.ORDINAL_POSITION,
        )
    }
    const [rows] = await source.query(`SELECT * FROM \`${table.TABLE_NAME}\``)
    if (rows.length) {
        const names = Object.keys(rows[0])
        const insert = db.prepare(`INSERT INTO ${quote(table.TABLE_NAME)} (${names.map(quote).join(',')}) VALUES (${names.map(() => '?').join(',')})`)
        db.exec('BEGIN')
        for (const row of rows) insert.run(...names.map((name) => cell(row[name])))
        db.exec('COMMIT')
    }
    console.log(table.TABLE_NAME, rows.length)
}

const grouped = new Map()
for (const index of indexes) {
    if (String(index.INDEX_TYPE).toUpperCase() === 'FULLTEXT') continue
    const key = `${index.TABLE_NAME}\0${index.INDEX_NAME}`
    const list = grouped.get(key) || []
    list.push(index)
    grouped.set(key, list)
}
for (const list of grouped.values()) {
    const first = list[0]
    const unique = Number(first.NON_UNIQUE) === 0 ? 'UNIQUE ' : ''
    const indexName = `${first.TABLE_NAME}_${first.INDEX_NAME}`
    db.exec(`CREATE ${unique}INDEX ${quote(indexName)} ON ${quote(first.TABLE_NAME)} (${list.map((item) => quote(item.COLUMN_NAME)).join(',')})`)
}

const crudLog = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ba_crud_log'`).get()
if (crudLog) db.exec(`UPDATE ba_crud_log SET connection = 'sqlite'`)
db.close()
await source.end()
console.log('wrote', file)

function columnSql(field, primaryCount) {
    const type = sqliteType(field.DATA_TYPE)
    const inline = field.COLUMN_KEY === 'PRI' && primaryCount === 1 && type === 'INTEGER'
    let sql = `${quote(field.COLUMN_NAME)} ${type}`
    if (inline) sql += /auto_increment/i.test(field.EXTRA || '') ? ' PRIMARY KEY AUTOINCREMENT' : ' PRIMARY KEY'
    sql += field.IS_NULLABLE === 'YES' && !inline ? ' NULL' : ' NOT NULL'
    const fallback = defaultSql(field)
    if (fallback && !/auto_increment/i.test(field.EXTRA || '')) sql += ` DEFAULT ${fallback}`
    return sql
}

function sqliteType(type) {
    const name = String(type || '').toLowerCase()
    if (['tinyint', 'smallint', 'mediumint', 'int', 'bigint', 'integer', 'bit', 'year'].includes(name)) return 'INTEGER'
    if (['decimal', 'float', 'double', 'real', 'numeric'].includes(name)) return 'REAL'
    if (name.includes('blob') || name === 'binary' || name === 'varbinary') return 'BLOB'
    return 'TEXT'
}

function integerType(type) {
    return sqliteType(type) === 'INTEGER'
}

function defaultSql(field) {
    if (field.COLUMN_DEFAULT === null || field.COLUMN_DEFAULT === undefined) return field.IS_NULLABLE === 'YES' ? 'NULL' : ''
    const text = String(field.COLUMN_DEFAULT)
    if (/^current_timestamp/i.test(text)) return 'CURRENT_TIMESTAMP'
    if (integerType(field.DATA_TYPE) && /^-?\d+(\.\d+)?$/.test(text)) return text
    if (['decimal', 'float', 'double', 'real', 'numeric'].includes(String(field.DATA_TYPE).toLowerCase()) && /^-?\d+(\.\d+)?$/.test(text)) return text
    return `'${text.replace(/'/g, "''")}'`
}

function quote(name) {
    return `"${String(name).replace(/"/g, '""')}"`
}

function cell(value) {
    if (value === undefined) return null
    if (Buffer.isBuffer(value)) return new Uint8Array(value)
    if (value instanceof Uint8Array) return value
    if (typeof value === 'bigint') return value.toString()
    if (value instanceof Date) return value.toISOString()
    if (typeof value === 'object' && value !== null) return JSON.stringify(value)
    return value
}
