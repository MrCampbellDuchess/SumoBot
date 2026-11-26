/* SumoBot Persistence & Dual-Window Sync Layer
 * Works reliably on BOTH file:// (via window.open + postMessage) AND http:// (BroadcastChannel + localStorage).
 */
(function (root) {
  'use strict';
  root.SumoBot = root.SumoBot || {};

  const STORAGE_KEY = 'sumobot_tournament_state_v1';
  const CHANNEL_NAME = 'sumobot_tournament_sync_v1';

  let channel = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL_NAME);
    }
  } catch (e) {
    channel = null;
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Ignore storage quota / security errors
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.periods && parsed.periods.P2 && parsed.periods.P3) {
        return parsed;
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function getRemainingMs(timer) {
    if (!timer) return 120000;
    if (!timer.running || !timer.startedAt) {
      return Math.max(0, timer.remainingMs);
    }
    const elapsed = Date.now() - timer.startedAt;
    return Math.max(0, timer.remainingMs - elapsed);
  }

  function formatTimer(ms) {
    const totalSec = Math.ceil(Math.max(0, ms) / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return mins + ':' + (secs < 10 ? '0' + secs : String(secs));
  }

  function createTeacherBridge(getStateFn) {
    let projectorWin = null;
    let statusCallback = null;

    function isProjectorOpen() {
      return Boolean(projectorWin && !projectorWin.closed);
    }

    function notifyStatus() {
      if (statusCallback) statusCallback(isProjectorOpen());
    }

    function broadcast(state, soundEvent) {
      saveState(state);
      const msg = {
        type: 'SUMOBOT_STATE',
        state: state,
        soundEvent: soundEvent || null,
        sentAt: Date.now()
      };
      if (isProjectorOpen()) {
        try {
          projectorWin.postMessage(msg, '*');
        } catch (e) { /* ignore */ }
      }
      if (channel) {
        try {
          channel.postMessage(msg);
        } catch (e) { /* ignore */ }
      }
      notifyStatus();
    }

    function launchProjector() {
      if (isProjectorOpen()) {
        projectorWin.focus();
        broadcast(getStateFn(), null);
        return projectorWin;
      }
      projectorWin = window.open(
        'projector.html',
        'SumoBotProjector',
        'width=1366,height=768,menubar=no,toolbar=no,location=no,status=no'
      );
      if (projectorWin) {
        // Send initial state a few times while the new window boots
        [150, 450, 1000].forEach(function (delay) {
          setTimeout(function () {
            if (isProjectorOpen()) broadcast(getStateFn(), null);
          }, delay);
        });
      }
      notifyStatus();
      return projectorWin;
    }

    window.addEventListener('message', function (ev) {
      if (!ev.data || ev.data.type !== 'SUMOBOT_REQUEST_STATE') return;
      if (ev.source && ev.source !== window) {
        projectorWin = ev.source;
      }
      broadcast(getStateFn(), null);
    });

    if (channel) {
      channel.onmessage = function (ev) {
        if (ev.data && ev.data.type === 'SUMOBOT_REQUEST_STATE') {
          broadcast(getStateFn(), null);
        }
      };
    }

    // Periodically check if projector window was closed
    setInterval(notifyStatus, 1500);

    return {
      broadcast: broadcast,
      launchProjector: launchProjector,
      isProjectorOpen: isProjectorOpen,
      onStatusChange: function (cb) { statusCallback = cb; }
    };
  }

  function createProjectorBridge(onStateFn) {
    function handleIncoming(msg) {
      if (!msg || msg.type !== 'SUMOBOT_STATE' || !msg.state) return;
      onStateFn(msg.state, msg.soundEvent || null);
    }

    window.addEventListener('message', function (ev) {
      handleIncoming(ev.data);
    });

    if (channel) {
      channel.onmessage = function (ev) {
        handleIncoming(ev.data);
      };
    }

    window.addEventListener('storage', function (ev) {
      if (ev.key === STORAGE_KEY && ev.newValue) {
        try {
          onStateFn(JSON.parse(ev.newValue), null);
        } catch (e) { /* ignore */ }
      }
    });

    function requestSync() {
      const req = { type: 'SUMOBOT_REQUEST_STATE' };
      if (window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage(req, '*');
        } catch (e) { /* ignore */ }
      }
      if (channel) {
        try {
          channel.postMessage(req);
        } catch (e) { /* ignore */ }
      }
      const saved = loadState();
      if (saved) onStateFn(saved, null);
    }

    return {
      requestSync: requestSync
    };
  }

  function exportJsonFile(state) {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `sumobot-tournament-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  root.SumoBot.Sync = {
    STORAGE_KEY: STORAGE_KEY,
    saveState: saveState,
    loadState: loadState,
    cloneState: cloneState,
    getRemainingMs: getRemainingMs,
    formatTimer: formatTimer,
    createTeacherBridge: createTeacherBridge,
    createProjectorBridge: createProjectorBridge,
    exportJsonFile: exportJsonFile
  };
}(typeof self !== 'undefined' ? self : this));
