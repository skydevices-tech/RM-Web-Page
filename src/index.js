
// web版本打印

import * as polyfill from 'web-serial-polyfill';

let webserial;
const ua = navigator.userAgent.toLowerCase();
console.log(ua);

if (ua.indexOf("android") > -1) {
    webserial = polyfill.serial;
    console.log('Using WebUSB')
} else if(navigator.serial) {
    webserial = navigator.serial;
    console.log('Using WebSerial')


    webserial.addEventListener('disconnect', (event) => {
        if (isSerialConnected && port === event.target) {
            updateSignalStrength(0);      //显示断连信号
            if (upDataFlag == 2) {
                location.reload(true);
                //网页刷新
            }
            else {
                isSerialConnected = false;
                port = null; writer = null; reader = null;
                showConnectPage();
                //hideDeviceInfoBar();
                updateDeviceInfoBar();
                updateAllLangText();
            }
        }
    });

    // 监听串口连接事件 - 检测新插入的设备
    webserial.addEventListener('connect', (event) => {
        console.log('A new serial device has been detected.:', event);
        // 如果当前未连接，提示用户有新设备可用
        if (!isSerialConnected) {
            const currentStatus = statusBox.textContent;
            const disconnectedText = LANGS[currentLang]['connect-status'] || '未连接';
            // 只有在未连接状态时才提示，避免覆盖其他状态信息
            if (currentStatus === disconnectedText || currentStatus === '未连接' || currentStatus === 'Disconnected') {
                const newDeviceText = LANGS[currentLang]['new-device-detected'] || '检测到新设备，请点击连接';
                statusBox.textContent = newDeviceText;
                statusBox.style.color = '#3358e0';
                // 3秒后恢复原状态
                setTimeout(() => {
                    if (!isSerialConnected && statusBox.textContent === newDeviceText) {
                        statusBox.textContent = disconnectedText;
                        statusBox.style.color = '';
                    }
                }, 3000);
            }
        }
    });
}



// 添加初始化完成标记
window._appInitialized = false;

// 添加全局错误处理
window.addEventListener('error', function (event) {
    console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', function (event) {
    console.error('Unhandled promise rejection:', event.reason);
});

// 检查串口API可用性
function checkSerialAPISupport() {
    if (!webserial) {
        console.warn('Browser is unsupported');
    }
    return true;
}

// 初始化时检查串口API
if (!checkSerialAPISupport()) {
    console.log('Serial API: If the check fails, better error information will be provided during connection.');
}

// 检测权限策略违规
let permissionsPolicyViolation = false;

// 监听权限策略违规
const originalConsoleError = console.error;
console.error = function (...args) {
    const message = args.join(' ');
    if (message.includes('Permissions policy violation') && message.includes('serial')) {
        permissionsPolicyViolation = true;
        console.warn('⚠️ A violation of the serial port permission policy was detected; the application will run in restricted mode.');
        // 更新状态显示
        setTimeout(() => {
            const statusBox = document.getElementById('serial-status');
            if (statusBox) {
                statusBox.textContent = '检测到权限限制，建议在新窗口中打开应用';
                statusBox.style.color = '#ff6b6b';
            }
        }, 1000);
    }
    originalConsoleError.apply(console, args);
};

// ========== 全局任务管理器 ==========
window._pageTasks = {
    timers: [],
    intervals: [],
    listeners: [],
    custom: [],
};
function stopAllTasks() {
    window._pageTasks.timers.forEach(id => clearTimeout(id));
    window._pageTasks.timers = [];
    window._pageTasks.intervals.forEach(id => clearInterval(id));
    window._pageTasks.intervals = [];
    window._pageTasks.listeners.forEach(({ target, type, fn }) => {
        target.removeEventListener(type, fn);
    });
    window._pageTasks.listeners = [];
    window._pageTasks.custom.forEach(fn => { try { fn(); } catch (e) { } });
    window._pageTasks.custom = [];
}
// 新结构页面元素
document.getElementById('recv-hex').checked = true;
const connectPage = document.getElementById('connect-page');
const mainApp = document.getElementById('main-app');
const connectBtn = document.getElementById('connect');
const disconnectBtn = document.getElementById('disconnect');
const sendBtn = document.getElementById('send');
const inputBox = document.getElementById('input');
const outputBox = document.getElementById('output');
const statusBox = document.getElementById('serial-status');
const sendMode = document.getElementById('send-mode');
const recvHex = document.getElementById('recv-hex');
//const baudrateInput = document.getElementById('baudrate');
//baudrateInput.value = 460800;//隐藏波特率输入框
//baudrateInput.style.display = 'none';
const clearOutputBtn = document.getElementById('clear-output');

let port = null;
let writer = null;
let reader = null;
let isSerialConnected = false;
let netConfBuffer = [];
let isReading = false;
let ymodem = [];
let recvMidAdc = [];
let upDataFlag = 0;
let upDataDev = "remote";
let channelMap = {};
let rxLuaStats = 0;
let txLuaStats = 0;
let progressTimer = null; // 超时定时器
let progressInterval = null; // 进度监听（模拟，实际需替换为真实数据更新）
let isProcessing = false; // 操作锁

//let currentLang = localStorage.getItem('lang') || 'zh';//|| 'auto';
let currentLang = 'en';

let g_linkState = {
    upLinkRssiAnt1: 0,           // uint8_t -> 无符号8位整数
    upLinkRssiAnt2: 0,           // uint8_t
    upLinkPackageSuccessRate: 0, // uint8_t
    upLinkSNR: 0,                // int8_t -> 有符号8位整数
    diversityActiveAntenna: 0,   // uint8_t
    rfMode: 0,                   // uint8_t (原RF_Mode，JavaScript建议用驼峰命名)
    upLinkTxPower: 0,            // uint8_t (原upLinkTxPwoer，可能是拼写错误)
    downLinkRssi: 0,             // uint8_t
    downLinkPackSuccessRate: 0,  // uint8_t
    downLinkSNR: 0,              // int8_t
    connectFlag: ''              // char -> 字符
};

// 页面切换逻辑
const menuBtns = document.querySelectorAll('.menu-btn');
const mainPages = document.querySelectorAll('.main-page');
// 页面初始化注册表
const pageInits = {
    comm: initCommPage,
    attr: initAttrPage,
    config: initConfigPage,
    net: initNetPage,
    calib: initCalibPage,
    fw: initFwPage,
};

// 记录当前页面，防止重复初始化
window._currentPage = null;

// 重写showMainPage，只有切换页面时才初始化
function showMainPage(page) {
    if (window._currentPage === page) return; // 已经在当前页面，不重复初始化
    window._currentPage = page;
    stopAllTasks(); // 先清理所有任务
    mainPages.forEach(p => p.style.display = 'none');
    document.getElementById('page-' + page).style.display = '';
    menuBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.page === page));
    // 页面初始化
    if (pageInits[page]) pageInits[page]();
    //updateAllLangText();
}
menuBtns.forEach(btn => {
    btn.onclick = () => showMainPage(btn.dataset.page);
    //updateAllLangText();
});
// 连接成功后显示主菜单和内容
function showCommPage() {
    connectPage.style.display = 'none';
    mainApp.style.display = '';
    showMainPage('comm');
    inputBox.focus();
    //updateAllLangText();  
}
// 断开连接后返回连接页面
function showConnectPage() {
    connectPage.style.display = '';
    mainApp.style.display = 'none';
    statusBox.textContent = '未连接';
    connectBtn.textContent = '连接';
    connectBtn.disabled = false;
    //baudrateInput.disabled = false;
    inputBox.value = '';
    outputBox.textContent = '';
    //updateAllLangText();
}

// 设备信息栏
const deviceInfoBar = document.getElementById('device-info-bar');
const batteryBarFill = document.getElementById('battery-bar-fill');
const batteryBarNum = document.getElementById('battery-bar-num');
function updateDeviceInfoBar() {
    // 电量进度条
    let percent = 0;
    // 优先用 deviceStats.txBattery
    if (window.deviceStats && typeof window.deviceStats.txBattery === 'number' && !isNaN(window.deviceStats.txBattery)) {
        percent = window.deviceStats.txBattery;
    } else if (window._batteryPercent !== undefined) {
        percent = window._batteryPercent;
    }
    if (percent > 100) percent = 100;
    else if (percent < 0) percent = 0;

    const batteryFill = document.getElementById('battery-bar-fill');
    const batteryHeadFill = document.querySelector('.battery-head-fill');
    // 更新电量百分比
    batteryFill.style.width = `${(percent / 100) * 27}px`;
    batteryBarNum.textContent = percent + '%';
    // 更新电量状态颜色
    const batteryState = percent > 60 ? 'high' : percent > 40 ? 'medium' : percent > 20 ? 'medium' : 'low';
    batteryFill.className = 'battery-inner ' + batteryState;
    // 满电时显示电池头填充
    if (batteryHeadFill) {
        batteryHeadFill.style.background =
            batteryState === 'high' ? '#2ecc71' :
                batteryState === 'medium' ? '#f1c40f' : '#e74c3c';
        batteryHeadFill.classList.toggle('show', percent >= 95);
    }
    deviceInfoBar.style.display = 'flex';
}
function hideDeviceInfoBar() {
    deviceInfoBar.style.display = 'none';
}



// 连接逻辑
connectBtn.onclick = async () => {
    if (isSerialConnected) return;
    connectBtn.disabled = true;
    statusBox.textContent = LANGS[currentLang]['connecting'];
    try {
        // 始终弹出串口选择

        if (navigator.userAgent.indexOf("Chrome") != -1 && !navigator.userAgent.indexOf("Edge") != -1) {
            console.log("This is Chrome browser.");

            // 检查串口API是否可用
            if (!webserial) {
                throw new Error('Serial API not available. Please use Chrome/Edge browser.');
            }

            console.log('Requesting serial port permissions...');
            // 添加短暂延迟，确保浏览器有时间识别新插入的设备
            await new Promise(resolve => setTimeout(resolve, 100));
            const selectedPort = await webserial.requestPort({}).catch(err => {
                console.error('Serial port permission request failed:', err);
                if (err.name === 'NotAllowedError') {
                    throw new Error('The user denied serial port access, or the browser environment does not support serial port access.');
                } else if (err.name === 'NotFoundError') {
                    throw new Error('No available serial device found. If the device was just inserted, please wait a few seconds and try again.');
                } else {
                    throw new Error('Serial port access failed: ' + err.message);
                }
            });
            //const baudRate = parseInt(baudrateInput.value) || 115200;
            //const baudRate = parseInt(420000);// || 460800;
            const baudRate = parseInt(115200);
            await selectedPort.open({ baudRate });
            port = selectedPort;
            writer = port.writable.getWriter();
            reader = port.readable.getReader();
            isSerialConnected = true;
            // 状态栏显示友好名称（如有）或VID/PID
            let portInfo = '已连接';
            const info = port.getInfo();
            if (port.getInfo && (info.usbVendorId || info.usbProductId)) {
                portInfo += ` (VID:${info.usbVendorId ? info.usbVendorId.toString(16).toUpperCase() : ''}`;
                portInfo += info.usbProductId ? ` PID:${info.usbProductId.toString(16).toUpperCase()}` : '';
                portInfo += ')';
            }
            if (port.friendlyName) {
                portInfo = '已连接：' + port.friendlyName;
            }
            statusBox.textContent = portInfo;
            //baudrateInput.disabled = true;
            updateDeviceInfoBar();
            // === 连接成功后自动跳转到设备属性页面 ===
            if (upDataFlag == 1)//进入状态了
            {
                if (window.confirm(LANGS[currentLang]['confirm-update'])) {
                    window._deviceInfo = undefined;     //数据清空  激活退出更新
                    showMainPage('fw');
                    initFwPage();
                }
                else {
                    window._deviceInfo = undefined;     //数据清空  激活退出更新    
                    showMainPage('attr');
                    upDataFlag = 0;
                }
            }
            else {
                showMainPage('attr');
            }

            mainApp.style.display = '';
            connectPage.style.display = 'none';
            // === 自动查询设备属性 ===
            onSerialConnected();
            readLoop();
        }
        else {
            statusBox.textContent = LANGS[currentLang]['browser-not-support']
        }
    } catch (err) {
        statusBox.textContent = LANGS[currentLang]['connect-failed'] + err;
        connectBtn.disabled = false;
    }
};


document.getElementById('fw-device-type').onchange = async () => {
    upDataDev = document.getElementById('fw-device-type').value;
    console.log("upDataDev:", upDataDev);
}

// 通道映射
// 断开连接逻辑
disconnectBtn.onclick = async () => {
    if (!isSerialConnected) return;
    try {
        isSerialConnected = false;
        if (reader) { await reader.cancel(); reader.releaseLock(); }
        if (writer) writer.releaseLock();
        if (port) await port.close();
    } catch (e) { }
    port = null; writer = null; reader = null;
    showConnectPage();
    hideDeviceInfoBar();
};

// 发送数据（发送后不清空输入框）
sendBtn.onclick = async () => {
    const data = inputBox.value.trim();
    if (!writer || !data) return;
    if (sendMode.value === 'hex') {
        // 16进制发送
        try {
            let bytes = [];
            // 判断有无空格
            const hasSpace = /\s/.test(data);
            const noSpace = !hasSpace;
            // 检查是否混合（如01 2233）
            if (hasSpace && /[^0-9a-fA-F\/s]/.test(data)) throw new Error('仅允许0-9A-F字符和空格');
            if (hasSpace && /[0-9a-fA-F]{3,}/.test(data.replace(/\s+/g, ' '))) throw new Error('空格分隔时每组最多2位');
            if (hasSpace && /[0-9a-fA-F]{1,2}(\s+[0-9a-fA-F]{1,2})*/.test(data.replace(/ +/g, ' ')) && /[0-9a-fA-F]{3,}/.test(data.replace(/\s+/g, ' '))) throw new Error('空格分隔时每组最多2位');
            if (hasSpace) {
                // 空格分隔
                const parts = data.split(/\s+/).filter(Boolean);
                for (let part of parts) {
                    if (!/^[0-9a-fA-F]{1,2}$/.test(part)) throw new Error('空格分隔时每组必须为1~2位16进制');
                    if (part.length === 1) part = '0' + part;
                    bytes.push(parseInt(part, 16));
                }
            } else {
                // 连续字符串
                if (!/^[0-9a-fA-F]+$/.test(data)) throw new Error('仅允许0-9A-F字符');
                if (data.length % 2 !== 0) throw new Error('连续输入时必须为偶数位');
                for (let i = 0; i < data.length; i += 2) {
                    bytes.push(parseInt(data.substr(i, 2), 16));
                }
            }
            await writer.write(new Uint8Array(bytes));
        } catch (e) {
            alert('16进制输入有误: ' + e.message);
        }
    } else {
        // 文本发送
        const encoder = new TextEncoder();
        await writer.write(encoder.encode(data + '\n'));
    }
    // 不清空inputBox
};

// 一键清空输出端
clearOutputBtn.onclick = () => {
    outputBox.textContent = '';
};

// 读取串口数据
let serialBuffer = [];
let globalBuffer = new Uint8Array(4096);
let globalBufferLen = 0;
let globalBufferTimeout = null;
//let devAttrBufferTimeout = null;
const DEV_ATTR_BUFFER_MAX = 4000;

function tryParseDevAttrBuffer() {
    // 自动包解析循环
    while (serialBuffer.length >= 3) { // 至少有命令+长度+crc
        const cmd = serialBuffer[0];
        const len = serialBuffer[1];
        const totalLen = 2 + len; // [cmd][len][data+crc]
        if (len < 1 || totalLen > DEV_ATTR_BUFFER_MAX) {
            // 长度异常，丢弃缓冲区
            console.warn('[serialBuffer] Length error, clear buffer.', len, totalLen);
            serialBuffer = [];
            return;
        }
        if (serialBuffer.length < totalLen) {
            // 数据还不够，等待更多
            break;
        }
        // 取出包
        const packet = serialBuffer.slice(0, totalLen);
        const data = packet.slice(2, totalLen - 1);
        const crc = packet[totalLen - 1];
        const calcCrc = crc8tab_js(data, data.length);
        if (crc !== calcCrc) {
            // CRC错误，丢弃缓冲区
            console.warn('[serialBuffer] CRC Verification failed, clear buffer.', crc, calcCrc);
            serialBuffer = [];
            return;
        }
        // CRC正确，处理数据
        // 你可以在这里调用你的数据解析函数，比如：parseYourData(cmd, data)
        if (typeof parseYourData === 'function') {
            try { parseYourData(cmd, data); } catch (e) { console.error(e); }
        } else {
            console.log('[serialBuffer] Parse packets', cmd, data);
        }
        // 移除已处理包
        serialBuffer = serialBuffer.slice(totalLen);
        // 继续循环处理下一包
    }
    // 超过最大长度，丢弃前面数据
    if (serialBuffer.length > DEV_ATTR_BUFFER_MAX) {
        serialBuffer = serialBuffer.slice(serialBuffer.length - DEV_ATTR_BUFFER_MAX);
    }
}

async function readLoop() {
    if (isReading) return; // 防止多重循环
    isReading = true;
    const decoder = new TextDecoder();
    const commOutputBox = document.getElementById('output');
    let abnormalCount = 0;
    let devAttrTimeout = null;
    let loopTimeout = null;

    // 设备属性包超时监控
    if (window._waitingDevAttr) clearTimeout(window._waitingDevAttr);
    window._waitingDevAttr = setTimeout(() => {
        console.warn('[Device Properties] Timeout: Device properties packet not received!');
    }, 2000);

    // 添加循环超时保护，防止无限循环
    loopTimeout = setTimeout(() => {
        console.warn('[readLoop] Loop timeout, force exit');
        isReading = false;
    }, 30000); // 30秒超时

    while (isSerialConnected) {
        try {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
                // === 始终推入serialBuffer，无论YMODEM是否在进行 ===
                if (window._currentPage === 'net')   //无线配置单独缓冲区咯      但是会有进度条过来,所以,还要新增进度条的判断
                {
                    netConfBuffer.push(...value);
                    while (netConfBuffer.length >= 5) {
                        if (netConfBuffer[0] == 0x23 && netConfBuffer[1] == 0x03)    //进度条
                        //if(netConfBuffer[0]==0x23 && netConfBuffer[1]==0x03 )    //进度条
                        {
                            let tmpChar1 = netConfBuffer[netConfBuffer[1] + 1];
                            let tmpChar = crc8tab_js(netConfBuffer + 2, netConfBuffer[1] - 1)
                            netConfBuffer.splice(0, 5);       //舍弃5个字节   直接舍弃,其他缓冲区会对这个数据进行处理的   这里只保存LUA数据 如果有进度条就删,没有再说
                            continue;
                        }
                        else if (netConfBuffer[0] == 0x67 && netConfBuffer[1] == 12 && netConfBuffer.length >= 14) {
                            // else if(netConfBuffer[0]==0x67 && netConfBuffer[1]==12 &&netConfBuffer.length>=14) 
                            // {&& 
                            // 
                            // netConfBuffer[netConfBuffer[1]+1] == crc8tab_js(netConfBuffer+2, netConfBuffer[1]-1)
                            let tmpChar1 = netConfBuffer[netConfBuffer[1] + 1];
                            let tmpChar = crc8tab_js(netConfBuffer + 2, netConfBuffer[1] - 1)
                            netConfBuffer.splice(0, 14);      //这个是link数据
                            continue;
                        }

                        let bigLen = 0;
                        if (netConfBuffer[0] == 0x56) {
                            bigLen = (netConfBuffer[1] << 8) | netConfBuffer[2];
                        }
                        else {
                            bigLen = (netConfBuffer[0] << 8) | netConfBuffer[1];
                        }
                        //console.log('bigLen:', bigLen);
                        //console.log('bignetConfBufferLen:', netConfBuffer);

                        // 健壮性校验
                        if (bigLen < 2 || bigLen > 8192) {
                            abnormalCount++;
                            // console.warn('[readLoop] 异常包头，bigLen=', bigLen, 'netConfBuffer=', netConfBuffer.slice(0, 16), 'abnormalCount=', abnormalCount); // 已关闭异常包头日志
                            const before = netConfBuffer.length;
                            netConfBuffer.shift(); // 丢弃一个字节，避免死循环
                            if (netConfBuffer.length === before) {
                                // 极端情况下buffer未减少，强制break防止死循环
                                // console.error('[readLoop] netConfBuffer.shift()无效，强制break'); // 已关闭异常包头日志
                                break;
                            }
                            if (abnormalCount > 10) {
                                // console.error('[readLoop] 异常包头连续过多，清空buffer'); // 已关闭异常包头日志
                                netConfBuffer = [];
                                abnormalCount = 0;

                                break;
                            }
                            continue;
                        } else {
                            abnormalCount = 0;
                        }

                        //console.log('netConfBuffer:', netConfBuffer);
                        if (netConfBuffer.length >= bigLen) {
                            console.log('netConfBuffer:', netConfBuffer);
                            // let PackSize = bigPacket[1]*256+bigPacket[2];
                            // if(PackSize>bigLen)
                            // {
                            //   break;
                            // }
                            if (netConfBuffer[netConfBuffer.length - 3] != crc8tab_js(netConfBuffer, netConfBuffer.length - 3)) {
                                let tmpdata = crc8tab_js(netConfBuffer, netConfBuffer.length - 3);
                                netConfBuffer = [];
                                console.log("lua crc mistake");
                                break;
                            }

                            const bigPacket = new Uint8Array(netConfBuffer.slice(0, bigLen));
                            const container = document.getElementById('wireless-settings');
                            if (container) container.innerHTML = '';
                            parseCRSFPacket(bigPacket);
                            netConfBuffer = netConfBuffer.slice(bigLen);
                            setTimeout(() => {
                                //document.getElementById('refresh-settings').disabled = false;
                                document.getElementById('settings-status').textContent = LANGS[currentLang]['refresh-done'];
                                //document.getElementById('refresh-settings-rx').disabled = false;
                                document.getElementById('settings-status-rx').textContent = LANGS[currentLang]['refresh-done'];
                            }, 400);
                            // document.getElementById('refresh-settings').disabled = false;
                            // document.getElementById('settings-status').textContent =LANGS[currentLang]['refresh-done'];
                            // document.getElementById('refresh-settings-rx').disabled = false;
                            // document.getElementById('settings-status-rx').textContent =LANGS[currentLang]['refresh-done']; 
                            netConfBuffer = [];
                        } else {
                            break;
                        }
                        // // 假设在外面已经累积了 netConfBuffer（Array or Array-like of bytes）
                        // if (netConfBuffer.length >= 3) {
                        //   // 必须先至少能读到 len 字段
                        //   // 读取 len 字段（注意边界检查）
                        //   const lenField = netConfBuffer[1] * 256 + netConfBuffer[2]; // 说明: bigPacket 中 lenField 包含 CRC，但不包含后面的 \r\n
                        //   // 根据你描述：总长度 = 1 (0x23) + 2 (len) + lenField (payload+crc) + 2 (\r\n not counted in lenField)
                        //   const bigLen = 1 + 2 + lenField + 2; // == lenField + 5

                        //   if (netConfBuffer.length >= bigLen) {
                        //     // 取出这个完整包（包含头/len/payload+crc/\r\n）
                        //     const bigPacket = new Uint8Array(netConfBuffer.slice(0, bigLen));

                        //     // 基于 bigPacket 做 CRC 校验
                        //     // CRC 在倒数第3位：bigPacket[bigPacket.length - 3]
                        //     const crcIndex = bigPacket.length - 3;
                        //     const computedCrc = crc8tab_js(bigPacket, crcIndex); // 计算前 crcIndex 个字节的 crc
                        //     if (bigPacket[crcIndex] !== computedCrc) {
                        //       console.log('CRC 校验失败: expect=', bigPacket[crcIndex].toString(16), 'calc=', computedCrc.toString(16));
                        //       // 遇到 CRC 错误：丢弃该包并继续（也可以尝试滑动窗口寻找下一个 0x23）
                        //       netConfBuffer = netConfBuffer.slice(bigLen);
                        //       break;
                        //     }

                        //     // 现在 bigPacket 是合法的完整外层包
                        //     // 按需把 CRSF 部分切出来：
                        //     // lenField 包含 CRSF 内部 CRC（你描述是这样），所以 CRSF 总长度是 lenField。CRSF 数据在 bigPacket[3 .. 3+lenField-1]
                        //     const crsfStart = 3;
                        //     const crsfLen = lenField; // 包含 CRSF 自己的 CRC（如果 parseCRSFPacket 期望包含内部 CRC）
                        //     const crsfPacket = bigPacket.slice(crsfStart, crsfStart + crsfLen);

                        //     // 清空 UI 区域
                        //     const container = document.getElementById('wireless-settings');
                        //     if (container) container.innerHTML = '';

                        //     // 将剥离好的 crsfPacket 传入解析函数（确保 parseCRSFPacket 接受 Uint8Array）
                        //     parseCRSFPacket(crsfPacket);

                        //     // 从缓冲区移除已消费的字节
                        //     netConfBuffer = netConfBuffer.slice(bigLen);

                        //     // 完成后的 UI 操作（延时以免阻塞界面）
                        //     setTimeout(() => {
                        //       const refreshBtn = document.getElementById('refresh-settings');
                        //       if (refreshBtn) refreshBtn.disabled = false;
                        //       const status = document.getElementById('settings-status');
                        //       if (status) status.textContent = LANGS[currentLang]['refresh-done'];
                        //       const statusRx = document.getElementById('settings-status-rx');
                        //       if (statusRx) statusRx.textContent = LANGS[currentLang]['refresh-done'];
                        //     }, 400);
                        //   } // end if netConfBuffer.length >= bigLen
                        // } // end if netConfBuffer.length >= 3

                    }
                }
                else {
                    serialBuffer.push(...value);    //公共缓冲区
                    // --- 新增: 0.5秒内未能解析出包则清空缓冲区 ---
                    // if (devAttrBufferTimeout) clearTimeout(devAttrBufferTimeout);
                    // devAttrBufferTimeout = setTimeout(() => {
                    //   if (serialBuffer.length > 0) {
                    //     console.warn('[serialBuffer] 0.5秒未能解析出包，清空缓冲区');
                    //     serialBuffer = [];
                    //   }
                    // }, 500);
                    //tryParseDevAttrBuffer();

                    //console.log('[缓冲区数据] serialBuffer:', serialBuffer.map(x=>x.toString(16).padStart(2,'0')).join(' '), '长度:', serialBuffer.length);

                    // else if(value[0] === 0xFF && value.length > 60)
                    // {
                    //   console.log('[设备属性] 收到原始包:', Array.from(serialBuffer).map(x=>x.toString(16).padStart(2,'0')).join(' '), '长度:', value.length);
                    //   // 只处理一次完整包
                    //   const devInfo = parseDeviceInfoPacket(value);
                    //   if (devInfo) {
                    //     window._deviceInfo = devInfo;
                    //     renderDeviceInfoPage();
                    //     if (window._waitingDevAttr) clearTimeout(window._waitingDevAttr);
                    //   }
                    // }
                    // else if(value[0] === 0xFF && value.length > 60)
                    // {


                    // }
                }


                if (commOutputBox) {
                    const now = new Date().toLocaleTimeString();
                    if (recvHex && recvHex.checked) {
                        const hexStr = Array.from(value).map(b => b.toString(16).padStart(2, '0')).join(' ');
                        commOutputBox.textContent += `\n[${now}] [RECV] ${hexStr}`;
                    } else {
                        const textStr = decoder.decode(new Uint8Array(value));
                        commOutputBox.textContent += `\n[${now}] [RECV] ${textStr}`;
                    }
                    commOutputBox.scrollTop = commOutputBox.scrollHeight;
                }

            }
        } catch (error) {
            console.error('Data read error' + error); // 已关闭串口读取错误日志
            break;
        }
    }
    // 清理超时定时器
    if (loopTimeout) clearTimeout(loopTimeout);
    isReading = false;
}

// 监听串口断开事件


// 页面初始化
showConnectPage();
hideDeviceInfoBar();

// logo点击跳转设备属性页面
document.getElementById('logo-img').onclick = () => {
    showMainPage('attr');
};

// 初始化电池电量为0
batteryBarFill.style.width = '100';
batteryBarNum.textContent = '100%';
// 立即刷新电池栏为0%
updateDeviceInfoBar();

// ========== CRSF协议 0x2B参数包解析重构 ========== //
// 分包缓存和去重变量（放在函数外部，防止多包时丢失）
if (!window._crsfParamChunkCache) window._crsfParamChunkCache = new Map();
if (!window._crsfLastParamNum) window._crsfLastParamNum = null;
if (!window._crsfLastChunkNum) window._crsfLastChunkNum = null;
// 新增：全局参数数据缓存
if (!window._crsfParamDataMap) window._crsfParamDataMap = new Map();

// 解析单个参数数据
function parseParamData(paramData) {
    let p = 0;
    const parentFolder = paramData[p++];
    const dataType = paramData[p++];
    const baseType = dataType & 0x7F;
    const hidden = (dataType & 0x80) !== 0;
    // 解析name
    let nameEnd = p;
    while (paramData[nameEnd] !== 0) {
        nameEnd++;
        if (nameEnd > 400) {
            console.error('unit长度异常');
            break;
        }
    }
    let name = new TextDecoder().decode(paramData.slice(p, nameEnd));
    //name = name.replace(/[^0-9a-zA-Z$$\-:;.\/ ]/g, '');
    p = nameEnd + 1;
    let value = null, min = null, max = null, def = null, unit = '', decimal = null, step = null, strMaxLen = null, options = null, status = null, timeout = null, info = null;
    if ([0, 1].includes(baseType)) { // UINT8/INT8
        value = paramData[p++]; min = paramData[p++]; max = paramData[p++]; def = paramData[p++];
        let unitEnd = p;
        while (paramData[unitEnd] !== 0) {
            unitEnd++;
            if (unitEnd > 400) {
                console.error('unit长度异常');
                break;
            }
        }
        unit = new TextDecoder().decode(paramData.slice(p, unitEnd));
        //unit = unit.replace(/[^0-9a-zA-Z$$\-:;.\/ ]/g, '');
        p = unitEnd + 1;
    } else if ([2, 3].includes(baseType)) { // UINT16/INT16
        value = paramData[p] | (paramData[p + 1] << 8); p += 2;
        min = paramData[p] | (paramData[p + 1] << 8); p += 2;
        max = paramData[p] | (paramData[p + 1] << 8); p += 2;
        def = paramData[p] | (paramData[p + 1] << 8); p += 2;
        let unitEnd = p;
        while (paramData[unitEnd] !== 0) {
            unitEnd++;
            if (unitEnd > 400) {
                console.error('unit长度异常');
                break;
            }
        }
        unit = new TextDecoder().decode(paramData.slice(p, unitEnd));
        //unit = unit.replace(/[^0-9a-zA-Z$$\-:;.\/ ]/g, '');
        p = unitEnd + 1;
    } else if (baseType === 8) { // FLOAT
        value = (paramData[p] | (paramData[p + 1] << 8) | (paramData[p + 2] << 16) | (paramData[p + 3] << 24)); p += 4;
        min = (paramData[p] | (paramData[p + 1] << 8) | (paramData[p + 2] << 16) | (paramData[p + 3] << 24)); p += 4;
        max = (paramData[p] | (paramData[p + 1] << 8) | (paramData[p + 2] << 16) | (paramData[p + 3] << 24)); p += 4;
        def = (paramData[p] | (paramData[p + 1] << 8) | (paramData[p + 2] << 16) | (paramData[p + 3] << 24)); p += 4;
        decimal = paramData[p++];
        step = (paramData[p] | (paramData[p + 1] << 8) | (paramData[p + 2] << 16) | (paramData[p + 3] << 24)); p += 4;
        let unitEnd = p;
        while (paramData[unitEnd] !== 0) {
            unitEnd++;
            if (unitEnd > 400) {
                console.error('unit长度异常');
                break;
            }
        }
        unit = new TextDecoder().decode(paramData.slice(p, unitEnd));
        //unit = unit.replace(/[^0-9a-zA-Z$$\-;:.\/ ]/g, '');
        p = unitEnd + 1;
    } else if (baseType === 9) { // TEXT_SELECTION
        let optsEnd = p;
        while (paramData[optsEnd] !== 0) {
            optsEnd++;
            if (optsEnd > 400) {
                console.error('optsEnd长度异常');
                break;
            }
        }
        let optionsStr = new TextDecoder().decode(paramData.slice(p, optsEnd));
        //optionsStr = optionsStr.replace(/[^0-9a-zA-Z$$\-;:.\/ ]/g, '');
        options = optionsStr.split(';');
        p = optsEnd + 1;
        value = paramData[p++];
        min = paramData[p++];
        max = paramData[p++];
        def = paramData[p++];
        let unitEnd = p;
        while (paramData[unitEnd] !== 0) {
            unitEnd++;
            if (unitEnd > 400) {
                console.error('unitEnd长度异常');
                break;
            }
        }
        unit = new TextDecoder().decode(paramData.slice(p, unitEnd));
        //unit = unit.replace(/[^0-9a-zA-Z$$\-;:.\/ ]/g, '');
        p = unitEnd + 1;
    } else if (baseType === 10) { // STRING
        strMaxLen = paramData[p++];
        let strEnd = p;
        while (paramData[strEnd] !== 0) {
            strEnd++;
            if (strEnd > 400) {
                console.error('strEnd长度异常');
                break;
            }
        }
        value = new TextDecoder().decode(paramData.slice(p, strEnd));
        //value = value.replace(/[^0-9a-zA-Z$$\-;:.\/ ]/g, '');
        p = strEnd + 1;
        let defEnd = p;
        while (paramData[defEnd] !== 0) {
            defEnd++;
            if (defEnd > 400) {
                console.error('def长度异常');
                break;
            }
        }
        def = new TextDecoder().decode(paramData.slice(p, defEnd));
        //def = def.replace(/[^0-9a-zA-Z$$\-;:.\/ ]/g, '');
        p = defEnd + 1;
    } else if (baseType === 11) { // FOLDER
        // nothing more
    } else if (baseType === 12) { // INFO
        let infoEnd = p;
        while (paramData[infoEnd] !== 0) {
            infoEnd++;
            if (infoEnd > 400) {
                console.error('infoEnd长度异常');
                break;
            }
        }
        value = new TextDecoder().decode(paramData.slice(p, infoEnd));
        //value = value.replace(/[^0-9a-zA-Z$$\-:;\/ ]/g, ''); 
        p = infoEnd + 1;
    } else if (baseType === 13) { // COMMAND
        status = paramData[p++];
        timeout = paramData[p++];
        let infoEnd = p;

        while (paramData[infoEnd] !== 0)      //现有一个乱码bug,因为名字结束的时候,没有\0导致的bug,所以会出现名字乱码,所以要选择删除
        {
            infoEnd++;
            if (infoEnd > 400) {
                console.error('infoEnd长度异常');
                break;
            }
        }
        info = new TextDecoder().decode(paramData.slice(p, infoEnd));
        //info = info.replace(/[^0-9a-zA-Z$$\-:;\/ ]/g, '');
        p = infoEnd + 1;
    }
    return { parentFolder, dataType, baseType, hidden, name, value, min, max, def, unit, decimal, step, strMaxLen, options, status, timeout, info };
}

