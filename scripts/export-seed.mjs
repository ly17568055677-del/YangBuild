import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import { existsSync, rmSync, statSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'
import { join, resolve } from 'path'

const root = process.cwd()
dotenv.config({ path: join(root, '.env') })

const source = resolve(process.env.DB_FILE || join(root, 'data', 'app.sqlite'))
const target = join(root, 'data', 'seed.sqlite')
const prefix = process.env.DB_PREFIX || 'ba_'
const adminPassword = process.env.SEED_ADMIN_PASSWORD || '123456'
const adminId = 1

if (source === target) {
    console.error('源库和目标文件相同，请先检查 DB_FILE。')
    process.exit(1)
}
if (!existsSync(source)) {
    console.error(`未找到数据库文件：${source}`)
    process.exit(1)
}

rmSync(target, { force: true })

const origin = new DatabaseSync(source, { readOnly: true })
origin.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
origin.close()

const seed = new DatabaseSync(target)
seed.exec('PRAGMA foreign_keys = OFF')

function hasTable(name) {
    return Boolean(seed.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name))
}

function table(name) {
    return prefix + name
}

function clearRows(name) {
    const full = table(name)
    if (!hasTable(full)) return
    const before = seed.prepare(`SELECT COUNT(*) AS c FROM "${full}"`).get().c
    seed.exec(`DELETE FROM "${full}"`)
    if (before) console.log(`清空 ${full}：${before} 行`)
}

function scrubConfig(name, value) {
    const full = table('config')
    if (!hasTable(full)) return
    const row = seed.prepare(`SELECT id FROM "${full}" WHERE name = ?`).get(name)
    if (!row) return
    seed.prepare(`UPDATE "${full}" SET value = ? WHERE id = ?`).run(value, row.id)
    console.log(`重置配置 ${name}`)
}

// 运行态、日志、会话：不进仓库
for (const name of ['admin_log', 'token', 'captcha', 'user_money_log', 'user_score_log', 'security_data_recycle_log', 'security_sensitive_data_log']) {
    clearRows(name)
}

// 上传记录指向 public/storage，该目录同样不入库
clearRows('attachment')

// 配置里的密钥和上传文件地址
scrubConfig('ai_api_key', null)
scrubConfig('smtp_user', null)
scrubConfig('smtp_pass', null)
scrubConfig('smtp_sender_mail', null)
scrubConfig('site_logo', '')
scrubConfig('site_favicon', '')
scrubConfig('no_access_ip', '')

// 只保留一个管理员，密码重置为已知值
const admin = table('admin')
if (hasTable(admin)) {
    const hash = bcrypt.hashSync(adminPassword, 10)
    seed.prepare(`DELETE FROM "${admin}" WHERE id <> ?`).run(adminId)
    seed
        .prepare(`UPDATE "${admin}" SET password = ?, salt = '', login_failure = 0, last_login_time = 0, last_login_ip = '', avatar = '', mobile = '' WHERE id = ?`)
        .run(hash, adminId)
    console.log(`保留管理员 ${adminId}，密码已重置`)
}
const access = table('admin_group_access')
if (hasTable(access)) {
    seed.prepare(`DELETE FROM "${access}" WHERE uid <> ?`).run(adminId)
}

// 会员账号密码同样重置，避免把已有哈希提交上去
const user = table('user')
if (hasTable(user)) {
    const hash = bcrypt.hashSync(adminPassword, 10)
    seed.prepare(`UPDATE "${user}" SET password = ?, salt = '', login_failure = 0, last_login_time = 0, last_login_ip = '', join_ip = ''`).run(hash)
    console.log('会员账号密码已重置')
}

// 其他表里名为 password 的列（例如字段类型示例表）一并清空
const tableNames = seed.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name)
for (const name of tableNames) {
    if (name === admin || name === user || name === 'schema_note') continue
    const columns = seed.prepare(`PRAGMA table_info("${name}")`).all().map((column) => column.name)
    for (const column of columns.filter((item) => /password/i.test(item))) {
        const hit = seed.prepare(`SELECT COUNT(*) AS c FROM "${name}" WHERE "${column}" IS NOT NULL AND "${column}" <> ''`).get().c
        if (!hit) continue
        seed.exec(`UPDATE "${name}" SET "${column}" = ''`)
        console.log(`清空 ${name}.${column}：${hit} 行`)
    }
}

// 单文件形式，避免带出 -wal / -shm
seed.exec('PRAGMA journal_mode = DELETE')
seed.exec('VACUUM')
seed.close()

const size = statSync(target).size
console.log(`\n已生成 ${target}（${(size / 1024).toFixed(0)} KB）`)
console.log(`初始管理员：admin / ${adminPassword}（可用 SEED_ADMIN_PASSWORD 覆盖，仅影响种子库）`)
