// Fiona's Japanese - rotating weekly activity engine
// Each activity type renders into a host element from a context object:
//   ctx = { year, w, week, vocab, pool, examples, kanjiPool, writing, story,
//           speak(text), sfx, onComplete(stars, correct, total) }
// pool = this week's vocab + review-week vocab (always >= 8 usable entries).
// Every game ends on a finish screen that reports stars via ctx.onComplete.

window.Activities = (() => {

    // ---------- shared helpers ----------
    function el(host, html) { host.innerHTML = html; return host; }

    const PRAISE = ['すごい', 'やったね', 'いいね', 'かんぺき'];

    function starsFor(correct, total) {
        if (!total) return 1;
        const r = correct / total;
        return r >= 0.9 ? 3 : r >= 0.65 ? 2 : 1;
    }

    function finish(host, ctx, correct, total, extraMsg) {
        const stars = starsFor(correct, total);
        // read the previous best BEFORE recording, so beating it still reads as a record
        const prev = ctx.prevBest ? ctx.prevBest()
            : (((Journey.weekProgress(ctx.year, ctx.w).starsBy || {})[ctx.actKey]) || 0);
        const record = !ctx.practice && stars > prev && prev > 0;
        ctx.onComplete(stars, correct, total);
        ctx.sfx.win();
        const msg = stars === 3 ? 'すごい! Amazing!' : stars === 2 ? 'よくできました! Great job!' : 'がんばったね! Good try!';
        const confetti = stars === 3 ? Array.from({ length: 16 }, () =>
            `<span class="confetti" style="left:${Math.floor(Math.random() * 96)}%;animation-delay:${(Math.random() * 0.9).toFixed(2)}s">${pickN(['🎉', '⭐', '🌸', '✨'], 1)[0]}</span>`).join('') : '';
        el(host, `
          <div class="act-finish">
            ${confetti}
            ${record ? '<div class="act-record">🏆 NEW RECORD!</div>' : ''}
            <div class="act-finish-stars">${[0, 1, 2].map(k => `<span class="star-dim" data-star="${k}">⭐</span>`).join('')}</div>
            <div class="act-finish-msg">${msg}</div>
            ${stars === 3 ? '<div class="finish-mochi"><span class="mascot small">🐰</span>やったね！おいわい しよう！</div>' : ''}
            <div class="act-finish-score">${correct} / ${total}${extraMsg ? ' · ' + escHtml(extraMsg) : ''}</div>
            <button class="act-btn act-btn-primary" data-again>Play Again 🔁</button>
            <button class="act-btn" data-done>Done ✔</button>
          </div>`);
        for (let k = 0; k < stars; k++) ctx.after(() => {
            const s = host.querySelector(`[data-star="${k}"]`);
            if (s) { s.classList.remove('star-dim'); s.classList.add('star-pop'); }
            ctx.sfx.star();
        }, 350 + 250 * k);
        if (record) ctx.after(() => ctx.sfx.star(), 350 + 250 * stars);
        // spoken praise - but never cut off the last answer's own speech mid-word
        // (the final scramble/blank/shop sentence can still be playing); retry once
        const praiseLine = stars === 3 ? 'すごい' : stars === 2 ? 'よくできました' : 'がんばったね';
        const tryPraise = retry => {
            if (!('speechSynthesis' in window) || !speechSynthesis.speaking) ctx.speak(praiseLine);
            else if (retry) ctx.after(() => tryPraise(false), 1600);
        };
        ctx.after(() => tryPraise(true), 1100);
        host.querySelector('[data-again]').onclick = () => ctx._restart();
        host.querySelector('[data-done]').onclick = () => ctx._close();
    }

    function bar(i, n) {
        const pct = Math.round(i / n * 100);
        return `<div class="act-bar"><div class="act-bar-fill" style="width:${pct}%"></div><span class="act-walker" style="left:calc(${pct}% - 10px)">${i === n - 1 ? '🎉' : '🚶‍♀️'}</span></div>
                <div class="act-bar-label">${i} / ${n}</div>`;
    }

    // Build a multiple-choice round engine. rounds: [{prompt(html), speakText, options:[{html, ok}]}]
    function mcRun(host, ctx, rounds, opts) {
        let i = 0, correct = 0, streak = 0, best = 0;
        opts = opts || {};
        function round() {
            if (i >= rounds.length) return finish(host, ctx, correct, rounds.length, best >= 3 ? 'Best streak ' + best + ' 🔥' : undefined);
            const r = rounds[i];
            let missed = false;
            el(host, `
              ${bar(i, rounds.length)}
              ${streak >= 2 ? `<div class="act-streak">🔥 ×${streak}</div>` : ''}
              <div class="act-prompt">${r.prompt}</div>
              ${r.speakText ? '<button class="act-speaker" data-spk>🔊 Listen</button>' : ''}
              <div class="act-options">${r.options.map((o, j) =>
                `<button class="act-opt" data-j="${j}">${o.html}</button>`).join('')}</div>`);
            if (r.speakText) {
                const spk = host.querySelector('[data-spk]');
                spk.onclick = () => ctx.speak(r.speakText);
                if (opts.autoSpeak) ctx.after(() => ctx.speak(r.speakText), 350);
            }
            host.querySelectorAll('.act-opt').forEach(btn => {
                btn.onclick = () => {
                    const ok = r.options[+btn.dataset.j].ok;
                    if (btn.classList.contains('picked')) return;
                    btn.classList.add('picked', ok ? 'right' : 'wrong');
                    if (ok) {
                        // stars reflect first-try accuracy; she still gets to find the answer
                        if (!missed) {
                            correct++; streak++; best = Math.max(best, streak);
                            if (streak === 3 || streak === 5) ctx.sfx.star();
                            if ((streak === 3 || streak === 5 || streak === 8) && !r.sayOnRight)
                                ctx.after(() => ctx.speak(PRAISE[Math.floor(Math.random() * PRAISE.length)]), 400);
                        }
                        ctx.sfx.correct();
                        if (r.sayOnRight) ctx.speak(r.sayOnRight);
                        host.querySelectorAll('.act-opt').forEach(b => b.disabled = true);
                        ctx.after(() => { i++; round(); }, 900);
                    } else {
                        missed = true; streak = 0;
                        ctx.sfx.wrong();
                        btn.disabled = true;
                    }
                };
            });
        }
        round();
    }

    function distinct(pool, n, keyFn) {
        const seen = new Set(), out = [];
        for (const p of shuffleArr(pool)) {
            const k = keyFn(p);
            if (!seen.has(k)) { seen.add(k); out.push(p); }
            if (out.length >= n) break;
        }
        return out;
    }

    // ---------- 1. memory ----------
    function memory(host, ctx) {
        // unique meaning AND unique kana - twin-meaning words (ゆうしゃ/ヒーロー are
        // both "🦸 hero") would make two indistinguishable face cards
        const words = distinct(distinct(ctx.pool, ctx.pool.length, v => v.jp), 6, v => (v.en || '').toLowerCase());
        let cards = [];
        words.forEach((v, i) => {
            cards.push({ pid: i, face: `<span class="mem-jp">${escHtml(v.jp)}</span>`, say: v.jp });
            cards.push({ pid: i, face: `<span class="mem-emoji">${v.emoji}</span><span class="mem-en">${escHtml(v.en)}</span>`, say: null });
        });
        cards = shuffleArr(cards);
        let open = [], matched = 0, moves = 0, lock = false;
        el(host, `<div class="act-subtitle">Find the matching pairs!</div>
          <div class="mem-grid">${cards.map((c, i) =>
            `<button class="mem-card" data-i="${i}"><span class="mem-front">?</span><span class="mem-back">${c.face}</span></button>`).join('')}</div>
          <div class="act-bar-label" data-moves>Moves: 0</div>`);
        host.querySelectorAll('.mem-card').forEach(btn => {
            btn.onclick = () => {
                if (lock || btn.classList.contains('open') || btn.classList.contains('done')) return;
                btn.classList.add('open');
                const c = cards[+btn.dataset.i];
                if (c.say) ctx.speak(c.say);
                open.push(btn);
                if (open.length === 2) {
                    moves++; host.querySelector('[data-moves]').textContent = 'Moves: ' + moves;
                    const [a, b] = open.map(x => cards[+x.dataset.i]);
                    if (a.pid === b.pid) {
                        open.forEach(x => x.classList.add('done'));
                        matched++; ctx.sfx.correct(); ctx.speak(words[a.pid].jp); open = [];
                        if (matched === words.length) {
                            const total = words.length, correct = moves <= total + 2 ? total : moves <= total * 2 ? Math.ceil(total * 0.7) : Math.ceil(total * 0.5);
                            ctx.after(() => finish(host, ctx, correct, total, moves + ' moves'), 600);
                        }
                    } else {
                        lock = true; ctx.sfx.wrong();
                        ctx.after(() => { open.forEach(x => x.classList.remove('open')); open = []; lock = false; }, 850);
                    }
                }
            };
        });
    }

    // ---------- 2. listen ----------
    function listen(host, ctx) {
        const words = distinct(ctx.pool, Math.min(10, ctx.pool.length), v => v.jp);
        const rounds = words.map(w => {
            const others = pickN(ctx.pool.filter(v => v.en !== w.en), 3);
            const opts = shuffleArr([{ html: `<span class="opt-emoji">${w.emoji}</span> ${escHtml(w.en)}`, ok: true },
                ...others.map(o => ({ html: `<span class="opt-emoji">${o.emoji}</span> ${escHtml(o.en)}`, ok: false }))]);
            return { prompt: '<span class="act-ear">👂</span> What did you hear?', speakText: w.jp, options: opts };
        });
        mcRun(host, ctx, rounds, { autoSpeak: true });
    }

    // ---------- 3. quiz ----------
    function quiz(host, ctx) {
        const words = distinct(ctx.pool, Math.min(10, ctx.pool.length), v => v.jp);
        const rounds = words.map((w, i) => {
            const jp2en = i % 2 === 0;
            const others = pickN(ctx.pool.filter(v => v.en !== w.en && v.jp !== w.jp), 3);
            if (jp2en) return {
                prompt: `<span class="q-jp">${escHtml(w.jp)}</span><span class="q-rom">${escHtml(w.romaji || '')}</span>`,
                speakText: w.jp,
                options: shuffleArr([{ html: escHtml(w.en), ok: true }, ...others.map(o => ({ html: escHtml(o.en), ok: false }))]),
            };
            return {
                prompt: `<span class="opt-emoji">${w.emoji}</span> <b>${escHtml(w.en)}</b>`,
                sayOnRight: w.jp,
                options: shuffleArr([{ html: `<span class="q-jp-opt">${escHtml(w.jp)}</span>`, ok: true },
                    ...others.map(o => ({ html: `<span class="q-jp-opt">${escHtml(o.jp)}</span>`, ok: false }))]),
            };
        });
        mcRun(host, ctx, rounds);
    }

    // ---------- 4. scramble ----------
    function scramble(host, ctx) {
        const sents = ctx.examples.filter(s => s.jp.trim().split(/\s+/).length >= 3);
        if (!sents.length) return quiz(host, ctx);
        const rounds = pickN(sents, Math.min(6, sents.length));
        let i = 0, correct = 0;
        function round() {
            if (i >= rounds.length) return finish(host, ctx, correct, rounds.length);
            const s = rounds[i];
            const tokens = s.jp.trim().replace(/。$/, '').split(/\s+/);
            const chips = shuffleArr(tokens.map((t, j) => ({ t, j })));
            let picked = [], graded = false;
            function render() {
                el(host, `
                  ${bar(i, rounds.length)}
                  <div class="act-subtitle">Build the sentence:</div>
                  <div class="scr-en">"${escHtml(s.en)}"</div>
                  <div class="scr-slots">${picked.length ? picked.map(p => `<span class="scr-slot">${escHtml(p.t)}</span>`).join('') : '<span class="scr-hint">tap the tiles below ⬇</span>'}</div>
                  <div class="scr-chips">${chips.map((c, k) =>
                    `<button class="scr-chip${picked.includes(c) ? ' used' : ''}" data-k="${k}">${escHtml(c.t)}</button>`).join('')}</div>
                  <div class="act-row">
                    <button class="act-btn" data-clear>Clear</button>
                    <button class="act-btn act-btn-primary" data-check ${picked.length === tokens.length ? '' : 'disabled'}>Check ✔</button>
                  </div>`);
                host.querySelectorAll('.scr-chip').forEach(b => b.onclick = () => {
                    if (graded) return;
                    const c = chips[+b.dataset.k];
                    if (picked.includes(c)) return;
                    picked.push(c); ctx.sfx.pop(); render();
                });
                host.querySelector('[data-clear]').onclick = () => { if (graded) return; picked = []; render(); };
                host.querySelector('[data-check]').onclick = () => {
                    if (graded) return;
                    graded = true;
                    host.querySelectorAll('.scr-chip, [data-clear], [data-check]').forEach(b => b.disabled = true);
                    const ok = picked.map(p => p.t).join(' ') === tokens.join(' ');
                    if (ok) { correct++; ctx.sfx.correct(); ctx.speak(s.jp); } else ctx.sfx.wrong();
                    const slots = host.querySelector('.scr-slots');
                    slots.classList.add(ok ? 'scr-right' : 'scr-wrong');
                    if (!ok) slots.innerHTML += `<div class="scr-answer">✔ ${escHtml(tokens.join(' '))}</div>`;
                    ctx.after(() => { i++; round(); }, ok ? 1300 : 2400);
                };
            }
            render();
        }
        round();
    }

    // ---------- 5. trace ----------
    function parsePath(d) {
        // Tiny SVG path parser (M/m/L/l/C/c/S/s/Z) -> polyline points, KanjiVG 109x109 space
        const cmds = d.match(/[MmLlCcSsZz][^MmLlCcSsZz]*/g) || [];
        let pts = [], x = 0, y = 0, px = null, py = null;
        function curve(x1, y1, x2, y2, x3, y3) {
            const x0 = x, y0 = y;
            for (let t = 0.1; t <= 1.001; t += 0.1) {
                const u = 1 - t;
                pts.push([u*u*u*x0 + 3*u*u*t*x1 + 3*u*t*t*x2 + t*t*t*x3,
                          u*u*u*y0 + 3*u*u*t*y1 + 3*u*t*t*y2 + t*t*t*y3]);
            }
            px = x2; py = y2; x = x3; y = y3;
        }
        for (const c of cmds) {
            const op = c[0];
            const n = (c.slice(1).trim().match(/-?[\d.]+/g) || []).map(Number);
            if (op === 'M') { x = n[0]; y = n[1]; pts.push([x, y]); }
            else if (op === 'm') { x += n[0]; y += n[1]; pts.push([x, y]); }
            else if (op === 'L') for (let k = 0; k < n.length; k += 2) { x = n[k]; y = n[k+1]; pts.push([x, y]); }
            else if (op === 'l') for (let k = 0; k < n.length; k += 2) { x += n[k]; y += n[k+1]; pts.push([x, y]); }
            else if (op === 'C') for (let k = 0; k < n.length; k += 6) curve(n[k], n[k+1], n[k+2], n[k+3], n[k+4], n[k+5]);
            else if (op === 'c') for (let k = 0; k < n.length; k += 6) curve(x+n[k], y+n[k+1], x+n[k+2], y+n[k+3], x+n[k+4], y+n[k+5]);
            else if (op === 'S' || op === 's') for (let k = 0; k < n.length; k += 4) {
                const rx = px == null ? x : 2*x - px, ry = py == null ? y : 2*y - py;
                const a = op === 's' ? [x+n[k], y+n[k+1], x+n[k+2], y+n[k+3]] : [n[k], n[k+1], n[k+2], n[k+3]];
                curve(rx, ry, a[0], a[1], a[2], a[3]);
            }
        }
        return pts;
    }

    function trace(host, ctx) {
        // Writing targets may be combo units (きゃ) or small words (がっこう):
        // split into single characters for tracing, keeping order, deduped.
        let raw = (ctx.writing && ctx.writing.chars && ctx.writing.chars.length)
            ? ctx.writing.chars
            : distinct(ctx.pool, 5, v => v.jp).map(v => v.jp[0]);
        const seenC = new Set();
        const chars = raw.flatMap(c => [...String(c)]).filter(c => c !== 'ー' && !seenC.has(c) && seenC.add(c)).slice(0, 10);
        let idx = 0, passed = 0, attempted = 0;
        let lastUp = null; // current window mouseup handler, swapped out per character
        ctx._onTeardown(() => { if (lastUp) window.removeEventListener('mouseup', lastUp); });
        function charView() {
            if (idx >= chars.length) return finish(host, ctx, passed, chars.length);
            const ch = chars[idx];
            const kvg = (window.KVG_DATA && window.KVG_DATA[ch]) || null;
            el(host, `
              ${bar(idx, chars.length)}
              <div class="act-subtitle">Trace: <b class="trace-char-label">${escHtml(ch)}</b>
                <button class="act-speaker act-speaker-sm" data-spk>🔊</button></div>
              <div class="trace-wrap"><canvas class="trace-canvas"></canvas></div>
              <div class="act-row">
                <button class="act-btn" data-clear>Clear</button>
                <button class="act-btn act-btn-primary" data-check>Check ✔</button>
                <button class="act-btn" data-skip>Skip ▸</button>
              </div>
              <div class="trace-msg" data-msg>${kvg ? 'Follow the dashed guide, stroke by stroke!' : 'Trace over the big letter!'}</div>`);
            host.querySelector('[data-spk]').onclick = () => ctx.speak(ch);
            const canvas = host.querySelector('.trace-canvas');
            const wrap = host.querySelector('.trace-wrap');
            const size = Math.min(wrap.clientWidth || 280, 320);
            canvas.width = size; canvas.height = size;
            const g = canvas.getContext('2d');
            const strokes = kvg ? kvg.map(parsePath).map(p => p.map(([a, b]) => [a / 109 * size, b / 109 * size])) : null;
            let userStrokes = [], cur = null, advancing = false;
            function repaint() {
                g.clearRect(0, 0, size, size);
                g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
                g.strokeStyle = '#eee'; g.beginPath();
                g.moveTo(size/2, 0); g.lineTo(size/2, size); g.moveTo(0, size/2); g.lineTo(size, size/2); g.stroke();
                if (strokes) {
                    g.strokeStyle = '#c5cae9'; g.lineWidth = 5; g.lineCap = 'round'; g.setLineDash([7, 6]);
                    strokes.forEach(st => {
                        g.beginPath();
                        st.forEach(([a, b], i) => i ? g.lineTo(a, b) : g.moveTo(a, b));
                        g.stroke();
                    });
                    g.setLineDash([]);
                    g.fillStyle = '#f06292'; g.font = 'bold ' + Math.round(size * 0.055) + 'px Nunito, sans-serif';
                    strokes.forEach((st, i) => {
                        g.beginPath(); g.arc(st[0][0], st[0][1], size * 0.028, 0, 7); g.fill();
                        g.fillStyle = '#fff'; g.fillText(i + 1, st[0][0] - size * 0.016, st[0][1] + size * 0.02);
                        g.fillStyle = '#f06292';
                    });
                } else {
                    g.fillStyle = 'rgba(63,81,181,0.13)';
                    g.font = (size * 0.8) + 'px "Noto Sans JP", sans-serif';
                    g.textAlign = 'center'; g.textBaseline = 'middle';
                    g.fillText(ch, size / 2, size / 2 + size * 0.04);
                    g.textAlign = 'start'; g.textBaseline = 'alphabetic';
                }
                g.strokeStyle = '#3f51b5'; g.lineWidth = Math.max(6, size * 0.03); g.lineCap = 'round'; g.lineJoin = 'round';
                userStrokes.concat(cur ? [cur] : []).forEach(st => {
                    g.beginPath();
                    st.forEach(([a, b], i) => i ? g.lineTo(a, b) : g.moveTo(a, b));
                    g.stroke();
                });
            }
            repaint();
            function pos(e) {
                const r = canvas.getBoundingClientRect();
                const t = e.touches ? e.touches[0] : e;
                return [(t.clientX - r.left) * (canvas.width / r.width), (t.clientY - r.top) * (canvas.height / r.height)];
            }
            function down(e) { if (advancing) return; e.preventDefault(); cur = [pos(e)]; }
            function move(e) { if (!cur) return; e.preventDefault(); cur.push(pos(e)); repaint(); }
            function up() { if (advancing) return; if (cur && cur.length > 2) userStrokes.push(cur); cur = null; repaint(); }
            canvas.addEventListener('mousedown', down); canvas.addEventListener('mousemove', move);
            if (lastUp) window.removeEventListener('mouseup', lastUp);
            window.addEventListener('mouseup', up);
            lastUp = up;
            canvas.addEventListener('touchstart', down, { passive: false });
            canvas.addEventListener('touchmove', move, { passive: false });
            canvas.addEventListener('touchend', up);
            canvas.addEventListener('touchcancel', up);
            host.querySelector('[data-clear]').onclick = () => { if (advancing) return; userStrokes = []; repaint(); };
            host.querySelector('[data-skip]').onclick = () => { if (advancing) return; idx++; charView(); };
            host.querySelector('[data-check]').onclick = () => {
                if (advancing) return;
                attempted++;
                const msg = host.querySelector('[data-msg]');
                if (!userStrokes.length) { msg.textContent = 'Draw the character first!'; return; }
                let ok = false, detail = '';
                if (strokes) {
                    if (userStrokes.length !== strokes.length) {
                        detail = `This one needs ${strokes.length} strokes - you drew ${userStrokes.length}. Try again!`;
                    } else {
                        let totalD = 0, n = 0;
                        userStrokes.forEach((ust, i) => {
                            const gst = strokes[i];
                            ust.forEach(p => {
                                let best = 1e9;
                                for (const q of gst) {
                                    const d = (p[0]-q[0])**2 + (p[1]-q[1])**2;
                                    if (d < best) best = d;
                                }
                                totalD += Math.sqrt(best); n++;
                            });
                        });
                        const avg = totalD / n / size;
                        ok = avg < 0.09; detail = ok ? '' : 'Stay closer to the dashed guide - try again!';
                    }
                } else {
                    ok = userStrokes.length >= 1;
                }
                if (ok) {
                    passed++; advancing = true; ctx.sfx.correct(); ctx.speak(ch);
                    host.querySelectorAll('.act-row .act-btn').forEach(b => b.disabled = true);
                    // golden-ink celebration: her own strokes glow gold on a clean board
                    g.clearRect(0, 0, size, size);
                    g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
                    g.strokeStyle = '#ffb300'; g.shadowColor = '#ffd54f'; g.shadowBlur = 14;
                    g.lineWidth = Math.max(6, size * 0.03); g.lineCap = 'round'; g.lineJoin = 'round';
                    userStrokes.forEach(st => {
                        g.beginPath();
                        st.forEach(([a, b], i) => i ? g.lineTo(a, b) : g.moveTo(a, b));
                        g.stroke();
                    });
                    g.shadowBlur = 0;
                    msg.textContent = 'すごい! Beautiful writing! ✨';
                    ctx.after(() => { idx++; charView(); }, 1300);
                } else { ctx.sfx.wrong(); msg.textContent = detail; }
            };
        }
        charView();
    }

    // ---------- 6. sort ----------
    const POS_LABEL = { 'noun': 'Nouns 🧸', 'verb': 'Verbs 🏃', 'i-adj': 'い-adjectives', 'na-adj': 'な-adjectives',
        'adverb': 'Adverbs', 'phrase': 'Phrases 💬', 'counter': 'Counters 🔢', 'expression': 'Phrases 💬', 'particle': 'Particles' };
    function sort(host, ctx) {
        const byPos = {};
        // phrase + expression share the "Phrases 💬" label, so they must be ONE
        // team - otherwise both bins could be labeled identically (a blind 50/50)
        const posClass = v => (v.pos === 'phrase' || v.pos === 'expression') ? 'phrase' : v.pos;
        ctx.pool.forEach(v => { const c = posClass(v); (byPos[c] = byPos[c] || []).push(v); });
        const classes = Object.keys(byPos).filter(p => byPos[p].length >= 3);
        let mode, cards, binA, binB;
        if (classes.length >= 2) {
            const [a, b] = pickN(classes, 2);
            binA = { key: a, label: POS_LABEL[a] || a }; binB = { key: b, label: POS_LABEL[b] || b };
            cards = shuffleArr(pickN(byPos[a], 5).concat(pickN(byPos[b], 5)))
                .map(v => ({ html: `${v.emoji} <b>${escHtml(v.jp)}</b><br><small>${escHtml(v.en)}</small>`, say: v.jp, bin: posClass(v) === a ? 'A' : 'B' }));
            mode = 'pos';
        } else {
            const words = distinct(ctx.pool, 10, v => v.jp);
            binA = { label: '○ True!' }; binB = { label: '✕ Not right!' };
            cards = words.map(v => {
                const truth = Math.random() < 0.55;
                const shown = truth ? v : pickN(ctx.pool.filter(o => o.en !== v.en), 1)[0];
                return { html: `<b>${escHtml(v.jp)}</b> = "${escHtml(shown.en)}" ${truth ? '' : ''}`, say: v.jp, bin: truth ? 'A' : 'B' };
            });
            mode = 'tf';
        }
        let i = 0, correct = 0;
        function round() {
            if (i >= cards.length) return finish(host, ctx, correct, cards.length);
            const c = cards[i];
            el(host, `
              ${bar(i, cards.length)}
              <div class="act-subtitle">${mode === 'pos' ? 'Which team does it belong to?' : 'Is this right?'}</div>
              <div class="sort-card">${c.html} <button class="act-speaker act-speaker-sm" data-spk>🔊</button></div>
              <div class="sort-bins">
                <button class="act-opt sort-bin" data-bin="A">${escHtml(binA.label)}</button>
                <button class="act-opt sort-bin" data-bin="B">${escHtml(binB.label)}</button>
              </div>`);
            host.querySelector('[data-spk]').onclick = () => ctx.speak(c.say);
            host.querySelectorAll('.sort-bin').forEach(btn => btn.onclick = () => {
                const ok = btn.dataset.bin === c.bin;
                btn.classList.add(ok ? 'right' : 'wrong');
                if (ok) { correct++; ctx.sfx.correct(); } else {
                    ctx.sfx.wrong();
                    host.querySelector(`[data-bin="${c.bin}"]`).classList.add('right');
                }
                host.querySelectorAll('.sort-bin').forEach(b => b.disabled = true);
                ctx.after(() => { i++; round(); }, 950);
            });
        }
        round();
    }

    // ---------- 7. blank ----------
    const PARTICLES = ['は', 'が', 'を', 'に', 'で', 'へ', 'と', 'も', 'の', 'から', 'まで'];
    function blank(host, ctx) {
        const sents = ctx.examples.filter(s => s.jp.trim().split(/\s+/).length >= 3);
        if (!sents.length) return quiz(host, ctx);
        const rounds = pickN(sents, Math.min(8, sents.length)).map(s => {
            const tokens = s.jp.trim().replace(/。$/, '').split(/\s+/);
            let bi = tokens.findIndex(t => PARTICLES.includes(t));
            const isParticle = bi >= 0;
            if (bi < 0) bi = Math.floor(Math.random() * tokens.length);
            const answer = tokens[bi];
            // never offer a particle that would ALSO be correct in the sentence
            // (は/が/も swap freely in many clozes; に/へ both mark direction)
            const CONFUSABLE = { 'は': ['が', 'も'], 'が': ['は', 'も'], 'も': ['は', 'が'], 'に': ['へ'], 'へ': ['に'] };
            const alsoOk = CONFUSABLE[answer] || [];
            const distract = isParticle
                ? pickN(PARTICLES.filter(p => p !== answer && !alsoOk.includes(p)), 3)
                : pickN(ctx.pool.map(v => v.jp).filter(t => t !== answer), 3);
            const shown = tokens.map((t, j) => j === bi ? '<span class="blank-gap">___</span>' : escHtml(t)).join(' ');
            return {
                prompt: `<div class="blank-sent">${shown}</div><div class="scr-en">"${escHtml(s.en)}"</div>`,
                sayOnRight: s.jp,
                options: shuffleArr([{ html: escHtml(answer), ok: true }, ...distract.map(d => ({ html: escHtml(d), ok: false }))]),
            };
        });
        mcRun(host, ctx, rounds);
    }

    // ---------- 8. bingo ----------
    function bingo(host, ctx) {
        const words = distinct(ctx.pool, 9, v => v.jp);
        if (words.length < 9) return listen(host, ctx);
        const order = shuffleArr(words);
        let calls = 0, wrong = 0, marked = new Set(), currentCall = null;
        const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
        function markedFlags() {
            const g = Array(9).fill(0);
            marked.forEach(w => { g[words.indexOf(w)] = 1; });
            return g;
        }
        function winLine() {
            const g = markedFlags();
            return LINES.find(L => L.every(p => g[p])) || null;
        }
        function hotCells() {
            // unmarked cells that would complete a line - "one away!"
            const g = markedFlags(), hot = new Set();
            LINES.forEach(L => {
                const missing = L.filter(p => !g[p]);
                if (missing.length === 1) hot.add(missing[0]);
            });
            return hot;
        }
        function render() {
            const hot = hotCells();
            el(host, `
              <div class="act-subtitle">🎱 Listen and tap the word you hear! 3 in a row wins!</div>
              <div class="act-row"><button class="act-btn act-btn-primary" data-call>${calls ? '🔊 Hear it again' : '▶ Start calling!'}</button></div>
              <div class="bingo-grid">${words.map((w, i) =>
                `<button class="bingo-cell${marked.has(w) ? ' marked' : ''}${!marked.has(w) && hot.has(i) ? ' bingo-hot' : ''}" data-i="${i}">
                   <span class="bingo-emoji">${w.emoji}</span><span class="bingo-jp">${escHtml(w.jp)}</span></button>`).join('')}</div>`);
            host.querySelector('[data-call]').onclick = () => {
                if (!currentCall) { currentCall = order[calls]; calls++; }
                ctx.speak(currentCall.jp);
                host.querySelector('[data-call]').textContent = '🔊 Hear it again';
            };
            host.querySelectorAll('.bingo-cell').forEach(btn => btn.onclick = () => {
                if (!currentCall || marked.has(words[+btn.dataset.i])) return;
                const w = words[+btn.dataset.i];
                if (w === currentCall) {
                    marked.add(w); ctx.sfx.correct(); currentCall = null;
                    render();
                    const win = winLine();
                    if (win) {
                        // freeze the board so taps during the celebration can't re-render or change the score
                        host.querySelectorAll('.bingo-cell, [data-call]').forEach(b => b.disabled = true);
                        const cells = host.querySelectorAll('.bingo-cell');
                        win.forEach((p, k) => ctx.after(() => { cells[p].classList.add('bingo-win'); ctx.sfx.star(); }, 150 + 220 * k));
                        ctx.after(() => ctx.speak('ビンゴ'), 250);
                        const total = marked.size + wrong;
                        ctx.after(() => finish(host, ctx, marked.size, total, 'BINGO!'), 1500);
                        return;
                    }
                    ctx.after(() => host.querySelector('[data-call]').click(), 700);
                } else { wrong++; ctx.sfx.wrong(); btn.classList.add('shake'); ctx.after(() => btn.classList.remove('shake'), 400); }
            });
        }
        render();
    }

    // ---------- 9. whack ----------
    function whack(host, ctx) {
        const words = distinct(ctx.pool, Math.min(12, ctx.pool.length), v => v.jp);
        let score = 0, misses = 0, round = 0, target = null, timer = null, alive = true;
        const TOTAL = 10;
        function nextRound() {
            if (!alive) return;
            if (round >= TOTAL) { alive = false; return finish(host, ctx, score, TOTAL); }
            round++;
            const ms = Math.max(3500, 7000 - round * 350);
            target = words[Math.floor(Math.random() * words.length)];
            const ups = shuffleArr([target, ...pickN(words.filter(w => w !== target), 3)]);
            const cells = shuffleArr([...ups, null, null, null, null, null]).slice(0, 9);
            el(host, `
              ${bar(round - 1, TOTAL)}
              <div class="act-subtitle">🔨 Whack: <b>${escHtml(target.en)}</b> ${target.emoji}
                <button class="act-speaker act-speaker-sm" data-spk>🔊</button></div>
              <div class="whack-grid">${cells.map((c, i) =>
                `<button class="whack-hole" data-i="${i}">${c ? `<span class="whack-mole">${escHtml(c.jp)}</span>` : ''}</button>`).join('')}</div>
              <div class="act-bar whack-timebar"><div class="act-bar-fill" style="width:100%"></div></div>
              <div class="act-bar-label" data-score>Score: ${score} · Misses: ${misses}</div>`);
            host.querySelector('[data-spk]').onclick = () => ctx.speak(target.jp);
            ctx.speak(target.jp);
            const tfill = host.querySelector('.whack-timebar .act-bar-fill');
            tfill.style.transition = 'width ' + ms + 'ms linear';
            void tfill.offsetWidth;
            tfill.style.width = '0%';
            let missedThis = false; // elimination-tapping earns the advance, not the point
            host.querySelectorAll('.whack-hole').forEach((btn, i) => btn.onclick = () => {
                const c = cells[i];
                if (!c) return;
                if (c === target) { if (!missedThis) score++; ctx.sfx.pop(); clearTimeout(timer); nextRound(); }
                else {
                    missedThis = true;
                    misses++; ctx.sfx.wrong();
                    btn.classList.add('shake'); ctx.after(() => btn.classList.remove('shake'), 400);
                    const lbl = host.querySelector('[data-score]');
                    if (lbl) lbl.textContent = `Score: ${score} · Misses: ${misses}`;
                }
            });
            clearTimeout(timer);
            timer = setTimeout(() => { misses++; nextRound(); }, ms);
        }
        ctx._onTeardown(() => { alive = false; clearTimeout(timer); });
        nextRound();
    }

    // ---------- 10. speak ----------
    function normalizeJa(s) {
        return String(s).replace(/[\s。、，,.!！?？「」『』]/g, '')
            .replace(/[ァ-ヶ]/g, m => String.fromCharCode(m.charCodeAt(0) - 0x60))
            .replace(/ー/g, '').toLowerCase();
    }
    function lev(a, b) {
        const m = a.length, n = b.length;
        if (!m) return n; if (!n) return m;
        let prev = Array.from({ length: n + 1 }, (_, i) => i);
        for (let i = 1; i <= m; i++) {
            const cur = [i];
            for (let j = 1; j <= n; j++)
                cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = cur;
        }
        return prev[n];
    }
    function speakAct(host, ctx) {
        const lines = pickN(ctx.examples, Math.min(4, ctx.examples.length));
        if (!lines.length) return listen(host, ctx);
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        let i = 0, stars = 0, rec = null;
        ctx._onTeardown(() => { try { if (rec) { rec.onresult = rec.onerror = rec.onend = null; rec.stop(); } } catch (e) {} });
        function round() {
            if (i >= lines.length) return finish(host, ctx, stars, lines.length);
            const s = lines[i];
            let graded = false; // each sentence may award a star and advance exactly once
            el(host, `
              ${bar(i, lines.length)}
              <div class="act-subtitle">🎤 Say it in Japanese!</div>
              <div class="speak-card">
                <div class="q-jp">${escHtml(s.jp)}</div>
                <div class="q-rom">${escHtml(s.romaji || '')}</div>
                <div class="scr-en">"${escHtml(s.en)}"</div>
              </div>
              <div class="act-row">
                <button class="act-btn" data-listen>🔊 Listen</button>
                ${SR ? '<button class="act-btn act-btn-primary" data-mic>🎤 Speak</button>' : ''}
                <button class="act-btn" data-said>I said it! ✔</button>
              </div>
              <div class="trace-msg" data-msg></div>`);
            host.querySelector('[data-listen]').onclick = () => ctx.speak(s.jp);
            host.querySelector('[data-said]').onclick = function () {
                if (graded || this.disabled) return;
                graded = true;
                this.disabled = true;
                const mic = host.querySelector('[data-mic]');
                if (mic) mic.disabled = true;
                stars++; ctx.sfx.star();
                host.querySelector('[data-msg]').textContent = 'Brave speaking! 🎤';
                ctx.after(() => { i++; round(); }, 700);
            };
            if (SR) host.querySelector('[data-mic]').onclick = function () {
                if (graded) return;
                // stop any TTS first - the mic must never transcribe the app's own
                // "Listen" audio of the target sentence and self-award the star
                try { speechSynthesis.cancel(); } catch (e) {}
                const msg = host.querySelector('[data-msg]');
                try { rec && rec.stop(); } catch (e) {}
                rec = new SR(); rec.lang = 'ja-JP'; rec.maxAlternatives = 3;
                this.textContent = '👂 Listening...'; msg.textContent = '';
                rec.onresult = ev => {
                    if (graded) return; // a late result must not grade the round twice
                    let best = 0;
                    for (const alt of ev.results[0]) {
                        const a = normalizeJa(alt.transcript), b = normalizeJa(s.jp);
                        const shorter = Math.min(a.length, b.length), longer = Math.max(a.length, b.length);
                        const sub = shorter > 0 && longer > 0 && shorter / longer >= 0.6 && (a.includes(b) || b.includes(a));
                        const sim = a === b ? 1 : sub ? 0.85 : (longer ? 1 - lev(a, b) / longer : 0);
                        if (sim > best) best = sim;
                    }
                    if (best >= 0.7) {
                        graded = true;
                        const said = host.querySelector('[data-said]'), mic = host.querySelector('[data-mic]');
                        if (said) said.disabled = true;
                        if (mic) mic.disabled = true;
                        try { rec && rec.stop(); } catch (e) {}
                        stars++; ctx.sfx.correct(); msg.textContent = 'すごい! Perfect!';
                        ctx.after(() => ctx.speak(pickN(['すごい', 'じょうず', 'パーフェクト'], 1)[0]), 400);
                        ctx.after(() => { i++; round(); }, 1400);
                    }
                    else {
                        ctx.sfx.wrong();
                        msg.textContent = pickN(['Close! Listen once more and try again 💪', 'Almost - one more try! 🌟', 'I heard you - say it a little slower 🐢'], 1)[0];
                        round0Btn();
                    }
                };
                rec.onerror = () => { msg.textContent = 'Mic hiccup - use "I said it!" instead.'; round0Btn(); };
                rec.onend = round0Btn;
                function round0Btn() { const b = host.querySelector('[data-mic]'); if (b) b.textContent = '🎤 Speak'; }
                rec.start();
            };
        }
        round();
    }

    // ---------- 11. shop ----------
    function yenJp(n) {
        // 10..9990 to kana reading (kid range)
        const D = ['', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう'];
        let s = '';
        const th = Math.floor(n / 1000), hu = Math.floor(n % 1000 / 100), te = Math.floor(n % 100 / 10), on = n % 10;
        if (th) s += th === 3 ? 'さんぜん' : th === 8 ? 'はっせん' : (th === 1 ? '' : D[th]) + 'せん';
        if (hu) s += hu === 3 ? 'さんびゃく' : hu === 6 ? 'ろっぴゃく' : hu === 8 ? 'はっぴゃく' : (hu === 1 ? '' : D[hu]) + 'ひゃく';
        if (te) s += (te === 1 ? '' : D[te]) + 'じゅう';
        if (on) s += D[on];
        return s + 'えん';
    }
    function shop(host, ctx) {
        const items = distinct(ctx.pool.filter(v => v.pos === 'noun'), 8, v => v.jp);
        if (items.length < 4) return quiz(host, ctx);
        const priced = items.map(v => ({ ...v, price: (Math.floor(Math.random() * 9) + 1) * (Math.random() < 0.5 ? 10 : 100) }));
        let i = 0, correct = 0, purse = 0;
        const N = 6;
        function round() {
            if (i >= N) return finish(host, ctx, correct, N, 'spent ¥' + purse);
            const want = pickN(priced, i % 3 === 2 ? 2 : 1);
            const total = want.reduce((a, b) => a + b.price, 0);
            const opts = new Set([total]);
            while (opts.size < 4) {
                const c = total + pickN([-100, 100, -10, 10, 50, -50, 200], 1)[0] * (Math.floor(Math.random() * 2) + 1);
                if (c > 0) opts.add(c);
            }
            const options = shuffleArr([...opts].filter(v => v > 0).slice(0, 4).map(v => ({ html: '¥' + v + '<br><small>' + escHtml(yenJp(v)) + '</small>', ok: v === total })));
            while (options.filter(o => o.ok).length === 0) options[0] = { html: '¥' + total + '<br><small>' + escHtml(yenJp(total)) + '</small>', ok: true };
            el(host, `
              ${bar(i, N)}
              <div class="act-bar-label" data-purse>👛 おさいふ: ¥${purse}</div>
              <div class="act-subtitle">🏪 いらっしゃいませ! Buy: </div>
              <div class="shop-items">${want.map(v =>
                `<div class="shop-item"><span class="opt-emoji">${v.emoji}</span> ${escHtml(v.jp)}<br><b>¥${v.price}</b></div>`).join('<span class="shop-plus">+</span>')}</div>
              <div class="act-prompt">ぜんぶで いくら ですか?</div>
              <button class="act-speaker" data-spk>🔊 Listen</button>
              <div class="act-options shop-opts">${options.map((o, j) => `<button class="act-opt" data-j="${j}">${o.html}</button>`).join('')}</div>`);
            host.querySelector('[data-spk]').onclick = () => ctx.speak('ぜんぶで いくらですか');
            if (i === 0) ctx.speak('いらっしゃいませ');
            let missed = false; // stars reflect first-try accuracy, like every other game
            host.querySelectorAll('.act-opt').forEach(btn => btn.onclick = () => {
                const ok = options[+btn.dataset.j].ok;
                btn.classList.add(ok ? 'right' : 'wrong');
                if (ok) {
                    if (!missed) correct++;
                    purse += total; ctx.sfx.coin(); ctx.speak(yenJp(total) + 'です。ありがとうございます!');
                    host.querySelector('[data-purse]').textContent = '👛 おさいふ: ¥' + purse;
                    host.querySelectorAll('.act-opt').forEach(b => b.disabled = true);
                    // long enough for the whole price reading before the next round cancels it
                    ctx.after(() => { i++; round(); }, 2800);
                } else { missed = true; ctx.sfx.wrong(); btn.disabled = true; }
            });
        }
        round();
    }

    // ---------- 12. counters ----------
    const COUNTERS = {
        'つ': ['ひとつ', 'ふたつ', 'みっつ', 'よっつ', 'いつつ', 'むっつ', 'ななつ', 'やっつ', 'ここのつ', 'とお'],
        'ひき': ['いっぴき', 'にひき', 'さんびき', 'よんひき', 'ごひき', 'ろっぴき', 'ななひき', 'はっぴき', 'きゅうひき', 'じゅっぴき'],
        'まい': ['いちまい', 'にまい', 'さんまい', 'よんまい', 'ごまい', 'ろくまい', 'ななまい', 'はちまい', 'きゅうまい', 'じゅうまい'],
        'ほん': ['いっぽん', 'にほん', 'さんぼん', 'よんほん', 'ごほん', 'ろっぽん', 'ななほん', 'はっぽん', 'きゅうほん', 'じゅっぽん'],
        'にん': ['ひとり', 'ふたり', 'さんにん', 'よにん', 'ごにん', 'ろくにん', 'ななにん', 'はちにん', 'きゅうにん', 'じゅうにん'],
        'さつ': ['いっさつ', 'にさつ', 'さんさつ', 'よんさつ', 'ごさつ', 'ろくさつ', 'ななさつ', 'はっさつ', 'きゅうさつ', 'じゅっさつ'],
        'こ': ['いっこ', 'にこ', 'さんこ', 'よんこ', 'ごこ', 'ろっこ', 'ななこ', 'はっこ', 'きゅうこ', 'じゅっこ'],
        'だい': ['いちだい', 'にだい', 'さんだい', 'よんだい', 'ごだい', 'ろくだい', 'ななだい', 'はちだい', 'きゅうだい', 'じゅうだい'],
        'はい': ['いっぱい', 'にはい', 'さんばい', 'よんはい', 'ごはい', 'ろっぱい', 'ななはい', 'はっぱい', 'きゅうはい', 'じゅっぱい'],
    };
    const COUNTER_Q = { 'つ': 'いくつ', 'ひき': 'なんびき', 'まい': 'なんまい', 'ほん': 'なんぼん', 'にん': 'なんにん', 'さつ': 'なんさつ', 'こ': 'なんこ', 'だい': 'なんだい', 'はい': 'なんばい' };
    // Which nouns each counter can grammatically count (matched on en/emoji),
    // plus a safe familiar default so a question never pairs noun and counter wrong.
    const COUNTER_NOUNS = {
        'ひき': { re: /dog|cat|rabbit|fish|frog|hamster|mouse|snake|bug|insect|animal|fox|turtle|puppy|kitten/i, emo: '🐶🐱🐰🐟🐠🐸🐹🐭🐍🦊🐢🐛🦋🐞🐇', def: { jp: 'いぬ', emoji: '🐶' } },
        'さつ': { re: /book|notebook|magazine|dictionary|textbook|diary|comic/i, emo: '📕📖📚📓📔📗📘📙', def: { jp: 'ほん', emoji: '📕' } },
        'だい': { re: /car|bus|train|truck|bicycle|bike|tv|television|computer|phone|piano|machine|fan|robot/i, emo: '🚗🚌🚃🚚🚲📺💻📱🎹🤖', def: { jp: 'くるま', emoji: '🚗' } },
        'にん': { re: /friend|teacher|person|people|family|brother|sister|student|kid|child|mom|mother|dad|father|baby/i, emo: '🧒👧👦🧑👩👨👶🧓👴👵', def: { jp: 'ともだち', emoji: '🧒' } },
        'まい': { re: /paper|card|ticket|plate|photo|picture|shirt|towel|stamp|sticker|leaf|blanket|origami/i, emo: '📄🎫🍽️📷👕🍂🧧', def: { jp: 'かみ', emoji: '📄' } },
        'ほん': { re: /pencil|pen|umbrella|bottle|banana|carrot|flower|tree|stick/i, emo: '✏️🖊️☂️🌂🍌🥕🌷🌳', def: { jp: 'えんぴつ', emoji: '✏️' } },
        'はい': { re: /tea|juice|milk|water|coffee|cola|soup|drink|cocoa/i, emo: '🍵🧃🥛☕🥤🍜💧', def: { jp: 'おちゃ', emoji: '🍵' } },
        'こ': { re: /apple|ball|candy|egg|orange|onigiri|tomato|cookie|cake|strawberry|peach|melon|box|ball/i, emo: '🍎⚽🍬🥚🍊🍙🍅🍪🍰🍓🍑🍈📦', def: { jp: 'りんご', emoji: '🍎' } },
        'つ': { re: /./, emo: '', def: { jp: 'りんご', emoji: '🍎' } },
    };
    // つ counts THINGS, never animals or people (those take ひき/にん) - so the
    // generic fallback can never produce 「こどもは いくつ？」-style Japanese
    function animateNoun(v) {
        return COUNTER_NOUNS['ひき'].re.test(v.en) || COUNTER_NOUNS['にん'].re.test(v.en) ||
            (v.emoji && (COUNTER_NOUNS['ひき'].emo.includes(v.emoji) || COUNTER_NOUNS['にん'].emo.includes(v.emoji)));
    }
    function counters(host, ctx) {
        // pull counters from the pool (this week + reviewed weeks) so review weeks keep their counters
        const taught = ctx.pool.filter(v => v.pos === 'counter').map(v => v.jp);
        // undo rendaku/gemination on the last mora so voiced forms still match their key
        const norm = t => t.replace(/[ぱば]い$/, 'はい').replace(/[ぴび]き$/, 'ひき').replace(/[ぽぼ]ん$/, 'ほん');
        // がつ (calendar months) and 〜さつ must not switch on the generic つ counter
        const keys = Object.keys(COUNTERS).filter(k => taught.some(t => {
            const nt = norm(t);
            if (k === 'つ' && /(がつ|さつ)$/.test(nt)) return false;
            return nt.endsWith(k);
        }));
        const useKeys = keys.length ? keys : ['つ'];
        const nouns = distinct(ctx.pool.filter(v => v.pos === 'noun' && v.emoji), 8, v => v.jp);
        let i = 0, correct = 0;
        const N = 8;
        function round() {
            if (i >= N) return finish(host, ctx, correct, N);
            const k = useKeys[i % useKeys.length];
            const n = Math.floor(Math.random() * (k === 'にん' ? 6 : 10)) + 1;
            // only count nouns this counter can grammatically count
            const cn = COUNTER_NOUNS[k];
            const fit = nouns.filter(v => (cn.re.test(v.en) || (v.emoji && cn.emo.includes(v.emoji)))
                && !(k === 'つ' && animateNoun(v)));
            const noun = fit.length ? fit[i % fit.length] : cn.def;
            const answer = COUNTERS[k][n - 1];
            const distract = pickN(COUNTERS[k].filter(x => x !== answer), 3);
            const options = shuffleArr([{ html: escHtml(answer), ok: true }, ...distract.map(d => ({ html: escHtml(d), ok: false }))]);
            el(host, `
              ${bar(i, N)}
              <div class="act-subtitle">🔢 How many? (counter: ${escHtml(k)})</div>
              <div class="count-field">${Array.from({ length: n }, () => `<span class="count-emoji">${noun.emoji}</span>`).join('')}</div>
              <div class="act-prompt">${escHtml(noun.jp)}は ${escHtml(COUNTER_Q[k] || 'いくつ')}?</div>
              <div class="act-options">${options.map((o, j) => `<button class="act-opt" data-j="${j}">${o.html}</button>`).join('')}</div>`);
            host.querySelectorAll('.count-emoji').forEach((s, k2) =>
                ctx.after(() => { s.classList.add('pop-in'); ctx.sfx.pop(); }, 150 * k2));
            let missed = false; // stars reflect first-try accuracy, like every other game
            host.querySelectorAll('.act-opt').forEach(btn => btn.onclick = () => {
                const ok = options[+btn.dataset.j].ok;
                btn.classList.add(ok ? 'right' : 'wrong');
                if (ok) {
                    if (!missed) correct++;
                    ctx.sfx.correct(); ctx.speak(answer);
                    host.querySelectorAll('.act-opt').forEach(b => b.disabled = true);
                    ctx.after(() => { i++; round(); }, 1000);
                } else { missed = true; ctx.sfx.wrong(); btn.disabled = true; }
            });
        }
        round();
    }

    // ---------- 13. story ----------
    function story(host, ctx) {
        const st = ctx.story;
        if (!st) return quiz(host, ctx);
        el(host, `
          <div class="story-title">📖 ${escHtml(st.title)}</div>
          <div class="story-lines">${st.lines.map((l, i) => `
            <div class="story-line" data-i="${i}">
              <button class="act-speaker act-speaker-sm" data-line="${i}">🔊</button>
              <div><div class="story-jp">${escHtml(l.jp)}</div>
              <div class="story-rom">${escHtml(l.romaji)}</div>
              <div class="story-en">${escHtml(l.en)}</div></div>
            </div>`).join('')}</div>
          <div class="act-row">
            <button class="act-btn" data-readall>▶ Read it to me</button>
            <button class="act-btn act-btn-primary" data-quiz>Answer the questions! ▸</button>
          </div>`);
        host.querySelectorAll('[data-line]').forEach(b => b.onclick = () => ctx.speak(st.lines[+b.dataset.line].jp));
        let reading = 0; // generation token: bumped to cancel a narration in flight
        host.querySelector('[data-readall]').onclick = () => {
            const gen = ++reading;
            let t = 0;
            st.lines.forEach((l, i) => {
                ctx.after(() => {
                    if (gen !== reading) return;
                    host.querySelectorAll('.story-line').forEach(x => x.classList.remove('playing'));
                    const row = host.querySelector(`.story-line[data-i="${i}"]`);
                    if (row) row.classList.add('playing');
                    ctx.speak(l.jp);
                }, t);
                t += l.jp.length * 160 + 900;
            });
            ctx.after(() => {
                if (gen !== reading) return;
                host.querySelectorAll('.story-line').forEach(x => x.classList.remove('playing'));
            }, t);
        };
        host.querySelector('[data-quiz]').onclick = () => {
            reading++;
            const rounds = st.questions.map(q => ({
                prompt: escHtml(q.q),
                options: shuffleArr(q.options.map((o, j) => ({ html: escHtml(o), ok: j === q.answer }))),
            }));
            mcRun(host, ctx, rounds);
        };
    }

    // ---------- 14. kanjimatch ----------
    function kanjimatch(host, ctx) {
        const ks = distinct(ctx.kanjiPool, 6, k => k.char);
        if (ks.length < 3) return quiz(host, ctx);
        let sel = null, matched = 0, wrong = 0;
        const left = shuffleArr(ks), right = shuffleArr(ks);
        el(host, `
          <div class="act-subtitle">Match each kanji to its reading + meaning!</div>
          <div class="km-cols">
            <div class="km-col">${left.map((k, i) => `<button class="km-card km-kanji" data-l="${i}">${escHtml(k.char)}</button>`).join('')}</div>
            <div class="km-col">${right.map((k, i) => `<button class="km-card" data-r="${i}"><b>${escHtml(k.read)}</b><br><small>${escHtml(k.mean)}</small></button>`).join('')}</div>
          </div>`);
        host.querySelectorAll('.km-kanji').forEach(b => b.onclick = () => {
            if (b.classList.contains('done')) return;
            host.querySelectorAll('.km-kanji').forEach(x => x.classList.remove('sel'));
            b.classList.add('sel'); sel = +b.dataset.l;
            ctx.speak(left[sel].read);
        });
        host.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
            if (sel === null || b.classList.contains('done')) return;
            if (right[+b.dataset.r].char === left[sel].char) {
                b.classList.add('done');
                host.querySelector(`[data-l="${sel}"]`).classList.add('done');
                ctx.sfx.correct(); matched++; sel = null;
                if (matched === ks.length) ctx.after(() => finish(host, ctx, Math.max(1, ks.length - wrong), ks.length), 500);
            } else { wrong++; ctx.sfx.wrong(); b.classList.add('shake'); ctx.after(() => b.classList.remove('shake'), 400); }
        });
    }

    // ---------- 15. diary ----------
    function diary(host, ctx) {
        const starters = ['きょうは ', 'わたしは ', 'すきな ものは ', 'あした ', 'たのしかった!', 'また あした!'];
        const wk = ctx.week;
        let saved = false;
        el(host, `
          <div class="act-subtitle">✏️ My Japanese Diary</div>
          <div class="scr-en">Write 1-3 little sentences in Japanese about: <b>${escHtml(wk.title)}</b> ${wk.emoji}<br>
          Use this week's words! Tap a starter to begin.</div>
          <div class="scr-chips">${starters.map((s, i) => `<button class="scr-chip" data-s="${i}">${escHtml(s.trim())}</button>`).join('')}
            ${(wk.vocab || []).slice(0, 6).map(v => `<button class="scr-chip diary-word" data-w="${escHtml(v.jp)}">${v.emoji} ${escHtml(v.jp)}</button>`).join('')}</div>
          <textarea class="diary-text" rows="4" placeholder="ここに かいてね!"></textarea>
          <div class="act-row">
            <button class="act-btn" data-hear>🔊 Read it to me</button>
            <button class="act-btn act-btn-primary" data-save>Save 💾</button>
          </div>
          <div class="trace-msg" data-msg></div>
          <div class="diary-list" data-list></div>`);
        const ta = host.querySelector('.diary-text');
        host.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { ta.value += starters[+b.dataset.s]; ta.focus(); });
        host.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { ta.value += b.dataset.w; ta.focus(); });
        host.querySelector('[data-hear]').onclick = () => ctx.speak(ta.value);
        function renderList() {
            let list = [];
            try { list = JSON.parse(localStorage.getItem('fiona-diary')) || []; } catch (e) {}
            host.querySelector('[data-list]').innerHTML = list.length
                ? `<div class="act-subtitle">My diary pages · ${list.length} sticker${list.length === 1 ? '' : 's'} collected!</div>` + list.slice(0, 8).map(d =>
                    `<div class="diary-entry"><b>${escHtml(d.stick || '📔')} Y${d.y} W${d.w}</b> · ${escHtml(d.date)}<br>${escHtml(d.text)}</div>`).join('')
                : '';
        }
        renderList();
        host.querySelector('[data-save]').onclick = () => {
            const text = ta.value.trim();
            const msg = host.querySelector('[data-msg]');
            if (text.length < 4) { msg.textContent = 'Write a little more first! 💪'; return; }
            let list = [];
            try { list = JSON.parse(localStorage.getItem('fiona-diary')) || []; } catch (e) {}
            const dup = list[0] && list[0].text === text && list[0].y === ctx.year && list[0].w === ctx.w;
            if (dup) {
                list[0].date = new Date().toLocaleDateString();
                ctx.sfx.pop();
                msg.textContent = 'Already saved this page! ✔';
            } else {
                const stick = pickN(['🌸', '🐰', '⭐', '🍓', '🦊', '🌈', '🎀', '🐣'], 1)[0];
                list.unshift({ y: ctx.year, w: ctx.w, date: new Date().toLocaleDateString(), text, stick });
                ctx.sfx.win();
                msg.textContent = 'Saved! You earned a ' + stick + ' sticker! 🌱';
            }
            try { localStorage.setItem('fiona-diary', JSON.stringify(list.slice(0, 200))); } catch (e) {}
            renderList();
            if (!saved) { saved = true; ctx.onComplete(3, 1, 1); }
        };
    }

    // ---------- 16. karuta ----------
    function karuta(host, ctx) {
        if (!ctx.pool.length) return quiz(host, ctx);
        const N = 8;
        let i = 0, correct = 0;
        const usedT = new Set();
        function round() {
            if (i >= N) return finish(host, ctx, correct, N);
            // unique meaning too - twin-meaning words would show identical faces
            const cards = distinct(distinct(ctx.pool, ctx.pool.length, v => v.jp), 6, v => (v.en || '').toLowerCase());
            const fresh = cards.filter(c => !usedT.has(c.jp));
            const pickFrom = fresh.length ? fresh : cards;
            const target = pickFrom[Math.floor(Math.random() * pickFrom.length)];
            usedT.add(target.jp);
            const meaningFace = i % 2 === 0; // even rounds: sound -> meaning, odd: sound -> reading
            let missed = false, spokeAt = 0, grabbed = false;
            el(host, `
              ${bar(i, N)}
              <div class="act-subtitle">🎴 Listen... then grab the right card!</div>
              <button class="act-speaker" data-spk>🔊 Hear it again</button>
              <div class="karuta-grid">${cards.map((c, j) => `<button class="karuta-card" data-j="${j}">${meaningFace
                ? `<span class="karuta-emoji">${c.emoji}</span><span class="karuta-en">${escHtml(c.en)}</span>`
                : `<span class="karuta-jp">${escHtml(c.jp)}</span>`}</button>`).join('')}</div>
              <div class="karuta-fast" data-fast></div>`);
            function say() { spokeAt = Date.now(); ctx.speak(target.jp); }
            host.querySelector('[data-spk]').onclick = say;
            ctx.after(say, 400);
            host.querySelectorAll('.karuta-card').forEach(btn => btn.onclick = () => {
                if (grabbed || btn.disabled) return;
                if (cards[+btn.dataset.j].jp === target.jp) {
                    grabbed = true;
                    if (!missed) correct++;
                    ctx.sfx.correct();
                    btn.classList.add('grabbed');
                    host.querySelectorAll('.karuta-card').forEach(b => b.disabled = true);
                    if (spokeAt && Date.now() - spokeAt < 2500) {
                        // lightning grab: pure juice, no extra points
                        ctx.sfx.star();
                        host.querySelector('[data-fast]').innerHTML = '<span class="karuta-zap">はやい! ⚡</span>';
                    }
                    ctx.after(() => { i++; round(); }, 1000);
                } else {
                    missed = true; ctx.sfx.wrong();
                    btn.classList.add('shake');
                    ctx.after(() => btn.classList.remove('shake'), 400);
                    btn.disabled = true;
                }
            });
        }
        round();
    }

    // ---------- 17. shiritori ----------
    const SHI_SMALL = { 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お', 'っ': 'つ' };
    const SHI_DAKU = { 'が': 'か', 'ぎ': 'き', 'ぐ': 'く', 'げ': 'け', 'ご': 'こ', 'ざ': 'さ', 'じ': 'し', 'ず': 'す', 'ぜ': 'せ', 'ぞ': 'そ',
        'だ': 'た', 'ぢ': 'ち', 'づ': 'つ', 'で': 'て', 'ど': 'と', 'ば': 'は', 'び': 'ひ', 'ぶ': 'ふ', 'べ': 'へ', 'ぼ': 'ほ',
        'ぱ': 'は', 'ぴ': 'ひ', 'ぷ': 'ふ', 'ぺ': 'へ', 'ぽ': 'ほ' };
    function shiHira(c) { return /[ァ-ヶ]/.test(c) ? String.fromCharCode(c.charCodeAt(0) - 0x60) : c; }
    function shiLast(jp) {
        const s = [...String(jp).trim()];
        let k = s[s.length - 1];
        if (k === 'ー' && s.length > 1) k = s[s.length - 2];
        k = shiHira(k);
        return SHI_SMALL[k] || k;
    }
    function shiFirst(jp) { return shiHira([...String(jp).trim()][0]); }
    function shiBase(k) { return SHI_DAKU[k] || k; }
    function shiritori(host, ctx) {
        // needs at least one chainable pair, or the train can never leave the station
        const chainable = ctx.pool.some(x => shiLast(x.jp) !== 'ん' &&
            ctx.pool.some(y => y.jp !== x.jp && shiLast(y.jp) !== 'ん' && shiBase(shiFirst(y.jp)) === shiBase(shiLast(x.jp))));
        if (!chainable) return quiz(host, ctx);
        const N = 10;
        let i = 0, correct = 0, stationRun = 0;
        const used = new Set();
        const train = [];
        function freshStart() {
            let cand = ctx.pool.filter(v => !used.has(v.jp) && shiLast(v.jp) !== 'ん');
            if (!cand.length) { used.clear(); cand = ctx.pool.filter(v => shiLast(v.jp) !== 'ん'); }
            if (!cand.length) cand = ctx.pool;
            return cand[Math.floor(Math.random() * cand.length)];
        }
        function trainHtml() {
            const last = train.length - 1;
            return `<div class="train">${train.map((t, k) => t.station
                ? '<span class="train-station">🚉</span>'
                : `<span class="train-car${k === last ? ' newest' : ''}">${t.emoji ? t.emoji + ' ' : ''}${escHtml(t.jp)}</span>`).join('')}<span class="train-engine">🚂</span></div>`;
        }
        function promptHtml(jp) {
            // bold the kana that carries the link (skips a trailing ー)
            const s = [...String(jp).trim()];
            let idx = s.length - 1;
            if (s[idx] === 'ー' && idx > 0) idx--;
            return s.map((c, k) => k === idx ? `<b>${escHtml(c)}</b>` : escHtml(c)).join('');
        }
        function scrollTrain() {
            const tr = host.querySelector('.train');
            if (tr) tr.scrollLeft = tr.scrollWidth;
        }
        function round() {
            if (i >= N) return finish(host, ctx, correct, N);
            const cur = [...train].reverse().find(t => !t.station);
            const link = shiLast(cur.jp);
            const succ = ctx.pool.filter(v => !used.has(v.jp) && shiLast(v.jp) !== 'ん' && shiBase(shiFirst(v.jp)) === shiBase(link));
            if (!succ.length) {
                // no unused successor left: friendly station stop, fresh chain, no penalty.
                // 3 stations in a row means the pool is out of chains - end the ride kindly
                if (++stationRun >= 3) return finish(host, ctx, correct, Math.max(1, i), 'Last stop! 🚉');
                const nw = freshStart();
                el(host, `
                  ${bar(i, N)}
                  ${trainHtml()}
                  <div class="train-station-big">🚉</div>
                  <div class="act-subtitle">New station! The train picks up a fresh word - no worries!</div>
                  <div class="act-row"><button class="act-btn act-btn-primary" data-go>All aboard! 🚃</button></div>`);
                scrollTrain();
                host.querySelector('[data-go]').onclick = () => {
                    used.add(nw.jp); train.push({ station: true }); train.push(nw);
                    ctx.sfx.pop(); ctx.speak(nw.jp);
                    round();
                };
                return;
            }
            stationRun = 0;
            const answer = succ[Math.floor(Math.random() * succ.length)];
            const wrongs = pickN(ctx.pool.filter(v => v.jp !== answer.jp && v.jp !== cur.jp && shiBase(shiFirst(v.jp)) !== shiBase(link)), 3);
            const options = shuffleArr([{ w: answer, ok: true }, ...wrongs.map(w => ({ w, ok: false }))]);
            let missed = false;
            el(host, `
              ${bar(i, N)}
              <div class="act-subtitle">🚃 Join the last kana to the next word! (か→が is OK!)</div>
              ${trainHtml()}
              <div class="act-prompt">${promptHtml(cur.jp)} → <b>${escHtml(link)}</b>...?</div>
              <button class="act-speaker" data-spk>🔊 Listen</button>
              <div class="act-options">${options.map((o, j) =>
                `<button class="act-opt" data-j="${j}"><span class="opt-emoji">${o.w.emoji}</span> <span class="q-jp-opt">${escHtml(o.w.jp)}</span></button>`).join('')}</div>`);
            scrollTrain();
            host.querySelector('[data-spk]').onclick = () => ctx.speak(cur.jp);
            host.querySelectorAll('.act-opt').forEach(btn => btn.onclick = () => {
                if (btn.classList.contains('picked')) return;
                if (options[+btn.dataset.j].ok) {
                    btn.classList.add('picked', 'right');
                    if (!missed) correct++;
                    ctx.sfx.correct(); ctx.speak(answer.jp);
                    used.add(answer.jp); train.push(answer);
                    host.querySelectorAll('.act-opt').forEach(b => b.disabled = true);
                    ctx.after(() => { i++; round(); }, 1100);
                } else {
                    missed = true; btn.classList.add('picked', 'wrong');
                    ctx.sfx.wrong(); btn.disabled = true;
                }
            });
        }
        const start = freshStart();
        used.add(start.jp); train.push(start);
        ctx.after(() => ctx.speak(start.jp), 400);
        round();
    }

    // ---------- 18. oddone ----------
    function oddPairs(groups) {
        // every (A, B) where A has 3+ words and B has a word that is not also in A
        const pairs = [];
        groups.forEach(A => {
            if (A.words.length < 3) return;
            const aJp = new Set(A.words.map(w => w.jp));
            groups.forEach(B => {
                if (B !== A && B.words.some(w => !aJp.has(w.jp))) pairs.push([A, B]);
            });
        });
        return pairs;
    }
    function oddGroups(ctx) {
        if (ctx.categories && ctx.categories.length >= 2) {
            const cats = ctx.categories.map(c => ({
                name: c.name, icon: c.icon || '',
                words: distinct((c.words || []).filter(w => w && w.jp), (c.words || []).length, v => v.jp),
            })).filter(g => g.words.length);
            if (oddPairs(cats).length) return cats;
        }
        // fall back to part-of-speech teams (both adjective kinds count as one team)
        const byG = {};
        ctx.pool.forEach(v => {
            const g = (v.pos === 'i-adj' || v.pos === 'na-adj') ? 'adj' : (v.pos || 'word');
            (byG[g] = byG[g] || []).push(v);
        });
        return Object.keys(byG).map(g => ({
            name: g === 'adj' ? 'Describing words 🎨' : (POS_LABEL[g] || g), icon: '', words: byG[g],
        }));
    }
    function oddone(host, ctx) {
        const pairs = oddPairs(oddGroups(ctx));
        if (!pairs.length) return quiz(host, ctx);
        const N = 8;
        let i = 0, correct = 0;
        function round() {
            if (i >= N) return finish(host, ctx, correct, N);
            // pick a pair whose "same team" trio has no cross-membership with the
            // odd word's team (a word in BOTH baskets would make two right answers)
            let three = null, odd = null, A = null, B = null;
            for (const [pa, pb] of shuffleArr(pairs)) {
                const aJp = new Set(pa.words.map(w => w.jp));
                const bJp = new Set(pb.words.map(w => w.jp));
                const trio = distinct(pa.words.filter(w => !bJp.has(w.jp)), 3, v => v.jp);
                const o = pickN(pb.words.filter(w => !aJp.has(w.jp)), 1)[0];
                if (trio.length === 3 && o) { A = pa; B = pb; three = trio; odd = o; break; }
            }
            if (!odd) return quiz(host, ctx);
            const cards = shuffleArr(three.concat([odd]));
            let missed = false;
            el(host, `
              ${bar(i, N)}
              <div class="act-subtitle">🕵️ Which one is not like the others?</div>
              <button class="act-speaker" data-spk>🔊 Listen</button>
              <div class="act-options">${cards.map((c, j) =>
                `<button class="act-opt" data-j="${j}"><span class="opt-emoji">${c.emoji}</span> <span class="q-jp-opt">${escHtml(c.jp)}</span></button>`).join('')}</div>
              <div class="trace-msg" data-reveal></div>`);
            const ask = () => ctx.speak('なかまはずれは どれ?');
            host.querySelector('[data-spk]').onclick = ask;
            ctx.after(ask, 350);
            host.querySelectorAll('.act-opt').forEach(btn => btn.onclick = () => {
                if (btn.classList.contains('picked')) return;
                if (cards[+btn.dataset.j].jp === odd.jp) {
                    btn.classList.add('picked', 'right');
                    if (!missed) correct++;
                    ctx.sfx.correct(); ctx.speak(odd.jp);
                    host.querySelectorAll('.act-opt').forEach(b => b.disabled = true);
                    host.querySelector('[data-reveal]').innerHTML =
                        `${A.icon ? escHtml(A.icon) + ' ' : ''}${escHtml(A.name)} — but <b>${escHtml(odd.jp)}</b> is ${B.icon ? escHtml(B.icon) + ' ' : ''}${escHtml(B.name)}!`;
                    ctx.after(() => { i++; round(); }, 2100);
                } else {
                    missed = true; btn.classList.add('picked', 'wrong');
                    ctx.sfx.wrong(); btn.disabled = true;
                }
            });
        }
        round();
    }

    // ---------- 19. kanabuild ----------
    function kbDecoys(jp, n) {
        const inWord = new Set([...jp]);
        let bank = [...'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわん'];
        if (/[ァ-ヶ]/.test(jp)) bank = bank.map(c => String.fromCharCode(c.charCodeAt(0) + 0x60));
        return pickN(bank.filter(c => !inWord.has(c)), n);
    }
    function kanabuild(host, ctx) {
        const pure = ctx.pool.filter(v => /^[ぁ-ゖァ-ヶー]{2,6}$/.test(v.jp));
        if (!pure.length) return quiz(host, ctx);
        let words = distinct(pure.filter(v => v.jp.length >= 3 && v.jp.length <= 5), 8, v => v.jp);
        if (words.length < 8) words = words.concat(distinct(pure.filter(v => !words.some(w => w.jp === v.jp)), 8 - words.length, v => v.jp));
        while (words.length < 8) words = words.concat(words.slice(0, 8 - words.length));
        const N = words.length;
        let i = 0, correct = 0;
        function round() {
            if (i >= N) return finish(host, ctx, correct, N);
            const w = words[i];
            const target = [...w.jp];
            const tiles = shuffleArr(target.concat(kbDecoys(w.jp, 2))).map(ch => ({ ch, used: false }));
            const placed = [];
            let missed = false, built = false;
            function render() {
                el(host, `
                  ${bar(i, N)}
                  <div class="act-subtitle">🧱 Build the word you hear!</div>
                  <div class="kb-word"><span class="opt-emoji">${w.emoji}</span> <b>${escHtml(w.en)}</b>
                    <button class="act-speaker act-speaker-sm" data-spk>🔊</button></div>
                  <div class="kb-slots">${target.map((c, k) =>
                    `<span class="kb-slot${k < placed.length ? ' filled' : ''}">${k < placed.length ? escHtml(placed[k].ch) : ''}</span>`).join('')}</div>
                  <div class="kb-tiles">${tiles.map((t, k) =>
                    `<button class="kb-tile${t.used ? ' used' : ''}" data-k="${k}">${escHtml(t.ch)}</button>`).join('')}</div>
                  <div class="act-row"><button class="act-btn" data-undo>⌫ Undo</button></div>`);
                host.querySelector('[data-spk]').onclick = () => ctx.speak(w.jp);
                host.querySelector('[data-undo]').onclick = () => {
                    if (built || !placed.length) return;
                    placed.pop().used = false;
                    ctx.sfx.pop(); render();
                };
                host.querySelectorAll('.kb-tile').forEach(btn => btn.onclick = () => {
                    if (built) return;
                    const t = tiles[+btn.dataset.k];
                    if (t.used) return;
                    if (t.ch !== target[placed.length]) {
                        // not the next kana: shake it, but leave it available to use later
                        missed = true; ctx.sfx.wrong();
                        btn.classList.add('shake');
                        ctx.after(() => btn.classList.remove('shake'), 400);
                        return;
                    }
                    t.used = true; placed.push(t); ctx.sfx.pop();
                    render();
                    if (placed.length < target.length) return;
                    if (placed.map(p => p.ch).join('') === w.jp) {
                        built = true;
                        if (!missed) correct++;
                        ctx.sfx.correct(); ctx.speak(w.jp);
                        host.querySelector('.kb-slots').classList.add('kb-done');
                        ctx.after(() => { i++; round(); }, 1400);
                    } else {
                        // safety net: gently send any out-of-place tiles back
                        missed = true; ctx.sfx.wrong();
                        ctx.after(() => {
                            for (let k = placed.length - 1; k >= 0; k--)
                                if (placed[k].ch !== target[k]) { placed[k].used = false; placed.splice(k, 1); }
                            render();
                        }, 650);
                    }
                });
            }
            render();
            ctx.after(() => ctx.speak(w.jp), 400);
        }
        round();
    }

    // ---------- 20. bossquiz ----------
    const BOSSES = [
        { emoji: '🐉', name: 'ドラゴンさま' },
        { emoji: '👹', name: 'おにさま' },
        { emoji: '🦖', name: 'きょうりゅうさま' },
        { emoji: '👾', name: 'エイリアンさま' },
        { emoji: '🐙', name: 'タコさま' },
    ];
    function bossquiz(host, ctx) {
        const boss = BOSSES[Math.floor(Math.random() * BOSSES.length)];
        const words = distinct(ctx.pool, 14, v => v.jp); // safety cap 14 rounds, no word repeats
        if (!words.length) return quiz(host, ctx);
        const HP = Math.min(8, words.length); // a perfect run must always be able to win
        let hp = HP, shields = 3, qi = 0, hits = 0, rounds = 0, over = false;
        const hpHtml = () => Array.from({ length: HP }, (_, k) => `<span class="boss-heart${k < hp ? '' : ' lost'}">❤️</span>`).join('');
        const shieldRow = () => '<small>Fiona</small> ' + Array.from({ length: 3 }, (_, k) => `<span class="boss-shield${k < shields ? '' : ' lost'}">🛡️</span>`).join('');
        function victory() {
            el(host, `<div class="boss-end"><div class="boss-face boss-spin">${boss.emoji}</div>
              <div class="boss-endmsg">やった! You beat ${escHtml(boss.name)}! ⚔️🎉</div></div>`);
            ctx.sfx.star();
            ctx.after(() => finish(host, ctx, hits, rounds, 'Boss defeated! ⚔️'), 1700);
        }
        function flee() {
            over = true;
            el(host, `<div class="boss-end"><div class="boss-face boss-fly">${boss.emoji}</div>
              <div class="boss-endmsg">にげた! It fled - you still win points!</div></div>`);
            ctx.after(() => finish(host, ctx, hits, rounds), 1700);
        }
        function round() {
            if (over) return;
            if (qi >= words.length || rounds >= 14) return flee();
            const w = words[qi]; qi++; rounds++;
            const jp2en = rounds % 2 === 1;
            const others = pickN(ctx.pool.filter(v => v.en !== w.en && v.jp !== w.jp), 3);
            const options = jp2en
                ? shuffleArr([{ html: escHtml(w.en), ok: true }, ...others.map(o => ({ html: escHtml(o.en), ok: false }))])
                : shuffleArr([{ html: `<span class="q-jp-opt">${escHtml(w.jp)}</span>`, ok: true },
                    ...others.map(o => ({ html: `<span class="q-jp-opt">${escHtml(o.jp)}</span>`, ok: false }))]);
            let missed = false;
            el(host, `
              <div class="boss-arena">
                <div class="boss-face" data-boss>${boss.emoji}</div>
                <div class="boss-name">${escHtml(boss.name)}</div>
                <div class="boss-hp" data-hp>${hpHtml()}</div>
                <div class="boss-shields" data-sh>${shieldRow()}</div>
              </div>
              <div class="act-prompt">${jp2en
                ? `<span class="q-jp">${escHtml(w.jp)}</span><span class="q-rom">${escHtml(w.romaji || '')}</span>`
                : `<span class="opt-emoji">${w.emoji}</span> <b>${escHtml(w.en)}</b>`}</div>
              <div class="act-options">${options.map((o, j) => `<button class="act-opt" data-j="${j}">${o.html}</button>`).join('')}</div>
              <div class="act-bar-label">Question ${rounds} · take down the boss! ⚔️</div>`);
            if (jp2en) ctx.after(() => ctx.speak(w.jp), 350);
            host.querySelectorAll('.act-opt').forEach(btn => btn.onclick = () => {
                if (over || btn.classList.contains('picked')) return;
                if (options[+btn.dataset.j].ok) {
                    btn.classList.add('picked', 'right');
                    if (!missed) hits++;
                    hp--;
                    ctx.sfx.correct();
                    if ((HP - hp) % 3 === 0) ctx.sfx.star();
                    if (!jp2en) ctx.speak(w.jp);
                    host.querySelectorAll('.act-opt').forEach(b => b.disabled = true);
                    const atk = document.createElement('span');
                    atk.className = 'boss-attack'; atk.textContent = '⚔️✨';
                    host.querySelector('.boss-arena').appendChild(atk);
                    ctx.after(() => {
                        atk.remove();
                        const bEl = host.querySelector('[data-boss]');
                        if (bEl) bEl.classList.add('boss-hit');
                        const hpEl = host.querySelector('[data-hp]');
                        if (hpEl) hpEl.innerHTML = hpHtml();
                    }, 450);
                    if (hp <= 0) { over = true; ctx.after(victory, 1300); }
                    else ctx.after(round, 1500);
                } else {
                    // boss strikes back: costs a shield, but she keeps hunting the answer
                    missed = true; shields--;
                    btn.classList.add('picked', 'wrong');
                    ctx.sfx.wrong(); btn.disabled = true;
                    const bEl = host.querySelector('[data-boss]');
                    if (bEl) { bEl.classList.add('boss-wobble'); ctx.after(() => bEl.classList.remove('boss-wobble'), 750); }
                    const sh = host.querySelector('[data-sh]');
                    if (sh) sh.innerHTML = shieldRow();
                    if (shields <= 0) {
                        host.querySelectorAll('.act-opt').forEach(b => b.disabled = true);
                        over = true;
                        ctx.after(flee, 900);
                    }
                }
            });
        }
        round();
    }

    // ---------- registry ----------
    const defs = {
        memory:     { name: 'Memory Match', jp: 'しんけいすいじゃく', icon: '🃏', make: memory },
        listen:     { name: 'Listening Ears', jp: 'きいてみよう', icon: '👂', make: listen },
        quiz:       { name: 'Quiz Time', jp: 'クイズ', icon: '❓', make: quiz },
        scramble:   { name: 'Sentence Scramble', jp: 'ぶんをつくろう', icon: '🧩', make: scramble },
        trace:      { name: 'Writing Time', jp: 'かいてみよう', icon: '✍️', make: trace },
        sort:       { name: 'Word Sort', jp: 'なかまわけ', icon: '🗂️', make: sort },
        blank:      { name: 'Fill the Blank', jp: 'あなうめ', icon: '✏️', make: blank },
        bingo:      { name: 'Listening Bingo', jp: 'ビンゴ', icon: '🎱', make: bingo },
        whack:      { name: 'Whack-a-Word', jp: 'もぐらたたき', icon: '🔨', make: whack },
        speak:      { name: 'Say It Out Loud', jp: 'はなしてみよう', icon: '🎤', make: speakAct },
        shop:       { name: 'Shopping Trip', jp: 'おかいもの', icon: '🏪', make: shop },
        counters:   { name: 'Counting Game', jp: 'かぞえてみよう', icon: '🔢', make: counters },
        story:      { name: 'Story Time', jp: 'おはなし', icon: '📖', make: story },
        kanjimatch: { name: 'Kanji Match', jp: 'かんじマッチ', icon: '🀄', make: kanjimatch },
        diary:      { name: 'My Diary', jp: 'にっき', icon: '📔', make: diary },
        karuta:     { name: 'Karuta Grab', jp: 'かるた', icon: '🎴', make: karuta },
        shiritori:  { name: 'Shiritori Train', jp: 'しりとり', icon: '🚃', make: shiritori },
        oddone:     { name: 'Odd One Out', jp: 'なかまはずれ', icon: '🕵️', make: oddone },
        kanabuild:  { name: 'Kana Builder', jp: 'もじつみき', icon: '🧱', make: kanabuild },
        bossquiz:   { name: 'Quiz Battle', jp: 'クイズバトル', icon: '🐉', make: bossquiz },
    };

    // Build a run-context for (year, w) and start activity `key` in `host`.
    function start(key, host, year, w, onComplete, onClose) {
        const def = defs[key] || defs.quiz;
        const week = Journey.getWeek(year, w) || { vocab: [], activities: [] };
        // pool = week vocab + review weeks' vocab, walk back if thin
        let pool = (week.vocab || []).slice();
        (week.review || []).forEach(rw => {
            const r = Journey.getWeek(year, rw);
            if (r && r.vocab) pool = pool.concat(r.vocab);
        });
        let back = w - 1;
        while (pool.length < 8 && back >= 1) {
            const r = Journey.getWeek(year, back--);
            if (r && r.vocab) pool = pool.concat(r.vocab);
        }
        if (pool.length < 8 && year > 1) {
            let py = year - 1, pw = 52;
            while (pool.length < 8 && pw >= 40) {
                const r = Journey.getWeek(py, pw--);
                if (r && r.vocab) pool = pool.concat(r.vocab);
            }
        }
        const seen = new Set();
        pool = pool.filter(v => v && v.jp && !seen.has(v.jp) && seen.add(v.jp));
        // examples = grammar examples + phrases + story lines (this week + review weeks)
        let examples = [];
        function addWeekSentences(wk) {
            if (!wk) return;
            if (wk.grammar && wk.grammar.examples) examples = examples.concat(wk.grammar.examples);
            if (wk.phrases) examples = examples.concat(wk.phrases);
        }
        addWeekSentences(week);
        (week.review || []).forEach(rw => addWeekSentences(Journey.getWeek(year, rw)));
        // kanji pool: this week + all earlier kanji this year
        let kanjiPool = (week.kanji || []).slice();
        for (let b = w - 1; b >= 1 && kanjiPool.length < 8; b--) {
            const r = Journey.getWeek(year, b);
            if (r && r.kanji) kanjiPool = kanjiPool.concat(r.kanji);
        }
        return runWith(def, host, {
            year, w, week, pool, examples, kanjiPool, actKey: key,
            vocab: week.vocab || [], writing: week.writing, story: week.story,
        }, onComplete, onClose);
    }

    // Shared plumbing: teardown-aware context + lifecycle around an engine run.
    function runWith(def, host, base, onComplete, onClose) {
        const teardowns = [];
        let dead = false; // set on final teardown so late async callbacks can't schedule anything
        const ctx = Object.assign(base, {
            speak: JpSpeech.speak, sfx: Sfx, practice: !onComplete,
            onComplete: (stars, c, t) => onComplete && onComplete(stars, c, t),
            _close: () => onClose && onClose(),
            _restart: () => { teardowns.forEach(f => f()); teardowns.length = 0; def.make(host, ctx); },
            _onTeardown: f => teardowns.push(f),
            // teardown-aware timer: cancelled when the modal closes or the game restarts,
            // so a pending advance can't fire into a cleared/reused host
            after: (fn, ms) => { if (dead) return 0; const t = setTimeout(fn, ms); teardowns.push(() => clearTimeout(t)); return t; },
        });
        def.make(host, ctx);
        return { teardown: () => { dead = true; teardowns.forEach(f => f()); teardowns.length = 0; JpSpeech.stop(); } };
    }

    // Run an engine over a custom word pool (the Game Arcade page): no Journey
    // lookups or week stars - records come from data.prevBest + the onComplete hook.
    // data: { pool, examples, kanjiPool, writing, story, categories, prevBest }
    function startCustom(key, host, data, onComplete, onClose) {
        const def = defs[key] || defs.quiz;
        return runWith(def, host, {
            year: 0, w: 0, week: { vocab: data.pool || [], activities: [] },
            pool: data.pool || [], examples: data.examples || [], kanjiPool: data.kanjiPool || [],
            vocab: data.pool || [], writing: data.writing || null, story: data.story || null,
            categories: data.categories || null, prevBest: data.prevBest || null,
            actKey: key,
        }, onComplete, onClose);
    }

    return { defs, start, startCustom };
})();