// 解析大包并渲染参数控件
function parseCRSFPacket(bigPacket) {
    // let i = 0;
    // // 循环处理所有开头的多余数据块
    // while (i + 4 < bigPacket.length) { // 确保至少有5个元素（索引i到i+4）
    //   // 检查是否是0x23 0x03开头的多余数据块
    //   if (bigPacket[i] === 0x23 && bigPacket[i + 1] === 0x03) {
    //     i += 5; // 跳过这个5字节的数据块
    //   } else {
    //     break; // 不是目标数据块，停止处理
    //   }
    // }

    if (bigPacket[0] == 0x56) {
        bigPacket = bigPacket.slice(1);
    }
    //console.log('处理后bigPacket:', bigPacket, '长度:', bigPacket.length);

    if (!bigPacket || bigPacket.length < 4) return '数据太短';
    let rxOrTx = '';
    // 跳过前2字节长度，去掉末尾3字节（CRC/0A/0D），判断包头
    if (bigPacket.length > 8) {
        // 例如: EE xx EE EC (RX) 或 EE xx EA EE (TX)
        const b1 = bigPacket[5], b2 = bigPacket[6];
        // 打印前8字节内容
        //console.log('CRSF包头前8字节:', Array.from(bigPacket.slice(0, 8)));
        if (b1 === 0xEE && b2 === 0xEC) {
            rxOrTx = 'RX';
            console.log('识别到类型: RX');
        } else if (b1 === 0xEA && b2 === 0xEE) {
            rxOrTx = 'TX';
            console.log('识别到类型: TX');
        } else {
            console.log('未识别到RX/TX类型');
        }
    }
    // 更新LUA配置标题
    const pageNet = document.getElementById('page-net');
    if (pageNet) {
        const titles = pageNet.getElementsByClassName('comm-title');
        for (let i = 0; i < titles.length; i++) {
            if (titles[i].textContent.startsWith(LANGS['lua-config'])) {
                titles[i].textContent = LANGS[currentLang]['lua-config'] + (rxOrTx ? ` (${rxOrTx})` : '');
            }
        }
    }
    // ====== 原有参数解析逻辑 ======
    let offset = 2;
    const paramChunkCache = new Map(); // paramNum -> {chunks:[], chunkNums:Set}
    let index = 0;
    while (offset + 2 < bigPacket.length) {
        const head = bigPacket[offset];
        const len = bigPacket[offset + 1];
        const type = bigPacket[offset + 2];
        if (len === 0) {
            offset++;
            continue;
        }
        const packetTotalLen = 2 + len;
        if (offset + packetTotalLen > bigPacket.length) break;
        const pkt = bigPacket.slice(offset + 2, offset + 2 + len - 1); // pkt[0]=type
        if (type === 0x2B) {
            let po = 0;
            po++; // 跳过type
            const srcNode = pkt[po++];
            const dstNode = pkt[po++];
            const paramNum = pkt[po++];
            const chunkNum = pkt[po++];
            if (!paramChunkCache.has(paramNum)) paramChunkCache.set(paramNum, { chunks: [], chunkNums: new Set() });
            const entry = paramChunkCache.get(paramNum);
            if (entry.chunkNums.has(chunkNum)) {
                offset += packetTotalLen;
                continue;
            }
            entry.chunkNums.add(chunkNum);
            entry.chunks.push(pkt.slice(po)); // 从po开始，即payload部分，不含CRC
        }
        offset += packetTotalLen;
    }
    // 组合结果：Map paramNum -> Uint8Array
    const paramDataMap = new Map();
    for (const [paramNum, entry] of paramChunkCache.entries()) {
        const fullData = new Uint8Array([].concat(...entry.chunks.map(a => Array.from(a))));
        paramDataMap.set(paramNum, fullData);
    }
    // 解析所有参数为结构化对象
    const paramList = [];
    for (const [paramNum, paramData] of paramDataMap.entries()) {
        const paramObj = parseParamData(paramData);
        paramObj.paramNum = paramNum;
        paramList.push(paramObj);
    }
    // 排序：只按paramNum（Parameter number）升序
    paramList.sort((a, b) => a.paramNum - b.paramNum);
    // 渲染参数控件
    const container = document.getElementById('wireless-settings');
    container.innerHTML = '';
    renderParameterControls(paramList, container);
    return paramList;
}

// 发送参数设置命令
async function sendParameterSet(param, value) {
    if (!writer) return;
    // 组包, 这里只做简单示例, 实际需按协议组包
    // 假设: [0xA5, 0x12, param.id, value, 0x0D, 0x0A]
    let val = Number(value);
    const arr = [0xA5, 0x12, param.id, val, 0x0D, 0x0A];
    await writer.write(new Uint8Array(arr));
}

// 修改refreshSettings函数，确保发送的是16进制数据
async function refreshSettings() {
    console.log('freshSettingsTx: running');
    if (!writer) return;
    const refreshCmd = new Uint8Array([0xA5, 0x11, 0x00, 0x0D, 0x0A]);
    try {
        const statusElem = document.getElementById('settings-status');
        statusElem.textContent = LANGS[currentLang]['refresh-getting'];
        await writer.write(refreshCmd);
        window._lastRefreshMode = "TX"
    } catch (err) {
        console.error('发送刷新命令失败:', err);
    }
}

// 刷新按钮事件一键修复
let timeout
document.getElementById('refresh-settings').onclick = async () => {
    netConfBuffer = []; // 清空buffer，防止旧数据残留
    document.getElementById('refresh-settings').disabled = true;
    const statusElem = document.getElementById('settings-status');
    statusElem.textContent = LANGS[currentLang]['refresh-getting'];
    timeout = setTimeout(() => {
        document.getElementById('refresh-settings').disabled = false;
        //statusElem.textContent = '超时';
    }, 700);

    await refreshSettings(); // 发送刷新命令
    // 等待数据到来，readLoop会自动处理
    // 成功时清除超时
    setTimeout(() => {
        if (statusElem.textContent === LANGS[currentLang]['refresh-done']) clearTimeout(timeout);
    }, 1000);
};

// 新增刷新RX函数
async function refreshSettingsRX() {
    console.log('refreshSettingsRX: running');
    if (!writer) return;
    const refreshCmd = new Uint8Array([0xA5, 0x22, 0x00, 0x0D, 0x0A]);
    try {
        const statusElem = document.getElementById('settings-status-rx');
        statusElem.textContent = LANGS[currentLang]['refresh-getting'];
        await writer.write(refreshCmd);
        window._lastRefreshMode = "RX"
    } catch (err) {
        console.error('发送刷新RX命令失败:', err);
    }
}
// 刷新RX按钮事件
let timeout_rx
document.getElementById('refresh-settings-rx').onclick = async () => {
    netConfBuffer = [];
    //document.getElementById('refresh-settings-rx').disabled = true;
    const statusElem = document.getElementById('settings-status-rx');
    statusElem.textContent = LANGS[currentLang]['refresh-getting'];
    timeout_rx = setTimeout(() => {
        document.getElementById('refresh-settings-rx').disabled = false;
        //statusElem.textContent = '超时';
    }, 2000);
    await refreshSettingsRX();
    setTimeout(() => {
        if (statusElem.textContent === LANGS[currentLang]['refresh-done']) clearTimeout(timeout_rx);
    }, 1000);
};

// 每30分钟清空一次控制台
setInterval(() => {
    if (console.clear) {
        //console.clear();
        //顺便也清空所有缓冲区
        if (window._currentPage !== 'net') {
            netConfBuffer = [];
            serialBuffer = [];
        }
    }
}, 1800000 / 60);   //60s就会清空缓冲区,以免内存溢出


// --- 设备校准页面 ---
function renderCalibPage() {
    const calibPage = document.getElementById('page-calib');

    const MIN_VAL = 988;
    const MAX_VAL = 2012;
    const INIT_VAL = 1500;
    const INIT_PCT = ((INIT_VAL - MIN_VAL) / (MAX_VAL - MIN_VAL) * 100).toFixed(4);

    const TRIM_MIN_VAL = -130;
    const TRIM_MAX_VAL = 130;
    const TRIM_INIT_VAL = 0;
    const TRIM_INIT_PCT = ((TRIM_INIT_VAL - TRIM_MIN_VAL) / (TRIM_MAX_VAL - TRIM_MIN_VAL) * 100).toFixed(4);

    // 初始化 channelMap 对象，防止未定义错误
    if (!window.channelMap) {
        window.channelMap = {
            channelTrimSend: [0, 0, 0, 0],
            channelTrimRecv: [0, 0, 0, 0],
            channelMidSend: [0, 0, 0, 0],
            channelMidRecv: [0, 0, 0, 0],
            channelMapSend: Array.from({ length: 16 }, (_, i) => i + 1),
            channelDirSend: Array(16).fill(0),
            channelLeftSend: Array(16).fill(0),
            channelRightSend: Array(16).fill(0)
        };
    }

    calibPage.innerHTML = `
    <style>
      /* slider 样式：轨道为单色坐标轴，不显示"已填充"效果 */
      .horizontal-slider, .vertical-slider { -webkit-appearance: none; appearance: none; background: transparent; }
      .horizontal-slider { width:200px; height:6px; } /* 缩短横向滑块 */
      .horizontal-slider::-webkit-slider-runnable-track{ 
        height:6px; 
        background:#e0e7ff; 
        border-radius:6px; 
        position: relative; 
      }
      .horizontal-slider::-webkit-slider-runnable-track::before{ 
        content: ''; 
        position: absolute; 
        top: 50%; 
        left: 50%; 
        width: 2px; 
        height: 12px; 
        background: #e74c3c; 
        transform: translate(-50%, -50%); 
        border-radius: 1px; 
        z-index: 1;
      }
      .horizontal-slider::-webkit-slider-thumb{ 
        -webkit-appearance:none; 
        width:16px; 
        height:16px; 
        border-radius:50%; 
        background:#4f8cff; 
        box-shadow:0 1px 4px rgba(0,0,0,0.15); 
        margin-top:-5px; 
        cursor:pointer; 
        z-index: 2;
        position: relative;
      }
      .horizontal-slider::-moz-range-track{ 
        height:6px; 
        background:#e0e7ff; 
        border-radius:6px; 
        position: relative; 
      }
      .horizontal-slider::-moz-range-track::before{ 
        content: ''; 
        position: absolute; 
        top: 50%; 
        left: 50%; 
        width: 2px; 
        height: 12px; 
        background: #e74c3c; 
        transform: translate(-50%, -50%); 
        border-radius: 1px; 
        z-index: 1;
      }
      .horizontal-slider::-moz-range-thumb{ 
        width:16px; 
        height:16px; 
        border-radius:50%; 
        background:#4f8cff; 
        border:none; 
        z-index: 2;
        position: relative;
      }

      /* 竖向用旋转实现（旋转后看起来像竖直轴） */
      .vertical-slider { width:200px; height:22px; transform: rotate(-90deg); } /* 加长竖向滑块 */
      .vertical-slider::-webkit-slider-runnable-track{ 
        height:6px; 
        background:#e0e7ff; 
        border-radius:6px; 
        position: relative; 
      }
      .vertical-slider::-webkit-slider-runnable-track::before{ 
        content: ''; 
        position: absolute; 
        top: 50%; 
        left: 50%; 
        width: 12px; 
        height: 2px; 
        background: #e74c3c; 
        transform: translate(-50%, -50%); 
        border-radius: 1px; 
        z-index: 1;
      }
      .vertical-slider::-webkit-slider-thumb{ 
        -webkit-appearance:none; 
        width:16px; 
        height:16px; 
        border-radius:50%; 
        background:#4f8cff; 
        box-shadow:0 1px 4px rgba(0,0,0,0.15); 
        margin-top:-5px; 
        cursor:pointer; 
        z-index: 2;
        position: relative;
      }
      .vertical-slider::-moz-range-track{ 
        height:6px; 
        background:#e0e7ff; 
        border-radius:6px; 
        position: relative; 
      }
      .vertical-slider::-moz-range-track::before{ 
        content: ''; 
        position: absolute; 
        top: 50%; 
        left: 50%; 
        width: 12px; 
        height: 2px; 
        background: #e74c3c; 
        transform: translate(-50%, -50%); 
        border-radius: 1px; 
        z-index: 1;
      }
      .vertical-slider::-moz-range-thumb{ 
        width:16px; 
        height:16px; 
        border-radius:50%; 
        background:#4f8cff; 
        border:none; 
        z-index: 2;
        position: relative;
      }

      /* 缩小一些间距让 bar 与 joystick 更靠近 */
      .calib-joystick-row { gap:0.4vw; } /* 进一步缩小间距 */
      .calib-joystick-wrap { gap:2px; }  /* 进一步缩小间距 */

      /* 新增：叠加滑块到进度条上的样式（水平方向） */
      .slider-bar-overlay { position: relative; display: inline-block; }
      .slider-bar-overlay .horizontal-slider { position: absolute; top: 50%; left: 0; transform: translateY(-50%); width: 100%; height: 6px; z-index: 2; pointer-events: none; }
      .slider-bar-overlay .horizontal-slider::-webkit-slider-thumb { pointer-events: auto; }
      .slider-bar-overlay .horizontal-slider::-moz-range-thumb { pointer-events: auto; }

      /* 新增：叠加滑块到进度条上的样式（竖直方向） */
      .vertical-slider-bar-overlay { position: relative; display: inline-flex; align-items: center; }
      .vertical-slider-bar-overlay .vertical-slider-container { position: absolute; top: 0; left: 50%; transform: translateX(-50%) rotate(-90deg); width: 100%; height: 22px; z-index: 2; pointer-events: none; }
      .vertical-slider-bar-overlay .vertical-slider-container input { pointer-events: auto; }
    </style>

    <div class="calib-container" style="height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0.2vh 0;">
      <div>
        <div style="display:flex;align-items:center;gap:0.4vw;margin-bottom:0.3vh;">
          <div class="calib-btn-slider-row" style="display:flex;align-items:center;gap:0.4vw;">
            <div class="calib-btn-group" id="calib-btn-group" style="display:flex;gap:0.2vw;"></div>
            <div class="calib-slider-row" style="display:flex;align-items:center;gap:0.2vw;min-width:100px;">
              <span class="calib-slider-label" style="font-size:1.0em;color:#3358e0;text-align:center;">S1</span>
              <input type="range" min="0" max="100" value="50" class="calib-slider-sao" id="calib-slider">
              <span class="calib-slider-value" id="calib-slider-value" style="font-size:0.9em;">50</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div id="calib-step-label" style="margin-bottom:0.3vh;color:#e74c3c;font-weight:bold;font-size:0.85em;text-align:center;" data-i18n="calib-start-step-label">点击"开始校准"按键进行校准操作</div>
        <div style="display:flex;gap:3px;flex-wrap:wrap;justify-content:center;width:100%;margin-bottom:0.2vh;">
          <div style="display: flex; flex-direction: row; gap: 4px; min-height: 50px; align-items: center; justify-content: center;">
              <button id="calib-action-btn" class="connect-btn" style="min-width: 140px; min-height: 40px; font-size: 0.75em; padding: 4px 6px;" data-i18n="calib-start">开始校准</button>
              <button id="calib-save-action-btn" class="connect-btn" style="min-width: 140px; min-height: 40px; font-size: 0.75em; padding: 4px 6px;" data-i18n="calib-save">校准保存</button>
              <button id="calib-reset-action-btn" class="connect-btn" style="min-width: 140px; min-height: 40px; font-size: 0.75em; padding: 4px 6px;" data-i18n="calib-reset">重新校准</button>
          </div>
        </div>

        <div class="calib-joystick-row" style="display:flex;justify-content:center;align-items:center;min-height:0;gap:0.6vw;">

          <!-- 左竖：滑块 + 原进度条（保持原样，新增滑块值显示）-->
          <div style="display:flex;flex-direction:column;gap:2px;align-items:center;">
            <div style="display:flex;align-items:center;gap:3px;">
              <!-- 竖向滑块容器（旋转实现） -->
              <div style="width:16px;height:120px;display:flex;align-items:center;justify-content:center;">
                <input id="calib-slider-lv" class="vertical-slider" type="range" min="${TRIM_MIN_VAL}" max="${TRIM_MAX_VAL}" value="${TRIM_INIT_VAL}">
              </div>

              <!-- 保留原进度条结构，添加 fill 与 indicator 的 id 以便同步 -->
              <div id="calib-bar-lv" style="width:16px;height:180px;background:#e0e7ff;border-radius:8px;overflow:hidden;position:relative;box-shadow:0 1px 4px #b3cfff;">
                <div id="calib-bar-lv-fill" style="width:100%;height:${INIT_PCT}%;background:linear-gradient(0deg, #4f8cff 0%, #3358e0 100%);transition:height 0.05s;"></div>
                <div id="calib-bar-lv-ind" style="position:absolute;top:${INIT_PCT}%;left:0;right:0;height:2px;background:#e74c3c;opacity:0.7;"></div>
              </div>
            </div>
            <!-- 紧凑的数值显示区域 -->
            <div style="display:flex;flex-direction:column;gap:1px;align-items:center;">
              <span id="val-calib-slider-lv" style="font-family:'Roboto',monospace;font-size:0.8em;color:#666;background:#f0f0f0;border-radius:3px;padding:1px 6px;box-shadow:0 1px 2px #e0e7ff;min-width:2.5em;display:inline-block;text-align:center;">${TRIM_INIT_VAL}</span>
              <span id="val-bar-lv" style="font-family:'Roboto',monospace;font-size:0.9em;color:#222;background:#fff;border-radius:4px;padding:1px 8px;box-shadow:0 1px 2px #e0e7ff;min-width:3em;display:inline-block;text-align:center;">${TRIM_INIT_VAL}</span>
              <span id="val-actual-lv" style="font-family:'Roboto',monospace;font-size:0.75em;color:#e74c3c;background:#fff5f5;border:1px solid #fecaca;border-radius:3px;padding:1px 4px;box-shadow:0 1px 2px #fecaca;min-width:2.2em;display:inline-block;text-align:center;">0</span>
            </div>
          </div>

          <!-- 左横条 + Joystick -->
          <div class="calib-joystick-wrap" style="display:flex;flex-direction:column;align-items:center;gap:2px;">
            <div style="display:flex; align-items: center; gap: 3px;">
              <!-- 修改：水平滑块 -->
              <div class="slider-bar-overlay" style="width:140px;">
                <input id="calib-slider-lh" class="horizontal-slider" type="range" min="${TRIM_MIN_VAL}" max="${TRIM_MAX_VAL}" value="${TRIM_INIT_VAL}">
              </div>
              <!-- 新增：滑块值显示 -->
              <span id="val-calib-slider-lh" style="font-family:'Roboto',monospace;font-size:0.8em;color:#666;background:#f0f0f0;border-radius:3px;padding:1px 6px;box-shadow:0 1px 2px #e0e7ff;min-width:2.5em;display:inline-block;text-align:center;">${TRIM_INIT_VAL}</span>
            </div>
            <div style="display:flex; align-items: center; gap: 3px;">
              <!-- 进度条 -->
              <div id="calib-bar-lh" style="height:16px;width:180px;background:#e0e7ff;border-radius:8px;overflow:hidden;position:relative;box-shadow:0 1px 4px #b3cfff;">
                <div id="calib-bar-lh-fill" style="height:100%;width:${INIT_PCT}%;background:linear-gradient(90deg, #4f8cff 0%, #3358e0 100%);transition:width 0.05s;"></div>
                <div id="calib-bar-lh-ind" style="position:absolute;left:${INIT_PCT}%;top:0;bottom:0;width:2px;background:#e74c3c;opacity:0.7;"></div>
              </div>
              <!-- 紧凑的数值显示区域 -->
              <div style="display:flex;flex-direction:column;gap:1px;align-items:center;">
                <span id="val-bar-lh" style="font-family:'Roboto',monospace;font-size:0.85em;color:#222;background:#fff;border-radius:3px;padding:1px 6px;box-shadow:0 1px 2px #e0e7ff;min-width:2.8em;display:inline-block;text-align:center;">${TRIM_INIT_VAL}</span>
                <span id="val-actual-lh" style="font-family:'Roboto',monospace;font-size:0.75em;color:#e74c3c;background:#fff5f5;border:1px solid #fecaca;border-radius:3px;padding:1px 4px;box-shadow:0 1px 2px #fecaca;min-width:2.2em;display:inline-block;text-align:center;">0</span>
            </div>
            </div>
            <canvas class="calib-joystick" id="joystick1" width="200" height="200" style="width:10vh;height:10vh;max-width:140px;max-height:140px;min-width:60px;min-height:60px;"></canvas>
          </div>


          <!-- 右横条 + Joystick -->
          <div class="calib-joystick-wrap" style="display:flex;flex-direction:column;align-items:center;gap:2px;">
            <div style="display:flex; align-items: center; gap: 3px;">
              <!-- 修改：水平滑块 -->
              <div class="slider-bar-overlay" style="width:140px;">
                <input id="calib-slider-rh" class="horizontal-slider" type="range" min="${TRIM_MIN_VAL}" max="${TRIM_MAX_VAL}" value="${TRIM_INIT_VAL}">
              </div>
              <!-- 新增：滑块值显示 -->
              <span id="val-calib-slider-rh" style="font-family:'Roboto',monospace;font-size:0.8em;color:#666;background:#f0f0f0;border-radius:3px;padding:1px 6px;box-shadow:0 1px 2px #e0e7ff;min-width:2.5em;display:inline-block;text-align:center;">${TRIM_INIT_VAL}</span>
            </div>
            <div style="display:flex; align-items: center; gap: 3px;">
              <!-- 进度条 -->
              <div id="calib-bar-rh" style="height:16px;width:180px;background:#e0e7ff;border-radius:8px;overflow:hidden;position:relative;box-shadow:0 1px 4px #b3cfff;">
                <div id="calib-bar-rh-fill" style="height:100%;width:${INIT_PCT}%;background:linear-gradient(90deg, #4f8cff 0%, #3358e0 100%);transition:width 0.05s;"></div>
                <div id="calib-bar-rh-ind" style="position:absolute;left:${INIT_PCT}%;top:0;bottom:0;width:2px;background:#e74c3c;opacity:0.7;"></div>
              </div>
              <!-- 紧凑的数值显示区域 -->
              <div style="display:flex;flex-direction:column;gap:1px;align-items:center;">
                <span id="val-bar-rh" style="font-family:'Roboto',monospace;font-size:0.85em;color:#222;background:#fff;border-radius:3px;padding:1px 6px;box-shadow:0 1px 2px #e0e7ff;min-width:2.8em;display:inline-block;text-align:center;">${TRIM_INIT_VAL}</span>
                <span id="val-actual-rh" style="font-family:'Roboto',monospace;font-size:0.75em;color:#e74c3c;background:#fff5f5;border:1px solid #fecaca;border-radius:3px;padding:1px 4px;box-shadow:0 1px 2px #fecaca;min-width:2.2em;display:inline-block;text-align:center;">0</span>
            </div>
            </div>
            <canvas class="calib-joystick" id="joystick2" width="200" height="200" style="width:10vh;height:10vh;max-width:140px;max-height:140px;min-width:60px;min-height:60px;"></canvas>
          </div>

          <!-- 右竖：进度条 + 滑块（保持原样，新增滑块值显示） -->
          <div style="display:flex;flex-direction:column;gap:2px;align-items:center;">
            <div style="display:flex;align-items:center;gap:3px;">
              <div id="calib-bar-rv" style="width:16px;height:180px;background:#e0e7ff;border-radius:8px;overflow:hidden;position:relative;box-shadow:0 1px 4px #b3cfff;">
                <div id="calib-bar-rv-fill" style="width:100%;height:${INIT_PCT}%;background:linear-gradient(0deg, #4f8cff 0%, #3358e0 100%);transition:height 0.05s;"></div>
                <div id="calib-bar-rv-ind" style="position:absolute;top:${INIT_PCT}%;left:0;right:0;height:2px;background:#e74c3c;opacity:0.7;"></div>
              </div>

              <div style="width:16px;height:120px;display:flex;align-items:center;justify-content:center;">
                <input id="calib-slider-rv" class="vertical-slider" type="range" min="${TRIM_MIN_VAL}" max="${TRIM_MAX_VAL}" value="${TRIM_INIT_VAL}">
              </div>
            </div>
            <!-- 紧凑的数值显示区域 -->
            <div style="display:flex;flex-direction:column;gap:1px;align-items:center;">
              <span id="val-calib-slider-rv" style="font-family:'Roboto',monospace;font-size:0.8em;color:#666;background:#f0f0f0;border-radius:3px;padding:1px 6px;box-shadow:0 1px 2px #e0e7ff;min-width:2.5em;display:inline-block;text-align:center;">${TRIM_INIT_VAL}</span>
              <span id="val-bar-rv" style="font-family:'Roboto',monospace;font-size:0.9em;color:#222;background:#fff;border-radius:4px;padding:1px 8px;box-shadow:0 1px 2px #e0e7ff;min-width:3em;display:inline-block;text-align:center;">${TRIM_INIT_VAL}</span>
              <span id="val-actual-rv" style="font-family:'Roboto',monospace;font-size:0.75em;color:#e74c3c;background:#fff5f5;border:1px solid #fecaca;border-radius:3px;padding:1px 4px;box-shadow:0 1px 2px #fecaca;min-width:2.2em;display:inline-block;text-align:center;">0</span>
            </div>
          </div>


        </div>
      </div>
    </div>
  `;

    // 滑块与微调功能同步
    function syncSliderWithTrim() {
        // 滑块ID映射到微调索引
        const sliderMap = {
            'calib-slider-lv': 2,  // 左竖
            'calib-slider-lh': 3,  // 左横
            'calib-slider-rh': 0,  // 右横
            'calib-slider-rv': 1   // 右竖
        };

        // 为每个滑块添加事件监听器
        Object.keys(sliderMap).forEach(sliderId => {
            const slider = document.getElementById(sliderId);
            const trimIdx = sliderMap[sliderId];

            if (slider) {
                // 滑块值变化时更新微调值
                slider.addEventListener('input', function () {
                    const value = parseInt(this.value);

                    // 更新微调值
                    if (window.channelMap && window.channelMap.channelTrimSend) {
                        window.channelMap.channelTrimSend[trimIdx] = value;
                    }

                    // 更新微调UI
                    updateTrimUI(trimIdx, value);

                    // 更新滑块值显示
                    const valSpan = document.getElementById(`val-${sliderId}`);
                    if (valSpan) {
                        valSpan.textContent = value;
                    }
                });
            }
        });
    }

    // 更新微调UI的函数
    function updateTrimUI(trimIdx, value) {
        const trimValSpan = document.getElementById(`trim-val-${trimIdx}`);
        const trimDot = document.getElementById(`trim-dot-${trimIdx}`);
        const trimBar = document.getElementById(`trim-bar-${trimIdx}`);

        if (trimValSpan) trimValSpan.textContent = value;
        if (trimBar && trimDot) {
            let percent = (value + 130) / 260;
            let left = percent * (trimBar.offsetWidth - trimDot.offsetWidth);
            trimDot.style.left = left + 'px';
        }
    }

    // 从微调值同步到滑块
    function syncTrimToSlider() {
        if (!window.channelMap || !window.channelMap.channelTrimSend) return;

        const sliderMap = {
            'calib-slider-lv': 2,
            'calib-slider-lh': 3,
            'calib-slider-rh': 0,
            'calib-slider-rv': 1
        };

        Object.keys(sliderMap).forEach(sliderId => {
            const slider = document.getElementById(sliderId);
            const trimIdx = sliderMap[sliderId];
            const value = window.channelMap.channelTrimSend[trimIdx];

            if (slider) {
                slider.value = value;
                const valSpan = document.getElementById(`val-${sliderId}`);
                if (valSpan) {
                    valSpan.textContent = value;
                }
            }
        });
    }

    // 初始化滑块同步
    setTimeout(() => {
        syncSliderWithTrim();
        syncTrimToSlider();
    }, 100);

    // 三态按钮
    const btnNames = ['SA', 'SB', 'SC', 'SD', 'SE'];
    const btnGroup = document.getElementById('calib-btn-group');
    const stateSvgs = [
        // 低：倒三角
        '<svg width="28" height="28" viewBox="0 0 28 28"><polygon points="14,22 4,8 24,8" fill="#e74c3c" stroke="#b71c1c" stroke-width="2"/></svg>',
        // 中：菱形
        '<svg width="28" height="28" viewBox="0 0 28 28"><polygon points="14,5 25,14 14,23 3,14" fill="#f1c40f" stroke="#b7950b" stroke-width="2"/></svg>',
        // 高：正三角
        '<svg width="28" height="28" viewBox="0 0 28 28"><polygon points="14,6 24,20 4,20" fill="#2ecc71" stroke="#145a32" stroke-width="2"/></svg>'
    ];
    const stateNames = ['low', 'mid', 'high'];
    // 进度条

    const slider = document.getElementById('calib-slider');
    const sliderValue = document.getElementById('calib-slider-value');
    slider.oninput = function () {
        sliderValue.textContent = slider.value;
        slider.style.background = `linear-gradient(90deg, #4f8cff ${slider.value}%, #e0e7ff ${slider.value}%)`;
    };
    slider.style.background = `linear-gradient(90deg, #4f8cff 50%, #e0e7ff 50%)`;
    // 三态按钮初始化
    let switchStates = [1, 1, 1, 1, 1];
    btnNames.forEach((name, idx) => {
        const btn = document.createElement('button');
        btn.className = 'calib-btn-state';
        btn.dataset.state = 'mid';
        btn.innerHTML = `<div class="calib-btn-svg">${stateSvgs[1]}</div><div style="font-size:0.85em;color:#3358e0;margin-top:1px;">${name}</div>`;
        btn.onclick = function () {
            let state = btn.dataset.state;
            let next = state === 'mid' ? 'high' : state === 'high' ? 'low' : 'mid';
            btn.dataset.state = next;
            let idx2 = stateNames.indexOf(next);
            btn.querySelector('.calib-btn-svg').innerHTML = stateSvgs[idx2];
            switchStates[idx] = idx2;
        };
        btn.onmouseenter = function () { btn.style.boxShadow = '0 0 12px 2px #b3cfff'; };
        btn.onmouseleave = function () { btn.style.boxShadow = ''; };
        btnGroup.appendChild(btn);
    });
    // 摇杆显示（无动画，默认中点）
    const joy1Canvas = document.getElementById('joystick1');
    const joy2Canvas = document.getElementById('joystick2');
    // function drawJoystick(canvas, x, y) {
    //   const ctx = canvas.getContext('2d');
    //   const w = canvas.width;
    //   const h = canvas.height;
    //   ctx.clearRect(0, 0, w, h);
    //   ctx.fillStyle = '#f4f6fb';
    //   ctx.fillRect(0, 0, w, h);
    //   ctx.save();
    //   ctx.setLineDash([12, 10]);
    //   ctx.strokeStyle = '#bbb';
    //   ctx.lineWidth = 2;
    //   ctx.beginPath();
    //   ctx.moveTo(w/2, 0); ctx.lineTo(w/2, h);
    //   ctx.moveTo(0, h/2); ctx.lineTo(w, h/2);
    //   ctx.stroke();
    //   ctx.restore();
    //   ctx.beginPath();
    //   ctx.arc(w/2, h/2, 12, 0, 2 * Math.PI);
    //   ctx.fillStyle = '#e74c3c';
    //   ctx.shadowColor = '#e74c3c';
    //   ctx.shadowBlur = 8;
    //   ctx.fill();
    //   ctx.shadowBlur = 0;
    //   // 黑点
    //   let bx = w/2 + (x||0) * (w/2-40) / 100;
    //   let by = h/2 - (y||0) * (h/2-40) / 100;
    //   // 指针线段
    //   ctx.save();
    //   ctx.strokeStyle = '#3358e0';
    //   ctx.lineWidth = 4;
    //   ctx.beginPath();
    //   ctx.moveTo(w/2, h/2);
    //   ctx.lineTo(bx, by);
    //   ctx.stroke();
    //   ctx.restore();
    //   ctx.beginPath();
    //   ctx.arc(bx, by, 14, 0, 2 * Math.PI);
    //   ctx.fillStyle = '#111';
    //   ctx.shadowColor = '#111';
    //   ctx.shadowBlur = 8;
    //   ctx.fill();
    //   ctx.shadowBlur = 0;
    // }
    // 默认中点
    drawJoystick(joy1Canvas, 0, 0);
    drawJoystick(joy2Canvas, 0, 0);

    // 校准状态管理
    window.calibState = 'idle'; // idle, calibrating
    //let origChannelTimer = null;
    window.lastChannelData = [];
    window.centerMeans = [0, 0, 0, 0];

    // 进入页面时先发map指令
    async function requestChannelMapForCalib() {
        if (!writer) return;
        await writer.write(new Uint8Array([0xA5, 0x55, 0x0D, 0, 0, 0x0D, 0x0A]));
    }
    // 解析0x44包
    // function tryParseChannelMapPacketCalib(buf) {
    //   if (!buf || buf.length < 3) return false;
    //   if (buf[0] !== 0x44) return false;
    //   const len = buf[1];
    //   if (buf.length < len + 2) return false;
    //   const crc = buf[len+1];
    //   const calcCrc = crc8tab_js(buf.slice(2,2+len-1), len-1);
    //   if (crc !== calcCrc) return false;
    //   // 收到map后开始请求原始通道数据
    //   // if (origChannelTimer) clearInterval(origChannelTimer);
    //   // origChannelTimer = setInterval(() => {
    //   //   if (calibState === 'idle') {
    //   //     writer.write(new Uint8Array([0xA5,0x55,0x02,0x0D,0x0A]));
    //   //   }
    //   // }, 20);
    //    return true;
    // }

    // 解析0x22包
    function tryParseOrigChannelPacketCalib(buf) {
        // 只在校准页面可见时刷新控件
        var pageCalib = document.getElementById('page-calib');
        if (!pageCalib || pageCalib.style.display === 'none') return;

        // 实时获取控件
        const btnGroup = document.getElementById('calib-btn-group');
        const slider = document.getElementById('calib-slider');
        const sliderValue = document.getElementById('calib-slider-value');
        const joy1Canvas = document.getElementById('joystick1');
        const joy2Canvas = document.getElementById('joystick2');
        const stateNames = ['low', 'mid', 'high'];
        const stateSvgs = [
            // 低：倒三角
            '<svg width="28" height="28" viewBox="0 0 28 28"><polygon points="14,22 4,8 24,8" fill="#e74c3c" stroke="#b71c1c" stroke-width="2"/></svg>',
            // 中：菱形
            '<svg width="28" height="28" viewBox="0 0 28 28"><polygon points="14,5 25,14 14,23 3,14" fill="#f1c40f" stroke="#b7950b" stroke-width="2"/></svg>',
            // 高：正三角
            '<svg width="28" height="28" viewBox="0 0 28 28"><polygon points="14,6 24,20 4,20" fill="#2ecc71" stroke="#145a32" stroke-width="2"/></svg>'
        ];

        if (!btnGroup || !slider || !sliderValue || !joy1Canvas || !joy2Canvas) return;

        if (!buf || buf.length < 3) return false;
        if (buf[0] !== 0x22) return false;
        const len = buf[1];
        if (buf.length < len + 2) return false;
        const crc = buf[len + 1];
        const calcCrc = crc8tab_js(buf.slice(2, 2 + len - 1), len - 1);
        if (crc !== calcCrc) return false;
        let recvChannel = [];
        for (let i = 0; i < 10; i++) {
            let off = 8 + i * 2;
            let val = buf[off] | (buf[off + 1] << 8);
            recvChannel[i] = val;
        }
        let joxy = [];

        // 前4个通道映射到摇杆
        // let joy1x = Math.round((recvChannel[0]-1500)/5);
        // let joy1y = Math.round((recvChannel[1]-1500)/5);
        // let joy2x = Math.round((recvChannel[3]-1500)/5);
        // let joy2y = Math.round((recvChannel[2]-1500)/5);
        joxy[0] = Math.round((recvChannel[0] - 1500) / 5);
        joxy[1] = Math.round((recvChannel[1] - 1500) / 5);
        joxy[2] = Math.round((recvChannel[3] - 1500) / 5);
        joxy[3] = Math.round((recvChannel[2] - 1500) / 5);
        for (let i = 0; i < 4; i++) {
            if (joxy[i] > 100) {
                //console.log("异常大:",joxy[i],";recvChannel:",recvChannel,";buf:",buf);
                joxy[i] = 100;
            }
            else if (joxy[i] < -100) {
                //console.log("异常小:",joxy[i],";recvChannel:",recvChannel,";buf:",buf);
                joxy[i] = -100;
            }
        }
        const calibElements = [          //映射表
            { barId: 'calib-bar-rh', valId: 'val-bar-rh', dir: 2 },   // 右进度条2          
            { barId: 'calib-bar-rv', valId: 'val-bar-rv', dir: 1 },  // 右进度条1
            { barId: 'calib-bar-lv', valId: 'val-bar-lv', dir: 1 },  // 左进度条1
            { barId: 'calib-bar-lh', valId: 'val-bar-lh', dir: 2 },  // 左进度条2
            // { barId: 'calib-bar-rl', valId: 'val-bar-rl' },  // 右进度条1
            // { barId: 'calib-bar-rh', valId: 'val-bar-rh' },   // 右进度条2    
        ];

        if (typeof drawJoystick === 'function') {
            drawJoystick(joy1Canvas, joxy[2], joxy[3]);
            drawJoystick(joy2Canvas, joxy[0], joxy[1]);
            //let bar = document.getElementById(`ch-bar-${i}`)?.children[0]
            // document.getElementById('calib-bar-lv')?.children[0].style.width  = ((recvChannel[i]-988)/(2012-988)*100) + '%';
            // document.getElementById('calib-bar-lh')?.children[0].style.width  = ((recvChannel[1]-988)/(2012-988)*100) + '%';
            // document.getElementById('calib-bar-rv')?.children[0].style.width  = ((recvChannel[2]-988)/(2012-988)*100) + '%';
            // document.getElementById('calib-bar-rh')?.children[0].style.width  = ((recvChannel[3]-988)/(2012-988)*100) + '%';
            let tmpChannel = [];
            tmpChannel[0] = recvChannel[2];
            tmpChannel[1] = recvChannel[3];
            tmpChannel[2] = recvChannel[1];
            tmpChannel[3] = recvChannel[0];
            for (let i = 0; i < calibElements.length; i++) {
                const { barId, valId, dir } = calibElements[i];

                // 更新数值显示
                const valElement = document.getElementById(valId);
                if (valElement) {
                    let tmpData = (recvChannel[i] - 1500) / 5;
                    if (tmpData > 100) tmpData = 100;
                    else if (tmpData < -100) tmpData = -100;
                    valElement.textContent = Math.round(tmpData); // 假设processedCalib是校准数据数组
                }

                // 更新实际数值显示（-100到100范围）
                const actualValElement = document.getElementById(`val-actual-${['lv', 'lh', 'rv', 'rh'][i]}`);
                if (actualValElement) {
                    actualValElement.textContent = Math.round(tmpChannel[i]);
                }

                // 更新进度条宽度
                const barFill = document.getElementById(barId)?.children[0];
                if (barFill) {
                    if (dir == 1) {
                        // 注意：校准的数值范围可能和通道不同，这里沿用你的计算方式，实际需按校准范围调整
                        barFill.style.height = `${((recvChannel[i] - 988) / (2012 - 988) * 100)}%`;
                    }
                    else if (dir == 2) {
                        // 注意：校准的数值范围可能和通道不同，这里沿用你的计算方式，实际需按校准范围调整
                        barFill.style.width = `${((recvChannel[i] - 988) / (2012 - 988) * 100)}%`;
                    }
                }
            }
        }
        // 三态开关
        for (let i = 0; i < 5; i++) {
            let btn = btnGroup.children[i];
            let v = recvChannel[4 + i];
            let stateIdx = 1;
            if (v < 1300) stateIdx = 0;
            else if (v > 1700) stateIdx = 2;
            btn.dataset.state = stateNames[stateIdx];
            btn.querySelector('.calib-btn-svg').innerHTML = stateSvgs[stateIdx];
        }
        // 进度条（第10通道）
        let s1val = recvChannel[9];
        let percent = Math.round((s1val - 988) / (2012 - 988) * 100);
        slider.value = percent;
        sliderValue.textContent = percent;
        slider.style.background = `linear-gradient(90deg, #4f8cff ${percent}%, #e0e7ff ${percent}%)`;
    }


    window.tryParseOrigChannelPacketCalib = tryParseOrigChannelPacketCalib;

    requestChannelMapForCalib();

    const calibResetBtn = document.getElementById('calib-reset-action-btn');
    calibResetBtn.onclick = async function () {
        //initCalibPage();
        calibBtn.textContent = LANGS[currentLang]['calib-start'];
        calibBtn.disabled = false;
        calibStepLabel.textContent = LANGS[currentLang]['calib-start-step-label'];
        recvMidAdc = [];
        window.calibState = 'idle';
        window._adcMax = [0, 0, 0, 0, 0];
        window._adcMin = [65535, 65535, 65535, 65535, 65535];
    }


    const calibSaveBtn = document.getElementById('calib-save-action-btn');
    calibSaveBtn.style.display = 'none';
    calibSaveBtn.disabled = true;
    calibSaveBtn.onclick = async function () {
        const adcMax = window._adcMax || [0, 0, 0, 0, 0];
        const adcMin = window._adcMin || [0, 0, 0, 0, 0];
        // 中心点
        // 组装28字节数据
        let data = new Uint8Array(28);
        for (let i = 0; i < 4; i++) {
            // max
            data[i * 6 + 0] = adcMax[i] & 0xFF;
            data[i * 6 + 1] = (adcMax[i] >> 8) & 0xFF;
            // min
            data[i * 6 + 2] = adcMin[i] & 0xFF;
            data[i * 6 + 3] = (adcMin[i] >> 8) & 0xFF;
            // zero
            let zero = recvMidAdc[i];
            data[i * 6 + 4] = zero & 0xFF;
            data[i * 6 + 5] = (zero >> 8) & 0xFF;
        }
        // 第5通道（电位器）
        // data[24] = adcMax[4] & 0xFF;
        // data[25] = (adcMax[4] >> 8) & 0xFF;
        // data[26] = adcMin[4] & 0xFF;
        // data[27] = (adcMin[4] >> 8) & 0xFF;
        data[24] = 4096 & 0xFF;
        data[25] = (4096 >> 8) & 0xFF;
        data[26] = 0;
        data[27] = 0;

        // zero 固定2048
        // 组包
        let buf = new Uint8Array(3 + 28 + 2);
        buf[0] = 0xA5;
        buf[1] = 0x55;
        buf[2] = 0x0A;
        buf.set(data, 3);
        buf[31] = 0x0D;
        buf[32] = 0x0A;
        // 电位器 zero 固定2048
        buf[29] = 0x00; // 2048 & 0xFF
        buf[30] = 0x08; // (2048 >> 8) & 0xFF
        // 发送
        if (writer) {
            writer.write(buf);
            console.log('[校准] 已发送校准指令:', Array.from(buf).map(x => x.toString(16).padStart(2, '0')).join(' '));
        }

    }

    // 校准按钮逻辑
    window.calibStep = 0; //扫面积
    const calibBtn = document.getElementById('calib-action-btn');
    const calibStepLabel = document.getElementById('calib-step-label');
    calibBtn.onclick = async function () {
        if (window.calibState === 'idle') {
            window.calibState = 'calibratMid';
            calibBtn.textContent = LANGS[currentLang]['confirm-center-point'];
            calibStepLabel.textContent = LANGS[currentLang]['calib-step-label-center-point'];
            console.log('[校准流程] 进入选择中心点，停止定时器');
            stopGlobalChannelTimer();
        }
        else if (window.calibState === 'calibratMid') {
            // 计算中心点均值
            let means = [0, 0, 0, 0];
            for (let i = 0; i < 4; i++) {
                means[i] = window.lastChannelData[i];
            }
            if (window._currentPage === 'calib') {
                console.log('[校准流程] 发送一次获取中心点指令 0xA5,0x55,0x22,0x04,0x0D,0x0A');
                writer.write(new Uint8Array([0xA5, 0x55, 0X22, 0x04, 0x0D, 0x0A]));
            }
            window.centerMeans = means;
            // 切换为定时发送0xA5,0x55,0x04,0x0D,0x0A的任务
            window._globalChannelTask = {
                channelRequest: () => {
                    console.log('[定时器] 发送 0xA5,0x55,0x04,0x0D,0x0A');
                    if (writer) writer.write(new Uint8Array([0xA5, 0x55, 0x04, 0x0D, 0x0A]));
                },
                commandRequest: () => { }
            };
            console.log('[校准流程] 切换为定时发送 0xA5,0x55,0x04,0x0D,0x0A');
            startGlobalChannelTimer();
            window.calibState = 'calibrating';
            calibBtn.disabled = true;
            calibBtn.textContent = LANGS[currentLang]['calib-done'];
            calibStepLabel.textContent = LANGS[currentLang]['calib-step-label-done'];
        }
        else if (window.calibState === 'calibrating') {
            // 组包并发送校准指令
            // 0xA5,0x55,0x0A + 28字节 + \r\n
            // 确保全局最大最小和中心点存在
            const adcMax = window._adcMax || [0, 0, 0, 0, 0];
            const adcMin = window._adcMin || [0, 0, 0, 0, 0];
            // 中心点
            // 组装28字节数据
            let data = new Uint8Array(28);
            for (let i = 0; i < 4; i++) {
                // max
                data[i * 6 + 0] = adcMax[i] & 0xFF;
                data[i * 6 + 1] = (adcMax[i] >> 8) & 0xFF;
                // min
                data[i * 6 + 2] = adcMin[i] & 0xFF;
                data[i * 6 + 3] = (adcMin[i] >> 8) & 0xFF;
                // zero
                let zero = recvMidAdc[i];
                data[i * 6 + 4] = zero & 0xFF;
                data[i * 6 + 5] = (zero >> 8) & 0xFF;
            }
            // 第5通道（电位器）
            // data[24] = adcMax[4] & 0xFF;
            // data[25] = (adcMax[4] >> 8) & 0xFF;
            // data[26] = adcMin[4] & 0xFF;
            // data[27] = (adcMin[4] >> 8) & 0xFF;
            data[24] = 4096 & 0xFF;
            data[25] = (4096 >> 8) & 0xFF;
            data[26] = 0;
            data[27] = 0;
            // zero 固定2048
            // 组包
            let buf = new Uint8Array(3 + 28 + 2);
            buf[0] = 0xA5;
            buf[1] = 0x55;
            buf[2] = 0x0A;
            buf.set(data, 3);
            buf[31] = 0x0D;
            buf[32] = 0x0A;
            // 电位器 zero 固定2048
            buf[29] = 0x00; // 2048 & 0xFF
            buf[30] = 0x08; // (2048 >> 8) & 0xFF
            // 连续发送三次，每次间隔0.5秒
            if (writer) {
                let sendCount = 0;
                const sendCalibCommand = () => {
                    sendCount++;
                    writer.write(buf);
                    console.log(`[校准] 已发送校准指令(第${sendCount}次):`, Array.from(buf).map(x => x.toString(16).padStart(2, '0')).join(' '));

                    if (sendCount < 3) {
                        setTimeout(sendCalibCommand, 500); // 0.5秒后发送下一次
                    }
                };
                sendCalibCommand(); // 立即发送第一次
            }

            window._globalChannelTask = {
                channelRequest: () => {
                    //console.log('[定时器] 发送 0xA5,0x55,0x02,0x0D,0x0A');
                    if (writer) writer.write(new Uint8Array([0xA5, 0x55, 0x02, 0x0D, 0x0A]));
                },
                commandRequest: () => { }
            };
            console.log('[校准流程] 恢复为定时发送原始通道数据 0xA5,0x55,0x02,0x0D,0x0A');
            startGlobalChannelTimer();
            window.calibState = 'idle';
            calibBtn.textContent = LANGS[currentLang]['calib-start'];
            calibStepLabel.textContent = LANGS[currentLang]['calib-start-step-label'];
            //window._adcMax = [0,0,0,0,0];
            //window._adcMin = [65535,65535,65535,65535,65535];
            document.getElementById('calib-save-action-btn').disabled = true;
            document.getElementById('calib-reset-action-btn').click();
        }
    };
}

