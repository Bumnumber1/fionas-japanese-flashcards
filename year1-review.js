(() => {
  'use strict';
  const STORAGE_KEY = 'fiona-year1-review-weeks1-13-v1';
  const { weeks, catalog } = window.Year1Review;
  const allItems = Object.values(catalog).flat();
  const validIds = new Set(allItems.map(item => item.id));
  let selected = new Set(validIds);
  let storageMessage = 'Choices save automatically on this device.';
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.selected)) selected = new Set(saved.selected.filter(id => validIds.has(id)));
  } catch { storageMessage = 'Saved choices could not be loaded. You can still prepare a lesson here.'; }

  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  let tab = 'words';
  let lesson = false;
  let printing = false;
  let deck = [];
  let cardIndex = 0;
  const labels = {
    words: ['YOUR WORD PATCH', 'A little word, a big discovery'],
    patterns: ['LET’S PUT IT TOGETHER', 'Little pieces, lovely sentences'],
    phrases: ['SOMETHING TO SAY', 'Everyday words to share']
  };
  for (const week of weeks) $('week').add(new Option(`Week ${week.w} · ${week.title}`, week.w));

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ selected: [...selected] }));
      storageMessage = '✓ Choices saved in this browser.';
    } catch { storageMessage = 'Choices work for this visit, but this browser could not save them. Print your lesson to keep a copy.'; }
    $('save-status').textContent = storageMessage;
  }
  function updateSummary() {
    const counts = Object.fromEntries(Object.entries(catalog).map(([key, items]) => [key, items.filter(item => selected.has(item.id)).length]));
    $('selection-summary').textContent = `${counts.words} words · ${counts.patterns} sentence patterns · ${counts.phrases} basic phrases selected`;
    for (const key of Object.keys(catalog)) $(key + '-count').textContent = `${counts[key]}/${catalog[key].length}`;
    $('start').disabled = selected.size === 0;
    $('print').disabled = selected.size === 0;
    $('save-status').textContent = storageMessage;
    if (window.GardenGames) GardenGames.update(selected);
  }
  function visibleItems(type) {
    if (printing) return catalog[type].filter(item => selected.has(item.id));
    const query = $('search').value.trim().toLocaleLowerCase();
    const week = $('week').value;
    return catalog[type].filter(item => {
      if ((lesson || $('selected-only').checked) && !selected.has(item.id)) return false;
      if (!lesson && week !== 'all' && !(item.weeks || [item.week]).includes(Number(week))) return false;
      const searchable = [item.jp, item.romaji, item.en, item.title, item.explain, ...(item.examples || []).flatMap(example => [example.jp, example.romaji, example.en])].join(' ').toLocaleLowerCase();
      return lesson || !query || searchable.includes(query);
    });
  }
  function translated(item) {
    return `<div class="jp" lang="ja">${escape(item.jp)}</div><div class="romaji">${escape(item.romaji)}</div><div class="english">${escape(item.en)}</div>`;
  }
  function renderItem(item) {
    const check = `<input type="checkbox" data-id="${escape(item.id)}" aria-label="Include ${escape(item.jp || item.title)}" ${selected.has(item.id) ? 'checked' : ''}>`;
    let body;
    if (item.type === 'patterns') {
      body = `<div class="pattern-content"><h4>${escape(item.title)}</h4><p class="explanation">${escape(item.explain)}</p>${item.examples.map(example => `<div class="example">${translated(example)}</div>`).join('')}</div>`;
    } else {
      body = `<div class="word-body">${item.type === 'words' ? `<div class="word-top"><span class="word-emoji" aria-hidden="true">${escape(item.emoji)}</span><div>${translated(item)}</div></div>` : translated(item)}${item.extra ? '<small class="source-note">🌱 From this week’s sentence lesson</small>' : ''}</div>`;
    }
    // In lesson/print mode the content is no longer a clickable checkbox label.
    const tag = lesson || printing ? 'div' : 'label';
    return `<article class="review-card ${selected.has(item.id) ? 'is-selected' : ''}"><${tag} class="card-label">${lesson || printing ? '' : check}${body}</${tag}></article>`;
  }
  function renderSection(type) {
    const items = visibleItems(type);
    if (!items.length) return '<div class="empty"><span aria-hidden="true">🌱</span><strong>No little discoveries here yet.</strong>' + (lesson ? 'Edit your lesson choices to add some.' : 'Try another search or week, or turn off “Selected only”.') + '</div>';
    return `<div class="${type}">${weeks.map(week => {
      const group = items.filter(item => item.week === week.w);
      if (!group.length) return '';
      return `<section class="week-group"><div class="week-heading"><h3>${escape(week.emoji)} Week ${week.w} · ${escape(week.title)}</h3><small>${group.length} ${type === 'words' ? 'words' : type === 'patterns' ? 'pattern' : 'phrases'}</small></div><div class="cards">${group.map(renderItem).join('')}</div></section>`;
    }).join('')}</div>`;
  }
  function render() {
    $('library-kicker').textContent = labels[tab][0];
    $('library-title').textContent = printing ? 'Today’s selected review' : labels[tab][1];
    $('review-content').innerHTML = printing ? Object.keys(catalog).filter(type => visibleItems(type).length).map(type => `<h2 class="print-section-title">${type === 'words' ? 'Words' : type === 'patterns' ? 'Sentence patterns' : 'Basic phrases'}</h2>${renderSection(type)}`).join('') : renderSection(tab);
    const visible = visibleItems(tab);
    $('results').textContent = `${visible.length} shown · ${visible.filter(item => selected.has(item.id)).length} selected here`;
    $('select-visible').disabled = !visible.length;
    $('clear-visible').disabled = !visible.length;
    updateSummary();
  }
  function renderFlashcard() {
    const item = deck[cardIndex];
    $('practice').hidden = !lesson || !item;
    if (!item) return;
    $('card-position').textContent = `${cardIndex + 1} / ${deck.length}`;
    $('flashcard').innerHTML = `<div class="word-emoji" aria-hidden="true">${escape(item.emoji)}</div><div class="jp" lang="ja">${escape(item.jp)}</div><div class="romaji">${escape(item.romaji)}</div><div id="flash-answer" class="flash-answer" hidden><div>${escape(item.en)}</div><small>Week ${item.week}${item.extra ? ' · Sentence lesson' : ''}</small></div>`;
    $('reveal').textContent = 'Reveal answer';
    $('reveal').setAttribute('aria-expanded', 'false');
    $('previous').disabled = cardIndex === 0;
    $('next').disabled = cardIndex === deck.length - 1;
  }
  function setLesson(active) {
    lesson = active;
    document.body.classList.toggle('lesson', lesson);
    $('start').hidden = lesson;
    $('edit').hidden = !lesson;
    $('filters').hidden = lesson;
    $('bulk').hidden = lesson;
    $('mode-label').textContent = lesson ? '02 / LET’S GROW TOGETHER' : '01 / PREPARE TOGETHER';
    $('planner-title').textContent = lesson ? 'Today’s review is ready!' : 'Pick today’s little discoveries';
    $('mode-help').textContent = lesson ? 'Say each word, then reveal its meaning. Explore the selected sentence patterns and phrases below.' : 'Check the words, patterns, and phrases you’d like to include. Your choices stay saved in this browser.';
    if (lesson) { deck = catalog.words.filter(item => selected.has(item.id)); cardIndex = 0; }
    renderFlashcard();
    render();
    (lesson ? $('edit') : $('start')).focus();
  }
  $('review-content').addEventListener('change', event => {
    const input = event.target.closest('input[data-id]');
    if (!input) return;
    if (input.checked) selected.add(input.dataset.id); else selected.delete(input.dataset.id);
    save();
    // Avoid replacing the focused checkbox unless a selected-only filter removes it.
    if ($('selected-only').checked && !input.checked) render();
    else {
      input.closest('.review-card').classList.toggle('is-selected', input.checked);
      const visible = visibleItems(tab);
      $('results').textContent = `${visible.length} shown · ${visible.filter(item => selected.has(item.id)).length} selected here`;
      updateSummary();
    }
  });
  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
    tab = button.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    render();
  }));
  $('search').addEventListener('input', render);
  $('week').addEventListener('change', render);
  $('selected-only').addEventListener('change', render);
  for (const [id, checked] of [['select-visible', true], ['clear-visible', false]]) $(id).addEventListener('click', () => {
    visibleItems(tab).forEach(item => checked ? selected.add(item.id) : selected.delete(item.id));
    save(); render();
  });
  for (const id of ['romaji', 'english']) $(id).addEventListener('change', () => document.body.classList.toggle('no-' + id, !$(id).checked));
  $('start').addEventListener('click', () => { if (selected.size) setLesson(true); });
  $('edit').addEventListener('click', () => setLesson(false));
  $('reveal').addEventListener('click', () => {
    const answer = $('flash-answer');
    answer.hidden = !answer.hidden;
    $('reveal').textContent = answer.hidden ? 'Reveal answer' : 'Hide answer';
    $('reveal').setAttribute('aria-expanded', String(!answer.hidden));
  });
  $('previous').addEventListener('click', () => { if (cardIndex > 0) { cardIndex--; renderFlashcard(); } });
  $('next').addEventListener('click', () => { if (cardIndex < deck.length - 1) { cardIndex++; renderFlashcard(); } });
  $('shuffle').addEventListener('click', () => {
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    cardIndex = 0; renderFlashcard();
  });
  $('print').addEventListener('click', () => window.print());
  window.addEventListener('beforeprint', () => { printing = true; render(); });
  window.addEventListener('afterprint', () => { printing = false; render(); });
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
