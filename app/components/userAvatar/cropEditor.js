'use strict';

const { MAX_ZOOM, normalizeCrop } = require('./crop.js');

const DEFAULT_LABELS = Object.freeze({
  change: 'Change profile image',
  title: 'Adjust profile image',
  instructions: 'The full image is shown first. Drag to reposition and use the slider to zoom.',
  preview: 'Avatar crop preview. Use arrow keys to reposition.',
  zoom: 'Zoom',
  cancel: 'Cancel',
  save: 'Save image',
});

function requiredElement(root, selector) {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Avatar editor is missing ${selector}.`);
  return element;
}

function getLabels(labels = {}) {
  return Object.fromEntries(
    Object.keys(DEFAULT_LABELS).map(key => [key, labels?.[key] || DEFAULT_LABELS[key]])
  );
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The selected file is not a supported image.'));
    image.src = source;
  });
}

async function openAvatarEditor(root, source, isRound, labels) {
  const dialog = requiredElement(root, '#avatar-editor');
  if (dialog.open) throw new Error('The avatar editor is already open.');

  const [preview, viewport, zoomControl] = [
    requiredElement(root, '#crop-image'),
    requiredElement(root, '#crop-viewport'),
    requiredElement(root, '#zoom-control'),
  ];
  const [title, instructions, zoomLabel, cancelButton, saveButton] = [
    requiredElement(root, '#avatar-editor-title'),
    requiredElement(root, '#avatar-editor-instructions'),
    requiredElement(root, '#zoom-label'),
    requiredElement(root, '[data-action="cancel"]'),
    requiredElement(root, '[data-action="save"]'),
  ];
  const localized = getLabels(labels);
  const image = await loadImage(source);

  title.textContent = localized.title;
  instructions.textContent = localized.instructions;
  viewport.setAttribute('aria-label', localized.preview);
  zoomLabel.textContent = localized.zoom;
  zoomControl.setAttribute('aria-label', localized.zoom);
  cancelButton.textContent = localized.cancel;
  saveButton.textContent = localized.save;
  viewport.classList.toggle('round', isRound);
  preview.src = source;

  let crop = normalizeCrop({}, image.naturalWidth, image.naturalHeight);
  let drag = null;
  const listeners = [];
  const listen = (element, type, handler) => {
    element.addEventListener(type, handler);
    listeners.push(() => element.removeEventListener(type, handler));
  };
  const cleanup = () => listeners.forEach(remove => remove());
  const render = () => {
    crop = normalizeCrop(crop, image.naturalWidth, image.naturalHeight);
    preview.style.transform = `translate(${crop.x * 100}%, ${crop.y * 100}%) scale(${crop.zoom})`;
    zoomControl.value = String(crop.zoom);
    zoomControl.setAttribute('aria-valuetext', `${Math.round(crop.zoom * 100)}%`);
  };

  render();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      cleanup();
      if (dialog.open) dialog.close(result ? 'save' : 'cancel');
      resolve(result);
    };

    listen(zoomControl, 'input', () => {
      crop = normalizeCrop(
        { ...crop, zoom: Number(zoomControl.value) },
        image.naturalWidth,
        image.naturalHeight
      );
      render();
    });

    listen(viewport, 'pointerdown', event => {
      if (event.button !== 0) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      viewport.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    listen(viewport, 'pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const bounds = viewport.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;

      crop = normalizeCrop({
        ...crop,
        x: crop.x + (event.clientX - drag.x) / bounds.width,
        y: crop.y + (event.clientY - drag.y) / bounds.height,
      }, image.naturalWidth, image.naturalHeight);
      drag = { ...drag, x: event.clientX, y: event.clientY };
      render();
    });

    const endDrag = event => {
      if (drag && drag.id === event.pointerId) drag = null;
    };
    listen(viewport, 'pointerup', endDrag);
    listen(viewport, 'pointercancel', endDrag);

    listen(viewport, 'keydown', event => {
      const step = event.shiftKey ? 0.05 : 0.015;
      const offsets = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (!offsets[event.key]) return;

      event.preventDefault();
      const [x, y] = offsets[event.key];
      crop = normalizeCrop({
        ...crop,
        x: crop.x + x,
        y: crop.y + y,
      }, image.naturalWidth, image.naturalHeight);
      render();
    });

    listen(cancelButton, 'click', () => finish(null));
    listen(saveButton, 'click', () => finish(crop));
    listen(dialog, 'cancel', event => {
      event.preventDefault();
      finish(null);
    });

    try {
      dialog.showModal();
      viewport.focus();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

module.exports = { DEFAULT_LABELS, MAX_ZOOM, getLabels, openAvatarEditor };
