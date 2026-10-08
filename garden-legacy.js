// Reuse the original games and their controls with a frozen, canonical garden deck.
(() => {
  'use strict';
  if (!window.GardenSession) return;
  const m = GardenSession;
  const fail = () => {
    const message = document.createElement('p'); message.className = 'garden-session-error';
    message.textContent = 'This game needs more checked words. Close it and choose your words in the garden.';
    document.body.append(message);
  };
  if (!m.pool.length) { fail(); return; }
  const page = location.pathname.split('/').pop();
  if (page === 'index.html') {
    const games = {
      quiz:{ min:4, open:()=>startQuiz() }, concentration:{ min:2, open:()=>openConcentration() }, gofish:{ min:6, open:()=>openGoFish() }
    };
    const game = games[m.game];
    if (!game || new Set(m.pool.map(word=>word.en)).size < game.min) { fail(); return; }
    words.splice(0, words.length, ...m.pool.map(word=>({ japanese:word.jp, english:word.en, romaji:word.romaji, emoji:word.emoji,
      pos:word.pos, category:'Garden selection', theme:'journey' })));
    groupedCards();
    for (const name of ['closeQuiz','closeConcentration','closeGoFish']) {
      const original = window[name];
      window[name] = function () { original(); m.close(); };
    }
    game.open();
    return;
  }
  if (page === 'review.html') {
    const enough = new Set(m.pool.map(word=>word.en)).size >= 4;
    const allowed = {
      actMixedQuiz:enough, actReverseQuiz:enough, actListening:enough,
      actSentenceBuilder:m.examples.some(line=>line.tokens.length>=2), actFillBlank:enough && m.blanks.length>0,
      actMakeQuestion:m.questions.length>0, actPossession:m.possessions.length>0, actSukiKirai:m.likes.length>0
    };
    if (!allowed[m.game]) { fail(); return; }
    vocab.splice(0, vocab.length, ...m.pool);
    sentences.splice(0, sentences.length, ...m.examples.map(line=>({...line, plain:line.jp.replace(/\s/g,'')})));
    sbItems.splice(0, sbItems.length, ...m.examples.filter(line=>line.tokens.length>=2).map(line=>({en:line.en,chunks:line.tokens,audio:line.jp})));
    fibItems.splice(0, fibItems.length, ...m.blanks);
    qmItems.splice(0, qmItems.length, ...m.questions);
    possItems.splice(0, possItems.length, ...m.possessions);
    skItems.splice(0, skItems.length, ...m.likes.map(word=>({emoji:word.emoji,label:word.jp})));
    const originalClose = window.closeModal;
    window.closeModal = function () { originalClose(); m.close(); };
    window[m.game]();
  }
})();
