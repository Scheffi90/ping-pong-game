/* Bootstrap: input, UI screens, persistence, render loop. */
(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var overlay = document.getElementById('overlay');
  var hud = document.getElementById('hud');
  var panels = {};
  Array.prototype.forEach.call(overlay.querySelectorAll('[data-screen]'), function (el) {
    panels[el.getAttribute('data-screen')] = el;
  });

  var STORE = 'neonpong.v1';
  var prefs = load();

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORE)) || {};
    } catch (e) { return {}; }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch (e) {}
  }

  if (!prefs.difficulty) prefs.difficulty = 'normal';
  if (typeof prefs.sound !== 'boolean') prefs.sound = true;
  if (!prefs.wins) prefs.wins = 0;
  if (!prefs.losses) prefs.losses = 0;
  if (!prefs.bestRally) prefs.bestRally = 0;

  var game = new Game(canvas, {
    onHit: function (isPlayer, offset) {
      if (isPlayer) {
        Sound.paddle();
        vibrate(offset > 0.75 ? 18 : 10);
      } else {
        Sound.rival();
      }
    },
    onWall: function () { Sound.wall(); },
    onPoint: function (who) {
      if (who === 'player') { Sound.score(); vibrate(28); }
      else { Sound.lose(); vibrate([18, 40, 18]); }
    },
    onOver: function (won, score, stats) {
      if (won) { prefs.wins++; Sound.win(); vibrate([24, 60, 24, 60, 40]); }
      else { prefs.losses++; Sound.lose(); vibrate(120); }
      if (stats.rally > prefs.bestRally) prefs.bestRally = stats.rally;
      save();
      showResult(won, score, stats);
    }
  });

  function vibrate(pattern) {
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} }
  }

  /* ---------- screens ---------- */

  var current = 'menu';

  function show(name) {
    current = name;
    overlay.hidden = !name;
    Object.keys(panels).forEach(function (key) { panels[key].hidden = key !== name; });
    hud.hidden = !!name;
    if (name === 'menu') renderRecord();
  }

  function renderRecord() {
    var el = document.getElementById('record');
    var played = prefs.wins + prefs.losses;
    el.textContent = played
      ? prefs.wins + ' Siege · ' + prefs.losses + ' Niederlagen · längster Ballwechsel: ' + prefs.bestRally
      : '';
  }

  function showResult(won, score, stats) {
    var title = document.getElementById('result-title');
    title.textContent = won ? 'Gewonnen!' : 'Verloren';
    title.className = won ? 'win' : 'lose';
    document.getElementById('result-score').textContent = score.player + ' : ' + score.rival;
    document.getElementById('result-meta').textContent =
      'Längster Ballwechsel: ' + stats.rally + ' · Dauer: ' + formatTime(stats.time);
    show('gameover');
  }

  function formatTime(s) {
    var m = Math.floor(s / 60);
    var r = Math.round(s % 60);
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function startGame() {
    Sound.unlock();
    game.setDifficulty(prefs.difficulty);
    game.start();
    show(null);
  }

  /* ---------- controls ---------- */

  overlay.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    if (action === 'start' || action === 'restart') startGame();
    else if (action === 'resume') { game.resume(); show(null); }
    else if (action === 'menu') { game.state = 'idle'; show('menu'); }
  });

  var seg = document.getElementById('difficulty');
  seg.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-value]');
    if (!btn) return;
    prefs.difficulty = btn.getAttribute('data-value');
    save();
    syncDifficulty();
  });

  function syncDifficulty() {
    Array.prototype.forEach.call(seg.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-checked', String(b.getAttribute('data-value') === prefs.difficulty));
    });
  }

  var pauseBtn = document.getElementById('pause-btn');
  pauseBtn.addEventListener('click', function () {
    game.pause();
    show('paused');
  });

  var soundBtn = document.getElementById('sound-btn');
  soundBtn.addEventListener('click', function () {
    prefs.sound = !prefs.sound;
    save();
    syncSound();
    if (prefs.sound) Sound.paddle();
  });

  function syncSound() {
    Sound.setEnabled(prefs.sound);
    soundBtn.setAttribute('aria-pressed', String(prefs.sound));
  }

  // Pointer: dragging anywhere moves the paddle.
  var dragging = false;
  canvas.addEventListener('pointerdown', function (e) {
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    game.setTarget(game.toFieldX(e.clientX));
    Sound.unlock();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!dragging && e.pointerType === 'touch') return;
    game.setTarget(game.toFieldX(e.clientX));
  });
  ['pointerup', 'pointercancel'].forEach(function (type) {
    canvas.addEventListener(type, function () { dragging = false; });
  });

  var keys = {};
  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'a' || e.key === 'd') {
      keys[e.key] = true;
      e.preventDefault();
    } else if (e.key === ' ' || e.key === 'Enter') {
      if (current === 'menu') startGame();
      else if (current === 'gameover') startGame();
      else if (current === 'paused') { game.resume(); show(null); }
      e.preventDefault();
    } else if (e.key === 'Escape' || e.key === 'p') {
      if (!current) { game.pause(); show('paused'); }
    }
  });
  window.addEventListener('keyup', function (e) { keys[e.key] = false; });

  function keyboardPan(dt) {
    var dir = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0);
    if (dir) game.nudgeTarget(dir * 900 * dt);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && !current) {
      game.pause();
      show('paused');
    }
  });

  window.addEventListener('resize', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

  function resize() {
    game.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 2.5));
  }

  /* ---------- loop ---------- */

  var last = 0;
  function frame(now) {
    var dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    keyboardPan(dt);
    game.update(dt);
    game.draw();
    requestAnimationFrame(frame);
  }

  syncDifficulty();
  syncSound();
  resize();
  show('menu');
  requestAnimationFrame(frame);

  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
