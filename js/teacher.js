/* SumoBot Teacher Control Panel Controller */
(function () {
  'use strict';

  const Engine = window.SumoBot.Engine;
  const Sound = window.SumoBot.Sound;
  const Sync = window.SumoBot.Sync;
  const Renderer = window.SumoBot.Renderer;

  let state = Sync.loadState() || Engine.createInitialState();
  // Ensure timer isn't left running across browser reloads
  if (state.timer && state.timer.running) {
    state.timer.remainingMs = Sync.getRemainingMs(state.timer);
    state.timer.running = false;
    state.timer.startedAt = null;
  }

  let undoStack = [];
  const MAX_UNDO = 40;
  let lastCountdownSec = null;
  let dragIndex = null;
  let touchMode = new URLSearchParams(window.location.search).get('mode') === 'touch';
  let lastBoutTapAt = 0;
  let lastMatchNotice = null;
  let lastScoreFx = null;

  const bridge = Sync.createTeacherBridge(function () { return state; });

  const els = {
    sidebar: document.getElementById('sidebar'),
    mainStage: document.getElementById('main-stage'),
    touchShell: document.getElementById('touch-shell'),
    modalBackdrop: document.getElementById('modal-backdrop'),
    modalCard: document.getElementById('modal-card'),
    btnLaunchProjector: document.getElementById('btn-launch-projector'),
    btnTouchMode: document.getElementById('btn-touch-mode'),
    projStatusDot: document.getElementById('proj-status-dot'),
    btnGlobalUndo: document.getElementById('btn-global-undo'),
    btnTheme: document.getElementById('btn-theme'),
    btnMute: document.getElementById('btn-mute'),
    btnFx: document.getElementById('btn-fx'),
    btnExport: document.getElementById('btn-export'),
    btnImport: document.getElementById('btn-import'),
    inputImportFile: document.getElementById('input-import-file')
  };

  function isMotionReduced() {
    return Boolean(state.fxPaused) ||
      Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function runViewTransition(updateFn, focusEl) {
    function routeFocus() {
      if (focusEl && typeof focusEl.focus === 'function') {
        try {
          focusEl.focus({ preventScroll: true });
        } catch (e) {
          focusEl.focus();
        }
      }
    }
    if (!document.startViewTransition || isMotionReduced()) {
      updateFn();
      routeFocus();
      return;
    }
    try {
      const vt = document.startViewTransition(updateFn);
      if (vt && vt.finished) {
        vt.finished.finally(routeFocus);
      }
    } catch (e) {
      updateFn();
      routeFocus();
    }
  }

  let supportsDisplayTransition;
  function canTransitionDisplay() {
    if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
    if (!window.CSS || !CSS.supports || !CSS.supports('transition-behavior', 'allow-discrete') || !document.body) {
      supportsDisplayTransition = false;
      return false;
    }
    const probe = document.createElement('div');
    probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
    document.body.appendChild(probe);
    getComputedStyle(probe).display;
    probe.style.display = 'none';
    supportsDisplayTransition = getComputedStyle(probe).display === 'block';
    probe.remove();
    return supportsDisplayTransition;
  }

  function pushUndoSnapshot() {
    undoStack.push(Sync.cloneState(state));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  }

  function applyThemeAndAudio() {
    const palette = state.palette || 'indigo';
    document.body.classList.toggle('theme-light', state.theme === 'light');
    document.body.setAttribute('data-palette', palette);
    document.body.classList.toggle('fx-paused', Boolean(state.fxPaused));
    document.querySelectorAll('.palette-dot').forEach(function (dot) {
      dot.classList.toggle('active', dot.getAttribute('data-palette') === palette);
    });
    els.btnTheme.textContent = state.theme === 'light' ? '🌙' : '☀️';
    Sound.setMuted(state.muted);
    els.btnMute.textContent = state.muted ? '🔇' : '🔊';
    if (els.btnFx) {
      els.btnFx.setAttribute('aria-pressed', state.fxPaused ? 'false' : 'true');
      els.btnFx.classList.toggle('is-paused', Boolean(state.fxPaused));
    }
  }

  function commit(soundEvent) {
    state.updatedAt = Date.now();
    applyThemeAndAudio();
    if (soundEvent) Sound.playEvent(soundEvent);
    bridge.broadcast(state, soundEvent || null);
    render();
  }

  function resetTimer(autoBroadcast) {
    state.timer = {
      durationSec: 120,
      remainingMs: 120000,
      running: false,
      startedAt: null,
      expired: false
    };
    lastCountdownSec = null;
    if (autoBroadcast !== false) commit(null);
  }

  function toggleTimer() {
    const t = state.timer;
    if (t.running) {
      t.remainingMs = Sync.getRemainingMs(t);
      t.running = false;
      t.startedAt = null;
    } else {
      if (t.remainingMs <= 0) {
        t.remainingMs = t.durationSec * 1000;
        t.expired = false;
      }
      t.running = true;
      t.startedAt = Date.now();
      lastCountdownSec = Math.ceil(t.remainingMs / 1000);
    }
    commit(null);
  }

  // Smooth timer tick loop (updates teacher clock + fires 5s pips & 0:00 buzzer)
  setInterval(function () {
    const t = state.timer;
    if (!t || !t.running) return;
    const rem = Sync.getRemainingMs(t);
    const sec = Math.ceil(rem / 1000);

    const digitsEl = document.getElementById('teacher-timer-digits');
    const boxEl = document.getElementById('teacher-timer-box');
    if (digitsEl) digitsEl.textContent = Sync.formatTimer(rem);
    if (boxEl) {
      boxEl.classList.toggle('warn', rem > 10000 && rem <= 30000);
      boxEl.classList.toggle('danger', rem <= 10000);
    }

    const touchDigitsEl = document.getElementById('touch-timer-digits');
    const touchBoxEl = document.getElementById('touch-timer-box');
    if (touchDigitsEl) touchDigitsEl.textContent = rem <= 0 ? 'TIME!' : Sync.formatTimer(rem);
    if (touchBoxEl) {
      touchBoxEl.classList.toggle('warn', rem > 10000 && rem <= 30000);
      touchBoxEl.classList.toggle('danger', rem <= 10000);
    }

    if (sec !== lastCountdownSec) {
      lastCountdownSec = sec;
      if (sec <= 5 && sec >= 1) {
        Sound.playCountdownPip();
      }
    }

    if (rem <= 0) {
      t.remainingMs = 0;
      t.running = false;
      t.startedAt = null;
      t.expired = true;
      commit('buzzer');
    }
  }, 100);

  function addBotName(periodId, rawName) {
    const name = String(rawName || '').trim();
    if (!name) return;
    const period = state.periods[periodId];
    const id = `${periodId.toLowerCase()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    period.bots.push({ id: id, name: name, seed: period.bots.length + 1 });
    reindexSeeds(period.bots);
  }

  function reindexSeeds(bots) {
    bots.forEach(function (b, idx) { b.seed = idx + 1; });
  }

  function startMatch(period, matchId) {
    const m = Engine.getMatch(state, period, matchId);
    if (!m) return;
    if (m.status === 'completed') {
      openEditMatchModal(period, matchId);
      return;
    }
    if (m.status !== 'ready' && m.status !== 'in_progress') return;

    const isSame = state.activeMatchRef &&
      state.activeMatchRef.period === period &&
      state.activeMatchRef.matchId === matchId;

    state.activeMatchRef = { period: period, matchId: matchId };
    state.lastCelebration = null;
    lastMatchNotice = null;
    if (!isSame) resetTimer(false);
    commit(null);
  }

  function closeLiveMatch() {
    state.activeMatchRef = null;
    resetTimer(false);
    commit(null);
  }

  function scoreBout(side) {
    const ref = state.activeMatchRef;
    if (!ref) return;
    pushUndoSnapshot();
    const res = Engine.recordBoutWin(state, ref.period, ref.matchId, side);
    // Pause & reset timer cleanly between rounds
    resetTimer(false);
    lastScoreFx = { matchKey: ref.period + ':' + ref.matchId, side: side, at: Date.now() };

    if (res.matchJustFinished) {
      const winBot = Engine.getBotById(state, res.match.winner);
      lastMatchNotice = {
        label: res.match.label,
        winnerName: winBot ? winBot.name : 'Winner',
        scoreText: `${res.match.scoreA}–${res.match.scoreB}`
      };
    } else {
      lastMatchNotice = null;
    }

    if (res.tournamentJustFinished) {
      state.activeMatchRef = null;
      commit('champion');
    } else if (res.matchJustFinished) {
      state.activeMatchRef = null;
      commit('match');
    } else {
      commit('bout');
    }
  }

  function undoLiveMatchBout() {
    const ref = state.activeMatchRef;
    if (!ref) return;
    const m = Engine.getMatch(state, ref.period, ref.matchId);
    if (!m || m.bouts.length === 0) return;
    pushUndoSnapshot();
    const res = Engine.undoLastBout(state, ref.period, ref.matchId);
    if (res.ok) commit(null);
  }

  function performGlobalUndo() {
    if (undoStack.length === 0) return;
    state = undoStack.pop();
    lastMatchNotice = null;
    if (state.timer) {
      state.timer.running = false;
      state.timer.startedAt = null;
    }
    commit(null);
  }

  function setTouchMode(enabled) {
    const next = Boolean(enabled);
    if (next === touchMode) return;
    const focusTarget = next ? els.touchShell : els.mainStage;
    runViewTransition(function () {
      touchMode = next;
      document.body.classList.toggle('touch-mode-active', touchMode);
      if (els.touchShell) els.touchShell.classList.toggle('hidden', !touchMode);
      render();
    }, focusTarget);
  }

  function openModal(html) {
    els.modalBackdrop.removeAttribute('data-closing');
    els.modalCard.innerHTML = html;
    els.modalBackdrop.classList.remove('hidden');
  }

  async function closeModal() {
    if (els.modalBackdrop.classList.contains('hidden')) return;
    if (isMotionReduced()) {
      els.modalBackdrop.removeAttribute('data-closing');
      els.modalBackdrop.classList.add('hidden');
      els.modalCard.innerHTML = '';
      return;
    }
    els.modalBackdrop.setAttribute('data-closing', '');
    if (canTransitionDisplay()) {
      els.modalBackdrop.classList.add('hidden');
    }
    const anims = [];
    if (typeof els.modalCard.getAnimations === 'function') {
      anims.push.apply(anims, els.modalCard.getAnimations());
    }
    if (typeof els.modalBackdrop.getAnimations === 'function') {
      anims.push.apply(anims, els.modalBackdrop.getAnimations());
    }
    if (anims.length > 0) {
      await Promise.race([
        Promise.allSettled(anims.map(function (a) { return a.finished; })),
        new Promise(function (resolve) { setTimeout(resolve, 350); })
      ]);
    }
    if (els.modalBackdrop.hasAttribute('data-closing')) {
      els.modalBackdrop.removeAttribute('data-closing');
      els.modalBackdrop.classList.add('hidden');
      els.modalCard.innerHTML = '';
    }
  }

  function openEditMatchModal(period, matchId) {
    const m = Engine.getMatch(state, period, matchId);
    if (!m) return;
    const botA = Engine.getBotById(state, m.slotA);
    const botB = Engine.getBotById(state, m.slotB);
    const affected = Engine.getDownstreamAffectedMatches(state, period, matchId);

    const warnHtml = affected.length > 0 ? `
      <div class="warn-box">
        <strong>⚠️ Warning: ${affected.length} downstream match${affected.length === 1 ? '' : 'es'} already started or finished!</strong>
        <p style="margin:6px 0 4px">Re-opening this match will clear and reset these downstream matches:</p>
        <ul>
          ${affected.map(function (a) {
            return `<li><strong>${Renderer.escapeHtml(a.period)} — ${Renderer.escapeHtml(a.label)}</strong> (${a.status})</li>`;
          }).join('')}
        </ul>
      </div>
    ` : `<p style="margin:0;color:var(--text-muted)">No downstream matches have started yet, so editing this result is completely safe.</p>`;

    openModal(`
      <h3 class="modal-title">Edit Completed Match: ${Renderer.escapeHtml(m.label)}</h3>
      <div class="panel-card" style="padding:10px 12px">
        <div style="display:flex;justify-content:space-between;font-weight:700">
          <span>${Renderer.escapeHtml(botA ? botA.name : 'TBD')}</span>
          <span>${m.scoreA} &ndash; ${m.scoreB}</span>
          <span>${Renderer.escapeHtml(botB ? botB.name : 'TBD')}</span>
        </div>
      </div>
      ${warnHtml}
      <div class="btn-row">
        ${affected.length === 0 ? `<button class="btn btn-primary" id="modal-undo-last">↩ Undo Winning Bout</button>` : ''}
        <button class="btn btn-danger" id="modal-reopen-reset">🔄 Reset &amp; Re-Play Match</button>
        <button class="btn" id="modal-cancel">Cancel</button>
      </div>
    `);

    const btnUndoLast = document.getElementById('modal-undo-last');
    if (btnUndoLast) {
      btnUndoLast.onclick = function () {
        pushUndoSnapshot();
        Engine.undoLastBout(state, period, matchId);
        state.activeMatchRef = { period: period, matchId: matchId };
        resetTimer(false);
        closeModal();
        commit(null);
      };
    }

    document.getElementById('modal-reopen-reset').onclick = function () {
      pushUndoSnapshot();
      Engine.clearDownstreamFromMatch(state, period, matchId, true);
      state.activeMatchRef = { period: period, matchId: matchId };
      resetTimer(false);
      closeModal();
      commit(null);
    };

    document.getElementById('modal-cancel').onclick = closeModal;
  }

  function openRenameBotsModal(periodId) {
    const period = state.periods[periodId];
    const rows = period.bots.map(function (b, idx) {
      return `
        <div class="inline-form" style="align-items:center">
          <span class="seed-badge">#${idx + 1}</span>
          <input class="input rename-bot-input" data-bot-id="${Renderer.escapeHtml(b.id)}" value="${Renderer.escapeHtml(b.name)}">
        </div>
      `;
    }).join('');

    openModal(`
      <h3 class="modal-title">Edit ${Renderer.escapeHtml(period.name)} Bot Names</h3>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:55vh;overflow-y:auto">
        ${rows}
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" id="modal-save-names">Save Names</button>
        <button class="btn" id="modal-cancel">Cancel</button>
      </div>
    `);

    document.getElementById('modal-save-names').onclick = function () {
      pushUndoSnapshot();
      els.modalCard.querySelectorAll('.rename-bot-input').forEach(function (inp) {
        const id = inp.getAttribute('data-bot-id');
        const bot = period.bots.find(function (b) { return b.id === id; });
        const val = inp.value.trim();
        if (bot && val) bot.name = val;
      });
      closeModal();
      commit(null);
    };
    document.getElementById('modal-cancel').onclick = closeModal;
  }

  function renderTabs() {
    ['P2', 'P3', 'ASF'].forEach(function (tab) {
      const btn = document.getElementById('tab-' + tab);
      if (btn) btn.classList.toggle('active', state.activeTab === tab);
    });

    ['P2', 'P3'].forEach(function (p) {
      const pill = document.getElementById('pill-' + p);
      const period = state.periods[p];
      if (!period.bracket) {
        pill.textContent = `${period.bots.length} bots`;
      } else if (period.bracket.championId) {
        pill.textContent = '🏆 Done';
      } else {
        const st = Engine.getPeriodStats(period.bracket);
        pill.textContent = `${st.completed}/${st.total}`;
      }
    });

    const asfPill = document.getElementById('pill-ASF');
    if (state.allSchoolFinal.status === 'completed') asfPill.textContent = '🏆 Crowned';
    else if (state.allSchoolFinal.status === 'ready' || state.allSchoolFinal.status === 'in_progress') asfPill.textContent = 'READY';
    else asfPill.textContent = 'Bo5';

    document.querySelectorAll('.override-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-override') === state.projectorOverride);
    });

    els.btnGlobalUndo.disabled = undoStack.length === 0;
  }

  function getActiveScoreFxSide(period, matchId) {
    if (!lastScoreFx || isMotionReduced()) return null;
    if (lastScoreFx.matchKey !== period + ':' + matchId) return null;
    if (Date.now() - lastScoreFx.at > 650) {
      lastScoreFx = null;
      return null;
    }
    return lastScoreFx.side;
  }

  function renderLiveMatchPanel() {
    const ref = state.activeMatchRef;
    if (!ref) return '';
    const m = Engine.getMatch(state, ref.period, ref.matchId);
    if (!m) return '';
    const botA = Engine.getBotById(state, m.slotA);
    const botB = Engine.getBotById(state, m.slotB);
    const needed = Engine.winsNeeded(m.bestOf);
    const rem = Sync.getRemainingMs(state.timer);
    const timerClass = rem <= 10000 ? 'danger' : (rem <= 30000 ? 'warn' : '');
    const fxSide = getActiveScoreFxSide(ref.period, ref.matchId);
    const popA = fxSide === 'a';
    const popB = fxSide === 'b';

    return `
      <div class="panel-card live-panel">
        <div class="live-header">
          <div>
            <div style="font-size:0.72rem;font-weight:800;color:var(--accent-a);letter-spacing:0.08em">
              ⚡ LIVE MATCH &bull; ${Renderer.escapeHtml(ref.period)} &bull; BEST OF ${m.bestOf}
            </div>
            <div class="live-match-name">${Renderer.escapeHtml(m.label)}</div>
          </div>
          <button class="btn btn-sm" id="btn-close-live" title="Return projector to Bracket">✕ Close</button>
        </div>

        <div class="timer-box ${timerClass}" id="teacher-timer-box">
          <div style="font-size:0.7rem;font-weight:800;letter-spacing:0.08em;color:var(--text-muted)">2-MINUTE ROUND TIMER</div>
          <div class="timer-digits" id="teacher-timer-digits">${Sync.formatTimer(rem)}</div>
          <div class="timer-controls">
            <button class="btn btn-primary btn-sm" id="btn-timer-toggle">${state.timer.running ? '⏸ Pause' : '▶ Start'}</button>
            <button class="btn btn-sm" id="btn-timer-reset">↺ Reset 2:00</button>
          </div>
        </div>

        <button class="bout-btn side-a ${popA ? 'card-impact' : ''}" id="btn-win-a" ${m.status === 'completed' ? 'disabled' : ''}>
          <div>
            <div class="bout-bot-name">${Renderer.escapeHtml(botA ? botA.name : 'TBD')}</div>
            <div class="bout-bot-sub">Tap to award round win (first to ${needed})</div>
          </div>
          <div class="bout-score-box">
            <div class="bout-score-num ${popA ? 'score-pop' : ''}">${m.scoreA}</div>
            <div class="bout-pips">${Renderer.renderPips(m.scoreA, needed, popA)}</div>
          </div>
        </button>

        <button class="bout-btn side-b ${popB ? 'card-impact' : ''}" id="btn-win-b" ${m.status === 'completed' ? 'disabled' : ''}>
          <div>
            <div class="bout-bot-name">${Renderer.escapeHtml(botB ? botB.name : 'TBD')}</div>
            <div class="bout-bot-sub">Tap to award round win (first to ${needed})</div>
          </div>
          <div class="bout-score-box">
            <div class="bout-score-num ${popB ? 'score-pop' : ''}">${m.scoreB}</div>
            <div class="bout-pips">${Renderer.renderPips(m.scoreB, needed, popB)}</div>
          </div>
        </button>

        <div class="btn-row">
          <button class="btn btn-sm" id="btn-undo-bout" ${m.bouts.length === 0 ? 'disabled' : ''}>↩ Undo Bout</button>
        </div>
      </div>
    `;
  }

  function renderRosterSetup(periodId) {
    const period = state.periods[periodId];
    const count = period.bots.length;
    const bracketSize = count >= 2 ? Engine.nextPowerOfTwo(count) : 0;
    const byeCount = count >= 2 ? bracketSize - count : 0;

    const listHtml = period.bots.map(function (b, idx) {
      return `
        <div class="roster-item" draggable="true" data-index="${idx}">
          <span class="seed-badge">#${idx + 1}</span>
          <span class="roster-name">${Renderer.escapeHtml(b.name)}</span>
          <div class="roster-actions">
            <button class="mini-btn btn-move-up" data-index="${idx}" title="Move seed up">▲</button>
            <button class="mini-btn btn-move-down" data-index="${idx}" title="Move seed down">▼</button>
            <button class="mini-btn btn-del-bot" data-index="${idx}" title="Remove bot">✕</button>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="panel-card">
        <div class="panel-title">
          <span>${Renderer.escapeHtml(period.name)} Roster</span>
          <span>${count} bot${count === 1 ? '' : 's'}</span>
        </div>

        <form class="inline-form" id="form-add-bot">
          <input class="input" id="input-bot-name" placeholder="Add bot name..." autocomplete="off">
          <button class="btn btn-primary btn-sm" type="submit">+ Add</button>
        </form>

        <details ${count === 0 ? 'open' : ''}>
          <summary style="cursor:pointer;font-size:0.82rem;color:var(--text-muted);font-weight:600;margin-bottom:6px">
            📋 Bulk Paste Bot Names (one per line)
          </summary>
          <textarea class="textarea" id="textarea-bulk" placeholder="Destroyer&#10;Wedge Master&#10;Dozer 3000&#10;FlipBot"></textarea>
          <div class="btn-row" style="margin-top:6px">
            <button class="btn btn-sm" id="btn-bulk-add" type="button">Add All Lines</button>
            <button class="btn btn-sm" id="btn-sample-bots" type="button">Load 10 Sample Bots</button>
          </div>
        </details>

        ${count > 0 ? `
          <div style="font-size:0.75rem;color:var(--text-muted)">Drag rows (or use ▲/▼) to adjust seeding order:</div>
          <div class="roster-list" id="roster-list">${listHtml}</div>
        ` : ''}

        <div class="roster-footer">
          <div class="roster-summary">
            ${count < 2
              ? 'Add at least 2 bots to generate a double-elimination bracket.'
              : `${bracketSize}-slot bracket (${byeCount} automatic Round 1 bye${byeCount === 1 ? '' : 's'} for top seeds).`}
          </div>
          <div class="btn-row">
            <button class="btn btn-sm" id="btn-shuffle-seeds" ${count < 2 ? 'disabled' : ''}>🔀 Shuffle Seeds</button>
            <button class="btn btn-sm btn-danger" id="btn-clear-roster" ${count === 0 ? 'disabled' : ''}>Clear</button>
          </div>
          <button class="btn btn-primary" id="btn-generate-bracket" ${count < 2 ? 'disabled' : ''}>
            🚀 Generate ${Renderer.escapeHtml(periodId)} Bracket
          </button>
        </div>
      </div>
    `;
  }

  function renderReadyQueue(periodId) {
    const ready = Engine.getReadyMatches(state, periodId);
    const activeRef = state.activeMatchRef;

    const itemsHtml = ready.map(function (m) {
      const botA = Engine.getBotById(state, m.slotA);
      const botB = Engine.getBotById(state, m.slotB);
      const isActive = activeRef && activeRef.period === m.period && activeRef.matchId === m.id;
      const scoreText = m.status === 'in_progress' ? ` (${m.scoreA}–${m.scoreB})` : '';
      return `
        <button class="queue-item ${isActive ? 'is-active' : ''}" data-period="${Renderer.escapeHtml(m.period)}" data-match-id="${Renderer.escapeHtml(m.id)}">
          <div class="queue-top">
            <strong>${Renderer.escapeHtml(m.label)}${scoreText}</strong>
            <span>Bo${m.bestOf}</span>
          </div>
          <div class="queue-matchup">
            <span>${Renderer.escapeHtml(botA ? botA.name : 'TBD')}</span>
            <span class="queue-vs">vs</span>
            <span>${Renderer.escapeHtml(botB ? botB.name : 'TBD')}</span>
          </div>
        </button>
      `;
    }).join('');

    const period = state.periods[periodId];
    const bracket = period && period.bracket;
    const champBot = bracket ? Engine.getBotById(state, bracket.championId) : null;

    return `
      <div class="panel-card">
        <div class="panel-title">
          <span>Up Next / Ready Matches</span>
          <span>${ready.length} ready</span>
        </div>
        ${ready.length > 0
          ? `<div class="queue-list">${itemsHtml}</div>`
          : `<div style="font-size:0.84rem;color:var(--text-muted)">
              ${champBot
                ? `🏆 ${Renderer.escapeHtml(periodId)} complete! Winner: <strong>${Renderer.escapeHtml(champBot.name)}</strong>.`
                : 'No ready matches right now.'}
             </div>`
        }
      </div>
      ${periodId !== 'ASF' ? `
      <div class="panel-card">
        <div class="panel-title"><span>${Renderer.escapeHtml(periodId)} Controls</span></div>
        <div class="btn-row">
          <button class="btn btn-sm" id="btn-rename-bots">✏️ Edit Bot Names</button>
          <button class="btn btn-sm btn-danger" id="btn-reset-bracket">↺ Reset Bracket</button>
        </div>
        ${state.lastCelebration ? `<button class="btn btn-sm" id="btn-dismiss-celebration">Dismiss Projector Celebration</button>` : ''}
      </div>
      ` : (state.lastCelebration ? `
      <div class="panel-card">
        <button class="btn btn-sm" id="btn-dismiss-celebration">Dismiss Projector Celebration</button>
      </div>
      ` : '')}
    `;
  }

  function renderTouchMatchPicker() {
    const tab = state.activeTab;
    let html = '';

    if (lastMatchNotice) {
      html += `
        <div class="touch-result-banner" role="status">
          <div class="touch-banner-text">✅ <strong>${Renderer.escapeHtml(lastMatchNotice.winnerName)}</strong> won ${Renderer.escapeHtml(lastMatchNotice.label)} (${Renderer.escapeHtml(lastMatchNotice.scoreText)})</div>
          <div class="touch-banner-actions">
            <button class="btn btn-secondary" id="touch-undo-global" ${undoStack.length === 0 ? 'disabled' : ''}>↩ Undo Result</button>
            <button class="btn btn-icon" id="touch-dismiss-notice" aria-label="Dismiss result notice">✕</button>
          </div>
        </div>
      `;
    }

    if (state.lastCelebration) {
      html += `
        <div class="touch-celebration-banner" role="status">
          <div class="touch-banner-text">🏆 <strong>${Renderer.escapeHtml(state.lastCelebration.title)}</strong>: ${Renderer.escapeHtml(state.lastCelebration.winnerName)}</div>
          <div class="touch-banner-actions">
            ${state.allSchoolFinal.status === 'ready' ? '<button class="btn btn-gold" id="touch-launch-asf">🏆 Launch All-School Final</button>' : ''}
            <button class="btn" id="touch-dismiss-celebration">Dismiss Celebration</button>
          </div>
        </div>
      `;
    }

    if (tab !== 'ASF' && !state.periods[tab].bracket) {
      return html + `
        <div class="touch-empty-card">
          <h3>${Renderer.escapeHtml(state.periods[tab].name)} Bracket Not Started</h3>
          <p>Add bots and generate the bracket in the Roster view before scoring matches.</p>
          <button class="btn btn-primary btn-lg" id="touch-open-roster">← Open Roster Setup</button>
        </div>
      `;
    }

    const ready = Engine.getReadyMatches(state, tab);
    if (ready.length > 0) {
      const cards = ready.map(function (m) {
        const botA = Engine.getBotById(state, m.slotA);
        const botB = Engine.getBotById(state, m.slotB);
        const isLive = m.status === 'in_progress';
        const statusBadge = isLive
          ? `<span class="match-badge badge-progress">IN PROGRESS ${m.scoreA}–${m.scoreB}</span>`
          : '<span class="match-badge badge-ready">READY</span>';
        return `
          <button class="touch-queue-card" data-touch-period="${Renderer.escapeHtml(m.period)}" data-touch-match-id="${Renderer.escapeHtml(m.id)}">
            <div class="touch-queue-meta">
              <span class="touch-queue-label">${Renderer.escapeHtml(m.label)}</span>
              <span class="match-badges">
                <span class="match-bo">Bo${m.bestOf}</span>
                ${statusBadge}
              </span>
            </div>
            <div class="touch-queue-matchup">
              <span>${Renderer.escapeHtml(botA ? botA.name : 'TBD')}</span>
              <span class="queue-vs">vs</span>
              <span>${Renderer.escapeHtml(botB ? botB.name : 'TBD')}</span>
            </div>
          </button>
        `;
      }).join('');

      return html + `
        <div class="touch-picker-header">
          <h2>Ready Matches (${ready.length})</h2>
          <span>Tap any match to start scoring</span>
        </div>
        <div class="touch-queue-grid">${cards}</div>
      `;
    }

    if (tab === 'ASF') {
      const asf = state.allSchoolFinal;
      const champ = Engine.getBotById(state, asf.winner);
      if (asf.status === 'completed' && champ) {
        return html + `
          <div class="touch-empty-card">
            <h3>🏆 All-School Champion: ${Renderer.escapeHtml(champ.name)}</h3>
            <p>Both periods and the All-School Championship are complete.</p>
            <button class="btn btn-secondary btn-lg" id="touch-exit-empty">← Back to Bracket</button>
          </div>
        `;
      }
      const p2Ready = Engine.getReadyMatches(state, 'P2').length;
      const p3Ready = Engine.getReadyMatches(state, 'P3').length;
      return html + `
        <div class="touch-empty-card">
          <h3>Waiting for Period Champions</h3>
          <p>Finish both Period 2 and Period 3 brackets to unlock the All-School Final.</p>
          <div class="touch-banner-actions">
            ${p2Ready > 0 ? '<button class="btn btn-primary" id="touch-jump-p2">Go to Period 2</button>' : ''}
            ${p3Ready > 0 ? '<button class="btn btn-primary" id="touch-jump-p3">Go to Period 3</button>' : ''}
            <button class="btn btn-secondary" id="touch-exit-empty">← Back to Bracket</button>
          </div>
        </div>
      `;
    }

    const bracket = state.periods[tab].bracket;
    const champBot = bracket ? Engine.getBotById(state, bracket.championId) : null;
    const otherPeriod = tab === 'P2' ? 'P3' : 'P2';
    const otherReady = Engine.getReadyMatches(state, otherPeriod).length;
    const asfReady = state.allSchoolFinal.status === 'ready' || state.allSchoolFinal.status === 'in_progress';
    return html + `
      <div class="touch-empty-card">
        <h3>${champBot ? `🏆 ${Renderer.escapeHtml(tab)} Champion: ${Renderer.escapeHtml(champBot.name)}` : 'No Ready Matches'}</h3>
        <p>${champBot ? `${Renderer.escapeHtml(state.periods[tab].name)} is complete.` : 'No playable matches right now.'}</p>
        <div class="touch-banner-actions">
          ${otherReady > 0 ? `<button class="btn btn-primary" id="touch-jump-other" data-target-tab="${otherPeriod}">Go to ${otherPeriod} (${otherReady} ready)</button>` : ''}
          ${asfReady ? '<button class="btn btn-gold" id="touch-jump-asf">🏆 Go to All-School Final</button>' : ''}
          <button class="btn btn-secondary" id="touch-exit-empty">← Back to Bracket</button>
        </div>
      </div>
    `;
  }

  function renderTouchLiveMatch(m, ref) {
    const botA = Engine.getBotById(state, m.slotA);
    const botB = Engine.getBotById(state, m.slotB);
    const needed = Engine.winsNeeded(m.bestOf);
    const rem = Sync.getRemainingMs(state.timer);
    const timerClass = rem <= 10000 ? 'danger' : (rem <= 30000 ? 'warn' : '');
    const cleanLabel = String(m.label || '').replace(/\s*\(Bo\d+\)/i, '').trim();
    const seedA = ref.period === 'ASF' ? 'PERIOD 2 CHAMP' : (botA && botA.seed ? 'SEED #' + botA.seed : 'BOT A');
    const seedB = ref.period === 'ASF' ? 'PERIOD 3 CHAMP' : (botB && botB.seed ? 'SEED #' + botB.seed : 'BOT B');
    const mpA = m.scoreA + 1 >= needed;
    const mpB = m.scoreB + 1 >= needed;
    const fxSide = getActiveScoreFxSide(ref.period, ref.matchId);
    const popA = fxSide === 'a';
    const popB = fxSide === 'b';

    return `
      <div class="touch-match-pill">${Renderer.escapeHtml(ref.period === 'ASF' ? 'ALL-SCHOOL FINAL' : ref.period)} &bull; ${Renderer.escapeHtml(cleanLabel || m.label)} &bull; FIRST TO ${needed}</div>

      <div class="touch-timer-bar ${timerClass}" id="touch-timer-box">
        <button type="button" class="touch-timer-readout" id="touch-timer-readout" aria-label="Toggle round timer">
          <span class="touch-timer-label">ROUND TIMER</span>
          <span class="touch-timer-digits" id="touch-timer-digits">${rem <= 0 && state.timer.expired ? 'TIME!' : Sync.formatTimer(rem)}</span>
        </button>
        <div class="touch-timer-actions">
          <button class="btn btn-primary touch-timer-btn" id="touch-timer-toggle">${state.timer.running ? '⏸ Pause' : '▶ Start'}</button>
          <button class="btn touch-timer-btn" id="touch-timer-reset">↺ 2:00</button>
        </div>
      </div>

      <div class="touch-pads">
        <button type="button" class="touch-pad side-a ${popA ? 'card-impact' : ''}" id="touch-win-a" ${m.status === 'completed' ? 'disabled' : ''}>
          <span class="touch-pad-tag">${Renderer.escapeHtml(seedA)}</span>
          <span class="touch-bot-name">${Renderer.escapeHtml(botA ? botA.name : 'TBD')}</span>
          <span class="touch-score ${popA ? 'score-pop' : ''}">${m.scoreA}</span>
          <span class="bout-pips">${Renderer.renderPips(m.scoreA, needed, popA)}</span>
          <span class="touch-cta-pill ${mpA ? 'is-match-point' : ''}">${mpA ? '🏆 TAP TO WIN MATCH' : '+1 ROUND WIN'}</span>
        </button>

        <button type="button" class="touch-pad side-b ${popB ? 'card-impact' : ''}" id="touch-win-b" ${m.status === 'completed' ? 'disabled' : ''}>
          <span class="touch-pad-tag">${Renderer.escapeHtml(seedB)}</span>
          <span class="touch-bot-name">${Renderer.escapeHtml(botB ? botB.name : 'TBD')}</span>
          <span class="touch-score ${popB ? 'score-pop' : ''}">${m.scoreB}</span>
          <span class="bout-pips">${Renderer.renderPips(m.scoreB, needed, popB)}</span>
          <span class="touch-cta-pill ${mpB ? 'is-match-point' : ''}">${mpB ? '🏆 TAP TO WIN MATCH' : '+1 ROUND WIN'}</span>
        </button>
      </div>
    `;
  }

  function renderTouchBottomBar(m) {
    const botA = Engine.getBotById(state, m.slotA);
    const botB = Engine.getBotById(state, m.slotB);
    const historyHtml = m.bouts.length > 0
      ? m.bouts.map(function (side, idx) {
          const b = side === 'a' ? botA : botB;
          return `<span class="touch-bout-chip">R${idx + 1}: ${Renderer.escapeHtml(b ? b.name : side.toUpperCase())}</span>`;
        }).join('')
      : '<span class="touch-hint">Tap the winning bot\'s card after each round</span>';

    return `
      <div class="touch-bottom-bar">
        <button class="btn btn-secondary" id="touch-undo-bout" ${m.bouts.length === 0 ? 'disabled' : ''}>↩ Undo Bout</button>
        <div class="touch-bout-history">${historyHtml}</div>
        <button class="btn" id="touch-close-live">✕ Back to Matches</button>
      </div>
    `;
  }

  function renderTouchShell() {
    if (!els.touchShell) return;
    const ref = state.activeMatchRef;
    const activeMatch = ref ? Engine.getMatch(state, ref.period, ref.matchId) : null;
    const activeTab = activeMatch ? ref.period : state.activeTab;

    const tabsHtml = [
      { id: 'P2', label: 'P2' },
      { id: 'P3', label: 'P3' },
      { id: 'ASF', label: 'Finals' }
    ].map(function (t) {
      const count = Engine.getReadyMatches(state, t.id).length;
      const pill = count > 0
        ? `<span class="tab-pill">${t.id === 'ASF' ? 'READY' : count}</span>`
        : '';
      return `<button class="tab-btn ${activeTab === t.id ? 'active' : ''} ${t.id === 'ASF' ? 'tab-asf' : ''}" data-touch-tab="${t.id}">${t.label} ${pill}</button>`;
    }).join('');

    els.touchShell.innerHTML = `
      <header class="touch-topbar">
        <button class="btn btn-secondary touch-nav-btn" id="touch-exit">← Bracket</button>
        <nav class="period-tabs touch-period-tabs" aria-label="Touch Mode Period Switcher">
          ${tabsHtml}
        </nav>
        <div class="touch-topbar-right">
          ${activeMatch ? '<button class="btn touch-nav-btn" id="touch-show-queue">Matches</button>' : ''}
          <button class="btn btn-sm ${state.fxPaused ? 'is-paused' : ''}" id="touch-fx" aria-pressed="${state.fxPaused ? 'false' : 'true'}" title="Toggle ambient animations (stars &amp; gears)">✨ FX</button>
          <button class="btn btn-icon touch-icon-btn" id="touch-mute" aria-label="Toggle sound effects" title="Toggle Sound Effects"><span aria-hidden="true">${state.muted ? '🔇' : '🔊'}</span></button>
          <button class="btn btn-icon touch-icon-btn" id="touch-theme" aria-label="Toggle dark or light theme" title="Toggle Dark/Light theme"><span aria-hidden="true">${state.theme === 'light' ? '🌙' : '☀️'}</span></button>
        </div>
      </header>
      <div class="touch-stage">
        ${activeMatch ? renderTouchLiveMatch(activeMatch, ref) : renderTouchMatchPicker()}
      </div>
      ${activeMatch ? renderTouchBottomBar(activeMatch) : ''}
    `;

    wireTouchEvents();
  }

  function wireTouchEvents() {
    const exitBtn = document.getElementById('touch-exit');
    if (exitBtn) exitBtn.onclick = function () { setTouchMode(false); };

    const exitEmpty = document.getElementById('touch-exit-empty');
    if (exitEmpty) exitEmpty.onclick = function () { setTouchMode(false); };

    const openRoster = document.getElementById('touch-open-roster');
    if (openRoster) openRoster.onclick = function () { setTouchMode(false); };

    els.touchShell.querySelectorAll('[data-touch-tab]').forEach(function (btn) {
      btn.onclick = function () {
        const nextTab = btn.getAttribute('data-touch-tab');
        runViewTransition(function () {
          if (state.activeMatchRef && state.activeMatchRef.period !== nextTab) {
            state.activeMatchRef = null;
            resetTimer(false);
          }
          if (state.activeTab !== nextTab && state.lastCelebration && state.lastCelebration.scope !== nextTab) {
            state.lastCelebration = null;
          }
          state.activeTab = nextTab;
          lastMatchNotice = null;
          commit(null);
        }, els.touchShell);
      };
    });

    const showQueue = document.getElementById('touch-show-queue');
    if (showQueue) showQueue.onclick = function () { runViewTransition(closeLiveMatch, els.touchShell); };

    const closeLive = document.getElementById('touch-close-live');
    if (closeLive) closeLive.onclick = function () { runViewTransition(closeLiveMatch, els.touchShell); };

    const fxBtn = document.getElementById('touch-fx');
    if (fxBtn) {
      fxBtn.onclick = function () {
        state.fxPaused = !state.fxPaused;
        commit(null);
      };
    }

    const muteBtn = document.getElementById('touch-mute');
    if (muteBtn) {
      muteBtn.onclick = function () {
        state.muted = !state.muted;
        commit(null);
      };
    }

    const themeBtn = document.getElementById('touch-theme');
    if (themeBtn) {
      themeBtn.onclick = function () {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        commit(null);
      };
    }

    const timerToggle = document.getElementById('touch-timer-toggle');
    if (timerToggle) timerToggle.onclick = toggleTimer;

    const timerReadout = document.getElementById('touch-timer-readout');
    if (timerReadout) timerReadout.onclick = toggleTimer;

    const timerReset = document.getElementById('touch-timer-reset');
    if (timerReset) timerReset.onclick = function () { resetTimer(true); };

    const winA = document.getElementById('touch-win-a');
    if (winA) {
      winA.onclick = function () {
        const now = Date.now();
        if (now - lastBoutTapAt < 350) return;
        lastBoutTapAt = now;
        scoreBout('a');
      };
    }

    const winB = document.getElementById('touch-win-b');
    if (winB) {
      winB.onclick = function () {
        const now = Date.now();
        if (now - lastBoutTapAt < 350) return;
        lastBoutTapAt = now;
        scoreBout('b');
      };
    }

    const undoBout = document.getElementById('touch-undo-bout');
    if (undoBout) undoBout.onclick = undoLiveMatchBout;

    const undoGlobal = document.getElementById('touch-undo-global');
    if (undoGlobal) undoGlobal.onclick = performGlobalUndo;

    const dismissNotice = document.getElementById('touch-dismiss-notice');
    if (dismissNotice) {
      dismissNotice.onclick = function () {
        lastMatchNotice = null;
        render();
      };
    }

    const dismissCel = document.getElementById('touch-dismiss-celebration');
    if (dismissCel) {
      dismissCel.onclick = function () {
        state.lastCelebration = null;
        commit(null);
      };
    }

    const launchAsf = document.getElementById('touch-launch-asf');
    if (launchAsf) {
      launchAsf.onclick = function () {
        runViewTransition(function () {
          state.activeTab = 'ASF';
          startMatch('ASF', 'ASF-1');
        }, els.touchShell);
      };
    }

    const jumpP2 = document.getElementById('touch-jump-p2');
    if (jumpP2) jumpP2.onclick = function () { state.activeTab = 'P2'; commit(null); };

    const jumpP3 = document.getElementById('touch-jump-p3');
    if (jumpP3) jumpP3.onclick = function () { state.activeTab = 'P3'; commit(null); };

    const jumpAsf = document.getElementById('touch-jump-asf');
    if (jumpAsf) jumpAsf.onclick = function () { state.activeTab = 'ASF'; commit(null); };

    const jumpOther = document.getElementById('touch-jump-other');
    if (jumpOther) {
      jumpOther.onclick = function () {
        state.activeTab = jumpOther.getAttribute('data-target-tab') || 'P2';
        commit(null);
      };
    }

    els.touchShell.querySelectorAll('[data-touch-match-id]').forEach(function (btn) {
      btn.onclick = function () {
        const p = btn.getAttribute('data-touch-period');
        const id = btn.getAttribute('data-touch-match-id');
        runViewTransition(function () { startMatch(p, id); }, els.touchShell);
      };
    });
  }

  function render() {
    renderTabs();

    const tab = state.activeTab;
    const liveHtml = renderLiveMatchPanel();

    if (tab === 'ASF') {
      els.sidebar.innerHTML = liveHtml + renderReadyQueue('ASF');
      els.mainStage.innerHTML = Renderer.renderAllSchoolFinal(state, { interactive: true });
    } else {
      const period = state.periods[tab];
      els.sidebar.innerHTML = liveHtml + (period.bracket ? renderReadyQueue(tab) : renderRosterSetup(tab));
      els.mainStage.innerHTML = Renderer.renderPeriodBracket(state, tab, { interactive: true });
    }

    wireDynamicEvents();

    document.body.classList.toggle('touch-mode-active', touchMode);
    if (els.touchShell) els.touchShell.classList.toggle('hidden', !touchMode);
    if (touchMode) {
      renderTouchShell();
    }
    lastScoreFx = null;
  }

  function wireDynamicEvents() {
    // Live match controls
    const btnCloseLive = document.getElementById('btn-close-live');
    if (btnCloseLive) btnCloseLive.onclick = closeLiveMatch;

    const btnTimerToggle = document.getElementById('btn-timer-toggle');
    if (btnTimerToggle) btnTimerToggle.onclick = toggleTimer;

    const btnTimerReset = document.getElementById('btn-timer-reset');
    if (btnTimerReset) btnTimerReset.onclick = function () { resetTimer(true); };

    const btnWinA = document.getElementById('btn-win-a');
    if (btnWinA) btnWinA.onclick = function () { scoreBout('a'); };

    const btnWinB = document.getElementById('btn-win-b');
    if (btnWinB) btnWinB.onclick = function () { scoreBout('b'); };

    const btnUndoBout = document.getElementById('btn-undo-bout');
    if (btnUndoBout) btnUndoBout.onclick = undoLiveMatchBout;

    // Ready queue clicks
    els.sidebar.querySelectorAll('.queue-item').forEach(function (el) {
      el.onclick = function () {
        startMatch(el.getAttribute('data-period'), el.getAttribute('data-match-id'));
      };
    });

    // Main stage match card & ASF button clicks
    els.mainStage.querySelectorAll('[data-match-id]').forEach(function (el) {
      el.onclick = function () {
        startMatch(el.getAttribute('data-period'), el.getAttribute('data-match-id'));
      };
    });

    // Period controls when bracket exists
    const btnRename = document.getElementById('btn-rename-bots');
    if (btnRename) btnRename.onclick = function () { openRenameBotsModal(state.activeTab); };

    const btnResetBracket = document.getElementById('btn-reset-bracket');
    if (btnResetBracket) {
      btnResetBracket.onclick = function () {
        const p = state.activeTab;
        openModal(`
          <h3 class="modal-title">Reset ${Renderer.escapeHtml(p)} Bracket?</h3>
          <div class="warn-box">This will clear all match results for <strong>${Renderer.escapeHtml(p)}</strong> and return you to roster seeding (your bot list will be kept).</div>
          <div class="btn-row">
            <button class="btn btn-danger" id="modal-confirm-reset">Yes, Reset ${Renderer.escapeHtml(p)}</button>
            <button class="btn" id="modal-cancel">Cancel</button>
          </div>
        `);
        document.getElementById('modal-confirm-reset').onclick = function () {
          pushUndoSnapshot();
          state.periods[p].bracket = null;
          if (state.activeMatchRef && state.activeMatchRef.period === p) {
            state.activeMatchRef = null;
          }
          Engine.syncAllSchoolFinal(state);
          if (state.lastCelebration && (state.lastCelebration.scope === p || state.lastCelebration.scope === 'ASF')) {
            state.lastCelebration = null;
          }
          closeModal();
          commit(null);
        };
        document.getElementById('modal-cancel').onclick = closeModal;
      };
    }

    const btnDismissCel = document.getElementById('btn-dismiss-celebration');
    if (btnDismissCel) {
      btnDismissCel.onclick = function () {
        state.lastCelebration = null;
        commit(null);
      };
    }

    // Roster setup events
    const tab = state.activeTab;
    const formAdd = document.getElementById('form-add-bot');
    if (formAdd) {
      formAdd.onsubmit = function (ev) {
        ev.preventDefault();
        const inp = document.getElementById('input-bot-name');
        if (!inp.value.trim()) return;
        pushUndoSnapshot();
        addBotName(tab, inp.value);
        commit(null);
        const newInp = document.getElementById('input-bot-name');
        if (newInp) newInp.focus();
      };
    }

    const btnBulkAdd = document.getElementById('btn-bulk-add');
    if (btnBulkAdd) {
      btnBulkAdd.onclick = function () {
        const ta = document.getElementById('textarea-bulk');
        const lines = ta.value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
        if (lines.length === 0) return;
        pushUndoSnapshot();
        lines.forEach(function (name) { addBotName(tab, name); });
        commit(null);
      };
    }

    const btnSample = document.getElementById('btn-sample-bots');
    if (btnSample) {
      btnSample.onclick = function () {
        pushUndoSnapshot();
        const samples = [
          'Iron Wedge', 'Torque Titan', 'Dozer X', 'Neon Flip', 'Sumo Slammer',
          'Vortex V2', 'Steel Rhino', 'Turbo Push', 'Apex Bot', 'Crusher 9000'
        ];
        samples.forEach(function (name) { addBotName(tab, `${tab} ${name}`); });
        commit(null);
      };
    }

    const btnShuffle = document.getElementById('btn-shuffle-seeds');
    if (btnShuffle) {
      btnShuffle.onclick = function () {
        pushUndoSnapshot();
        state.periods[tab].bots = Engine.shuffleArray(state.periods[tab].bots);
        reindexSeeds(state.periods[tab].bots);
        commit(null);
      };
    }

    const btnClearRoster = document.getElementById('btn-clear-roster');
    if (btnClearRoster) {
      btnClearRoster.onclick = function () {
        pushUndoSnapshot();
        state.periods[tab].bots = [];
        commit(null);
      };
    }

    const btnGen = document.getElementById('btn-generate-bracket');
    if (btnGen) {
      btnGen.onclick = function () {
        const period = state.periods[tab];
        if (period.bots.length < 2) return;
        pushUndoSnapshot();
        reindexSeeds(period.bots);
        period.bracket = Engine.createPeriodBracket(tab, period.bots);
        Engine.syncAllSchoolFinal(state);
        commit(null);
      };
    }

    // Reorder / delete roster items
    els.sidebar.querySelectorAll('.btn-move-up').forEach(function (btn) {
      btn.onclick = function () {
        const idx = Number(btn.getAttribute('data-index'));
        if (idx <= 0) return;
        pushUndoSnapshot();
        const bots = state.periods[tab].bots;
        const tmp = bots[idx - 1];
        bots[idx - 1] = bots[idx];
        bots[idx] = tmp;
        reindexSeeds(bots);
        commit(null);
      };
    });

    els.sidebar.querySelectorAll('.btn-move-down').forEach(function (btn) {
      btn.onclick = function () {
        const idx = Number(btn.getAttribute('data-index'));
        const bots = state.periods[tab].bots;
        if (idx >= bots.length - 1) return;
        pushUndoSnapshot();
        const tmp = bots[idx + 1];
        bots[idx + 1] = bots[idx];
        bots[idx] = tmp;
        reindexSeeds(bots);
        commit(null);
      };
    });

    els.sidebar.querySelectorAll('.btn-del-bot').forEach(function (btn) {
      btn.onclick = function () {
        const idx = Number(btn.getAttribute('data-index'));
        pushUndoSnapshot();
        state.periods[tab].bots.splice(idx, 1);
        reindexSeeds(state.periods[tab].bots);
        commit(null);
      };
    });

    // Drag and drop reordering
    els.sidebar.querySelectorAll('.roster-item').forEach(function (item) {
      item.addEventListener('dragstart', function () {
        dragIndex = Number(item.getAttribute('data-index'));
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', function () {
        dragIndex = null;
        item.classList.remove('dragging');
      });
      item.addEventListener('dragover', function (ev) {
        ev.preventDefault();
        item.classList.add('drag-over');
      });
      item.addEventListener('dragleave', function () {
        item.classList.remove('drag-over');
      });
      item.addEventListener('drop', function (ev) {
        ev.preventDefault();
        item.classList.remove('drag-over');
        const targetIndex = Number(item.getAttribute('data-index'));
        if (dragIndex === null || dragIndex === targetIndex) return;
        pushUndoSnapshot();
        const bots = state.periods[tab].bots;
        const moved = bots.splice(dragIndex, 1)[0];
        bots.splice(targetIndex, 0, moved);
        reindexSeeds(bots);
        commit(null);
      });
    });
  }

  // Static topbar events
  document.querySelectorAll('.tab-btn[data-tab]').forEach(function (btn) {
    btn.onclick = function () {
      const nextTab = btn.getAttribute('data-tab');
      if (!nextTab || state.activeTab === nextTab) return;
      runViewTransition(function () {
        if (state.lastCelebration && state.lastCelebration.scope !== nextTab) {
          state.lastCelebration = null;
        }
        state.activeTab = nextTab;
        commit(null);
      }, els.mainStage);
    };
  });

  document.querySelectorAll('.override-btn').forEach(function (btn) {
    btn.onclick = function () {
      state.projectorOverride = btn.getAttribute('data-override');
      commit(null);
    };
  });

  els.btnLaunchProjector.onclick = function () {
    bridge.launchProjector();
  };

  if (els.btnTouchMode) {
    els.btnTouchMode.onclick = function () {
      setTouchMode(true);
    };
  }

  bridge.onStatusChange(function (connected) {
    els.projStatusDot.classList.toggle('connected', connected);
  });

  els.btnGlobalUndo.onclick = performGlobalUndo;

  els.btnTheme.onclick = function () {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    commit(null);
  };

  document.querySelectorAll('.palette-dot').forEach(function (btn) {
    btn.onclick = function () {
      state.palette = btn.getAttribute('data-palette') || 'indigo';
      commit(null);
    };
  });

  els.btnMute.onclick = function () {
    state.muted = !state.muted;
    commit(null);
  };

  if (els.btnFx) {
    els.btnFx.onclick = function () {
      state.fxPaused = !state.fxPaused;
      commit(null);
    };
  }

  // Delegated tactile ripple shockwave on pointer press
  document.addEventListener('pointerdown', function (ev) {
    if (isMotionReduced()) return;
    const target = ev.target && ev.target.closest
      ? ev.target.closest('.btn, .bout-btn, .touch-pad, .tab-btn, .override-btn, .queue-item, .touch-queue-card, .match-card.is-clickable')
      : null;
    if (!target || target.disabled) return;
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const size = Math.max(rect.width, rect.height) * 1.15;
    const x = ev.clientX ? (ev.clientX - rect.left) : rect.width / 2;
    const y = ev.clientY ? (ev.clientY - rect.top) : rect.height / 2;
    const ripple = document.createElement('span');
    ripple.className = 'fx-ripple';
    ripple.setAttribute('aria-hidden', 'true');
    ripple.style.width = size + 'px';
    ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    target.appendChild(ripple);
    const removeRipple = function () {
      if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
    };
    ripple.addEventListener('animationend', removeRipple, { once: true });
    setTimeout(removeRipple, 650);
  });

  els.btnExport.onclick = function () {
    Sync.exportJsonFile(state);
  };

  els.btnImport.onclick = function () {
    els.inputImportFile.click();
  };

  els.inputImportFile.onchange = function (ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || !parsed.periods || !parsed.periods.P2 || !parsed.periods.P3) {
          throw new Error('Invalid SumoBot backup file.');
        }
        pushUndoSnapshot();
        state = parsed;
        if (state.timer) {
          state.timer.running = false;
          state.timer.startedAt = null;
        }
        commit(null);
      } catch (err) {
        alert('Could not import file: ' + err.message);
      }
      els.inputImportFile.value = '';
    };
    reader.readAsText(file);
  };

  els.modalBackdrop.onclick = function (ev) {
    if (ev.target === els.modalBackdrop) closeModal();
  };

  // Boot
  applyThemeAndAudio();
  render();
  bridge.broadcast(state, null);
}());
