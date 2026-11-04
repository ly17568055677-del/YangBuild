@echo off
cd /d "%~dp0"
where pnpm >nul 2>&1
if errorlevel 1 (
    echo 未找到 pnpm。需要 Node.js 22 或更高，以及 pnpm 10 或更高。
    exit /b 1
)
pnpm dev
