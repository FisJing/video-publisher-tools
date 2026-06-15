# 迁移指南

## 📦 需要复制的文件

```
wechat-video-publisher/
├── group-control/          ← 核心文件夹（必须复制）
│   ├── server.js
│   ├── client.js
│   ├── start.bat
│   ├── install.bat         ← 一键安装脚本
│   ├── package.json
│   ├── device-config.json  ← 设备IP配置
│   └── web/
│       ├── index.html
│       └── api.js
└── accounts/               ← 账号配置和Excel（可选）
    ├── xin/
    └── zheng/
```

## 🚀 新电脑安装步骤

### 1. 安装必要软件

| 软件 | 下载地址 |
|------|----------|
| Node.js (LTS) | https://nodejs.org |
| Scrcpy + ADB | https://github.com/Genymobile/scrcpy/releases |

### 2. 复制项目

将 `group-control` 文件夹复制到新电脑任意位置

### 3. 运行安装脚本

双击运行 `install.bat`，脚本会自动：
- 检测 Node.js
- 检测 ADB
- 安装依赖
- 配置路径
- 设置开机自启

### 4. 配置设备IP

编辑 `device-config.json`：
```json
{
  "手机IP:5555": { "alias": "设备名称", "description": "视频号" }
}
```

## 📱 手机端配置

### 开启无线ADB

1. 手机开启开发者选项
2. 开启USB调试
3. 用USB连接电脑，运行：
   ```
   adb tcpip 5555
   adb connect 手机IP:5555
   ```
4. 拔掉USB，无线连接完成

### 获取手机IP

手机设置 → WLAN → 点击已连接的网络 → 查看IP地址

## ⚠️ 注意事项

1. **电脑和手机必须同一WiFi**
2. **手机IP可能变化** - 建议在路由器设置静态IP
3. **防火墙** - 确保3000端口未被阻止

## 🔧 常见问题

### Q: 设备连接失败？
A: 检查手机IP是否变化，更新 `device-config.json`

### Q: ADB找不到？
A: 安装脚本会提示输入ADB路径，或手动修改 `server.js` 第15行

### Q: 端口被占用？
A: 修改 `server.js` 第14行的 `PORT` 值