renderCalibPage();

// --- 校准页面样式增强 ---
const calibStyle = document.createElement('style');
calibStyle.innerHTML = `
      .calib-btn-state {
      background: #fff;
      border: 2px solid #e0e7ff;
      border-radius: 12px;
      box-shadow: 0 1px 4px rgba(79,140,255,0.07);
      padding: 4px 10px 0 10px;
      min-width: 56px;
      min-height: 68px;
      display: flex;
      flex-direction: column;
      align-items: center;
      transition: box-shadow 0.2s, border 0.2s;
      cursor: pointer;
      font-size: 1.0em;
    }
    .calib-btn-group .calib-btn-state svg {
      width: 36px !important;
      height: 36px !important;
    }
    .calib-btn-group .calib-btn-label {
      font-size: 1.18em;
      margin-top: 8px;
    }
  </style>
</head>
<body style="margin:0;">
  <!-- 统一顶部栏 -->
  <div id="device-info-bar">
    <div class="logo-section">
        outline: none;
      }
      .calib-btn-state:active {
        border-color: #4f8cff;
        box-shadow: 0 0 12px 2px #b3cfff;
      }
      .calib-btn-svg svg { display: block; }
      .calib-slider-sao {
        width: 140px;
        height: 6px;
        border-radius: 4px;
        background: linear-gradient(90deg, #4f8cff 50%, #e0e7ff 50%);
        box-shadow: 0 1px 4px rgba(79,140,255,0.13);
        outline: none;
        accent-color: #4f8cff;
        transition: background 0.3s;
      }
      .calib-slider-sao::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: linear-gradient(135deg, #4f8cff 60%, #3358e0 100%);
        box-shadow: 0 1px 4px #b3cfff;
        border: 2px solid #fff;
        cursor: pointer;
        transition: background 0.2s;
      }
      .calib-slider-sao::-moz-range-thumb {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: linear-gradient(135deg, #4f8cff 60%, #3358e0 100%);
        box-shadow: 0 1px 4px #b3cfff;
        border: 2px solid #fff;
        cursor: pointer;
        transition: background 0.2s;
      }
      .calib-slider-sao::-ms-thumb {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: linear-gradient(135deg, #4f8cff 60%, #3358e0 100%);
        box-shadow: 0 1px 4px #b3cfff;
        border: 2px solid #fff;
        cursor: pointer;
        transition: background 0.2s;
      }
      .calib-joystick-row {
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;
        gap: 96px;
        width: 100%;
        margin: 0 auto;
        padding: 0;
        position: relative;
      }
      .calib-joystick-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 1050px;
        height: 1050px;
        position: relative;
      }
      .calib-joystick {
        width: 640px !important;
        height: 640px !important;
        max-width: 60vw !important;
        max-height: 90vh !important;
        min-width: 240px;
        min-height: 240px;
        margin: 0;
        display: block;
        background: #f4f6fb;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(79,140,255,0.07);
        border: 1.5px solid #e0e7ff;
      }
      @media (max-width: 2200px) {
        .calib-joystick, .calib-joystick-wrap { width: 500px !important; height: 500px !important; }
      }
      @media (max-width: 1400px) {
        .calib-joystick, .calib-joystick-wrap { width: 140px !important; height: 140px !important; min-width: 60px; min-height: 60px; }
      }
      @media (max-width: 900px) {
        .calib-joystick, .calib-joystick-wrap { width: 120px !important; height: 120px !important; min-width: 50px; min-height: 50px; }
        .calib-joystick-row { flex-direction: column; align-items: center; gap: 32px; }
      }
    `;
document.head.appendChild(calibStyle);

// --- 固件更新页面 YMODEM 入口和进度逻辑 ---
// 新拖拽+美化文件选择逻辑
const fwDropArea = document.getElementById('fw-drop-area');
const fwFileInput = document.getElementById('fw-file');
//const fwFileBtn = document.getElementById('fw-file-btn');
const fwFileName = document.getElementById('fw-file-name');
const fwUpdateBtn = document.getElementById('fw-update-btn');
fwUpdateBtn.disabled = true;
const fwProgressBar = document.getElementById('fw-progress-bar');
const fwProgressText = document.getElementById('fw-progress-text');
const fwStatus = document.getElementById('fw-status');
let fwFileData = null;
//fwFileBtn.onclick = () => fwFileInput.click();
fwDropArea.ondragover = e => { e.preventDefault(); fwDropArea.style.borderColor = '#3358e0'; };
fwDropArea.ondragleave = e => { e.preventDefault(); fwDropArea.style.borderColor = '#4f8cff'; };
fwDropArea.ondrop = e => {
    e.preventDefault();
    fwDropArea.style.borderColor = '#4f8cff';
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        fwFileInput.files = e.dataTransfer.files;
        fwFileInput.dispatchEvent(new Event('change'));
    }
};
fwFileInput.onchange = function () {
    const file = fwFileInput.files[0];
    if (!file) { fwFileData = null; fwFileName.textContent = ''; return; }
    const reader = new FileReader();
    reader.onload = function (e) {
        fwFileData = new Uint8Array(e.target.result);
        fwFileName.textContent = LANGS[currentLang]['fw-file-selected'] + file.name
            + LANGS[currentLang]['fw-file-size'] + fwFileData.length + LANGS[currentLang]['fw-file-bytes'];
        fwProgressBar.style.width = '0%';
        fwProgressText.textContent = '0%';
    };
    reader.readAsArrayBuffer(file);
};
// ========== PATCH: 固件更新页面增强 ==========
// 1. 进度条字体颜色增强
fwProgressText.style.color = '#fff';
fwProgressText.style.textShadow = '0 1px 4px #3358e0, 0 0 2px #000';
// 2. 新增"进入固件更新状态"按钮
let fwEnterUpdateBtn = document.createElement('button');
fwEnterUpdateBtn.id = 'fw-enter-update-btn';
fwEnterUpdateBtn.className = 'connect-btn';
fwEnterUpdateBtn.style.width = '100%';
fwEnterUpdateBtn.style.marginTop = '8px';
fwEnterUpdateBtn.style.marginBottom = '8px';
fwEnterUpdateBtn.setAttribute('data-i18n', 'fw-enter-update');
fwEnterUpdateBtn.style.fontSize = '1.08em';
//fwEnterUpdateBtn.textContent = LANGS[currentLang]['fw-enter-update'];
fwEnterUpdateBtn.onclick = async function () {
    if (!writer) { fwStatus.textContent = LANGS[currentLang]['fw-connect-port']; return; }
    try {
        if (upDataDev == "remote") {
            await writer.write(new Uint8Array([0xA5, 0x66, 0x01, 0x0D, 0x0A]));
        }
        if (upDataDev == "sensor") {

            // setTimeout(async () => {
            //   await writer.write(new Uint8Array([0x60, 0xF1, 0x55, 0x55]));  
            // }, 500);

            // setTimeout(async () => {
            //   await writer.write(new Uint8Array([0xA5, 0x66, 0x01, 0x0D, 0x0A]));
            // }, 500);


            upDataFlag = 1;
            updateFwUI();
            setTimeout(async () => {
                startFwReadyCheck();
            }, 1000);
        }
        else if (upDataDev == "transmitter") {
            await writer.write(new Uint8Array([0xA5, 0x66, 0x02, 0x0D, 0x0A]));
            // showConnectPage();
            // hideDeviceInfoBar();
            // //await port.close(); 
            // isSerialConnected = false;
            // await reader.cancel(); // 中断读取
            // reader.releaseLock();   // 释放读锁

            // await writer.cancel(); // 中断写
            // writer.releaseLock();   // 释放写锁

            // await navigator.serial.requestPort().close();
            // port = null; writer = null; reader = null;
            setTimeout(() => {
                //location.reload(true); 
            }, 1500);
            // location.href = "https://expresslrs.github.io/web-flasher/";
            // 弹窗选择跳转方式
            let dialog = document.createElement('div');
            dialog.style.position = 'fixed';
            dialog.style.left = '0';
            dialog.style.top = '0';
            dialog.style.width = '100vw';
            dialog.style.height = '100vh';
            dialog.style.background = 'rgba(0,0,0,0.18)';
            dialog.style.display = 'flex';
            dialog.style.alignItems = 'center';
            dialog.style.justifyContent = 'center';
            dialog.style.zIndex = '9999';

            let inner = document.createElement('div');
            inner.style.background = '#fff';
            inner.style.borderRadius = '18px';
            inner.style.boxShadow = '0 4px 24px rgba(79,140,255,0.18)';
            inner.style.padding = '38px 48px 32px 48px';
            inner.style.display = 'flex';
            inner.style.flexDirection = 'column';
            inner.style.alignItems = 'center';
            inner.style.minWidth = '320px';
            inner.style.maxWidth = '90vw';

            inner.innerHTML = `
            <div style="font-size:1.18em;color:#3358e0;font-weight:bold;margin-bottom:18px;">${LANGS[currentLang]['select-firmware-update-method']}</div>
            <div style="font-size:1.08em;color:#222;margin-bottom:24px;text-align:center;">${LANGS[currentLang]['select-firmware-update-method-desc']}</div>
          `;

            let btnWeb = document.createElement('button');
            btnWeb.textContent = LANGS[currentLang]['jump-to-elrs-website'];
            btnWeb.style.background = 'linear-gradient(90deg,#4f8cff 0%,#3358e0 100%)';
            btnWeb.style.color = '#fff';
            btnWeb.style.border = 'none';
            btnWeb.style.borderRadius = '8px';
            btnWeb.style.padding = '12px 32px';
            btnWeb.style.fontSize = '1.08em';
            btnWeb.style.fontWeight = 'bold';
            btnWeb.style.cursor = 'pointer';
            btnWeb.style.marginBottom = '16px';
            btnWeb.onclick = () => {
                document.body.removeChild(dialog);
                setTimeout(() => {
                    location.reload(true);
                }, 1500);
                setTimeout(() => {
                    location.href = "https://expresslrs.github.io/web-flasher/";
                }, 500);
            };

            let btnApp = document.createElement('button');
            btnApp.textContent = LANGS[currentLang]['update-esp-firmware'];
            btnApp.style.background = 'linear-gradient(90deg,#2ecc71 0%,#27ae60 100%)';
            btnApp.style.color = '#fff';
            btnApp.style.border = 'none';
            btnApp.style.borderRadius = '8px';
            btnApp.style.padding = '12px 32px';
            btnApp.style.fontSize = '1.08em';
            btnApp.style.fontWeight = 'bold';
            btnApp.style.cursor = 'pointer';
            btnApp.style.marginBottom = '8px';
            btnApp.onclick = () => {
                document.body.removeChild(dialog);
                alert(LANGS[currentLang]['jump-to-elrs-website-desc']);
                location.reload(true);
            };

            let btnCancel = document.createElement('button');
            btnCancel.textContent = LANGS[currentLang]['cancel'];
            btnCancel.style.background = '#e0e7ff';
            btnCancel.style.color = '#3358e0';
            btnCancel.style.border = 'none';
            btnCancel.style.borderRadius = '8px';
            btnCancel.style.padding = '10px 32px';
            btnCancel.style.fontSize = '1.08em';
            btnCancel.style.fontWeight = 'bold';
            btnCancel.style.cursor = 'pointer';
            btnCancel.onclick = () => {
                document.body.removeChild(dialog);
            };

            inner.appendChild(btnWeb);
            inner.appendChild(btnApp);
            inner.appendChild(btnCancel);
            dialog.appendChild(inner);
            document.body.appendChild(dialog);
        }
        upDataFlag = 1;
        fwStatus.textContent = LANGS[currentLang]['fw-send-update-cmd'];
    } catch (e) {
        fwStatus.textContent = LANGS[currentLang]['fw-send-update-cmd-failed'] + e.message;
    }
};
const fwCard = document.getElementById('fw-card');
if (fwCard && !document.getElementById('fw-enter-update-btn')) {
    fwCard.insertBefore(fwEnterUpdateBtn, fwUpdateBtn);
}
// 3. 进入页面时自动检测下位机数据，自动发送0x31直到收到3个0x43
let fwReadyCheckActive = false;
let fwCCount = 0;
let fwReadyCheckTimer = null;
let fwSend31Timer = null;
let fwSend31Count = 0;
let fwLastSerialLen = 0;
function startFwReadyCheck() {
    fwReadyCheckActive = true;
    fwCCount = 0;
    if (fwUpdateBtn) fwUpdateBtn.disabled = true; // 再加一层保险
    fwStatus.textContent = LANGS[currentLang]['fw-wait-update-cmd'];
    if (fwReadyCheckTimer) clearInterval(fwReadyCheckTimer);
    // 只监听，不再定时发0x31
    fwReadyCheckTimer = setInterval(() => {

        if (!fwReadyCheckActive) return;
        if (fwUpdateBtn) fwUpdateBtn.disabled = true;
        if (upDataDev == "sensor" && upDataFlag == 1) {
            setTimeout(async () => {
                await writer.write(new Uint8Array([0x60, 0xF1, 0x55, 0x55]));
            }, 20);

            setTimeout(async () => {
                await writer.write(new Uint8Array([0xA5, 0x66, 0x01, 0x0D, 0x0A]));
            }, 20);
        }


        // 检查serialBuffer是否有数据
        if (serialBuffer.length > 0) {
            // 检查是否有连续3个C
            let cStreak = 0;
            for (let i = 0; i < serialBuffer.length; i++) {
                if (serialBuffer[i] === 0x43) {
                    cStreak++;
                    if (cStreak >= 3) break;
                } else {
                    cStreak = 0;
                }
            }
            if (cStreak >= 3) {
                fwReadyCheckActive = false;
                if (fwUpdateBtn) {
                    fwUpdateBtn.disabled = false;
                    console.log('[FW] 收到连续3个C，解锁确认更新按钮');
                }
                fwStatus.textContent = LANGS[currentLang]['fw-ready-update'];
                upDataFlag = 2;
                //console.log('upDataFlag',upDataFlag);
                updateFwUI();
                serialBuffer = [];



                clearInterval(fwReadyCheckTimer);
                return;
            }
        }
    }, 20); // 监听频率可适当提高
}
// 进入固件更新页面时自动启动检测
//const _orig_initFwPage = typeof initFwPage === 'function' ? initFwPage : null;





// YMODEM协议主入口（重写，所有ACK/NAK等通过serialBuffer消费）
async function ymodemSend(fileData, fileName, onProgress) {
    window._isYmodemBusy = true;
    try {
        // YMODEM常量
        const SOH = 0x01, STX = 0x02, EOT = 0x04, ACK = 0x06, NAK = 0x15, CAN = 0x18, CRC = 0x43;
        const PACKET_SIZE = 1024;
        const PACKET_SIZE_128 = 128;
        const MAX_RETRY = 15;
        const TIMEOUT = 5000; // ms
        // 工具函数
        function crc16(buf) {
            let crc = 0;
            for (let i = 0; i < buf.length; i++) {
                crc ^= (buf[i] << 8);
                for (let j = 0; j < 8; j++) {
                    if (crc & 0x8000) crc = (crc << 1) ^ 0x1021;
                    else crc <<= 1;
                }
            }
            return crc & 0xFFFF;
        }
        function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

        // 通过serialBuffer消费ACK/NAK等控制字节
        async function ymodemWaitAckFromSerialBuffer(expect, timeout = TIMEOUT) {
            const start = Date.now();
            while (Date.now() - start < timeout) {
                if (serialBuffer.length > 0) {
                    // 只消费控制字节
                    for (let i = 0; i < serialBuffer.length; i++) {
                        const b = serialBuffer[i];
                        if ([ACK, NAK, CAN, CRC, EOT].includes(b)) {
                            serialBuffer.splice(i, 1); // 消费掉
                            console.log(`[YMODEM][RECV] 控制字节: 0x${b.toString(16).padStart(2, '0')} (${b === ACK ? 'ACK' : b === NAK ? 'NAK' : b === CAN ? 'CAN' : b === CRC ? 'CRC' : b === EOT ? 'EOT' : ''})`);
                            if (expect.includes(b)) return b;
                            if (b === CAN) throw new Error('对方中止传输');
                            // 不是期望的，继续等
                        }
                    }
                }
                await sleep(10);
            }
            throw new Error('超时未收到ACK/NAK');
        }

        // 1. 等待C
        let retry = 0;
        while (retry++ < MAX_RETRY) {
            try {
                console.log('[YMODEM] 等待C (0x43) 握手...');
                await ymodemWaitAckFromSerialBuffer([CRC], 3000);
                console.log('[YMODEM] 收到C (0x43)，握手成功');
                break;
            } catch (e) {
                console.warn(`[YMODEM] 握手未收到C，重试${retry}/${MAX_RETRY}`);
                if (retry >= MAX_RETRY) throw new Error('未收到C，设备未响应');
            }
        }
        // 2. 发送头包（SOH+128字节）
        let header = new Uint8Array(PACKET_SIZE_128 + 5);
        header[0] = SOH;
        header[1] = 0x00; // 包号
        header[2] = 0xFF;
        //c:\Users\11868\Desktop\project\Web\RadioMasterWeb.html 文件名和大小
        let nameBytes = new TextEncoder().encode(fileName);
        let sizeBytes = new TextEncoder().encode(fileData.length.toString());
        header.set(nameBytes, 3);
        header[3 + nameBytes.length] = 0x00;
        header.set(sizeBytes, 4 + nameBytes.length);
        header[4 + nameBytes.length + sizeBytes.length] = 0x00;
        // 填充0
        for (let i = 3 + nameBytes.length + 1 + sizeBytes.length + 1; i < 3 + PACKET_SIZE_128; i++) header[i] = 0;
        // CRC
        let crc = crc16(header.slice(3, 3 + PACKET_SIZE_128));
        header[PACKET_SIZE_128 + 3] = (crc >> 8) & 0xFF;
        header[PACKET_SIZE_128 + 4] = crc & 0xFF;
        // 头包重发
        retry = 0;
        while (retry++ < MAX_RETRY) {
            console.log('[YMODEM][SEND] 头包:', Array.from(header).map(b => b.toString(16).padStart(2, '0')).join(' '));
            await writer.write(header);
            let gotAck = false;
            const start = Date.now();
            while (Date.now() - start < TIMEOUT) {
                if (serialBuffer.length > 0) {
                    for (let i = 0; i < serialBuffer.length; i++) {
                        const b = serialBuffer[i];
                        if (b === ACK) {
                            serialBuffer.splice(i, 1);
                            gotAck = true;
                            console.log('[YMODEM][RECV] 头包收到ACK (0x06)');
                            break;
                        }
                        if ([CRC, NAK, CAN].includes(b)) {
                            serialBuffer.splice(i, 1);
                            if (b === NAK) {
                                console.warn('[YMODEM][RECV] 收到NAK，重发头包');
                                break;
                            }
                            if (b === CAN) throw new Error('对方中止传输');
                            // 0x43 (C) 这里直接忽略，后面统一清理
                        }
                    }
                }
                if (gotAck) break;
                await sleep(10);
            }
            if (gotAck) {
                // 清理所有C(0x43)
                let removed = 0;
                for (let i = serialBuffer.length - 1; i >= 0; i--) {
                    if (serialBuffer[i] === CRC) {
                        serialBuffer.splice(i, 1);
                        removed++;
                    }
                }
                if (removed > 0) console.log(`[YMODEM] 握手后清理了${removed}个C(0x43)`);
                break;
            }
            if (retry >= MAX_RETRY) throw new Error('头包未被ACK');
        }
        // 3. 发送数据包（STX+1024字节）
        let total = fileData.length;
        let sent = 0;
        let pktNum = 1;
        while (sent < total) {
            let chunk = fileData.slice(sent, sent + PACKET_SIZE);
            let pkt = new Uint8Array(PACKET_SIZE + 5);
            pkt[0] = STX;
            pkt[1] = pktNum & 0xFF;
            pkt[2] = 0xFF - pkt[1];
            pkt.set(chunk, 3);
            for (let i = 3 + chunk.length; i < 3 + PACKET_SIZE; i++) pkt[i] = 0x1A; // 填充Ctrl+Z
            let crc = crc16(pkt.slice(3, 3 + PACKET_SIZE));
            pkt[PACKET_SIZE + 3] = (crc >> 8) & 0xFF;
            pkt[PACKET_SIZE + 4] = crc & 0xFF;
            retry = 0;
            while (retry++ < MAX_RETRY) {
                console.log(`[YMODEM][SEND] 数据包#${pktNum}:`, Array.from(pkt).map(b => b.toString(16).padStart(2, '0')).join(' '));
                await writer.write(pkt);
                try {
                    let ack = await ymodemWaitAckFromSerialBuffer([ACK, NAK], TIMEOUT);
                    if (ack === ACK) { console.log(`[YMODEM][RECV] 数据包#${pktNum} 收到ACK`); break; }
                    if (ack === NAK) { console.warn(`[YMODEM][RECV] 数据包#${pktNum} 收到NAK，重发`); }
                } catch (e) {
                    if (retry >= MAX_RETRY) throw new Error('数据包未被ACK');
                }
            }
            sent += chunk.length;
            pktNum = (pktNum + 1) & 0xFF;
            if (onProgress) onProgress(sent, total);
        }
        // 4. 发送EOT
        retry = 0;
        while (retry++ < MAX_RETRY) {
            console.log('[YMODEM][SEND] EOT (0x04)');
            await writer.write(new Uint8Array([EOT]));
            try {
                let ack = await ymodemWaitAckFromSerialBuffer([ACK], TIMEOUT);
                if (ack === ACK) { console.log('[YMODEM][RECV] EOT收到ACK'); break; }
            } catch (e) {
                if (retry >= MAX_RETRY) throw new Error('EOT未被ACK');
            }
        }
        // 5. 结束包（SOH+128字节空包）
        let endPkt = new Uint8Array(PACKET_SIZE_128 + 5);
        endPkt[0] = SOH;
        endPkt[1] = 0x00;
        endPkt[2] = 0xFF;
        for (let i = 3; i < 3 + PACKET_SIZE_128; i++) endPkt[i] = 0;
        let endCrc = crc16(endPkt.slice(3, 3 + PACKET_SIZE_128));
        endPkt[PACKET_SIZE_128 + 3] = (endCrc >> 8) & 0xFF;
        endPkt[PACKET_SIZE_128 + 4] = endCrc & 0xFF;
        retry = 0;
        while (retry++ < MAX_RETRY) {
            console.log('[YMODEM][SEND] 结束包:', Array.from(endPkt).map(b => b.toString(16).padStart(2, '0')).join(' '));
            await writer.write(endPkt);
            try {
                let ack = await ymodemWaitAckFromSerialBuffer([ACK], TIMEOUT);
                if (ack === ACK) { console.log('[YMODEM][RECV] 结束包收到ACK'); break; }
            } catch (e) {
                if (retry >= MAX_RETRY) throw new Error('结束包未被ACK');
            }
        }
        await sleep(100);
        console.log('[YMODEM] 传输完成');
    } finally {
        window._isYmodemBusy = false;
    }
}

