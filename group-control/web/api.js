// 前端API封装
const API_BASE = '/api';

// 设备列表
let devices = {};

// 任务列表
let tasks = {};

// Excel视频列表
let excelVideos = [];

// Excel文件列表
let excelFiles = [];

// 选中的Excel文件索引
let selectedExcelIndex = -1;

// 刷新设备列表
async function refreshDevices() {
    try {
        const response = await fetch(`${API_BASE}/devices`);
        const data = await response.json();
        devices = data.devices || {};

        updateDeviceList();
        updateDeviceSelect();
        document.getElementById('deviceCount').textContent = Object.keys(devices).length;
    } catch (error) {
        addLog('error', '获取设备列表失败: ' + error.message);
    }
}

// 更新设备列表UI
function updateDeviceList() {
    const container = document.getElementById('deviceList');

    if (Object.keys(devices).length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📱</div><div>暂无在线设备</div></div>';
        return;
    }

    let html = '';
    for (const [deviceId, device] of Object.entries(devices)) {
        const statusClass = device.status === 'online' ? 'online' : 'offline';
        const statusText = device.status === 'online' ? '在线' : '离线';
        const deviceType = device.type === 'adb' ? 'ADB' : 'WebSocket';
        const displayName = device.alias || `${device.info.brand} ${device.info.model}`;

        // 提取IP地址
        let ipInfo = deviceId;
        if (deviceId.includes(':')) {
            // 格式: 192.168.31.61:5555 -> 显示 192.168.31.61:5555
            ipInfo = deviceId;
        } else if (deviceId.startsWith('adb-')) {
            // 格式: adb-xxxx -> 显示原始ID
            ipInfo = deviceId;
        }

        html += `
            <div class="device-item">
                <div class="device-info" onclick="loadDeviceApps('${deviceId}')" style="flex: 1; cursor: pointer;">
                    <div class="device-name">${displayName}
                        <button class="btn-edit" onclick="event.stopPropagation(); openEditModal('${deviceId}')">✏️ 编辑</button>
                    </div>
                    <div class="device-details">
                        IP: <span style="color: #667eea; font-weight: 500;">${ipInfo}</span> | 型号: ${device.info.model} | 类型: ${deviceType}
                    </div>
                    <div id="apps-${deviceId}" style="margin-top: 8px; font-size: 12px;"></div>
                </div>
                <span class="device-status ${statusClass}">${statusText}</span>
            </div>
        `;
    }

    container.innerHTML = html;

    // 自动加载第一个设备的应用
    if (Object.keys(devices).length > 0) {
        const firstDeviceId = Object.keys(devices)[0];
        loadDeviceApps(firstDeviceId);
    }
}

// 加载设备应用列表
async function loadDeviceApps(deviceId) {
    const container = document.getElementById(`apps-${deviceId}`);
    if (!container) return;

    container.innerHTML = '<span style="color: #999;">加载中...</span>';

    try {
        const response = await fetch(`/api/apps?deviceId=${encodeURIComponent(deviceId)}`);
        const data = await response.json();

        if (data.success && data.apps.length > 0) {
            // 只显示关键应用
            const keyApps = data.apps.filter(app =>
                ['微信', 'AutoX.js', 'ADB键盘', '抖音', '小红书', '快手'].includes(app.name)
            );

            if (keyApps.length > 0) {
                const appList = keyApps.map(app => `✅ ${app.name}`).join(' | ');
                container.innerHTML = `<span style="color: #4caf50;">${appList}</span>`;
            } else {
                container.innerHTML = `<span style="color: #999;">共 ${data.apps.length} 个应用</span>`;
            }
        } else {
            container.innerHTML = '';
        }
    } catch (error) {
        container.innerHTML = '';
    }
}

