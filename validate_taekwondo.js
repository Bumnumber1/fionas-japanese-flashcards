'use strict';
// Run with node validate_taekwondo.js. Exercises the rules and the real lesson data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const dojo = require('./taekwondo-engine.js');
let passed = 0;
function test(name, callback) {
  try { callback(); passed++; console.log('PASS ' + name); }
  catch (error) { console.error('FAIL ' + name); throw error; }
}
const sandbox = { window: {} };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const filename of ['curriculum_y1.js', 'year1-review-data.js', 'garden-material.js', 'kanjivg_data.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, filename), 'utf8'), sandbox, { filename });
}
const words = sandbox.Year1Review.catalog.words;
const advancedForms = [['きんいろ', '金色'], ['みずいろ', '水色'], ['とけい', '時計'], ['ほしぞら', '星空'], ['きょう', '今日'], ['せんせい', '先生']];
const material = { words, kanji: sandbox.GardenMaterial.build(words.map(word => word.id)).kanji,
  advancedKanji: advancedForms.map(([read, char]) => ({ read, char, mean: words.find(word => word.jp === read).en })) };
function win(progress, index = progress.belt, assisted = false) {
  const fight = dojo.startFight(progress, index);
  const earnedBelt = progress.belt;
  for (let attempt = 0; fight.status === 'fighting' && attempt < 64; attempt++) {
    dojo.resolveAnswer(fight, { correct: true, assisted });
    assert.equal(progress.belt, earnedBelt, 'Answering activities never changes the earned belt');
  }
  assert.equal(fight.won, true);
  return fight;
}
function rngSequence() { let state = 4817; return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296); }

