// 来源：网易云音乐（music.163.com）。用当前登录态读取歌单，包括私密的「我喜欢的音乐」。

async function ncmApi(path, opts) {
  const r = await fetch(path, { credentials: 'include', ...opts });
  const j = await r.json();
  if (j.code !== 200) throw new Error(`${path.split('?')[0]} 返回 ${j.code}${j.message ? '：' + j.message : ''}`);
  return j;
}

function ncmParsePlaylistId(input) {
  const s = String(input || '');
  const m = s.match(/playlist(?:\?id=|\/)(\d+)/) || s.match(/[?&]id=(\d+)/) || s.match(/^\s*(\d+)\s*$/);
  return m ? m[1] : null;
}

const NeteaseSource = {
  id: 'netease',
  name: '网易云音乐',
  home: 'https://music.163.com/',
  test: host => /(^|\.)music\.163\.com$/.test(host),
  parseId: ncmParsePlaylistId,
  currentId: () => ncmParsePlaylistId(location.href),
  shortLinkHint: /163cn\.tv/,

  async user() {
    try {
      const j = await ncmApi('/api/nuser/account/get');
      if (j.profile) return { uid: j.profile.userId, nickname: j.profile.nickname };
    } catch (e) { /* 退回到页面全局变量 */ }
    const frame = document.getElementById('g_iframe');
    const g = window.GUser || (frame && frame.contentWindow && frame.contentWindow.GUser);
    if (g && g.userId) return { uid: g.userId, nickname: g.nickname };
    return null;
  },

  async playlists(user) {
    const j = await ncmApi(`/api/user/playlist?uid=${user.uid}&limit=1000&offset=0`);
    return (j.playlist || []).map(p => ({
      id: p.id,
      name: p.name,
      count: p.trackCount,
      liked: p.specialType === 5,
      subscribed: !!(p.creator && p.creator.userId !== user.uid),
    }));
  },

  async exportPlaylist(pid, onProgress) {
    const detail = await ncmApi(`/api/v6/playlist/detail?id=${pid}&n=100000&s=0`);
    const pl = detail.playlist;
    const ids = pl.trackIds.map(t => t.id);
    const byId = new Map();
    // 用 GET：网易云页面会改写 fetch 的 POST 请求体，导致接口返回 400
    for (let i = 0; i < ids.length; i += 300) {
      const c = JSON.stringify(ids.slice(i, i + 300).map(id => ({ id })));
      const j = await ncmApi('/api/v3/song/detail?c=' + encodeURIComponent(c));
      for (const s of j.songs) byId.set(s.id, s);
      onProgress(Math.min(i + 300, ids.length), ids.length);
    }
    const tracks = ids.map(id => byId.get(id)).filter(Boolean).map(s => ({
      id: s.id,
      name: s.name,
      artists: (s.ar || []).map(a => a.name).filter(Boolean),
      album: s.al && s.al.name,
      duration: s.dt,
      alias: [...(s.alia || []), ...(s.tns || [])],
    }));
    return { playlist: { id: pl.id, name: pl.name, creator: pl.creator && pl.creator.nickname }, tracks };
  },
};
