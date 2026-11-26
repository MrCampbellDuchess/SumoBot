/* SumoBot Read-Only Projector / Spectator Controller */
(function () {
  'use strict';

  const Engine = window.SumoBot.Engine;
  const Sync = window.SumoBot.Sync;
  const Renderer = window.SumoBot.Renderer;

  let currentState = null;
  let prevViewMode = null;
  let prevScoreSnap = null;

  const els = {
    subtitle: document.getElementById('proj-subtitle'),
    onDeck: document.getElementById('proj-ondeck'),
    stage: document.getElementById('proj-stage'),
    btnFullscreen: document.getElementById('btn-fullscreen')
  };

  function isMotionReduced(state) {
    return Boolean(state && state.fxPaused) ||
      Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  els.btnFullscreen.onclick = function () {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(function () {});
    } else {
      document.exitFullscreen().catch(function () {});
    }
  };

  function resolveViewMode(state) {
    const ov = state.projectorOverride || 'auto';
    if (ov === 'bracket') return 'bracket';
    if (ov === 'finals') return 'finals';
    if (ov === 'live') return 'live';

    // Smart Auto-Switch
    if (state.lastCelebration && !state.activeMatchRef) return 'celebration';
    if (state.activeMatchRef) return 'live';
    if (state.activeTab === 'ASF') return 'finals';
    return 'bracket';
  }

  function renderOnDeckBar(state, periodId) {
    const ready = Engine.getReadyMatches(state, periodId).filter(function (m) {
      return !(state.activeMatchRef &&
        state.activeMatchRef.period === m.period &&
        state.activeMatchRef.matchId === m.id);
    });

    if (ready.length === 0) {
      els.onDeck.style.display = 'none';
      return;
    }

    const pills = ready.slice(0, 4).map(function (m) {
      const botA = Engine.getBotById(state, m.slotA);
      const botB = Engine.getBotById(state, m.slotB);
      return `<div class="ondeck-pill"><span>${Renderer.escapeHtml(m.label)}</span>${Renderer.escapeHtml(botA ? botA.name : 'TBD')} vs ${Renderer.escapeHtml(botB ? botB.name : 'TBD')}</div>`;
    }).join('');

    els.onDeck.innerHTML = `<div class="ondeck-label">⚡ UP NEXT / ON DECK:</div>${pills}`;
    els.onDeck.style.display = 'flex';
  }

  function renderLiveBroadcast(state, popSide) {
    const ref = state.activeMatchRef;
    let m = ref ? Engine.getMatch(state, ref.period, ref.matchId) : null;
    let periodLabel = ref ? ref.period : state.activeTab;

    // Fallback when teacher forced Live view with no match selected
    if (!m) {
      const ready = Engine.getReadyMatches(state, state.activeTab);
      if (ready.length > 0) {
        m = ready[0];
        periodLabel = m.period;
      }
    }

    if (!m) {
      els.subtitle.textContent = 'LIVE MATCH ARENA';
      els.onDeck.style.display = 'none';
      els.stage.innerHTML = `
        <div class="empty-bracket">
          <div class="empty-icon">🤖</div>
          <h3>No Active Match Selected</h3>
          <p>Select a ready match on the Teacher Control Panel to launch the live scoreboard.</p>
        </div>
      `;
      return;
    }

    const botA = Engine.getBotById(state, m.slotA);
    const botB = Engine.getBotById(state, m.slotB);
    const needed = Engine.winsNeeded(m.bestOf);
    const rem = Sync.getRemainingMs(state.timer);
    const clockClass = rem <= 10000 ? 'danger' : (rem <= 30000 ? 'warn' : '');
    const titlePrefix = periodLabel === 'ASF' ? 'ALL-SCHOOL FINAL' : `PERIOD ${periodLabel.replace('P', '')}`;
    const cleanLabel = String(m.label || '').replace(/\s*\(Bo\d+\)/i, '').trim();
    const eyebrowText = periodLabel === 'ASF'
      ? `ALL-SCHOOL CHAMPIONSHIP • BEST OF ${m.bestOf}`
      : `${titlePrefix} • ${cleanLabel} • BEST OF ${m.bestOf}`;

    els.subtitle.textContent = `${titlePrefix} • LIVE MATCH`;
    renderOnDeckBar(state, periodLabel);

    const fxOk = !isMotionReduced(state);
    const popA = fxOk && popSide === 'a';
    const popB = fxOk && popSide === 'b';

    els.stage.innerHTML = `
      <div class="broadcast-live">
        <div class="broadcast-eyebrow">${Renderer.escapeHtml(eyebrowText)}</div>
        <div class="broadcast-clock ${clockClass}" id="proj-clock">${rem <= 0 && state.timer.expired ? 'TIME!' : Sync.formatTimer(rem)}</div>
        <div class="broadcast-fighters">
          <div class="broadcast-card side-a ${popA ? 'card-impact' : ''}">
            <div class="broadcast-seed">${periodLabel === 'ASF' ? 'PERIOD 2 CHAMP' : (botA && botA.seed ? 'SEED #' + botA.seed : 'BOT A')}</div>
            <div class="broadcast-name">${Renderer.escapeHtml(botA ? botA.name : 'TBD')}</div>
            <div class="broadcast-score ${popA ? 'score-pop' : ''}">${m.scoreA}</div>
            <div class="bout-pips">${Renderer.renderPips(m.scoreA, needed, popA)}</div>
          </div>

          <div class="broadcast-vs">VS</div>

          <div class="broadcast-card side-b ${popB ? 'card-impact' : ''}">
            <div class="broadcast-seed">${periodLabel === 'ASF' ? 'PERIOD 3 CHAMP' : (botB && botB.seed ? 'SEED #' + botB.seed : 'BOT B')}</div>
            <div class="broadcast-name">${Renderer.escapeHtml(botB ? botB.name : 'TBD')}</div>
            <div class="broadcast-score ${popB ? 'score-pop' : ''}">${m.scoreB}</div>
            <div class="bout-pips">${Renderer.renderPips(m.scoreB, needed, popB)}</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCelebration(state) {
    const cel = state.lastCelebration;
    els.subtitle.textContent = '🏆 CHAMPION CROWNED';
    els.onDeck.style.display = 'none';

    const colors = ['#f4ca73', '#4be1ff', '#ff7847', '#6bf0b8', '#c594ff'];
    let confetti = '';
    for (let i = 0; i < 36; i++) {
      const left = (i * 2.8) % 100;
      const delay = (i * 0.17) % 3;
      const dur = 2.6 + (i % 5) * 0.45;
      const color = colors[i % colors.length];
      confetti += `<div class="confetti-piece" style="left:${left}%;background:${color};animation-delay:${delay}s;animation-duration:${dur}s"></div>`;
    }

    els.stage.innerHTML = `
      <div class="celebration-stage">
        ${confetti}
        <div class="celebration-rings" aria-hidden="true"><span></span><span></span></div>
        <div class="celebration-trophy">🏆</div>
        <div class="celebration-title">${Renderer.escapeHtml(cel.title)}</div>
        <div class="celebration-winner">${Renderer.escapeHtml(cel.winnerName)}</div>
        ${cel.runnerUpName ? `<div class="celebration-sub">Runner-Up: ${Renderer.escapeHtml(cel.runnerUpName)}</div>` : ''}
      </div>
    `;
  }

  function render(state) {
    currentState = state;
    document.body.classList.toggle('theme-light', state.theme === 'light');
    document.body.setAttribute('data-palette', state.palette || 'indigo');
    document.body.classList.toggle('fx-paused', Boolean(state.fxPaused));

    const mode = resolveViewMode(state);
    let popSide = null;
    if (mode === 'live') {
      const ref = state.activeMatchRef;
      let m = ref ? Engine.getMatch(state, ref.period, ref.matchId) : null;
      if (!m) {
        const ready = Engine.getReadyMatches(state, state.activeTab);
        if (ready.length > 0) m = ready[0];
      }
      if (m) {
        const key = m.period + ':' + m.id;
        if (prevScoreSnap && prevScoreSnap.key === key) {
          if (m.scoreA > prevScoreSnap.scoreA) popSide = 'a';
          else if (m.scoreB > prevScoreSnap.scoreB) popSide = 'b';
        }
        prevScoreSnap = { key: key, scoreA: m.scoreA, scoreB: m.scoreB };
      } else {
        prevScoreSnap = null;
      }
    } else {
      prevScoreSnap = null;
    }

    function applyStageDom() {
      if (mode === 'celebration') {
        renderCelebration(state);
      } else if (mode === 'live') {
        renderLiveBroadcast(state, popSide);
      } else if (mode === 'finals') {
        els.subtitle.textContent = 'ALL-SCHOOL CHAMPIONSHIP • BEST OF 5';
        els.onDeck.style.display = 'none';
        els.stage.innerHTML = Renderer.renderAllSchoolFinal(state, { interactive: false });
      } else {
        const periodId = state.activeTab === 'ASF' ? 'P2' : state.activeTab;
        const period = state.periods[periodId];
        els.subtitle.textContent = `${period.name.toUpperCase()} • DOUBLE ELIMINATION`;
        renderOnDeckBar(state, periodId);
        els.stage.innerHTML = Renderer.renderPeriodBracket(state, periodId, { interactive: false });
      }
    }

    const modeChanged = prevViewMode !== null && prevViewMode !== mode;
    prevViewMode = mode;

    if (modeChanged && document.startViewTransition && !isMotionReduced(state)) {
      try {
        const vt = document.startViewTransition(applyStageDom);
        if (vt && vt.finished) {
          vt.finished.finally(function () {
            try { els.stage.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
          });
        }
        return;
      } catch (e) { /* fall through */ }
    }
    applyStageDom();
  }

  // Smooth local countdown clock loop in Projector window
  setInterval(function () {
    if (!currentState || !currentState.timer || !currentState.timer.running) return;
    const clockEl = document.getElementById('proj-clock');
    if (!clockEl) return;
    const rem = Sync.getRemainingMs(currentState.timer);
    clockEl.textContent = rem <= 0 ? 'TIME!' : Sync.formatTimer(rem);
    clockEl.classList.toggle('warn', rem > 10000 && rem <= 30000);
    clockEl.classList.toggle('danger', rem <= 10000);
  }, 100);

  const bridge = Sync.createProjectorBridge(function (newState) {
    render(newState);
  });

  bridge.requestSync();
}());
