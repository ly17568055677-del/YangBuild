@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================
echo  YangBuild 生产服务
echo ============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Node.js，请安装 Node.js 22 或更高版本。
    pause
    exit /b 1
)

if not exist ".output\server\index.mjs" (
    echo [错误] 未找到 .output\server\index.mjs，请先运行 build-prod.bat 完成构建。
    pause
    exit /b 1
)

if not exist "data" mkdir "data"

if not exist ".env" (
    echo [提示] 未找到 .env，将使用内置默认配置。
    echo        建议复制 .env.example 为 .env，并把 TOKEN_KEY 改成独立随机串。
)

if not defined PORT set "PORT=8002"
if not defined HOST set "HOST=127.0.0.1"

echo 站点地址：http://%HOST%:%PORT%/
echo 后台入口：http://%HOST%:%PORT%/#/admin
echo 按 Ctrl+C 停止服务。
echo.

node .output/server/index.mjs
set "CODE=%errorlevel%"

if not "%CODE%"=="0" (
    echo.
    echo 服务已退出，退出码 %CODE%。
    pause
)

endlocal & exit /b %CODE%
