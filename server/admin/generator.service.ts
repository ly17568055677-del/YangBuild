import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { dbConfig, SERVER_ROOT } from '../load-env';
import { ApiCtx } from '../common/context';
import { DatabaseService } from '../common/database.service';
import { ApiError, msg, now, qi } from '../common/util';
import { CrudController, crudControllers, registerController, unregisterController } from './crud.controller';
import { CrudResource, registerResource } from './resource';

export interface NameInfo {
    path: string[];
    last: string;
    original: string;
    rootFileName: string;
}

export class GeneratorService {
    constructor(private readonly database: DatabaseService) {}

    async getFileData(table: string) {
        const controller = this.parseController(table, '');
        const views = this.parseViews(table, '');
        const list = await this.controllerList();
        return {
            modelFile: this.tsPath(controller),
            controllerFile: controller.rootFileName,
            validateFile: controller.rootFileName.replace('/controller/', '/validate/'),
            controllerFileList: list,
            modelFileList: list,
            webViewsDir: views.webViews,
        };
    }

    async checkCrudLog(table: string, connection: string) {
        const rows = await this.database.query(
            `SELECT id, status FROM ${this.database.table('crud_log')} WHERE table_name = ? AND connection = ? ORDER BY id DESC LIMIT 1`,
            [table, connection || 'sqlite'],
        );
        const row = rows[0];
        return { id: row && row.status === 'success' ? row.id : 0 };
    }

    async parseFieldData(table: string) {
        const full = this.fullTable(table);
        const info = await this.database.query(
            `SELECT TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
            [dbConfig.database, full],
        );
        if (!info[0]) throw new ApiError('记录未找到');
        const columns = await this.database.query(
            `SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
            [dbConfig.database, full],
        );
        const count = await this.database.query(`SELECT 1 FROM ${qi(full)} LIMIT 1`);
        return {
            columns: columns.map((item) => this.columnToField(item as unknown as Record<string, unknown>)),
            comment: info[0].TABLE_COMMENT || '',
            empty: count.length === 0,
        };
    }

