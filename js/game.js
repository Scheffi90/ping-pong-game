/* Neon Pong — game logic and rendering on a fixed 600-wide logical field. */
(function (global) {
  'use strict';

  var FIELD_W = 600;
  var PADDLE_W = 112;
  var PADDLE_H = 16;
  var BALL_R = 11;
  var WIN_SCORE = 7;
  var MAX_SPEED = 2100; // the ball keeps gaining until someone misses
  var SUBSTEP = 8; // max logical px a ball may travel per collision substep

  /* aiSpeed: paddle travel (px/s). aiSee: how far down the field the rival may
     start tracking the ball (fraction of field height) — the real difficulty knob,
     since it decides how much time the paddle has. aiFade: how fast that sight
     shrinks as the ball speeds up. aiError: aim scatter (px). */
  var LEVELS = {
    easy:   { speed: 500, aiSpeed: 430, aiError: 80, aiLag: 0.20, aiSee: 0.40, aiFade: 1.10, label: 'Leicht' },
    normal: { speed: 560, aiSpeed: 620, aiError: 44, aiLag: 0.12, aiSee: 0.70, aiFade: 0.80, label: 'Normal' },
    hard:   { speed: 640, aiSpeed: 880, aiError: 20, aiLag: 0.06, aiSee: 1.00, aiFade: 0.45, label: 'Schwer' }
  };

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* After a long exchange both paddles start shrinking — a rally always ends. */
  function paddleWidth(rally) {
    return PADDLE_W * Math.max(0.40, 1 - Math.max(0, rally - 6) * 0.035);
  }
  function rand(a, b) { return a + Math.random() * (b - a); }

  function Game(canvas, callbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cb = callbacks || {};
    this.level = LEVELS.normal;
    this.levelKey = 'normal';

    this.H = 900;
    this.scale = 1;
    this.offX = 0;
    this.offY = 0;
    this.dpr = 1;

    this.state = 'idle'; // idle | serve | play | paused | over
    this.player = { x: FIELD_W / 2, y: 0, vx: 0 };
    this.rival = { x: FIELD_W / 2, y: 0, vx: 0 };
    this.ball = { x: FIELD_W / 2, y: 450, vx: 0, vy: 0, speed: 0 };
    this.targetX = FIELD_W / 2;

    this.score = { player: 0, rival: 0 };
    this.rally = 0;
    this.bestRally = 0;
    this.elapsed = 0;
    this.serveTimer = 0;
    this.serveDir = 1;
    this.shake = 0;
    this.flash = { side: 0, t: 0 };
    this.trail = [];
    this.particles = [];
    this.aiTarget = FIELD_W / 2;
    this.aiBias = 0;
    this.aiTimer = 0;
  }

  Game.levels = LEVELS;
  Game.WIN_SCORE = WIN_SCORE;

  Game.prototype.resize = function (cssW, cssH, dpr) {
    this.dpr = dpr;
    var idealH = FIELD_W * cssH / cssW;
    this.H = clamp(idealH, 760, 1500);
    this.scale = Math.min(cssW / FIELD_W, cssH / this.H);
    this.offX = (cssW - FIELD_W * this.scale) / 2;
    this.offY = (cssH - this.H * this.scale) / 2;

    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';

    this.player.y = this.H - 96;
    this.rival.y = 84;
    this.draw();
  };

  Game.prototype.toFieldX = function (clientX) {
    var rect = this.canvas.getBoundingClientRect();
    return (clientX - rect.left - this.offX) / this.scale;
  };

  Game.prototype.paddleW = function () { return paddleWidth(this.rally); };

  Game.prototype.setTarget = function (x) {
    var half = this.paddleW() / 2;
    this.targetX = clamp(x, half, FIELD_W - half);
  };

  Game.prototype.nudgeTarget = function (dx) {
    this.setTarget(this.targetX + dx);
  };

  Game.prototype.setDifficulty = function (key) {
    this.levelKey = LEVELS[key] ? key : 'normal';
    this.level = LEVELS[this.levelKey];
  };

  Game.prototype.start = function () {
    this.score.player = 0;
    this.score.rival = 0;
    this.rally = 0;
    this.bestRally = 0;
    this.elapsed = 0;
    this.player.x = this.rival.x = this.targetX = FIELD_W / 2;
    this.particles.length = 0;
    this.trail.length = 0;
    this.serve(Math.random() < 0.5 ? 1 : -1);
  };

  Game.prototype.serve = function (dir) {
    this.serveDir = dir; // 1 = toward player (down), -1 = toward rival (up)
    this.ball.x = FIELD_W / 2 + rand(-70, 70);
    this.ball.y = this.H / 2;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.ball.speed = this.level.speed;
    this.serveTimer = 0.9;
    this.rally = 0;
    this.trail.length = 0;
    this.state = 'serve';
  };

  Game.prototype.launch = function () {
    var angle = rand(-0.42, 0.42);
    var s = this.level.speed;
    this.ball.speed = s;
    this.ball.vx = Math.sin(angle) * s;
    this.ball.vy = Math.cos(angle) * s * this.serveDir;
    this.aiBias = rand(-this.level.aiError, this.level.aiError);
    this.state = 'play';
  };

  Game.prototype.pause = function () {
    if (this.state === 'play' || this.state === 'serve') {
      this.resumeState = this.state;
      this.state = 'paused';
    }
  };

  Game.prototype.resume = function () {
    if (this.state === 'paused') {
      this.state = this.resumeState || 'serve';
      if (this.state === 'serve') this.serveTimer = Math.max(this.serveTimer, 0.6);
    }
  };

  Game.prototype.update = function (dt) {
    if (this.state === 'idle' || this.state === 'paused' || this.state === 'over') return;

    this.elapsed += dt;
    this.shake = Math.max(0, this.shake - dt * 34);
    this.flash.t = Math.max(0, this.flash.t - dt * 2.2);
    this.movePaddles(dt);
    this.updateParticles(dt);

    if (this.state === 'serve') {
      this.serveTimer -= dt;
      if (this.serveTimer <= 0) this.launch();
      return;
    }

    var remaining = Math.hypot(this.ball.vx, this.ball.vy) * dt;
    var steps = Math.max(1, Math.ceil(remaining / SUBSTEP));
    var sdt = dt / steps;
    for (var i = 0; i < steps && this.state === 'play'; i++) this.stepBall(sdt);

    this.trail.push({ x: this.ball.x, y: this.ball.y, life: 1 });
    if (this.trail.length > 14) this.trail.shift();
    for (var j = 0; j < this.trail.length; j++) this.trail[j].life -= dt * 3.2;
  };

  Game.prototype.movePaddles = function (dt) {
    // Player follows the pointer with a hard speed cap.
    var maxStep = 3000 * dt;
    var dx = clamp(this.targetX - this.player.x, -maxStep, maxStep);
    this.player.x += dx;
    this.player.vx = dt > 0 ? dx / dt : 0;

    // Rival: predicts the landing spot, but only sees the ball once it has
    // travelled into its half, and re-aims only every aiLag seconds.
    var lvl = this.level;
    // A faster ball is read later, so long rallies eventually break the rival.
    var pace = this.ball.speed / lvl.speed;
    var see = lvl.aiSee / (1 + lvl.aiFade * Math.max(0, pace - 1));
    var incoming = this.state === 'play' && this.ball.vy < 0 && this.ball.y < this.H * see;
    this.aiTimer -= dt;
    if (this.aiTimer <= 0) {
      this.aiTimer = lvl.aiLag;
      this.aiTarget = incoming ? this.predictX() + this.aiBias : FIELD_W / 2;
    }
    var halfR = this.paddleW() / 2;
    var want = clamp(this.aiTarget, halfR, FIELD_W - halfR);
    // It only sprints for a ball it can see; otherwise it strolls back to centre.
    var rStep = lvl.aiSpeed * (incoming ? 1 : 0.55) * dt;
    var rdx = clamp(want - this.rival.x, -rStep, rStep);
    this.rival.x += rdx;
    this.rival.vx = dt > 0 ? rdx / dt : 0;
  };

  /* Where the ball will cross the rival's line, reflecting off the side walls. */
  Game.prototype.predictX = function () {
    var b = this.ball;
    if (b.vy >= 0) return FIELD_W / 2;
    var t = (this.rival.y + PADDLE_H / 2 + BALL_R - b.y) / b.vy;
    var x = b.x + b.vx * t;
    var span = FIELD_W - 2 * BALL_R;
    var m = ((x - BALL_R) % (2 * span) + 2 * span) % (2 * span);
    if (m > span) m = 2 * span - m;
    return m + BALL_R;
  };

  Game.prototype.stepBall = function (dt) {
    var b = this.ball;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (b.x < BALL_R && b.vx < 0) {
      b.x = BALL_R; b.vx = -b.vx; this.onWall(b.x, b.y);
    } else if (b.x > FIELD_W - BALL_R && b.vx > 0) {
      b.x = FIELD_W - BALL_R; b.vx = -b.vx; this.onWall(b.x, b.y);
    }

    if (b.vy > 0) this.checkPaddle(this.player, true);
    else this.checkPaddle(this.rival, false);

    if (b.y > this.H + 60) this.point('rival');
    else if (b.y < -60) this.point('player');
  };

  Game.prototype.checkPaddle = function (p, isPlayer) {
    var b = this.ball;
    var top = p.y - PADDLE_H / 2;
    var bottom = p.y + PADDLE_H / 2;
    if (b.y + BALL_R < top || b.y - BALL_R > bottom) return;
    var half = this.paddleW() / 2;
    if (Math.abs(b.x - p.x) > half + BALL_R * 0.7) return;

    var offset = clamp((b.x - p.x) / half, -1, 1);
    var speed = Math.min(b.speed * 1.075 + 14, MAX_SPEED);
    var angle = offset * 0.95;
    var dir = isPlayer ? -1 : 1;

    b.speed = speed;
    b.vx = Math.sin(angle) * speed + p.vx * 0.20;
    b.vy = Math.cos(angle) * speed * dir;

    // Renormalise, then keep enough vertical travel so rallies cannot stall.
    var mag = Math.hypot(b.vx, b.vy) || speed;
    b.vx = b.vx / mag * speed;
    b.vy = b.vy / mag * speed;
    var minVy = speed * 0.45;
    if (Math.abs(b.vy) < minVy) {
      b.vy = dir * minVy;
      var rest = Math.sqrt(Math.max(0, speed * speed - minVy * minVy));
      b.vx = (b.vx < 0 ? -1 : 1) * rest;
    }
    b.y = isPlayer ? top - BALL_R - 0.5 : bottom + BALL_R + 0.5;

    if (isPlayer) {
      // Fresh scatter for the rival on every return — a faster ball is read worse.
      var e = this.level.aiError * (0.65 + 0.55 * (speed / MAX_SPEED));
      this.aiBias = rand(-e, e);
      this.aiTimer = 0;
    }

    this.rally++;
    if (this.rally > this.bestRally) this.bestRally = this.rally;
    this.shake = isPlayer ? 4 : 3;
    this.burst(b.x, b.y, isPlayer ? '#37e8c8' : '#ff5c8a', 8);
    if (this.cb.onHit) this.cb.onHit(isPlayer, Math.abs(offset));
  };

  Game.prototype.onWall = function (x, y) {
    this.burst(x, y, '#8ea3c8', 4);
    if (this.cb.onWall) this.cb.onWall();
  };

  Game.prototype.point = function (who) {
    this.score[who]++;
    this.shake = 12;
    this.flash.side = who === 'player' ? -1 : 1;
    this.flash.t = 1;
    this.burst(this.ball.x, clamp(this.ball.y, 0, this.H), who === 'player' ? '#37e8c8' : '#ff5c8a', 22);
    if (this.cb.onPoint) this.cb.onPoint(who, this.score);

    var a = this.score.player, r = this.score.rival;
    var done = (a >= WIN_SCORE || r >= WIN_SCORE) && Math.abs(a - r) >= 2;
    if (done) {
      this.state = 'over';
      if (this.cb.onOver) this.cb.onOver(a > r, this.score, { rally: this.bestRally, time: this.elapsed });
      return;
    }
    this.serve(who === 'player' ? -1 : 1);
  };

  /* ---------- effects ---------- */

  Game.prototype.burst = function (x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = rand(60, 320);
      this.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 1, decay: rand(1.6, 3.4), color: color, size: rand(1.5, 3.6)
      });
    }
    if (this.particles.length > 220) this.particles.splice(0, this.particles.length - 220);
  };

  Game.prototype.updateParticles = function (dt) {
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= p.decay * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  };

  /* ---------- rendering ---------- */

  Game.prototype.draw = function () {
    var c = this.ctx;
    var H = this.H;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);

    var sx = this.shake ? rand(-this.shake, this.shake) : 0;
    var sy = this.shake ? rand(-this.shake, this.shake) : 0;
    c.save();
    c.translate(this.offX + sx * this.scale, this.offY + sy * this.scale);
    c.scale(this.scale, this.scale);

    // table
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d1730');
    g.addColorStop(0.5, '#0a1226');
    g.addColorStop(1, '#0d1730');
    c.fillStyle = g;
    this.roundRect(c, 0, 0, FIELD_W, H, 18);
    c.fill();

    c.strokeStyle = 'rgba(140,170,220,0.18)';
    c.lineWidth = 2;
    this.roundRect(c, 1, 1, FIELD_W - 2, H - 2, 18);
    c.stroke();

    // scores behind the play
    c.save();
    c.font = '700 150px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = 'rgba(255,92,138,0.11)';
    c.fillText(String(this.score.rival), FIELD_W / 2, H / 2 - 110);
    c.fillStyle = 'rgba(55,232,200,0.11)';
    c.fillText(String(this.score.player), FIELD_W / 2, H / 2 + 110);
    c.restore();

    // net
    c.strokeStyle = 'rgba(140,170,220,0.26)';
    c.lineWidth = 3;
    c.setLineDash([14, 14]);
    c.beginPath();
    c.moveTo(16, H / 2);
    c.lineTo(FIELD_W - 16, H / 2);
    c.stroke();
    c.setLineDash([]);

    // goal-line flash after a point
    if (this.flash.t > 0) {
      var fy = this.flash.side > 0 ? H - 3 : 3;
      c.strokeStyle = this.flash.side > 0 ? 'rgba(255,92,138,' + this.flash.t * 0.9 + ')'
                                          : 'rgba(55,232,200,' + this.flash.t * 0.9 + ')';
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(10, fy);
      c.lineTo(FIELD_W - 10, fy);
      c.stroke();
    }

    // trail
    for (var i = 0; i < this.trail.length; i++) {
      var t = this.trail[i];
      if (t.life <= 0) continue;
      c.fillStyle = 'rgba(234,242,255,' + (t.life * 0.20) + ')';
      c.beginPath();
      c.arc(t.x, t.y, BALL_R * (0.35 + 0.5 * t.life), 0, Math.PI * 2);
      c.fill();
    }

    // particles
    for (var k = 0; k < this.particles.length; k++) {
      var p = this.particles[k];
      c.globalAlpha = Math.max(0, p.life);
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;

    this.drawPaddle(c, this.rival, '#ff5c8a');
    this.drawPaddle(c, this.player, '#37e8c8');

    if (this.state !== 'idle') this.drawBall(c);

    if (this.state === 'serve') {
      var n = Math.ceil(this.serveTimer * 3.34);
      c.fillStyle = 'rgba(234,242,255,0.5)';
      c.font = '600 26px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(n > 0 ? String(n) : 'Los!', FIELD_W / 2, H / 2 - 46);
    }

    c.restore();
  };

  Game.prototype.drawPaddle = function (c, p, color) {
    c.save();
    c.shadowColor = color;
    c.shadowBlur = 22;
    c.fillStyle = color;
    var w = this.paddleW();
    this.roundRect(c, p.x - w / 2, p.y - PADDLE_H / 2, w, PADDLE_H, PADDLE_H / 2);
    c.fill();
    c.restore();
  };

  Game.prototype.drawBall = function (c) {
    var b = this.ball;
    c.save();
    c.shadowColor = 'rgba(234,242,255,0.9)';
    c.shadowBlur = 26;
    c.fillStyle = '#eaf2ff';
    c.beginPath();
    c.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
    c.fill();
    c.restore();
  };

  Game.prototype.roundRect = function (c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  };

  global.Game = Game;
})(window);
