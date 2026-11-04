# 给后续开发使用的说明

本目录是独立的 SQLite 项目，不和 `../nuxt` 共用代码或数据库。开发地址是 `http://127.0.0.1:8002/`，数据文件是 `data/app.sqlite`。从 MySQL 工程导入初始数据的命令是 `pnpm import:sqlite`；仓库里的 `data/seed.sqlite` 是脱敏种子库，在 `data/app.sqlite` 不存在时执行 `pnpm db:init` 就能得到一套可登录、菜单齐全的库（管理员 `admin` / `123456`，登录后改掉）。

本目录是 BuildAdmin 的 Nuxt 实现。浏览器里仍是原来的 Vue 管理端和会员端，接口由 Nuxt / Nitro 直接读写 SQLite。继续开发时以本文件和当前代码为准。

## 启动和停止

依赖装过之后，在项目根执行 `pnpm dev`，或双击 `start.bat`。地址是 `http://127.0.0.1:8002/`，后台是 `http://127.0.0.1:8002/#/admin`。`close.bat` 关掉监听 8002 的进程。改控制器、表结构或 `schema_note` 后要重新执行一次，热更新看不到新列和新动作。

### 数据库从哪来

- `data/app.sqlite` 是运行数据，不入库。`data/seed.sqlite` 是唯一提交的数据库文件，带着 39 张表的结构、`schema_note`、菜单和基础数据。
- 新环境执行 `pnpm db:init`（`scripts/init-db.mjs`）。`data/app.sqlite` 已存在就跳过，重建加 `--force`。种子库管理员是 `admin` / `123456`，登录后改掉。
- 改过表结构、`schema_note`、菜单或基础数据之后，执行 `pnpm db:export`（`scripts/export-seed.mjs`）重新导出并提交，否则新环境拿到的还是旧结构。
- 导出会清空日志、token、验证码、上传记录和会员流水，只保留 `id = 1` 的管理员并重置密码，配置里的 `ai_api_key`、SMTP 账号密码清空，`site_logo`、`site_favicon` 置空。以后新增敏感配置，要同步写进脚本的 `scrubConfig`。
- 种子库用 `VACUUM INTO` 生成，是单文件、`journal_mode = DELETE`，不会带出 `-wal` / `-shm`。

新的后台列表按这个顺序做，不要先手写一整套页面：

1. 按下面的数据表设计规范写出设计：表名、表注释、字段名、类型、注释、`designType`、是否为空、默认值。图片、关联、城市必须带对 `designType`，不要先建一张裸表再让生成器猜控件。
2. 调用 `CrudCrud.generate`（`server/admin/controller/crud/crud.ts`）。已有手写页面的表不要带 `type: create`。
3. 检查 `index.vue` 里有 `<template`，菜单 `component` 指向这个文件，`_id` 补上 `pk`、`field`、`remoteUrl` 和 `joins`，`ba_crud_log.status` 为 `success`。然后重启 `pnpm dev`，登录后台打开新菜单。

后台右上角有「刷新当前选项卡」。布局配置里的「单选项卡」让菜单始终只留当前页。`layoutMode: Workbench` 是用户端工作台：顶栏只放站名和右侧操作，左侧是头像加菜单，右侧是当前页卡片。不要把它做成后台侧栏的窄边距版。单选项卡和工作台都要挂着 `NavTabs`，只是把标签条收起来，这样路由钩子仍会更新当前页。

`app/app.vue` 只负责在 `document.body` 上创建 `#app` 再调用 `bootLegacy()`。不要把 `#app` 放回 Nuxt 组件里面，两个 Vue 应用抢同一个节点时，开发环境会弹出 `parentNode` 报错。

仓库根目录的 `AGENTS.md`、本目录 `README.md` 里下面这些位置已经过期，不要再按它们改代码：

- `server/runtime/`
- `server/admin/resources.ts` 这种集中登记表资源的文件
- `src/generated/` 作为 CRUD 运行时注册目录
- 在 `DispatchService` 里用 `admin:控制器:动作` 分支实现后台接口

