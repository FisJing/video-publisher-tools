/**
 * 群控系统配置文件
 */

module.exports = {
    // 服务器配置
    server: {
        port: 3000,
        host: '0.0.0.0'
    },

    // 客户端配置
    client: {
        serverUrl: 'ws://192.168.31.100:3000',  // 改成你的PC IP
        heartbeatInterval: 30000,  // 心跳间隔（毫秒）
        reconnectDelay: 5000       // 重连延迟（毫秒）
    },

    // 任务配置
    task: {
        defaultVideoPath: '/sdcard/test.mp4',
        defaultDescription: '测试视频发布',
        stepDelay: 2500  // 步骤间延迟（毫秒）
    }
};
