'use strict';

import { template } from './template.js';

const { getAvatar } = require('./avatar.js');
const { contextMenu } = require('./contextMenu.js');
const { DEFAULT_LABELS, getLabels } = require('./cropEditor.js');
const { normalizeCrop } = require('./crop.js');
const { selectFileDialog } = require('./selectFileDialog.js');

export default class UserAvatar extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = template;
    this.avatarImage = this.shadowRoot.querySelector('#avatar-image');
    this.steamUsers = [];
    this.labels = getLabels(DEFAULT_LABELS);
    this.isSelectingAvatar = false;

    this.handleAvatarClick = () => this.openFilePicker();
    this.handleAvatarKeydown = event => {
      if (this.shadowRoot.querySelector('#avatar-editor').open) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      this.openFilePicker();
    };
    this.handleContextMenu = event => {
      if (this.shadowRoot.querySelector('#avatar-editor').open) {
        event.preventDefault();
        return;
      }
      contextMenu.call(this, event);
    };
  }

  connectedCallback() {
    this.avatarImage.addEventListener('click', this.handleAvatarClick);
    this.addEventListener('keydown', this.handleAvatarKeydown);
    this.addEventListener('contextmenu', this.handleContextMenu, false);
    this.setAttribute('role', 'button');
    this.setAttribute('tabindex', '0');
    this.setAttribute('aria-haspopup', 'dialog');
    this.setLabels(this.labels);

    if (localStorage.getItem('avatarSquared') === 'true') {
      this.classList.remove('round');
    } else {
      this.classList.add('round');
    }

    this.update();
  }

  disconnectedCallback() {
    this.avatarImage.removeEventListener('click', this.handleAvatarClick);
    this.removeEventListener('keydown', this.handleAvatarKeydown);
    this.removeEventListener('contextmenu', this.handleContextMenu, false);
  }

  openFilePicker() {
    if (this.isSelectingAvatar) return;
    this.isSelectingAvatar = true;
    selectFileDialog.call(this)
      .catch(error => console.error('Unable to open the avatar image picker.', error))
      .finally(() => {
        this.isSelectingAvatar = false;
      });
  }

  setLabels(labels = {}) {
    this.labels = getLabels(labels);
    this.setAttribute('aria-label', this.labels.change);
  }

  async update() {
    try {
      const source = await getAvatar();
      this.avatarImage.src = source;
      await this.avatarImage.decode();
      const crop = this.readSavedCrop();
      const normalizedCrop = normalizeCrop(
        crop,
        this.avatarImage.naturalWidth,
        this.avatarImage.naturalHeight
      );
      this.avatarImage.style.transform =
        `translate(${normalizedCrop.x * 100}%, ${normalizedCrop.y * 100}%) scale(${normalizedCrop.zoom})`;
    } catch (error) {
      this.avatarImage.removeAttribute('src');
      this.avatarImage.style.transform = '';
      console.warn('Unable to load the profile avatar; using the default image.', error);
    }
  }

  readSavedCrop() {
    const storedCrop = localStorage.getItem('avatarCrop');
    if (!storedCrop) return {};

    try {
      return JSON.parse(storedCrop);
    } catch (error) {
      console.error('Saved avatar framing is invalid; resetting it.', error);
      localStorage.removeItem('avatarCrop');
      return {};
    }
  }
}
