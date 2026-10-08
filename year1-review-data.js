// Canonical Year 1, Weeks 1-13 material shared by the garden and its games.
(() => {
  'use strict';
  const weeks = window.CURRICULUM[1].weeks.filter(week => week.w >= 1 && week.w <= 13);
  // These words are taught in grammar explanations/examples rather than vocab arrays.
  // Keep their first source week so the review never pulls in later lessons.
  const sentenceWords = [
    [1, 'これ', 'kore', 'this (near me)'], [1, 'きょう', 'kyou', 'today'],
    [2, 'ねこ', 'neko', 'cat'], [2, 'わたし', 'watashi', 'I / me'],
    [3, 'それ', 'sore', 'that (near you)'], [3, 'あれ', 'are', 'that over there'],
    [3, 'この', 'kono', 'this … (before a noun)'], [3, 'その', 'sono', 'that … (before a noun)'],
    [3, 'あの', 'ano', 'that … over there (before a noun)'],
    [3, 'おおきい', 'ookii', 'big'], [3, 'ほん', 'hon', 'book'],
    [4, 'たべます', 'tabemasu', 'eat'], [4, 'のみます', 'nomimasu', 'drink'],
    [4, 'みます', 'mimasu', 'see / watch'], [4, 'よみます', 'yomimasu', 'read'],
    [4, 'かいます', 'kaimasu', 'buy'], [4, 'ジュース', 'juusu', 'juice'],
    [5, 'すき', 'suki', 'liked / favorite'], [5, 'きらい', 'kirai', 'disliked'],
    [5, 'ほしい', 'hoshii', 'wanted / want'], [5, 'ケーキ', 'keeki', 'cake'],
    [6, 'いちご', 'ichigo', 'strawberry'], [6, 'りんご', 'ringo', 'apple'],
    [7, 'いきます', 'ikimasu', 'go'], [7, 'きます', 'kimasu', 'come'],
    [7, 'します', 'shimasu', 'do'], [7, 'ねます', 'nemasu', 'sleep'],
    [7, 'あそびます', 'asobimasu', 'play'], [7, 'およぎます', 'oyogimasu', 'swim'],
    [7, 'はい', 'hai', 'yes'], [7, 'ともだち', 'tomodachi', 'friend'],
    [8, 'あかい', 'akai', 'red'], [8, 'きれい', 'kirei', 'pretty / beautiful'],
    [8, 'はな', 'hana', 'flower'], [8, 'みどり', 'midori', 'green (color)'],
    [8, 'かばん', 'kaban', 'bag'], [9, 'せんせい', 'sensei', 'teacher'],
    [11, 'おもい', 'omoi', 'heavy'], [12, 'どこ', 'doko', 'where'],
    [12, 'ここ', 'koko', 'here (near me)'], [12, 'そこ', 'soko', 'there (near you)'],
    [12, 'あそこ', 'asoko', 'over there'], [12, 'トイレ', 'toire', 'toilet / restroom']
  ];
  const catalog = { words: [], patterns: [], phrases: [] };
  const wordMap = new Map();
  for (const week of weeks) {
    for (const word of week.vocab) {
      const existing = wordMap.get(word.jp);
      if (existing) { existing.weeks.push(week.w); continue; }
      const item = { ...word, id: 'word:' + word.jp, week: week.w, weeks: [week.w], type: 'words' };
      wordMap.set(word.jp, item);
      catalog.words.push(item);
    }
    catalog.patterns.push({ ...week.grammar, id: 'pattern:' + week.w, week: week.w, type: 'patterns' });
    week.phrases.forEach((phrase, index) => catalog.phrases.push({ ...phrase, id: `phrase:${week.w}:${index}`, week: week.w, type: 'phrases' }));
  }
  for (const [week, jp, romaji, en] of sentenceWords) {
    if (!wordMap.has(jp)) {
      const item = { week, weeks: [week], jp, romaji, en, id: 'word:' + jp, type: 'words', extra: true, emoji: '🌱', pos: jp.endsWith('ます') ? 'verb' : ['すき', 'きらい', 'きれい'].includes(jp) ? 'na-adj' : ['おおきい', 'ほしい', 'あかい', 'おもい'].includes(jp) ? 'i-adj' : ['この', 'その', 'あの'].includes(jp) ? 'determiner' : jp === 'はい' ? 'expression' : 'noun' };
      catalog.words.push(item);
      wordMap.set(jp, item);
    }
  }
  window.Year1Review = { weeks, catalog };
})();