// 更新设备选择下拉框
function updateDeviceSelect() {
    const select = document.getElementById('deviceSelect');

    // 保存当前选择的设备
    const currentSelected = select.value;

    // 获取当前下拉框中的设备列表
    const currentDevices = new Set();
    for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].value) {
            currentDevices.add(select.options[i].value);
        }
    }

    // 获取新的在线设备列表
    const newOnlineDevices = new Set();
    for (const [deviceId, device] of Object.entries(devices)) {
        if (device.status === 'online') {
            newOnlineDevices.add(deviceId);
        }
    }

    // 只有当设备列表变化时才更新下拉框
    if (currentDevices.size === newOnlineDevices.size &&
        [...currentDevices].every(d => newOnlineDevices.has(d))) {
        // 设备列表没变化，只更新设备名称（别名可能变了）
        for (let i = 0; i < select.options.length; i++) {
            const deviceId = select.options[i].value;
            if (deviceId && devices[deviceId]) {
                const device = devices[deviceId];
                const displayName = device.alias || `${device.info.brand} ${device.info.model}`;
                select.options[i].textContent = `${displayName} (${device.description || device.info.model})`;
            }
        }
        return;  // 不需要重建下拉框
    }

    // 设备列表有变化，需要重建下拉框
    console.log('设备列表已更新，刷新下拉框');
    select.innerHTML = '<option value="">请选择设备</option>';

    for (const [deviceId, device] of Object.entries(devices)) {
        if (device.status === 'online') {
            const option = document.createElement('option');
            option.value = deviceId;
            const displayName = device.alias || `${device.info.brand} ${device.info.model}`;
            option.textContent = `${displayName} (${device.description || device.info.model})`;
            select.appendChild(option);
        }
    }

    // 恢复之前的选择
    if (currentSelected && devices[currentSelected] && devices[currentSelected].status === 'online') {
        select.value = currentSelected;
    }
}

