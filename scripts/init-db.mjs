import dotenv from 'dotenv'
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from 'fs'
import { dirname, join, resolve } from 'path'

const root = process.cwd()
dotenv.config({ path: join(root, '.env') })

const seed = join(root, 'data', 'seed.sqlite')
const target = resolve(process.env.DB_FILE || join(root, 'data', 'app.sqlite'))
const force = process.argv.includes('--force')

if (!existsSync(seed)) {
    console.error('未找到 data/seed.sqlite。请先在已有数据的机器上执行 pnpm db:export。')
    process.exit(1)
}
if (existsSync(target) && !force) {
    console.log(`${target} 已存在，跳过。需要覆盖请执行：pnpm db:init --force`)
    process.exit(0)
}

mkdirSync(dirname(target), { recursive: true })
for (const suffix of ['', '-wal', '-shm']) rmSync(target + suffix, { force: true })
copyFileSync(seed, target)

console.log(`已从种子库初始化 ${target}（${(statSync(target).size / 1024).toFixed(0)} KB）`)
console.log('默认管理员账号是 admin / 123456，登录后请立即修改密码。')
