/* SumoBot Double-Elimination Tournament Engine
 * Works in browser (window.SumoBot.Engine) and Node.js (module.exports)
 * Rules:
 * - Two class tournaments: P2 and P3 (true double elimination with bracket reset)
 * - All rounds Best-of-3 (first to 2), Grand Finals & Reset Best-of-5 (first to 3)
 * - All-School Final: P2 Champion vs P3 Champion, Best-of-5 (first to 3)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SumoBot = root.SumoBot || {};
    root.SumoBot.Engine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BYE = '__BYE__';

  function nextPowerOfTwo(n) {
    let p = 1;
    while (p < n) p *= 2;
    return p;
  }

  // Standard tournament seeding order so top seeds meet as late as possible
  // and byes (seeds > N) always pair against the highest seeds (1, 2, 3...)
  function standardSeedOrder(size) {
    let order = [1, 2];
    while (order.length < size) {
      const nextSize = order.length * 2;
      const expanded = [];
      for (let i = 0; i < order.length; i++) {
        expanded.push(order[i]);
        expanded.push(nextSize + 1 - order[i]);
      }
      order = expanded;
    }
    return order;
  }

  // Anti-rematch drop-down order for Winners Round `wr` dropping into Losers Round `lr`
  function losersDropOrder(matchCount, winnersRound) {
    const indices = [];
    for (let i = 1; i <= matchCount; i++) indices.push(i);
    if (matchCount <= 1) return indices;
    if (winnersRound % 2 === 0) {
      return indices.slice().reverse();
    }
    if (matchCount === 2) {
      return [2, 1];
    }
    const half = matchCount / 2;
    return indices.slice(half).concat(indices.slice(0, half));
  }

  function makeMatch(opts) {
    return {
      id: opts.id,
      period: opts.period,
      bracket: opts.bracket, // 'W' | 'L' | 'GF' | 'ASF'
      round: opts.round,
      matchNumber: opts.matchNumber,
      label: opts.label,
      bestOf: opts.bestOf,
      slotA: opts.slotA !== undefined ? opts.slotA : null,
      slotB: opts.slotB !== undefined ? opts.slotB : null,
      seedA: opts.seedA || null,
      seedB: opts.seedB || null,
      sourceA: opts.sourceA || null,
      sourceB: opts.sourceB || null,
      winnerTo: opts.winnerTo || null, // { matchId, slot: 'a' | 'b' }
      loserTo: opts.loserTo || null,   // { matchId, slot: 'a' | 'b' }
      scoreA: 0,
      scoreB: 0,
      bouts: [], // array of 'a' | 'b'
      winner: null,
      loser: null,
      status: 'pending' // 'pending' | 'ready' | 'in_progress' | 'completed' | 'bye' | 'skipped'
    };
  }

  function winsNeeded(bestOf) {
    return Math.ceil(bestOf / 2);
  }

  function createPeriodBracket(periodId, bots) {
    if (!Array.isArray(bots) || bots.length < 2) {
      throw new Error('At least 2 bots are required to generate a bracket.');
    }

    const cleanBots = bots.map((b, idx) => ({
      id: b.id || `${periodId.toLowerCase()}-bot-${idx + 1}`,
      name: String(b.name || '').trim() || `Bot ${idx + 1}`,
      seed: idx + 1
    }));

    const N = cleanBots.length;
    const S = nextPowerOfTwo(N);
    const R = Math.log2(S);
    const matches = {};
    const order = [];

    function addMatch(m) {
      matches[m.id] = m;
      order.push(m.id);
      return m;
    }

    const wRounds = [];
    const lRounds = [];

    if (R === 1) {
      // Special 2-bot double elimination: W1-1 -> GF-1 -> optional GF-2
      const w1 = addMatch(makeMatch({
        id: 'W1-1',
        period: periodId,
        bracket: 'W',
        round: 1,
        matchNumber: 1,
        label: 'Winners Final',
        bestOf: 3,
        slotA: cleanBots[0].id,
        slotB: cleanBots[1].id,
        seedA: 1,
        seedB: 2,
        winnerTo: { matchId: 'GF-1', slot: 'a' },
        loserTo: { matchId: 'GF-1', slot: 'b' }
      }));
      wRounds.push([w1.id]);

      addMatch(makeMatch({
        id: 'GF-1',
        period: periodId,
        bracket: 'GF',
        round: 1,
        matchNumber: 1,
        label: 'Grand Finals (Bo5)',
        bestOf: 5,
        sourceA: 'Winners Champ',
        sourceB: 'Challenger'
      }));

      addMatch(makeMatch({
        id: 'GF-2',
        period: periodId,
        bracket: 'GF',
        round: 2,
        matchNumber: 1,
        label: 'Grand Finals Reset (Bo5)',
        bestOf: 5,
        sourceA: 'If Reset Needed',
        sourceB: 'If Reset Needed'
      }));
    } else {
      // 1. Create Winners Bracket matches
      const seedPositions = standardSeedOrder(S);
      for (let r = 1; r <= R; r++) {
        const count = S / Math.pow(2, r);
        const roundIds = [];
        for (let i = 1; i <= count; i++) {
          const id = `W${r}-${i}`;
          const isFinal = r === R;
          const isSemi = r === R - 1 && R >= 3;
          let label = `W-R${r} #${i}`;
          if (isFinal) label = 'Winners Final';
          else if (isSemi) label = `Winners Semi #${i}`;

          let slotA = null, slotB = null, seedA = null, seedB = null;
          let sourceA = null, sourceB = null;

          if (r === 1) {
            const sA = seedPositions[(i - 1) * 2];
            const sB = seedPositions[(i - 1) * 2 + 1];
            seedA = sA <= N ? sA : null;
            seedB = sB <= N ? sB : null;
            slotA = sA <= N ? cleanBots[sA - 1].id : BYE;
            slotB = sB <= N ? cleanBots[sB - 1].id : BYE;
          } else {
            sourceA = `W${r - 1}-${(i - 1) * 2 + 1} Winner`;
            sourceB = `W${r - 1}-${(i - 1) * 2 + 2} Winner`;
          }

          const winnerTo = isFinal
            ? { matchId: 'GF-1', slot: 'a' }
            : { matchId: `W${r + 1}-${Math.ceil(i / 2)}`, slot: i % 2 === 1 ? 'a' : 'b' };

          addMatch(makeMatch({
            id,
            period: periodId,
            bracket: 'W',
            round: r,
            matchNumber: i,
            label,
            bestOf: 3,
            slotA,
            slotB,
            seedA,
            seedB,
            sourceA,
            sourceB,
            winnerTo,
            loserTo: null // wired below when creating Losers Bracket
          }));
          roundIds.push(id);
        }
        wRounds.push(roundIds);
      }

      // 2. Create Losers Bracket matches
      const totalLRounds = 2 * (R - 1);
      for (let lr = 1; lr <= totalLRounds; lr++) {
        const count = S / Math.pow(2, Math.floor((lr + 1) / 2) + 1);
        const isLFinal = lr === totalLRounds;
        const roundIds = [];
        for (let i = 1; i <= count; i++) {
          const id = `L${lr}-${i}`;
          const label = isLFinal ? 'Losers Final' : `L-R${lr} #${i}`;

          let winnerTo;
          if (isLFinal) {
            winnerTo = { matchId: 'GF-1', slot: 'b' };
          } else if (lr % 2 === 1) {
            // Odd losers round feeds 1-to-1 into next even round's slot A
            winnerTo = { matchId: `L${lr + 1}-${i}`, slot: 'a' };
          } else {
            // Even losers round consolidates pairs into next odd round
            winnerTo = { matchId: `L${lr + 1}-${Math.ceil(i / 2)}`, slot: i % 2 === 1 ? 'a' : 'b' };
          }

          addMatch(makeMatch({
            id,
            period: periodId,
            bracket: 'L',
            round: lr,
            matchNumber: i,
            label,
            bestOf: 3,
            winnerTo,
            loserTo: null
          }));
          roundIds.push(id);
        }
        lRounds.push(roundIds);
      }

      // 3. Wire Losers drop-downs from Winners Bracket
      // W1 losers pair into L1
      const w1Count = wRounds[0].length;
      for (let i = 1; i <= w1Count; i++) {
        const lMatchIdx = Math.ceil(i / 2);
        const slot = i % 2 === 1 ? 'a' : 'b';
        const wId = `W1-${i}`;
        const lId = `L1-${lMatchIdx}`;
        matches[wId].loserTo = { matchId: lId, slot };
        if (slot === 'a') matches[lId].sourceA = `${wId} Loser`;
        else matches[lId].sourceB = `${wId} Loser`;
      }

      // W2..WR losers drop into even Losers rounds L2, L4, ..., L_{2*(R-1)} slot B
      for (let wr = 2; wr <= R; wr++) {
        const lr = 2 * (wr - 1);
        const wCount = wRounds[wr - 1].length;
        const dropOrder = losersDropOrder(wCount, wr);
        for (let i = 1; i <= wCount; i++) {
          const lMatchIdx = dropOrder[i - 1];
          const wId = `W${wr}-${i}`;
          const lId = `L${lr}-${lMatchIdx}`;
          matches[wId].loserTo = { matchId: lId, slot: 'b' };
          matches[lId].sourceA = `L${lr - 1}-${lMatchIdx} Winner`;
          matches[lId].sourceB = `${wId} Loser`;
        }
      }

      // Fill source labels for odd Losers rounds > 1
      for (let lr = 3; lr <= totalLRounds; lr += 2) {
        const count = lRounds[lr - 1].length;
        for (let i = 1; i <= count; i++) {
          const lId = `L${lr}-${i}`;
          matches[lId].sourceA = `L${lr - 1}-${(i - 1) * 2 + 1} Winner`;
          matches[lId].sourceB = `L${lr - 1}-${(i - 1) * 2 + 2} Winner`;
        }
      }

      // 4. Grand Finals & Bracket Reset (both Best-of-5)
      addMatch(makeMatch({
        id: 'GF-1',
        period: periodId,
        bracket: 'GF',
        round: 1,
        matchNumber: 1,
        label: 'Grand Finals (Bo5)',
        bestOf: 5,
        sourceA: 'Winners Final Winner',
        sourceB: 'Losers Final Winner'
      }));

      addMatch(makeMatch({
        id: 'GF-2',
        period: periodId,
        bracket: 'GF',
        round: 2,
        matchNumber: 1,
        label: 'Grand Finals Reset (Bo5)',
        bestOf: 5,
        sourceA: 'GF-1 Winners Champ',
        sourceB: 'GF-1 Losers Champ'
      }));
    }

    const bracket = {
      periodId,
      started: true,
      bracketSize: S,
      winnersRounds: wRounds,
      losersRounds: lRounds,
      finalsMatches: ['GF-1', 'GF-2'],
      matchOrder: order,
      matches,
      championId: null,
      runnerUpId: null,
      resetTriggered: false
    };

    propagatePeriodBracket(bracket);
    return bracket;
  }

  function assignSlot(match, slot, value) {
    if (slot === 'a') match.slotA = value;
    else match.slotB = value;
  }

  function propagatePeriodBracket(bracket) {
    if (!bracket || !bracket.matches) return bracket;
    const matches = bracket.matches;

    let changed = true;
    let safety = 0;
    while (changed && safety < 100) {
      changed = false;
      safety++;

      for (const id of bracket.matchOrder) {
        const m = matches[id];

        // Special handling for GF-2 (Bracket Reset)
        if (id === 'GF-2') {
          const gf1 = matches['GF-1'];
          if (!gf1 || gf1.status !== 'completed') {
            if (m.status !== 'pending' || m.slotA !== null || m.slotB !== null) {
              m.slotA = null;
              m.slotB = null;
              m.scoreA = 0;
              m.scoreB = 0;
              m.bouts = [];
              m.winner = null;
              m.loser = null;
              m.status = 'pending';
              changed = true;
            }
          } else if (gf1.winner === gf1.slotA) {
            // Undefeated Winners Champ won GF-1 -> Reset not needed
            if (m.status !== 'skipped') {
              m.slotA = null;
              m.slotB = null;
              m.scoreA = 0;
              m.scoreB = 0;
              m.bouts = [];
              m.winner = null;
              m.loser = null;
              m.status = 'skipped';
              changed = true;
            }
          } else {
            // Losers Champ won GF-1 -> Trigger Bracket Reset!
            if (m.slotA !== gf1.slotA || m.slotB !== gf1.slotB) {
              m.slotA = gf1.slotA;
              m.slotB = gf1.slotB;
              if (m.status === 'skipped' || m.status === 'pending') {
                m.status = 'ready';
              }
              changed = true;
            }
            if (m.status !== 'completed') {
              const targetStatus = (m.scoreA > 0 || m.scoreB > 0) ? 'in_progress' : 'ready';
              if (m.status !== targetStatus) {
                m.status = targetStatus;
                changed = true;
              }
            }
          }
          continue;
        }

        // If already completed, ensure winner/loser propagated forward
        if (m.status === 'completed') {
          if (m.winnerTo) {
            const target = matches[m.winnerTo.matchId];
            const cur = m.winnerTo.slot === 'a' ? target.slotA : target.slotB;
            if (cur !== m.winner) {
              assignSlot(target, m.winnerTo.slot, m.winner);
              changed = true;
            }
          }
          if (m.loserTo) {
            const target = matches[m.loserTo.matchId];
            const cur = m.loserTo.slot === 'a' ? target.slotA : target.slotB;
            if (cur !== m.loser) {
              assignSlot(target, m.loserTo.slot, m.loser);
              changed = true;
            }
          }
          continue;
        }

        // Auto-resolve BYEs
        const aIsBye = m.slotA === BYE;
        const bIsBye = m.slotB === BYE;
        const aIsBot = Boolean(m.slotA && m.slotA !== BYE);
        const bIsBot = Boolean(m.slotB && m.slotB !== BYE);

        if (aIsBye && bIsBye) {
          if (m.status !== 'bye' || m.winner !== BYE) {
            m.status = 'bye';
            m.winner = BYE;
            m.loser = BYE;
            changed = true;
          }
          if (m.winnerTo) {
            const target = matches[m.winnerTo.matchId];
            const cur = m.winnerTo.slot === 'a' ? target.slotA : target.slotB;
            if (cur !== BYE) {
              assignSlot(target, m.winnerTo.slot, BYE);
              changed = true;
            }
          }
          if (m.loserTo) {
            const target = matches[m.loserTo.matchId];
            const cur = m.loserTo.slot === 'a' ? target.slotA : target.slotB;
            if (cur !== BYE) {
              assignSlot(target, m.loserTo.slot, BYE);
              changed = true;
            }
          }
        } else if ((aIsBot && bIsBye) || (bIsBot && aIsBye)) {
          const winnerId = aIsBot ? m.slotA : m.slotB;
          if (m.status !== 'bye' || m.winner !== winnerId || m.loser !== BYE) {
            m.status = 'bye';
            m.winner = winnerId;
            m.loser = BYE;
            changed = true;
          }
          if (m.winnerTo) {
            const target = matches[m.winnerTo.matchId];
            const cur = m.winnerTo.slot === 'a' ? target.slotA : target.slotB;
            if (cur !== winnerId) {
              assignSlot(target, m.winnerTo.slot, winnerId);
              changed = true;
            }
          }
          if (m.loserTo) {
            const target = matches[m.loserTo.matchId];
            const cur = m.loserTo.slot === 'a' ? target.slotA : target.slotB;
            if (cur !== BYE) {
              assignSlot(target, m.loserTo.slot, BYE);
              changed = true;
            }
          }
        } else if (aIsBot && bIsBot) {
          const targetStatus = (m.scoreA > 0 || m.scoreB > 0) ? 'in_progress' : 'ready';
          if (m.status !== targetStatus) {
            m.status = targetStatus;
            changed = true;
          }
        } else {
          if (m.status !== 'pending') {
            m.status = 'pending';
            changed = true;
          }
        }
      }
    }

    // Update champion & reset state
    const gf1 = matches['GF-1'];
    const gf2 = matches['GF-2'];
    bracket.resetTriggered = Boolean(gf1 && gf1.status === 'completed' && gf1.winner === gf1.slotB);

    if (gf1 && gf1.status === 'completed' && gf1.winner === gf1.slotA) {
      bracket.championId = gf1.winner;
      bracket.runnerUpId = gf1.loser;
    } else if (gf2 && gf2.status === 'completed') {
      bracket.championId = gf2.winner;
      bracket.runnerUpId = gf2.loser;
    } else {
      bracket.championId = null;
      bracket.runnerUpId = null;
    }

    return bracket;
  }

  function createAllSchoolFinal() {
    return makeMatch({
      id: 'ASF-1',
      period: 'ASF',
      bracket: 'ASF',
      round: 1,
      matchNumber: 1,
      label: 'All-School Championship (Bo5)',
      bestOf: 5,
      sourceA: 'P2 Champion',
      sourceB: 'P3 Champion'
    });
  }

  function syncAllSchoolFinal(state) {
    const asf = state.allSchoolFinal;
    const p2Champ = state.periods.P2.bracket ? state.periods.P2.bracket.championId : null;
    const p3Champ = state.periods.P3.bracket ? state.periods.P3.bracket.championId : null;

    const slotAChanged = asf.slotA !== p2Champ;
    const slotBChanged = asf.slotB !== p3Champ;

    if (slotAChanged || slotBChanged) {
      asf.slotA = p2Champ;
      asf.slotB = p3Champ;
      asf.scoreA = 0;
      asf.scoreB = 0;
      asf.bouts = [];
      asf.winner = null;
      asf.loser = null;
    }

    if (asf.status === 'completed' && asf.slotA && asf.slotB && !slotAChanged && !slotBChanged) {
      return asf;
    }

    if (asf.slotA && asf.slotB) {
      asf.status = (asf.scoreA > 0 || asf.scoreB > 0) ? 'in_progress' : 'ready';
    } else {
      asf.status = 'pending';
    }
    return asf;
  }

  function createInitialState() {
    return {
      version: 1,
      activeTab: 'P2', // 'P2' | 'P3' | 'ASF'
      theme: 'dark',   // 'dark' | 'light'
      palette: 'indigo', // 'indigo' | 'teal' | 'terracotta' | 'violet' | 'sage'
      muted: false,
      projectorOverride: 'auto', // 'auto' | 'bracket' | 'live' | 'finals'
      activeMatchRef: null, // { period: 'P2'|'P3'|'ASF', matchId: string }
      timer: {
        durationSec: 120,
        remainingMs: 120000,
        running: false,
        startedAt: null,
        expired: false
      },
      periods: {
        P2: {
          id: 'P2',
          name: 'Period 2 (P2)',
          bots: [],
          bracket: null
        },
        P3: {
          id: 'P3',
          name: 'Period 3 (P3)',
          bots: [],
          bracket: null
        }
      },
      allSchoolFinal: createAllSchoolFinal(),
      lastCelebration: null, // { scope: 'P2'|'P3'|'ASF', winnerName: string, runnerUpName: string, timestamp: number }
      updatedAt: Date.now()
    };
  }

  function getMatch(state, period, matchId) {
    if (period === 'ASF') return state.allSchoolFinal;
    const b = state.periods[period] && state.periods[period].bracket;
    return b ? b.matches[matchId] : null;
  }

  function getBotById(state, botId) {
    if (!botId || botId === BYE) return null;
    for (const p of ['P2', 'P3']) {
      const found = state.periods[p].bots.find(b => b.id === botId);
      if (found) return Object.assign({ period: p }, found);
    }
    return null;
  }

  function recordBoutWin(state, period, matchId, side) {
    if (side !== 'a' && side !== 'b') throw new Error('side must be "a" or "b"');
    const match = getMatch(state, period, matchId);
    if (!match) throw new Error('Match not found: ' + period + '/' + matchId);
    if (match.status !== 'ready' && match.status !== 'in_progress') {
      throw new Error('Match is not playable (status: ' + match.status + ')');
    }

    match.bouts.push(side);
    if (side === 'a') match.scoreA++;
    else match.scoreB++;

    const needed = winsNeeded(match.bestOf);
    let matchJustFinished = false;
    let tournamentJustFinished = false;

    if (match.scoreA >= needed || match.scoreB >= needed) {
      match.status = 'completed';
      match.winner = match.scoreA >= needed ? match.slotA : match.slotB;
      match.loser = match.scoreA >= needed ? match.slotB : match.slotA;
      matchJustFinished = true;

      if (period === 'ASF') {
        tournamentJustFinished = true;
        const winBot = getBotById(state, match.winner);
        const loseBot = getBotById(state, match.loser);
        state.lastCelebration = {
          scope: 'ASF',
          title: 'ALL-SCHOOL SUMOBOT CHAMPION!',
          winnerName: winBot ? winBot.name : 'Champion',
          winnerPeriod: winBot ? winBot.period : '',
          runnerUpName: loseBot ? loseBot.name : '',
          timestamp: Date.now()
        };
      } else {
        const bracket = state.periods[period].bracket;
        const prevChamp = bracket.championId;
        propagatePeriodBracket(bracket);
        syncAllSchoolFinal(state);
        if (!prevChamp && bracket.championId) {
          tournamentJustFinished = true;
          const winBot = getBotById(state, bracket.championId);
          const loseBot = getBotById(state, bracket.runnerUpId);
          state.lastCelebration = {
            scope: period,
            title: `${period} SUMOBOT CHAMPION!`,
            winnerName: winBot ? winBot.name : 'Champion',
            winnerPeriod: period,
            runnerUpName: loseBot ? loseBot.name : '',
            timestamp: Date.now()
          };
        }
      }
    } else {
      match.status = 'in_progress';
    }

    state.updatedAt = Date.now();
    return { matchJustFinished, tournamentJustFinished, match };
  }

  // Undo the most recent bout in a match (can also un-complete a completed match if no downstream played)
  function undoLastBout(state, period, matchId) {
    const match = getMatch(state, period, matchId);
    if (!match || match.bouts.length === 0) return { ok: false, reason: 'No bouts to undo.' };

    const wasCompleted = match.status === 'completed';
    if (wasCompleted) {
      const affected = getDownstreamAffectedMatches(state, period, matchId);
      if (affected.length > 0) {
        return {
          ok: false,
          reason: 'Downstream matches already started. Use "Edit Past Match" to reset downstream matches.',
          affected
        };
      }
    }

    const last = match.bouts.pop();
    if (last === 'a') match.scoreA = Math.max(0, match.scoreA - 1);
    else match.scoreB = Math.max(0, match.scoreB - 1);

    match.winner = null;
    match.loser = null;
    match.status = (match.scoreA > 0 || match.scoreB > 0) ? 'in_progress' : 'ready';

    if (wasCompleted) {
      // Now that this match is no longer completed, clear downstream slots cleanly
      clearDownstreamFromMatch(state, period, matchId, false);
    } else if (period !== 'ASF') {
      propagatePeriodBracket(state.periods[period].bracket);
      syncAllSchoolFinal(state);
    }
    if (state.lastCelebration && state.lastCelebration.scope === period) {
      state.lastCelebration = null;
    }
    state.updatedAt = Date.now();
    return { ok: true, match };
  }

  // Returns list of downstream matches that have scores or are completed
  function getDownstreamAffectedMatches(state, period, matchId) {
    if (period === 'ASF') return [];
    const bracket = state.periods[period].bracket;
    if (!bracket) return [];
    const visited = new Set();
    const queue = [];
    const affected = [];

    function enqueueLinks(m) {
      if (m.winnerTo && !visited.has(m.winnerTo.matchId)) {
        visited.add(m.winnerTo.matchId);
        queue.push(m.winnerTo.matchId);
      }
      if (m.loserTo && !visited.has(m.loserTo.matchId)) {
        visited.add(m.loserTo.matchId);
        queue.push(m.loserTo.matchId);
      }
      if (m.id === 'GF-1' && bracket.matches['GF-2'] && !visited.has('GF-2')) {
        visited.add('GF-2');
        queue.push('GF-2');
      }
    }

    const start = bracket.matches[matchId];
    if (!start) return [];
    enqueueLinks(start);

    while (queue.length > 0) {
      const id = queue.shift();
      const m = bracket.matches[id];
      if (!m) continue;
      if (m.status === 'completed' || m.status === 'in_progress') {
        affected.push({ period, matchId: id, label: m.label, status: m.status });
      }
      enqueueLinks(m);
    }

    // Check if this period's champion is affected and All-School Final has started
    const touchesFinals = matchId === 'GF-1' || matchId === 'GF-2' || visited.has('GF-1') || visited.has('GF-2');
    if (touchesFinals && (state.allSchoolFinal.status === 'in_progress' || state.allSchoolFinal.status === 'completed')) {
      affected.push({
        period: 'ASF',
        matchId: 'ASF-1',
        label: state.allSchoolFinal.label,
        status: state.allSchoolFinal.status
      });
    }

    return affected;
  }

  // Recursively clear downstream matches from `matchId` (and optionally reset `matchId` itself)
  function clearDownstreamFromMatch(state, period, matchId, resetSelf) {
    if (period === 'ASF') {
      const asf = state.allSchoolFinal;
      if (resetSelf) {
        asf.scoreA = 0;
        asf.scoreB = 0;
        asf.bouts = [];
        asf.winner = null;
        asf.loser = null;
        asf.status = (asf.slotA && asf.slotB) ? 'ready' : 'pending';
        if (state.lastCelebration && state.lastCelebration.scope === 'ASF') {
          state.lastCelebration = null;
        }
      }
      return;
    }

    const bracket = state.periods[period].bracket;
    if (!bracket) return;
    const matches = bracket.matches;
    const start = matches[matchId];
    if (!start) return;

    const toClear = new Set();
    const queue = [];

    function enqueueChildren(m) {
      if (m.winnerTo) {
        const t = matches[m.winnerTo.matchId];
        assignSlot(t, m.winnerTo.slot, null);
        if (!toClear.has(t.id)) {
          toClear.add(t.id);
          queue.push(t.id);
        }
      }
      if (m.loserTo) {
        const t = matches[m.loserTo.matchId];
        assignSlot(t, m.loserTo.slot, null);
        if (!toClear.has(t.id)) {
          toClear.add(t.id);
          queue.push(t.id);
        }
      }
      if (m.id === 'GF-1' && matches['GF-2'] && !toClear.has('GF-2')) {
        matches['GF-2'].slotA = null;
        matches['GF-2'].slotB = null;
        toClear.add('GF-2');
        queue.push('GF-2');
      }
    }

    enqueueChildren(start);

    while (queue.length > 0) {
      const id = queue.shift();
      const m = matches[id];
      m.scoreA = 0;
      m.scoreB = 0;
      m.bouts = [];
      m.winner = null;
      m.loser = null;
      m.status = 'pending';
      enqueueChildren(m);
    }

    if (resetSelf) {
      start.scoreA = 0;
      start.scoreB = 0;
      start.bouts = [];
      start.winner = null;
      start.loser = null;
      start.status = (start.slotA && start.slotB && start.slotA !== BYE && start.slotB !== BYE) ? 'ready' : 'pending';
    }

    propagatePeriodBracket(bracket);
    syncAllSchoolFinal(state);

    if (state.lastCelebration && (state.lastCelebration.scope === period || state.lastCelebration.scope === 'ASF')) {
      if (!bracket.championId && state.lastCelebration.scope === period) {
        state.lastCelebration = null;
      }
      if (state.allSchoolFinal.status !== 'completed' && state.lastCelebration && state.lastCelebration.scope === 'ASF') {
        state.lastCelebration = null;
      }
    }
    state.updatedAt = Date.now();
  }

  function getReadyMatches(state, period) {
    if (period === 'ASF') {
      const asf = state.allSchoolFinal;
      return (asf.status === 'ready' || asf.status === 'in_progress') ? [asf] : [];
    }
    const bracket = state.periods[period] && state.periods[period].bracket;
    if (!bracket) return [];
    const list = [];
    for (const id of bracket.matchOrder) {
      const m = bracket.matches[id];
      if (m.status === 'ready' || m.status === 'in_progress') {
        list.push(m);
      }
    }
    // Sort: in_progress first, then lower round numbers (interleaving W and L cleanly)
    list.sort((a, b) => {
      if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
      if (b.status === 'in_progress' && a.status !== 'in_progress') return 1;
      const rank = m => {
        if (m.bracket === 'W') return m.round * 2 - 1;
        if (m.bracket === 'L') return m.round + 1.5;
        return 100 + m.round;
      };
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      return a.matchNumber - b.matchNumber;
    });
    return list;
  }

  function getPeriodStats(bracket) {
    if (!bracket) return { total: 0, completed: 0, remaining: 0 };
    let total = 0;
    let completed = 0;
    for (const id of bracket.matchOrder) {
      const m = bracket.matches[id];
      if (m.status === 'bye' || m.status === 'skipped') continue;
      if (id === 'GF-2' && !bracket.resetTriggered && m.status === 'pending') continue;
      total++;
      if (m.status === 'completed') completed++;
    }
    return { total, completed, remaining: Math.max(0, total - completed) };
  }

  function shuffleArray(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  return {
    BYE,
    nextPowerOfTwo,
    standardSeedOrder,
    winsNeeded,
    createInitialState,
    createPeriodBracket,
    propagatePeriodBracket,
    syncAllSchoolFinal,
    getMatch,
    getBotById,
    recordBoutWin,
    undoLastBout,
    getDownstreamAffectedMatches,
    clearDownstreamFromMatch,
    getReadyMatches,
    getPeriodStats,
    shuffleArray
  };
}));
