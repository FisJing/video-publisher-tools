/**
 * 微信视频号群控系统 - 服务端
 * 支持Web管理界面 + ADB设备管理 + Excel文件读取
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const XLSX = require('xlsx');

// 配置
const PORT = 3000;
const ADB_PATH = 'adb';
const ADBKEYBOARD_APK = path.join(__dirname, 'ADBKeyboard.apk');  // ADBKeyboard安装包路径
const devices = new Map();
const tasks = new Map();

// 设备任务队列
const deviceQueues = new Map();  // deviceId -> { queue: [], running: boolean }

// 设备配置文件路径
const DEVICE_CONFIG_FILE = path.join(__dirname, 'device-config.json');

// 运行中的任务控制器
const taskControllers = new Map();

// 投屏客户端连接
const screenClients = new Map();  // deviceId -> Set of WebSocket clients

// 投屏状态
const screenStreamStatus = new Map();  // deviceId -> { running: boolean, interval: null }

// 读取设备配置
function loadDeviceConfig() {
    try {
        if (fs.existsSync(DEVICE_CONFIG_FILE)) {
            const data = fs.readFileSync(DEVICE_CONFIG_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('读取设备配置失败:', error.message);
    }
    return {};
}

// 保存设备配置
function saveDeviceConfig(config) {
    try {
        fs.writeFileSync(DEVICE_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('保存设备配置失败:', error.message);
        return false;
    }
}

// 全局设备配置
let deviceConfig = loadDeviceConfig();

// 自动连接ADB设备
function autoConnectADBDevices() {
    console.log('\n🔗 正在自动连接ADB设备...');
    const connectedDevices = [];

    Object.keys(deviceConfig).forEach(deviceId => {
        // 检查是否是网络ADB设备（IP:端口格式）
        if (deviceId.includes(':5555') || deviceId.match(/^\d+\.\d+\.\d+\.\d+:/)) {
            try {
                console.log(`   连接: ${deviceId} (${deviceConfig[deviceId].alias || '未命名'})`);
                const result = execSync(`${ADB_PATH} connect ${deviceId}`, { encoding: 'utf8', timeout: 10000 });
                if (result.includes('connected')) {
                    console.log(`   ✅ 已连接: ${deviceId}`);
                    connectedDevices.push(deviceId);
                } else {
                    console.log(`   ⚠️ 连接失败: ${deviceId} - ${result.trim()}`);
                }
            } catch (e) {
                console.log(`   ❌ 连接错误: ${deviceId} - ${e.message}`);
            }
        }
    });

    if (connectedDevices.length > 0) {
        console.log(`\n✅ 已自动连接 ${connectedDevices.length} 台ADB设备\n`);

        // 自动安装ADBKeyboard
        autoInstallADBKeyboard(connectedDevices);
    } else {
        console.log('\n⚠️ 没有可连接的ADB设备\n');
    }

    // 扫描并添加新设备
    scanAndAddNewDevices();
}

// 扫描并添加新设备到配置
function scanAndAddNewDevices() {
    console.log('🔍 扫描已连接的ADB设备...');
    let newDevicesFound = 0;
    const usbDevices = [];  // USB连接的设备

    try {
        const result = execSync(`${ADB_PATH} devices`, { encoding: 'utf8', timeout: 10000 });
        const lines = result.split('\n').slice(1); // 跳过标题行

        lines.forEach(line => {
            const match = line.match(/^(\S+)\s+device/);
            if (match) {
                const deviceId = match[1];

                // 检查是否是USB设备（非IP:端口格式）
                const isUsbDevice = !deviceId.includes(':') && !deviceId.match(/^\d+\.\d+\.\d+\.\d+/);
                if (isUsbDevice) {
                    usbDevices.push(deviceId);
                }

                // 检查是否已在配置中
                if (!deviceConfig[deviceId]) {
                    // 获取设备信息
                    let alias = deviceId;
                    let model = 'Unknown';

                    try {
                        model = execSync(`${ADB_PATH} -s ${deviceId} shell getprop ro.product.model`, { encoding: 'utf8', timeout: 5000 }).trim();
                        alias = model || deviceId;
                    } catch (e) {
                        // 使用设备ID作为别名
                    }

                    // 添加到配置
                    deviceConfig[deviceId] = {
                        alias: alias,
                        description: '自动添加'
                    };

                    console.log(`   🆕 发现新设备: ${deviceId} (${alias})`);
                    newDevicesFound++;
                }
            }
        });

        // 如果发现USB设备，尝试自动开启无线ADB
        if (usbDevices.length > 0) {
            console.log('\n📡 检测到USB连接的设备，正在自动开启无线ADB...');
            for (const usbDeviceId of usbDevices) {
                autoEnableWirelessADB(usbDeviceId);
            }
        }

        // 如果发现新设备，保存配置
        if (newDevicesFound > 0) {
            saveDeviceConfig(deviceConfig);
            console.log(`\n✅ 已自动添加 ${newDevicesFound} 台新设备到配置文件\n`);

            // 为新设备安装ADBKeyboard
            const newDeviceIds = [];
            try {
                const result = execSync(`${ADB_PATH} devices`, { encoding: 'utf8', timeout: 10000 });
                const lines = result.split('\n').slice(1);
                lines.forEach(line => {
                    const match = line.match(/^(\S+)\s+device/);
                    if (match) {
                        newDeviceIds.push(match[1]);
                    }
                });
            } catch (e) {}

            if (newDeviceIds.length > 0) {
                autoInstallADBKeyboard(newDeviceIds);
            }
        } else {
            console.log('   没有发现新设备\n');
        }
    } catch (e) {
        console.log(`   ❌ 扫描失败: ${e.message}\n`);
    }
}

// 自动开启无线ADB并连接
function autoEnableWirelessADB(deviceId) {
    console.log(`\n   [${deviceId}] 正在开启无线ADB...`);

    try {
        // 步骤1: 获取手机IP地址
        console.log(`      获取手机IP地址...`);
        let phoneIp = null;

        try {
            // 尝试多种方式获取IP
            const ipResult = execSync(`${ADB_PATH} -s ${deviceId} shell ip addr show wlan0`, { encoding: 'utf8', timeout: 5000 });
            const ipMatch = ipResult.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
            if (ipMatch) {
                phoneIp = ipMatch[1];
                console.log(`      手机IP: ${phoneIp}`);
            }
        } catch (e) {
            // 备用方法
            try {
                const ifconfigResult = execSync(`${ADB_PATH} -s ${deviceId} shell ifconfig wlan0`, { encoding: 'utf8', timeout: 5000 });
                const ipMatch = ifconfigResult.match(/inet addr:(\d+\.\d+\.\d+\.\d+)/);
                if (ipMatch) {
                    phoneIp = ipMatch[1];
                    console.log(`      手机IP: ${phoneIp}`);
                }
            } catch (e2) {
                console.log(`      ⚠️ 无法获取IP: ${e.message}`);
                return;
            }
        }

        if (!phoneIp) {
            console.log(`      ⚠️ 未能获取手机IP地址`);
            return;
        }

        // 步骤2: 开启无线ADB端口
        console.log(`      开启无线ADB端口 (5555)...`);
        execSync(`${ADB_PATH} -s ${deviceId} tcpip 5555`, { encoding: 'utf8', timeout: 5000 });
        console.log(`      ✅ 已开启`);

        // 步骤3: 等待一下
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        // 同步等待
        execSync(`${ADB_PATH} -s ${deviceId} shell sleep 2`, { encoding: 'utf8', timeout: 5000 });

        // 步骤4: 连接无线ADB
        const wirelessDeviceId = `${phoneIp}:5555`;
        console.log(`      连接无线ADB: ${wirelessDeviceId}...`);

        const connectResult = execSync(`${ADB_PATH} connect ${wirelessDeviceId}`, { encoding: 'utf8', timeout: 10000 });

        if (connectResult.includes('connected')) {
            console.log(`      ✅ 无线连接成功!`);

            // 步骤5: 添加到配置文件
            let model = 'Unknown';
            try {
                model = execSync(`${ADB_PATH} -s ${deviceId} shell getprop ro.product.model`, { encoding: 'utf8', timeout: 5000 }).trim();
            } catch (e) {}

            // 检查是否已存在
            if (!deviceConfig[wirelessDeviceId]) {
                deviceConfig[wirelessDeviceId] = {
                    alias: model || wirelessDeviceId,
                    description: '自动添加'
                };
                saveDeviceConfig(deviceConfig);
                console.log(`      ✅ 已添加到配置: ${wirelessDeviceId} (${model})`);
            }

            // 为新设备安装ADBKeyboard
            autoInstallADBKeyboard([wirelessDeviceId]);

        } else {
            console.log(`      ⚠️ 连接失败: ${connectResult.trim()}`);
        }

    } catch (e) {
        console.log(`      ❌ 开启无线ADB失败: ${e.message}`);
    }
}

// 检查ADBKeyboard是否已安装
function isADBKeyboardInstalled(deviceId) {
    try {
        const result = execSync(`${ADB_PATH} -s ${deviceId} shell pm list packages`, { encoding: 'utf8', timeout: 10000 });
        return result.includes('com.android.adbkeyboard');
    } catch (e) {
        return false;
    }
}

// 检查ADBKeyboard是否已启用
function isADBKeyboardEnabled(deviceId) {
    try {
        const result = execSync(`${ADB_PATH} -s ${deviceId} shell ime list -s`, { encoding: 'utf8', timeout: 10000 });
        return result.includes('com.android.adbkeyboard/.AdbIME');
    } catch (e) {
        return false;
    }
}

// 自动安装ADBKeyboard
function autoInstallADBKeyboard(deviceIds) {
    // 检查APK文件是否存在
    if (!fs.existsSync(ADBKEYBOARD_APK)) {
        console.log('⚠️ ADBKeyboard.apk 不存在，跳过自动安装');
        console.log('   请下载: https://github.com/senzhk/ADBKeyBoard/raw/master/ADBKeyboard.apk');
        console.log('   放到目录: ' + ADBKEYBOARD_APK + '\n');
        return;
    }

    console.log('📦 正在检查/安装 ADBKeyboard...\n');

    deviceIds.forEach(deviceId => {
        const alias = deviceConfig[deviceId]?.alias || deviceId;
        console.log(`   [${alias}] 检查 ADBKeyboard...`);

        // 检查是否已安装
        if (isADBKeyboardInstalled(deviceId)) {
            console.log(`      ✅ 已安装`);

            // 为所有可能的用户空间启用输入法
            [0, 999].forEach(userId => {
                const spaceName = userId === 0 ? '机主空间' : '分身空间';
                console.log(`      ${spaceName} (User ${userId}) 启用中...`);
                try {
                    // 启用ADBKeyboard
                    execSync(`${ADB_PATH} -s ${deviceId} shell ime enable --user ${userId} com.android.adbkeyboard/.AdbIME`, { encoding: 'utf8', timeout: 10000 });
                    // 设置为默认输入法
                    execSync(`${ADB_PATH} -s ${deviceId} shell ime set --user ${userId} com.android.adbkeyboard/.AdbIME`, { encoding: 'utf8', timeout: 10000 });
                    console.log(`      ✅ ${spaceName} 已启用`);
                } catch (e) {
                    console.log(`      ⚠️ ${spaceName} 启用失败: ${e.message}`);
                }
            });
        } else {
            // 安装ADBKeyboard
            console.log(`      安装中...`);
            try {
                const result = execSync(`${ADB_PATH} -s ${deviceId} install "${ADBKEYBOARD_APK}"`, { encoding: 'utf8', timeout: 30000 });
                if (result.includes('Success')) {
                    console.log(`      ✅ 安装成功`);

                    // 为所有可能的用户空间启用输入法
                    [0, 999].forEach(userId => {
                        const spaceName = userId === 0 ? '机主空间' : '分身空间';
                        console.log(`      ${spaceName} (User ${userId}) 启用中...`);
                        try {
                            execSync(`${ADB_PATH} -s ${deviceId} shell ime enable --user ${userId} com.android.adbkeyboard/.AdbIME`, { encoding: 'utf8', timeout: 10000 });
                            execSync(`${ADB_PATH} -s ${deviceId} shell ime set --user ${userId} com.android.adbkeyboard/.AdbIME`, { encoding: 'utf8', timeout: 10000 });
                            console.log(`      ✅ ${spaceName} 已启用`);
                        } catch (e) {
                            console.log(`      ⚠️ ${spaceName} 启用失败: ${e.message}`);
                        }
                    });
                } else {
                    console.log(`      ⚠️ 安装结果: ${result.trim()}`);
                }
            } catch (e) {
                console.log(`      ❌ 安装失败: ${e.message}`);
            }
        }
    });

    console.log('');
}

// ===== 投屏功能 =====

// 获取设备截图
function getDeviceScreenshot(deviceId) {
    const tempFile = path.join(__dirname, `temp_screen_${Date.now()}.png`);
    try {
        execSync(`${ADB_PATH} -s ${deviceId} exec-out screencap -p > "${tempFile}"`, {
            encoding: 'utf8',
            timeout: 5000
        });

        if (fs.existsSync(tempFile)) {
            const imageBuffer = fs.readFileSync(tempFile);
            fs.unlinkSync(tempFile);  // 删除临时文件
            return imageBuffer.toString('base64');
        }
    } catch (e) {
        console.log(`截图失败 [${deviceId}]: ${e.message}`);
        // 失败时也清理可能残留的临时文件
        if (fs.existsSync(tempFile)) {
            try {
                fs.unlinkSync(tempFile);
            } catch (err) {
                // 忽略删除失败
            }
        }
    }
    return null;
}

// 启动投屏流
function startScreenStream(deviceId) {
    if (screenStreamStatus.has(deviceId) && screenStreamStatus.get(deviceId).running) {
        return;  // 已经在运行
    }

    console.log(`📺 启动投屏: ${deviceId}`);

    const status = { running: true, interval: null };
    screenStreamStatus.set(deviceId, status);

    // 每500ms推送一次截图
    status.interval = setInterval(() => {
        const clients = screenClients.get(deviceId);
        if (!clients || clients.size === 0) {
            // 没有客户端，停止推流
            stopScreenStream(deviceId);
            return;
        }

        const screenshot = getDeviceScreenshot(deviceId);
        if (screenshot) {
            const message = JSON.stringify({
                type: 'SCREEN_FRAME',
                deviceId,
                data: screenshot,
                timestamp: Date.now()
            });

            clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(message);
                }
            });
        }
    }, 500);  // 500ms刷新率
}

// 停止投屏流
function stopScreenStream(deviceId) {
    const status = screenStreamStatus.get(deviceId);
    if (status) {
        if (status.interval) {
            clearInterval(status.interval);
        }
        screenStreamStatus.delete(deviceId);
        console.log(`⏹️ 停止投屏: ${deviceId}`);
    }
}

// 添加投屏客户端
function addScreenClient(deviceId, ws) {
    if (!screenClients.has(deviceId)) {
        screenClients.set(deviceId, new Set());
    }
    screenClients.get(deviceId).add(ws);
    startScreenStream(deviceId);
}

// 移除投屏客户端
function removeScreenClient(deviceId, ws) {
    const clients = screenClients.get(deviceId);
    if (clients) {
        clients.delete(ws);
        if (clients.size === 0) {
            screenClients.delete(deviceId);
            stopScreenStream(deviceId);
        }
    }
}

// Excel文件配置
const EXCEL_FILES_CONFIG = path.join(__dirname, 'excel-files.json');

// 读取Excel文件列表
function loadExcelFiles() {
    try {
        if (fs.existsSync(EXCEL_FILES_CONFIG)) {
            const data = fs.readFileSync(EXCEL_FILES_CONFIG, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('读取Excel文件列表失败:', error.message);
    }
    return [];
}

// 创建HTTP服务器
const server = http.createServer((req, res) => {
    // 静态文件服务
    if (req.url === '/' || req.url === '/index.html') {
        serveFile(res, 'web/index.html', 'text/html');
    } else if (req.url === '/api.js') {
        serveFile(res, 'web/api.js', 'application/javascript');
    } else if (req.url.startsWith('/api/')) {
        handleAPI(req, res);
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// 提供静态文件
function serveFile(res, filePath, contentType) {
    const fullPath = path.join(__dirname, filePath);
    fs.readFile(fullPath, (err, data) => {
        if (err) {
            res.writeHead(500);
            res.end('Error loading file');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        }
    });
}

// 处理API请求
function handleAPI(req, res) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // GET /api/devices - 获取设备列表（包含ADB设备）
    if (req.url === '/api/devices' && req.method === 'GET') {
        const devicesObj = {};

        // 添加WebSocket设备
        devices.forEach((device, id) => {
            const config = deviceConfig[id] || {};
            devicesObj[id] = {
                status: 'online',
                info: device.info,
                account: device.account,
                lastSeen: device.lastSeen,
                type: 'websocket',
                alias: config.alias || device.info.model,
                description: config.description || ''
            };
        });

        // 扫描ADB设备
        try {
            const result = execSync(`${ADB_PATH} devices`, { encoding: 'utf8' });
            const lines = result.split('\n').slice(1); // 跳过标题行

            lines.forEach(line => {
                const match = line.match(/^(\S+)\s+device/);
                if (match) {
                    const deviceId = match[1];
                    const config = deviceConfig[deviceId] || {};

                    // 获取设备信息
                    try {
                        const model = execSync(`${ADB_PATH} -s ${deviceId} shell getprop ro.product.model`, { encoding: 'utf8' }).trim();
                        const brand = execSync(`${ADB_PATH} -s ${deviceId} shell getprop ro.product.brand`, { encoding: 'utf8' }).trim();
                        const resolution = execSync(`${ADB_PATH} -s ${deviceId} shell wm size`, { encoding: 'utf8' }).trim().replace('Physical size: ', '');

                        devicesObj[deviceId] = {
                            status: 'online',
                            info: {
                                model: model || 'Unknown',
                                brand: brand || 'Unknown',
                                resolution: resolution || 'Unknown'
                            },
                            account: {
                                name: config.alias || 'ADB设备',
                                userId: 0
                            },
                            lastSeen: Date.now(),
                            type: 'adb',
                            alias: config.alias || model,
                            description: config.description || ''
                        };
                    } catch (err) {
                        devicesObj[deviceId] = {
                            status: 'online',
                            info: { model: deviceId, brand: 'Unknown', resolution: 'Unknown' },
                            account: { name: config.alias || 'ADB设备', userId: 0 },
                            lastSeen: Date.now(),
                            type: 'adb',
                            alias: config.alias || deviceId,
                            description: config.description || ''
                        };
                    }
                }
            });
        } catch (error) {
            console.error('扫描ADB设备失败:', error.message);
        }

        res.writeHead(200);
        res.end(JSON.stringify({ devices: devicesObj }));
        return;
    }

    // PUT /api/device-config/:deviceId - 更新设备配置
    if (req.url.match(/^\/api\/device-config\/.+/) && req.method === 'PUT') {
        const deviceId = decodeURIComponent(req.url.split('/').pop());

        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);

                // 更新配置
                if (!deviceConfig[deviceId]) {
                    deviceConfig[deviceId] = {};
                }

                if (data.alias !== undefined) deviceConfig[deviceId].alias = data.alias;
                if (data.description !== undefined) deviceConfig[deviceId].description = data.description;

                // 保存到文件
                if (saveDeviceConfig(deviceConfig)) {
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true, message: '配置已更新' }));
                } else {
                    res.writeHead(500);
                    res.end(JSON.stringify({ success: false, message: '保存配置失败' }));
                }
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, message: error.message }));
            }
        });
        return;
    }

    // GET /api/excel-files - 获取Excel文件列表
    if (req.url.startsWith('/api/excel-files') && req.method === 'GET') {
        const urlObj = new URL(req.url, `http://localhost:${PORT}`);
        const scan = urlObj.searchParams.get('scan');

        if (scan === 'true') {
            // 扫描电脑上的Excel文件
            try {
                const excelFiles = [];

                // 扫描常见目录
                const scanDirs = [
                    './accounts'
                ];

                // 扫描每个目录
                for (const dir of scanDirs) {
                    if (fs.existsSync(dir)) {
                        const files = findExcelFiles(dir, 3); // 最多扫描3层子目录
                        excelFiles.push(...files);
                    }
                }

                // 去重（按路径）
                const uniqueFiles = [];
                const seenPaths = new Set();
                for (const file of excelFiles) {
                    if (!seenPaths.has(file.path)) {
                        seenPaths.add(file.path);
                        uniqueFiles.push(file);
                    }
                }

                res.writeHead(200);
                res.end(JSON.stringify({ success: true, files: uniqueFiles, total: uniqueFiles.length }));
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, message: error.message }));
            }
        } else {
            // 返回预设的文件列表
            try {
                const excelFiles = loadExcelFiles();
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, files: excelFiles }));
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, message: error.message }));
            }
        }
        return;
    }

    // 递归查找Excel文件
    function findExcelFiles(dir, maxDepth, currentDepth = 0) {
        const results = [];

        if (currentDepth >= maxDepth) return results;

        try {
            const items = fs.readdirSync(dir, { withFileTypes: true });

            for (const item of items) {
                const fullPath = path.join(dir, item.name);

                if (item.isDirectory()) {
                    // 跳过隐藏文件夹和系统文件夹
                    if (item.name.startsWith('.') || item.name.startsWith('$') ||
                        item.name === 'node_modules' || item.name === 'Windows' ||
                        item.name === 'Program Files' || item.name === 'Program Files (x86)') {
                        continue;
                    }
                    // 递归扫描子目录
                    results.push(...findExcelFiles(fullPath, maxDepth, currentDepth + 1));
                } else if (item.isFile()) {
                    // 检查是否是Excel文件
                    const ext = path.extname(item.name).toLowerCase();
                    if (ext === '.xls' || ext === '.xlsx') {
                        results.push({
                            name: item.name,
                            path: fullPath,
                            dir: dir
                        });
                    }
                }
            }
        } catch (error) {
            // 忽略无权限访问的目录
        }

        return results;
    }
    if (req.url === '/api/excel-files' && req.method === 'GET') {
        try {
            const excelFiles = loadExcelFiles();
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, files: excelFiles }));
        } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, message: error.message }));
        }
        return;
    }

    // POST /api/excel-upload - 上传并处理Excel文件
    if (req.url === '/api/excel-upload' && req.method === 'POST') {
        const busboy = require('busboy');
        const bb = busboy({ headers: req.headers });

        let fileBuffer = [];
        let fileName = '';

        bb.on('file', (name, file, info) => {
            const { filename } = info;
            fileName = filename;

            file.on('data', (data) => {
                fileBuffer.push(data);
            });
        });

        bb.on('finish', () => {
            try {
                // 保存到临时文件
                const tempPath = path.join(__dirname, 'temp_' + Date.now() + '_' + fileName);
                const buffer = Buffer.concat(fileBuffer);
                fs.writeFileSync(tempPath, buffer);

                // 读取Excel文件
                const workbook = XLSX.readFile(tempPath);
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const data = XLSX.utils.sheet_to_json(worksheet);

                // 提取视频信息
                const videos = data.map((row, index) => {
                    return {
                        index: index + 1,
                        description: row['视频标签'] || row['描述'] || `视频${index + 1}`,
                        path: row['视频位置'] || row['路径'] || row['视频路径'] || ''
                    };
                }).filter(v => v.path);

                // 删除临时文件
                fs.unlinkSync(tempPath);

                res.writeHead(200);
                res.end(JSON.stringify({
                    success: true,
                    videos,
                    total: videos.length,
                    path: tempPath
                }));
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, message: error.message }));
            }
        });

        req.pipe(bb);
        return;
    }

    // GET /api/excel - 读取Excel文件
    if (req.url.startsWith('/api/excel?') && req.method === 'GET') {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const filePath = url.searchParams.get('path');

        if (!filePath) {
            res.writeHead(400);
            res.end(JSON.stringify({ success: false, message: '缺少文件路径' }));
            return;
        }

        try {
            // 读取Excel文件
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet);

            // 提取视频信息
            const videos = data.map((row, index) => {
                // 假设Excel列名为：视频标签、视频位置
                return {
                    index: index + 1,
                    description: row['视频标签'] || row['描述'] || `视频${index + 1}`,
                    path: row['视频位置'] || row['路径'] || row['视频路径'] || ''
                };
            }).filter(v => v.path); // 过滤掉没有路径的行

            res.writeHead(200);
            res.end(JSON.stringify({ success: true, videos, total: videos.length }));
        } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, message: error.message }));
        }
        return;
    }

    // GET /api/apps - 获取设备已安装应用
    if (req.url.startsWith('/api/apps?deviceId=') && req.method === 'GET') {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const deviceId = url.searchParams.get('deviceId');

        if (!deviceId) {
            res.writeHead(400);
            res.end(JSON.stringify({ success: false, message: '缺少设备ID' }));
            return;
        }

        try {
            const result = execSync(`${ADB_PATH} -s ${deviceId} shell pm list packages -3`, { encoding: 'utf8' });
            const packages = result.split('\n')
                .filter(line => line.startsWith('package:'))
                .map(line => line.replace('package:', '').trim())
                .filter(pkg => pkg);

            // 常见应用名称映射
            const appNames = {
                'com.tencent.mm': '微信',
                'com.ss.android.ugc.aweme': '抖音',
                'com.xingin.xhs': '小红书',
                'com.smile.gifmaker': '快手',
                'org.autojs.autoxjs.v6': 'AutoX.js',
                'com.android.adbkeyboard': 'ADB键盘',
                'com.baidu.BaiduMap': '百度地图',
                'com.autonavi.minimap': '高德地图',
                'cn.wps.moffice.lite': 'WPS Office'
            };

            const apps = packages.map(pkg => ({
                package: pkg,
                name: appNames[pkg] || pkg.split('.').pop()
            })).sort((a, b) => a.name.localeCompare(b.name));

            res.writeHead(200);
            res.end(JSON.stringify({ success: true, apps }));
        } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, message: error.message }));
        }
        return;
    }

    // POST /api/tasks/:taskId/stop - 停止任务
    if (req.url.match(/^\/api\/tasks\/.+\/stop/) && req.method === 'POST') {
        const parts = req.url.split('/');
        const taskId = parts[3];  // URL: /api/tasks/:taskId/stop

        console.log(`\n🛑 收到停止请求: URL=${req.url}, taskId=${taskId}`);

        if (tasks.has(taskId)) {
            const task = tasks.get(taskId);
            console.log(`   任务状态: ${task.status}`);

            // 可以停止运行中或等待中的任务
            if (task.status === 'running' || task.status === 'pending') {
                // 标记任务为已停止
                task.status = 'stopped';
                task.error = '用户手动停止';

                // 如果在队列中等待，从队列移除
                const queue = deviceQueues.get(task.deviceId);
                if (queue) {
                    const index = queue.queue.findIndex(t => t.taskId === taskId);
                    if (index !== -1) {
                        queue.queue.splice(index, 1);
                        console.log(`\n⏹️ 任务已从队列移除: ${taskId}\n`);
                    }
                }

                // 如果有控制器，设置停止标志
                if (taskControllers.has(taskId)) {
                    taskControllers.get(taskId).stopped = true;
                }

                console.log(`\n⏹️ 任务已停止: ${taskId}\n`);

                res.writeHead(200);
                res.end(JSON.stringify({ success: true, message: '任务已停止' }));
            } else {
                res.writeHead(400);
                res.end(JSON.stringify({ success: false, message: '任务已完成或已停止' }));
            }
        } else {
            res.writeHead(404);
            res.end(JSON.stringify({ success: false, message: '任务不存在' }));
        }
        return;
    }

    // GET /api/tasks - 获取任务列表
    if (req.url === '/api/tasks' && req.method === 'GET') {
        const tasksObj = {};
        tasks.forEach((task, id) => {
            tasksObj[id] = task;
        });

        // 添加队列信息
        const queuesInfo = {};
        deviceQueues.forEach((queue, deviceId) => {
            queuesInfo[deviceId] = {
                pending: queue.queue.length,
                running: queue.running
            };
        });

        res.writeHead(200);
        res.end(JSON.stringify({ tasks: tasksObj, queues: queuesInfo }));
        return;
    }

    // POST /api/tasks - 创建任务
    if (req.url === '/api/tasks' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { deviceId, videoPath, description, userId } = data;

                const taskId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                const task = {
                    taskId,
                    deviceId,
                    status: 'pending',
                    videoPath,
                    description,
                    userId: userId || 0,  // 0=机主微信, 999=分身微信
                    progress: 0,
                    createdAt: Date.now()
                };

                tasks.set(taskId, task);

                // 判断设备类型
                if (devices.has(deviceId)) {
                    // WebSocket设备
                    const device = devices.get(deviceId);
                    device.ws.send(JSON.stringify({
                        type: 'TASK_ASSIGN',
                        payload: {
                            taskId,
                            videoPath,
                            description,
                            userId: task.userId,
                            accountConfig: device.account
                        }
                    }));
                    task.type = 'websocket';
                    task.status = 'running';
                } else {
                    // ADB设备 - 加入队列
                    task.type = 'adb';
                    addToQueue(deviceId, task);
                }

                res.writeHead(200);
                res.end(JSON.stringify({ success: true, taskId, queuePosition: getQueuePosition(deviceId, taskId) }));
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, message: error.message }));
            }
        });
        return;
    }

    // GET /api/screenshot - 获取设备截图
    if (req.url.startsWith('/api/screenshot?') && req.method === 'GET') {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const deviceId = url.searchParams.get('deviceId');

        if (!deviceId) {
            res.writeHead(400);
            res.end(JSON.stringify({ success: false, message: '缺少设备ID' }));
            return;
        }

        try {
            const screenshot = getDeviceScreenshot(deviceId);
            if (screenshot) {
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, data: screenshot }));
            } else {
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, message: '截图失败' }));
            }
        } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, message: error.message }));
        }
        return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not Found' }));
}

// WebSocket服务器
const wss = new WebSocket.Server({ server });

console.log('========================================');
console.log('  微信视频号群控系统');
console.log('========================================');
console.log(`WebSocket: ws://localhost:${PORT}`);
console.log(`Web界面:  http://localhost:${PORT}`);
console.log('========================================\n');

// WebSocket连接处理
wss.on('connection', (ws, req) => {
    let deviceId = null;
    let screenDeviceId = null;  // 投屏订阅的设备ID

    ws.on('message', (data) => {
        const msg = JSON.parse(data);

        switch (msg.type) {
            case 'REGISTER':
                deviceId = msg.payload.deviceId;
                devices.set(deviceId, {
                    ws,
                    info: msg.payload.deviceInfo,
                    account: msg.payload.account,
                    lastSeen: Date.now()
                });
                console.log(`✅ 设备已注册: ${deviceId}`);
                console.log(`   设备: ${msg.payload.deviceInfo.model}`);
                console.log(`   账号: ${msg.payload.account.name}\n`);
                break;

            case 'HEARTBEAT':
                if (deviceId && devices.has(deviceId)) {
                    devices.get(deviceId).lastSeen = Date.now();
                }
                break;

            case 'LOG':
                console.log(`[${deviceId}] ${msg.payload.message}`);
                break;

            case 'TASK_RESULT':
                const result = msg.payload;
                if (tasks.has(result.taskId)) {
                    const task = tasks.get(result.taskId);
                    task.status = result.success ? 'completed' : 'failed';
                    task.progress = 100;
                    task.result = result;

                    console.log(`\n📋 任务结果: ${result.success ? '✅ 成功' : '❌ 失败'}`);
                    if (result.error) {
                        console.log(`   错误: ${result.error}`);
                    }
                }
                break;

            // 投屏相关
            case 'SCREEN_SUBSCRIBE':
                screenDeviceId = msg.payload.deviceId;
                addScreenClient(screenDeviceId, ws);
                console.log(`📺 客户端订阅投屏: ${screenDeviceId}`);
                break;

            case 'SCREEN_UNSUBSCRIBE':
                if (screenDeviceId) {
                    removeScreenClient(screenDeviceId, ws);
                    screenDeviceId = null;
                }
                break;
        }
    });

    ws.on('close', () => {
        if (deviceId) {
            devices.delete(deviceId);
            console.log(`\n❌ 设备离线: ${deviceId}\n`);
        }
        // 清理投屏订阅
        if (screenDeviceId) {
            removeScreenClient(screenDeviceId, ws);
        }
    });
});

// 队列管理函数
function getDeviceQueue(deviceId) {
    if (!deviceQueues.has(deviceId)) {
        deviceQueues.set(deviceId, { queue: [], running: false });
    }
    return deviceQueues.get(deviceId);
}

function addToQueue(deviceId, task) {
    const queue = getDeviceQueue(deviceId);
    queue.queue.push(task);
    console.log(`\n📥 任务加入队列: ${task.taskId} (设备: ${deviceId}, 队列位置: ${queue.queue.length})`);
    processQueue(deviceId);
}

function getQueuePosition(deviceId, taskId) {
    const queue = getDeviceQueue(deviceId);
    const index = queue.queue.findIndex(t => t.taskId === taskId);
    return index + 1;
}

async function processQueue(deviceId) {
    const queue = getDeviceQueue(deviceId);

    // 如果正在执行或队列为空，直接返回
    if (queue.running || queue.queue.length === 0) {
        return;
    }

    // 标记为正在执行
    queue.running = true;

    // 取出第一个任务
    const task = queue.queue.shift();
    task.status = 'running';

    console.log(`\n▶️ 开始执行队列任务: ${task.taskId} (剩余队列: ${queue.queue.length})`);

    try {
        await executeADBTask(task.taskId, task);
    } finally {
        // 任务完成，标记为空闲
        queue.running = false;

        // 继续处理队列中的下一个任务
        if (queue.queue.length > 0) {
            console.log(`\n⏭️ 队列中还有 ${queue.queue.length} 个任务等待执行...`);
            setTimeout(() => processQueue(deviceId), 2000);  // 间隔2秒执行下一个
        }
    }
}

// ADB任务执行
async function executeADBTask(taskId, task) {
    const { deviceId, videoPath, description, userId } = task;
    const isDualApp = userId === 999;  // 是否分身微信

    // 创建任务控制器
    const controller = { stopped: false };
    taskControllers.set(taskId, controller);

    console.log(`\n📤 开始执行ADB任务: ${taskId}`);
    console.log(`   设备: ${deviceId}`);
    console.log(`   视频: ${videoPath}`);
    console.log(`   微信类型: ${isDualApp ? '分身微信' : '机主微信'}`);

    // 根据微信类型生成不同的命令
    const userFlag = isDualApp ? '--user 999' : '';

    // 检查视频文件是否存在
    if (!fs.existsSync(videoPath)) {
        throw new Error(`视频文件不存在: ${videoPath}`);
    }

    // 处理文件名（去除空格）
    const originalFilename = videoPath.split(/[\\/]/).pop();
    const safeFilename = originalFilename.replace(/\s+/g, '_');
    const targetDir = '/storage/emulated/0/Pictures/WeiXin';

    const steps = [
        // 步骤0: 清空视频（清空多个目录）
        { name: '清空手机视频', action: () => {
            execSync(`${ADB_PATH} -s ${deviceId} shell "rm -rf /storage/emulated/0/Pictures/WeiXin/*.mp4"`);
            execSync(`${ADB_PATH} -s ${deviceId} shell "rm -rf /storage/emulated/0/DCIM/*.mp4"`);
            execSync(`${ADB_PATH} -s ${deviceId} shell "rm -rf /storage/emulated/0/DCIM/Camera/*.mp4"`);
            execSync(`${ADB_PATH} -s ${deviceId} shell "rm -rf /storage/emulated/0/Movies/*.mp4"`);
            execSync(`${ADB_PATH} -s ${deviceId} shell "rm -rf /storage/emulated/999/DCIM/Camera/*.mp4"`);
            execSync(`${ADB_PATH} -s ${deviceId} shell "rm -rf /storage/emulated/999/DCIM/*.mp4"`);
            execSync(`${ADB_PATH} -s ${deviceId} shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/`);
        }},
        // 步骤1: 推送视频
        { name: '推送视频到手机', action: () => {
            console.log(`      原文件: ${originalFilename}`);
            console.log(`      目标: ${targetDir}/${safeFilename}`);
            execSync(`${ADB_PATH} -s ${deviceId} push "${videoPath}" "${targetDir}/${safeFilename}"`);
            execSync(`${ADB_PATH} -s ${deviceId} shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///storage/emulated/0/Pictures/WeiXin/`);
        }},
        // 步骤2: 等待视频加载
        { name: '等待视频加载', action: () => {} },
        // 步骤3: 停止微信
        { name: '停止微信', action: () => execSync(`${ADB_PATH} -s ${deviceId} shell am force-stop com.tencent.mm`) },
        // 步骤4: 等待关闭
        { name: '等待关闭', action: () => {} },
        // 步骤5: 启动微信
        { name: '启动微信', action: () => execSync(`${ADB_PATH} -s ${deviceId} shell am start ${userFlag} -n com.tencent.mm/.ui.LauncherUI`) },
        // 步骤6: 等待启动
        { name: '等待启动', action: () => {} },
        // 步骤7: 点击发现
        { name: '点击发现', action: () => execSync(`${ADB_PATH} -s ${deviceId} shell input tap 675 2300`) },
        // 步骤8: 点击视频号
        { name: '点击视频号', action: () => execSync(`${ADB_PATH} -s ${deviceId} shell input tap 326 500`) },
        // 步骤9: 点击个人
        { name: '点击个人', action: () => execSync(`${ADB_PATH} -s ${deviceId} shell input tap 1000 120`) },
        // 步骤10: 点击发表
        { name: '点击发表', action: () => execSync(`${ADB_PATH} -s ${deviceId} shell input tap 240 1850`) },
        // 步骤11: 点击相册
        { name: '点击相册', action: () => execSync(`${ADB_PATH} -s ${deviceId} shell input tap 100 2300`) },
        // 步骤12: 点击图片视频
        { name: '点击图片视频', action: () => execSync(`${ADB_PATH} -s ${deviceId} shell input tap 540 200`) },
        // 步骤13: 点击所有视频
        { name: '点击所有视频', action: () => execSync(`${ADB_PATH} -s ${deviceId} shell input tap 540 400`) },
        // 步骤14: 选择视频
        { name: '选择视频', action: () => execSync(`${ADB_PATH} -s ${deviceId} shell input tap 200 400`) },
        // 步骤15: 点击选择
        { name: '点击选择', action: () => execSync(`${ADB_PATH} -s ${deviceId} shell input tap 972 150`) },
        // 步骤16: 点击完成1
        { name: '点击完成1', action: () => execSync(`${ADB_PATH} -s ${deviceId} shell input tap 980 2300`) },
        // 步骤17: 点击完成2
        { name: '点击完成2', action: () => execSync(`${ADB_PATH} -s ${deviceId} shell input tap 940 2250`) },
        // 步骤18: 切换输入法
        { name: '切换输入法', action: () => {
            execSync(`${ADB_PATH} -s ${deviceId} shell ime enable com.android.adbkeyboard/.AdbIME`);
            execSync(`${ADB_PATH} -s ${deviceId} shell ime set ${userFlag} com.android.adbkeyboard/.AdbIME`);
        }},
        // 步骤19: 等待输入法就绪
        { name: '等待输入法', action: () => {} },
        // 步骤20: 点击描述框
        { name: '点击描述框', action: () => execSync(`${ADB_PATH} -s ${deviceId} shell input tap 540 1072`) },
        // 步骤21: 等待焦点
        { name: '等待焦点', action: () => {} },
        // 步骤22: 输入描述 (使用Base64编码，支持所有语言)
        // 注意：广播不需要--user参数，ADBKeyboard会自动处理
        { name: '输入描述', action: () => {
            console.log(`      描述内容: ${description}`);
            // 使用Base64编码，确保中文/俄文等都能正确输入
            const base64Text = Buffer.from(description, 'utf-8').toString('base64');
            // 广播不需要--user参数
            const cmd = `${ADB_PATH} -s ${deviceId} shell am broadcast -a ADB_INPUT_B64 --es msg ${base64Text}`;
            console.log(`      执行: Base64编码输入`);
            try {
                const result = execSync(cmd, { encoding: 'utf8' });
                console.log(`      结果: ${result.trim()}`);
            } catch (e) {
                console.log(`      错误: ${e.message}`);
            }
        }},
        // 步骤23: 点击发表
        { name: '点击发表', action: () => execSync(`${ADB_PATH} -s ${deviceId} shell input tap 1000 180`) }
    ];

    try {
        for (let i = 0; i < steps.length; i++) {
            // 检查是否被停止
            if (controller.stopped) {
                console.log(`\n⏹️ 任务被用户停止: ${taskId}\n`);
                return;
            }

            const step = steps[i];
            console.log(`   步骤${i + 1}/${steps.length}: ${step.name}`);

            step.action();

            // 更新进度
            task.progress = Math.round(((i + 1) / steps.length) * 100);

            // 可中断的延迟 (每0.5秒检查一次停止标志)
            for (let j = 0; j < 5; j++) {  // 5 * 0.5s = 2.5s
                if (controller.stopped) {
                    console.log(`\n⏹️ 任务被用户停止: ${taskId}\n`);
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // 任务完成
        task.status = 'completed';
        task.progress = 100;
        console.log(`\n✅ 任务完成: ${taskId}\n`);

    } catch (error) {
        if (controller.stopped) {
            console.log(`\n⏹️ 任务已停止: ${taskId}\n`);
        } else {
            task.status = 'failed';
            task.error = error.message;
            console.error(`\n❌ 任务失败: ${taskId} - ${error.message}\n`);
        }
    } finally {
        // 清理控制器
        taskControllers.delete(taskId);
    }
}

// 启动HTTP服务器
server.listen(PORT, () => {
    console.log('请在浏览器打开: http://localhost:' + PORT);

    // 自动连接ADB设备
    autoConnectADBDevices();
});