// --- 参数控件渲染增强 ---
function renderParameterControls(params, container, parent = 0, mode = null) {
    if (!mode) {
        const commTitle = document.querySelector('#page-net .comm-title');
        if (commTitle && commTitle.textContent.includes('RX')) mode = 'RX';
        else mode = 'TX';
    }
    // 过滤掉VTX Administrator父菜单及其子菜单
    const vtxFolder = params.find(p => p.baseType === 11 && p.name && p.name.includes('VTX Administrator'));
    let vtxFolderNum = vtxFolder ? vtxFolder.paramNum : null;
    let filtered = params.filter(p => {
        if (vtxFolderNum !== null) {
            if (p.baseType === 11 && p.paramNum === vtxFolderNum) return false;
            if (p.parentFolder === vtxFolderNum) return false;
        }
        return true;
    });


    // 渲染所有FOLDER类型为菜单
    filtered.filter(p => p.baseType === 11 && p.parentFolder === parent && !p.hidden).forEach(folder => {
        const folderDiv = document.createElement('div');
        folderDiv.className = 'setting-item';
        folderDiv.style.background = '#eaf1ff';
        folderDiv.style.cursor = 'pointer';
        folderDiv.style.fontWeight = 'bold';
        folderDiv.style.textAlign = 'left';
        folderDiv.textContent = folder.name;
        folderDiv.onclick = function () {
            const sub = folderDiv.nextSibling;
            if (sub && sub.className === 'param-container') {
                sub.style.display = (sub.style.display === 'none' ? '' : 'none');
            }
        };
        container.appendChild(folderDiv);
        const subContainer = document.createElement('div');
        subContainer.className = 'param-container';
        subContainer.style.marginLeft = '24px';
        container.appendChild(subContainer);
        renderParameterControls(filtered, subContainer, folder.paramNum, mode);
    });
    // 渲染当前parent下的非FOLDER参数
    filtered.filter(p => p.parentFolder === parent && p.baseType !== 11 && !p.hidden).forEach(param => {
        const item = document.createElement('div');
        item.className = 'setting-item';
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.justifyContent = 'space-between';
        item.style.gap = '18px';
        const label = document.createElement('span');
        label.className = 'setting-label';
        label.textContent = param.name + (param.unit ? ' (' + param.unit + ')' : '');
        label.style.textAlign = 'left';
        label.style.flex = '1 1 0';
        label.style.minWidth = '120px';
        label.style.maxWidth = '320px';
        item.appendChild(label);
        const control = document.createElement('div');
        control.className = 'setting-control';
        control.style.flex = '0 0 auto';
        control.style.display = 'flex';
        control.style.alignItems = 'center';
        control.style.gap = '10px';
        // 数值型
        if ([0, 1, 2, 3, 8].includes(param.baseType)) {
            const input = document.createElement('input');
            input.type = 'number';
            input.value = param.value;
            if (param.min !== null) input.min = param.min;
            if (param.max !== null) input.max = param.max;
            if (param.step !== null) input.step = param.step;
            input.style.width = '120px';
            input.style.minWidth = '120px';
            input.style.maxWidth = '120px';
            input.style.textAlign = 'right';
            input.onchange = () => {
                const modeByte = window._lastRefreshMode === 'TX' ? 0x11 : 0x22;
                const arr = [0xA5, 0x33, modeByte, param.paramNum, input.value, 0x0D, 0x0A];
                if (writer) writer.write(new Uint8Array(arr));
                console.log('数值型控件变更:', param.paramNum, '新值:', input.value);
            };
            control.appendChild(input);
        } else if (param.baseType === 9 && param.options) {
            // TEXT_SELECTION
            const select = document.createElement('select');
            select.style.width = '180px';
            select.style.minWidth = '180px';
            select.style.maxWidth = '180px';
            select.style.textAlign = 'center';
            param.options.forEach((opt, idx) => {
                // 只保留数字、字母大小写、括号、空格、负号
                //let cleanOpt = opt.replace(/[^0-9a-zA-Z\(\)\-: ]/g, '');
                //let cleanOpt = opt.replace(/[^0-9a-zA-Z$$\-:\/ ]/g, '');
                let cleanOpt = opt;

                const option = document.createElement('option');
                option.value = idx;

                if (cleanOpt.length === 0) {
                    cleanOpt = '(空)';
                    option.hidden = true; // 关键：不在下拉列表中显示
                    option.disabled = true; // 防止被选中
                }
                option.textContent = cleanOpt;
                if (idx === param.value) option.selected = true;
                select.appendChild(option);
            });
            select.onchange = () => {
                const modeByte = window._lastRefreshMode === 'TX' ? 0x11 : 0x22;
                const arr = [0xA5, 0x33, modeByte, param.paramNum, Number(select.value), 0x0D, 0x0A];
                if (writer) writer.write(new Uint8Array(arr));
                console.log('已发送:', arr.map(x => x.toString(16).padStart(2, '0')).join(' '));
            };
            control.appendChild(select);
        } else if (param.baseType === 10) {
            // STRING
            const input = document.createElement('input');
            input.type = 'text';
            input.value = param.value;
            input.maxLength = param.strMaxLen || 32;
            input.onchange = () => {
                console.log('字符串控件变更:', param.paramNum, '新值:', input.value);
                // sendParameterSet(param, input.value);
            };
            control.appendChild(input);
        } else if (param.baseType === 13) {
            // COMMAND
            const btn = document.createElement('button');
            //btn.textContent = '';//'启动';//langs[lang]['start']; // 统一命名为启动
            if (currentLang === 'zh') {
                btn.textContent = '开始';
            } else {
                btn.textContent = 'Start';
            }
            btn.setAttribute('data-i18n', 'execute');
            btn.style.minWidth = '130px';
            btn.style.maxWidth = '130px';
            btn.onclick = () => {
                console.log('命令按钮点击:', param.paramNum, '状态:', param.status);
                const modeByte = window._lastRefreshMode === 'TX' ? 0x11 : 0x22;
                const arrStart = [0xA5, 0x33, modeByte, param.paramNum, 1, 0x0D, 0x0A];
                if (writer) writer.write(new Uint8Array(arrStart));
                console.log('已发送START:', arrStart.map(x => x.toString(16).padStart(2, '0')).join(' '));
                // --- 弹窗与自动指令逻辑 ---
                let dialog = document.createElement('div');
                dialog.style.position = 'fixed';
                dialog.style.left = '0';
                dialog.style.top = '0';
                dialog.style.width = '100vw';
                dialog.style.height = '100vh';
                dialog.style.background = 'rgba(0,0,0,0.18)';
                dialog.style.display = 'flex';
                dialog.style.alignItems = 'center';
                dialog.style.justifyContent = 'center';
                dialog.style.zIndex = '9999';
                let inner = document.createElement('div');
                inner.style.background = '#fff';
                inner.style.borderRadius = '16px';
                inner.style.boxShadow = '0 4px 24px rgba(79,140,255,0.18)';
                inner.style.padding = '38px 48px 32px 48px';
                inner.style.display = 'flex';
                inner.style.flexDirection = 'column';
                inner.style.alignItems = 'center';
                inner.style.minWidth = '260px';
                inner.style.maxWidth = '90vw';
                inner.innerHTML = `<div style="font-size:1.18em;color:#3358e0;font-weight:bold;margin-bottom:18px;">${param.name || '命令操作'}</div>`;
                let msg = document.createElement('div');
                msg.style.fontSize = '1.08em';
                msg.style.color = '#222';
                msg.style.marginBottom = '18px';
                inner.appendChild(msg);
                let closeBtn = null;
                let timer = null;
                let poller = null;
                // 判断bind类
                const isBind = (param.name && /bind|对频|配对/i.test(param.name)) || (param.info && /bind|对频|配对/i.test(param.info));
                if (isBind) {
                    msg.textContent = currentLang === 'zh' ? '正在对频...' : 'Binding...';
                    document.body.appendChild(dialog);
                    dialog.appendChild(inner);
                    // 2秒后自动发送06并关闭
                    timer = setTimeout(() => {
                        const arrEnd = [0xA5, 0x33, modeByte, param.paramNum, 6, 0x0D, 0x0A];
                        if (writer) writer.write(new Uint8Array(arrEnd));
                        document.body.removeChild(dialog);
                    }, 2000);
                } else {
                    msg.textContent = currentLang === 'zh' ? '正在操作...' : 'Operating...';
                    closeBtn = document.createElement('button');
                    closeBtn.textContent = currentLang === 'zh' ? '结束' : 'End';
                    closeBtn.style.marginTop = '12px';
                    closeBtn.style.background = 'linear-gradient(90deg,#e74c3c 0%,#c0392b 100%)';
                    closeBtn.style.color = '#fff';
                    closeBtn.style.border = 'none';
                    closeBtn.style.borderRadius = '8px';
                    closeBtn.style.padding = '10px 32px';
                    closeBtn.style.fontSize = '1.08em';
                    closeBtn.style.fontWeight = 'bold';
                    closeBtn.style.cursor = 'pointer';
                    closeBtn.onclick = () => {
                        if (poller) clearInterval(poller);
                        const arrStop = [0xA5, 0x33, modeByte, param.paramNum, 5, 0x0D, 0x0A];
                        if (writer) writer.write(new Uint8Array(arrStop));
                        console.log('持续类点击结束发送STOP:', arrStop.map(x => x.toString(16).padStart(2, '0')).join(' '));
                        document.body.removeChild(dialog);
                    };
                    inner.appendChild(closeBtn);
                    document.body.appendChild(dialog);
                    dialog.appendChild(inner);
                    // 每1.5秒发送06
                    poller = setInterval(() => {
                        const arrPoll = [0xA5, 0x33, modeByte, param.paramNum, 6, 0x0D, 0x0A];
                        if (writer) writer.write(new Uint8Array(arrPoll));
                        console.log('持续类轮询发送POLL:', arrPoll.map(x => x.toString(16).padStart(2, '0')).join(' '));
                    }, 1500);
                }
            };
            control.appendChild(btn);
            if (param.info) {
                const infoSpan = document.createElement('span');
                infoSpan.textContent = param.info;
                infoSpan.style.marginLeft = '8px';
                control.appendChild(infoSpan);
            }
        } else if (param.baseType === 12) {
            // INFO
            const span = document.createElement('span');
            span.textContent = param.value;
            control.appendChild(span);
        } else {
            // 其他类型只读
            const span = document.createElement('span');
            span.textContent = param.value;
            control.appendChild(span);
        }
        item.appendChild(control);
        container.appendChild(item);
    });
}

// --- 无线配置刷新按钮一行横向并排 ---
const wirelessControls = document.querySelector('.wireless-controls');
if (wirelessControls) {
    wirelessControls.style.display = 'flex';
    wirelessControls.style.flexDirection = 'row';
    wirelessControls.style.justifyContent = 'center';
    wirelessControls.style.alignItems = 'center';
    wirelessControls.style.gap = '22px';
    wirelessControls.style.margin = '18px 0 0 0';
    const btns = wirelessControls.querySelectorAll('button');
    btns.forEach(btn => {
        btn.style.minWidth = '130px';
        btn.style.maxWidth = '130px';
        btn.style.fontSize = '1.08em';
        btn.style.margin = '0';
    });
    const spans = wirelessControls.querySelectorAll('span');
    spans.forEach(span => {
        span.style.minWidth = '80px';
        span.style.textAlign = 'left';
        span.style.display = 'inline-block';
    });
}

// ====== CRC8查表算法（与你给的表一致） ======
function crc8tab_js(ptr, len) {
    const crc8tab = [
        0x00, 0xD5, 0x7F, 0xAA, 0xFE, 0x2B, 0x81, 0x54, 0x29, 0xFC, 0x56, 0x83, 0xD7, 0x02, 0xA8, 0x7D,
        0x52, 0x87, 0x2D, 0xF8, 0xAC, 0x79, 0xD3, 0x06, 0x7B, 0xAE, 0x04, 0xD1, 0x85, 0x50, 0xFA, 0x2F,
        0xA4, 0x71, 0xDB, 0x0E, 0x5A, 0x8F, 0x25, 0xF0, 0x8D, 0x58, 0xF2, 0x27, 0x73, 0xA6, 0x0C, 0xD9,
        0xF6, 0x23, 0x89, 0x5C, 0x08, 0xDD, 0x77, 0xA2, 0xDF, 0x0A, 0xA0, 0x75, 0x21, 0xF4, 0x5E, 0x8B,
        0x9D, 0x48, 0xE2, 0x37, 0x63, 0xB6, 0x1C, 0xC9, 0xB4, 0x61, 0xCB, 0x1E, 0x4A, 0x9F, 0x35, 0xE0,
        0xCF, 0x1A, 0xB0, 0x65, 0x31, 0xE4, 0x4E, 0x9B, 0xE6, 0x33, 0x99, 0x4C, 0x18, 0xCD, 0x67, 0xB2,
        0x39, 0xEC, 0x46, 0x93, 0xC7, 0x12, 0xB8, 0x6D, 0x10, 0xC5, 0x6F, 0xBA, 0xEE, 0x3B, 0x91, 0x44,
        0x6B, 0xBE, 0x14, 0xC1, 0x95, 0x40, 0xEA, 0x3F, 0x42, 0x97, 0x3D, 0xE8, 0xBC, 0x69, 0xC3, 0x16,
        0xEF, 0x3A, 0x90, 0x45, 0x11, 0xC4, 0x6E, 0xBB, 0xC6, 0x13, 0xB9, 0x6C, 0x38, 0xED, 0x47, 0x92,
        0xBD, 0x68, 0xC2, 0x17, 0x43, 0x96, 0x3C, 0xE9, 0x94, 0x41, 0xEB, 0x3E, 0x6A, 0xBF, 0x15, 0xC0,
        0x4B, 0x9E, 0x34, 0xE1, 0xB5, 0x60, 0xCA, 0x1F, 0x62, 0xB7, 0x1D, 0xC8, 0x9C, 0x49, 0xE3, 0x36,
        0x19, 0xCC, 0x66, 0xB3, 0xE7, 0x32, 0x98, 0x4D, 0x30, 0xE5, 0x4F, 0x9A, 0xCE, 0x1B, 0xB1, 0x64,
        0x72, 0xA7, 0x0D, 0xD8, 0x8C, 0x59, 0xF3, 0x26, 0x5B, 0x8E, 0x24, 0xF1, 0xA5, 0x70, 0xDA, 0x0F,
        0x20, 0xF5, 0x5F, 0x8A, 0xDE, 0x0B, 0xA1, 0x74, 0x09, 0xDC, 0x76, 0xA3, 0xF7, 0x22, 0x88, 0x5D,
        0xD6, 0x03, 0xA9, 0x7C, 0x28, 0xFD, 0x57, 0x82, 0xFF, 0x2A, 0x80, 0x55, 0x01, 0xD4, 0x7E, 0xAB,
        0x84, 0x51, 0xFB, 0x2E, 0x7A, 0xAF, 0x05, 0xD0, 0xAD, 0x78, 0xD2, 0x07, 0x53, 0x86, 0x2C, 0xF9
    ];
    let crc = 0;
    for (let i = 0; i < len; i++) {
        crc = crc8tab[crc ^ ptr[i]];
    }
    return crc;
}

// ========== 设备信息包解析 ==========
function parseDeviceInfoPacket(buf) {
    // buf: Uint8Array, 已经确认 buf[0]==0xFF
    const len = buf[1];
    const crc = buf[len + 1];
    // console.log("crc:",crc);
    // console.log("len:",len);
    const calcCrc = crc8tab_js(buf.slice(2, 2 + len - 1), len - 1);
    //console.log('[设备属性] 解析过程: len=', len, 'crc(包)=', crc, 'crc(计算)=', calcCrc);
    if (crc !== calcCrc) {
        //console.warn('[设备信息] CRC校验失败!');
        //return null;
    }
    else {
        let offset = 2;
        const devVolume = buf[offset];
        offset++;
        const serialNumber = new TextDecoder().decode(buf.slice(offset, offset + 20)).replace(/\0.*$/, '');
        offset += 20;
        const elrsFirmWare = new TextDecoder().decode(buf.slice(offset, offset + 20)).replace(/\0.*$/, '');
        offset += 20;
        const deviceFirmWare = new TextDecoder().decode(buf.slice(offset, offset + 10)).replace(/\0.*$/, '');
        offset += 10;
        const elrsName = new TextDecoder().decode(buf.slice(offset, offset + 50)).replace(/\0.*$/, '');
        offset += 50;
        const companyName = new TextDecoder().decode(buf.slice(offset, offset + 20)).replace(/\0.*$/, '');
        offset += 20;
        const devName = new TextDecoder().decode(buf.slice(offset, offset + 20)).replace(/\0.*$/, '');
        offset += 20;
        const sendPackSpeed = buf[offset];
        const returnSpeed = buf[offset + 1];
        const calibrationFlag = buf[offset + 2];
        const connectProtocol = buf[offset + 3];
        const channelNum = buf[offset + 4];
        const secretKey = buf[offset + 5];
        const powerVal = buf[offset + 6];
        const remoteCtlClass = buf[offset + 7];
        const mixedCtl = buf[offset + 8];
        const keyModel = buf.slice(offset + 9, offset + 9 + 6);;
        const slideMid = buf[offset + 9 + 6];
        const slideMidData = buf[offset + 9 + 8] * 256 + buf[offset + 9 + 7];
        const RxWarning = buf[offset + 9 + 9];
        const LowPowerWarning = buf[offset + 9 + 10];
        const LeftTrimReset = buf[offset + 9 + 11];
        const RightTrimReset = buf[offset + 9 + 12];
        //console.log("data:",buf[offset+9+7],buf[offset+9+8]);
        // 打印所有字段
        console.log('[Device Attributes] Field Details:', {
            devVolume, serialNumber, elrsFirmWare, deviceFirmWare, elrsName, companyName, devName,
            sendPackSpeed, returnSpeed, calibrationFlag, connectProtocol, channelNum, secretKey, powerVal, remoteCtlClass, mixedCtl,
            keyModel, slideMid, slideMidData, RxWarning, LowPowerWarning, LeftTrimReset, RightTrimReset

        });
        return {
            devVolume, serialNumber, elrsFirmWare, deviceFirmWare, elrsName, companyName, devName,
            sendPackSpeed, returnSpeed, calibrationFlag, connectProtocol, channelNum, secretKey, powerVal, remoteCtlClass, mixedCtl,
            keyModel, slideMid, slideMidData, RxWarning, LowPowerWarning, LeftTrimReset, RightTrimReset
        };
    }
}

// 页面切换时自动刷新
menuBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        serialBuffer = [];
        console.log("serialBuffer:", serialBuffer);
        // 其他切换页面的逻辑...
        // if (btn.dataset.page === 'attr') {
        //   renderDeviceInfoPage();
        // }
        // 你原有的showMainPage逻辑也可以放这里
        showMainPage(btn.dataset.page);
    });
});

// ========== 自动刷新TX/RX工具 ==========
window._autoRefreshTask = null;
window._lastRefreshMode = null; // 'TX' or 'RX'
window._lastRefreshSuccess = false;
window._refreshTryCount = 0;
window._refreshMaxTry = 3;
window._refreshTimeout = 2000;
window._refreshSuccessCallback = null;
window._netPageAutoRefreshed = false; // 只在第一次进入无线配置页面时自动刷新TX

function stopAutoRefresh() {
    if (window._autoRefreshTask) {
        clearTimeout(window._autoRefreshTask);
        window._autoRefreshTask = null;
    }
    //document.getElementById('refresh-settings').disabled = true;
    document.getElementById('refresh-settings-rx').disabled = true;
    window._refreshTryCount = 0;
    window._lastRefreshSuccess = false;
    window._refreshSuccessCallback = null;
}

function autoRefresh(mode, callback) {
    //document.getElementById('refresh-settings').disabled = false;
    document.getElementById('refresh-settings-rx').disabled = false;
    stopAutoRefresh();
    window._lastRefreshMode = mode;
    window._refreshTryCount = 0;
    window._lastRefreshSuccess = false;
    window._refreshSuccessCallback = callback;
    console.log('autoRefresh: running', mode);
    function tryRefresh() {
        if (window._lastRefreshSuccess) return;
        if (window._refreshTryCount >= window._refreshMaxTry) return;
        window._refreshTryCount++;
        if (window._lastRefreshMode === 'TX') {
            if (typeof refreshSettings === 'function') refreshSettings();
        }
        else {
            // RX不允许自动刷新  已开启
            if (typeof refreshSettingsRX === 'function') refreshSettingsRX();
        }
    }
    tryRefresh();
}

// 在parseCRSFPacket里判定刷新成功
const _orig_parseCRSFPacket = parseCRSFPacket;
parseCRSFPacket = function (bigPacket) {
    // 判断当前刷新模式
    if (window._autoRefreshTask && window._lastRefreshMode) {
        window._lastRefreshSuccess = true;
        stopAutoRefresh();
        if (typeof window._refreshSuccessCallback === 'function') window._refreshSuccessCallback();
    }
    return _orig_parseCRSFPacket.apply(this, arguments);
};

/*
// ========== 控件渲染增强 ==========
function renderParameterControls(params, container, parent = 0, mode = null, isInitialRender = false) {
    if (!mode) {
        const commTitle = document.querySelector('#page-net .comm-title');
        if (commTitle && commTitle.textContent.includes('RX')) mode = 'RX';
        else mode = 'TX';
    }
    // 过滤掉VTX Administrator父菜单及其子菜单
    const vtxFolder = params.find(p => p.baseType === 11 && p.name && p.name.includes('VTX Administrator'));
    let vtxFolderNum = vtxFolder ? vtxFolder.paramNum : null;
    let filtered = params.filter(p => {
        if (vtxFolderNum !== null) {
            if (p.baseType === 11 && p.paramNum === vtxFolderNum) return false;
            if (p.parentFolder === vtxFolderNum) return false;
        }
        return true;
    });
    // 渲染所有FOLDER类型为菜单
    filtered.filter(p => p.baseType === 11 && p.parentFolder === parent && !p.hidden).forEach(folder => {
        const folderDiv = document.createElement('div');
        folderDiv.className = 'setting-item';
        folderDiv.style.background = '#eaf1ff';
        folderDiv.style.cursor = 'pointer';
        folderDiv.style.fontWeight = 'bold';
        folderDiv.style.textAlign = 'left';
        folderDiv.textContent = folder.name;
        folderDiv.onclick = function () {
            const sub = folderDiv.nextSibling;
            if (sub && sub.className === 'param-container') {
                sub.style.display = (sub.style.display === 'none' ? '' : 'none');
            }
        };
        container.appendChild(folderDiv);
        const subContainer = document.createElement('div');
        subContainer.className = 'param-container';
        subContainer.style.marginLeft = '24px';
        container.appendChild(subContainer);
        renderParameterControls(filtered, subContainer, folder.paramNum, mode, isInitialRender);
    });
    // 渲染当前parent下的非FOLDER参数
    filtered.filter(p => p.parentFolder === parent && p.baseType !== 11 && !p.hidden).forEach(param => {
        const item = document.createElement('div');
        item.className = 'setting-item';
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.justifyContent = 'space-between';
        item.style.gap = '18px';
        const label = document.createElement('span');
        label.className = 'setting-label';
        label.textContent = param.name + (param.unit ? ' (' + param.unit + ')' : '');
        label.style.textAlign = 'left';
        label.style.flex = '1 1 0';
        label.style.minWidth = '120px';
        label.style.maxWidth = '320px';
        item.appendChild(label);
        const control = document.createElement('div');
        control.className = 'setting-control';
        control.style.flex = '0 0 auto';
        control.style.display = 'flex';
        control.style.alignItems = 'center';
        control.style.gap = '10px';
        // 数值型
        if ([0, 1, 2, 3, 8].includes(param.baseType)) {
            const input = document.createElement('input');
            input.type = 'number';
            input.value = param.value;
            if (param.min !== null) input.min = param.min;
            if (param.max !== null) input.max = param.max;
            if (param.step !== null) input.step = param.step;
            input.style.width = '120px';
            input.style.minWidth = '120px';
            input.style.maxWidth = '120px';
            input.style.textAlign = 'right';
            let userChanged = false;
            input.addEventListener('input', () => { userChanged = true; });
            input.onchange = () => {
                if (!userChanged) return; userChanged = false;
                const modeByte = 'TX' === window._lastRefreshMode ? 0x11 : 0x22;
                const arr = [0xA5, 0x33, modeByte, param.paramNum, input.value, 0x0D, 0x0A];
                if (writer) writer.write(new Uint8Array(arr));
                // 自动刷新
                if (!isInitialRender) {
                    setTimeout(() => autoRefresh(window._lastRefreshMode), 500);
                }
            };
            control.appendChild(input);
        } else if (param.baseType === 9 && param.options) {
            // TEXT_SELECTION
            const select = document.createElement('select');
            select.style.width = '180px';
            select.style.minWidth = '180px';
            select.style.maxWidth = '180px';
            select.style.textAlign = 'right';
            param.options.forEach((opt, idx) => {
                //let cleanOpt = opt.replace(/[^0-9a-zA-Z\(\)\-: ]/g, '');
                // let cleanOpt = opt.replace(/[^0-9a-zA-Z$$\-:\/ ]/g, '');
                //let cleanOpt = opt.replace(/[^0-9a-zA-Z$$\-:\/ ]/g, '');
                let cleanOpt = opt;
                const option = document.createElement('option');
                if (cleanOpt.length === 0) {
                    option.hidden = true; // 关键：不在下拉列表中显示
                    option.disabled = true; // 防止被选中
                    cleanOpt = '(空)';
                }
                option.value = idx;
                option.textContent = cleanOpt;
                if (idx === param.value) option.selected = true;
                select.appendChild(option);
            });
            let userChanged = false;
            select.addEventListener('input', () => { userChanged = true; });
            select.onchange = () => {
                if (!userChanged) return; userChanged = false;
                const modeByte = 'TX' === window._lastRefreshMode ? 0x11 : 0x22;
                const arr = [0xA5, 0x33, modeByte, param.paramNum, Number(select.value), 0x0D, 0x0A];
                if (writer) writer.write(new Uint8Array(arr));
                if (!isInitialRender) {
                    setTimeout(() => autoRefresh(window._lastRefreshMode), 500);
                }
            };
            control.appendChild(select);
        } else if (param.baseType === 10) {
            // STRING
            const input = document.createElement('input');
            input.type = 'text';
            input.value = param.value;
            input.maxLength = param.strMaxLen || 32;
            input.style.width = '180px';
            input.style.minWidth = '180px';
            input.style.maxWidth = '180px';
            input.style.textAlign = 'right';
            let userChanged = false;
            input.addEventListener('input', () => { userChanged = true; });
            input.onchange = () => {
                if (!userChanged) return; userChanged = false;
                // 这里只打印，不自动刷新
            };
            control.appendChild(input);
        } else if (param.baseType === 13) {
            // COMMAND
            const btn = document.createElement('button');
            if (currentLang === 'zh') {
                btn.textContent = '启动';
            } else {
                btn.textContent = 'Start';
            }
            btn.setAttribute('data-i18n', 'Start');
            btn.style.minWidth = '130px';
            btn.style.maxWidth = '130px';
            btn.onclick = () => {
                const modeByte = 'TX' === window._lastRefreshMode ? 0x11 : 0x22;
                const arrStart = [0xA5, 0x33, modeByte, param.paramNum, 1, 0x0D, 0x0A];
                if (writer) writer.write(new Uint8Array(arrStart));
                // --- 弹窗与自动指令逻辑 ---
                let dialog = document.createElement('div');
                dialog.style.position = 'fixed';
                dialog.style.left = '0';
                dialog.style.top = '0';
                dialog.style.width = '100vw';
                dialog.style.height = '100vh';
                dialog.style.background = 'rgba(0,0,0,0.18)';
                dialog.style.display = 'flex';
                dialog.style.alignItems = 'center';
                dialog.style.justifyContent = 'center';
                dialog.style.zIndex = '9999';
                let inner = document.createElement('div');
                inner.style.background = '#fff';
                inner.style.borderRadius = '16px';
                inner.style.boxShadow = '0 4px 24px rgba(79,140,255,0.18)';
                inner.style.padding = '38px 48px 32px 48px';
                inner.style.display = 'flex';
                inner.style.flexDirection = 'column';
                inner.style.alignItems = 'center';
                inner.style.minWidth = '260px';
                inner.style.maxWidth = '90vw';
                inner.innerHTML = `<div style="font-size:1.18em;color:#3358e0;font-weight:bold;margin-bottom:18px;">${param.name || '命令操作'}</div>`;
                let msg = document.createElement('div');
                msg.style.fontSize = '1.08em';
                msg.style.color = '#222';
                msg.style.marginBottom = '18px';
                inner.appendChild(msg);
                let closeBtn = null;
                let timer = null;
                let poller = null;
                // 判断bind类
                const isBind = (param.name && /bind|对频|配对/i.test(param.name)) || (param.info && /bind|对频|配对/i.test(param.info));
                if (isBind) {
                    msg.textContent = currentLang === 'zh' ? '正在对频...' : 'Binding...';
                    document.body.appendChild(dialog);
                    dialog.appendChild(inner);
                    // 2秒后自动发送06并关闭
                    timer = setTimeout(() => {
                        const arrEnd = [0xA5, 0x33, modeByte, param.paramNum, 6, 0x0D, 0x0A];
                        if (writer) writer.write(new Uint8Array(arrEnd));
                        document.body.removeChild(dialog);
                    }, 2000);
                } else {
                    msg.textContent = currentLang === 'zh' ? '正在操作...' : 'Operating...';
                    closeBtn = document.createElement('button');
                    closeBtn.textContent = currentLang === 'zh' ? '结束' : 'End';
                    closeBtn.style.marginTop = '12px';
                    closeBtn.style.background = 'linear-gradient(90deg,#e74c3c 0%,#c0392b 100%)';
                    closeBtn.style.color = '#fff';
                    closeBtn.style.border = 'none';
                    closeBtn.style.borderRadius = '8px';
                    closeBtn.style.padding = '10px 32px';
                    closeBtn.style.fontSize = '1.08em';
                    closeBtn.style.fontWeight = 'bold';
                    closeBtn.style.cursor = 'pointer';
                    closeBtn.onclick = () => {
                        if (poller) clearInterval(poller);
                        const arrStop = [0xA5, 0x33, modeByte, param.paramNum, 5, 0x0D, 0x0A];
                        if (writer) writer.write(new Uint8Array(arrStop));
                        document.body.removeChild(dialog);
                    };
                    inner.appendChild(closeBtn);
                    document.body.appendChild(dialog);
                    dialog.appendChild(inner);
                    // 每1.5秒发送06
                    poller = setInterval(() => {
                        const arrPoll = [0xA5, 0x33, modeByte, param.paramNum, 6, 0x0D, 0x0A];
                        if (writer) writer.write(new Uint8Array(arrPoll));
                        console.log('持续类轮询发送POLL:', arrPoll.map(x => x.toString(16).padStart(2, '0')).join(' '));
                    }, 1500);
                }
            };
            control.appendChild(btn);
            if (param.info) {
                const infoSpan = document.createElement('span');
                infoSpan.textContent = param.info;
                infoSpan.style.marginLeft = '8px';
                control.appendChild(infoSpan);
            }
        } else if (param.baseType === 12) {
            const span = document.createElement('span');
            span.textContent = param.value;
            control.appendChild(span);
        } else {
            const span = document.createElement('span');
            span.textContent = param.value;
            control.appendChild(span);
        }
        item.appendChild(control);
        container.appendChild(item);
    });
}
*/
// ========== 页面切换到无线配置时自动刷新 ==========
const _orig_showMainPage = showMainPage;
showMainPage = function (page) {
    _orig_showMainPage.apply(this, arguments);
    if (page === 'net') {
        if (!window._netPageAutoRefreshed) {
            window._netPageAutoRefreshed = true;
            netConfBuffer = [];
            autoRefresh('TX');
        }
    }
    // 新增：切换到设备配置页面时渲染通道/trim/中心点
    if (page === 'config') {
        renderConfigPage();
    }
};