test('Eleven belts, seven basics, ten belt specials, and eleven visually varied opponents', () => {
  assert.equal(dojo.BELTS.length, 11); assert.equal(dojo.MOVES.length, 17); assert.equal(dojo.OPPONENTS.length, 11);
  assert.equal(new Set(dojo.BELTS.map(belt => belt.color)).size, 11);
  assert.equal(new Set(dojo.OPPONENTS.map(opponent => opponent.name)).size, 11);
  assert.ok(new Set(dojo.OPPONENTS.map(opponent => opponent.skin)).size >= 6);
  assert.ok(dojo.OPPONENTS.some(opponent => opponent.gender === 'female'));
  assert.ok(dojo.OPPONENTS.some(opponent => opponent.gender === 'male'));
});
test('All 46 hiragana pairs match the existing writing lesson', () => {
  const writing = fs.readFileSync(path.join(__dirname, 'writing.html'), 'utf8');
  const data = writing.slice(writing.indexOf('const hiraganaData = ['), writing.indexOf('// Row names for the grid'));
  const pairs = [...data.matchAll(/char: '([^']+)', romaji: '([^']+)'/g)].map(match => [match[1], match[2]]);
  assert.equal(pairs.length, 46);
  assert.deepEqual(dojo.KANA.map(kana => [kana.char, kana.romaji]), pairs);
});
test('All 46 katakana pairs match the existing writing lesson, including pronunciation aliases', () => {
  const writing = fs.readFileSync(path.join(__dirname, 'writing.html'), 'utf8');
  const data = writing.slice(writing.indexOf('const katakanaData = ['));
  const pairs = [...data.matchAll(/char: '([^']+)', romaji: '([^']+)'/g)].slice(0, 46).map(match => [match[1], match[2]]);
  assert.deepEqual(dojo.KATAKANA.map(kana => [kana.char, kana.romaji]), pairs);
  assert.equal(new Set(dojo.KATAKANA.map(kana => kana.char)).size, 46);
  for (const kana of dojo.KATAKANA) {
    for (const alias of kana.aliases) assert.equal(dojo.acceptsReading({ mode: 'kana-read', prompt: kana.char }, alias), true);
    assert.equal(dojo.acceptsReading({ mode: 'kana-read', prompt: kana.char }, 'wrong'), false);
  }
});
test('Each kana script has two reading and two writing belts with expanding 23/46 pools', () => {
  for (const script of ['hiragana', 'katakana']) {
    for (const mode of ['kana-read', 'kana-write']) {
      const belts = dojo.BELTS.filter(belt => belt.script === script && belt.mode === mode);
      assert.deepEqual(belts.map(belt => belt.kanaCount), [23, 46]);
    }
  }
  assert.deepEqual(dojo.BELTS.slice(8).map(belt => belt.mode), ['word-read', 'word-read', 'kanji-write']);
});
test('Every offered hiragana, katakana, and kanji has local KanjiVG stroke coverage', () => {
  const characters = dojo.KANA.concat(dojo.KATAKANA).map(kana => kana.char).concat(material.kanji.flatMap(form => [...form.char]), material.advancedKanji.flatMap(form => [...form.char]));
  assert.ok(new Set(characters).size >= 61);
  for (const character of characters) {
    const strokes = sandbox.KVG_DATA[character];
    assert.ok(Array.isArray(strokes) && strokes.length, character + ' needs offline stroke data');
    assert.ok(strokes.every(stroke => typeof stroke === 'string' && /^[Mm]/.test(stroke)), character + ' stroke paths');
  }
});
test('Reading accepts standard romanization alternatives and fullwidth text', () => {
  for (const [char, answers] of [['し', ['shi', 'si', 'ＳＨＩ']], ['ち', ['chi', 'ti']], ['つ', ['tsu', 'tu']],
    ['ふ', ['fu', 'hu']], ['を', ['wo', 'o']], ['ん', ['n', "n'", 'nn']]]) {
    const question = { mode: 'kana-read', prompt: char };
    for (const answer of answers) assert.equal(dojo.acceptsReading(question, ' ' + answer + ' '), true, char + ': ' + answer);
    assert.equal(dojo.acceptsReading(question, ''), false); assert.equal(dojo.acceptsReading(question, 'wrong'), false);
  }
  assert.equal(dojo.acceptsReading({ mode: 'kana-write', prompt: 'あ' }, 'a'), false);
  assert.equal(dojo.normalizeAnswer(null), '');
});
test('Question pools expand and do not reveal writing answers in prompts', () => {
  for (let belt = 0; belt < 8; belt++) {
    const ids = [], count = dojo.BELTS[belt].kanaCount;
    for (let n = 0; n < count; n++) {
      const question = dojo.createQuestion(belt, material, ids, () => 0);
      assert.ok(!ids.includes(question.id)); ids.push(question.id);
      assert.equal(question.script, dojo.BELTS[belt].script);
      if (belt >= 4) { assert.equal(question.mode, 'kana-write'); assert.ok(!question.prompt.includes(question.answer)); }
      else { assert.equal(question.mode, 'kana-read'); assert.equal(dojo.acceptsReading(question, question.answer), true); }
    }
    assert.equal(ids.length, count);
    assert.ok(dojo.createQuestion(belt, material, ids, () => 1));
  }
});
test('Word questions use canonical material and four unique meanings', () => {
  const rng = rngSequence();
  for (const belt of [8, 9]) {
    const recent = [];
    for (let i = 0; i < 50; i++) {
      const question = dojo.createQuestion(belt, material, recent.slice(-8), rng);
      assert.equal(question.mode, 'word-read');
      const word = words.find(word => word.jp === question.prompt);
      assert.ok(word); assert.equal(question.answer, word.en);
      if (belt === 8) assert.ok(word.week <= 6);
      assert.equal(question.choices.length, 4);
      assert.equal(new Set(question.choices.map(dojo.normalizeAnswer)).size, 4);
      assert.equal(question.choices.filter(choice => choice === question.answer).length, 1);
      for (const choice of question.choices) assert.ok(words.some(word => word.en === choice));
      assert.ok(!recent.slice(-8).includes(question.id)); recent.push(question.id);
    }
  }
});
test('Kanji writing uses every established garden form and hides its character/reading', () => {
  assert.equal(material.kanji.length, 15);
  const recent = [];
  for (let n = 0; n < material.kanji.length; n++) {
    const question = dojo.createQuestion(10, material, recent, () => 0);
    const form = material.kanji.find(form => form.char === question.answer);
    assert.ok(form); assert.equal(question.reading, form.read); assert.equal(question.meaning, form.mean);
    assert.equal(question.prompt, form.mean); assert.ok(!question.prompt.includes(question.answer));
    assert.ok(!question.prompt.includes(question.reading)); assert.ok(!recent.includes(question.id));
    assert.deepEqual(question.chars, [...form.char]); recent.push(question.id);
  }
  assert.equal(new Set(recent).size, 15);
  assert.throws(() => dojo.createQuestion(10, { words, kanji: [{ char: '偽', read: 'unlearned', mean: 'fake' }] }));
});
test('Random endpoint and malformed material handling never selects undefined', () => {
  for (const rng of [() => 0, () => 1, () => -1, () => Infinity, () => NaN, () => { throw Error('rng'); }]) {
    for (let belt = 0; belt < 11; belt++) assert.ok(dojo.createQuestion(belt, material, [], rng).answer);
  }
  assert.throws(() => dojo.createQuestion(8, {})); assert.throws(() => dojo.createQuestion(10, {}));
  assert.throws(() => dojo.createQuestion(8, { words: [{ jp: 'あ', en: 'same' }, { jp: 'い', en: 'same' }] }));
});
test('Clean streaks build damage, third answers combo, and mistakes reset them', () => {
  const fight = dojo.startFight(dojo.createProgress());
  const a = dojo.resolveAnswer(fight, { correct: true, move: 'front-kick' });
  const b = dojo.resolveAnswer(fight, { correct: true });
  const c = dojo.resolveAnswer(fight, { correct: true });
  assert.equal(a.opponentDamage, 14); assert.equal(b.opponentDamage, 17); assert.equal(c.opponentDamage, 29);
  assert.equal(c.combo, true); assert.equal(fight.bestStreak, 3);
  const mistake = dojo.resolveAnswer(fight, { correct: false });
  assert.equal(mistake.playerDamage, 0); assert.equal(mistake.counterQueued, true); assert.equal(fight.streak, 0); assert.equal(fight.playerHp, 100);
  assert.equal(fight.pendingDamage, 10);
  const block = dojo.resolveAnswer(fight, { correct: true });
  assert.equal(block.blocked, true); assert.equal(block.blockedDamage, 10); assert.equal(block.opponentDamage, 0); assert.equal(fight.streak, 0);
  assert.equal(dojo.resolveAnswer(fight, { correct: true }).opponentDamage, 14);
});
test('Reading speed tiers use positive finite milliseconds and inclusive two/four second thresholds', () => {
  for (const readingMs of [Number.MIN_VALUE, 1, 1999.999, 2000]) {
    assert.deepEqual(dojo.readingSpeedBonus(readingMs), { speedBonus: 6, speedTier: 'lightning' });
  }
  for (const readingMs of [2000.001, 3000, 4000]) {
    assert.deepEqual(dojo.readingSpeedBonus(readingMs), { speedBonus: 3, speedTier: 'quick' });
  }
  for (const readingMs of [undefined, null, '', '1000', 0, -1, Infinity, -Infinity, NaN, 4000.001, 10000]) {
    assert.deepEqual(dojo.readingSpeedBonus(readingMs), { speedBonus: 0, speedTier: '' });
  }
});
test('Fast kana and word readings gain real damage, with no bonus for absent or invalid timing', () => {
  for (const belt of [0, 1, 2, 3, 8, 9]) {
    for (const [readingMs, speedBonus, speedTier] of [[1000, 6, 'lightning'], [2000, 6, 'lightning'], [2001, 3, 'quick'], [4000, 3, 'quick'], [4001, 0, '']]) {
      const progress = dojo.createProgress(); progress.belt = belt;
      const fight = dojo.startFight(progress);
      const outcome = dojo.resolveAnswer(fight, { correct: true, readingMs });
      assert.equal(outcome.speedBonus, speedBonus); assert.equal(outcome.speedTier, speedTier);
      assert.equal(outcome.opponentDamage, 14 + speedBonus); assert.equal(fight.opponentHp, 86 - speedBonus);
      assert.equal(fight.journal[0].readingMs, readingMs);
    }
  }
  for (const readingMs of [undefined, null, '1000', 0, -10, NaN, Infinity]) {
    const fight = dojo.startFight(dojo.createProgress());
    const outcome = dojo.resolveAnswer(fight, { correct: true, readingMs });
    assert.equal(outcome.opponentDamage, 14); assert.equal(outcome.speedBonus, 0); assert.equal(outcome.speedTier, '');
    assert.ok(!Object.prototype.hasOwnProperty.call(fight.journal[0], 'readingMs'));
  }
  assert.equal(dojo.resolveAnswer(null, { correct: true, readingMs: 1 }).speedBonus, 0);
  assert.equal(dojo.resolveAnswer(null, { correct: true, readingMs: 1 }).speedTier, '');
});
test('Speed damage stacks with clean combos and earned specials before the remaining-health cap', () => {
  const progress = dojo.createProgress(); progress.belt = 9;
  const fight = dojo.startFight(progress, 0);
  const first = dojo.resolveAnswer(fight, { correct: true, readingMs: 1000 });
  const second = dojo.resolveAnswer(fight, { correct: true, readingMs: 3000 });
  const combo = dojo.resolveAnswer(fight, { correct: true, readingMs: 1500 });
  assert.equal(first.opponentDamage, 20); assert.equal(second.opponentDamage, 20);
  assert.equal(combo.combo, true); assert.equal(combo.opponentDamage, 35); assert.equal(combo.speedBonus, 6);
  const finisher = dojo.resolveAnswer(fight, { correct: true, readingMs: 1200, move: 'whirlwind-combo', challengeKind: 'special' });
  assert.equal(finisher.specialBonus, 25); assert.equal(finisher.speedBonus, 6); assert.equal(finisher.speedTier, 'lightning');
  assert.equal(finisher.opponentDamage, 25); assert.equal(fight.opponentHp, 0); assert.equal(finisher.won, true);
  assert.equal(dojo.resolveAnswer(fight, { correct: true, readingMs: 1000 }).speedBonus, 0);
});
test('Writing, hints, mistakes, and defensive answers never earn reading speed damage', () => {
  for (const belt of [4, 5, 6, 7, 10]) {
    const progress = dojo.createProgress(); progress.belt = belt;
    const fight = dojo.startFight(progress);
    const outcome = dojo.resolveAnswer(fight, { correct: true, readingMs: 1000 });
    assert.equal(outcome.opponentDamage, 14); assert.equal(outcome.speedBonus, 0); assert.equal(outcome.speedTier, '');
    assert.ok(!Object.prototype.hasOwnProperty.call(fight.journal[0], 'readingMs'));
  }
  for (const [correct, assisted] of [[true, true], [false, false], [false, true]]) {
    const fight = dojo.startFight(dojo.createProgress());
    const outcome = dojo.resolveAnswer(fight, { correct, assisted, readingMs: 1000 });
    assert.equal(outcome.speedBonus, 0); assert.equal(outcome.speedTier, '');
    assert.equal(outcome.opponentDamage, correct ? 7 : 0);
    assert.ok(!Object.prototype.hasOwnProperty.call(fight.journal[0], 'readingMs'));
  }
  for (const correct of [true, false]) {
    const fight = dojo.startFight(dojo.createProgress());
    dojo.resolveAnswer(fight, { correct: false });
    const outcome = dojo.resolveAnswer(fight, { correct, readingMs: 1000 });
    assert.equal(outcome.defensive, true); assert.equal(outcome.opponentDamage, 0); assert.equal(outcome.speedBonus, 0); assert.equal(outcome.speedTier, '');
    assert.ok(!Object.prototype.hasOwnProperty.call(fight.journal[1], 'readingMs'));
  }
});
test('A failed block applies only the queued counter and the next answer attacks', () => {
  const fight = dojo.startFight(dojo.createProgress());
  const queued = dojo.resolveAnswer(fight, { correct: false });
  assert.equal(queued.counterQueued, true); assert.equal(queued.blockChance, true); assert.equal(queued.pendingDamage, 10);
  assert.equal(queued.playerDamage, 0); assert.equal(fight.playerHp, 100);
  const failed = dojo.resolveAnswer(fight, { correct: false });
  assert.equal(failed.defensive, true); assert.equal(failed.blockFailed, true); assert.equal(failed.playerDamage, 10);
  assert.equal(failed.counterQueued, false); assert.equal(failed.blockChance, false); assert.equal(fight.pendingDamage, 0);
  assert.equal(fight.playerHp, 90); assert.equal(fight.mistakes, 2);
  const attack = dojo.resolveAnswer(fight, { correct: true });
  assert.equal(attack.defensive, false); assert.equal(attack.opponentDamage, 14); assert.equal(fight.playerHp, 90);
  const laterQueue = dojo.resolveAnswer(fight, { correct: false });
  assert.equal(laterQueue.pendingDamage, 14); assert.equal(fight.playerHp, 90);
});
test('Assisted defense fully blocks, earns learning credit, and never attacks or combos', () => {
  const fight = dojo.startFight(dojo.createProgress());
  dojo.resolveAnswer(fight, { correct: false });
  const blocked = dojo.resolveAnswer(fight, { correct: true, assisted: true, move: 'tornado-kick' });
  assert.equal(blocked.blocked, true); assert.equal(blocked.blockedDamage, 10);
  assert.equal(blocked.playerDamage, 0); assert.equal(blocked.opponentDamage, 0); assert.equal(blocked.streak, 0); assert.equal(blocked.combo, false);
  assert.equal(fight.playerHp, 100); assert.equal(fight.opponentHp, 100); assert.equal(fight.blocks, 1); assert.equal(fight.blockedDamage, 10);
  assert.equal(fight.correct, 1); assert.equal(fight.assisted, 1); assert.equal(fight.pendingDamage, 0);
  assert.equal(dojo.completeFight(dojo.createProgress(), fight).promoted, false);
});
test('Belt changes only when an actual defeated opponent is recorded', () => {
  const progress = dojo.createProgress(), fight = dojo.startFight(progress);
  dojo.resolveAnswer(fight, { correct: false });
  assert.equal(progress.belt, 0); assert.equal(dojo.completeFight(progress, fight).promoted, false);
  dojo.resolveAnswer(fight, { correct: true });
  assert.equal(progress.belt, 0); assert.equal(dojo.completeFight(progress, fight).promoted, false);
  while (fight.status === 'fighting') {
    dojo.resolveAnswer(fight, { correct: true }); assert.equal(progress.belt, 0);
  }
  assert.equal(fight.opponentHp, 0); assert.equal(progress.belt, 0);
  assert.equal(dojo.completeFight(progress, fight).promoted, true); assert.equal(progress.belt, 1);
});
test('Assistance gives half base damage, resets streak, and never grants combos', () => {
  const progress = dojo.createProgress(); progress.belt = 10;
  const fight = dojo.startFight(progress);
  dojo.resolveAnswer(fight, { correct: true }); dojo.resolveAnswer(fight, { correct: true });
  const result = dojo.resolveAnswer(fight, { correct: true, assisted: true, move: 'tornado-kick' });
  assert.equal(result.opponentDamage, 7); assert.equal(result.streak, 0); assert.equal(result.combo, false);
  assert.equal(fight.assisted, 1); assert.equal(fight.bestStreak, 2);
});
test('Locked or invented moves cannot grant extra damage', () => {
  const fight = dojo.startFight(dojo.createProgress());
  assert.equal(dojo.availableMoves(0).length, 7); assert.equal(dojo.availableMoves(10).length, 17);
  const result = dojo.resolveAnswer(fight, { correct: true, move: 'tornado-kick' });
  assert.equal(result.move.id, 'front-kick'); assert.equal(result.opponentDamage, 14);
  assert.equal(dojo.resolveAnswer(fight, { correct: true, move: { id: 'made-up', bonus: 1000 } }).move.id, 'front-kick');
  const progress = dojo.createProgress(); progress.belt = 8;
  const advanced = dojo.resolveAnswer(dojo.startFight(progress), { correct: true, move: 'tornado-kick' });
  assert.equal(advanced.opponentDamage, 14, 'A harder technique cannot gain bonus damage from a basic question');
});
test('Every basic is available at white belt with equal base damage', () => {
  const basics = dojo.availableMoves(0);
  assert.deepEqual(basics.map(move => move.id), ['punch', 'front-kick', 'roundhouse', 'side-kick', 'axe-kick', 'turning-kick', 'back-kick']);
  for (const move of basics) {
    assert.equal(move.kind, 'basic'); assert.equal(move.unlock, 0); assert.equal(move.bonus, 0); assert.equal(move.baseDamage, 14);
    const question = dojo.createQuestion(0, material, [], () => 0, move.id);
    assert.equal(question.techniqueId, move.id); assert.equal(question.challengeKind, 'basic'); assert.equal(question.chars.length, 1);
    const result = dojo.resolveAnswer(dojo.startFight(dojo.createProgress()), { correct: true, move: move.id, challengeKind: 'special' });
    assert.equal(result.opponentDamage, 14); assert.equal(result.specialBonus, 0);
  }
});
test('Each earned belt unlocks exactly one stronger special technique', () => {
  const specials = dojo.MOVES.filter(move => move.kind === 'special');
  assert.equal(specials.length, 10);
  for (let belt = 1; belt <= 10; belt++) {
    const added = dojo.availableMoves(belt).filter(move => !dojo.availableMoves(belt - 1).some(previous => previous.id === move.id));
    assert.equal(added.length, 1); assert.equal(added[0], specials[belt - 1]);
    assert.equal(added[0].unlock, belt); assert.ok(added[0].bonus >= 10);
    if (belt > 1) assert.ok(added[0].bonus > specials[belt - 2].bonus);
    const progress = dojo.createProgress(); progress.belt = belt;
    const question = dojo.createQuestion(belt, material, [], () => 0, added[0].id);
    assert.equal(question.techniqueId, added[0].id); assert.equal(question.difficulty, 'special'); assert.equal(question.challengeKind, 'special');
    const answer = { correct: true, move: question.techniqueId, challengeKind: question.challengeKind };
    const outcome = dojo.resolveAnswer(dojo.startFight(progress), answer);
    assert.equal(outcome.opponentDamage, 14 + added[0].bonus);
    const easy = dojo.resolveAnswer(dojo.startFight(progress), { ...answer, challengeKind: 'basic' });
    assert.equal(easy.opponentDamage, 14); assert.equal(easy.specialBonus, 0);
    const guided = dojo.resolveAnswer(dojo.startFight(progress), { ...answer, assisted: true });
    assert.equal(guided.opponentDamage, Math.floor((14 + added[0].bonus) / 2)); assert.equal(guided.combo, false);
  }
});
test('Specials use harder real lesson material in the same learning mode', () => {
  for (let belt = 1; belt <= 10; belt++) {
    for (const move of dojo.availableMoves(belt).filter(move => move.kind === 'special')) {
      const recent = [];
      for (let attempt = 0; attempt < 20; attempt++) {
        const question = dojo.createQuestion(belt, material, recent.slice(-6), rngSequence(), move.id);
        assert.equal(question.mode, dojo.BELTS[belt].mode); assert.equal(question.difficulty, 'special');
        assert.equal(question.techniqueId, move.id); assert.ok(question.challengeLabel);
        if (belt <= 7) {
          const kanaWord = question.mode === 'kana-read' ? question.prompt : question.answer;
          assert.ok(words.some(word => word.jp === kanaWord), kanaWord + ' is canonical vocabulary');
          assert.ok([...kanaWord].length >= 2);
          const script = dojo.BELTS[belt].script === 'katakana' ? dojo.KATAKANA : dojo.KANA;
          const taught = new Set(script.slice(0, dojo.BELTS[belt].kanaCount).map(kana => kana.char));
          assert.ok([...kanaWord].every(char => taught.has(char)), 'No untaught kana');
          assert.deepEqual(question.chars, [...kanaWord]);
          if (question.mode === 'kana-read') assert.equal(dojo.acceptsReading(question, question.answer), true);
          else assert.ok(!question.prompt.includes(question.answer), 'Writing answer stays hidden');
        } else if (belt <= 9) {
          assert.ok(words.some(word => word.jp === question.prompt)); assert.ok([...question.prompt].length >= 4);
          assert.equal(new Set(question.choices).size, 4);
        } else {
          assert.ok(material.advancedKanji.some(form => form.char === question.answer));
          assert.ok(question.chars.length >= 2); assert.ok(!question.prompt.includes(question.answer));
          assert.ok(question.chars.every(char => sandbox.KVG_DATA[char]));
        }
        recent.push(question.id);
      }
    }
  }
  for (const belt of [8, 9]) {
    for (let attempt = 0; attempt < 100; attempt++) assert.ok([...dojo.createQuestion(belt, material).prompt].length <= 3);
  }
});
test('Locked specials cannot provide harder question metadata or extra damage', () => {
  for (let belt = 0; belt < 10; belt++) {
    const locked = dojo.MOVES.find(move => move.kind === 'special' && move.unlock === belt + 1);
    const question = dojo.createQuestion(belt, material, [], () => 0, locked.id);
    assert.equal(question.techniqueId, 'front-kick'); assert.equal(question.challengeKind, 'basic');
    const progress = dojo.createProgress(); progress.belt = belt;
    const result = dojo.resolveAnswer(dojo.startFight(progress), { correct: true, move: locked.id, challengeKind: 'special' });
    assert.equal(result.move.id, 'front-kick'); assert.equal(result.opponentDamage, 14);
  }
});
test('Earned specials remain available while replaying an earlier rival', () => {
  const progress = dojo.createProgress(); progress.belt = 10;
  const fight = dojo.startFight(progress, 0);
  const question = dojo.createQuestion(0, material, [], () => 0, 'dragon-finisher', progress.belt);
  assert.equal(question.mode, 'kana-read'); assert.equal(question.techniqueId, 'dragon-finisher');
  assert.equal(question.challengeKind, 'special'); assert.ok([...question.prompt].length >= 2);
  const taught = new Set(dojo.KANA.slice(0, 23).map(kana => kana.char));
  assert.ok([...question.prompt].every(char => taught.has(char)), 'Earlier rival keeps its original taught kana');
  assert.ok(words.some(word => word.jp === question.prompt));
  const answer = { correct: true, move: question.techniqueId, challengeKind: question.challengeKind };
  assert.equal(dojo.resolveAnswer(fight, answer).opponentDamage, 46);
  const restored = dojo.sanitizeFight(JSON.parse(JSON.stringify(fight)), progress);
  assert.ok(restored); assert.equal(restored.opponentHp, 54); assert.equal(restored.originBelt, 10); assert.equal(restored.beltIndex, 0);
  assert.equal(dojo.resolveAnswer(restored, answer).opponentDamage, 49);
  const fresh = dojo.startFight(dojo.createProgress());
  assert.equal(dojo.resolveAnswer(fresh, answer).opponentDamage, 14);
  assert.equal(dojo.createQuestion(0, material, [], () => 0, 'dragon-finisher').challengeKind, 'basic');
  const legacy = { version: dojo.SAVE_VERSION, rulesVersion: 2, beltIndex: 0, originBelt: 8,
    journal: [{ correct: true, assisted: false, move: 'tornado-kick' }] };
  assert.equal(dojo.sanitizeFight(legacy, progress), null, 'Version 2 saves keep their old rival-based move rules');
});
test('Earlier opponents still queue special mistakes and a special block never attacks', () => {
  const progress = dojo.createProgress(); progress.belt = 10;
  for (let rival = 0; rival < 10; rival++) {
    const fight = dojo.startFight(progress, rival);
    const mistake = dojo.resolveAnswer(fight, { correct: false, move: 'dragon-finisher', challengeKind: 'special' });
    assert.equal(mistake.playerDamage, 0); assert.equal(fight.pendingDamage, 10);
    assert.equal(mistake.immediateCounter, false); assert.equal(mistake.blockChance, true);
    const block = dojo.resolveAnswer(fight, { correct: true, move: 'dragon-finisher', challengeKind: 'special' });
    assert.equal(block.opponentDamage, 0); assert.equal(block.blockedDamage, 10); assert.equal(fight.streak, 0);
    assert.equal(dojo.resolveAnswer(fight, { correct: true, move: 'dragon-finisher', challengeKind: 'special' }).opponentDamage, 46);
  }
});
test('Master Steif is the final opponent with short grey hair and one-third counters', () => {
  const master = dojo.OPPONENTS[dojo.OPPONENTS.length - 1];
  assert.equal(master.name, 'Master Steif'); assert.equal(master.title, 'The final master');
  assert.equal(master.belt, 'black'); assert.equal(master.beltIndex, 10); assert.equal(master.gender, 'male');
  assert.equal(master.hairstyle, 'crop'); assert.equal(master.hair, '#aeb3b8');
  assert.equal(master.unblockableMistakes, true); assert.equal(master.mistakeDamagePercent, 100 / 3);
  assert.ok(dojo.OPPONENTS.slice(0, -1).every(opponent => !opponent.unblockableMistakes));
});
test('Every Master Steif mistake immediately costs one-third health with no block chance', () => {
  const progress = dojo.createProgress(); progress.belt = 10;
  const fight = dojo.startFight(progress);
  dojo.resolveAnswer(fight, { correct: true }); dojo.resolveAnswer(fight, { correct: true });
  for (let mistake = 1; mistake <= 3; mistake++) {
    const previousHp = fight.playerHp;
    const outcome = dojo.resolveAnswer(fight, { correct: false, assisted: mistake === 2, move: 'dragon-finisher', challengeKind: 'special' });
    assert.equal(outcome.immediateCounter, true); assert.equal(outcome.counterQueued, false);
    assert.equal(outcome.blockChance, false); assert.equal(outcome.defensive, false);
    assert.equal(outcome.blocked, false); assert.equal(outcome.blockFailed, false);
    assert.equal(outcome.playerDamage, Math.min(previousHp, 100 / 3));
    assert.equal(outcome.opponentDamage, 0); assert.equal(outcome.combo, false);
    assert.equal(fight.pendingDamage, 0); assert.equal(fight.blocks, 0); assert.equal(fight.streak, 0);
    assert.ok(Math.abs(fight.playerHp - Math.max(0, 100 - mistake * 100 / 3)) < 1e-10);
    assert.equal(fight.mistakes, mistake); assert.equal(fight.lost, mistake === 3);
    const restored = dojo.sanitizeFight(JSON.parse(JSON.stringify(fight)), progress);
    assert.ok(restored); assert.equal(restored.playerHp, fight.playerHp); assert.equal(restored.pendingDamage, 0);
    assert.equal(restored.lost, fight.lost); assert.equal(restored.mistakes, mistake);
  }
  assert.equal(fight.playerHp, 0); assert.equal(fight.opponentHp, 69);
  const result = dojo.completeFight(progress, fight);
  assert.equal(result.lost, true); assert.equal(result.promoted, false); assert.equal(result.mastered, false);
  assert.equal(progress.belt, 10); assert.equal(progress.losses, 1); assert.equal(progress.rewards.kanji.unlocked, false);
  assert.equal(dojo.resolveAnswer(fight, { correct: false }).resolved, false);
});
test('Correct answers against Master Steif attack normally after a mistake, including assistance', () => {
  const progress = dojo.createProgress(); progress.belt = 10;
  const fight = dojo.startFight(progress);
  const mistake = dojo.resolveAnswer(fight, { correct: false });
  assert.equal(mistake.immediateCounter, true);
  const guided = dojo.resolveAnswer(fight, { correct: true, assisted: true, move: 'dragon-finisher', challengeKind: 'special' });
  assert.equal(guided.opponentDamage, 23); assert.equal(guided.playerDamage, 0); assert.equal(guided.immediateCounter, false);
  assert.equal(guided.defensive, false); assert.equal(guided.streak, 0); assert.equal(fight.assisted, 1);
  const attack = dojo.resolveAnswer(fight, { correct: true });
  assert.equal(attack.opponentDamage, 14); assert.equal(attack.streak, 1); assert.equal(attack.immediateCounter, false);
  assert.equal(fight.playerHp, 100 - 100 / 3); assert.equal(fight.pendingDamage, 0);
});
test('Kanji special fallback separates two known words instead of inventing a compound', () => {
  const fallback = dojo.createQuestion(10, { words, kanji: material.kanji }, [], () => 0, 'dragon-finisher');
  assert.equal(fallback.words.length, 2); assert.equal(fallback.answer, fallback.words.join(' / '));
  assert.equal(fallback.reading, fallback.wordReadings.join(' / ')); assert.ok(fallback.prompt.includes(' / '));
  assert.ok(fallback.chars.every(char => material.kanji.some(form => form.char === char)));
  const invalid = dojo.createQuestion(10, { ...material, advancedKanji: [{ char: '偽語', read: 'unlearned', mean: 'fake' }] }, [], () => 0, 'dragon-finisher');
  assert.ok(!invalid.answer.includes('偽')); assert.equal(invalid.words.length, 2);
});
test('Increasing mistakes cause defeat without promotion, rematches remain available', () => {
  const progress = dojo.createProgress(), fight = dojo.startFight(progress);
  const damage = [];
  while (!fight.lost) {
    const previousHp = fight.playerHp;
    const outcome = dojo.resolveAnswer(fight, { correct: false });
    if (outcome.counterQueued) { assert.equal(fight.playerHp, previousHp); assert.equal(outcome.playerDamage, 0); }
    else { assert.equal(outcome.blockFailed, true); damage.push(outcome.playerDamage); }
  }
  assert.deepEqual(damage, [10, 14, 18, 22, 24, 12]);
  assert.equal(fight.playerHp, 0); assert.equal(fight.opponentHp, 100);
  const result = dojo.completeFight(progress, fight);
  assert.equal(result.lost, true); assert.equal(result.promoted, false); assert.equal(progress.belt, 0); assert.equal(progress.losses, 1);
  assert.equal(dojo.startFight(progress).playerHp, 100);
  assert.equal(dojo.resolveAnswer(fight, { correct: true }).resolved, false);
});
test('Entire campaign progresses through real fights, with ice cream at black belt', () => {
  const progress = dojo.createProgress();
  const flavors = { reading: 'strawberry', 'katakana-reading': 'matcha', writing: 'vanilla', 'katakana-writing': 'strawberry', words: 'chocolate', kanji: 'matcha' };
  for (let belt = 0; belt < 10; belt++) {
    const fight = win(progress);
    assert.equal(fight.beltIndex, belt);
    const result = dojo.completeFight(progress, fight);
    assert.equal(result.promoted, true); assert.equal(progress.belt, belt + 1);
    assert.equal(progress.iceCreamUnlocked, belt === 9); assert.equal(progress.iceCreamClaimed, false);
    const reward = dojo.REWARDS.find(reward => reward.beltIndex === belt);
    assert.equal(result.rewardUnlocked, Boolean(reward)); assert.equal(result.rewardId, reward ? reward.id : null);
    if (reward) {
      assert.equal(progress.rewards[reward.id].unlocked, true); assert.equal(progress.rewards[reward.id].claimed, false);
      progress.rewards[reward.id].claimed = true; progress.rewards[reward.id].flavor = flavors[reward.id];
    }
    for (const milestone of dojo.REWARDS) {
      assert.equal(progress.rewards[milestone.id].unlocked, milestone.beltIndex <= belt);
    }
    assert.equal(dojo.completeFight(progress, fight).recorded, false);
    assert.equal(progress.wins, belt + 1);
  }
  assert.equal(progress.mastered, false);
  const mastery = dojo.completeFight(progress, win(progress));
  assert.equal(mastery.mastered, true); assert.equal(mastery.promoted, false); assert.equal(progress.belt, 10);
  assert.equal(mastery.rewardId, 'kanji'); assert.equal(mastery.rewardUnlocked, true);
  progress.rewards.kanji.claimed = true; progress.rewards.kanji.flavor = flavors.kanji;
  const restored = dojo.sanitizeProgress(JSON.parse(JSON.stringify(progress)));
  for (const reward of dojo.REWARDS) {
    assert.equal(restored.rewards[reward.id].claimed, true); assert.equal(restored.rewards[reward.id].flavor, flavors[reward.id]);
  }
  assert.equal(restored.iceCreamClaimed, true); assert.equal(restored.flavor, 'chocolate');
  assert.equal(progress.wins, 11); assert.ok(progress.totalCorrect >= 40); assert.ok(progress.bestStreak >= 4);
});
test('Old-stage sparring and inaccessible stage requests do not skip promotions', () => {
  const progress = dojo.createProgress(); progress.belt = 4;
  const result = dojo.completeFight(progress, win(progress, 0));
  assert.equal(result.won, true); assert.equal(result.promoted, false); assert.equal(progress.belt, 4);
  assert.equal(dojo.startFight(progress, 8).beltIndex, 4);
});
test('Writable outcome flags and fake fights cannot forge a victory', () => {
  const progress = dojo.createProgress(), fight = dojo.startFight(progress);
  fight.won = true; fight.status = 'won'; fight.opponentHp = 0; fight.correct = 99;
  assert.equal(dojo.completeFight(progress, fight).recorded, false); assert.equal(progress.belt, 0);
  assert.equal(dojo.completeFight(progress, { won: true, status: 'won', opponentHp: 0, playerHp: 100 }).recorded, false);
  dojo.resolveAnswer(fight, { correct: true });
  assert.equal(fight.opponentHp, 86); assert.equal(fight.correct, 1); assert.equal(fight.status, 'fighting');
});
test('Saved fights replay verified answers and ignore damaged HP/streak metadata', () => {
  const progress = dojo.createProgress(), fight = dojo.startFight(progress);
  dojo.resolveAnswer(fight, { correct: true }); dojo.resolveAnswer(fight, { correct: false });
  const raw = JSON.parse(JSON.stringify(fight)); raw.opponentHp = 0; raw.playerHp = -8; raw.streak = 999;
  const restored = dojo.sanitizeFight(raw, progress);
  assert.ok(restored); assert.equal(restored.opponentHp, 86); assert.equal(restored.playerHp, 100); assert.equal(restored.streak, 0); assert.equal(restored.pendingDamage, 10);
  while (restored.status === 'fighting') dojo.resolveAnswer(restored, { correct: true });
  assert.equal(dojo.completeFight(progress, restored).promoted, true);
  assert.equal(dojo.sanitizeFight({ ...raw, journal: [{ correct: true, assisted: false, move: 'tornado-kick' }] }), null);
  assert.equal(dojo.sanitizeFight({ ...raw, beltIndex: 8, originBelt: 8 }, dojo.createProgress()), null);
  const terminal = win(progress); const terminalRaw = JSON.parse(JSON.stringify(terminal));
  terminalRaw.journal.push({ correct: true, assisted: false, move: 'front-kick' });
  assert.equal(dojo.sanitizeFight(terminalRaw), null);
});
test('Defense phase and counters survive replay before and after a successful block', () => {
  const fight = dojo.startFight(dojo.createProgress());
  dojo.resolveAnswer(fight, { correct: false });
  const waiting = dojo.sanitizeFight(JSON.parse(JSON.stringify(fight)));
  assert.equal(waiting.pendingDamage, 10); assert.equal(waiting.playerHp, 100); assert.equal(waiting.rulesVersion, dojo.FIGHT_VERSION);
  assert.equal(dojo.resolveAnswer(waiting, { correct: true }).blockedDamage, 10);
  const after = dojo.sanitizeFight(JSON.parse(JSON.stringify(waiting)));
  assert.equal(after.pendingDamage, 0); assert.equal(after.blocks, 1); assert.equal(after.blockedDamage, 10); assert.equal(after.playerHp, 100);
  assert.equal(dojo.resolveAnswer(after, { correct: true }).opponentDamage, 14);
  const oldSave = JSON.parse(JSON.stringify(fight)); delete oldSave.rulesVersion;
  assert.equal(dojo.sanitizeFight(oldSave), null, 'Previous immediate-damage active fights must not change meaning on load');
  const progress = dojo.createProgress(); progress.belt = 10; progress.completedSections.push('words'); progress.iceCreamClaimed = true; progress.flavor = 'matcha'; delete progress.rewards;
  assert.equal(dojo.sanitizeProgress(progress).flavor, 'matcha', 'Fight rule migration preserves rank and rewards');
});
test('Version 2 active saves preserve original damage, streak, and pending defense on migration', () => {
  const progress = dojo.createProgress(); progress.belt = 10;
  progress.completedSections.push('words'); progress.rewards.words.claimed = true; progress.rewards.words.flavor = 'chocolate';
  const old = { version: dojo.SAVE_VERSION, rulesVersion: 2, beltIndex: 8, originBelt: 8,
    journal: [
      { correct: true, assisted: false, move: 'roundhouse' },
      { correct: true, assisted: false, move: 'double-kick' },
      { correct: false, assisted: false, move: 'front-kick' },
      { correct: true, assisted: false, move: 'back-kick' },
      { correct: true, assisted: false, move: 'tornado-kick' },
      { correct: false, assisted: false, move: 'front-kick' }
    ] };
  const restored = dojo.sanitizeFight(old, progress);
  assert.ok(restored); assert.equal(restored.rulesVersion, dojo.FIGHT_VERSION); assert.equal(restored.playerHp, 100);
  assert.equal(restored.opponentHp, 42, 'Original attacks were 15 + 22 + 21 damage');
  assert.equal(restored.streak, 0); assert.equal(restored.bestStreak, 2);
  assert.equal(restored.correct, 4); assert.equal(restored.mistakes, 2); assert.equal(restored.pendingDamage, 12);
  assert.equal(restored.blocks, 1); assert.equal(restored.blockedDamage, 10);
  assert.ok(restored.journal.every(event => event.rulesVersion === 2));
  const reloaded = dojo.sanitizeFight(JSON.parse(JSON.stringify(restored)), progress);
  assert.equal(reloaded.opponentHp, 42); assert.equal(reloaded.pendingDamage, 12);
  const block = dojo.resolveAnswer(reloaded, { correct: true, move: 'punch', challengeKind: 'basic' });
  assert.equal(block.blockedDamage, 12); assert.equal(block.opponentDamage, 0);
  const attack = dojo.resolveAnswer(reloaded, { correct: true, move: 'roundhouse', challengeKind: 'basic' });
  assert.equal(attack.opponentDamage, 14, 'Future answers use the new equal basic damage');
  const modern = dojo.sanitizeFight(JSON.parse(JSON.stringify(reloaded)), progress);
  assert.equal(modern.opponentHp, 28); assert.equal(modern.streak, 1); assert.equal(modern.blocks, 2);
  assert.equal(modern.journal[modern.journal.length - 1].rulesVersion, dojo.FIGHT_VERSION);
  assert.equal(dojo.sanitizeProgress(progress).rewards.words.flavor, 'chocolate');
});
test('Version 3 final-master saves keep old damage and pending blocks before new direct counters', () => {
  const progress = dojo.createProgress(); progress.belt = 10;
  progress.completedSections.push('words'); progress.rewards.words.claimed = true; progress.rewards.words.flavor = 'chocolate';
  const old = { version: dojo.SAVE_VERSION, rulesVersion: 3, beltIndex: 8, originBelt: 8,
    journal: [
      { correct: true, assisted: false, move: 'dragon-finisher', challengeKind: 'special', rulesVersion: 3 },
      { correct: false, assisted: false, move: 'punch', challengeKind: 'basic', rulesVersion: 3 },
      { correct: false, assisted: false, move: 'punch', challengeKind: 'basic', rulesVersion: 3 },
      { correct: false, assisted: false, move: 'punch', challengeKind: 'basic', rulesVersion: 3 }
    ] };
  const restored = dojo.sanitizeFight(old, progress);
  assert.ok(restored); assert.equal(restored.rulesVersion, dojo.FIGHT_VERSION);
  assert.equal(restored.playerHp, 90); assert.equal(restored.opponentHp, 58); assert.equal(restored.pendingDamage, 14);
  assert.equal(restored.mistakes, 3); assert.ok(restored.journal.every(event => event.rulesVersion === 3));
  const block = dojo.resolveAnswer(restored, { correct: true });
  assert.equal(block.blockedDamage, 14); assert.equal(block.opponentDamage, 0); assert.equal(block.immediateCounter, false);
  const mistake = dojo.resolveAnswer(restored, { correct: false });
  assert.equal(mistake.immediateCounter, true); assert.equal(mistake.playerDamage, 100 / 3); assert.equal(restored.pendingDamage, 0);
  assert.equal(restored.playerHp, 90 - 100 / 3);
  const reloaded = dojo.sanitizeFight(JSON.parse(JSON.stringify(restored)), progress);
  assert.ok(reloaded); assert.equal(reloaded.playerHp, restored.playerHp); assert.equal(reloaded.opponentHp, 58);
  assert.equal(reloaded.blocks, 1); assert.equal(reloaded.blockedDamage, 14); assert.equal(reloaded.pendingDamage, 0);
  assert.equal(dojo.sanitizeProgress(progress).rewards.words.flavor, 'chocolate');
});
test('Mixed version 2, 3, and 4 journals migrate in order and reject backwards or future events', () => {
  const raw = { version: dojo.SAVE_VERSION, rulesVersion: 4, beltIndex: 8, originBelt: 8,
    journal: [
      { correct: true, assisted: false, move: 'roundhouse', rulesVersion: 2 },
      { correct: true, assisted: false, move: 'punch', challengeKind: 'basic', rulesVersion: 3 },
      { correct: false, assisted: false, move: 'punch', challengeKind: 'basic', rulesVersion: 4 }
    ] };
  const restored = dojo.sanitizeFight(raw);
  assert.ok(restored); assert.equal(restored.opponentHp, 68); assert.equal(restored.playerHp, 100 - 100 / 3);
  assert.deepEqual(restored.journal.map(event => event.rulesVersion), [2, 3, 4]);
  assert.equal(dojo.sanitizeFight(JSON.parse(JSON.stringify(restored))).playerHp, restored.playerHp);
  for (const backwardsVersion of [2, 3]) {
    const backwards = JSON.parse(JSON.stringify(raw));
    backwards.journal.push({ correct: true, assisted: false, move: 'front-kick', challengeKind: 'basic', rulesVersion: backwardsVersion });
    assert.equal(dojo.sanitizeFight(backwards), null);
  }
  assert.equal(dojo.sanitizeFight({ ...raw, rulesVersion: 3 }), null);
  const missingKind = JSON.parse(JSON.stringify(raw)); delete missingKind.journal[1].challengeKind;
  assert.equal(dojo.sanitizeFight(missingKind), null);
});
test('Version 4 attacks replay without new speed damage, and new version 5 timing survives reload', () => {
  const raw = { version: dojo.SAVE_VERSION, rulesVersion: 4, beltIndex: 0, originBelt: 0,
    journal: [{ correct: true, assisted: false, move: 'front-kick', challengeKind: 'basic', rulesVersion: 4, readingMs: 1000 }] };
  const restored = dojo.sanitizeFight(raw);
  assert.ok(restored); assert.equal(restored.rulesVersion, dojo.FIGHT_VERSION); assert.equal(restored.opponentHp, 86);
  assert.ok(!Object.prototype.hasOwnProperty.call(restored.journal[0], 'readingMs'), 'Old rules ignore new timing metadata');
  const modern = dojo.resolveAnswer(restored, { correct: true, readingMs: 1500 });
  assert.equal(modern.opponentDamage, 23); assert.equal(modern.speedBonus, 6); assert.equal(modern.speedTier, 'lightning');
  assert.deepEqual(restored.journal.map(event => event.rulesVersion), [4, dojo.FIGHT_VERSION]);
  assert.equal(restored.journal[1].readingMs, 1500);
  const reloaded = dojo.sanitizeFight(JSON.parse(JSON.stringify(restored)));
  assert.ok(reloaded); assert.equal(reloaded.opponentHp, 63); assert.equal(reloaded.streak, 2);
  assert.deepEqual(reloaded.journal, restored.journal);
  const combo = dojo.resolveAnswer(reloaded, { correct: true, readingMs: 3500 });
  assert.equal(combo.opponentDamage, 32); assert.equal(combo.speedBonus, 3); assert.equal(combo.combo, true);
  const again = dojo.sanitizeFight(JSON.parse(JSON.stringify(reloaded)));
  assert.equal(again.opponentHp, 31); assert.equal(again.streak, 3);
  const backwards = JSON.parse(JSON.stringify(restored));
  backwards.journal.push({ correct: true, assisted: false, move: 'front-kick', challengeKind: 'basic', rulesVersion: 4 });
  assert.equal(dojo.sanitizeFight(backwards), null);
  const future = JSON.parse(JSON.stringify(restored)); future.journal[1].rulesVersion = dojo.FIGHT_VERSION + 1;
  assert.equal(dojo.sanitizeFight(future), null);
});
test('Version 5 journal timing rejects malformed or ineligible entries without weakening old boss rules', () => {
  const raw = { version: dojo.SAVE_VERSION, rulesVersion: 5, beltIndex: 0, originBelt: 0,
    journal: [{ correct: true, assisted: false, move: 'front-kick', challengeKind: 'basic', rulesVersion: 5, readingMs: 1000 }] };
  for (const readingMs of [null, '1000', 0, -1, NaN, Infinity]) {
    assert.equal(dojo.sanitizeFight({ ...raw, journal: [{ ...raw.journal[0], readingMs }] }), null);
  }
  for (const fields of [{ correct: false }, { assisted: true }]) {
    assert.equal(dojo.sanitizeFight({ ...raw, journal: [{ ...raw.journal[0], ...fields }] }), null);
  }
  assert.equal(dojo.sanitizeFight({ ...raw, beltIndex: 3, originBelt: 3 }), null);
  const defense = { ...raw, journal: [
    { correct: false, assisted: false, move: 'front-kick', challengeKind: 'basic', rulesVersion: 5 }, raw.journal[0]
  ] };
  assert.equal(dojo.sanitizeFight(defense), null);
  const boss = { ...raw, rulesVersion: 4, beltIndex: 8, originBelt: 8,
    journal: [{ correct: false, assisted: false, move: 'front-kick', challengeKind: 'basic', rulesVersion: 4 }] };
  const restored = dojo.sanitizeFight(boss);
  assert.equal(restored.playerHp, 100 - 100 / 3); assert.equal(restored.pendingDamage, 0);
  const outcome = dojo.resolveAnswer(restored, { correct: false, readingMs: 1000 });
  assert.equal(outcome.immediateCounter, true); assert.equal(outcome.playerDamage, 100 / 3); assert.equal(outcome.speedBonus, 0);
  assert.equal(dojo.sanitizeFight(JSON.parse(JSON.stringify(restored))).playerHp, restored.playerHp);
});
test('Version 2 combo/assistance results and terminal rewards replay exactly', () => {
  const legacy = { version: dojo.SAVE_VERSION, rulesVersion: 2, beltIndex: 7, originBelt: 7,
    journal: Array.from({ length: 3 }, () => ({ correct: true, assisted: false, move: 'tornado-kick' })) };
  const active = dojo.sanitizeFight(legacy);
  assert.ok(active); assert.equal(active.opponentHp, 19); assert.equal(active.streak, 3); assert.equal(active.bestStreak, 3);
  const modern = dojo.resolveAnswer(active, { correct: true, move: 'front-kick', challengeKind: 'basic' });
  assert.equal(modern.opponentDamage, 19); assert.equal(modern.won, true);
  const progress = dojo.createProgress(); progress.belt = 8;
  const restoredWin = dojo.sanitizeFight(JSON.parse(JSON.stringify(active)), progress);
  assert.equal(restoredWin.won, true); assert.equal(dojo.completeFight(progress, restoredWin).rewardId, 'words');
  assert.equal(progress.belt, 9); assert.equal(progress.rewards.words.unlocked, true);
  const assisted = dojo.sanitizeFight({ ...legacy, journal: [{ correct: true, assisted: true, move: 'tornado-kick' }] });
  assert.equal(assisted.opponentHp, 90); assert.equal(assisted.assisted, 1); assert.equal(assisted.streak, 0);
  assert.equal(dojo.resolveAnswer(assisted, { correct: true, assisted: true, move: 'tornado-kick', challengeKind: 'special' }).opponentDamage, 17);
  const corrupt = JSON.parse(JSON.stringify(active));
  corrupt.journal.push({ correct: true, assisted: false, move: 'front-kick', rulesVersion: 2 });
  assert.equal(dojo.sanitizeFight(corrupt), null);
});
test('Repeated successful blocks can extend a legitimate bout past the old turn cap', () => {
  const fight = dojo.startFight(dojo.createProgress());
  for (let attempt = 0; attempt < 80; attempt++) {
    dojo.resolveAnswer(fight, { correct: false }); dojo.resolveAnswer(fight, { correct: true });
  }
  assert.equal(fight.turns, 160); assert.equal(fight.playerHp, 100); assert.equal(fight.opponentHp, 100);
  const restored = dojo.sanitizeFight(JSON.parse(JSON.stringify(fight)));
  assert.ok(restored); assert.equal(restored.blocks, 80); assert.equal(restored.pendingDamage, 0);
  restored.pendingDamage = 100; restored.blocks = 999;
  const attack = dojo.resolveAnswer(restored, { correct: true });
  assert.equal(attack.defensive, false); assert.equal(attack.opponentDamage, 14); assert.equal(restored.blocks, 80);
});
test('Corrupt and other-game saves cannot leak reward state or crash loading', () => {
  for (const raw of [null, '', [], 9, { version: 'other', belt: 8 }, { version: dojo.SAVE_VERSION, belt: NaN }]) {
    assert.equal(dojo.sanitizeProgress(raw).belt, 0);
    assert.equal(dojo.sanitizeProgress(raw).iceCreamUnlocked, false);
  }
  const clean = dojo.sanitizeProgress({ version: dojo.SAVE_VERSION, belt: 8, wins: Infinity, totalCorrect: 999999999,
    losses: -5, mastered: true, iceCreamClaimed: true, flavor: 'strawberry' });
  assert.equal(clean.totalCorrect, 1000000); assert.equal(clean.wins, 0); assert.equal(clean.losses, 0);
  assert.equal(clean.iceCreamUnlocked, true); assert.equal(clean.flavor, 'strawberry'); assert.equal(clean.mastered, true);
  assert.equal(dojo.sanitizeProgress({ ...clean, belt: 7 }).iceCreamClaimed, true, 'A recorded section reward survives changes to rank');
  assert.equal(dojo.sanitizeProgress({ ...clean, rewards: { ...clean.rewards, words: { ...clean.rewards.words, flavor: '<script>' } } }).flavor, '');
  for (const raw of [null, {}, { version: dojo.SAVE_VERSION, journal: [] }, { version: dojo.SAVE_VERSION, rulesVersion: dojo.FIGHT_VERSION, beltIndex: 0, originBelt: 0, journal: new Array(dojo.MAX_FIGHT_TURNS + 1).fill({}) }]) {
    assert.equal(dojo.sanitizeFight(raw), null);
  }
});
test('Six section rewards migrate independently and ignore forged locked claims', () => {
  assert.deepEqual(dojo.REWARDS.map(reward => [reward.id, reward.beltIndex]), [['reading',1],['katakana-reading',3],['writing',5],['katakana-writing',7],['words',9],['kanji',10]]);
  const legacy = dojo.sanitizeProgress({ version: dojo.SAVE_VERSION, belt: 8, iceCreamClaimed: true, flavor: 'vanilla' });
  assert.equal(legacy.rewards.words.claimed, true); assert.equal(legacy.rewards.words.flavor, 'vanilla');
  assert.equal(legacy.rewards.reading.unlocked, true); assert.equal(legacy.rewards.writing.unlocked, true);
  assert.equal(legacy.rewards.reading.claimed, false); assert.equal(legacy.rewards.kanji.unlocked, false);
  const forged = dojo.sanitizeProgress({ version: dojo.SAVE_VERSION, belt: 0, mastered: true,
    rewards: Object.fromEntries(dojo.REWARDS.map(reward => [reward.id, { unlocked: true, claimed: true, flavor: 'matcha' }])) });
  assert.ok(Object.values(forged.rewards).every(reward => !reward.unlocked && !reward.claimed && !reward.flavor));
  const progress = dojo.sanitizeProgress({ version: dojo.SAVE_VERSION, belt: 6 });
  const replay = dojo.completeFight(progress, win(progress, 2));
  assert.equal(replay.rewardUnlocked, false); assert.equal(replay.rewardId, null); assert.equal(progress.belt, 7);
});
test('Every old rank and its independently claimed flavors migrate without awarding new Katakana cones', () => {
  const map = [0, 1, 2, 4, 5, 6, 7, 8, 10];
  const thresholds = { reading: 2, writing: 5, words: 7, kanji: 8 };
  for (let oldBelt = 0; oldBelt <= 8; oldBelt++) {
    for (const mastered of [false, true]) {
      const old = { version: dojo.SAVE_VERSION, belt: oldBelt, mastered, wins: 18, losses: 4,
        totalCorrect: 314, totalMistakes: 27, bestStreak: 12,
        rewards: Object.fromEntries(Object.keys(thresholds).map(id => [id, { unlocked: true, claimed: true, flavor: 'matcha' }])) };
      const migrated = dojo.sanitizeProgress(old);
      assert.equal(migrated.courseVersion, dojo.COURSE_VERSION);
      assert.equal(migrated.belt, map[oldBelt]); assert.equal(migrated.mastered, oldBelt === 8 && mastered);
      assert.equal(migrated.wins, 18); assert.equal(migrated.losses, 4); assert.equal(migrated.totalCorrect, 314);
      assert.equal(migrated.totalMistakes, 27); assert.equal(migrated.bestStreak, 12);
      for (const [id, threshold] of Object.entries(thresholds)) {
        const earned = id === 'kanji' ? oldBelt === 8 && mastered : oldBelt > threshold;
        assert.equal(migrated.rewards[id].unlocked, earned); assert.equal(migrated.rewards[id].claimed, earned);
        assert.equal(migrated.rewards[id].flavor, earned ? 'matcha' : '');
      }
      for (const id of ['katakana-reading', 'katakana-writing']) assert.deepEqual(migrated.rewards[id], { unlocked: false, claimed: false, flavor: '' });
      assert.deepEqual(dojo.sanitizeProgress(JSON.parse(JSON.stringify(migrated))), migrated, 'Migration happens once');
    }
  }
});
test('Previously advanced players can earn the two new cones by completing Katakana replay rivals', () => {
  const progress = dojo.sanitizeProgress({ version: dojo.SAVE_VERSION, belt: 8, mastered: true,
    rewards: { reading: { claimed: true, flavor: 'strawberry' }, writing: { claimed: true, flavor: 'vanilla' },
      words: { claimed: true, flavor: 'chocolate' }, kanji: { claimed: true, flavor: 'matcha' } } });
  for (const [stage, id] of [[3, 'katakana-reading'], [7, 'katakana-writing']]) {
    const result = dojo.completeFight(progress, win(progress, stage));
    assert.equal(result.rewardUnlocked, true); assert.equal(result.rewardId, id); assert.equal(result.promoted, false);
    assert.equal(progress.belt, 10); assert.equal(progress.mastered, true); assert.equal(progress.rewards[id].unlocked, true);
    progress.rewards[id].claimed = true; progress.rewards[id].flavor = 'matcha';
    const repeat = dojo.completeFight(progress, win(progress, stage));
    assert.equal(repeat.rewardUnlocked, false); assert.equal(repeat.rewardId, null);
  }
  const restored = dojo.sanitizeProgress(JSON.parse(JSON.stringify(progress)));
  assert.equal(Object.values(restored.rewards).filter(reward => reward.claimed).length, 6);
  assert.equal(restored.rewards.reading.flavor, 'strawberry'); assert.equal(restored.rewards.writing.flavor, 'vanilla');
  assert.equal(restored.rewards.words.flavor, 'chocolate'); assert.equal(restored.rewards.kanji.flavor, 'matcha');
});
test('Every old active rank preserves old special bonuses and move gates across two reloads', () => {
  const map = [0, 1, 2, 4, 5, 6, 7, 8, 10];
  const specials = [['front-kick', 0], ['double-kick', 10], ['jump-front-kick', 12], ['jump-side-kick', 15],
    ['spinning-hook-kick', 17], ['tornado-kick', 20], ['flying-double-kick', 22], ['whirlwind-combo', 25], ['dragon-finisher', 28]];
  for (let oldBelt = 0; oldBelt <= 8; oldBelt++) {
    for (const rulesVersion of [3, 4, 5]) {
      const [move, bonus] = specials[oldBelt];
      const raw = { version: dojo.SAVE_VERSION, rulesVersion, beltIndex: oldBelt, originBelt: oldBelt,
        journal: [{ correct: true, assisted: false, move, challengeKind: oldBelt ? 'special' : 'basic', rulesVersion }] };
      const restored = dojo.sanitizeFight(raw);
      assert.ok(restored); assert.equal(restored.beltIndex, map[oldBelt]); assert.equal(restored.originBelt, map[oldBelt]);
      assert.equal(restored.legacyBeltIndex, oldBelt); assert.equal(restored.legacyOriginBelt, oldBelt);
      assert.equal(restored.opponentHp, 100 - 14 - bonus);
      assert.deepEqual(dojo.sanitizeFight(JSON.parse(JSON.stringify(restored))).journal, restored.journal);
      const next = dojo.resolveAnswer(restored, { correct: true, move: 'punch' });
      assert.equal(next.opponentDamage, 17);
      const again = dojo.sanitizeFight(JSON.parse(JSON.stringify(restored)));
      assert.ok(again); assert.equal(again.opponentHp, 100 - 14 - bonus - 17);
      assert.equal(again.journal[1].rulesVersion, dojo.FIGHT_VERSION);
    }
  }
});
test('Old voice timing is judged using the old rival mode before the mapped course takes over', () => {
  for (const oldBelt of [0, 1, 2, 6, 7]) {
    const raw = { version: dojo.SAVE_VERSION, rulesVersion: 5, beltIndex: oldBelt, originBelt: oldBelt,
      journal: [{ correct: true, assisted: false, move: 'front-kick', challengeKind: 'basic', rulesVersion: 5, readingMs: 1000 }] };
    const restored = dojo.sanitizeFight(raw);
    assert.ok(restored); assert.equal(restored.opponentHp, 80);
    assert.equal(dojo.sanitizeFight(JSON.parse(JSON.stringify(restored))).opponentHp, 80);
  }
  for (const oldBelt of [3, 4, 5, 8]) {
    const raw = { version: dojo.SAVE_VERSION, rulesVersion: 5, beltIndex: oldBelt, originBelt: oldBelt,
      journal: [{ correct: true, assisted: false, move: 'front-kick', challengeKind: 'basic', rulesVersion: 5, readingMs: 1000 }] };
    assert.equal(dojo.sanitizeFight(raw), null);
  }
});
test('Imported old terminal fights award their original section instead of a newly mapped Katakana section', () => {
  for (const [oldStage, oldReward] of [[1, 'reading'], [2, 'reading'], [4, 'writing'], [5, 'writing'], [6, null], [7, 'words'], [8, 'kanji']]) {
    const progress = dojo.sanitizeProgress({ version: dojo.SAVE_VERSION, belt: oldStage });
    const raw = { version: dojo.SAVE_VERSION, rulesVersion: 5, beltIndex: oldStage, originBelt: oldStage,
      journal: Array.from({ length: 5 }, () => ({ correct: true, assisted: false, move: 'front-kick', challengeKind: 'basic', rulesVersion: 5 })) };
    const fight = dojo.sanitizeFight(raw, progress); assert.ok(fight); assert.equal(fight.won, true);
    const result = dojo.completeFight(progress, fight);
    assert.equal(result.rewardId, oldReward); assert.equal(result.rewardUnlocked, Boolean(oldReward));
    assert.equal(progress.rewards['katakana-reading'].unlocked, false);
    assert.equal(progress.rewards['katakana-writing'].unlocked, false);
    if (oldReward) assert.equal(progress.rewards[oldReward].unlocked, true);
    assert.deepEqual(dojo.sanitizeProgress(JSON.parse(JSON.stringify(progress))), progress);
  }
});
test('Course markers and legacy stage metadata cannot make journal replay silently change its meaning', () => {
  const current = dojo.startFight(dojo.createProgress()); dojo.resolveAnswer(current, { correct: true });
  const old = { version: dojo.SAVE_VERSION, rulesVersion: 5, beltIndex: 6, originBelt: 8,
    journal: [{ correct: true, assisted: false, move: 'dragon-finisher', challengeKind: 'special', rulesVersion: 5 }] };
  const migrated = dojo.sanitizeFight(old); assert.ok(migrated);
  for (const changed of [{ legacyBeltIndex: 5 }, { legacyOriginBelt: 7 }, { beltIndex: 8 }, { originBelt: 9 }]) {
    assert.equal(dojo.sanitizeFight({ ...migrated, ...changed }), null);
  }
  const noMetadata = { ...migrated }; delete noMetadata.legacyBeltIndex; delete noMetadata.legacyOriginBelt;
  assert.equal(dojo.sanitizeFight(noMetadata), null);
  const noCourse = { ...current }; delete noCourse.courseVersion;
  assert.equal(dojo.sanitizeFight(noCourse), null);
});
console.log('\n' + passed + ' dojo engine checks passed.');
