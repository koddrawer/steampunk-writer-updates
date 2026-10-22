// Vỏ ứng dụng (không cập nhật nóng): đăng ký giao thức, chọn bản app mới nhất rồi chạy core.
const { app, protocol, net, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { Updater } = require('./updater.js');

const SHELL_VERSION = require('../package.json').version;

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.whenReady().then(async () => {
    const updater = new Updater({
      userData: app.getPath('userData'), bundledDir: path.join(__dirname, '..', 'app'), shellVersion: SHELL_VERSION,
      fetch: (u, o) => net.fetch(u, o), relaunch: () => { app.relaunch(); app.exit(0); },
    });
    let run = updater.resolve();
    const boot = async (r) => {
      const start = require(path.join(r.dir, 'core', 'core.js'));
      await start({ appDir: r.dir, appVersion: r.version, appSource: r.source, shellVersion: SHELL_VERSION, updater, require });
    };
    try { await boot(run); }
    catch (e) {
      console.error('Lỗi khởi động bản', run.version, e);
      if (run.source === 'update') {
        updater.markBad(run.version);
        dialog.showErrorBox('Bản cập nhật lỗi', `Bản v${run.version} không chạy được, quay về bản cài sẵn.\n\n${e.stack || e}`);
        app.relaunch(); app.exit(0);
      } else {
        dialog.showErrorBox('Lỗi khởi động', String(e.stack || e)); app.exit(1);
      }
    }
  });
  app.on('window-all-closed', () => app.quit());
}