// 设备配置页面渲染函数
function renderConfigPage() {
    const configPage = document.getElementById('page-config');
    if (!configPage) return;
    // 操作模式定义
    const modeList = [
        { name: 'M1', map: ['ELE', 'RUD', 'THR', 'AIL'] },
        { name: 'M2', map: ['THR', 'RUD', 'ELE', 'AIL'] },
        { name: 'M3', map: ['ELE', 'AIL', 'THR', 'RUD'] },
        { name: 'M4', map: ['THR', 'AIL', 'ELE', 'RUD'] },
    ];
    let currentModeIdx = window._currentModeIdx || 0;

    function getModeMap(idx) {
        // 确保索引在有效范围内，默认返回第一个模式
        if (typeof idx !== 'number' || idx < 0 || idx >= modeList.length) {
            idx = 0;
        }
        return modeList[idx].map;
    }
    // 结构：左侧菜单+右侧栈式页面
    let html = `<div class="comm-container"><div class="comm-title" data-i18n="config-channel">通道配置</div>
        <div style="display:flex;gap:0;align-items:flex-start;">
          <div id="config-menu" style="display:flex;flex-direction:column;gap:0;width:180px;min-width:120px;background:#f4f8ff;border-radius:12px 0 0 12px;box-shadow:0 2px 8px #e0e7ff;overflow:hidden;">
            <button class="config-menu-btn active" data-page="channel" style="padding:18px 0;border:none;background:none;font-size:1.13em;color:#3358e0;font-weight:bold;cursor:pointer;transition:background 0.2s;" data-i18n="channel-monitor">通道监视器</button>
            <button class="config-menu-btn" data-page="channel-attr" style="padding:18px 0;border:none;background:none;font-size:1.13em;color:#3358e0;font-weight:bold;cursor:pointer;transition:background 0.2s;" data-i18n="channel-attr">通道属性</button>
            <button class="config-menu-btn" data-page="channel-map" style="padding:18px 0;border:none;background:none;font-size:1.13em;color:#3358e0;font-weight:bold;cursor:pointer;transition:background 0.2s;" data-i18n="channel-map">通道映射</button>
            <button class="config-menu-btn" data-page="trim-center" style="padding:18px 0;border:none;background:none;font-size:1.13em;color:#3358e0;font-weight:bold;cursor:pointer;transition:background 0.2s;" data-i18n="trim-center">Trim和Center</button>
            <button class="config-menu-btn" data-page="mode" style="padding:18px 0;border:none;background:none;font-size:1.13em;color:#3358e0;font-weight:bold;cursor:pointer;transition:background 0.2s;" data-i18n="mode">摇杆模式</button>
          </div>
          <div id="config-stack" style="flex:1 1 0;background:#fff;border-radius:0 12px 12px 0;box-shadow:0 2px 8px #e0e7ff;padding:32px 36px;min-height:900px;position:relative;">
            <div class="config-stack-page" data-page="channel-map" style="display:none;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="font-weight:bold;color:#3358e0;margin-bottom:8px;" data-i18n="channel-map-relation">通道映射关系</div>
                <div style="display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-bottom:8px;">
                    <label id="channel-confirm-label" style="color:#3358e0;font-weight:bold;font-size:1.13em;" data-i18n="channel-map-confirm-label">遥控器没有反应点击"映射保存"再次写入</label>
                    <button id="channel-map-confirm-btn" style="background:linear-gradient(90deg,#3358e0 0%,#4f8cff 100%);color:#fff;border:none;border-radius:8px;padding:8px 24px;font-size:1em;font-weight:bold;box-shadow:0 1px 4px #e0e7ff;cursor:pointer;" data-i18n="channel-map-confirm-btn">映射保存</button>
                    <button id="channel-map-restore-btn" style="background:linear-gradient(90deg,#aaa 0%,#e0e7ff 100%);color:#3358e0;border:none;border-radius:8px;padding:8px 24px;font-size:1em;font-weight:bold;box-shadow:0 1px 4px #e0e7ff;cursor:pointer;" data-i18n="channel-map-restore-btn">映射还原</button>
                </div>
              </div>
              <div style="overflow-x:auto;">
                <table style="border-collapse:separate;border-spacing:0 10px;width:100%;background:none;">
                  <thead>
                    <tr style="background:#f4f8ff;">
                      <th style="padding:10px 18px;color:#3358e0;font-weight:bold;font-size:1.08em;border-radius:10px 0 0 10px;">Channels</th>
                      <th style="padding:10px 18px;color:#3358e0;font-weight:bold;font-size:1.08em;" data-i18n="channel-map-default-output">默认输出</th>
                      <th style="padding:10px 18px;color:#3358e0;font-weight:bold;font-size:1.08em;border-radius:0 10px 10px 0;" data-i18n="channel-map-channel-input">通道输入</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${(() => {
            let html = '';
            //let mapData = channelMap.channelMapSend;
            const inputOptions = ['AIL', 'ELE', 'THR', 'RUD', 'SA', 'SB', 'SC', 'SD', 'SE', 'S1'];
            const nowInputOptions = ['AIL', 'ELE', 'THR', 'RUD', 'SE', 'SA', 'SB', 'SC', 'SD', 'S1'];  //目前默认是SE是CH5,但是下位机是SA作为CH5,下位机改代码,难度太高了,要改整个逻辑和映射表,这个只是显示,为什么啦,数据是对的,满足下位就好了
            for (let i = 0; i < 10; i++) {
                let chName = `Channel_${i + 1}`;
                let outName = '';
                let inSelect = '';
                //console.log('console.log-',i,"配置完成");
                if (i < 4) {
                    outName = nowInputOptions[i];
                    inSelect = '';
                } else {
                    outName = nowInputOptions[i];
                    inSelect = `<select id="ch-map-in2-${i}" style="font-size:1em;padding:4px 12px;border-radius:6px;border:1.5px solid #d0d7e6;">
                            ${inputOptions.map((opt, idx) => `<option value='${idx + 1}'${opt === inputOptions[i] ? ' selected' : ''}>${opt}</option>`).join('')}
                          </select>`;

                }
                html += `<tr style="background:#fff;box-shadow:0 1px 8px #e0e7ff;border-radius:10px;">
                          <td style="padding:10px 18px;text-align:center;font-weight:bold;color:#3358e0;font-size:1.08em;">${chName}</td>
                          <td style="padding:10px 18px;text-align:center;font-family:'Roboto',monospace;font-size:1.08em;">${outName}</td>
                          <td style="padding:10px 18px;text-align:center;">${inSelect}</td>
                        </tr>`;
            }
            return html;
        })()}
                  </tbody>
                </table>
              </div>
            </div>
            <div class="config-stack-page" data-page="channel" style="display:block;">
              <div style="font-weight:bold;color:#3358e0;margin-bottom:8px;" data-i18n="channel-monitor">通道监视器</div>
              <div style="display:flex;flex-direction:column;gap:18px;">
                ${(() => {
            let html = '';
            for (let i = 0; i < 10; i++) {//修改数据就是通道数量了,属性里面可以得到,为了防止出现数量不正常,目前就不考虑后续兼容性和扩展性了
                html += `<div style="display:flex;align-items:center;gap:32px;background:linear-gradient(90deg,#f4f8ff 60%,#eaf1ff 100%);border-radius:16px;padding:8px 18px;box-shadow:0 2px 16px #e0e7ff;min-height:32px;">
          <span style="color:#3358e0;font-weight:bold;font-size:1.25em;min-width:70px;letter-spacing:2px;">CH${i + 1}</span>
          <div style="flex:1;display:flex;align-items:center;gap:18px;">
            <div id="ch-bar-${i}" style="flex:1;height:22px;background:#e0e7ff;border-radius:12px;overflow:hidden;position:relative;box-shadow:0 1px 8px #b3cfff;">
              <div style="height:100%;background:linear-gradient(90deg,#4f8cff 0%,#3358e0 100%);width:${((1500 - 988) / (2012 - 988) * 100)}%;transition:width 0.05s;"></div>
              <div style="position:absolute;left:${((1500 - 988) / (2012 - 988) * 100)}%;top:0;bottom:0;width:3px;background:#e74c3c;opacity:0.7;"></div>
            </div>
            <span id="ch-val-${i}" style="font-family:'Roboto',monospace;font-size:1.35em;color:#222;background:#fff;border-radius:8px;padding:4px 18px;margin-left:8px;box-shadow:0 1px 4px #e0e7ff;min-width:4.5em;display:inline-block;text-align:center;">1500</span>
          </div>
        </div>`;
            }
            return html;
        })()}
              </div>
            </div>
            <div class="config-stack-page" data-page="channel-attr" style="display:none;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="font-weight:bold;color:#3358e0;margin-bottom:8px;" data-i18n="channel-attr">通道属性</div>
                <div style="display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-bottom:8px;">
                  <label id="channel-confirm-label" style="color:#3358e0;font-weight:bold;font-size:1.13em;" data-i18n="channel-attr-confirm-label">修改后点击"通道保存"即可写入</label>
                  <button id="channel-confirm-btn" style="background:linear-gradient(90deg,#3358e0 0%,#4f8cff 100%);color:#fff;border:none;border-radius:8px;padding:8px 24px;font-size:1em;font-weight:bold;box-shadow:0 1px 4px #e0e7ff;cursor:pointer;" data-i18n="channel-attr-confirm-btn">通道保存</button>
                  <button id="channel-restore-btn" style="background:linear-gradient(90deg,#aaa 0%,#e0e7ff 100%);color:#3358e0;border:none;border-radius:8px;padding:8px 24px;font-size:1em;font-weight:bold;box-shadow:0 1px 4px #e0e7ff;cursor:pointer;" data-i18n="channel-attr-restore-btn">通道还原</button>
                </div>
              </div>
              <div style="display:flex;flex-direction:column;gap:18px;">
                ${(() => {
            let html = '';
            for (let i = 0; i < 10; i++) {
                html += `<div style="display:flex;align-items:center;gap:32px;background:linear-gradient(90deg,#f4f8ff 60%,#eaf1ff 100%);border-radius:16px;padding:8px 18px;box-shadow:0 2px 16px #e0e7ff;min-height:32px;">
          <span style="color:#3358e0;font-weight:bold;font-size:1.25em;min-width:70px;letter-spacing:2px;">CH${i + 1}</span>
          <div style='display:flex;align-items:center;gap:24px;flex:1;'>
            <button id="ch-dir-btn-${i}" style="min-width:54px;padding:8px 18px;border-radius:10px;border:2px solid #b3cfff;background:#fff;color:#3358e0;font-weight:bold;cursor:pointer;font-size:1.08em;box-shadow:0 1px 6px #e0e7ff;transition:all 0.2s;">NOR</button>
            <span style='font-size:1.08em;color:#888;' data-i18n="channel-attr-negative-travel">负行程</span><input type="number" id="ch-left-input-${i}" value="0" min="0" max="100" style="width:90px;text-align:center;border:2px solid #b3cfff;border-radius:8px;font-size:1.08em;padding:6px 0;box-shadow:0 1px 6px #e0e7ff;" />
            <span style='font-size:1.08em;color:#888;' data-i18n="channel-attr-positive-travel">正行程</span><input type="number" id="ch-right-input-${i}" value="0" min="0" max="100" style="width:90px;text-align:center;border:2px solid #b3cfff;border-radius:8px;font-size:1.08em;padding:6px 0;box-shadow:0 1px 6px #e0e7ff;" />
            <div id="ch-bar-attr-${i}" style="flex:1;height:22px;background:#e0e7ff;border-radius:12px;overflow:hidden;position:relative;box-shadow:0 1px 8px #b3cfff;">
              <div style="height:100%;background:linear-gradient(90deg,#4f8cff 0%,#3358e0 100%);width:${((1500 - 988) / (2012 - 988) * 100)}%;transition:width 0.05s;"></div>
              <div style="position:absolute;left:${((1500 - 988) / (2012 - 988) * 100)}%;top:0;bottom:0;width:3px;background:#e74c3c;opacity:0.7;"></div>
            </div>  
          </div>
        </div>`;
            }
            return html;
        })()}
              </div>
            </div>
            <div class="config-stack-page" data-page="trim-center" style="display:none;">
              <div style="font-weight:bold;color:#3358e0;margin-bottom:8px;" data-i18n="trim-center-title">微调</div>
              <div style="display:flex;flex-direction:column;gap:18px;">
                ${(() => {
            let html = '';
            for (let i = 0; i < 4; i++) {
                const min = -130, max = 130, val = 0, percent = ((val - min) / (max - min)) * 100;
                html += `<div style="display:flex;align-items:center;gap:32px;background:linear-gradient(90deg,#eaf1ff 60%,#f4f8ff 100%);border-radius:16px;padding:8px 18px;box-shadow:0 2px 16px #e0e7ff;min-height:32px;flex-wrap:wrap;">
          <span style="color:#3358e0;font-weight:bold;font-size:1.18em;min-width:90px;">Trim${i + 1}</span>
          <div style="flex:1;display:flex;align-items:center;gap:24px;min-width:320px;position:relative;">
            <div id="trim-bar-${i}" class="progress-bar" style="width:260px;">
              <div class="bar-line"></div>
              <div id="trim-dot-${i}" class="progress-dot" style="background:#4f8cff;"></div>
              <div style="position:absolute;top:50%;left:50%;width:3px;height:26px;background:#e74c3c;border-radius:2px;z-index:3;transform:translate(-50%,-50%);"></div>
            </div>
            <span id="trim-val-${i}" style="font-family:'Roboto',monospace;font-size:1.18em;background:#fff;border-radius:8px;padding:4px 18px;box-shadow:0 1px 4px #e0e7ff;">0</span>
            <!-- Trim输入框已彻底隐藏，不渲染 -->
          </div>
          <button class="trim-clear-btn" data-type="trim" data-idx="${i}" style="margin-top:12px;background:linear-gradient(90deg,#e0e7ff 0%,#b3cfff 100%);color:#3358e0;border:none;border-radius:8px;padding:6px 24px;font-size:1em;font-weight:bold;box-shadow:0 1px 4px #e0e7ff;cursor:pointer;" data-i18n="trim-center-clear">清空</button>
        </div>`;
            }
            return html;
        })()}
              </div>
              <div style="font-weight:bold;color:#3358e0;margin:24px 0 8px 0;" data-i18n="Sub-trim-title">舵机中立点</div>
              <div style="display:flex;flex-direction:column;gap:18px;">
                ${(() => {
            let html = '';
            for (let i = 0; i < 4; i++) {
                const min = -100, max = 100, val = 0, percent = ((val - min) / (max - min)) * 100;
                html += `<div style="display:flex;align-items:center;gap:32px;background:linear-gradient(90deg,#f4f8ff 60%,#eaf1ff 100%);border-radius:16px;padding:8px 18px;box-shadow:0 2px 16px #e0e7ff;min-height:32px;flex-wrap:wrap;">
          <span style="color:#3358e0;font-weight:bold;font-size:1.18em;min-width:90px;">Sub Trim${i + 1}</span>
          <div style="flex:1;display:flex;align-items:center;gap:24px;min-width:320px;position:relative;">
            <div id="center-bar-${i}" class="progress-bar" style="width:260px;">
              <div class="bar-line"></div>
              <div id="center-dot-${i}" class="progress-dot" style="background:#2ecc71;"></div>
              <div style="position:absolute;top:50%;left:50%;width:3px;height:26px;background:#e74c3c;border-radius:2px;z-index:3;transform:translate(-50%,-50%);"></div>
            </div>
            <span id="center-val-${i}" style="font-family:'Roboto',monospace;font-size:1.18em;background:#fff;border-radius:8px;padding:4px 18px;box-shadow:0 1px 4px #e0e7ff;">0</span>
            <input type="number" id="center-input-${i}" value="0" min="-100" max="100" style="width:90px;text-align:center;border:2px solid #b3cfff;border-radius:8px;font-size:1.08em;padding:6px 0;box-shadow:0 1px 6px #e0e7ff;" />
          </div>
          <button class="trim-clear-btn" data-type="center" data-idx="${i}" style="margin-top:12px;background:linear-gradient(90deg,#e0e7ff 0%,#b3cfff 100%);color:#3358e0;border:none;border-radius:8px;padding:6px 24px;font-size:1em;font-weight:bold;box-shadow:0 1px 4px #e0e7ff;cursor:pointer;" data-i18n="trim-center-clear">清空</button>
        </div>`;
            }
            return html;
        })()}
              </div>
            </div>
            <div class="config-stack-page" data-page="mode" style="display:none;">
              <div style="margin:18px 0 24px 0;display:flex;align-items:center;gap:24px;">
                <label style="font-weight:bold;color:#3358e0;font-size:1.13em;" data-i18n="mode-title">摇杆模式：</label>
                <select id="mode-select" style="font-size:1.13em;padding:8px 18px;border-radius:8px;border:1.5px solid #d0d7e6;">
                  ${modeList.map((m, i) => `<option value="${i}"${i === currentModeIdx ? ' selected' : ''}>${m.name}</option>`).join('')}
                </select>
              </div>
              <div style="margin-top:48px;display:flex;gap:80px;justify-content:center;">
                <div style="display:flex;flex-direction:column;align-items:center;">
                  <div style="font-weight:bold;color:#3358e0;margin-bottom:16px;font-size:1.22em;" data-i18n="mode-left-stick">左手摇杆</div>
                  <canvas id="cross-left" width="426" height="426" style="background:#f4f8ff;border-radius:22px;box-shadow:0 2px 16px #e0e7ff;"></canvas>
                </div>
                <div style="display:flex;flex-direction:column;align-items:center;">
                  <div style="font-weight:bold;color:#3358e0;margin-bottom:16px;font-size:1.22em;" data-i18n="mode-right-stick">右手摇杆</div>
                  <canvas id="cross-right" width="426" height="426" style="background:#f4f8ff;border-radius:22px;box-shadow:0 2px 16px #e0e7ff;"></canvas>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    configPage.innerHTML = html;
    // 菜单切换逻辑
    setTimeout(() => {
        const btns = document.querySelectorAll('.config-menu-btn');
        const pages = document.querySelectorAll('.config-stack-page');
        btns.forEach(btn => {
            btn.onclick = function () {
                console.log("btn:", btn.dataset.page);

                //按键刷新Tirm和Center事件
                if (btn.dataset.page === 'trim-center') {
                    setTimeout(() => {
                        if (window.channelMap) {
                            // 获取当前的adcMap
                            for (let i = 0; i < 4; i++) {
                                let uiIdx = i;//adcMap[i];
                                // 更新Trim
                                const trimValSpan = document.getElementById(`trim-val-${uiIdx}`);
                                if (trimValSpan) trimValSpan.textContent = window.channelMap.channelTrimSend[i];
                                const trimDot = document.getElementById(`trim-dot-${uiIdx}`);
                                const trimBar = document.getElementById(`trim-bar-${uiIdx}`);
                                if (trimBar && trimDot) {
                                    let percent = (window.channelMap.channelTrimSend[i] + 130) / 260;
                                    let left = percent * (trimBar.offsetWidth - trimDot.offsetWidth);
                                    trimDot.style.left = left + 'px';
                                }

                                const centerValSpan = document.getElementById(`center-val-${uiIdx}`);
                                if (centerValSpan) centerValSpan.textContent = document.getElementById(`center-input-${uiIdx}`).value;//window.channelMap.channelMidSend[i]*100/512;
                                const centerDot = document.getElementById(`center-dot-${uiIdx}`);
                                const centerBar = document.getElementById(`center-bar-${uiIdx}`);
                                if (centerBar && centerDot) {
                                    let percent = (window.channelMap.channelMidSend[i] * 100 / 512 + 100) / 200;
                                    let left = percent * (centerBar.offsetWidth - centerDot.offsetWidth);
                                    centerDot.style.left = left + 'px';
                                }
                            }
                        }
                    }, 0);
                }

                //通道映射刷新事件
                if (btn.dataset.page === 'channel-map') {
                    //const inputOptions = ['AIL','ELE','THR','RUD','SA','SB','SC','SD','SE','S1'];
                    for (let i = 4; i < 10; i++) {
                        const sel = document.getElementById(`ch-map-in2-${i}`);
                        if (sel) {
                            //console.log('sel:',sel.value);          
                            sel.value = window.channelMap.channelMapSend[i];
                        };
                    }
                }

                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const page = btn.dataset.page;
                pages.forEach(p => {
                    p.style.display = (p.dataset.page === page) ? 'block' : 'none';
                });
            };
        });
        // 初始显示第一个
        pages.forEach(p => {
            p.style.display = (p.dataset.page === 'channel') ? 'block' : 'none';
        });


        // 操作模式页面的摇杆绘制和下拉事件
        const drawModePage = () => {
            // 确保 _currentModeIdx 已初始化
            if (typeof window._currentModeIdx !== 'number' || window._currentModeIdx < 0 || window._currentModeIdx >= modeList.length) {
                window._currentModeIdx = 0;
            }

            const left = document.getElementById('cross-left');
            const right = document.getElementById('cross-right');
            if (left && right) {
                drawCross(left, getModeMap(window._currentModeIdx), 1);
                drawCross(right, getModeMap(window._currentModeIdx), 0);
            }
            const sel = document.getElementById('mode-select');
            if (sel) {
                // 记录上一次的选择值，防止初始化和重复选择时发送
                let lastModeIdx = window._currentModeIdx;
                sel.onchange = function () {
                    const newIdx = parseInt(sel.value);
                    if (newIdx !== lastModeIdx) {
                        window._currentModeIdx = newIdx;
                        drawCross(left, getModeMap(window._currentModeIdx), 1);
                        drawCross(right, getModeMap(window._currentModeIdx), 0);
                        // 只在用户实际更改时发送
                        let modeVal = window._currentModeIdx + 1;
                        if (typeof writer !== 'undefined' && writer) {
                            writer.write(new Uint8Array([0xA5, 0x55, 0x10, modeVal, 0x0D, 0x0A]));
                        }
                        lastModeIdx = newIdx;
                    } else {
                        // 仅重绘，不发送
                        window._currentModeIdx = newIdx;
                        drawCross(left, getModeMap(window._currentModeIdx), 1);
                        drawCross(right, getModeMap(window._currentModeIdx), 0);
                    }
                };
            }
        };
        // 监听菜单切换到操作模式时绘制摇杆
        btns.forEach(btn => {
            btn.addEventListener('click', function () {
                if (btn.dataset.page === 'mode') setTimeout(drawModePage, 0);
            });
        });


        // 初始绘制
        setTimeout(drawModePage, 0);
        // --- 通道属性页面事件绑定 ---
        setTimeout(() => {
            for (let i = 0; i < 10; i++) {
                const btn = document.getElementById(`ch-dir-btn-${i}`);
                if (btn) {
                    btn.onclick = function () {
                        if (!window.channelMap) return;
                        window.channelMap.channelDirSend[i] = window.channelMap.channelDirSend[i] ? 0 : 1;
                        btn.textContent = window.channelMap.channelDirSend[i] ? 'REV' : 'NOR';
                        btn.style.background = window.channelMap.channelDirSend[i] ? '#ffe066' : '#fff';
                        btn.style.color = window.channelMap.channelDirSend[i] ? '#e74c3c' : '#3358e0';
                    };
                    // 初始化按钮状态
                    if (window.channelMap && window.channelMap.channelDirSend[i]) {
                        btn.textContent = 'REV';
                        btn.style.background = '#ffe066';
                        btn.style.color = '#e74c3c';
                    } else {
                        btn.textContent = 'NOR';
                        btn.style.background = '#fff';
                        btn.style.color = '#3358e0';
                    }
                }

                // 左右行程输入框
                const leftInput = document.getElementById(`ch-left-input-${i}`);
                const rightInput = document.getElementById(`ch-right-input-${i}`);
                if (leftInput) {
                    leftInput.onchange = function () {
                        let v = Math.max(0, Math.min(100, parseInt(leftInput.value) || 0));
                        leftInput.value = v;
                        if (window.channelMap && window.channelMap.channelLeftSend) {
                            window.channelMap.channelLeftSend[i] = 100 - v;
                        }
                    };
                    // 初始化
                    if (window.channelMap && window.channelMap.channelLeftSend) {
                        leftInput.value = 100 - (window.channelMap.channelLeftSend[i] || 0);
                    }
                }
                if (rightInput) {
                    rightInput.onchange = function () {
                        let v = Math.max(0, Math.min(100, parseInt(rightInput.value) || 0));
                        rightInput.value = v;
                        if (window.channelMap && window.channelMap.channelRightSend) {
                            window.channelMap.channelRightSend[i] = 100 - v;
                        }
                    };
                    // 初始化
                    if (window.channelMap && window.channelMap.channelRightSend) {
                        rightInput.value = 100 - (window.channelMap.channelRightSend[i] || 0);
                    }
                }
            }

            // 通道确认按钮事件
            const confirmBtn = document.getElementById('channel-confirm-btn');
            if (confirmBtn) {
                confirmBtn.onclick = function () {
                    if (!window.channelMap) { alert('通道数据未加载'); return; }
                    // 组包
                    let tmpData = new Uint8Array(56 + 2);
                    tmpData[0] = 0xA5;
                    tmpData[1] = 0x55;
                    tmpData[2] = 0x0C;
                    tmpData[3] = 52; // 有效数据长度
                    // 映射
                    let map = window.channelMap.channelMapSend || Array.from({ length: 16 }, (_, i) => i + 1);
                    for (let i = 0; i < 16; i++) tmpData[4 + i] = map[i] || 0;
                    // 正反
                    let dir = window.channelMap.channelDirSend || Array(16).fill(0);
                    let tmpData1 = 0;
                    for (let i = 0; i < 16; i++) if (dir[i]) tmpData1 |= (1 << i);
                    tmpData[20] = (tmpData1 >> 8) & 0xFF;
                    tmpData[21] = tmpData1 & 0xFF;
                    // 左右行程
                    let left = window.channelMap.channelLeftSend || Array(16).fill(0);
                    let right = window.channelMap.channelRightSend || Array(16).fill(0);
                    for (let i = 0; i < 16; i++) tmpData[22 + i] = left[i] || 0;
                    for (let i = 0; i < 16; i++) tmpData[38 + i] = right[i] || 0;
                    // 模式
                    let mode = (typeof window._currentModeIdx === 'number' ? window._currentModeIdx + 1 : 1);
                    if (mode < 1) mode = 1; if (mode > 4) mode = 4;
                    tmpData[54] = mode;
                    // CRC
                    tmpData[55] = crc8tab_js(tmpData.slice(3, 55), 52);
                    tmpData[56] = 0x0D;
                    tmpData[57] = 0x0A;
                    // 发送
                    if (typeof writer !== 'undefined' && writer) {
                        writer.write(tmpData);
                        confirmBtn.textContent = LANGS[currentLang]['send-success'];//'已发送';
                        setTimeout(() => { confirmBtn.textContent = LANGS[currentLang]['channel-confirm']; }, 1200);
                    } else {
                        alert('串口未连接');
                    }
                };
            }

            // 通道还原按钮事件
            const restoreBtn = document.getElementById('channel-restore-btn');
            if (restoreBtn) {
                restoreBtn.onclick = function () {
                    if (!window.channelMap) { alert('通道数据未加载'); return; }
                    // 还原正反
                    window.channelMap.channelDirSend = Array(16).fill(0);
                    // 还原行程
                    window.channelMap.channelLeftSend = Array(16).fill(0);
                    window.channelMap.channelRightSend = Array(16).fill(0);
                    // 刷新UI
                    for (let i = 0; i < 10; i++) {
                        // 正反按钮
                        const btn = document.getElementById(`ch-dir-btn-${i}`);
                        if (btn) {
                            btn.textContent = 'NOR';
                            btn.style.background = '#fff';
                            btn.style.color = '#3358e0';
                        }
                        // 左右行程输入框
                        const leftInput = document.getElementById(`ch-left-input-${i}`);
                        const rightInput = document.getElementById(`ch-right-input-${i}`);
                        if (leftInput) leftInput.value = 100;
                        if (rightInput) rightInput.value = 100;
                    }
                    if (confirmBtn) {
                        confirmBtn.click(); // 触发确认按钮
                    }
                };
            }

            //map按键确认事件
            const confirmMapBtn = document.getElementById('channel-map-confirm-btn');
            if (confirmMapBtn) {
                confirmMapBtn.onclick = function () {
                    if (!window.channelMap) { alert('通道数据未加载'); return; }
                    // 组包
                    let tmpData = new Uint8Array(56 + 2);
                    tmpData[0] = 0xA5;
                    tmpData[1] = 0x55;
                    tmpData[2] = 0x0C;
                    tmpData[3] = 52; // 有效数据长度
                    // 映射
                    let map = window.channelMap.channelMapSend || Array.from({ length: 16 }, (_, i) => i + 1);
                    for (let i = 0; i < 16; i++) tmpData[4 + i] = map[i] || 0;
                    // 正反
                    let dir = window.channelMap.channelDirSend || Array(16).fill(0);
                    let tmpData1 = 0;
                    for (let i = 0; i < 16; i++) if (dir[i]) tmpData1 |= (1 << i);
                    tmpData[20] = (tmpData1 >> 8) & 0xFF;
                    tmpData[21] = tmpData1 & 0xFF;
                    // 左右行程
                    let left = window.channelMap.channelLeftSend || Array(16).fill(0);
                    let right = window.channelMap.channelRightSend || Array(16).fill(0);
                    for (let i = 0; i < 16; i++) tmpData[22 + i] = left[i] || 0;
                    for (let i = 0; i < 16; i++) tmpData[38 + i] = right[i] || 0;
                    // 模式
                    let mode = (typeof window._currentModeIdx === 'number' ? window._currentModeIdx + 1 : 1);
                    if (mode < 1) mode = 1; if (mode > 4) mode = 4;
                    tmpData[54] = mode;
                    // CRC
                    tmpData[55] = crc8tab_js(tmpData.slice(3, 55), 52);
                    tmpData[56] = 0x0D;
                    tmpData[57] = 0x0A;
                    // 发送
                    if (typeof writer !== 'undefined' && writer) {
                        writer.write(tmpData);
                        confirmMapBtn.textContent = LANGS[currentLang]['send-success'];//'已发送';
                        setTimeout(() => { confirmMapBtn.textContent = LANGS[currentLang]['channel-confirm']; }, 1200);
                    } else {
                        alert('串口未连接');
                    }
                }
            }

            //map通道数据还原事件
            const restoreMapBtn = document.getElementById('channel-map-restore-btn');
            if (restoreMapBtn) {
                restoreMapBtn.onclick = function () {
                    if (!window.channelMap) { alert('通道数据未加载'); return; }
                    let dataTmp = [9, 5, 6, 7, 8, 10];
                    if (window.channelMap.channelMapSend) {
                        window.channelMap.channelMapSend.splice(4, 10, ...dataTmp);
                    }
                    for (let i = 4; i < 10; i++) {
                        const sel = document.getElementById(`ch-map-in2-${i}`);
                        if (sel) {
                            //console.log('sel:',sel.value);          
                            sel.value = window.channelMap.channelMapSend[i];
                        };
                    }
                    if (confirmMapBtn) {
                        confirmMapBtn.click(); // 触发确认按钮
                    }
                }
            }
        }, 0);


    }, 0);

    // 在renderConfigPage渲染后添加如下JS逻辑，确保圆点始终居中在线段上
    setTimeout(() => {
        for (let i = 0; i < 4; i++) {
            // Trim
            const trimBar = document.getElementById(`trim-bar-${i}`);
            const trimDot = document.getElementById(`trim-dot-${i}`);
            const trimValSpan = document.getElementById(`trim-val-${i}`);
            let trimVal = 0;
            if (trimValSpan) trimVal = parseInt(trimValSpan.textContent) || 0;
            if (trimBar && trimDot) {
                let percent = (trimVal + 130) / 260; // 0~1，范�?130�?30
                let left = percent * (trimBar.offsetWidth - trimDot.offsetWidth);
                trimDot.style.left = left + 'px';
            }
            // Center
            const centerBar = document.getElementById(`center-bar-${i}`);
            const centerDot = document.getElementById(`center-dot-${i}`);
            const centerInput = document.getElementById(`center-input-${i}`);
            const centerValSpan = document.getElementById(`center-val-${i}`);
            let centerVal = 0;
            if (centerInput) centerVal = parseInt(centerInput.value) || 0;
            if (centerBar && centerDot) {
                let percent = (centerVal + 100) / 200; // 0~1，范�?100�?00
                let left = percent * (centerBar.offsetWidth - centerDot.offsetWidth);
                centerDot.style.left = left + 'px';
            }
            if (centerInput && centerValSpan && centerBar && centerDot) {
                // oninput只做UI和全局同步
                centerInput.oninput = function () {
                    let v = parseInt(centerInput.value) || 0;
                    if (v < -100) v = -100;
                    if (v > 100) v = 100;
                    centerInput.value = v;
                    centerValSpan.textContent = v;
                    let percent = (v + 100) / 200;
                    let left = percent * (centerBar.offsetWidth - centerDot.offsetWidth);
                    centerDot.style.left = left + 'px';
                    if (!window._center) window._center = [0, 0, 0, 0];
                    window._center[i] = v;
                };
                // 只有回车或失去焦点时才发送
                centerInput.onchange = function () {
                    let v = parseInt(centerInput.value) || 0;
                    if (v < -100) v = -100;
                    if (v > 100) v = 100;
                    centerInput.value = v;
                    if (!window._center) window._center = [0, 0, 0, 0];
                    window._center[i] = v;
                    if (typeof sendCenterCommand === 'function') {
                        sendCenterCommand(window._center);
                    }
                };
                centerInput.onkeydown = function (e) {
                    if (e.key === 'Enter') {
                        let v = parseInt(centerInput.value) || 0;
                        if (v < -100) v = -100;
                        if (v > 100) v = 100;
                        centerInput.value = v;
                        if (!window._center) window._center = [0, 0, 0, 0];
                        window._center[i] = v;
                        if (typeof sendCenterCommand === 'function') {
                            sendCenterCommand(window._center);
                        }
                    }
                };
            }
        }
        // 清空按钮联动
        document.querySelectorAll('.trim-clear-btn').forEach(btn => {
            btn.onclick = function () {
                const type = btn.getAttribute('data-type');
                const idx = btn.getAttribute('data-idx');
                if (type === 'trim') {
                    // 归零
                    const valSpan = document.getElementById(`trim-val-${idx}`);
                    const dot = document.getElementById(`trim-dot-${idx}`);
                    const bar = document.getElementById(`trim-bar-${idx}`);
                    if (valSpan) valSpan.textContent = 0;
                    if (bar && dot) {
                        let percent = (0 + 130) / 260;
                        let left = percent * (bar.offsetWidth - dot.offsetWidth);
                        dot.style.left = left + 'px';
                    }
                    if (window.channelMap) {
                        //console.log('idx:', idx);
                        window.channelMap.channelTrimSend[idx] = 0;
                    }
                    let data = new Uint8Array(3 + 8 + 2);
                    data[0] = 0xA5;
                    data[1] = 0x55;
                    data[2] = 0x0F;
                    for (let i = 0; i < 4; i++) {
                        val = window.channelMap.channelTrimSend ? window.channelMap.channelTrimSend[i] : 0;
                        data[3 + i * 2] = val & 0xFF;
                        data[3 + i * 2 + 1] = (val >> 8) & 0xFF;
                    }
                    data[11] = 0x0D;
                    data[12] = 0x0A;
                    const cmd = new Uint8Array(data);
                    if (writer) writer.write(cmd);
                    //console.log('cmd:', cmd);
                } else if (type === 'center') {
                    const valSpan = document.getElementById(`center-val-${idx}`);
                    const dot = document.getElementById(`center-dot-${idx}`);
                    const input = document.getElementById(`center-input-${idx}`);
                    const bar = document.getElementById(`center-bar-${idx}`);
                    if (valSpan) valSpan.textContent = 0;
                    if (input) input.value = 0;
                    if (bar && dot) {
                        let percent = (0 + 100) / 200;
                        let left = percent * (bar.offsetWidth - dot.offsetWidth);
                        dot.style.left = left + 'px';
                    }
                    // --- 新增：同步全局center并发送 ---
                    if (!window._center) window._center = [0, 0, 0, 0];
                    window._center[idx] = 0;
                    if (typeof sendCenterCommand === 'function') {
                        sendCenterCommand(window._center);
                    }
                }
            };
        });
    }, 0);


    updateAllLangText();
}

// 连接成功后自动发送设备属性指令，失败重试3次，否则显示按钮
let _autoDevAttrTries = 0;
let _autoDevAttrMaxTries = 3;
let _autoDevAttrTimer = null;
async function autoSendDevAttr() {
    //console.log('[ATTR] 自动发送设备属性指令');
    if (!writer) return;
    if (_autoDevAttrTries >= _autoDevAttrMaxTries) return;
    _autoDevAttrTries++;
    const devAttrCmd = new Uint8Array([0xA5, 0x55, 0x1D, 0x0D, 0x0A]);
    await writer.write(devAttrCmd);
    // 等待2秒，如果window._deviceInfo还没被赋值则重试
    _autoDevAttrTimer = setTimeout(() => {
        if (!window._deviceInfo && _autoDevAttrTries < _autoDevAttrMaxTries) {
            autoSendDevAttr();
        } else if (!window._deviceInfo && _autoDevAttrTries >= _autoDevAttrMaxTries) {
            // 失败，显示按钮
            //renderDeviceInfoPage();
        }
    }, 2000);
}


// 连接成功后自动触发
function onSerialConnected() {
    _autoDevAttrTries = 0;
    if (_autoDevAttrTimer) clearTimeout(_autoDevAttrTimer);
    window._deviceInfo = undefined;
    autoSendDevAttr();
}



// ========== 设备配置页面通道映射自动请求与刷新 ========== //
let _channelMapTries = 0;
let _channelMapMaxTries = 3;
let _channelMapTimer = null;
let _channelMapSuccess = false;
let _channelMapRefreshBtn = null;
let _hasRequestedTrimAndMid = false;
let _hasTrimAndMid = false;
let _origChannelTimer = null;
function showChannelMapRefreshBtn() {
    if (!_channelMapRefreshBtn) {
        _channelMapRefreshBtn = document.createElement('button');
        _channelMapRefreshBtn.textContent = '重新刷新通道映射';
        _channelMapRefreshBtn.style.background = 'linear-gradient(90deg,#4f8cff 0%,#3358e0 100%)';
        _channelMapRefreshBtn.style.color = '#fff';
        _channelMapRefreshBtn.style.border = 'none';
        _channelMapRefreshBtn.style.borderRadius = '8px';
        _channelMapRefreshBtn.style.padding = '10px 32px';
        _channelMapRefreshBtn.style.fontSize = '1.08em';
        _channelMapRefreshBtn.style.fontWeight = 'bold';
        _channelMapRefreshBtn.style.cursor = 'pointer';
        _channelMapRefreshBtn.style.margin = '18px auto';
        _channelMapRefreshBtn.onclick = () => {
            _channelMapTries = 0;
            _channelMapSuccess = false;
            _hasRequestedTrimAndMid = false;
            _hasTrimAndMid = false;
            _channelMapRefreshBtn.style.display = 'none';
            requestChannelMap();
        };
        const configPage = document.getElementById('page-config');
        if (configPage) configPage.appendChild(_channelMapRefreshBtn);
    }
    _channelMapRefreshBtn.style.display = '';
}
function hideChannelMapRefreshBtn() {
    if (_channelMapRefreshBtn) _channelMapRefreshBtn.style.display = 'none';
}
async function requestChannelMap() {
    if (!writer) return;
    if (_channelMapSuccess) return;
    if (_channelMapTries >= _channelMapMaxTries) {
        showChannelMapRefreshBtn();
        return;
    }
    _channelMapTries++;
    // 发送请求
    const buf = new Uint8Array([0xA5, 0x55, 0x0D, 0, 0, 0x0D, 0x0A]);
    await writer.write(buf);
    // 2秒后检查是否成功
    _channelMapTimer = setTimeout(() => {
        if (!_channelMapSuccess) requestChannelMap();
    }, 2000);
}
// 进入设备配置页面时自动请求
const _orig_showMainPage2 = showMainPage;
showMainPage = function (page) {
    _orig_showMainPage2.apply(this, arguments);
    if (page === 'config') {
        _channelMapTries = 0;
        _channelMapSuccess = false;
        _hasRequestedTrimAndMid = false;
        _hasTrimAndMid = false;
        hideChannelMapRefreshBtn();
        requestChannelMap();
        // 停止原始通道定时器
        if (_origChannelTimer) { clearInterval(_origChannelTimer); _origChannelTimer = null; }
    } else {
        // 离开页面时停止原始通道定时器
        if (_origChannelTimer) { clearInterval(_origChannelTimer); _origChannelTimer = null; }
    }
};
// ========== 0x44包解析，自动切换操作模式 ========== //
// 新增全局标志，控制trim/center指令发送
let _waitingForTrimAndMid = false;
function tryParseChannelMapPacket(buf) {
    //console.log('tryParseChannelMapPacket Running', buf);
    if (!buf || buf.length < 3) return false;
    if (buf[0] !== 0x44) return false;
    const len = buf[1];
    if (buf.length < len + 2) return false;
    const crc = buf[len + 1];
    // CRC8校验
    const calcCrc = crc8tab_js(buf.slice(2, 2 + len - 1), len - 1);
    if (crc !== calcCrc) return false;
    // 构造channelMap对象
    channelMap = {
        channelMapNum: buf[52],
        ctlModeRecv: buf[53],
        channelMapRecv: Array.from(buf.slice(2, 18)),
        channelMapSend: Array.from(buf.slice(2, 18)),
        channelLeftRecv: Array.from(buf.slice(18, 34)),
        channelLeftSend: Array.from(buf.slice(18, 34)),
        channelRightRecv: Array.from(buf.slice(34, 50)),
        channelRightSend: Array.from(buf.slice(34, 50)),
        channelDirRecv: [],
        channelDirSend: [],
        channelMidRecv: [0, 0, 0, 0],
        channelMidSend: [0, 0, 0, 0],
        channelTrimRecv: [0, 0, 0, 0],
        channelTrimSend: [0, 0, 0, 0]
    };
    // channelDirRecv: 16位bit
    let dirWord = buf[50] | (buf[51] << 8);
    for (let i = 0; i < 16; i++) {
        channelMap.channelDirRecv[i] = (dirWord & (1 << i)) ? 1 : 0;
        channelMap.channelDirSend[i] = channelMap.channelDirRecv[i];
    }
    // 页面center/trim全设为0
    for (let i = 0; i < 4; i++) {
        let centerInput = document.getElementById(`center-input-${i}`);
        let centerValSpan = document.getElementById(`center-val-${i}`);
        if (centerInput) centerInput.value = 0;
        if (centerValSpan) centerValSpan.textContent = 0;
        let centerDot = document.getElementById(`center-dot-${i}`);
        let centerBar = document.getElementById(`center-bar-${i}`);
        if (centerDot && centerBar) {
            let percent = (0 + 100) / 200; // 0值时的百分比
            let left = percent * (centerBar.offsetWidth - centerDot.offsetWidth);
            centerDot.style.left = left + 'px';
        }
        let trimInput = document.getElementById(`trim-input-${i}`);
        let trimValSpan = document.getElementById(`trim-val-${i}`);
        if (trimInput) trimInput.value = 0;
        if (trimValSpan) trimValSpan.textContent = 0;
        let trimDot = document.getElementById(`trim-dot-${i}`);
        let trimBar = document.getElementById(`trim-bar-${i}`);
        if (trimDot && trimBar) {
            let percent = (0 + 130) / 260; // 0值时的百分比
            let left = percent * (trimBar.offsetWidth - trimDot.offsetWidth);
            trimDot.style.left = left + 'px';
        }

    }
    window.channelMap = channelMap;
    console.log('channelMap:', channelMap);
    //console.log('tryParseChannelMapPacket Running over');
    // 自动切换操作模式
    if (typeof channelMap.ctlModeRecv === 'number') {
        let modeIdx = 1; // 默认M2
        if (channelMap.ctlModeRecv === 1) modeIdx = 0;
        else if (channelMap.ctlModeRecv === 2) modeIdx = 1;
        else if (channelMap.ctlModeRecv === 3) modeIdx = 2;
        else if (channelMap.ctlModeRecv === 4) modeIdx = 3;
        window._currentModeIdx = modeIdx;
        // 切换下拉框
        setTimeout(() => {
            const sel = document.getElementById('mode-select');
            if (sel) sel.value = modeIdx;
            // 触发一次change以刷新UI
            if (sel) sel.dispatchEvent(new Event('change'));
        }, 0);
    }
    // 只在收到0x44包后再发0x12包（避免并发/粘包问题）
    if (typeof writer !== 'undefined' && writer && !_waitingForTrimAndMid) {
        _waitingForTrimAndMid = true;
        const cmd = new Uint8Array([0xA5, 0x55, 0x1F, 0x0D, 0x0A]);
        writer.write(cmd);
        console.log('已发送获取trim和中心点指令: [0xA5,0x55,0x1F,0x0D,0x0A]');
    }
    // 设备配置页面流程切换
    if (typeof window._onConfigMapReceived === 'function') {
        window._onConfigMapReceived();
        window._onConfigMapReceived = null;
    }
    if (typeof window._onCalibMapReceived === 'function') {
        window._onCalibMapReceived();
        window._onCalibMapReceived = null;
    }
    return channelMap;
}
// 在tryParseTrimAndMidPacket里收到包后，重置标志
function tryParseTrimAndMidPacket(buf) {
    //console.log('tryParseTrimAndMidPacket Running', buf);
    if (!buf || buf.length < 3) return false;
    if (buf[0] !== 0x12) return false;
    const len = buf[1];
    if (buf.length < len + 2 || len < 10) return false;
    const crc = buf[len + 1];
    const calcCrc = crc8tab_js(buf.slice(2, 2 + len - 1), len - 1);
    if (crc !== calcCrc) return false;
    // 解析中立点
    let channelMidRecv = [], channelMidSend = [], channelTrimRecv = [], channelTrimSend = [];
    for (let i = 0; i < 4; i++) {
        let off = 2 + i * 2;
        let val = buf[off] | (buf[off + 1] << 8);
        if (val & 0x8000) val = val - 0x10000;
        channelMidRecv[i] = val;
        channelMidSend[i] = val;
        let centerVal = Math.round(val * 100 / 512);
        let centerInput = document.getElementById(`center-input-${i}`);
        let centerValSpan = document.getElementById(`center-val-${i}`);
        if (centerInput) centerInput.value = centerVal;
        if (centerValSpan) centerValSpan.textContent = centerVal;
        let centerDot = document.getElementById(`center-dot-${i}`);
        let centerBar = document.getElementById(`center-bar-${i}`);
        if (centerDot && centerBar) {
            let percent = (centerVal + 100) / 200; // center范围-100�?00
            let left = percent * (centerBar.offsetWidth - centerDot.offsetWidth);
            centerDot.style.left = left + 'px';
        }
    }
    // 解析trim
    for (let i = 0; i < 4; i++) {
        let off = 2 + 8 + i * 2;
        let val = buf[off] | (buf[off + 1] << 8);
        if (val & 0x8000) val = val - 0x10000;
        channelTrimRecv[i] = val;
        channelTrimSend[i] = val;
        let trimInput = document.getElementById(`trim-input-${i}`);
        let trimValSpan = document.getElementById(`trim-val-${i}`);
        if (trimInput) trimInput.value = val;
        if (trimValSpan) trimValSpan.textContent = val;
        let trimDot = document.getElementById(`trim-dot-${i}`);
        let trimBar = document.getElementById(`trim-bar-${i}`);
        if (trimDot && trimBar) {
            let percent = (val + 130) / 260; // trim范围-130�?30
            let left = percent * (trimBar.offsetWidth - trimDot.offsetWidth);
            trimDot.style.left = left + 'px';
        }


    }
    // 全局唯一：直接赋值到window.channelMap
    if (window.channelMap) {
        window.channelMap.channelMidRecv = channelMidRecv;
        window.channelMap.channelMidSend = channelMidSend;
        window.channelMap.channelTrimSend = channelTrimSend;
        window.channelMap.channelTrimRecv = channelTrimRecv;
    }


    // 移除window.trimMidObj = trimMidObj;
    console.log('trimMidObj:', { channelMidRecv, channelMidSend, channelTrimRecv, channelTrimSend });
    _hasTrimAndMid = true;
    // 收到trim/center包后，允许下次0x44包再发0x12
    _waitingForTrimAndMid = false;
    // 启动原始通道数据定时器（只启动一次）
    // if (!_origChannelTimer && typeof writer !== 'undefined' && writer &&
    //   document.getElementById('page-config') &&
    //   document.getElementById('page-config').style.display !== 'none'
    // ) {
    //   _origChannelTimer = setInterval(() => {
    //     writer.write(new Uint8Array([0xA5,0x55,0x02,0x0D,0x0A]));
    //   }, 20);
    //   window._pageTasks.intervals.push(_origChannelTimer); // 统一管理
    //   console.log('已启动原始通道数据定时器，每20ms发送一次[0xA5,0x55,0x02,0x0D,0x0A]');
    // }
    // 设备配置页面流程切换
    if (typeof window._onConfigTrimReceived === 'function') {
        window._onConfigTrimReceived();
        window._onConfigTrimReceived = null;
    }
    return { channelMidRecv, channelMidSend, channelTrimRecv, channelTrimSend };
}

//进度弹窗
function showProgressModal() {
    if (isProcessing === false) {
        const modal = document.getElementById('progressModal');
        modal.classList.add('active');

        // 绑定关闭按钮事件
        const closeBtn = document.getElementById('progressCloseBtn');
        closeBtn.onclick = () => {
            // 调用关闭函数，传入用户主动关闭的原因
            closeProgressModal('用户手动取消');
            refreshSettings();
        };
        // // 启动20秒超时关闭
        // progressTimer = setTimeout(() => {
        //   closeProgressModal('超时未完成');
        // }, 20 * 1000);

        // 模拟监听 rxLuaStats 变化（实际需替换为你的数据更新逻辑，比如串口回调、状态轮询等）
        // 示例：假设 rxLuaStats 是全局变量，每秒更新一次
        progressInterval = setInterval(() => {
            if (typeof rxLuaStats !== 'undefined') {
                updateProgress(rxLuaStats);
            }
        }, 200);

        isProcessing = true;
    }
}

/**
 * 更新进度
 * @param {number} percent - 进度值（0-100）
 */
function updateProgress(percent) {
    const bar = document.getElementById('progressBar');
    const status = document.getElementById('progressStatus');

    // 限制进度范围
    percent = Math.min(100, Math.max(0, percent));
    bar.style.width = `${percent}%`;
    status.textContent = LANGS[currentLang]['progressStatus-Text'] + `${percent}%`;

    // 进度达到100%，自动关闭
    if (percent >= 100) {
        closeProgressModal('操作完成');
    }
}

/**
 * 关闭弹窗
 * @param {string} message - 提示信息（可选）
 */
function closeProgressModal(message) {
    document.getElementById('progressModal').classList.remove('active');

    isProcessing = false;
    // 清除定时器
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null; // 重置为null，避免残留引用
    }
    // 操作完成
    //document.getElementById('settings-status').textContent = '操作完成';
    // 3. 清除超时定时器（如果有的话）
    if (progressTimer) {
        clearTimeout(progressTimer);
        progressTimer = null;
    }

    // 可选：提示结果（如需用户感知）
    if (message) {
        console.log(message); // 或用更友好的Toast提示
    }

    // 恢复页面交互（如需）
    document.body.style.overflow = '';
}





// 解析0x22包，显示原始通道数据
function tryParseOrigChannelPacket(buf) {
    //console.log('tryParseOrigChannelPacket Running', buf);
    if (!buf || buf.length < 3) return false;
    if (buf[0] !== 0x22) return false;
    const len = buf[1];
    if (buf.length < len + 2) return false;
    const crc = buf[len + 1];
    const calcCrc = crc8tab_js(buf.slice(2, 2 + len - 1), len - 1);
    if (crc !== calcCrc) return false;
    // 解析原始通道数据
    let recvChannel = [];
    for (let i = 0; i < 10; i++) {
        let off = 8 + i * 2;
        let val = buf[off] | (buf[off + 1] << 8);
        recvChannel[i] = val;
    }
    // ========== 新增：通道数据处理算法 ==========
    let channlMinRoute = 988;
    let channlMaxRoute = 2012;
    let channlMidRoute = 1500;
    let processedCH = new Array(10);
    // 获取映射、反向、行程、中心点、Trim参数
    let channelMapSend = (window.channelMap && window.channelMap.channelMapSend) ? window.channelMap.channelMapSend : Array.from({ length: 10 }, (_, i) => i + 1);
    let channelDirSend = (window.channelMap && window.channelMap.channelDirSend) ? window.channelMap.channelDirSend : Array(10).fill(0);
    let routeLeft = (window.channelMap && window.channelMap.channelLeftSend) ? window.channelMap.channelLeftSend : Array(10).fill(0);
    let routeRight = (window.channelMap && window.channelMap.channelRightSend) ? window.channelMap.channelRightSend : Array(10).fill(0);
    let centerVal = (window.channelMap && window.channelMap.channelMidSend) ? window.channelMap.channelMidSend : Array(4).fill(0);
    let trimVal = (window.channelMap && window.channelMap.channelTrimSend) ? window.channelMap.channelTrimSend : Array(4).fill(0);
    // 1. 先中心点+行程，再Trim，再映射，最后反向
    let tmpRouteData = new Array(10);
    for (let i = 0; i < 10; i++) {
        tmpRouteData[i] = recvChannel[window.channelMap.channelMapSend[i] - 1];
    }

    for (let i = 0; i < 10; i++) {
        // 先中心点+行程
        let raw = tmpRouteData[i];
        let midOffset = (i < 4) ? (centerVal[window.channelMap.channelMapSend[i] - 1] || 0) : 0;
        let leftPercent = routeLeft[i] || 0;
        let rightPercent = routeRight[i] || 0;
        if (raw >= channlMidRoute) {
            tmpRouteData[i] = ((raw - channlMidRoute) * (channlMaxRoute - channlMidRoute - midOffset) / (channlMaxRoute - channlMidRoute)) * (100 - rightPercent) / 100 + channlMidRoute + midOffset;
        } else {
            tmpRouteData[i] = (-1 * (channlMidRoute - raw) * (channlMidRoute + midOffset - channlMinRoute) / (channlMidRoute - channlMinRoute)) * (100 - leftPercent) / 100 + channlMidRoute + midOffset;
        }
        // 再Trim（仅前4个）
        if (i < 4) {
            let handOffset = trimVal[window.channelMap.channelMapSend[i] - 1] || 0;
            if (handOffset > 0) {
                if (tmpRouteData[i] + handOffset > channlMaxRoute) {
                    tmpRouteData[i] = channlMaxRoute;
                } else {
                    tmpRouteData[i] = tmpRouteData[i] + handOffset;
                }
            } else if (handOffset < 0) {
                if (tmpRouteData[i] + handOffset < channlMinRoute) {
                    tmpRouteData[i] = channlMinRoute;
                } else {
                    tmpRouteData[i] = tmpRouteData[i] + handOffset;
                }
            }
        }
    }
    // // 再映射
    // let mappedCH = new Array(10);
    // for (let i = 0; i < 10; i++) {
    //   //let srcIdx = (channelMapSend[i] || (i+1)) - 1;
    //   mappedCH[i] = tmpRouteData[i];
    // }
    // 最后反向
    for (let i = 0; i < 10; i++) {
        if (channelDirSend[i]) {
            processedCH[i] = 2 * channlMidRoute - tmpRouteData[i];
        } else {
            processedCH[i] = tmpRouteData[i];
        }
        // 边界保护
        if (processedCH[i] > channlMaxRoute) processedCH[i] = channlMaxRoute;
        if (processedCH[i] < channlMinRoute) processedCH[i] = channlMinRoute;
    }
    // ========== 用处理后的数据显示到页面 ==========
    if (processedCH[0] !== 0) {
        for (let i = 0; i < 10; i++) {
            let chVal = document.getElementById(`ch-val-${i}`);
            let chInput = document.getElementById(`ch-input-${i}`);
            if (chVal) chVal.textContent = Math.round(processedCH[i]);
            if (chInput) chInput.value = Math.round(processedCH[i]);
            let bar = document.getElementById(`ch-bar-${i}`)?.children[0];
            if (bar) bar.style.width = ((processedCH[i] - 988) / (2012 - 988) * 100) + '%';
            let barAttr = document.getElementById(`ch-bar-attr-${i}`)?.children[0];
            if (barAttr) barAttr.style.width = ((processedCH[i] - 988) / (2012 - 988) * 100) + '%';
        }
    }
    window.origChannelData = recvChannel;
    // 新增：保存最新原始包
    window._lastOrigChannelBuf = buf;
    //console.log('原始通道数据:', recvChannel);
    return true;
}



// 在serialBuffer推入数据后，尝试判定0x44/0x12/0x22包并移除数据
const _orig_serialBufferPush = Array.prototype.push;
Array.prototype.push = function (...args) {
    //console.log('serialBuffer.push called', args, this);
    const ret = _orig_serialBufferPush.apply(this, args);
    let found;
    do {
        found = false;
        for (let i = 0; i < this.length - 2; i++) {
            // 检查0x44包
            if (window._currentPage !== 'net') {
                if (this[i] === 0x44) {
                    const len = this[i + 1];
                    if (this.length >= i + len + 2 && len > 0) {
                        const buf = this.slice(i, i + len + 2);
                        if (tryParseChannelMapPacket(buf)) {
                            _channelMapSuccess = true;
                            hideChannelMapRefreshBtn();
                            if (_channelMapTimer) clearTimeout(_channelMapTimer);
                            this.splice(i, len + 2);
                            found = true;
                            break;
                        }
                    }
                }


                if (this[i] === 0x11) {
                    const len = this[i + 1];
                    if (this.length >= i + len + 2 && len > 0) {
                        const buf = this.slice(i, i + len + 2);
                        if (parseDeviceStats(buf)) {
                            this.splice(i, len + 2);
                            found = true;
                            break;
                        }
                    }
                }


                // 检查0x12包
                if (this[i] === 0x12) {
                    const len = this[i + 1];
                    if (this.length >= i + len + 2 && len > 0) {
                        const buf = this.slice(i, i + len + 2);
                        if (tryParseTrimAndMidPacket(buf)) {
                            console.log('[DEBUG] 0x12包解析成功，准备移除');
                            this.splice(i, len + 2);
                            found = true;
                            break;
                        }
                    }
                }


                // 检查0x22包
                if (this[i] === 0x22) {
                    const len = this[i + 1];
                    if (this.length >= i + len + 2 && len > 0) {
                        const buf = this.slice(i, i + len + 2);
                        let parsed = tryParseOrigChannelPacket(buf);
                        // 新增：校准页面同步解析
                        //console.log('window._currentPage1:', window._currentPage);
                        if (window._currentPage === 'calib' && typeof tryParseOrigChannelPacketCalib === 'function') {
                            //console.log('window._currentPage2:', window._currentPage);
                            tryParseOrigChannelPacketCalib(buf);
                        }
                        // else
                        // {
                        // }
                        if (parsed) {
                            this.splice(i, len + 2);
                            found = true;
                            break;
                        }
                    }
                }


                // 检查0x33包
                if (this[i] === 0x33) {
                    const len = this[i + 1];
                    if (this.length >= i + len + 2 && len > 0) {
                        const buf = this.slice(i, i + len + 2);
                        let parsed = false;
                        if (window._currentPage === 'calib' && typeof tryParseAdcPacketCalib === 'function') {
                            parsed = tryParseAdcPacketCalib(buf);
                        }
                        if (parsed) {
                            this.splice(i, len + 2);
                            found = true;
                            break;
                        }
                    }
                }


                // 检查0x34包
                if (this[i] === 0x34) {
                    //console.log('[校准] 收到0x34包');
                    const len = this[i + 1];
                    if (this.length >= i + len + 2 && len > 0) {
                        const buf = this.slice(i, i + len + 2);
                        let parsed = false;
                        if (window._currentPage === 'calib' && typeof tryParseMidAdcPacketCalib === 'function') {
                            console.log('[校准] tryParseMidAdcPacketCalib Running');
                            parsed = tryParseMidAdcPacketCalib(buf);
                        }
                        if (parsed) {
                            this.splice(i, len + 2);
                            found = true;
                            break;
                        }
                    }
                }


                // 检查0x45包
                if (this[i] === 0x45) {
                    //console.log('[校准] 收到0x45包');
                    //console.log('this[i]:',this[i]);
                    const len = this[i + 1];
                    if (this.length >= i + len + 2 && len > 0) {
                        const buf = this.slice(i, i + len + 2);
                        //console.log('buf',buf);
                        let parsed = false;
                        //if (window._currentPage === 'net' && 
                        if (typeof tryNetError === 'function') {
                            //console.log('[识别到没有ELRS固件] tryNetError Running');
                            parsed = tryNetError(buf);
                        }
                        if (parsed) {
                            this.splice(i, len + 2);
                            found = true;
                            break;
                        }
                    }
                }


                // 在Array.prototype.push代理中添加：
                if (this[i] === 0x55) {
                    const len = this[i + 1];
                    if (this.length >= i + len + 2 && len > 0) {
                        const buf = this.slice(i, i + len + 2);
                        let parsed = false;
                        if (typeof tryParseTrimPacket === 'function') {
                            parsed = tryParseTrimPacket(buf);
                        }
                        if (parsed) {
                            this.splice(i, len + 2);
                            found = true;
                            break;
                        }
                    }
                }


                if (this[i] === 0xFF) {
                    const len = this[i + 1];
                    if (this.length >= i + len + 2) {
                        const buf = this.slice(i, i + len + 2);
                        let parsed = false;
                    }
                    if (this.length >= i + len + 2 && len > 0) {
                        // 只处理一次完整包
                        const buf = new Uint8Array(this.slice(i, i + len + 2));
                        const devInfo = parseDeviceInfoPacket(buf);
                        if (devInfo) {
                            console.log('[Device Properties] Received original packet:' + this.slice(i, i + len + 2).map(x => x.toString(16).padStart(2, '0')).join(' '));
                            window._deviceInfo = devInfo;
                            renderDeviceInfoPage();
                            if (window._waitingDevAttr) clearTimeout(window._waitingDevAttr);
                            console.log('[设备属性] 解析并渲染完成');
                            this.splice(i, len + 2);
                        } else {
                            //console.warn('[设备属性] 解析失败');
                        }
                    }
                }
                // 检查0x67包  link强度
                if (this[i] === 0x67) {
                    //console.log('[校准] 收到0x45包');
                    //console.log('this[i]:',this[i]);
                    const len = this[i + 1];
                    if (this.length >= i + len + 2 && len > 0) {
                        const buf = this.slice(i, i + len + 2);
                        //console.log('buf',buf);
                        let parsed = false;
                        //if (window._currentPage === 'net' && 
                        if (typeof linkStats === 'function') {
                            //console.log('[识别到没有ELRS固件] tryNetError Running');
                            parsed = linkStats(buf);
                        }
                        if (parsed) {
                            this.splice(i, len + 2);
                            found = true;
                            console.log("信号强度:", g_linkState);
                            break;
                        }
                    }
                }
            }
            else {

                // 检查0x67包  link强度
                if (this[i] === 0x67) {
                    //console.log('[校准] 收到0x45包');
                    //console.log('this[i]:',this[i]);
                    const len = this[i + 1];
                    if (this.length >= i + len + 2 && len > 0) {
                        const buf = this.slice(i, i + len + 2);
                        //console.log('buf',buf);
                        let parsed = false;
                        //if (window._currentPage === 'net' && 
                        if (typeof linkStats === 'function') {
                            //console.log('[识别到没有ELRS固件] tryNetError Running');
                            parsed = linkStats(buf);
                        }
                        if (parsed) {
                            this.splice(i, len + 2);
                            found = true;
                            console.log("信号强度:", g_linkState);
                            break;
                        }
                    }
                }

                // 进度条
                if (this[i] === 0x23) {
                    const len = this[i + 1];
                    if (this.length >= i + len + 2 && len > 0) {
                        let parsed = false;
                        const buf = this.slice(i, i + len + 2);
                        if (window._currentPage === 'net' && typeof tryParseNetProgress === 'function') {
                            parsed = tryParseNetProgress(buf);
                            if (parsed) {
                                this.splice(i, len + 2);
                                found = true;
                                if (buf[3] == 2) {

                                    rxLuaStats = buf[2];
                                    document.getElementById('settings-status-rx').textContent = rxLuaStats;
                                    //弹窗提示
                                    showProgressModal();

                                }
                                else if (buf[3] == 1) {
                                    txLuaStats = buf[2];
                                    document.getElementById('settings-status').textContent = txLuaStats;
                                }
                                else if (buf[3] == 3) {
                                    closeProgressModal("数据异常");
                                    //console.log('数据异常:'+buf);
                                }
                                else {
                                    console.log('未知异常:' + buf);
                                }
                                //console.log('进程:%d 所属:%d',buf[2],buf[3]);
                                break;
                            }
                        }
                    }
                }
            }

        }

    } while (found);
    return ret;
};

// ========== 进入页面时自动管理原始通道数据定时器 ==========
const _orig_showMainPage3 = showMainPage;
showMainPage = function (page) {
    _orig_showMainPage3.apply(this, arguments);
    // 设备配置、设备校准页面如需持续获取，由各自页面逻辑重新开启
    // 串口通信页面不自动开启定时器

};

// ========== 各页面初始化函数 ==========
function initCommPage() {
    // 通信页面无需持续任务
    //updateSignalStrength(2);
    linkSacn();
    serialBuffer = [];
    window._globalChannelTask = null;
    stopGlobalChannelTimer();
    updateAllLangText();
}
function initAttrPage() {
    // 设备属性页面：自动渲染
    //updateSignalStrength(2);
    serialBuffer = [];
    setTimeout(() => {
        linkSacn();
    }, 200);
    setTimeout(() => {
        const devAttrCmd = new Uint8Array([0xA5, 0x55, 0x1D, 0x0D, 0x0A]);
        writer.write(devAttrCmd);
    }, 200);
    setTimeout(() => {
        renderDeviceInfoPage();
        window._globalChannelTask = null;
        stopGlobalChannelTimer();
        //console.log('initAttrPage');
        updateAllLangText();
    }, 200);
    // renderDeviceInfoPage();
    // window._globalChannelTask = null;
    // stopGlobalChannelTimer();
    // //console.log('initAttrPage');
    // updateAllLangText();
}

function initConfigPage() {
    linkSacn();
    serialBuffer = [];
    renderConfigPage();
    let state = { step: 0, gotMap: false, gotTrim: false };
    // step: 0=等待map, 1=等待trim/center, 2=通道数据
    function sendMapLoop() {
        if (window._currentPage !== 'config' || state.gotMap) return;
        console.log('[配置] 发送map包');
        writer.write(new Uint8Array([0xA5, 0x55, 0x0D, 0, 0, 0x0D, 0x0A]));
        setTimeout(sendMapLoop, 500);
    }
    function sendTrimLoop() {
        if (window._currentPage !== 'config' || !state.gotMap || state.gotTrim) return;
        console.log('[配置] 发送trim/center包');
        writer.write(new Uint8Array([0xA5, 0x55, 0x1F, 0x0D, 0x0A]));
        setTimeout(sendTrimLoop, 500);
    }
    // 只要没收到包就无线循环
    sendMapLoop();
    // 解析到map包时切换到trim/center
    window._onConfigMapReceived = function () {
        if (window._currentPage === 'config' && !state.gotMap) {
            state.gotMap = true;
            console.log('[配置] 收到map包，切换到trim/center');
            sendTrimLoop();
        }
    };
    // 解析到trim/center包时切换到通道数据
    window._onConfigTrimReceived = function () {
        if (window._currentPage === 'config' && state.gotMap && !state.gotTrim) {
            state.gotTrim = true;
            console.log('[配置] 收到trim/center包，开始连续通道数据');
        }
    };
    window._globalChannelTask = {
        channelRequest: () => {
            if (state.gotMap && state.gotTrim) {
                writer.write(new Uint8Array([0xA5, 0x55, 0x02, 0x0D, 0x0A])); // 通道数据
            }
        },
        commandRequest: () => { }
    };
    // 通道映射保存时索引+1
    setTimeout(() => {
        for (let i = 4; i < 10; i++) {
            const sel = document.getElementById(`ch-map-in2-${i}`);
            //console.log('设置完成',sel);  
            if (sel) {
                //console.log('设置完成');
                sel.onchange = function () {
                    console.log('通道映射已更改', sel.value);
                    if (window.channelMap && window.channelMap.channelMapSend) {
                        window.channelMap.channelMapSend[i] = Number(sel.value); //               console.log(`通道映射已更�? CH${i+1} -> ${sel.value}`);
                        // 立即发送通道确认指令
                        //sendChannelConfirm();两者指令一致
                        const confirmBtn = document.getElementById('channel-confirm-btn');
                        if (confirmBtn) {
                            confirmBtn.click(); // 触发确认按钮
                        }
                    }
                };
            }
        }
    }, 0);

    startTimers(window._globalChannelTask);
    updateAllLangText();
}
function initNetPage() {
    linkSacn();
    serialBuffer = [];
    if (typeof refreshSettings === 'function') {
        refreshSettings();
    }
    wifiToggleBtn();
    window._globalChannelTask = null;
    stopGlobalChannelTimer();
    updateAllLangText();
}
function initCalibPage() {
    linkSacn();
    serialBuffer = [];
    //document.body.style.zoom = 1;
    let state = { step: 0, gotMap: false, calibState: 'idle' };
    function sendMapLoop() {
        if (window._currentPage !== 'calib' || state.gotMap) return;
        console.log('[校准] 发送map包');
        writer.write(new Uint8Array([0xA5, 0x55, 0x0D, 0, 0, 0x0D, 0x0A]));
        setTimeout(sendMapLoop, 500);
    }
    sendMapLoop();
    window._onCalibMapReceived = function () {
        if (window._currentPage === 'calib' && !state.gotMap) {
            state.gotMap = true;
            console.log('[校准] 收到map包，切换到通道数据');
        }
    };

    window._globalChannelTask = {
        channelRequest: () => {
            if (state.gotMap && state.calibState === 'idle') {
                writer.write(new Uint8Array([0xA5, 0x55, 0x02, 0x0D, 0x0A])); // 通道数据
            }
        },
        commandRequest: () => { }
    };
    startTimers(window._globalChannelTask);
    updateAllLangText();

}
// function initFwPage() {
//   serialBuffer= [];
//   window._globalChannelTask = null;
//   stopGlobalChannelTimer();
// }
//const _orig_initFwPage = typeof initFwPage === 'function' ? initFwPage : null;
function initFwPage() {
    serialBuffer = [];
    window._globalChannelTask = null;
    stopGlobalChannelTimer();
    //if (_orig_initFwPage) _orig_initFwPage();
    if (fwUpdateBtn) {
        fwUpdateBtn.disabled = true; // 进入页面时立即禁用
        console.log('[FW] 进入固件更新页面，禁用确认更新按钮');
    }
    setTimeout(() => { if (fwUpdateBtn) fwUpdateBtn.disabled = true; }, 0); // 再加一层保险
    // 进入页面时定时发送两次0x31
    if (fwSend31Timer) clearInterval(fwSend31Timer);
    fwSend31Count = 0;
    fwSend31Timer = setInterval(async () => {
        if (writer && fwSend31Count < 2) {
            try {
                //console.log('[FW] 定时器已发送0x31，第' + fwSend31Count + '次');
                await writer.write(new Uint8Array([0x33]));
                fwSend31Count++;
                console.log('[FW] 定时器已发送0x31，第' + fwSend31Count + '次');
                if (fwSend31Count >= 2) {
                    clearInterval(fwSend31Timer);
                    fwSend31Timer = null;
                    console.log('[FW] 已发送2次0x31，停止定时器');
                }
            } catch (e) {
                fwStatus.textContent = '发送0x31失败：' + e.message;
                console.log('[FW] 发送0x31失败：' + e.message);
                clearInterval(fwSend31Timer);
                fwSend31Timer = null;
            }
        } else if (!writer) {
            fwStatus.textContent = '请先连接串口！';
            console.log('[FW] 未连接串口，无法发送0x31');
            clearInterval(fwSend31Timer);
            fwSend31Timer = null;
        }
    }, 1000);
    startFwReadyCheck();
    updateFwUI();
    updateAllLangText();
}


function sendChannelConfirm() {

}

// 设备属性页面渲染
function renderDeviceInfoPage() {
    const dev = window._deviceInfo;
    const attrPage = document.getElementById('page-attr');
    if (!attrPage) return;
    let html = '<div class="comm-container" style="display:flex;justify-content:center;align-items:center;min-height:calc(100vh - 64px);background:linear-gradient(135deg,#e0e7ff 0%,#f4f6fb 100%);">';
    html += '<div style="background:#fff;border-radius:22px;box-shadow:0 8px 36px rgba(79,140,255,0.15);padding:48px 60px 40px 60px;min-width:380px;max-width:520px;width:100%;display:flex;flex-direction:column;align-items:center;">';
    html += '<div class="comm-title" data-i18n="attr-title" style="margin-bottom:32px;display:flex;align-items:center;gap:16px;background:linear-gradient(135deg,#f8fafc 0%,#e2e8f0 100%);padding:20px 32px;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.1);border:2px solid #3b82f6;">';
    html += '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.1));"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#1e40af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    html += '<span style="color:#1e40af;font-size:1.4em;font-weight:700;text-shadow:0 1px 2px rgba(255,255,255,0.8);">设备属性</span>';
    html += '</div>';
    html += `<div style="margin: 24px 0 0 0; text-align: right;">
        <button id="factory-reset-btn" data-i18n="factory-reset" style="background: linear-gradient(90deg,#e74c3c 0%,#c0392b 100%); color: #fff; border: none; border-radius: 8px; padding: 10px 32px; font-size: 1.08em; font-weight: bold; cursor: pointer;">恢复出厂设置!</button>
        <button id="exit-fw-update-btn" data-i18n="exit-fw-update" style="background: linear-gradient(90deg,#3498db 0%,#2980b9 100%); color: #fff; border: none; border-radius: 8px; padding: 10px 32px; font-size: 1.08em; font-weight: bold; cursor: pointer; margin-left: 16px;">退出固件更新</button>
      </div>`;
    // 顺序：单击(6), 双击(2), 三态(4), 双态(1)
    const keymodeOptions = [
        [6, 3, 2, 0], // SA
        [0, 0, 4, 1], // SB
        [0, 0, 4, 1], // SC
        [6, 3, 2, 0], // SD
        [0, 0, 0, 1], // SE
    ];
    const keyNames = ['SA', 'SB', 'SC', 'SD', 'SE'];
    const keymodeLabels = {
        6: { text: '触发', i18n: 'keymode-trigger' },
        3: { text: '单击', i18n: 'keymode-single' },
        2: { text: '双击', i18n: 'keymode-double' },
        4: { text: '三态', i18n: 'keymode-triple' },
        1: { text: '双态', i18n: 'keymode-doubleStatus' }
    };
    html += `
        <div style="margin-top:32px;width:100%;">
          <div data-i18n="keymode-title" style="color:#3358e0;font-weight:bold;font-size:1.13em;margin-bottom:10px;">按键模式设置</div>
          <div id="keymode-selectors" style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:12px;">
          ${keyNames.map((k, i) => `
            <div style="display:flex;flex-direction:column;align-items:center;">
              <span style="margin-bottom:6px;">${k}</span>
              <select id="keymode-${k}" class="keymode-select">
                ${keymodeOptions[i].map(type =>
        type ? `<option value="${type}" data-i18n="${keymodeLabels[type].i18n}">${keymodeLabels[type].text}</option>` : ''
    ).join('')}
              </select>
            </div>
          `).join('')}
          </div>
      </div>`;
    // 查询按钮
    html += '<button id="query-device-attr-btn" class="connect-btn" data-i18n="query-device-attr" style="margin-bottom:18px;">查询设备属性</button>';
    if (!dev) {
        html += '<div data-i18n="no-device-info">未获取到设备信息。</div></div></div>';
        attrPage.innerHTML = html;
        // 绑定查询按钮事件
        const queryBtn = document.getElementById('query-device-attr-btn');
        if (queryBtn) {
            queryBtn.onclick = async function () {
                if (!writer) { alert(LANGS[currentLang]['connect-port-desc']); return; }
                const devAttrCmd = new Uint8Array([0xA5, 0x55, 0x1D, 0x0D, 0x0A]);
                await writer.write(devAttrCmd);
                queryBtn.disabled = true;
                queryBtn.textContent = LANGS[currentLang]['query-device-attr-loading'];
                setTimeout(() => {
                    queryBtn.disabled = false;
                    queryBtn.textContent = LANGS[currentLang]['query-device-attr'];
                }, 2000);
            };
        }
        const exitFwUpdateBtn = document.getElementById('exit-fw-update-btn');
        if (exitFwUpdateBtn) {
            exitFwUpdateBtn.onclick = function () {
                if (typeof writer !== 'undefined' && writer) {
                    writer.write(new Uint8Array([0x34]));
                    alert(LANGS[currentLang]['exit-fw-update']);
                    console.log('[ATTR] 已发送退出固件更新指令');
                }
            };
        }
        return;
    }
    // 序列号连续数字显示
    let serialNumStr = '';
    if (dev.serialNumber) {
        const arr = typeof dev.serialNumber === 'string' ? Array.from(dev.serialNumber).map(c => c.charCodeAt(0)) : Array.from(dev.serialNumber);
        serialNumStr = arr.map(b => b.toString(16).padStart(2, '0')).join('');
        // 去除末尾的00
        serialNumStr = serialNumStr.replace(/(00)+$/, '');
    }
    html += `<div style="width:100%;display:flex;flex-direction:column;gap:18px;">
        <div class="setting-row">
          <span class="setting-label" data-i18n="volume">音量</span>
          <input id="volume-range"  min="0" max="25" value="${dev.devVolume}" type="range" ...>
          <div class="setting-right">
            <span id="volume-value" class="setting-value">${dev.devVolume * 4}</span>
          </div>
        </div>
        <div class="setting-row">
          <span class="setting-label" data-i18n="slide_mid">旋钮中点提示</span>
          <input id="slide_mid-range"  min="1000" max="8000" value="${dev.slideMidData}" type="range" ...>
          <div class="setting-right">
            <span id="slide_mid-value" class="setting-value">${dev.slideMidData}</span>
            <input type="checkbox" id="slide_mid" value="${dev.slideMid}">
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:18px;justify-content:space-between;background:#eaf1ff;border-radius:12px;padding:12px 18px;">
          <span style="color:#3358e0;font-weight:500;min-width:90px;" data-i18n="serial-warning-test">关闭接收机即将丢失警告</span>
          <input type="checkbox" id="check_warning" value="${dev.RxWarning}">
        </div>
        <div style="display:flex;align-items:center;gap:18px;justify-content:space-between;background:#eaf1ff;border-radius:12px;padding:12px 18px;">
          <span style="color:#3358e0;font-weight:500;min-width:90px;" data-i18n="lowpower-warning-test">电量过低警告</span>
          <input type="checkbox" id="check_lowpower" value="${dev.LowPowerWarning}">
        </div>
        <div style="display:flex;align-items:center;gap:18px;justify-content:space-between;background:#eaf1ff;border-radius:12px;padding:12px 18px;">
          <span style="color:#3358e0;font-weight:500;min-width:90px;" data-i18n="trim-left-reset-test">左Trim复位功能</span>
          <input type="checkbox" id="check_left_trim_reset" value="${dev.LeftTrimReset}">
        </div>
        <div style="display:flex;align-items:center;gap:18px;justify-content:space-between;background:#eaf1ff;border-radius:12px;padding:12px 18px;">
          <span style="color:#3358e0;font-weight:500;min-width:90px;" data-i18n="trim-right-reset-test">右边Trim复位功能</span>
          <input type="checkbox" id="check_right_trim_reset" value="${dev.RightTrimReset}">
        </div>
        <div style="display:flex;align-items:center;gap:18px;justify-content:space-between;background:#eaf1ff;border-radius:12px;padding:12px 18px;">
          <span style="color:#3358e0;font-weight:500;min-width:90px;" data-i18n="serial-number">序列号</span>
          <span style="font-family:'Roboto',monospace;font-size:1.08em;letter-spacing:2px;">${serialNumStr}</span>
        </div>
        <div style="display:flex;align-items:center;gap:18px;justify-content:space-between;background:#f4f8ff;border-radius:12px;padding:12px 18px;">
          <span style="color:#3358e0;font-weight:500;min-width:90px;" data-i18n="elrs-firmware-version">高频头固件版本</span>
          <span style="font-family:'Roboto',monospace;font-size:1.08em;">${dev.elrsFirmWare}</span>
        </div>
        <div style="display:flex;align-items:center;gap:18px;justify-content:space-between;background:#eaf1ff;border-radius:12px;padding:12px 18px;">
          <span style="color:#3358e0;font-weight:500;min-width:90px;" data-i18n="device-firmware-version">设备固件版本</span>
          <span style="font-family:'Roboto',monospace;font-size:1.08em;">${dev.deviceFirmWare}</span>
        </div>
        <div style="display:flex;align-items:center;gap:18px;justify-content:space-between;background:#f4f8ff;border-radius:12px;padding:12px 18px;">
          <span style="color:#3358e0;font-weight:500;min-width:90px;" data-i18n="elrs-name">ELRS名字</span>
          <span style="font-family:'Roboto',monospace;font-size:1.08em;">${dev.elrsName}</span>
        </div>
        <div style="display:flex;align-items:center;gap:18px;justify-content:space-between;background:#eaf1ff;border-radius:12px;padding:12px 18px;">
          <span style="color:#3358e0;font-weight:500;min-width:90px;" data-i18n="company-name">公司名字</span>
          <span style="font-family:'Roboto',monospace;font-size:1.08em;">${dev.companyName}</span>
        </div>
        <div style="display:flex;align-items:center;gap:18px;justify-content:space-between;background:#f4f8ff;border-radius:12px;padding:12px 18px;">
          <span style="color:#3358e0;font-weight:500;min-width:90px;" data-i18n="device-name">设备名字</span>
          <span style="font-family:'Roboto',monospace;font-size:1.08em;">${dev.devName}</span>
        </div>
      </div>`;
    // </div>   设备参数,不显示
    //   <div style="margin-top:32px;width:100%;">
    //     <div style="color:#3358e0;font-weight:bold;font-size:1.13em;margin-bottom:10px;" data-i18n="remote-param">遥控参数</div>
    //     <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
    //       <div style="background:#f4f8ff;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
    //         <span style="color:#3358e0;" data-i18n="send-pack-speed">发送包速率</span><span style="font-family:'Roboto',monospace;">${dev.sendPackSpeed}</span>
    //       </div>
    //       <div style="background:#eaf1ff;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
    //         <span style="color:#3358e0;" data-i18n="return-speed">返回速率</span><span style="font-family:'Roboto',monospace;">${dev.returnSpeed}</span>
    //       </div>
    //       <div style="background:#f4f8ff;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
    //         <span style="color:#3358e0;" data-i18n="calibration-flag">校准标志</span><span style="font-family:'Roboto',monospace;">${dev.calibrationFlag}</span>
    //       </div>
    //       <div style="background:#eaf1ff;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
    //         <span style="color:#3358e0;" data-i18n="connect-protocol">连接协议</span><span style="font-family:'Roboto',monospace;">${dev.connectProtocol}</span>
    //       </div>
    //       <div style="background:#f4f8ff;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
    //         <span style="color:#3358e0;"data-i18n="channel-num">通道数</span><span style="font-family:'Roboto',monospace;">${dev.channelNum}</span>
    //       </div>
    //       <div style="background:#eaf1ff;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
    //         <span style="color:#3358e0;"data-i18n="secret-key">密钥</span><span style="font-family:'Roboto',monospace;">${dev.secretKey}</span>
    //       </div>
    //       <div style="background:#f4f8ff;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
    //         <span style="color:#3358e0;"data-i18n="power">功率</span><span style="font-family:'Roboto',monospace;">${dev.powerVal}</span>
    //       </div>
    //       <div style="background:#eaf1ff;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
    //         <span style="color:#3358e0;"data-i18n="remote-type">遥控类型</span><span style="font-family:'Roboto',monospace;">${dev.remoteCtlClass}</span>
    //       </div>
    //       <div style="background:#f4f8ff;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
    //         <span style="color:#3358e0;"data-i18n="mixed-ctl">混控</span><span style="font-family:'Roboto',monospace;">${dev.mixedCtl}</span>
    //       </div>
    //     </div>
    //   </div>

    attrPage.innerHTML = html;
    const SildeRange = document.getElementById('slide_mid-range');
    const SildeValue = document.getElementById('slide_mid-value');
    SildeRange.addEventListener('input', function () {
        let v = parseInt(SildeRange.value) || 0;
        if (v < 1000) v = 1000;
        if (v > 8000) v = 8000;
        SildeValue.textContent = v;
        window._deviceInfo.slideMidData = v;
    });

    SildeRange.addEventListener('change', function () {
        let v = parseInt(SildeRange.value) || 0;
        if (v < 1000) v = 1000;
        if (v > 8000) v = 8000;

        let cmdData = [];
        if (window._deviceInfo.slideMid) {
            cmdData[0] = 0x01;
            window._deviceInfo.slideMid = 1;
        }
        else {
            cmdData[0] = 0x00;
            window._deviceInfo.slideMid = 0;
        }
        let value = parseInt(SildeRange.value) || 0;
        cmdData[1] = (value >> 8) & 0xFF;
        cmdData[2] = value & 0xFF;

        const sendData = new Uint8Array([0xA5, 0x55, 0x24, cmdData[0], cmdData[2], cmdData[1], 0x0D, 0x0A]);
        if (typeof writer !== 'undefined' && writer) {
            setTimeout(() => {
                writer.write(sendData);
            }, 100);
            setTimeout(() => {
                writer.write(sendData);
            }, 200);
            setTimeout(() => {
                writer.write(sendData);
            }, 300);
            console.log('[ATTR] 频率设置已发送：' + v);
            console.log('sendData', sendData);
        }
    });


    // 新增：音量进度条事件绑定
    const volumeRange = document.getElementById('volume-range');
    const volumeValue = document.getElementById('volume-value');
    volumeRange.addEventListener('input', function () {
        let v = parseInt(volumeRange.value) || 0;
        if (v < 0) v = 0;
        if (v > 25) v = 25;
        volumeValue.textContent = v * 4;
        window._deviceInfo.devVolume = v;
    });
    // 松手时发送
    volumeRange.addEventListener('change', function () {
        let v = parseInt(volumeRange.value) || 0;
        if (v < 0) v = 0;
        if (v > 25) v = 25;
        if (typeof writer !== 'undefined' && writer) {
            writer.write(new Uint8Array([0xA5, 0x55, 0x19, v, 0x0D, 0x0A]));
            setTimeout(() => {
                writer.write(new Uint8Array([0xA5, 0x55, 0x19, v, 0x0D, 0x0A]));
            }, 100);
            setTimeout(() => {
                writer.write(new Uint8Array([0xA5, 0x55, 0x19, v, 0x0D, 0x0A]));
            }, 200);
            setTimeout(() => {
                writer.write(new Uint8Array([0xA5, 0x55, 0x19, v, 0x0D, 0x0A]));
            }, 300);
            console.log('[ATTR] 音量设置已发送：' + v);
        }
    });

    const factoryResetBtn = document.getElementById('factory-reset-btn');
    if (factoryResetBtn) {
        factoryResetBtn.onclick = function () {
            if (!window.confirm(LANGS[currentLang]['factory-reset-confirm'])) return;
            if (typeof writer !== 'undefined' && writer) {
                writer.write(new Uint8Array([0xA5, 0x55, 0x0E, 0x0D, 0x0A]));
                alert(LANGS[currentLang]['factory-reset-success']);
            }
        };
    }
    const keyModeArr = dev.keyModel;// && [0xFF,0xFF,0xFF,0xFF,0xFF]; // 默认单击
    //console.log('[ATTR] 按键模式设置:', dev.keyModel[0]);
    ['SA', 'SB', 'SC', 'SD', 'SE'].forEach((k, i) => {
        const sel = document.getElementById(`keymode-${k}`);
        if (sel) {
            sel.value = parseInt(keyModeArr[i] || 6).toString();
            sel.onchange = function () {
                // 获取5个下拉的当前值
                const vals = ['SA', 'SB', 'SC', 'SD', 'SE'].map((kk, idx) => {
                    const s = document.getElementById(`keymode-${kk}`);
                    return s ? parseInt(s.value) : 6;
                });
                // 组装指令
                const cmd = new Uint8Array([0xA5, 0x55, 0x21, ...vals, 7, 0x0D, 0x0A]);
                if (typeof writer !== 'undefined' && writer) {
                    window._deviceInfo.keyModel = [...vals, 7];
                    // console.log([...vals, 7]);
                    // console.log("cmd:",cmd);
                    setTimeout(() => {      //防止失败,担心usb交互卡顿,所以,放弃了交互
                        writer.write(cmd);
                    }, 500);
                    setTimeout(() => {
                        writer.write(cmd);
                    }, 500);
                    setTimeout(() => {
                        writer.write(cmd);
                    }, 500);
                    //alert('已发送按键模式设置指令: ' + vals.join(','));
                }
            };
        }
    });

    //警告开关机
    const RxWarning = document.getElementById('check_warning');
    RxWarning.checked = dev.RxWarning === 1;
    if (RxWarning) {
        RxWarning.onchange = function () {
            let cmdData = [];
            if (window._deviceInfo.RxWarning) {
                cmdData[0] = 0x00;
                window._deviceInfo.RxWarning = 0;
                RxWarning.checked = false;
            }
            else {
                cmdData[0] = 0x01;
                window._deviceInfo.RxWarning = 1;
                RxWarning.checked = true;
            }
            const sendData = new Uint8Array([0xA5, 0x55, 0x25, cmdData[0], 0x0D, 0x0A]);
            setTimeout(() => {
                writer.write(sendData);
            }, 500);
            setTimeout(() => {
                writer.write(sendData);
            }, 500);
        }
    }

    const LowPowerWarning = document.getElementById('check_lowpower');
    LowPowerWarning.checked = dev.LowPowerWarning === 1;
    if (LowPowerWarning) {
        LowPowerWarning.onchange = function () {
            let cmdData = [];
            if (window._deviceInfo.LowPowerWarning) {
                cmdData[0] = 0x00;
                window._deviceInfo.LowPowerWarning = 0;
                LowPowerWarning.checked = false;
            }
            else {
                cmdData[0] = 0x01;
                window._deviceInfo.LowPowerWarning = 1;
                LowPowerWarning.checked = true;
            }
            const sendData = new Uint8Array([0xA5, 0x55, 0x27, cmdData[0], 0x0D, 0x0A]);
            setTimeout(() => {
                writer.write(sendData);
            }, 500);
            setTimeout(() => {
                writer.write(sendData);
            }, 500);
        }
    }

    const LeftTrimReset = document.getElementById('check_left_trim_reset');
    LeftTrimReset.checked = dev.LeftTrimReset === 1;
    if (LeftTrimReset) {
        LeftTrimReset.onchange = function () {
            let cmdData = [];
            if (window._deviceInfo.LeftTrimReset) {
                cmdData[0] = 0x00;
                cmdData[1] = window._deviceInfo.RightTrimReset;
                window._deviceInfo.LeftTrimReset = 0;
                LeftTrimReset.checked = false;
            }
            else {
                cmdData[0] = 0x01;
                cmdData[1] = window._deviceInfo.RightTrimReset;
                window._deviceInfo.LeftTrimReset = 1;
                LeftTrimReset.checked = true;
            }
            const sendData = new Uint8Array([0xA5, 0x55, 0x30, cmdData[0], cmdData[1], 0x0D, 0x0A]);
            setTimeout(() => {
                writer.write(sendData);
            }, 500);
            setTimeout(() => {
                writer.write(sendData);
            }, 500);
        }
    }



    const RightTrimReset = document.getElementById('check_right_trim_reset');
    RightTrimReset.checked = dev.RightTrimReset === 1;
    if (RightTrimReset) {
        RightTrimReset.onchange = function () {
            let cmdData = [];
            if (window._deviceInfo.RightTrimReset) {
                cmdData[1] = 0x00;
                cmdData[0] = window._deviceInfo.LeftTrimReset;
                window._deviceInfo.RightTrimReset = 0;
                RightTrimReset.checked = false;
            }
            else {
                cmdData[1] = 0x01;
                cmdData[0] = window._deviceInfo.LeftTrimReset;
                window._deviceInfo.RightTrimReset = 1;
                RightTrimReset.checked = true;
            }
            const sendData = new Uint8Array([0xA5, 0x55, 0x30, cmdData[0], cmdData[1], 0x0D, 0x0A]);
            setTimeout(() => {
                writer.write(sendData);
            }, 500);
            setTimeout(() => {
                writer.write(sendData);
            }, 500);
        }
    }




    const slideMid = document.getElementById('slide_mid');
    const slideMidData = document.getElementById('slide_midData');
    slideMid.checked = dev.slideMid === 1;
    if (slideMid) {
        slideMid.onchange = function () {
            let cmdData = [];
            if (window._deviceInfo.slideMid) {
                cmdData[0] = 0x00;
                window._deviceInfo.slideMid = 0;
                //console.log("0:",window._deviceInfo.slideMid);
            }
            else {
                cmdData[0] = 0x01;
                window._deviceInfo.slideMid = 1;
                //console.log("1",window._deviceInfo.slideMid);
            }
            let value = parseInt(SildeRange.value) || 0;
            cmdData[1] = (value >> 8) & 0xFF;
            cmdData[2] = value & 0xFF;

            console.log('SildeRange.value:', SildeRange.value);
            const sendData = new Uint8Array([0xA5, 0x55, 0x24, cmdData[0], cmdData[2], cmdData[1], 0x0D, 0x0A]);
            setTimeout(() => {
                writer.write(sendData);
            }, 500);
            setTimeout(() => {
                writer.write(sendData);
            }, 500);
        }
    }



    updateAllLangText();
}


function updateFwUI() {
    if (typeof upDataFlag === 'undefined') window.upDataFlag = 0;
    // 获取所有相关元素
    const fwEnterUpdateBtn = document.getElementById('fw-enter-update-btn');
    const fwDropArea = document.getElementById('fw-drop-area');
    //const fwFileBtn = document.getElementById('fw-file-btn');
    const fwFileInput = document.getElementById('fw-file');
    const fwFileName = document.getElementById('fw-file-name');
    const fwUpdateBtn = document.getElementById('fw-update-btn');
    const fwStatus = document.getElementById('fw-status');
    const fwStatusText = document.getElementById('fw-status-text');
    const fwProgressLabel = document.getElementById('fw-progress-label');
    const fwProgressBarWrap = document.getElementById('fw-progress-bar-wrap');

    if (upDataFlag === 0) {
        fwEnterUpdateBtn.style.display = '';
        fwDropArea.style.display = 'none';
        //fwFileBtn.style.display = 'none';
        fwFileInput.style.display = 'none';
        fwFileName.style.display = 'none';
        fwUpdateBtn.style.display = 'none';
        fwProgressLabel.style.display = 'none';
        fwProgressBarWrap.style.display = 'none';
        fwStatus.textContent = '';
        fwStatusText.textContent = '';
        document.getElementById('fw-device-type').disabled = false;
    } else if (upDataFlag === 1) {
        fwEnterUpdateBtn.style.display = 'none';
        fwDropArea.style.display = 'none';
        //fwFileBtn.style.display = 'none';
        fwFileInput.style.display = 'none';
        fwFileName.style.display = 'none';
        fwUpdateBtn.style.display = 'none';
        fwProgressLabel.style.display = 'none';
        fwProgressBarWrap.style.display = 'none';
        fwStatus.textContent = LANGS[currentLang]['fw-wait-ready'];
        document.getElementById('fw-device-type').disabled = true;
    } else if (upDataFlag === 2) {
        fwEnterUpdateBtn.style.display = 'none';
        fwDropArea.style.display = '';
        //fwFileBtn.style.display = '';
        fwFileInput.style.display = '';
        fwFileName.style.display = '';
        fwUpdateBtn.style.display = '';
        fwProgressLabel.style.display = '';
        fwProgressBarWrap.style.display = '';
        document.getElementById('fw-device-type').disabled = true;
        fwStatus.textContent = LANGS[currentLang]['fw-ready-update'];
        fwStatusText.textContent = LANGS[currentLang]['fw-ready-update-text'];
    }
    updateAllLangText();
}

// 覆盖页面初始化注册表
if (typeof pageInits === 'object') pageInits.fw = initFwPage;
fwUpdateBtn.onclick = async function () {
    if (!fwFileData) { fwStatus.textContent = LANGS[currentLang]['fw-file-input']; return; }
    if (!writer) { fwStatus.textContent = LANGS[currentLang]['fw-connect-port']; return; }
    fwStatus.textContent = LANGS[currentLang]['fw-transmitting'];
    fwProgressBar.style.width = '0%';
    fwProgressText.textContent = '0%';
    fwUpdateBtn.disabled = true;
    try {
        await ymodemSend(fwFileData, fwFileInput.files[0].name, (sent, total) => {
            const percent = Math.floor(sent / total * 100);
            fwProgressBar.style.width = percent + '%';
            fwProgressText.textContent = percent + '%';
        });
        fwStatus.textContent = '固件传输完成！';
        fwUpdateBtn.disabled = false;
        upDataFlag = 0;
        updateFwUI();
    } catch (e) {
        fwStatus.textContent = '传输失败：' + e.message;
    }
};

// ========== 全局唯一定时器+函数指针式任务注册 ==========
window._globalChannelTimer = null;
window._globalChannelTask = null;
function startGlobalChannelTimer() {
    if (!window._globalChannelTimer) {
        console.log('[定时器] 启动全局通道定时器');
        window._globalChannelTimer = setInterval(() => {
            if (typeof window._globalChannelTask === 'function') {
                window._globalChannelTask();
            } else if (window._globalChannelTask && window._globalChannelTask.channelRequest) {
                window._globalChannelTask.channelRequest();
            }
        }, 20);
    } else {
        console.log('[定时器] 已有定时器在运行');
    }
}
function stopGlobalChannelTimer() {
    if (window._globalChannelTimer) {
        console.log('[定时器] 停止全局通道定时器');
        clearInterval(window._globalChannelTimer);
        window._globalChannelTimer = null;
    }
}

function tryParseNetProgress(buf) {
    if (!buf || buf.length < 3) return false;
    if (buf[0] !== 0x23) return false;
    const len = buf[1];
    if (buf.length < len + 2) return false;
    const crc = buf[len + 1];
    const calcCrc = crc8tab_js(buf.slice(2, 2 + len - 1), len - 1);
    if (crc !== calcCrc) return false;
    //console.log('buf:',buf);
    return true;
}


function tryParseAdcPacketCalib(buf) {
    var pageCalib = document.getElementById('page-calib');
    if (!pageCalib || pageCalib.style.display === 'none') return false;

    if (!buf || buf.length < 3) return false;
    if (buf[0] !== 0x33) return false;
    const len = buf[1];
    if (buf.length < len + 2) return false;
    const crc = buf[len + 1];
    const calcCrc = crc8tab_js(buf.slice(2, 2 + len - 1), len - 1);
    if (crc !== calcCrc) return false;

    // CaliFlag
    const CaliFlag = buf[12];

    // 5个ADC
    let recvAdc = [];
    for (let i = 0; i < 5; i++) {
        let off = 2 + i * 2;
        recvAdc[i] = buf[off] | (buf[off + 1] << 8);
    }

    // 方向（4字节，0/1）
    let recvAdcInputDir = [];
    for (let i = 0; i < 4; i++) {
        recvAdcInputDir[i] = buf[11 + 2 + i];
    }

    // 映射（4字节）
    let adcMap = [];
    for (let i = 0; i < 4; i++) {
        adcMap[i] = buf[15 + 2 + i];
    }

    // 校准数据（5组，每组6字节，max/min/mid）
    let recvAdcCailData = [];
    for (let i = 0; i < 5; i++) {
        let base = 19 + 2 + i * 6;
        let max = buf[base] | (buf[base + 1] << 8);
        let min = buf[base + 2] | (buf[base + 3] << 8);
        let mid = buf[base + 4] | (buf[base + 5] << 8);
        recvAdcCailData[i] = [max, min, mid];
    }

    // 计算tmpData（摇杆归一化到-100~100）
    let tmpData = [];
    for (let i = 0; i < 5; i++) {
        let adc = recvAdc[i];
        let max = recvAdcCailData[i][0];
        let min = recvAdcCailData[i][1];
        let mid = recvAdcCailData[i][2];
        if (adc >= mid) {
            tmpData[i] = 1.0 * (adc - mid) * 100 / (max - mid);
            if (tmpData[i] > 100) tmpData[i] = 100;
        } else {
            tmpData[i] = -100 + 1.0 * (adc - min) * 100 / (mid - min);
            if (tmpData[i] < -100) tmpData[i] = -100;
        }
        // 方向反转，始终用映射后的通道
        if (i < 4 && recvAdcInputDir[adcMap[i]]) tmpData[i] = -tmpData[i];
    }

    // 打印调试
    //console.log('[ADC包] CaliFlag:', CaliFlag, 'recvAdc:', recvAdc, 'adcMap:', adcMap, 'recvAdcInputDir:', recvAdcInputDir, 'recvAdcCailData:', recvAdcCailData, 'tmpData:', tmpData);

    // 动态映射摇杆显示，适配所有硬件
    const joy1Canvas = document.getElementById('joystick1');
    const joy2Canvas = document.getElementById('joystick2');
    // 右摇杆：X=tmpData[adcMap[1]], Y=tmpData[adcMap[0]]
    drawJoystick(joy2Canvas, tmpData[adcMap[1]], tmpData[adcMap[0]]);
    // 左摇杆：X=tmpData[adcMap[3]], Y=tmpData[adcMap[2]]
    drawJoystick(joy1Canvas, tmpData[adcMap[3]], tmpData[adcMap[2]]);

    // 电位器 tmpData[4] 显示到进度条
    const slider = document.getElementById('calib-slider');
    const sliderValue = document.getElementById('calib-slider-value');
    // 计算电位器百分比
    let adcNow = recvAdc[4];
    let adcMin = recvAdcCailData[4][1];
    let adcMax = recvAdcCailData[4][0];
    let percent = 0;
    if (adcMax !== adcMin) {
        percent = Math.round((adcNow - adcMin) * 100 / (adcMax - adcMin));
        if (percent < 0) percent = 0;
        if (percent > 100) percent = 100;
    }
    if (slider) slider.value = percent;
    if (sliderValue) sliderValue.textContent = percent;
    if (slider) slider.style.background = `linear-gradient(90deg, #4f8cff ${percent}%, #e0e7ff ${percent}%)`;

    // 实时收集最大最小值，便于校准
    if (!window._adcMax) window._adcMax = [0, 0, 0, 0, 0];
    if (!window._adcMin) window._adcMin = [65535, 65535, 65535, 65535, 65535];
    for (let i = 0; i < 4; i++) {
        if (recvAdc[i] > 100 && recvAdc[i] < 4000)                 //解决因为可能是0带来的干扰，导致最大最小值异常 因为摇杆的范围是大概在300 - 3600左右
        {
            if (recvAdc[i] > window._adcMax[i]) window._adcMax[i] = recvAdc[i];
            if (recvAdc[i] < window._adcMin[i]) window._adcMin[i] = recvAdc[i];
        }
    }
    if (recvAdc[4] > window._adcMax[4]) window._adcMax[4] = recvAdc[4];     //这个是电位器,无所谓的,就是最大最小,而且范围刚刚好就是 0-4095
    if (recvAdc[4] < window._adcMin[4]) window._adcMin[4] = recvAdc[4];

    let isCalib = 0;

    for (let i = 0; i < 4; i++) {
        if (recvAdc[i] == 0) {
            console.log('[ADC校准异常] 为', i, '的值为0', buf);
        }

        if ((window._adcMax[i] - recvMidAdc[i] > 800) && (recvMidAdc[i] - window._adcMin[i] > 800)) {
            isCalib++;
        }
        else {
            console.log('[ADC校准] 当前最大值:', window._adcMax, '最小值:', window._adcMin, '当前中立点:', recvMidAdc, '当前校准状态:', isCalib);
        }
    }
    // if(window._adcMax[4]>3000 && window._adcMin[4]<1000)
    // {
    //   isCalib++;
    // }
    if (isCalib == 4) {
        //console.log('使能失败,请检查摇杆是否正常');
        console.log('[ADC校准] 当前最大值:', window._adcMax, '最小值:', window._adcMin, '当前中立点:', recvMidAdc);
        document.getElementById('calib-action-btn').disabled = false;
        document.getElementById('calib-save-action-btn').disabled = false;
    }
    // 控制台输出当前最大最小值
    //console.log('[ADC校准] 当前最大值:', window._adcMax, '最小值:', window._adcMin);

    return true;
}


function tryParseMidAdcPacketCalib(buf) {
    // 只在校准页面可见时刷新控件
    var pageCalib = document.getElementById('page-calib');
    if (!pageCalib || pageCalib.style.display === 'none') return false;

    if (!buf || buf.length < 3) return false;
    if (buf[0] !== 0x34) return false;
    const len = buf[1];
    if (buf.length < len + 2) return false;
    const crc = buf[len + 1];
    const calcCrc = crc8tab_js(buf.slice(2, 2 + len - 1), len - 1);
    if (crc !== calcCrc) return false;

    // 解析4个16位中立点
    for (let i = 0; i < 4; i++) {
        let off = 2 + i * 2;
        let val = buf[off] | (buf[off + 1] << 8);
        recvMidAdc[i] = val;
    }
    // 打印到控制台
    console.log('[校准中心点] 解析到4个中立点:', recvMidAdc);

    // 标志位
    if (recvMidAdc[0] !== 0) {
        console.log('[校准中心点] 获得了校准中心点');
    }
    return true;
}

function linkStats(buf) {
    // 只在校准页面可见时刷新控件
    //console.log('buf',buf);
    //var pageNet = document.getElementById('page-net');
    //if (!pageNet || pageNet.style.display === 'none') return false;
    if (!buf || buf.length < 3) return false;
    if (buf[0] !== 0x67) return false;
    const len = buf[1];
    // if (buf.length < len + 2) return false;
    const crc = buf[len + 1];
    const calcCrc = crc8tab_js(buf.slice(2, 2 + len - 1), len - 1);
    if (crc !== calcCrc) return false;
    g_linkState.upLinkRssiAnt1 = buf[2];           // uint8_t -> 无符号8位整数
    g_linkState.upLinkRssiAnt2 = buf[3];           // uint8_t
    g_linkState.upLinkPackageSuccessRate = buf[4];           // uint8_t
    g_linkState.upLinkSNR = buf[5];           // int8_t -> 有符号8位整数
    g_linkState.diversityActiveAntenna = buf[6];           // uint8_t
    g_linkState.rfMode = buf[7];           // uint8_t (原RF_Mode，JavaScript建议用驼峰命名)
    g_linkState.upLinkTxPower = buf[8];           // uint8_t (原upLinkTxPwoer，可能是拼写错误)
    g_linkState.downLinkRssi = buf[9];           // uint8_t
    g_linkState.downLinkPackSuccessRate = buf[10];           // uint8_t
    g_linkState.downLinkSNR = buf[11];           // int8_t
    g_linkState.connectFlag = buf[12];           // char -> 字符

    if (g_linkState.connectFlag != 1) {
        document.getElementById('refresh-settings-rx').disabled = true;
        updateSignalStrength(0);
    }
    else if ((0xFF - g_linkState.downLinkRssi) <= 40) {
        document.getElementById('refresh-settings-rx').disabled = false;
        updateSignalStrength(4);
    }
    else if ((0xFF - g_linkState.downLinkRssi) <= 60) {
        document.getElementById('refresh-settings-rx').disabled = false;
        updateSignalStrength(3);
    }
    else if ((0xFF - g_linkState.downLinkRssi) <= 80) {
        document.getElementById('refresh-settings-rx').disabled = false;
        updateSignalStrength(2);
    }
    else if ((0xFF - g_linkState.downLinkRssi) <= 100) {
        document.getElementById('refresh-settings-rx').disabled = false;
        updateSignalStrength(1);
    }
    //console.log('buf:',buf);
    // 打印到控制台
    return true;
}



function tryNetError(buf) {
    // 只在校准页面可见时刷新控件
    //console.log('buf',buf);
    //var pageNet = document.getElementById('page-net');
    //if (!pageNet || pageNet.style.display === 'none') return false;
    if (!buf || buf.length < 3) return false;
    if (buf[0] !== 0x45) return false;
    const len = buf[1];
    // if (buf.length < len + 2) return false;
    const crc = buf[len + 1];
    const calcCrc = crc8tab_js(buf.slice(2, 2 + len - 1), len - 1);
    if (crc !== calcCrc) return false;
    if (buf[2] == 0) {
        console.log('[识别到ELRS固件]');
    }
    else if (buf[2] == 1) {
        alert(LANGS[currentLang]['elrs-missing-alert'] || 'ELRS固件不存在或需重启设备');
        console.log('[识别到没有ELRS固件]');
    }
    else {
        console.log('buf', buf);
    }
    //console.log('buf:',buf);
    // 打印到控制台
    return true;
}

// 校准页面任务
// 全局定时器和任务管理
window._globalChannelTimer = null;  // 用于通道数据请求 (20ms)
window._globalCommandTimer = null;  // 用于其他指令请求 (1000ms)
window._globalChannelTask = null;

// 清理所有定时器
function clearAllTimers() {
    if (window._globalChannelTimer) {
        clearInterval(window._globalChannelTimer);
        window._globalChannelTimer = null;
    }
    if (window._globalCommandTimer) {
        clearInterval(window._globalCommandTimer);
        window._globalCommandTimer = null;
    }
    window._globalChannelTask = null;
}

// 启动定时器
function startTimers(task) {
    clearAllTimers();
    window._globalChannelTask = task;

    // 通道数据请求定时器 - 20ms
    if (task && task.channelRequest) {
        window._globalChannelTimer = setInterval(() => {
            if (window._globalChannelTask && window._globalChannelTask.channelRequest) {
                window._globalChannelTask.channelRequest();
            }
        }, 20);
    }

    // 其他指令请求定时器 - 1000ms
    if (task && task.commandRequest) {
        window._globalCommandTimer = setInterval(() => {
            if (window._globalChannelTask && window._globalChannelTask.commandRequest) {
                window._globalChannelTask.commandRequest();
            }
        }, 1000);
    }
}

// 配置页面任务
function createConfigTask(configStepRef) {
    return {
        channelRequest: () => {
            if (configStepRef.value === 2) {
                writer.write(new Uint8Array([0xA5, 0x55, 0x02, 0x0D, 0x0A])); // 通道数据
            }
        },
        commandRequest: () => {
            if (configStepRef.value === 0) {
                writer.write(new Uint8Array([0xA5, 0x55, 0x0D, 0, 0, 0x0D, 0x0A])); // map
            } else if (configStepRef.value === 1) {
                writer.write(new Uint8Array([0xA5, 0x55, 0x1F, 0x0D, 0x0A])); // trim/center
            }
        }
    };
}

// 校准页面任务
function createCalibTask(calibStepRef, calibStateRef) {
    return {
        channelRequest: () => {
            if (calibStepRef.value === 1 && calibStateRef.value === 'idle') {
                writer.write(new Uint8Array([0xA5, 0x55, 0x02, 0x0D, 0x0A])); // 通道数据
            }
        },
        commandRequest: () => {
            if (calibStepRef.value === 0) {
                writer.write(new Uint8Array([0xA5, 0x55, 0x0D, 0, 0, 0x0D, 0x0A])); // map
            }
        }
    };
}

// ========== 操作模式十字摇杆绘制函数 ==========
function drawCross(canvas, modeMap, isLeft) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const center = canvas.width / 2;
    const axisLen = canvas.width / 2 - 40;
    const arrowSize = 16;
    ctx.save();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = 'blue';
    // 画十字线
    ctx.beginPath();
    ctx.moveTo(center, center - axisLen); // 上
    ctx.lineTo(center, center + axisLen); // 下
    ctx.moveTo(center - axisLen, center); // 左
    ctx.lineTo(center + axisLen, center); // 右
    ctx.stroke();
    // 画箭头函数（更精致）
    function drawArrow(x, y, dx, dy) {
        ctx.save();
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        if (dx === 0 && dy === -1) { // 上
            ctx.moveTo(x, y - arrowSize);
            ctx.lineTo(x - arrowSize * 0.6, y + arrowSize * 0.7);
            ctx.lineTo(x + arrowSize * 0.6, y + arrowSize * 0.7);
            ctx.closePath();
        } else if (dx === 0 && dy === 1) { // 下
            ctx.moveTo(x, y + arrowSize);
            ctx.lineTo(x - arrowSize * 0.6, y - arrowSize * 0.7);
            ctx.lineTo(x + arrowSize * 0.6, y - arrowSize * 0.7);
            ctx.closePath();
        } else if (dx === -1 && dy === 0) { // 左
            ctx.moveTo(x - arrowSize, y);
            ctx.lineTo(x + arrowSize * 0.7, y - arrowSize * 0.6);
            ctx.lineTo(x + arrowSize * 0.7, y + arrowSize * 0.6);
            ctx.closePath();
        } else if (dx === 1 && dy === 0) { // 右
            ctx.moveTo(x + arrowSize, y);
            ctx.lineTo(x - arrowSize * 0.7, y - arrowSize * 0.6);
            ctx.lineTo(x - arrowSize * 0.7, y + arrowSize * 0.6);
            ctx.closePath();
        }
        ctx.stroke();
        ctx.restore();
    }
    // 画四个箭头
    drawArrow(center, center - axisLen, 0, -1); // 上
    drawArrow(center, center + axisLen, 0, 1);  // 下
    drawArrow(center - axisLen, center, -1, 0); // 左
    drawArrow(center + axisLen, center, 1, 0);  // 右
    // 画标签（位置优化+美化）
    ctx.save();
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    // 阴影提升可读性
    ctx.shadowColor = 'rgba(255,255,255,0.8)';
    ctx.shadowBlur = 4;
    // 纵向标签（上下）向左偏移20px
    // 横向标签（左右）向上偏移20px
    if (isLeft) {
        // modeMap[0]上下，modeMap[1]左右
        ctx.fillStyle = 'black';
        ctx.fillText(modeMap[0], center - 20, center - axisLen / 2); // 上
        ctx.fillText(modeMap[0], center - 20, center + axisLen / 2); // 下
        ctx.fillText(modeMap[1], center - axisLen / 2, center - 20); // 左
        ctx.fillText(modeMap[1], center + axisLen / 2, center - 20); // 右
    } else {
        // modeMap[2]上下，modeMap[3]左右
        ctx.fillStyle = 'black';
        ctx.fillText(modeMap[2], center - 20, center - axisLen / 2); // 上
        ctx.fillText(modeMap[2], center - 20, center + axisLen / 2); // 下
        ctx.fillText(modeMap[3], center - axisLen / 2, center - 20); // 左
        ctx.fillText(modeMap[3], center + axisLen / 2, center - 20); // 右
    }
    ctx.restore();
}

