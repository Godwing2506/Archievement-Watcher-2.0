'use strict';

const remote = require('@electron/remote');
const { imageFileToBase64 } = require('./avatar.js');
const { openAvatarEditor } = require('./cropEditor.js');

function restoreStorageValue(key, value) {
  if (value === null) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, value);
  }
}

function saveAvatar(source, crop) {
  const previousAvatar = localStorage.getItem('avatar');
  const previousCrop = localStorage.getItem('avatarCrop');

  try {
    localStorage.setItem('avatar', source);
    localStorage.setItem('avatarCrop', JSON.stringify(crop));
  } catch (error) {
    try {
      restoreStorageValue('avatar', previousAvatar);
      restoreStorageValue('avatarCrop', previousCrop);
    } catch (rollbackError) {
      console.error('Unable to restore the previous profile image after a save failure.', rollbackError);
    }
    throw error;
  }
}

async function selectFileDialog() {
  const avatarImage = this.avatarImage;
  avatarImage.setAttribute('aria-disabled', 'true');

  try {
    const dialog = await remote.dialog.showOpenDialog({
      properties: ['openFile', 'showHiddenFiles', 'dontAddToRecent'],
      filters: [{ name: 'Image', extensions: ['jpeg', 'jpg', 'png', 'gif', 'bmp'] }],
    });

    if (!dialog.filePaths || dialog.filePaths.length === 0) return;

    const source = await imageFileToBase64(dialog.filePaths[0]);
    const crop = await openAvatarEditor(
      this.shadowRoot,
      source,
      this.classList.contains('round'),
      this.labels
    );
    if (!crop) return;

    saveAvatar(source, crop);
    await this.update();
  } catch (error) {
    remote.dialog.showMessageBoxSync({
      type: 'error',
      title: 'Unexpected Error',
      message: 'Failed to set avatar.',
      detail: `${error}`,
    });
  } finally {
    avatarImage.removeAttribute('aria-disabled');
  }
}

module.exports = { saveAvatar, selectFileDialog };