    async generateCheck(ctx: ApiCtx) {
        const table = String(ctx.input('table') || '');
        if (!table) throw new ApiError(msg(ctx.lang, 'param'));
        const controller = this.parseController(table, String(ctx.input('controllerFile') || ''));
        const views = this.parseViews(table, String(ctx.input('webViewsDir') || ''));
        const menuName = this.menuName(views);
        const tables = await this.database.query(
            `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
            [dbConfig.database, this.fullTable(table)],
        );
        const menu = await this.database.query(`SELECT id FROM ${this.database.table('admin_rule')} WHERE name = ? LIMIT 1`, [menuName]);
        const controllerExist = existsSync(this.absTs(controller));
        if (controllerExist || tables.length || menu.length) {
            throw new ApiError('', -1, {
                menu: menu[0]?.id || 0,
                table: tables.length > 0,
                controller: controllerExist,
            });
        }
        return {};
    }

    prepare(ctx: ApiCtx): GeneratePlan {
        const table = (ctx.body.table || {}) as Record<string, unknown>;
        const fields = ctx.body.fields as Record<string, Record<string, unknown>> | Record<string, unknown>[];
        const fieldList = Array.isArray(fields) ? fields : Object.values(fields || {});
        if (!table?.name || !fieldList.length) throw new ApiError(msg(ctx.lang, 'param'));
        const tableName = String(table.name);
        return {
            table,
            fieldList: fieldList as Record<string, unknown>[],
            tableName,
            controller: this.parseController(tableName, String(table.controllerFile || '')),
            views: this.parseViews(tableName, String(table.webViewsDir || '')),
            rebuild: String(ctx.body.type || '') === 'create' || table.rebuild === 'Yes',
        };
    }

    async syncTable(plan: GeneratePlan) {
        if (plan.rebuild) {
            await this.database.exec(`DROP TABLE IF EXISTS ${qi(this.fullTable(plan.tableName))}`);
            await this.createTable(plan.tableName, String(plan.table.comment || plan.tableName), plan.fieldList);
        } else if (!(await this.tableExists(plan.tableName))) {
            await this.createTable(plan.tableName, String(plan.table.comment || plan.tableName), plan.fieldList);
        }
    }

    writeCode(plan: GeneratePlan) {
        const resource = this.writeResource(plan.tableName, plan.controller, plan.fieldList);
        registerResource(resource);
        this.writeVue(plan.table, plan.controller, plan.views, plan.fieldList);
        this.writeLang(plan.views, plan.fieldList);
        return resource;
    }

    async publishMenu(plan: GeneratePlan) {
        await this.writeMenu(plan.table, plan.views);
    }

    async finishLog(plan: GeneratePlan) {
        const logId = await this.writeLog(plan.table, plan.fieldList, 'success');
        const crudLog = await this.database.query(`SELECT * FROM ${this.database.table('crud_log')} WHERE id = ?`, [logId]);
        return crudLog[0] || { id: logId };
    }

    async generate(ctx: ApiCtx) {
        const plan = this.prepare(ctx);
        await this.syncTable(plan);
        this.writeCode(plan);
        await this.publishMenu(plan);
        return { crudLog: await this.finishLog(plan) };
    }

    async logStart(ctx: ApiCtx) {
        if (ctx.input('type') === 'Cloud history') throw new ApiError(msg(ctx.lang, 'notMigrated'));
        const rows = await this.database.query(`SELECT * FROM ${this.database.table('crud_log')} WHERE id = ?`, [ctx.input('id')]);
        if (!rows[0]) throw new ApiError(msg(ctx.lang, 'notFound'));
        const info = rows[0] as Record<string, unknown>;
        const table = typeof info.table === 'string' ? JSON.parse(info.table) : info.table;
        const fields = typeof info.fields === 'string' ? JSON.parse(info.fields) : info.fields;
        return { table, fields, sync: info.sync || 0 };
    }

    async remove(ctx: ApiCtx) {
        if (!ctx.admin?.super) throw new ApiError(msg(ctx.lang, 'noPermission'), 401);
        const rows = await this.database.query(`SELECT * FROM ${this.database.table('crud_log')} WHERE id = ?`, [ctx.input('id')]);
        if (!rows[0]) throw new ApiError(msg(ctx.lang, 'notFound'));
        const info = rows[0] as Record<string, unknown>;
        const table = (typeof info.table === 'string' ? JSON.parse(String(info.table)) : info.table) as Record<string, unknown>;
        const views = this.parseViews(String(table.name || info.table_name || ''), String(table.webViewsDir || ''));
        const controller = this.parseController(String(table.name || ''), String(table.controllerFile || ''));
        unregisterController([...controller.path, controller.original].join('/'));
        for (const file of [
            join(this.abs(views.langZh), '.ts'),
            join(this.abs(views.langEn), '.ts'),
            join(this.abs(views.views), 'index.vue'),
            join(this.abs(views.views), 'popupForm.vue'),
            this.absTs(controller),
        ]) {
            this.safeUnlink(file);
        }
        this.writeControllerIndex();
        const menuName = this.menuName(views);
        const menus = await this.database.query(`SELECT id FROM ${this.database.table('admin_rule')} WHERE name = ?`, [menuName]);
        if (menus[0]) {
            await this.database.exec(`DELETE FROM ${this.database.table('admin_rule')} WHERE id = ? OR pid = ?`, [menus[0].id, menus[0].id]);
        }
        await this.database.exec(`UPDATE ${this.database.table('crud_log')} SET status = 'delete' WHERE id = ?`, [info.id]);
        return {};
    }

    async uploadCompleted(ctx: ApiCtx) {
        const syncIds = (ctx.body.syncIds || {}) as Record<string, unknown>;
        if (ctx.body.cancelSync) {
            for (const [id, sync] of Object.entries(syncIds)) {
                await this.database.exec(`UPDATE ${this.database.table('crud_log')} SET sync = 0 WHERE id = ? AND sync = ?`, [id, sync]);
            }
            return {};
        }
        for (const [id, sync] of Object.entries(syncIds)) {
            await this.database.exec(`UPDATE ${this.database.table('crud_log')} SET sync = ? WHERE id = ?`, [sync, id]);
        }
        return {};
    }

    private async createTable(table: string, comment: string, fields: Record<string, unknown>[]) {
        const full = this.fullTable(table);
        const kept = fields.filter((field) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(field.name || '')));
        const primaryCount = kept.filter((field) => field.primaryKey).length;
        const lines: string[] = [];
        const keys: string[] = [];
        for (const field of kept) {
            lines.push(this.columnSql(field, primaryCount));
            if (field.primaryKey && !(primaryCount === 1 && this.sqliteInteger(field))) keys.push(qi(String(field.name)));
        }
        if (keys.length) lines.push(`PRIMARY KEY (${keys.join(',')})`);
        await this.database.exec(`CREATE TABLE ${qi(full)} (${lines.join(',')})`);
        await this.rememberTable(full, comment, kept);
        await this.database.refreshCatalog();
    }

    private sqliteInteger(field: Record<string, unknown>): boolean {
        return ['int', 'tinyint', 'bigint', 'smallint', 'mediumint', 'integer'].includes(String(field.type || '').toLowerCase());
    }

    private columnSql(field: Record<string, unknown>, primaryCount: number): string {
        const name = String(field.name);
        const type = String(field.type || 'varchar').toLowerCase();
        let sqlType = 'TEXT';
        if (this.sqliteInteger(field)) sqlType = 'INTEGER';
        else if (['decimal', 'float', 'double', 'real'].includes(type)) sqlType = 'REAL';
        else if (type.includes('blob') || type === 'binary' || type === 'varbinary') sqlType = 'BLOB';
        const inlineKey = Boolean(field.primaryKey) && primaryCount === 1 && sqlType === 'INTEGER';
        let column = `${qi(name)} ${sqlType}`;
        if (inlineKey) column += field.autoIncrement ? ' PRIMARY KEY AUTOINCREMENT' : ' PRIMARY KEY';
        column += field.null && !inlineKey ? ' NULL' : ' NOT NULL';
        const defaultType = String(field.defaultType || 'NONE');
        if (!field.autoIncrement && defaultType === 'NULL') column += ' DEFAULT NULL';
        else if (!field.autoIncrement && defaultType === 'EMPTY STRING') column += " DEFAULT ''";
        else if (!field.autoIncrement && defaultType === 'INPUT' && field.default !== undefined && field.default !== null && field.default !== '') {
            column += ` DEFAULT ${this.sqlString(String(field.default))}`;
        }
        return column;
    }

    private async rememberTable(table: string, comment: string, fields: Record<string, unknown>[]) {
        await this.database.exec('INSERT OR REPLACE INTO schema_note (table_name, column_name, column_comment, ordinal_position) VALUES (?, ?, ?, 0)', [
            table,
            '',
            comment,
        ]);
        let ordinal = 1;
        for (const field of fields) {
            const name = String(field.name);
            const dataType = String(field.type || 'varchar');
            await this.database.exec(
                `INSERT OR REPLACE INTO schema_note
                (table_name, column_name, data_type, column_type, column_comment, is_nullable, column_default, column_key, extra, ordinal_position)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    table,
                    name,
                    dataType,
                    String(field.dataType || dataType),
                    String(field.comment || field.title || name),
                    field.null ? 'YES' : 'NO',
                    noteDefault(field),
                    field.primaryKey ? 'PRI' : '',
                    field.autoIncrement ? 'auto_increment' : '',
                    ordinal,
                ],
            );
            ordinal += 1;
        }
    }

    private writeResource(table: string, controller: NameInfo, fields: Record<string, unknown>[]): CrudResource {
        const quick = quickNames(fields);
        const arrayFields = fields
            .filter((field) => ['checkbox', 'selects', 'remoteSelects', 'city', 'images', 'files'].includes(String(field.designType)))
            .map((field) => String(field.name));
        const jsonFields = fields.filter((field) => String(field.designType) === 'array').map((field) => String(field.name));
        const joins = fields.map((field) => relationOf(field)).filter((item): item is RelationJoin => Boolean(item));
        const resource: CrudResource = {
            key: [...controller.path, controller.original].join('/').toLowerCase(),
            table,
            pk: String(fields.find((field) => field.primaryKey)?.name || 'id'),
            alias: table,
            quickSearchField: quick,
            preExcludeFields: ['create_time', 'update_time'],
            timestamps: { create: true, update: true },
            ...(arrayFields.length ? { arrayFields } : {}),
            ...(jsonFields.length ? { jsonFields } : {}),
            ...(joins.length
                ? {
                      joins: joins.map((item) => ({
                          as: item.as,
                          nest: item.as,
                          table: item.table,
                          local: item.local,
                          foreign: item.foreign,
                          fields: item.foreign === item.show ? [item.foreign] : [item.foreign, item.show],
                      })),
                  }
                : {}),
            ...resourceExtras(fields),
        };
        const file = this.absTs(controller);
        mkdirSync(dirname(file), { recursive: true });
        if (!existsSync(file)) writeFileSync(file, renderController(controller, resource), 'utf8');
        else {
            const current = readFileSync(file, 'utf8');
            const next = replaceResourceBlock(current, resource);
            if (next && next !== current) writeFileSync(file, next, 'utf8');
        }
        this.writeControllerIndex();
        const loaded = crudControllers.get(resource.key);
        if (loaded instanceof CrudController) loaded.resource = resource;
        else if (!loaded) registerController(new CrudController(resource));
        return resource;
    }

    private writeVue(table: Record<string, unknown>, controller: NameInfo, views: ViewInfo, fields: Record<string, unknown>[]) {
        const scriptEnd = '</' + 'script>';
        const ns = `${this.menuName(views).replace(/\//g, '.')}.`;
        const url = `/admin/${[...controller.path, controller.original].join('.').toLowerCase()}/`;
        const weighField = fields.find((field) => String(field.designType) === 'weigh' || String(field.name) === 'weigh');
        const weighName = weighField ? String(weighField.name).replace(/[^A-Za-z0-9_]/g, '') : '';
        const columns = [
            `{ type: 'selection', align: 'center', operator: false },`,
            ...fields.filter((field) => !field.tableBuildExclude && String(field.designType) !== 'editor').map((field) => columnOf(ns, field)),
            `{ label: t('Operate'), align: 'center', width: ${weighName ? 140 : 100}, render: 'buttons', buttons: optButtons, operator: false },`,
        ];
        const dir = this.abs(views.views);
        mkdirSync(dir, { recursive: true });
        const component = this.menuName(views);
        const indexFile = join(dir, 'index.vue');
        writeFileSync(
            indexFile,
            `<template>
    <div class="default-main ba-table-box">
        <el-alert class="ba-table-alert" v-if="baTable.table.remark" :title="baTable.table.remark" type="info" show-icon />
        <TableHeader :buttons="['refresh', 'add', 'edit', 'delete', 'comSearch', 'quickSearch', 'columnDisplay']" :quick-search-placeholder="t('Quick search placeholder', { fields: t('${ns}quick Search Fields') })"></TableHeader>
        <Table ref="tableRef"></Table>
        <PopupForm />
    </div>
</template>

<script setup lang="ts">
import { onMounted, provide, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import PopupForm from './popupForm.vue'
import { baTableApi } from '/@/api/common'
import { defaultOptButtons } from '/@/components/table'
import TableHeader from '/@/components/table/header/index.vue'
import Table from '/@/components/table/index.vue'
import baTableClass from '/@/utils/baTable'

defineOptions({
    name: '${component}',
})

const { t } = useI18n()
const tableRef = useTemplateRef('tableRef')
const optButtons: OptButton[] = defaultOptButtons(${weighName ? "['weigh-sort', 'edit', 'delete']" : "['edit', 'delete']"})
const baTable = new baTableClass(
    new baTableApi('${url}'),
    {
        pk: '${fields.find((field) => field.primaryKey)?.name || 'id'}',
        column: [
            ${columns.join('\n            ')}
        ],
        dblClickNotEditColumn: [undefined],${weighName ? `\n        defaultOrder: { prop: '${weighName}', order: 'desc' },` : ''}
    },
    {
        defaultItems: { ${defaultItems(fields)} },
    }
)

provide('baTable', baTable)

onMounted(() => {
    baTable.table.ref = tableRef.value
    baTable.mount()
    baTable.getData()?.then(() => {
        baTable.initSort()
        baTable.dragSort()
    })
})
${scriptEnd}

<style scoped lang="scss"></style>
`,
            'utf8',
        );
        const written = readFileSync(indexFile, 'utf8');
        if (!written.includes('<template') || !written.includes(scriptEnd)) {
            throw new ApiError('列表页生成失败');
        }
        const formFields = fields
            .filter((field) => !field.formBuildExclude && !field.primaryKey)
            .map((field) => formField(ns, field))
            .join('\n                    ');
        const ruleLines = formRuleLines(ns, fields);
        const ruleImport = ruleLines ? "import { buildValidatorData } from '/@/utils/validate'\n" : '';
        writeFileSync(
            join(dir, 'popupForm.vue'),
            `<template>
    <el-dialog class="ba-operate-dialog" :close-on-click-modal="false" :model-value="['Add', 'Edit'].includes(baTable.form.operate!)" @close="baTable.toggleForm">
        <template #header>
            <div class="title" v-drag="['.ba-operate-dialog', '.el-dialog__header']" v-zoom="'.ba-operate-dialog'">
                {{ baTable.form.operate ? t(baTable.form.operate) : '' }}
            </div>
        </template>
        <el-scrollbar v-loading="baTable.form.loading" class="ba-table-form-scrollbar">
            <div class="ba-operate-form" :class="'ba-' + baTable.form.operate + '-form'" :style="config.layout.shrink ? '' : 'width: calc(100% - ' + baTable.form.labelWidth! / 2 + 'px)'">
                <el-form v-if="!baTable.form.loading" ref="formRef" @submit.prevent="" @keyup.enter="baTable.onSubmit(formRef)" :model="baTable.form.items" :label-position="config.layout.shrink ? 'top' : 'right'" :label-width="baTable.form.labelWidth + 'px'" :rules="rules">
                    ${formFields}
                </el-form>
            </div>
        </el-scrollbar>
        <template #footer>
            <div :style="'width: calc(100% - ' + baTable.form.labelWidth! / 1.8 + 'px)'">
                <el-button @click="baTable.toggleForm()">{{ t('Cancel') }}</el-button>
                <el-button v-blur :loading="baTable.form.submitLoading" @click="baTable.onSubmit(formRef)" type="primary">
                    {{ baTable.form.operateIds && baTable.form.operateIds.length > 1 ? t('Save and edit next item') : t('Save') }}
                </el-button>
            </div>
        </template>
    </el-dialog>
</template>

<script setup lang="ts">
import type { FormItemRule } from 'element-plus'
import { inject, reactive, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import FormItem from '/@/components/formItem/index.vue'
import { useConfig } from '/@/stores/config'
import type baTableClass from '/@/utils/baTable'
${ruleImport}
const config = useConfig()
const formRef = useTemplateRef('formRef')
const baTable = inject('baTable') as baTableClass
const { t } = useI18n()
const rules: Partial<Record<string, FormItemRule[]>> = reactive(${ruleLines ? `{\n${ruleLines}\n}` : '{}'})
${scriptEnd}

<style scoped lang="scss"></style>
`,
            'utf8',
        );
    }

    private writeLang(views: ViewInfo, fields: Record<string, unknown>[]) {
        const lines: string[] = [];
        for (const field of fields) {
            const name = String(field.name);
            const dict = fieldDict(field);
            const title = dict.length ? dictTitle(field) : String(field.title || field.comment || name);
            lines.push(`    ${JSON.stringify(name)}: ${JSON.stringify(title)},`);
            for (const item of dict) lines.push(`    ${JSON.stringify(`${name} ${item.key}`)}: ${JSON.stringify(item.label)},`);
        }
        const titles = new Map(fields.map((field) => [String(field.name), String(field.title || field.name)]));
        const quick = quickNames(fields)
            .map((name) => titles.get(name) || name)
            .join('、');
        const body = `export default {\n${lines.join('\n')}\n    'quick Search Fields': ${JSON.stringify(quick)},\n}\n`;
        for (const file of [views.langZh, views.langEn]) {
            const abs = this.abs(file) + '.ts';
            mkdirSync(dirname(abs), { recursive: true });
            writeFileSync(abs, body, 'utf8');
        }
    }

    private async writeMenu(table: Record<string, unknown>, views: ViewInfo) {
        const name = this.menuName(views);
        const title = String(table.comment || name);
        const component = `/${views.views}/index.vue`;
        const existing = await this.database.query(`SELECT id FROM ${this.database.table('admin_rule')} WHERE name = ?`, [name]);
        let pid = Number(existing[0]?.id || 0);
        if (!pid) {
            const inserted = await this.database.exec(
                `INSERT INTO ${this.database.table('admin_rule')}
                (pid, type, title, name, path, icon, menu_type, url, component, keepalive, extend, remark, weigh, status, update_time, create_time)
                VALUES (0, 'menu', ?, ?, ?, 'fa fa-table', 'tab', '', ?, 0, 'none', '', 0, 1, ?, ?)`,
                [title, name, name, component, now(), now()],
            );
            pid = inserted.insertId;
        }
        const buttons = [
            ['查看', '/index'],
            ['添加', '/add'],
            ['编辑', '/edit'],
            ['删除', '/del'],
            ['快速排序', '/sortable'],
        ];
        for (const [label, suffix] of buttons) {
            const buttonName = name + suffix;
            const found = await this.database.query(`SELECT id FROM ${this.database.table('admin_rule')} WHERE name = ?`, [buttonName]);
            if (found.length) continue;
            await this.database.exec(
                `INSERT INTO ${this.database.table('admin_rule')}
                (pid, type, title, name, path, icon, menu_type, url, component, keepalive, extend, remark, weigh, status, update_time, create_time)
                VALUES (?, 'button', ?, ?, '', '', NULL, '', '', 0, 'none', '', 0, 1, ?, ?)`,
                [pid, label, buttonName, now(), now()],
            );
        }
    }

    private async writeLog(table: Record<string, unknown>, fields: unknown, status: string) {
        const columns = await this.database.query(
            `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
            [dbConfig.database, this.database.table('crud_log')],
        );
        const names = new Set(columns.map((row) => String(row.COLUMN_NAME)));
        const data: Record<string, unknown> = {
            table_name: table.name,
            comment: table.comment || '',
            table: JSON.stringify(table),
            fields: JSON.stringify(fields),
            status,
            connection: table.databaseConnection || 'sqlite',
            sync: 0,
            create_time: now(),
        };
        const keys = Object.keys(data).filter((key) => names.has(key));
        const result = await this.database.exec(
            `INSERT INTO ${this.database.table('crud_log')} (${keys.map(qi).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
            keys.map((key) => data[key]),
        );
        return result.insertId;
    }

    private columnToField(item: Record<string, unknown>) {
        const nullable = item.IS_NULLABLE === 'YES';
        const columnType = String(item.COLUMN_TYPE || '');
        return {
            name: item.COLUMN_NAME,
            type: item.DATA_TYPE,
            dataType: columnType,
            default: columnDefaultValue(item.COLUMN_DEFAULT),
            defaultType: columnDefaultType(nullable, item.COLUMN_DEFAULT),
            null: nullable,
            primaryKey: item.COLUMN_KEY === 'PRI',
            unsigned: /unsigned/i.test(columnType),
            autoIncrement: /auto_increment/i.test(String(item.EXTRA || '')),
            comment: item.COLUMN_COMMENT || '',
            designType: designOf(String(item.DATA_TYPE || ''), String(item.COLUMN_NAME || '')),
            table: {},
            form: {},
        };
    }

    parseController(table: string, value: string): NameInfo {
        const parts = splitName(value || table, ['app', 'admin', 'controller']);
        const original = parts.pop() || table;
        const path = parts.map((item) => item.toLowerCase());
        const last = original.charAt(0).toUpperCase() + original.slice(1);
        const rootFileName = `app/admin/controller${path.length ? `/${path.join('/')}` : ''}/${last}.php`;
        return { path, last, original, rootFileName };
    }

    private parseViews(table: string, value: string): ViewInfo {
        const parts = splitWebDir(value || table);
        const original = (parts.pop() || table).replace(/\.vue$/i, '');
        const path = parts.map((item) => item.toLowerCase());
        const last = original.charAt(0).toLowerCase() + original.slice(1);
        const base = path.length ? `${path.join('/')}/${last}` : last;
        return {
            path,
            original: last,
            views: `src/views/backend/${base}`,
            langZh: `src/lang/backend/zh-cn/${base}`,
            langEn: `src/lang/backend/en/${base}`,
            webViews: `web/src/views/backend/${base}`,
        };
    }

    private menuName(views: ViewInfo): string {
        return views.path.length ? `${views.path.join('/')}/${views.original}` : views.original;
    }

    private async controllerList() {
        const list: Record<string, string> = {};
        const builtin = ['auth/Admin', 'auth/Group', 'auth/Rule', 'user/User', 'user/Group', 'user/Rule', 'routine/Attachment'];
        for (const item of builtin) {
            const file = `app/admin/controller/${item}.php`;
            list[file] = file;
        }
        return list;
    }

    private tsPath(controller: NameInfo): string {
        return relative(SERVER_ROOT, this.absTs(controller)).replace(/\\/g, '/');
    }

    private absTs(controller: NameInfo): string {
        return join(SERVER_ROOT, 'server', 'admin', 'controller', ...controller.path, `${controller.original.toLowerCase()}.ts`);
    }

    private writeControllerIndex() {
        const root = join(SERVER_ROOT, 'server', 'admin', 'controller');
        mkdirSync(root, { recursive: true });
        const files: string[] = [];
        const walk = (dir: string) => {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
                const full = join(dir, entry.name);
                if (entry.isDirectory()) walk(full);
                else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) files.push(full);
            }
        };
        walk(root);
        files.sort((a, b) => a.replace(/\\/g, '/').localeCompare(b.replace(/\\/g, '/')));
        const used = new Set<string>();
        const rows = files.map((file) => {
            const rel = relative(root, file).replace(/\\/g, '/').replace(/\.ts$/, '');
            let name = rel
                .split('/')
                .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                .join('')
                .replace(/[^\w$]/g, '');
            if (!/^[A-Za-z_$]/.test(name)) name = `C${name}`;
            const base = name || 'Controller';
            let unique = base;
            let n = 2;
            while (used.has(unique)) unique = `${base}${n++}`;
            used.add(unique);
            return { name: unique, rel };
        });
        const imports = rows.map((row) => `import ${row.name} from './controller/${row.rel}';`).join('\n');
        const list = rows.map((row) => `    ${row.name},`).join('\n');
        const source = `${imports ? `${imports}\n` : ''}import type { AdminController } from './crud.controller';

const controllers: Array<new () => AdminController> = [
${list}
];

export default controllers;
`;
        writeFileSync(join(SERVER_ROOT, 'server', 'admin', 'controller-registry.ts'), source, 'utf8');
    }

    private abs(file: string): string {
        const full = insideRoot(SERVER_ROOT, file);
        if (!full) throw new ApiError('文件路径不合法');
        return full;
    }

    private fullTable(table: string): string {
        const name = table.replace(new RegExp(`^${dbConfig.prefix}`, 'i'), '');
        if (!/^[A-Za-z0-9_]+$/.test(name)) throw new ApiError('表名不合法');
        return dbConfig.prefix + name;
    }

    private async tableExists(table: string) {
        const rows = await this.database.query(
            `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
            [dbConfig.database, this.fullTable(table)],
        );
        return rows.length > 0;
    }

    private sqlString(value: string): string {
        return `'${value.replace(/'/g, "''")}'`;
    }

    private safeUnlink(file: string) {
        const allowed = [join(SERVER_ROOT, 'src', 'views'), join(SERVER_ROOT, 'src', 'lang'), join(SERVER_ROOT, 'server', 'admin', 'controller')];
        if (!allowed.some((root) => insideRoot(root, file))) return;
        const full = resolve(file);
        if (existsSync(full)) rmSync(full);
    }
}