## 技术栈

- 宿主：Nuxt 4，`ssr: false`，开发地址 `http://127.0.0.1:8002/`，命令 `pnpm dev`
- 界面：Vue 3、Element Plus、hash 路由、Pinia、Axios、vue-i18n
- 服务端：Nitro 路由、Knex、Objection、better-sqlite3
- 数据库：SQLite 文件 `data/app.sqlite`，表前缀默认 `ba_`
- `package.json` 里的 `drizzle-orm` 当前没有作为查询入口。读写表用 `server/common/model.ts` 的 `table()`，或 `DatabaseService.query` / `exec`

源文件使用 UTF-8（无 BOM）、LF 换行，文件末尾保留一个空行，行尾不要留空格。不要提交 `.env`，不要在文档、日志或回复里写出数据库密码和 token。

`pnpm-workspace.yaml` 的 `allowBuilds` 每一项必须是布尔值。`es5-ext` 保持 `false`。不要运行交互式的 `pnpm approve-builds`。

## 请求怎么进来

```text
/admin/**  -> server/routes/admin/[...path].ts
/api/**    -> server/routes/api/[...path].ts
           -> server/kernel.ts handleLegacy()
           -> server/dispatch.service.ts
```

路径最后一段是动作，前面是控制器。点号会换成斜杠。

| 请求 | app | controllerPath | action |
| --- | --- | --- | --- |
| `/admin/auth.admin/index` | admin | `auth/admin` | `index` |
| `/admin/test102/add` | admin | `test102` | `add` |
| `/api/account/profile` | api | `account` | `profile` |

成功响应是 `{ code: 1, msg, time, data }`。`303` 未登录，`401` 无权限，`409` token 过期。后台请求头是 `batoken`，会员端是 `ba-user-token`。抛错用 `ApiError`，不要自己拼 JSON。

后台分发顺序：

1. `ajax/terminal` 单独处理，返回 SSE，不进控制器。
2. 用 `controllerPath` 查找 `crudControllers`。
3. 找到类方法就调用类方法，不再看路由表。
4. 没有类方法时，才用 `server/admin/index.ts` 和 `server/member/index.ts` 的路由表。会员端目前仍走路由表。
5. 都没有则返回“尚未迁移”。

权限节点是 `controllerPath/action`，例如 `auth/admin/index`，对应 `ba_admin_rule.name`。控制器上的 `noLogin`、`noPermission` 写动作名；`['*']` 表示该控制器全部动作。登录本身免登录，所以 `noLogin` 里的动作也会跳过权限检查。

## 后台控制器

一个表一个控制器，文件路径就是控制器路径：

| 文件 | 控制器 key | 请求前缀 |
| --- | --- | --- |
| `server/admin/controller/test102.ts` | `test102` | `/admin/test102/` |
| `server/admin/controller/auth/admin.ts` | `auth/admin` | `/admin/auth.admin/` |

表控制器继承 `CrudController`。基类已经有 `index`、`select`、`add`、`edit`、`del`、`sortable`。只改某一步时，在子类里写同名方法，需要通用逻辑就调用 `super`。参考 `server/admin/controller/auth/admin.ts`。

不是表的控制器继承 `AdminController`，在构造函数里传入 key。参考 `server/admin/controller/index.ts`（登录）和 `server/admin/controller/ajax.ts`。

类上的公开方法会变成 URL 动作。辅助函数不要写成控制器的公开方法，放到文件外的函数或 `server/admin/auth-shared.ts`。`resolveCrudAction` 只承认子类自己声明的方法，以及 `CrudController` 上的那六个基础动作。未匹配的动作如果子类实现了 `any(ctx, app)`，会落到 `any`。`module` 目前用 `any` 返回尚未迁移。

