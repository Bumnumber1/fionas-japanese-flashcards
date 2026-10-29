'use strict';
// Metadata persistence and export contracts. No microphone, clipboard, upload,
// or physical Safari behavior is established by these deterministic tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SOURCE = fs.readFileSync(path.join(__dirname, 'taekwondo-diagnostics.js'), 'utf8');
const KEY = 'fiona-dojo-mic-diagnostics-v1';
let passed = 0;
function test(name, callback) { callback(); passed++; console.log('PASS ' + name); }
function environment(options = {}) {
    const storage = options.storage || new Map();
    const events = new Map(), timers = new Map();
    let now = Date.UTC(2026, 9, 29, 12), timerId = 0, uuid = 0, writes = 0;
    class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
    const sandbox = { console, Date: ClockDate, performance: { now: () => now - Date.UTC(2026, 9, 29, 12) },
        navigator: { userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1', platform: 'iPad', maxTouchPoints: 5, onLine: true, standalone: false },
        crypto: { randomUUID: () => '00000000-0000-4000-8000-' + (++uuid).toString().padStart(12, '0') },
        document: { hidden: false, visibilityState: 'visible', addEventListener(type, callback) { events.set('document:' + type, callback); }, removeEventListener(type) { events.delete('document:' + type); } },
        addEventListener(type, callback) { events.set(type, callback); }, removeEventListener(type) { events.delete(type); },
        setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { at: now + delay, callback }); return id; }, clearTimeout(id) { timers.delete(id); },
        localStorage: { getItem(key) { if (options.getError) throw new Error('Synthetic storage read failure'); return storage.get(key) || null; },
            setItem(key, value) { if (options.setError) throw new Error('Synthetic storage quota failure'); storage.set(key, String(value)); writes++; },
            removeItem(key) { storage.delete(key); } } };
    if (options.storageGetterError) Object.defineProperty(sandbox, 'localStorage', { get() { throw new Error('Synthetic storage security failure'); } });
    sandbox.window = sandbox; vm.createContext(sandbox); vm.runInContext(SOURCE, sandbox);
    return { api: sandbox.DojoMicDiagnostics, sandbox, storage, events, timers, get writes() { return writes; },
        tick(milliseconds) { const until = now + milliseconds; for (let safety = 0; safety < 10000; safety++) { let next = null; for (const item of timers) if (item[1].at <= until && (!next || item[1].at < next[1].at)) next = item;
            if (!next) break; timers.delete(next[0]); now = next[1].at; next[1].callback(); if (safety === 9999) throw Error('Unbounded diagnostics timers'); } now = until; } };
}
function snapshot(overrides = {}) {
    return { build: '2026-10-29 mic-report-1', profile: 'Safari', language: 'ja-JP', browser: 'Fixture Safari iPad', platform: 'iPad', maxTouchPoints: 5,
        secureContext: true, online: true, standalone: false, supported: true, captureActive: true, captureState: 'on', stage: 'live-error', mode: 'hands-free live',
        stream: { stage: 'error', active: true, captureReady: true, nativeStarted: true, speechDetected: true, armed: true, stopping: false, releasing: false,
            highestSeen: 1, starts: 1, arms: 3, finals: 2, errors: 1, lastErrorCode: 'network', elapsedMs: 4300,
            events: { request: 1, start: 1, 'audio-start': 1, final: 2, error: 1 } },
        events: [{ ms: 20, stage: 'live-request' }, { ms: 60, stage: 'live-audio-start' }, { ms: 4200, stage: 'error', code: 'network' }], ...overrides };
}
function captureFailure(env) {
    env.api.record('live-request', { groups: 0 }); env.tick(40);
    env.api.record('live-audio-start', { captureReady: true }); env.tick(4000);
    env.api.record('error', { code: 'network' });
    return env.api.capture(snapshot(), { reason: 'error', mode: 'hands-free', phase: 'question' });
}