// ========== 摇杆绘制函数，确保全局可用 ==========
function drawJoystick(canvas, x, y) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#f4f6fb';
    ctx.fillRect(0, 0, w, h);

    // 线段最大长度，距离边框8%宽度
    const margin = w * 0.04; // 4%边距
    const maxRadius = w / 2 - margin;

    // 中心圆和指示点的半径也用比例
    const centerCircleRadius = w * 0.025; // 2.5%
    const pointerRadius = w * 0.025;      // 2.5%

    // 十字辅助线
    ctx.save();
    ctx.setLineDash([w * 0.012, w * 0.01]);
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = w * 0.002;
    ctx.beginPath();
    ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.restore();

    // 中心圆
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, centerCircleRadius, 0, 2 * Math.PI);
    ctx.fillStyle = '#e74c3c';
    ctx.shadowColor = '#e74c3c';
    ctx.shadowBlur = w * 0.01;
    ctx.fill();
    ctx.shadowBlur = 0;

    // 计算指针终点
    let bx = w / 2 + (x || 0) * maxRadius / 100;
    let by = h / 2 - (y || 0) * maxRadius / 100;

    // 指针线段
    ctx.save();
    ctx.strokeStyle = '#3358e0';
    ctx.lineWidth = w * 0.008;
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.restore();

    // 指针终点圆
    ctx.beginPath();
    ctx.arc(bx, by, pointerRadius, 0, 2 * Math.PI);
    ctx.fillStyle = '#111';
    ctx.shadowColor = '#111';
    ctx.shadowBlur = w * 0.01;
    ctx.fill();
    ctx.shadowBlur = 0;
}
window.drawJoystick = drawJoystick;