新增控制器文件后，必须出现在 `server/admin/controller-registry.ts`。这个文件由生成器按 `server/admin/controller/**/*.ts` 全量重写：跳过 `.d.ts`，包含 `index.ts`。导入名是路径各段首字母大写后拼接，例如 `auth/admin` 为 `AuthAdmin`。手写控制器时按同样格式加 import；下次执行 CRUD 生成也会把它扫进去。Nitro 没有 `import.meta.glob`，所以不能改成运行时扫目录。

改控制器、表结构或 `schema_note` 后，重启一次 `pnpm dev` 再测接口。列信息和控制器实例都在进程内存里，正在跑的服务看不到新列和新动作。只改已有的 vue 通常能热更新。

## 表资源

`CrudResource` 定义在 `server/admin/resource.ts`。生成出来的控制器把资源放在文件顶部的 `/* <resource> */` 注释里。再次生成时只替换这块，类里手写的方法会保留。`index.vue`、`popupForm.vue` 和语言包会被整份覆盖，页面上后加的列、按钮和弹窗不会留下。

常用字段：

| 字段 | 作用 |
| --- | --- |
| `key` | 控制器路径，小写 |
| `table` | 不带前缀的表名，实际查询会加上 `ba_` |
| `pk` | 主键，默认 `id` |
| `quickSearchField` | 快速搜索列 |
| `preExcludeFields` | 新增和编辑时从提交数据里去掉 |
| `hiddenFields` | 列表和详情里不返回 |
| `timestamps` | `create_time` / `update_time` |
| `dataLimit` | `personal`、`allAuth`、`allAuthAndOthers`、`parent` 或分组 id |
| `joins` | 列表联表 |

列表、表单的通用实现在 `server/admin/crud.service.ts`。筛选条件来自前端的 `search`、`quickSearch`、`order`、`limit`。

## 页面和菜单

标准列表页：

```text
src/views/backend/{路径}/index.vue       路由入口，菜单 component 指向它
src/views/backend/{路径}/popupForm.vue   新增和编辑弹窗
src/lang/backend/zh-cn/{路径}.ts
src/lang/backend/en/{路径}.ts
```

菜单行在 `ba_admin_rule`。页面菜单的 `component` 必须是 `/src/views/backend/.../index.vue`，并且这个文件里要有 `<template>` 或 `<script>`。空文件会让 Vite 编译失败，前端弹出“导航失败，路由无效！”。

`src/utils/router.ts` 用 `import.meta.glob('../views/backend/**/*.vue')` 注册组件，并把键归一成 `/src/views/...`。菜单的 `component` 必须和这个键一致。开发中新加的 vue 文件要等 Vite 重新扫描后才会进路由；CRUD 生成结束时前端会发 `reloadServer('crud')`。手写页面后让用户刷新后台。

表格用 `src/utils/baTable.ts` 和 `src/components/table`。接口地址写成 `/admin/test102/` 这种形式，由 `baTableApi` 拼上 `index`、`add`、`edit`、`del`。新的独立请求函数放在 `src/api/`。

语言包按 `src/lang/backend/{locale}/{控制器路径}.ts` 放置。键名与页面里的 `t('test102.string')` 对应。

## 数据表设计规范

可视化 CRUD 按 [BuildAdmin 数据表设计规范]决定控件。新建表、给生成器补字段时按下面的类型、名称、后缀和注释来设计。不支持复合主键，每张表只用一个主键字段。

字段类型：

| 类型 | CRUD |
| --- | --- |
| `enum` | 单选框 |
| `set` | 复选框 |
| `date` / `year` / `time` | 对应的日期、年份、时间选择 |
| `datetime` / `timestamp` | 日期时间选择 |
| `decimal` / `double` / `float` | 数字输入，步长按默认值 |
| `int` / `bigint` / `mediumint` / `smallint` / `tinyint` | 数字输入，步长 1 |
| `longtext` / `text` / `mediumtext` / `smalltext` / `tinytext` | 多行文本 |

固定字段名：