test('The diagnostics module exposes a local metadata-only API and creates a valid report', () => {
    const env = environment(); for (const method of ['record','capture','getSavedReport','serialize']) assert.equal(typeof env.api[method], 'function', method);
    const report = captureFailure(env), encoded = env.api.serialize(report), parsed = JSON.parse(encoded);
    assert.equal(parsed.schemaVersion, 1); assert.match(parsed.build, /mic-report-1/); assert.ok(parsed.reportId || parsed.id);
    report.snapshot.stage = 'changed-by-consumer';
    assert.equal(env.api.getSavedReport().snapshot.stage, parsed.snapshot.stage, 'Consumer changes cannot replace the retained report');
    assert.ok(encodeURIComponent(encoded).length <= 10500); assert.ok(encoded.length > 100);
    assert.ok(env.storage.has(KEY), 'The failure survives loss of the page context');
});

test('Reload, boot and cancellation cannot replace the last useful fault with idle state', () => {
    const first = environment(), failure = captureFailure(first), preserved = first.api.serialize(failure);
    first.api.record('cancel', { captureActive: false }); first.tick(1000);
    const reloaded = environment({ storage: first.storage });
    reloaded.api.record('boot', {}); reloaded.api.record('live-cancel', {});
    const old = reloaded.api.capture(snapshot({ captureActive: false, captureState: 'off', stage: 'idle', stream: null, events: [] }), { reason: 'details', mode: 'manual', phase: 'lobby' });
    assert.equal(reloaded.api.serialize(old), preserved, 'The useful stopped-device evidence remains the export');
    assert.equal(reloaded.api.serialize(reloaded.api.getSavedReport()), preserved);
});

test('Saved reports are defensive copies and do not mutate other lessons or game preferences', () => {
    const storage = new Map([['fiona-taekwondo-v1', '{"soundEnabled":true}'], ['other-lesson', 'keep me']]);
    const env = environment({ storage }); const report = captureFailure(env);
    const first = env.api.getSavedReport();
    try { first.build = 'bad mutation'; if (first.snapshot) first.snapshot.stage = 'bad mutation'; } catch (_) {}
    assert.equal(env.api.serialize(env.api.getSavedReport()), env.api.serialize(report));
    assert.equal(storage.get('fiona-taekwondo-v1'), '{"soundEnabled":true}'); assert.equal(storage.get('other-lesson'), 'keep me');
});

test('Privacy allowlists remove audio, transcripts, answers, raw vendor messages and unknown metadata', () => {
    const env = environment(); const secrets = ['SECRET_AUDIO_BYTES','SECRET_SPOKEN_ANSWER','SECRET_PROMPT','SECRET_VENDOR_TEXT','SECRET_EXTRA_FIELD'];
    env.api.record('live-request', { transcript: secrets[1], answer: secrets[1], audio: secrets[0], target: { prompt: secrets[2] }, nativeMessage: secrets[3], unknown: secrets[4], groups: 1 });
    env.api.record('error', { code: 'network', nativeMessage: secrets[3] });
    const value = snapshot({ transcript: secrets[1], answer: secrets[1], target: { prompt: secrets[2] }, audio: secrets[0], nativeMessage: secrets[3], extra: secrets[4],
        events: [{ stage: 'error', code: 'network', ms: 40, transcript: secrets[1], nativeMessage: secrets[3], unknown: secrets[4] }] });
    const report = env.api.capture(value, { reason: 'error', mode: 'manual', phase: 'question', target: secrets[2], extra: secrets[4] });
    const serialized = env.api.serialize(report), persisted = env.storage.get(KEY) || '';
    for (const secret of secrets) { assert.equal(serialized.includes(secret), false, secret); assert.equal(persisted.includes(secret), false, 'Persisted ' + secret); }
    const injected = { ...JSON.parse(serialized), transcript: secrets[1], unknown: secrets[4] };
    const safeAgain = env.api.serialize(injected); assert.equal(safeAgain.includes(secrets[1]), false); assert.equal(safeAgain.includes(secrets[4]), false);
});

test('Malformed, oversized or forbidden storage never throws into the speech lifecycle', () => {
    for (const options of [{ getError: true }, { setError: true }, { storageGetterError: true }, { storage: new Map([[KEY, '{broken json']]) }, { storage: new Map([[KEY, 'X'.repeat(500000)]]) }]) {
        const env = environment(options);
        assert.doesNotThrow(() => { const report = captureFailure(env); const text = env.api.serialize(report); assert.equal(JSON.parse(text).schemaVersion, 1); assert.ok(text.length > 100); });
    }
});

