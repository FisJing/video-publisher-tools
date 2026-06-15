/**
 * 微信视频号自动发布核心模块
 * 支持多账号、断点续传、日志记录
 */

const XLSX = require('xlsx');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class WeChatVideoPublisher {
    constructor(accountConfig) {
        this.config = {
            adb: 'adb',
            scrcpy: 'scrcpy',
            targetDir: '/storage/emulated/0/Pictures/WeiXin',
            ...accountConfig
        };

        // 确保日志目录存在
        if (!fs.existsSync(this.config.logDir)) {
            fs.mkdirSync(this.config.logDir, { recursive: true });
        }

        this.scrcpyProcess = null;
        this.stepNames = [
            '清空视频', '推送视频', '重启微信', '发现', '视频号',
            '个人视频号', '发表视频', '相册', '图片视频', '所有视频',
            '选择视频', '点击选择', '完成', '点击描述框', '输入描述', '发表'
        ];
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    adb(cmd) {
        const userId = this.config.userId;
        let fullCmd = cmd;

        // 分身微信需要添加 --user 参数
        if (cmd.includes('am start')) {
            fullCmd = cmd.replace('am start', `am start --user ${userId}`);
        } else if (cmd.includes('ime set') && userId !== 0) {
            fullCmd = cmd.replace('ime set', `ime set --user ${userId}`);
        } else if (cmd.includes('am broadcast') && userId !== 0) {
            fullCmd = cmd.replace('am broadcast', `am broadcast --user ${userId}`);
        }

        try {
            return execSync(`${this.config.adb} ${fullCmd}`, {
                encoding: 'utf8',
                timeout: 15000
            });
        } catch (e) {
            return null;
        }
    }

    tap(x, y) {
        this.adb(`shell input tap ${x} ${y}`);
    }

    /**
     * 文本输入方法
     * 支持中文、俄语等多语言输入
     * 使用Base64编码确保可靠性（解决分身微信输入问题）
     */
    async inputText(text) {
        console.log(`  需要输入: ${text}`);

        // 步骤1: 确保ADBKeyboard已启用
        console.log('  1. 切换输入法...');
        const userId = this.config.userId || 0;

        // 为分身空间特别处理
        if (userId === 999) {
            this.adb(`shell ime enable --user 999 com.android.adbkeyboard/.AdbIME`);
            this.adb(`shell ime set --user 999 com.android.adbkeyboard/.AdbIME`);
        } else {
            this.adb(`shell ime enable com.android.adbkeyboard/.AdbIME`);
            this.adb(`shell ime set com.android.adbkeyboard/.AdbIME`);
        }
        await this.sleep(1000);

        // 步骤2: 点击描述框获取焦点
        console.log('  2. 点击描述框...');
        this.tap(...this.config.positions.descInput);
        await this.sleep(1500);

        // 步骤3: 使用Base64编码输入（更可靠，支持所有语言）
        // 注意：广播不需要--user参数
        console.log('  3. Base64编码输入...');
        const base64Text = Buffer.from(text, 'utf-8').toString('base64');
        this.adb(`shell am broadcast -a ADB_INPUT_B64 --es msg ${base64Text}`);
        await this.sleep(2000);

        console.log('  ✓ 输入完成');
    }

    screenshot(step, idx) {
        const filename = `${this.config.logDir}/v${idx}_s${step}.png`;
        this.adb(`exec-out screencap -p > "${filename}"`);
        return filename;
    }

    log(idx, step, status, msg) {
        const line = `[${new Date().toISOString()}] [${this.config.name}] v${idx} s${step} ${status}: ${msg}\n`;
        fs.appendFileSync(`${this.config.logDir}/log.txt`, line);
        console.log(line.trim());
    }

    saveProgress(videoIdx, step) {
        fs.writeFileSync(
            `${this.config.logDir}/progress.json`,
            JSON.stringify({ idx: videoIdx, step })
        );
    }

    loadProgress() {
        try {
            return JSON.parse(fs.readFileSync(`${this.config.logDir}/progress.json`));
        } catch (e) {
            return null;
        }
    }

    clearVideos() {
        console.log('  清空所有视频...');
        this.adb('shell rm -rf /storage/emulated/0/Pictures/WeiXin/*.mp4');
        this.adb('shell rm -rf /storage/emulated/0/DCIM/*.mp4');
        this.adb('shell rm -rf /storage/emulated/0/DCIM/Camera/*.mp4');
        this.adb('shell rm -rf /storage/emulated/0/Movies/*.mp4');
        this.adb('shell rm -rf /storage/emulated/999/DCIM/Camera/*.mp4');
        this.adb('shell rm -rf /storage/emulated/999/DCIM/*.mp4');
        this.adb('shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/');
        console.log('  ✓ 已清空');
    }

    async runStep(idx, step, action, retry = 3) {
        console.log(`\n  [步骤${step}] ${this.stepNames[step] || '操作'}...`);

        for (let i = 0; i < retry; i++) {
            try {
                action();
                await this.sleep(2500);
                const f = this.screenshot(step, idx);

                if (fs.existsSync(f) && fs.statSync(f).size > 1000) {
                    this.log(idx, step, 'OK', f);
                    console.log('  ✓ 成功');
                    return true;
                }

                this.log(idx, step, 'retry', `${i + 1}`);
                await this.sleep(1500);
            } catch (e) {
                this.log(idx, step, 'err', e.message);
            }
        }

        this.log(idx, step, 'FAIL', `retry ${retry}`);
        return false;
    }

    loadVideos() {
        const workbook = XLSX.readFile(this.config.excelPath);
        return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    }

    async publish(video, idx) {
        console.log(`\n========== [${this.config.name}] 视频${idx + 1}: ${video['视频标签']} ==========`);

        // 步骤0: 清空视频
        if (!await this.runStep(idx, 0, () => this.clearVideos())) return false;
        await this.sleep(3000);

        // 步骤1: 推送视频
        const originalFilename = video['视频位置'].split(/[\\/]/).pop();
        const safeFilename = originalFilename.replace(/\s+/g, '_');
        console.log(`  原文件名: ${originalFilename}`);
        console.log(`  目标文件名: ${safeFilename}`);

        if (!await this.runStep(idx, 1, () =>
            this.adb(`push "${video['视频位置']}" "${this.config.targetDir}/${safeFilename}"`)
        )) return false;

        this.adb(`shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///storage/emulated/0/Pictures/WeiXin/`);
        await this.sleep(5000);

        // 步骤2: 重启微信
        if (!await this.runStep(idx, 2, () => {
            this.adb(`shell am force-stop com.tencent.mm`);
            this.adb(`shell am start --user ${this.config.userId} -n com.tencent.mm/.ui.LauncherUI`);
        })) return false;
        await this.sleep(4000);

        // 步骤3-13: 发布流程
        const actions = [
            () => this.tap(...this.config.positions.discover),
            () => this.tap(...this.config.positions.videoChannel),
            () => this.tap(...this.config.positions.personal),
            () => this.tap(...this.config.positions.publishBtn),
            () => this.tap(...this.config.positions.album),
            () => this.tap(...this.config.positions.tagLabel),
            () => this.tap(...this.config.positions.allVideos),
            () => this.tap(...this.config.positions.videoItem),
            () => this.tap(...this.config.positions.selectBtn),
            () => this.tap(...this.config.positions.completeBtn1),
            () => this.tap(...this.config.positions.completeBtn2)
        ];

        for (let step = 3; step <= 13; step++) {
            this.saveProgress(idx, step);
            if (!await this.runStep(idx, step, actions[step - 3])) return false;
            await this.sleep(1000);
        }

        // 步骤14: 点击描述框
        this.saveProgress(idx, 14);
        console.log('\n  [步骤14] 点击描述框...');
        this.tap(...this.config.positions.descInput);
        await this.sleep(2000);
        this.screenshot(14, idx);
        console.log('  ✓ 完成');

        // 步骤15: 输入描述
        this.saveProgress(idx, 15);
        console.log('\n  [步骤15] 输入描述...');
        await this.inputText(video['视频标签']);
        await this.sleep(2000);
        this.screenshot(15, idx);
        console.log('  ✓ 输入完成');

        // 步骤16: 点击发表
        this.saveProgress(idx, 16);
        console.log('\n  [步骤16] 点击发表按钮...');
        this.tap(...this.config.positions.finalPublish);
        await this.sleep(15000);
        this.screenshot(16, idx);
        console.log('  ✓ 发表完成');

        this.log(idx, 99, 'DONE', '视频发布成功');
        console.log(`\n✓✓✓ [${this.config.name}] 视频${idx + 1}发布完成！`);
        return true;
    }

    startScrcpy() {
        console.log('正在启动 scrcpy 显示手机屏幕...');
        try {
            this.scrcpyProcess = spawn(this.config.scrcpy, [], {
                detached: true,
                stdio: 'ignore'
            });
            this.scrcpyProcess.unref();
            console.log('✓ scrcpy 已启动');
        } catch (e) {
            console.log('⚠ scrcpy 启动失败:', e.message);
        }
    }

    async run() {
        // 启动 scrcpy
        this.startScrcpy();
        await this.sleep(2000);

        console.log(`========== [${this.config.name}] 自动发布 ==========`);
        console.log(`用户ID: ${this.config.userId} (${this.config.userId === 0 ? '机主微信' : '分身微信'})`);
        console.log(`========================================\n`);

        const videos = this.loadVideos();
        console.log(`视频总数: ${videos.length}`);

        const progress = this.loadProgress();
        const startIdx = progress ? progress.idx : 0;
        if (progress) {
            console.log(`断点续传: 视频${progress.idx} 步骤${progress.step}`);
        }

        for (let i = startIdx; i < videos.length; i++) {
            await this.publish(videos[i], i);

            if (i < videos.length - 1) {
                console.log(`\n等待30秒后发布下一个视频...`);
                await this.sleep(30000);
            }
        }

        console.log(`\n========== [${this.config.name}] 全部发布完成 ==========`);
    }
}

module.exports = WeChatVideoPublisher;
