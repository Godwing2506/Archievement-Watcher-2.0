'use strict';

const steamID = require('../steamID.js');

describe('steamID', () => {
  describe('to64', () => {
    it('converts individual account ID to SteamID64', () => {
      const result = steamID.to64(12345);
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^7656\d{13}$/);
    });
    it('handles zero', () => {
      expect(steamID.to64(0)).toBe('76561197960265728');
    });
  });
});
