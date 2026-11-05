/* Focused pronunciation-boundary regressions; no microphone or learner saves. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sandbox = {};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'taekwondo-voice.js'), 'utf8'), sandbox);
const Voice = sandbox.DojoVoice;
let checks = 0;
function check(question, transcript, expected) {
    assert.equal(Voice.matches(question, transcript), expected,
        JSON.stringify({ prompt: question.expectedKana || question.prompt, transcript, expected }));
    checks++;
}
const kana = prompt => ({ mode: 'kana-read', prompt });
const word = (expectedKana, reading) => ({ mode: 'word-read', expectedKana, reading });

for (const [prompt, vowel] of [['な', 'a'], ['に', 'i'], ['ぬ', 'u'], ['ね', 'e'], ['の', 'o']]) {
    check(kana(prompt), 'n' + vowel, true);
    for (const separator of ["'", '’', '‘', 'ʼ']) check(kana(prompt), 'n' + separator + vowel, false);
    check(word('ん' + { a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お' }[vowel]), "n'" + vowel, true);
}
for (const [expectedKana, reading, other] of [
    ['しんや', "shin'ya", 'shinya'], ['しにゃ', 'shinya', "shin'ya"],
    ['かんい', "kan'i", 'kani'], ['かに', 'kani', "kan'i"]
]) {
    check(word(expectedKana, reading), reading, true);
    check(word(expectedKana, reading), other, false);
}
check(word('しんや', "shin'ya"), '「SHIN’YA」！', true);
check(word('しんや', "shin'ya"), "shin ' ya", true);
check(word('しにゃ', 'shinya'), "shin ' ya", false);
for (const transcript of ['n', 'nn', "n'", 'Ｎ', 'ｎｎ', 'N’']) check(kana('ん'), transcript, true);
for (const transcript of ["'n'", "'nn'", "'n''", '‘nn’']) check(kana('ん'), transcript, true);
check(kana('な'), "n',a", false);
check(word('んあ'), "n',a", true);

for (const [expectedKana, transcript] of [
    ['こんにちは', 'konnichiha'], ['きんいろ', "kin'iro"],
    ['あんない', 'annai'], ['こんにゃく', 'konnyaku'],
    ['まっちゃ', 'matcha'], ['まっちゃ', 'maccha'],
    ['こっち', 'kotchi'], ['こっち', 'kocchi'], ['いっしょ', 'issho']
]) check(word(expectedKana), transcript, true);
for (const [expectedKana, transcript] of [
    ['まちゃ', 'matcha'], ['こち', 'kotchi'], ['きにろ', "kin'iro"],
    ['こんにちは', 'konichiha'], ['こんにゃく', "kon'yaku"]
]) check(word(expectedKana), transcript, false);

for (const [prompt, number] of [['に', '2'], ['し', '4'], ['く', '9']]) {
    for (const transcript of [number, '「' + number + '」！', '（' + number + '）']) check(kana(prompt), transcript, true);
    for (const sign of ['-', '－', '−', '‐', '+']) check(kana(prompt), sign + number, false);
    for (const separator of ['/', '\\', '_', '-']) check(kana(prompt), number + separator, false);
}
for (const separator of ['/', '\\', '_', '-', '+', '|']) {
    check(kana('し'), 's' + separator + 'hi', false);
    check(word('かな', 'kana'), 'ka' + separator + 'na', false);
}
for (const transcript of ['「シ」！', "'SHI'", '　ｼ。 ', '（し）']) check(kana('し'), transcript, true);
for (const transcript of ['ねこです', 'ねこ/いぬ', 'catねこ', 'ねご', 'ね']) check(word('ねこ', 'neko'), transcript, false);

console.log(checks + ' pronunciation boundary checks passed. Live microphone recognition is not exercised.');
