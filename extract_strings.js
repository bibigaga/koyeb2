const fs = require('fs');
const content = fs.readFileSync('e:/AI/订阅/railway/index.js', 'utf-8');

// 提取 _0x2791 数组中的字符串
const arrayMatch = content.match(/const _0x1c7561=\[(.*?)\];/);
if (arrayMatch) {
    const strings = eval(`[${arrayMatch[1]}]`);
    console.log('--- Decoded Strings ---');
    strings.forEach((s, i) => {
        try {
            // 尝试 base64 解码，因为混淆器经常使用 base64
            const decoded = Buffer.from(s, 'base64').toString('utf-8');
            if (decoded.match(/[a-zA-Z0-9]/)) {
                console.log(`${i}: ${s} -> ${decoded}`);
            } else {
                console.log(`${i}: ${s}`);
            }
        } catch (e) {
            console.log(`${i}: ${s}`);
        }
    });
} else {
    console.log('Could not find string array');
}
