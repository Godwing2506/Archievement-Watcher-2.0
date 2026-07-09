'use strict';

/**
 * Tests for safe parsing of Steam store page data (name as text, icon null-safe).
 * Uses the same logic as steam.js getGameNameFromStorePage without HTTP.
 */
const path = require('path');

describe('steam path and safe parse', () => {
  it('path.join with PROGRAMDATA and Steam and * does not concatenate string', () => {
    const dir = path.join(process.env['PROGRAMDATA'] || '', 'Steam', '*');
    expect(dir).not.toMatch(/undefined/);
    expect(dir).toContain('Steam');
  });

  it('safe name extraction: prefer textContent over innerHTML', () => {
    const htmlParser = require('node-html-parser');
    const html = htmlParser.parse('<div class="apphub_AppName">Test &amp; <b>Game</b></div>');
    const nameEl = html.querySelector('.apphub_AppName');
    const name = (nameEl && (nameEl.textContent || nameEl.innerText || '').trim()) || '';
    expect(name).toBe('Test & Game');
    expect(name).not.toContain('<');
  });

  it('safe icon extraction: handles missing img', () => {
    const htmlParser = require('node-html-parser');
    const html = htmlParser.parse('<div class="apphub_AppIcon"></div>');
    const iconEl = html.querySelector('.apphub_AppIcon img');
    const srcAttr = iconEl && iconEl.attributes && iconEl.attributes.src;
    const iconMatch = (typeof srcAttr === 'string' && srcAttr.match(/([^\\\/\:\*\?\"\<\>\|])+$/));
    const icon = (iconMatch && iconMatch[0]) ? iconMatch[0].replace('.jpg', '') : '';
    expect(icon).toBe('');
  });
});
