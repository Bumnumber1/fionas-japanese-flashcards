/* Read-only exhibition: actual DojoScene animations and DojoGame fight rules.
 * No microphone, lesson answers, localStorage, or saved progress are accessed.
 */
(function () {
  'use strict';

  const get = id => document.getElementById(id);
  const sequence = [
    { move: 'bow', actor: 'player', hit: false, hold: 400, title: 'A bow before the bout', caption: 'Fiona steps into a friendly sparring match. Watch how your answers turn into moves.', badge: 'RESPECT FIRST', tone: 'neutral' },
    { move: 'front-kick', correct: true, hold: 400, title: 'One correct answer. One clean front kick.', caption: 'Every basic is available at white belt. A standard answer powers this front kick and starts your streak.', badge: 'BASIC · FRONT KICK', tone: 'neutral' },
    { move: 'roundhouse', correct: true, hold: 500, title: 'Two in a row. Keep the rhythm.', caption: 'Consecutive correct answers increase attack damage. Fiona follows with a roundhouse.', badge: '2 IN A ROW · ROUNDHOUSE', tone: 'neutral' },
    { move: 'roundhouse', actor: 'opponent', hit: false, correct: false, hold: 450, title: 'A mistake gives you a chance to block.', caption: 'A mistake breaks the streak and queues a counterattack. No damage is dealt yet: the next answer is a block chance.', badge: 'MISTAKE · BLOCK CHANCE NEXT', tone: 'danger' },
    { move: 'block', hit: false, correct: true, hold: 700, title: 'Correct on the block chance. Damage stopped.', caption: 'Get the next answer right to block all queued damage. Another mistake would let that counterattack land. A block starts your streak over.', badge: 'BLOCK SUCCESSFUL · NO DAMAGE', tone: 'block' },
    { move: 'side-kick', correct: true, hold: 400, title: 'Reset. Focus. Side kick.', caption: 'After the block, a fresh correct answer starts a new attack streak. Your learning pace sets the fight’s pace.', badge: 'CORRECT · SIDE KICK', tone: 'neutral' },
    { move: 'double-kick', correct: true, hold: 400, title: 'A harder answer powers a stronger special.', caption: 'Yellow belt earns the double kick. Complete its longer challenge for extra damage; this clean attack brings the streak to two.', badge: 'SPECIAL · DOUBLE KICK · +10 DAMAGE', tone: 'neutral' },
    { move: 'tornado-kick', correct: true, hold: 450, title: 'A special technique and a three-answer combo!', caption: 'Blue belt earns the tornado kick. Its harder activity adds special damage, and the third clean attack adds a combo bonus.', badge: '3 IN A ROW · TORNADO SPECIAL', tone: 'combo' },
    { move: 'celebrate', hit: false, hold: 1100, title: 'A win on the mat. A step toward your reward.', caption: 'Belts advance after opponents are defeated. Complete hiragana and katakana reading and writing, then word reading and kanji writing, for six saved ice cream rewards.', badge: 'BOUT WON · WELL DONE, FIONA', tone: 'combo' }
  ];

  let scene, fight, index = -1, timer = 0, timerDue = 0, timerRemaining = 0;
  let paused = false, pausedAt = 0, pausedClock = 0, automaticallyPaused = false;
  let cycleStart = 0, cyclePaused = 0, timelineFrame = 0, totalDuration = 18000;
  const durations = [];
  const api = { sequence, currentMove: null, scene: null, fight: null, paused: false, durations, totalDuration, replay, pause: () => pause(false), resume };
  window.DojoDemo = api;

  function fail(error) {
    clearTimeout(timer);
    cancelAnimationFrame(timelineFrame);
    get('demo-error').hidden = false;
    get('demo-error-detail').textContent = error && error.message ? error.message : 'This browser needs WebGL to show the fighters.';
    get('pause-demo').disabled = true;
    get('replay-demo').disabled = true;
  }

  function updateHud() {
    [['player', fight.playerHp], ['opponent', fight.opponentHp]].forEach(([who, hp]) => {
      const health = get('demo-' + who + '-health');
      health.setAttribute('aria-valuenow', String(hp));
      health.firstElementChild.style.width = hp + '%';
      get('demo-' + who + '-hp').textContent = hp + ' / 100';
    });
    get('demo-streak').textContent = fight.pendingDamage ? '10 DAMAGE QUEUED · BLOCK TO STOP IT' : fight.won ? 'VICTORY' : fight.streak ? fight.streak + ' CORRECT IN A ROW' : 'A FRESH START';
  }

  function schedule(delay) {
    timerRemaining = delay;
    timerDue = performance.now() + delay;
    timer = window.setTimeout(next, delay);
  }

  function next() {
    if (paused || !scene || !scene.available) return;
    index++;
    if (index >= sequence.length) { replay(); return; }
    const step = sequence[index];
    api.currentMove = step;
    if (typeof step.correct === 'boolean') {
      const technique = window.DojoGame.MOVES.find(move => move.id === step.move);
      window.DojoGame.resolveAnswer(fight, { correct: step.correct, move: step.move, challengeKind: technique ? technique.kind : 'basic' });
      updateHud();
    }
    get('demo-step').textContent = String(index + 1).padStart(2, '0');
    get('demo-title').textContent = step.title;
    get('demo-caption').textContent = step.caption;
    get('demo-action').textContent = step.badge;
    get('demo-action').dataset.tone = step.tone;
    const duration = scene.play({ actor: step.actor || 'player', move: step.move, hit: step.hit !== false, combo: fight.streak });
    durations[index] = duration + step.hold;
    schedule(duration + step.hold);
  }

  function timeline() {
    if (!paused) {
      const elapsed = performance.now() - cycleStart - cyclePaused;
      get('demo-progress').style.width = Math.min(100, elapsed / totalDuration * 100) + '%';
    }
    timelineFrame = requestAnimationFrame(timeline);
  }

  function pause(automatic) {
    if (paused || !scene || !scene.available) return;
    paused = true;
    api.paused = true;
    automaticallyPaused = automatic === true;
    pausedAt = performance.now();
    pausedClock = scene.clockOffset;
    timerRemaining = Math.max(0, timerDue - pausedAt);
    clearTimeout(timer);
    cancelAnimationFrame(scene.frame);
    scene.frame = 0;
    get('pause-demo').textContent = 'Resume';
    get('pause-demo').setAttribute('aria-pressed', 'true');
  }

  function resume() {
    if (!paused || !scene || !scene.available) return;
    const now = performance.now(), pauseDuration = now - pausedAt;
    // DojoScene also compensates for time spent in a hidden browser tab.
    // Only apply the portion of our pause that it has not already shifted.
    const shift = Math.max(0, pauseDuration - (scene.clockOffset - pausedClock));
    scene.clockOffset += shift;
    if (scene.action) scene.action.start += shift;
    scene.trails.forEach(particle => { particle.time += shift; });
    cyclePaused += pauseDuration;
    paused = false;
    api.paused = false;
    automaticallyPaused = false;
    scene.lastFrame = 0;
    scene._schedule();
    get('pause-demo').textContent = 'Pause';
    get('pause-demo').setAttribute('aria-pressed', 'false');
    schedule(timerRemaining);
  }

  function replay() {
    if (!scene || !scene.available) return;
    clearTimeout(timer);
    paused = false;
    api.paused = false;
    automaticallyPaused = false;
    get('pause-demo').textContent = 'Pause';
    get('pause-demo').setAttribute('aria-pressed', 'false');
    // This ephemeral fight uses the real rules; it is never saved or completed
    // into progress. Black belt Fiona can preview every available technique.
    fight = window.DojoGame.startFight({ ...window.DojoGame.createProgress(), belt: window.DojoGame.BELTS.length - 1 }, window.DojoGame.BELTS.findIndex(belt => belt.id === 'red'));
    // Preserve this short exhibition's original 100-energy choreography. New
    // campaign bouts use the longer 150-energy match for five-answer flurries.
    fight = window.DojoGame.sanitizeFight({ ...fight, staminaVersion: 0 });
    api.fight = fight;
    scene.setFighters({ playerBelt: 'black', opponent: window.DojoGame.OPPONENTS.find(opponent => opponent.belt === 'red') });
    index = -1;
    cycleStart = performance.now();
    cyclePaused = 0;
    updateHud();
    next();
    scene._schedule();
  }

  try {
    if (!window.DojoScene || !window.DojoGame) throw new Error('The local game files could not be loaded. Reload this page to try again.');
    scene = new window.DojoScene(get('dojo-demo-canvas'), { onError: fail });
    api.scene = scene;
    if (!scene.available) return;
    // Hold the existing renderer while paused, including visibility restoration.
    const rendererSchedule = scene._schedule.bind(scene);
    scene._schedule = () => { if (!paused) rendererSchedule(); };
    get('pause-demo').addEventListener('click', () => { if (paused) resume(); else pause(false); });
    get('replay-demo').addEventListener('click', replay);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pause(true);
      else if (automaticallyPaused) resume();
    });
    replay();
    timeline();
  } catch (error) { fail(error); }
})();
