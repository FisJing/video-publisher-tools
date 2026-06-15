@echo off
chcp 65001 >nul
title 下载 ADBKeyboard

echo ========================================
echo   下载 ADBKeyboard 输入法
echo ========================================
echo.

cd /d "%~dp0"

:: 检查是否已存在
if exist "ADBKeyboard.apk" (
    echo ✅ ADBKeyboard.apk 已存在
    goto :end
)

echo 正在下载 ADBKeyboard.apk...
echo.

:: 使用PowerShell下载
powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/senzhk/ADBKeyBoard/raw/master/ADBKeyboard.apk' -OutFile 'ADBKeyboard.apk'}"

if exist "ADBKeyboard.apk" (
    echo.
    echo ✅ 下载完成: %~dp0ADBKeyboard.apk
) else (
    echo.
    echo ❌ 下载失败
    echo.
    echo 请手动下载:
    echo https://github.com/senzhk/ADBKeyBoard/raw/master/ADBKeyboard.apk
    echo.
    echo 保存到: %~dp0ADBKeyboard.apk
)

:end
echo.
pause
