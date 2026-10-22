const v = document.getElementById('v');
let cur = null;
document.getElementById('hide').onclick = () => window.api.send('popup:hide');
window.api.on('video:play', (m) => {
  cur = m;
  v.style.objectFit = m.fit || 'contain';
  v.loop = !!m.loop; v.volume = Math.max(0, Math.min(1, m.volume ?? 1)); v.muted = false;
  v.src = m.url;
  v.play().catch(err => { v.muted = true; v.play().catch(() => window.api.send('video:error', { url: m.url, err: String(err) })); });
});
window.api.on('video:stop', () => { v.pause(); v.removeAttribute('src'); v.load(); cur = null; });
window.api.on('video:blank', (m) => { if (m.mode === 'black') { v.pause(); v.removeAttribute('src'); v.load(); } else v.pause(); });
v.addEventListener('ended', () => { if (cur) window.api.send('video:ended', { url: cur.url }); cur = null; });
v.addEventListener('error', () => { if (cur) window.api.send('video:error', { url: cur.url }); cur = null; });
