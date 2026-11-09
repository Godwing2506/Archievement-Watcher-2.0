const mockInvoke = jest.fn();
const mockSend = jest.fn();
const mockOn = jest.fn();
const mockRemoveListener = jest.fn();

jest.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: jest.fn() },
  ipcRenderer: {
    invoke: mockInvoke,
    send: mockSend,
    on: mockOn,
    removeListener: mockRemoveListener
  }
}));

describe('window control preload API', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    global.window = {};
    require('../preload.js');
  });

  test('queries whether the window supports minimize and maximize', () => {
    window.api.window.isMinimizable();
    window.api.window.isMaximizable();

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'win-isMinimizable');
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'win-isMaximizable');
  });

  test('routes window control actions to the main process', () => {
    window.api.window.minimize();
    window.api.window.maximize();
    window.api.window.close();

    expect(mockSend).toHaveBeenNthCalledWith(1, 'window:minimize');
    expect(mockSend).toHaveBeenNthCalledWith(2, 'window:maximize');
    expect(mockSend).toHaveBeenNthCalledWith(3, 'window:close');
  });

  test('exposes automatic backup configuration and lifecycle actions', () => {
    const listener = jest.fn();
    const unsubscribe = window.api.autoBackup.onStatus(listener);
    window.api.autoBackup.getStatus();
    window.api.autoBackup.configure({ enabled: true, directoryPath: 'C:\\Backups' });
    window.api.autoBackup.create();
    window.api.autoBackup.suspend();
    window.api.autoBackup.resume();
    unsubscribe();

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'backup:auto:getStatus');
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'backup:auto:configure', {
      enabled: true,
      directoryPath: 'C:\\Backups'
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(3, 'backup:auto:create');
    expect(mockInvoke).toHaveBeenNthCalledWith(4, 'backup:auto:suspend');
    expect(mockInvoke).toHaveBeenNthCalledWith(5, 'backup:auto:resume');
    expect(mockOn).toHaveBeenCalledWith('backup:auto:status', expect.any(Function));
    expect(mockRemoveListener).toHaveBeenCalledWith('backup:auto:status', expect.any(Function));
  });
});
