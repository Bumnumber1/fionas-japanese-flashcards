// Build game material only from canonical checked words. Never widen to a week/year.
(() => {
  'use strict';
  const { catalog } = Year1Review;
  const vocabulary = [...catalog.words].sort((a, b) => b.jp.length - a.jp.length);
  const endings = ['じゃない', 'です', 'は', 'が', 'を', 'の', 'に', 'へ', 'と', 'な', 'か', 'ね'];
  // Exact word readings verified against the two existing adventure dictionaries.
  const kanjiForms = [
    ['ほし','星',true,true], ['つき','月',true,true], ['よる','夜',true,false],
    ['やま','山',true,true], ['かわ','川',true,true], ['もり','森',false,true],
    ['いけ','池',true,false], ['いし','石',true,true], ['き','木',true,true],
    ['くさ','草',false,true], ['つち','土',true,false], ['うみ','海',true,false],
    ['さかな','魚',true,true], ['ほん','本',true,true], ['はな','花',true,true]
  ];
  const lexicon = [...vocabulary.map(word => ({ text: word.jp, word })), ...endings.map(text => ({ text }))].sort((a, b) => b.text.length - a.text.length);
  function tokenize(sentence, selected) {
    let rest = sentence.replace(/[\s。！!？?、,]/g, '');
    const tokens = [];
    let wordCount = 0;
    while (rest) {
      const part = lexicon.find(entry => rest.startsWith(entry.text));
      if (!part || (part.word && !selected.has(part.word.id))) return null;
      tokens.push(part.text);
      if (part.word) wordCount++;
      rest = rest.slice(part.text.length);
    }
    return wordCount ? tokens : null;
  }
  function build(ids) {
    const selected = new Set(ids);
    const pool = catalog.words.filter(word => selected.has(word.id));
    const seen = new Set();
    const examples = [];
    const lines = catalog.patterns.filter(item => selected.has(item.id)).flatMap(item => item.examples)
      .concat(catalog.phrases.filter(item => selected.has(item.id)));
    for (const line of lines) {
      const tokens = tokenize(line.jp, selected);
      if (!tokens || seen.has(line.jp)) continue;
      seen.add(line.jp);
      examples.push({ ...line, jp: tokens.join(' ') + '。', tokens });
    }
    const chars = [...new Set(pool.flatMap(word => [...word.jp]).filter(char => /^[ぁ-ゖァ-ヶ]$/.test(char)))];
    const nouns = pool.filter(word => word.pos === 'noun' && !['これ','それ','あれ','わたし','どこ','ここ','そこ','あそこ'].includes(word.jp));
    const questions = selected.has('pattern:7') ? nouns.map(word => ({
      stmt: word.jp + ' です', en_s: 'It is ' + word.en + '.', q: word.jp + ' ですか?', en_q: 'Is it ' + word.en + '?'
    })) : [];
    const possessors = pool.filter(word => ['わたし', 'せんせい', 'ともだち'].includes(word.jp));
    const possessions = selected.has('pattern:9') ? possessors.flatMap(person => nouns.filter(word => word.jp !== person.jp).map(word => ({
      chunks: [person.jp, 'の', word.jp], audio: person.jp + 'の' + word.jp,
      en: (person.jp === 'わたし' ? 'my' : person.jp === 'せんせい' ? 'the teacher’s' : 'my friend’s') + ' ' + word.en
    }))) : [];
    const blanks = examples.flatMap(line => {
      const index = line.tokens.findIndex(token => pool.some(word => word.jp === token));
      if (index < 0) return [];
      const answer = line.tokens[index];
      const distractors = pool.filter(word => word.jp !== answer).slice(0, 3).map(word => word.jp);
      return [{ jp: line.tokens.map((token, i) => i === index ? '___' : token).join(' ') + '。', en: line.en, missing: answer, distractors }];
    });
    const categories = typeof WordCats === 'undefined' ? [] : WordCats.CATS.filter(category => category.meaning).map(category => ({
      name: category.name, icon: category.icon, words: WordCats.catWords(pool, category)
    })).filter(category => category.words.length);
    const countable = nouns.filter(word => !/animal|elephant|giraffe|monkey|rabbit|tiger|bear|hippo|sheep|cat|fish|octopus|squid|crab|turtle|shark|whale|teacher|friend|Orihime|Hikoboshi|Festival|moon viewing|night|today|soil|grass|electricity|jump rope|footrace|tag \(game\)/i.test(word.en));
    const kanji = kanjiForms.filter(([jp])=>selected.has('word:'+jp)).map(([read,char,ocean,ride])=>({ char,read,ocean,ride,mean:pool.find(word=>word.jp===read).en }));
    return { selected, pool, nouns, examples, blanks, questions, possessions, chars, categories, countable,
      kanji, speech: pool.map(word => ({ jp: word.jp, romaji: word.romaji, en: word.en })),
      likes: selected.has('pattern:5') && selected.has('word:すき') && selected.has('word:きらい') ? nouns : [] };
  }
  window.GardenMaterial = { build, tokenize };
})();
