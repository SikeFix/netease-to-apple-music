// 书签脚本 ①：通用导出。自动识别当前网站（网易云 / QQ 音乐 / 酷狗），导出歌单为统一的 JSON。

const SOURCES = [NeteaseSource, QQSource, KugouSource];

function showExportResult(out, ui, source, data) {
  const json = JSON.stringify(data);
  out.innerHTML = `
    <p>✅ 「${esc(data.playlist.name)}」共 <b>${data.tracks.length}</b> 首。</p>
    <button class="btn" id="copy">复制数据</button><button class="btn secondary" id="dl">下载 JSON</button>
    <button class="btn secondary" id="txt">复制为文本</button>
    <p class="muted"><b>导入 Apple Music：</b>打开 <a href="https://music.apple.com/" target="_blank">music.apple.com</a> 并登录，点「② 导入 Apple Music」书签，粘贴数据。</p>
    <p class="muted"><b>导入 Spotify / YouTube Music：</b>点「复制为文本」，到 <a href="https://www.tunemymusic.com/zh-CN/transfer" target="_blank">TuneMyMusic</a> 或 <a href="https://spotlistr.com/search/textbox" target="_blank">Spotlistr</a> 选「任意文本」粘贴。</p>
    ${starHtml()}`;
  ui.$('#copy').onclick = async () => { ui.$('#copy').textContent = (await copyText(json)) ? '已复制 ✓' : '复制失败，请用下载'; };
  ui.$('#txt').onclick = async () => { ui.$('#txt').textContent = (await copyText(tracksToText(data.tracks))) ? '已复制 ✓' : '复制失败'; };
  ui.$('#dl').onclick = () => downloadFile(`${source.id}-${String(data.playlist.id).replace(/\W+/g, '_')}.json`, json);
}

function wrapExport(source, data) {
  return { source: source.id, version: 1, exportedAt: new Date().toISOString(), ...data };
}

function progressHandler(out) {
  out.innerHTML = '<div class="bar"><i></i></div><p class="muted" id="st">读取歌单…</p>';
  return (done, total) => {
    out.querySelector('.bar i').style.width = (total ? done / total * 100 : 0) + '%';
    out.querySelector('#st').textContent = `已读取 ${done} / ${total} 首`;
  };
}

function exportUnsupported() {
  const ui = createPanel('歌单搬家 · 导出');
  ui.render(`
    <p>请在以下网站的网页版上点这个书签：</p>
    ${SOURCES.map(s => `<p>· <a href="${s.home}">${esc(s.name)}</a>${s.pageOnly ? '<span class="muted">（实验性）</span>' : ''}</p>`).join('')}
    <p class="muted">其他平台（汽水音乐、酷我等）可以把歌单整理成每行「歌名 - 歌手」的文本，直接粘贴到导入书签里。</p>
    ${starHtml()}`);
}

async function exportPageOnly(ui, source) {
  ui.render(`<p class="muted">${esc(source.pageHint)}</p><button class="btn" id="go">读取当前页面</button><div id="out"></div>`);
  ui.$('#go').onclick = async () => {
    const out = ui.$('#out');
    ui.$('#go').disabled = true;
    try {
      const data = await source.exportPage(progressHandler(out));
      showExportResult(out, ui, source, wrapExport(source, data));
    } catch (e) {
      out.innerHTML = '';
      ui.error(e);
    } finally {
      ui.$('#go').disabled = false;
    }
  };
}

async function exportMain() {
  // 不用 Array.prototype.find：酷狗网页把它删掉了
  const source = SOURCES.filter(s => s.test(location.hostname))[0];
  if (!source) return exportUnsupported();
  const ui = createPanel(`${source.name} · 导出歌单`);
  if (source.pageOnly) return exportPageOnly(ui, source);

  ui.render('<p>正在读取账号信息…</p>');
  const user = await source.user();
  let playlists = [];
  if (user) {
    try { playlists = await source.playlists(user); } catch (e) { ui.error(e); }
  }
  const current = source.currentId();
  const options = playlists.map(p =>
    `<option value="${p.id}">${esc(p.liked ? '❤️ ' + p.name : p.name)}（${p.count} 首${p.subscribed ? '，收藏' : ''}）</option>`).join('');
  ui.render(`
    ${playlists.length
      ? `<p>你好，<b>${esc(user.nickname)}</b>。选择要导出的歌单：</p><select id="pl">${options}</select>`
      : `<p>${user ? '没读到你的歌单列表。' : '未检测到登录。请先登录，刷新页面后再点书签；'}也可以直接粘贴<b>公开歌单</b>链接：</p>`}
    <input type="text" id="link" placeholder="（可选）歌单链接或 ID，填了会优先使用" value="${esc(current || '')}">
    <button class="btn" id="go">导出</button>
    <div id="out"></div>`);

  ui.$('#go').onclick = async () => {
    const manual = ui.$('#link').value.trim();
    const pid = manual ? source.parseId(manual) : (ui.$('#pl') && ui.$('#pl').value);
    const out = ui.$('#out');
    if (!pid) {
      out.innerHTML = `<p class="err">${source.shortLinkHint && source.shortLinkHint.test(manual)
        ? '短链接无法直接解析，请在浏览器打开它，复制跳转后的完整链接。' : '没有识别到歌单 ID。'}</p>`;
      return;
    }
    ui.$('#go').disabled = true;
    try {
      const data = await source.exportPlaylist(pid, progressHandler(out));
      showExportResult(out, ui, source, wrapExport(source, data));
    } catch (e) {
      out.innerHTML = '';
      ui.error(e);
    } finally {
      ui.$('#go').disabled = false;
    }
  };
}

exportMain().catch(e => alert('导出失败：' + (e && e.message || e)));
