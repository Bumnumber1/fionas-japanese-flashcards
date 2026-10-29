// Safari lifecycle contracts in isolated Chromium, with real CDP touch input.
// Native audio and cumulative recognizer events are synthetic. This does not
// establish physical Safari, iPad microphone, speech-service, or audio quality.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const root = __dirname;
const output = process.env.AUDIT_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'dojo-safari-live-'));
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
        for (let index = 0; index < 200; index++) { if (await evaluate(expression)) return; await pause(50); }
        throw Error('Timed out: ' + label);
    };
    const tap = async selector => {
        const point = await evaluate(`(() => {const button=document.querySelector(${JSON.stringify(selector)});if(!button||button.disabled||!button.getClientRects().length)throw Error('Unavailable '+${JSON.stringify(selector)});button.scrollIntoView({block:'nearest',inline:'nearest'});const r=button.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 81, radiusX: 3, radiusY: 3, force: .7 }] });
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const snapshot = () => evaluate(`({save:JSON.parse(localStorage.getItem(DojoGame.SAVE_VERSION)),player:Number(document.querySelector('#player-health').getAttribute('aria-valuenow')),opponent:Number(document.querySelector('#opponent-health').getAttribute('aria-valuenow')),starts:__native.starts,constructed:__native.instances.length,stops:__native.stops,aborts:__native.aborts,overlaps:__native.overlaps,handsfree:document.querySelector('#handsfree-toggle').getAttribute('aria-pressed')==='true',status:document.querySelector('#voice-status').textContent,note:document.querySelector('#handsfree-status').textContent,recovery:!document.querySelector('#voice-recovery').hidden,capture:__voice.captureActive,audioResumes:__audio.resumes,diagnostics:__voice.getDiagnostics()})`);
    const result = (groups, resultIndex = 0, instance = -1) => evaluate(`__native.instances.at(${instance}).emit(${JSON.stringify(groups)},${resultIndex})`);
    const ready = starts => waitFor(`__native.starts===${starts}&&__native.instances.at(-1).ready&&/Listening/.test(document.querySelector('#voice-status').textContent)`, 'Audio capture ready after ' + starts + ' native starts');
    const nextQuestion = id => waitFor(`JSON.parse(localStorage.getItem(DojoGame.SAVE_VERSION)).phase==='question'&&JSON.parse(localStorage.getItem(DojoGame.SAVE_VERSION)).question.id!==${JSON.stringify(id)}&&__voice.getDiagnostics().stream?.armed===true`, 'A new question armed for its own speech');
    const screenshot = async name => {
        const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(image.data, 'base64'));
    };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', platform: 'MacIntel' });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
        if(location.pathname.endsWith('/taekwondo.html'))localStorage.clear();
        Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5});
        window.__native={instances:[],starts:0,stops:0,aborts:0,overlaps:0,audioDelay:180,dropEnd:false,holdAudioAfterAbort:false,finalizeOnStop:false};
        window.__audio={resumes:0,constructs:0,suspends:0};
        const Audio=window.AudioContext||window.webkitAudioContext;
        if(Audio){window.AudioContext=class extends Audio{constructor(...args){super(...args);__audio.constructs++;}resume(){__audio.resumes++;return super.resume();}suspend(){__audio.suspends++;return super.suspend();}};}
        class NativeRecognition {
            constructor(){this.active=false;this.ready=false;this.history=[];__native.instances.push(this);}
            start(){if(__native.instances.some(rec=>rec!==this&&rec.active)){__native.overlaps++;throw new DOMException('Synthetic audio lease is still held','InvalidStateError');}this.active=true;this.activated=Boolean(navigator.userActivation?.isActive);__native.starts++;setTimeout(()=>{if(this.active)this.onstart?.();},30);setTimeout(()=>{if(this.active){this.ready=true;this.onaudiostart?.();}},__native.audioDelay);}
            emit(groups,resultIndex=0){this.history=groups;const results=groups.map(([words,final=true])=>Object.assign((Array.isArray(words)?words:[words]).map(transcript=>({transcript,confidence:.8})),{isFinal:final}));this.onresult?.({resultIndex,results});}
            stop(){__native.stops++;this.ready=false;if(__native.finalizeOnStop){setTimeout(()=>this.emit(this.history.map(([words])=>[words,true]),Math.max(0,this.history.length-1)),40);setTimeout(()=>this.end(),160);}}
            abort(){__native.aborts++;this.ready=false;if(!__native.holdAudioAfterAbort)this.active=false;if(!__native.dropEnd)setTimeout(()=>this.end(),20);}
            end(){this.active=false;this.ready=false;this.onaudioend?.();this.onend?.();}
        }
        window.SpeechRecognition=window.webkitSpeechRecognition=NativeRecognition;
        let Voice;Object.defineProperty(window,'DojoVoice',{configurable:true,get:()=>Voice,set:Ctor=>{Voice=class extends Ctor{constructor(options){super(options);window.__voice=this;}};}});
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedMicDetails=text;}}});
    ` });
    const address = 'http://127.0.0.1:' + server.address().port + '/taekwondo.html';
    async function fresh(safari = true) {
        await send('Page.navigate', { url: address });
        await waitFor(`document.documentElement.dataset.dojoReady==='true'`);
        await tap('#start-button'); await waitFor(`!document.querySelector('#challenge-panel').hidden`);
        assert.equal(await evaluate('__voice.safariMode'), safari);
    }

    await fresh(); await evaluate('__native.audioDelay=900'); await tap('#handsfree-toggle');
    await pause(100); let state = await snapshot();
    assert.equal(state.starts, 1); assert.doesNotMatch(state.status, /^Listening/);
    assert.equal(await evaluate('__native.instances[0].activated'), true, 'First capture opens inside a real CDP touch activation');
    await ready(1); assert.equal(await evaluate('__native.instances[0].continuous'), true); assert.equal(await evaluate('__native.instances[0].lang'), 'ja-JP');
    pass('A real touch starts one Japanese continuous session; task start is not presented as audio readiness');

    let before = await snapshot(), groups = [[before.save.question.prompt, false]];
    await result(groups); await pause(120); state = await snapshot();
    assert.equal(state.opponent, before.opponent); assert.equal(state.player, before.player);
    groups[0][1] = true; await result(groups);
    let after = await snapshot(); assert.ok(after.opponent < before.opponent); assert.equal(after.player, before.player);
    groups.push(['ねこ', false]); await result(groups, 1);
    await nextQuestion(before.save.question.id); before = await snapshot();
    groups[1][1] = true; await result(groups, 1); after = await snapshot();
    assert.equal(after.opponent, before.opponent); assert.deepEqual(after.save.question, before.save.question);
    groups.push([before.save.question.prompt, false]); await result(groups, 2); groups[2][1] = true; await result(groups, 2);
    after = await snapshot(); assert.ok(after.opponent < before.opponent); assert.equal(after.player, before.player);
    await nextQuestion(before.save.question.id); before = await snapshot();
    await result(groups, 0); after = await snapshot(); assert.equal(after.opponent, before.opponent);
    groups.push([before.save.question.prompt, false]); await result(groups, 3); groups[3][1] = true; await result(groups, 3); after = await snapshot();
    assert.ok(after.opponent < before.opponent); assert.equal(after.player, before.player);
    assert.equal(after.starts, 1); assert.equal(after.constructed, 1); assert.equal(after.stops, 0); assert.equal(after.aborts, 0); assert.equal(after.overlaps, 0);
    assert.equal(after.handsfree, true);
    pass('Three answers share one microphone; cumulative replays, resultIndex zero, and feedback speech cannot answer a later question');

    await nextQuestion(before.save.question.id); before = await snapshot();
    const wrong = before.save.question.prompt === 'あ' ? 'か' : 'あ';
    groups.push([wrong, false]); await result(groups, groups.length - 1); groups.at(-1)[1] = true; await result(groups, groups.length - 1); after = await snapshot();
    assert.equal(after.player, before.player); assert.equal(after.opponent, before.opponent); assert.ok(after.save.fight.pendingDamage > 0);
    await nextQuestion(before.save.question.id); before = await snapshot();
    groups.push([before.save.question.prompt, false]); await result(groups, groups.length - 1); groups.at(-1)[1] = true; await result(groups, groups.length - 1); after = await snapshot();
    assert.equal(after.player, before.player); assert.equal(after.save.fight.pendingDamage, 0); assert.equal(after.starts, 1);
    pass('A genuine wrong kana still queues a block, and a new final in the same stream blocks without damage');

    await nextQuestion(before.save.question.id); before = await snapshot();
    await tap('#pause-button'); await waitFor(`document.querySelector('#pause-dialog').open`); await pause(100);
    assert.equal((await snapshot()).capture, false); assert.ok((await snapshot()).aborts > 0);
    await tap('#resume-button'); await ready(2); after = await snapshot();
    assert.equal(after.player, before.player); assert.equal(after.opponent, before.opponent); assert.deepEqual(after.save.question, before.save.question);
    pass('Pause aborts the persistent capture; resume starts one new lease with the same question and health');

    await fresh(); await tap('#sound-toggle');
    assert.equal((await snapshot()).save.soundEnabled, true);
    await tap('#handsfree-toggle'); await ready(1); before = await snapshot();
    const resumesBefore = before.audioResumes;
    await result([[before.save.question.prompt, true]]); await nextQuestion(before.save.question.id);
    before = await snapshot(); assert.equal(before.save.soundEnabled, true); assert.equal(before.audioResumes, resumesBefore);
    await evaluate('__native.dropEnd=true;window.__staleSpeech=__native.instances[0].onresult');
    await result([['rewritten immutable result', true]]); await waitFor(`!document.querySelector('#voice-recovery').hidden`);
    after = await snapshot(); assert.equal(after.player, before.player); assert.equal(after.opponent, before.opponent); assert.deepEqual(after.save.question, before.save.question);
    await tap('#reconnect-mic'); await ready(2); after = await snapshot();
    assert.equal(after.save.soundEnabled, true); assert.equal(after.player, before.player); assert.equal(after.opponent, before.opponent); assert.deepEqual(after.save.question, before.save.question);
    await evaluate(`__staleSpeech({resultIndex:0,results:[Object.assign([{transcript:${JSON.stringify(before.save.question.prompt)},confidence:.8}],{isFinal:true})]})`);
    assert.equal((await snapshot()).opponent, before.opponent);
    assert.equal(after.overlaps, 0); assert.equal(after.audioResumes, resumesBefore);
    pass('History corruption offers a real reconnect that clears a dropped-end lock, preserves health/question, and retains Sound on without output/mic churn');

    await tap('#mic-details-button'); await waitFor(`document.querySelector('#mic-details-dialog').open`);
    const details = await evaluate(`document.querySelector('#mic-diagnostics').value`);
    assert.match(details, /2026-10-29\s+safari-live-1/); assert.equal(details.includes(before.save.question.prompt), false);
    await tap('#copy-mic-details'); assert.equal(await evaluate('__copiedMicDetails'), details);
    await screenshot('safari-microphone-diagnostics');
    await tap('#mic-details-dialog .primary[data-close]');
    pass('Microphone details identify the deployed build and copy lifecycle metadata without the answer or recorded audio');

    await fresh(); await tap('#handsfree-toggle'); await ready(1); before = await snapshot();
    const priorPrompt = before.save.question.prompt;
    await result([[priorPrompt, false]]); await result([[priorPrompt, true]]); await nextQuestion(before.save.question.id);
    before = await snapshot();
    await result([[priorPrompt, true], [before.save.question.prompt, true]], 1);
    after = await snapshot(); assert.equal(after.opponent, before.opponent); assert.equal(after.player, before.player); assert.deepEqual(after.save.question, before.save.question);
    await waitFor(`__voice.getDiagnostics().stream?.armed===true`, 'The same ambiguous question re-arms for a fresh utterance');
    await result([[priorPrompt, true], [before.save.question.prompt, true], [before.save.question.prompt, false]], 2);
    await result([[priorPrompt, true], [before.save.question.prompt, true], [before.save.question.prompt, true]], 2);
    after = await snapshot(); assert.ok(after.opponent < before.opponent); assert.equal(after.player, before.player); assert.equal(after.starts, 1);
    pass('A newly seen late final after rearm stays inconclusive; a fresh interim and final retry the same question without a penalty');

    await fresh(); await tap('#handsfree-toggle'); await ready(1); before = await snapshot();
    await result([[before.save.question.prompt, false]]); await result([[before.save.question.prompt, true]]);
    await evaluate('__native.instances[0].end()'); await ready(2); after = await snapshot();
    assert.equal(after.handsfree, true); assert.equal(after.recovery, false); assert.ok(after.opponent < before.opponent); assert.equal(after.player, before.player); assert.equal(after.overlaps, 0);
    pass('A Safari service that cleanly ends after a correct answer can open the next capture without stopping hands-free');

    await fresh(); await evaluate('__native.finalizeOnStop=true'); await tap('#handsfree-toggle'); await ready(1); before = await snapshot();
    await result([[before.save.question.prompt, false]]); await ready(2); after = await snapshot();
    assert.equal(after.handsfree, true); assert.equal(after.recovery, false); assert.ok(after.opponent < before.opponent); assert.equal(after.player, before.player); assert.equal(after.overlaps, 0);
    pass('A conservative stop followed by a genuine final and native end also continues the next hands-free question');

    await fresh(); await tap('#handsfree-toggle'); await ready(1); before = await snapshot();
    await evaluate(`__native.dropEnd=true;__native.holdAudioAfterAbort=true;__native.instances[0].onerror?.({error:'network',message:'Synthetic speech service unavailable'})`);
    await waitFor(`!document.querySelector('#voice-recovery').hidden`); await tap('#reconnect-mic'); await pause(900);
    after = await snapshot(); assert.equal(after.starts, 1); assert.equal(after.handsfree, false); assert.equal(after.recovery, true);
    assert.doesNotMatch(after.status, /^Listening/); assert.equal(after.player, before.player); assert.equal(after.opponent, before.opponent); assert.deepEqual(after.save.question, before.save.question);
    pass('If native audio truly remains busy, reconnect reports failure instead of manufacturing Listening or consuming an answer');

    await fresh(); await evaluate('__native.finalizeOnStop=true'); await tap('#listen-button'); await ready(1); before = await snapshot();
    await result([[before.save.question.prompt, false]]); await pause(500);
    assert.equal((await snapshot()).stops, 0); assert.equal((await snapshot()).opponent, before.opponent);
    await waitFor(`JSON.parse(localStorage.getItem(DojoGame.SAVE_VERSION)).phase==='answered'`, 'Native final produced only by a conservative stop request');
    after = await snapshot(); assert.equal(after.stops, 1); assert.ok(after.opponent < before.opponent); assert.equal(after.player, before.player);
    assert.equal(after.handsfree, false);
    pass('Single-answer mode can finalize interim-only Safari speech through a conservative stop, without ever grading the interim');

    await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 2, mobile: true });
    await fresh(); await tap('#handsfree-toggle'); await ready(1); before = await snapshot();
    await evaluate(`__native.instances[0].onerror?.({error:'not-allowed',message:'Synthetic permission refusal'})`);
    await waitFor(`!document.querySelector('#voice-recovery').hidden`);
    const controls = await evaluate(`['#question-glyph','#handsfree-toggle','#listen-button','#voice-status','#reconnect-mic','#reload-fight','#mic-details-button'].map(selector=>{const element=document.querySelector(selector),rect=element.getBoundingClientRect();return {selector,x:rect.x,y:rect.y,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height};})`);
    for (const control of controls) assert.ok(control.width > 0 && control.height > 0, control.selector + ' visible');
    const recoveryAccess = await evaluate(`(() => {const card=document.querySelector('.practice-card'),button=document.querySelector('#mic-details-button');button.scrollIntoView({block:'nearest'});const r=button.getBoundingClientRect();return {bottom:r.bottom,top:r.top,scrollY,overflow:getComputedStyle(card).overflowY};})()`);
    assert.ok(recoveryAccess.top >= 0 && recoveryAccess.bottom <= 768.5); assert.equal(recoveryAccess.scrollY, 0); assert.equal(recoveryAccess.overflow, 'auto');
    for (const target of controls.filter(control => ['#reconnect-mic','#reload-fight','#mic-details-button'].includes(control.selector))) assert.ok(target.height >= 43.5 && target.width >= 43.5);
    await screenshot('safari-ipad-recovery-1024x768');
    pass('Safari recovery remains reachable inside the 1024 by 768 lesson panel with 44px actions and no page scroll');

    await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', platform: 'Win32' });
    await fresh(false); await evaluate('__native.finalizeOnStop=true'); await tap('#handsfree-toggle'); await ready(1); before = await snapshot();
    assert.equal(await evaluate('__native.instances[0].continuous'), false);
    await result([[before.save.question.prompt, false]]); await ready(2); after = await snapshot();
    assert.equal(after.handsfree, true); assert.equal(after.player, before.player); assert.ok(after.opponent < before.opponent); assert.equal(after.overlaps, 0);
    pass('Desktop Chrome retains its fast one-shot endpoint and automatic next microphone after the final');
    assert.equal(exceptions.length, 0);
    const sources = Object.fromEntries(['taekwondo-safari-stream.js', 'taekwondo-voice.js', 'taekwondo.js', 'taekwondo.html', 'taekwondo.css'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')).digest('hex')]));
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, checks, exceptions, controls, scope: 'Synthetic Safari native audio/lifecycle and cumulative results in isolated Chromium; real CDP touch input. No physical WebKit or real microphone claim.', sources }, null, 2));
    console.log('\n' + checks.length + ' focused Safari controller checks passed. Evidence: ' + output);
})().catch(async error => {
    console.error(error.stack || error);
    try { fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ error: String(error.stack || error), checks, exceptions, state: evaluate ? await evaluate(`({body:document.body.innerText,diagnostics:window.__voice?.getDiagnostics(),native:window.__native&&{starts:__native.starts,stops:__native.stops,aborts:__native.aborts,overlaps:__native.overlaps}})`) : null }, null, 2)); } catch (_) {}
    process.exitCode = 1;
}).finally(async () => {
    if (socket) socket.close(); if (browser && browser.exitCode === null) browser.kill();
    await new Promise(resolve => server.close(resolve));
});
