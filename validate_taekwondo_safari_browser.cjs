// Focused Safari-controller contract checks in an isolated Chromium profile.
// Safari UA and a synthetic native speech service reproduce event ordering;
// this is not physical iPad, WebKit, microphone, or live speech acceptance.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const root = __dirname;
const output = process.env.AUDIT_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'dojo-safari-'));
fs.mkdirSync(output, { recursive: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], exceptions = [];
const server = http.createServer((request, response) => {
    const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    fs.readFile(file, (error, bytes) => {
        if (error) { response.writeHead(404).end(); return; }
        response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
        response.end(bytes);
    });
});
let browser, socket, send, evaluate;
function pass(name) { checks.push(name); console.log('PASS ' + name); }
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const profile = fs.mkdtempSync(path.join(output, 'isolated-profile-'));
    browser = spawn(process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
        '--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox',
        '--disable-extensions', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
        '--remote-allow-origins=*', '--user-data-dir=' + profile, 'about:blank'
    ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let launchError;
    browser.on('error', error => { launchError = error; }); browser.stderr.on('data', () => {});
    let port;
    for (let index = 0; index < 120; index++) {
        if (launchError) throw launchError;
        try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; } catch (_) {}
        await pause(250);
    }
    assert.ok(port, 'Isolated browser starts');
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let serial = 0; const pending = new Map();
    socket.onmessage = event => {
        const message = JSON.parse(event.data), item = pending.get(message.id);
        if (item) { pending.delete(message.id); clearTimeout(item.timer); message.error ? item.reject(Error(JSON.stringify(message.error))) : item.resolve(message.result); }
        else if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
    };
    socket.onclose = () => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error('Browser closed')); } pending.clear(); };
    send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 30000);
        pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    evaluate = async expression => {
        const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
        return response.result.value;
    };
    const waitFor = async (expression, label = expression) => {
        for (let index = 0; index < 180; index++) { if (await evaluate(expression)) return; await pause(50); }
        throw Error('Timed out: ' + label);
    };
    const click = selector => evaluate(`(() => {const button=document.querySelector(${JSON.stringify(selector)});if(!button||button.disabled)throw Error('Unavailable '+${JSON.stringify(selector)});button.click();})()`);
    const snapshot = () => evaluate(`({save:JSON.parse(localStorage.getItem(DojoGame.SAVE_VERSION)),player:Number(document.querySelector('#player-health').getAttribute('aria-valuenow')),opponent:Number(document.querySelector('#opponent-health').getAttribute('aria-valuenow')),count:__native.starts,constructed:__native.instances.length,starts:__native.starts,stops:__native.stops,aborts:__native.aborts,overlaps:__native.overlaps,handsfree:document.querySelector('#handsfree-toggle').getAttribute('aria-pressed')==='true',status:document.querySelector('#voice-status').textContent,note:document.querySelector('#handsfree-status').textContent})`);
    const result = (transcript, final = true, index = -1) => evaluate(`(() => {const rec=__native.instances.at(${index}),group=Object.assign([{transcript:${JSON.stringify(transcript)},confidence:.99}],{isFinal:${final}});rec.onresult?.({resultIndex:0,results:[group]});})()`);
    const ready = count => waitFor(`__native.starts===${count}&&__native.instances.at(-1).ready`, 'Native listening ' + count);
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', platform: 'MacIntel' });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
        if(location.pathname.endsWith('/taekwondo.html'))localStorage.clear();
        Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5});
        window.__native={instances:[],starts:0,stops:0,aborts:0,overlaps:0};
        class NativeRecognition {
            constructor(){this.active=false;this.ready=false;__native.instances.push(this);}
            start(){if(__native.instances.some(rec=>rec!==this&&rec.active)){__native.overlaps++;throw Error('Native microphones overlapped');}this.active=true;__native.starts++;setTimeout(()=>{if(this.active){this.ready=true;this.onstart?.();}},30);}
            stop(){__native.stops++;this.ready=false;}
            abort(){__native.aborts++;this.ready=false;if(__native.releaseOnAbort)this.end();}
            end(){this.active=false;this.ready=false;this.onend?.();}
        }
        window.SpeechRecognition=window.webkitSpeechRecognition=NativeRecognition;
        let Voice;Object.defineProperty(window,'DojoVoice',{configurable:true,get:()=>Voice,set:Ctor=>{Voice=class extends Ctor{constructor(options){super(options);window.__voice=this;}};}});
    ` });
    const address = 'http://127.0.0.1:' + server.address().port + '/taekwondo.html';
    async function fresh() {
        await send('Page.navigate', { url: address });
        await waitFor(`document.documentElement.dataset.dojoReady==='true'`);
        await click('#start-button');
        await waitFor(`!document.querySelector('#challenge-panel').hidden`);
        assert.equal(await evaluate('__voice.safariMode'), true);
    }
    await fresh(); await click('#handsfree-toggle'); await ready(1);
    let before = await snapshot(); const firstPrompt = before.save.question.prompt;
    assert.equal(await evaluate('__native.instances[0].lang'), 'ja-JP');
    await result(firstPrompt, false); await pause(350);
    assert.equal((await snapshot()).stops, 0);
    await evaluate('__native.instances[0].onspeechend?.();__native.instances[0].onaudioend?.()');
    await pause(3500); let state = await snapshot();
    assert.equal(state.stops, 0); assert.equal(state.player, before.player); assert.equal(state.opponent, before.opponent);
    await evaluate('window.__staleFinal=__native.instances[0].onresult');
    await result(firstPrompt); await pause(650); state = await snapshot();
    assert.ok(state.opponent < before.opponent); assert.equal(state.player, before.player);
    assert.equal(state.count, 1); assert.equal(state.aborts, 0); assert.equal(state.handsfree, true);
    await evaluate('__native.instances[0].end()'); await ready(2);
    const secondBefore = await snapshot();
    await evaluate(`__staleFinal({resultIndex:0,results:[Object.assign([{transcript:${JSON.stringify(firstPrompt)},confidence:.99}],{isFinal:true})]})`);
    state = await snapshot(); assert.equal(state.opponent, secondBefore.opponent); assert.deepEqual(state.save.question, secondBefore.save.question);
    pass('Desktop-UA iPad uses Japanese Safari policy; native endpointing tolerates a late final and serializes the next prompt without stale scoring');

    before = await snapshot();
    await evaluate(`__native.instances[1].onerror?.({error:'aborted'})`); await pause(300);
    state = await snapshot(); assert.equal(state.count, 2); assert.equal(state.handsfree, true);
    await evaluate('__native.instances[1].end()'); await ready(3);
    state = await snapshot(); assert.equal(state.player, before.player); assert.equal(state.opponent, before.opponent); assert.deepEqual(state.save.question, before.save.question); assert.equal(state.overlaps, 0);
    pass('One Safari interruption reconnects hands-free after native release without consuming the question or health');

    before = await snapshot(); await result(before.save.question.prompt); await pause(650);
    await click('#handsfree-toggle');
    await evaluate('__native.instances[2].end()'); await pause(500);
    state = await snapshot(); assert.equal(state.count, 3); assert.equal(state.handsfree, false); assert.equal(state.overlaps, 0);
    pass('Stopping hands-free while a completed native session is releasing cancels the queued microphone');

    await fresh(); await click('#handsfree-toggle'); await ready(1);
    before = await snapshot(); await result(before.save.question.prompt); await pause(4800);
    state = await snapshot(); assert.equal(state.count, 1); assert.equal(state.handsfree, false);
    assert.equal(state.overlaps, 0); assert.equal(state.aborts, 1); assert.equal(state.player, before.player);
    assert.match(state.note, /tap|press Start hands-free/i);
    pass('A native microphone that never ends is bounded, never overlaps, and requests a new tap without an extra penalty');

    await fresh(); await click('#handsfree-toggle'); await ready(1); before = await snapshot();
    await evaluate(`__native.instances[0].onerror?.({error:'network'})`); await pause(1000); state = await snapshot();
    assert.equal(state.count, 1); assert.equal(state.handsfree, false); assert.equal(state.player, before.player); assert.equal(state.opponent, before.opponent); assert.deepEqual(state.save.question, before.save.question);
    assert.equal(exceptions.length, 0);
    pass('Service errors stop automatic retry with no damage, question replacement, or browser exception');

    await fresh(); await click('#handsfree-toggle'); await ready(1);
    for (let index = 0; index < 3; index++) {
        before = await snapshot(); await result(before.save.question.prompt); await pause(650);
        state = await snapshot(); assert.equal(state.count, index + 1); assert.equal(state.handsfree, true);
        assert.equal(state.player, before.player); assert.ok(state.opponent < before.opponent);
        await evaluate(`__native.instances[${index}].end()`); await ready(index + 2);
    }
    assert.equal((await snapshot()).overlaps, 0);
    pass('Three successive Safari reading answers continue from one hands-free tap with delayed native end on every turn');

    await fresh(); await click('#handsfree-toggle'); await ready(1); before = await snapshot();
    await evaluate(`__native.instances[0].onerror?.({error:'aborted'});__native.instances[0].end()`); await ready(2);
    await evaluate(`__native.instances[1].onerror?.({error:'aborted'});__native.instances[1].end()`); await pause(1200);
    state = await snapshot(); assert.equal(state.count, 2); assert.equal(state.handsfree, false);
    assert.equal(state.player, before.player); assert.equal(state.opponent, before.opponent); assert.deepEqual(state.save.question, before.save.question);
    pass('Repeated Safari interruptions stop after one automatic reconnect instead of looping');

    await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 2, mobile: true });
    await fresh();
    const controls = await evaluate(`['#question-glyph','#handsfree-toggle','#listen-button','#voice-status'].map(selector=>{const element=document.querySelector(selector),rect=element.getBoundingClientRect();return {selector,x:rect.x,y:rect.y,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height};})`);
    for (const control of controls) { assert.ok(control.width > 0 && control.height > 0, control.selector + ' visible'); assert.ok(control.x >= 0 && control.y >= 0 && control.right <= 1024.5 && control.bottom <= 768.5, control.selector + ' reachable'); }
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(output, 'safari-ipad-reading-1024x768.png'), Buffer.from(screenshot.data, 'base64'));
    pass('Safari reading prompt, hands-free, microphone, and status remain within the 1024 by 768 tablet viewport');

    await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', platform: 'Win32' });
    await send('Page.navigate', { url: address }); await waitFor(`document.documentElement.dataset.dojoReady==='true'`);
    assert.equal(await evaluate('__voice.safariMode'), false);
    await evaluate('__native.releaseOnAbort=true'); await click('#start-button'); await click('#handsfree-toggle'); await ready(1);
    before = await snapshot(); await result(before.save.question.prompt, false); await pause(250);
    assert.equal((await snapshot()).stops, 1, 'Chrome retains its 200ms stable hypothesis endpoint');
    await result(before.save.question.prompt); await ready(2); state = await snapshot();
    assert.equal(state.handsfree, true); assert.equal(state.player, before.player); assert.ok(state.opponent < before.opponent); assert.equal(state.overlaps, 0);
    pass('Desktop Chrome retains its fast interim endpoint and automatic next microphone after a final');
    assert.equal(exceptions.length, 0);
    const sources = Object.fromEntries(['taekwondo-voice.js', 'taekwondo.js', 'taekwondo.html'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')).digest('hex')]));
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ checks, exceptions, controls, scope: 'Synthetic Safari native lifecycle in isolated Chromium; no physical WebKit or real microphone claim', sources }, null, 2));
    console.log('\n' + checks.length + ' focused Safari controller checks passed. Evidence: ' + output);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
    if (socket) socket.close(); if (browser && browser.exitCode === null) browser.kill();
    await new Promise(resolve => server.close(resolve));
});
