'use strict';

const fs = require('fs');
const { imageFileToBase64 } = require('../avatar.js');

describe('avatar image data URLs', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the standard JPEG MIME type for JPG files', async () => {
    jest.spyOn(fs.promises, 'readFile').mockResolvedValue(Buffer.from('image data'));

    await expect(imageFileToBase64('profile.jpg')).resolves.toBe(
      'data:image/jpeg;charset=utf-8;base64,aW1hZ2UgZGF0YQ=='
    );
  });
});
