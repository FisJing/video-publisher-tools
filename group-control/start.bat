@echo off
chcp 65001 >nul
title 微信视频号群控系统

echo ========================================
echo   微信视频号群控系统 - 自动启动
echo ========================================
echo.

cd /d "C:\Users\Lremi\Desktop\auto\wechat-video-publisher\group-control"

echo 正在启动服务器...
node server.js

pause
