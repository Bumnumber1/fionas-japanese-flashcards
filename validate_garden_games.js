// Run with node validate_garden_games.js. Checks selection isolation, not UI snapshots.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ console });
context.window = context;
for (const file of ['curriculum_y1.js','year1-review-data.js','wordcats.js','garden-material.js','activities.js']) {
  vm.runInContext(fs.readFileSync(file,'utf8'), context, { filename:file });
}
const { catalog } = context.Year1Review;
assert.equal(catalog.words.length,132);
assert.equal(catalog.patterns.length,13);
assert.equal(catalog.phrases.length,21);
const ids = Object.values(catalog).flat().map(item=>item.id);
const full = context.GardenMaterial.build(ids);
assert.ok(full.examples.length>20, 'The complete review supports sentence games');
assert.equal(full.kanji.length,15);
const examples = full.examples;
for (let seed=0; seed<100; seed++) {
  const picked = ids.filter((id,i)=>!id.startsWith('word:') || (i*31+seed*17)%11 < seed%12);
  const material = context.GardenMaterial.build(picked);
  const allowed = new Set(picked);
  assert.ok(material.pool.every(word=>allowed.has(word.id)));
  assert.ok(material.examples.every(line=>context.GardenMaterial.tokenize(line.jp,allowed)));
  assert.ok(material.kanji.every(k=>allowed.has('word:'+k.read)));
  assert.ok(material.chars.every(char=>material.pool.some(word=>word.jp.includes(char))));
  for (const blank of material.blanks) {
    assert.ok(allowed.has('word:'+blank.missing));
    assert.ok(blank.distractors.every(word=>allowed.has('word:'+word)));
  }
}
const small = context.GardenMaterial.build(['word:ぞう','word:うさぎ','word:もも','word:ほん','pattern:2']);
assert.equal(small.pool.length,4);
assert.ok(small.examples.some(example=>example.jp.includes('ぞう')));
assert.ok(!small.examples.some(example=>example.jp.includes('ねこ')));
assert.equal(context.GardenMaterial.tokenize('ももを たべます。',small.selected),null);
assert.equal(context.GardenMaterial.build([]).pool.length,0);
assert.equal(context.GardenMaterial.build([]).examples.length,0);
assert.equal(context.GardenMaterial.build(['word:unknown']).pool.length,0);
assert.equal(context.GardenMaterial.build(['word:ほん']).questions.length,0);
assert.equal(context.GardenMaterial.build(['word:ほん','pattern:7']).questions.length,1);
assert.equal(context.GardenMaterial.build(['word:ねこ','pattern:5']).likes.length,0);
assert.equal(context.GardenMaterial.build(['word:ねこ','word:すき','word:きらい','pattern:5']).likes.length,1);
assert.equal(context.GardenMaterial.build(['word:わたし','word:ほん','pattern:9']).possessions.length,1);
// Kanji mappings must continue to correspond to the real original game dictionaries.
const ocean = vm.runInContext(fs.readFileSync('ocean.html','utf8').match(/const gameKanji = (\[[\s\S]*?\n\]);/)[1],context);
const rideCode = fs.readFileSync('kanjiride.html','utf8').match(/<script id="kanjidata">([\s\S]*?)<\/script>/)[1];
vm.runInContext(rideCode,context);
for (const k of full.kanji) {
  if (k.ocean) assert.ok(ocean.some(item=>item.char===k.char && item.romaji===full.pool.find(word=>word.jp===k.read).romaji));
  if (k.ride) assert.ok(context.KANJI_WORLD.K.some(item=>item.char===k.char));
}
// Parse every touched inline program, including code paths absent in garden mode.
for (const file of ['index.html','review.html','arcade.html','spaceship.html','ocean.html','kanjiride.html']) {
  for (const match of fs.readFileSync(file,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1],{filename:file});
}
console.log(`Garden checks passed: 100 selection subsets, ${examples.length} safe sentence examples, 15 verified kanji mappings, and all touched inline scripts.`);