test('Large histories stay bounded and export as valid URI-sized JSON while retaining the useful failure', () => {
    const env = environment();
    for (let index = 0; index < 3000; index++) env.api.record(index % 7 ? 'live-interim' : 'live-final', { groups: 512, alternatives: 100, firstIndex: index, lastIndex: index + 1, changedIndex: index, captureReady: true });
    env.api.record('error', { code: 'network' });
    const events = Array.from({ length: 3000 }, (_, ms) => ({ ms, stage: 'live-interim', groups: 512, alternatives: 100 }));
    const report = env.api.capture(snapshot({ browser: '\\"'.repeat(10000), platform: 'P'.repeat(1000), events }), { reason: 'error', mode: 'hands-free', phase: 'question' });
    const text = env.api.serialize(report); assert.equal(JSON.parse(text).schemaVersion, 1); assert.match(text, /network/);
    assert.ok(encodeURIComponent(text).length <= 10500, 'The encoded payload fits beneath the private-inbox URL limit');
    assert.ok((env.storage.get(KEY) || '').length * 2 <= 128 * 1024, 'The persisted UTF-16 data stays within its budget');
});

test('Invalid numeric metadata is bounded without admitting unexpected fields', () => {
    const env = environment(); env.api.record('live-request', { groups: Infinity, starts: NaN, ms: -Infinity, unknown: 'SECRET_UNKNOWN' });
    const report = env.api.capture(snapshot({ maxTouchPoints: 99999, stream: { ...snapshot().stream, highestSeen: Infinity, starts: -100, finals: NaN, elapsedMs: Infinity } }), { reason: 'error', mode: 'manual', phase: 'question' });
    const text = env.api.serialize(report); assert.equal(JSON.parse(text).schemaVersion, 1); assert.equal(text.includes('SECRET_UNKNOWN'), false); assert.ok(encodeURIComponent(text).length <= 10500);
});

test('Checkpoint persistence coalesces idle monitoring and preserves a frozen fault until new native activity', () => {
    const env = environment();
    env.api.record('live-request', { captureActive: true });
    for (let index = 0; index < 100; index++) { env.tick(50); env.api.checkpoint(snapshot(), { mode: 'hands-free', phase: 'question' }); }
    const stored = JSON.parse(env.storage.get(KEY));
    assert.equal(stored.events.filter(event => event.stage === 'checkpoint').length, 1);
    assert.ok(stored.events.at(-1).checkpoints >= 100);
    const failure = captureFailure(env), preserved = env.api.serialize(failure);
    env.api.checkpoint(snapshot({ captureActive: true, stage: 'idle', stream: { captureReady: false } }), { mode: 'manual', phase: 'lobby' });
    assert.equal(env.api.serialize(env.api.getSavedReport()), preserved);
    env.api.record('live-request', {}); env.tick(20);
    env.api.record('live-audio-start', { captureReady: true });
    const next = env.api.capture(snapshot({ stage: 'listening', stream: { captureReady: true } }), { reason: 'details', mode: 'manual', phase: 'question' });
    assert.notEqual(next.reportId, failure.reportId, 'A genuine new microphone attempt permits new evidence');
    assert.equal(next.snapshot.stage, 'listening');
});

test('Queued writes are throttled and pagehide or hidden visibility flushes the final metadata', () => {
    const env = environment();
    for (let index = 0; index < 500; index++) env.api.record('live-interim', { groups: index });
    assert.equal(env.writes, 0); assert.equal(env.timers.size, 1);
    env.tick(200); assert.equal(env.writes, 1);
    env.api.record('live-error', { code: 'network' }); env.events.get('pagehide')();
    assert.equal(env.writes, 2); assert.equal(env.timers.size, 0);
    assert.equal(JSON.parse(env.storage.get(KEY)).events.at(-1).code, 'network');
    env.api.record('live-cancel', {}); env.sandbox.document.hidden = true;
    env.events.get('document:visibilitychange')();
    assert.equal(JSON.parse(env.storage.get(KEY)).events.at(-1).stage, 'live-cancel');
});

console.log('\n' + passed + ' microphone diagnostics tests passed. Native iPad Share, Save to Files and clipboard behavior still require device evidence.');
