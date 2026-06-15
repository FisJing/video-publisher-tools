@echo off
chcp 65001 >nul
title 微信视频号群控系统 - 安装向导

echo ========================================
echo   微信视频号群控系统 - 安装向导
echo ========================================
echo.

:: 检测Node.js
echo [1/5] 检测 Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo    ❌ 未检测到 Node.js
    echo.
    echo    请先安装 Node.js: https://nodejs.org
    echo    安装完成后重新运行此脚本
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
    echo    ✅ Node.js 已安装: %NODE_VER%
)

:: 检测ADB
echo.
echo [2/5] 检测 ADB...
where adb >nul 2>&1
if %errorlevel% neq 0 (
    echo    ⚠️ 未在系统PATH中检测到ADB

    :: 检查常见位置
    set "ADB_FOUND="
    for %%p in (
        "C:\Users\%USERNAME%\Desktop\Scrcpy\adb.exe"
        "C:\Scrcpy\adb.exe"
        "D:\Scrcpy\adb.exe"
        "C:\Program Files\Scrcpy\adb.exe"
    ) do (
        if exist %%p (
            set "ADB_PATH=%%p"
            set "ADB_FOUND=1"
            goto :found_adb
        )
    )

    :found_adb
    if defined ADB_FOUND (
        echo    ✅ 找到ADB: %ADB_PATH%
    ) else (
        echo.
        echo    请输入 ADB 所在路径（例如: C:\Users\用户名\Desktop\Scrcpy\adb.exe）
        set /p ADB_PATH="    ADB路径: "
        if not exist "%ADB_PATH%" (
            echo    ❌ 路径不存在
            pause
            exit /b 1
        )
    )
) else (
    for /f "tokens=*" %%i in ('where adb') do set ADB_PATH=%%i
    echo    ✅ ADB 已安装: %ADB_PATH%
)

:: 安装依赖
echo.
echo [3/6] 安装项目依赖...
cd /d "%~dp0"
call npm install
if %errorlevel% neq 0 (
    echo    ❌ 依赖安装失败
    pause
    exit /b 1
)
echo    ✅ 依赖安装完成

:: 更新server.js中的ADB路径
echo.
echo [4/6] 配置ADB路径...
set "ADB_PATH_ESCAPED=%ADB_PATH:\=\\%"
powershell -Command "(Get-Content server.js) -replace 'ADB_PATH = .*', 'const ADB_PATH = ''%ADB_PATH_ESCAPED%'';' | Set-Content server.js"
echo    ✅ ADB路径已配置

:: 设置开机自启
echo.
echo [5/6] 设置开机自启...
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\微信视频号群控.lnk'); $Shortcut.TargetPath = '%~dp0start.bat'; $Shortcut.WorkingDirectory = '%~dp0'; $Shortcut.Save()"
echo    ✅ 开机自启已设置

:: 下载ADBKeyboard
echo.
echo [6/6] 下载 ADBKeyboard...
if exist "%~dp0ADBKeyboard.apk" (
    echo    ✅ ADBKeyboard.apk 已存在
) else (
    echo    正在下载...
    powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/senzhk/ADBKeyBoard/raw/master/ADBKeyboard.apk' -OutFile '%~dp0ADBKeyboard.apk'}"
    if exist "%~dp0ADBKeyboard.apk" (
        echo    ✅ 下载完成
    ) else (
        echo    ⚠️ 下载失败，请手动下载: https://github.com/senzhk/ADBKeyBoard/raw/master/ADBKeyboard.apk
    )
)

:: 完成
echo.
echo ========================================
echo   ✅ 安装完成！
echo ========================================
echo.
echo 接下来：
echo   1. 编辑 device-config.json 配置设备IP
echo   2. 运行 start.bat 启动服务器
echo   3. 或重启电脑自动启动
echo.
echo 自动功能：
echo   ✓ 服务器启动时自动连接设备
echo   ✓ 设备连接后自动安装 ADBKeyboard
echo.
echo 访问地址: http://localhost:3000
echo.

:: 询问是否立即启动
set /p START_NOW="是否立即启动服务器？(Y/N): "
if /i "%START_NOW%"=="Y" (
    start "" "%~dp0start.bat"
)

pause
