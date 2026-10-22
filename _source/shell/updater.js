// Cập nhật nóng từ repo GitHub: tải thư mục app/ mới về userData/updates/<version>, khởi động lại để dùng.
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const cmp = (a, b) => {
  const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0), pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
  return 0;
};
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

class Updater {
  constructor({ userData, bundledDir, shellVersion, fetch, relaunch }) {
    Object.assign(this, { userData, bundledDir, shellVersion, fetch, relaunch });
    this.dir = path.join(userData, 'updates'); fs.mkdirSync(this.dir, { recursive: true });
    this.bundledVersion = (readJson(path.join(bundledDir, 'version.json')) || {}).version || '0.0.0';
    this.repo = { owner: 'koddrawer', repo: 'steampunk-writer-updates', branch: 'main' };
    this.status = { state: 'idle', message: '' }; this.listeners = []; this.busy = false;
  }
  onStatus(f) { this.listeners.push(f); }
  set(s) { this.status = { ...s, running: this.running && this.running.version, at: Date.now() }; this.listeners.forEach(f => f(this.status)); }
  configure(r) { this.repo = { ...this.repo, ...r }; }

  // chọn thư mục app để chạy: bản cập nhật mới nhất hợp lệ, nếu không thì bản cài sẵn
  resolve() {
    const act = readJson(path.join(this.dir, 'active.json'));
    const bad = readJson(path.join(this.dir, 'bad.json'), []);
    if (act && act.version && cmp(act.version, this.bundledVersion) > 0 && !bad.includes(act.version)
        && fs.existsSync(path.join(act.dir, 'core', 'core.js')) && cmp(this.shellVersion, act.minShell || '0') >= 0) {
      this.running = { dir: act.dir, version: act.version, source: 'update' };
    } else this.running = { dir: this.bundledDir, version: this.bundledVersion, source: 'bundled' };
    return this.running;
  }
  markBad(version) {
    const f = path.join(this.dir, 'bad.json'); const bad = readJson(f, []);
    if (!bad.includes(version)) bad.push(version); fs.writeFileSync(f, JSON.stringify(bad));
  }

  async getText(url, accept) {
    const r = await this.fetch(url, { headers: { 'User-Agent': 'steampunk-writer-updater', 'Cache-Control': 'no-cache', ...(accept ? { Accept: accept } : {}) } });
    if (!r.ok) throw new Error(`HTTP ${r.status} – ${url}`);
    return r;
  }
  async remoteVersion() {
    const { owner, repo, branch } = this.repo;
    try {
      const r = await this.getText(`https://api.github.com/repos/${owner}/${repo}/contents/version.json?ref=${encodeURIComponent(branch)}`, 'application/vnd.github.raw+json');
      return JSON.parse(await r.text());
    } catch (e) {
      const r = await this.getText(`https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/version.json?t=${Date.now()}`);
      return JSON.parse(await r.text());
    }
  }

  async check(manual) {
    if (this.busy) return this.status;
    if (this.status.state === 'ready' && !manual) return this.status;
    this.busy = true;
    try {
      this.set({ state: 'checking', message: 'Đang kiểm tra cập nhật…' });
      const rv = await this.remoteVersion();
      const have = Math.max(0, cmp(this.running.version, '0')) >= 0 ? this.running.version : '0.0.0';
      const staged = readJson(path.join(this.dir, 'active.json'));
      if (cmp(rv.version, have) <= 0) { this.set({ state: 'uptodate', message: `Đang dùng bản mới nhất (v${have})` }); return this.status; }
      if (rv.minShell && cmp(this.shellVersion, rv.minShell) < 0) {
        this.set({ state: 'error', message: `Bản v${rv.version} cần cài lại bộ cài mới (shell ≥ ${rv.minShell}).` }); return this.status;
      }
      if (staged && staged.version === rv.version && fs.existsSync(path.join(staged.dir, 'core', 'core.js'))) {
        this.set({ state: 'ready', version: rv.version, notes: rv.notes || '', message: `Đã tải v${rv.version} – khởi động lại để dùng` }); return this.status;
      }
      await this.download(rv);
    } catch (e) {
      this.set({ state: 'error', message: 'Không kiểm tra được cập nhật: ' + (e.message || e) });
    } finally { this.busy = false; }
    return this.status;
  }

  async download(rv) {
    const { owner, repo, branch } = this.repo;
    this.set({ state: 'downloading', message: `Đang tải v${rv.version}…`, version: rv.version });
    const r = await this.getText(`https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${encodeURIComponent(branch)}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const zip = new AdmZip(buf);
    const entries = zip.getEntries();
    const top = entries[0].entryName.split('/')[0];
    const prefix = `${top}/app/`;
    const tmp = path.join(this.dir, `${rv.version}.tmp`);
    fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
    let n = 0;
    for (const e of entries) {
      if (!e.entryName.startsWith(prefix) || e.isDirectory) continue;
      const rel = e.entryName.slice(prefix.length);
      const dst = path.join(tmp, rel);
      if (!path.normalize(dst).startsWith(path.normalize(tmp))) continue;
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, e.getData()); n++;
    }
    const v = readJson(path.join(tmp, 'version.json'));
    if (!v || !fs.existsSync(path.join(tmp, 'core', 'core.js'))) throw new Error('Gói cập nhật thiếu app/version.json hoặc app/core/core.js');
    const final = path.join(this.dir, v.version);
    fs.rmSync(final, { recursive: true, force: true });
    fs.renameSync(tmp, final);
    fs.writeFileSync(path.join(this.dir, 'active.json'), JSON.stringify({ version: v.version, dir: final, minShell: v.minShell || rv.minShell || '0', at: Date.now() }));
    // dọn bản cũ (giữ bản đang chạy + bản mới)
    for (const d of fs.readdirSync(this.dir)) {
      const full = path.join(this.dir, d);
      if (fs.statSync(full).isDirectory() && full !== final && full !== this.running.dir) fs.rmSync(full, { recursive: true, force: true });
    }
    this.set({ state: 'ready', version: v.version, notes: rv.notes || v.notes || '', message: `Đã tải v${v.version} (${n} file) – khởi động lại để dùng` });
  }

  apply() { this.relaunch(); }
}
module.exports = { Updater, cmp };