function wifiToggleBtn() {
    setTimeout(function () {
        const wifiBtn = document.getElementById('wifi-toggle-btn');
        wifiBtn.style.display = 'none';//先隐藏有bug
        if (wifiBtn) {
            let wifiEnabled = false; // 默认关闭
            let dialog = null;
            let inner = null;
            let closeBtn = null;
            let msg = null;
            function showWifiDialog(isEnabling) {
                dialog = document.createElement('div');
                dialog.style.position = 'fixed';
                dialog.style.left = '0';
                dialog.style.top = '0';
                dialog.style.width = '100vw';
                dialog.style.height = '100vh';
                dialog.style.background = 'rgba(0,0,0,0.18)';
                dialog.style.display = 'flex';
                dialog.style.alignItems = 'center';
                dialog.style.justifyContent = 'center';
                dialog.style.zIndex = '9999';
                inner = document.createElement('div');
                inner.style.background = '#fff';
                inner.style.borderRadius = '16px';
                inner.style.boxShadow = '0 4px 24px rgba(79,140,255,0.18)';
                inner.style.padding = '38px 48px 32px 48px';
                inner.style.display = 'flex';
                inner.style.flexDirection = 'column';
                inner.style.alignItems = 'center';
                inner.style.minWidth = '260px';
                inner.style.maxWidth = '90vw';
                inner.innerHTML = `<div style="font-size:1.18em;color:#3358e0;font-weight:bold;margin-bottom:18px;">WiFi${isEnabling ? '开启' : '关闭'}</div>`;
                msg = document.createElement('div');
                msg.style.fontSize = '1.08em';
                msg.style.color = '#222';
                msg.style.marginBottom = '18px';
                msg.textContent = isEnabling ? '正在开启WiFi...' : '正在关闭WiFi...';
                inner.appendChild(msg);
                closeBtn = document.createElement('button');
                closeBtn.textContent = isEnabling ? '关闭WiFi' : '关闭弹窗';
                closeBtn.style.marginTop = '12px';
                closeBtn.style.background = isEnabling ? 'linear-gradient(90deg,#e74c3c 0%,#c0392b 100%)' : 'linear-gradient(90deg,#4f8cff 0%,#3358e0 100%)';
                closeBtn.style.color = '#fff';
                closeBtn.style.border = 'none';
                closeBtn.style.borderRadius = '8px';
                closeBtn.style.padding = '10px 32px';
                closeBtn.style.fontSize = '1.08em';
                closeBtn.style.fontWeight = 'bold';
                closeBtn.style.cursor = 'pointer';
                closeBtn.onclick = () => {
                    if (isEnabling) {
                        // 发送关闭WiFi指令
                        if (writer) writer.write(new Uint8Array([0xA5, 0x66, 0x06, 0x0D, 0x0A]));
                        wifiEnabled = false;
                        wifiBtn.textContent = 'WiFi开启';
                        document.body.removeChild(dialog);
                    } else {
                        document.body.removeChild(dialog);
                    }
                };
                inner.appendChild(closeBtn);
                document.body.appendChild(dialog);
                dialog.appendChild(inner);
            }
            wifiBtn.onclick = () => {
                if (!wifiEnabled) {
                    // 发送开启WiFi指令
                    if (writer) writer.write(new Uint8Array([0xA5, 0x66, 0x05, 0x0D, 0x0A]));
                    wifiEnabled = true;
                    wifiBtn.textContent = 'WiFi关闭';
                    showWifiDialog(true);
                } else {
                    // 发送关闭WiFi指令
                    if (writer) writer.write(new Uint8Array([0xA5, 0x66, 0x06, 0x0D, 0x0A]));
                    wifiEnabled = false;
                    wifiBtn.textContent = 'WiFi开启';
                    showWifiDialog(false);
                }
            };
        }
    }, 0);
}

