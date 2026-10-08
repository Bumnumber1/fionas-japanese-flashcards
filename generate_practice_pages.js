// Text-based replacements for ebook worksheets with answers baked into the art.
// Run: node generate_practice_pages.js
const fs = require('node:fs');
const path = require('node:path');
const esc = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const sheets = [
  {file:'43_QuestionWords_Practice_NoClues.svg', title:'Question Words', jp:'しつもんの れんしゅう',
   instruction:'Use each question word once to complete the Japanese.',
   bank:'だれ　・　どこ　・　なに　・　なんじ　・　いくら',
   rows:[['あの ひとは __________ ですか。','Who is that person?'],
     ['ねこは __________ ですか。','Where is the cat?'],
     ['これは __________ ですか。','What is this?'],
     ['いま __________ ですか。','What time is it now?'],
     ['ケーキは __________ ですか。','How much is the cake?']]},
  {file:'48_IAdjectives_Practice_NoClues.svg', title:'い-Adjectives', jp:'いけいようしの れんしゅう',
   instruction:'Complete each sentence using the English meaning.',
   bank:'おおきい　・　ちいさい　・　おいしい　・　あおい　・　あかい',
   rows:[['ケーキは __________ です。','The cake is delicious.'],
     ['いぬは __________ です。','The dog is big.'],
     ['そらは __________ です。','The sky is blue.'],
     ['りんごは __________ です。','The apple is red.'],
     ['ねこは __________ です。','The cat is small.']]},
  {file:'49_NaAdjectives_Practice_NoClues.svg', title:'な-Adjectives', jp:'なけいようしの れんしゅう',
   instruction:'Complete each sentence. One word is used twice.',
   bank:'すき　・　きらい　・　げんき　・　きれい',
   rows:[['ねこは __________ です。','I like cats.'],
     ['はなは __________ です。','The flower is pretty.'],
     ['わたしは __________ です。','I am well.'],
     ['ブロッコリーは __________ です。','I dislike broccoli.'],
     ['__________ な はな','a pretty flower']]},
];
for (const sheet of sheets) {
  const rows=sheet.rows.map(([jp,en],i)=>{
    const y=310+i*158;
    return `<g><rect x="52" y="${y}" width="716" height="138" rx="20" fill="${i%2 ? '#f1f7f4' : '#fff2f4'}"/>
      <circle cx="85" cy="${y+38}" r="19" fill="#785a8d"/><text x="85" y="${y+45}" text-anchor="middle" fill="white" font-size="21">${i+1}</text>
      <text x="120" y="${y+48}" font-size="27">${esc(jp)}</text>
      <text x="120" y="${y+91}" font-size="23" fill="#5e5b6f">${esc(en)}</text></g>`;
  }).join('\n');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="820" height="1240" viewBox="0 0 820 1240" role="img" aria-labelledby="title description">
    <title id="title">${esc(sheet.title)} practice</title>
    <desc id="description">Five fill-in-the-blank exercises with English prompts and a Japanese word bank. No picture hints or printed answers.</desc>
    <rect width="820" height="1240" rx="24" fill="#fffcf6"/>
    <rect x="20" y="20" width="780" height="1200" rx="24" fill="none" stroke="#e2d2e9" stroke-width="4" stroke-dasharray="9 7"/>
    <g font-family="'Noto Sans JP', 'Yu Gothic', 'Meiryo', sans-serif" fill="#40354c">
      <text x="410" y="89" text-anchor="middle" font-size="34" font-weight="bold">${esc(sheet.jp)}</text>
      <text x="410" y="139" text-anchor="middle" font-size="32" fill="#785a8d">${esc(sheet.title)}</text>
      <text x="410" y="188" text-anchor="middle" font-size="22">${esc(sheet.instruction)}</text>
      <rect x="52" y="217" width="716" height="66" rx="18" fill="#f1e9f6"/>
      <text x="410" y="258" text-anchor="middle" font-size="23">${esc(sheet.bank)}</text>
      ${rows}
      <text x="60" y="1148" font-size="21">Name ____________________   Date ______________</text>
      <text x="410" y="1190" text-anchor="middle" font-size="18" fill="#785a8d">Read your completed sentences aloud.</text>
    </g>
  </svg>\n`;
  fs.writeFileSync(path.join(__dirname,'WorkbookPages_Correct',sheet.file),svg);
}
console.log('Generated 3 ebook practice sheets without picture clues or printed answers.');
