'use strict';

const MAX_ZOOM = 4;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeCrop(crop, imageWidth, imageHeight) {
  if (!Number.isFinite(imageWidth) || imageWidth <= 0 ||
      !Number.isFinite(imageHeight) || imageHeight <= 0) {
    throw new Error('Avatar image dimensions must be positive finite numbers.');
  }

  const zoom = Number.isFinite(crop?.zoom) ? clamp(crop.zoom, 1, MAX_ZOOM) : 1;
  const fitScale = Math.min(1 / imageWidth, 1 / imageHeight);
  const fittedWidth = imageWidth * fitScale * zoom;
  const fittedHeight = imageHeight * fitScale * zoom;
  const maxX = Math.max(0, (fittedWidth - 1) / 2);
  const maxY = Math.max(0, (fittedHeight - 1) / 2);
  const x = Number.isFinite(crop?.x) ? clamp(crop.x, -maxX, maxX) : 0;
  const y = Number.isFinite(crop?.y) ? clamp(crop.y, -maxY, maxY) : 0;

  return {
    zoom,
    x: Object.is(x, -0) ? 0 : x,
    y: Object.is(y, -0) ? 0 : y,
  };
}

module.exports = { MAX_ZOOM, normalizeCrop };
