'use strict';

const { MAX_ZOOM, normalizeCrop } = require('../crop.js');

describe('avatar crop geometry', () => {
  it('fits the entire image without offset at the initial zoom', () => {
    expect(normalizeCrop({ zoom: 1, x: 0.4, y: -0.3 }, 1600, 900)).toEqual({
      zoom: 1,
      x: 0,
      y: 0,
    });
  });

  it('clamps a zoomed landscape image to horizontal crop bounds', () => {
    expect(normalizeCrop({ zoom: 2, x: 0.8, y: -0.2 }, 1600, 900)).toEqual({
      zoom: 2,
      x: 0.5,
      y: -0.0625,
    });
  });

  it('clamps a zoomed portrait image to vertical crop bounds', () => {
    expect(normalizeCrop({ zoom: 2, x: -0.2, y: -0.8 }, 900, 1600)).toEqual({
      zoom: 2,
      x: -0.0625,
      y: -0.5,
    });
  });

  it('uses safe defaults and limits zoom to the supported range', () => {
    expect(normalizeCrop({ zoom: MAX_ZOOM + 1, x: NaN, y: Infinity }, 1, 1)).toEqual({
      zoom: MAX_ZOOM,
      x: 0,
      y: 0,
    });
  });

  it('rejects invalid image dimensions', () => {
    expect(() => normalizeCrop({ zoom: 1, x: 0, y: 0 }, 0, 100)).toThrow(
      'Avatar image dimensions must be positive finite numbers.'
    );
  });
});
