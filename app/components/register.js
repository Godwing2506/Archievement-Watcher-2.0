import titleBar from './titleBar/titleBar.js';

customElements.define('title-bar', titleBar);

async function registerUserAvatar() {
  try {
    const { default: userAvatar } = await import('./userAvatar/index.js');
    customElements.define('user-avatar', userAvatar);
  } catch (error) {
    console.error('Unable to register the user avatar component.', error);
  }

  try {
    await window.api.componentsLoaded();
  } catch (error) {
    console.error('Unable to finish component initialization.', error);
  }
}

registerUserAvatar();