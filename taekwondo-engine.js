/* Shared, deterministic dojo rules. No DOM, timers, storage, or network access.
 * startFight/resolveAnswer mutate the returned fight; completeFight mutates progress.
 * Progress may be JSON saved. Use sanitizeFight to restore a saved fight journal.
 * The public fight is a view: only engine-resolved answers can change its outcome.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DojoGame = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SAVE_VERSION = 'fiona-taekwondo-v1';
  const COURSE_VERSION = 2;
  const FIGHT_VERSION = 6;
  const OLD_BELT_MAP = Object.freeze([0, 1, 2, 4, 5, 6, 7, 8, 10]);
  const OLD_MODES = Object.freeze(['kana-read', 'kana-read', 'kana-read', 'kana-write', 'kana-write', 'kana-write', 'word-read', 'word-read', 'kanji-write']);
  const MAX_COUNT = 1000000;
  const MAX_FIGHT_TURNS = 8192; // Successful blocks can safely extend a practice bout.
  const BELTS = Object.freeze([
    ['white', 'White', '#f3efe6', 'kana-read', 'Read the first 23 hiragana', 'hiragana', 23],
    ['yellow', 'Yellow', '#f9ce36', 'kana-read', 'Read all 46 hiragana', 'hiragana', 46],
    ['orange', 'Orange', '#ec843c', 'kana-read', 'Read the first 23 katakana', 'katakana', 23],
    ['gold', 'Gold', '#d9a52a', 'kana-read', 'Read all 46 katakana', 'katakana', 46],
    ['green', 'Green', '#57b58b', 'kana-write', 'Write the first 23 hiragana from memory', 'hiragana', 23],
    ['blue', 'Blue', '#5b9bed', 'kana-write', 'Write all 46 hiragana from memory', 'hiragana', 46],
    ['purple', 'Purple', '#ac80dd', 'kana-write', 'Write the first 23 katakana from memory', 'katakana', 23],
    ['brown', 'Brown', '#b4815e', 'kana-write', 'Write all 46 katakana from memory', 'katakana', 46],
    ['red', 'Red', '#ee6473', 'word-read', 'Read familiar Japanese words', null, 0],
    ['red-black', 'Red / Black', '#b94358', 'word-read', 'Read the full Year 1 garden vocabulary', null, 0],
    ['black', 'Black', '#242735', 'kanji-write', 'Write words with kanji from memory', null, 0]
  ].map(([id, name, color, mode, description, script, kanaCount], index) => Object.freeze({ id, name, color, mode, description, script, kanaCount, index })));

  const MOVES = Object.freeze([
    ['punch', 'Straight punch', 0, 0, 'A quick straight strike from your guard.'],
    ['front-kick', 'Front kick', 0, 0, 'A quick, direct opening kick.'],
    ['roundhouse', 'Roundhouse', 0, 0, 'Turn your hip and sweep around the guard.'],
    ['side-kick', 'Side kick', 0, 0, 'Drive sideways with a strong heel.'],
    ['axe-kick', 'Axe kick', 0, 0, 'Lift high, then bring the heel down.'],
    ['turning-kick', 'Turning kick', 0, 0, 'Pivot smoothly into the target.'],
    ['back-kick', 'Back kick', 0, 0, 'Look behind you and drive your heel back.'],
    ['double-kick', 'Double kick', 1, 10, 'Link two kicks by completing a longer challenge.'],
    ['jump-front-kick', 'Jump front kick', 2, 12, 'Rise into a front kick with a harder challenge.'],
    ['jump-side-kick', 'Jump side kick', 3, 15, 'Jump into a powerful side kick.'],
    ['spinning-hook-kick', 'Spinning hook kick', 4, 17, 'Turn fully and sweep your heel around the guard.'],
    ['tornado-kick', 'Tornado kick', 5, 20, 'A jumping spin powered by a harder answer.'],
    ['flying-double-kick', 'Flying double kick', 6, 22, 'Leap into a linked pair of kicks.'],
    ['whirlwind-combo', 'Whirlwind combo', 7, 25, 'A flowing chain of advanced strikes.'],
    ['jump-roundhouse', 'Jump roundhouse', 8, 27, 'Leap and sweep around the guard.'],
    ['spinning-back-kick', 'Spinning back kick', 9, 29, 'Turn fully and drive a powerful heel strike.'],
    ['dragon-finisher', 'Dragon finisher', 10, 32, 'Your strongest technique demands a kanji word challenge.']
  ].map(([id, name, unlock, bonus, description]) => Object.freeze({ id, name, unlock, bonus, description,
    kind: unlock ? 'special' : 'basic', difficulty: unlock ? 'special' : 'basic', difficultyLevel: unlock,
    baseDamage: 14 + bonus })));
  const DEFAULT_MOVE = MOVES.find(move => move.id === 'front-kick');
  const PRE_KATAKANA_MOVES = Object.freeze(MOVES.filter(move => !['jump-roundhouse', 'spinning-back-kick'].includes(move.id)).map(move => Object.freeze({
    ...move, ...(move.id === 'whirlwind-combo' ? { unlock: 7, bonus: 25, baseDamage: 39, difficultyLevel: 7 } :
      move.id === 'dragon-finisher' ? { unlock: 8, bonus: 28, baseDamage: 42, difficultyLevel: 8 } : {})
  })));
  // Version 2 journals keep their exact original damage and unlocking rules.
  const LEGACY_MOVES = Object.freeze([
    ['front-kick', 0, 0], ['roundhouse', 1, 1], ['side-kick', 2, 2], ['axe-kick', 3, 3],
    ['turning-kick', 4, 4], ['double-kick', 5, 5], ['back-kick', 6, 6], ['tornado-kick', 7, 7]
  ].map(([id, unlock, bonus]) => Object.freeze({ ...MOVES.find(move => move.id === id), unlock, bonus })));

  const OPPONENTS = Object.freeze([
    { name: 'Jun', title: 'The first step', skin: '#e4b692', hair: '#332b38', gender: 'male', style: 'Patient front kicks', accent: '#7cabb0', story: 'Jun bows. Every champion starts with one sound.' },
    { name: 'Mina', title: 'Sunrise sparrer', skin: '#b77959', hair: '#211d2a', gender: 'female', style: 'Quick roundhouses', accent: '#dfac55', story: 'Mina finds her rhythm. Find yours, one answer at a time.' },
    { name: 'Leo', title: 'The steady wall', skin: '#f0c4a5', hair: '#d4aa58', gender: 'male', style: 'Firm side kicks', accent: '#d8905e', story: 'Leo introduces katakana. Match each new shape to its sound.' },
    { name: 'Emi', title: 'Golden rhythm', skin: '#bf8a65', hair: '#2b2433', hairstyle: 'sweep', gender: 'female', style: 'Leaping front kicks', accent: '#d9a52a', story: 'Emi guards the full katakana chart. Say each sound clearly.' },
    { name: 'Aya', title: 'Ink in motion', skin: '#d8a580', hair: '#383c6a', gender: 'female', style: 'Measured axe kicks', accent: '#5ca991', story: 'Aya invites you to put down the guide and trust your hand.' },
    { name: 'Noah', title: 'Ocean footwork', skin: '#805540', hair: '#252733', gender: 'male', style: 'Flowing turning kicks', accent: '#6b9fca', story: 'Noah moves like water. Shape each character with care.' },
    { name: 'Sora', title: 'The violet flash', skin: '#e3b895', hair: '#49334e', gender: 'female', style: 'Fast double kicks', accent: '#b58aca', story: 'Sora invites you to write katakana from memory. Shape each stroke with care.' },
    { name: 'Haru', title: 'Katakana guardian', skin: '#c99571', hair: '#313b32', gender: 'male', style: 'Precise back kicks', accent: '#ac8a6c', story: 'Haru guards the complete katakana writing challenge.' },
    { name: 'Rin', title: 'Word explorer', skin: '#a97154', hair: '#293248', gender: 'female', style: 'Spinning tornado kicks', accent: '#db6a78', story: 'Rin brings familiar words from your garden lessons into the ring.' },
    { name: 'Kai', title: 'The last gate', skin: '#8e6048', hair: '#222e37', hairstyle: 'crop', gender: 'male', style: 'Spinning back kicks', accent: '#df797b', story: 'Kai guards your black belt with the complete Year 1 word challenge. A cool celebration waits beyond this bout.' },
    { name: 'Master Steif', title: 'The final master', skin: '#e1b18f', hair: '#aeb3b8', hairstyle: 'crop', gender: 'male', style: 'Unblockable master counters', accent: '#c5ad76', unblockableMistakes: true, mistakeDamagePercent: 100 / 3, story: 'Master Steif awaits your kanji challenge. Each mistake costs one-third of your health immediately, with no block chance.' }
  ].map((opponent, index) => Object.freeze({ ...opponent, beltIndex: index, belt: BELTS[index].id })));

  const REWARDS = Object.freeze([
    { id: 'reading', title: 'Hiragana Reader', beltIndex: 1 },
    { id: 'katakana-reading', title: 'Katakana Reader', beltIndex: 3 },
    { id: 'writing', title: 'Hiragana Writer', beltIndex: 5 },
    { id: 'katakana-writing', title: 'Katakana Writer', beltIndex: 7 },
    { id: 'words', title: 'Word Reader', beltIndex: 9 },
    { id: 'kanji', title: 'Kanji Champion', beltIndex: 10 }
  ].map(reward => Object.freeze(reward)));

  // Same 46 basic character/romaji pairs and order as writing.html:hiraganaData.
  const kanaChars = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
  const kanaReadings = 'a i u e o ka ki ku ke ko sa shi su se so ta chi tsu te to na ni nu ne no ha hi fu he ho ma mi mu me mo ya yu yo ra ri ru re ro wa wo n'.split(' ');
  const alternatives = { shi: ['si'], chi: ['ti'], tsu: ['tu'], fu: ['hu'], wo: ['o'], n: ["n'", 'nn'] };
  const KANA = Object.freeze([...kanaChars].map((char, index) => Object.freeze({
    char, romaji: kanaReadings[index], aliases: Object.freeze([kanaReadings[index]].concat(alternatives[kanaReadings[index]] || []))
  })));
  const KATAKANA = Object.freeze([...'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン'].map((char, index) => Object.freeze({
    char, romaji: kanaReadings[index], aliases: KANA[index].aliases
  })));

  const states = new WeakMap();
  let sequence = 0;
  function count(value, maximum = MAX_COUNT) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.min(maximum, Math.max(0, Math.floor(value))) : 0;
  }
  function beltNumber(value) { return count(value, BELTS.length - 1); }
  function availableMoves(beltIndex) { return MOVES.filter(move => move.unlock <= beltNumber(beltIndex)); }
  function readingSpeedBonus(milliseconds) {
    if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds) || milliseconds <= 0 || milliseconds > 4000) {
      return { speedBonus: 0, speedTier: '' };
    }
    return milliseconds <= 2000 ? { speedBonus: 6, speedTier: 'lightning' } : { speedBonus: 3, speedTier: 'quick' };
  }
  // A flurry is presentation only: scoring still comes exclusively from resolveAnswer.
  // Keep four arrivals at most; the fifth consumes the batch and starts a new cycle.
  function advanceFlurry(history, now, eligible = true) {
    const empty = { times: [], count: 0, knockdown: false, elapsedMs: 0 };
    if (eligible !== true || typeof now !== 'number' || !Number.isFinite(now) || now < 0) return empty;
    let times = Array.isArray(history) ? history.slice(-4) : [];
    if (times.some((time, index) => typeof time !== 'number' || !Number.isFinite(time) || time < 0 || time > now ||
      (index > 0 && time < times[index - 1]))) times = [];
    times = times.filter(time => now - time <= 5000);
    times.push(now);
    const count = times.length;
    const elapsedMs = now - times[0];
    return { times: count === 5 ? [] : times, count, knockdown: count === 5, elapsedMs };
  }
  function normalizeAnswer(value) {
    return typeof value === 'string' ? value.normalize('NFKC').trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, '') : '';
  }
  function acceptsReading(question, input) {
    if (!question || question.mode !== 'kana-read') return false;
    const answer = normalizeAnswer(input);
    const entry = KANA.concat(KATAKANA).find(kana => kana.char === question.prompt);
    const aliases = entry ? entry.aliases : question.difficulty === 'special' && Array.isArray(question.voiceAliases) ? question.voiceAliases : [];
    return Boolean(answer && aliases.some(alias => normalizeAnswer(alias) === answer));
  }
  function createProgress() {
    return { version: SAVE_VERSION, courseVersion: COURSE_VERSION, completedSections: [], belt: 0, wins: 0, losses: 0, totalCorrect: 0, totalMistakes: 0,
      bestStreak: 0, mastered: false, rewards: Object.fromEntries(REWARDS.map(reward => [reward.id, { unlocked: false, claimed: false, flavor: '' }])),
      iceCreamUnlocked: false, iceCreamClaimed: false, flavor: '' };
  }
  function sanitizeProgress(raw) {
    const progress = createProgress();
    if (!raw || typeof raw !== 'object' || raw.version !== SAVE_VERSION) return progress;
    const legacy = raw.courseVersion !== COURSE_VERSION;
    const oldBelt = count(raw.belt, 8);
    progress.belt = legacy ? OLD_BELT_MAP[oldBelt] : beltNumber(raw.belt);
    ['wins', 'losses', 'totalCorrect', 'totalMistakes', 'bestStreak'].forEach(key => { progress[key] = count(raw[key]); });
    progress.mastered = progress.belt === BELTS.length - 1 && raw.mastered === true;
    const oldMilestones = { reading: 2, writing: 5, words: 7, kanji: 8 };
    progress.completedSections = REWARDS.filter(reward => {
      if (legacy) return Object.prototype.hasOwnProperty.call(oldMilestones, reward.id) &&
        (reward.id === 'kanji' ? progress.mastered : oldBelt > oldMilestones[reward.id]);
      return Array.isArray(raw.completedSections) && raw.completedSections.includes(reward.id) &&
        (reward.id !== 'kanji' || progress.mastered);
    }).map(reward => reward.id);
    const flavors = ['strawberry', 'vanilla', 'chocolate', 'matcha'];
    for (const reward of REWARDS) {
      const unlocked = progress.completedSections.includes(reward.id);
      const stored = raw.rewards && typeof raw.rewards === 'object' && raw.rewards[reward.id];
      const originalReward = !stored && reward.id === 'words' ? { claimed: raw.iceCreamClaimed, flavor: raw.flavor } : null;
      const source = stored && typeof stored === 'object' ? stored : originalReward;
      const claimed = Boolean(unlocked && source && source.claimed === true);
      progress.rewards[reward.id] = { unlocked, claimed, flavor: claimed && flavors.includes(source.flavor) ? source.flavor : '' };
    }
    // Compatibility fields represent the original word-reading/black-belt cone.
    progress.iceCreamUnlocked = progress.rewards.words.unlocked;
    progress.iceCreamClaimed = progress.rewards.words.claimed;
    progress.flavor = progress.rewards.words.flavor;
    return progress;
  }
  function syncFight(fight, state) {
    Object.assign(fight, { version: SAVE_VERSION, courseVersion: COURSE_VERSION, rulesVersion: FIGHT_VERSION, id: state.id, beltIndex: state.beltIndex, originBelt: state.originBelt,
      opponentIndex: state.beltIndex, playerHp: state.playerHp, opponentHp: state.opponentHp,
      staminaVersion: state.staminaVersion, opponentMaxHp: state.opponentMaxHp,
      streak: state.streak, bestStreak: state.bestStreak, correct: state.correct, mistakes: state.mistakes,
      assisted: state.assisted, turns: state.journal.length, status: state.status,
      pendingDamage: state.pendingDamage, blocks: state.blocks, blockedDamage: state.blockedDamage,
      won: state.status === 'won', lost: state.status === 'lost', recorded: state.recorded,
      journal: state.journal.map(event => ({ ...event })) });
    if (Number.isInteger(state.legacyBeltIndex)) {
      fight.legacyBeltIndex = state.legacyBeltIndex;
      fight.legacyOriginBelt = state.legacyOriginBelt;
    }
    return fight;
  }
  function makeFight(originBelt, beltIndex, legacyBeltIndex, legacyOriginBelt, staminaVersion = 0) {
    const opponentMaxHp = staminaVersion === 1 ? 150 : 100;
    const state = { id: 'bout-' + Date.now().toString(36) + '-' + (++sequence), originBelt, beltIndex,
      staminaVersion, opponentMaxHp, playerHp: 100, opponentHp: opponentMaxHp, streak: 0, bestStreak: 0, correct: 0, mistakes: 0, assisted: 0,
      pendingDamage: 0, blocks: 0, blockedDamage: 0,
      status: 'fighting', recorded: false, journal: [] };
    if (Number.isInteger(legacyBeltIndex)) Object.assign(state, { legacyBeltIndex, legacyOriginBelt });
    const fight = {};
    states.set(fight, state);
    return syncFight(fight, state);
  }
  function startFight(progress, beltIndex) {
    const clean = sanitizeProgress(progress);
    const selected = beltIndex === undefined ? clean.belt : Math.min(clean.belt, beltNumber(beltIndex));
    return makeFight(clean.belt, selected, undefined, undefined, 1);
  }
  function applyAnswer(fight, answer, rulesVersion) {
    const state = fight && states.get(fight);
    const neutral = { playerDamage: 0, opponentDamage: 0, streak: state ? state.streak : 0,
      combo: false, move: DEFAULT_MOVE, won: Boolean(state && state.status === 'won'), lost: Boolean(state && state.status === 'lost'), resolved: false,
      counterQueued: false, pendingDamage: state ? state.pendingDamage : 0, blockChance: Boolean(state && state.pendingDamage > 0),
      blocked: false, blockFailed: false, blockedDamage: 0, defensive: false, immediateCounter: false, speedBonus: 0, speedTier: '' };
    if (!state || state.status !== 'fighting' || !answer || typeof answer.correct !== 'boolean') return neutral;
    const requested = typeof answer.move === 'object' && answer.move ? answer.move.id : answer.move;
    const legacy = rulesVersion === 2;
    const historical = rulesVersion < FIGHT_VERSION;
    const legacyBelt = Number.isInteger(state.legacyBeltIndex) ? state.legacyBeltIndex : state.beltIndex;
    const legacyOrigin = Number.isInteger(state.legacyOriginBelt) ? state.legacyOriginBelt : state.originBelt;
    const movePool = legacy ? LEGACY_MOVES.filter(item => item.unlock <= legacyBelt) : historical ?
      PRE_KATAKANA_MOVES.filter(item => item.unlock <= legacyOrigin) : availableMoves(state.originBelt);
    const move = movePool.find(item => item.id === requested) || (legacy ? LEGACY_MOVES[0] : DEFAULT_MOVE);
    const challengeKind = !legacy && move.kind === 'special' && answer.challengeKind === 'special' ? 'special' : 'basic';
    const bonus = legacy || challengeKind === 'special' ? move.bonus : 0;
    const assisted = answer.assisted === true;
    let playerDamage = 0, opponentDamage = 0, combo = false, blocked = false, blockFailed = false, blockedDamage = 0, counterQueued = false, immediateCounter = false;
    const defensive = state.pendingDamage > 0;
    const mode = historical ? OLD_MODES[legacyBelt] : BELTS[state.beltIndex].mode;
    const readingAttack = rulesVersion >= 5 && answer.correct && !assisted && !defensive && ['kana-read', 'word-read'].includes(mode);
    const readingMs = readingAttack && typeof answer.readingMs === 'number' && Number.isFinite(answer.readingMs) && answer.readingMs > 0 ? answer.readingMs : null;
    const { speedBonus, speedTier } = readingMs === null ? { speedBonus: 0, speedTier: '' } : readingSpeedBonus(readingMs);
    if (defensive) {
      const queued = state.pendingDamage;
      state.pendingDamage = 0;
      state.streak = 0;
      if (answer.correct) {
        state.correct++;
        if (assisted) state.assisted++;
        state.blocks++;
        state.blockedDamage += queued;
        blocked = true;
        blockedDamage = queued;
      } else {
        state.mistakes++;
        playerDamage = Math.min(state.playerHp, queued);
        state.playerHp -= playerDamage;
        blockFailed = true;
      }
    } else if (answer.correct) {
      state.correct++;
      if (assisted) {
        state.assisted++;
        state.streak = 0;
        opponentDamage = Math.floor((14 + bonus) / 2);
      } else {
        state.streak++;
        state.bestStreak = Math.max(state.bestStreak, state.streak);
        combo = state.streak % 3 === 0;
        opponentDamage = 14 + Math.min(15, (state.streak - 1) * 3) + bonus;
        if (combo) opponentDamage += Math.min(18, 6 + Math.floor(state.streak / 3) * 3);
        opponentDamage += speedBonus;
      }
      opponentDamage = Math.min(state.opponentHp, opponentDamage);
      state.opponentHp -= opponentDamage;
    } else {
      state.mistakes++;
      state.streak = 0;
      const opponent = OPPONENTS[state.beltIndex];
      if (rulesVersion >= 4 && (historical ? legacyBelt === 8 : opponent.unblockableMistakes)) {
        // One-third of the full health bar: the third mistake always ends a fresh bout.
        // Preserve the old queued-counter behavior when replaying version 2/3 journals.
        playerDamage = Math.min(state.playerHp, opponent.mistakeDamagePercent);
        state.playerHp -= playerDamage;
        immediateCounter = true;
      } else {
        state.pendingDamage = Math.min(state.playerHp, Math.min(24, 10 + (state.mistakes - 1) * 2));
        counterQueued = true;
      }
    }
    state.journal.push({ correct: answer.correct, assisted, move: move.id, rulesVersion,
      ...(legacy ? {} : { challengeKind }), ...(readingMs === null ? {} : { readingMs }) });
    if (state.playerHp <= 0) state.status = 'lost';
    else if (state.opponentHp <= 0) state.status = 'won';
    syncFight(fight, state);
    return { playerDamage, opponentDamage, streak: state.streak, combo, move, challengeKind, specialBonus: bonus,
      won: state.status === 'won', lost: state.status === 'lost', resolved: true,
      counterQueued, pendingDamage: state.pendingDamage, blockChance: state.pendingDamage > 0,
      blocked, blockFailed, blockedDamage, defensive, immediateCounter, speedBonus, speedTier };
  }
  // The controller freezes the question's techniqueId/challengeKind before accepting input.
  // A special selected for a basic question never receives its extra damage.
  function resolveAnswer(fight, answer) { return applyAnswer(fight, answer, FIGHT_VERSION); }
  function sanitizeFight(raw, progress) {
    const versions = [2, 3, 4, 5, FIGHT_VERSION];
    if (!raw || typeof raw !== 'object' || raw.version !== SAVE_VERSION || !versions.includes(raw.rulesVersion) || !Array.isArray(raw.journal) || raw.journal.length > MAX_FIGHT_TURNS) return null;
    const oldCourse = raw.courseVersion !== COURSE_VERSION;
    const staminaVersion = Object.prototype.hasOwnProperty.call(raw, 'staminaVersion') ? raw.staminaVersion : 0;
    if (![0, 1].includes(staminaVersion) || (staminaVersion === 1 && (oldCourse || raw.rulesVersion !== FIGHT_VERSION))) return null;
    const maximum = oldCourse ? 8 : BELTS.length - 1;
    if (!Number.isInteger(raw.beltIndex) || raw.beltIndex < 0 || raw.beltIndex > maximum ||
      !Number.isInteger(raw.originBelt) || raw.originBelt < raw.beltIndex || raw.originBelt > maximum ||
      (oldCourse && raw.rulesVersion >= FIGHT_VERSION)) return null;
    const beltIndex = oldCourse ? OLD_BELT_MAP[raw.beltIndex] : raw.beltIndex;
    const originBelt = oldCourse ? OLD_BELT_MAP[raw.originBelt] : raw.originBelt;
    const legacyBeltIndex = oldCourse ? raw.beltIndex : raw.legacyBeltIndex;
    const legacyOriginBelt = oldCourse ? raw.originBelt : raw.legacyOriginBelt;
    const legacyMetadata = Number.isInteger(legacyBeltIndex) && legacyBeltIndex >= 0 && legacyBeltIndex <= 8 &&
      Number.isInteger(legacyOriginBelt) && legacyOriginBelt >= legacyBeltIndex && legacyOriginBelt <= 8 &&
      OLD_BELT_MAP[legacyBeltIndex] === beltIndex && OLD_BELT_MAP[legacyOriginBelt] === originBelt;
    if ((Object.prototype.hasOwnProperty.call(raw, 'legacyBeltIndex') || Object.prototype.hasOwnProperty.call(raw, 'legacyOriginBelt') || oldCourse) && !legacyMetadata) return null;
    if (staminaVersion === 1 && legacyMetadata) return null;
    if (progress && beltIndex > sanitizeProgress(progress).belt) return null;
    const fight = makeFight(originBelt, beltIndex, legacyMetadata ? legacyBeltIndex : undefined, legacyMetadata ? legacyOriginBelt : undefined, staminaVersion);
    let previousEventVersion = 2;
    for (const event of raw.journal) {
      const eventVersion = raw.rulesVersion === 2 ? 2 : event && event.rulesVersion;
      if (staminaVersion === 1 && eventVersion !== FIGHT_VERSION) return null;
      if (!versions.includes(eventVersion) || eventVersion < previousEventVersion || eventVersion > raw.rulesVersion || (eventVersion < FIGHT_VERSION && !legacyMetadata)) return null;
      previousEventVersion = eventVersion;
      const movePool = eventVersion === 2 ? LEGACY_MOVES : eventVersion < FIGHT_VERSION ? PRE_KATAKANA_MOVES : MOVES;
      const moveRank = eventVersion === 2 ? legacyBeltIndex : eventVersion < FIGHT_VERSION ? legacyOriginBelt : originBelt;
      if (!event || typeof event.correct !== 'boolean' || typeof event.assisted !== 'boolean' ||
        typeof event.move !== 'string' || !movePool.some(move => move.id === event.move && move.unlock <= moveRank) || fight.status !== 'fighting' ||
        (eventVersion >= 3 && !['basic', 'special'].includes(event.challengeKind))) return null;
      if (eventVersion >= 5 && Object.prototype.hasOwnProperty.call(event, 'readingMs') &&
        (typeof event.readingMs !== 'number' || !Number.isFinite(event.readingMs) || event.readingMs <= 0 || !event.correct || event.assisted ||
          fight.pendingDamage > 0 || !['kana-read', 'word-read'].includes(eventVersion < FIGHT_VERSION ? OLD_MODES[legacyBeltIndex] : BELTS[beltIndex].mode))) return null;
      applyAnswer(fight, event, eventVersion);
    }
    const state = states.get(fight);
    state.recorded = raw.recorded === true && state.status !== 'fighting';
    return syncFight(fight, state);
  }
  function completeFight(progress, fight) {
    const state = fight && states.get(fight);
    const clean = sanitizeProgress(progress);
    const summary = { won: false, lost: false, promoted: false, belt: clean.belt,
      rewardUnlocked: false, rewardId: null, mastered: clean.mastered, recorded: false };
    if (!state || state.status === 'fighting' || state.recorded || !progress || typeof progress !== 'object') return summary;
    summary.won = state.status === 'won' && state.opponentHp === 0 && state.playerHp > 0;
    summary.lost = state.status === 'lost' && state.playerHp === 0;
    if (!summary.won && !summary.lost) return summary;
    clean[summary.won ? 'wins' : 'losses'] = count(clean[summary.won ? 'wins' : 'losses'] + 1);
    clean.totalCorrect = count(clean.totalCorrect + state.correct);
    clean.totalMistakes = count(clean.totalMistakes + state.mistakes);
    clean.bestStreak = Math.max(clean.bestStreak, state.bestStreak);
    if (summary.won && state.beltIndex === clean.belt && state.originBelt === clean.belt) {
      if (clean.belt < BELTS.length - 1) {
        clean.belt++;
        summary.promoted = true;
      } else clean.mastered = true;
    }
    if (summary.won) {
      const oldRewardIds = { 2: 'reading', 5: 'writing', 7: 'words', 8: 'kanji' };
      const mappedMilestone = REWARDS.find(reward => reward.beltIndex === state.beltIndex);
      const imported = Number.isInteger(state.legacyBeltIndex);
      const sameStudy = imported && BELTS[state.beltIndex].script !== 'katakana' && OLD_MODES[state.legacyBeltIndex] === BELTS[state.beltIndex].mode;
      const milestone = imported ? REWARDS.find(reward => reward.id === oldRewardIds[state.legacyBeltIndex]) || (sameStudy ? mappedMilestone : null) : mappedMilestone;
      if (milestone && !clean.rewards[milestone.id].unlocked) {
        clean.completedSections.push(milestone.id);
        clean.rewards[milestone.id].unlocked = true;
        summary.rewardUnlocked = true;
        summary.rewardId = milestone.id;
      }
    }
    Object.assign(clean, sanitizeProgress(clean));
    state.recorded = true;
    Object.assign(progress, clean);
    syncFight(fight, state);
    return { ...summary, belt: clean.belt, mastered: clean.mastered, recorded: true };
  }
  function randomIndex(length, rng) {
    let value;
    try { value = Number(rng()); } catch (_) { value = 0; }
    if (!Number.isFinite(value)) value = 0;
    return Math.min(length - 1, Math.max(0, Math.floor(value * length)));
  }
  function shuffle(items, rng) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = randomIndex(i + 1, rng);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function chooseQuestion(items, recent, rng) {
    if (!items.length) throw new Error('This belt needs canonical lesson material.');
    const history = new Set(Array.isArray(recent) ? recent.map(item => typeof item === 'string' ? item : item && item.id) : []);
    const fresh = items.filter(item => !history.has(item.id));
    const pool = fresh.length ? fresh : items;
    return pool[randomIndex(pool.length, rng)];
  }
  function createQuestion(beltIndex, material = {}, recent = [], rng = Math.random, moveId = 'front-kick', earnedBelt = beltIndex) {
    material = material && typeof material === 'object' ? material : {};
    const index = beltNumber(beltIndex);
    const belt = BELTS[index];
    const mode = belt.mode;
    const requested = typeof moveId === 'object' && moveId ? moveId.id : moveId;
    const move = availableMoves(Math.max(index, beltNumber(earnedBelt))).find(item => item.id === requested) || DEFAULT_MOVE;
    const special = move.kind === 'special';
    const decorate = (question, label) => ({ ...question, script: belt.script, techniqueId: move.id, difficulty: special ? 'special' : 'basic',
      challengeKind: special ? 'special' : 'basic', difficultyLevel: move.difficultyLevel,
      challengeLabel: label || (special ? 'Special challenge' : 'Basic challenge') });
    const supplied = Array.isArray(material.words) ? material.words : Array.isArray(material.pool) ? material.pool : [];
    const seenWords = new Set();
    const words = supplied.filter(word => {
      if (!word || typeof word.jp !== 'string' || !word.jp || typeof word.en !== 'string' || !word.en || seenWords.has(word.jp)) return false;
      seenWords.add(word.jp);
      return true;
    });
    const specialId = value => 'special:' + move.id + ':' + mode + ':' + value;
    if (mode === 'kana-read' || mode === 'kana-write') {
      const length = belt.kanaCount;
      const kana = belt.script === 'katakana' ? KATAKANA : KANA;
      if (special) {
        const taught = new Set(kana.slice(0, length).map(kana => kana.char));
        // Longer, real lesson words practise the same taught kana without introducing a new script.
        const eligible = words.filter(word => typeof word.romaji === 'string' && word.romaji &&
          [...word.jp].length >= 2 && [...word.jp].every(char => taught.has(char)));
        const longest = Math.max(0, ...eligible.map(word => [...word.jp].length));
        const minimum = Math.min(longest, Math.min(5, move.unlock + 1));
        const pool = eligible.filter(word => [...word.jp].length >= minimum);
        if (!pool.length) return createQuestion(index, material, recent, rng, DEFAULT_MOVE.id, earnedBelt);
        return decorate(chooseQuestion(pool.map(word => ({ id: specialId(word.jp), mode,
          prompt: mode === 'kana-read' ? word.jp : word.romaji,
          answer: mode === 'kana-read' ? word.romaji : word.jp, reading: word.romaji, meaning: word.en,
          chars: [...word.jp], voiceAliases: [word.romaji], word: word.jp })), recent, rng),
        (mode === 'kana-read' ? 'Read' : 'Write from memory') + ' a ' + minimum + '+ character ' + belt.script + ' word');
      }
      return decorate(chooseQuestion(kana.slice(0, length).map(kana => ({ id: mode + ':' + kana.char, mode,
        prompt: mode === 'kana-read' ? kana.char : kana.romaji,
        answer: mode === 'kana-read' ? kana.romaji : kana.char,
        reading: kana.romaji, chars: [kana.char] })), recent, rng), mode === 'kana-read' ? 'Read one ' + belt.script : 'Write one ' + belt.script + ' from memory');
    }
    if (mode === 'word-read') {
      const pool = index === 8 ? words.filter(word => !Number.isFinite(word.week) || word.week <= 6) : words;
      const minimum = special ? Math.min(6, 4 + Math.floor((move.unlock - 1) / 2)) : 1;
      const options = pool.filter(word => special ? [...word.jp].length >= minimum : [...word.jp].length <= 3);
      if (special && !options.length) return createQuestion(index, material, recent, rng, DEFAULT_MOVE.id, earnedBelt);
      const question = chooseQuestion(options.map(word => ({ id: special ? specialId(word.jp) : mode + ':' + word.jp, mode, prompt: word.jp,
        answer: word.en, reading: word.romaji || '', meaning: word.en })), recent, rng);
      const seenMeanings = new Set([normalizeAnswer(question.answer)]);
      const distractors = shuffle(words, rng).filter(word => {
        const key = normalizeAnswer(word.en);
        if (seenMeanings.has(key)) return false;
        seenMeanings.add(key);
        return true;
      }).slice(0, 3).map(word => word.en);
      if (distractors.length !== 3) throw new Error('Word reading needs at least four distinct canonical meanings.');
      return decorate({ ...question, choices: shuffle([question.answer, ...distractors], rng) },
        special ? 'Read a longer ' + minimum + '+ character word' : 'Read a short word');
    }
    const seenKanji = new Set();
    const kanji = (Array.isArray(material.kanji) ? material.kanji : []).filter(form => {
      if (!form || typeof form.char !== 'string' || !/[一-龯]/.test(form.char) || typeof form.read !== 'string' ||
        typeof form.mean !== 'string' || !words.some(word => word.jp === form.read && word.en === form.mean) || seenKanji.has(form.char)) return false;
      seenKanji.add(form.char);
      return true;
    });
    if (special) {
      const seenAdvanced = new Set();
      const advanced = (Array.isArray(material.advancedKanji) ? material.advancedKanji : []).filter(form => {
        if (!form || typeof form.char !== 'string' || !/^[一-龯]{2,}$/.test(form.char) || typeof form.read !== 'string' ||
          typeof form.mean !== 'string' || !words.some(word => word.jp === form.read && word.en === form.mean) || seenAdvanced.has(form.char)) return false;
        seenAdvanced.add(form.char); return true;
      });
      if (advanced.length) {
        return decorate(chooseQuestion(advanced.map(form => ({ id: specialId(form.char), mode, prompt: form.mean,
          answer: form.char, reading: form.read, meaning: form.mean, chars: [...form.char] })), recent, rng),
        'Write a full word with two or more kanji');
      }
      // If no verified compound is supplied, keep two known words visibly separate.
      const pairs = kanji.flatMap((first, firstIndex) => kanji.filter((_, secondIndex) => secondIndex !== firstIndex).map(second => ({
        id: specialId(first.char + '/' + second.char), mode, prompt: first.mean + ' / ' + second.mean,
        answer: first.char + ' / ' + second.char, reading: first.read + ' / ' + second.read,
        meaning: first.mean + ' / ' + second.mean, chars: [...first.char, ...second.char],
        words: [first.char, second.char], wordReadings: [first.read, second.read]
      })));
      return decorate(chooseQuestion(pairs, recent, rng), 'Write two separate kanji words from memory');
    }
    return decorate(chooseQuestion(kanji.map(form => ({ id: mode + ':' + form.char, mode,
      prompt: form.mean, answer: form.char, reading: form.read, meaning: form.mean, chars: [...form.char] })), recent, rng),
    'Write one kanji word from memory');
  }

  return Object.freeze({ SAVE_VERSION, COURSE_VERSION, FIGHT_VERSION, MAX_FIGHT_TURNS, BELTS, MOVES, OPPONENTS, REWARDS, KANA, KATAKANA, createProgress, sanitizeProgress,
    availableMoves, readingSpeedBonus, advanceFlurry, startFight, sanitizeFight, createQuestion, resolveAnswer, completeFight, normalizeAnswer, acceptsReading });
});