// 创建任务
async function createTask() {
    const deviceId = document.getElementById('deviceSelect').value;
    const wechatType = document.getElementById('wechatType').value;

    if (!deviceId) { alert('请选择设备'); return; }

    // 获取选中的视频
    const checkboxes = document.querySelectorAll('.video-checkbox:checked');
    if (checkboxes.length === 0) { alert('请选择至少一个视频'); return; }

    const selectedIndexes = Array.from(checkboxes).map(cb => parseInt(cb.value));
    const selectedVideos = excelVideos.filter(v => selectedIndexes.includes(v.index));

    if (selectedVideos.length === 0) { alert('视频信息无效'); return; }

    // 确认提示
    if (!confirm(`将为该设备创建 ${selectedVideos.length} 个任务，任务会依次执行，确定继续吗？`)) {
        return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const video of selectedVideos) {
        try {
            const response = await fetch(`${API_BASE}/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    deviceId,
                    videoPath: video.path,
                    description: video.description,
                    userId: parseInt(wechatType)
                })
            });

            const data = await response.json();
            if (data.success) {
                successCount++;
                const queueInfo = data.queuePosition ? ` (队列位置: ${data.queuePosition})` : '';
                addLog('success', `任务已创建: ${video.description}${queueInfo}`);
            } else {
                failCount++;
                addLog('error', `创建失败: ${video.description} - ${data.message}`);
            }
        } catch (error) {
            failCount++;
            addLog('error', `创建失败: ${video.description} - ${error.message}`);
        }
    }

    alert(`任务创建完成！成功: ${successCount}，失败: ${failCount}\n任务将依次执行，每个任务约需1-2分钟`);
    refreshTasks();
}

// 打开Excel文件选择器
async function openExcelSelector() {
    document.getElementById('excelModal').style.display = 'block';

    // 显示提示
    document.getElementById('excelFileList').innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">点击"扫描电脑上的Excel文件"按钮开始扫描<br>或者直接拖拽Excel文件到上方区域</div>';

    // 初始化拖拽功能
    initDropZone();
}

// 初始化拖拽区域
function initDropZone() {
    const dropZone = document.getElementById('dropZone');

    // 移除旧的监听器（如果有）
    dropZone.ondragover = null;
    dropZone.ondragleave = null;
    dropZone.ondrop = null;

    // 拖拽进入
    dropZone.ondragover = function(e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dragover');
    };

    // 拖拽离开
    dropZone.ondragleave = function(e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragover');
    };

    // 拖拽放下
    dropZone.ondrop = async function(e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragover');

        const files = e.dataTransfer.files;

        if (files.length === 0) {
            alert('请拖入Excel文件');
            return;
        }

        const file = files[0];
        const fileName = file.name.toLowerCase();

        // 检查是否是Excel文件
        if (!fileName.endsWith('.xls') && !fileName.endsWith('.xlsx')) {
            alert('请拖入Excel文件（.xls 或 .xlsx）');
            return;
        }

        // 读取文件
        await handleDroppedFile(file);
    };
}

// 处理拖入的文件
async function handleDroppedFile(file) {
    const progress = document.getElementById('scanProgress');
    progress.textContent = '正在加载Excel文件...';

    try {
        // 创建FormData
        const formData = new FormData();
        formData.append('excel', file);

        // 上传文件到服务器
        const response = await fetch('/api/excel-upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            // 设置选中的文件
            document.getElementById('excelPathDisplay').value = file.name;
            document.getElementById('excelPath').value = data.path;

            // 加载视频列表
            excelVideos = data.videos;
            updateVideoSelect();

            progress.textContent = `加载成功，共 ${data.total} 个视频`;
            addLog('success', `已加载Excel文件: ${file.name}，共 ${data.total} 个视频`);

            // 关闭模态框
            closeExcelModal();
        } else {
            progress.textContent = '加载失败: ' + data.message;
            alert('加载Excel失败: ' + data.message);
        }
    } catch (error) {
        progress.textContent = '加载失败';
        addLog('error', '加载拖入的Excel文件失败: ' + error.message);
    }
}

// 扫描Excel文件
async function scanExcelFiles() {
    const btn = document.getElementById('scanBtn');
    const progress = document.getElementById('scanProgress');

    // 禁用按钮
    btn.disabled = true;
    btn.textContent = '⏳ 扫描中...';
    progress.textContent = '正在扫描电脑上的Excel文件，请稍候...';

    document.getElementById('excelFileList').innerHTML = '<div style="text-align: center; padding: 20px; color: #667eea;"><div class="empty-state-icon">🔍</div>正在扫描...</div>';

    try {
        const response = await fetch(`${API_BASE}/excel-files?scan=true`);
        const data = await response.json();

        if (data.success) {
            excelFiles = data.files;
            renderExcelFileList();
            progress.textContent = `扫描完成，找到 ${data.total} 个Excel文件`;
            addLog('success', `扫描完成，找到 ${data.total} 个Excel文件`);
        } else {
            document.getElementById('excelFileList').innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">扫描失败: ' + data.message + '</div>';
            progress.textContent = '扫描失败';
        }
    } catch (error) {
        document.getElementById('excelFileList').innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">扫描失败: ' + error.message + '</div>';
        progress.textContent = '扫描失败';
        addLog('error', '扫描Excel文件失败: ' + error.message);
    } finally {
        // 恢复按钮
        btn.disabled = false;
        btn.textContent = '🔍 扫描电脑上的Excel文件';
    }
}

// 渲染Excel文件列表
function renderExcelFileList() {
    const container = document.getElementById('excelFileList');

    if (excelFiles.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">暂无可用的Excel文件</div>';
        return;
    }

    let html = '';
    excelFiles.forEach((file, index) => {
        const selectedClass = selectedExcelIndex === index ? 'selected' : '';
        html += `
            <div class="file-item ${selectedClass}" onclick="selectExcelFile(${index})">
                <div class="file-name">📊 ${file.name}</div>
                <div class="file-path">${file.path}</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// 选择Excel文件
function selectExcelFile(index) {
    selectedExcelIndex = index;
    const file = excelFiles[index];

    document.getElementById('excelPathDisplay').value = file.name;
    document.getElementById('excelPath').value = file.path;

    closeExcelModal();

    // 自动加载Excel文件
    loadExcel();
}

// 关闭Excel选择模态框
function closeExcelModal() {
    document.getElementById('excelModal').style.display = 'none';
}

// 加载Excel文件
async function loadExcel() {
    const excelPath = document.getElementById('excelPath').value;

    if (!excelPath) {
        alert('请先选择Excel文件');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/excel?path=${encodeURIComponent(excelPath)}`);
        const data = await response.json();

        if (data.success) {
            excelVideos = data.videos;
            updateVideoSelect();
            addLog('success', `已加载Excel文件，共 ${data.total} 个视频`);
        } else {
            alert('加载Excel失败: ' + data.message);
        }
    } catch (error) {
        addLog('error', '加载Excel失败: ' + error.message);
    }
}

// 更新视频选择列表（复选框）
function updateVideoSelect() {
    const container = document.getElementById('videoList');

    if (excelVideos.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">请先加载Excel文件</div>';
        updateSelectedCount();
        return;
    }

    let html = '';
    excelVideos.forEach((video, index) => {
        html += `
            <label style="display: flex; align-items: center; padding: 8px 10px; margin: 4px 0; background: white; border-radius: 5px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='#e9ecef'" onmouseout="this.style.background='white'">
                <input type="checkbox" class="video-checkbox" value="${video.index}" onchange="updateSelectedCount()" style="margin-right: 10px; width: 18px; height: 18px; cursor: pointer;">
                <span style="flex: 1;">
                    <strong style="color: #333;">${video.index}.</strong>
                    <span style="color: #666;">${video.description}</span>
                </span>
            </label>
        `;
    });

    container.innerHTML = html;
    updateSelectedCount();
}

// 全选视频
function selectAllVideos() {
    const checkboxes = document.querySelectorAll('.video-checkbox');
    checkboxes.forEach(cb => cb.checked = true);
    updateSelectedCount();
}

// 取消全选
function deselectAllVideos() {
    const checkboxes = document.querySelectorAll('.video-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    updateSelectedCount();
}

// 更新已选数量
function updateSelectedCount() {
    const checkboxes = document.querySelectorAll('.video-checkbox:checked');
    const count = checkboxes.length;
    const total = excelVideos.length;
    document.getElementById('selectedCount').textContent = `已选: ${count} / ${total} 个`;
}

// 停止任务
async function stopTask(taskId) {
    if (!confirm('确定要停止这个任务吗？')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/tasks/${taskId}/stop`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            addLog('info', `任务已停止: ${taskId}`);
            refreshTasks();
        } else {
            alert('停止任务失败: ' + data.message);
        }
    } catch (error) {
        addLog('error', '停止任务失败: ' + error.message);
    }
}

// 队列状态
let queuesInfo = {};

// 刷新任务列表
async function refreshTasks() {
    try {
        const response = await fetch(`${API_BASE}/tasks`);
        const data = await response.json();
        tasks = data.tasks || {};
        queuesInfo = data.queues || {};

        updateTaskList();

        const runningCount = Object.values(tasks).filter(t => t.status === 'running').length;
        const pendingCount = Object.values(tasks).filter(t => t.status === 'pending').length;
        document.getElementById('taskCount').textContent = runningCount + (pendingCount > 0 ? ` (+${pendingCount}等待)` : '');
    } catch (error) {
        addLog('error', '获取任务列表失败: ' + error.message);
    }
}

// 更新任务列表UI
function updateTaskList() {
    const container = document.getElementById('taskList');

    if (Object.keys(tasks).length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><div>暂无任务</div></div>';
        return;
    }

    let html = '';
    for (const [taskId, task] of Object.entries(tasks)) {
        const statusClass = task.status;
        const statusText = {
            'pending': '等待中',
            'running': '执行中',
            'completed': '已完成',
            'failed': '失败',
            'stopped': '已停止'
        }[task.status];
        const progress = task.progress || 0;
        const canStop = task.status === 'running' || task.status === 'pending';

        // 获取队列信息
        let queueInfo = '';
        if (task.status === 'pending' && queuesInfo[task.deviceId]) {
            const queue = queuesInfo[task.deviceId];
            queueInfo = ` <span style="color: #856404;">(队列等待中)</span>`;
        }

        html += `
            <div class="task-item">
                <div class="task-header">
                    <span class="task-id">任务 #${taskId.slice(-6)}</span>
                    <div>
                        <span class="task-status ${statusClass}">${statusText}</span>
                        ${canStop ? `<button class="btn btn-small btn-danger" onclick="stopTask('${taskId}')" style="margin-left: 10px;">⏹️ 停止</button>` : ''}
                    </div>
                </div>
                <div style="font-size: 13px; color: #666;">
                    ${task.description || ''}${queueInfo}
                </div>
                <div style="font-size: 12px; color: #999;">设备: ${devices[task.deviceId]?.alias || devices[task.deviceId]?.info.model || task.deviceId}</div>
                <div class="progress-bar"><div class="progress-fill" style="width: ${progress}%"></div></div>
            </div>
        `;
    }

    container.innerHTML = html;
}

// 添加日志
function addLog(type, message) {
    const container = document.getElementById('logContainer');
    const time = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.textContent = `[${time}] ${message}`;
    container.appendChild(logEntry);
    container.scrollTop = container.scrollHeight;
}

// 清空日志
function clearLogs() {
    const container = document.getElementById('logContainer');
    container.innerHTML = '<div class="log-entry info">日志已清空</div>';
}

// 定时刷新
setInterval(() => { refreshDevices(); refreshTasks(); }, 3000);

// 初始加载
refreshDevices();
refreshTasks();

// 打开编辑模态框
function openEditModal(deviceId) {
    const device = devices[deviceId];
    if (!device) return;

    document.getElementById('editDeviceId').value = deviceId;
    document.getElementById('editAlias').value = device.alias || device.info.model;
    document.getElementById('editDescription').value = device.description || '';

    document.getElementById('editModal').style.display = 'block';
}

// 关闭编辑模态框
function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
}

// 保存设备配置
async function saveDeviceConfig() {
    const deviceId = document.getElementById('editDeviceId').value;
    const alias = document.getElementById('editAlias').value;
    const description = document.getElementById('editDescription').value;

    try {
        const response = await fetch(`/api/device-config/${encodeURIComponent(deviceId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alias, description })
        });

        const data = await response.json();

        if (data.success) {
            addLog('success', `设备配置已更新: ${alias}`);
            closeEditModal();
            refreshDevices();
        } else {
            alert('保存失败: ' + data.message);
        }
    } catch (error) {
        addLog('error', '保存设备配置失败: ' + error.message);
    }
}

// 点击模态框外部关闭
window.onclick = function(event) {
    const editModal = document.getElementById('editModal');
    const excelModal = document.getElementById('excelModal');

    if (event.target === editModal) {
        closeEditModal();
    }

    if (event.target === excelModal) {
        closeExcelModal();
    }
}

// ===== 投屏功能 =====

// 投屏WebSocket连接管理（支持多设备）
const screenConnections = new Map();  // deviceId -> { ws, active }
const screenDeviceId = new Map();     // ws -> deviceId

// 更新投屏设备选择框
function updateScreenDeviceSelect() {
    const select = document.getElementById('screenDeviceSelect');
    const currentValue = select.value;

    select.innerHTML = '<option value="">选择设备</option>';

    for (const [deviceId, device] of Object.entries(devices)) {
        if (device.status === 'online') {
            const option = document.createElement('option');
            option.value = deviceId;
            const displayName = device.alias || `${device.info.brand} ${device.info.model}`;
            option.textContent = displayName;
            select.appendChild(option);
        }
    }

    // 恢复选择
    if (currentValue && devices[currentValue]) {
        select.value = currentValue;
    }
}

// 启动投屏（支持多设备）
function startScreenStream(deviceId) {
    // 如果没有传入deviceId，从选择框获取
    if (!deviceId) {
        deviceId = document.getElementById('screenDeviceSelect').value;
        if (!deviceId) {
            alert('请先选择设备');
            return;
        }
    }

    // 检查是否已经在投屏
    if (screenConnections.has(deviceId)) {
        addLog('info', `设备 ${devices[deviceId]?.alias || deviceId} 已在投屏中`);
        return;
    }

    const displayName = devices[deviceId]?.alias || deviceId;

    // 创建投屏容器（追加到现有容器）
    const container = document.getElementById('screenContainer');

    // 如果是第一个设备，清空占位符
    if (screenConnections.size === 0) {
        container.innerHTML = '';
    }

    // 创建新的投屏项
    const screenItem = document.createElement('div');
    screenItem.className = 'screen-item';
    screenItem.id = `screen-${deviceId.replace(/[:.]/g, '_')}`;
    screenItem.innerHTML = `
        <div class="screen-item-title">
            <span>${displayName}</span>
            <span class="screen-item-close" onclick="stopScreenStream('${deviceId}')">✕</span>
        </div>
        <img class="screen-image" id="screenImage-${deviceId.replace(/[:.]/g, '_')}" src="" alt="投屏中...">
    `;

    container.appendChild(screenItem);
    addLog('info', `开始投屏: ${displayName}`);

    // 连接WebSocket
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;

    const ws = new WebSocket(wsUrl);

    // 保存连接信息
    screenConnections.set(deviceId, { ws, active: true });
    screenDeviceId.set(ws, deviceId);

    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: 'SCREEN_SUBSCRIBE',
            payload: { deviceId }
        }));
    };

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'SCREEN_FRAME') {
                const img = document.getElementById(`screenImage-${msg.deviceId.replace(/[:.]/g, '_')}`);
                if (img) {
                    img.src = `data:image/png;base64,${msg.data}`;
                }
            }
        } catch (e) {
            // 忽略非JSON消息
        }
    };

    ws.onclose = () => {
        const devId = screenDeviceId.get(ws);
        if (devId && screenConnections.has(devId)) {
            screenConnections.delete(devId);
            screenDeviceId.delete(ws);
            addLog('info', `投屏连接已断开: ${devices[devId]?.alias || devId}`);

            // 移除DOM元素
            const screenItem = document.getElementById(`screen-${devId.replace(/[:.]/g, '_')}`);
            if (screenItem) {
                screenItem.remove();
            }

            // 如果没有设备了，恢复占位符
            if (screenConnections.size === 0) {
                container.innerHTML = `
                    <div class="screen-placeholder">
                        <div style="font-size: 48px; margin-bottom: 10px;">📱</div>
                        <div>选择设备后点击"开始投屏"</div>
                    </div>
                `;
            }
        }
    };

    ws.onerror = (err) => {
        addLog('error', `投屏连接错误: ${displayName}`);
    };
}

// 停止投屏（支持停止单个设备）
function stopScreenStream(deviceId) {
    // 如果没有传入deviceId，停止所有设备
    if (!deviceId) {
        stopAllScreenStreams();
        return;
    }

    const conn = screenConnections.get(deviceId);
    if (conn && conn.ws) {
        if (conn.ws.readyState === WebSocket.OPEN) {
            conn.ws.send(JSON.stringify({
                type: 'SCREEN_UNSUBSCRIBE',
                payload: { deviceId }
            }));
        }
        conn.ws.close();
        screenConnections.delete(deviceId);
        screenDeviceId.delete(conn.ws);
    }

    // 移除DOM元素
    const screenItem = document.getElementById(`screen-${deviceId.replace(/[:.]/g, '_')}`);
    if (screenItem) {
        screenItem.remove();
    }

    const displayName = devices[deviceId]?.alias || deviceId;
    addLog('info', `停止投屏: ${displayName}`);

    // 如果没有设备了，恢复占位符
    if (screenConnections.size === 0) {
        const container = document.getElementById('screenContainer');
        container.innerHTML = `
            <div class="screen-placeholder">
                <div style="font-size: 48px; margin-bottom: 10px;">📱</div>
                <div>选择设备后点击"开始投屏"</div>
            </div>
        `;
    }
}

// 启动所有设备投屏
function startAllScreenStreams() {
    const onlineDevices = Object.entries(devices)
        .filter(([id, device]) => device.status === 'online')
        .map(([id]) => id);

    if (onlineDevices.length === 0) {
        alert('没有在线设备');
        return;
    }

    addLog('info', `开始投屏所有设备 (${onlineDevices.length} 台)`);

    onlineDevices.forEach(deviceId => {
        startScreenStream(deviceId);
    });
}

// 停止所有设备投屏
function stopAllScreenStreams() {
    const deviceIds = Array.from(screenConnections.keys());
    deviceIds.forEach(deviceId => {
        const conn = screenConnections.get(deviceId);
        if (conn && conn.ws) {
            if (conn.ws.readyState === WebSocket.OPEN) {
                conn.ws.send(JSON.stringify({
                    type: 'SCREEN_UNSUBSCRIBE',
                    payload: { deviceId }
                }));
            }
            conn.ws.close();
            screenDeviceId.delete(conn.ws);
        }
    });

    screenConnections.clear();

    addLog('info', `停止所有投屏`);

    // 恢复占位符
    const container = document.getElementById('screenContainer');
    container.innerHTML = `
        <div class="screen-placeholder">
            <div style="font-size: 48px; margin-bottom: 10px;">📱</div>
            <div>选择设备后点击"开始投屏"</div>
        </div>
    `;

    addLog('info', '投屏已停止');
}

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
    if (screenWs) {
        screenWs.close();
    }
});

// 定时更新投屏设备选择框
setInterval(updateScreenDeviceSelect, 5000);
