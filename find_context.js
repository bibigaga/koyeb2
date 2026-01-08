const fs = require('fs');
const content = fs.readFileSync('e:/AI/订阅/railway/index.js', 'utf-8');

function findContext(searchTerm, contextSize = 500) {
    const index = content.indexOf(searchTerm);
    if (index === -1) return 'Not found';
    const start = Math.max(0, index - contextSize);
    const end = Math.min(content.length, index + searchTerm.length + contextSize);
    return content.substring(start, end);
}

console.log('--- Context of botPath ---');
console.log(findContext('botPath'));

console.log('\n--- Context of argoType ---');
console.log(findContext('argoType'));

console.log('\n--- Context of nohup ---');
console.log(findContext('nohup'));