export interface GeneratePlan {
    table: Record<string, unknown>;
    fieldList: Record<string, unknown>[];
    tableName: string;
    controller: NameInfo;
    views: ViewInfo;
    rebuild: boolean;
}

export interface ViewInfo {
    path: string[];
    original: string;
    views: string;
    langZh: string;
    langEn: string;
    webViews: string;
}

function insideRoot(root: string, file: string): string | null {
    const base = resolve(root);
    const full = resolve(base, file);
    const norm = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const left = norm(full);
    const right = norm(base);
    if (left !== right && !left.startsWith(right + '/')) return null;
    return full;
}

function splitName(value: string, redundant: string[]): string[] {
    const cleaned = value.replace(/\.php$/i, '').replace(/[.\\]/g, '/').replace(/_/g, '/');
    return cleaned
        .split('/')
        .filter(Boolean)
        .filter((item, index) => !(redundant[index] && redundant[index] === item));
}

function splitWebDir(value: string): string[] {
    const redundant: Record<string, number> = {
        web: 0,
        src: 1,
        views: 2,
        lang: 2,
        backend: 3,
        pages: 3,
        en: 4,
        'zh-cn': 4,
    };
    const items = value
        .replace(/\.vue$/i, '')
        .replace(/[.\\]/g, '/')
        .replace(/_/g, '/')
        .split('/')
        .filter(Boolean);
    const offset = items[0] === 'src' ? 1 : 0;
    return items.filter((item, index) => redundant[item] !== index + offset);
}

