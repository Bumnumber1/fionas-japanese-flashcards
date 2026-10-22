// End-to-end dojo regression. Node 22+, Edge/Chromium. No dependencies.
// Uses an isolated browser profile. No application source or real user save edits.
// BROWSER_PATH and AUDIT_OUTPUT may override the browser and evidence directory.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const root = __dirname;
const started = Date.now();
const artifacts = process.env.AUDIT_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fiona-dojo-browser-'));
fs.mkdirSync(artifacts, { recursive: true });
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const requests = [];
const server = http.createServer((req, res) => {
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch (_) { res.writeHead(400).end(); return; }
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(path.resolve(root) + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    requests.push({ name, status: error ? 404 : 200 });
    if (error) res.writeHead(404).end();
    else { res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(data); }
  });
});
let browser, ws, send, evaluate;
const errors = [], workerErrors = [], external = [], checks = [], campaign = [], rapidEvidence = [], impactEvidence = [], voiceLatencyEvidence = [];
let comboRecording;
const moveCount = 17, beltCount = 11;
const beltNames = ['white','yellow','orange','gold','green','blue','purple','brown','red','red-black','black'];
const rewardMilestones = [['reading',1,'Strawberry'],['katakana-reading',3,'Strawberry'],['writing',5,'Matcha'],
  ['katakana-writing',7,'Vanilla'],['words',9,'Vanilla'],['kanji',10,'Strawberry']];
