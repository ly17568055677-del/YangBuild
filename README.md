# YangBuild

BuildAdmin 后台管理系统的 Nuxt 4 + SQLite 实现。浏览器里保留原有的 Vue 管理端和会员端界面，接口由 Nuxt / Nitro 直接读写本地 SQLite，不再依赖 PHP、ThinkPHP 或 MySQL 运行时。

项目自带一套可视化 CRUD 代码生成器：在后台设计表结构和字段控件，即可生成数据表、控制器、列表页、表单页、语言包和菜单权限，适合快速搭建中小型管理后台。

- 开发地址：`http://127.0.0.1:8002/`
- 后台入口：`http://127.0.0.1:8002/#/admin`
- 数据文件：`data/app.sqlite`
- 默认表前缀：`ba_`

## 功能概览

| 模块 | 说明 |
| --- | --- |
| 登录与鉴权 | 管理员登录、验证码、Token 鉴权、权限节点校验 |
| 控制台 | 数据概览、常用入口 |
| 权限管理 | 管理员、角色组、菜单规则、管理员日志 |
| 会员数据 | 会员、会员分组、会员规则、余额与积分变动记录 |
| 系统运维 | 系统配置、附件管理 |
| 安全 | 数据回收规则、敏感数据修改记录 |
| CRUD 代码生成 | 可视化设计表结构，生成控制器、页面、语言包与菜单；支持 AI 设计表结构 |
| 功能示例 | `功能示例` 菜单（`sample/type`）演示字符串、数字、日期、开关、下拉、多选、关联、图片、文件、城市、图标、颜色、富文本等全部字段控件 |

> 当前仓库只保留「功能示例」这一张演示表。早期开发中的「任务管理」和「字段类型样例表」已删除，数据库菜单里也不再包含它们。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 应用宿主 | Nuxt 4（`ssr: false`）、Nitro、Vite |
| 界面 | Vue 3、Element Plus、Sass、Font Awesome、ECharts |
| 状态与请求 | Pinia、pinia-plugin-persistedstate、Axios、vue-i18n |
| 路由 | Vue Router（hash 模式），菜单由后端下发后在运行时注册 |
| 服务端 | Nitro 路由、Knex、Objection、better-sqlite3 |
| 数据库 | SQLite 文件 `data/app.sqlite`，表前缀默认 `ba_` |
| 包管理 | pnpm |

页面入口在 `app/app.vue`，挂载后调用 `src/main.ts` 的 `bootLegacy()` 启动原有的 Pinia、路由、Element Plus 和语言包。接口入口是 `server/routes/admin/[...path].ts` 与 `server/routes/api/[...path].ts`，统一交给 `server/kernel.ts` 分发。

## 目录结构

```text
app/                      Nuxt 根组件，负责拉起原有 Vue 应用
src/views/backend/        后台页面
src/views/frontend/       会员端页面
src/components/           表格、表单、上传等公共组件
src/api/                  前端请求函数
src/stores/               Pinia 状态
src/lang/                 中英文语言包
src/utils/                路由、表格等工具
server/routes/            /admin、/api 入口，以及 /storage 上传文件读取
server/admin/controller/  后台控制器（一表一控制器）
server/common/            数据库与模型公共方法
server/member/            会员端路由
scripts/                  数据导入等脚本
data/                     SQLite 数据文件（不入库）
public/storage/           本地上传目录（不入库）
build-prod.bat            Windows 生产构建脚本
start-prod.bat            Windows 生产启动脚本
types/                    全局类型声明
```

## 环境要求

- Node.js 22 或更高版本
- pnpm 10 或更高版本
- 一份可用的 SQLite 数据文件，或一个可导入的 BuildAdmin MySQL 库

## 快速开始

1. 安装依赖：

```bash
pnpm install
```

2. 复制环境变量示例并按需修改：

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

3. 准备数据库（任选一种）：

   - **用仓库里的种子库初始化**：`data/seed.sqlite` 是脱敏后的表结构和初始数据，执行下面的命令会在 `data/app.sqlite` 不存在时复制一份，已有文件不会被覆盖（重建用 `pnpm db:init --force`）。默认管理员是 `admin`，密码 `123456`，登录后请立即修改：

```bash
pnpm db:init
```

   - **已有 `data/app.sqlite`**：直接放到项目根的 `data/` 目录。
   - **从 MySQL 导入**：在 `.env` 中填写 `DB_HOST`、`DB_PORT`、`DB_DATABASE`、`DB_USERNAME`、`DB_PASSWORD`，然后执行：

```bash
pnpm import:sqlite
```

导入脚本会读取项目根目录的 `.env`，如果不存在则回退到 `../nuxt/.env`，按 MySQL 中的库结构和数据重建 `data/app.sqlite`。

4. 启动开发服务：

```bash
pnpm dev
```

浏览器打开 `http://127.0.0.1:8002/`，后台是 `http://127.0.0.1:8002/#/admin`。用种子库初始化时管理员是 `admin` / `123456`。

