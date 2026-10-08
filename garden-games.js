(() => {
  'use strict';
  const keys = ['memory','listen','quiz','karuta','bingo','whack','shiritori','oddone','kanabuild','sort','blank','scramble','speak','shop','counters','trace','kanjimatch','bossquiz'];
  const descriptions = {
    memory: 'Turn over cards and find Japanese–English pairs.', listen: 'Listen, then pick the meaning.', quiz: 'Match Japanese words and English meanings.',
    karuta: 'Hear a word and grab its card.', bingo: 'Listen and fill your bingo board.', whack: 'Catch the right word as it pops up.',
    shiritori: 'Link words by their ending and starting sounds.', oddone: 'Find the word from a different group.', kanabuild: 'Build checked words from kana tiles.',
    sort: 'Sort your words into the right team.', blank: 'Complete sentences using your checked vocabulary.', scramble: 'Put sentence pieces in order.',
    speak: 'Listen to your checked words and say them aloud.', shop: 'Shop for checked nouns and add their prices.', counters: 'Count objects from your checked nouns.',
    trace: 'Trace kana that appear in your checked words.', kanjimatch: 'Match kanji forms of your checked words to their readings.', bossquiz: 'Defeat the boss with your checked words.'
  };
  const needs = {
    memory: 'Choose 4 words with different meanings.', listen: 'Choose 4 words with different meanings.', quiz: 'Choose 4 words with different meanings.',
    karuta: 'Choose 4 words with different meanings.', bingo: 'Choose at least 6 words.', whack: 'Choose 5 words with different meanings.',
    shiritori: 'Choose words that link, like すいか → かめ.', oddone: 'Choose 3 words in one group and 1 in another.', kanabuild: 'Choose a word with 2–6 kana.',
    sort: 'Choose at least 4 words.', blank: 'Choose 4 words and a pattern whose example uses them.', scramble: 'Choose a pattern and all the words in one of its examples.',
    speak: 'Choose at least 1 word.', shop: 'Choose at least 4 nouns.', counters: 'Choose at least 4 object words, such as school supplies.',
    trace: 'Choose a word containing kana.', kanjimatch: 'Choose 3 words with game kanji, such as ほし, やま, and かわ.', bossquiz: 'Choose 4 words with different meanings.'
  };
  const legacy = [
    { key:'cards-quiz', name:'Quiz Me', icon:'❓', page:'index.html', game:'quiz', min:4, desc:'The original flashcard quiz.' },
    { key:'concentration', name:'Concentration', icon:'🃏', page:'index.html', game:'concentration', min:2, desc:'The original matching game, with one- or two-player mode.' },
    { key:'gofish', name:'Go Fish', icon:'🐟', page:'index.html', game:'gofish', min:6, desc:'Ask for your checked word cards and collect pairs.' },
    { key:'mixed', name:'Mixed Quiz', icon:'📚', game:'actMixedQuiz', min:4, desc:'Your words and matching checked sentence examples.' },
    { key:'reverse', name:'Reverse Quiz', icon:'🔄', game:'actReverseQuiz', min:4, desc:'See English and choose Japanese.' },
    { key:'listening', name:'Listening Quiz', icon:'🔊', game:'actListening', min:4, desc:'The original word and sentence listening quiz.' },
    { key:'builder', name:'Sentence Builder', icon:'🧩', game:'actSentenceBuilder', test:m=>m.examples.some(e=>e.tokens.length>=2), need:needs.scramble, desc:'Build selected examples with the original sentence tiles.' },
    { key:'fill', name:'Fill in the Blank', icon:'📝', game:'actFillBlank', test:m=>m.pool.length>=4 && m.blanks.length>0, need:needs.blank, desc:'Choose the missing checked word.' },
    { key:'question', name:'Make It a Question', icon:'❔', game:'actMakeQuestion', test:m=>m.questions.length>0, need:'Choose a noun and the Week 7 question pattern.', desc:'Add か to a sentence about a checked noun.' },
    { key:'refusal', name:'Politely Saying No', icon:'🙋', unavailable:'Its fixed refusal vocabulary is outside this review.', desc:'The original polite-refusal scenarios.' },
    { key:'possession', name:'Possession (の)', icon:'👥', game:'actPossession', test:m=>m.possessions.length>0, need:'Choose Week 9’s pattern, わたし / せんせい / ともだち, and another noun.', desc:'Build phrases using your checked people and things.' },
    { key:'sequence', name:'Counters & Days', icon:'🔢', unavailable:'Its counter and weekday word lists are not in this review.', desc:'The original sequence game.' },
    { key:'likes', name:'すき / きらい Sorter', icon:'💜', game:'actSukiKirai', test:m=>m.likes.length>0, need:'Choose すき, きらい, a noun, and the Week 5 pattern.', desc:'Sort checked nouns into your likes and dislikes.' },
    { key:'phone', name:'Phone Number Reader', icon:'☎️', unavailable:'Its digit vocabulary is not in this review.', desc:'The original number-reading game.' },
    { key:'greetings', name:'Greeting Scenarios', icon:'👋', unavailable:'Its fixed greeting choices are outside this review.', desc:'The original greeting scenarios.' },
    { key:'galaxy', name:'Kana Galaxy', icon:'🚀', page:'spaceship.html', game:'galaxy', test:m=>m.chars.filter(c=>/^[あ-ろわをんア-ロワヲン]$/.test(c)).length>=2, need:'Choose words containing at least 2 different full-size kana.', desc:'Fly through space collecting kana from your checked words.' },
    { key:'ocean', name:'Ocean Adventure', icon:'🌊', page:'ocean.html', game:'ocean', test:m=>m.kanji.some(k=>k.ocean), need:'Choose a word with ocean kanji, such as ほし or やま.', desc:'Explore the ocean writing kanji forms of checked words.' },
    { key:'ride', name:'Kanji Trail Ride', icon:'🐴', page:'kanjiride.html', game:'ride', test:m=>m.kanji.some(k=>k.ride), need:'Choose a word with trail kanji, such as ほし or やま.', desc:'Ride the trail collecting kanji forms of checked words.' }
  ];
  let material = GardenMaterial.build([]);
  let run = null;
  let launcher = null;
  let frame = null;
  const dialog = document.getElementById('garden-game-dialog');
  const host = document.getElementById('garden-game-host');
  const grid = document.getElementById('garden-game-grid');
  function options(m, key) {
    return { pool:key === 'counters' ? m.countable : m.pool, examples:key === 'speak' ? m.speech : m.examples, chars:m.chars, kanji:m.kanji };
  }
  function oddOk(m) {
    const byPos = {};
    m.pool.forEach(word => { const key = ['i-adj','na-adj'].includes(word.pos) ? 'adj' : word.pos; (byPos[key] ||= []).push(word); });
    const groups = m.categories.length ? m.categories : Object.entries(byPos).map(([name,words])=>({name,words}));
    return groups.some(a=>groups.some(b=>a!==b && a.words.filter(w=>!b.words.some(v=>v.jp===w.jp)).length>=3 && b.words.some(w=>!a.words.some(v=>v.jp===w.jp))));
  }
  function arcadeOk(key, m) { return key === 'oddone' ? oddOk(m) : Activities.canRun(key, options(m,key)); }
  function legacyOk(def, m) { return !def.unavailable && (def.test ? def.test(m) : new Set(m.pool.map(w=>w.en)).size >= def.min); }
  function update(selected) {
    material = GardenMaterial.build(selected);
    document.getElementById('games-summary').textContent = `${material.pool.length} checked words · ${keys.filter(key=>arcadeOk(key,material)).length + legacy.filter(def=>legacyOk(def,material)).length} games ready`;
    const definitions = keys.map(key=>({ key, name:Activities.defs[key].name, icon:Activities.defs[key].icon, desc:descriptions[key], ok:arcadeOk(key,material), need:needs[key] }))
      .concat(legacy.map(def=>({...def, ok:legacyOk(def,material), need:def.unavailable || def.need || `Choose at least ${def.min} words with different meanings.`})));
    grid.innerHTML = definitions.map(def=>`<button class="garden-game-card" data-game="${def.key}" ${def.ok?'':'disabled'}><span class="game-icon" aria-hidden="true">${def.icon}</span><strong>${escHtml(def.name)}</strong><small>${escHtml(def.desc)}</small><small class="game-status">${def.ok?'Play →':escHtml(def.need)}</small></button>`).join('');
  }
  function close() {
    if (run) { run.teardown(); run = null; }
    if (frame) { frame.remove(); frame = null; }
    host.replaceChildren();
    JpSpeech.stop();
    if (dialog.open) dialog.close();
    launcher?.focus();
  }
  function open(key, button) {
    const def = legacy.find(item=>item.key===key);
    if (def ? !legacyOk(def,material) : !keys.includes(key) || !arcadeOk(key,material)) return;
    launcher = button;
    const name = def || Activities.defs[key];
    document.getElementById('garden-game-title').textContent = name.icon + ' ' + name.name;
    document.getElementById('garden-game-scope').textContent = `${material.pool.length} checked words · Close to return to your garden`;
    dialog.classList.toggle('embedded', !!def);
    dialog.showModal();
    document.getElementById('garden-game-close').focus();
    if (def) {
      frame = document.createElement('iframe');
      frame.title = name.name + ' with garden selections';
      frame.allow = 'microphone';
      // Pass canonical IDs in the fragment. No storage dependency, external URL, or raw HTML.
      frame.src = `${def.page || 'review.html'}?garden=1&game=${encodeURIComponent(def.game)}#${encodeURIComponent(JSON.stringify([...material.selected]))}`;
      host.append(frame);
    } else {
      const o = options(material,key);
      run = Activities.startCustom(key, host, { pool:o.pool, examples:o.examples, kanjiPool:material.kanji,
        writing:{ type:'kana', chars:material.chars }, categories:material.categories, strictPool:true, prevBest:()=>0 }, null, close);
    }
  }
  grid.addEventListener('click', event=>{const button=event.target.closest('button[data-game]');if(button && !button.disabled)open(button.dataset.game,button);});
  document.getElementById('garden-game-close').addEventListener('click', close);
  dialog.addEventListener('cancel', event=>{event.preventDefault();close();});
  window.addEventListener('message', event=>{if(frame && event.source===frame.contentWindow && event.data?.type==='garden-close')close();});
  window.GardenGames = { update };
})();