function quickNames(fields: Record<string, unknown>[]): string[] {
    const pk = String(fields.find((field) => field.primaryKey)?.name || 'id');
    const quick = fields
        .filter((field) => ['string', 'textarea', 'number'].includes(String(field.designType)) && !field.formBuildExclude)
        .slice(0, 3)
        .map((field) => String(field.name));
    if (!quick.includes(pk)) quick.unshift(pk);
    return quick;
}

function formBag(field: Record<string, unknown>): Record<string, unknown> {
    return field.form && typeof field.form === 'object' ? (field.form as Record<string, unknown>) : {};
}

interface RelationJoin {
    as: string;
    table: string;
    foreign: string;
    show: string;
    local: string;
}

function remoteMeta(field: Record<string, unknown>): RelationJoin | null {
    const design = String(field.designType || '');
    if (design !== 'remoteSelect' && design !== 'remoteSelects') return null;
    const form = formBag(field);
    const table = String(form['remote-table'] || '').trim();
    const foreign = String(form['remote-pk'] || 'id').trim() || 'id';
    const show = String(form['remote-field'] || 'name').trim() || 'name';
    const local = String(field.name || '');
    if (!/^[A-Za-z0-9_]+$/.test(table) || !/^[A-Za-z0-9_]+$/.test(foreign) || !/^[A-Za-z0-9_]+$/.test(show) || !/^[A-Za-z0-9_]+$/.test(local)) return null;
    return { as: `${local}_rel`, table, foreign, show, local };
}

