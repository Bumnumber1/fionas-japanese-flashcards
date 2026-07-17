// Fiona's 5-Year Japanese Journey - shared runtime
// Data files curriculum_y1.js .. curriculum_y5.js populate window.CURRICULUM[year]
// with { year, title, tagline, terms:[{name,jp,theme}x4], weeks:[52 week objects] }.
// This file: journey calendar math, progress storage, TTS + SFX helpers.

window.CURRICULUM = window.CURRICULUM || {};

const Journey = (() => {
    // Week 1 of Year 1 starts Monday July 6, 2026. Every week = 7 days, 52 weeks/year.
    const START = new Date(2026, 6, 6);
    const WEEKS_PER_YEAR = 52;
    const MS_WEEK = 7 * 24 * 60 * 60 * 1000;

    function yearMeta(y) { return window.CURRICULUM[y] || null; }

    function getWeek(y, w) {
        const yr = yearMeta(y);
        if (!yr || !yr.weeks) return null;
        return yr.weeks.find(x => x.w === w) || yr.weeks[w - 1] || null;
    }

    // Global week index 0..259 -> {year, week}
    function fromGlobal(g) {
        g = Math.max(0, Math.min(5 * WEEKS_PER_YEAR - 1, g));
        return { year: Math.floor(g / WEEKS_PER_YEAR) + 1, week: (g % WEEKS_PER_YEAR) + 1 };
    }
    function toGlobal(y, w) { return (y - 1) * WEEKS_PER_YEAR + (w - 1); }

    // Which week is "now"? Clamped to the journey range.
    // Week math happens in CALENDAR space (whole days via UTC), not raw
    // milliseconds, so DST transitions can never shift a week boundary.
    function currentPos(now) {
        const n = now || new Date();
        const days = Math.floor((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())
            - Date.UTC(START.getFullYear(), START.getMonth(), START.getDate())) / 86400000);
        return fromGlobal(Math.floor(days / 7));
    }

    function weekDates(y, w) {
        const s = new Date(START.getFullYear(), START.getMonth(), START.getDate() + toGlobal(y, w) * 7);
        const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
        const fmt = d => (d.getMonth() + 1) + '/' + d.getDate();
        return { start: s, end: e, label: fmt(s) + ' - ' + fmt(e) + ', ' + e.getFullYear() };
    }

    // Term of a week (1..4): 13 weeks each
    function termOf(w) { return Math.min(4, Math.floor((w - 1) / 13) + 1); }

    // ---- Progress ----
    const PKEY = 'fiona-journey-progress';
    let cache = null;
    function load() {
        if (cache) return cache;
        try { cache = JSON.parse(localStorage.getItem(PKEY)) || {}; }
        catch (e) { cache = {}; }
        return cache;
    }
    function save() { try { localStorage.setItem(PKEY, JSON.stringify(cache)); } catch (e) {} }
    function wkey(y, w) { return 'y' + y + 'w' + w; }

    function weekProgress(y, w) {
        const p = load()[wkey(y, w)];
        return p || { stars: 0, done: [], complete: false };
    }
    // Record an activity result. stars 1-3. Week completes when 3+ activities done.
    function recordActivity(y, w, actKey, stars) {
        const all = load();
        const k = wkey(y, w);
        const p = all[k] || { stars: 0, done: [], starsBy: {}, complete: false };
        p.starsBy = p.starsBy || {};
        if (!p.done.includes(actKey)) p.done.push(actKey);
        p.starsBy[actKey] = Math.max(p.starsBy[actKey] || 0, stars);
        p.stars = Object.values(p.starsBy).reduce((a, b) => a + b, 0);
        const wk = getWeek(y, w);
        const need = wk && wk.activities ? Math.min(3, wk.activities.length) : 3;
        if (p.done.length >= need && !p.complete) { p.complete = true; p.completedAt = Date.now(); }
        all[k] = p; cache = all; save();
        return p;
    }
    function markComplete(y, w) {
        const all = load(); const k = wkey(y, w);
        const p = all[k] || { stars: 0, done: [], starsBy: {}, complete: false };
        if (!p.complete) { p.complete = true; p.completedAt = Date.now(); }
        all[k] = p; cache = all; save();
        return p;
    }
    function totals() {
        const all = load();
        let stars = 0, weeks = 0;
        for (const k in all) { stars += all[k].stars || 0; if (all[k].complete) weeks++; }
        return { stars, weeks };
    }
    function yearTotals(y) {
        const all = load();
        let stars = 0, weeks = 0;
        for (let w = 1; w <= 52; w++) {
            const p = all[wkey(y, w)];
            if (p) { stars += p.stars || 0; if (p.complete) weeks++; }
        }
        return { stars, weeks };
    }

    return { START, getWeek, yearMeta, fromGlobal, toGlobal, currentPos, weekDates, termOf,
             weekProgress, recordActivity, markComplete, totals, yearTotals };
})();

// ---- Speech (matches the site's TTS conventions) ----
const JpSpeech = (() => {
    let voice = null;
    function pick() {
        if (!('speechSynthesis' in window)) return;
        const vs = speechSynthesis.getVoices().filter(v => v.lang && v.lang.startsWith('ja'));
        voice = vs.find(v => /female|woman|kyoko|haruka|o-ren|nanami/i.test(v.name)) || vs[0] || null;
    }
    if ('speechSynthesis' in window) {
        pick();
        speechSynthesis.onvoiceschanged = pick;
    }
    function speak(text, rate) {
        if (!('speechSynthesis' in window) || !text) return;
        try {
            speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(String(text).replace(/[〜。、？?!！]/g, ' '));
            u.lang = 'ja-JP'; u.rate = rate || 0.85; u.pitch = 1.2;
            if (voice) u.voice = voice;
            speechSynthesis.speak(u);
        } catch (e) {}
    }
    function stop() { try { speechSynthesis.cancel(); } catch (e) {} }
    window.addEventListener('pagehide', stop);
    return { speak, stop };
})();

// ---- SFX (Web Audio, same style as the games) ----
const Sfx = (() => {
    let ctx = null;
    function ac() {
        if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
        if (ctx && ctx.state === 'suspended') ctx.resume();
        return ctx;
    }
    document.addEventListener('touchstart', ac, { once: true });
    document.addEventListener('click', ac, { once: true });
    function tone(freq, t0, dur, type, vol) {
        const c = ac(); if (!c) return;
        const o = c.createOscillator(), g = c.createGain();
        o.type = type || 'sine'; o.frequency.value = freq;
        g.gain.setValueAtTime(vol || 0.15, c.currentTime + t0);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t0 + dur);
        o.connect(g); g.connect(c.destination);
        o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur);
    }
    return {
        correct() { tone(523, 0, .15); tone(659, .1, .15); tone(784, .2, .25); },
        wrong() { tone(180, 0, .25, 'square', .1); },
        pop() { tone(880, 0, .08, 'triangle', .12); },
        win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .12, .3)); },
        star() { tone(1319, 0, .12, 'triangle', .1); tone(1568, .09, .2, 'triangle', .1); },
        coin() { tone(988, 0, .08, 'square', .08); tone(1319, .07, .25, 'triangle', .12); },
    };
})();

// ---- Small shared utils ----
function shuffleArr(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function pickN(a, n) { return shuffleArr(a).slice(0, n); }
function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