| 名称 | 类型 | 含义 |
| --- | --- | --- |
| `weigh` | `int` | 权重。有此字段时列表可拖拽排序 |
| `create_time` | `bigint` | 创建时间，由程序写入，不在表单里手填 |
| `update_time` | `bigint` | 更新时间，由程序写入，不在表单里手填 |

按字段名结尾识别控件：

| 结尾 | 示例 | 类型要求 | 控件 |
| --- | --- | --- | --- |
| `array` | `namearray` | 无 | 数组输入 |
| `list` / `select` / `data` | `namelist` | 无 | 下拉单选 |
| `lists` / `selects` / `multi` | `name_selects` | 无 | 下拉多选 |
| `_id` | `user_id` | 无 | 关联表远程下拉，单选 |
| `_ids` | `user_ids` | 无 | 关联表远程下拉，多选 |
| `city` | `city` | 无 | 城市选择。本系统未装省份城市数据时不要靠它生成可用页面 |
| `image` / `avatar` | `desc_image` | 无 | 单图上传 |
| `images` / `avatars` | `descimages` | 无 | 多图上传 |
| `file` | `attachfile` | 无 | 单文件上传 |
| `files` | `attachfiles` | 无 | 多文件上传 |
| `icon` | `icon` | 无 | 图标选择 |
| `color` | `color` | 无 | 颜色选择 |
| `number` / `int` / `num` | `add_num` | 无 | 数字输入 |
| `time` / `datetime` | `refreshtime` | `int` | 日期时间选择 |
| `textarea` / `multiline` / `rows` | `rows` | `varchar` | 多行文本 |
| `status` / `state` / `type` | `status` | `tinyint(1)` 或 `char(1)` | 单选 |
| `switch` / `toggle` | `log_switch` | `tinyint(1)` / `int` / `enum` / `char(1)` | 开关。`1` 为开，`0` 为关 |
| `content` / `editor` | `content` | text 家族 | 富文本 |

字段注释和表注释会被解析成字典。注释用半角符号，格式是 `标题:值=名称,值=名称`。

```text
状态:0=禁用,1=启用
菜单类型:tab=选项卡,link=链接,iframe=Iframe
扩展属性:none=无,add_rules_only=只添加为路由,add_menu_only=只添加为菜单
```

表注释带“表”字，例如 `会员组表`、`会员积分变动表`。官方文档里这会变成菜单标题“会员组管理”；本目录生成器当前把表注释原样写入 `ba_admin_rule.title`。

从已有表读字段时，`generator.service.ts` 的 `designOf()` 只自动识别：`id` 为主键，`weigh` 为权重，`status` 或以 `switch` 结尾为开关，以 `_time` 结尾或类型为 `datetime` / `timestamp` 为时间戳，文本类型为多行文本，整型为数字，其余为字符串。`image`、`_id`、`city` 这类后缀不会在这一步自动变成上传或远程下拉。要生成对应控件，把设计器里的 `designType` 设对。可用值与 `src/views/backend/crud/ai.ts` 一致：`pk`、`spk`、`weigh`、`timestamp`、`datetime`、`string`、`password`、`number`、`float`、`radio`、`checkbox`、`switch`、`textarea`、`array`、`year`、`date`、`time`、`select`、`selects`、`remoteSelect`、`remoteSelects`、`editor`、`city`、`image`、`images`、`file`、`files`、`icon`、`color`。

## CRUD 生成

入口是后台的 CRUD 设计页，接口是 `CrudCrud.generate`（`server/admin/controller/crud/crud.ts`），实现在 `server/admin/generator.service.ts`。字段名、类型和注释按上一节的数据表设计规范来，生成出的表格列和表单控件才会对。

一次生成会：

1. 按设计建表或在重建时删除后重建表。
2. 写 `server/admin/controller/{路径}.ts`，并重写 `controller-registry.ts`。
3. 写 `index.vue`、`popupForm.vue` 和中英文语言包。
4. 在 `ba_admin_rule` 写入菜单和查看、添加、编辑、删除、快速排序按钮。
5. 在 `ba_crud_log` 记一条 `status = success`。