// 在全局添加解析函数：
function tryParseTrimPacket(buf) {
    if (!buf || buf.length < 3) return false;
    if (buf[0] !== 0x55) return false;
    const len = buf[1];
    if (buf.length < len + 2) return false;
    const crc = buf[len + 1];
    const calcCrc = crc8tab_js(buf.slice(2, 2 + len - 1), len - 1);
    if (crc !== calcCrc) return false;
    if (buf[10] !== 0x01) {
        console.log('异常数据全为0');
        return false;   //异常crc全为0 
    }

    // const trimElements = [          //映射表
    //       { barId: 'val-slider-rh', valId: 'val-bar-rh' ,dir:1},   // 右进度条2          
    //       { barId: 'val-slider-rv', valId: 'val-bar-rv' ,dir:1},  // 右进度条1
    //       { barId: 'val-slider-lv', valId: 'val-bar-lv' ,dir:1},  // 左进度条1
    //       { barId: 'val-slider-lh', valId: 'val-bar-lh' ,dir:1},  // 左进度条2
    //     ];

    // 解析4个通道的trim
    let trim = [];
    for (let i = 0; i < 4; i++) {
        let off = 2 + i * 2;
        trim[i] = buf[off] | (buf[off + 1] << 8);
        // 处理负数（如果是有符号16位）
        if (trim[i] & 0x8000) trim[i] = trim[i] - 0x10000;
    }
    // 获取当前的adcMap
    let adcMap = window.channelMap && window.channelMap.channelMapSend ? window.channelMap.channelMapSend : [0, 1, 2, 3];
    // 映射到UI
    for (let i = 0; i < 4; i++) {

        let uiIdx = i;//adcMap[i];
        // 更新Trim
        const trimValSpan = document.getElementById(`trim-val-${uiIdx}`);
        if (trimValSpan) trimValSpan.textContent = trim[i];
        const trimDot = document.getElementById(`trim-dot-${uiIdx}`);
        const trimBar = document.getElementById(`trim-bar-${uiIdx}`);
        if (trimBar && trimDot) {
            let percent = (trim[i] + 130) / 260;
            let left = percent * (trimBar.offsetWidth - trimDot.offsetWidth) + 1;
            trimDot.style.left = left + 'px';
        }

        // 更新校准页面的滑块
        const sliderMap = {
            2: 'calib-slider-lv',  // 左竖
            3: 'calib-slider-lh',  // 左横
            0: 'calib-slider-rh',  // 右横
            1: 'calib-slider-rv'   // 右竖
        };

        const sliderId = sliderMap[i];
        if (sliderId) {
            const slider = document.getElementById(sliderId);
            if (slider) {
                slider.value = trim[i];
            }

            // 更新滑块值显示
            const valSpan = document.getElementById(`val-${sliderId}`);
            if (valSpan) {
                valSpan.textContent = trim[i];
            }
        }

        // const { barId, valId, dir } = trimElements[i];    
        // // 更新数值显示
        // const valElement = document.getElementById(valId);
        // if (valElement) {
        //   valElement.textContent = (trim[i] + 130) / 260;
        // }

        // // 更新进度条宽度
        // const barFill = document.getElementById(barId);
        // let left = percent * (trimBar.offsetWidth - trimDot.offsetWidth) + 1;
        // if (barFill) {
        //   barFill.style.left =  left + 'px';
        // }
    }



    // 不要动center


    // window.channelMap.channelMidRecv = channelMidRecv;
    // window.channelMap.channelMidSend = channelMidSend;

    // 确保 channelMap 存在，如果不存在则创建
    if (!window.channelMap) {
        window.channelMap = {
            channelTrimSend: [0, 0, 0, 0],
            channelTrimRecv: [0, 0, 0, 0]
        };
    }

    window.channelMap.channelTrimSend = trim;
    window.channelMap.channelTrimRecv = trim;


    console.log('[TRIM包] 解析到4个trim:', trim, '映射顺序:', adcMap);
    return true;
}

function sendCenterCommand(centerArr) {
    // centerArr: 4个通道的center，单位-100~100
    let data = new Uint8Array(3 + 8 + 2);
    data[0] = 0xA5;
    data[1] = 0x55;
    data[2] = 0x1A;

    // 确保 channelMap 存在
    if (!window.channelMap) {
        window.channelMap = {
            channelMidSend: [0, 0, 0, 0]
        };
    }

    for (let i = 0; i < 4; i++) {
        let val = Math.round(centerArr[i] * 512 / 100);
        if (window.channelMap.channelMidSend) {
            window.channelMap.channelMidSend[i] = val;
        }
        data[3 + i * 2] = val & 0xFF;
        data[3 + i * 2 + 1] = (val >> 8) & 0xFF;
    }
    // 后面4字节补0
    //for (let i = 11; i < 11+4; i++) data[i] = 0;
    data[11] = 0x0D;
    data[12] = 0x0A;
    writer.write(data);
    console.log('[中立点指令] 已发送:', Array.from(data).map(x => x.toString(16).padStart(2, '0')).join(' '));
}

// ===== 多语言字典框架（你只需补充LANGS对象即可） =====
const LANGS = {
    zh: {
        'update': '固件更新',
        'confirm_update': '确认更新',
        'select_file': '请选择固件文件！',
        'connect_serial': '请先连接串口！',
        'transferring': '正在传输中,请等待...',
        'transfer_done': '固件传输完成！',
        'transfer_fail': '传输失败：',
        'attr-title': '设备属性',
        'connect-title': '串口连接',
        'connect-port': '串口选择',
        'connect-baudrate': '波特率',
        'connect-btn': '连接',
        'connect-status': '未连接',
        'new-device-detected': '检测到新设备，请点击连接',
        'update-progress': '更新进度',
        'drag-fw-file': '拖拽固件文件到此处',
        'or': '或',
        'fw-remote': '遥控器',
        'fw-transmitter': '高频头',
        'fw-sensor': '传感器',
        'factory-reset': '恢复出厂设置!',
        'exit-fw-update': '退出固件更新',
        'keymode-title': '按键模式设置',
        'keymode-single': '单击',
        'keymode-trigger': '触发',
        'keymode-double': '双击',
        'keymode-triple': '三态',
        'keymode-doubleStatus': '双态',
        'keymode-toggle': '切换',
        'query-device-attr': '查询设备属性',
        'query-device-attr-loading': '查询中...',
        'no-device-info': '未获取到设备信息。',
        'connect-port-desc': '请先连接串口！',
        'factory-reset-confirm': '确定要恢复出厂设置吗？此操作不可撤销！',
        'factory-reset-success': '已发送恢复出厂设置指令',
        'wifi-open': 'WiFi开启',
        'wifi-close': 'WiFi关闭',
        'wifi-open-desc': 'WiFi开启成功',
        'wifi-close-desc': 'WiFi关闭成功',
        'wifi-open-fail': 'WiFi开启失败',
        'volume': '音量',
        'serial-number': '序列号',
        'elrs-firmware-version': '高频头固件版本',
        'device-firmware-version': '设备固件版本',
        'elrs-name': 'ExpressLRS',
        'company-name': '公司名称',
        'device-name': '设备名称',
        'send-pack-speed': '发送包速率',
        'return-speed': '返回速率',
        'calibration-flag': '校准标志',
        'connect-protocol': '连接协议',
        'channel-num': '通道数',
        'secret-key': '密钥',
        'power': '功率',
        'remote-type': '遥控类型',
        'mixed-ctl': '混控',
        'remote-param': '遥控参数',
        'comm-uart': '串口通信',
        'attr-dev': '设备概况',
        'config-channel': '通道配置',
        'net-config': '无线配置',
        'dev-cailation': '设备校准',
        'frieware-updata': '固件更新',
        'channel-monitor': '通道监视器',
        'channel-attr': '通道属性',
        'channel-map': '通道映射',
        'trim-center': '微调和中立点',
        'mode': '摇杆模式',
        'channel-map-relation': '通道映射关系',
        'channel-map-confirm-label': '遥控器没有反应点击"映射保存"再次写入',
        'channel-attr-negative-travel': '负行程',
        'channel-attr-positive-travel': '正行程',
        'trim-center-title': '微调',
        'trim-center-center-title': '舵机中立点',
        'mode-title': '摇杆模式',
        'config-dev': '设备配置',
        'channel-attr-confirm-btn': '通道保存',
        'channel-attr-restore-btn': '通道还原',
        'channel-map-confirm-btn': '映射保存',
        'channel-map-restore-btn': '映射还原',
        'net-lua-config': 'LUA配置',
        'net-refresh-tx': '刷新TX',
        'net-refresh-rx': '刷新RX',
        'settings-status-label-Text': '请不要快速连续点击,进而导致数据传输异常和缓冲区异常.',
        'settings-rxLua-label-Text': '50Hz和150Hz模式下,建议在配置接收机时将舵机比例改为1:2.',
        'recv-hex-checked': '16进制显示接收内容',
        'mode-left-stick': '左手摇杆',
        'mode-right-stick': '右手摇杆',
        'channel-attr-confirm-label': '修改后点击"通道保存"即可写入',
        'trim-center-clear': '清空',
        'comm-send-text': '文本发送',
        'comm-send-hex': '16进制发送',
        'comm-send-input': '输入要发送的数据',
        'comm-send-btn': '发送',
        'comm-clear-output': '一键清空',
        'refresh-getting': '正在获取设置...',
        'refresh-done': '刷新完成',
        'refresh-timeout': '超时',
        'calib-title': '设备校准',
        'calib-joystick-label-left': '左摇杆',
        'calib-joystick-label-right': '右摇杆',
        'calib-step-label': '点击"开始校准"按键进行校准操作',
        'calib-action': '开始校准',
        'calib-save-action': '校准保存',
        'calib-reset-action': '重新校准',
        'calib-reset': '重新校准',
        'calib-center-point': '校准中心点',
        'calib-step-label-center-point': '请将摇杆置于中心点处,然后点击"选择中心点"按键',
        'calib-done': '校准完成',
        'calib-step-label-done': '听到"滴"一声之后,将摇杆和旋钮移动到最大最小处,角落处请多停留一段时间,然后校准完毕之后,点击"校准完成"按键',
        'fw-change-title': '选择固件更新',
        'fw-device-type': '设备类型：',
        'fw-file-input': '请选择固件文件！',
        'fw-file-name': '固件文件名:',
        'fw-transmitting': '正在传输中,请等待...',
        'fw-select-file': '请选择固件文件！',
        'fw-connect-port': '请先连接串口！',
        'fw-ready-update': '设备已就绪，可以开始固件更新',
        'fw-ready-update-text': '想要退出更新,请重新上电,刷新网页在首页点击"退出固件更新"按钮',
        'fw-wait-ready': '请等待设备就绪...',
        'fw-update-btn': '确认更新',
        'fw-update-progress': '更新进度',
        'connecting': '正在连接...',
        'connect-failed': '连接失败: ',
        'serial-permission-denied': '用户拒绝了串口访问权限，或者浏览器环境不支持串口访问。',
        'serial-not-found': '未找到可用的串口设备。如果设备刚插入，请等待几秒后重试。',
        'serial-access-failed': '串口访问失败: ',
        'browser-not-support': '浏览器不支持该功能,请选择Chrome/Edge等谷歌内核浏览器',
        'confirm-update': '确定要进入固件更新状态吗？进入后将无法进行其他操作，需退出更新后恢复。',
        'confirm-center-point': '确认中心点',
        'calib-start': '开始校准',
        'calib-start-step-label': '点击"开始校准"按键进行校准操作',
        'comm-disconnect-btn': '断开连接',
        "comm-output-title": "输出端",
        "fw-enter-update": "开始固件更新",
        "start": "启动",
        "fw-file-selected": "已选择文件：",
        "fw-file-size": "大小：",
        "fw-file-bytes": "字节",
        "execute": "执行",
        'command-running': '正在操作...',
        'command-end': '结束',
        'channel-map-default-output': '默认输出',
        'channel-map-channel-input': '默认输入',
        'Sub-trim-title': '舵机中立点',
        'slide_mid': '旋钮中点提示',
        'elrs-missing-alert': '未检测到ELRS固件，请检查设备或重启',
        'jump-to-elrs-website': '跳转到ELRS官网网页进行固件更新',
        'update-esp-firmware': '使用本地App更新ESP固件',
        'jump-to-elrs-website-desc': '已经开启了ESP固件更新模式,点击确认就会断开连接,直接打开RadioMaster提供的ESPTool工具选择USB更新即可',
        'select-firmware-update-method': '请选择您要使用的固件更新方式：',
        'select-firmware-update-method-desc': '选择固件更新方式',
        'cancel': '取消',
        "progressStatus-label-Text": "LUA 配置更新",
        "progressStatus-Text": "处理进度：",
        'serial-warning-test': '接收机即将丢失警告',
        'lowpower-warning-test': '电量过低警告',
        'channel-confirm': '通道确认',
        'send-success': '已发送',
        'trim-left-reset-test': '左Trim复位功能',
        'trim-right-reset-test': '右Trim复位功能',
        // ... 你可以继续补充 ...
    },
    en: {
        'update': 'Firmware Update',
        'confirm_update': 'Confirm Update',
        'select_file': 'Please select firmware file!',
        'connect_serial': 'Please connect serial port first!',
        'transferring': 'Transferring, please wait...',
        'transfer_done': 'Firmware transfer completed!',
        'transfer_fail': 'Transfer failed: ',
        'attr-title': 'Device Information',
        'connect-title': 'COM  Connection',
        'connect-port': 'COM Port',
        'connect-baudrate': 'Baud Rate',
        'connect-btn': 'Connect',
        'connect-status': 'Disconnected',
        'new-device-detected': 'New device detected, please click Connect',
        'update-progress': 'Update Progress',
        'drag-fw-file': 'Drag firmware file here',
        'or': 'Or',
        'fw-remote': 'T8L Controller',
        'fw-transmitter': 'Internal ELRS Module',
        'fw-sensor': 'Sensor',
        'factory-reset': 'Factory Reset',
        'exit-fw-update': 'Exit Firmware Update',
        'keymode-title': 'Key Mode Setting',
        'keymode-single': 'Single',
        'keymode-double': 'Double',
        'keymode-trigger': 'Click',
        'keymode-triple': '3-POS',
        'keymode-doubleStatus': '2-POS',
        'keymode-toggle': 'Toggle',
        'query-device-attr': 'Query Device Setting',
        'query-device-attr-loading': 'Querying...',
        'no-device-info': 'No device information.',
        'connect-port-desc': 'Please connect serial port first!',
        'wifi-open': 'WiFi Open',
        'wifi-close': 'WiFi Close',
        'wifi-open-desc': 'WiFi Open Success',
        'wifi-close-desc': 'WiFi Close Success',
        'wifi-open-fail': 'WiFi Open Fail',
        'volume': 'Volume',
        'serial-number': 'Serial Number',
        'elrs-firmware-version': 'ExpressLRS Firmware Version',
        'device-firmware-version': 'Device Firmware Version',
        'elrs-name': 'Radio Control',
        'company-name': 'Vendor',
        'device-name': 'Device',
        'send-pack-speed': 'Send Pack Speed',
        'return-speed': 'Return Speed',
        'calibration-flag': 'Calibration Flag',
        'connect-protocol': 'Connect Protocol',
        'channel-num': 'Channel Number',
        'secret-key': 'Secret Key',
        'power': 'Power',
        'remote-type': 'Remote Type',
        'mixed-ctl': 'Mixed Control',
        'remote-param': 'Remote Parameter',
        'comm-uart': 'UART',
        'attr-dev': 'Device',
        'config-channel': 'Channels',
        'net-config': 'RF Settings',
        'dev-cailation': 'Calibration',
        'frieware-updata': 'Firmware Update',
        'channel-monitor': 'Channel Monitor',
        'channel-attr': 'Channel Settings',
        'channel-map': 'Channel Mapping',
        'trim-center': 'Trim and Sub Trim',
        'mode': 'Mode',
        'channel-map-relation': 'Channel Mapping Relation',
        'channel-map-confirm-label': 'If the remote control does not respond, click "Save" again to write',
        'channel-attr-negative-travel': 'Negative Travel',
        'channel-attr-positive-travel': 'Positive Travel',
        'trim-center-title': 'Trim',
        'trim-center-center-title': 'Sub Trim',
        'mode-title': 'Mode',
        'config-dev': 'Channels',
        'channel-attr-confirm-btn': 'Save',
        'channel-attr-restore-btn': 'Restore',
        'channel-map-confirm-btn': 'Save',
        'channel-map-restore-btn': 'Restore',
        'net-lua-config': 'LUA Config',
        'settings-status-label-Text': 'Please do not click quickly in succession, which will cause data transmission exceptions and buffer exceptions.',
        'settings-rxLua-label-Text': 'For 50Hz and 150Hz modes it is recommended to change tele ratio to 1:2 while configuring the RX.',
        'net-refresh-tx': 'Refresh TX',
        'net-refresh-rx': 'Refresh RX',
        'net-recv-hex': 'Hex Display',
        'mode-left-stick': 'Left',//'Left Stick',
        'mode-right-stick': 'Right',//'Right Stick',
        'channel-attr-confirm-label': 'After modification, click "Save" to write',
        'trim-center-clear': 'Clear',
        'comm-send-text': 'Text Send',
        'comm-send-hex': 'Hex Send',
        'comm-send-input': 'Input the data to send',
        'comm-send-btn': 'Send',
        'comm-clear-output': 'Clear',
        'refresh-getting': 'Getting Settings...',
        'refresh-done': 'Refresh Done',
        'refresh-timeout': 'Timeout',
        'calib-title': 'Calibration',
        'calib-joystick-label-left': 'Left Joystick',
        'calib-joystick-label-right': 'Right Joystick',
        'calib-step-label': 'Click "Start Calibration" button to perform calibration operation',
        'calib-action': 'Start Calibration',
        'calib-save-action': 'Save Calibration',
        'calib-reset-action': 'Reset Calibration',
        'calib-center-point': 'Calibration Center Point',
        'calib-step-label-center-point': 'Please place the joystick at the center point, then click the "Select Center Point" button',
        'calib-done': 'Calibration Done',
        'calib-step-label-done': 'After hearing a "beep", move the joystick and knob to their extreme positions (maximum and minimum). Please stay at the corner positions for at least 0.5 to 1 second. Once calibration is completed, click the "Calibration Complete" button.',
        'fw-change-title': 'Select Firmware Update',
        'fw-device-type': 'Device Type:',
        'fw-file-input': 'Please select firmware file!',
        'fw-file-name': 'Firmware File Name:',
        'fw-transmitting': 'Transmitting, please wait...',
        'fw-select-file': 'Please select firmware file!',
        'fw-connect-port': 'Please connect serial port first!',
        'fw-ready-update': 'Device is ready, you can start firmware update',
        'fw-ready-update-text': 'To exit the update, please power off and then power on again, refresh the webpage and click the "Exit Firmware Update" button on the home page.',
        'fw-wait-ready': 'Please wait for the device to be ready...',
        'fw-update-btn': 'Confirm Update',
        'fw-update-progress': 'Update Progress',
        'connecting': 'Connecting...',
        'connect-failed': 'Connection failed: ',
        'browser-not-support': 'Browser not support this function, please select Chrome/Edge etc. Google core browser',
        'confirm-update': 'Are you sure you want to continue? Once started, you will not be able to perform any other actions, and any connected receiver will be disconnected. Do not unplug or disconnect the radio during the update process.',//'Are you sure to enter the firmware update state? After entering, you cannot perform other operations, and you need to exit the update to restore.',
        'confirm-center-point': 'Confirm Center Point',
        'comm-disconnect-btn': 'Disconnect',
        'recv-hex-checked': 'Hex Display',
        'calib-start-step-label': 'Click "Start Calibration" button to perform calibration operation',
        'calib-save': 'Save Calibration',
        'calib-reset': 'Reset Calibration',
        'calib-done': 'Calibration Done',
        'calib-step-label-center-point': 'Please place the joystick at the center point, then click the "Select Center Point" button',
        'calib-center-point': 'Calibration Center Point',
        'calib-start': 'Start Calibration',
        "comm-output-title": "Output",
        "fw-enter-update": "Start Firmware Update",
        "start": "Start",
        "fw-file-selected": "File Selected: ",
        "fw-file-size": "Size: ",
        "fw-file-bytes": "Bytes",
        "execute": "Execute",
        'command-running': 'Running...',
        'command-end': 'End',
        'channel-map-default-output': 'Default',
        'channel-map-channel-input': 'Input',
        'factory-reset-confirm': 'Are you sure you want to restore the factory settings? This will initialize all configurations and calibrations!!! This operation should not be ignored!',
        'Sub-trim-title': 'Sub Trim',
        'factory-reset-success': "The factory reset instruction has been sent",
        'slide_mid': 'S1 Mid tone',
        'elrs-missing-alert': 'ELRS firmware not detected. Please check the device or restart.',
        'jump-to-elrs-website': 'Jump to ELRS website for firmware update',
        'update-esp-firmware': 'Update ESP firmware with local App',
        'jump-to-elrs-website-desc': 'ESP firmware update mode has been enabled, clicking confirm will disconnect the connection, and directly open the ESPTool tool provided by RadioMaster to select USB update.',
        'select-firmware-update-method': 'Please select the firmware update method you want to use:',
        'select-firmware-update-method-desc': 'Select firmware update method',
        'cancel': 'Cancel',
        'progressStatus-label-Text': 'LUA Config Update',
        'progressStatus-Text': 'Processing progress: ',
        'serial-warning-test': 'Receiver loss warning',
        'lowpower-warning-test': 'Low power warning',
        'channel-confirm': 'Save',
        'send-success': 'Sent',
        'trim-left-reset-test': 'Trim left reset function',
        'trim-right-reset-test': 'Trim right reset function',
        // ... 你可以继续补充 ...        
        // ... you can continue ...
    }
};
// ===== 语言切换核心逻辑 =====

function getLang() {
    // console.log('[ATTR] 获取语言:', currentLang);
    // if (currentLang === 'auto') {
    //   const nav = navigator.language || navigator.userLanguage;
    //   return nav.startsWith('zh') ? 'zh' : 'en';
    // }
    return currentLang;
}
function setLang(lang) {
    currentLang = lang;
    //localStorage.setItem('lang', lang);
    updateLangUI();
    updateAllLangText();
}
function updateLangUI() {
    const btn = document.getElementById('lang-switcher');
    if (!btn) return;
    let txt = '🌐';
    //let txt = '';
    //if (currentLang === 'auto') txt += 'Auto';
    //else 
    if (currentLang === 'en') txt += 'EN';
    else txt += '中文';
    btn.textContent = txt;
}

// ===== 语言切换按钮事件 =====
document.getElementById('lang-switcher').onclick = function () {
    //if (currentLang === 'auto') setLang('zh');
    //else if (currentLang === 'zh') setLang('en');
    //else setLang('auto');
    if (currentLang === 'zh') setLang('en');
    else setLang('zh');
    //console.log('[ATTR] 语言切换:', currentLang);
    updateAllLangText();
    //autoTranslateAllText();
    //showMainPage("attr");
};

// ===== 典型用法：所有可切换文本都用 data-i18n="key" 属性标记 =====
function updateAllLangText() {
    const lang = getLang();
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        //console.log('[ATTR] 更新语言:', key, lang, LANGS[lang][key]);
        if (LANGS[lang] && LANGS[lang][key]) {
            el.textContent = LANGS[lang][key];
        }
    });
}


// ===== 页面加载时自动刷新语言 =====
updateLangUI();
updateAllLangText();
// ===== 你在JS里用提示时可以这样用 =====
// fwStatus.textContent = LANGS[getLang()]['select_file'];
// ===== 你在HTML里这样用 =====
// <button data-i18n="confirm_update"></button>
// <div data-i18n="update"></div>
// ...


// ===== 全局设备状态结构体 =====
window.deviceStats = {
    devConnectStats: 0, // 连接状态
    bindConnect: 0,     // 是否连接接收机
    txLinkSnr: 0,       // 下载SNR
    rxLinkSnr: 0,       // 上传SNR
    rxbatteryVoltage: 0, // 接收机电池电压
    rxbatteryCurrent: 0, // 接收机电池电流
    txbatteryVoltage: 0, // 下位机电压adc
    txBattery: 0        // 下位机当前电量百分比
};

// ===== 电量显示刷新函数 =====
function updateBatteryIndicator() {
    const el = document.getElementById('battery-indicator');
    if (!el) return;
    if (typeof window.deviceStats.txBattery === 'number') {
        el.textContent = window.deviceStats.txBattery + '%';
    } else {
        el.textContent = '--%';
    }
}

// ===== 全局定时器：每10秒发送指令（非ymodem页面） =====
let globalStatusTimer = null;
function startGlobalStatusTimer() {
    if (globalStatusTimer) clearInterval(globalStatusTimer);
    globalStatusTimer = setInterval(() => {
        // 判断当前页面（假设window.currentPage有值，或你用其它变量）
        if (typeof window.currentPage === 'function' ? window.currentPage() : window.currentPage) {
            const page = typeof window.currentPage === 'function' ? window.currentPage() : window.currentPage;
            if (page === 'fw') return; // ymodem固件更新页面不发
        }
        // 发送指令
        if (window._currentPage != 'net' && window._currentPage != 'fw' && window._currentPage != 'calib' && writer) {
            writer.write(new Uint8Array([0xA5, 0x55, 0x01, 0x0D, 0x0A]));
            //console.log('[全局] 已发送状态查询指令');
        }
    }, 2000);
}
startGlobalStatusTimer();

// ===== 数据包解析：收到0x11头部时解析并存入全局结构体 =====
function parseDeviceStats(buf) {
    if (!buf || buf.length < 15) return 0;
    if (buf[0] !== 0x11) return 0;
    const len = buf[1];
    // CRC校验
    let tmp = crc8(buf.slice(2, 2 + len - 1));
    //console.log('parseDeviceStats Running', buf);
    //if (buf[len+1] !== tmp) return 0;
    // 解析数据
    //console.log('parseDeviceStats Running', buf);
    window.deviceStats.devConnectStats = 5;
    window.deviceStats.bindConnect = buf[2];
    window.deviceStats.txLinkSnr = buf[3];
    window.deviceStats.rxLinkSnr = buf[4];
    window.deviceStats.rxbatteryVoltage = (buf[5] | (buf[6] << 8));
    window.deviceStats.rxbatteryCurrent = (buf[7] | (buf[8] << 8));
    // window.deviceStats.rxBattery = buf[9]; // 你说先不用
    window.deviceStats.txbatteryVoltage = (buf[10] | (buf[11] << 8));
    window.deviceStats.txBattery = buf[12];
    window._batteryPercent = buf[12];
    // 刷新原有电量栏
    updateDeviceInfoBar();
}

// ===== CRC8算法 =====
function crc8(arr) {
    let crc = 0;
    for (let i = 0; i < arr.length; i++) {
        crc ^= arr[i];
        for (let j = 0; j < 8; j++) {
            if (crc & 0x80) crc = (crc << 1) ^ 0x07;
            else crc <<= 1;
        }
        crc &= 0xFF;
    }
    return crc;
}

// ===== 你需要在串口数据接收处调用 parseDeviceStats(serialBuffer) =====
// 例如：
// if (serialBuffer[0] === 0x11) parseDeviceStats(serialBuffer);
// 或在你现有的串口数据分发/回调里加上即可
// <div id="signalContainer" class="signal-container state-disconnected">
//   <div class="signal-bar bar-1"></div>
//   <div class="signal-bar bar-2"></div>
//   <div class="signal-bar bar-3"></div>
//   <div class="signal-bar bar-4"></div>

//   <div class="cross cross-1"></div>
//   <div class="cross cross-2"></div>
// </div>






/**
 * 更新信号强度显示
 * @param {number} state - 状态值：0=未连接，1-4=对应信号格数
 */
function updateSignalStrength(state) {
    const container = document.getElementById('signalContainer');
    if (!container) return;

    // 移除所有状态类
    container.classList.remove(
        'state-disconnected',
        'state-signal-1',
        'state-signal-2',
        'state-signal-3',
        'state-signal-4'
    );

    // 验证状态值，确保在有效范围内
    const validState = Math.min(Math.max(0, Math.floor(state || 0)), 4);

    // 添加对应状态类
    if (validState === 0) {
        container.classList.add('state-disconnected');
    } else {
        container.classList.add(`state-signal-${validState}`);
    }
}

// 使用示例：
// updateSignalStrength(0); // 未连接（全灰+红叉）
// updateSignalStrength(1); // 1格信号
// updateSignalStrength(2); // 2格信号
// updateSignalStrength(3); // 3格信号
// updateSignalStrength(4); // 4格信号（满格）




//通用定时器
function timerTask() {
    // 关键：执行任务前先检查标志位——如果标志位已拉高，立刻停止流程
    if (stopTimerFlag) {
        console.log("定时器任务：检测到外部标志位拉高，立刻停止任务");
        stopTimer(); // 主动调用停止函数，清除定时器
        return; // 终止当前任务，不再执行后续逻辑
    }


    console.log("定时器任务执行：每2秒触发一次（当前时间：" + new Date().toLocaleTimeString() + "）");

    // （可选）如果任务是异步操作（如API请求、耗时计算），需额外加标志位检查
    // 示例：异步任务中断
    // setTimeout(() => {
    //   if (stopTimerFlag) return; // 异步回调中也要检查，避免标志位拉高后仍执行
    //   console.log("异步任务执行完成");
    // }, 500);
    // --------------------------
}

function linkSacn() {
    writer.write(new Uint8Array([0xA5, 0x55, 0x26, 0x0D, 0x0A]));
}

window._appInitialized = true;
console.log('RadioMaster Web App initialized successfully');



 
