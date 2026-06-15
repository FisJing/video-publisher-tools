# 微信视频号自动发布系统

支持多账号、断点续传、日志记录的微信视频号自动发布工具。

## 功能特性

✅ **多账号支持** - 支持机主微信和分身微信同时发布
✅ **断点续传** - 程序中断后可从上次位置继续
✅ **自动日志** - 记录每步操作和截图
✅ **多语言支持** - 支持中文、俄语等所有语言输入
✅ **实时监控** - 通过 Scrcpy 实时查看手机屏幕

## 目录结构

```
wechat-video-publisher/
├── src/
│   └── publisher.js          # 核心发布逻辑
├── accounts/
│   ├── xin/
│   │   ├── config.json       # 心账号配置
│   │   ├── auto.xls          # 视频数据
│   │   └── logs/             # 运行日志
│   └── zheng/
│       ├── config.json       # 郑账号配置
│       ├── auto.xls          # 视频数据
│       └── logs/             # 运行日志
├── run-xin.js                # 启动心账号
├── run-zheng.js              # 启动郑账号
├── start-all.js              # 启动双账号
├── 启动-心.bat                # Windows快捷启动
├── 启动-郑.bat                # Windows快捷启动
├── 启动-双账号.bat            # Windows快捷启动
├── package.json
└── README.md
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 准备视频数据

在 `accounts/xin/auto.xls` 或 `accounts/zheng/auto.xls` 中填写视频信息：

| 视频标签 | 视频位置 |
|---------|---------|
| 这是第一个视频的描述 | C:\Videos\video1.mp4 |
| 这是第二个视频的描述 | C:\Videos\video2.mp4 |

### 3. 启动发布

**Windows用户：**
- 双击 `启动-心.bat` - 发布心账号视频
- 双击 `启动-郑.bat` - 发布郑账号视频
- 双击 `启动-双账号.bat` - 同时发布两个账号

**命令行用户：**
```bash
# 发布心账号
npm run xin

# 发布郑账号
npm run zheng

# 发布双账号
npm start
```

## 配置说明

编辑 `accounts/[账号]/config.json` 自定义配置：

```json
{
  "name": "账号名称",
  "userId": 999,           // 0=机主微信, 999=分身微信
  "description": "账号描述",
  "excelPath": "accounts/xin/auto.xls",
  "logDir": "accounts/xin/logs",
  "positions": {
    "discover": [675, 2300],      // 发现按钮坐标
    "videoChannel": [326, 500],   // 视频号入口坐标
    ...
  }
}
```

### 坐标说明

坐标基于 **1080x2412** 分辨率，如果你的手机分辨率不同，需要调整坐标。

获取坐标方法：
1. 在手机上开启开发者选项和USB调试
2. 使用 `adb shell input tap x y` 测试坐标
3. 更新配置文件中的坐标值

## 前置要求

### 必需软件

1. **Node.js** - [下载地址](https://nodejs.org/)
   ```bash
   node --version  # 检查是否安装
   ```

2. **ADB** - Android Debug Bridge
   - 已包含在 `C:\Users\Lremi\Desktop\Scrcpy\adb.exe`
   - 或从 [Android SDK](https://developer.android.com/studio) 安装

3. **Scrcpy** - 手机屏幕镜像工具（可选但推荐）
   - 已包含在 `C:\Users\Lremi\Desktop\Scrcpy\scrcpy.exe`
   - 用于实时监控发布过程

### 手机设置

1. **开启开发者选项**
   - 设置 → 关于手机 → 连续点击"版本号"7次

2. **开启USB调试**
   - 设置 → 开发者选项 → USB调试

3. **安装ADBKeyboard输入法**
   - 必需：用于输入中文等多语言文本
   - 下载：[ADBKeyboard](https://github.com/senzhk/ADBKeyBoard)

## 日志说明

运行日志存储在 `accounts/[账号]/logs/` 目录：

- `log.txt` - 文本日志，记录每步操作
- `progress.json` - 当前进度，用于断点续传
- `v{idx}_s{step}.png` - 每步操作的截图

示例日志：
```
[2026-06-11T14:30:45.123Z] [账号A] v0 s0 OK: C:\path\to\screenshot.png
[2026-06-11T14:30:48.456Z] [账号A] v0 s1 OK: C:\path\to\screenshot.png
```

## 故障排查

### 问题：手机未连接

```bash
# 检查ADB连接
adb devices

# 如果设备未显示，尝试：
adb kill-server
adb start-server
```

### 问题：输入法无法切换

确保已安装 ADBKeyboard：
```bash
adb shell ime list -s | grep AdbIME
```

如果没有输出，请安装 ADBKeyboard。

### 问题：坐标点击无效

1. 检查手机分辨率是否为 1080x2412
2. 使用 `adb shell input tap x y` 手动测试坐标
3. 更新配置文件中的坐标值

## 开发说明

### 核心类：WeChatVideoPublisher

```javascript
const WeChatVideoPublisher = require('./src/publisher');

const publisher = new WeChatVideoPublisher({
  name: '账号名称',
  userId: 999,
  excelPath: 'path/to/auto.xls',
  logDir: 'path/to/logs',
  positions: { ... }
});

publisher.run();
```

### 自定义流程

继承 `WeChatVideoPublisher` 类并重写方法：

```javascript
class CustomPublisher extends WeChatVideoPublisher {
  async inputText(text) {
    // 自定义文本输入逻辑
  }
}
```

## 更新日志

### v1.0.0 (2026-06-11)
- ✨ 重构代码，统一发布逻辑
- 📁 按账号独立组织目录
- 🗑️ 移除测试文件和调试截图
- 📝 添加完整文档

## 许可证

MIT License

## 作者

Lremi - 2026