function pass(name) { checks.push(name); console.log('PASS ' + name); }

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const profile = path.join(artifacts, 'edge-isolated-profile');
  browser = spawn(process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox',
    '--disable-extensions', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
    '--remote-allow-origins=*', '--user-data-dir=' + profile, 'about:blank'
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let launchError;
  browser.on('error', error => { launchError = error; });
  browser.stderr.on('data', () => {});
  let debugPort;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (launchError) throw launchError;
    try { debugPort = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; } catch (_) {}
    await pause(250);
  }
  assert.ok(debugPort, 'Edge debug port available');
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
  const auditPageTarget = targets.find(target => target.type === 'page');
  ws = new WebSocket(auditPageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let serial = 0;
  const pending = new Map();
  ws.onclose = () => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error('Browser connection closed')); } pending.clear(); };
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (item) { clearTimeout(item.timer); message.error ? item.reject(Error(JSON.stringify(message.error))) : item.resolve(message.result); }
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    else if (message.method === 'ServiceWorker.workerErrorReported') workerErrors.push(message.params);
    else if (message.method === 'Network.requestWillBeSent') {
      const url = message.params.request.url;
      if (/^https?:/.test(url) && !url.startsWith(`http://127.0.0.1:${port}/`)) external.push(url);
    }
  };
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 30000);
    timer.unref(); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const waitFor = async (expression, label = expression, attempts = 160) => {
    for (let attempt = 0; attempt < attempts; attempt++) { if (await evaluate(expression)) return; await pause(100); }
    throw Error('Timed out: ' + label);
  };
  const click = selector => evaluate(`(() => { const button=document.querySelector(${JSON.stringify(selector)}); if(!button)throw Error('Missing '+${JSON.stringify(selector)}); if(button.disabled)throw Error('Disabled '+${JSON.stringify(selector)}); button.click(); })()`);
  const screenshot = async name => {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(artifacts, name + '.png'), Buffer.from(shot.data, 'base64'));
  };
  async function startComboRecording() {
    // Record the real game canvas and the real HUD values in this disposable
    // profile. The draw hook copies only after a completed native WebGL frame;
    // it never changes game state, animation timing, or grading.
    return evaluate(`(() => {
      const source=document.querySelector('#dojo-canvas'),gl=source.getContext('webgl');
      const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=850;
      const context=canvas.getContext('2d'),type=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(value=>MediaRecorder.isTypeSupported(value));
      if(!gl||!type)throw Error('Native WebGL video capture is unavailable');
      const stream=canvas.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:3600000});
      const capture={canvas,context,stream,recorder,type,chunks:[],frames:0,notices:[],original:gl.drawElements,gl,started:performance.now()};
      const text=(value,x,y,size,color='#eff6ff')=>{context.font='700 '+size+'px system-ui';context.fillStyle=color;context.fillText(value,x,y);};
      let queued=false;
      const draw=()=>{
        queued=false;context.fillStyle='#101d33';context.fillRect(0,0,canvas.width,canvas.height);
        text('FIONA’S DOJO',36,48,27);text('HANDS-FREE · LIGHTNING COMBO',650,48,22,'#ffda75');
        const player=Number(document.querySelector('#player-health').getAttribute('aria-valuenow'));
        const rival=Number(document.querySelector('#opponent-health').getAttribute('aria-valuenow'));
        const bar=(value,x,name,color)=>{text(name+'  '+Math.round(value)+' / 100',x,86,18);context.fillStyle='#34435c';context.fillRect(x,98,550,13);context.fillStyle=color;context.fillRect(x,98,550*Math.max(0,value)/100,13);};
        bar(player,36,'FIONA','#77e4bd');bar(rival,694,document.querySelector('#opponent-name').textContent.toUpperCase(),'#ff7e92');
        const ratio=Math.min(1280/source.width,590/source.height),width=source.width*ratio,height=source.height*ratio;
        context.drawImage(source,(1280-width)/2,128+(590-height)/2,width,height);
        const notice=document.querySelector('#speed-notice'),value=!notice.hidden?notice.textContent.trim():'';
        if(value){if(capture.notices.at(-1)!==value)capture.notices.push(value);text(value,36,762,27,'#ffda75');}
        else text('Say the next Japanese prompt as the microphone starts.',36,762,24,'#adc5e7');
        const title=document.querySelector('#feedback-title');
        text(!document.querySelector('#feedback').hidden?title.textContent.trim():'CLEAN ANSWERS BUILD STRONGER COMBOS',36,809,22,'#ffffff');
        capture.frames++;
      };
      gl.drawElements=function(...args){const result=capture.original.apply(this,args);if(!queued){queued=true;queueMicrotask(draw);}return result;};
      recorder.ondataavailable=event=>{if(event.data.size)capture.chunks.push(event.data);};
      recorder.start(500);window.__dojoComboRecording=capture;
      return {width:canvas.width,height:canvas.height,mime:type};
    })()`);
  }
  async function stopComboRecording() {
    const result=await evaluate(`new Promise((resolve,reject)=>{
      const capture=window.__dojoComboRecording;if(!capture)throw Error('No combo recording');
      capture.recorder.onerror=event=>reject(Error(event.error?.message||'Recording failed'));
      capture.recorder.onstop=()=>{
        capture.gl.drawElements=capture.original;capture.stream.getTracks().forEach(track=>track.stop());
        const blob=new Blob(capture.chunks,{type:capture.type}),reader=new FileReader();
        reader.onload=()=>resolve({base64:reader.result.split(',')[1],bytes:blob.size,width:capture.canvas.width,height:capture.canvas.height,
          mime:capture.type,frames:capture.frames,durationSeconds:(performance.now()-capture.started)/1000,notices:capture.notices});
        reader.onerror=()=>reject(Error('Could not read recorded combo'));reader.readAsDataURL(blob);
      };capture.recorder.stop();
    })`);
    fs.writeFileSync(path.join(artifacts,'fionas-dojo-lightning-combo.webm'),Buffer.from(result.base64,'base64'));
    delete result.base64;
    assert.ok(result.bytes>30000 && result.frames>25,'Actual native WebGL combo produces substantial moving video');
    assert.ok(result.notices.some(notice=>/COMBO BOOST/.test(notice)),'Video includes the actual speed-combo notification');
    comboRecording=result;
    return result;
  }
  async function loadIsolatedSave(serialized) {
    const key = await evaluate('DojoGame.SAVE_VERSION');
    // Seed at the next document start. Seeding before navigation would be
    // overwritten by the current document's legitimate pagehide save handler.
    const script = await send('Page.addScriptToEvaluateOnNewDocument', { source:
      `if(location.pathname.endsWith('/taekwondo.html'))localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(serialized)});` });
    await send('Page.reload', { ignoreCache: false });
    await waitFor(`document.documentElement.dataset.dojoReady==='true'`, 'Isolated save loaded');
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: script.identifier });
  }
  const snapshot = () => evaluate(`(() => {
    const visible=e=>!!e&&!e.hidden&&!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
    return { save:JSON.parse(localStorage.getItem(DojoGame.SAVE_VERSION)||'null'),
      glyph:document.querySelector('#question-glyph').textContent.trim(),
      player:Number(document.querySelector('#player-health').getAttribute('aria-valuenow')),
      opponent:Number(document.querySelector('#opponent-health').getAttribute('aria-valuenow')),
      feedback:visible(document.querySelector('#feedback')), detail:document.querySelector('#feedback-detail').textContent,
      result:document.querySelector('#result-dialog').open, pause:document.querySelector('#pause-dialog').open,
      hint:visible(document.querySelector('#hint-text')), challenge:visible(document.querySelector('#challenge-panel')) };
  })()`);
  const moveButtons = () => evaluate(`Array.from(document.querySelectorAll('#move-list [data-move]'),button=>({id:button.dataset.move,kind:button.dataset.kind,disabled:button.disabled,selected:button.getAttribute('aria-pressed')==='true'}))`);
  const canonicalQuestion = question => JSON.stringify({...question,techniqueId:undefined});
  async function assertUnlockedMoves(belt) {
    const buttons = await moveButtons();
    assert.equal(buttons.length, moveCount, 'All seventeen techniques are shown');
    assert.equal(buttons.filter(button => button.kind === 'basic').length, 7, 'Seven basic techniques');
    assert.equal(buttons.filter(button => button.kind === 'special').length, 10, 'Ten belt techniques');
    assert.equal(buttons.filter(button => button.kind === 'basic' && !button.disabled).length, 7, 'All basics are available from white belt');
    assert.equal(buttons.filter(button => button.kind === 'special' && !button.disabled).length, belt, 'Exactly one special is earned per new belt');
    const catalog = await evaluate(`DojoGame.MOVES.map(move=>({id:move.id,unlock:move.unlock,bonus:move.bonus,kind:move.kind}))`);
    for (const move of catalog) assert.equal(buttons.find(button => button.id === move.id).disabled, move.unlock > belt, move.id + ' rank lock');
    return catalog;
  }
  async function assertAnswerMoveLock(expectedMove) {
    const before = await snapshot(), journal = JSON.stringify(before.save.fight.journal);
    assert.ok((await moveButtons()).every(button => button.disabled), 'Answered activities lock every move');
    // Native disabled buttons must ignore attempts to upgrade a resolved answer.
    await evaluate(`document.querySelector('#move-list [data-kind="special"]').click()`);
    const after = await snapshot();
    assert.equal(JSON.stringify(after.save.fight.journal), journal, 'A later move click cannot regrade or upgrade damage');
    assert.equal(after.save.question.techniqueId, expectedMove);
    assert.equal(after.opponent, before.opponent);
  }
  async function assertWritingRecall(state) {
    const question = state.save.question;
    if (question.mode !== 'kana-write' && question.mode !== 'kanji-write') return;
    const visible = await evaluate(`document.querySelector('.question-area').innerText`);
    assert.ok(!visible.includes(question.answer), 'Writing target is hidden from the visible recall prompt');
    if (question.mode === 'kanji-write') assert.ok(!visible.includes(question.reading), 'Kanji reading is hidden before help');
    assert.equal(state.hint, false);
  }
  const deliverTranscript = (transcript, final = true) => evaluate(`(() => {
    const recognition=window.__dojoSpeech.instances.at(-1);if(!recognition)throw Error('No recognizer was started by the voice UI');
    const result=Object.assign([{transcript:${JSON.stringify(transcript)},confidence:0.98}],{isFinal:${final}});
    window.__dojoSpeech.transcripts.push({transcript:${JSON.stringify(transcript)},final:${final},lang:recognition.lang,at:performance.now()});
    recognition.onresult?.({resultIndex:0,results:[result]});
  })()`);
  const speak = async transcript => {
    await click('#listen-button'); await pause(10);
    assert.equal(await evaluate(`window.__dojoSpeech.instances.at(-1).lang`),'ja-JP','Recognizer requests Japanese');
    await deliverTranscript(transcript);
  };
  async function traceCharacter(character, reverse = false) {
    // Draw through the actual pointer interface. No DojoWriting/scoring calls or stroke-state writes.
    return evaluate(`(() => {
      const character=${JSON.stringify(character)}, reverse=${reverse};
      const canvas=document.querySelector('#writing-canvas');canvas.scrollIntoView({block:'center'});
      const rect=canvas.getBoundingClientRect(), side=Math.min(rect.width,rect.height);
      const paths=KVG_DATA[character];if(!paths?.length)throw Error('No local stroke data for '+character);
      const event=(name,point,down)=>new PointerEvent(name,{bubbles:true,cancelable:true,pointerId:781,isPrimary:true,
        pointerType:'pen',button:0,buttons:down?1:0,pressure:down?0.6:0,
        clientX:rect.left+(rect.width-side)/2+(0.08+point.x/109*0.84)*side,
        clientY:rect.top+(rect.height-side)/2+(0.08+point.y/109*0.84)*side});
      for(const data of paths){
        const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',data);
        const length=path.getTotalLength(), points=Array.from({length:90},(_,i)=>path.getPointAtLength(length*i/89));
        if(reverse)points.reverse();canvas.dispatchEvent(event('pointerdown',points[0],true));
        for(const point of points.slice(1))canvas.dispatchEvent(event('pointermove',point,true));
        canvas.dispatchEvent(event('pointerup',points[points.length-1],false));
      }
      return {character,strokes:paths.length};
    })()`);
  }
  async function answerCorrect() {
    let state = await snapshot();
    const question = state.save.question;
    assert.ok(question && state.challenge && !state.feedback, 'An unanswered UI challenge is active');
    if (question.mode === 'kana-read' || question.mode === 'word-read') {
      assert.ok(await evaluate(`!document.querySelector('#reading-form') || document.querySelector('#reading-form').hidden`), 'Reading has no active typed-answer form');
      assert.ok(await evaluate(`!document.querySelector('#word-choices') || document.querySelector('#word-choices').hidden`), 'Reading has no active multiple-choice answers');
      let answer = question.expectedKana || question.promptJapanese || question.prompt;
      if(question.script === 'katakana') {
        // Japanese recognition vendors may return the same spoken sound in
        // either script. Exercise both spellings at their real voice boundary.
        answer = state.save.fight.beltIndex === 3 ? question.prompt : [...question.prompt].map(char => {
          const code=char.charCodeAt(0);return code>=0x30a1&&code<=0x30f6?String.fromCharCode(code-0x60):char;
        }).join('');
      }
      assert.ok(answer, 'Voice question has an expected Japanese pronunciation'); await speak(answer);
    } else {
      // Check may move to the next character of a word before the final strike.
      for (let characterIndex = 0; characterIndex < 12; characterIndex++) {
        state = await snapshot(); if (state.feedback) break;
        const char = question.chars[state.save.writingIndex || 0];
        assert.ok(char, 'Writing prompt has a canonical character');
        await traceCharacter(char); await click('#check-writing'); await pause(70);
        if (characterIndex === 11) throw Error('Handwriting never resolved: ' + JSON.stringify(await snapshot()));
      }
    }
    await waitFor(`!document.querySelector('#feedback').hidden`, 'Answer feedback');
    return snapshot();
  }
  async function nextQuestion() {
    await click('#next-button'); await pause(60);
    return snapshot();
  }
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('ServiceWorker.enable');
  // Synthetic recognition tests the real listen/recognition/grading boundary.
  // It deliberately does not claim real microphone or browser speech-service validation.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    window.__dojoSpeech={instances:[],transcripts:[],starts:0,stops:0,aborts:0,startDelay:0,stopEndDelay:0,trackTimers:false,scheduled:[]};
    const schedule=window.setTimeout.bind(window);
    window.setTimeout=(callback,delay,...args)=>{if(window.__dojoSpeech.trackTimers)window.__dojoSpeech.scheduled.push({delay,at:performance.now()});return schedule(callback,delay,...args);};
    class AuditSpeechRecognition {
      constructor(){this.started=false;this.ready=false;this.listeners={};window.__dojoSpeech.instances.push(this);}
      addEventListener(type,listener){(this.listeners[type]??=[]).push(listener);}
      emit(type,event={}){if(type==='start'){this.ready=true;this.readyAt=performance.now();}this['on'+type]?.(event);for(const listener of this.listeners[type]||[])listener(event);}
      start(){this.started=true;window.__dojoSpeech.starts++;const ready=()=>{if(this.started)this.emit('start');};
        if(window.__dojoSpeech.startDelay>0)setTimeout(ready,window.__dojoSpeech.startDelay);else queueMicrotask(ready);}
      stop(){this.started=false;this.ready=false;window.__dojoSpeech.stops++;
        if(window.__dojoSpeech.stopEndDelay>0)setTimeout(()=>this.emit('end'),window.__dojoSpeech.stopEndDelay);else queueMicrotask(()=>this.emit('end'));}
      abort(){this.started=false;this.ready=false;window.__dojoSpeech.aborts++;queueMicrotask(()=>this.emit('end'));}
    }
    window.SpeechRecognition=AuditSpeechRecognition;window.webkitSpeechRecognition=AuditSpeechRecognition;
  })();` });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/taekwondo.html` });
  await waitFor(`typeof DojoGame!=='undefined' && typeof DojoWriting!=='undefined' && typeof DojoScene!=='undefined' && document.querySelectorAll('#move-list button').length>0`, 'Dojo initialization');
  const registration = await evaluate(`navigator.serviceWorker.register('sw.js').then(registration=>({ok:true,scope:registration.scope,active:registration.active?.state,installing:registration.installing?.state,waiting:registration.waiting?.state})).catch(error=>({ok:false,name:error.name,message:error.message,secure:isSecureContext}))`);
  console.log('Service worker registration: ' + JSON.stringify(registration));
  assert.equal(registration.ok, true, 'Service worker must register: ' + JSON.stringify(registration));
  await pause(300);
  const pixels = await evaluate(`new Promise(resolve => {
    const canvas=document.querySelector('#dojo-canvas'),gl=canvas.getContext('webgl');
    if(!gl){resolve({available:false});return;}
    // The renderer intentionally does not preserve its drawing buffer. Read in
    // the next actual drawing task, before compositing is allowed to clear it.
    const original=gl.drawElements;let queued=false;
    const timer=setTimeout(()=>{gl.drawElements=original;resolve({available:true,timedOut:true});},5000);
    gl.drawElements=function(...args){const result=original.apply(this,args);if(!queued){queued=true;gl.drawElements=original;queueMicrotask(()=>{
      clearTimeout(timer);const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,data=new Uint8Array(width*height*4);
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,data);const colors=new Set();let colored=0;
      for(let i=0;i<data.length;i+=44){const key=data[i]+','+data[i+1]+','+data[i+2];colors.add(key);if(data[i]+data[i+1]+data[i+2]>30)colored++;}
      resolve({available:true,width,height,colors:colors.size,colored,renderer:gl.getParameter(gl.RENDERER),error:gl.getError()});
    });}return result;};
  })`);
  assert.ok(pixels.available && pixels.width > 200 && pixels.height > 150 && pixels.colors > 20 && pixels.colored > 100, JSON.stringify(pixels));
  pass('Actual WebGL arena has diverse rendered pixels');
  await screenshot('01-desktop-lobby');
  // Animation inspection uses an isolated renderer, never the game's private scene.
  await evaluate(`(() => {
    const host=document.createElement('div');host.id='dojo-render-review';host.style.cssText='position:fixed;inset:0;z-index:99999;background:#f5f1e8;padding:24px;display:flex;flex-direction:column;gap:16px';
    const title=document.createElement('h2');title.id='dojo-render-review-title';title.style.cssText='margin:0;font:24px system-ui;color:#173443';
    const canvas=document.createElement('canvas');canvas.style.cssText='width:100%;height:calc(100vh - 100px);display:block;border-radius:12px';
    host.append(title,canvas);document.body.append(host);window.dojoRenderReview=new DojoScene(canvas);
    cancelAnimationFrame(dojoRenderReview.frame);dojoRenderReview.frame=0;dojoRenderReview._schedule=()=>{};
    dojoRenderReview.setFighters({playerBelt:'#ee6473',opponent:{...DojoGame.OPPONENTS[7],belt:'#242735'}});
  })()`);
  const techniqueIds = await evaluate('DojoGame.MOVES.map(move=>move.id)');
  assert.equal(techniqueIds.length, moveCount);
  assert.equal(new Set(techniqueIds).size, moveCount);
  for (const move of [...techniqueIds, 'block']) {
    await evaluate(`(() => {const scene=dojoRenderReview;scene.setFighters({});scene.play({actor:'player',move:${JSON.stringify(move)},hit:${move !== 'block'}});
      scene.action.start=performance.now()-scene.action.duration*0.55;scene._tick(performance.now());
      document.querySelector('#dojo-render-review-title').textContent=${JSON.stringify(move + ' · controlled animation phase 55%')};})()`);
    await screenshot('move-' + move + '-contact');
  }
  const rapidDurations = await evaluate(`(() => {
    const scene=dojoRenderReview;
    return ['','quick','lightning'].map(speedTier=>{scene.setFighters({});return {speedTier,
      duration:scene.play({actor:'player',move:'front-kick',hit:true,combo:3,speedTier})};});
  })()`);
  assert.ok(rapidDurations[2].duration < rapidDurations[1].duration && rapidDurations[1].duration < rapidDurations[0].duration,
    'Quick and lightning combos have successively faster real choreography');
  for (const speedTier of ['quick','lightning']) {
    await evaluate(`(() => {const scene=dojoRenderReview;scene.setFighters({});scene.play({actor:'player',move:'front-kick',hit:true,combo:3,speedTier:${JSON.stringify(speedTier)}});
      const now=performance.now();scene.action.start=now-scene.action.duration*0.87;scene.lastFrame=0;
      for(let offset=80;offset>=0;offset-=20)scene._tick(now-offset);
      document.querySelector('#dojo-render-review-title').textContent=${JSON.stringify(speedTier + ' speed bonus · two impacts and a staggering rival')};})()`);
    await screenshot('move-speed-' + speedTier + '-combo');
    assert.ok(await evaluate('dojoRenderReview.trails.length>0'),'Speed attacks draw actual native WebGL trails');
  }
  await evaluate(`(() => {const scene=dojoRenderReview;scene.setFighters({});scene.setReducedMotion(true);scene.play({actor:'player',move:'front-kick',hit:true,combo:3,speedTier:'lightning'});
    scene.action.start=performance.now()-scene.action.duration*0.75;scene.lastFrame=0;scene._tick(performance.now());})()`);
  assert.equal(await evaluate('dojoRenderReview.trails.length'),0,'Reduced motion suppresses rapid trail effects');
  await evaluate('dojoRenderReview.setReducedMotion(false)');
  pass('Quick and lightning combos render faster with native trails; reduced motion suppresses the added effects');
  const impactSamples=await evaluate(`(() => {
    const scene=dojoRenderReview,finite=value=>typeof value==='number'?Number.isFinite(value):Array.isArray(value)?value.every(finite):value&&typeof value==='object'?Object.values(value).every(finite):true;
    const samples=[];
    for(const move of DojoGame.MOVES){
      scene.setFighters({});scene.play({actor:'player',move:move.id,hit:true,combo:3,speedTier:'lightning',damage:35});
      const action=scene.action,contacts=action.contacts.length;
      for(let phase=0;phase<=24;phase++){
        const now=action.start+action.duration*phase/24;scene._advanceActions(now);
        const player=scene._pose('player',now),opponent=scene._pose('opponent',now),reaction=scene._reaction('opponent',now);
        if(!finite(player)||!finite(opponent)||!finite(reaction))throw Error('Non-finite '+move.id+' at '+phase);
        if(player.y<0||opponent.y<0||Math.abs(opponent.x)>2.1)throw Error('Unsafe arena pose '+move.id+' at '+phase);
      }
      samples.push({move:move.id,contacts,poses:50,finite:true});
    }
    const hit=options=>{
      scene.setFighters({});scene.play({actor:'player',move:'front-kick',hit:true,...options});
      const action=scene.action,lastContact=action.contacts.at(-1),now=action.start+lastContact.at*action.duration+55;
      scene._advanceActions(now);const reaction=scene._reaction('opponent',now),pose=scene._pose('opponent',now);
      const after=action.start+action.duration+100;scene._advanceActions(after);
      return {contacts:action.contacts.length,recorded:scene.reactions.opponent.length,reaction,pose,persistent:scene._reaction('opponent',after),actionDone:!scene.action};
    };
    const normal=hit({combo:1}),lightning=hit({combo:3,speedTier:'lightning',damage:35});
    scene.setFighters({});const options={actor:'player',move:'front-kick',hit:true,combo:3,speedTier:'lightning'};
    scene.play(options);const first=scene.action;scene.play({...options,move:'side-kick'});scene.play({...options,move:'punch',victory:true});
    const buffered=[scene.action,...scene.actionQueue],queued=scene.actionQueue.length;
    scene.celebrate();const finish=first.start+buffered.reduce((sum,item)=>sum+item.duration,0);
    scene._advanceActions(finish+210);const victory=scene._reaction('opponent',finish+210),beforeCelebrate=scene.action?.move||null;
    scene._advanceActions(finish+230);const afterCelebrate=scene.action?.move||null;
    const completed=buffered.map(action=>({move:action.move,contacts:action.contacts.length,done:action.contacts.every(contact=>contact.done)}));
    const regularPose=scene._pose('opponent',finish+230);scene.setReducedMotion(true);const calmPose=scene._pose('opponent',finish+230);
    scene._tick(finish+230);const calmTrails=scene.trails.length;scene.setReducedMotion(false);
    return {samples,normal,lightning,queue:{queued,completed,victory,beforeCelebrate,afterCelebrate},calm:{regularX:regularPose.x,calmX:calmPose.x,trails:calmTrails}};
  })()`);
  assert.equal(impactSamples.samples.length,moveCount);assert.ok(impactSamples.samples.every(sample=>sample.finite&&sample.contacts>=1));
  assert.equal(impactSamples.lightning.contacts,2);assert.equal(impactSamples.lightning.recorded,2,'Both combo contacts create separate rival reactions');
  assert.ok(impactSamples.lightning.reaction.push>impactSamples.normal.reaction.push*1.3,'Lightning chain knocks the rival back more strongly than one ordinary strike');
  assert.ok(impactSamples.lightning.persistent.push>.08,'Rival stagger persists after the attacker finishes');
  assert.equal(impactSamples.queue.queued,2);assert.ok(impactSamples.queue.completed.every(action=>action.done),'Fast incoming techniques preserve every buffered contact');
  assert.ok(impactSamples.queue.victory.down>0,'A winning final contact leaves the rival in a defeat reaction');
  assert.notEqual(impactSamples.queue.beforeCelebrate,'celebrate');assert.equal(impactSamples.queue.afterCelebrate,'celebrate','Celebration waits for the final buffered contact');
  assert.ok(Math.abs(impactSamples.calm.calmX-1.23)<Math.abs(impactSamples.calm.regularX-1.23),'Reduced motion keeps a smaller readable rival stagger');
  assert.equal(impactSamples.calm.trails,0);
  impactEvidence.push(impactSamples);
  pass('All seventeen lightning techniques have finite arena poses; repeated contacts cause stronger lasting rival recoil, twisting, and knockback');
  pass('Rapid techniques preserve buffered impacts; winning blows leave a defeat pose before celebration, with calmer reduced motion');
  await evaluate(`(() => {const scene=dojoRenderReview;scene.setFighters({});scene.play({actor:'player',move:'block',hit:false});scene.action.start=performance.now()-scene.action.duration*0.95;scene._tick(performance.now());document.querySelector('#dojo-render-review-title').textContent='Defensive block · controlled phase 95%';})()`);
  await screenshot('move-block-guard-95');
  await evaluate(`dojoRenderReview.destroy();delete window.dojoRenderReview;document.querySelector('#dojo-render-review').remove()`);
  pass('Seventeen techniques and a defensive block rendered at controlled phase for visual review');
  const whiteMoves = await assertUnlockedMoves(0);
  assert.ok(await evaluate(`document.querySelector('#basic-moves')&&document.querySelector('#special-moves')`), 'Basics and specials have separate move groups');
  for (const move of whiteMoves.filter(move => move.unlock === 0)) {
    await click('#move-list [data-move="' + move.id + '"]');
    assert.equal((await moveButtons()).find(button => button.id === move.id).selected, true);
  }
  await click('#move-list [data-move="front-kick"]');
  await evaluate(`document.querySelector('#move-list').scrollIntoView({block:'center'})`);
  await screenshot('00-white-seven-basics');
  pass('White belt has seven selectable basics and ten visibly locked specials');
  await click('#start-button'); await waitFor(`!document.querySelector('#challenge-panel').hidden`, 'First challenge');
  let state = await snapshot(); assert.equal(state.save.progress.belt, 0); assert.equal(state.player, 100);
  assert.equal(state.save.question.techniqueId, 'front-kick');
  assert.equal(state.save.question.challengeKind, 'basic');
  assert.equal([...state.save.question.prompt].length, 1);
  const questionId = state.save.question.id;
  const initialQuestion=canonicalQuestion(state.save.question),initialRecent=JSON.stringify(state.save.recent),initialHistory=JSON.stringify(state.save.fight.journal);
  for(const move of whiteMoves.filter(move=>move.unlock===0)){
    await click('#move-list [data-move="'+move.id+'"]');state=await snapshot();
    assert.equal(canonicalQuestion(state.save.question),initialQuestion,'Every basic retains the exact unresolved activity');
    assert.equal(state.save.question.techniqueId,move.id);
    assert.equal(JSON.stringify(state.save.recent),initialRecent,'Move choice cannot churn the question history');
    assert.equal(JSON.stringify(state.save.fight.journal),initialHistory,'Move choice cannot create combat turns');
  }
  await click('#move-list [data-move="front-kick"]');state=await snapshot();
  assert.equal(state.save.challengeSet.entries.basic.id,questionId);
  assert.equal(state.save.challengeSet.switched,true);
  pass('All seven basics share one unchanged unanswered question; A→B→A cannot reroll or alter history');
  await click('#listen-button'); await pause(10);
  assert.ok((await moveButtons()).every(button => button.disabled), 'Listening locks the move selection');
  await evaluate(`document.querySelector('#move-list [data-move="punch"]').click()`);
  assert.equal((await snapshot()).save.question.id, questionId, 'Listening cannot switch to another challenge');
  await screenshot('01-speech-listening');
  await deliverTranscript(state.save.question.prompt, false);
  assert.equal((await snapshot()).save.fight.turns, 0, 'Interim speech must never grade');
  await evaluate(`window.__dojoSpeech.instances.at(-1).onerror?.({error:'no-speech'})`); await pause(20);
  assert.equal((await snapshot()).save.fight.turns,0,'Recognition errors must not count as learning mistakes');
  assert.equal((await snapshot()).player,100);
  await speak('definitely-wrong'); state = await snapshot();
  assert.equal(state.player, 100); assert.equal(state.opponent, 100); assert.equal(state.save.fight.streak, 0);
  assert.equal(state.save.fight.pendingDamage, 10); assert.equal(state.save.progress.belt, 0);
  const afterWrong = JSON.stringify(state.save.fight.journal);
  await assertAnswerMoveLock('front-kick');
  await deliverTranscript(state.save.question.prompt);
  assert.equal(JSON.stringify((await snapshot()).save.fight.journal), afterWrong);
  pass('Interim speech and recognition errors do not grade; wrong final speech queues a counter and duplicate results are ignored');

  await send('Page.reload', { ignoreCache: false });
  await waitFor(`typeof DojoGame!=='undefined' && document.querySelectorAll('#move-list button').length>0`, 'Reload answer state');
  assert.equal((await snapshot()).challenge, false, 'Reload opens the resumable lobby');
  await send('Page.reload', { ignoreCache: false });
  await waitFor(`typeof DojoGame!=='undefined' && document.querySelectorAll('#move-list button').length>0`, 'Repeated reload in lobby');
  if (!(await snapshot()).challenge) await click('#start-button');
  state = await snapshot();
  assert.equal(state.player, 100); assert.equal(state.save.fight.pendingDamage, 10); assert.equal(state.save.question.id, questionId); assert.equal(state.feedback, true);
  assert.equal(JSON.stringify(state.save.fight.journal), afterWrong);
  assert.ok(await evaluate(`document.querySelector('#listen-button').disabled`), 'Answered prompt keeps voice submission disabled');
  assert.equal(JSON.stringify((await snapshot()).save.fight.journal), afterWrong);
  pass('Repeated reload through lobby retains exact question, HP, and response lock');
  await nextQuestion();
  state = await snapshot(); assert.equal(state.save.fight.pendingDamage, 10);
  assert.equal(state.save.question.techniqueId, 'front-kick');
  assert.equal(state.save.question.challengeKind, 'basic');
  assert.ok((await moveButtons()).every(button => button.disabled), 'Defensive drill fixes the basic move');
  assert.ok(await evaluate(`!document.querySelector('#block-banner')?.hidden || /block/i.test(document.querySelector('#question-instruction').textContent+' '+document.querySelector('#activity-label').textContent)`), 'Next activity explicitly offers a block');
  await screenshot('02-block-chance');
  const beforePause = await snapshot(); await click('#pause-button');
  assert.equal((await snapshot()).pause, true); await click('#resume-button');
  assert.equal((await snapshot()).save.question.id, beforePause.save.question.id);
  assert.equal((await snapshot()).player, beforePause.player);
  await click('#pause-button'); await click('#leave-button');
  await click('#start-button');
  assert.equal((await snapshot()).save.question.id, beforePause.save.question.id);
  pass('Pause, resume, leave, and return preserve the same fight');
  await click('#hint-button');
  state = await answerCorrect();
  assert.equal(state.save.fight.streak, 0); assert.equal(state.save.fight.assisted, 1);
  assert.equal(state.save.fight.pendingDamage, 0); assert.equal(state.save.fight.blocks, 1);
  assert.equal(state.player, 100); assert.equal(state.opponent, 100);
  pass('Next activity is a successful assisted block: queued damage disappears with no HP loss or attack streak');
  await nextQuestion(); await click('#hint-button');
  const hintedQuestion=(await snapshot()).save.question.id,hintedCache=JSON.stringify((await snapshot()).save.challengeSet);
  assert.ok((await moveButtons()).every(button=>button.disabled),'Requesting help fixes the selected activity');
  await evaluate(`document.querySelector('#move-list [data-move="punch"]').click()`);
  assert.equal((await snapshot()).save.question.id,hintedQuestion);
  await click('#pause-button');await click('#leave-button');await click('#start-button');
  await send('Page.reload',{ignoreCache:false});await waitFor(`document.documentElement.dataset.dojoReady==='true'`,'Hint lock reload');await click('#start-button');
  state=await snapshot();assert.equal(state.save.assisted,true);assert.equal(state.hint,true);assert.equal(state.save.question.id,hintedQuestion);
  assert.equal(JSON.stringify(state.save.challengeSet),hintedCache);assert.ok((await moveButtons()).every(button=>button.disabled));
  pass('Hints lock the chosen activity globally; help credit, prompt, and move lock survive lobby and reload');
  state = await answerCorrect();
  assert.equal(state.save.fight.streak, 0); assert.equal(state.save.fight.assisted, 2);
  assert.equal(state.opponent, 93); pass('Hinted attack deals half damage and earns no combo streak');
  await nextQuestion();
  while (true) {
    state = await snapshot(); if (state.save.fight.status !== 'fighting') break;
    const beforeHp=state.player, queued=state.save.fight.pendingDamage;
    await speak('wrong'); state = await snapshot();
    assert.equal(state.save.progress.belt, 0, 'Mistakes and defenses never advance the belt');
    if(queued){assert.equal(state.player,Math.max(0,beforeHp-queued));assert.equal(state.save.fight.pendingDamage,0);}
    else {assert.equal(state.player,beforeHp);assert.ok(state.save.fight.pendingDamage>0);}
    if (state.save.fight.status !== 'fighting') break;
    await nextQuestion();
  }
  assert.equal(state.save.fight.lost, true); assert.equal(state.save.progress.belt, 0);
  await nextQuestion(); assert.equal((await snapshot()).result, true);
  await screenshot('02-defeat-rematch'); await click('#result-continue');
  state = await snapshot(); assert.equal(state.player, 100); assert.equal(state.save.progress.belt, 0);
  pass('Genuine defeat preserves earned belt and retry starts with full energy');

  for (let belt = 0; belt < beltCount; belt++) {
    state = await snapshot(); assert.equal(state.save.fight.beltIndex, belt);
    const mode = state.save.question.mode;
    const expectedMode = belt<4?'kana-read':belt<8?'kana-write':belt<10?'word-read':'kanji-write';
    assert.equal(mode,expectedMode,'The campaign uses four reading, four writing, two word-reading and one kanji belt');
    if(belt<8){
      const expectedScript=[0,1,4,5].includes(belt)?'hiragana':'katakana';
      assert.equal(state.save.question.script,expectedScript,'The question retains its writing system');
      assert.equal(await evaluate(`DojoGame.BELTS[${belt}].script`),expectedScript);
      assert.equal(await evaluate(`DojoGame.BELTS[${belt}].kanaCount`),belt%2?46:23,'Each script has introductory and complete-chart belts');
      assert.match(mode==='kana-read'?state.save.question.prompt:state.save.question.answer,
        expectedScript==='katakana'?/^[ァ-ヺー]+$/:/^[ぁ-ゖ]+$/u);
    }
    const catalog = await assertUnlockedMoves(belt);
    assert.equal(state.save.question.challengeKind, 'basic');
    if (belt === 1) {
      await evaluate(`document.querySelector('#move-list').scrollIntoView({block:'center'})`);
      await screenshot('belt-1-yellow-technique-earned');
    }
    let cleanAnswers = 0, specialDamage = null, specialId = null;
    if (belt > 0) {
      const special = catalog.find(move => move.kind === 'special' && move.unlock === belt);
      assert.ok(special, 'Each newly earned belt introduces its own special');
      specialId = special.id;
      const basicQuestion = state.save.question;
      await click('#move-list [data-move="' + special.id + '"]');
      state = await snapshot();
      assert.equal(state.save.question.techniqueId, special.id);
      assert.equal(state.save.question.challengeKind, 'special');
      assert.equal(state.save.question.difficulty, 'special');
      assert.equal(state.save.question.difficultyLevel, belt);
      assert.ok(state.save.question.challengeLabel);
      assert.ok(await evaluate(`document.querySelector('#challenge-difficulty').textContent.includes(${JSON.stringify(state.save.question.challengeLabel)})`), 'The harder challenge is labeled before answering');
      assert.ok(await evaluate(`document.querySelector('#technique-label').textContent.includes(${JSON.stringify(special.id)}) || document.querySelector('#technique-label').textContent.includes(DojoGame.MOVES.find(move=>move.id===${JSON.stringify(special.id)}).name)`), 'The question names the technique it powers');
      assert.notEqual(state.save.question.id, basicQuestion.id, 'Choosing a special replaces the unanswered basic question');
      if (mode === 'kana-read' || mode === 'kana-write') assert.ok(state.save.question.chars.length >= 2, 'Kana specials use longer real words');
      if (mode === 'word-read') assert.ok([...state.save.question.prompt].length > [...basicQuestion.prompt].length, 'Word specials are longer than basic word questions');
      if (mode === 'kanji-write') {
        assert.ok(/^[一-龯]{2,}$/.test(state.save.question.answer), 'Black-belt finisher requires a complete multi-kanji word');
        assert.ok(await evaluate(`JSON.parse(localStorage.getItem(DojoGame.SAVE_VERSION)).question.chars.every(char=>KVG_DATA[char]?.length)`), 'Every finisher character has local stroke data');
      }
      await assertWritingRecall(state);
      if(belt===2){
        const harderA=canonicalQuestion(state.save.question),older=catalog.find(move=>move.kind==='special'&&move.unlock===1);
        await click('#move-list [data-move="'+older.id+'"]');const olderState=await snapshot(),harderB=canonicalQuestion(olderState.save.question);
        const cache=JSON.stringify(olderState.save.challengeSet.entries),recentAfterCreation=JSON.stringify(olderState.save.recent);
        await click('#move-list [data-move="'+special.id+'"]');state=await snapshot();
        assert.equal(canonicalQuestion(state.save.question),harderA,'Returning to special A restores its entire harder prompt');
        await click('#move-list [data-move="front-kick"]');state=await snapshot();
        assert.equal(canonicalQuestion(state.save.question),canonicalQuestion(basicQuestion),'The original basic prompt returns intact');
        await click('#move-list [data-move="'+older.id+'"]');state=await snapshot();
        assert.equal(canonicalQuestion(state.save.question),harderB,'Returning to special B restores its entire harder prompt');
        assert.equal(JSON.stringify(state.save.challengeSet.entries),cache,'Repeated move changes create no new cached activities');
        assert.equal(JSON.stringify(state.save.recent),recentAfterCreation,'Returning to cached techniques adds no question-history entries');
        const savedCache=state.save.challengeSet;
        await click('#pause-button');await click('#resume-button');assert.deepEqual((await snapshot()).save.challengeSet,savedCache);
        await click('#pause-button');await click('#leave-button');await click('#start-button');
        assert.deepEqual((await snapshot()).save.challengeSet,savedCache,'Leaving to the lobby preserves every cached activity');
        await send('Page.reload',{ignoreCache:false});await waitFor(`document.documentElement.dataset.dojoReady==='true'`,'Cached technique reload');
        await click('#start-button');state=await snapshot();
        assert.equal(canonicalQuestion(state.save.question),harderB);assert.deepEqual(state.save.challengeSet,savedCache,'The entire technique cache survives reload');
        await click('#move-list [data-move="'+special.id+'"]');state=await snapshot();
        assert.equal(canonicalQuestion(state.save.question),harderA);
        pass('Each special keeps its exact A→B→A activity, alongside the original basic, across pause, lobby, and reload');
      }
      if(belt===4){
        const questionBeforeInk=canonicalQuestion(state.save.question),firstCharacter=state.save.question.chars[0];
        await traceCharacter(firstCharacter);
        state=await snapshot();assert.equal(state.save.challengeSet.locked,true,'Beginning an actual pen stroke fixes the activity');
        assert.ok((await moveButtons()).every(button=>button.disabled),'Ink locks every technique before grading');
        assert.ok(state.save.writingDraft.strokes.length>0,'Actual ungraded ink is saved');
        const beforeUndo=state.save.writingDraft.strokes.length;await click('#undo-writing');state=await snapshot();
        assert.equal(state.save.writingDraft.strokes.length,Math.max(0,beforeUndo-1));assert.equal(state.save.challengeSet.locked,true);
        await click('#clear-writing');state=await snapshot();
        assert.equal(state.save.writingDraft.strokes.length,0);assert.equal(state.save.challengeSet.locked,true,'Clearing all ink does not reopen question selection');
        await traceCharacter(firstCharacter);const draft=JSON.stringify((await snapshot()).save.writingDraft);
        await click('#pause-button');await click('#leave-button');await click('#start-button');
        assert.equal(JSON.stringify((await snapshot()).save.writingDraft),draft,'Ungraded ink survives lobby return');
        await send('Page.reload',{ignoreCache:false});await waitFor(`document.documentElement.dataset.dojoReady==='true'`,'Writing draft reload');await click('#start-button');
        state=await snapshot();assert.equal(JSON.stringify(state.save.writingDraft),draft,'Ungraded ink survives document reload');
        assert.equal(canonicalQuestion(state.save.question),questionBeforeInk);assert.ok((await moveButtons()).every(button=>button.disabled));
        await click('#check-writing');state=await snapshot();assert.equal(state.save.writingIndex,1,'The first character remains completed in this multi-character activity');
        const partialQuestion=state.save.question.id,partialIndex=state.save.writingIndex;
        await click('#pause-button');await click('#leave-button');await click('#start-button');
        await send('Page.reload',{ignoreCache:false});await waitFor(`document.documentElement.dataset.dojoReady==='true'`,'Partial word reload');await click('#start-button');state=await snapshot();
        assert.equal(state.save.question.id,partialQuestion);assert.equal(state.save.writingIndex,partialIndex,'Completed word characters survive reload');
        assert.equal(state.save.challengeSet.locked,true);assert.ok((await moveButtons()).every(button=>button.disabled));
        pass('First ink fixes the question; undo, clear, lobby, and reload preserve the lock, current ink, and completed word characters');
      }
      if (belt === 1) {
        const hardId = state.save.question.id;
        await send('Page.reload', { ignoreCache: false });
        await waitFor(`document.documentElement.dataset.dojoReady==='true'`, 'Special challenge reload');
        await click('#start-button');
        state = await snapshot();
        assert.equal(state.save.question.id, hardId);
        assert.equal(state.save.question.techniqueId, special.id);
        assert.equal(state.save.question.challengeKind, 'special');
        pass('A selected harder technique and its exact unanswered question survive reload');
      }
      if ([1, 2, 3, 4, 6, 7, 10].includes(belt)) {
        await evaluate(`document.querySelector('#challenge-panel').scrollIntoView({block:'center'})`);
        await screenshot({1:'belt-1-yellow-hard-hiragana-voice',2:'belt-2-orange-hard-katakana-voice',
          3:'belt-3-gold-hard-katakana-voice',4:'belt-4-green-multi-hiragana-writing',
          6:'belt-6-purple-multi-katakana-writing',7:'belt-7-brown-multi-katakana-writing',
          10:'belt-10-black-compound-finisher'}[belt]);
      }
      const before = state;
      state = await answerCorrect(); cleanAnswers++;
      specialDamage = before.opponent - state.opponent;
      assert.equal(specialDamage, 14 + special.bonus, 'First clean harder answer earns the displayed special damage');
      assert.ok(specialDamage > 14, 'Special attacks hit harder than an equally fresh basic');
      assert.equal(state.save.fight.journal.at(-1).move, special.id);
      assert.equal(state.save.fight.journal.at(-1).challengeKind, 'special');
      assert.equal(state.save.progress.belt, belt, 'A special hit cannot promote the belt');
      await assertAnswerMoveLock(special.id);
      pass('Earned ' + special.id + ' requires a harder ' + mode + ' answer and deals ' + specialDamage + ' damage');
      await nextQuestion();
      if(belt===2){
        state=await snapshot();assert.equal(state.save.challengeSet.exchange.turns,state.save.fight.turns);
        assert.deepEqual(Object.keys(state.save.challengeSet.entries),[special.id],'A resolved answer begins a fresh technique cache');
        assert.notEqual(state.save.question.id,basicQuestion.id);
        assert.equal(state.save.challengeSet.locked,false);assert.equal(state.save.challengeSet.switched,false);
        pass('Only a resolved answer followed by Next starts a new exchange and clears its old question cache');
      }
      if (belt === 1) {
        // Keep the special selected through a mistake: the following challenge
        // must be a basic defense, then restore that special for the next attack.
        assert.equal((await snapshot()).save.question.techniqueId, special.id);
        await speak('wrong'); state = await snapshot();
        assert.equal(state.player, 100); assert.equal(state.save.fight.pendingDamage, 10);
        await nextQuestion(); state = await snapshot();
        assert.equal(state.save.selectedMove, special.id, 'Defense retains the chosen next attack');
        assert.equal(state.save.question.techniqueId, 'front-kick');
        assert.equal(state.save.question.challengeKind, 'basic');
        assert.equal([...state.save.question.prompt].length, 1);
        assert.ok((await moveButtons()).every(button => button.disabled), 'A pending counter fixes the basic defensive drill');
        state = await answerCorrect();
        assert.equal(state.save.fight.blocks, 1); assert.equal(state.save.fight.pendingDamage, 0); assert.equal(state.player, 100);
        await nextQuestion(); state = await snapshot();
        assert.equal(state.save.question.techniqueId, special.id, 'The selected special returns after a block');
        assert.equal(state.save.question.challengeKind, 'special');
        pass('A special mistake gives a basic block chance and restores the selected special afterward');
      }
      await click('#move-list [data-move="front-kick"]');
      state = await snapshot();
      assert.equal(state.save.question.techniqueId, 'front-kick');
      assert.equal(state.save.question.challengeKind, 'basic');
    }
    if (mode === 'kana-write' || mode === 'kanji-write') {
      await assertWritingRecall(state);
      if (belt === 4) {
        await traceCharacter(state.save.question.chars[0], true); await click('#check-writing');
        state = await snapshot();
        assert.equal(state.player, 100, 'Reversed handwriting queues a counter without immediate damage');
        assert.equal(state.save.fight.pendingDamage, 10);
        await nextQuestion();
        await click('#hint-button'); await click('#clear-writing');
        state = await snapshot(); assert.equal(state.save.assisted, true, 'Clearing ink cannot erase help credit');
        assert.equal(state.hint, true); state = await answerCorrect();
        assert.equal(state.save.fight.streak, 0); assert.equal(state.save.fight.assisted, 1);
        assert.equal(state.save.fight.blocks,1);assert.equal(state.save.fight.pendingDamage,0);assert.equal(state.player,100);
        assert.equal(state.save.fight.journal[state.save.fight.journal.length - 1].assisted, true);
        pass('Writing help survives clearing ink and correctly suppresses streak credit');
        await nextQuestion();
      }
      if(belt===6){
        const character=state.save.question.chars[0];assert.match(character,/^[ァ-ヺ]$/u);
        await traceCharacter(character,true);await click('#check-writing');state=await snapshot();
        assert.equal(state.player,100);assert.equal(state.save.fight.pendingDamage,10,'Reversed katakana ink is a genuine learning mistake');
        await nextQuestion();state=await answerCorrect();assert.equal(state.save.fight.blocks,1);
        assert.equal(state.save.fight.pendingDamage,0);assert.equal(state.player,100);
        await nextQuestion();
        pass('Native katakana pen paths are graded in order; a reversed drawing queues a block and a correct drawing blocks it');
      }
      await screenshot('belt-' + belt + '-writing-recall');
    }
    while (true) {
      const before = await snapshot();
      assert.equal(before.save.question.techniqueId, 'front-kick');
      assert.equal(before.save.question.challengeKind, 'basic');
      state = await answerCorrect(); cleanAnswers++;
      assert.equal(state.save.progress.belt,belt,'Earned belt stays fixed throughout the fight, including the winning answer');
      if (state.save.fight.streak === 1 && before.opponent >= 14) {
        assert.equal(before.opponent - state.opponent, 14, 'A fresh unassisted basic attack deals 14 damage');
      }
      await assertAnswerMoveLock('front-kick');
      if (state.save.fight.streak === 3) {
        assert.ok(/combo/i.test(await evaluate(`document.querySelector('#feedback-title').textContent+' '+document.querySelector('#action-callout').textContent`)), 'Third clean answer reports a combo');
      }
      if (state.save.fight.status === 'won') break;
      assert.ok(cleanAnswers < 20, 'Bout should be winnable within 20 clean answers'); await nextQuestion();
      await assertUnlockedMoves(belt);
    }
    assert.equal(state.save.fight.opponentHp, 0); assert.ok(state.save.fight.playerHp > 0);
    await nextQuestion(); state = await snapshot(); assert.equal(state.result, true);
    assert.equal(state.save.progress.belt, Math.min(beltCount - 1, belt + 1));
    assert.equal(state.save.progress.iceCreamUnlocked, belt >= 9);
    for(const [id,lastBelt] of rewardMilestones) {
      assert.equal(state.save.progress.rewards[id].unlocked,lastBelt<=belt,'Section reward unlocks only after its last rival is defeated');
    }
    campaign.push({ belt, mode, script:state.save.question.script||'',specialId, specialDamage, cleanAnswers, playerHp: state.player, opponentHp: state.opponent });
    pass('Won real ' + mode + ' fight at ' + beltNames[belt] + ' belt');
    const milestone=rewardMilestones.find(([,lastBelt])=>lastBelt===belt);
    if (milestone) {
      const [rewardId,,flavor]=milestone;
      if(belt===9)await screenshot('03-black-belt-earned');
      if(belt===10){assert.equal(state.save.progress.mastered,true);await screenshot('05-kanji-champion');}
      await click('#result-rest'); await click('#reward-list [data-reward="'+rewardId+'"]');
      await click('[data-flavour="'+flavor+'"]'); await click('#claim-reward');
      const reward=(await snapshot()).save.progress.rewards[rewardId];
      assert.equal(reward.claimed,true);assert.equal(reward.flavor,flavor.toLowerCase());
      await screenshot('reward-'+rewardId+'-celebration');
      await click('#reward-dialog [data-close]');
      pass('Completed '+rewardId+' section unlocks and independently saves its ice cream');
      if(belt<10)await click('#start-button');
    } else await click('#result-continue');
  }
  pass('Both hiragana and katakana each have two reading belts and two writing belts, with real voice and pen input across all stages');
  await send('Page.reload', { ignoreCache: false });
  await waitFor(`typeof DojoGame!=='undefined' && document.querySelectorAll('#move-list [data-move]').length===${moveCount}`, 'Champion reload');
  state = await snapshot(); assert.equal(state.save.progress.mastered, true);
  for(const [id,,flavor] of rewardMilestones) {
    assert.equal(state.save.progress.rewards[id].claimed,true);assert.equal(state.save.progress.rewards[id].flavor,flavor.toLowerCase());
  }
  await assertUnlockedMoves(10);
  pass('Champion title, all techniques, and all six independent reward flavors survive reload');
  await evaluate(`document.querySelector('.reward-card').scrollIntoView({block:'center'})`); await screenshot('09-six-ice-cream-collection');

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate('scrollTo(0,0)'); await pause(150);
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Mobile viewport has no horizontal overflow');
  await screenshot('06-mobile-lobby'); await click('#start-button');
  await evaluate(`document.querySelector('#writing-canvas').scrollIntoView({block:'center'})`); await screenshot('07-mobile-writing');
  state = await answerCorrect(); assert.ok(state.opponent < 100); pass('Mobile layout fits and pointer handwriting still lands a strike');

  await waitFor(`!!navigator.serviceWorker?.controller`, 'Offline service worker controller', 300);
  const assetCache = await evaluate(`(async()=>{const names=['taekwondo.html','taekwondo.css','taekwondo-engine.js','taekwondo-writing.js','taekwondo-voice.js','taekwondo-scene.js','taekwondo.js','kanjivg_data.js','curriculum_y1.js','year1-review-data.js','garden-material.js'];
    return Promise.all(names.map(async name=>({name,cached:!!(await caches.match(new URL(name,location.href).href))})));})()`);
  assert.ok(assetCache.every(asset => asset.cached), JSON.stringify(assetCache));
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await send('Page.reload', { ignoreCache: false });
  await waitFor(`typeof DojoGame!=='undefined' && document.querySelectorAll('#move-list [data-move]').length===${moveCount}`, 'Offline dojo load');
  if (!(await snapshot()).challenge) await click('#start-button');
  state = await snapshot(); assert.equal(state.save.progress.mastered, true); assert.ok(state.challenge);
  if (state.feedback) await nextQuestion();
  state = await answerCorrect(); assert.ok(state.opponent < 100);
  await screenshot('08-mobile-offline'); pass('All dojo assets cached and a real writing attack works after offline reload');
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  // This fixture is confined to the isolated audit profile. Preserve the
  // champion save and prove an actual earlier-version bout resumes through UI.
  const championSave = await evaluate(`localStorage.getItem(DojoGame.SAVE_VERSION)`);
  // Hands-free checks use fresh fights only in this disposable browser profile.
  // Speech events are synthetic; the real controls, timers, combat, storage,
  // native WebGL renderer, and document visibility remain under test.
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  const readingSave = await evaluate(`(() => {
    const saved=JSON.parse(localStorage.getItem(DojoGame.SAVE_VERSION)),progress=DojoGame.createProgress();
    return JSON.stringify({...saved,progress,fight:DojoGame.startFight(progress,0),question:null,phase:'question',
      answerResolved:false,answerWasBlock:false,assisted:false,writingIndex:0,selectedMove:'front-kick',recent:[]});
  })()`);
  const speechCount = () => evaluate('window.__dojoSpeech.instances.length');
  const automaticOn = () => evaluate(`document.querySelector('#handsfree-toggle').getAttribute('aria-pressed')==='true'`);
  const autoReady = (previous, label = 'Hands-free recognizes the next prompt automatically') => waitFor(`
    document.querySelector('#handsfree-toggle').getAttribute('aria-pressed')==='true' &&
    !document.querySelector('#challenge-panel').hidden && document.querySelector('#feedback').hidden &&
    window.__dojoSpeech.instances.length>${previous} && window.__dojoSpeech.instances.at(-1).started && window.__dojoSpeech.instances.at(-1).ready &&
    typeof window.__dojoSpeech.instances.at(-1).onresult==='function'`, label);
  const emitSpeechError = code => evaluate(`window.__dojoSpeech.instances.at(-1).emit('error',{error:${JSON.stringify(code)}})`);
  async function freshReadingFight() {
    await loadIsolatedSave(readingSave); await click('#start-button');
    assert.equal(await automaticOn(),false,'Opening or reloading never enables the microphone automatically');
    assert.equal(await speechCount(),0,'No recognizer begins before explicit activation');
    assert.equal((await snapshot()).save.fight.turns,0);
  }
  await freshReadingFight();
  await evaluate('window.__dojoSpeech.startDelay=2250');
  await click('#handsfree-toggle'); await pause(300);
  assert.match(await evaluate(`document.querySelector('#voice-status').textContent`),/starting Japanese microphone/i,
    'Provider startup must not tell the student to speak before the actual listening event');
  assert.equal(await evaluate('window.__dojoSpeech.instances.at(-1).ready'),false);
  assert.ok((await moveButtons()).every(button=>button.disabled),'Starting the microphone locks move selection');
  assert.equal((await snapshot()).save.fight.turns,0);
  await autoReady(0,'The native listening event, rather than start(), marks the microphone ready');
  state=await snapshot(); await deliverTranscript(state.save.question.prompt); state=await snapshot();
  assert.equal(state.opponent,80,'A prompt answered immediately after a slow microphone startup still earns Lightning');
  assert.ok(state.save.fight.journal.at(-1).readingMs>0&&state.save.fight.journal.at(-1).readingMs<1000,
    'Permission and provider startup time must not count against reading speed');
  voiceLatencyEvidence.push({kind:'delayed-start',providerStartupMs:2250,readingMs:state.save.fight.journal.at(-1).readingMs});
  await click('#handsfree-toggle');
  pass('Japanese microphone startup is clearly distinguished from listening, locks move choice, and does not reduce speed credit');

  await freshReadingFight(); await evaluate('window.__dojoSpeech.stopEndDelay=5000');
  await click('#handsfree-toggle'); await autoReady(0);
  state=await snapshot(); await deliverTranscript(state.save.question.prompt,false); await pause(270);
  assert.equal(await evaluate('window.__dojoSpeech.stops'),1,'A stable complete Japanese interim requests one early endpoint');
  assert.equal((await snapshot()).save.fight.turns,0,'A stable matching interim is still not a graded answer');
  assert.match(await evaluate(`document.querySelector('#voice-status').textContent`),/checking/i);
  await evaluate('window.__dojoStableFinal=window.__dojoSpeech.instances.at(-1).onresult');
  await pause(2200); await deliverTranscript(state.save.question.prompt); state=await snapshot();
  assert.equal(state.opponent,80,'Provider final-result delivery lag must not remove a clean Lightning bonus');
  assert.equal(state.save.fight.turns,1);
  assert.ok(state.save.fight.journal.at(-1).readingMs>0&&state.save.fight.journal.at(-1).readingMs<1500,
    'Speed ends at the utterance endpoint, before delayed network finalization');
  voiceLatencyEvidence.push({kind:'delayed-final',providerDeliveryLagMs:2200,readingMs:state.save.fight.journal.at(-1).readingMs});
  await click('#handsfree-toggle');
  const stableJournal=JSON.stringify(state.save.fight.journal);
  await evaluate(`(() => {const transcript=JSON.parse(localStorage.getItem(DojoGame.SAVE_VERSION)).question.prompt;
    const result=Object.assign([{transcript,confidence:0.99}],{isFinal:true});window.__dojoStableFinal?.({resultIndex:0,results:[result]});})()`);
  assert.equal(JSON.stringify((await snapshot()).save.fight.journal),stableJournal,'A delayed duplicate final cannot grade twice');
  pass('Stable whole-answer interim recognition requests a faster final without awarding a hit; network delivery time and duplicate finals cannot affect scoring');

  await freshReadingFight(); await evaluate('window.__dojoSpeech.stopEndDelay=5000');
  await click('#handsfree-toggle'); await autoReady(0);
  state=await snapshot(); await deliverTranscript('definitely-wrong',false); await pause(270);
  assert.equal(await evaluate('window.__dojoSpeech.stops'),0,'Wrong interim recognition must not force a partial answer endpoint');
  await deliverTranscript(state.save.question.prompt,false); await pause(80);
  await deliverTranscript('definitely-wrong',false); await pause(250);
  assert.equal(await evaluate('window.__dojoSpeech.stops'),0,'A revised hypothesis cancels an earlier matching interim timer');
  assert.equal((await snapshot()).save.fight.turns,0);
  await deliverTranscript(state.save.question.prompt); state=await snapshot();
  assert.equal(state.save.fight.turns,1); assert.equal(state.player,100); assert.equal(state.opponent,80);
  await click('#handsfree-toggle');
  pass('Wrong interim hypotheses never force a stop, and revised matching hypotheses cancel their debounce without grading or damage');

  await freshReadingFight(); await evaluate('window.__dojoSpeech.stopEndDelay=5000');
  await click('#handsfree-toggle'); await autoReady(0);
  state=await snapshot(); await deliverTranscript(state.save.question.prompt,false); await pause(270);
  assert.equal(await evaluate('window.__dojoSpeech.stops'),1);
  await deliverTranscript('definitely-wrong'); state=await snapshot();
  assert.equal(state.save.fight.turns,1); assert.equal(state.player,100); assert.equal(state.opponent,100);
  assert.equal(state.save.fight.pendingDamage,10,'Only the actual revised final determines whether the attack or counter happens');
  assert.equal(state.save.fight.streak,0);
  await click('#handsfree-toggle');
  pass('A stable matching interim followed by a wrong final never awards a false attack or combo');

  const numericMisrecognitionSave=await evaluate(`(() => {
    const saved=JSON.parse(${JSON.stringify(readingSave)}),progress=DojoGame.createProgress(),fight=DojoGame.startFight(progress,0);
    for(let mistake=0;mistake<6;mistake++){
      DojoGame.resolveAnswer(fight,{correct:false,assisted:false,move:'front-kick'});
      if(mistake<5)DojoGame.resolveAnswer(fight,{correct:true,assisted:false,move:'front-kick'});
    }
    const kanaIndex=DojoGame.KANA.findIndex(kana=>kana.char==='さ');
    const question=DojoGame.createQuestion(0,{},[],()=>(kanaIndex+0.1)/DojoGame.BELTS[0].kanaCount);
    return JSON.stringify({...saved,progress,fight,question,challengeSet:null,phase:'question',answerResolved:false,
      answerWasBlock:false,assisted:false,writingIndex:0,selectedMove:'front-kick',recent:[question.id]});
  })()`);
  await loadIsolatedSave(numericMisrecognitionSave); await click('#start-button'); state=await snapshot();
  assert.equal(state.save.question.prompt,'さ'); assert.equal(state.save.fight.pendingDamage,20); assert.equal(state.player,100);
  const numericJournal=JSON.stringify(state.save.fight.journal);
  await click('#handsfree-toggle'); await autoReady(0); await deliverTranscript('3');
  state=await snapshot();
  assert.equal(JSON.stringify(state.save.fight.journal),numericJournal,'A recognizer number substituted for isolated kana is an unclear transcript, not a learner mistake');
  assert.equal(state.save.fight.pendingDamage,20,'An unclear number cannot resolve or land the pending counter');
  assert.equal(state.player,100); assert.equal(state.opponent,100); assert.equal(state.save.question.prompt,'さ');
  await autoReady(1,'A numeric kana misrecognition retries the same block challenge automatically');
  await deliverTranscript('さ'); state=await snapshot();
  assert.equal(state.player,100); assert.equal(state.opponent,100); assert.equal(state.save.fight.pendingDamage,0);
  assert.equal(state.save.fight.blocks,6); assert.equal(state.save.fight.mistakes,6);
  await click('#handsfree-toggle');
  pass('Chrome recognizing spoken さ as 3 cannot land a queued 20-damage counter; retrying the same さ correctly blocks it');

  await freshReadingFight(); await click('#handsfree-toggle'); await autoReady(0);
  await evaluate('window.__dojoSpeech.trackTimers=true;window.__dojoSpeech.scheduled=[]');
  state=await snapshot(); await deliverTranscript(state.save.question.prompt); await autoReady(1);
  const nativeRearm=await evaluate(`({readyGapMs:window.__dojoSpeech.instances.at(-1).readyAt-window.__dojoSpeech.transcripts.filter(item=>item.final).at(-1).at,
    timers:window.__dojoSpeech.scheduled.map(item=>item.delay),providerStartupMs:window.__dojoSpeech.startDelay})`);
  assert.equal(nativeRearm.providerStartupMs,0,'The latency measurement does not inherit the earlier deliberately delayed provider');
  assert.ok(nativeRearm.timers.includes(220)&&nativeRearm.timers.includes(40),'A fast correct answer schedules a 220ms advance and 40ms microphone rearm');
  assert.ok(nativeRearm.readyGapMs>0&&nativeRearm.readyGapMs<1200,
    'The next native microphone is ready promptly outside video capture: '+nativeRearm.readyGapMs+'ms');
  voiceLatencyEvidence.push({kind:'next-prompt-ready-without-capture',...nativeRearm});
  console.log('VOICE TIMING next Japanese mic ready without capture: '+nativeRearm.readyGapMs+'ms (requested 220ms + 40ms)');
  await evaluate('window.__dojoSpeech.trackTimers=false'); await click('#handsfree-toggle');
  pass('Fast hands-free answers request a 220ms advance and 40ms microphone rearm, with native readiness measured outside video capture');

  await freshReadingFight();
  await click('#handsfree-toggle'); await autoReady(0);
  await startComboRecording();await pause(350);
  const rapidDamage = [20,23,35];
  for(let strike=0;strike<3;strike++){
    if(strike){
      await autoReady(strike);
      const readyGap=await evaluate(`window.__dojoSpeech.instances.at(-1).readyAt-window.__dojoSpeech.transcripts.filter(item=>item.final).at(-1).at`);
      assert.ok(Number.isFinite(readyGap)&&readyGap>0,'Recorded combo native-ready timing is finite and belongs to its preceding answer: '+readyGap);
      voiceLatencyEvidence.push({kind:'next-prompt-ready-during-capture',strike:strike+1,readyGapMs:readyGap});
      console.log('VOICE TIMING next Japanese mic ready during native video capture: '+readyGap+'ms');
      if(strike===1){
        const beforeStale=JSON.stringify((await snapshot()).save.fight.journal);
        await evaluate(`(() => {const transcript=JSON.parse(localStorage.getItem(DojoGame.SAVE_VERSION)).question.prompt;
          const result=Object.assign([{transcript,confidence:0.99}],{isFinal:true});window.__dojoStaleFinal?.({resultIndex:0,results:[result]});})()`);
        assert.equal(JSON.stringify((await snapshot()).save.fight.journal),beforeStale,'A final callback from the previous prompt cannot answer its successor');
      }
    } else await evaluate('window.__dojoStaleFinal=window.__dojoSpeech.instances.at(-1).onresult');
    const before=await snapshot();
    await deliverTranscript(before.save.question.prompt);
    state=await snapshot();
    assert.equal(before.opponent-state.opponent,rapidDamage[strike],'Rapid clean answers include real speed damage and the third-answer combo');
    assert.equal(state.save.fight.streak,strike+1); assert.equal(state.player,100);
    const event=state.save.fight.journal.at(-1);
    assert.ok(event.readingMs>0&&event.readingMs<=2000,'Speed timing is recorded from actual controller time');
    const notice=await evaluate(`({hidden:document.querySelector('#speed-notice').hidden,
      tier:document.querySelector('#speed-notice').dataset.tier,text:document.querySelector('#speed-notice').textContent})`);
    assert.equal(notice.hidden,false); assert.equal(notice.tier,'lightning'); assert.match(notice.text,/\+6 DAMAGE/);
    if(strike===2){assert.match(notice.text,/COMBO BOOST/);assert.match(await evaluate(`document.querySelector('#feedback-title').textContent`),/combo/i);}
    rapidEvidence.push({strike:strike+1,damage:before.opponent-state.opponent,readingMs:event.readingMs,notice:notice.text});
  }
  assert.equal(await speechCount(),3,'Three attacks required exactly one hands-free activation and no per-turn microphone clicks');
  await click('#handsfree-toggle'); assert.equal(await automaticOn(),false);
  const rapidSave=await evaluate('localStorage.getItem(DojoGame.SAVE_VERSION)'), rapidQuestion=(await snapshot()).save.question.id;
  await evaluate(`scrollTo({top:0,left:0,behavior:'instant'})`); await screenshot('12-hands-free-lightning-combo');
  await pause(850);
  assert.equal(await speechCount(),3); state=await snapshot(); assert.equal(state.feedback,true); assert.equal(state.save.question.id,rapidQuestion);
  pass('One microphone activation strings three lightning attacks into a real combo, with +6 damage notices and stale-result protection');
  pass('Stopping hands-free during answer feedback cancels automatic advance and microphone rearming');
  await pause(700);await stopComboRecording();
  pass('Captured the actual native WebGL lightning chain with real health bars and speed-combo notifications as moving video');

  await click('#handsfree-toggle'); await autoReady(3);
  await deliverTranscript('definitely-wrong'); state=await snapshot();
  assert.equal(state.player,100); assert.equal(state.save.fight.pendingDamage,10); assert.equal(state.save.fight.streak,0);
  assert.equal(Object.hasOwn(state.save.fight.journal.at(-1),'readingMs'),false);
  assert.equal(await evaluate(`document.querySelector('#speed-notice').hidden`),true);
  await autoReady(4,'A mistake automatically presents and listens for the basic block chance');
  state=await snapshot(); assert.equal(state.save.question.techniqueId,'front-kick');
  assert.equal(await evaluate(`document.querySelector('#block-banner').hidden`),false);
  await deliverTranscript(state.save.question.prompt); state=await snapshot();
  assert.equal(state.player,100); assert.equal(state.opponent,22); assert.equal(state.save.fight.blocks,1); assert.equal(state.save.fight.pendingDamage,0);
  assert.equal(Object.hasOwn(state.save.fight.journal.at(-1),'readingMs'),false,'Fast blocks earn no attack-speed bonus');
  assert.equal(await evaluate(`document.querySelector('#speed-notice').hidden`),true);
  await autoReady(5);
  await click('#hint-button'); state=await snapshot(); await deliverTranscript(state.save.question.prompt); state=await snapshot();
  assert.equal(state.opponent,15); assert.equal(state.save.fight.streak,0);
  assert.equal(Object.hasOwn(state.save.fight.journal.at(-1),'readingMs'),false,'Guided attacks earn no speed bonus');
  assert.equal(await evaluate(`document.querySelector('#speed-notice').hidden`),true);
  await click('#handsfree-toggle');
  pass('Hands-free mistakes still offer a block chance; blocks and guided answers never award speed damage or notices');

  await freshReadingFight();state=await snapshot();const previewedQuestion=state.save.question.id;
  await click('#listen-button');await pause(10);await evaluate('window.__dojoChangedMoveFinal=window.__dojoSpeech.instances.at(-1).onresult');
  await evaluate(`window.__dojoSpeech.instances.at(-1).onerror?.({error:'no-speech'})`);await pause(20);
  await click('#move-list [data-move="punch"]');await click('#move-list [data-move="front-kick"]');state=await snapshot();
  assert.equal(state.save.question.id,previewedQuestion);assert.equal(state.save.challengeSet.switched,true);
  await evaluate(`(() => {const transcript=JSON.parse(localStorage.getItem(DojoGame.SAVE_VERSION)).question.prompt;
    const result=Object.assign([{transcript,confidence:0.99}],{isFinal:true});window.__dojoChangedMoveFinal?.({resultIndex:0,results:[result]});})()`);
  assert.equal((await snapshot()).save.fight.turns,0,'A canceled recognizer cannot grade after a move choice');
  await send('Page.reload',{ignoreCache:false});await waitFor(`document.documentElement.dataset.dojoReady==='true'`,'Previewed prompt reload');await click('#start-button');
  state=await snapshot();assert.equal(state.save.question.id,previewedQuestion);assert.equal(state.save.challengeSet.switched,true);
  await click('#handsfree-toggle');await autoReady(0);await deliverTranscript(state.save.question.prompt);state=await snapshot();
  assert.equal(state.opponent,86,'A previously previewed prompt retains normal damage without a reset speed bonus');
  assert.equal(Object.hasOwn(state.save.fight.journal.at(-1),'readingMs'),false);
  assert.equal(await evaluate(`document.querySelector('#speed-notice').hidden`),true);await click('#handsfree-toggle');
  pass('Changing moves and returning cannot reset speed eligibility, even after reload; stale speech results never grade the selected activity');

  await freshReadingFight(); await click('#handsfree-toggle'); await autoReady(0); await pause(2200);
  state=await snapshot(); await deliverTranscript(state.save.question.prompt); state=await snapshot();
  assert.equal(state.opponent,83); assert.ok(state.save.fight.journal.at(-1).readingMs>2000&&state.save.fight.journal.at(-1).readingMs<=4000);
  assert.equal(await evaluate(`document.querySelector('#speed-notice').dataset.tier`),'quick');
  assert.match(await evaluate(`document.querySelector('#speed-notice').textContent`),/\+3 DAMAGE/);
  await click('#handsfree-toggle'); await screenshot('13-hands-free-quick-bonus');
  await freshReadingFight(); await click('#handsfree-toggle'); await autoReady(0); await pause(4200);
  state=await snapshot(); await deliverTranscript(state.save.question.prompt); state=await snapshot();
  assert.equal(state.opponent,86); assert.equal(state.player,100); assert.ok(state.save.fight.journal.at(-1).readingMs>4000);
  assert.equal(await evaluate(`document.querySelector('#speed-notice').hidden`),true);
  await click('#handsfree-toggle');
  pass('Quick reading earns +3 real damage; slower correct reading keeps full normal damage and costs no energy');

  await freshReadingFight(); await click('#handsfree-toggle'); await autoReady(0);
  const quietQuestion=(await snapshot()).save.question.id;
  await emitSpeechError('no-speech'); await autoReady(1,'Silence retries automatically without grading');
  assert.equal((await snapshot()).save.question.id,quietQuestion); assert.equal((await snapshot()).save.fight.turns,0);
  state=await snapshot(); await deliverTranscript(state.save.question.prompt); state=await snapshot();
  assert.equal(state.opponent,86); assert.equal(state.player,100);
  assert.equal(Object.hasOwn(state.save.fight.journal.at(-1),'readingMs'),false,'A recovered recognition error cannot reset the speed clock for a bonus');
  await click('#handsfree-toggle');
  await freshReadingFight(); await click('#handsfree-toggle'); await autoReady(0);
  for(let silence=1;silence<=3;silence++){
    await emitSpeechError('no-speech');
    if(silence<3)await autoReady(silence,'Bounded automatic silence retry '+silence);
  }
  assert.equal(await automaticOn(),false); const boundedCount=await speechCount(); await pause(1100);
  assert.equal(await speechCount(),boundedCount); state=await snapshot(); assert.equal(state.save.fight.turns,0); assert.equal(state.player,100); assert.equal(state.opponent,100);
  assert.match(await evaluate(`document.querySelector('#handsfree-status').textContent`),/silence|paused/i);
  pass('Silence retries automatically twice, never grades or causes damage, and stops after the third silent result without manufacturing a speed bonus');

  for(const code of ['network','not-allowed']){
    const previous=await speechCount(); await click('#handsfree-toggle'); await autoReady(previous);
    await emitSpeechError(code); assert.equal(await automaticOn(),false); const stopped=await speechCount();
    assert.match(await evaluate(`document.querySelector('#voice-status').textContent`),code==='network'?/could not reach its speech service/:/permission was blocked/,
      'The actual microphone or speech-service diagnostic remains visible after cancellation');
    await pause(1100); assert.equal(await speechCount(),stopped,'Speech-service and permission errors must not create retry loops');
    state=await snapshot(); assert.equal(state.player,100); assert.equal(state.save.fight.turns,0);
  }
  pass('Network and microphone-permission errors immediately stop hands-free without a retry loop, health loss, or an answered turn');

  let previous=await speechCount(); await click('#handsfree-toggle'); await autoReady(previous);
  await evaluate('window.__dojoPausedFinal=window.__dojoSpeech.instances.at(-1).onresult');
  const pausedQuestion=(await snapshot()).save.question.id;
  await click('#pause-button'); previous=await speechCount(); await pause(1100);
  assert.equal((await snapshot()).pause,true); assert.equal(await speechCount(),previous); assert.equal((await snapshot()).save.question.id,pausedQuestion);
  await evaluate(`(() => {const transcript=JSON.parse(localStorage.getItem(DojoGame.SAVE_VERSION)).question.prompt;
    const result=Object.assign([{transcript,confidence:0.99}],{isFinal:true});window.__dojoPausedFinal?.({resultIndex:0,results:[result]});})()`);
  assert.equal((await snapshot()).save.fight.turns,0,'An already captured callback cannot submit while paused');
  await click('#resume-button'); await autoReady(previous,'Explicit resume rearms the hands-free microphone');
  state=await snapshot(); await deliverTranscript(state.save.question.prompt);
  await click('#pause-button'); previous=await speechCount(); const answeredQuestion=(await snapshot()).save.question.id;
  await pause(1000); state=await snapshot(); assert.equal(state.pause,true); assert.equal(state.feedback,true); assert.equal(state.save.question.id,answeredQuestion); assert.equal(await speechCount(),previous);
  await click('#resume-button'); await autoReady(previous,'Resuming an answered prompt safely schedules its successor');
  await click('#help-button'); previous=await speechCount(); await pause(1000);
  assert.equal(await evaluate(`document.querySelector('#help-dialog').open`),true); assert.equal(await speechCount(),previous);
  assert.equal((await snapshot()).save.fight.turns,1);
  await click('#help-dialog [data-close]'); await autoReady(previous,'Closing help rearms only the unchanged question');
  pass('Pause and help cancel active speech and pending advances; explicit return resumes exactly one listener and preserves the question');

  const hiddenTurn=(await snapshot()).save.fight.turns, hiddenCount=await speechCount();
  const otherTarget=await send('Target.createTarget',{url:'about:blank'});
  await send('Target.activateTarget',{targetId:otherTarget.targetId});
  await waitFor('document.hidden','Native browser tab visibility changes to hidden');
  await waitFor(`document.querySelector('#handsfree-toggle').getAttribute('aria-pressed')==='false'`,'Hiding the game turns its microphone off');
  await send('Target.activateTarget',{targetId:auditPageTarget.id}); await send('Target.closeTarget',{targetId:otherTarget.targetId});
  await waitFor('!document.hidden','Return to visible game'); await pause(1000);
  assert.equal(await automaticOn(),false); assert.equal(await speechCount(),hiddenCount); assert.equal((await snapshot()).save.fight.turns,hiddenTurn);
  pass('Leaving the actual browser tab stops hands-free and returning does not silently restart the microphone');

  const rewardReadingSave=await evaluate(`(() => {
    const saved=JSON.parse(${JSON.stringify(championSave)}),progress=DojoGame.sanitizeProgress(saved.progress);
    return JSON.stringify({...saved,progress,fight:DojoGame.startFight(progress,0),question:null,phase:'question',
      answerResolved:false,answerWasBlock:false,assisted:false,writingIndex:0,selectedMove:'front-kick',recent:[]});
  })()`);
  await loadIsolatedSave(rewardReadingSave); await click('#start-button'); await click('#handsfree-toggle'); await autoReady(0);
  await click('#reward-button'); previous=await speechCount(); const rewardQuestion=(await snapshot()).save.question.id;
  await pause(1000); assert.equal(await evaluate(`document.querySelector('#reward-dialog').open`),true);
  assert.equal(await speechCount(),previous); assert.equal((await snapshot()).save.fight.turns,0); assert.equal((await snapshot()).save.question.id,rewardQuestion);
  await click('#reward-dialog [data-close]'); await autoReady(previous,'Closing the reward collection safely rearms the unchanged prompt');
  state=await snapshot(); await deliverTranscript(state.save.question.prompt);
  await click('#reward-button'); previous=await speechCount(); const rewardAnswered=(await snapshot()).save.question.id;
  await pause(1000); state=await snapshot(); assert.equal(state.feedback,true); assert.equal(state.save.question.id,rewardAnswered);
  assert.equal(state.save.fight.turns,1); assert.equal(await speechCount(),previous);
  await click('#reward-dialog [data-close]'); await autoReady(previous,'Closing the reward collection resumes the canceled answer advance once');
  await click('#handsfree-toggle');
  pass('Opening rewards cancels active speech and pending automatic advances while preserving the fight and saved ice creams');

  await loadIsolatedSave(rapidSave); state=await snapshot();
  assert.equal(await automaticOn(),false); assert.equal(await speechCount(),0);
  await click('#start-button'); state=await snapshot();
  assert.equal(state.opponent,22); assert.equal(state.save.fight.streak,3); assert.equal(state.save.fight.turns,3); assert.equal(state.feedback,true);
  assert.ok(state.save.fight.journal.every(event=>event.readingMs>0&&event.readingMs<=2000));
  await send('Page.reload',{ignoreCache:false}); await waitFor(`document.documentElement.dataset.dojoReady==='true'`,'Rapid combo reload');
  assert.equal(await automaticOn(),false); assert.equal(await speechCount(),0);
  await click('#start-button'); state=await snapshot(); assert.equal(state.opponent,22); assert.equal(state.save.fight.streak,3); assert.equal(state.save.fight.turns,3);
  pass('Speed damage and combo timing replay exactly after reload while the microphone requires fresh activation');
  const katakanaSave=await evaluate(`(() => {
    const saved=JSON.parse(${JSON.stringify(championSave)}),progress=DojoGame.sanitizeProgress({...DojoGame.createProgress(),belt:3});
    return JSON.stringify({...saved,progress,fight:DojoGame.startFight(progress,2),question:null,phase:'question',
      answerResolved:false,answerWasBlock:false,assisted:false,writingIndex:0,selectedMove:'front-kick',recent:[]});
  })()`);
  await loadIsolatedSave(katakanaSave);await click('#start-button');await click('#handsfree-toggle');await autoReady(0);
  for(let strike=0;strike<3;strike++){
    if(strike)await autoReady(strike,'Hands-free katakana advances to the next spoken challenge');
    const before=await snapshot();assert.equal(before.save.question.script,'katakana');assert.match(before.save.question.prompt,/^[ァ-ヺ]+$/u);
    const transcript=strike===1?before.save.question.prompt:[...before.save.question.prompt].map(char=>String.fromCharCode(char.charCodeAt(0)-0x60)).join('');
    await deliverTranscript(transcript);state=await snapshot();
    assert.equal(before.opponent-state.opponent,rapidDamage[strike]);assert.equal(state.save.fight.streak,strike+1);
    assert.equal(state.save.fight.pendingDamage,0);assert.equal(state.player,100);
    assert.equal(await evaluate(`document.querySelector('#speed-notice').dataset.tier`),'lightning');
  }
  assert.equal(await speechCount(),3);await click('#handsfree-toggle');
  await evaluate(`scrollTo({top:0,left:0,behavior:'instant'})`);await screenshot('14-katakana-hands-free-lightning-combo');
  pass('Katakana hands-free accepts both recognition scripts and chains three lightning strikes into a saved real damage combo');
  await loadIsolatedSave(championSave);
  // Exercise the final master's exception with genuine incorrect pen input in
  // this throwaway profile. The real learner's browser storage is never read.
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  const masterSave = await evaluate(`(() => {
    const saved=JSON.parse(localStorage.getItem(DojoGame.SAVE_VERSION));
    const progress=DojoGame.sanitizeProgress({...saved.progress,mastered:false});
    return JSON.stringify({...saved,progress,fight:DojoGame.startFight(progress,10),phase:'question',
      answerResolved:false,answerWasBlock:false,assisted:false,writingIndex:0,selectedMove:'front-kick',recent:[],
      question:{id:'kanji-write:月',mode:'kanji-write',prompt:'moon',answer:'月',reading:'つき',meaning:'moon',chars:['月'],
        techniqueId:'front-kick',challengeKind:'basic',difficulty:'basic',difficultyLevel:0,challengeLabel:'Standard activity'}});
  })()`);
  await loadIsolatedSave(masterSave);
  const master = await evaluate(`({...DojoGame.OPPONENTS[10],warning:document.querySelector('#master-rule')?.innerText,
    warningVisible:!!document.querySelector('#master-rule')&&!document.querySelector('#master-rule').hidden})`);
  assert.equal(master.name, 'Master Steif'); assert.equal(master.hairstyle, 'crop');
  assert.ok(/^#[0-9a-f]{6}$/i.test(master.hair), 'Master Steif has an explicit grey hair color');
  const hair = master.hair.slice(1).match(/../g).map(part => parseInt(part,16));
  assert.ok(Math.max(...hair)-Math.min(...hair)<=32 && Math.min(...hair)>100, 'Master hair is visibly grey, not dark or a saturated color');
  assert.equal(master.warningVisible,true); assert.match(master.warning,/33\.3%/); assert.match(master.warning,/no block chance/i);
  await click('#start-button'); state = await snapshot();
  assert.equal(state.save.fight.beltIndex,10); assert.equal(state.player,100); assert.equal(state.save.progress.mastered,false);
  assert.equal(await evaluate(`document.querySelector('#opponent-name').textContent`),'Master Steif');
  assert.equal(await evaluate(`document.querySelector('#block-banner').hidden`),true);
  const masterRewards = JSON.stringify(state.save.progress.rewards), masterBelt=state.save.progress.belt, masterLosses=state.save.progress.losses;
  await evaluate(`scrollTo({top:0,left:0,behavior:'instant'})`); await pause(180);
  await screenshot('10-master-steif-fighter-and-rules');
  await traceCharacter(state.save.question.chars[0],true); await click('#check-writing');
  state = await snapshot();
  assert.ok(Math.abs(state.save.fight.playerHp-200/3)<0.00001,'First mistake immediately costs one third of maximum energy');
  assert.equal(state.player,66.7);
  assert.equal(state.save.fight.pendingDamage,0); assert.equal(state.save.fight.mistakes,1);
  assert.equal(state.save.fight.blocks,0); assert.equal(state.opponent,100);
  assert.equal(await evaluate(`document.querySelector('#player-hp').textContent`),'66.7 / 100');
  assert.match(await evaluate(`document.querySelector('#feedback-title').textContent`),/Master Steif.*33\.3%/i);
  assert.match(state.detail,/no block/i);
  await evaluate(`scrollTo({top:0,left:0,behavior:'instant'})`); await pause(180);
  await screenshot('10-master-steif-first-immediate-hit');
  pass('Final Master Steif has short grey hair, a visible no-block warning, and immediately deals 33.3% after an incorrect kanji drawing');
  const firstMasterJournal = JSON.stringify(state.save.fight.journal), firstMasterQuestion=state.save.question.id;
  await send('Page.reload',{ignoreCache:false});
  await waitFor(`document.documentElement.dataset.dojoReady==='true'`,'Master Steif first-hit reload');
  await click('#start-button'); state=await snapshot();
  assert.ok(Math.abs(state.save.fight.playerHp-200/3)<0.00001); assert.equal(state.player,66.7); assert.equal(state.save.fight.pendingDamage,0);
  assert.equal(state.save.question.id,firstMasterQuestion); assert.equal(state.feedback,true);
  assert.equal(JSON.stringify(state.save.fight.journal),firstMasterJournal);
  assert.equal(await evaluate(`document.querySelector('#check-writing').disabled`),true);
  assert.match(await evaluate(`document.querySelector('#feedback-title').textContent`),/Master Steif|saved/i);
  await nextQuestion(); state=await snapshot();
  assert.equal(state.save.fight.pendingDamage,0); assert.equal(await evaluate(`document.querySelector('#block-banner').hidden`),true);
  await assertUnlockedMoves(10);
  await click('#move-list [data-move="dragon-finisher"]'); state=await snapshot();
  assert.equal(state.save.question.challengeKind,'special','The next activity is an attack; selecting a special is allowed');
  pass('Master Steif immediate damage and answered lock survive reload exactly once; the next activity offers an attack without a block chance');
  for(let mistake=2;mistake<=3;mistake++){
    await traceCharacter(state.save.question.chars[0],true); await click('#check-writing'); state=await snapshot();
    assert.equal(state.save.fight.pendingDamage,0); assert.equal(state.save.fight.blocks,0);
    assert.equal(state.save.fight.mistakes,mistake); assert.equal(state.opponent,100);
    assert.equal(state.save.progress.belt,masterBelt); assert.equal(state.save.progress.mastered,false);
    assert.equal(JSON.stringify(state.save.progress.rewards),masterRewards,'Mistakes do not unlock or erase saved rewards');
    if(mistake===2){
      assert.ok(Math.abs(state.save.fight.playerHp-100/3)<0.00001); assert.equal(state.player,33.3); assert.equal(await evaluate(`document.querySelector('#player-hp').textContent`),'33.3 / 100');
      await nextQuestion(); state=await snapshot();
      assert.equal(state.save.question.challengeKind,'special'); assert.equal(await evaluate(`document.querySelector('#block-banner').hidden`),true);
    }
  }
  assert.equal(state.player,0); assert.equal(state.save.fight.status,'lost'); assert.equal(state.save.fight.turns,3);
  await nextQuestion(); state=await snapshot(); assert.equal(state.result,true);
  assert.equal(state.save.progress.mastered,false); assert.equal(state.save.progress.losses,masterLosses+1);
  await screenshot('11-master-steif-three-mistakes-defeat');
  pass('Three Master Steif mistakes end the fight, including special-technique mistakes, without a queued counter or reward loss');
  await loadIsolatedSave(championSave);
  assert.equal((await snapshot()).save.progress.mastered,true);
  const legacySave = await evaluate(`(() => {
    const saved=JSON.parse(localStorage.getItem(DojoGame.SAVE_VERSION));
    const progress={...saved.progress,belt:8,rewards:Object.fromEntries(['reading','writing','words','kanji'].map(id=>[id,saved.progress.rewards[id]]))};
    delete progress.courseVersion;delete progress.completedSections;
    const legacy={...saved,progress,phase:'answered',answerResolved:true,answerWasBlock:false,assisted:false,writingIndex:0,
      selectedMove:'front-kick',recent:[],
      question:{id:'kanji-write:月',mode:'kanji-write',prompt:'moon',answer:'月',reading:'つき',meaning:'moon',chars:['月']},
      fight:{version:DojoGame.SAVE_VERSION,rulesVersion:2,beltIndex:8,originBelt:8,journal:[
        {correct:true,assisted:false,move:'roundhouse'},
        {correct:true,assisted:false,move:'double-kick'},
        {correct:false,assisted:false,move:'front-kick'}]}};
    delete legacy.courseVersion;return JSON.stringify(legacy);
  })()`);
  await loadIsolatedSave(legacySave);
  await click('#start-button'); state = await snapshot();
  assert.equal(state.save.question.id, 'kanji-write:月');
  assert.equal(state.save.progress.belt,10,'An old black belt is mapped once to the expanded black belt');
  assert.equal(state.save.fight.beltIndex,10);assert.equal(state.save.fight.originBelt,10);
  assert.equal(state.save.progress.mastered,true,'Earned old mastery is preserved');
  assert.equal(state.save.progress.courseVersion,2);assert.equal(state.save.fight.courseVersion,2);
  for(const id of ['reading','writing','words','kanji'])assert.equal(state.save.progress.rewards[id].claimed,true,'Existing claimed ice creams survive expansion');
  for(const id of ['katakana-reading','katakana-writing']){
    assert.equal(state.save.progress.rewards[id].unlocked,false,'New katakana awards require the actual new curriculum');
    assert.equal(state.save.progress.rewards[id].claimed,false);
  }
  assert.equal(state.save.question.techniqueId, 'front-kick');
  assert.equal(state.save.question.challengeKind, 'basic');
  assert.equal(state.feedback, true, 'The earlier answer remains locked');
  assert.equal(state.player, 100); assert.equal(state.opponent, 63, 'Earlier 15 + 22 damage is preserved');
  assert.equal(state.save.fight.pendingDamage, 10); assert.equal(state.save.fight.bestStreak, 2);
  assert.equal(state.save.fight.journal.length, 3);
  assert.ok(state.save.fight.journal.every(event => event.rulesVersion === 2));
  await nextQuestion(); state = await snapshot();
  assert.equal(state.save.question.techniqueId, 'front-kick'); assert.equal(state.save.question.challengeKind, 'basic');
  state = await answerCorrect();
  assert.equal(state.player, 100); assert.equal(state.opponent, 63); assert.equal(state.save.fight.pendingDamage, 0);
  await nextQuestion(); state = await answerCorrect();
  assert.equal(state.opponent, 49, 'The next basic answer uses the current equal 14 damage');
  pass('Earlier nine-belt mastery, four claimed rewards, question, HP, combo history and pending block migrate once; new katakana rewards stay unearned');
  const versionThreeSave=JSON.stringify({...JSON.parse(legacySave),fight:{version:await evaluate('DojoGame.SAVE_VERSION'),
    rulesVersion:3,beltIndex:8,originBelt:8,journal:[
      {correct:true,assisted:false,move:'front-kick',challengeKind:'basic',rulesVersion:3},
      {correct:false,assisted:false,move:'front-kick',challengeKind:'basic',rulesVersion:3}]}});
  await loadIsolatedSave(versionThreeSave); await click('#start-button'); state=await snapshot();
  assert.equal(state.player,100); assert.equal(state.opponent,86); assert.equal(state.save.fight.pendingDamage,10);
  await nextQuestion(); state=await answerCorrect();
  assert.equal(state.player,100); assert.equal(state.opponent,86); assert.equal(state.save.fight.blocks,1); assert.equal(state.save.fight.pendingDamage,0);
  await nextQuestion(); state=await snapshot();
  await traceCharacter(state.save.question.chars[0],true); await click('#check-writing'); state=await snapshot();
  assert.ok(Math.abs(state.save.fight.playerHp-200/3)<0.00001); assert.equal(state.player,66.7); assert.equal(state.opponent,86); assert.equal(state.save.fight.pendingDamage,0);
  const currentRulesVersion=await evaluate('DojoGame.FIGHT_VERSION');
  assert.deepEqual(state.save.fight.journal.map(event=>event.rulesVersion),[3,3,currentRulesVersion,currentRulesVersion]);
  await send('Page.reload',{ignoreCache:false}); await waitFor(`document.documentElement.dataset.dojoReady==='true'`,'Mixed version-3 and current-rules journal reload');
  await click('#start-button'); state=await snapshot();
  assert.ok(Math.abs(state.save.fight.playerHp-200/3)<0.00001); assert.equal(state.player,66.7); assert.equal(state.save.fight.pendingDamage,0);
  assert.deepEqual(state.save.fight.journal.map(event=>event.rulesVersion),[3,3,currentRulesVersion,currentRulesVersion]);
  pass('Version-3 final-master history keeps its already queued block, then adopts immediate Master Steif damage and replays mixed saves faithfully');
  await loadIsolatedSave(championSave);
  assert.equal((await snapshot()).save.progress.mastered, true);
  assert.equal(external.length, 0, 'Dojo must not request remote runtime assets: ' + JSON.stringify(external));
  assert.equal(errors.length, 0, 'No browser runtime exceptions: ' + JSON.stringify(errors));
  assert.equal(requests.filter(request => request.status === 404 && request.name !== '/favicon.ico').length, 0,
    'No missing local assets: ' + JSON.stringify(requests.filter(request => request.status === 404)));
  pass('No external asset dependencies, missing dojo assets, or runtime exceptions');
  const report = { passed: true, checks, campaign, rapidEvidence, impactEvidence, voiceLatencyEvidence, comboRecording, webgl: pixels, recognition: 'Synthetic SpeechRecognition final/interim/error events, delayed native startup, interim revisions, endpoint requests, and delayed final delivery; real hands-free timers, native tab visibility, combat, saves, and WebGL exercised. Live microphone and speech service not tested', elapsedSeconds: Math.round((Date.now() - started) / 1000), screenshots: artifacts, errors, external };
  fs.writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log('PASS: ' + checks.length + ' dojo browser checks in ' + report.elapsedSeconds + ' seconds. Evidence: ' + artifacts);
  await send('Browser.close').catch(() => {});
})().catch(async error => {
  console.error(error.stack || error);
  if (send) {
    try { const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'FAILURE.png'),Buffer.from(shot.data,'base64')); } catch (_) {}
    try { fs.writeFileSync(path.join(artifacts,'failure-state.json'),JSON.stringify(await evaluate(`(async()=>({save:localStorage.getItem(typeof DojoGame!=='undefined'?DojoGame.SAVE_VERSION:'fiona-taekwondo-v1'),body:document.body.innerText,voice:window.__dojoSpeech&&{transcripts:window.__dojoSpeech.transcripts,instances:window.__dojoSpeech.instances.map(rec=>({started:rec.started,ready:rec.ready,readyAt:rec.readyAt})),startDelay:window.__dojoSpeech.startDelay,stopEndDelay:window.__dojoSpeech.stopEndDelay,scheduled:window.__dojoSpeech.scheduled},serviceWorkers:await navigator.serviceWorker?.getRegistrations().then(items=>items.map(item=>({scope:item.scope,active:item.active?.state,installing:item.installing?.state,waiting:item.waiting?.state}))),caches:await caches.keys()}))()`),null,2)); } catch (_) {}
  }
  fs.writeFileSync(path.join(artifacts, 'failure.json'), JSON.stringify({ message: String(error.stack || error), checks, campaign, voiceLatencyEvidence, errors, workerErrors, external, requests, elapsedSeconds: Math.round((Date.now() - started) / 1000) }, null, 2));
  console.error('Evidence: ' + artifacts); process.exitCode = 1;
}).finally(() => { ws?.close(); browser?.kill(); server.close(); });
