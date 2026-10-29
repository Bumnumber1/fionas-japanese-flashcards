'use strict';
// Run with node validate_taekwondo_voice.js. No microphone/network is simulated
// as live acceptance: these tests exercise exact language matching and lifecycle.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const DojoVoice = require('./taekwondo-voice.js');
const dojo = require('./taekwondo-engine.js');
let passed = 0;
function test(name, callback) {
    callback();
    passed++;
    console.log('PASS ' + name);
}

function environment(options = {}) {
    let now = 0;
    let nextTimer = 1;
    const timers = new Map();
    const events = new Map();
    const documentEvents = new Map();
    const instances = [];
    class Recognition {
        constructor() { instances.push(this); this.starts = this.stops = this.aborts = 0; }
        start() {
            this.starts++;
            if (options.startErrors && options.startErrors.length) { const error = options.startErrors.shift(); if (error) throw error; }
            if (options.startError) throw options.startError;
            if (options.exclusiveNative && instances.some(rec => rec !== this && rec.nativeActive)) throw Error('Native recognition overlap');
            this.nativeActive = true;
        }
        stop() { this.stops++; }
        abort() { this.aborts++; if (options.releaseOnAbort) this.nativeActive = false; }
        end() { this.nativeActive = false; if (this.onend) this.onend(); }
    }
    const sandbox = {
        console,
        navigator: { ...(options.navigator || {}) },
        performance: { now: () => now },
        isSecureContext: options.secure !== false,
        setTimeout(callback, delay) { const id = nextTimer++; timers.set(id, { at: now + delay, callback }); return id; },
        clearTimeout(id) { timers.delete(id); },
        addEventListener(type, callback) { events.set(type, callback); },
        removeEventListener(type) { events.delete(type); },
        document: {
            hidden: false,
            addEventListener(type, callback) { documentEvents.set(type, callback); },
            removeEventListener(type) { documentEvents.delete(type); }
        },
        speechSynthesis: { speaking: true, pending: false, cancellations: 0, cancel() { this.cancellations++; this.speaking = false; this.pending = false; } }
    };
    if (options.diagnostics) sandbox.DojoMicDiagnostics = options.diagnostics;
    if (!options.unsupported) sandbox[options.prefixed ? 'webkitSpeechRecognition' : 'SpeechRecognition'] = Recognition;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    const streamSource = path.join(__dirname, 'taekwondo-safari-stream.js');
    if (fs.existsSync(streamSource)) vm.runInContext(fs.readFileSync(streamSource, 'utf8'), sandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'taekwondo-voice.js'), 'utf8'), sandbox);
    const states = [], results = [], errors = [];
    const voice = new sandbox.DojoVoice({ onState: state => states.push(state), onResult: result => results.push(result), onError: error => errors.push(error) });
    return {
        voice, sandbox, instances, states, results, errors, timers, events, documentEvents,
        tick(milliseconds) {
            const until = now + milliseconds;
            while (true) {
                let earliest = null;
                for (const [id, timer] of timers) if (timer.at <= until && (!earliest || timer.at < earliest[1].at)) earliest = [id, timer];
                if (!earliest) break;
                timers.delete(earliest[0]); now = earliest[1].at; earliest[1].callback();
            }
            now = until;
        }
    };
}
function event(alternatives, final = true) {
    const group = alternatives.map(transcript => ({ transcript, confidence: 0.8 }));
    group.isFinal = final;
    return { resultIndex: 0, results: [group] };
}
function cumulative(groups, resultIndex = 0) {
    return { resultIndex, results: groups.map(([alternatives, final = true]) => event(Array.isArray(alternatives) ? alternatives : [alternatives], final).results[0]) };
}
const kanaQuestion = { mode: 'kana-read', prompt: 'し', reading: 'shi' };
const wordQuestion = { mode: 'word-read', prompt: 'ねこ', expectedKana: 'ねこ', reading: 'neko', answer: 'cat' };

test('All 46 canonical kana accept exact kana, katakana, and canonical romaji', () => {
    for (const kana of dojo.KANA) {
        const question = { mode: 'kana-read', prompt: kana.char, reading: kana.romaji };
        assert.equal(DojoVoice.matches(question, kana.char), true, kana.char);
        assert.equal(DojoVoice.matches(question, String.fromCharCode(kana.char.charCodeAt(0) + 0x60)), true, kana.char);
        assert.equal(DojoVoice.matches(question, kana.romaji), true, kana.romaji);
        assert.equal(DojoVoice.matches(question, kana.romaji.toUpperCase()), true);
    }
});

test('All 46 Katakana prompts recognize their exact pronunciation in either script', () => {
    for (const kana of dojo.KANA) {
        const katakana = String.fromCharCode(kana.char.charCodeAt(0) + 0x60);
        const question = { mode: 'kana-read', script: 'katakana', prompt: katakana, reading: kana.romaji };
        for (const transcript of [katakana, kana.char, kana.romaji, kana.romaji.toUpperCase(), '「' + katakana + '」！']) {
            assert.equal(DojoVoice.matches(question, transcript), true, katakana + ': ' + transcript);
        }
        // The phonetic fallback also works when a single-kana question carries
        // no explicit romanization, as it does for equivalent Hiragana prompts.
        assert.equal(DojoVoice.matches({ mode: 'kana-read', script: 'katakana', prompt: katakana }, kana.romaji), true, katakana);
        assert.equal(DojoVoice.matches(question, katakana + 'です'), false, katakana + ': no suffixes');
    }
});

test('Katakana shape confusables and wrong syllables never become fuzzy matches', () => {
    for (const prompt of ['シ', 'ツ', 'ソ', 'ン']) {
        const question = { mode: 'kana-read', script: 'katakana', prompt };
        for (const other of ['シ', 'ツ', 'ソ', 'ン']) {
            assert.equal(DojoVoice.matches(question, other), prompt === other, prompt + ' vs ' + other);
        }
    }
    for (const [prompt, wrong] of [['ク', 'ケ'], ['ヌ', 'ス'], ['コ', 'ユ'], ['チ', 'テ'], ['フ', 'ワ']]) {
        assert.equal(DojoVoice.matches({ mode: 'kana-read', script: 'katakana', prompt }, wrong), false, prompt + ' vs ' + wrong);
    }
    assert.equal(DojoVoice.matches({ mode: 'kana-read', script: 'katakana', prompt: 'ヲ', reading: 'wo' }, 'o'), true);
    assert.equal(DojoVoice.matches({ mode: 'kana-read', script: 'katakana', prompt: 'ハ', reading: 'ha' }, 'わ'), false);
    assert.equal(DojoVoice.matches({ mode: 'kana-read', script: 'katakana', prompt: 'ヘ', reading: 'he' }, 'え'), false);
    assert.equal(DojoVoice.matches({ mode: 'kana-read', script: 'katakana', prompt: 'キ', reading: 'ki' }, '木曜日'), false);
});

test('Standard romanization aliases and explicit single-kana homophones work', () => {
    for (const [kana, spoken] of [['し', 'si!'], ['ち', 'ti'], ['つ', 'tu'], ['ふ', 'hu'], ['を', 'o'], ['を', 'お'], ['ん', 'nn'], ['ん', "n'"], ['き', '木'], ['ひ', '日'], ['て', '手']]) {
        assert.equal(DojoVoice.matches({ mode: 'kana-read', prompt: kana }, spoken), true, kana + ': ' + spoken);
    }
    assert.equal(DojoVoice.matches({ mode: 'kana-read', prompt: 'は' }, 'わ'), false);
    assert.equal(DojoVoice.matches({ mode: 'kana-read', prompt: 'へ' }, 'え'), false);
    assert.equal(DojoVoice.matches({ mode: 'kana-read', prompt: 'き' }, '木曜日'), false);
});

