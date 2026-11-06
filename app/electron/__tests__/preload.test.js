const mockInvoke = jest.fn();
const mockSend = jest.fn();

jest.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: jest.fn() },
  ipcRenderer: { invoke: mockInvoke, send: mockSend }
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
});
