/* SumoBot Bracket Renderer
 * Renders Winners Bracket, Losers Bracket, Grand Finals (+ Reset), and All-School Final
 * Shared between Teacher Control Panel (interactive) and Projector View (read-only).
 */
(function (root) {
  'use strict';
  root.SumoBot = root.SumoBot || {};

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderSlotRow(state, match, side) {
    const Engine = root.SumoBot.Engine;
    const slotVal = side === 'a' ? match.slotA : match.slotB;
    const score = side === 'a' ? match.scoreA : match.scoreB;
    const source = side === 'a' ? match.sourceA : match.sourceB;
    const isBye = slotVal === Engine.BYE;
    const bot = Engine.getBotById(state, slotVal);

    let cls = 'match-slot';
    if (match.status === 'completed' || match.status === 'bye') {
      if (match.winner === slotVal && bot) cls += ' is-winner';
      else if (bot) cls += ' is-loser';
    }
    if (isBye) cls += ' is-bye';
    if (!bot && !isBye) cls += ' is-tbd';

    let nameHtml;
    if (bot) {
      const seedTag = bot.seed ? `<span class="slot-seed">#${bot.seed}</span>` : '';
      nameHtml = `${seedTag}<span class="slot-name">${escapeHtml(bot.name)}</span>`;
    } else if (isBye) {
      nameHtml = `<span class="slot-name">BYE</span>`;
    } else {
      nameHtml = `<span class="slot-name">${escapeHtml(source || 'TBD')}</span>`;
    }

    const showScore = match.status === 'in_progress' || match.status === 'completed';
    const scoreHtml = showScore
      ? `<span class="slot-score">${score}</span>`
      : `<span class="slot-score empty">-</span>`;

    return `<div class="${cls}">${nameHtml}${scoreHtml}</div>`;
  }

  function renderMatchCard(state, match, options) {
    const interactive = Boolean(options && options.interactive);
    const activeRef = state.activeMatchRef;
    const isActive = Boolean(
      activeRef && activeRef.period === match.period && activeRef.matchId === match.id
    );

    const classes = ['match-card', `status-${match.status}`];
    if (isActive) classes.push('is-active');
    if (match.bestOf === 5) classes.push('is-bo5');
    if (interactive && (match.status === 'ready' || match.status === 'in_progress' || match.status === 'completed')) {
      classes.push('is-clickable');
    }

    let badge = '';
    if (isActive) badge = '<span class="match-badge badge-live">LIVE</span>';
    else if (match.status === 'in_progress') badge = '<span class="match-badge badge-progress">IN PROGRESS</span>';
    else if (match.status === 'ready') badge = '<span class="match-badge badge-ready">READY</span>';
    else if (match.status === 'completed') badge = '<span class="match-badge badge-done">DONE</span>';
    else if (match.status === 'skipped') badge = '<span class="match-badge badge-skip">NOT NEEDED</span>';
    else if (match.status === 'bye') badge = '<span class="match-badge badge-bye">BYE</span>';

    const boTag = `<span class="match-bo">Bo${match.bestOf}</span>`;
    const dataAttrs = interactive
      ? `data-period="${escapeHtml(match.period)}" data-match-id="${escapeHtml(match.id)}"`
      : '';

    return `
      <div class="${classes.join(' ')}" ${dataAttrs}>
        <div class="match-meta">
          <span class="match-label">${escapeHtml(match.label)}</span>
          <span class="match-badges">${boTag}${badge}</span>
        </div>
        <div class="match-slots">
          ${renderSlotRow(state, match, 'a')}
          ${renderSlotRow(state, match, 'b')}
        </div>
      </div>
    `;
  }

  function getRoundTitle(bracketType, roundIndex, totalRounds) {
    if (bracketType === 'W') {
      if (roundIndex === totalRounds) return 'Winners Final';
      if (roundIndex === totalRounds - 1 && totalRounds >= 3) return 'Winners Semis';
      return `Winners R${roundIndex}`;
    }
    if (bracketType === 'L') {
      if (roundIndex === totalRounds) return 'Losers Final';
      return `Losers R${roundIndex}`;
    }
    return 'Grand Finals';
  }

  function renderPeriodBracket(state, periodId, options) {
    const Engine = root.SumoBot.Engine;
    const period = state.periods[periodId];
    const bracket = period && period.bracket;
    if (!bracket) {
      return `
        <div class="empty-bracket">
          <div class="empty-icon">🤖</div>
          <h3>${escapeHtml(period.name)} Bracket Not Generated Yet</h3>
          <p>Add SumoBots in the Roster panel and click <strong>Generate Bracket</strong> to begin.</p>
        </div>
      `;
    }

    const winnersCols = bracket.winnersRounds.map(function (roundIds, idx) {
      const title = getRoundTitle('W', idx + 1, bracket.winnersRounds.length);
      const cards = roundIds.map(function (id) {
        return renderMatchCard(state, bracket.matches[id], options);
      }).join('');
      return `
        <div class="bracket-column">
          <div class="round-header">${escapeHtml(title)}</div>
          <div class="round-matches">${cards}</div>
        </div>
      `;
    }).join('');

    // Grand Finals column (GF-1 and GF-2)
    const gf1 = bracket.matches['GF-1'];
    const gf2 = bracket.matches['GF-2'];
    const champBot = Engine.getBotById(state, bracket.championId);
    const champBanner = champBot ? `
      <div class="bracket-champ-card">
        <div class="champ-eyebrow">🏆 ${escapeHtml(periodId)} CHAMPION</div>
        <div class="champ-name">${escapeHtml(champBot.name)}</div>
      </div>
    ` : '';

    const finalsCol = `
      <div class="bracket-column finals-column">
        <div class="round-header finals-header">Grand Finals (Bo5)</div>
        <div class="round-matches">
          ${renderMatchCard(state, gf1, options)}
          ${gf2 ? renderMatchCard(state, gf2, options) : ''}
          ${champBanner}
        </div>
      </div>
    `;

    // Losers Bracket columns (hide pure double-bye matches to keep non-power-of-2 brackets crisp)
    const losersCols = bracket.losersRounds.map(function (roundIds, idx) {
      const visibleMatches = roundIds
        .map(function (id) { return bracket.matches[id]; })
        .filter(function (m) {
          return !(m.status === 'bye' && m.slotA === Engine.BYE && m.slotB === Engine.BYE);
        });
      if (visibleMatches.length === 0) return '';
      const title = getRoundTitle('L', idx + 1, bracket.losersRounds.length);
      const cards = visibleMatches.map(function (m) {
        return renderMatchCard(state, m, options);
      }).join('');
      return `
        <div class="bracket-column">
          <div class="round-header losers-header">${escapeHtml(title)}</div>
          <div class="round-matches">${cards}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="bracket-tree">
        <section class="bracket-section winners-section">
          <div class="section-label">
            <span class="dot dot-winners"></span> WINNERS BRACKET <span class="section-sub">Best of 3 &rarr; Grand Finals Best of 5</span>
          </div>
          <div class="bracket-grid">
            ${winnersCols}
            ${finalsCol}
          </div>
        </section>
        ${losersCols ? `
        <section class="bracket-section losers-section">
          <div class="section-label">
            <span class="dot dot-losers"></span> LOSERS BRACKET <span class="section-sub">Elimination Rounds (Best of 3)</span>
          </div>
          <div class="bracket-grid">
            ${losersCols}
          </div>
        </section>
        ` : ''}
      </div>
    `;
  }

  function renderAllSchoolFinal(state, options) {
    const Engine = root.SumoBot.Engine;
    const asf = state.allSchoolFinal;
    const p2Bot = Engine.getBotById(state, asf.slotA);
    const p3Bot = Engine.getBotById(state, asf.slotB);
    const champBot = Engine.getBotById(state, asf.winner);
    const interactive = Boolean(options && options.interactive);

    const canStart = asf.status === 'ready' || asf.status === 'in_progress';
    const isCompleted = asf.status === 'completed';

    return `
      <div class="asf-stage">
        <div class="asf-header">
          <div class="asf-eyebrow">🏆 ALL-SCHOOL CHAMPIONSHIP SHOWDOWN</div>
          <h2 class="asf-title">Period 2 Champion vs. Period 3 Champion</h2>
          <p class="asf-sub">Best of 5 Rounds &bull; First to 3 Wins Takes the School Title</p>
        </div>

        <div class="asf-matchup">
          <div class="asf-fighter ${asf.winner === asf.slotA && p2Bot ? 'is-champion' : ''}">
            <div class="fighter-period">PERIOD 2 CHAMPION</div>
            <div class="fighter-name">${p2Bot ? escapeHtml(p2Bot.name) : '<span class="tbd-text">Awaiting P2 Winner</span>'}</div>
            <div class="fighter-score">${asf.scoreA}</div>
            <div class="bout-pips">${renderPips(asf.scoreA, 3)}</div>
          </div>

          <div class="asf-vs">
            <div class="vs-badge">VS</div>
            <div class="vs-bo">BEST OF 5</div>
          </div>

          <div class="asf-fighter ${asf.winner === asf.slotB && p3Bot ? 'is-champion' : ''}">
            <div class="fighter-period">PERIOD 3 CHAMPION</div>
            <div class="fighter-name">${p3Bot ? escapeHtml(p3Bot.name) : '<span class="tbd-text">Awaiting P3 Winner</span>'}</div>
            <div class="fighter-score">${asf.scoreB}</div>
            <div class="bout-pips">${renderPips(asf.scoreB, 3)}</div>
          </div>
        </div>

        ${champBot ? `
          <div class="asf-winner-banner">
            👑 ALL-SCHOOL CHAMPION: <strong>${escapeHtml(champBot.name)}</strong> (${escapeHtml(champBot.period)})
          </div>
        ` : ''}

        ${interactive ? `
          <div class="asf-actions">
            ${canStart ? `<button class="btn btn-primary btn-lg" data-period="ASF" data-match-id="ASF-1">⚡ ${asf.status === 'in_progress' ? 'Resume' : 'Launch'} All-School Final</button>` : ''}
            ${isCompleted ? `<button class="btn btn-secondary" data-period="ASF" data-match-id="ASF-1">✏️ Review / Edit Result</button>` : ''}
            ${!canStart && !isCompleted ? `<div class="asf-wait-note">Finish both Period 2 and Period 3 brackets to unlock the All-School Final.</div>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderPips(score, needed) {
    let html = '';
    for (let i = 0; i < needed; i++) {
      html += `<span class="pip ${i < score ? 'filled' : ''}"></span>`;
    }
    return html;
  }

  root.SumoBot.Renderer = {
    escapeHtml: escapeHtml,
    renderPips: renderPips,
    renderMatchCard: renderMatchCard,
    renderPeriodBracket: renderPeriodBracket,
    renderAllSchoolFinal: renderAllSchoolFinal
  };
}(typeof self !== 'undefined' ? self : this));
