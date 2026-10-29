/* Local, bounded microphone metadata. Never records audio, transcripts, or answers. */
(function (global) {
    'use strict';
    const STORAGE_KEY = 'fiona-dojo-mic-diagnostics-v1';
    const BUILD = '2026-10-29 mic-report-1';
    const MAX_EVENTS = 192, MAX_EXPORT_EVENTS = 48, MAX_STORED_CHARS = 60 * 1024;
    const STAGES = ['unknown', 'idle', 'starting', 'listening', 'processing', 'error', 'released', 'start-request', 'service-start', 'interim', 'final', 'native-end', 'stop-request', 'manual-reset', 'ui-open-details', 'ui-reconnect', 'ui-stop', 'snapshot', 'checkpoint', 'live-disarm', 'live-arm', 'live-answer-timeout', 'live-start', 'live-audio-start', 'live-speech-start', 'live-speech-end', 'live-audio-end', 'live-closing-abort', 'live-request', 'live-unarmed-result', 'live-old-result', 'live-interim', 'live-final', 'live-stop', 'live-error', 'live-released', 'live-end', 'live-cancel'];
    const CODES = ['unknown', 'unsupported', 'not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'no-speech', 'no-match', 'language-not-supported', 'recognition-timeout', 'microphone-busy', 'aborted', 'invalid-question', 'recognition-error', 'stream-history-reset', 'stream-ended'];
    const NUMBERS = ['groups', 'characters', 'alternatives', 'floor', 'firstIndex', 'lastIndex', 'changedIndex', 'elapsedMs', 'checkpoints'];
    const FLAGS = ['requestedStop', 'hadInterim', 'captureReady', 'captureActive', 'armed', 'speechDetected'];
    const ACTIVITY = new Set(['start-request', 'service-start', 'interim', 'final', 'error', 'live-request', 'live-start', 'live-audio-start', 'live-speech-start', 'live-answer-timeout', 'live-interim', 'live-final', 'live-error']);
    const states = ['off', 'opening', 'on', 'closing'];
    let storageAvailable = true, timer = null;
    const now = () => Date.now();
    const mono = () => global.performance && typeof global.performance.now === 'function' ? global.performance.now() : now();
    const clone = value => value == null ? null : JSON.parse(JSON.stringify(value));
    const integer = (value, maximum = 1e9) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum ? Math.round(value) : null;
    const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
    const stage = value => STAGES.includes(value) ? value : 'unknown';
    const code = value => CODES.includes(value) ? value : '';
    const build = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2} [a-z0-9-]{1,48}$/.test(value) ? value : BUILD;
    const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
    function eventFrom(value) {
        if (!value || !STAGES.includes(value.stage)) return null;
        const at = integer(value.at, 4102444800000), ms = integer(value.ms, 1e12);
        if (at === null || ms === null) return null;
        const event = { at, ms, stage: value.stage };
        if (code(value.code)) event.code = value.code;
        for (const name of NUMBERS) { const number = integer(value[name], name === 'elapsedMs' ? 1e12 : 1e9); if (number !== null) event[name] = number; }
        for (const name of FLAGS) if (typeof value[name] === 'boolean') event[name] = value[name];
        return event;
    }
    function snapshotFrom(value) {
        value = value || {};
        return { profile: ['Safari', 'standard'].includes(value.profile) ? value.profile : 'unknown', language: 'ja-JP',
            mode: value.mode === 'hands-free' ? 'hands-free' : 'manual', phase: ['lobby', 'question', 'answered', 'result'].includes(value.phase) ? value.phase : 'lobby',
            captureState: states.includes(value.captureState) ? value.captureState : 'off', captureActive: value.captureActive === true,
            captureReady: value.captureReady === true, stage: stage(value.stage), errorCode: code(value.errorCode), lastCaptureAt: iso(value.lastCaptureAt) };
    }
    function reportFrom(value) {
        if (!value || value.schemaVersion !== 1 || typeof value.reportId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.reportId) || !iso(value.createdAt)) return null;
        const browser = value.browser || {};
        return { schemaVersion: 1, reportId: value.reportId, createdAt: value.createdAt, build: build(value.build),
            reason: ['error', 'details', 'manual'].includes(value.reason) ? value.reason : 'manual',
            browser: { userAgent: text(browser.userAgent, 320), platform: text(browser.platform, 40), maxTouchPoints: integer(browser.maxTouchPoints, 20) || 0, standalone: browser.standalone === true },
            snapshot: snapshotFrom(value.snapshot), events: Array.isArray(value.events) ? value.events.map(eventFrom).filter(Boolean).slice(-MAX_EXPORT_EVENTS) : [] };
    }
    function compact(value, maxEncodedLength = 10500) {
        const report = reportFrom(value);
        if (!report) return null;
        while (report.events.length && (JSON.stringify(report).length > 7800 || encodeURIComponent(JSON.stringify(report)).length > maxEncodedLength)) report.events.shift();
        return report;
    }
    function empty() { return { schemaVersion: 1, events: [], captureRevision: 0, reportRevision: -1, reportFrozen: false, savedReport: null, lastCaptureAt: null, errorCode: '', build: BUILD, profile: 'unknown', captureState: 'off', checkpoints: 0 }; }
    let state = empty();
    try {
        if (!global.localStorage) storageAvailable = false;
        else {
            const raw = global.localStorage.getItem(STORAGE_KEY);
            const stored = raw && raw.length <= MAX_STORED_CHARS ? JSON.parse(raw) : null;
            if (stored && stored.schemaVersion === 1) {
                state.events = Array.isArray(stored.events) ? stored.events.map(eventFrom).filter(Boolean).slice(-MAX_EVENTS) : [];
                state.captureRevision = integer(stored.captureRevision) || 0;
                state.reportRevision = integer(stored.reportRevision) === null ? -1 : stored.reportRevision;
                state.reportFrozen = stored.reportFrozen === true;
                state.savedReport = compact(stored.savedReport);
                state.lastCaptureAt = iso(stored.lastCaptureAt); state.errorCode = code(stored.errorCode);
                state.build = build(stored.build); state.profile = ['Safari', 'standard'].includes(stored.profile) ? stored.profile : 'unknown';
                state.captureState = states.includes(stored.captureState) ? stored.captureState : 'off';
                state.checkpoints = integer(stored.checkpoints) || 0;
            }
        }
    } catch (_) { storageAvailable = false; }
    function flush() {
        if (timer !== null) global.clearTimeout(timer); timer = null;
        let serialized = JSON.stringify(state);
        while (state.events.length && serialized.length > MAX_STORED_CHARS) { state.events.shift(); serialized = JSON.stringify(state); }
        try {
            if (!global.localStorage) throw Error('Device storage unavailable');
            global.localStorage.setItem(STORAGE_KEY, serialized); storageAvailable = true;
        } catch (_) { storageAvailable = false; }
        return storageAvailable;
    }
    function queueFlush() {
        if (timer !== null) return;
        timer = global.setTimeout(flush, 200);
        if (timer && typeof timer.unref === 'function') timer.unref();
    }
    function record(name, details) {
        if (!STAGES.includes(name)) return;
        details = details || {};
        const event = eventFrom({ ...details, stage: name, at: now(), ms: mono() });
        if (!event) return;
        if (name === 'checkpoint' && state.events.length && state.events[state.events.length - 1].stage === 'checkpoint') state.events[state.events.length - 1] = event;
        else state.events.push(event);
        state.events = state.events.slice(-MAX_EVENTS);
        if (details.build) state.build = build(details.build);
        if (['Safari', 'standard'].includes(details.profile)) state.profile = details.profile;
        if (states.includes(details.captureState)) state.captureState = details.captureState;
        if (name === 'start-request' || name === 'live-request') state.errorCode = '';
        if (code(details.code)) state.errorCode = details.code;
        if (ACTIVITY.has(name)) { state.captureRevision++; state.lastCaptureAt = new Date(now()).toISOString(); }
        queueFlush();
    }
    function uuid() {
        try { if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID(); } catch (_) {}
        const bytes = new Uint8Array(16);
        try { global.crypto.getRandomValues(bytes); } catch (_) { for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256); }
        bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
        const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0'));
        return hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' + hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' + hex.slice(10).join('');
    }
    function capture(diagnostics, context) {
        diagnostics = diagnostics || {}; context = context || {};
        const freeze = context.reason === 'error' || context.reason === 'details';
        if (context.reason !== 'error' && state.savedReport && state.reportRevision === state.captureRevision && (!context.checkpoint || state.reportFrozen)) {
            if (freeze) { state.reportFrozen = true; flush(); }
            return clone(state.savedReport);
        }
        const nav = global.navigator || {}, stream = diagnostics.stream || {};
        const captureState = states.includes(diagnostics.captureState) ? diagnostics.captureState : state.captureState;
        const snapshot = snapshotFrom({ profile: diagnostics.profile || state.profile, mode: context.mode, phase: context.phase,
            captureState, captureActive: diagnostics.captureActive === true, captureReady: typeof diagnostics.captureReady === 'boolean' ? diagnostics.captureReady : typeof stream.captureReady === 'boolean' ? stream.captureReady : captureState === 'on',
            stage: diagnostics.stage || state.events.length && state.events[state.events.length - 1].stage || 'idle', errorCode: stream.lastErrorCode || state.errorCode, lastCaptureAt: state.lastCaptureAt });
        const report = compact({ schemaVersion: 1, reportId: uuid(), createdAt: new Date(now()).toISOString(), build: build(diagnostics.build || state.build),
            reason: context.reason || 'manual', browser: { userAgent: nav.userAgent || diagnostics.browser, platform: nav.platform || diagnostics.platform,
                maxTouchPoints: nav.maxTouchPoints, standalone: nav.standalone === true }, snapshot, events: state.events.slice(-MAX_EXPORT_EVENTS) });
        state.savedReport = report; state.reportRevision = state.captureRevision; state.reportFrozen = freeze;
        flush(); return clone(report);
    }
    function checkpoint(diagnostics, context) {
        if (!diagnostics || diagnostics.captureActive !== true) return getSavedReport();
        const stream = diagnostics.stream || {};
        state.checkpoints++;
        record('checkpoint', { build: diagnostics.build, profile: diagnostics.profile, captureState: diagnostics.captureState,
            captureActive: true, captureReady: typeof stream.captureReady === 'boolean' ? stream.captureReady : diagnostics.captureState === 'on',
            armed: stream.armed === true, speechDetected: stream.speechDetected === true, elapsedMs: stream.elapsedMs, checkpoints: state.checkpoints });
        return capture(diagnostics, { ...(context || {}), reason: 'manual', checkpoint: true });
    }
    function getSavedReport() { return clone(state.savedReport); }
    function serialize(report, options) {
        const limit = options && integer(options.maxEncodedLength, 10500) || 6000;
        const clean = compact(report || state.savedReport, Math.max(1500, limit));
        if (!clean) return '';
        return JSON.stringify(clean);
    }
    const api = Object.freeze({ record, capture, checkpoint, getSavedReport, serialize, flush,
        get storageAvailable() { return storageAvailable; }, BUILD, STORAGE_KEY, STAGES: Object.freeze(STAGES.slice()), ERROR_CODES: Object.freeze(CODES.slice()) });
    if (global.addEventListener) global.addEventListener('pagehide', flush);
    if (global.document && global.document.addEventListener) global.document.addEventListener('visibilitychange', () => { if (global.document.hidden) flush(); });
    global.DojoMicDiagnostics = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