> 仓库不包含 `data/app.sqlite`、`.env` 和上传文件，请勿把生产数据或密码提交到 Git。`data/seed.sqlite` 是唯一入库的数据库文件，导出时会清空日志、token、验证码和上传记录，重置账号密码，并清掉配置里的密钥。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 启动开发服务，监听 `127.0.0.1:8002` |
| `pnpm build` | 构建生产产物到 `.output/` |
| `pnpm preview` | 预览构建产物，监听 `127.0.0.1:8002` |
| `pnpm import:sqlite` | 从 MySQL 导入数据并生成 `data/app.sqlite` |
| `pnpm db:init` | 用 `data/seed.sqlite` 生成 `data/app.sqlite`，已存在则跳过 |
| `pnpm db:export` | 从当前 `data/app.sqlite` 导出脱敏的 `data/seed.sqlite` |

Windows 下也可以双击 `start.bat` 启动，`close.bat` 关闭占用 8002 端口的进程。

生产模式用项目根的两个脚本：

| 脚本 | 作用 |
| --- | --- |
| `build-prod.bat` | 安装依赖并执行 `pnpm build`，产物在 `.output/` |
| `start-prod.bat` | 运行 `.output/server/index.mjs`，默认 `127.0.0.1:8002` |

它们等价于下面手工执行的命令：

```bat
pnpm install --frozen-lockfile
pnpm build
set PORT=8002
set HOST=127.0.0.1
node .output\server\index.mjs
```

相对 `pnpm dev`，生产模式不编译、不热更新、不加载 devtools，启动更快，也才是上线该用的方式。


## 环境变量

| 变量 | 作用 | 示例 |
| --- | --- | --- |
| `DB_FILE` | SQLite 文件路径，相对项目根目录 | `data/app.sqlite` |
| `DB_PREFIX` | 数据表前缀 | `ba_` |
| `DB_DATABASE` | 逻辑库名，仅用于兼容原配置 | `sqlite` |
| `TOKEN_KEY` | Token 签名密钥，上线必须设为独立随机串 | 随机字符串 |
| `TOKEN_ALGO` | Token 摘要算法 | `ripemd160` |
| `PORT` | 监听端口 | `8002` |
| `CORS_ORIGIN` | 允许的跨域来源，逗号分隔 | `localhost,127.0.0.1` |
| `VITE_AXIOS_BASE_URL` | 前端接口根地址，`getCurrentDomain` 表示同源 | `getCurrentDomain` |
| `DB_HOST` / `DB_PORT` / `DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` | 仅 `pnpm import:sqlite` 使用 | — |

服务端启动时读取项目根目录的 `.env`，见 `server/load-env.ts`。进程环境变量优先于 `.env`。

## 请求与接口约定

请求路径形如 `/admin/{控制器}/{动作}` 或 `/api/{控制器}/{动作}`，例如 `/admin/auth.admin/index`。路径最后一段是动作，前面是控制器，点号会转换成斜杠。

成功响应：

```json
{ "code": 1, "msg": "", "time": 0, "data": {} }
```

`code` 不为 `1` 表示失败：

| code | 含义 |
| --- | --- |
| `303` | 未登录，前端会清除 token 并跳转登录页 |
| `401` | 已登录但没有该节点权限 |
| `409` | token 过期，前端刷新后重放请求 |

后台请求头使用 `batoken`，会员端使用 `ba-user-token`。权限节点是 `控制器路径/动作`，对应 `ba_admin_rule.name`。

后台分发顺序：`ajax/terminal` 单独处理 SSE；随后按控制器路径查找 `crudControllers`，命中类方法直接调用；未命中时再走 `server/admin/index.ts` 与 `server/member/index.ts` 的路由表。

## 后台开发约定

### 新增一个后台列表

推荐直接使用可视化 CRUD，而不是手写整套页面：

1. 按「数据表设计规范」确定表名、字段、类型、注释和 `designType`。
2. 在后台「CRUD代码生成」中设计并生成。
3. 生成完成后检查：`index.vue` 含 `<template>`；菜单 `component` 指向该文件；`_id` 关联补上 `pk`、`field`、`remoteUrl` 和 `joins`；`ba_crud_log.status` 为 `success`。
4. 重启 `pnpm dev`，登录后台打开新菜单。

已有手写页面的表要加列时，用 `ALTER TABLE` 增加可空列并修改页面，不要用 `type: create` 重建表。

### 控制器

一个表一个控制器，文件路径就是控制器路径：

| 文件 | 控制器 key | 请求前缀 |
| --- | --- | --- |
| `server/admin/controller/sample/type.ts` | `sample/type` | `/admin/sample.type/` |
| `server/admin/controller/auth/admin.ts` | `auth/admin` | `/admin/auth.admin/` |

表控制器继承 `CrudController`，基类已提供 `index`、`select`、`add`、`edit`、`del`、`sortable`。只改某一步时在子类写同名方法，需要通用逻辑时调用 `super`。不是表的控制器继承 `AdminController`，例如登录和 `ajax`。

