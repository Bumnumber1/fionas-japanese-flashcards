'use strict';
// Exhaustive sound-level regression checks. Synthetic recognition verifies the
// matcher and final-result integration; it does not test a live speech service.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const DojoVoice = require('./taekwondo-voice.js');
const { KANA } = require('./taekwondo-engine.js');

let checks = 0;
const failures = [];
function check(actual, expected, label) {
    checks++;
    try { assert.equal(actual, expected, label); }
    catch (error) { failures.push(error.message); }
}
const katakana = text => [...text].map(char => /[ぁ-ゖ]/u.test(char) ? String.fromCharCode(char.charCodeAt(0) + 0x60) : char).join('');
const fullwidth = text => text.replace(/[A-Za-z]/g, char => String.fromCharCode(char.charCodeAt(0) + 0xfee0));
const question = (kana, script = 'hiragana') => ({ mode: 'kana-read', prompt: script === 'katakana' ? katakana(kana.char) : kana.char, script, reading: kana.romaji, challengeKind: 'basic' });
const vowels = { a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お' };
const smallVowels = { あ: 'ぁ', い: 'ぃ', う: 'ぅ', え: 'ぇ', お: 'ぉ' };
// Independent examples of complete dictation spellings, rather than asking the
// implementation for the same aliases that its own matcher will accept.
const homophones = {
    あ: ['亜', '阿'], い: ['胃', '井', '医'], う: ['鵜', '卯'], え: ['絵', '江'], お: ['尾', '緒'],
    か: ['蚊', '課', '科'], き: ['木', '気', '機'], く: ['区', '苦', '九', '9'], け: ['毛'], こ: ['子', '個', '湖'],
    さ: ['差', '左'], し: ['詩', '市', '四', '4'], す: ['酢', '巣'], せ: ['背', '瀬'], そ: ['祖', '蘇'],
    た: ['田', '多'], ち: ['地', '血', '知'], つ: ['津'], て: ['手'], と: ['戸', '都'],
    な: ['名', '菜'], に: ['二', '2', '荷'], ね: ['根'], の: ['野'], は: ['葉', '歯'],
    ひ: ['日', '非'], ふ: ['府', '負'], へ: ['屁'], ほ: ['穂', '帆'],
    ま: ['間', '真'], み: ['実', '身'], む: ['無'], め: ['目', '芽'], も: ['喪', '藻'],
    や: ['矢', '屋'], ゆ: ['湯'], よ: ['世', '余'], ら: ['羅'], り: ['理', '利'], ろ: ['炉', '呂'],
    わ: ['輪', '和'], を: ['尾', '緒']
};
// Readings checked against the Agency for Cultural Affairs' primary on/kun
// index. A held syllable may be written as one of these complete spellings.
// https://www.bunka.go.jp/kokugo_nihongo/sisaku/joho/joho/kijun/naikaku/kanji/joyokanjisakuin/
const heldHomophones = {
    え: ['英', '栄', '永'], お: ['王', '欧', '央'],
    く: ['空', '食う'], け: ['計', '系', '形'], こ: ['校', '公', '工', '高'],
    す: ['数', '吸う'], せ: ['正', '生', '性', '声'],
    そ: ['層', '総', '想', '僧'], つ: ['通'], て: ['低', '定', '亭', '帝', '底'], と: ['党', '等', '塔', '刀', '東', '当'],
    の: ['能', '脳', '農'], ふ: ['風', '封'], へ: ['平', '兵', '塀'], ほ: ['方', '法', '宝'],
    め: ['名', '命', '明'], も: ['毛', '猛'], ゆ: ['優', '勇', '有'], よ: ['用', '要', '陽', '洋'],
    れ: ['例', '礼', '零'], ろ: ['労', '老', '郎']
};
const nasal = ['ん', 'ン', 'n', 'N', 'nn', "n'", 'うん', 'ウン', 'un', 'UN'];
for (let count = 1; count <= 4; count++) {
    nasal.push('う' + 'ー'.repeat(count) + 'ん', 'う' + 'う'.repeat(count) + 'ん');
}

function held(kana) {
    const sound = kana.char === 'を' ? 'お' : kana.char;
    const vowel = vowels[kana.romaji.slice(-1)];
    const variants = [];
    for (let count = 1; count <= 4; count++) {
        variants.push(sound + 'ー'.repeat(count));
        if (vowel) variants.push(sound + vowel.repeat(count), sound + smallVowels[vowel].repeat(count));
    }
    if (kana.romaji.endsWith('o')) variants.push(sound + 'う');
    if (kana.romaji.endsWith('e')) variants.push(sound + 'い');
    return variants;
}

check(KANA.length, 46, 'The coverage inventory must contain all 46 base kana');
for (const script of ['hiragana', 'katakana']) {
    for (const kana of KANA) {
        const target = question(kana, script);
        const accepted = [kana.char, katakana(kana.char), kana.romaji, kana.romaji.toUpperCase(), fullwidth(kana.romaji), '「' + katakana(kana.char) + '」！', ...(homophones[kana.char] || []), ...(heldHomophones[kana.char] || []), ...held(kana)];
        if (kana.char !== 'ん') accepted.push(kana.char + 'っ', katakana(kana.char + 'っ'));
        if (kana.char === 'ん') accepted.push(...nasal);
        for (const transcript of accepted) check(DojoVoice.matches(target, transcript), true, `${script} ${kana.char} accepts ${transcript}`);
        // Every base-kana pair is tested in both scripts. を is pronounced お;
        // this intentional shared sound is the only base-kana exception.
        for (const other of KANA) {
            const sameSound = kana.char === other.char || kana.char === 'を' && other.char === 'お';
            for (const transcript of [other.char, katakana(other.char), other.romaji]) {
                check(DojoVoice.matches(target, transcript), sameSound, `${script} ${kana.char} vs ${transcript}`);
            }
        }
        for (const suffix of ['です', 'じゃない', 'とねこ', 'a', ' ねこ']) {
            check(DojoVoice.matches(target, kana.char + suffix), false, `${script} ${kana.char} rejects suffix ${suffix}`);
        }
        for (const transcript of ['', 'こんにちは', '何も言っていない', '3.0', '30', '100', '🦊']) {
            check(DojoVoice.matches(target, transcript), false, `${script} ${kana.char} rejects unrelated ${transcript}`);
        }
        for (const transcript of [kana.char + kana.char, kana.char + 'ー'.repeat(5), kana.char + (vowels[kana.romaji.slice(-1)] || 'ん').repeat(5)]) {
            // A repeated vowel is itself a permitted held vowel. A repeated
            // consonant syllable, including んん, is a second answer.
            if (transcript === kana.char + kana.char && /^[あいうえお]$/u.test(kana.char)) continue;
            check(DojoVoice.matches(target, transcript), false, `${script} ${kana.char} rejects repeated or excessive ${transcript}`);
        }
        if (kana.char === 'ん') check(DojoVoice.matches(target, 'nnn'), false, `${script} ん rejects repeated nasal nnn`);
        if (kana.char === 'ん') check(DojoVoice.matches(target, 'んっ'), false, `${script} ん rejects a clipped nasal`);
        // Tolerance belongs to an isolated basic exercise. A complete word or
        // special question must retain its exact mora and vowel length.
        const strict = [
            { mode: 'word-read', expectedKana: kana.char, reading: kana.romaji },
            { ...target, challengeKind: 'special' },
            { ...target, difficulty: 'special' }
        ];
        for (const strictTarget of strict) {
            check(DojoVoice.matches(strictTarget, kana.char), true, `Strict ${kana.char} accepts itself`);
            for (const transcript of held(kana)) check(DojoVoice.matches(strictTarget, transcript), false, `Strict ${kana.char} rejects hold ${transcript}`);
            for (const transcript of heldHomophones[kana.char] || []) {
                check(DojoVoice.matches(strictTarget, transcript), false, `Strict ${kana.char} rejects held dictation ${transcript}`);
                check(DojoVoice.spellingsFor(strictTarget).includes(transcript), false, `Held dictation ${transcript} cannot become a writing spelling for ${kana.char}`);
            }
            check(DojoVoice.matches(strictTarget, kana.char + 'っ'), false, `Strict ${kana.char} rejects a clipped syllable`);
            if (kana.char === 'ん') {
                for (const transcript of ['うん', 'un']) check(DojoVoice.matches(strictTarget, transcript), false, 'Strict ん rejects syllable-only nasal alias ' + transcript);
            }
        }
    }
}

// Exercise the real final-result path with a minimal native recognition double.
// Interims cannot award credit; final alternatives are judged once, and feedback
// retains the vendor transcript while identifying the sound actually heard.
const source = fs.readFileSync(path.join(__dirname, 'taekwondo-voice.js'), 'utf8');
function recognize(target, transcripts, interim = null) {
    const instances = [], results = [], errors = [], timers = new Map();
    let timerId = 0;
    class Recognition {
        constructor() { instances.push(this); }
        start() {}
        stop() {}
        abort() {}
    }
    const sandbox = {
        SpeechRecognition: Recognition, isSecureContext: true, navigator: {},
        performance: { now: () => 100 },
        setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
        clearTimeout(id) { timers.delete(id); },
        addEventListener() {}, removeEventListener() {},
        document: { hidden: false, addEventListener() {}, removeEventListener() {} }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox);
    const voice = new sandbox.DojoVoice({ onResult: result => results.push(result), onError: error => errors.push(error) });
    check(voice.start(target), true, 'A valid reading question starts');
    const rec = instances[0];
    rec.onstart();
    function resultEvent(texts, isFinal) {
        const group = texts.map(transcript => ({ transcript, confidence: 0.8 }));
        group.isFinal = isFinal;
        return { resultIndex: 0, results: [group] };
    }
    if (interim !== null) {
        rec.onresult(resultEvent([interim], false));
        check(results.length, 0, 'Even a matching interim cannot grade');
    }
    rec.onresult(resultEvent(transcripts, true));
    voice.destroy();
    return { results, errors };
}

for (const script of ['hiragana', 'katakana']) {
    for (const [index, kana] of KANA.entries()) {
        const target = question(kana, script);
        const variants = [katakana(kana.char), kana.romaji, held(kana).at(-1), (homophones[kana.char] || [kana.char])[0], ...(heldHomophones[kana.char] || [])];
        if (kana.char === 'ん') variants.push('un', 'うん');
        for (const transcript of variants) {
            const { results, errors } = recognize(target, [transcript], transcript);
            check(errors.length, 0, `${script} ${kana.char}/${transcript}: no recognition error`);
            check(results.length, 1, `${script} ${kana.char}/${transcript}: one final grade`);
            check(results[0]?.correct, true, `${script} ${kana.char}/${transcript}: correct final`);
            check(results[0]?.recognizedKana, kana.char, `${script} ${kana.char}/${transcript}: correct heard sound`);
            check(results[0]?.transcript, transcript, `${script} ${kana.char}/${transcript}: preserve vendor spelling`);
        }
        const other = KANA[(index + 7) % KANA.length];
        const { results, errors } = recognize(target, [other.char]);
        check(errors.length, 0, `${script} ${kana.char}: clear wrong kana is graded`);
        check(results.length, 1, `${script} ${kana.char}: one incorrect grade`);
        check(results[0]?.correct, false, `${script} ${kana.char}: different sound is incorrect`);
        check(results[0]?.recognizedKana === kana.char, false, `${script} ${kana.char}: feedback never invents expected sound`);
        if (other.char !== 'お') check(results[0]?.recognizedKana, other.char, `${script} ${kana.char}: feedback identifies ${other.char}`);
    }
}
for (const script of ['hiragana', 'katakana']) {
    const target = question(KANA.find(kana => kana.char === 'ん'), script);
    const { results, errors } = recognize(target, ['意味不明', 'un']);
    check(errors.length, 0, `${script} ん: a later correct alternative is usable`);
    check(results[0]?.correct, true, `${script} ん: later alternative grades correctly`);
    check(results[0]?.transcript, 'un', `${script} ん: final feedback uses matching alternative`);

    const wrong = recognize(question(KANA.find(kana => kana.char === 'か'), script), ['意味不明', 'し']);
    check(wrong.errors.length, 0, `${script}: known wrong alternative grades without a service error`);
    check(wrong.results[0]?.correct, false, `${script}: known wrong alternative remains incorrect`);
    check(wrong.results[0]?.transcript, 'し', `${script}: feedback chooses the known wrong sound over unknown top text`);
    check(wrong.results[0]?.recognizedKana, 'し', `${script}: feedback identifies the wrong recognized sound`);

    const ambiguous = recognize(question(KANA.find(kana => kana.char === 'き'), script), ['火']);
    check(ambiguous.results.length, 0, `${script}: ambiguous 火 cannot penalize an unrelated target`);
    check(ambiguous.errors[0]?.code, 'no-match', `${script}: ambiguous 火 requests a retry`);

    for (const transcript of ['工', '有', '生', '封', '名', '毛', '陽']) {
        const outcome = recognize(question(KANA.find(kana => kana.char === 'ら'), script), [transcript]);
        check(outcome.results.length, 0, `${script}: ambiguous ${transcript} cannot penalize an unrelated target`);
        check(outcome.errors[0]?.code, 'no-match', `${script}: ambiguous ${transcript} requests a retry`);
    }
}
if (failures.length) {
    console.error(`${failures.length} of ${checks} syllable checks failed:\n` + failures.slice(0, 35).join('\n') + (failures.length > 35 ? '\n…additional failures omitted' : ''));
    process.exitCode = 1;
} else {
    console.log(`PASS ${checks} syllable checks across all 46 hiragana and katakana. Live microphone/provider recognition remains a device check.`);
}
