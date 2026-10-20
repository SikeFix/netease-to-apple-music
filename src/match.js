// 歌曲匹配：把网易云曲目和 Apple Music 搜索结果做模糊打分。
// 纯函数，无 DOM 依赖，可在 Node 中测试。

const VERSION_WORDS = ['live', 'remix', 'instrumental', 'karaoke', 'acoustic', 'demo', 'cover',
  '伴奏', '现场', '演唱会', '纯音乐', '翻唱', 'dj', '版'];

// 全角转半角、小写、去空白
function normalize(s) {
  return String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

// 去掉括号内容、"- xxx" 后缀、feat.，只保留核心标题，再去掉标点
function coreTitle(s) {
  return normalize(s)
    .replace(/[(\[【「《<].*?[)\]】」》>]/g, ' ')
    .replace(/\s-\s.*$/, ' ')
    .replace(/\b(feat|ft)\.?\s.*$/, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function compact(s) {
  return normalize(s).replace(/[^\p{L}\p{N}]+/gu, '');
}

// 字符 bigram 的 Dice 系数；单字时退化为相等判断
function dice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a.includes(b) || b.includes(a) ? 0.8 : 0;
  const grams = new Map();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    grams.set(g, (grams.get(g) || 0) + 1);
  }
  let hit = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const n = grams.get(g);
    if (n) { hit++; grams.set(g, n - 1); }
  }
  return (2 * hit) / (a.length + b.length - 2);
}

function splitArtists(s) {
  return normalize(s)
    .split(/\s*(?:,|，|&|、|\/|;|\bfeat\.?|\bft\.?|\bx\b|\band\b|和)\s*/)
    .map(compact)
    .filter(Boolean);
}

function hasVersionWord(s) {
  const n = normalize(s);
  return VERSION_WORDS.some(w => n.includes(w));
}

/**
 * @param track  {name, artists: string[], album?, duration?, alias?: string[]}
 * @param cand   {name, artistName, albumName?, durationInMillis?}
 * @returns 0~1
 */
function scoreMatch(track, cand) {
  const titles = [track.name, ...(track.alias || [])];
  let title = 0;
  for (const t of titles) {
    title = Math.max(title, dice(coreTitle(t), coreTitle(cand.name)), dice(compact(t), compact(cand.name)));
  }

  const srcArtists = (track.artists || []).flatMap(splitArtists);
  const dstArtists = splitArtists(cand.artistName);
  let artist = 0;
  for (const a of srcArtists) for (const b of dstArtists) artist = Math.max(artist, dice(a, b));
  if (!srcArtists.length) artist = 0.5;

  let duration = 0.5;
  if (track.duration && cand.durationInMillis) {
    const diff = Math.abs(track.duration - cand.durationInMillis) / 1000;
    duration = diff <= 3 ? 1 : diff <= 10 ? 0.6 : diff <= 30 ? 0.2 : 0;
  }

  let score = 0.55 * title + 0.3 * artist + 0.15 * duration;
  const srcText = track.name + ' ' + (track.album || '');
  const dstText = cand.name + ' ' + (cand.albumName || '');
  if (hasVersionWord(dstText) && !hasVersionWord(srcText)) score -= 0.15;
  return Math.max(0, Math.min(1, score));
}

function pickBest(track, candidates) {
  let best = null;
  for (const c of candidates) {
    const s = scoreMatch(track, c);
    if (!best || s > best.score) best = { cand: c, score: s };
  }
  return best;
}

function confidence(score) {
  return score >= 0.8 ? 'high' : score >= 0.6 ? 'medium' : score > 0 ? 'low' : 'none';
}

function searchTerms(track) {
  const core = normalize(track.name).replace(/[(\[【「（].*?[)\]】」）]/g, ' ').trim() || track.name;
  const artist = (track.artists || [])[0] || '';
  const terms = [(core + ' ' + artist).trim(), core];
  return [...new Set(terms)];
}

// 解析导入内容：网易云导出的 JSON，或每行 "歌名 - 歌手" 的纯文本（兼容 GoMusic 等工具的输出）
function parseInput(text) {
  text = String(text || '').trim();
  if (!text) return { playlist: { name: '导入的歌单' }, tracks: [] };
  if (text[0] === '{' || text[0] === '[') {
    const data = JSON.parse(text);
    const tracks = Array.isArray(data) ? data : data.tracks;
    return { playlist: (data && data.playlist) || { name: '导入的歌单' }, tracks };
  }
  const tracks = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map((line, i) => {
    const idx = line.lastIndexOf(' - ');
    const name = idx > 0 ? line.slice(0, idx) : line;
    const artist = idx > 0 ? line.slice(idx + 3) : '';
    return { id: 'line' + i, name: name.trim(), artists: artist ? artist.split(/\s*[\/、,，&]\s*/).filter(Boolean) : [] };
  });
  return { playlist: { name: '导入的歌单' }, tracks };
}

if (typeof module !== 'undefined') {
  module.exports = { normalize, coreTitle, dice, splitArtists, scoreMatch, pickBest, confidence, searchTerms, parseInput };
}