生成时按同一套规则处理，避免页面和接口各判一次：

- 必填只认「非空且没有默认值」。`defaultType` 为 `EMPTY STRING`、`NULL`，或已经有默认值的字段，不带 `*`，`requireFields` 也不拦。主键、自增、`create_time`、`update_time` 除外。空字符串默认值写入 `schema_note.column_default`，值为 `''`；这条记录为空时才用 SQLite 表上的默认值。
- 表名里的 `_` 会变成控制器和菜单路径里的 `/`。`task_note` 会变成 `task/note`。一条主记录上的多条从属数据不要为此再生成一张菜单，放在主表的行操作里。
- `_id` 关联要在设计器里把 `designType` 设为 `remoteSelect`。生成器不写 `remoteUrl`，生成后补上 `pk`、`field`、`remoteUrl`，并在资源 `joins` 里联出列表要显示的列。可空关联不要标必填。
- 已有手写页面的表要加列时，用 `ALTER TABLE` 增加可空列，再改现有页面。不要用 `type: create` 重建。

从日志里删除生成记录时，只删菜单和代码，并把日志标成 `delete`。不要顺便 `DROP TABLE`，除非用户明确要求删表。

生成结束后，前端仍会调用终端命令 `npx.prettier`。服务端只回成功，不再启动 `npx prettier`。项目里没有 Prettier 配置，外部 Prettier 会改写刚生成的 vue，也曾把 `index.vue` 写成空文件。不要把这个命令改回 `spawn('npx', ['prettier', ...])`。

`writeVue` 写完 `index.vue` 后会读回文件，确认里面有 `<template` 和结束用的 script 标签。模板字符串里不要直接写下 `</script>`，用 `const scriptEnd = '</' + 'script>'` 插进去，避免打包器截断字符串。

## 会员端

会员接口加在 `server/member/index.ts` 的 `memberRoutes`。一条路由包括 `app: 'api'`、`controller`、`action`、`handle`，以及需要的 `noLogin`、`noPermission`、`audience`。`audience: 'none'` 表示不读登录态。

后台控制器不会处理 `/api/**`。`/api/ajax/upload` 这类接口在 `server/admin/ajax.ts`，内部再调用 `Ajax` 控制器。

## 继续开发时怎么选

- 新的后台列表：优先走 CRUD 生成。生成后再在控制器子类里补业务，不要把业务写进 `CrudController` 基类。
- 已有表要改查询或保存：只改对应控制器的同名动作。
- 新的后台接口但没有表：新建 `AdminController` 子类并登记到 `controller-registry.ts`。
- 新的会员接口：加到 `memberRoutes`。
- 只改一个页面的列或表单：改该目录的 `index.vue` 或 `popupForm.vue`，并补语言包。不要改 `src/components/table` 的通用行为，除非所有表都要变。

未接入的能力会返回“尚未迁移”：模块市场、安装器、短信发送、非本地存储上传、终端配置修改。当前上传只写本地 `public/storage`。

## 提供服务和上线

页面和接口在同一个 Node 进程里。`VITE_AXIOS_BASE_URL=getCurrentDomain` 表示浏览器请求当前域名，反代时不要把页面和接口拆到两个域名。开发用的 `pnpm dev` 只给本机改代码，不要直接暴露到公网。

环境：Node.js 22 或更高，pnpm 10 或更高。数据库是项目里的 `data/app.sqlite`，本目录没有迁移命令。换环境时执行 `pnpm db:init` 用 `data/seed.sqlite` 初始化；需要重做一份完整数据时，在能连上原来 MySQL 的机器上执行 `pnpm import:sqlite`。`.env` 放在项目根。这个项目读 `DB_FILE`、`DB_PREFIX`、`DB_DATABASE`（只当作 information_schema 里的库名）和 `TOKEN_KEY`。上线时把 `TOKEN_KEY` 设成独立随机串，并且以后保持不变，换掉它会使已登录的 token 全部失效。把 `data/app.sqlite` 和项目一起带走。

