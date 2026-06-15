/**
 * 微信视频号群控系统 - 客户端
 * 运行在 AutoX.js 上
 * MVP版本
 */

"ui";

// ===== 配置 =====
const SERVER_URL = "ws://192.168.31.216:3000";  // 你的PC IP

// ===== UI 界面 =====
ui.layout(
    <vertical padding="16">
        <text text="微信视频号群控客户端" textSize="20" gravity="center"/>
        <text id="statusText" text="状态: 未连接" textSize="14" marginTop="16"/>
        <text id="deviceInfo" text="" textSize="12" marginTop="8"/>
        <button id="connectBtn" text="连接服务器" w="*" margin="16"/>
        <text id="taskStatus" text="" textSize="12" marginTop="16"/>
    </vertical>
);

// ===== 全局变量 =====
let ws = null;
let accountConfig = null;

// ===== 初始化 =====
function init() {
    // 获取设备信息
    const deviceInfo = {
        model: device.model,
        brand: device.brand,
        androidVersion: device.release,
        resolution: device.width + "x" + device.height,
        imei: device.getIMEI()
    };

    ui.deviceInfo.setText(
        `设备: ${deviceInfo.model} | 分辨率: ${deviceInfo.resolution}`
    );

    // 账号配置（硬编码，后续可从配置文件读取）
    accountConfig = {
        name: '账号A-心',
        userId: 999,  // 0=机主微信, 999=分身微信
        positions: {
            discover: [675, 2300],
            videoChannel: [326, 500],
            personal: [1000, 120],
            publishBtn: [240, 1850],
            album: [100, 2300],
            tagLabel: [540, 200],
            allVideos: [540, 400],
            videoItem: [200, 400],
            selectBtn: [972, 150],
            completeBtn1: [980, 2300],
            completeBtn2: [940, 2250],
            descInput: [540, 1072],
            finalPublish: [1000, 180]
        }
    };

    ui.connectBtn.click(() => connect());

    // 自动连接
    threads.start(function() {
        sleep(1000);
        connect();
    });
}

// ===== 连接服务器 =====
function connect() {
    ui.statusText.setText("状态: 连接中...");

    ws = new WebSocket(SERVER_URL);

    ws.on('open', () => {
        ui.statusText.setText("状态: 已连接");

        // 注册设备
        send({
            type: 'REGISTER',
            payload: {
                deviceId: device.getIMEI(),
                deviceInfo: {
                    model: device.model,
                    brand: device.brand,
                    androidVersion: device.release,
                    resolution: device.width + "x" + device.height
                },
                account: accountConfig
            }
        });

        log('设备已注册，等待任务...');

        // 启动心跳
        startHeartbeat();
    });

    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        handleMessage(msg);
    });

    ws.on('close', () => {
        ui.statusText.setText("状态: 已断开");

        // 自动重连
        setTimeout(() => {
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                log('尝试重新连接...');
                connect();
            }
        }, 5000);
    });

    ws.on('error', (err) => {
        ui.statusText.setText("状态: 连接失败");
        log('连接错误: ' + err.message);
    });
}

// ===== 心跳 =====
function startHeartbeat() {
    setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            send({ type: 'HEARTBEAT' });
        }
    }, 30000);
}

// ===== 消息处理 =====
function handleMessage(msg) {
    switch (msg.type) {
        case 'TASK_ASSIGN':
            executeTask(msg.payload);
            break;
    }
}

// ===== 执行任务 =====
async function executeTask(task) {
    log('开始执行任务: ' + task.taskId);
    ui.taskStatus.setText('任务: 执行中...');

    try {
        // 步骤0: 清空视频
        await runStep(0, '清空视频', () => clearVideos());

        // 步骤1: 准备视频
        await runStep(1, '准备视频', () => prepareVideo(task.videoPath));

        // 步骤2: 重启微信
        await runStep(2, '重启微信', () => restartWeChat());

        // 步骤3-16: 发布流程
        const positions = accountConfig.positions;

        await runStep(3, '发现', () => tap(positions.discover));
        await runStep(4, '视频号', () => tap(positions.videoChannel));
        await runStep(5, '个人视频号', () => tap(positions.personal));
        await runStep(6, '发表视频', () => tap(positions.publishBtn));
        await runStep(7, '相册', () => tap(positions.album));
        await runStep(8, '图片视频', () => tap(positions.tagLabel));
        await runStep(9, '所有视频', () => tap(positions.allVideos));
        await runStep(10, '选择视频', () => tap(positions.videoItem));
        await runStep(11, '点击选择', () => tap(positions.selectBtn));
        await runStep(12, '完成', () => tap(positions.completeBtn1));
        await runStep(13, '完成2', () => tap(positions.completeBtn2));
        await runStep(14, '点击描述框', () => tap(positions.descInput));
        await runStep(15, '输入描述', () => inputText(task.description));
        await runStep(16, '发表', () => tap(positions.finalPublish));

        // 任务成功
        send({
            type: 'TASK_RESULT',
            payload: {
                taskId: task.taskId,
                success: true
            }
        });

        ui.taskStatus.setText('任务: ✅ 完成');
        log('任务完成');

    } catch (err) {
        // 任务失败
        send({
            type: 'TASK_RESULT',
            payload: {
                taskId: task.taskId,
                success: false,
                error: err.message
            }
        });

        ui.taskStatus.setText('任务: ❌ 失败');
        log('任务失败: ' + err.message);
    }
}

// ===== 步骤执行 =====
async function runStep(step, name, action) {
    log(`步骤${step}: ${name}`);

    try {
        await action();
        await sleep(2500);

        // 截图
        const screenshotPath = `/sdcard/logs/s${step}.png`;
        captureScreen(screenshotPath);

        log(`步骤${step}: ✅ 完成`);
        return true;

    } catch (err) {
        log(`步骤${step}: ❌ 失败 - ${err.message}`);
        throw err;
    }
}

// ===== 功能函数 =====
function clearVideos() {
    const dir = '/sdcard/Pictures/WeiXin/';
    if (files.exists(dir)) {
        files.listDir(dir, (name) => {
            if (name.endsWith('.mp4')) {
                files.remove(dir + name);
            }
        });
    }
}

function prepareVideo(sourcePath) {
    const targetPath = '/sdcard/Pictures/WeiXin/video.mp4';
    if (files.exists(sourcePath)) {
        files.copy(sourcePath, targetPath);
    } else {
        throw new Error('视频文件不存在: ' + sourcePath);
    }
}

function restartWeChat() {
    shell("am force-stop com.tencent.mm", true);
    sleep(1000);
    shell(`am start --user ${accountConfig.userId} -n com.tencent.mm/.ui.LauncherUI`, true);
}

function tap(pos) {
    shell(`input tap ${pos[0]} ${pos[1]}`, true);
}

function inputText(text) {
    // 切换输入法
    shell(`ime set --user ${accountConfig.userId} com.android.adbkeyboard/.AdbIME`, true);
    sleep(1000);

    // 分段输入
    const parts = text.split(' ');
    for (let i = 0; i < parts.length; i++) {
        const part = (i < parts.length - 1) ? parts[i] + ' ' : parts[i];
        shell(`am broadcast --user ${accountConfig.userId} -a ADB_INPUT_TEXT --es msg "${part}"`, true);
        sleep(300);
    }
}

function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}

function log(message) {
    console.log(message);
    send({
        type: 'LOG',
        payload: { message }
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== 启动 =====
auto.waitFor();
init();
