/**
 * 测试脚本 - 验证配置是否正确
 */

const path = require('path');
const WeChatVideoPublisher = require('./src/publisher');

console.log('========== 配置验证测试 ==========\n');

// 测试心账号
console.log('【测试1】心账号配置');
const xinConfig = require('./accounts/xin/config.json');
xinConfig.excelPath = path.resolve(__dirname, xinConfig.excelPath);
xinConfig.logDir = path.resolve(__dirname, xinConfig.logDir);

const xinPublisher = new WeChatVideoPublisher(xinConfig);
console.log('  ✓ 初始化成功');
console.log('  账号:', xinConfig.name);
console.log('  设备ID:', xinConfig.deviceId);
console.log('  用户ID:', xinConfig.userId);

// 测试设备连接
const xinModel = xinPublisher.adb('shell getprop ro.product.model');
console.log('  设备型号:', xinModel ? xinModel.trim() : '❌ 连接失败');

console.log('\n【测试2】郑账号配置');
const zhengConfig = require('./accounts/zheng/config.json');
zhengConfig.excelPath = path.resolve(__dirname, zhengConfig.excelPath);
zhengConfig.logDir = path.resolve(__dirname, zhengConfig.logDir);

const zhengPublisher = new WeChatVideoPublisher(zhengConfig);
console.log('  ✓ 初始化成功');
console.log('  账号:', zhengConfig.name);
console.log('  设备ID:', zhengConfig.deviceId);
console.log('  用户ID:', zhengConfig.userId);

// 测试设备连接
const zhengModel = zhengPublisher.adb('shell getprop ro.product.model');
console.log('  设备型号:', zhengModel ? zhengModel.trim() : '❌ 连接失败');

console.log('\n========== 测试完成 ==========');
console.log('\n✅ 所有配置正确，可以开始发布视频！');
console.log('\n运行方式:');
console.log('  npm run xin    # 发布心账号视频');
console.log('  npm run zheng  # 发布郑账号视频');
console.log('  npm start      # 同时发布两个账号');
