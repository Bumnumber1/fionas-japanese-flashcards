/* Persistent Japanese recognition for Safari hands-free reading.
 * Final-only, epoch-tagged answers; cumulative native results never cross targets.
 * This avoids unnecessary microphone restarts, not Safari's underlying failures.
 */
(function (global) {
    'use strict';

    const transcriptKey = value => String(value || '').normalize('NFKC').trim().replace(/\s+/gu, ' ');
    const now = () => global.performance && typeof global.performance.now === 'function' ? global.performance.now() : Date.now();

    class DojoSafariStream {
        constructor(options) {
            options = options || {};
            this.Recognition = options.Recognition || global.SpeechRecognition || global.webkitSpeechRecognition;
            this.onState = options.onState;
            this.onResult = options.onResult;
            this.onError = options.onError;
            this.onEvent = options.onEvent;
            this.capture = null;
            this.armed = null;
            this.launchTimer = null;
            this.destroyed = false;
            this.captureReady = false;
            this.highestSeen = -1;
            this.serial = 0;
            this.targetVersion = 0;
            this.readyAfter = 0;
            this.stage = 'idle';
            this.counts = { starts: 0, arms: 0, finals: 0, errors: 0, events: {} };
            this.lastErrorCode = '';
        }

        get active() { return Boolean(this.capture || this.armed || this.launchTimer !== null); }

        event(stage, details) {
            this.stage = stage;
            this.counts.events[stage] = (this.counts.events[stage] || 0) + 1;
            if (!this.destroyed && typeof this.onEvent === 'function') this.onEvent(stage, details || {});
        }

        state(status, context, transcript) {
            if (this.destroyed || typeof this.onState !== 'function') return;
            const value = { status, epoch: context ? context.epoch : null,
                captureReady: this.captureReady,
                speechDetected: Boolean(context && context.speechDetected) };
            if (context) value.target = context.target;
            if (transcript !== undefined) value.transcript = transcript;
            this.onState(value);
        }

        clearTargetTimers(context) {
            if (!context) return;
            for (const timer of [context.recordTimer, context.endpointTimer, context.finalTimer]) global.clearTimeout(timer);
        }

        disarm() {
            this.targetVersion++;
            const context = this.armed;
            this.clearTargetTimers(context);
            this.armed = null;
            global.clearTimeout(this.launchTimer); this.launchTimer = null;
            if (context) this.event('disarm');
        }

        arm(target, epoch) {
            if (this.destroyed || !target || typeof this.Recognition !== 'function') return false;
            this.disarm();
            const context = { target: Object.assign({}, target, {
                voiceAliases: Array.isArray(target.voiceAliases) ? target.voiceAliases.slice() : []
            }), epoch, floor: this.highestSeen + 1, startedAt: null, endedAt: null,
                interim: '', endpointKey: '', waitingFinal: false, speechDetected: false };
            this.armed = context;
            this.counts.arms++;
            this.event('arm', { floor: context.floor });
            const capture = this.capture;
            if (!capture) return this.queueLaunch(context);
            if (!capture.nativeRequested) { this.release(capture, false); return this.launch(context); }
            if (capture.cancelled || capture.failed || capture.nativeStopRequested || capture.audioEnded) {
                this.state('starting', context);
                this.watchRelease(capture);
            } else if (this.captureReady) {
                this.beginTarget(context, now());
                this.state('listening', context);
            } else this.state('starting', context);
            return true;
        }

        queueLaunch(context) {
            if (this.destroyed || this.armed !== context || this.capture) return false;
            const delay = Math.max(0, this.readyAfter - now());
            if (!delay) return this.launch(context);
            this.state('starting', context);
            if (this.armed !== context) return false;
            this.launchTimer = global.setTimeout(() => { this.launchTimer = null; if (this.armed === context) this.launch(context); }, delay);
            return true;
        }

        beginTarget(context, timestamp) {
            if (this.armed !== context) return;
            if (context.startedAt === null && timestamp !== null) context.startedAt = timestamp;
            if (context.recordTimer == null && !context.waitingFinal) {
                context.recordTimer = global.setTimeout(() => {
                    if (this.armed === context) this.stop();
                }, 10000);
            }
        }

        ready(capture, source) {
            if (!this.current(capture)) return;
            this.captureReady = !capture.audioEnded;
            global.clearTimeout(capture.startTimer);
            if (source !== 'audio') capture.speechDetected = true;
            const context = this.armed;
            if (context) {
                if (source !== 'audio') context.speechDetected = true;
                // A first final without any capture/speech/interim evidence can
                // score the sound, but cannot manufacture a 1ms speed bonus.
                this.beginTarget(context, source === 'final' || capture.audioEnded ? null : now());
                this.state(context.waitingFinal ? 'processing' : 'listening', context);
            }
        }

        current(capture) {
            return !this.destroyed && this.capture === capture && !capture.cancelled && !capture.failed;
        }

        launch(context) {
            if (this.destroyed || this.armed !== context || this.capture) return false;
            let rec;
            try { rec = new this.Recognition(); }
            catch (_) { this.fail(null, 'recognition-error', '', context); return false; }
            const capture = { rec, id: ++this.serial, nativeRequested: false, nativeStarted: false, speechDetected: false,
                nativeStopRequested: false, finalAfterStop: false, acceptedFinal: false, audioEnded: false, cancelled: false, failed: false,
                requestedAt: now(), finalHistory: [], previousLength: 0 };
            this.capture = capture;
            this.captureReady = false;
            this.highestSeen = -1;
            context.floor = 0;
            rec.lang = 'ja-JP'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 10;
            rec.onstart = () => {
                if (!this.current(capture)) return;
                capture.nativeStarted = true;
                this.event('start');
                this.state(this.armed && this.armed.waitingFinal ? 'processing' : this.captureReady ? 'listening' : 'starting', this.armed);
            };
            rec.onaudiostart = () => { if (this.current(capture)) { this.event('audio-start'); this.ready(capture, 'audio'); } };
            rec.onspeechstart = () => { if (this.current(capture)) { this.event('speech-start'); this.ready(capture, 'speech'); } };
            rec.onspeechend = () => { if (this.current(capture)) this.event('speech-end'); };
            rec.onaudioend = () => {
                if (!this.current(capture)) return;
                capture.audioEnded = true; this.captureReady = false; this.event('audio-end');
                if (this.armed) this.waitForFinal(this.armed);
                else this.watchRelease(capture);
            };
            rec.onresult = event => this.results(capture, event);
            rec.onnomatch = () => this.fail(capture, 'no-match');
            rec.onerror = error => {
                if (!this.current(capture)) return;
                const code = error && error.error || 'recognition-error';
                // Some Safari releases report an abort while closing an already
                // completed utterance. It cannot invalidate the accepted answer
                // or stop the next explicitly queued activity.
                if (code === 'aborted' && capture.nativeStopRequested && capture.finalAfterStop) {
                    this.event('closing-abort', { code }); this.watchRelease(capture); return;
                }
                this.fail(capture, code, error && error.message);
            };
            rec.onend = () => this.end(capture);
            this.counts.starts++;
            this.event('request'); this.state('starting', context);
            if (!this.current(capture) || this.armed !== context) return false;
            capture.startTimer = global.setTimeout(() => {
                if (this.current(capture)) this.fail(capture, 'recognition-timeout');
            }, 15000);
            capture.nativeRequested = true;
            try { rec.start(); return true; }
            catch (error) {
                this.release(capture, false);
                this.fail(null, error && error.name === 'NotAllowedError' ? 'not-allowed' : 'recognition-error', '', context);
                return false;
            }
        }

        results(capture, event) {
            if (!this.current(capture)) return;
            const results = event && event.results;
            const length = results && results.length;
            if (!Number.isSafeInteger(length) || length < 0 || length > 512 ||
                (event.resultIndex !== undefined && (!Number.isSafeInteger(event.resultIndex) || event.resultIndex < 0 || event.resultIndex > length))) {
                this.fail(capture, 'stream-history-reset'); return;
            }
            const groups = [];
            for (let index = 0; index < length; index++) {
                const result = results[index], alternatives = [];
                if (!result || !Number.isSafeInteger(result.length) || result.length < 1) { this.fail(capture, 'stream-history-reset'); return; }
                for (let option = 0; option < Math.min(10, result.length); option++) {
                    if (result[option] && typeof result[option].transcript === 'string') alternatives.push(result[option].transcript.trim());
                }
                if (!alternatives.length) { this.fail(capture, 'stream-history-reset'); return; }
                const group = { final: result.isFinal === true, alternatives };
                const signature = JSON.stringify(alternatives);
                if (capture.finalHistory[index] !== undefined && (!group.final || capture.finalHistory[index] !== signature)) {
                    this.fail(capture, 'stream-history-reset'); return;
                }
                if (group.final) capture.finalHistory[index] = signature;
                groups.push(group);
            }
            if (capture.finalHistory.some((value, index) => value !== undefined && index >= length)) {
                this.fail(capture, 'stream-history-reset'); return;
            }
            capture.previousLength = length;
            this.highestSeen = Math.max(this.highestSeen, length - 1);
            const context = this.armed;
            // Unarmed results still advance the watermark. A spoken fragment
            // during feedback is never eligible for the next activity.
            if (!context) { this.event('unarmed-result', { groups: length }); return; }
            const windowGroups = groups.slice(context.floor);
            if (!windowGroups.length) { this.event('old-result', { groups: length }); return; }
            const allFinal = windowGroups.every(group => group.final);
            // A new native index is eligible even when Safari supplies its final
            // directly. Interim delivery is optional and cannot be a scoring
            // prerequisite. The floor excludes every group already observed
            // before arming; immutable final history prevents old-index replay.
            this.ready(capture, allFinal ? 'final' : 'interim');
            if (this.armed !== context || !this.current(capture)) return;
            const top = windowGroups.map(group => group.alternatives[0]).join(' ').trim();
            if (!allFinal) {
                context.interim = top;
                this.event('interim', { groups: windowGroups.length });
                this.state(context.waitingFinal ? 'processing' : 'listening', context, top);
                if (this.armed !== context || !this.current(capture)) return;
                const key = transcriptKey(top);
                if (!context.waitingFinal && key && key !== context.endpointKey) {
                    global.clearTimeout(context.endpointTimer); context.endpointKey = key;
                    context.endpointTimer = global.setTimeout(() => {
                        if (this.armed === context && context.endpointKey === key) this.stop();
                    }, 900);
                } else if (!key) { global.clearTimeout(context.endpointTimer); context.endpointKey = ''; }
                return;
            }
            let alternatives = [''];
            for (const group of windowGroups) alternatives = alternatives.flatMap(prefix => group.alternatives.map(value => (prefix + ' ' + value).trim())).slice(0, 100);
            alternatives = [...new Set(alternatives.filter(value => transcriptKey(value)))];
            if (!alternatives.length) { this.fail(capture, 'no-speech'); return; }
            const readingMs = context.startedAt === null ? null : Math.max(1, (context.endedAt === null ? now() : context.endedAt) - context.startedAt);
            const answer = { epoch: context.epoch, target: context.target, alternatives, readingMs };
            capture.acceptedFinal = true;
            if (capture.nativeStopRequested) capture.finalAfterStop = true;
            this.counts.finals++; this.event('final', { groups: windowGroups.length, alternatives: alternatives.length,
                firstIndex: context.floor, lastIndex: length - 1,
                changedIndex: event.resultIndex === undefined ? null : event.resultIndex });
            this.disarm();
            const deliveryVersion = this.targetVersion;
            if (capture.nativeStopRequested || capture.audioEnded) this.watchRelease(capture);
            this.state('idle', context);
            if (!this.destroyed && this.targetVersion === deliveryVersion && this.capture === capture && !capture.cancelled && typeof this.onResult === 'function') this.onResult(answer);
        }

        waitForFinal(context) {
            if (this.armed !== context) return;
            context.waitingFinal = true;
            if (context.endedAt === null) context.endedAt = now();
            global.clearTimeout(context.recordTimer); global.clearTimeout(context.endpointTimer);
            if (context.finalTimer == null) context.finalTimer = global.setTimeout(() => {
                if (this.armed === context) this.fail(this.capture, context.interim ? 'no-match' : 'no-speech');
            }, 8000);
            this.state('processing', context, context.interim);
        }

        stop() {
            const capture = this.capture;
            if (!this.current(capture)) return false;
            if (this.armed) this.waitForFinal(this.armed);
            if (!this.current(capture)) return false;
            if (capture.nativeStopRequested) return true;
            capture.nativeStopRequested = true; this.event('stop');
            try { capture.rec.stop(); }
            catch (_) { this.fail(capture, 'recognition-error'); return false; }
            if (!this.armed) this.watchRelease(capture);
            return true;
        }

        watchRelease(capture) {
            if (this.capture !== capture || capture.releaseTimer != null) return;
            capture.abortTimer = global.setTimeout(() => {
                if (this.capture === capture) { try { capture.rec.abort(); } catch (_) {} }
            }, 1500);
            capture.releaseTimer = global.setTimeout(() => {
                if (this.capture !== capture) return;
                capture.releaseTimer = null;
                if (this.armed) this.fail(null, 'microphone-busy', '', this.armed);
            }, 4000);
        }

        fail(capture, code, nativeMessage, explicitContext) {
            if (this.destroyed || capture && (this.capture !== capture || capture.cancelled || capture.failed)) return;
            const context = explicitContext || this.armed;
            this.disarm();
            const deliveryVersion = this.targetVersion;
            this.counts.errors++; this.lastErrorCode = String(code).slice(0, 60);
            this.event('error', { code: this.lastErrorCode });
            if (capture) {
                capture.failed = true; this.captureReady = false;
                global.clearTimeout(capture.startTimer);
                this.watchRelease(capture);
                try { capture.rec.abort(); } catch (_) {}
            }
            this.state('idle', context);
            if (!this.destroyed && this.targetVersion === deliveryVersion && typeof this.onError === 'function') this.onError({ code, epoch: context ? context.epoch : null,
                target: context ? context.target : undefined, nativeMessage: String(nativeMessage || '').slice(0, 160) });
        }

        release(capture, resume) {
            if (this.capture !== capture) return;
            for (const timer of [capture.startTimer, capture.abortTimer, capture.releaseTimer]) global.clearTimeout(timer);
            for (const name of ['onstart', 'onaudiostart', 'onspeechstart', 'onspeechend', 'onaudioend', 'onresult', 'onnomatch', 'onerror', 'onend']) capture.rec[name] = null;
            this.capture = null; this.captureReady = false;
            this.readyAfter = now() + 120;
            if (resume && this.armed && !this.destroyed) {
                const context = this.armed;
                this.queueLaunch(context);
            }
        }

        end(capture) {
            if (this.capture !== capture) return;
            this.event('end');
            const expected = capture.cancelled || capture.failed || capture.nativeStopRequested && capture.finalAfterStop || !this.armed && capture.acceptedFinal;
            if (expected) { this.release(capture, true); return; }
            const context = this.armed;
            this.release(capture, false);
            this.fail(null, context ? context.interim ? 'no-match' : 'no-speech' : 'stream-ended', '', context);
        }

        cancel() {
            if (this.destroyed) return;
            if (!this.armed && this.launchTimer === null && (!this.capture || this.capture.cancelled)) return;
            this.disarm();
            const capture = this.capture;
            if (capture && !capture.cancelled) {
                capture.cancelled = true; this.captureReady = false;
                global.clearTimeout(capture.startTimer);
                if (!capture.nativeRequested) this.release(capture, false);
                else {
                    this.watchRelease(capture);
                    try { capture.rec.abort(); } catch (_) {}
                }
            }
            this.event('cancel'); this.state('idle');
        }

        getDiagnostics() {
            const capture = this.capture;
            return { stage: this.stage, active: this.active, captureReady: this.captureReady,
                nativeStarted: Boolean(capture && capture.nativeStarted), speechDetected: Boolean(capture && capture.speechDetected),
                armed: Boolean(this.armed), stopping: Boolean(capture && capture.nativeStopRequested),
                releasing: Boolean(capture && (capture.cancelled || capture.failed || capture.audioEnded)),
                highestSeen: this.highestSeen, starts: this.counts.starts, arms: this.counts.arms,
                finals: this.counts.finals, errors: this.counts.errors, lastErrorCode: this.lastErrorCode,
                elapsedMs: capture ? Math.max(0, Math.round(now() - capture.requestedAt)) : 0,
                events: Object.assign({}, this.counts.events) };
        }

        destroy() {
            if (this.destroyed) return;
            this.disarm(); this.destroyed = true;
            const capture = this.capture;
            if (capture) { this.release(capture, false); try { capture.rec.abort(); } catch (_) {} }
            this.onState = this.onResult = this.onError = this.onEvent = null;
        }
    }

    global.DojoSafariStream = DojoSafariStream;
    if (typeof module !== 'undefined' && module.exports) module.exports = DojoSafariStream;
})(typeof window !== 'undefined' ? window : globalThis);
