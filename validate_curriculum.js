// Validates curriculum_y1.js .. curriculum_y5.js (the 5-Year Journey data).
// Checks structure, duplicate vocab, romaji<->kana consistency, activity keys,
// review pointers, and story shapes. Run after any curriculum content change:
//   node validate_curriculum.js
const fs = require('fs');
const vm = require('vm');

const ACTIVITY_KEYS = ['memory', 'listen', 'quiz', 'scramble', 'trace', 'sort', 'blank',
    'bingo', 'whack', 'speak', 'shop', 'counters', 'story', 'kanjimatch', 'diary',
    'karuta', 'shiritori', 'oddone', 'kanabuild', 'bossquiz'];
const POS = ['noun', 'verb', 'i-adj', 'na-adj', 'adverb', 'phrase', 'counter', 'particle', 'expression'];
const KINDS = ['lesson', 'review', 'special'];

// Words already taught by the flashcards app before the journey begins.
const PRE_TAUGHT = new Set(('にちようび げつようび かようび すいようび もくようび きんようび どようび きょう あした きのう いま たんじょうび まいにち じ ' +
'たべもの のみもの ケーキ アイスクリーム クッキー プリン だんご パン りんご ごはん おにぎり さしみ いちご ブロッコリー おちゃ コーヒー ジュース コーラ ぎゅうにゅう ' +
'えんぴつ ペン みず ほん かばん でんわ なまえ でんわばんごう トイレ にほんご テレビ ' +
'おかあさん おとうさん せんせい ともだち いぬ ねこ がっこう うち くるま はな へび くも パーティー ひと ' +
'わたし ぼく あなた かれ かのじょ わたしたち かれら みんな あなたたち ' +
'ゼロ いち に さん よん ご ろく なな はち きゅう じゅう ひゃく せん まん ' +
'なに だれ どこ いつ なぜ どうして どう どれ いくら いくつ なんじ ですか しつもん ' +
'これ それ あれ ここ そこ あそこ する たべる のむ みる よむ ねる いく くる あそぶ べんきょうする かう ある いる とる およぐ ' +
'おいしい まずい うれしい かなしい ねむい ほしい おおきい ちいさい ひろい せまい かるい おもい あかい あおい きいろい しろい くろい ちゃいろい ' +
'すき きらい げんき きれい いろ みどり むらさき ピンク オレンジ はいいろ てんき そら もっと ぜんぶ ' +
'ひとつ ふたつ みっつ よっつ いつつ むっつ ななつ やっつ ここのつ とお おかいもの みせ おかね おつり えん').split(/\s+/));

// ---- kana -> romaji (wapuro-Hepburn, matches site style) ----
const DIGRAPH = { 'きゃ':'kya','きゅ':'kyu','きょ':'kyo','しゃ':'sha','しゅ':'shu','しょ':'sho','ちゃ':'cha','ちゅ':'chu','ちょ':'cho',
'にゃ':'nya','にゅ':'nyu','にょ':'nyo','ひゃ':'hya','ひゅ':'hyu','ひょ':'hyo','みゃ':'mya','みゅ':'myu','みょ':'myo',
'りゃ':'rya','りゅ':'ryu','りょ':'ryo','ぎゃ':'gya','ぎゅ':'gyu','ぎょ':'gyo','じゃ':'ja','じゅ':'ju','じょ':'jo',
'ぢゃ':'ja','ぢゅ':'ju','ぢょ':'jo','びゃ':'bya','びゅ':'byu','びょ':'byo','ぴゃ':'pya','ぴゅ':'pyu','ぴょ':'pyo',
'ふぁ':'fa','ふぃ':'fi','ふぇ':'fe','ふぉ':'fo','うぃ':'wi','うぇ':'we','てぃ':'ti','でぃ':'di','しぇ':'she','ちぇ':'che','じぇ':'je','つぁ':'tsa' };
const MONO = { 'あ':'a','い':'i','う':'u','え':'e','お':'o','か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko',
'さ':'sa','し':'shi','す':'su','せ':'se','そ':'so','た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to',
'な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no','は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho',
'ま':'ma','み':'mi','む':'mu','め':'me','も':'mo','や':'ya','ゆ':'yu','よ':'yo','ら':'ra','り':'ri','る':'ru','れ':'re','ろ':'ro',
'わ':'wa','を':'wo','ん':'n','が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge','ご':'go','ざ':'za','じ':'ji','ず':'zu','ぜ':'ze','ぞ':'zo',
'だ':'da','ぢ':'ji','づ':'zu','で':'de','ど':'do','ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo',
'ぱ':'pa','ぴ':'pi','ぷ':'pu','ぺ':'pe','ぽ':'po','ぁ':'a','ぃ':'i','ぅ':'u','ぇ':'e','ぉ':'o','ゎ':'wa','ゔ':'vu' };

