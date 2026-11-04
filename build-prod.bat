@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "CODE=0"

echo ============================================
echo  YangBuild 生产构建
echo ============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Node.js，请安装 Node.js 22 或更高版本。
    set "CODE=1"
    goto :end
)

where pnpm >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 pnpm，请先执行：npm i -g pnpm
    set "CODE=1"
    goto :end
)

if not exist ".env" (
    echo [提示] 未找到 .env，将使用内置默认配置。
    echo        上线前请复制 .env.example 为 .env，并把 TOKEN_KEY 改成独立随机串。
    echo.
)

echo [1/2] 安装依赖...
call pnpm install --frozen-lockfile
if errorlevel 1 (
    set "CODE=1"
    goto :fail
)
echo.

echo [2/2] 构建生产产物...
call pnpm build
if errorlevel 1 (
    set "CODE=1"
    goto :fail
)
echo.

echo 构建完成，产物在 .output\
echo 启动生产服务请运行 start-prod.bat
goto :end

:fail
echo.
echo 构建失败，请查看上面的错误信息。

:end
if not "%CODE%"=="0" pause
endlocal & exit /b %CODE%
