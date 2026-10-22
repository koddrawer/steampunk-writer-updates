const { contextBridge, ipcRenderer } = require('electron');
const role = (typeof location !== 'undefined' && location.pathname.split('/').pop().replace('.html', '')) || '';
contextBridge.exposeInMainWorld('api', {
  role,
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  invoke: (name, ...args) => ipcRenderer.invoke('rpc', name, ...args),
  send: (ch, data) => ipcRenderer.send(ch, data),
  on: (ch, cb) => { const f = (_e, d) => cb(d); ipcRenderer.on(ch, f); return () => ipcRenderer.removeListener(ch, f); },
  mediaUrl: (p) => !p ? '' : /^(media|app|https?|data|blob):/.test(p) ? p : 'media://local/' + encodeURIComponent(p),
});