function resourceExtras(fields: Record<string, unknown>[]): Partial<CrudResource> {
    const yearFields = fields.filter((field) => String(field.designType) === 'year').map((field) => String(field.name));
    const cityFields = fields.filter((field) => String(field.designType) === 'city').map((field) => String(field.name));
    const lookupFields = fields
        .filter((field) => String(field.designType) === 'remoteSelects')
        .map((field) => remoteMeta(field))
        .filter((item): item is RelationJoin => Boolean(item))
        .map((item) => ({
            field: item.local,
            table: item.table,
            pk: item.foreign,
            label: item.show,
            text: `${item.local}_text`,
        }));
    return {
        ...(yearFields.length ? { yearFields } : {}),
        ...(cityFields.length ? { cityFields } : {}),
        ...(lookupFields.length ? { lookupFields } : {}),
    };
}

function relationOf(field: Record<string, unknown>): RelationJoin | null {
    if (String(field.designType || '') !== 'remoteSelect') return null;
    return remoteMeta(field);
}

function numberStep(field: Record<string, unknown>): number {
    const form = formBag(field);
    if (form.step !== undefined && form.step !== '' && form.step !== null && !Number.isNaN(Number(form.step))) return Number(form.step);
    const design = String(field.designType || '');
    if (design === 'float') {
        const precision = Number(field.precision || 0);
        return precision > 0 ? Number((1 / 10 ** precision).toFixed(precision)) : 0.1;
    }
    return 1;
}

