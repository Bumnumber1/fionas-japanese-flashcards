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
        start() { this.starts++; if (options.startError) throw options.startError; }
        stop() { this.stops++; }
        abort() { this.aborts++; }
    }
    const sandbox = {
        console,
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
        speechSynthesis: { cancellations: 0, cancel() { this.cancellations++; } }
    };
    if (!options.unsupported) sandbox[options.prefixed ? 'webkitSpeechRecognition' : 'SpeechRecognition'] = Recognition;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
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

console.log('\n' + passed + ' voice tests passed. Live Japanese microphone recognition still requires a supported browser, permission, and its speech service.');
