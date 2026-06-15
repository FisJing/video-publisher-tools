/**
 * 双账号同时发布脚本
 */

const path = require('path');
const WeChatVideoPublisher = require('./src/publisher');

// 加载配置
const xinConfig = require('./accounts/xin/config.json');
const zhengConfig = require('./accounts/zheng/config.json');

// 转换为绝对路径
[xinConfig, zhengConfig].forEach(config => {
    config.excelPath = path.resolve(__dirname, config.excelPath);
    config.logDir = path.resolve(__dirname, config.logDir);
});

console.log('========== 微信视频号双账号发布系统 ==========\n');

// 同时启动两个账号
const xinPublisher = new WeChatVideoPublisher(xinConfig);
const zhengPublisher = new WeChatVideoPublisher(zhengConfig);

Promise.all([
    xinPublisher.run(),
    zhengPublisher.run()
]).then(() => {
    console.log('\n========== 所有账号发布完成 ==========');
}).catch(err => {
    console.error('发布出错:', err);
    process.exit(1);
});
