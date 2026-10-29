// Safari lifecycle contracts in isolated Chromium, with real CDP touch input.
// Native audio and cumulative recognizer events are synthetic. This does not
// establish physical Safari, iPad microphone, speech-service, or audio quality.
// DOJO_CACHE_ONLY=1 runs only the generated-worker offline runtime check.
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
const checks = [], exceptions = [], requests = [];
const cacheOnly = process.env.DOJO_CACHE_ONLY === '1';
let controls = [], cacheEvidence = null;
const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { requests.push({ path: pathname, status: 403 }); response.writeHead(403).end(); return; }
    fs.readFile(file, (error, bytes) => {
        requests.push({ path: pathname, status: error ? 404 : 200 });
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
    const auditTarget = targets.find(target => target.type === 'page');
    socket = new WebSocket(auditTarget.webSocketDebuggerUrl);
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
        const query=new URL(location.href).searchParams;
        if(location.pathname.endsWith('/taekwondo.html')&&query.get('preserve')!=='1')localStorage.clear();
        Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5});
        window.__native={instances:[],starts:0,stops:0,aborts:0,overlaps:0,audioDelay:180,dropEnd:false,holdAudioAfterAbort:false,finalizeOnStop:false,deafRestarts:false,scriptedPrompts:[]};
        // Only this fixture's lesson selection is deterministic. The real
        // canonical generator, move metadata, fight rules, and saves still run.
        let Game;Object.defineProperty(window,'DojoGame',{configurable:true,get:()=>Game,set:G=>{Game=Object.freeze({...G,createQuestion(...args){
            const prompt=__native.scriptedPrompts.shift();if(!prompt)return G.createQuestion(...args);
            for(let seed=0;seed<1000;seed++){const fixture=G.createQuestion(args[0],args[1],args[2],()=>seed/1000,args[4],args[5]);if(fixture.prompt===prompt)return fixture;}
            throw Error('Canonical fixture unavailable: '+prompt);
        }});
        const fixture=query.get('fixture');
        if(fixture&&fixture.startsWith('reset-')){
            const progress=G.createProgress();
            for(let belt=0;belt<(fixture==='reset-writing'?4:2);belt++){const win=G.startFight(progress,belt);for(let turn=0;turn<32&&win.status==='fighting';turn++)G.resolveAnswer(win,{correct:true,assisted:false,move:'front-kick',challengeKind:'basic'});if(win.status!=='won')throw Error('Earned fixture failed');G.completeFight(progress,win);}
            progress.rewards.reading.claimed=true;progress.rewards.reading.flavor='matcha';
            let fight=null,question=null,phase='lobby',answerResolved=false;
            if(fixture!=='reset-lobby'){
                const belt=fixture==='reset-writing'?4:0;fight=G.startFight(progress,belt);question=G.createQuestion(belt,{},[],()=>.4,'front-kick',progress.belt);
                if(fixture==='reset-loss'){for(let turn=0;turn<40&&fight.status==='fighting';turn++)G.resolveAnswer(fight,{correct:false,assisted:false,move:'front-kick',challengeKind:'basic'});if(fight.status!=='lost')throw Error('Loss fixture failed');phase='answered';answerResolved=true;}
                else if(fixture==='reset-terminal-manual'){for(let turn=0;turn<32&&fight.opponentHp>7&&fight.status==='fighting';turn++)G.resolveAnswer(fight,{correct:true,assisted:true,move:'front-kick',challengeKind:'basic'});if(fight.status!=='fighting'||fight.opponentHp>7)throw Error('Terminal manual fixture failed');phase='question';}
                else{G.resolveAnswer(fight,{correct:false,move:'front-kick'});G.resolveAnswer(fight,{correct:false,move:'front-kick'});G.resolveAnswer(fight,{correct:true,move:'front-kick'});phase='question';}
            }
            localStorage.setItem(G.SAVE_VERSION,JSON.stringify({progress,fight,question,phase,answerResolved,answerWasBlock:false,assisted:false,writingIndex:0,selectedMove:'front-kick',recent:question?[question.id]:[],challengeSet:null,writingDraft:null,soundEnabled:true,reducedMotion:true}));
            localStorage.setItem('lesson-other-sentinel','keep this lesson');
            localStorage.setItem('fiona-year1-review-weeks1-13-v1',JSON.stringify({sentinel:'keep selected words'}));
        }
        }});
        window.__audio={resumes:0,constructs:0,suspends:0};
        const Audio=window.AudioContext||window.webkitAudioContext;
        if(Audio){window.AudioContext=class extends Audio{constructor(...args){super(...args);__audio.constructs++;}resume(){__audio.resumes++;return super.resume();}suspend(){__audio.suspends++;return super.suspend();}};}
        class NativeRecognition {
            constructor(){this.active=false;this.ready=false;this.history=[];__native.instances.push(this);}
            start(){if(__native.instances.some(rec=>rec!==this&&rec.active)){__native.overlaps++;throw new DOMException('Synthetic audio lease is still held','InvalidStateError');}this.active=true;this.hearsAudio=!__native.deafRestarts||__native.starts===0;this.activated=Boolean(navigator.userActivation?.isActive);__native.starts++;setTimeout(()=>{if(this.active)this.onstart?.();},30);setTimeout(()=>{if(this.active&&this.hearsAudio){this.ready=true;this.onaudiostart?.();}},__native.audioDelay);}
            emit(groups,resultIndex=0){if(!this.hearsAudio)return;this.history=groups;const results=groups.map(([words,final=true])=>Object.assign((Array.isArray(words)?words:[words]).map(transcript=>({transcript,confidence:.8})),{isFinal:final}));this.onresult?.({resultIndex,results});}
            stop(){__native.stops++;this.ready=false;if(__native.finalizeOnStop){setTimeout(()=>this.emit(this.history.map(([words])=>[words,true]),Math.max(0,this.history.length-1)),40);setTimeout(()=>this.end(),160);}}
            abort(){__native.aborts++;this.ready=false;if(!__native.holdAudioAfterAbort)this.active=false;if(!__native.dropEnd)setTimeout(()=>this.end(),20);}
            end(){this.active=false;this.ready=false;this.onaudioend?.();this.onend?.();}
        }
        window.SpeechRecognition=window.webkitSpeechRecognition=NativeRecognition;
        let Voice;Object.defineProperty(window,'DojoVoice',{configurable:true,get:()=>Voice,set:Ctor=>{Voice=class extends Ctor{constructor(options){super(options);window.__voice=this;}};}});
        let Writing;Object.defineProperty(window,'DojoWriting',{configurable:true,get:()=>Writing,set:Ctor=>{Writing=class extends Ctor{constructor(...args){super(...args);window.__writing=this;}};}});
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedMicDetails=text;}}});
    ` });
    const address = 'http://127.0.0.1:' + server.address().port + '/taekwondo.html';
    async function fresh(safari = true, scriptedPrompts = [], fixture = '', enter = true) {
        await send('Page.navigate', { url: address + (fixture ? '?fixture=' + encodeURIComponent(fixture) : '') });
        await waitFor(`document.documentElement.dataset.dojoReady==='true'`);
        await evaluate(`__native.scriptedPrompts=${JSON.stringify(scriptedPrompts)}`);
        if (enter) { await tap('#start-button'); await waitFor(`!document.querySelector('#challenge-panel').hidden`); }
        assert.equal(await evaluate('__voice.safariMode'), safari);
    }

    if (!cacheOnly) {
    await fresh(true, ['こ','さ','し','そ']); await evaluate('__native.audioDelay=900'); await tap('#handsfree-toggle');
    await pause(100); let state = await snapshot();
    assert.equal(state.starts, 1); assert.doesNotMatch(state.status, /^Listening/);
    assert.equal(await evaluate('__native.instances[0].activated'), true, 'First capture opens inside a real CDP touch activation');
    await ready(1); assert.equal(await evaluate('__native.instances[0].continuous'), true); assert.equal(await evaluate('__native.instances[0].lang'), 'ja-JP');
    pass('A real touch starts one Japanese continuous session; task start is not presented as audio readiness');

    let before = await snapshot(), groups = [['子', true]];
    assert.equal(before.save.question.prompt, 'こ');
    await result(groups);
    let after = await snapshot(); assert.ok(after.opponent < before.opponent); assert.equal(after.player, before.player);
    assert.match(await evaluate(`document.querySelector('#voice-transcript').textContent`), /こ.*ko.*子/);
    groups.push(['ねこ', false]); await result(groups, 1);
    await nextQuestion(before.save.question.id); before = await snapshot();
    groups[1][1] = true; await result(groups, 1); after = await snapshot();
    assert.equal(after.opponent, before.opponent); assert.deepEqual(after.save.question, before.save.question);
    assert.equal(before.save.question.prompt, 'さ'); groups.push(['差', true]); await result(groups, 2);
    after = await snapshot(); assert.ok(after.opponent < before.opponent); assert.equal(after.player, before.player);
    await nextQuestion(before.save.question.id); before = await snapshot();
    await result(groups, 0); after = await snapshot(); assert.equal(after.opponent, before.opponent);
    assert.equal(before.save.question.prompt, 'し'); groups.push(['市', true]); await result(groups, 3); after = await snapshot();
    assert.ok(after.opponent < before.opponent); assert.equal(after.player, before.player);
    assert.equal(after.starts, 1); assert.equal(after.constructed, 1); assert.equal(after.stops, 0); assert.equal(after.aborts, 0); assert.equal(after.overlaps, 0);
    assert.equal(after.handsfree, true);
    pass('Three final-only kanji spellings answer successive kana on one microphone; replays and previously seen feedback speech stay quarantined');

    await nextQuestion(before.save.question.id); before = await snapshot(); assert.equal(before.save.question.prompt, 'そ');
    groups.push(['sou', true]); await result(groups, groups.length - 1); after = await snapshot();
    assert.ok(after.opponent < before.opponent); assert.equal(after.player, before.player);
    assert.match(await evaluate(`document.querySelector('#voice-transcript').textContent`), /そ.*so.*sou/);
    assert.equal(after.starts, 1);
    pass('A native sou result reads isolated そ as a held O sound and the UI shows the accepted phonetic reading');

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
    assert.match(details, /2026-10-29\s+safari-capture-2/); assert.equal(details.includes(before.save.question.prompt), false);
    await tap('#copy-mic-details'); assert.equal(await evaluate('__copiedMicDetails'), details);
    await screenshot('safari-microphone-diagnostics');
    await tap('#mic-details-dialog .primary[data-close]');
    pass('Microphone details identify the deployed build and copy lifecycle metadata without the answer or recorded audio');

    await fresh(); await tap('#handsfree-toggle'); await ready(1); before = await snapshot();
    const priorPrompt = before.save.question.prompt;
    await result([[priorPrompt, false]]); await result([[priorPrompt, true]]); await nextQuestion(before.save.question.id);
    before = await snapshot();
    await result([[priorPrompt, true]], 0); after = await snapshot(); assert.equal(after.opponent, before.opponent); assert.equal(after.player, before.player);
    await result([[priorPrompt, true], [before.save.question.prompt, true]], 1);
    after = await snapshot(); assert.ok(after.opponent < before.opponent); assert.equal(after.player, before.player); assert.equal(after.starts, 1);
    pass('A genuinely new final-only result can answer the next question while the old cumulative prefix cannot score again');

    await fresh(); await tap('#handsfree-toggle'); await ready(1); before = await snapshot();
    await result([[before.save.question.prompt, false]]); await result([[before.save.question.prompt, true]]);
    await evaluate('__native.instances[0].end()'); await ready(2); after = await snapshot();
    assert.equal(after.handsfree, true); assert.equal(after.recovery, false); assert.ok(after.opponent < before.opponent); assert.equal(after.player, before.player); assert.equal(after.overlaps, 0);
    pass('A Safari service that cleanly ends after a correct answer can open the next capture without stopping hands-free');

    await fresh(); await evaluate('__native.deafRestarts=true'); await tap('#handsfree-toggle'); await ready(1);
    const continuousHistory = [];
    for (let turn = 0; turn < 3; turn++) {
        before = await snapshot(); continuousHistory.push([before.save.question.prompt, false]); await result(continuousHistory, turn); await pause(1200);
        after = await snapshot(); assert.equal(after.opponent, before.opponent); assert.equal(after.player, before.player);
        assert.equal(after.starts, 1); assert.equal(after.stops, 0); assert.equal(after.aborts, 0);
        continuousHistory[turn][1] = true; await result(continuousHistory, turn); after = await snapshot();
        assert.ok(after.opponent < before.opponent); assert.equal(after.player, before.player);
        if (turn < 2) await nextQuestion(before.save.question.id);
    }
    assert.equal((await snapshot()).starts, 1);
    pass('Hands-free survives three healthy 1.2-second interim-to-final delays without reopening a native capture that would be deaf on restart');

    await nextQuestion(before.save.question.id); before = await snapshot();
    await tap('#stop-microphone'); await waitFor(`!__voice.captureActive`); after = await snapshot();
    assert.equal(after.handsfree, false); assert.equal(after.player, before.player); assert.equal(after.opponent, before.opponent); assert.deepEqual(after.save.question, before.save.question);
    assert.match(await evaluate(`document.querySelector('#mic-capture-status').textContent`), /off/i); assert.ok(after.aborts > 0);
    pass('Stop mic closes a persistent capture without grading or losing the assigned question');

    await fresh(); await tap('#handsfree-toggle'); await ready(1); before = await snapshot();
    await pause(11100); after = await snapshot();
    assert.equal(after.starts, 1); assert.equal(after.stops, 0); assert.equal(after.aborts, 0); assert.equal(after.capture, true);
    assert.equal(after.player, before.player); assert.equal(after.opponent, before.opponent); assert.deepEqual(after.save.question, before.save.question);
    await result([[before.save.question.prompt, true]]); assert.ok((await snapshot()).opponent < before.opponent);
    pass('A ten-second quiet question retries on the same native microphone without a stop, restart, health penalty, or replacement question');

    await fresh(); await tap('#handsfree-toggle'); await ready(1); before = await snapshot();
    await evaluate(`__native.dropEnd=true;__native.holdAudioAfterAbort=true;__native.instances[0].onerror?.({error:'network',message:'Synthetic speech service unavailable'})`);
    await waitFor(`!document.querySelector('#voice-recovery').hidden`); await tap('#reconnect-mic'); await pause(900);
    after = await snapshot(); assert.equal(after.starts, 1); assert.equal(after.handsfree, false); assert.equal(after.recovery, true);
    assert.doesNotMatch(after.status, /^Listening/); assert.equal(after.player, before.player); assert.equal(after.opponent, before.opponent); assert.deepEqual(after.save.question, before.save.question);
    pass('If native audio truly remains busy, reconnect reports failure instead of manufacturing Listening or consuming an answer');

    await fresh(true, ['こ','さ','し']); await evaluate('__native.deafRestarts=true'); await tap('#listen-button'); await ready(1);
    const manualHistory = [];
    for (let turn = 0; turn < 3; turn++) {
        before = await snapshot(); manualHistory.push([['子','差','市'][turn], false]); await result(manualHistory, turn); await pause(1200);
        after = await snapshot(); assert.equal(after.starts, 1); assert.equal(after.stops, 0); assert.equal(after.aborts, 0); assert.equal(after.opponent, before.opponent);
        assert.equal(await evaluate(`document.querySelector('#stop-listening').hidden`), true, 'Safari has privacy Stop mic instead of a finalizing Finish button');
        manualHistory[turn][1] = true; await result(manualHistory, turn); after = await snapshot();
        assert.ok(after.opponent < before.opponent); assert.equal(after.player, before.player); assert.equal(after.handsfree, false); assert.equal(after.capture, true);
        assert.match(await evaluate(`document.querySelector('#mic-capture-status').textContent`), /Mic on.*Next/i);
        if (!turn) await screenshot('safari-manual-mic-on-between-answers');
        if (turn < 2) {
            await tap('#next-button'); await waitFor(`JSON.parse(localStorage.getItem(DojoGame.SAVE_VERSION)).phase==='question'`);
            assert.equal(await evaluate('__voice.getDiagnostics().stream.armed'), false);
            assert.match(await evaluate(`document.querySelector('#mic-capture-status').textContent`), /Mic on.*Speak/i);
            await tap('#listen-button'); await ready(1);
        }
    }
    assert.equal((await snapshot()).starts, 1);
    pass('Speak to strike also survives three 1.2-second native final delays on one capture; Mic on truthfully persists through Next and Speak');

    await fresh(); await tap('#listen-button'); await ready(1); before = await snapshot(); const priorStarts = before.starts;
    const otherTarget = await send('Target.createTarget', { url: 'about:blank' }); await send('Target.activateTarget', { targetId: otherTarget.targetId });
    await waitFor('document.hidden', 'Native tab visibility becomes hidden'); await waitFor('!__voice.captureActive', 'Hidden tab closes microphone');
    await send('Target.activateTarget', { targetId: auditTarget.id }); await send('Target.closeTarget', { targetId: otherTarget.targetId });
    await waitFor('!document.hidden'); await pause(350); after = await snapshot();
    assert.equal(after.starts, priorStarts); assert.equal(after.capture, false); assert.equal(after.player, before.player); assert.deepEqual(after.save.question, before.save.question);
    pass('Leaving the actual tab closes even a manual persistent microphone and returning cannot silently restart it');

    await fresh(true, [], 'reset-terminal-manual'); await tap('#listen-button'); await ready(1); before = await snapshot(); assert.ok(before.opponent <= 7);
    await result([[before.save.question.prompt, true]]); await waitFor('!__voice.captureActive'); after = await snapshot();
    assert.equal(after.save.fight.status, 'won'); assert.equal(after.opponent, 0); assert.equal(after.handsfree, false); assert.ok(after.aborts > 0);
    assert.match(await evaluate(`document.querySelector('#mic-capture-status').textContent`), /off/i);
    pass('A winning manual answer closes the actual microphone immediately instead of leaving an idle capture after the bout');

    await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 2, mobile: true });
    await fresh(); await tap('#handsfree-toggle'); await ready(1); before = await snapshot();
    await evaluate(`__native.instances[0].onerror?.({error:'not-allowed',message:'Synthetic permission refusal'})`);
    await waitFor(`!document.querySelector('#voice-recovery').hidden`);
    controls = await evaluate(`['#question-glyph','#handsfree-toggle','#listen-button','#voice-status','#reconnect-mic','#reload-fight','#mic-details-button'].map(selector=>{const element=document.querySelector(selector),rect=element.getBoundingClientRect();return {selector,x:rect.x,y:rect.y,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height};})`);
    for (const control of controls) assert.ok(control.width > 0 && control.height > 0, control.selector + ' visible');
    const recoveryAccess = await evaluate(`(() => {const card=document.querySelector('.practice-card'),button=document.querySelector('#mic-details-button');button.scrollIntoView({block:'nearest'});const r=button.getBoundingClientRect();return {bottom:r.bottom,top:r.top,scrollY,overflow:getComputedStyle(card).overflowY};})()`);
    assert.ok(recoveryAccess.top >= 0 && recoveryAccess.bottom <= 768.5); assert.equal(recoveryAccess.scrollY, 0); assert.equal(recoveryAccess.overflow, 'auto');
    for (const target of controls.filter(control => ['#reconnect-mic','#reload-fight','#mic-details-button'].includes(control.selector))) assert.ok(target.height >= 43.5 && target.width >= 43.5);
    await screenshot('safari-ipad-recovery-1024x768');
    pass('Safari recovery remains reachable inside the 1024 by 768 lesson panel with 44px actions and no page scroll');

    async function resetDialog(label) {
        await waitFor(`document.querySelector('#reset-game-dialog').open`, label + ' confirmation opens');
        const geometry = await evaluate(`(() => {const dialog=document.querySelector('#reset-game-dialog'),box=element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};return {width:innerWidth,height:innerHeight,dialog:box(dialog),focus:document.activeElement.id,buttons:['#cancel-reset-game','#confirm-reset-game'].map(selector=>({selector,...box(document.querySelector(selector))}))};})()`);
        assert.equal(geometry.focus, 'cancel-reset-game', label + ' defaults to Cancel');
        assert.ok(geometry.dialog.x >= 0 && geometry.dialog.y >= 0 && geometry.dialog.right <= geometry.width + .5 && geometry.dialog.bottom <= geometry.height + .5, label + ' fits the screen');
        for (const button of geometry.buttons) assert.ok(button.width >= 43.5 && button.height >= 43.5 && button.bottom <= geometry.height + .5, label + ' has reachable 44px actions');
    }
    async function assertFreshDojo(label) {
        const state = await snapshot();
        assert.equal(state.save.phase, 'lobby', label); assert.equal(state.save.fight, null, label); assert.equal(state.save.question, null, label);
        assert.equal(state.save.progress.belt, 0, label); assert.equal(state.save.progress.mastered, false, label);
        for (const key of ['wins','losses','totalCorrect','totalMistakes','bestStreak']) assert.equal(state.save.progress[key], 0, label + ' resets ' + key);
        for (const reward of Object.values(state.save.progress.rewards)) assert.deepEqual(reward, { unlocked: false, claimed: false, flavor: '' }, label + ' resets rewards');
        assert.equal(state.save.selectedMove, 'front-kick'); assert.equal(await evaluate(`DojoGame.availableMoves(0).filter(move=>move.kind==='special').length`), 0);
        assert.equal(state.handsfree, false); assert.equal(state.capture, false);
        assert.equal(state.save.soundEnabled, true); assert.equal(state.save.reducedMotion, true);
        assert.equal(await evaluate(`localStorage.getItem('lesson-other-sentinel')`), 'keep this lesson');
        assert.equal(await evaluate(`JSON.parse(localStorage.getItem('fiona-year1-review-weeks1-13-v1')).sentinel`), 'keep selected words');
        return state;
    }

    await fresh(true, [], 'reset-active'); await tap('#handsfree-toggle'); await ready(1); before = await snapshot();
    assert.equal(before.save.progress.wins, 2); assert.equal(before.save.progress.belt, 2); assert.equal(before.save.progress.rewards.reading.claimed, true); assert.ok(before.player < 100);
    await tap('#reset-game-button'); await resetDialog('Active-fight reset'); await pause(100);
    assert.equal((await snapshot()).capture, false);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await waitFor(`!document.querySelector('#reset-game-dialog').open`); await ready(2); after = await snapshot();
    assert.deepEqual(after.save, before.save, 'Escape keeps the exact saved question, damaged HP, earned progress, preferences and reward');
    await tap('#pause-button'); await waitFor(`document.querySelector('#pause-dialog').open`); const pausedStarts = (await snapshot()).starts;
    await tap('#pause-reset-game'); await resetDialog('Paused-fight reset'); await tap('#cancel-reset-game'); await pause(250);
    assert.equal(await evaluate(`document.querySelector('#pause-dialog').open`), true); assert.equal((await snapshot()).starts, pausedStarts);
    await tap('#resume-button'); await ready(3); after = await snapshot(); assert.deepEqual(after.save, before.save);
    pass('Reset cancellation and Escape preserve an active earned fight exactly; cancel inside Pause keeps the microphone paused');

    await evaluate('window.__beforeGameResetResult=__native.instances.at(-1).onresult;window.__beforeGameResetError=__native.instances.at(-1).onerror');
    await tap('#reset-game-button'); await resetDialog('Confirmed active reset'); await screenshot('dojo-reset-confirmation-1024x768');
    await tap('#confirm-reset-game'); await waitFor(`!document.querySelector('#reset-game-dialog').open&&!document.querySelector('#welcome-panel').hidden`); await pause(100);
    const resetState = await assertFreshDojo('Confirmed active reset');
    await evaluate(`__beforeGameResetResult?.({resultIndex:0,results:[Object.assign([{transcript:${JSON.stringify(before.save.question.prompt)},confidence:.9}],{isFinal:true})]});__beforeGameResetError?.({error:'network'})`);
    await pause(500); assert.deepEqual((await snapshot()).save, resetState.save, 'Old microphone callbacks cannot restore or damage the reset game');
    await send('Page.navigate', { url: address + '?preserve=1' }); await waitFor(`document.documentElement.dataset.dojoReady==='true'`); await pause(250);
    await assertFreshDojo('Reset survives pagehide and reload'); assert.equal((await snapshot()).starts, 0);
    pass('Confirmed reset clears only dojo progress and live state, keeps other lessons/preferences, rejects stale speech, and survives pagehide/reload with microphone off');

    await send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 2, mobile: true });
    await fresh(true, [], 'reset-lobby', false); before = await snapshot(); assert.equal(before.save.progress.wins, 2);
    await tap('#reset-game-button'); await resetDialog('Portrait lobby reset'); await screenshot('dojo-reset-confirmation-820x1180');
    await tap('#cancel-reset-game'); await waitFor(`!document.querySelector('#reset-game-dialog').open`); assert.deepEqual((await snapshot()).save, before.save);
    await tap('#reset-game-button'); await resetDialog('Confirmed portrait lobby reset'); await tap('#confirm-reset-game'); await pause(100); await assertFreshDojo('Lobby reset');
    pass('The lobby offers a reversible reset confirmation in portrait and clears earned rank/rewards only after confirmation');

    await fresh(true, [], 'reset-loss', false); await tap('#start-button'); await waitFor(`document.querySelector('#result-dialog').open`); before = await snapshot();
    assert.equal(before.save.progress.losses, 1); assert.equal(await evaluate(`document.querySelector('#result-reset-game').hidden`), false);
    await tap('#result-reset-game'); await resetDialog('Loss-result reset'); await tap('#cancel-reset-game'); await pause(100);
    assert.equal(await evaluate(`document.querySelector('#result-dialog').open`), true); assert.deepEqual((await snapshot()).save, before.save);
    await tap('#result-reset-game'); await resetDialog('Confirmed loss-result reset'); await tap('#confirm-reset-game'); await pause(100);
    await assertFreshDojo('Loss-result reset'); assert.equal(await evaluate(`document.querySelector('#result-dialog').open`), false);
    pass('A lost match also offers Reset game; Cancel retains its result and confirmation returns to a fresh white-belt lobby');

    await fresh(true, [], 'reset-writing');
    assert.equal((await snapshot()).save.question.mode, 'kana-write');
    const pad = await evaluate(`(() => {const r=document.querySelector('#writing-canvas').getBoundingClientRect();return {x:r.left+r.width*.3,y:r.top+r.height*.4,step:r.width*.2};})()`);
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pad.x, y: pad.y, id: 82, radiusX: 3, radiusY: 3, force: .7 }] });
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pad.x + pad.step, y: pad.y + pad.step, id: 82, radiusX: 3, radiusY: 3, force: .7 }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    before = await snapshot(); assert.equal(before.save.writingDraft.strokes.length, 1); assert.equal(before.save.challengeSet.locked, true);
    await tap('#reset-game-button'); await resetDialog('Writing reset'); await tap('#cancel-reset-game'); await pause(100);
    assert.deepEqual((await snapshot()).save, before.save); assert.equal(await evaluate('__writing.strokes.length'), 1);
    await tap('#reset-game-button'); await resetDialog('Confirmed writing reset'); await tap('#confirm-reset-game'); await pause(100);
    await assertFreshDojo('Writing reset'); assert.equal(await evaluate('__writing.strokes.length'), 0); assert.equal(await evaluate('Boolean(__writing.reference)'), false);
    assert.equal((await snapshot()).save.writingDraft, null); assert.equal((await snapshot()).save.challengeSet, null);
    pass('Reset cancellation preserves native touch ink; confirmation clears the actual writing pad and draft without saving an old challenge');

    await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', platform: 'Win32' });
    await fresh(false); await evaluate('__native.finalizeOnStop=true'); await tap('#handsfree-toggle'); await ready(1); before = await snapshot();
    assert.equal(await evaluate('__native.instances[0].continuous'), false);
    await result([[before.save.question.prompt, false]]); await ready(2); after = await snapshot();
    assert.equal(after.handsfree, true); assert.equal(after.player, before.player); assert.ok(after.opponent < before.opponent); assert.equal(after.overlaps, 0);
    pass('Desktop Chrome retains its fast one-shot endpoint and automatic next microphone after the final');
    }

    // This continuation can run alone with DOJO_CACHE_ONLY=1. It verifies cached
    // runtime bytes and save restoration, not speech recognition while offline.
    const workerSource = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
    const expectedCache = /const CACHE = '([^']+)'/.exec(workerSource)[1];
    const expectedAssets = JSON.parse(/const ASSETS = (\[[^\n]+\]);/.exec(workerSource)[1]);
    const runtimeFiles = ['taekwondo.css','taekwondo-engine.js','taekwondo-writing.js','taekwondo-safari-stream.js','taekwondo-voice.js','taekwondo-scene.js','taekwondo.js'];
    const expectedRuntimeHashes = Object.fromEntries(runtimeFiles.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')).digest('hex')]));
    const responses = [];
    const originalMessageHandler = socket.onmessage;
    socket.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.method === 'Network.responseReceived') responses.push({ url: message.params.response.url, status: message.params.response.status, fromServiceWorker: Boolean(message.params.response.fromServiceWorker) });
        originalMessageHandler(event);
    };
    await send('Network.enable');
    await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', platform: 'MacIntel' });
    await fresh(true, ['こ']); await tap('#listen-button'); await ready(1);
    await result([['子', true]]); await tap('#stop-microphone'); await waitFor('!__voice.captureActive');
    await tap('#pause-button'); await waitFor(`document.querySelector('#pause-dialog').open`); await tap('#leave-button');
    await send('Page.navigate', { url: address + '?preserve=1' }); await waitFor(`document.documentElement.dataset.dojoReady==='true'`);
    await evaluate('navigator.serviceWorker.ready');
    await waitFor(`Boolean(navigator.serviceWorker.controller)`, 'The generated worker controls this page');
    await waitFor(`(async()=>{if(!await caches.has(${JSON.stringify(expectedCache)}))return false;const cache=await caches.open(${JSON.stringify(expectedCache)});return (await cache.keys()).length>=${expectedAssets.length};})()`, 'Every generated course asset is precached');
    const onlineSave = (await snapshot()).save;
    assert.ok(onlineSave.fight && onlineSave.fight.journal.length === 1 && onlineSave.fight.opponentHp < onlineSave.fight.opponentMaxHp, 'Offline restoration uses a real nonempty fight, not a blank save');
    const cached = await evaluate(`(async()=>{const cache=await caches.open(${JSON.stringify(expectedCache)}),missing=[];for(const asset of ${JSON.stringify(expectedAssets)})if(!await cache.match(new URL(asset,location.href).href))missing.push(asset);return {name:${JSON.stringify(expectedCache)},expected:${expectedAssets.length},keys:(await cache.keys()).length,missing,worker:navigator.serviceWorker.controller.scriptURL};})()`);
    assert.equal(cached.expected, 338); assert.deepEqual(cached.missing, []);
    const offlineMarker = 'offline-' + Date.now();
    await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__offlineCacheMarker=' + JSON.stringify(offlineMarker) });
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    const responseOffset = responses.length;
    await send('Page.reload', { ignoreCache: false });
    await waitFor(`window.__offlineCacheMarker===${JSON.stringify(offlineMarker)}&&document.documentElement.dataset.dojoReady==='true'`, 'Offline reload boots the current dojo runtime');
    const offlineSave = (await snapshot()).save;
    const learnerState = value => { const copy = structuredClone(value); if (copy.fight) delete copy.fight.id; return copy; };
    assert.deepEqual(learnerState(offlineSave), learnerState(onlineSave), 'Offline pagehide/reload preserves the fight journal, health, question, answer lock, preferences, and progress');
    const offlineRuntime = await evaluate(`(async()=>{const urls=[...document.querySelectorAll('script[src],link[rel="stylesheet"]')].map(element=>element.src||element.href).filter(url=>${JSON.stringify(runtimeFiles)}.includes(new URL(url).pathname.split('/').pop()));
        const files={};for(const url of urls){const response=await fetch(url);if(!response.ok)throw Error('Uncached dojo asset '+url);const source=(await response.text()).replace(/\\r\\n/g,'\\n');const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));files[new URL(url).pathname.split('/').pop()]=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
        return {urls,files,build:__voice.getDiagnostics().build,micUI:Boolean(document.querySelector('#mic-session-controls')&&document.querySelector('#mic-capture-status')&&document.querySelector('#stop-microphone')),capture:__voice.captureActive,starts:__native.starts};})()`);
    assert.equal(offlineRuntime.urls.length, 7);
    for (const url of offlineRuntime.urls) assert.equal(new URL(url).searchParams.get('v'), 'safari-capture-2');
    assert.deepEqual(offlineRuntime.files, expectedRuntimeHashes, 'All seven offline query URLs return current source bytes');
    assert.equal(offlineRuntime.build, '2026-10-29 safari-capture-2'); assert.equal(offlineRuntime.micUI, true); assert.equal(offlineRuntime.capture, false); assert.equal(offlineRuntime.starts, 0);
    const offlineResponses = responses.slice(responseOffset).filter(response => runtimeFiles.includes(new URL(response.url).pathname.split('/').pop()));
    for (const file of runtimeFiles) assert.ok(offlineResponses.some(response => new URL(response.url).pathname.endsWith('/' + file) && response.status === 200 && response.fromServiceWorker), file + ' is served by the worker while HTTP cache and network are unavailable');
    assert.equal(responses.some(response => response.status === 404 && /taekwondo/.test(response.url)), false);
    // Cache verification uses the existing button listener directly; native
    // touch behavior is covered by the separate 23 UI checks above.
    await evaluate(`document.querySelector('#start-button').click()`); await waitFor(`!document.querySelector('#challenge-panel').hidden`);
    assert.equal((await snapshot()).capture, false); assert.equal((await snapshot()).starts, 0);
    await screenshot('safari-current-runtime-offline');
    cacheEvidence = { ...cached, offlineRuntime, offlineResponses, savePreserved: true, regeneratedInternalFightId: offlineSave.fight.id !== onlineSave.fight.id, httpCacheDisabled: true, networkOffline: true,
        scope: 'Current cached game runtime and saved fight restoration only. Live browser speech service and microphone availability offline are not tested.' };
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await send('Network.setCacheDisabled', { cacheDisabled: false });
    pass('All 338 generated assets are cached; offline reload serves all seven current revision URLs through the worker and preserves the saved fight without activating a microphone');
    assert.equal(exceptions.length, 0);
    const sources = Object.fromEntries([...runtimeFiles, 'taekwondo.html', 'sw.js', 'generate_sw.js'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')).digest('hex')]));
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, cacheOnly, checks, exceptions, controls, cacheEvidence, scope: 'Synthetic Safari native audio/lifecycle and cumulative results in isolated Chromium; real CDP touch input. Offline runtime caching is separate from live speech-service availability. No physical WebKit or real microphone claim.', sources }, null, 2));
    console.log('\n' + checks.length + ' focused Safari controller checks passed. Evidence: ' + output);
})().catch(async error => {
    console.error(error.stack || error);
    try { fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ error: String(error.stack || error), checks, exceptions, failedRequests: requests.filter(request => request.status >= 400), state: evaluate ? await evaluate(`({body:document.body.innerText,diagnostics:window.__voice?.getDiagnostics(),native:window.__native&&{starts:__native.starts,stops:__native.stops,aborts:__native.aborts,overlaps:__native.overlaps}})`) : null }, null, 2)); } catch (_) {}
    process.exitCode = 1;
}).finally(async () => {
    if (socket) socket.close(); if (browser && browser.exitCode === null) browser.kill();
    await new Promise(resolve => server.close(resolve));
});