function jsString(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function operatorOf(design: string, fromTable?: unknown): string | false {
    const raw = fromTable === undefined || fromTable === null || fromTable === '' ? '' : String(fromTable);
    if (raw === 'false') return false;
    if (raw === 'eq') return '=';
    if (raw) return raw;
    if (['number', 'float', 'weigh', 'pk', 'switch', 'radio', 'select', 'remoteSelect'].includes(design)) return '=';
    if (['datetime', 'timestamp', 'date', 'time', 'year'].includes(design)) return 'RANGE';
    if (['checkbox', 'selects', 'remoteSelects'].includes(design)) return 'FIND_IN_SET';
    if (['icon', 'color', 'image', 'images', 'file', 'files', 'textarea', 'editor', 'array', 'password', 'city'].includes(design)) return false;
    return 'LIKE';
}

function inputType(design: string): string {
    const map: Record<string, string> = {
        switch: 'switch',
        textarea: 'textarea',
        password: 'password',
        radio: 'radio',
        checkbox: 'checkbox',
        select: 'select',
        selects: 'selects',
        datetime: 'datetime',
        timestamp: 'datetime',
        date: 'date',
        time: 'time',
        year: 'year',
        image: 'image',
        images: 'images',
        file: 'file',
        files: 'files',
        editor: 'editor',
        city: 'city',
        remoteSelect: 'remoteSelect',
        remoteSelects: 'remoteSelects',
        array: 'array',
        number: 'number',
        float: 'number',
        weigh: 'number',
        icon: 'icon',
        color: 'color',
    };
    return map[design] || 'string';
}

function defaultItems(fields: Record<string, unknown>[]): string {
    const arrays = new Set(['checkbox', 'selects', 'remoteSelects', 'city', 'images', 'files']);
    return fields
        .filter((field) => !field.primaryKey && (String(field.designType) === 'array' || (field.default !== undefined && field.default !== '')))
        .map((field) => {
            const design = String(field.designType || '');
            if (design === 'array' && (field.default === undefined || field.default === '')) return `${field.name}: []`;
            if (arrays.has(design) && typeof field.default === 'string') {
                return `${field.name}: ${JSON.stringify(field.default.split(',').filter(Boolean))}`;
            }
            if (['number', 'float', 'weigh'].includes(design)) return `${field.name}: ${Number(field.default)}`;
            return `${field.name}: ${JSON.stringify(field.default)}`;
        })
        .join(', ');
}

function columnOf(ns: string, field: Record<string, unknown>): string {
    const name = String(field.name);
    const design = String(field.designType || 'string');
    const table = field.table && typeof field.table === 'object' ? (field.table as Record<string, unknown>) : {};
    const renderMap: Record<string, string> = {
        switch: 'switch',
        image: 'image',
        images: 'images',
        timestamp: 'datetime',
        radio: 'tag',
        select: 'tag',
        checkbox: 'tags',
        selects: 'tags',
        icon: 'icon',
        color: 'color',
        file: 'file',
        files: 'files',
    };
    const searchRender: Record<string, string> = {
        date: 'date',
        time: 'time',
        datetime: 'datetime',
    };
    const tableRender = table.render && table.render !== 'none' ? String(table.render) : '';
    const render = tableRender || renderMap[design] || '';
    const relation = relationOf(field);
    const prop = relation ? `${relation.as}.${relation.show}` : name;
    const operator = relation ? 'LIKE' : operatorOf(design, table.operator);
    const dict = fieldDict(field);
    let extra = render ? `, render: '${render}'` : '';
    if (render === 'datetime') extra += `, timeFormat: 'yyyy-mm-dd hh:MM:ss'`;
    if (design === 'array') {
        extra += `, formatter: (row, column, cellValue) => Array.isArray(cellValue) ? JSON.stringify(cellValue) : (cellValue ?? '')`;
    }
    if (design === 'year') {
        extra += `, formatter: (row, column, cellValue) => { const text = cellValue == null || cellValue === '' ? '' : String(cellValue); const matched = text.match(/^(-?\\d+)(?:\\.0+)?$/); return matched ? matched[1] : text }`;
    }
    if (design === 'city' || (design === 'remoteSelects' && remoteMeta(field))) {
        extra += `, formatter: (row, column, cellValue) => { const named = row[String(column.property || '') + '_text']; if (named) return named; if (Array.isArray(cellValue)) return cellValue.join('、'); return cellValue ?? '' }`;
    }
    if (!render && searchRender[design]) extra += `, comSearchRender: '${searchRender[design]}'`;
    if (dict.length && (['tag', 'tags', 'switch'].includes(render) || ['radio', 'checkbox', 'select', 'selects'].includes(design))) {
        const replace = dict.map((item) => `${JSON.stringify(item.key)}: t('${ns}${name} ${item.key}')`).join(', ');
        extra += `, replaceValue: { ${replace} }`;
    }
    return `{ label: t('${ns}${name}'), prop: '${prop}', align: 'center', operator: ${operator === false ? 'false' : `'${operator}'`}${extra} },`;
}

function noteDefault(field: Record<string, unknown>): string | null {
    const defaultType = String(field.defaultType || 'NONE');
    if (defaultType === 'EMPTY STRING') return "''";
    if (defaultType === 'NULL' || defaultType === 'NONE') return null;
    if (field.default === undefined || field.default === null || field.default === '') return null;
    return String(field.default);
}

function columnDefaultType(nullable: boolean, value: unknown): string {
    if (value === null || value === undefined) return nullable ? 'NULL' : 'NONE';
    if (value === '' || value === "''") return 'EMPTY STRING';
    return 'INPUT';
}

function columnDefaultValue(value: unknown): string {
    if (value === null || value === undefined || value === '' || value === "''") return '';
    return String(value);
}

function isFormRequired(field: Record<string, unknown>): boolean {
    if (field.formBuildExclude || field.primaryKey || field.autoIncrement) return false;
    const name = String(field.name || '');
    if (name === 'create_time' || name === 'update_time') return false;
    if (field.null === true || field.null === 1 || field.null === '1' || field.null === 'true') return false;
    const defaultType = String(field.defaultType || 'NONE');
    if (defaultType === 'NULL' || defaultType === 'EMPTY STRING') return false;
    if (defaultType === 'INPUT' && field.default !== undefined && field.default !== null && String(field.default) !== '') return false;
    return true;
}

function formRuleLines(ns: string, fields: Record<string, unknown>[]): string {
    return fields
        .filter((field) => !field.formBuildExclude && !field.primaryKey && isFormRequired(field))
        .map((field) => {
            const name = String(field.name);
            const design = String(field.designType || 'string');
            const phrase = ['radio', 'checkbox', 'datetime', 'timestamp', 'year', 'date', 'time', 'select', 'selects', 'remoteSelect', 'remoteSelects', 'city', 'icon', 'switch'].includes(design)
                ? 'Please select field'
                : 'Please input field';
            return `    ${name}: [buildValidatorData({ name: 'required', title: t('${ns}${name}'), message: t('${phrase}', { field: t('${ns}${name}') }) })],`;
        })
        .join('\n');
}

function formField(ns: string, field: Record<string, unknown>): string {
    const name = String(field.name);
    const design = String(field.designType || 'string');
    const dict = fieldDict(field);
    const attrs = [
        `:label="t('${ns}${name}')"`,
        `type="${inputType(design)}"`,
        `v-model="baTable.form.items!.${name}"`,
        `prop="${name}"`,
    ];
    if (isFormRequired(field)) attrs.push('required');
    const inputAttr: string[] = [];
    if (dict.length && ['radio', 'checkbox', 'select', 'selects'].includes(design)) {
        const content = dict.map((item) => `${objectKey(item.key)}: t('${ns}${name} ${item.key}')`).join(', ');
        inputAttr.push(`content: { ${content} }`);
    }
    if (['number', 'float', 'weigh'].includes(design)) inputAttr.push(`step: ${numberStep(field)}`);
    const remote = remoteMeta(field);
    if (remote) {
        inputAttr.push(`pk: '${jsString(`${remote.table}.${remote.foreign}`)}'`);
        inputAttr.push(`field: '${jsString(remote.show)}'`);
        const url = String(formBag(field)['remote-url'] || '');
        if (url) inputAttr.push(`remoteUrl: '${jsString(url)}'`);
    }
    if (design === 'timestamp') inputAttr.push(`valueFormat: 'X'`);
    if (design === 'textarea') inputAttr.push('rows: 3');
    if (design === 'icon') inputAttr.push(`placement: 'top'`);
    if (inputAttr.length) attrs.push(`:input-attr="{ ${inputAttr.join(', ')} }"`);
    if (!['image', 'images', 'file', 'files', 'switch'].includes(design)) {
        const phrase = ['radio', 'checkbox', 'datetime', 'timestamp', 'year', 'date', 'time', 'select', 'selects', 'remoteSelect', 'remoteSelects', 'city', 'icon'].includes(design)
            ? 'Please select field'
            : 'Please input field';
        attrs.push(`:placeholder="t('${phrase}', { field: t('${ns}${name}') })"`);
    }
    return `<FormItem ${attrs.join(' ')} />`;
}

function objectKey(key: string): string {
    if (/^[A-Za-z_$][\w$]*$/.test(key)) return key;
    return `'${key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function fieldDict(field: Record<string, unknown>): { key: string; label: string }[] {
    const comment = String(field.comment || '').replace(/，/g, ',').replace(/：/g, ':');
    const mark = comment.indexOf(':');
    if (mark >= 0 && comment.includes('=') && comment.includes(',')) {
        return comment
            .slice(mark + 1)
            .split(',')
            .map((item) => {
                const eq = item.indexOf('=');
                if (eq <= 0) return null;
                const key = item.slice(0, eq).trim();
                const label = item.slice(eq + 1).trim();
                return key ? { key, label: label || key } : null;
            })
            .filter((item): item is { key: string; label: string } => Boolean(item));
    }
    const dataType = String(field.dataType || '');
    const matched = dataType.match(/\((.*)\)/);
    if (!matched || !/enum|set/i.test(dataType)) return [];
    return matched[1]
        .split(',')
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
        .map((key) => ({ key, label: key }));
}

function dictTitle(field: Record<string, unknown>): string {
    const comment = String(field.comment || '').replace(/，/g, ',').replace(/：/g, ':');
    const mark = comment.indexOf(':');
    if (mark > 0) return comment.slice(0, mark);
    return String(field.title || field.name || '');
}

function designOf(type: string, name: string): string {
    if (name === 'id') return 'pk';
    if (name.endsWith('_time') || type === 'datetime' || type === 'timestamp') return 'timestamp';
    if (name === 'status' || name.endsWith('switch')) return 'switch';
    if (name === 'weigh') return 'weigh';
    if (type.includes('text')) return 'textarea';
    if (type.includes('int')) return 'number';
    return 'string';
}

export function readGenerated(file: string): CrudResource | null {
    if (!existsSync(file)) return null;
    const source = readFileSync(file, 'utf8');
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    if (start < 0 || end < 0) return null;
    return JSON.parse(source.slice(start, end + 1)) as CrudResource;
}

function renderController(controller: NameInfo, resource: CrudResource): string {
    const up = '../'.repeat(controller.path.length + 1);
    const className = /^[A-Za-z_$][\w$]*$/.test(controller.last) ? controller.last : 'CrudRecord';
    return `import { CrudController } from '${up}crud.controller';
import type { CrudResource } from '${up}resource';

/* <resource> */
export const resource: CrudResource = ${JSON.stringify(resource, null, 4)};
/* </resource> */

export default class ${className} extends CrudController {
    constructor() {
        super(resource);
    }

    // 重写动作时保留同名方法，例如 async add(ctx, app) { return super.add(ctx, app) }
}
`;
}

function replaceResourceBlock(source: string, resource: CrudResource): string | null {
    const start = '/* <resource> */';
    const end = '/* </resource> */';
    const from = source.indexOf(start);
    const to = source.indexOf(end);
    if (from < 0 || to < from) return null;
    const block = `${start}\nexport const resource: CrudResource = ${JSON.stringify(resource, null, 4)};\n${end}`;
    return `${source.slice(0, from)}${block}${source.slice(to + end.length)}`;
}
