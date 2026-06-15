@echo off
chcp 65001 >nul
title 微信视频号群控系统 - 完整安装

echo ╔════════════════════════════════════════╗
echo ║   微信视频号群控系统 - 完整安装向导    ║
echo ╚════════════════════════════════════════╝
echo.

:: 检查管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️ 此脚本需要管理员权限
    echo    请右键点击此脚本，选择"以管理员身份运行"
    echo.
    pause
    exit /b 1
)

:: 设置安装目录
set "INSTALL_DIR=C:\WechatVideoControl"
set "NODEJS_URL=https://nodejs.org/dist/v20.15.0/node-v20.15.0-x64.msi"
set "SCRCPY_URL=https://github.com/Genymobile/scrcpy/releases/download/v2.7/scrcpy-win64-v2.7.zip"

echo 安装目录: %INSTALL_DIR%
echo.

:: ============================================
:: 步骤1: 安装 Node.js
:: ============================================
echo.
echo ┌────────────────────────────────────────┐
echo │ [1/4] 检测 Node.js                     │
echo └────────────────────────────────────────┘
echo.

where node >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
    echo    ✅ Node.js 已安装: %NODE_VER%
    goto :nodejs_done
)

echo    Node.js 未安装，正在自动下载安装...
echo.

:: 创建临时目录
if not exist "%TEMP%\wvc-install" mkdir "%TEMP%\wvc-install"

:: 下载Node.js
echo    下载中... (约30MB)
powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '%NODEJS_URL%' -OutFile '%TEMP%\wvc-install\nodejs.msi'}"

if not exist "%TEMP%\wvc-install\nodejs.msi" (
    echo    ❌ 下载失败
    echo    请手动下载: https://nodejs.org
    goto :nodejs_done
)

echo    ✅ 下载完成
echo    正在安装...

:: 静默安装Node.js
msiexec /i "%TEMP%\wvc-install\nodejs.msi" /qn /norestart ADDLOCAL=ALL

:: 等待安装完成
timeout /t 10 /nobreak >nul

:: 刷新环境变量
call :refresh_env

where node >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('node -v') do echo    ✅ 安装成功: %%i
) else (
    echo    ⚠️ 安装完成，请重启电脑后再运行此脚本
)

:nodejs_done

:: ============================================
:: 步骤2: 安装 Scrcpy + ADB
:: ============================================
echo.
echo ┌────────────────────────────────────────┐
echo │ [2/4] 检测 Scrcpy/ADB                  │
echo └────────────────────────────────────────┘
echo.

where adb >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('adb version') do echo    ✅ ADB 已安装: %%i & goto :scrcpy_done
)

:: 检查现有目录
if exist "%INSTALL_DIR%\Scrcpy\adb.exe" (
    echo    ✅ Scrcpy 已存在: %INSTALL_DIR%\Scrcpy
    goto :scrcpy_done
)

echo    Scrcpy 未安装，正在自动下载安装...
echo.

:: 下载Scrcpy
echo    下载中... (约35MB)
powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '%SCRCPY_URL%' -OutFile '%TEMP%\wvc-install\scrcpy.zip'}"

if not exist "%TEMP%\wvc-install\scrcpy.zip" (
    echo    ❌ 下载失败
    echo    请手动下载: https://github.com/Genymobile/scrcpy/releases
    goto :scrcpy_done
)

echo    ✅ 下载完成
echo    正在解压...

:: 创建安装目录
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: 解压
powershell -Command "Expand-Archive -Path '%TEMP%\wvc-install\scrcpy.zip' -DestinationPath '%TEMP%\wvc-install\scrcpy-temp' -Force"

:: 移动文件
if exist "%TEMP%\wvc-install\scrcpy-temp\scrcpy-win64-v2.7" (
    move "%TEMP%\wvc-install\scrcpy-temp\scrcpy-win64-v2.7" "%INSTALL_DIR%\Scrcpy" >nul
) else (
    :: 尝试其他可能的目录名
    for /d %%d in ("%TEMP%\wvc-install\scrcpy-temp\*") do (
        move "%%d" "%INSTALL_DIR%\Scrcpy" >nul
    )
)

if exist "%INSTALL_DIR%\Scrcpy\adb.exe" (
    echo    ✅ 安装成功: %INSTALL_DIR%\Scrcpy
    set "ADB_PATH=%INSTALL_DIR%\Scrcpy\adb.exe"
) else (
    echo    ⚠️ 安装可能有问题
)

:scrcpy_done

:: ============================================
:: 步骤3: 配置项目
:: ============================================
echo.
echo ┌────────────────────────────────────────┐
echo │ [3/4] 配置项目                         │
echo └────────────────────────────────────────┘
echo.

cd /d "%~dp0"

:: 安装npm依赖
echo    安装项目依赖...
call npm install >nul 2>&1
echo    ✅ 依赖安装完成

:: 配置ADB路径
if exist "%INSTALL_DIR%\Scrcpy\adb.exe" (
    set "ADB_PATH_ESCAPED=%INSTALL_DIR%\Scrcpy\adb.exe"
    set "ADB_PATH_ESCAPED=!ADB_PATH_ESCAPED:\=\\!"
    powershell -Command "(Get-Content server.js) -replace 'ADB_PATH = .*', 'const ADB_PATH = ''!ADB_PATH_ESCAPED!'';' | Set-Content server.js"
    echo    ✅ ADB路径已配置
)

:: 下载ADBKeyboard
echo.
echo    检查 ADBKeyboard.apk...
if exist "%~dp0ADBKeyboard.apk" (
    echo    ✅ ADBKeyboard.apk 已存在
) else (
    echo    下载中...
    powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/senzhk/ADBKeyBoard/raw/master/ADBKeyboard.apk' -OutFile '%~dp0ADBKeyboard.apk'}" 2>nul
    if exist "%~dp0ADBKeyboard.apk" (
        echo    ✅ 下载完成
    ) else (
        echo    ⚠️ 下载失败，可稍后手动下载
    )
)

:: ============================================
:: 步骤4: 设置开机自启
:: ============================================
echo.
echo ┌────────────────────────────────────────┐
echo │ [4/4] 设置开机自启                     │
echo └────────────────────────────────────────┘
echo.

powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\微信视频号群控.lnk'); $Shortcut.TargetPath = '%~dp0start.bat'; $Shortcut.WorkingDirectory = '%~dp0'; $Shortcut.Save()"
echo    ✅ 开机自启已设置

:: ============================================
:: 完成
:: ============================================
echo.
echo ╔════════════════════════════════════════╗
echo ║           ✅ 安装完成！                ║
echo ╚════════════════════════════════════════╝
echo.
echo  安装目录: %INSTALL_DIR%
echo  访问地址: http://localhost:3000
echo.
echo ┌────────────────────────────────────────┐
echo │ 接下来：                               │
echo │                                        │
echo │ 1. 手机开启开发者选项 + USB调试       │
echo │ 2. USB连接手机                         │
echo │ 3. 手机授权调试                        │
echo │                                        │
echo │ → 系统会自动识别并完成配置！          │
echo └────────────────────────────────────────┘
echo.

:: 询问是否立即启动
set /p START_NOW="是否立即启动服务器？(Y/N): "
if /i "%START_NOW%"=="Y" (
    start "" "%~dp0start.bat"
)

pause
exit /b 0

:: ============================================
:: 子程序：刷新环境变量
:: ============================================
:refresh_env
:: 刷新当前会话的环境变量
for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "PATH=%%b;%PATH%"
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "PATH=%%b;%PATH%"
exit /b 0
