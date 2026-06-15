/**
 * 启动脚本 - 心账号
 */

const path = require('path');
const WeChatVideoPublisher = require('./src/publisher');

// 加载账号配置
const config = require('./accounts/xin/config.json');

// 转换为绝对路径
config.excelPath = path.resolve(__dirname, config.excelPath);
config.logDir = path.resolve(__dirname, config.logDir);

// 创建发布器并运行
const publisher = new WeChatVideoPublisher(config);
publisher.run().catch(console.error);
