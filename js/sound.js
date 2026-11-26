/* SumoBot Synthesized Arena Sound Effects (Web Audio API, zero external files) */
(function (root) {
  'use strict';
  root.SumoBot = root.SumoBot || {};

  let ctx = null;
  let muted = false;

  function ensureContext() {
    if (muted) return null;
    if (!ctx) {
      const AudioCtx = root.AudioContext || root.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(function () {});
    }
    return ctx;
  }

  function playTone(freq, startOffset, duration, type, gainPeak) {
    const c = ensureContext();
    if (!c) return;
    const now = c.currentTime + startOffset;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainPeak || 0.18, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function setMuted(isMuted) {
    muted = Boolean(isMuted);
  }

  function isMuted() {
    return muted;
  }

  function playBoutPoint() {
    playTone(587.33, 0, 0.12, 'triangle', 0.2);      // D5
    playTone(880.00, 0.09, 0.18, 'triangle', 0.22);  // A5
  }

  function playMatchWin() {
    playTone(523.25, 0, 0.14, 'triangle', 0.22);     // C5
    playTone(659.25, 0.11, 0.14, 'triangle', 0.22);  // E5
    playTone(783.99, 0.22, 0.16, 'triangle', 0.24);  // G5
    playTone(1046.50, 0.34, 0.35, 'triangle', 0.26); // C6
  }

  function playChampion() {
    const notes = [
      [523.25, 0.00, 0.14],
      [659.25, 0.12, 0.14],
      [783.99, 0.24, 0.14],
      [1046.50, 0.36, 0.26],
      [783.99, 0.62, 0.14],
      [1046.50, 0.76, 0.55]
    ];
    notes.forEach(function (n) {
      playTone(n[0], n[1], n[2], 'sawtooth', 0.12);
      playTone(n[0] * 0.5, n[1], n[2], 'triangle', 0.16);
    });
  }

  function playCountdownPip() {
    playTone(920, 0, 0.08, 'square', 0.11);
  }

  function playBuzzer() {
    const c = ensureContext();
    if (!c) return;
    const now = c.currentTime;
    // Dual-oscillator sports arena horn
    [146.83, 155.56, 293.66].forEach(function (freq) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.14, now + 0.03);
      gain.gain.setValueAtTime(0.14, now + 0.75);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.05);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(now);
      osc.stop(now + 1.08);
    });
  }

  function playEvent(eventName) {
    if (muted || !eventName) return;
    if (eventName === 'bout') playBoutPoint();
    else if (eventName === 'match') playMatchWin();
    else if (eventName === 'champion') playChampion();
    else if (eventName === 'pip') playCountdownPip();
    else if (eventName === 'buzzer') playBuzzer();
  }

  root.SumoBot.Sound = {
    setMuted: setMuted,
    isMuted: isMuted,
    playBoutPoint: playBoutPoint,
    playMatchWin: playMatchWin,
    playChampion: playChampion,
    playCountdownPip: playCountdownPip,
    playBuzzer: playBuzzer,
    playEvent: playEvent
  };
}(typeof self !== 'undefined' ? self : this));
