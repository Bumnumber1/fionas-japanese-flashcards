// Records the actual WebGL fight preview in an isolated browser profile.
// node record_taekwondo_demo.cjs [absolute-output-directory]
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const root = __dirname;
const output = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'dojo-fight-preview-')));
fs.mkdirSync(output, { recursive: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(data);
  });
});
let browser, ws;
const exceptions = [];
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dojo-preview-edge-'));
  browser = spawn(process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox',
    '--disable-extensions', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
    '--remote-allow-origins=*', '--user-data-dir=' + profile, 'about:blank'
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  browser.stderr.on('data', () => {});
  let port;
  for (let n = 0; n < 100; n++) { try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; } catch (_) {} await pause(200); }
  assert.ok(port, 'Isolated recording browser starts');
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
  ws = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let serial = 0; const pending = new Map();
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { const task = pending.get(message.id); pending.delete(message.id); clearTimeout(task.timer); message.error ? task.reject(Error(JSON.stringify(message.error))) : task.resolve(message.result); }
    else if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(Error('Recording timed out: ' + method)); }, 55000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 940, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/taekwondo-demo.html' });
  for (let n = 0; n < 150; n++) { if (await evaluate('!!(window.DojoDemo && DojoDemo.scene && DojoDemo.scene.available)')) break; await pause(100); }
  assert.ok(await evaluate('!!(window.DojoDemo && DojoDemo.scene.available)'), 'Actual WebGL preview is available');
  const before = await evaluate('JSON.stringify(localStorage)');
  console.log('Recording the actual 3D renderer, with no microphone or save changes.');
  const recording = await evaluate(`new Promise((resolve, reject) => {
    const demo=window.DojoDemo, canvas=demo.scene.canvas;
    const supported=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
    if(!supported){reject(Error('No browser video encoder'));return;}
    const stream=canvas.captureStream(24), recorder=new MediaRecorder(stream,{mimeType:supported,videoBitsPerSecond:2400000}),chunks=[],states=[];
    let lastState='';
    const sample=setInterval(()=>{
      const key=demo.currentMove?.move+':'+demo.fight.turns+':'+demo.fight.opponentHp;
      if(key===lastState)return;lastState=key;
      states.push({move:demo.currentMove?.move,actor:demo.currentMove?.actor||'player',playerHp:demo.fight.playerHp,opponentHp:demo.fight.opponentHp,pendingDamage:demo.fight.pendingDamage,blocks:demo.fight.blocks,streak:demo.fight.streak,won:demo.fight.won});
    },50);
    recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
    recorder.onerror=event=>reject(Error(event.error?.message||'Video encoder failed'));
    recorder.onstop=()=>{
      clearInterval(sample);stream.getTracks().forEach(track=>track.stop());
      const blob=new Blob(chunks,{type:supported}),reader=new FileReader();
      reader.onload=()=>resolve({base64:reader.result.split(',')[1],bytes:blob.size,mime:supported,width:canvas.width,height:canvas.height,states});
      reader.onerror=()=>reject(Error('Could not read video'));reader.readAsDataURL(blob);
    };
    demo.replay(); recorder.start(1000); setTimeout(()=>recorder.stop(),23000);
  })`);
  assert.ok(recording.bytes > 50000, 'Recorded substantial moving video');
  assert.ok(recording.states.some(state => state.pendingDamage === 10 && state.playerHp === 100), 'Recording includes queued counter before damage');
  assert.ok(recording.states.some(state => state.blocks === 1 && state.playerHp === 100 && !state.pendingDamage), 'Recording includes a successful defensive block');
  assert.ok(recording.states.some(state => state.won && state.opponentHp === 0 && state.streak === 3), 'Recording includes the winning combo');
  fs.writeFileSync(path.join(output, 'fionas-dojo-fight.webm'), Buffer.from(recording.base64, 'base64'));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(output, 'fight-preview-page.png'), Buffer.from(shot.data, 'base64'));
  assert.equal(await evaluate('JSON.stringify(localStorage)'), before, 'Preview preserves every saved game value');
  assert.equal(exceptions.length, 0, 'No browser errors during playback');
  // Exercise pause/resume/replay through the actual preview controls as well.
  const controls = await evaluate(`(() => {
    const demo=window.DojoDemo;document.querySelector('#pause-demo').click();const paused=demo.paused;
    document.querySelector('#pause-demo').click();const resumed=!demo.paused;
    document.querySelector('#replay-demo').click();return {paused,resumed,move:demo.currentMove};
  })()`);
  assert.ok(controls.paused && controls.resumed, 'Playback can pause and resume');
  const report = { passed: true, bytes: recording.bytes, mime: recording.mime, width: recording.width, height: recording.height, durationSeconds: 23, saveUnchanged: true, controls, states:recording.states, exceptions };
  fs.writeFileSync(path.join(output, 'fight-preview-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, output }, null, 2));
  await send('Browser.close').catch(() => {});
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(() => { ws?.close(); browser?.kill(); server.close(); });
