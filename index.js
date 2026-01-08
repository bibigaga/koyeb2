const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { spawn } = require('child_process');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

// 全局错误处理，防止主进程崩溃退出
process.on('uncaughtException', (err) => {
    console.error('未捕获的异常 (uncaughtException):', err.message);
    console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的 Promise 拒绝 (unhandledRejection):', reason);
});

// 环境变量配置 (移除硬编码)
const UPLOAD_URL = process.env.UPLOAD_URL || '';
const PROJECT_URL = process.env.PROJECT_URL || '';
const AUTO_ACCESS = process.env.AUTO_ACCESS === 'true';
// 使用绝对路径确保在不同环境下的一致性
const FILE_PATH = path.resolve(process.env.FILE_PATH || './tmp');
const SUB_PATH = process.env.SUB_PATH || 'xiaomao';
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const UUID = process.env.UUID || '';
const NEZHA_SERVER = process.env.NEZHA_SERVER || '';
const NEZHA_PORT = process.env.NEZHA_PORT || '';
const NEZHA_KEY = process.env.NEZHA_KEY || '';
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || '';
const ARGO_AUTH = process.env.ARGO_AUTH || '';
const ARGO_PORT = parseInt(process.env.ARGO_PORT) || 8001;
const CFIP = process.env.CFIP || 'cdns.doon.eu.org';
const CFPORT = process.env.CFPORT || 443;
const NAME = process.env.NAME || 'koyeb2';

// 运行目录准备
if (!fs.existsSync(FILE_PATH)) {
    fs.mkdirSync(FILE_PATH, { recursive: true });
}