新增控制器文件后必须出现在 `server/admin/controller-registry.ts`。该文件由生成器按 `server/admin/controller/**/*.ts` 重写；手写时按「路径各段首字母大写拼接」的格式补 import。

修改控制器、表结构或 `schema_note` 后，需要重启一次 `pnpm dev`；只改 Vue 页面通常可以热更新。

### 页面与菜单

标准列表页包含：

```text
src/views/backend/{路径}/index.vue      路由入口
src/views/backend/{路径}/popupForm.vue  新增/编辑弹窗
src/lang/backend/zh-cn/{路径}.ts        中文语言包
src/lang/backend/en/{路径}.ts           英文语言包
```

菜单行在 `ba_admin_rule`，页面菜单的 `component` 必须是 `/src/views/backend/.../index.vue`，并且文件不能为空。`src/utils/router.ts` 通过 `import.meta.glob('../views/backend/**/*.vue')` 注册组件。

### 数据表设计规范（摘要）

字段类型决定表单控件：`enum` 为单选框，`set` 为复选框，`date` / `year` / `time` / `datetime` 为日期时间控件，`decimal` / `float` / `double` 为小数输入，整型为数字输入，文本家族为多行文本。

字段名后缀也会影响控件：

| 后缀 | 控件 |
| --- | --- |
| `array` | 数组输入 |
| `list` / `select` / `data` | 下拉单选 |
| `lists` / `selects` / `multi` | 下拉多选 |
| `_id` | 关联表远程下拉（单选） |
| `_ids` | 关联表远程下拉（多选） |
| `image` / `avatar` | 单图上传 |
| `images` / `avatars` | 多图上传 |
| `file` / `files` | 单文件 / 多文件上传 |
| `icon` / `color` | 图标 / 颜色选择 |
| `status` / `state` / `type` | 单选 |
| `switch` / `toggle` | 开关 |
| `content` / `editor` | 富文本 |

固定字段：`weigh`（`int`，列表可拖拽排序）、`create_time` / `update_time`（`bigint`，由程序写入）。

字段注释和表注释可解析成字典，格式为半角符号：`状态:0=禁用,1=启用`。表注释建议带「表」字，例如 `功能示例表`。

## 部署

在构建机器上安装依赖并打包：

```bash
pnpm install --frozen-lockfile
pnpm build
```

产物在 `.output/`。服务器上需要保留整个项目目录（包含 `package.json`、`src`、`public` 和 `.env`），不能只拷贝 `.output`。

### Windows 本机或局域网部署

双击 `build-prod.bat` 完成构建，再双击 `start-prod.bat` 启动，浏览器打开 `http://127.0.0.1:8002/#/admin` 即可。

要让同一局域网的其他机器访问，先在 cmd 窗口里设置 `HOST`，再用局域网 IP 访问：

```bat
set PORT=8002
set HOST=0.0.0.0
start-prod.bat
```

`start-prod.bat` 会沿用当前窗口已有的 `PORT` / `HOST`，没设置时才用默认的 `127.0.0.1:8002`。

同时需要在 Windows 防火墙里放行 8002 端口。改过代码后要重新运行 `build-prod.bat`，`start-prod.bat` 读的是构建产物，不会热更新。

### Linux / 服务器

```bash
PORT=8002 HOST=127.0.0.1 node .output/server/index.mjs
```

Windows PowerShell：

```powershell
$env:PORT = "8002"; $env:HOST = "127.0.0.1"; node .output/server/index.mjs
```

建议用 Nginx 或 Caddy 对本机 8002 端口反向代理，并让页面和接口保持同一域名：

```nginx
server {
    listen 80;
    server_name admin.example.com;
    client_max_body_size 50m;

    location /storage/ {
        alias /var/www/YangBuild/public/storage/;
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

上传文件由 `server/routes/storage/[...path].ts` 在请求时直接读磁盘，所以运行中新上传的文件立刻可以访问，不需要重启，也不需要单独配置静态目录。Nginx 用 `alias` 直接指向 `public/storage` 会更快，作为可选优化；不配也能正常工作。

上线检查：

- `TOKEN_KEY` 已换成独立随机串，并且以后保持不变；更换会使所有已登录 token 失效。
- `.env`、数据库文件和上传目录没有进入 Git。
- `data/app.sqlite` 已随项目放到服务器。
- 进程由 systemd、pm2 或容器保活，崩溃后自动拉起。
- 修改代码后重新 `pnpm build` 并重启进程。

## 未接入的能力

以下请求会返回「尚未迁移」，页面上对应功能不可用：

- 模块市场与安装器
- 终端配置修改
- 非本地存储驱动的上传（当前只写入 `public/storage`）

## 许可证与来源

界面与数据结构基于 [BuildAdmin](https://www.buildadmin.com/) 开源项目，本项目将其后台改为 Nuxt 4 + Nitro + SQLite 实现。使用前请遵守原项目的许可协议。
