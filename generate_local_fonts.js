// Download Google Fonts (Nunito + Noto Sans JP) for local/offline hosting:
// fetches the CSS with a woff2-capable UA, downloads every referenced woff2
// into fonts/, and writes fonts/fonts.css with local URLs.
const fs = require('fs');
const https = require('https');
const path = require('path');

const CSS_URL = 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Noto+Sans+JP:wght@400;700&display=swap';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function fetchUrl(url, binary) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': UA } }, res => {
            if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode + ' ' + url)); }
            const chunks = [];
            res.on('data', d => chunks.push(d));
            res.on('end', () => resolve(binary ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')));
        }).on('error', reject);
    });
}

async function main() {
    if (!fs.existsSync('fonts')) fs.mkdirSync('fonts');
    let css = await fetchUrl(CSS_URL, false);
    const urls = [...new Set([...css.matchAll(/url\((https:[^)]+\.woff2)\)/g)].map(m => m[1]))];
    console.log('woff2 files to download:', urls.length);
    let total = 0;
    for (let i = 0; i < urls.length; i += 8) {
        const batch = urls.slice(i, i + 8);
        await Promise.all(batch.map(async u => {
            const name = u.replace('https://fonts.gstatic.com/s/', '').replace(/\//g, '_');
            const buf = await fetchUrl(u, true);
            fs.writeFileSync(path.join('fonts', name), buf);
            total += buf.length;
            css = css.split(u).join(name);
        }));
        process.stdout.write('\r' + Math.min(i + 8, urls.length) + '/' + urls.length);
    }
    console.log('');
    fs.writeFileSync('fonts/fonts.css', css);
    console.log('done:', urls.length, 'files,', Math.round(total / 1024) + 'KB total');
}
main();
