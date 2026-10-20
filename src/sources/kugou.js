// 来源：酷狗音乐（www.kugou.com，实验性）。酷狗网页版接口需要签名，这里直接读取当前页面里的歌曲数据：
// 排行榜页的 global.features（会自动翻页），其他页面退回到读取列表 DOM。

function kgParseFeature(f) {
  // FileName 的格式是「歌手1、歌手2 - 歌名」
  const file = String(f.FileName || f.filename || '');
  const idx = file.indexOf(' - ');
  const artistPart = idx > 0 ? file.slice(0, idx) : (f.author_name || '');
  const name = idx > 0 ? file.slice(idx + 3) : file;
  return {
    id: f.Hash || f.hash || f.encrypt_id || file,
    name: name.trim(),
    artists: artistPart.split(/\s*、\s*/).map(a => a.trim()).filter(Boolean),
    duration: f.timeLen ? Math.round(f.timeLen * 1000) : undefined,
    alias: [],
  };
}

function kgFeaturesFromHtml(html) {
  const m = html.match(/global\.features\s*=\s*(\[[\s\S]*?\]);/);
  return m ? JSON.parse(m[1]) : [];
}

const KugouSource = {
  id: 'kugou',
  name: '酷狗音乐',
  home: 'https://www.kugou.com/yy/html/rank.html',
  test: host => /(^|\.)kugou\.com$/.test(host),
  pageOnly: true,
  pageHint: '打开酷狗网页版的排行榜或歌单页面，再点「读取当前页面」。酷狗的「我喜欢」只在客户端里，可以先把它复制到一个公开歌单。',

  async exportPage(onProgress) {
    const g = window.global || {};
    let features = Array.isArray(g.features) ? g.features.slice() : [];
    const total = Number(g.total) || features.length;
    const size = Number(g.pagesize) || features.length;
    if (g.rankid && size && total > features.length) {
      features = [];
      const pages = Math.ceil(total / size);
      for (let p = 1; p <= pages; p++) {
        const html = await (await fetch(`/yy/rank/home/${p}-${g.rankid}.html`, { credentials: 'include' })).text();
        features.push(...kgFeaturesFromHtml(html));
        onProgress(Math.min(features.length, total), total);
      }
    }
    let tracks = features.map(kgParseFeature);
    if (!tracks.length) {
      tracks = [...document.querySelectorAll('li[title*=" - "]')]
        .map(li => kgParseFeature({ FileName: li.getAttribute('title') }));
    }
    if (!tracks.length) throw new Error('当前页面没有找到歌曲列表。' + this.pageHint);
    const name = (document.title.split(/[_|-]/)[0] || '酷狗歌单').trim();
    return { playlist: { id: location.pathname, name }, tracks };
  },
};
