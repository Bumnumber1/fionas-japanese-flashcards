// QA for weekly-workbook.html / weekly-workbook.js.
// Validates all 260 weeks and 520 virtual print pages against the source curriculum.
const fs = require('fs');
const vm = require('vm');
const engine = require('./weekly-workbook.js');

const ctx = { window: {} };
vm.createContext(ctx);
for (let year = 1; year <= 5; year++) {
    vm.runInContext(fs.readFileSync('curriculum_y' + year + '.js', 'utf8'), ctx);
}

const catalog = ctx.window.CURRICULUM;
const problems = [];
let weeks = 0;
let virtualPages = 0;
let vocabEntries = 0;
let grammarExamples = 0;
let answerChecks = 0;

function bad(year, week, message) {
    problems.push('Y' + year + ' W' + week + ': ' + message);
}

function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

for (let year = 1; year <= 5; year++) {
    for (let week = 1; week <= 52; week++) {
        const source = catalog[year].weeks.find(w => w.w === week);
        let model;
        try {
            model = engine.buildWeek(catalog, year, week);
        } catch (error) {
            bad(year, week, error.message);
            continue;
        }
        weeks++;
        virtualPages += 2;

        if (model.id !== 'y' + year + 'w' + week) bad(year, week, 'unstable page id');
        if (model.title !== source.title || model.jp !== source.jp || model.goal !== source.goal) {
            bad(year, week, 'header drifted from curriculum source');
        }
        if (!same(model.learn.vocab, source.vocab)) bad(year, week, 'vocabulary drifted from source');
        if (!same(model.learn.examples, source.grammar.examples)) bad(year, week, 'examples drifted from source');
        if (!same(model.learn.phrases, source.phrases || [])) bad(year, week, 'phrases drifted from source');
        if (!same(model.learn.kanji, source.kanji || [])) bad(year, week, 'kanji drifted from source');
        if (!same(model.learn.writing, source.writing.chars)) bad(year, week, 'writing targets drifted from source');
        vocabEntries += model.learn.vocab.length;
        grammarExamples += model.learn.examples.length;

        const match = model.practice.match;
        const expectedRows = Math.min(6, source.vocab.length);
        if (match.rows.length !== expectedRows || match.meanings.length !== expectedRows) {
            bad(year, week, 'match exercise has an incorrect row count');
        }
        for (const answer of match.answers) {
            const row = match.rows.find(r => r.id === answer.id);
            const meaning = match.meanings.find(m => m.letter === answer.letter);
            if (!row || !meaning || row.en !== meaning.en || answer.en !== row.en) {
                bad(year, week, 'match answer key mismatch at row ' + answer.id);
            }
            answerChecks++;
        }

        const cloze = model.practice.cloze;
        if (cloze) {
            if (!source.grammar.examples.some(ex => ex.jp === cloze.source)) {
                bad(year, week, 'cloze is not sourced from a grammar example');
            }
            if (cloze.prompt.replace('＿＿＿＿', cloze.answer) !== cloze.source) {
                bad(year, week, 'cloze answer does not reconstruct the source');
            }
            answerChecks++;
        }

        const translation = model.practice.translation;
        if (translation && !source.grammar.examples.some(ex => same(ex, translation))) {
            bad(year, week, 'translation answer is not an exact curriculum example');
        }
        if (translation) answerChecks++;

        if (!same(model.practice.story, source.story || null)) bad(year, week, 'story drifted from source');
        if (model.practice.culture !== (source.culture || '')) bad(year, week, 'culture text drifted from source');

        if (model.practice.story && model.practice.story.questions) {
            for (const q of model.practice.story.questions.slice(0, 2)) {
                if (!Array.isArray(q.options) || !Number.isInteger(q.answer) ||
                    q.answer < 0 || q.answer >= q.options.length) {
                    bad(year, week, 'story answer key is invalid');
                }
                answerChecks++;
            }
        }
    }
}

const html = fs.readFileSync('weekly-workbook.html', 'utf8');
for (const required of [
    'data-page="learn"', 'data-page="practice"', 'window.print()',
    'curriculum_y1.js', 'curriculum_y5.js', 'weekly-workbook.js'
]) {
    if (!html.includes(required)) problems.push('HTML missing required marker: ' + required);
}

console.log('weeks: ' + weeks + ' | printable pages: ' + virtualPages);
console.log('vocabulary placements: ' + vocabEntries + ' | grammar examples: ' + grammarExamples);
console.log('answer-key checks: ' + answerChecks);
if (problems.length) {
    console.error(problems.join('\n'));
    console.error(problems.length + ' weekly-workbook QA problem(s).');
    process.exit(1);
}
console.log('All weekly workbook checks passed. ✔');
