@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
set FOUND=0
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8002" ^| findstr "LISTENING"') do (
    set FOUND=1
    taskkill /F /T /PID %%p >nul 2>&1
)
if "!FOUND!"=="0" (
    echo 8002 端口上没有正在监听的开发服务。
) else (
    echo 已关闭 8002 端口上的开发服务。
)
