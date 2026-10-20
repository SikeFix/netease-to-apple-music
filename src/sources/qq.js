// 来源：QQ 音乐（y.qq.com）。调用网页版自己用的 musicu.fcg 接口，登录后可读取自己的歌单和「我喜欢」。

function qqCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

// QQ 登录的 uin 形如 o0123456，微信登录则在 wxuin 里
function qqUin() {
  const raw = qqCookie('uin') || qqCookie('qqmusic_uin') || qqCookie('wxuin') || qqCookie('p_uin');
  return raw.replace(/^o0*/, '').replace(/\D/g, '');
}

function qqAuthKey() {
  return qqCookie('qqmusic_key') || qqCookie('qm_keyst') || qqCookie('p_skey') || qqCookie('skey');
}

function qqGtk(key) {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h += (h << 5) + key.charCodeAt(i);
  return h & 0x7fffffff;
}

async function qqApi(req) {
  const comm = { ct: 24, cv: 0, format: 'json' };
  const uin = qqUin();
  const key = qqAuthKey();
  if (uin && key) Object.assign(comm, { uin, g_tk: qqGtk(key), g_tk_new_20200303: qqGtk(key), authst: key });
  const r = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({ comm, req }),
  });
  const j = await r.json();
  const code = j.req ? j.req.code : j.code;
  if (j.code !== 0 || code !== 0) throw new Error(`QQ 音乐接口返回 ${code}（未登录或歌单不公开？）`);
  return j.req.data;
}

function qqParsePlaylistId(input) {
  const s = String(input || '');
  const m = s.match(/playlist\/(\d+)/) || s.match(/[?&](?:id|disstid)=(\d+)/) || s.match(/^\s*(\d+)\s*$/);
  return m ? m[1] : null;
}

const QQSource = {
  id: 'qq',
  name: 'QQ 音乐',
  home: 'https://y.qq.com/',
  test: host => /(^|\.)y\.qq\.com$/.test(host),
  parseId: qqParsePlaylistId,
  currentId: () => qqParsePlaylistId(location.pathname + location.search),
  shortLinkHint: /c6?\.y\.qq\.com\/base\/fcgi-bin\/u|url\.cn/,

  async user() {
    const uin = qqUin();
    return uin && qqAuthKey() ? { uid: uin, nickname: uin } : null;
  },

  async playlists(user) {
    const data = await qqApi({
      module: 'music.musicasset.PlaylistBaseRead',
      method: 'GetPlaylistByUin',
      param: { uin: String(user.uid) },
    });
    return (data.v_playlist || []).map(p => ({
      id: p.tid,
      name: p.dirName,
      count: p.songNum,
      liked: p.dirId === 201,
      subscribed: false,
    }));
  },

  async exportPlaylist(pid, onProgress) {
    const tracks = [];
    let info = null;
    let total = Infinity;
    for (let begin = 0; begin < total; begin += 500) {
      const data = await qqApi({
        module: 'music.srfDissInfo.aiDissInfo',
        method: 'uniform_get_Dissinfo',
        param: { disstid: Number(pid), userinfo: 1, tag: 1, orderlist: 1, song_begin: begin, song_num: 500, onlysonglist: 0, enc_host_uin: '' },
      });
      info = info || data.dirinfo;
      total = data.total_song_num || (info && info.songnum) || 0;
      const list = data.songlist || [];
      for (const s of list) {
        tracks.push({
          id: s.mid || s.id,
          name: s.title || s.name,
          artists: (s.singer || []).map(a => a.name).filter(Boolean),
          album: s.album && s.album.name,
          duration: s.interval ? s.interval * 1000 : undefined,
          alias: [s.name, s.subtitle].filter(a => a && a !== s.title),
        });
      }
      onProgress(Math.min(tracks.length, total), total);
      if (!list.length) break;
    }
    return { playlist: { id: pid, name: info && info.title, creator: info && info.host_nick }, tracks };
  },
};
