'use strict';

const ini = require('@xan105/ini');
const {
  statsLocalToAchievements,
  hasClassicAchievementSections,
  buildAchievementStatLinks,
  convertUserStats
} = require('../statsIniAchievements.js');

describe('stats.ini → achievements (RUNE / stat-based emus)', () => {
  const sampleStatsIni = `
[UserStats]
stat_complete_first_day=14
stat_complete_quota=1
stat_take_first_tool=2
stat_upgrade_building=1
stat_perfect_day=14
stat_earn_money_50000=45200
stat_kill_rat=0
`;

  it('detects empty achievements.ini as non-classic', () => {
    const empty = ini.parse('[SteamAchievements]\nCount=0\n');
    expect(hasClassicAchievementSections(empty)).toBe(false);
  });

  it('builds links from Steam API progress metadata', () => {
    const links = buildAchievementStatLinks([
      { name: 'ACH_01', progress: { stat_name: 'stat_complete_first_day', max_val: '1' } },
      { name: 'ACH_15', progress: { stat_name: 'stat_earn_money_50000', max_val: '50000' } }
    ]);
    expect(links).toHaveLength(2);
    expect(links[0].ach).toBe('ACH_01');
    expect(links[1].max).toBe(50000);
  });

  it('maps UserStats via fallback data for Quarantine Zone (3419520)', () => {
    const local = ini.parse(sampleStatsIni);
    const result = statsLocalToAchievements(local, '3419520', 'latam');
    expect(result.ACH_01.Achieved).toBe(1);
    expect(result.ACH_02.Achieved).toBe(1);
    expect(result.ACH_04.Achieved).toBe(1);
    expect(result.ACH_21.Achieved).toBe(1);
    expect(result.ACH_15.Achieved).toBe(0);
    expect(result.ACH_10.Achieved).toBe(0);
  });

  it('returns null when no stat links exist for the app', () => {
    const local = ini.parse(sampleStatsIni);
    expect(statsLocalToAchievements(local, '264710')).toBeNull();
  });

  it('supports multiple thresholds on the same stat', () => {
    const userStats = { stat_kill_rat: 30 };
    const links = [
      { ach: 'ACH_10', stat: 'stat_kill_rat', max: 1 },
      { ach: 'ACH_11', stat: 'stat_kill_rat', max: 30 }
    ];
    const result = convertUserStats(userStats, links);
    expect(result.ACH_10.Achieved).toBe(1);
    expect(result.ACH_11.Achieved).toBe(1);
  });
});
