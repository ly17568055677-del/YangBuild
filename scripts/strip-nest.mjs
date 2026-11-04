import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const dir = fileURLToPath(new URL('../server/runtime', import.meta.url))
for (const name of readdirSync(dir)) {
    if (!name.endsWith('.ts')) continue
    const file = join(dir, name)
    let text = readFileSync(file, 'utf8')
    text = text.replace(/import \{ Injectable(?:, OnModule\w+)? \} from '@nestjs\/common';\r?\n/, '')
    text = text.replace(/@Injectable\(\)\r?\n/g, '')
    text = text.replace('export class DatabaseService implements OnModuleDestroy', 'export class DatabaseService')
    text = text.replace('export class DispatchService implements OnModuleInit', 'export class DispatchService')
    writeFileSync(file, text)
}
console.log('stripped')