function kataToHira(s) {
    return s.replace(/[ァ-ヶ]/g, m => String.fromCharCode(m.charCodeAt(0) - 0x60));
}
function kanaToRomaji(jp) {
    // Convert per punctuation-separated segment: a word-final っ before
    // punctuation is a cut-off sound (あっ、= "a,"), not gemination.
    return kataToHira(String(jp)).split(/[。、！？!?・「」〜～\s]+/)
        .map(seg => kanaSegToRomaji(seg.replace(/っ+$/, ''))).join('');
}
function kanaSegToRomaji(s) {
    let out = '', i = 0;
    while (i < s.length) {
        if (s[i] === 'っ') {
            const rest = kanaToRomaji(s.slice(i + 1));
            return out + (rest ? rest[0] + rest : rest);
        }
        if (s[i] === 'ー') { // long vowel: repeat last vowel of out
            const v = (out.match(/[aiueo](?=[^aiueo]*$)/) || [''])[0];
            out += v; i++; continue;
        }
        const two = s.substr(i, 2);
        if (DIGRAPH[two]) { out += DIGRAPH[two]; i += 2; continue; }
        if (MONO[s[i]]) { out += MONO[s[i]]; i++; continue; }
        out += s[i]; i++; // unknown char passes through (will mismatch loudly)
    }
    return out;
}
// Accept common legit variants: word-final/particle は=wa, を=o, ん=n', long-vowel spellings
function romajiMatches(jp, romaji) {
    if (/[0-9０-９]/.test(jp)) return true; // digits read as Japanese numbers - skip strict check
    const target = String(romaji).toLowerCase().replace(/[\s\-'.,!?~"]/g, '');
    const base = kanaToRomaji(jp);
    const variants = new Set([base]);
    const grow = (from, to) => {
        for (const v of [...variants]) {
            let idx = v.indexOf(from);
            while (idx !== -1) {
                variants.add(v.slice(0, idx) + to + v.slice(idx + from.length));
                idx = v.indexOf(from, idx + 1);
                if (variants.size > 800) return;
            }
        }
    };
    // particle spellings + long-vowel styles; run to (bounded) fixpoint so
    // multiple particles in one sentence all get their variants
    for (let pass = 0; pass < 3; pass++) {
        grow('ha', 'wa'); grow('wo', 'o'); grow('he', 'e');
        grow('nb', 'mb'); grow('np', 'mp'); grow('nm', 'mm');
        grow('ou', 'oo'); grow('uu', 'u'); grow('ou', 'o'); grow('ee', 'e'); grow('oo', 'o'); grow('aa', 'a');
        if (variants.size > 800) break;
    }
    return variants.has(target);
}

// Displayed-romaji quality: spaced words, particle は read as wa, を as o.
// (romajiMatches accepts these degraded spellings, so check readability separately.)
function romajiProblem(jp, romaji) {
    const jt = String(jp).replace(/[。、！？!?「」『』・]/g, ' ').trim().split(/\s+/).filter(Boolean);
    const rw = String(romaji).replace(/[",.!?~]/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (jt.length >= 2 && rw.length < jt.length) return 'glued romaji (fewer words than jp)';
    if (jt.length >= 2 && /は[\s。、」！？!?]/.test(jp + ' ') && !/wa/.test(romaji)) return 'particle は romanized as "ha"';
    if (/を/.test(jp) && /wo/.test(romaji)) return 'を romanized as "wo"';
    return null;
}

// ---- load data files ----
const ctx = { window: {} };
vm.createContext(ctx);
const years = [];
for (let y = 1; y <= 5; y++) {
    const f = 'curriculum_y' + y + '.js';
    if (!fs.existsSync(f)) { console.log('(skip) ' + f + ' not found'); continue; }
    vm.runInContext(fs.readFileSync(f, 'utf8'), ctx);
    years.push(y);
}

const problems = [];
function bad(y, w, msg) { problems.push('Y' + y + (w ? ' W' + w : '') + ': ' + msg); }

const seenVocab = new Map(); // jp -> 'Yy Ww'
let totalWords = 0, totalKanji = 0, totalStories = 0;

for (const y of years) {
    const yr = ctx.window.CURRICULUM[y];
    if (!yr) { bad(y, 0, 'window.CURRICULUM[' + y + '] missing'); continue; }
    if (!yr.title) bad(y, 0, 'missing title');
    if (!Array.isArray(yr.terms) || yr.terms.length !== 4) bad(y, 0, 'terms must be 4');
    if (!Array.isArray(yr.weeks) || yr.weeks.length !== 52) { bad(y, 0, 'weeks length ' + (yr.weeks || []).length + ' != 52'); continue; }
    const wNums = new Set();
    for (const wk of yr.weeks) {
        const w = wk.w;
        if (!Number.isInteger(w) || w < 1 || w > 52 || wNums.has(w)) bad(y, w, 'bad/duplicate week number');
        wNums.add(w);
        for (const field of ['title', 'jp', 'emoji', 'kind', 'goal']) {
            if (!wk[field]) bad(y, w, 'missing ' + field);
        }
        if (!KINDS.includes(wk.kind)) bad(y, w, 'bad kind ' + wk.kind);
        // vocab
        if (!Array.isArray(wk.vocab)) { bad(y, w, 'vocab missing'); }
        else {
            if (wk.kind === 'lesson' && wk.vocab.length < 5) bad(y, w, 'lesson has only ' + wk.vocab.length + ' words');
            for (const v of wk.vocab) {
                totalWords++;
                if (!v.jp || !v.romaji || !v.en || !v.pos) { bad(y, w, 'incomplete vocab entry ' + JSON.stringify(v)); continue; }
                if (!v.emoji) bad(y, w, 'vocab missing emoji: ' + v.jp);
                if (!POS.includes(v.pos)) bad(y, w, 'bad pos "' + v.pos + '" for ' + v.jp);
                if (/[一-龯]/.test(v.jp)) bad(y, w, 'kanji in vocab jp: ' + v.jp);
                if (!romajiMatches(v.jp, v.romaji)) bad(y, w, 'romaji mismatch: ' + v.jp + ' vs "' + v.romaji + '" (expected ~' + kanaToRomaji(v.jp) + ')');
                const vrp = romajiProblem(v.jp, v.romaji);
                if (vrp) bad(y, w, vrp + ': ' + v.jp + ' vs "' + v.romaji + '"');
                if (PRE_TAUGHT.has(v.jp)) bad(y, w, 'already-taught word re-allocated: ' + v.jp);
                if (seenVocab.has(v.jp)) bad(y, w, 'duplicate vocab "' + v.jp + '" (first: ' + seenVocab.get(v.jp) + ')');
                else seenVocab.set(v.jp, 'Y' + y + ' W' + w);
            }
        }
        // grammar
        if (!wk.grammar || !wk.grammar.title || !wk.grammar.explain) bad(y, w, 'grammar missing');
        else {
            const exs = wk.grammar.examples || [];
            if (exs.length < 2) bad(y, w, 'fewer than 2 grammar examples');
            for (const ex of exs) {
                if (!ex.jp || !ex.romaji || !ex.en) { bad(y, w, 'incomplete example'); continue; }
                if (/[一-龯]/.test(ex.jp)) bad(y, w, 'kanji in example: ' + ex.jp);
                if (!romajiMatches(ex.jp, ex.romaji)) bad(y, w, 'example romaji mismatch: "' + ex.jp + '" vs "' + ex.romaji + '"');
                const erp = romajiProblem(ex.jp, ex.romaji);
                if (erp) bad(y, w, 'example ' + erp + ': "' + ex.jp + '"');
            }
        }
        for (const ph of wk.phrases || []) {
            if (ph.jp && ph.romaji && !romajiMatches(ph.jp, ph.romaji)) bad(y, w, 'phrase romaji mismatch: "' + ph.jp + '" vs "' + ph.romaji + '"');
            const prp = ph.jp && ph.romaji && romajiProblem(ph.jp, ph.romaji);
            if (prp) bad(y, w, 'phrase ' + prp + ': "' + ph.jp + '"');
        }
        // culture: must be real content (workbook.html shows it verbatim under a "Japan Corner" label)
        if (wk.culture !== undefined) {
            if (!wk.culture || wk.culture.length < 40) bad(y, w, 'culture looks like a placeholder: "' + wk.culture + '"');
            else if (/^japan corner/i.test(wk.culture)) bad(y, w, 'culture starts with "Japan Corner" (UI already adds that label)');
        }
        // writing / kanji
        if (!wk.writing || !wk.writing.type || !Array.isArray(wk.writing.chars)) bad(y, w, 'writing missing');
        else for (const c of wk.writing.chars) {
            // single chars, or short all-kana units (yoon combos like きゃ, sokuon words)
            const len = [...c].length;
            const allKana = /^[ぁ-んァ-ヶー]+$/.test(c);
            if (len !== 1 && !(allKana && len <= 5)) bad(y, w, 'bad writing target: "' + c + '"');
        }
        for (const k of wk.kanji || []) {
            totalKanji++;
            if (!k.char || [...k.char].length !== 1 || !k.read || !k.mean) bad(y, w, 'bad kanji entry ' + JSON.stringify(k));
        }
        // activities / review
        if (!Array.isArray(wk.activities) || wk.activities.length < 3) bad(y, w, 'needs >= 3 activities');
        else for (const a of wk.activities) {
            if (!ACTIVITY_KEYS.includes(a)) bad(y, w, 'unknown activity "' + a + '"');
        }
        if ((wk.activities || []).includes('story') && !wk.story) bad(y, w, 'story activity without story data');
        if ((wk.activities || []).includes('kanjimatch') && y === 1 && w < 40) bad(y, w, 'kanjimatch before kanji exist');
        for (const r of wk.review || []) {
            if (!Number.isInteger(r) || r < 1 || r >= w) bad(y, w, 'bad review pointer ' + r);
        }
        // story
        if (wk.story) {
            totalStories++;
            if (!wk.story.title || !Array.isArray(wk.story.lines) || wk.story.lines.length < 3) bad(y, w, 'story malformed');
            for (const q of wk.story.questions || []) {
                if (!Array.isArray(q.options) || q.answer == null || q.answer < 0 || q.answer >= q.options.length)
                    bad(y, w, 'story question answer out of range');
            }
            for (const l of wk.story.lines || []) {
                if (l.jp && l.romaji && !romajiMatches(l.jp, l.romaji)) bad(y, w, 'story romaji mismatch: "' + l.jp + '"');
                const lrp = l.jp && l.romaji && romajiProblem(l.jp, l.romaji);
                if (lrp) bad(y, w, 'story ' + lrp + ': "' + l.jp + '"');
            }
        }
    }
}

console.log('years loaded: ' + years.join(', '));
console.log('total new words: ' + totalWords + ' | kanji: ' + totalKanji + ' | stories: ' + totalStories);
if (problems.length) {
    console.log('\nPROBLEMS (' + problems.length + '):');
    for (const p of problems) console.log('  - ' + p);
    process.exit(1);
} else {
    console.log('All checks passed. ✔');
}