const material = { window: {} };
material.window = material;
vm.createContext(material);
for (const filename of ['curriculum_y1.js', 'year1-review-data.js', 'garden-material.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, filename), 'utf8'), material);
const words = material.Year1Review.catalog.words;

test('All canonical 132 words accept complete Japanese and their existing romaji', () => {
    assert.equal(words.length, 132);
    for (const word of words) {
        const question = { mode: 'word-read', prompt: word.jp, expectedKana: word.jp, reading: word.romaji, answer: word.en };
        assert.equal(DojoVoice.matches(question, word.jp), true, word.jp);
        assert.equal(DojoVoice.matches(question, word.romaji), true, word.romaji);
        // "futon" is also the exact canonical Japanese romanization; the speech
        // transcript cannot identify which language's sense the speaker meant.
        if (DojoVoice.normalizeTranscript(word.en) !== DojoVoice.normalizeTranscript(word.romaji)) {
            assert.equal(DojoVoice.matches(question, word.en), false, 'English meaning must fail: ' + word.en);
        }
        assert.equal(DojoVoice.matches(question, word.jp + 'です'), false, 'No suffix match: ' + word.jp);
    }
});

test('Existing Garden kanji and standard Year 1 word orthography match whole words', () => {
    for (const form of material.GardenMaterial.build(words.map(word => word.id)).kanji) {
        assert.equal(DojoVoice.matches({ mode: 'word-read', expectedKana: form.read }, form.char), true, form.char);
    }
    for (const [expectedKana, transcript] of [['ねこ', '猫'], ['ねがいごと', '願い事'], ['たべます', '食べます'], ['よみます', '読みます'], ['きょうかしょ', '教科書'], ['ほしぞら', '星空'], ['ほうれんそう', 'ほうれん草'], ['たまねぎ', '玉葱'], ['おりひめ', '織姫']]) {
        assert.equal(DojoVoice.matches({ mode: 'word-read', expectedKana }, transcript), true, transcript);
        assert.equal(DojoVoice.matches({ mode: 'word-read', expectedKana }, transcript + 'です'), false);
    }
});

test('Hiragana reading specials accept complete canonical words and their exact orthography', () => {
    for (const word of words.filter(word => [...word.jp].length > 1)) {
        const question = { mode: 'kana-read', prompt: word.jp, reading: word.romaji, difficulty: 'special', techniqueId: 'double-front' };
        assert.equal(DojoVoice.matches(question, word.jp), true, word.jp);
        assert.equal(DojoVoice.matches(question, word.romaji), true, word.romaji);
        for (const alias of DojoVoice.aliasesFor({ mode: 'word-read', expectedKana: word.jp, reading: word.romaji })) {
            assert.equal(DojoVoice.matches(question, alias), true, word.jp + ': ' + alias);
        }
    }
    for (const [prompt, reading, transcript] of [['さる', 'saru', '猿'], ['たこ', 'tako', '蛸'], ['ねこ', 'neko', '猫']]) {
        const question = { mode: 'kana-read', prompt, reading, difficulty: 'special' };
        assert.equal(DojoVoice.matches(question, transcript), true, transcript);
        assert.equal(DojoVoice.matches(question, transcript + 'です'), false);
    }
});

test('Hiragana specials reject fragments, wrong words, English meanings, and writing answers', () => {
    const question = { mode: 'kana-read', prompt: 'さる', reading: 'saru', meaning: 'monkey', difficulty: 'special' };
    for (const transcript of ['さ', 'る', '差', '猫', 'monkey', 'さるです', 'さるとねこ', 'saru monkey']) {
        assert.equal(DojoVoice.matches(question, transcript), false, transcript);
    }
    assert.equal(DojoVoice.matches({ ...question, mode: 'kana-write' }, 'さる'), false);
    assert.equal(DojoVoice.matches({ mode: 'kana-read', prompt: 'き', reading: 'ki' }, '気'), true);
    assert.equal(DojoVoice.matches({ mode: 'kana-read', prompt: 'き', reading: 'ki' }, '金色'), false);
});

test('Katakana specials use whole canonical words, including small kana and long vowels', () => {
    const katakanaWords = words.filter(word => /^[ァ-ヶー]+$/.test(word.jp));
    assert.deepEqual(Array.from(katakanaWords, word => word.jp).sort(), ['タコ', 'イカ', 'カニ', 'ジュース', 'ケーキ', 'トイレ'].sort());
    for (const word of katakanaWords) {
        const question = { mode: 'kana-read', script: 'katakana', prompt: word.jp, reading: word.romaji, meaning: word.en, difficulty: 'special' };
        assert.equal(DojoVoice.matches(question, word.jp), true, word.jp);
        assert.equal(DojoVoice.matches(question, DojoVoice.normalizeTranscript(word.jp)), true, word.jp + ': Hiragana');
        assert.equal(DojoVoice.matches(question, word.romaji), true, word.jp + ': romanization');
        for (const alias of DojoVoice.aliasesFor({ mode: 'word-read', expectedKana: word.jp, reading: word.romaji })) {
            assert.equal(DojoVoice.matches(question, alias), true, word.jp + ': ' + alias);
        }
        for (const transcript of [word.jp.slice(0, -1), word.jp + 'です', word.en, word.romaji + 'です']) {
            assert.equal(DojoVoice.matches(question, transcript), false, word.jp + ': reject ' + transcript);
        }
        assert.equal(DojoVoice.matches({ ...question, mode: 'kana-write' }, word.jp), false, 'Writing cannot use speech');
    }
    for (const [prompt, reading, right, wrong] of [
        ['タコ', 'tako', '蛸', 'タカ'], ['イカ', 'ika', '烏賊', 'イキ'], ['カニ', 'kani', '蟹', 'カミ'],
        ['ジュース', 'juusu', 'ｼﾞｭｰｽ', 'ジュス'], ['ケーキ', 'keeki', 'ｹｰｷ', 'ケキ']
    ]) {
        const question = { mode: 'kana-read', script: 'katakana', prompt, reading, difficulty: 'special' };
        assert.equal(DojoVoice.matches(question, right), true, right);
        assert.equal(DojoVoice.matches(question, wrong), false, wrong);
    }
});

test('Longer word specials accept full kanji forms without broadening word matches', () => {
    for (const [prompt, reading, transcript, meaning] of [
        ['きょうかしょ', 'kyoukasho', '教科書', 'textbook'],
        ['ねがいごと', 'negaigoto', '願い事', 'wish'],
        ['ほうれんそう', 'hourensou', 'ほうれん草', 'spinach'],
        ['たまねぎ', 'tamanegi', '玉ねぎ', 'onion']
    ]) {
        const question = { mode: 'word-read', prompt, reading, meaning, difficulty: 'special' };
        assert.equal(DojoVoice.matches(question, transcript), true, transcript);
        assert.equal(DojoVoice.matches(question, prompt), true, prompt);
        assert.equal(DojoVoice.matches(question, meaning), false, meaning);
        assert.equal(DojoVoice.matches(question, transcript.slice(0, -1)), false, transcript + ' fragment');
        assert.equal(DojoVoice.matches(question, transcript + 'です'), false);
    }
});

test('Normalization handles halfwidth kana and punctuation while preserving long vowels', () => {
    assert.equal(DojoVoice.normalizeTranscript('　ﾈｺ。「ネコ」！ '), 'ねこねこ');
    assert.equal(DojoVoice.matches(wordQuestion, '　ﾈｺ。 '), true);
    const juice = { mode: 'word-read', expectedKana: 'ジュース', reading: 'juusu' };
    assert.equal(DojoVoice.matches(juice, 'ジュース'), true);
    assert.equal(DojoVoice.matches(juice, 'じゅうす'), true);
    assert.equal(DojoVoice.matches(juice, 'ジュス'), false);
    assert.equal(DojoVoice.matches({ mode: 'word-read', expectedKana: 'こうえん', reading: 'kouen' }, 'kōen'), true);
    assert.equal(DojoVoice.matches({ mode: 'word-read', expectedKana: 'おおきい', reading: 'ookii' }, 'ōkii'), true);
});

test('No substring, fuzzy, English, absent target, or writing-mode bypass', () => {
    for (const value of ['', null, undefined, 'cat', 'catねこ', 'ね', 'ねご', 'ねこです', 'ねこいぬ', 'I said it']) assert.equal(DojoVoice.matches(wordQuestion, value), false, String(value));
    assert.equal(DojoVoice.matches({ mode: 'kana-write', prompt: 'し' }, 'し'), false);
    assert.equal(DojoVoice.matches({ mode: 'word-read' }, 'undefined'), false);
    assert.equal(DojoVoice.matches({ mode: 'word-read', expectedKana: 'いぬ', voiceAliases: ['犬'] }, '犬'), true);
    assert.equal(DojoVoice.matches({ mode: 'word-read', expectedKana: 'いぬ', voiceAliases: ['犬'] }, '犬です'), false);
});

test('Japanese numeric and kanji spellings accept only their exact isolated kana sounds', () => {
    for (const [prompt, alternatives] of [
        ['に', ['2', '２', '二', '煮', '似']], ['し', ['4', '４', '四', '死', '師', '紙']],
        ['く', ['9', '９', '九', '苦']], ['あ', ['亜', '阿']], ['か', ['化', '加', '可']],
        ['き', ['機', '期', '器']], ['せ', ['瀬']], ['そ', ['祖']], ['へ', ['屁']],
        ['ね', ['音']], ['も', ['藻']], ['ら', ['羅']], ['わ', ['話']]
    ]) {
        for (const transcript of alternatives) {
            assert.equal(DojoVoice.matches({ mode: 'kana-read', prompt }, transcript), true, prompt + ': ' + transcript);
            assert.equal(DojoVoice.matches({ mode: 'kana-read', prompt }, transcript + 'です'), false, 'No suffix: ' + transcript);
            assert.equal(DojoVoice.matches({ mode: 'kana-read', prompt }, transcript + 'じゃない'), false, 'No negation: ' + transcript);
        }
    }
    for (const [prompt, wrong] of [['さ', '3'], ['さ', '三'], ['に', '3'], ['し', '2'], ['く', '6'], ['き', 'キーです'], ['か', '課題']]) {
        assert.equal(DojoVoice.matches({ mode: 'kana-read', prompt }, wrong), false, prompt + ': reject ' + wrong);
    }
});

test('One naturally held isolated kana is accepted without collapsing different syllables', () => {
    const vowels = { a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お' };
    for (const kana of dojo.KANA) {
        const question = { mode: 'kana-read', prompt: kana.char, reading: kana.romaji };
        const spoken = kana.char === 'を' ? 'お' : kana.char;
        assert.equal(DojoVoice.matches(question, spoken + 'ー'), true, kana.char + ': held long mark');
        assert.equal(DojoVoice.matches(question, spoken + 'ーー'), false, kana.char + ': bounded long mark');
        const vowel = vowels[kana.romaji.slice(-1)];
        if (!vowel) continue;
        const held = spoken + vowel;
        const katakana = [...held].map(char => String.fromCharCode(char.charCodeAt(0) + 0x60)).join('');
        assert.equal(DojoVoice.matches(question, held), true, kana.char + ': held matching vowel');
        assert.equal(DojoVoice.matches(question, katakana), true, kana.char + ': held Katakana');
        assert.equal(DojoVoice.matches(question, held + vowel), false, kana.char + ': bounded vowel');
        const wrongVowel = vowel === 'あ' ? 'い' : 'あ';
        assert.equal(DojoVoice.matches(question, spoken + wrongVowel), false, kana.char + ': wrong vowel');
        assert.equal(DojoVoice.matches(question, held + 'です'), false, kana.char + ': held sound with suffix');
    }
});

test('Small isolated vowel and glide spellings retain sound while small tsu never passes tsu', () => {
    for (const [prompt, transcript] of [['あ', 'ぁ'], ['い', 'ィ'], ['う', 'ぅ'], ['え', 'ェ'], ['お', 'ぉ'], ['や', 'ゃ'], ['ゆ', 'ュ'], ['よ', 'ょ'], ['わ', 'ゎ']]) {
        assert.equal(DojoVoice.matches({ mode: 'kana-read', prompt }, transcript), true, prompt + ': ' + transcript);
    }
    for (const [prompt, transcript] of [['つ', 'っ'], ['つ', 'ッ'], ['き', 'きゃ'], ['し', 'しゃ'], ['や', 'ゅ'], ['ゆ', 'ゃ']]) {
        assert.equal(DojoVoice.matches({ mode: 'kana-read', prompt }, transcript), false, prompt + ': ' + transcript);
    }
});

test('A bounded held O sound accepts Japanese ou spelling only for isolated basic kana', () => {
    for (const kana of dojo.KANA.filter(item => item.romaji.endsWith('o'))) {
        const question = { mode: 'kana-read', prompt: kana.char, reading: kana.romaji, challengeKind: 'basic' };
        const spoken = kana.char === 'を' ? 'お' : kana.char;
        for (const transcript of [spoken + 'う', (kana.char === 'を' ? 'o' : kana.romaji) + 'u']) {
            assert.equal(DojoVoice.matches(question, transcript), true, kana.char + ': ' + transcript);
            const katakana = [...(spoken + 'う')].map(char => String.fromCharCode(char.charCodeAt(0) + 0x60)).join('');
            assert.equal(DojoVoice.matches({ ...question, prompt: String.fromCharCode(kana.char.charCodeAt(0) + 0x60) }, katakana), true);
        }
    }
    for (const prompt of ['そ', 'ソ']) {
        const question = { mode: 'kana-read', prompt, reading: 'so', challengeKind: 'basic' };
        for (const transcript of ['so', 'sou', 'sō', 'そう', 'ソウ', 'そお', 'soo', 'そー']) assert.equal(DojoVoice.matches(question, transcript), true, transcript);
        for (const transcript of ['sa', 'さ', 'sooo', 'souu', 'そうう', 'そうです', 'そおお', 'そうそう']) assert.equal(DojoVoice.matches(question, transcript), false, transcript);
        const env = environment(); env.voice.start(question); env.instances[0].onresult(event(['sou']));
        assert.equal(env.results.length, 1); assert.equal(env.results[0].correct, true); assert.equal(env.results[0].recognizedKana, 'そ'); assert.equal(env.results[0].recognizedRomaji, 'so');
        env.voice.destroy();
    }
    assert.equal(DojoVoice.matches({ mode: 'kana-read', prompt: 'せ', reading: 'se' }, 'せい'), false, 'No expansion to other vowel rows');
});

test('Ou tolerance never changes word or special vowel length, including canonical challengeKind metadata', () => {
    for (const question of [
        { mode: 'word-read', expectedKana: 'そ', reading: 'so' },
        { mode: 'kana-read', prompt: 'そ', reading: 'so', difficulty: 'special' },
        { mode: 'kana-read', prompt: 'そ', reading: 'so', challengeKind: 'special' }
    ]) {
        assert.equal(DojoVoice.matches(question, 'そ'), true);
        for (const transcript of ['sou', 'sō', 'そう', 'そお', 'そー']) assert.equal(DojoVoice.matches(question, transcript), false, JSON.stringify(question) + ': ' + transcript);
    }
    assert.equal(DojoVoice.matches({ mode: 'word-read', expectedKana: 'そう', reading: 'sou' }, 'そ'), false);
    assert.equal(DojoVoice.matches({ mode: 'word-read', expectedKana: 'そう', reading: 'sou' }, 'そう'), true);
});

test('Complete vocabulary homophones survive the recognizer choosing another spelling', () => {
    for (const [expectedKana, transcript] of [
        ['のり', '海苔'], ['さる', '去る'], ['もも', '腿'], ['ぶどう', '武道'], ['なし', '無し'],
        ['みかん', '未完'], ['かき', '牡蠣'], ['こうえん', '講演'], ['ほうれんそう', '報連相'],
        ['にじ', '2時'], ['にじ', '二次'], ['つき', '突き'], ['かわ', '皮'], ['いし', '医師'],
        ['うみ', '膿'], ['いか', '以下'], ['はな', '鼻'], ['おもい', '思い'], ['きます', '着ます'],
        ['かいます', '飼います'], ['よみます', '詠みます'], ['せんせい', '宣誓'], ['ケーキ', '景気'], ['ケーキ', 'けいき']
    ]) {
        const question = { mode: 'word-read', expectedKana };
        assert.equal(DojoVoice.matches(question, transcript), true, expectedKana + ': ' + transcript);
        for (const suffix of ['です', 'じゃない', 'ではありません', 'とねこ']) {
            assert.equal(DojoVoice.matches(question, transcript + suffix), false, expectedKana + ': no extra words');
        }
        assert.equal(DojoVoice.matches(question, 'いいえ' + transcript), false, expectedKana + ': no negative prefix');
    }
});

test('Held-syllable tolerance never changes complete word or special vowel length', () => {
    for (const question of [
        { mode: 'word-read', expectedKana: 'き', reading: 'ki' },
        { mode: 'kana-read', prompt: 'き', reading: 'ki', difficulty: 'special' }
    ]) {
        assert.equal(DojoVoice.matches(question, 'き'), true);
        assert.equal(DojoVoice.matches(question, 'きい'), false);
        assert.equal(DojoVoice.matches(question, 'キー'), false);
    }
    for (const [expectedKana, wrong] of [['おばさん', 'おばあさん'], ['おばあさん', 'おばさん'], ['ジュース', 'ジュス'], ['ケーキ', 'ケキ'], ['ここ', 'こーこ'], ['きょう', 'きょ']]) {
        assert.equal(DojoVoice.matches({ mode: 'word-read', expectedKana }, wrong), false, expectedKana + ': reject ' + wrong);
        assert.equal(DojoVoice.matches({ mode: 'kana-read', prompt: expectedKana, difficulty: 'special' }, wrong), false, expectedKana + ': special reject ' + wrong);
    }
});

test('Speech homophones never become meaning-specific kanji writing targets', () => {
    for (const [expectedKana, canonical, speechOnly] of [
        ['こうえん', '公園', '講演'], ['のり', '糊', '海苔'], ['ぶどう', '葡萄', '武道'],
        ['かき', '柿', '牡蠣'], ['はな', '花', '鼻'], ['いし', '石', '医師'], ['きます', '来ます', '着ます']
    ]) {
        const question = { mode: 'word-read', expectedKana, voiceAliases: [speechOnly] };
        assert.equal(DojoVoice.matches(question, speechOnly), true, 'Valid speech sound: ' + speechOnly);
        assert.equal(DojoVoice.spellingsFor(question).includes(canonical), true, 'Canonical writing: ' + canonical);
        assert.equal(DojoVoice.spellingsFor(question).includes(speechOnly), false, 'No changed writing meaning: ' + speechOnly);
        assert.equal(DojoVoice.spellingsFor(question).includes(expectedKana), true, 'Canonical kana retained');
    }
    assert.deepEqual(DojoVoice.spellingsFor({ mode: 'kana-read', prompt: 'シ', reading: 'shi' }), ['し']);
    assert.deepEqual(DojoVoice.spellingsFor({ mode: 'kana-write', prompt: 'し' }), []);
    assert.deepEqual(DojoVoice.spellingsFor(null), []);
});

test('Start configures Japanese recognition and cancels target speech synthesis', () => {
    const env = environment();
    assert.equal(env.voice.supported, true);
    assert.equal(env.instances.length, 0, 'No auto microphone on construction');
    assert.equal(env.voice.start(kanaQuestion), true);
    const rec = env.instances[0];
    assert.equal(rec.lang, 'ja-JP'); assert.equal(rec.continuous, false); assert.equal(rec.interimResults, true); assert.equal(rec.maxAlternatives, 10);
    assert.equal(rec.starts, 1); assert.equal(env.sandbox.speechSynthesis.cancellations, 1);
    env.voice.destroy();
});

test('Interim transcripts are displayed but never graded; final alternatives grade once', () => {
    const env = environment(); env.voice.start(kanaQuestion);
    const rec = env.instances[0], lateResult = rec.onresult, lateEnd = rec.onend;
    rec.onstart(); rec.onresult(event(['し'], false));
    assert.equal(env.results.length, 0); assert.equal(env.states.at(-1).transcript, 'し');
    rec.onresult(event(['ち', 'し']));
    assert.equal(env.results.length, 1); assert.equal(env.results[0].correct, true); assert.equal(env.results[0].transcript, 'し');
    assert.deepEqual(Array.from(env.results[0].alternatives), ['ち', 'し']);
    assert.equal(env.results[0].normalized, 'し'); assert.equal(rec.aborts, 1);
    lateResult(event(['し'])); lateEnd();
    assert.equal(env.results.length, 1); assert.equal(env.errors.length, 0); assert.equal(env.timers.size, 0);
});

test('A real wrong final is one incorrect answer, while an interim correction can pass', () => {
    const env = environment(); env.voice.start(wordQuestion); const rec = env.instances[0];
    rec.onresult(event(['いぬ'])); assert.equal(env.results.length, 1); assert.equal(env.results[0].correct, false);
    env.voice.start(wordQuestion); const next = env.instances[1]; next.onresult(event(['いぬ'], false)); next.onresult(event(['猫']));
    assert.equal(env.results.length, 2); assert.equal(env.results[1].correct, true);
});

test('Stop processes collected speech; cancel discards even saved late handlers', () => {
    const env = environment(); env.voice.start(wordQuestion); let rec = env.instances[0];
    assert.equal(env.voice.stop(), true); assert.equal(rec.stops, 1); assert.equal(env.states.at(-1).status, 'processing');
    rec.onresult(event(['ねこ'])); assert.equal(env.results.length, 1);
    env.voice.start(wordQuestion); rec = env.instances[1]; const late = rec.onresult;
    env.voice.cancel(); assert.equal(rec.aborts, 1); late(event(['ねこ']));
    assert.equal(env.results.length, 1); assert.equal(env.errors.length, 0); assert.equal(env.voice.stop(), false);
});

test('Restart aborts the old microphone and ignores all old result/error/end events', () => {
    const env = environment(); env.voice.start(wordQuestion); const old = env.instances[0];
    const oldResult = old.onresult, oldEnd = old.onend, oldError = old.onerror;
    env.voice.start(kanaQuestion); const rec = env.instances[1];
    assert.equal(old.aborts, 1); oldResult(event(['ねこ'])); oldError({ error: 'network' }); oldEnd();
    assert.equal(env.results.length, 0); assert.equal(env.errors.length, 0); assert.equal(env.states.at(-1).status, 'starting');
    rec.onresult(event(['し'])); assert.equal(env.results.length, 1);
});

test('Target is snapshotted for the recognition session', () => {
    const env = environment(), question = { ...wordQuestion, voiceAliases: ['猫'] };
    env.voice.start(question); question.expectedKana = 'いぬ'; question.voiceAliases[0] = '犬';
    env.instances[0].onresult(event(['猫'])); assert.equal(env.results[0].correct, true);
});

test('Permission/network/capture/no-speech failures emit one actionable error and zero grades', () => {
    for (const code of ['not-allowed', 'service-not-allowed', 'network', 'audio-capture', 'no-speech', 'language-not-supported']) {
        const env = environment(); env.voice.start(wordQuestion); const rec = env.instances[0], lateEnd = rec.onend, lateError = rec.onerror;
        rec.onerror({ error: code }); lateEnd(); lateError({ error: code });
        assert.equal(env.errors.length, 1, code); assert.equal(env.errors[0].code, code); assert.ok(env.errors[0].message.length > 30);
        assert.equal(env.results.length, 0, code); assert.equal(rec.aborts, 1); assert.equal(env.timers.size, 0);
    }
});

test('End without final and low-confidence nomatch are non-penalty errors', () => {
    for (const kind of ['onend', 'onnomatch']) {
        const env = environment(); env.voice.start(wordQuestion); env.instances[0][kind]();
        assert.equal(env.results.length, 0); assert.equal(env.errors.length, 1);
    }
});

test('Ten-second recording cap stops capture and a final result can still complete', () => {
    const env = environment(); env.voice.start(wordQuestion); const rec = env.instances[0]; rec.onstart();
    env.tick(9999); assert.equal(rec.stops, 0); env.tick(1); assert.equal(rec.stops, 1); assert.equal(env.states.at(-1).status, 'processing');
    rec.onresult(event(['ねこ'])); env.tick(10000); assert.equal(env.results.length, 1); assert.equal(env.errors.length, 0);
});

test('Silence/processing/startup timeouts never inflict an incorrect answer', () => {
    const env = environment(); env.voice.start(wordQuestion); const rec = env.instances[0]; rec.onstart(); env.tick(13000);
    assert.equal(rec.stops, 1); assert.equal(rec.aborts, 1); assert.equal(env.results.length, 0); assert.equal(env.errors[0].code, 'no-speech');
    const startup = environment(); startup.voice.start(wordQuestion); startup.tick(15000);
    assert.equal(startup.results.length, 0); assert.equal(startup.errors[0].code, 'recognition-timeout'); assert.equal(startup.instances[0].aborts, 1);
});

test('Unsupported/insecure browsers and thrown permission errors never open a fallback', () => {
    for (const options of [{ unsupported: true }, { secure: false }]) {
        const env = environment(options); assert.equal(env.voice.supported, false); assert.equal(env.voice.start(wordQuestion), false);
        assert.equal(env.instances.length, 0); assert.equal(env.errors[0].code, 'unsupported'); assert.equal(env.results.length, 0);
    }
    const env = environment({ startError: { name: 'NotAllowedError' } }); assert.equal(env.voice.start(wordQuestion), false);
    assert.equal(env.errors[0].code, 'not-allowed'); assert.equal(env.results.length, 0); assert.equal(env.timers.size, 0);
    const prefixed = environment({ prefixed: true }); assert.equal(prefixed.voice.supported, true); assert.equal(prefixed.voice.start(wordQuestion), true); prefixed.voice.destroy();
});

test('Navigation/hidden page/destroy abort capture and suppress late outcomes', () => {
    for (const kind of ['pagehide', 'hidden', 'destroy']) {
        const env = environment(); env.voice.start(wordQuestion); const rec = env.instances[0], late = rec.onresult;
        if (kind === 'pagehide') env.events.get('pagehide')();
        if (kind === 'hidden') { env.sandbox.document.hidden = true; env.documentEvents.get('visibilitychange')(); }
        if (kind === 'destroy') env.voice.destroy();
        late(event(['ねこ'])); env.tick(20000);
        assert.equal(rec.aborts, 1); assert.equal(env.results.length, 0); assert.equal(env.errors.length, 0); assert.equal(env.timers.size, 0);
        if (kind === 'destroy') { assert.equal(env.events.size, 0); assert.equal(env.documentEvents.size, 0); assert.equal(env.voice.start(wordQuestion), false); }
    }
});

test('A reentrant navigation from idle state invalidates a pending result', () => {
    const env = environment(); const stateCallback = env.voice.onState;
    env.voice.onState = state => { stateCallback(state); if (state.status === 'idle' && state.transcript) env.voice.cancel(); };
    env.voice.start(wordQuestion); env.instances[0].onresult(event(['ねこ'])); assert.equal(env.results.length, 0);
});

test('Multiple final segments require the whole phrase, never a matching fragment', () => {
    const env = environment(); env.voice.start(wordQuestion);
    const first = event(['ねこ']).results[0], second = event(['です']).results[0];
    env.instances[0].onresult({ resultIndex: 0, results: [first, second] });
    assert.equal(env.results.length, 1); assert.equal(env.results[0].correct, false); assert.equal(env.results[0].normalized, 'ねこです');
});

test('Special voice recognition grades a whole-word alias once and rejects a fragment', () => {
    const question = { mode: 'kana-read', prompt: 'たこ', reading: 'tako', difficulty: 'special' };
    const env = environment();
    env.voice.start(question);
    env.instances[0].onresult(event(['た', '蛸']));
    assert.equal(env.results.length, 1);
    assert.equal(env.results[0].correct, true);
    assert.equal(env.results[0].transcript, '蛸');
    env.voice.start(question);
    env.instances[1].onresult(event(['た']));
    assert.equal(env.results.length, 2);
    assert.equal(env.results[1].correct, false);
    env.voice.destroy();
});

test('Katakana hands-free sessions grade once, ignore stale speech, and retain exact targets', () => {
    const env = environment();
    const firstQuestion = { mode: 'kana-read', script: 'katakana', prompt: 'シ', reading: 'shi' };
    const nextQuestion = { mode: 'kana-read', script: 'katakana', prompt: 'タコ', reading: 'tako', difficulty: 'special' };
    assert.equal(env.voice.start(firstQuestion), true);
    const first = env.instances[0], oldResult = first.onresult;
    first.onstart(); first.onresult(event(['ツ'], false));
    assert.equal(env.results.length, 0, 'An interim confusable is never graded');
    first.onresult(event(['シ']));
    assert.equal(env.results.length, 1); assert.equal(env.results[0].correct, true);
    assert.equal(env.voice.start(nextQuestion), true);
    const next = env.instances[1], lateResult = next.onresult;
    oldResult(event(['シ']));
    assert.equal(env.results.length, 1, 'The preceding prompt cannot answer the next one');
    next.onresult(event(['タ', '蛸']));
    assert.equal(env.results.length, 2); assert.equal(env.results[1].correct, true); assert.equal(env.results[1].transcript, '蛸');
    lateResult(event(['蛸']));
    assert.equal(env.results.length, 2, 'A completed final cannot score twice');
    env.voice.start(firstQuestion); env.instances[2].onresult(event(['ツ']));
    assert.equal(env.results.length, 3); assert.equal(env.results[2].correct, false, 'A wrong final remains one mistake');
    assert.equal(env.errors.length, 0); assert.equal(env.timers.size, 0);
    env.voice.destroy();
});

test('Native readiness separates startup delay from actual answer timing', () => {
    const env = environment(); env.voice.start(kanaQuestion); const rec = env.instances[0];
    assert.equal(env.states.at(-1).status, 'starting');
    env.tick(2400); rec.onstart();
    assert.equal(env.states.at(-1).status, 'listening');
    env.tick(125); rec.onspeechend();
    env.tick(2200); rec.onresult(event(['し']));
    assert.equal(env.results.length, 1); assert.equal(env.results[0].readingMs, 125);
    assert.equal(env.errors.length, 0); env.voice.destroy();
});

test('Stable whole-answer interim requests a final after 200ms, never awards it', () => {
    const env = environment(); env.voice.start(wordQuestion); const rec = env.instances[0]; rec.onstart();
    env.tick(100); rec.onresult(event(['猫'], false));
    env.tick(150); rec.onresult(event(['猫'], false));
    env.tick(49); assert.equal(rec.stops, 0);
    env.tick(1); assert.equal(rec.stops, 1); assert.equal(env.results.length, 0);
    env.tick(1800); rec.onresult(event(['猫']));
    assert.equal(env.results.length, 1); assert.equal(env.results[0].correct, true);
    assert.equal(env.results[0].readingMs, 300); assert.equal(env.timers.size, 0);
    env.voice.destroy();
});

test('Changed or wrong interim cancels early endpoint; a revised final stays authoritative', () => {
    const env = environment(); env.voice.start(wordQuestion); const rec = env.instances[0]; rec.onstart();
    rec.onresult(event(['猫'], false)); env.tick(100);
    rec.onresult(event(['猫じゃない'], false)); env.tick(300);
    assert.equal(rec.stops, 0); assert.equal(env.results.length, 0);
    rec.onresult(event(['猫'], false)); env.tick(200);
    assert.equal(rec.stops, 1); rec.onresult(event(['犬']));
    assert.equal(env.results.length, 1); assert.equal(env.results[0].correct, false);
    assert.equal(env.timers.size, 0); env.voice.destroy();
});

test('Mixed final and interim groups cannot award a matching prefix', () => {
    const env = environment(); env.voice.start(wordQuestion); const rec = env.instances[0]; rec.onstart();
    const prefix = event(['猫']).results[0], tail = event(['じゃない'], false).results[0];
    rec.onresult({ resultIndex: 1, results: [prefix, tail] }); env.tick(250);
    assert.equal(env.results.length, 0); assert.equal(rec.stops, 0);
    rec.onresult({ resultIndex: 1, results: [prefix, event(['じゃない']).results[0]] });
    assert.equal(env.results.length, 1); assert.equal(env.results[0].correct, false);
    env.voice.destroy();
});

test('An isolated sa transcribed as 3 is unclear, with no wrong or correct grade', () => {
    const sa = { mode: 'kana-read', prompt: 'さ', reading: 'sa' };
    for (const transcript of ['3', '３', '三', '30', '3.0']) {
        const env = environment(); env.voice.start(sa); const rec = env.instances[0]; rec.onstart();
        rec.onresult(event([transcript]));
        assert.equal(env.results.length, 0, transcript); assert.equal(env.errors[0].code, 'no-match', transcript);
        assert.equal(env.errors[0].transcript, transcript); assert.equal(env.timers.size, 0);
        env.voice.start(sa); env.instances[1].onresult(event(['さ']));
        assert.equal(env.results[0].correct, true); env.voice.destroy();
    }
    const env = environment(); env.voice.start(sa); env.instances[0].onresult(event(['し']));
    assert.equal(env.results[0].correct, false, 'A clear different kana still counts as a real mistake');
    env.voice.destroy();
});

test('All ten final alternatives can rescue a correct result; cancellation clears early endpoint', () => {
    const env = environment(); env.voice.start(kanaQuestion); const rec = env.instances[0]; rec.onstart();
    rec.onresult(event(['ち', 'つ', 'す', 'さ', 'と', 'く', 'き', 'そ', 'せ', 'し']));
    assert.equal(env.results[0].correct, true); assert.equal(env.results[0].alternatives.length, 10);
    env.voice.start(kanaQuestion); const next = env.instances[1]; next.onstart();
    next.onresult(event(['し'], false)); const stale = next.onresult;
    env.voice.cancel(); env.tick(500); stale(event(['し']));
    assert.equal(next.stops, 0); assert.equal(env.results.length, 1); assert.equal(env.timers.size, 0);
    env.voice.destroy();
});

test('A stable provisional answer without a final remains ungraded and retryable', () => {
    const env = environment(); env.voice.start(kanaQuestion); const rec = env.instances[0]; rec.onstart();
    rec.onresult(event(['し'], false)); env.tick(3200);
    assert.equal(rec.stops, 1); assert.equal(env.results.length, 0);
    assert.equal(env.errors[0].code, 'no-match'); assert.equal(env.timers.size, 0); env.voice.destroy();
});

const safariNavigator = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    vendor: 'Apple Computer, Inc.', platform: 'MacIntel', maxTouchPoints: 0
};
const safariEnvironment = options => environment({ navigator: safariNavigator, exclusiveNative: true, ...(options || {}) });

test('Safari lifecycle policy detects desktop iPad and iOS WebKit without changing desktop Chrome', () => {
    for (const navigator of [
        safariNavigator,
        { ...safariNavigator, maxTouchPoints: 5 },
        { ...safariNavigator, platform: 'iPad', maxTouchPoints: 5, userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' },
        { ...safariNavigator, platform: 'iPhone', maxTouchPoints: 5, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1' },
        { ...safariNavigator, platform: 'iPhone', maxTouchPoints: 5, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15' }
    ]) {
        const env = environment({ navigator });
        assert.equal(env.voice.safariMode, true, navigator.userAgent);
        assert.equal(env.voice.start(kanaQuestion), true);
        assert.equal(env.instances[0].lang, 'ja-JP');
        assert.equal(env.instances[0].continuous, false);
        assert.equal(env.instances[0].interimResults, true);
        assert.equal(env.instances[0].maxAlternatives, 10);
        env.voice.destroy();
    }
    for (const userAgent of [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0'
    ]) {
        const env = environment({ navigator: { ...safariNavigator, userAgent } });
        assert.equal(env.voice.safariMode, false, userAgent);
        env.voice.destroy();
    }
});

test('Safari conservatively finalizes a stable hypothesis without grading its interim', () => {
    const env = safariEnvironment(); env.voice.start(wordQuestion);
    const rec = env.instances[0]; rec.onstart(); rec.onaudiostart(); env.tick(100);
    rec.onresult(event(['犬'], false)); env.tick(899);
    assert.equal(rec.stops, 0, 'Safari gets a conservative 900ms utterance settle time');
    assert.equal(env.results.length, 0);
    env.tick(1); assert.equal(rec.stops, 1, 'A stable wrong hypothesis also requests a native final');
    env.tick(3500);
    assert.equal(env.errors.length, 0); assert.equal(env.results.length, 0);
    rec.onresult(event(['猫']));
    assert.equal(env.results.length, 1); assert.equal(env.results[0].correct, true);
    assert.equal(rec.aborts, 0, 'A final must not abort the native Safari recognizer');
    rec.end(); env.voice.destroy();
});

test('Safari manual finish allows a late final while preserving actual capture time', () => {
    const env = safariEnvironment(); env.voice.start(kanaQuestion);
    const rec = env.instances[0]; rec.onstart(); rec.onaudiostart(); env.tick(180);
    assert.equal(env.voice.stop(), true); assert.equal(rec.stops, 1);
    env.tick(5000); assert.equal(env.errors.length, 0);
    rec.onresult(event(['し']));
    assert.equal(env.results.length, 1); assert.equal(env.results[0].correct, true);
    assert.equal(env.results[0].readingMs, 180);
    rec.end(); env.voice.destroy();
});

test('Safari does not announce Listening until native audio capture is ready', () => {
    const env = safariEnvironment(); env.voice.start(kanaQuestion);
    const rec = env.instances[0]; env.tick(40); rec.onstart();
    assert.equal(env.states.at(-1).status, 'starting', 'Starting a recognition task is not audio capture');
    env.tick(2400); rec.onaudiostart();
    assert.equal(env.states.at(-1).status, 'listening');
    env.tick(180); rec.onspeechend(); rec.onresult(event(['し']));
    assert.equal(env.results.length, 1); assert.equal(env.results[0].readingMs, 180);
    rec.end(); env.voice.destroy();
});

test('Safari Finish speaking still requests native stop after a speech-end event', () => {
    const env = safariEnvironment(); env.voice.start(wordQuestion);
    const rec = env.instances[0]; rec.onstart(); rec.onaudiostart();
    rec.onresult(event(['猫'], false)); rec.onspeechend();
    assert.equal(rec.stops, 1, 'A natural speech end asks Safari for its final');
    assert.equal(env.voice.stop(), true); assert.equal(rec.stops, 1, 'Explicit finish remains safe after the native stop request');
    env.voice.stop(); assert.equal(rec.stops, 1, 'Repeated finish is idempotent');
    rec.onresult(event(['猫'])); assert.equal(env.results.length, 1); assert.equal(env.results[0].correct, true);
    rec.end(); env.voice.destroy();
});

test('Safari no-audio startup cannot quietly become a listening session', () => {
    const env = safariEnvironment(); env.voice.start(wordQuestion);
    const rec = env.instances[0]; rec.onstart(); env.tick(16000);
    assert.equal(env.states.some(state => state.status === 'listening'), false);
    assert.equal(env.results.length, 0); assert.equal(env.errors.length, 1);
    assert.match(env.errors[0].message, /microphone|audio|speech/i);
    rec.end(); env.voice.destroy(); assert.equal(env.timers.size, 0);
});

test('A final without earlier audio evidence cannot fabricate a one-millisecond speed result', () => {
    const env = safariEnvironment(); env.voice.start(kanaQuestion);
    const rec = env.instances[0]; rec.onstart(); env.tick(2100); rec.onresult(event(['し']));
    assert.equal(env.results.length, 1); assert.equal(env.results[0].correct, true);
    assert.equal(env.results[0].readingMs, null);
    rec.end(); env.voice.destroy();
});

test('A Safari startup exception stays ungraded and an explicit reset can reconnect', () => {
    const env = safariEnvironment({ startErrors: [{ name: 'InvalidStateError', message: 'Recognizer busy' }, null] });
    assert.equal(env.voice.start(kanaQuestion), false);
    assert.equal(env.results.length, 0); assert.equal(env.errors.length, 1);
    assert.equal(env.voice.reset(), true); assert.equal(env.voice.start(kanaQuestion), true);
    const rec = env.instances[1]; env.tick(399); assert.equal(rec.starts, 0);
    env.tick(1); assert.equal(rec.starts, 1); rec.onstart(); rec.onaudiostart();
    rec.onresult(event(['し'])); assert.equal(env.results.length, 1); assert.equal(env.results[0].correct, true);
    rec.end(); env.voice.destroy(); assert.equal(env.voice.reset(), false);
});

test('Explicit reset clears an abandoned native-end lock without changing the target', () => {
    const env = safariEnvironment({ releaseOnAbort: true }); env.voice.start(kanaQuestion);
    const rec = env.instances[0], stale = rec.onresult; rec.onstart(); rec.onaudiostart(); rec.onresult(event(['し']));
    env.voice.start(wordQuestion); env.tick(4000);
    assert.equal(env.errors.at(-1).code, 'microphone-busy');
    assert.equal(env.voice.reset(), true); env.voice.start(wordQuestion); const fresh = env.instances.at(-1);
    env.tick(400); assert.equal(fresh.starts, 1); fresh.onstart(); fresh.onaudiostart();
    stale(event(['猫'])); assert.equal(env.results.length, 1, 'Reset invalidates the old callback');
    fresh.onresult(event(['猫'])); assert.equal(env.results.length, 2); assert.equal(env.results.at(-1).correct, true);
    fresh.end(); env.voice.destroy(); assert.equal(env.timers.size, 0);
});

test('Unexpected isolated-kana dictation stays inconclusive but another clear kana remains wrong', () => {
    for (const transcript of ['サファリ', 'こんにちは', 'recognition stopped']) {
        const env = environment(); env.voice.start({ mode: 'kana-read', prompt: 'さ', reading: 'sa' });
        env.instances[0].onresult(event([transcript]));
        assert.equal(env.results.length, 0, transcript); assert.equal(env.errors.at(-1).code, 'no-match', transcript);
        env.voice.destroy();
    }
    const env = environment(); env.voice.start({ mode: 'kana-read', prompt: 'さ', reading: 'sa' });
    env.instances[0].onresult(event(['し'])); assert.equal(env.results.length, 1); assert.equal(env.results[0].correct, false);
    env.voice.destroy();
});

test('Safari serializes a reentrant next answer until native end and its release delay', () => {
    const env = safariEnvironment(); env.voice.start(kanaQuestion);
    const first = env.instances[0], staleFinal = first.onresult;
    first.onstart();
    const resultCallback = env.voice.onResult;
    env.voice.onResult = result => { resultCallback(result); env.voice.start(wordQuestion); };
    first.onresult(event(['し']));
    assert.equal(env.results.length, 1); assert.equal(env.instances.length, 2);
    const next = env.instances[1]; assert.equal(next.starts, 0);
    assert.equal(first.aborts, 0); env.tick(500); assert.equal(next.starts, 0);
    first.end(); env.tick(119); assert.equal(next.starts, 0);
    env.tick(1); assert.equal(next.starts, 1);
    assert.equal(env.errors.length, 0, 'Native exclusive mock would reject overlapping start');
    staleFinal(event(['し'])); assert.equal(env.results.length, 1);
    env.voice.onResult = resultCallback;
    next.onstart(); next.onresult(event(['猫']));
    assert.equal(env.results.length, 2); assert.equal(env.results[1].correct, true);
    next.end(); env.voice.destroy();
});

test('Safari cancellation discards a queued restart and all stale finals', () => {
    const env = safariEnvironment(); env.voice.start(kanaQuestion);
    const first = env.instances[0], staleFinal = first.onresult;
    first.onstart(); first.onresult(event(['し']));
    env.voice.start(wordQuestion); env.voice.cancel();
    first.end(); env.tick(10000); staleFinal(event(['猫']));
    assert.equal(env.instances.length, 2); assert.equal(env.instances[1].starts, 0); assert.equal(env.results.length, 1);
    assert.equal(env.errors.length, 0); assert.equal(env.timers.size, 0);
    env.voice.destroy();
});

test('Safari pending targets are snapshotted before native release', () => {
    const env = safariEnvironment(); env.voice.start(kanaQuestion);
    const first = env.instances[0]; first.onresult(event(['し']));
    const question = { ...wordQuestion, voiceAliases: ['猫'] };
    env.voice.start(question); question.expectedKana = 'いぬ'; question.voiceAliases[0] = '犬';
    first.end(); env.tick(120);
    const next = env.instances[1]; assert.ok(next);
    next.onstart(); next.onresult(event(['猫']));
    assert.equal(env.results.length, 2); assert.equal(env.results[1].correct, true);
    next.end(); env.voice.destroy();
});

test('Safari aborted errors are recoverable but permission or service failures are not', () => {
    for (const code of ['aborted', 'not-allowed', 'network', 'audio-capture', 'language-not-supported']) {
        const env = safariEnvironment(); env.voice.start(kanaQuestion);
        const rec = env.instances[0]; rec.onstart(); rec.onerror({ error: code });
        assert.equal(env.results.length, 0); assert.equal(env.errors.length, 1);
        assert.equal(Boolean(env.errors[0].retryable), code === 'aborted', code);
        rec.end(); env.voice.destroy();
    }
});

test('Safari missing native end fails safely rather than overlapping microphones', () => {
    const env = safariEnvironment(); env.voice.start(kanaQuestion);
    const rec = env.instances[0]; rec.onstart(); rec.onresult(event(['し']));
    env.voice.start(wordQuestion);
    env.tick(1499); assert.equal(rec.aborts, 0); assert.equal(env.instances[1].starts, 0);
    env.tick(1); assert.equal(rec.aborts, 1, 'Escalate a missing native end once');
    env.tick(2500); assert.equal(env.instances[1].starts, 0);
    assert.equal(env.errors.length, 1); assert.equal(env.errors[0].code, 'microphone-busy');
    assert.equal(env.errors[0].requiresGesture, true);
    assert.equal(env.results.length, 1); env.tick(15000);
    assert.equal(env.instances[1].starts, 0); assert.equal(env.errors.length, 1);
    rec.end(); env.voice.destroy();
});

test('Safari final waiting is bounded at eight seconds without grading provisional speech', () => {
    const env = safariEnvironment(); env.voice.start(kanaQuestion);
    const rec = env.instances[0]; rec.onstart(); rec.onresult(event(['し'], false)); rec.onspeechend();
    env.tick(7999); assert.equal(env.errors.length, 0); assert.equal(env.results.length, 0);
    env.tick(1); assert.equal(env.errors.length, 1); assert.equal(env.errors[0].code, 'no-match');
    assert.equal(env.results.length, 0); assert.equal(rec.aborts, 1);
    rec.end(); env.voice.destroy(); assert.equal(env.timers.size, 0);
});

test('Safari navigation and destroy invalidate a pending native restart and clear timers', () => {
    for (const kind of ['pagehide', 'hidden', 'destroy']) {
        const env = safariEnvironment(); env.voice.start(kanaQuestion);
        const rec = env.instances[0], staleFinal = rec.onresult; rec.onstart(); rec.onresult(event(['し']));
        env.voice.start(wordQuestion); const pending = env.instances[1];
        assert.equal(pending.starts, 0);
        if (kind === 'pagehide') env.events.get('pagehide')();
        if (kind === 'hidden') { env.sandbox.document.hidden = true; env.documentEvents.get('visibilitychange')(); }
        if (kind === 'destroy') env.voice.destroy();
        rec.end(); env.tick(20000); staleFinal(event(['猫']));
        assert.equal(pending.starts, 0, kind); assert.equal(env.results.length, 1, kind);
        assert.equal(env.errors.length, 0, kind); assert.equal(env.timers.size, 0, kind);
        env.voice.destroy(); assert.equal(env.timers.size, 0, kind);
    }
});

test('Replacing a Safari queued prompt launches only the latest target after native release', () => {
    const env = safariEnvironment(); env.voice.start(kanaQuestion);
    const first = env.instances[0]; first.onresult(event(['し']));
    env.voice.start(wordQuestion); const discarded = env.instances[1];
    env.voice.start({ mode: 'kana-read', prompt: 'カ', reading: 'ka' }); const latest = env.instances[2];
    assert.equal(discarded.starts, 0); assert.equal(discarded.aborts, 0); assert.equal(latest.starts, 0);
    first.end(); env.tick(120); assert.equal(discarded.starts, 0); assert.equal(latest.starts, 1);
    latest.onstart(); latest.onresult(event(['蚊']));
    assert.equal(env.results.length, 2); assert.equal(env.results[1].correct, true);
    assert.equal(env.errors.length, 0); latest.end(); env.voice.destroy(); assert.equal(env.timers.size, 0);
});

test('Safari hands-free keeps one native continuous microphone across three cumulative answers', () => {
    const env = safariEnvironment();
    assert.equal(env.voice.start(kanaQuestion, { keepAlive: true }), true);
    const rec = env.instances[0]; assert.equal(rec.continuous, true); assert.equal(rec.lang, 'ja-JP');
    rec.onstart(); env.tick(500); assert.equal(env.states.at(-1).status, 'starting');
    rec.onaudiostart(); env.tick(100); rec.onresult(cumulative([['し', true]]));
    assert.equal(env.results.length, 1); assert.equal(env.results[0].correct, true);
    assert.equal(env.voice.captureActive, true); assert.equal(rec.stops, 0); assert.equal(rec.aborts, 0);
    env.voice.disarm(); env.tick(200);
    env.voice.start(wordQuestion, { keepAlive: true }); env.tick(120);
    rec.onresult(cumulative([['し', true], ['猫', false]], 1));
    rec.onresult(cumulative([['し', true], ['猫', true]], 1));
    assert.equal(env.results.length, 2); assert.equal(env.results[1].correct, true);
    env.voice.disarm(); env.tick(220);
    env.voice.start({ mode: 'kana-read', prompt: 'カ', reading: 'ka' }, { keepAlive: true }); env.tick(90);
    rec.onresult(cumulative([['し', true], ['猫', true], ['蚊', false]], 2));
    rec.onresult(cumulative([['し', true], ['猫', true], ['蚊', true]], 2));
    assert.equal(env.results.length, 3); assert.equal(env.results[2].correct, true);
    assert.equal(env.instances.length, 1); assert.equal(rec.starts, 1); assert.equal(rec.stops, 0); assert.equal(rec.aborts, 0);
    assert.equal(env.sandbox.speechSynthesis.cancellations, 1, 'The initial active TTS is cancelled once; idle synthesis is not poked between answers');
    env.voice.destroy(); assert.equal(env.timers.size, 0);
});

test('Safari feedback interims and late finals cannot poison the next assigned question', () => {
    const env = safariEnvironment(); env.voice.start(kanaQuestion, { keepAlive: true });
    const rec = env.instances[0]; rec.onstart(); rec.onaudiostart();
    rec.onresult(cumulative([['し', true]])); env.voice.disarm();
    rec.onresult(cumulative([['し', true], ['猫', false]], 1));
    assert.equal(env.results.length, 1, 'Feedback speech never grades');
    env.voice.start(wordQuestion, { keepAlive: true });
    rec.onresult(cumulative([['し', true], ['猫', true]], 1));
    assert.equal(env.results.length, 1, 'A hypothesis first seen during feedback remains quarantined');
    rec.onresult(cumulative([['し', true], ['猫', true], ['猫', false]], 2));
    rec.onresult(cumulative([['し', true], ['猫', true], ['猫', true]], 2));
    assert.equal(env.results.length, 2); assert.equal(env.results[1].correct, true);
    env.voice.destroy();
});

test('Safari cumulative replays and resultIndex zero cannot award a preceding answer twice', () => {
    const env = safariEnvironment(); env.voice.start(kanaQuestion, { keepAlive: true });
    const rec = env.instances[0]; rec.onstart(); rec.onaudiostart(); rec.onresult(cumulative([['し', true]]));
    env.voice.disarm(); env.voice.start(kanaQuestion, { keepAlive: true });
    rec.onresult(cumulative([['し', true]], 0));
    assert.equal(env.results.length, 1, 'Same expected kana still needs a genuinely new native result');
    rec.onresult(cumulative([['し', true], ['し', false]], 0));
    rec.onresult(cumulative([['し', true], ['し', true]], 0));
    assert.equal(env.results.length, 2); assert.equal(env.results[1].correct, true);
    env.voice.destroy();
});

test('Safari waits for every new cumulative group to become final and grades the complete phrase', () => {
    const env = safariEnvironment(); env.voice.start(kanaQuestion, { keepAlive: true });
    const rec = env.instances[0]; rec.onstart(); rec.onaudiostart(); rec.onresult(cumulative([['し', true]]));
    env.voice.disarm(); env.voice.start(wordQuestion, { keepAlive: true });
    rec.onresult(cumulative([['し', true], ['ね', true], ['こ', false]], 1));
    assert.equal(env.results.length, 1);
    rec.onresult(cumulative([['し', true], ['ね', true], ['こ', true]], 2));
    assert.equal(env.results.length, 2); assert.equal(env.results[1].correct, true);
    env.voice.disarm(); env.voice.start(wordQuestion, { keepAlive: true });
    rec.onresult(cumulative([['し', true], ['ね', true], ['こ', true], ['猫', true], ['です', false]], 3));
    rec.onresult(cumulative([['し', true], ['ね', true], ['こ', true], ['猫', true], ['です', true]], 3));
    assert.equal(env.results.length, 3); assert.equal(env.results[2].correct, false, 'A correct fragment cannot hide extra words');
    env.voice.destroy();
});

test('Safari rejects rewritten immutable final history instead of attaching it to a new prompt', () => {
    const env = safariEnvironment(); env.voice.start(kanaQuestion, { keepAlive: true });
    const rec = env.instances[0]; rec.onstart(); rec.onaudiostart(); rec.onresult(cumulative([['し', true]]));
    env.voice.disarm(); env.voice.start(wordQuestion, { keepAlive: true });
    rec.onresult(cumulative([['猫', true]], 0));
    assert.equal(env.results.length, 1); assert.equal(env.errors.at(-1).code, 'stream-history-reset');
    env.voice.destroy();
});

test('Safari persistent reading clocks start at audio readiness or the new question arm', () => {
    const env = safariEnvironment(); env.voice.start(kanaQuestion, { keepAlive: true });
    const rec = env.instances[0]; env.tick(50); rec.onstart(); env.tick(2400); rec.onaudiostart();
    env.tick(130); rec.onresult(cumulative([['し', true]]));
    assert.equal(env.results[0].readingMs, 130);
    env.voice.disarm(); env.tick(5000); env.voice.start(wordQuestion, { keepAlive: true });
    env.tick(110); rec.onresult(cumulative([['し', true], ['猫', false]], 1)); rec.onresult(cumulative([['し', true], ['猫', true]], 1));
    assert.equal(env.results[1].readingMs, 110, 'Feedback and earlier capture time are not new-answer time');
    env.voice.destroy();
});

test('Safari keeps a healthy continuous capture through slow interim-to-final delivery for three answers', () => {
    const env = safariEnvironment(); env.voice.start(wordQuestion, { keepAlive: true });
    const rec = env.instances[0]; rec.onstart(); rec.onaudiostart();
    const history = [];
    for (let answer = 0; answer < 3; answer++) {
        if (answer) { env.voice.disarm(); env.voice.start(wordQuestion, { keepAlive: true }); }
        history.push(['猫', false]); rec.onresult(cumulative(history, answer)); env.tick(1200);
        assert.equal(rec.stops, 0, 'A healthy native final can take longer than 900ms'); assert.equal(rec.aborts, 0);
        assert.equal(env.results.length, answer, 'No provisional speech is scored');
        history[answer][1] = true; rec.onresult(cumulative(history, answer));
        assert.equal(env.results.length, answer + 1); assert.equal(env.results[answer].correct, true);
    }
    assert.equal(env.instances.length, 1); assert.equal(rec.starts, 1); env.voice.destroy();
});

test('A quiet Safari question expires softly and retries on the same live native capture', () => {
    for (const hadInterim of [false, true]) {
        const env = safariEnvironment(); env.voice.start(wordQuestion, { keepAlive: true });
        const rec = env.instances[0]; rec.onstart(); rec.onaudiostart();
        if (hadInterim) rec.onresult(cumulative([['猫', false]], 0));
        env.tick(9999); assert.equal(env.errors.length, 0); env.tick(1);
        assert.equal(env.errors.length, 1); assert.equal(env.errors[0].code, hadInterim ? 'no-match' : 'no-speech');
        assert.equal(env.results.length, 0); assert.equal(rec.stops, 0); assert.equal(rec.aborts, 0); assert.equal(env.voice.captureActive, true);
        env.voice.start(wordQuestion, { keepAlive: true });
        const groups = hadInterim ? [['猫', true], ['猫', true]] : [['猫', true]];
        rec.onresult(cumulative(groups, groups.length - 1));
        assert.equal(env.results.length, 1); assert.equal(env.results[0].correct, true); assert.equal(env.instances.length, 1);
        env.voice.destroy(); assert.equal(env.timers.size, 0);
    }
});

test('Cancelling a persistent microphone invalidates old epochs and explicit reset preserves only a new target', () => {
    const env = safariEnvironment({ releaseOnAbort: true }); env.voice.start(kanaQuestion, { keepAlive: true });
    const rec = env.instances[0], stale = rec.onresult; rec.onstart(); rec.onaudiostart();
    rec.onresult(cumulative([['し', false]])); env.voice.cancel(); env.tick(2000);
    stale(cumulative([['し', true]])); assert.equal(env.results.length, 0);
    assert.equal(env.voice.reset(), true); env.voice.start(wordQuestion, { keepAlive: true });
    env.tick(400); const fresh = env.instances.at(-1); assert.notEqual(fresh, rec);
    fresh.onstart(); fresh.onaudiostart(); stale(cumulative([['猫', true]]));
    assert.equal(env.results.length, 0); fresh.onresult(cumulative([['猫', true]]));
    assert.equal(env.results.length, 1); assert.equal(env.results[0].correct, true);
    env.voice.destroy(); assert.equal(env.timers.size, 0);
});

test('Microphone diagnostics retain bounded lifecycle metadata without answers or recorded audio', () => {
    const env = safariEnvironment(); env.voice.start(wordQuestion, { keepAlive: true });
    const rec = env.instances[0]; rec.onstart(); rec.onaudiostart(); rec.onresult(cumulative([['猫', false]]));
    const diagnostics = env.voice.getDiagnostics(), encoded = JSON.stringify(diagnostics);
    assert.ok(diagnostics && typeof diagnostics === 'object');
    assert.equal(encoded.includes('猫'), false); assert.equal(encoded.includes('ねこ'), false);
    assert.match(encoded, /2026-10-29\s+mic-report-1/);
    assert.ok(encoded.length < 30000, 'A bounded event history cannot grow into an audio log');
    env.voice.destroy();
});

test('Safari final-only kanji readings answer three successive kana without requiring interim events', () => {
    const env = safariEnvironment();
    const questions = [{ mode: 'kana-read', prompt: 'こ', reading: 'ko' }, { mode: 'kana-read', prompt: 'さ', reading: 'sa' }, { mode: 'kana-read', prompt: 'し', reading: 'shi' }];
    const kanji = ['子', '差', '市'];
    questions.forEach((question, index) => {
        env.voice.start(question, { keepAlive: true }); const rec = env.instances[0];
        if (index === 0) { rec.onstart(); rec.onaudiostart(); }
        rec.onresult(cumulative(kanji.slice(0, index + 1).map(text => [text, true]), index));
        assert.equal(env.results.length, index + 1, 'Native finals may arrive without any interim');
        assert.equal(env.results[index].correct, true); assert.equal(env.results[index].transcript, kanji[index]);
        assert.equal(env.results[index].recognizedKana, question.prompt); assert.equal(env.results[index].recognizedRomaji, question.reading);
        env.voice.disarm();
    });
    assert.equal(env.instances.length, 1); assert.equal(env.instances[0].starts, 1); assert.equal(env.instances[0].stops, 0); assert.equal(env.errors.length, 0);
    env.voice.destroy();
});

test('A kanji sound can match either kana script, while another sound stays a real mistake', () => {
    for (const prompt of ['こ', 'コ']) {
        const env = environment(); env.voice.start({ mode: 'kana-read', prompt, reading: 'ko' }); env.instances[0].onresult(event(['子']));
        assert.equal(env.results[0].correct, true); assert.equal(env.results[0].recognizedKana, 'こ'); assert.equal(env.results[0].recognizedRomaji, 'ko'); env.voice.destroy();
    }
    const env = environment(); env.voice.start({ mode: 'kana-read', prompt: 'こ', reading: 'ko' }); env.instances[0].onresult(event(['差']));
    assert.equal(env.results[0].correct, false); assert.equal(env.results[0].recognizedKana, 'さ'); assert.equal(env.results[0].recognizedRomaji, 'sa');
    env.voice.destroy();
});

test('A clean native end between accepted answers permits a fresh capture without an error', () => {
    const env = safariEnvironment(); env.voice.start(kanaQuestion, { keepAlive: true });
    const rec = env.instances[0]; rec.onstart(); rec.onaudiostart(); rec.onresult(cumulative([['し', true]]));
    env.voice.disarm(); rec.end(); assert.equal(env.errors.length, 0);
    env.voice.start(wordQuestion, { keepAlive: true }); env.tick(120);
    const next = env.instances[1]; assert.equal(next.starts, 1); next.onstart(); next.onaudiostart(); next.onresult(cumulative([['猫', true]]));
    assert.equal(env.results.length, 2); assert.equal(env.errors.length, 0); env.voice.destroy();
});

test('A requested stop followed by its final and native end does not manufacture a stream interruption', () => {
    const env = safariEnvironment(); env.voice.start(kanaQuestion, { keepAlive: true });
    const rec = env.instances[0]; rec.onstart(); rec.onaudiostart(); rec.onresult(cumulative([['し', false]])); env.voice.stop();
    assert.equal(rec.stops, 1); rec.onresult(cumulative([['し', true]])); env.voice.disarm();
    env.voice.start(wordQuestion, { keepAlive: true }); assert.equal(env.instances.length, 1);
    rec.end(); env.tick(120); const next = env.instances[1]; assert.equal(next.starts, 1);
    next.onstart(); next.onaudiostart(); next.onresult(cumulative([['猫', true]]));
    assert.equal(env.results.length, 2); assert.equal(env.errors.length, 0); env.voice.destroy();
});

test('A broken optional diagnostics hook cannot interrupt recognition or error recovery', () => {
    for (const live of [false, true]) {
        const env = environment({ ...(live ? { navigator: safariNavigator } : {}), diagnostics: {
            record() { throw Error('Synthetic diagnostics write failure'); }, capture() { throw Error('Synthetic diagnostics capture failure'); }
        } });
        assert.doesNotThrow(() => env.voice.start(kanaQuestion, { keepAlive: live }));
        const rec = env.instances[0]; rec.onstart(); if (live) rec.onaudiostart();
        assert.doesNotThrow(() => rec.onresult(event(['し']))); assert.equal(env.results.length, 1); assert.equal(env.results[0].correct, true);
        env.voice.start(wordQuestion, { keepAlive: live }); const next = env.instances.at(-1);
        assert.doesNotThrow(() => next.onerror({ error: 'network' })); assert.equal(env.errors.at(-1).code, 'network');
        env.voice.destroy();
    }
});

console.log('\n' + passed + ' voice tests passed. Live Japanese microphone recognition still requires a supported browser, permission, and its speech service.');
