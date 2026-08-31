/* Tiny WebAudio blip synth — no assets, unlocked on first user gesture. */
(function (global) {
  'use strict';

  var ctx = null;
  var enabled = true;

  function ensure() {
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  }

  function blip(freq, duration, type, gain) {
    if (!enabled) return;
    var ac = ensure();
    if (!ac || ac.state === 'suspended') return;
    var t = ac.currentTime;
    var osc = ac.createOscillator();
    var amp = ac.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.6), t + duration);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain || 0.18, t + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(amp).connect(ac.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  var Sound = {
    unlock: function () {
      var ac = ensure();
      if (ac && ac.state === 'suspended') ac.resume();
    },
    setEnabled: function (on) {
      enabled = !!on;
      if (enabled) Sound.unlock();
    },
    isEnabled: function () { return enabled; },
    paddle: function () { blip(420, 0.09, 'triangle', 0.20); },
    rival: function () { blip(320, 0.09, 'triangle', 0.16); },
    wall: function () { blip(240, 0.06, 'sine', 0.12); },
    score: function () { blip(680, 0.16, 'sawtooth', 0.14); },
    lose: function () { blip(180, 0.28, 'sawtooth', 0.14); },
    win: function () {
      blip(660, 0.14, 'triangle', 0.18);
      setTimeout(function () { blip(880, 0.22, 'triangle', 0.18); }, 130);
    }
  };

  global.Sound = Sound;
})(window);