function generateRandomName() {
    const characters = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

const npmName = generateRandomName();
const webName = generateRandomName();
const botName = generateRandomName();
const phpName = generateRandomName();
const npmPath = path.join(FILE_PATH, npmName);
const phpPath = path.join(FILE_PATH, phpName);
const webPath = path.join(FILE_PATH, webName);
const botPath = path.join(FILE_PATH, botName);
const subPath = path.join(FILE_PATH, 'sub.txt');
const listPath = path.join(FILE_PATH, 'list.txt');
const bootLogPath = path.join(FILE_PATH, 'boot.log');
const configPath = path.join(FILE_PATH, 'config.json');

// 获取isp信息
async function getMetaInfo() {
    try {
        const response1 = await axios.get('https://ipapi.co/json/', { timeout: 3000 });
        if (response1.data && response1.data.country_code && response1.data.org) {
            return response1.data.country_code + '_' + response1.data.org;
        }
    } catch (error) {
        try {
            const response2 = await axios.get('http://ip-api.com/json/', { timeout: 3000 });
            if (response2.data && response2.data.status === 'success' && response2.data.countryCode && response2.data.org) {
                return response2.data.countryCode + '_' + response2.data.org;
            }
        } catch (error) {
        }
    }
    return 'Unknown';
}

// 自动上传节点或订阅
async function uploadNodes() {
    if (UPLOAD_URL && PROJECT_URL) {
        const subscriptionUrl = PROJECT_URL + '/' + SUB_PATH;
        const jsonData = { subscription: [subscriptionUrl] };
        try {
            await axios.post(UPLOAD_URL + '/api/add-subscriptions', jsonData, {
                headers: { 'Content-Type': 'application/json' }
            });
            console.log('Subscription uploaded successfully');
        } catch (error) {
        }
    }
}

// 删除历史节点
async function deleteNodes() {
    try {
        if (!UPLOAD_URL || !fs.existsSync(subPath)) return;
        const fileContent = fs.readFileSync(subPath, 'utf-8');
        const decoded = Buffer.from(fileContent, 'base64').toString('utf-8');
        const nodes = decoded.split('\n').filter(line => /(vless|vmess|trojan):\/\//.test(line));
        if (nodes.length === 0) return;
        await axios.post(UPLOAD_URL + '/api/delete-nodes', JSON.stringify({ nodes }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
    }
}

// 自动访问项目URL
async function AddVisitTask() {
    if (!AUTO_ACCESS || !PROJECT_URL) return;
    try {
        await axios.post('https://oooo.serv00.net/add-url', { url: PROJECT_URL }, {
            headers: { 'Content-Type': 'application/json' }
        });
        console.log('Automatic access task added successfully');
    } catch (error) {
        console.error('Add automatic access task failed: ' + error.message);
    }
}

// 处理 TunnelSecret
function argoType() {
    if (ARGO_AUTH && ARGO_DOMAIN && ARGO_AUTH.includes('TunnelSecret')) {
        fs.writeFileSync(path.join(FILE_PATH, 'tunnel.json'), ARGO_AUTH);
        const tunnelYaml = 'tunnel: ' + ARGO_AUTH.split('"')[11] + '\ncredentials-file: ' + path.join(FILE_PATH, 'tunnel.json') + '\nprotocol: http2\ningress:\n  - hostname: ' + ARGO_DOMAIN + '\n    service: http://localhost:' + ARGO_PORT + '\n    originRequest:\n      noTLSVerify: true\n  - service: http_status:404';
        fs.writeFileSync(path.join(FILE_PATH, 'tunnel.yml'), tunnelYaml);
        console.log('TunnelSecret configuration generated');
    }
}

// 进程守护与按需恢复逻辑
async function keepAlive(name, filePath, command, args, delay = 5000) {
    console.log(`[${new Date().toISOString()}] 正在启动进程: ${name}`);

    if (!fs.existsSync(filePath)) {
        console.log(`检测到文件 ${filePath} 缺失，正在尝试恢复...`);
        await downloadFilesAndRun();
        if (!fs.existsSync(filePath)) {
            console.error(`恢复失败: 无法获取文件 ${filePath}，将在 ${delay}ms 后重试...`);
            setTimeout(() => keepAlive(name, filePath, command, args, delay), delay);
            return;
        }
        fs.chmodSync(filePath, 0o775);
    }

    const exeName = path.basename(command);
    try {
        const child = spawn('./' + exeName, args, {
            cwd: FILE_PATH,
            detached: false,
            stdio: 'inherit'
        });

        child.on('exit', (code, signal) => {
            console.log(`[${new Date().toISOString()}] 进程 ${name} 退出 (代码: ${code}, 信号: ${signal})，将在 ${delay}ms 后重启...`);
            setTimeout(() => keepAlive(name, filePath, command, args, delay), delay);
        });

        child.on('error', (err) => {
            console.error(`进程 ${name} 运行错误: ${err.message}`);
            // 发生错误时也尝试重启
            setTimeout(() => keepAlive(name, filePath, command, args, delay), delay);
        });
    } catch (err) {
        console.error(`无法启动进程 ${name}: ${err.message}`);
        setTimeout(() => keepAlive(name, filePath, command, args, delay), delay);
    }
}

// 下载逻辑 (保持原逻辑但优化)
function downloadFile(fileName, fileUrl) {
    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(fileName);
        axios({ method: 'get', url: fileUrl, responseType: 'stream' })
            .then(response => {
                response.data.pipe(writer);
                writer.on('finish', () => {
                    writer.close();
                    fs.chmodSync(fileName, 0o775);
                    console.log('下载成功: ' + path.basename(fileName));
                    resolve(fileName);
                });
                writer.on('error', err => {
                    fs.unlink(fileName, () => { });
                    reject(err);
                });
            })
            .catch(reject);
    });
}

function getSystemArchitecture() {
    const arch = os.arch();
    return (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') ? 'arm' : 'amd';
}

function getFilesForArchitecture(architecture) {
    const prefix = architecture === 'arm' ? "https://arm64.ssss.nyc.mn" : "https://amd64.ssss.nyc.mn";
    let files = [
        { fileName: webPath, fileUrl: prefix + '/web' },
        { fileName: botPath, fileUrl: prefix + '/bot' }
    ];
    if (NEZHA_SERVER && NEZHA_KEY) {
        if (NEZHA_PORT) {
            files.push({ fileName: npmPath, fileUrl: prefix + '/agent' });
        } else {
            files.push({ fileName: phpPath, fileUrl: prefix + '/v1' });
        }
    }
    return files;
}

async function downloadFilesAndRun() {
    const architecture = getSystemArchitecture();
    const filesToDownload = getFilesForArchitecture(architecture);
    for (const file of filesToDownload) {
        if (!fs.existsSync(file.fileName)) {
            try {
                await downloadFile(file.fileName, file.fileUrl);
            } catch (err) {
                console.error('下载失败 ' + file.fileName + ': ' + err.message);
            }
        }
    }
}

async function generateConfig() {
    const config = {
        log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
        inbounds: [
            { port: ARGO_PORT, protocol: 'vless', settings: { clients: [{ id: UUID }], decryption: 'none', fallbacks: [{ dest: PORT }, { path: "/vless-argo", dest: 3002 }, { path: "/vmess-argo", dest: 3003 }, { path: "/trojan-argo", dest: 3004 }] }, streamSettings: { network: 'tcp' } },
            { port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "tcp", security: "none" } },
            { port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/vless-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
            { port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID, alterId: 0 }] }, streamSettings: { network: "ws", wsSettings: { path: "/vmess-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
            { port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/trojan-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
        ],
        dns: { servers: ["https+local://8.8.8.8/dns-query"] },
        outbounds: [{ protocol: "freedom", tag: "direct" }, { protocol: "blackhole", tag: "block" }]
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

async function extractDomains() {
    if (ARGO_AUTH && ARGO_DOMAIN) {
        await generateLinks(ARGO_DOMAIN);
    } else {
        // 临时隧道逻辑
        let count = 0;
        const checkLog = async () => {
            if (fs.existsSync(bootLogPath)) {
                const content = fs.readFileSync(bootLogPath, 'utf-8');
                const match = content.match(/https?:\/\/([^ ]*trycloudflare\.com)\/?/);
                if (match) {
                    console.log('获取到临时域名: ' + match[1]);
                    await generateLinks(match[1]);
                    return;
                }
            }
            if (count++ < 20) setTimeout(checkLog, 2000);
        };
        checkLog();
    }
}

async function generateLinks(argoDomain) {
    const ISP = await getMetaInfo();
    const nodeName = NAME ? NAME + '-' + ISP : ISP;
    const VMESS = { v: '2', ps: nodeName, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'none', net: 'ws', type: 'none', host: argoDomain, path: '/vmess-argo?ed=2560', tls: 'tls', sni: argoDomain, alpn: '', fp: 'firefox' };
    const subTxt = '\nvless://' + UUID + '@' + CFIP + ':' + CFPORT + '?encryption=none&security=tls&sni=' + argoDomain + '&fp=firefox&type=ws&host=' + argoDomain + '&path=%2Fvless-argo%3Fed%3D2560#' + nodeName + '\n\nvmess://' + Buffer.from(JSON.stringify(VMESS)).toString('base64') + '\n\ntrojan://' + UUID + '@' + CFIP + ':' + CFPORT + '?security=tls&sni=' + argoDomain + '&fp=firefox&type=ws&host=' + argoDomain + '&path=%2Ftrojan-argo%3Fed%3D2560#' + nodeName + '\n    ';
    fs.writeFileSync(subPath, Buffer.from(subTxt).toString('base64'));

    app.get('/' + SUB_PATH, (req, res) => {
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.send(Buffer.from(subTxt).toString('base64'));
    });

    await uploadNodes();
}

async function startserver() {
    argoType();
    await deleteNodes();
    await downloadFilesAndRun();
    await generateConfig();

    // 启动哪吒
    if (NEZHA_SERVER && NEZHA_KEY) {
        if (!NEZHA_PORT) {
            const configYaml = 'client_secret: ' + NEZHA_KEY + '\nserver: ' + NEZHA_SERVER + '\nuuid: ' + UUID + '\ntls: true';
            fs.writeFileSync(path.join(FILE_PATH, 'config.yaml'), configYaml);
            keepAlive('nezha-v1', phpPath, phpPath, ['-c', 'config.yaml']);
        } else {
            keepAlive('nezha-v0', npmPath, npmPath, ['-s', NEZHA_SERVER + ':' + NEZHA_PORT, '-p', NEZHA_KEY, '--report-delay', '4']);
        }
    }

    // 启动 Xray
    keepAlive('xray', webPath, webPath, ['-c', 'config.json']);

    // 启动 Cloudflared
    let argoArgs = [];
    // 放宽正则：只要包含 eyJ 且长度足够即可认为是 Token
    if (ARGO_AUTH.indexOf('eyJ') !== -1 && ARGO_AUTH.length > 50) {
        argoArgs = ['tunnel', '--edge-ip-version', 'auto', '--no-autoupdate', '--protocol', 'http2', 'run', '--token', ARGO_AUTH];
    } else if (ARGO_AUTH.includes('TunnelSecret')) {
        argoArgs = ['tunnel', '--edge-ip-version', 'auto', '--config', 'tunnel.yml', 'run'];
    } else {
        argoArgs = ['tunnel', '--edge-ip-version', 'auto', '--no-autoupdate', '--protocol', 'http2', '--logfile', 'boot.log', '--url', 'http://localhost:' + ARGO_PORT];
    }
    keepAlive('cloudflared', botPath, botPath, argoArgs);

    await extractDomains();
    await AddVisitTask();
    keepWebAlive();
}

function keepWebAlive() {
    setInterval(() => {
        axios.get(`http://127.0.0.1:${PORT}`)
            .then(() => console.log('Keep-alive ping success'))
            .catch(e => console.error('Keep-alive ping failed: ' + e.message));
    }, 2 * 60 * 1000);
}

app.get("/", (req, res) => res.send("Hello world!"));
app.listen(PORT, () => console.log('Server running on port ' + PORT));

startserver().catch(console.error);