本机给自己或局域网使用：

```bash
pnpm install
pnpm build
```

只在本机打开时：

```bash
pnpm preview
```

这就是 `nuxt preview --port 8002 --host 127.0.0.1`。浏览器访问 `http://127.0.0.1:8002/`，后台是 `http://127.0.0.1:8002/#/admin`。

要让同一局域网的其他机器访问，在项目根启动构建产物，并监听所有网卡：

```bash
# Linux / macOS
PORT=8002 HOST=0.0.0.0 node .output/server/index.mjs
```

```powershell
# Windows PowerShell
$env:PORT = "8002"; $env:HOST = "0.0.0.0"; node .output/server/index.mjs
```

然后用这台机器的局域网 IP 加端口 8002 访问。防火墙需要放行该端口。

服务器上线：

1. 把整个项目目录放到服务器，包含 `package.json`、`src`、`public` 和 `.env`。不要只拷 `.output`。服务端用「同时存在 `package.json` 和 `src` 的目录」作为项目根，`.env` 和上传文件都相对这个目录。
2. 在服务器上执行 `pnpm install --frozen-lockfile` 和 `pnpm build`。也可以在构建机打包后，把 `.output` 和项目根一起拷上去。
3. 用进程环境变量或项目根 `.env` 提供 `DB_FILE`、`DB_PREFIX`、`DB_DATABASE`、`TOKEN_KEY`。进程环境变量优先。确认 `data/app.sqlite` 在项目根的 `data` 目录里。
4. 只监听本机，由 Nginx 或 Caddy 对公网提供 80/443：

```bash
PORT=8002 HOST=127.0.0.1 node .output/server/index.mjs
```

Nginx 示例：

```nginx
server {
    listen 80;
    server_name admin.example.com;
    client_max_body_size 50m;

    location /storage/ {
        alias /var/www/rechange-nuxt/public/storage/;
    }

    location / {
        proxy_pass http://127.0.0.1:8002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`/storage/` 要单独指到项目根的 `public/storage`。上传接口把文件写到这个目录，生产进程对外提供的静态文件却是构建时复制进 `.output/public` 的那一份，运行中新上传的文件不会自动出现在那里。`alias` 的路径以服务器上的项目根为准，目录不存在时先建好，并让运行用户可写。

`server/routes/storage/[...path].ts` 会在请求时直接读 `public/storage`，作为没有反向代理时的兜底（Windows 下 `start-prod.bat` 就用它）。有 Nginx 的 `alias` 时请求不会走到 Node，两者不冲突。

Windows 生产模式用项目根的 `build-prod.bat` 构建、`start-prod.bat` 启动，不要用 `start.bat`（那是 `pnpm dev`）。

用 systemd 或 pm2 保持进程，崩溃后自动拉起。改代码后需要重新 `pnpm build`，再重启这个进程。`pnpm dev` 的热更新不会作用到已经启动的 `.output`。

上线后检查：用管理员账号打开 `/#/admin` 并登录；上传一张图片，确认 `/storage/...` 能打开；`.env` 和 `TOKEN_KEY` 没有进入 Git。

## 自测

- 接口：看开发服务日志里的状态码和返回 `code`。`code == 1` 才算成功。
- 新页面：确认 `index.vue` 不是空文件，并且 Vite 能编译。地址形如 `/_nuxt/@fs/{绝对路径}/src/views/backend/.../index.vue`。
- 菜单：刷新已登录的后台后再点。权限节点没写进 `ba_admin_rule`，或新规则 id 没加进该分组的 `rules` 时，超管以外的账号会得到 `401`。`rules` 为 `*` 的分组不用改。
- 不要为了验证去打印或提交 `.env` 里的密码。
