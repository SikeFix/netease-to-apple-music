// 书签脚本 ①：在 music.163.com 上运行，用当前登录态导出歌单（包括私密的「我喜欢的音乐」）。

async function ncmApi(path, opts) {
  const r = await fetch(path, { credentials: 'include', ...opts });
  const j = await r.json();
  if (j.code !== 200) throw new Error(`${path.split('?')[0]} 返回 ${j.code}${j.message ? '：' + j.message : ''}`);
  return j;
}

async function ncmGetUser() {
  try {
    const j = await ncmApi('/api/nuser/account/get');
    if (j.profile) return { uid: j.profile.userId, nickname: j.profile.nickname };
  } catch (e) { /* 退回到页面全局变量 */ }
  const frame = document.getElementById('g_iframe');
  const g = window.GUser || (frame && frame.contentWindow && frame.contentWindow.GUser);
  if (g && g.userId) return { uid: g.userId, nickname: g.nickname };
  return null;
}

function ncmParsePlaylistId(input) {
  const s = String(input || '');
  const m = s.match(/playlist(?:\?id=|\/)(\d+)/) || s.match(/[?&]id=(\d+)/) || s.match(/^\s*(\d+)\s*$/);
  return m ? m[1] : null;
}

async function ncmExportPlaylist(pid, onProgress) {
  const detail = await ncmApi(`/api/v6/playlist/detail?id=${pid}&n=100000&s=0`);
  const pl = detail.playlist;
  const ids = pl.trackIds.map(t => t.id);
  const byId = new Map();
  for (let i = 0; i < ids.length; i += 500) {
    const batch = ids.slice(i, i + 500);
    const body = new URLSearchParams({ c: JSON.stringify(batch.map(id => ({ id }))) });
    const j = await ncmApi('/api/v3/song/detail', { method: 'POST', body });
    for (const s of j.songs) byId.set(s.id, s);
    onProgress(Math.min(i + 500, ids.length), ids.length);
  }
  const tracks = ids.map(id => byId.get(id)).filter(Boolean).map(s => ({
    id: s.id,
    name: s.name,
    artists: (s.ar || []).map(a => a.name).filter(Boolean),
    album: s.al && s.al.name,
    duration: s.dt,
    alias: [...(s.alia || []), ...(s.tns || [])],
  }));
  return {
    source: 'netease',
    version: 1,
    exportedAt: new Date().toISOString(),
    playlist: { id: pl.id, name: pl.name, creator: pl.creator && pl.creator.nickname },
    tracks,
  };
}

async function ncmMain() {
  if (!/(^|\.)music\.163\.com$/.test(location.hostname)) {
    if (confirm('这个书签需要在网易云音乐网页版（music.163.com）上点击。现在打开吗？')) location.href = 'https://music.163.com/';
    return;
  }
  const ui = createPanel('网易云 → Apple Music · 导出');
  ui.render('<p>正在读取账号信息…</p>');

  let playlists = [];
  const user = await ncmGetUser();
  if (user) {
    try {
      const j = await ncmApi(`/api/user/playlist?uid=${user.uid}&limit=1000&offset=0`);
      playlists = j.playlist || [];
    } catch (e) { ui.error(e); }
  }

  const options = playlists.map(p =>
    `<option value="${p.id}">${esc(p.specialType === 5 ? '❤️ ' + p.name : p.name)}（${p.trackCount} 首${p.creator && p.creator.userId !== user.uid ? '，收藏' : ''}）</option>`).join('');
  ui.render(`
    ${user ? `<p>你好，<b>${esc(user.nickname)}</b>。选择要导出的歌单：</p><select id="pl">${options}</select>`
           : '<p>未检测到登录。请先点页面右上角「登录」，登录后刷新页面再点书签；或直接粘贴<b>公开歌单</b>链接：</p>'}
    <input type="text" id="link" placeholder="（可选）歌单链接或 ID，填了会优先使用">
    <button class="btn" id="go">导出</button>
    <div id="out"></div>`);

  ui.$('#go').onclick = async () => {
    const manual = ui.$('#link').value.trim();
    const pid = manual ? ncmParsePlaylistId(manual) : (ui.$('#pl') && ui.$('#pl').value);
    const out = ui.$('#out');
    if (!pid) {
      out.innerHTML = `<p class="err">${/163cn\.tv/.test(manual) ? '短链接无法直接解析，请在浏览器打开它，复制跳转后的完整链接。' : '没有识别到歌单 ID。'}</p>`;
      return;
    }
    ui.$('#go').disabled = true;
    out.innerHTML = '<div class="bar"><i></i></div><p class="muted" id="st">读取歌单…</p>';
    try {
      const data = await ncmExportPlaylist(pid, (done, total) => {
        out.querySelector('.bar i').style.width = (done / total * 100) + '%';
        out.querySelector('#st').textContent = `已读取 ${done} / ${total} 首`;
      });
      const json = JSON.stringify(data);
      out.innerHTML = `
        <p>✅ 「${esc(data.playlist.name)}」共 <b>${data.tracks.length}</b> 首。</p>
        <button class="btn" id="copy">复制数据</button><button class="btn secondary" id="dl">下载 JSON</button>
        <p class="muted">下一步：打开 <a href="https://music.apple.com/" target="_blank">music.apple.com</a> 并登录，点击「导入 Apple Music」书签，粘贴数据。</p>`;
      ui.$('#copy').onclick = async () => { ui.$('#copy').textContent = (await copyText(json)) ? '已复制 ✓' : '复制失败，请用下载'; };
      ui.$('#dl').onclick = () => downloadFile(`netease-${data.playlist.id}.json`, json);
    } catch (e) {
      out.innerHTML = '';
      ui.error(e);
    } finally {
      ui.$('#go').disabled = false;
    }
  };
}

ncmMain().catch(e => alert('导出失败：' + (e && e.message || e)));
