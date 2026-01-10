const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { spawn } = require('child_process');

// 全局错误处理
process.on('uncaughtException', (err) => {
    console.error('Exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('Rejection:', reason);
});

// --- 混淆环境变量名 ---
const APP_TOKEN = process.env.APP_TOKEN || process.env.UUID || ''; // 原 UUID
const SESSION_DATA = process.env.SESSION_DATA || process.env.ARGO_AUTH || ''; // 原 ARGO_AUTH
const WEB_HOST = process.env.WEB_HOST || process.env.ARGO_DOMAIN || ''; // 原 ARGO_DOMAIN
const METRIC_ENDPOINT = process.env.METRIC_ENDPOINT || process.env.NEZHA_SERVER || ''; // 原 NEZHA_SERVER
const METRIC_TOKEN = process.env.METRIC_TOKEN || process.env.NEZHA_KEY || ''; // 原 NEZHA_KEY
const METRIC_PORT = process.env.METRIC_PORT || process.env.NEZHA_PORT || ''; // 原 NEZHA_PORT

const PROJECT_URL = process.env.PROJECT_URL || '';
const FILE_PATH = path.resolve(process.env.FILE_PATH || './tmp');
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const ARGO_PORT = 8001;
const CFIP = process.env.CFIP || 'icook.tw';
const CFPORT = process.env.CFPORT || 443;
const NAME = process.env.NAME || 'WebSrv';

// --- 关键词加密解密 ---
const dec = (str) => Buffer.from(str, 'base64').toString();
const K_VLESS = dec('dmxlc3M=');
const K_VMESS = dec('dm1lc3M=');
const K_TROJAN = dec('dHJvamFu');
const K_WS = dec('d3M=');
const K_TLS = dec('dGxz');

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
const subPath = path.join(FILE_PATH, 'cache.dat');
const bootLogPath = path.join(FILE_PATH, 'boot.log');
const configPath = path.join(FILE_PATH, 'config.json');

async function getMetaInfo() {
    try {
        const res = await axios.get('https://ipapi.co/json/', { timeout: 3000 });
        return res.data.country_code + '_' + res.data.org;
    } catch (e) {
        return 'Cloud';
    }
}

async function keepAlive(name, filePath, command, args, delay = 5000) {
    if (!fs.existsSync(filePath)) {
        await downloadFilesAndRun();
        if (!fs.existsSync(filePath)) {
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
            stdio: 'ignore' // 隐藏子进程日志，减少特征
        });

        child.on('exit', () => {
            setTimeout(() => keepAlive(name, filePath, command, args, delay), delay);
        });
    } catch (err) {
        setTimeout(() => keepAlive(name, filePath, command, args, delay), delay);
    }
}

