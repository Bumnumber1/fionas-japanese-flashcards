// Browser regression for answer-revealing pictures. Node 22+, Edge/Chromium.
// Run: node validate_activity_visuals.cjs (BROWSER_PATH and AUDIT_OUTPUT optional).
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = __dirname;
const artifacts = process.env.AUDIT_OUTPUT || fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'fiona-visual-audit-'));
fs.mkdirSync(artifacts, {recursive:true});
const pause = ms => new Promise(r => setTimeout(r, ms));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = http.createServer((req,res) => {
  const name = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file = path.join(root, name === '/' ? 'index.html' : name);
  if (!file.startsWith(path.normalize(root) + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err,data) => { if(err) res.writeHead(404).end(); else { res.setHeader('Content-Type',types[path.extname(file)] || 'application/octet-stream'); res.end(data); } });
});
let browser, ws;
(async () => {
  await new Promise(r => server.listen(0,'127.0.0.1',r));
  const port = server.address().port;
  const profile = path.join(artifacts,'edge-review-profile-'+Date.now());
  browser = spawn(process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new','--disable-gpu','--no-sandbox','--disable-extensions','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--remote-allow-origins=*','--user-data-dir='+profile,'about:blank'], { windowsHide:true, stdio:['ignore','ignore','pipe'] });
  browser.stderr.on('data',()=>{});
  browser.on('exit',(code)=>console.log('Browser exit',code));
  let debugPort;
  for(let i=0;i<80;i++) { try { debugPort=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]; break; } catch{} await pause(250); }
  assert.ok(debugPort,'Edge debug port available');
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
  ws = new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  let serial=0; const pending=new Map(); const errors=[];
  ws.onclose=()=>{for(const p of pending.values())p.reject(Error('Browser connection closed'));pending.clear();};
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p){clearTimeout(p.timer);m.error?p.reject(m.error):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP timeout: '+method)),15000);timer.unref();const id=++serial;pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const check=async(expression,message)=>assert.ok(await evaluate(expression),message);
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const ready=async()=>{for(let i=0;i<80;i++){if(await evaluate(`!!document.querySelector('#words-count')?.textContent`))return;await pause(100);}throw Error('Page did not initialize');};
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
  async function loaded(test) {
    for(let i=0;i<120;i++) { if(await evaluate(test))return; await pause(100); }
    throw Error('Page did not initialize: '+test);
  }
  async function visit(page, test='document.readyState==="complete"') {
    await send('Page.navigate',{url:`http://127.0.0.1:${port}/${page}`});
    await pause(100); await loaded(test);
  }
  const visible = `e=>!!e && e.getClientRects().length>0 && getComputedStyle(e).visibility!=='hidden'`;
  const snap = async name => {
    const shot=await send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(shot.data,'base64'));
  };
  // Syntax coverage includes every public page, not only pages with shared engines.
  const pages=fs.readFileSync(path.join(root,'generate_sw.js'),'utf8').match(/const PAGES = (\[[\s\S]*?\]);/)[1];
  const publicPages=require('node:vm').runInNewContext(pages);
  for(const page of publicPages) {
    const html=fs.readFileSync(path.join(root,page),'utf8');
    for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if(!/\bsrc=/.test(match[1]) && match[2].trim()) new (require('node:vm').Script)(match[2],{filename:page});
    }
    await visit(page);
  }
  console.log('14 public pages loaded and inline scripts parsed');

  await visit('arcade.html','typeof Activities!=="undefined" && typeof Journey!=="undefined"');
  await evaluate(`window.auditHost=document.createElement('div');document.body.appendChild(auditHost);
    window.stampEmojis=value=>{if(!value||typeof value!=='object')return;for(const key of Object.keys(value)){if(key==='emoji')value[key]='🦑';else stampEmojis(value[key]);}};
    stampEmojis(CURRICULUM);
    window.auditMaterial=Journey.reviewMaterial(5,52);
    window.auditStory=null; for(let y=1;y<=5;y++)for(let w=1;w<=52;w++)if(!auditStory && Journey.getWeek(y,w)?.story)auditStory=Journey.getWeek(y,w).story;
    window.auditData={pool:auditMaterial.pool,examples:auditMaterial.examples,kanjiPool:auditMaterial.kanji,writing:{type:'kanji',chars:auditMaterial.chars},story:auditStory};`);
  const engines=await evaluate('Object.keys(Activities.defs)');
  assert.equal(engines.length,20);
  for(const key of engines) {
    await evaluate(`window.auditRun=Activities.startCustom('${key}',auditHost,auditData);`);
    await check(`auditHost.children.length>0 && !auditHost.innerHTML.includes('🦑')`,key+' does not render vocabulary pictures');
    if(key==='story') {
      await check(`!!auditHost.querySelector('[data-quiz]')`,'Story engine exercised');
      await evaluate(`auditHost.querySelector('[data-quiz]').click()`);
      await check(`!auditHost.querySelector('.story-lines')`,'Story passage removed during recall');
    }
    if(key==='counters') await check(`auditHost.querySelectorAll('.count-emoji').length>0 && [...auditHost.querySelectorAll('.count-emoji')].every(e=>e.textContent==='●')`,'Counting uses neutral dots');
    await evaluate('auditRun.teardown();auditHost.replaceChildren()');
  }
  console.log('All 20 shared engines checked with sentinel vocabulary pictures');

  await visit('review.html','typeof actMixedQuiz==="function"');
  const legacy=await evaluate('activities.map(a=>a.fn)');
  assert.equal(legacy.length,12);
  for(const fn of legacy) {
    await evaluate(`${fn}()`);
    await check(`document.querySelector('#modal').classList.contains('active')`,'Review '+fn+' opens');
    await check(`!document.querySelector('#modal .sk-emoji, #modal .opt-emoji, #modal img')`,'Review '+fn+' has no picture options');
    await evaluate('closeModal()');
  }
  console.log('All 12 standalone review activities opened');

  await visit('writing.html','typeof switchMode==="function" && !!document.querySelector(".char-btn")');
  for(const mode of ['hiragana','katakana','kanji1','kanji2']) {
    await evaluate(`switchMode('${mode}')`);
    await check(`!document.querySelector('.char-btn .kanji-emoji, #kanjiPicEmoji')`,'No writing palette or prompt pictures: '+mode);
    await evaluate('selectChar(getCurrentData().length-1)');
    await check(`!!document.querySelector('#refChar').textContent`,'Writing models still work: '+mode);
  }
  await snap('writing-audit');
  await visit('questions.html','typeof quizMe==="function"');
  await evaluate(`localStorage.setItem('fiona-qa-saved',JSON.stringify([{ts:1,q:'なに？',a:'ほんです。',word:'なに',prompt:'a book'},{ts:2,q:'なに？',a:'ほんです。',word:'なに',prompt:'a book'}]));renderSaved();quizMe();`);
  await check(`!document.querySelector('.qw-emoji') && ![...document.querySelectorAll('.saved-a,.saved-meta,#aInput')].some(${visible})`,'Quiz hides saved answers, related pairs, metadata and editor');
  await snap('questions-during-recall');
  await pause(2700);
  await check(`(${visible})(document.querySelector('.quizzing.answer-revealed .saved-a'))`,'Answer revealed after recall interval');
  await evaluate('quizMe()');
  await check(`![...document.querySelectorAll('.saved-a')].some(${visible})`,'Restart re-hides answers');
  await evaluate('renderSaved()');
  await check(`!document.body.classList.contains('qa-quizzing') && quizTimer===null && quizClearTimer===null`,'Editing saved list cancels pending quiz');

  await visit('voicepractice.html','typeof renderScenario==="function"');
  const scenarios=await evaluate('scenarios.length');
  for(let i=0;i<scenarios;i++) {
    await evaluate(`current=${i};renderScenario()`);
    await check(`!document.querySelector('.scenario-cue') && ![...document.querySelectorAll('.target-line,.target-romaji,.target-en')].some(${visible})`,'Speaking scenario '+i+' conceals targets');
    await evaluate(`revealStep('q')`);
    await check(`(${visible})(document.querySelector('#q-step .target-line'))`,'Speaking explicit reveal works');
  }
  await snap('speaking-audit');

  await visit('ocean.html','typeof startGame==="function"');
  await evaluate(`startGame();document.querySelector('.dir-btn:not(.disabled)').click()`);
  await check(`gameActive && currentKanji && !document.querySelector('#kanjiEmoji') && !document.querySelector('#sceneCard').classList.contains('active')`,'Ocean challenge hides semantic emoji and scene image');
  await snap('ocean-audit');
  await visit('kanjiride.html','!!window.KANJI_WORLD');
  await click('#startBtn');
  await check(`!document.querySelector('#catchEmoji')`,'Ride writing prompt has no semantic picture');
  const rideSource=fs.readFileSync(path.join(root,'kanjiride.html'),'utf8');
  const marker=rideSource.match(/function drawTargetMarker\([^]*?(?=\n    function )/)[0];
  assert.ok(!/item|\.emoji|\.multi/.test(marker),'All ride targets share a content-independent marker');
  await snap('ride-audit');

  await visit('weekly-workbook.html','!!document.querySelector("[data-page=practice]")');
  await evaluate(`window.auditPracticeIssues=[];
    for(let y=1;y<=5;y++)for(let w=1;w<=52;w++){
      location.hash='#y'+y+'w'+w;window.dispatchEvent(new Event('hashchange'));
      const page=document.querySelector('[data-page=practice]');
      if(page.querySelector('.header-emoji') || page.querySelector('.goal').textContent!=='Try these on your own. Check the learning page when you are finished.')auditPracticeIssues.push([y,w]);
    }`);
  await check(`auditPracticeIssues.length===0 && !document.querySelector('#answerPanel').open`,'260 practice headers contain no semantic picture or model answer; key closed');
  await send('Emulation.setEmulatedMedia',{media:'print'});
  await check(`getComputedStyle(document.querySelector('#answerPanel')).display==='none'`,'Printed practice excludes answer key');
  await send('Emulation.setEmulatedMedia',{media:''});
  console.log('Writing, saved-question recall, all speaking scenarios, adventures and 260 printable practice sheets checked');
  await visit('ebook.html','typeof pages!=="undefined" && document.querySelector("#pageImage").complete');
  for(const index of [36,38,39]) {
    await evaluate(`showPage(${index},'next')`);
    await loaded(`currentPage===${index} && !isAnimating && document.querySelector('#pageImage').naturalWidth>0`);
    await check(`document.querySelector('#pageImage').src.endsWith('_NoClues.svg')`,'Ebook practice uses the repaired worksheet');
    const filename=await evaluate(`pages[${index}].file`);
    const svg=fs.readFileSync(path.join(root,'WorkbookPages_Correct',filename),'utf8');
    assert.ok(!/<image|\p{Extended_Pictographic}/u.test(svg),'No baked-in pictures in '+filename);
    assert.equal((svg.match(/font-size="27"/g)||[]).length,5,'Five exercise prompts preserved');
    await snap('ebook-practice-'+index);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await check('document.documentElement.scrollWidth<=innerWidth','Repaired ebook fits mobile viewport');
  await snap('ebook-practice-mobile');
  console.log('Three repaired ebook worksheets loaded, mobile layout checked');
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log('PASS: sitewide visual-clue browser regression. Screenshots: '+artifacts);
  await send('Browser.close').catch(()=>{});
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{ws?.close();browser?.kill();server.close();});
