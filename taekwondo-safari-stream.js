/* Persistent Japanese recognition for Safari hands-free reading.
 * Final-only, epoch-tagged answers; cumulative native results never cross targets.
 * This avoids unnecessary microphone restarts, not Safari's underlying failures.
 */
(function (global) {
    'use strict';

    const transcriptKey = value => String(value || '').normalize('NFKC').trim().replace(/\s+/gu, ' ');
    const now = () => global.performance && typeof global.performance.now === 'function' ? global.performance.now() : Date.now();
    const RELEASE_TIMEOUT_MS = 4000;

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

        releaseElapsed(capture) {
            if (!capture || capture.releaseStartedAt === undefined) return 0;
            // Device sleep may pause performance.now() as well as queued timers.
            // Wall-clock elapsed time keeps an overdue native lease detectable
            // on the returning user's tap, without waiting for a timer to run.
            return Math.max(0, now() - capture.releaseStartedAt, Date.now() - capture.releaseWallStartedAt);
        }

        get releaseStalled() {
            return Boolean(this.capture && this.capture.retiring && this.releaseElapsed(this.capture) >= RELEASE_TIMEOUT_MS);
        }

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
            for (const timer of [context.recordTimer, context.finalTimer]) global.clearTimeout(timer);
            context.recordTimer = context.finalTimer = null;
        }

        disarm() {
            this.targetVersion++;
            const context = this.armed;
            const capture = this.capture;
            if (context && capture && context.captureId === capture.id && !context.completed &&
                (context.speechDetected || context.interim)) {
                // Removing the question does not end its native utterance. Its
                // first final may still be pending even when no interim arrived.
                capture.unownedSpeech = true;
            }
            this.clearTargetTimers(context);
            this.armed = null;
            global.clearTimeout(this.launchTimer); this.launchTimer = null;
            if (context) this.event('disarm');
        }

        arm(target, epoch, fromTap = false) {
            if (this.destroyed || !target || typeof this.Recognition !== 'function') return false;
            this.disarm();
            const context = { target: Object.assign({}, target, {
                voiceAliases: Array.isArray(target.voiceAliases) ? target.voiceAliases.slice() : []
            }), epoch, floor: this.highestSeen + 1, startedAt: null, endedAt: null,
                interim: '', waitingFinal: false, speechDetected: false, completed: false,
                captureId: null, transportRetries: 0, timingInvalid: false };
            this.armed = context;
            this.counts.arms++;
            this.event('arm', { floor: context.floor });
            const capture = this.capture;
            // A new user gesture may open an already-released native capture
            // immediately. Automatic attempts retain the ordinary release gap.
            if (!capture) return fromTap === true ? this.launch(context) : this.queueLaunch(context);
            if (!capture.nativeRequested) { this.release(capture, false); return this.launch(context); }
            if (capture.cancelled || capture.failed || capture.nativeStopRequested || capture.audioEnded || capture.retiring || capture.unownedSpeech) {
                this.state('starting', context);
                this.watchRelease(capture);
                // Speech which began during feedback has no new-question owner.
                // Its first result may arrive only after this arm. Retire that
                // capture rather than guess which question a late final belongs to.
                if (capture.unownedSpeech && !capture.retireAbortRequested) {
                    capture.retireAbortRequested = true;
                    try { capture.rec.abort(); } catch (_) { /* Release watchdog remains bounded. */ }
                }
            } else {
                context.captureId = capture.id;
                if (this.captureReady) {
                    this.beginTarget(context, now());
                    this.state('listening', context);
                } else this.state('starting', context);
            }
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
            if (this.armed !== context || !this.current(this.capture) || context.captureId !== this.capture.id || this.capture.retiring) return;
            if (context.startedAt === null && timestamp !== null) context.startedAt = timestamp;
            if (context.recordTimer == null && !context.waitingFinal) {
                context.recordTimer = global.setTimeout(() => {
                    if (this.armed === context) this.expireTarget(context);
                }, 10000);
            }
        }

        expireTarget(context) {
            const capture = this.capture;
            if (this.armed !== context || !this.current(capture)) return;
            const code = context.interim ? 'no-match' : 'no-speech';
            this.disarm();
            const deliveryVersion = this.targetVersion;
            this.counts.errors++; this.lastErrorCode = code;
            this.event('answer-timeout', { hadInterim: Boolean(context.interim) });
            this.state('idle', context);
            // Expire the unanswered target, not the native recording. A bounded
            // controller retry may arm the same question on this open stream.
            // Explicit Stop/Pause and the controller's retry limit still close it.
            if (!this.destroyed && this.targetVersion === deliveryVersion && this.current(capture) && typeof this.onError === 'function') {
                this.onError({ code, epoch: context.epoch, target: context.target, nativeMessage: '' });
            }
        }

        ready(capture, source) {
            if (!this.current(capture)) return;
            this.captureReady = !capture.audioEnded && !capture.retiring;
            global.clearTimeout(capture.startTimer);
            if (source !== 'audio') capture.speechDetected = true;
            const context = this.armed;
            if (context && context.captureId === capture.id && !capture.retiring) {
                if (source !== 'audio') context.speechDetected = true;
                // A first final without any capture/speech/interim evidence can
                // score the sound, but cannot manufacture a 1ms speed bonus.
                this.beginTarget(context, source === 'final' || capture.audioEnded ? null : now());
                this.state(context.waitingFinal ? 'processing' : 'listening', context);
            }
        }

        current(capture) {
            return Boolean(capture) && !this.destroyed && this.capture === capture && !capture.cancelled && !capture.failed;
        }

        canRecoverUntouched(capture, context) {
            return Boolean(context && context.captureId === capture.id && capture.acceptedFinal &&
                !capture.cancelled && !capture.failed && !capture.nativeStopRequested &&
                context.transportRetries < 1 && !context.speechDetected && !context.interim && this.highestSeen < context.floor);
        }

        prepareRecovery(context) {
            this.clearTargetTimers(context);
            context.captureId = null;
            context.startedAt = context.endedAt = null;
            context.waitingFinal = false;
            context.transportRetries++;
            // Reconnection must not restart a speed-bonus clock.
            context.timingInvalid = true;
            this.event('transport-retry');
            this.state('starting', context);
        }

        nativeFailure(capture, code, nativeMessage) {
            if (!this.current(capture)) return;
            const context = this.armed;
            const transient = ['aborted', 'no-speech', 'no-match'].includes(code);
            if (transient && this.canRecoverUntouched(capture, context)) {
                this.prepareRecovery(context);
                if (this.current(capture)) this.watchRelease(capture);
                return;
            }
            if (transient && (!context || context.captureId !== capture.id && capture.retiring)) {
                // Idle/cleanup events belong to the old native capture, not a
                // future question. Keep its release lock until native onend.
                this.event('idle-interruption', { code });
                this.watchRelease(capture);
                if (!capture.retireAbortRequested) {
                    capture.retireAbortRequested = true;
                    try { capture.rec.abort(); } catch (_) { /* Native end or the release watchdog owns cleanup. */ }
                }
                return;
            }
            this.fail(capture, code, nativeMessage);
        }

        launch(context) {
            if (this.destroyed || this.armed !== context || this.capture) return false;
            let rec;
            try { rec = new this.Recognition(); }
            catch (_) { this.fail(null, 'recognition-error', '', context); return false; }
            const capture = { rec, id: ++this.serial, nativeRequested: false, nativeStarted: false, speechDetected: false,
                nativeStopRequested: false, finalAfterStop: false, acceptedFinal: false, audioEnded: false, cancelled: false, failed: false,
                retiring: false, unownedSpeech: false, requestedAt: now(), finalHistory: [], previousLength: 0 };
            this.capture = capture;
            this.captureReady = false;
            this.highestSeen = -1;
            context.floor = 0;
            context.captureId = capture.id;
            rec.lang = 'ja-JP'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 10;
            rec.onstart = () => {
                if (!this.current(capture)) return;
                capture.nativeStarted = true;
                this.event('start');
                const owned = this.armed && this.armed.captureId === capture.id && !capture.retiring;
                this.state(owned && this.armed.waitingFinal ? 'processing' : owned && this.captureReady ? 'listening' : 'starting', this.armed);
            };
            rec.onaudiostart = () => { if (this.current(capture)) { this.event('audio-start'); this.ready(capture, 'audio'); } };
            rec.onspeechstart = () => {
                if (!this.current(capture)) return;
                this.event('speech-start');
                if (!this.armed || this.armed.captureId !== capture.id) {
                    capture.unownedSpeech = true;
                    this.event('unarmed-speech');
                    return;
                }
                this.ready(capture, 'speech');
            };
            rec.onspeechend = () => { if (this.current(capture)) this.event('speech-end'); };
            rec.onaudioend = () => {
                if (!this.current(capture)) return;
                capture.audioEnded = true; this.captureReady = false; this.event('audio-end');
                if (this.armed && this.armed.captureId === capture.id) this.waitForFinal(this.armed);
                else this.watchRelease(capture);
            };
            rec.onresult = event => this.results(capture, event);
            rec.onnomatch = () => this.nativeFailure(capture, 'no-match');
            rec.onerror = error => {
                if (!this.current(capture)) return;
                const code = error && error.error || 'recognition-error';
                // Some Safari releases report an abort while closing an already
                // completed utterance. It cannot invalidate the accepted answer
                // or stop the next explicitly queued activity.
                if (code === 'aborted' && capture.nativeStopRequested && capture.finalAfterStop) {
                    this.event('closing-abort', { code }); this.watchRelease(capture); return;
                }
                this.nativeFailure(capture, code, error && error.message);
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
            if (capture.retiring || this.armed && this.armed.captureId !== capture.id) {
                // No result from a closing capture owns a queued target, even
                // malformed or rewritten history. Do not validate it as though
                // it were the pending target's failed recognition attempt.
                this.event('closing-result'); return;
            }
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
                return;
            }
            let alternatives = [''];
            for (const group of windowGroups) alternatives = alternatives.flatMap(prefix => group.alternatives.map(value => (prefix + ' ' + value).trim())).slice(0, 100);
            alternatives = [...new Set(alternatives.filter(value => transcriptKey(value)))];
            if (!alternatives.length) { this.fail(capture, 'no-speech'); return; }
            const readingMs = context.timingInvalid || context.startedAt === null ? null : Math.max(1, (context.endedAt === null ? now() : context.endedAt) - context.startedAt);
            const answer = { epoch: context.epoch, target: context.target, alternatives, readingMs };
            context.completed = true;
            capture.acceptedFinal = true;
            if (capture.nativeStopRequested) capture.finalAfterStop = true;
            this.counts.finals++; this.event('final', { groups: windowGroups.length, alternatives: alternatives.length,
                firstIndex: context.floor, lastIndex: length - 1,
                changedIndex: event.resultIndex === undefined ? null : event.resultIndex });
            if (this.armed !== context || !this.current(capture)) return;
            this.disarm();
            const deliveryVersion = this.targetVersion;
            if (capture.nativeStopRequested || capture.audioEnded) this.watchRelease(capture);
            this.state('idle', context);
            if (!this.destroyed && this.targetVersion === deliveryVersion && this.capture === capture && !capture.cancelled && typeof this.onResult === 'function') this.onResult(answer);
        }

        waitForFinal(context) {
            if (this.armed !== context || !this.current(this.capture) || context.captureId !== this.capture.id || this.capture.retiring) return;
            context.waitingFinal = true;
            if (context.endedAt === null) context.endedAt = now();
            global.clearTimeout(context.recordTimer);
            if (context.finalTimer == null) context.finalTimer = global.setTimeout(() => {
                if (this.armed === context) this.fail(this.capture, context.interim ? 'no-match' : 'no-speech');
            }, 8000);
            this.state('processing', context, context.interim);
        }

        stop() {
            const capture = this.capture;
            if (!this.current(capture)) return false;
            if (this.armed && this.armed.captureId !== capture.id) { this.cancel(); return true; }
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
            if (this.capture !== capture) return;
            capture.retiring = true; this.captureReady = false;
            if (capture.releaseStartedAt === undefined) {
                capture.releaseStartedAt = now();
                capture.releaseWallStartedAt = Date.now();
            }
            global.clearTimeout(capture.startTimer);
            if (capture.releaseTimer != null) return;
            capture.abortTimer = global.setTimeout(() => {
                if (this.capture === capture) { try { capture.rec.abort(); } catch (_) {} }
            }, 1500);
            capture.releaseTimer = global.setTimeout(() => {
                if (this.capture !== capture) return;
                capture.releaseTimer = null;
                if (this.armed) this.fail(null, 'microphone-busy', '', this.armed);
            }, Math.max(0, RELEASE_TIMEOUT_MS - this.releaseElapsed(capture)));
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
            this.event('released');
            if (resume && this.armed && !this.destroyed) {
                const context = this.armed;
                this.queueLaunch(context);
            }
        }

        end(capture) {
            if (this.capture !== capture) return;
            this.event('end');
            const context = this.armed;
            if (this.canRecoverUntouched(capture, context)) {
                this.prepareRecovery(context);
                this.release(capture, true); return;
            }
            const expected = capture.cancelled || capture.failed || !context || context.captureId !== capture.id;
            if (expected) { this.release(capture, true); return; }
            this.release(capture, false);
            this.fail(null, context.interim ? 'no-match' : 'no-speech', '', context);
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
                releasing: Boolean(capture && (capture.cancelled || capture.failed || capture.audioEnded || capture.retiring)),
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
