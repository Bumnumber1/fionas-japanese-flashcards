(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.WeeklyWorkbook = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const PARTICLES = new Set(['は', 'が', 'を', 'に', 'へ', 'で', 'と', 'も', 'の', 'か', 'ね', 'よ']);

    function assert(condition, message) {
        if (!condition) throw new Error(message);
    }

    function seededShuffle(items, seed) {
        const out = items.slice();
        let state = (seed >>> 0) || 1;
        for (let i = out.length - 1; i > 0; i--) {
            state = (state * 1664525 + 1013904223) >>> 0;
            const j = state % (i + 1);
            [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
    }

    function termOf(week) {
        return Math.min(4, Math.floor((week - 1) / 13) + 1);
    }

    function chooseCloze(examples, vocab) {
        if (!examples.length) return null;
        for (const ex of examples) {
            const candidates = vocab
                .filter(v => v.jp && ex.jp.includes(v.jp))
                .sort((a, b) => [...b.jp].length - [...a.jp].length);
            if (candidates.length) {
                const answer = candidates[0].jp;
                return {
                    prompt: ex.jp.replace(answer, '＿＿＿＿'),
                    answer,
                    romaji: ex.romaji,
                    en: ex.en,
                    source: ex.jp
                };
            }
        }
        const ex = examples[0];
        const tokens = ex.jp
            .replace(/[。、「」『』！？!?]/g, ' ')
            .split(/\s+/)
            .filter(t => t && !PARTICLES.has(t));
        const answer = tokens.sort((a, b) => [...b].length - [...a].length)[0];
        if (!answer) return null;
        return {
            prompt: ex.jp.replace(answer, '＿＿＿＿'),
            answer,
            romaji: ex.romaji,
            en: ex.en,
            source: ex.jp
        };
    }

    function buildMatch(vocab, year, week) {
        const rows = vocab.slice(0, Math.min(6, vocab.length)).map((v, i) => ({
            id: i + 1,
            jp: v.jp,
            romaji: v.romaji,
            en: v.en
        }));
        const meanings = seededShuffle(rows.map(r => r.en), year * 1000 + week * 31);
        const letters = 'ABCDEF'.split('');
        return {
            rows,
            meanings: meanings.map((en, i) => ({ letter: letters[i], en })),
            answers: rows.map(r => ({
                id: r.id,
                letter: letters[meanings.indexOf(r.en)],
                en: r.en
            }))
        };
    }

    function buildWeek(catalog, year, week) {
        const yr = catalog && catalog[year];
        assert(yr && Array.isArray(yr.weeks), 'Missing curriculum year ' + year);
        const wk = yr.weeks.find(item => item.w === week);
        assert(wk, 'Missing curriculum week Y' + year + ' W' + week);

        const vocab = (wk.vocab || []).map(v => ({ ...v }));
        const examples = ((wk.grammar && wk.grammar.examples) || []).map(ex => ({ ...ex }));
        const phrases = (wk.phrases || []).map(ph => ({ ...ph }));
        const kanji = (wk.kanji || []).map(k => ({ ...k }));
        const writing = (wk.writing && wk.writing.chars ? wk.writing.chars : []).slice();
        const story = wk.story ? JSON.parse(JSON.stringify(wk.story)) : null;
        const match = buildMatch(vocab, year, week);
        const cloze = chooseCloze(examples, vocab);
        const translation = examples.length ? { ...examples[Math.min(1, examples.length - 1)] } : null;

        return {
            id: 'y' + year + 'w' + week,
            year,
            week,
            term: termOf(week),
            yearTitle: yr.title,
            termTitle: yr.terms && yr.terms[termOf(week) - 1] ? { ...yr.terms[termOf(week) - 1] } : null,
            title: wk.title,
            jp: wk.jp,
            emoji: wk.emoji,
            kind: wk.kind,
            goal: wk.goal,
            learn: {
                vocab,
                grammar: wk.grammar ? {
                    title: wk.grammar.title,
                    explain: wk.grammar.explain
                } : null,
                examples,
                phrases,
                kanji,
                writingType: wk.writing ? wk.writing.type : '',
                writing
            },
            practice: {
                match,
                cloze,
                translation,
                writing,
                writingType: wk.writing ? wk.writing.type : '',
                kanji,
                story,
                culture: wk.culture || '',
                reviewWeeks: (wk.review || []).slice()
            },
            source: wk
        };
    }

    return { buildWeek, chooseCloze, seededShuffle, termOf };
});
