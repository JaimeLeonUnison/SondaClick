// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ipcRenderer, contextBridge } = require('electron');

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(channel: string, listener: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void): void {
    return ipcRenderer.on(channel, (event: Electron.IpcRendererEvent, ...args: unknown[]) => listener(event, ...args));
  },
  off(channel: string, listener: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void): void {
    return ipcRenderer.off(channel, listener);
  },
  send(channel: string, ...args: unknown[]): void {
    return ipcRenderer.send(channel, ...args);
  },
  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    return ipcRenderer.invoke(channel, ...args);
  }
});

// Using module.exports for CommonJS compatibility
module.exports = {};
