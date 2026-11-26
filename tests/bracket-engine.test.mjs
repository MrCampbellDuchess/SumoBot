import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Engine = require('../js/bracket-engine.js');

function makeBots(period, count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${period.toLowerCase()}-b${i + 1}`,
    name: `${period} Bot ${i + 1}`
  }));
}

function playMatchToWin(state, period, matchId, winnerSide) {
  const m = Engine.getMatch(state, period, matchId);
  const needed = Engine.winsNeeded(m.bestOf);
  let res;
  for (let i = 0; i < needed; i++) {
    res = Engine.recordBoutWin(state, period, matchId, winnerSide);
  }
  return res;
}

// 1. Test full tournament simulation across sizes 2..20 (both Winners champ winning GF-1 and Losers champ forcing Reset)
for (const size of [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 16, 17, 20]) {
  for (const forceReset of [false, true]) {
    const state = Engine.createInitialState();
    state.periods.P2.bots = makeBots('P2', size);
    state.periods.P2.bracket = Engine.createPeriodBracket('P2', state.periods.P2.bots);

    let steps = 0;
    while (!state.periods.P2.bracket.championId) {
      const ready = Engine.getReadyMatches(state, 'P2');
      assert.ok(ready.length > 0, `Size ${size} (reset=${forceReset}) deadlocked with no ready matches!`);
      const m = ready[0];

      // Check Bo3 vs Bo5 rules
      if (m.id === 'GF-1' || m.id === 'GF-2') {
        assert.equal(m.bestOf, 5, `${m.id} must be Bo5`);
      } else {
        assert.equal(m.bestOf, 3, `${m.id} must be Bo3`);
      }

      let winnerSide = 'a';
      if (m.id === 'GF-1' && forceReset) winnerSide = 'b';
      if (m.id === 'GF-2') winnerSide = 'b';

      playMatchToWin(state, 'P2', m.id, winnerSide);
      steps++;
      assert.ok(steps < 200, `Size ${size} exceeded step limit`);
    }

    const b = state.periods.P2.bracket;
    assert.ok(b.championId, `Size ${size} must crown a champion`);
    assert.ok(b.runnerUpId && b.runnerUpId !== b.championId, `Size ${size} must have distinct runner-up`);
    assert.equal(b.resetTriggered, forceReset, `Size ${size} resetTriggered mismatch`);
    if (forceReset) {
      assert.equal(b.matches['GF-2'].status, 'completed', `Size ${size} GF-2 should complete on reset`);
    } else {
      assert.equal(b.matches['GF-2'].status, 'skipped', `Size ${size} GF-2 should be skipped when W champ wins`);
    }

    // Verify exact double-elimination match count:
    // Without reset: 2*N - 2 played matches; With reset: 2*N - 1 played matches!
    const expectedPlayed = forceReset ? (2 * size - 1) : (2 * size - 2);
    assert.equal(steps, expectedPlayed, `Size ${size} (reset=${forceReset}) expected ${expectedPlayed} played matches, got ${steps}`);
  }
}

// 2. Test P2 + P3 -> All-School Final (Best-of-5)
{
  const state = Engine.createInitialState();
  state.periods.P2.bots = makeBots('P2', 6);
  state.periods.P3.bots = makeBots('P3', 9);
  state.periods.P2.bracket = Engine.createPeriodBracket('P2', state.periods.P2.bots);
  state.periods.P3.bracket = Engine.createPeriodBracket('P3', state.periods.P3.bots);

  for (const period of ['P2', 'P3']) {
    while (!state.periods[period].bracket.championId) {
      const m = Engine.getReadyMatches(state, period)[0];
      playMatchToWin(state, period, m.id, 'a');
    }
  }

  assert.equal(state.allSchoolFinal.status, 'ready');
  assert.equal(state.allSchoolFinal.bestOf, 5);
  assert.equal(state.allSchoolFinal.slotA, state.periods.P2.bracket.championId);
  assert.equal(state.allSchoolFinal.slotB, state.periods.P3.bracket.championId);

  // Play 3-2 thriller in All-School Final
  Engine.recordBoutWin(state, 'ASF', 'ASF-1', 'a');
  Engine.recordBoutWin(state, 'ASF', 'ASF-1', 'b');
  Engine.recordBoutWin(state, 'ASF', 'ASF-1', 'a');
  Engine.recordBoutWin(state, 'ASF', 'ASF-1', 'b');
  assert.equal(state.allSchoolFinal.status, 'in_progress');
  const fin = Engine.recordBoutWin(state, 'ASF', 'ASF-1', 'b');
  assert.equal(fin.matchJustFinished, true);
  assert.equal(fin.tournamentJustFinished, true);
  assert.equal(state.allSchoolFinal.winner, state.periods.P3.bracket.championId);
}

// 3. Test Undo + Downstream Edit Detection & Clear
{
  const state = Engine.createInitialState();
  state.periods.P2.bots = makeBots('P2', 4);
  state.periods.P2.bracket = Engine.createPeriodBracket('P2', state.periods.P2.bots);

  // Play W1-1 (2-0) and W1-2 (2-0)
  playMatchToWin(state, 'P2', 'W1-1', 'a');
  playMatchToWin(state, 'P2', 'W1-2', 'a');

  // Undo last bout of W1-2 (no downstream played yet -> succeeds!)
  const u1 = Engine.undoLastBout(state, 'P2', 'W1-2');
  assert.equal(u1.ok, true);
  assert.equal(state.periods.P2.bracket.matches['W1-2'].status, 'in_progress');
  assert.equal(state.periods.P2.bracket.matches['W2-1'].slotB, null);

  // Finish W1-2 and start W2-1
  Engine.recordBoutWin(state, 'P2', 'W1-2', 'a');
  Engine.recordBoutWin(state, 'P2', 'W2-1', 'a');

  // Now W1-2 has downstream affected match W2-1
  const affected = Engine.getDownstreamAffectedMatches(state, 'P2', 'W1-2');
  assert.equal(affected.length, 1);
  assert.equal(affected[0].matchId, 'W2-1');

  // Simple undo should refuse with affected list
  const u2 = Engine.undoLastBout(state, 'P2', 'W1-2');
  assert.equal(u2.ok, false);

  // Explicit clearDownstreamFromMatch resets W2-1 and re-opens W1-2
  Engine.clearDownstreamFromMatch(state, 'P2', 'W1-2', true);
  assert.equal(state.periods.P2.bracket.matches['W1-2'].status, 'ready');
  assert.equal(state.periods.P2.bracket.matches['W2-1'].status, 'pending');
  assert.equal(state.periods.P2.bracket.matches['W2-1'].scoreA, 0);
}

console.log('ALL BRACKET ENGINE TESTS PASSED!');
