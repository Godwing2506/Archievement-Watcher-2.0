'use strict';

const { normalizeGoldbergUserAchievements } = require('../goldbergAchievements.js');

describe('Goldberg user achievements parsing', () => {
  it('converts gbe_fork earned object to achievement map', () => {
    const input = {
      FIRST_TIME: { earned: true, earned_time: 1700000000, progress: 1, max_progress: 1 },
      JACKPOT: { earned: false, earned_time: 0, progress: 25000, max_progress: 50000 }
    };
    const result = normalizeGoldbergUserAchievements(input);
    expect(result.FIRST_TIME.Achieved).toBe(1);
    expect(result.FIRST_TIME.UnlockTime).toBe(1700000000);
    expect(result.FIRST_TIME.CurProgress).toBe(1);
    expect(result.JACKPOT.Achieved).toBe(0);
    expect(result.JACKPOT.CurProgress).toBe(25000);
  });

  it('returns null for schema arrays (not user progress)', () => {
    expect(normalizeGoldbergUserAchievements([{ name: 'ACH1', displayName: 'Test' }])).toBeNull();
  });

  it('returns null for classic CODEX ini-shaped objects without earned', () => {
    expect(normalizeGoldbergUserAchievements({
      NEW_ACHIEVEMENT_1_1: { Achieved: 1, UnlockTime: 0 }
    })).toBeNull();
  });
});
