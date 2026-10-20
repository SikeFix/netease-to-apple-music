// 书签脚本 ②：在 music.apple.com 上运行，借用网页播放器自带的 MusicKit 实例搜索曲库、创建歌单。

const AM_API = 'https://amp-api.music.apple.com';
const CACHE_PREFIX = 'ncm2am:v1:';

function amKit() {
  const m = window.MusicKit && MusicKit.getInstance && MusicKit.getInstance();
  if (!m || !m.developerToken) throw new Error('页面里没找到 MusicKit，请等页面完全加载后再点书签。');
  return m;
}

async function amFetch(path, opts = {}, tries = 0) {
  const m = amKit();
  const headers = { Authorization: 'Bearer ' + m.developerToken };
  if (m.musicUserToken) headers['Media-User-Token'] = m.musicUserToken;
  if (opts.body) headers['Content-Type'] = 'application/json';
  const r = await fetch(AM_API + path, { ...opts, headers });
  if ((r.status === 429 || r.status >= 500) && tries < 5) {
    await sleep(1000 * 2 ** tries);
    return amFetch(path, opts, tries + 1);
  }
  if (!r.ok) throw new Error(`Apple Music 接口 ${r.status}：${path.split('?')[0]}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

function cacheGet(key) {
  try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + key)); } catch (e) { return null; }
}
function cacheSet(key, val) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(val)); } catch (e) { /* 存储满了就不缓存 */ }
}

async function amMatchTrack(track, sf) {
  const key = `${sf}:${track.id}:${track.name}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  let best = null;
  for (const term of searchTerms(track)) {
    const j = await amFetch(`/v1/catalog/${sf}/search?types=songs&limit=10&term=${encodeURIComponent(term)}`);
    const songs = ((j && j.results && j.results.songs && j.results.songs.data) || [])
      .map(s => ({ id: s.id, ...s.attributes }));
    const b = pickBest(track, songs);
    if (b && (!best || b.score > best.score)) best = b;
    if (best && best.score >= 0.8) break;
  }
  const result = best
    ? { id: best.cand.id, name: best.cand.name, artistName: best.cand.artistName, albumName: best.cand.albumName, url: best.cand.url, score: best.score }
    : { score: 0 };
  cacheSet(key, result);
  return result;
}

async function amCreatePlaylist(name, description, ids, onProgress) {
  const created = await amFetch('/v1/me/library/playlists', {
    method: 'POST',
    body: JSON.stringify({ attributes: { name, description } }),
  });
  const pid = created.data[0].id;
  for (let i = 0; i < ids.length; i += 100) {
    await amFetch(`/v1/me/library/playlists/${pid}/tracks`, {
      method: 'POST',
      body: JSON.stringify({ data: ids.slice(i, i + 100).map(id => ({ id, type: 'songs' })) }),
    });
    onProgress(Math.min(i + 100, ids.length), ids.length);
  }
  return pid;
}

async function amLoveSongs(ids, onProgress) {
  let done = 0;
  await pool(ids, 3, async id => {
    await amFetch(`/v1/me/ratings/songs/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ type: 'rating', attributes: { value: 1 } }),
    });
    onProgress(++done, ids.length);
  });
}

async function amAddToLibrary(ids, onProgress) {
  for (let i = 0; i < ids.length; i += 50) {
    await amFetch(`/v1/me/library?ids[songs]=${ids.slice(i, i + 50).join(',')}`, { method: 'POST' });
    onProgress(Math.min(i + 50, ids.length), ids.length);
  }
}

function toCsv(rows) {
  const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  return '﻿' + rows.map(r => r.map(q).join(',')).join('\n');
}

async function amMain() {
  if (location.hostname !== 'music.apple.com') {
    if (confirm('这个书签需要在 Apple Music 网页版（music.apple.com）上点击。现在打开吗？')) location.href = 'https://music.apple.com/';
    return;
  }
  const ui = createPanel('网易云 → Apple Music · 导入');
  const m = amKit();

  if (!m.isAuthorized) {
    ui.render('<p>需要先登录 Apple Music（需有效订阅）。</p><button class="btn" id="auth">登录</button>');
    await new Promise(resolve => {
      ui.$('#auth').onclick = async () => {
        try { await m.authorize(); resolve(); } catch (e) { ui.error(e); }
      };
    });
  }

  const sf = m.storefrontId || 'cn';
  ui.render(`
    <p>粘贴第一步复制的数据（也支持每行「歌名 - 歌手」的纯文本）：</p>
    <textarea id="input" placeholder='{"source":"netease",...}'></textarea>
    <button class="btn secondary" id="file">或选择 JSON 文件</button>
    <button class="btn" id="match">开始匹配</button>
    <p class="muted">商店地区：${esc(sf)}。匹配结果会缓存在本地，中断后重新运行会从断点继续。</p>
    <div id="out"></div>`);

  ui.$('#file').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,.txt,application/json,text/plain';
    inp.onchange = async () => { if (inp.files[0]) ui.$('#input').value = await inp.files[0].text(); };
    inp.click();
  };

  ui.$('#match').onclick = async () => {
    const out = ui.$('#out');
    let data;
    try {
      data = parseInput(ui.$('#input').value);
      if (!data.tracks || !data.tracks.length) throw new Error('没有读到任何歌曲。');
    } catch (e) {
      out.innerHTML = '';
      return ui.error(e);
    }
    ui.$('#match').disabled = true;
    out.innerHTML = '<div class="bar"><i></i></div><p class="muted" id="st"></p>';
    const results = new Array(data.tracks.length);
    let done = 0;
    try {
      await pool(data.tracks, 4, async (t, i) => {
        try { results[i] = await amMatchTrack(t, sf); } catch (e) { results[i] = { score: 0, error: e.message }; }
        done++;
        out.querySelector('.bar i').style.width = (done / data.tracks.length * 100) + '%';
        out.querySelector('#st').textContent = `匹配中 ${done} / ${data.tracks.length}：${t.name}`;
      });
    } finally {
      ui.$('#match').disabled = false;
    }
    showResults(ui, data, results);
  };
}

function showResults(ui, data, results) {
  const out = ui.$('#out');
  const rows = data.tracks.map((t, i) => ({ t, r: results[i], level: confidence(results[i].score) }));
  const count = lv => rows.filter(x => x.level === lv).length;
  const review = rows.map((x, i) => ({ ...x, i })).filter(x => x.level !== 'high');
  const levelName = { medium: '较可信', low: '存疑', none: '未找到' };

  out.innerHTML = `
    <div class="stats">
      <div><b>${count('high')}</b>可靠</div><div><b>${count('medium')}</b>较可信</div>
      <div><b>${count('low')}</b>存疑</div><div><b>${count('none')}</b>未找到</div>
    </div>
    ${review.length ? `<p class="muted">以下歌曲需要确认，勾选的会被加入（默认勾选「较可信」）：</p>
    <div class="list">${review.map(x => `
      <label class="row">
        <input type="checkbox" data-i="${x.i}" ${x.level === 'medium' ? 'checked' : ''} ${x.level === 'none' ? 'disabled' : ''}>
        <div><div class="src">${esc(x.t.name)} · ${esc((x.t.artists || []).join('/'))}</div>
        <div>${x.r.id ? `→ <a href="${esc(x.r.url)}" target="_blank">${esc(x.r.name)} · ${esc(x.r.artistName)}</a>` : (x.r.error ? esc(x.r.error) : '没有搜到')}</div></div>
        <span class="tag ${x.level}">${levelName[x.level]}</span>
      </label>`).join('')}</div>` : ''}
    <p>歌单名称：</p>
    <input type="text" id="name" value="${esc('网易云 · ' + (data.playlist.name || '我喜欢的音乐'))}">
    <label class="chk"><input type="checkbox" id="love" checked>同时把这些歌标记为「喜爱」</label>
    <label class="chk"><input type="checkbox" id="lib">同时加入资料库</label>
    <button class="btn" id="create">创建歌单</button>
    <button class="btn secondary" id="csv">下载匹配报告</button>
    <div id="done"></div>`;

  ui.$('#csv').onclick = () => downloadFile('ncm2am-report.csv', toCsv([
    ['网易云歌名', '网易云歌手', '专辑', '匹配结果', 'Apple Music 歌名', 'Apple Music 歌手', '分数', '链接'],
    ...rows.map(x => [x.t.name, (x.t.artists || []).join('/'), x.t.album, levelName[x.level] || '可靠',
      x.r.name, x.r.artistName, x.r.score && x.r.score.toFixed(2), x.r.url]),
  ]), 'text/csv');

  ui.$('#create').onclick = async () => {
    const picked = new Set([...out.querySelectorAll('.list input:checked')].map(c => +c.dataset.i));
    const seen = new Set();
    const ids = rows.filter((x, i) => x.r.id && (x.level === 'high' || picked.has(i)))
      .map(x => x.r.id).filter(id => !seen.has(id) && seen.add(id));
    if (!ids.length) return ui.error('没有可添加的歌曲。');
    const doneEl = ui.$('#done');
    const step = (label, d, total) => { doneEl.innerHTML = `<div class="bar"><i style="width:${d / total * 100}%"></i></div><p class="muted">${label} ${d} / ${total}</p>`; };
    ui.$('#create').disabled = true;
    try {
      const name = ui.$('#name').value.trim() || '网易云歌单';
      await amCreatePlaylist(name, `由 netease-to-apple-music 从网易云「${data.playlist.name || ''}」导入`, ids, (d, n) => step('添加到歌单', d, n));
      if (ui.$('#lib').checked) await amAddToLibrary(ids, (d, n) => step('加入资料库', d, n));
      if (ui.$('#love').checked) await amLoveSongs(ids, (d, n) => step('标记喜爱', d, n));
      doneEl.innerHTML = `<p>🎉 完成！已把 <b>${ids.length}</b> 首歌加入歌单「${esc(name)}」。在资料库 → 歌单里可以看到（同步可能需要几分钟）。</p>`;
    } catch (e) {
      ui.error(e);
    } finally {
      ui.$('#create').disabled = false;
    }
  };
}

amMain().catch(e => alert('导入失败：' + (e && e.message || e)));