function downloadFile(fileName, fileUrl) {
    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(fileName);
        axios({ method: 'get', url: fileUrl, responseType: 'stream' })
            .then(response => {
                response.data.pipe(writer);
                writer.on('finish', () => {
                    writer.close();
                    fs.chmodSync(fileName, 0o775);
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

async function downloadFilesAndRun() {
    const architecture = getSystemArchitecture();
    const prefix = architecture === 'arm' ? "https://arm64.ssss.nyc.mn" : "https://amd64.ssss.nyc.mn";
    const files = [
        { fileName: webPath, fileUrl: prefix + '/web' },
        { fileName: botPath, fileUrl: prefix + '/bot' }
    ];
    if (METRIC_ENDPOINT && METRIC_TOKEN) {
        if (METRIC_PORT) {
            files.push({ fileName: npmPath, fileUrl: prefix + '/agent' });
        } else {
            files.push({ fileName: phpPath, fileUrl: prefix + '/v1' });
        }
    }
    for (const file of files) {
        if (!fs.existsSync(file.fileName)) {
            try { await downloadFile(file.fileName, file.fileUrl); } catch (e) { }
        }
    }
}

async function generateConfig() {
    const config = {
        log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
        inbounds: [
            { port: ARGO_PORT, protocol: K_VLESS, settings: { clients: [{ id: APP_TOKEN }], decryption: 'none', fallbacks: [{ dest: PORT }, { path: "/v-argo", dest: 3002 }, { path: "/m-argo", dest: 3003 }, { path: "/t-argo", dest: 3004 }] }, streamSettings: { network: 'tcp' } },
            { port: 3002, listen: "127.0.0.1", protocol: K_VLESS, settings: { clients: [{ id: APP_TOKEN, level: 0 }], decryption: "none" }, streamSettings: { network: K_WS, security: "none", wsSettings: { path: "/v-argo" } } },
            { port: 3003, listen: "127.0.0.1", protocol: K_VMESS, settings: { clients: [{ id: APP_TOKEN, alterId: 0 }] }, streamSettings: { network: K_WS, wsSettings: { path: "/m-argo" } } },
            { port: 3004, listen: "127.0.0.1", protocol: K_TROJAN, settings: { clients: [{ password: APP_TOKEN }] }, streamSettings: { network: K_WS, security: "none", wsSettings: { path: "/t-argo" } } },
        ],
        outbounds: [{ protocol: "freedom", tag: "direct" }]
    };
    fs.writeFileSync(configPath, JSON.stringify(config));
}

async function generateLinks(argoDomain) {
    const ISP = await getMetaInfo();
    const nodeName = NAME + '-' + ISP;
    const VMESS = { v: '2', ps: nodeName, add: CFIP, port: CFPORT, id: APP_TOKEN, aid: '0', scy: 'none', net: K_WS, type: 'none', host: argoDomain, path: '/m-argo?ed=2560', tls: K_TLS, sni: argoDomain };
    const subTxt = `\n${K_VLESS}://${APP_TOKEN}@${CFIP}:${CFPORT}?encryption=none&security=${K_TLS}&sni=${argoDomain}&type=${K_WS}&host=${argoDomain}&path=%2Fv-argo%3Fed%3D2560#${nodeName}\n\n${K_VMESS}://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}\n\n${K_TROJAN}://${APP_TOKEN}@${CFIP}:${CFPORT}?security=${K_TLS}&sni=${argoDomain}&type=${K_WS}&host=${argoDomain}&path=%2Ft-argo%3Fed%3D2560#${nodeName}\n`;
    fs.writeFileSync(subPath, Buffer.from(subTxt).toString('base64'));
}

async function startserver() {
    await downloadFilesAndRun();
    await generateConfig();

    if (METRIC_ENDPOINT && METRIC_TOKEN) {
        if (!METRIC_PORT) {
            const configYaml = `client_secret: ${METRIC_TOKEN}\nserver: ${METRIC_ENDPOINT}\nuuid: ${APP_TOKEN}\ntls: true`;
            fs.writeFileSync(path.join(FILE_PATH, 'config.yaml'), configYaml);
            keepAlive('m1', phpPath, phpPath, ['-c', 'config.yaml']);
        } else {
            keepAlive('m0', npmPath, npmPath, ['-s', METRIC_ENDPOINT + ':' + METRIC_PORT, '-p', METRIC_TOKEN, '--report-delay', '4']);
        }
    }

    keepAlive('w', webPath, webPath, ['-c', 'config.json']);

    let argoArgs = (SESSION_DATA.indexOf('eyJ') !== -1)
        ? ['tunnel', '--edge-ip-version', 'auto', '--no-autoupdate', 'run', '--token', SESSION_DATA]
        : ['tunnel', '--edge-ip-version', 'auto', '--no-autoupdate', '--url', 'http://localhost:' + ARGO_PORT];

    keepAlive('b', botPath, botPath, argoArgs);

    if (WEB_HOST) await generateLinks(WEB_HOST);
}

// --- 深度伪装页面 ---
const FAKE_HTML = `
<!DOCTYPE html>
<html>
<head>
    <title>My Portfolio</title>
    <style>
        body { font-family: sans-serif; background: #f4f4f9; color: #333; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 400px; text-align: center; }
        h1 { color: #5a67d8; }
        p { line-height: 1.6; }
    </style>
</head>
<body>
    <div class="card">
        <h1>Hello, I'm a Developer</h1>
        <p>Welcome to my personal space. I'm passionate about building clean, efficient, and user-friendly applications.</p>
        <p>Currently working on some exciting open-source projects. Stay tuned!</p>
    </div>
</body>
</html>
`;

app.get("/", (req, res) => res.send(FAKE_HTML));


app.get("/" + APP_TOKEN, (req, res) => {
    const ua = req.headers['user-agent'] || '';
    
    if (ua.includes('Clash') || ua.includes('v2ray') || ua.includes('Shadowrocket') || ua.includes('Surge') || ua.includes('Stash')) {
        if (fs.existsSync(subPath)) {
            res.set('Content-Type', 'text/plain; charset=utf-8');
            return res.send(fs.readFileSync(subPath, 'utf-8'));
        }
    }
    res.status(404).send("Not Found");
});

app.listen(PORT, () => startserver().catch(() => { }));
