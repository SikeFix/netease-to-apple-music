const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const m = require('../src/match.js');

test('coreTitle strips brackets, suffixes and feat', () => {
  assert.strictEqual(m.coreTitle('晴天 (Live)'), '晴天');
  assert.strictEqual(m.coreTitle('Shape of You - Acoustic'), 'shapeofyou');
  assert.strictEqual(m.coreTitle('Stay feat. Justin Bieber'), 'stay');
  assert.strictEqual(m.coreTitle('（全角括号）光年之外'), '光年之外');
});

test('exact original version beats live version', () => {
  const track = { name: '晴天', artists: ['周杰伦'], album: '叶惠美', duration: 269000 };
  const best = m.pickBest(track, [
    { name: '晴天 (Live)', artistName: '周杰伦', albumName: '2004 无与伦比演唱会 (Live)', durationInMillis: 299360 },
    { name: '星晴', artistName: '周杰伦', albumName: '杰伦', durationInMillis: 259400 },
    { name: '晴天', artistName: '周杰伦', albumName: '叶惠美', durationInMillis: 269747 },
  ]);
  assert.strictEqual(best.cand.albumName, '叶惠美');
  assert.strictEqual(m.confidence(best.score), 'high');
});

test('multi-artist and English titles match', () => {
  const track = { name: 'Something Just Like This', artists: ['The Chainsmokers', 'Coldplay'], duration: 247000 };
  const s = m.scoreMatch(track, { name: 'Something Just Like This', artistName: 'The Chainsmokers & Coldplay', durationInMillis: 247160 });
  assert.ok(s >= 0.9, s);
});

test('alias (translated title) helps matching', () => {
  const track = { name: 'Lemon', artists: ['米津玄師'], alias: ['柠檬'], duration: 255000 };
  const s = m.scoreMatch(track, { name: 'Lemon', artistName: '米津玄師', durationInMillis: 255400 });
  assert.strictEqual(m.confidence(s), 'high');
});

test('unrelated song scores low', () => {
  const track = { name: '稻香', artists: ['周杰伦'], duration: 223000 };
  const s = m.scoreMatch(track, { name: '后来', artistName: '刘若英', durationInMillis: 341000 });
  assert.ok(s < 0.3, s);
});

test('parseInput handles JSON export and plain text', () => {
  const json = m.parseInput(JSON.stringify({ playlist: { name: '我喜欢的音乐' }, tracks: [{ id: 1, name: 'a', artists: ['b'] }] }));
  assert.strictEqual(json.playlist.name, '我喜欢的音乐');
  assert.strictEqual(json.tracks.length, 1);
  const txt = m.parseInput('晴天 - 周杰伦\nSomething Just Like This - The Chainsmokers / Coldplay\n无歌手的歌');
  assert.deepStrictEqual(txt.tracks[1].artists, ['The Chainsmokers', 'Coldplay']);
  assert.strictEqual(txt.tracks[2].name, '无歌手的歌');
  assert.deepStrictEqual(txt.tracks[2].artists, []);
});

test('bookmarklet bundles are valid JavaScript', () => {
  const read = f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
  for (const files of [['ui.js', 'netease.js'], ['ui.js', 'match.js', 'apple.js']]) {
    const code = files.map(read).join('\n');
    assert.doesNotThrow(() => new Function(code), files.join('+'));
  }
});
