/* Fiona's Dojo: UI orchestration. Lesson material, stroke data, and saves stay local. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const G = window.DojoGame;
  if (!G || !window.Year1Review || !window.GardenMaterial) {
    $('welcome-note').textContent = 'The dojo could not load its lesson files. Reload this page to try again.';
    $('start-button').disabled = true;
    return;
  }
  const FINAL_BELT = G.BELTS.length - 1;
  const words = Year1Review.catalog.words;
  const compoundForms = new Map();
  if (window.DojoVoice && window.DojoWriting) words.forEach(word => {
    DojoVoice.spellingsFor({ mode: 'word-read', prompt: word.jp, reading: word.romaji }).forEach(form => {
      if (/^[一-龯]{2,}$/u.test(form) && [...form].every(char => DojoWriting.hasCharacter(char))) {
        compoundForms.set(form, { char: form, read: word.jp, mean: word.en });
      }
    });
  });
  const material = { words, kanji: GardenMaterial.build(words.map(word => word.id)).kanji, advancedKanji: [...compoundForms.values()] };
  let saved = null;
  let storageAvailable = true;
  try { saved = JSON.parse(localStorage.getItem(G.SAVE_VERSION) || 'null'); } catch (_) { storageAvailable = false; }
  let progress = G.sanitizeProgress(saved && saved.progress);
  let fight = G.sanitizeFight(saved && saved.fight, progress);
  if (fight && fight.recorded) fight = null;
  let question = null;
  let phase = 'lobby';
  let recent = Array.isArray(saved && saved.recent) ? saved.recent.filter(id => typeof id === 'string').slice(-12) : [];
  let assisted = false;
  let answerResolved = Boolean(saved && (saved.answerResolved === true || saved.phase === 'answered'));
  let answerWasBlock = Boolean(saved && saved.answerWasBlock);
  let writingIndex = 0;
  let challengeSet = null;
  let writingDraft = null;
  let restoringWriting = false;
  let selectedMove = typeof (saved && saved.selectedMove) === 'string' ? saved.selectedMove : 'front-kick';
  let selectedBelt = fight ? fight.beltIndex : progress.belt;
  let resultSummary = null;
  let scene = null;
  let writing = null;
  let voice = null;
  let listening = false;
  let voiceStatus = 'idle';
  let handsFree = false;
  let recoveryHandsFree = false;
  let resetResumeHandsFree = false, resetConfirmed = false, resetReturnFocus = null;
  let autoListenTimer, autoAdvanceTimer, speedNoticeTimer;
  let flurryTimes = [], flurryNoticeTimer;
  let readingStartedAt = 0, readingSpeedEligible = false, quietRetries = 0, transientRetries = 0;
  let calloutTimer;
  let soundEnabled = saved && saved.soundEnabled === true;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = typeof (saved && saved.reducedMotion) === 'boolean' ? saved.reducedMotion : motionQuery.matches;
  let rewardId = 'reading';
  let flavor = 'strawberry';
  let audioContext;
  const tabletQuery = window.matchMedia('(min-width:600px) and (max-width:1400px) and (any-pointer:coarse)');
  let tabletPanel = '', tabletReturnFocus = null, screenModeBusy = false;
  let tabletInkFrame = 0, revealTabletFeedback = false;
  const panelBackground = new Map();
  const moveIcons = { punch: '➝', 'front-kick': '↗', roundhouse: '◔', 'side-kick': '→', 'axe-kick': '↓', 'turning-kick': '↻', 'back-kick': '↶', 'double-kick': '⇉', 'jump-front-kick': '⇧', 'jump-side-kick': '⇗', 'spinning-hook-kick': '⤴', 'tornado-kick': '✧', 'flying-double-kick': '⇈', 'jump-roundhouse': '⤴', 'spinning-back-kick': '⤶', 'whirlwind-combo': '⟳', 'dragon-finisher': '✦' };
  const modeLabels = { 'word-read': 'WORD READING', 'kanji-write': 'KANJI WORD WRITING' };
  const modeShort = { 'word-read': 'Read words', 'kanji-write': 'Write kanji words' };
  const scriptName = activity => activity.script === 'katakana' ? 'katakana' : 'hiragana';
  const activityLabel = activity => activity.mode === 'kana-read' || activity.mode === 'kana-write' ? `${scriptName(activity).toUpperCase()} ${activity.mode === 'kana-read' ? 'READING' : 'WRITING'}` : modeLabels[activity.mode];
  const activityShort = activity => activity.mode === 'kana-read' || activity.mode === 'kana-write' ? `${activity.mode === 'kana-read' ? 'Read' : 'Write'} ${scriptName(activity)}` : modeShort[activity.mode];
  const open = dialog => { if (!dialog.open) dialog.showModal(); };

  function updateScreenMode() {
    const full = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    const supported = Boolean((document.fullscreenEnabled && document.documentElement.requestFullscreen) ||
      (document.webkitFullscreenEnabled && document.documentElement.webkitRequestFullscreen));
    $('screen-mode-button').hidden = !supported;
    $('screen-mode-button').disabled = screenModeBusy;
    $('screen-mode-button').setAttribute('aria-pressed', String(full));
    $('screen-mode-button').textContent = full ? 'Exit full screen' : 'Full screen';
  }
  function updatePlayView() {
    const active = phase === 'question' || phase === 'answered';
    document.body.classList.toggle('is-playing', active);
    document.body.classList.toggle('is-writing', active && Boolean(writingMode()));
    document.body.classList.toggle('is-answered', phase === 'answered');
    if ((!active || !tabletQuery.matches) && tabletPanel) closeTabletPanel({ resume: active, focus: false });
    const move = G.MOVES.find(item => item.id === (question && active ? question.techniqueId : selectedMove));
    $('tablet-move-label').textContent = fight && fight.pendingDamage > 0 && phase === 'question' ? 'Guard & block' : move ? move.name : 'Your move';
    updateScreenMode();
    fitTabletWriting();
  }
  function fitTabletWriting(revealFeedback = false) {
    revealTabletFeedback = revealTabletFeedback || revealFeedback;
    cancelAnimationFrame(tabletInkFrame);
    tabletInkFrame = requestAnimationFrame(() => {
      tabletInkFrame = 0;
      const card = document.querySelector('.practice-card'), canvas = $('writing-canvas');
      const active = tabletQuery.matches && ['question', 'answered'].includes(phase);
      if (active && writingMode() && canvas.getClientRects().length) {
        // Use the actual remaining lesson height, including master warnings,
        // compound prompts, hints and feedback, rather than one fixed pad size.
        const cardBox = card.getBoundingClientRect(), padBox = canvas.getBoundingClientRect();
        const bottom = Math.max(...[...card.children].filter(node => node.getClientRects().length).map(node => node.getBoundingClientRect().bottom));
        const otherContent = bottom - cardBox.top + card.scrollTop - padBox.height;
        const room = card.clientHeight - parseFloat(getComputedStyle(card).paddingBottom) - otherContent - 3;
        const minimum = phase === 'answered' ? 120 : 220, maximum = phase === 'answered' ? 220 : 380;
        const size = Math.max(minimum, Math.floor(Math.min(maximum, $('writing-area').clientWidth, room)));
        canvas.style.setProperty('--tablet-ink-size', size + 'px');
      } else if (!active) canvas.style.removeProperty('--tablet-ink-size');
      if (revealTabletFeedback && active && !tabletPanel && !$('feedback').hidden) $('feedback').scrollIntoView({ block: 'nearest', inline: 'nearest' });
      revealTabletFeedback = false;
    });
  }
  function closeTabletPanel(options = {}) {
    if (!tabletPanel) return;
    const panel = $(tabletPanel === 'moves' ? 'moves-panel' : 'journey-panel');
    tabletPanel = '';
    delete document.body.dataset.tabletPanel;
    panel.removeAttribute('role'); panel.removeAttribute('aria-modal');
    $('tablet-panel-backdrop').hidden = true;
    for (const [node, previous] of panelBackground) {
      node.inert = previous.inert;
      if (previous.hidden === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', previous.hidden);
    }
    panelBackground.clear();
    $('show-moves-button').setAttribute('aria-expanded', 'false');
    $('show-journey-button').setAttribute('aria-expanded', 'false');
    if (options.focus !== false && tabletReturnFocus && tabletReturnFocus.isConnected && tabletReturnFocus.getClientRects().length) tabletReturnFocus.focus({ preventScroll: true });
    tabletReturnFocus = null;
    fitTabletWriting();
    if (options.resume !== false) { if (phase === 'answered') advanceHandsFree(); else queueHandsFree(); }
  }
  function openTabletPanel(kind) {
    if (!tabletQuery.matches || !['question', 'answered'].includes(phase)) return;
    if (tabletPanel === kind) { closeTabletPanel(); return; }
    closeTabletPanel({ resume: false, focus: false });
    tabletReturnFocus = $('show-' + kind + '-button');
    resetFlurry(); cancelVoice();
    tabletPanel = kind;
    const panel = $(kind === 'moves' ? 'moves-panel' : 'journey-panel');
    document.body.dataset.tabletPanel = kind;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    $('tablet-panel-backdrop').hidden = false;
    $('show-' + kind + '-button').setAttribute('aria-expanded', 'true');
    const background = ['.topbar', '.page-heading', '.dojo-toolbar', '.arena', '.practice-card', '.flurry-rule', 'footer', kind === 'moves' ? '.journey-column' : '.moves-card'];
    background.forEach(selector => {
      const node = document.querySelector(selector);
      if (!node) return;
      panelBackground.set(node, { inert: node.inert === true, hidden: node.getAttribute('aria-hidden') });
      node.inert = true; node.setAttribute('aria-hidden', 'true');
    });
    panel.scrollTop = 0;
    panel.querySelector('[data-close-panel]').focus({ preventScroll: true });
  }

  function save() {
    try {
      localStorage.setItem(G.SAVE_VERSION, JSON.stringify({ progress, fight, question, challengeSet, writingDraft, phase, recent, assisted, answerResolved, answerWasBlock, writingIndex, selectedMove, soundEnabled, reducedMotion }));
      storageAvailable = true;
    } catch (_) { storageAvailable = false; }
    $('save-status').textContent = storageAvailable ? '● Progress saved on this device' : 'Progress is temporary · browser storage unavailable';
  }
  function askResetGame(button) {
    if ($('reset-game-dialog').open) return;
    resetResumeHandsFree = handsFree;
    resetReturnFocus = button;
    resetConfirmed = false;
    handsFree = false;
    cancelVoice();
    updateHandsFree('Microphone paused while you choose whether to start over.');
    save();
    open($('reset-game-dialog'));
    $('cancel-reset-game').focus({ preventScroll: true });
  }
  function resetGame() {
    if (!$('reset-game-dialog').open) return;
    resetConfirmed = true; resetResumeHandsFree = false;
    // Replace live state before closing dialogs or saving. Late speech,
    // dialog-close handlers and pagehide can never restore the old match.
    phase = 'lobby'; handsFree = false; saved = null;
    cancelVoice();
    if (voice && typeof voice.reset === 'function') voice.reset();
    clearTimeout(speedNoticeTimer); clearTimeout(calloutTimer);
    resetFlurry(true);
    cancelAnimationFrame(tabletInkFrame); tabletInkFrame = 0; revealTabletFeedback = false;
    progress = G.createProgress(); fight = null; question = null; recent = [];
    challengeSet = null; writingDraft = null; resultSummary = null;
    selectedBelt = 0; selectedMove = 'front-kick'; writingIndex = 0;
    assisted = false; answerResolved = false; answerWasBlock = false;
    readingStartedAt = 0; readingSpeedEligible = false; quietRetries = 0; transientRetries = 0;
    recoveryHandsFree = false; voiceStatus = 'idle'; listening = false;
    rewardId = 'reading'; flavor = 'strawberry';
    if (writing) writing.setCharacter('', { showGuide: false });
    ['speed-notice', 'flurry-notice', 'voice-transcript'].forEach(id => { $(id).hidden = true; $(id).textContent = ''; });
    $('action-callout').textContent = ''; $('action-callout').classList.remove('pop', 'combo-callout'); $('action-callout').style.opacity = '';
    $('voice-recovery').hidden = true; $('feedback').hidden = true; $('hint-text').hidden = true;
    $('feedback-title').textContent = ''; $('feedback-detail').textContent = ''; $('hint-text').textContent = '';
    $('mic-diagnostics').value = '';
    closeTabletPanel({ resume: false, focus: false });
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    renderLobby();
    $('start-button').focus({ preventScroll: true });
  }
  function sound(kind) {
    // Keep optional output audio from competing with Safari's open microphone.
    // This does not alter the learner's saved sound preference.
    if (!soundEnabled || voice && voice.safariMode && (voice.captureActive || handsFree || listening)) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      const now = audioContext.currentTime;
      const notes = kind === 'win' ? [440, 554, 659, 880] : kind === 'knockdown' ? [220, 110, 65] : kind === 'combo' ? [440, 660, 880] : kind === 'wrong' ? [180, 135] : [520, 700];
      notes.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
        oscillator.type = kind === 'wrong' || kind === 'knockdown' ? 'triangle' : 'sine';
        oscillator.frequency.value = frequency;
        oscillator.connect(gain); gain.connect(audioContext.destination);
        const start = now + index * .085;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(.055, start + .015);
        gain.gain.exponentialRampToValueAtTime(.001, start + .2);
        oscillator.start(start); oscillator.stop(start + .22);
      });
    } catch (_) { /* Audio is optional; learning and combat remain available. */ }
  }
  function applyPreferences() {
    $('sound-toggle').setAttribute('aria-pressed', String(soundEnabled));
    $('sound-toggle').textContent = soundEnabled ? 'Sound on' : 'Sound off';
    $('motion-toggle').setAttribute('aria-pressed', String(reducedMotion));
    document.body.classList.toggle('calm-motion', reducedMotion);
    if (scene) scene.setReducedMotion(reducedMotion);
  }
  function formatHealth(value) { return String(Math.round(value * 10) / 10); }
  function setHealth(id, value, maximum = 100) {
    $(id).setAttribute('aria-valuenow', formatHealth(value));
    $(id).setAttribute('aria-valuemax', String(maximum));
    $(id).querySelector('span').style.width = Math.max(0, Math.min(100, value / maximum * 100)) + '%';
  }
  function updateHud() {
    updatePlayView();
    const belt = G.BELTS[selectedBelt], opponent = G.OPPONENTS[selectedBelt];
    $('round-label').textContent = `${belt.name.toUpperCase()} BELT · MATCH ${String(selectedBelt + 1).padStart(2, '0')}`;
    $('player-belt').textContent = G.BELTS[progress.belt].name + ' belt';
    $('opponent-name').textContent = opponent.name;
    $('opponent-style').textContent = opponent.title;
    const opponentMaxHp = fight ? fight.opponentMaxHp || 100 : 150;
    const playerHp = fight ? fight.playerHp : 100, opponentHp = fight ? fight.opponentHp : opponentMaxHp;
    setHealth('player-health', playerHp); setHealth('opponent-health', opponentHp, opponentMaxHp);
    $('player-hp').textContent = formatHealth(playerHp) + ' / 100'; $('opponent-hp').textContent = formatHealth(opponentHp) + ' / ' + opponentMaxHp;
    $('master-rule').hidden = !opponent.unblockableMistakes;
    $('master-rule-description').textContent = `${opponent.name} hits immediately for 33.3% of your full energy after each mistake. Three mistakes end the match.`;
    $('dojo-canvas').setAttribute('aria-label', `Fiona, an orange-haired female fighter with shoulder-length hair and bangs, faces ${opponent.name}${opponent.unblockableMistakes ? ', the final master with short grey hair' : ''} in a 3D dojo`);
    $('streak-label').textContent = (fight ? fight.streak : 0) + ' hit streak';
    $('rival-note').textContent = opponent.story;
    if (phase === 'lobby') $('arena-caption').textContent = opponent.story;
  }
  function updateFighters() {
    if (scene) scene.setFighters({ playerBelt: G.BELTS[progress.belt].color, opponent: { ...G.OPPONENTS[selectedBelt], belt: G.BELTS[selectedBelt].color, color: G.OPPONENTS[selectedBelt].accent, scale: [.98, .93, 1.06, 1.03, .97, 1.05, .95, 1.02, .98, 1.02, 1.02][selectedBelt] || 1 } });
  }
  function renderProgress() {
    $('belt-counter').replaceChildren(document.createTextNode(String(progress.belt + 1)), Object.assign(document.createElement('span'), { textContent: '/' + G.BELTS.length }));
    $('belt-path').replaceChildren();
    G.BELTS.forEach((belt, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'belt-step' + (index === selectedBelt ? ' current' : '');
      button.disabled = index > progress.belt || phase !== 'lobby';
      button.style.setProperty('--belt', belt.color);
      button.setAttribute('aria-label', belt.name + ' belt: ' + activityShort(belt) + (index > progress.belt ? ', locked' : ', select match'));
      if (index === selectedBelt) button.setAttribute('aria-current', 'step');
      const swatch = document.createElement('span'); swatch.className = 'belt-swatch'; swatch.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.append(Object.assign(document.createElement('strong'), { textContent: belt.name + ' belt' }), Object.assign(document.createElement('small'), { textContent: activityShort(belt) }));
      const status = document.createElement('span'); status.className = 'belt-state'; status.textContent = index < progress.belt ? '✓' : index === progress.belt ? '●' : '·'; status.setAttribute('aria-hidden', 'true');
      button.append(swatch, label, status);
      button.addEventListener('click', () => {
        selectedBelt = index;
        if (fight && fight.beltIndex !== index) { fight = null; question = null; challengeSet = null; writingDraft = null; }
        renderLobby();
      });
      $('belt-path').append(button);
    });
    $('record-wins').textContent = progress.wins;
    $('record-combo').textContent = Math.max(progress.bestStreak, fight ? fight.bestStreak : 0);
    const earned = G.REWARDS.filter(reward => progress.rewards[reward.id].unlocked);
    const claimed = earned.filter(reward => progress.rewards[reward.id].claimed);
    const newKatakana = G.REWARDS.filter(reward => reward.id.startsWith('katakana-') && reward.beltIndex <= progress.belt && !progress.rewards[reward.id].unlocked);
    $('reward-button').disabled = !earned.length;
    $('reward-button').textContent = `${earned.length} / ${G.REWARDS.length} earned · ${claimed.length} saved`;
    $('reward-description').textContent = claimed.length === G.REWARDS.length ? 'All six treats are saved in your champion collection!' : newKatakana.length ? `New katakana treats await! Replay ${newKatakana.map(reward => G.BELTS[reward.beltIndex].name.toLowerCase()).join(' and ')} belt to earn them. Your collected flavours stay saved.` : 'Hiragana and katakana each earn reading and writing treats, plus word reading and kanji. Saved on this device.';
    $('reward-list').replaceChildren();
    G.REWARDS.forEach((reward, index) => {
      const entry = progress.rewards[reward.id], button = document.createElement('button');
      button.type = 'button'; button.dataset.reward = reward.id; button.disabled = !entry.unlocked;
      button.className = 'reward-item' + (entry.claimed ? ' collected' : '');
      button.append(Object.assign(document.createElement('span'), { textContent: ['🍦', '🍧', '🍦', '🍧', '🍨', '🍨'][index] || '🍦' }));
      const label = document.createElement('span'); label.textContent = reward.title;
      label.append(Object.assign(document.createElement('small'), { textContent: entry.claimed ? entry.flavor + ' · saved ✓' : entry.unlocked ? 'Earned · choose flavour →' : 'Defeat ' + G.OPPONENTS[reward.beltIndex].name + ' · ' + G.BELTS[reward.beltIndex].name + ' belt' }));
      button.append(label); button.addEventListener('click', () => openReward(reward.id)); $('reward-list').append(button);
    });
  }
  function renderMoves() {
    const unlocked = G.availableMoves(progress.belt);
    if (!unlocked.some(move => move.id === selectedMove)) selectedMove = 'front-kick';
    const basics = G.MOVES.filter(move => move.kind === 'basic');
    const specials = G.MOVES.filter(move => move.kind === 'special');
    const earned = unlocked.filter(move => move.kind === 'special').length;
    const choiceLocked = Boolean(fight && question && !answerResolved && challengeSet && challengeSet.locked);
    const choiceNote = $('move-choice-note');
    if (choiceNote) choiceNote.textContent = phase === 'question' && fight && fight.pendingDamage > 0 ? 'Complete this block chance before choosing another technique.' : choiceLocked ? 'Your technique is locked for this turn because you used a hint or started writing. Finish this challenge to choose again.' : challengeSet && challengeSet.switched && phase === 'question' ? 'Your challenges stay fixed when you change technique. Speed bonuses return on the next fresh turn.' : 'Changing technique keeps its challenge. Hints and writing lock your choice for this turn.';
    $('move-count').textContent = `${basics.length} basics · ${earned} / ${specials.length} specials`;
    $('move-list').replaceChildren();
    [{ kind: 'basic', name: 'The basics', note: 'All available at white belt', moves: basics }, { kind: 'special', name: 'Specials & finishers', note: 'Earn one at every new belt · harder activities, bigger hits', moves: specials }].forEach(group => {
      const section = document.createElement('section'); section.className = 'move-section';
      const heading = document.createElement('h3'); heading.textContent = group.name;
      heading.append(Object.assign(document.createElement('small'), { textContent: group.note }));
      const grid = document.createElement('div'); grid.className = 'technique-grid'; grid.id = group.kind === 'basic' ? 'basic-moves' : 'special-moves';
      group.moves.forEach(move => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'move-button' + (move.kind === 'special' ? ' special-move' : '');
        button.dataset.move = move.id; button.dataset.kind = move.kind;
        button.disabled = move.unlock > progress.belt || phase === 'answered' || listening || choiceLocked || (phase === 'question' && fight && fight.pendingDamage > 0);
        button.setAttribute('aria-pressed', String(move.id === selectedMove)); button.title = move.description;
        const icon = document.createElement('span'); icon.className = 'move-icon'; icon.textContent = moveIcons[move.id] || '✦'; icon.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span'); label.textContent = move.name;
        label.append(Object.assign(document.createElement('small'), { textContent: move.kind === 'basic' ? 'Standard drill · 14 base damage' : `${move.unlock > progress.belt ? G.BELTS[move.unlock].name + ' belt · ' : ''}Harder activity · +${move.bonus} damage` }));
        button.append(icon, label);
        button.addEventListener('click', () => {
          if (button.disabled) return;
          if (move.id === selectedMove) { if (tabletPanel === 'moves') closeTabletPanel(); return; }
          cancelVoice(); selectedMove = move.id;
          if (phase === 'question') {
            if (challengeSet) challengeSet.switched = true;
            selectQuestion();
          }
          else { renderMoves(); save(); if (scene) scene.play({ actor: 'player', move: move.id, hit: false, combo: 0 }); }
          if (tabletPanel === 'moves') closeTabletPanel();
          updatePlayView();
        });
        grid.append(button);
      });
      section.append(heading, grid); $('move-list').append(section);
    });
  }
  function renderLobby() {
    closeTabletPanel({ resume: false, focus: false });
    resetFlurry(true);
    stopHandsFree();
    document.querySelector('.practice-card').setAttribute('aria-labelledby', 'practice-heading');
    phase = 'lobby';
    $('welcome-panel').hidden = false; $('challenge-panel').hidden = true;
    $('activity-label').textContent = `${String(selectedBelt + 1).padStart(2, '0')} / ${activityLabel(G.BELTS[selectedBelt])}`;
    $('practice-heading').textContent = progress.mastered && selectedBelt === FINAL_BELT ? 'A champion always keeps learning.' : selectedBelt === 0 && !fight ? 'A little courage goes a long way.' : G.BELTS[selectedBelt].description + '.';
    $('start-button').textContent = fight ? 'Resume your match →' : selectedBelt < progress.belt ? 'Replay this rival →' : 'Step onto the mat →';
    $('welcome-note').textContent = fight ? `${formatHealth(fight.playerHp)} energy · ${fight.streak} clean answers in a row. Your match is saved.` : `${G.OPPONENTS[selectedBelt].name} is ready. ${G.BELTS[selectedBelt].description}.`;
    updateHud(); updateFighters(); renderProgress(); renderMoves(); save();
  }
  function beginFight() {
    if (!fight || fight.beltIndex !== selectedBelt || fight.recorded) {
      resetFlurry(true);
      fight = G.startFight(progress, selectedBelt); question = null; challengeSet = null; writingDraft = null; recent = []; answerResolved = false; phase = 'question';
    }
    if (fight.status !== 'fighting') { finishFight(); return; }
    const resumeAnswered = question && answerResolved;
    if (!question) {
      if (!answerResolved && challengeSet && sameExchange(challengeSet.exchange)) selectQuestion();
      else nextQuestion();
    }
    else if (!resumeAnswered && challengeSet && !challengeSet.locked && selectedMove !== question.techniqueId) {
      challengeSet.switched = true;
      selectQuestion();
    } else { phase = resumeAnswered ? 'answered' : 'question'; renderQuestion(); }
    saved = null;
    updateHud(); renderProgress(); renderMoves(); save();
    if (scene) scene.play({ actor: 'player', move: 'bow', hit: false });
    queueHandsFree();
  }
  function exchangeIdentity() {
    return { beltIndex: fight.beltIndex, originBelt: fight.originBelt, turns: fight.journal.length, defense: fight.pendingDamage > 0 };
  }
  function sameExchange(identity) {
    const current = exchangeIdentity();
    return identity && Object.keys(current).every(key => identity[key] === current[key]);
  }
  function questionKey(entry) { return entry.challengeKind === 'special' ? entry.techniqueId : 'basic'; }
  function newChallengeSet() {
    challengeSet = { version: 1, exchange: exchangeIdentity(), entries: {}, locked: false, switched: false };
  }
  function selectQuestion(preserveStream = false) {
    cancelVoice(preserveStream);
    const move = G.availableMoves(progress.belt).find(item => item.id === selectedMove);
    if (!move) selectedMove = 'front-kick';
    const techniqueId = fight && fight.pendingDamage > 0 ? 'front-kick' : selectedMove;
    const technique = G.MOVES.find(item => item.id === techniqueId);
    if (!challengeSet || !sameExchange(challengeSet.exchange)) newChallengeSet();
    const key = technique.kind === 'special' ? techniqueId : 'basic';
    let entry = challengeSet.entries[key];
    if (!entry) {
      entry = G.createQuestion(selectedBelt, material, recent, Math.random, techniqueId, progress.belt);
      // An unavailable special can fall back to a standard activity. It shares
      // the existing basic prompt and never turns that prompt into bonus damage.
      const canonicalKey = questionKey(entry);
      if (challengeSet.entries[canonicalKey]) entry = challengeSet.entries[canonicalKey];
      else {
        challengeSet.entries[canonicalKey] = entry;
        recent.push(entry.id); recent = recent.slice(-12);
      }
      challengeSet.entries[key] = entry;
    }
    question = { ...entry, ...(entry.challengeKind === 'basic' && technique.kind === 'basic' ? { techniqueId } : {}) };
    writingIndex = 0; writingDraft = null; phase = 'question';
    renderQuestion(); renderMoves(); save();
    queueHandsFree();
  }
  function nextQuestion() {
    // A new challenge set begins only after the previous exchange has resolved,
    // including the transition into or out of a defensive block chance.
    newChallengeSet();
    assisted = false; answerResolved = false; answerWasBlock = false;
    selectQuestion(true);
  }
  function writingMode() { return question && (question.mode === 'kana-write' || question.mode === 'kanji-write'); }
  function cancelVoice(preserveStream = false) {
    clearTimeout(autoListenTimer); clearTimeout(autoAdvanceTimer);
    readingStartedAt = 0; readingSpeedEligible = false;
    listening = false;
    if (voice) {
      if (preserveStream && handsFree && voice.safariMode && typeof voice.disarm === 'function') voice.disarm();
      else voice.cancel();
    }
    $('stop-listening').hidden = true;
  }
  function readingReady() {
    return phase === 'question' && fight && fight.status === 'fighting' && !writingMode() && !document.hidden && !tabletPanel &&
      !$('pause-dialog').open && !$('help-dialog').open && !$('result-dialog').open && !$('reward-dialog').open && !$('mic-details-dialog').open && !$('reset-game-dialog').open;
  }
  function updateHandsFree(note) {
    $('handsfree-toggle').setAttribute('aria-pressed', String(handsFree));
    $('handsfree-toggle').textContent = handsFree ? '■ Stop hands-free' : '● Start hands-free';
    $('handsfree-toggle').disabled = !handsFree && (!voice || !voice.supported || !fight || fight.status !== 'fighting');
    $('handsfree-status').textContent = note || (handsFree ? voiceStatus === 'starting' ? voice && voice.safariMode ? 'Opening Safari’s Japanese microphone · wait for Listening before speaking.' : 'Opening Japanese microphone · wait for Listening before speaking.' : voiceStatus === 'processing' ? 'Checking your Japanese · wait for the next prompt.' : listening ? 'Japanese mic ready · say the current answer. Stop to change technique.' : voice && voice.safariMode && voice.captureActive ? 'Japanese microphone stays open between answers · wait for the next prompt.' : 'Hands-free ready · the next reading starts automatically.' : 'Start once, then speak each new prompt. Fast clean answers earn +3 or +6 damage.');
    document.querySelector('.arena').classList.toggle('handsfree-active', handsFree);
  }
  function stopHandsFree(note) {
    resetFlurry();
    handsFree = false; quietRetries = 0; transientRetries = 0;
    cancelVoice();
    if (phase === 'question') { lockInputs(false); renderMoves(); }
    updateHandsFree(note);
  }
  function startReading(automatic = false) {
    if (!readingReady() || !voice || !voice.supported) return;
    recoveryHandsFree = handsFree;
    $('voice-recovery').hidden = true;
    $('voice-transcript').hidden = true;
    readingStartedAt = 0;
    readingSpeedEligible = automatic && quietRetries === 0 && transientRetries === 0 && !(challengeSet && challengeSet.switched);
    const voiceAliases = question.mode === 'word-read' ? material.kanji.filter(form => form.read === question.prompt).map(form => form.char) : [];
    if (voice.safariMode && audioContext && audioContext.state === 'running') {
      try { const suspended = audioContext.suspend(); if (suspended && suspended.catch) suspended.catch(() => {}); } catch (_) { /* Sound is optional. */ }
    }
    if (voice.start({ ...question, expectedKana: question.prompt, voiceAliases }, { keepAlive: handsFree })) updateHandsFree();
  }
  function queueHandsFree(delay = 40) {
    clearTimeout(autoListenTimer);
    if (!handsFree || !readingReady()) return;
    const target = question, bout = fight;
    autoListenTimer = setTimeout(() => {
      if (handsFree && readingReady() && question === target && fight === bout && !listening) startReading(true);
    }, delay);
  }
  function advanceHandsFree(delay = 650) {
    clearTimeout(autoAdvanceTimer);
    if (!handsFree || phase !== 'answered' || !fight || fight.status !== 'fighting' || document.hidden || tabletPanel || $('pause-dialog').open || $('help-dialog').open || $('reward-dialog').open || $('result-dialog').open || $('mic-details-dialog').open || $('reset-game-dialog').open) return;
    const target = question, bout = fight;
    updateHandsFree('Hands-free flow · the next prompt is coming. Say it when the mic is ready.');
    autoAdvanceTimer = setTimeout(() => {
      if (handsFree && phase === 'answered' && question === target && fight === bout && !document.hidden && !tabletPanel && !$('pause-dialog').open && !$('help-dialog').open && !$('reward-dialog').open && !$('result-dialog').open && !$('mic-details-dialog').open && !$('reset-game-dialog').open) nextQuestion();
    }, delay);
  }
  function showSpeedBonus(outcome, milliseconds) {
    const node = $('speed-notice'); clearTimeout(speedNoticeTimer);
    node.classList.toggle('combo-speed', Boolean(outcome.combo));
    node.hidden = !outcome.speedBonus || !$('flurry-notice').hidden;
    if (node.hidden) return;
    node.dataset.tier = outcome.speedTier;
    node.textContent = `${outcome.speedTier === 'lightning' ? '⚡ LIGHTNING' : '✦ QUICK STRIKE'} · +${outcome.speedBonus} DAMAGE · ${(milliseconds / 1000).toFixed(1)}s${outcome.combo ? ' · COMBO BOOST!' : ''}`;
    node.classList.remove('speed-pop'); void node.offsetWidth; node.classList.add('speed-pop');
    speedNoticeTimer = setTimeout(() => { node.hidden = true; }, 2200);
  }
  function resetFlurry(clearNotice = false) {
    flurryTimes = [];
    if (clearNotice) { clearTimeout(flurryNoticeTimer); $('flurry-notice').hidden = true; }
  }
  function showFlurry(elapsedMs) {
    const node = $('flurry-notice');
    clearTimeout(flurryNoticeTimer); clearTimeout(speedNoticeTimer);
    $('speed-notice').hidden = true;
    node.textContent = `KNOCKDOWN! · 5 ANSWERS IN ${(elapsedMs / 1000).toFixed(1)}s`;
    node.hidden = false;
    node.classList.remove('flurry-pop'); void node.offsetWidth; node.classList.add('flurry-pop');
    flurryNoticeTimer = setTimeout(() => { node.hidden = true; }, 3000);
  }
  function lockInputs(locked) {
    $('listen-button').disabled = locked || listening || !voice || !voice.supported;
    ['check-writing', 'hint-button', 'undo-writing', 'clear-writing'].forEach(id => { $(id).disabled = locked; });
    $('writing-canvas').style.pointerEvents = locked ? 'none' : 'auto';
    updateHandsFree();
  }
  function renderQuestion() {
    updatePlayView();
    if (phase === 'question' && tabletQuery.matches) document.querySelector('.practice-card').scrollTop = 0;
    document.querySelector('.practice-card').setAttribute('aria-labelledby', 'question-instruction');
    $('welcome-panel').hidden = true; $('challenge-panel').hidden = false;
    $('voice-area').hidden = writingMode();
    $('writing-area').hidden = !writingMode();
    $('feedback').hidden = phase !== 'answered'; $('hint-text').hidden = !assisted;
    $('hint-button').textContent = 'Need a hint?';
    const defense = phase === 'question' && fight.pendingDamage > 0;
    const technique = G.MOVES.find(move => move.id === question.techniqueId) || G.MOVES.find(move => move.id === 'front-kick');
    const special = question.challengeKind === 'special' && !defense;
    $('technique-label').textContent = defense ? 'Guard & block · standard drill' : `${technique.name} · ${special ? 'special technique' : 'basic technique'}`;
    $('challenge-difficulty').textContent = defense ? 'Complete one standard activity to stop the counter.' : `${question.challengeLabel || (special ? 'Harder activity' : 'Standard activity')} · ${14 + (special ? technique.bonus : 0)} starting damage`;
    $('technique-challenge').classList.toggle('special-challenge', special);
    $('block-banner').hidden = !defense;
    document.querySelector('.practice-card').classList.toggle('defending', defense);
    $('block-description').textContent = `Correct stops all ${fight.pendingDamage} incoming damage. This answer is a block, not an attack.`;
    $('activity-label').textContent = `${defense ? 'BLOCK CHANCE' : String(selectedBelt + 1).padStart(2, '0')} / ${activityLabel(question)}`;
    $('listen-button').textContent = defense ? '● Speak to block' : '● Speak to strike';
    $('check-writing').textContent = defense ? 'Check & block' : 'Check & strike';
    $('voice-transcript').hidden = true;
    $('voice-recovery').hidden = true;
    $('voice-status').textContent = voice && voice.supported ? voice.safariMode ? 'Safari · tap the microphone and wait for Listening · Japanese (日本語).' : 'Tap the microphone, then read aloud in Japanese.' : 'Speech recognition is unavailable here. Open the game in a browser with Japanese speech recognition and microphone access.';
    const glyph = $('question-glyph'); glyph.className = 'question-glyph'; glyph.textContent = question.prompt;
    $('word-progress').hidden = !writingMode() || question.chars.length <= 1;
    if (question.mode === 'kana-read') {
      $('question-instruction').textContent = special ? `Read the full ${scriptName(question)} challenge aloud` : `Say this ${scriptName(question)} aloud`;
      $('question-context').textContent = special ? 'Say every sound in order to power this special technique.' : 'Speak its sound in Japanese. Your voice powers the move.';
      if (question.prompt.length > 1) glyph.classList.add('word');
    } else if (question.mode === 'word-read') {
      $('question-instruction').textContent = 'Read this word aloud'; glyph.classList.add('word'); $('question-context').textContent = 'Say the Japanese word, rather than its English meaning.';
    } else {
      glyph.classList.add('write-prompt');
      $('question-instruction').textContent = question.mode === 'kana-write' ? `Write the ${scriptName(question)} for this sound` : 'Write this word using kanji';
      $('question-context').textContent = question.mode === 'kana-write' ? special ? `Write all ${question.chars.length} ${scriptName(question)} from memory to unleash ${technique.name}.` : `Draw the ${scriptName(question)} from memory, one stroke at a time.` : `Recall ${question.words ? 'both words' : 'the word'} and write ${question.words ? 'their' : 'its'} kanji · ${question.chars.length} character${question.chars.length === 1 ? '' : 's'}`;
      $('writing-caption').textContent = `Character ${writingIndex + 1} of ${question.chars.length} · from memory`;
      if (writing) {
        restoringWriting = true;
        writing.setCharacter(question.chars[writingIndex]);
        if (assisted) writing.revealGuide();
        if (writingDraft && writingDraft.questionId === question.id && writingDraft.writingIndex === writingIndex) {
          writing.strokes = writingDraft.strokes.map((points, index) => {
            const stroke = points.map(point => ({ x: point.x, y: point.y }));
            if (writingDraft.overflow[index]) stroke.overflow = true;
            return stroke;
          });
          writing.render(); writing.changed();
        }
        restoringWriting = false;
      }
      renderWordProgress();
    }
    if (assisted) showHint(false);
    lockInputs(phase !== 'question');
    if (phase === 'answered') renderFeedbackFromFight();
    $('arena-caption').textContent = phase === 'answered' ? 'Breathe. Learn from the feedback. Then go again.' : defense ? `COUNTER READY · ${fight.pendingDamage} damage · complete this challenge to block!` : `${G.OPPONENTS[selectedBelt].name} is guarding. Your answer powers the next move.`;
    fitTabletWriting(phase === 'answered');
  }
  function renderWordProgress() {
    $('word-progress').replaceChildren();
    if (!question.chars) return;
    question.chars.forEach((char, index) => {
      const cell = document.createElement('span'); cell.className = index < writingIndex ? 'done' : index === writingIndex ? 'active' : '';
      cell.textContent = index < writingIndex ? char : String(index + 1); $('word-progress').append(cell);
    });
  }
  function showHint(mark = true) {
    if (!question || phase !== 'question') return;
    if (mark) { resetFlurry(); assisted = true; if (challengeSet) challengeSet.locked = true; }
    const note = question.mode === 'kana-read' ? `The sound is “${question.answer}”. Say it aloud to practise.` : question.mode === 'word-read' ? `Read “${question.prompt}” as “${question.reading}” (${question.answer}). Say it aloud.` : `Model: ${question.answer}${question.mode === 'kanji-write' ? ' · reading: ' + question.reading : ''}. Follow the numbered strokes; you can clear and try again.`;
    $('hint-text').textContent = note + (fight.pendingDamage > 0 ? ' A correct guided block still stops all damage.' : ' Guided attacks give half damage and no streak credit.');
    $('hint-text').hidden = false; $('hint-button').textContent = 'Hint shown · assisted';
    if (writingMode() && writing) writing.revealGuide();
    fitTabletWriting();
    if (mark) { renderMoves(); save(); }
  }
  function submit(correct, detail = '', readingMs = null) {
    if (phase !== 'question' || !fight || fight.status !== 'fighting') return;
    cancelVoice(handsFree);
    answerWasBlock = fight.pendingDamage > 0;
    const outcome = G.resolveAnswer(fight, { correct, assisted, move: question.techniqueId || 'front-kick', challengeKind: question.challengeKind || 'basic', readingMs });
    if (!outcome.resolved) return;
    const flurry = G.advanceFlurry(flurryTimes, performance.now(), correct && !assisted && !outcome.defensive && outcome.opponentDamage > 0);
    flurryTimes = flurry.times;
    const knockdown = flurry.knockdown;
    phase = 'answered'; answerResolved = true;
    lockInputs(true); updateHud(); renderMoves();
    const moveName = outcome.move.name;
    const title = outcome.immediateCounter ? 'Master Steif hits! 33.3% damage.' : outcome.blocked ? 'Perfect block! No damage taken.' : outcome.blockFailed ? 'The counter landed. Keep your guard up.' : outcome.counterQueued ? 'Counter incoming! You get a block chance.' : assisted ? 'Good practice. Keep building.' : outcome.combo ? `${fight.streak} in a row! Combo!` : outcome.speedBonus ? `${outcome.speedTier === 'lightning' ? 'Lightning' : 'Quick'} ${moveName.toLowerCase()}!` : `${moveName} landed!`;
    const answerText = question.mode === 'kana-read' ? `${question.prompt} = ${question.answer}` : question.mode === 'word-read' ? `${question.prompt} (${question.reading}) = ${question.answer}` : `${question.answer}${question.mode === 'kanji-write' ? ' · ' + question.reading : ' = ' + question.reading}`;
    const prefix = `${detail ? detail + ' ' : ''}${answerText}. `;
    const copy = prefix + (outcome.immediateCounter ? `Master Steif's strike takes one-third of your full energy immediately. No block chance. ${outcome.lost ? 'The match is over; your earned belts stay safe.' : 'Your next answer is an attack. Take your time.'}` : outcome.blocked ? `You stopped all ${outcome.blockedDamage} damage. Your next answer is an attack; build a fresh combo.` : outcome.blockFailed ? `${outcome.playerDamage} queued damage lands. That counter is complete; your next answer is an attack.` : outcome.counterQueued ? `No damage yet. Complete the next activity correctly to block ${outcome.pendingDamage} damage.` : `${outcome.opponentDamage} damage${assisted ? ' · guided practice, no streak credit' : outcome.combo ? ' · combo bonus included' : ' · ' + fight.streak + ' clean in a row'}.`);
    renderFeedback(knockdown ? 'Five in five! Knockdown!' : title, copy + (outcome.speedBonus ? ` Includes +${outcome.speedBonus} ${outcome.speedTier} speed damage!` : '') + (knockdown ? ' Five clean answers within five seconds knocked your rival to the mat!' : ''), !correct);
    showSpeedBonus(outcome, readingMs);
    if (knockdown) showFlurry(flurry.elapsedMs);
    $('arena-caption').textContent = outcome.immediateCounter ? 'MASTER STEIF STRIKES · 33.3% damage · no block chance' : outcome.blocked ? `BLOCKED · ${outcome.blockedDamage} damage stopped` : outcome.counterQueued ? `COUNTER INCOMING · ${outcome.pendingDamage} damage queued · next challenge is your block` : outcome.blockFailed ? `${G.OPPONENTS[selectedBelt].name} counters · ${outcome.playerDamage} damage` : `${moveName}${outcome.combo ? ' combination' : ''} · ${outcome.opponentDamage} damage`;
    if (knockdown) $('arena-caption').textContent = `KNOCKDOWN · five clean answers within five seconds · ${outcome.opponentDamage} damage`;
    callout(knockdown ? 'FIVE IN FIVE · KNOCKDOWN!' : outcome.immediateCounter ? '33.3% · MASTER STRIKE' : outcome.blocked ? 'BLOCKED!' : outcome.counterQueued ? 'BLOCK CHANCE NEXT' : outcome.blockFailed ? 'COUNTER' : outcome.combo ? `${fight.streak} HIT COMBO!${outcome.speedBonus ? ' ⚡' : ''}` : outcome.speedBonus ? outcome.speedTier === 'lightning' ? '⚡ LIGHTNING STRIKE!' : 'QUICK STRIKE!' : moveName);
    if (scene) scene.play({ actor: outcome.immediateCounter || outcome.counterQueued || outcome.blockFailed ? 'opponent' : 'player', move: outcome.immediateCounter ? 'dragon-finisher' : outcome.blocked ? 'block' : outcome.counterQueued ? 'guard' : outcome.blockFailed ? ['front-kick', 'roundhouse', 'side-kick', 'jump-front-kick', 'axe-kick', 'turning-kick', 'double-kick', 'back-kick', 'jump-roundhouse', 'tornado-kick', 'dragon-finisher'][selectedBelt] : outcome.move.id, hit: !(outcome.counterQueued || outcome.blocked), combo: outcome.combo ? fight.streak : 0, speedTier: outcome.speedTier, damage: outcome.opponentDamage, victory: outcome.won, knockdown });
    sound(knockdown ? 'knockdown' : correct ? outcome.combo ? 'combo' : 'hit' : 'wrong');
    save();
    if (!handsFree) $('next-button').focus({ preventScroll: true });
    quietRetries = 0; transientRetries = 0;
    if (handsFree && fight.status === 'fighting') advanceHandsFree(correct ? outcome.speedBonus ? 220 : 300 : 1600);
    else if (handsFree) stopHandsFree('Match complete · microphone off. Your progress is saved.');
  }
  function callout(text) {
    clearTimeout(calloutTimer);
    const node = $('action-callout'); node.textContent = text; node.classList.toggle('combo-callout', /COMBO|KNOCKDOWN/.test(text)); node.classList.remove('pop'); void node.offsetWidth; node.classList.add('pop');
    if (reducedMotion) node.style.opacity = '1';
    calloutTimer = setTimeout(() => { node.classList.remove('pop'); node.style.opacity = ''; }, 1300);
  }
  function renderFeedback(title, copy, wrong) {
    $('feedback-title').textContent = title; $('feedback-detail').textContent = copy;
    $('feedback').classList.toggle('wrong', wrong); $('feedback').hidden = false;
    fitTabletWriting(true);
    $('next-button').textContent = fight.status === 'fighting' ? fight.pendingDamage > 0 ? 'Take your block chance →' : 'Next attack →' : 'See match result →';
  }
  function renderFeedbackFromFight() {
    const last = fight.journal[fight.journal.length - 1];
    const text = question.mode === 'word-read' ? `${question.prompt} = ${question.answer}` : `${question.prompt} → ${question.answer}`;
    if (G.OPPONENTS[selectedBelt].unblockableMistakes && last && last.rulesVersion >= 4 && !last.correct && !answerWasBlock) {
      renderFeedback('Master Steif’s hit is saved.', `${text}. The immediate 33.3% strike is already counted. ${formatHealth(fight.playerHp)} energy remains. No block chance.`, true);
      return;
    }
    renderFeedback(fight.pendingDamage > 0 ? 'Counter incoming! Block on the next challenge.' : answerWasBlock && last && last.correct ? 'Your block is saved.' : 'Your answer is saved.', `${text}. ${fight.pendingDamage > 0 ? 'No damage yet. Stop ' + fight.pendingDamage + ' damage by completing the next activity.' : 'This exchange is complete; continue for your next attack.'}`, last && !last.correct);
  }
  function finishFight() {
    stopHandsFree();
    resultSummary = G.completeFight(progress, fight);
    if (!resultSummary.recorded) { renderLobby(); return; }
    const won = resultSummary.won;
    const milestone = G.REWARDS.find(reward => reward.id === resultSummary.rewardId);
    $('result-eyebrow').textContent = milestone ? milestone.title.toUpperCase() + ' · ICE CREAM EARNED' : resultSummary.mastered && selectedBelt === FINAL_BELT && won ? 'KANJI CHAMPION' : won ? 'MATCH WON' : 'ANOTHER CHANCE TO GROW';
    $('result-symbol').textContent = won ? resultSummary.rewardUnlocked ? '🍦' : '✦' : '↺';
    $('result-heading').textContent = won && resultSummary.promoted ? `Your ${G.BELTS[progress.belt].name.toLowerCase()} belt is yours.` : won ? selectedBelt === FINAL_BELT ? 'A champion in every character.' : 'Practice makes progress.' : 'Every fighter gets back up.';
    $('result-copy').textContent = milestone ? `You defeated ${G.OPPONENTS[selectedBelt].name} and completed ${milestone.title.toLowerCase()}. Your ${G.REWARDS.indexOf(milestone) + 1} of ${G.REWARDS.length} ice cream rewards is earned! Choose its flavour and save it on this device.` : won && resultSummary.promoted ? `You defeated ${G.OPPONENTS[selectedBelt].name}. Up next: ${G.BELTS[progress.belt].description.toLowerCase()}.` : won ? 'Your focus and practice paid off. Replay any earned belt whenever you like.' : `${G.OPPONENTS[selectedBelt].name} won this time. Your earned belts stay safe. Try again with a full energy bar.`;
    if (resultSummary.promoted) {
      const newMove = G.MOVES.find(move => move.kind === 'special' && move.unlock === progress.belt);
      if (newMove) $('result-copy').textContent += ` New technique: ${newMove.name}. Choose its harder activity for +${newMove.bonus} damage.`;
    }
    $('result-stats').replaceChildren();
    [['Correct', fight.correct], ['Mistakes', fight.mistakes], ['Best streak', fight.bestStreak]].forEach(([label, value]) => {
      const item = document.createElement('span'); item.append(Object.assign(document.createElement('strong'), { textContent: value }), document.createTextNode(label)); $('result-stats').append(item);
    });
    $('result-continue').textContent = resultSummary.rewardUnlocked ? 'To the ice cream parlour →' : won ? selectedBelt === FINAL_BELT ? 'Back to the dojo →' : 'Meet your next rival →' : 'Rematch · full energy →';
    $('result-reset-game').hidden = won;
    if (won && scene) scene.celebrate();
    sound(won ? 'win' : 'wrong'); phase = 'result'; updatePlayView(); renderProgress(); save(); open($('result-dialog'));
  }
  function checkWriting() {
    if (phase !== 'question' || !writing || !writingMode()) return;
    const result = writing.check();
    if (!writing.getStrokeCount()) { $('hint-text').hidden = false; $('hint-text').textContent = 'Draw a character before checking. Take your time.'; return; }
    assisted = assisted || result.assisted;
    if (result.correct && writingIndex < question.chars.length - 1) {
      writingIndex++; writing.setCharacter(question.chars[writingIndex]);
      $('writing-caption').textContent = `Character ${writingIndex + 1} of ${question.chars.length} · from memory`;
      renderWordProgress(); save();
    } else submit(result.correct, result.correct ? result.score + '% stroke match.' : result.message);
  }
  function openReward(id) {
    const selected = typeof id === 'string' ? G.REWARDS.find(reward => reward.id === id) : G.REWARDS.find(reward => progress.rewards[reward.id].unlocked && !progress.rewards[reward.id].claimed) || G.REWARDS.find(reward => progress.rewards[reward.id].unlocked);
    if (!selected || !progress.rewards[selected.id].unlocked) return;
    closeTabletPanel({ resume: false, focus: false });
    resetFlurry();
    cancelVoice();
    rewardId = selected.id;
    flavor = progress.rewards[rewardId].flavor || 'strawberry';
    $('reward-eyebrow').textContent = `REWARD ${G.REWARDS.indexOf(selected) + 1} OF ${G.REWARDS.length} · SAVED ON THIS DEVICE`;
    $('reward-heading').textContent = selected.title + ' ice cream';
    $('reward-milestone').textContent = `You defeated ${G.OPPONENTS[selected.beltIndex].name} and completed this section. Choose this reward’s celebration flavour.`;
    $('ice-cream-art').dataset.reward = rewardId;
    renderFlavors(); open($('reward-dialog'));
  }
  function renderFlavors() {
    $('flavour-options').querySelectorAll('button').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.flavour.toLowerCase() === flavor)); });
    const colors = { strawberry: '#eaa2ae', matcha: '#9ab67b', vanilla: '#f7e6b6', chocolate: '#b58561' };
    $('ice-cream-art').style.setProperty('--scoop', colors[flavor]);
    const entry = progress.rewards[rewardId];
    $('reward-message').textContent = entry.claimed ? `Your ${entry.flavor} ${G.REWARDS.find(reward => reward.id === rewardId).title.toLowerCase()} ice cream is saved!` : 'An in-game treat for a real learning achievement.';
    $('claim-reward').textContent = entry.claimed ? 'Save this reward’s flavour →' : 'Save this ice cream reward →';
  }

  try { scene = new DojoScene($('dojo-canvas'), { reducedMotion }); }
  catch (_) { $('graphics-status').textContent = '3D graphics are unavailable in this browser. You can still practise and fight with the lesson controls below.'; $('graphics-status').hidden = false; }
  if (scene && scene.available === false) { $('graphics-status').textContent = '3D graphics are unavailable. Lesson battles are still ready below.'; $('graphics-status').hidden = false; }
  try {
    writing = new DojoWriting($('writing-canvas'), { onChange: state => {
      $('stroke-count').textContent = `${state.strokeCount} / ${state.expectedStrokes} strokes`;
      if (!restoringWriting && phase === 'question' && writing && writingMode()) {
        if (state.strokeCount > 0 && challengeSet) challengeSet.locked = true;
        writingDraft = { questionId: question.id, writingIndex,
          strokes: writing.strokes.map(stroke => stroke.map(point => ({ x: point.x, y: point.y }))),
          overflow: writing.strokes.map(stroke => stroke.overflow === true) };
        renderMoves(); save();
      }
    } });
  } catch (_) { /* Surface unavailable writing when its belt is entered. */ }
  $('writing-canvas').addEventListener('pointerdown', event => {
    if (phase !== 'question' || !writingMode() || !writing || !writing.reference || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    // Lock on first ink, even if the stroke is subsequently undone or cleared.
    if (challengeSet) challengeSet.locked = true;
    renderMoves(); save();
  }, true);
  try {
    voice = new DojoVoice({
      onState: state => {
        voiceStatus = state.status === 'listening' && state.captureReady === false ? 'starting' : state.status;
        listening = ['starting', 'listening', 'processing'].includes(voiceStatus);
        if (voiceStatus === 'listening' && !readingStartedAt) readingStartedAt = performance.now();
        $('listen-button').classList.toggle('listening', voiceStatus === 'listening');
        $('stop-listening').hidden = !listening;
        $('stop-listening').textContent = voiceStatus === 'starting' ? 'Cancel microphone' : voiceStatus === 'processing' ? 'Finish & check' : 'Finish speaking';
        if (phase === 'question') {
          $('voice-status').textContent = voiceStatus === 'starting' ? voice && voice.safariMode ? 'Opening Safari’s microphone… wait for Listening.' : 'Starting Japanese microphone… wait for Listening.' : voiceStatus === 'listening' ? state.speechDetected ? 'Voice detected · Japanese (日本語). Keep going.' : 'Listening · Japanese (日本語). Say it now.' : voiceStatus === 'processing' ? 'Checking your speech… use Finish & check if it waits.' : handsFree && voice && voice.captureActive ? 'Microphone is open · wait for the next prompt.' : 'Tap the microphone to try again.';
          if (state.transcript) { $('voice-transcript').textContent = 'Hearing: ' + state.transcript; $('voice-transcript').hidden = false; }
          lockInputs(false);
          renderMoves();
        }
        updateHandsFree();
      },
      onResult: result => {
        if (!readingReady()) return;
        const recognizedKana = typeof result.recognizedKana === 'string' ? result.recognizedKana : '';
        const recognizedRomaji = typeof result.recognizedRomaji === 'string' ? result.recognizedRomaji : '';
        const recognizedSound = recognizedKana + (recognizedRomaji ? ` (${recognizedRomaji})` : '');
        const converted = recognizedKana && DojoVoice.normalizeTranscript(result.transcript) !== DojoVoice.normalizeTranscript(recognizedKana);
        $('voice-transcript').textContent = converted ? `Heard: ${recognizedSound} · recognizer wrote ${result.transcript}` : 'Heard: ' + result.transcript;
        $('voice-transcript').hidden = false;
        const readingMs = handsFree && readingSpeedEligible && readingStartedAt && Number.isFinite(result.readingMs) && result.readingMs > 0 ? result.readingMs : null;
        submit(result.correct, converted ? `Recognized ${recognizedSound}; browser wrote “${result.transcript}”.` : `Heard “${result.transcript}”.`, readingMs);
      },
      onError: error => {
        // Unclear speech is not an answer. Its retry uses the same real-time
        // window without adding a hit or erasing accepted correct answers.
        if (!['no-speech', 'no-match'].includes(error.code)) resetFlurry();
        listening = false; $('stop-listening').hidden = true;
        if (error.transcript) { $('voice-transcript').textContent = 'Heard: ' + error.transcript + ' · unclear; try again'; $('voice-transcript').hidden = false; }
        readingSpeedEligible = false;
        if (handsFree) recoveryHandsFree = true;
        let recoveryNote = '';
        if (handsFree && error.retryable === true && !error.requiresGesture && transientRetries < 1 && readingReady()) {
          transientRetries++;
          recoveryNote = 'Microphone interrupted · reconnecting once. Your question and energy are unchanged.';
          queueHandsFree(850);
        } else if (handsFree && ['no-speech', 'no-match'].includes(error.code) && !error.requiresGesture && quietRetries < 2 && readingReady()) {
          quietRetries++;
          recoveryNote = `No clear speech · listening again (${quietRetries}/2). Your energy is unchanged.`;
          queueHandsFree(850);
        } else if (handsFree) {
          recoveryNote = error.requiresGesture ? 'Microphone needs a tap · press Start hands-free to reconnect. No energy lost.' : error.code === 'no-speech' || error.code === 'no-match' ? 'Mic paused after silence · Start hands-free when you are ready. No energy lost.' : 'Hands-free stopped · check the speech service or microphone, then start again. No energy lost.';
          stopHandsFree();
        }
        if (phase === 'question') { lockInputs(false); renderMoves(); }
        if (recoveryNote) updateHandsFree(recoveryNote);
        $('voice-status').textContent = error.message + ' Your turn and energy are unchanged.';
        if (phase === 'question' && !writingMode()) {
          $('voice-recovery').hidden = false;
          if (tabletQuery.matches) requestAnimationFrame(() => {
            if (phase === 'question' && !$('voice-recovery').hidden && !tabletPanel) $('voice-recovery').scrollIntoView({ block: 'nearest', inline: 'nearest' });
          });
        }
      }
    });
  } catch (_) { voice = null; }
  $('show-moves-button').addEventListener('click', () => openTabletPanel('moves'));
  $('show-journey-button').addEventListener('click', () => openTabletPanel('journey'));
  document.querySelectorAll('[data-close-panel]').forEach(button => button.addEventListener('click', () => closeTabletPanel()));
  $('tablet-panel-backdrop').addEventListener('click', () => closeTabletPanel());
  document.addEventListener('keydown', event => {
    if (!tabletPanel) return;
    if (event.key === 'Escape') { event.preventDefault(); closeTabletPanel(); return; }
    if (event.key !== 'Tab') return;
    const panel = $(tabletPanel === 'moves' ? 'moves-panel' : 'journey-panel');
    const items = [...panel.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')]
      .filter(node => node.getClientRects().length && !node.closest('[inert]'));
    const first = items[0], last = items[items.length - 1];
    if (!first) { event.preventDefault(); panel.focus(); }
    else if (!panel.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault(); (event.shiftKey ? last : first).focus();
    }
  });
  $('screen-mode-button').addEventListener('click', async () => {
    if (screenModeBusy) return;
    resetFlurry(); cancelVoice();
    screenModeBusy = true; updateScreenMode(); $('screen-mode-note').hidden = true;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) await exit.call(document);
      } else {
        const enter = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
        if (enter) await enter.call(document.documentElement);
      }
    } catch (_) {
      $('screen-mode-note').textContent = 'Keep playing here, or use Safari’s Share menu → Add to Home Screen for a standalone view.';
      $('screen-mode-note').hidden = false;
    } finally {
      screenModeBusy = false; updateScreenMode();
      if (phase === 'answered') advanceHandsFree(); else queueHandsFree();
    }
  });
  document.addEventListener('fullscreenchange', updateScreenMode);
  document.addEventListener('webkitfullscreenchange', updateScreenMode);
  if (tabletQuery.addEventListener) tabletQuery.addEventListener('change', updatePlayView);
  else if (tabletQuery.addListener) tabletQuery.addListener(updatePlayView);
  window.addEventListener('resize', () => fitTabletWriting());
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => fitTabletWriting());
  if (window.ResizeObserver) new ResizeObserver(() => fitTabletWriting()).observe(document.querySelector('.practice-card'));
  $('listen-button').addEventListener('click', () => {
    if (handsFree) stopHandsFree();
    startReading();
  });
  $('handsfree-toggle').addEventListener('click', () => {
    if (handsFree) { stopHandsFree('Hands-free off · microphone stopped. Choose a technique or speak one answer at a time.'); return; }
    if (!voice || !voice.supported || !fight || fight.status !== 'fighting' || writingMode()) return;
    handsFree = true; quietRetries = 0; transientRetries = 0;
    updateHandsFree();
    // Keep the explicit microphone start inside this tap, including a restart
    // from feedback. Timed activation can be rejected by Safari's service.
    if (phase === 'answered') nextQuestion();
    clearTimeout(autoListenTimer); clearTimeout(autoAdvanceTimer);
    startReading(true);
  });
  $('stop-listening').addEventListener('click', () => {
    if (!voice) return;
    if (voiceStatus === 'starting') {
      if (handsFree) stopHandsFree('Microphone cancelled · tap Start hands-free when you are ready.');
      else voice.cancel();
    } else voice.stop();
  });
  $('reconnect-mic').addEventListener('click', () => {
    if (!voice || !readingReady()) return;
    const resumeHandsFree = recoveryHandsFree;
    stopHandsFree(); save();
    if (typeof voice.reset === 'function') voice.reset();
    handsFree = resumeHandsFree;
    // A recovery is never a new timed attempt at the same exchange.
    quietRetries = 0; transientRetries = 1;
    startReading(false);
  });
  $('reload-fight').addEventListener('click', () => { stopHandsFree(); save(); location.reload(); });
  $('mic-details-button').addEventListener('click', () => {
    const details = voice && typeof voice.getDiagnostics === 'function' ? voice.getDiagnostics() : { build: '2026-10-29 dojo-reset-1', supported: Boolean(voice && voice.supported) };
    resetFlurry(); cancelVoice();
    $('mic-build').textContent = 'Microphone build · ' + (details.build || '2026-10-29 dojo-reset-1');
    $('mic-diagnostics').value = JSON.stringify(details, null, 2);
    $('mic-copy-status').textContent = 'These details stay on this device unless you choose to copy and share them.';
    open($('mic-details-dialog'));
  });
  $('copy-mic-details').addEventListener('click', async () => {
    const report = $('mic-diagnostics');
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw Error('Clipboard unavailable');
      await navigator.clipboard.writeText(report.value);
      $('mic-copy-status').textContent = 'Microphone details copied.';
    } catch (_) {
      report.focus(); report.select();
      $('mic-copy-status').textContent = 'Details selected. Use Copy from the selection menu.';
    }
  });
  document.querySelectorAll('[data-reset-game]').forEach(button => button.addEventListener('click', () => askResetGame(button)));
  $('cancel-reset-game').addEventListener('click', () => $('reset-game-dialog').close());
  $('confirm-reset-game').addEventListener('click', resetGame);
  $('reset-game-dialog').addEventListener('close', () => {
    if (!resetConfirmed) {
      handsFree = Boolean(resetResumeHandsFree && !document.hidden && voice && voice.supported && fight && fight.status === 'fighting');
      updateHandsFree();
      if (handsFree) { if (phase === 'answered') advanceHandsFree(); else queueHandsFree(); }
      if (resetReturnFocus && resetReturnFocus.isConnected && resetReturnFocus.getClientRects().length) resetReturnFocus.focus({ preventScroll: true });
    }
    resetResumeHandsFree = false; resetReturnFocus = null;
  });
  $('start-button').addEventListener('click', beginFight);
  $('next-button').addEventListener('click', () => { if (phase !== 'answered') return; if (fight.status === 'fighting') nextQuestion(); else finishFight(); });
  $('check-writing').addEventListener('click', checkWriting);
  $('clear-writing').addEventListener('click', () => { if (phase === 'question' && writing) writing.clear(); });
  $('undo-writing').addEventListener('click', () => { if (phase === 'question' && writing) writing.undo(); });
  $('hint-button').addEventListener('click', () => showHint());
  $('help-button').addEventListener('click', () => { resetFlurry(); cancelVoice(); open($('help-dialog')); });
  document.querySelectorAll('[data-close]').forEach(button => { button.addEventListener('click', () => button.closest('dialog').close()); });
  $('pause-button').addEventListener('click', () => { resetFlurry(); cancelVoice(); save(); open($('pause-dialog')); });
  $('resume-button').addEventListener('click', () => $('pause-dialog').close());
  [$('pause-dialog'), $('help-dialog'), $('reward-dialog'), $('mic-details-dialog')].forEach(dialog => dialog.addEventListener('close', () => {
    if (phase === 'answered') advanceHandsFree(); else queueHandsFree();
  }));
  $('leave-button').addEventListener('click', () => { $('pause-dialog').close(); saved = { phase }; renderLobby(); });
  $('result-continue').addEventListener('click', () => {
    const reward = resultSummary.rewardId, won = resultSummary.won;
    $('result-dialog').close(); fight = null; question = null; challengeSet = null; writingDraft = null;
    if (won) selectedBelt = progress.belt;
    renderLobby();
    if (reward) openReward(reward); else if (!(won && selectedBelt === FINAL_BELT && progress.mastered)) beginFight();
  });
  $('result-rest').addEventListener('click', () => { $('result-dialog').close(); fight = null; question = null; challengeSet = null; writingDraft = null; selectedBelt = progress.belt; renderLobby(); });
  $('result-dialog').addEventListener('cancel', event => { event.preventDefault(); $('result-rest').click(); });
  $('reward-button').addEventListener('click', () => openReward());
  $('flavour-options').querySelectorAll('button').forEach(button => { button.addEventListener('click', () => { flavor = button.dataset.flavour.toLowerCase(); renderFlavors(); }); });
  $('claim-reward').addEventListener('click', () => {
    if (!progress.rewards[rewardId].unlocked) return;
    progress.rewards[rewardId].claimed = true; progress.rewards[rewardId].flavor = flavor;
    // Mirror the earlier single black-belt cone for compatibility with old saves.
    if (rewardId === 'words') { progress.iceCreamClaimed = true; progress.flavor = flavor; }
    save(); renderProgress(); renderFlavors(); sound('win');
    $('reward-message').textContent = `Your ${flavor} ice cream is saved in the ${G.REWARDS.find(reward => reward.id === rewardId).title.toLowerCase()} collection. You earned it!`;
    $('claim-reward').textContent = 'This ice cream is saved ✓';
    if (scene) scene.celebrate();
  });
  $('sound-toggle').addEventListener('click', () => { soundEnabled = !soundEnabled; applyPreferences(); save(); if (soundEnabled) sound('hit'); });
  $('motion-toggle').addEventListener('click', () => { reducedMotion = !reducedMotion; applyPreferences(); save(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { resetResumeHandsFree = false; stopHandsFree('Microphone stopped while the dojo is hidden. Start hands-free to continue.'); } });
  window.addEventListener('pagehide', () => { resetResumeHandsFree = false; stopHandsFree(); save(); });
  function canonicalQuestion(candidate, allowLegacy = false) {
    if (!fight || !candidate || typeof candidate !== 'object' || Array.isArray(candidate) || typeof candidate.id !== 'string' || typeof candidate.answer !== 'string' || typeof candidate.prompt !== 'string') return null;
    const available = G.availableMoves(progress.belt);
    const technique = available.find(move => move.id === candidate.techniqueId) || (allowLegacy && !candidate.techniqueId ? available.find(move => move.id === 'front-kick') : null);
    if (!technique) return null;
    const candidates = [], seen = new Set();
    // Rebuild current challenge metadata from canonical material, including
    // special word sequences and verified compound kanji.
    for (let index = 0; index < 300; index++) {
      const entry = G.createQuestion(selectedBelt, material, [...seen], () => 0, technique.id, progress.belt);
      if (seen.has(entry.id)) break;
      seen.add(entry.id); candidates.push(entry);
      if (entry.id === candidate.id) break;
    }
    let canonical = candidates.find(item => item.id === candidate.id && item.answer === candidate.answer && item.prompt === candidate.prompt && item.mode === candidate.mode && (!candidate.challengeKind || item.challengeKind === candidate.challengeKind));
    // Keep one already-started activity from the earlier course, even where a
    // new katakana stage now shares its belt. Future prompts use the new course.
    const legacyCourse = Number.isInteger(fight.legacyBeltIndex);
    if (!canonical && allowLegacy && (legacyCourse || (!candidate.techniqueId && candidate.mode === G.BELTS[selectedBelt].mode))) {
      if (candidate.mode === 'word-read') {
        const earlyWords = legacyCourse ? fight.legacyBeltIndex === 6 : selectedBelt === G.BELTS.findIndex(belt => belt.mode === 'word-read');
        const word = words.find(item => item.jp === candidate.prompt && item.en === candidate.answer && (!earlyWords || item.week <= 6));
        if (word) canonical = { id: candidate.id, mode: candidate.mode, prompt: word.jp, answer: word.en, reading: word.romaji, meaning: word.en };
      } else if (candidate.mode === 'kana-read' || candidate.mode === 'kana-write') {
        const stage = G.BELTS[selectedBelt], script = legacyCourse ? 'hiragana' : stage.script;
        const pool = script === 'katakana' ? G.KATAKANA : G.KANA;
        const count = legacyCourse ? [15, 30, 46][fight.legacyBeltIndex % 3] : stage.kanaCount;
        const entry = pool.slice(0, count).find(item => candidate.mode === 'kana-read' ? item.char === candidate.prompt && item.romaji === candidate.answer : item.romaji === candidate.prompt && item.char === candidate.answer);
        if (entry) canonical = { id: candidate.mode + ':' + entry.char, mode: candidate.mode, script, prompt: candidate.mode === 'kana-read' ? entry.char : entry.romaji, answer: candidate.mode === 'kana-read' ? entry.romaji : entry.char, reading: entry.romaji, chars: [entry.char] };
        if (!canonical && legacyCourse && technique.kind === 'special' && candidate.challengeKind === 'special') {
          const taught = new Set(pool.slice(0, count).map(item => item.char));
          const word = words.find(item => item.romaji && (candidate.mode === 'kana-read' ? item.jp === candidate.prompt && item.romaji === candidate.answer : item.jp === candidate.answer && item.romaji === candidate.prompt) && [...item.jp].every(char => taught.has(char)));
          if (word && candidate.id === `special:${technique.id}:${candidate.mode}:${word.jp}`) canonical = { id: candidate.id, mode: candidate.mode, script, prompt: candidate.mode === 'kana-read' ? word.jp : word.romaji, answer: candidate.mode === 'kana-read' ? word.romaji : word.jp, reading: word.romaji, chars: [...word.jp], meaning: word.en, voiceAliases: [word.romaji], word: word.jp };
        }
      } else {
        const form = material.kanji.find(item => item.char === candidate.answer && item.mean === candidate.prompt);
        if (form) canonical = { id: 'kanji-write:' + form.char, mode: candidate.mode, prompt: form.mean, answer: form.char, reading: form.read, meaning: form.mean, chars: [...form.char] };
      }
      if (canonical) {
        const special = technique.kind === 'special' && candidate.challengeKind === 'special';
        Object.assign(canonical, { techniqueId: technique.id, challengeKind: special ? 'special' : 'basic', difficulty: special ? 'special' : 'basic', difficultyLevel: special ? technique.unlock : 0, challengeLabel: special ? 'Saved special activity' : 'Saved standard activity' });
      }
    }
    if (canonical && canonical.mode === 'word-read' && Array.isArray(candidate.choices) && candidate.choices.length === 4 && candidate.choices.includes(canonical.answer) && new Set(candidate.choices.map(value => G.normalizeAnswer(value))).size === 4 && candidate.choices.every(value => typeof value === 'string' && words.some(word => word.en === value))) {
      canonical.choices = [...candidate.choices];
    }
    return canonical || null;
  }
  function canonicalDraft(candidate) {
    if (!candidate || !question || !writingMode() || candidate.questionId !== question.id || candidate.writingIndex !== writingIndex || !Array.isArray(candidate.strokes) || candidate.strokes.length > 64 || !Array.isArray(candidate.overflow) || candidate.overflow.length !== candidate.strokes.length) return null;
    let pointCount = 0;
    const valid = candidate.strokes.every(stroke => Array.isArray(stroke) && stroke.length > 0 && stroke.length <= 2000 && stroke.every(point => {
      pointCount++;
      return point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= -.1 && point.x <= 1.1 && point.y >= -.1 && point.y <= 1.1;
    }));
    if (!valid || pointCount > 40000) return null;
    return { questionId: question.id, writingIndex, strokes: candidate.strokes.map(stroke => stroke.map(point => ({ x: point.x, y: point.y }))), overflow: candidate.overflow.map(value => value === true) };
  }
  if (saved && fight) {
    const available = G.availableMoves(progress.belt);
    const current = canonicalQuestion(saved.question, true);
    const cache = saved.challengeSet;
    if (!answerResolved && cache && cache.version === 1 && sameExchange(cache.exchange) && cache.entries && typeof cache.entries === 'object' && !Array.isArray(cache.entries)) {
      newChallengeSet();
      assisted = saved.assisted === true;
      challengeSet.locked = cache.locked === true || assisted;
      challengeSet.switched = cache.switched === true;
      const cacheKeys = new Set(['basic', ...available.filter(move => move.kind === 'special').map(move => move.id)]);
      Object.keys(cache.entries).filter(key => cacheKeys.has(key)).forEach(key => {
        const entry = canonicalQuestion(cache.entries[key]);
        if (entry && questionKey(entry) === key) challengeSet.entries[key] = entry;
      });
    }
    question = current;
    if (!question && challengeSet) {
      const move = available.find(item => item.id === selectedMove);
      const entry = move && challengeSet.entries[move.kind === 'special' ? move.id : 'basic'];
      if (entry) question = { ...entry, ...(move.kind === 'basic' ? { techniqueId: move.id } : {}) };
    }
    if (question) {
      if (!answerResolved) {
        if (!challengeSet) newChallengeSet();
        const key = questionKey(question), entry = challengeSet.entries[key];
        if (!entry || entry.id !== question.id || entry.answer !== question.answer) challengeSet.entries[key] = question;
      }
      if (!(fight.pendingDamage > 0 && !answerResolved && available.some(move => move.id === selectedMove))) selectedMove = question.techniqueId;
      assisted = saved.assisted === true;
      writingIndex = writingMode() && Number.isInteger(saved.writingIndex) && saved.writingIndex >= 0 && saved.writingIndex < question.chars.length ? saved.writingIndex : 0;
      writingDraft = canonicalDraft(saved.writingDraft);
      if (challengeSet && (assisted || writingIndex > 0 || (writingDraft && writingDraft.strokes.length > 0))) challengeSet.locked = true;
    }
  }
  applyPreferences(); renderLobby();
  document.documentElement.dataset.dojoReady = 'true';
  // Lobby intentionally requires a click to resume; answered questions retain their lock.
})();
