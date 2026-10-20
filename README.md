# 🎵 歌单搬家：网易云 / QQ 音乐 / 酷狗 → Apple Music

[![GitHub stars](https://img.shields.io/github/stars/SikeFix/netease-to-apple-music?style=flat&color=fa2d48)](https://github.com/SikeFix/netease-to-apple-music/stargazers)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![在线使用](https://img.shields.io/badge/在线使用-GitHub%20Pages-fa2d48)](https://sikefix.github.io/netease-to-apple-music/)

把网易云音乐、QQ 音乐、酷狗里「❤️ 我喜欢」的歌和各种歌单迁移到 Apple Music：自动匹配、创建歌单，还能顺手把这些歌标记为「喜爱」。要去 Spotify / YouTube Music 也可以，先导出成文本再交给第三方工具。

**👉 在线使用：https://sikefix.github.io/netease-to-apple-music/**

如果它帮到了你，欢迎点个 ⭐ Star，让更多人找到它。

## 特点

- **不需要服务器**：全部在你自己的浏览器里运行，账号信息不会经过任何第三方
- **不需要 Apple 开发者账号**：借用 Apple Music 网页播放器自带的 MusicKit
- **私密歌单也能导**：用你在各平台网页版上的登录状态读取「我喜欢」
- **智能匹配**：综合歌名（含译名 / 别名）、歌手、时长打分；同名翻唱、Live / Remix 版本会被降低分数，不会默认加入
- **可断点续跑**：搜索结果缓存在本地，中断后重跑会很快跳过已经搜过的歌
- **匹配报告**：没匹配上的歌可以导出成 CSV

## 支持的平台

| 平台 | 导出（来源） | 导入（目标） |
| --- | --- | --- |
| 网易云音乐 | ✅ 我喜欢、私密歌单、收藏的歌单 | — |
| QQ 音乐 | ✅ 登录后读自己的歌单，或粘贴公开歌单链接 | — |
| 酷狗音乐 | 🧪 实验性：读取网页版当前打开的排行榜 / 歌单页 | — |
| 汽水 / 酷我 / 其他 | 📝 粘贴每行「歌名 - 歌手」的文本（可用 [GoMusic](https://github.com/Bistutu/GoMusic) 生成） | — |
| Apple Music | — | ✅ 直接建歌单、标记喜爱、加入资料库 |
| Spotify / YouTube Music | — | 📝 转成文本后用 [TuneMyMusic](https://www.tunemymusic.com/zh-CN/transfer) / [Spotlistr](https://spotlistr.com/) 导入 |

## 使用方法

1. 打开[主页](https://sikefix.github.io/netease-to-apple-music/)，把「① 导出歌单」和「② 导入 Apple Music」两个按钮拖到浏览器书签栏
2. 在网易云 / QQ 音乐 / 酷狗的网页版登录后点 ①，选歌单 → 导出 → 复制数据
3. 在 [music.apple.com](https://music.apple.com/) 登录后点 ②，粘贴 → 开始匹配 → 确认 → 创建歌单

**不同设备怎么用：**

- **Chrome / Edge / Firefox**：直接把按钮拖到书签栏
- **Safari**：拖到个人收藏栏；拖不动的话，编辑一个书签，把地址换成主页上「复制书签网址」得到的内容
- **手机 / 平板（实验性）**：同样用「复制书签网址」新建书签，打开网页时选「请求桌面网站」
- **都不行**：在对应网页打开开发者控制台，粘贴主页上的「控制台代码」后回车
- **Mac / Windows「音乐」App**：App 里不能运行书签，要在浏览器里的 Apple Music 网页版导入；导入后打开 App 的「设置 → 通用 → 同步资料库」，歌单就会同步过去

## 工作原理

| 步骤 | 运行位置 | 调用的接口 |
| --- | --- | --- |
| 导出 | music.163.com | `/api/user/playlist`、`/api/v6/playlist/detail`、`/api/v3/song/detail` |
| 导出 | y.qq.com | `u.y.qq.com/cgi-bin/musicu.fcg`（`GetPlaylistByUin`、`uniform_get_Dissinfo`） |
| 导出 | kugou.com | 页面里的 `global.features`，排行榜会自动翻页 |
| 匹配 | music.apple.com | `amp-api.music.apple.com/v1/catalog/{storefront}/search` |
| 导入 | music.apple.com | `POST /v1/me/library/playlists`、`PUT /v1/me/ratings/songs/{id}`、`POST /v1/me/library` |

匹配打分在 [`src/match.js`](src/match.js)：标题相似度 55%、歌手 30%、时长 15%，非原版的 Live / Remix 和歌手对不上的翻唱再扣分。≥0.8 记为「可靠」并自动加入，0.6–0.8 记为「较可信」并默认勾选，更低的需要你手动确认。

## 开发

```bash
node --test test/       # 运行测试
python3 -m http.server  # 本地预览主页
```

项目没有构建步骤。主页加载时会把 `src/` 下的文件拼接起来，生成书签链接：

- 书签 ① = `ui.js` + `match.js` + `sources/*.js` + `export.js`
- 书签 ② = `ui.js` + `match.js` + `apple.js`

想支持新的来源平台？在 `src/sources/` 里照着 `netease.js` 写一个对象（`test`、`user`、`playlists`、`exportPlaylist`），加进 `export.js` 的 `SOURCES` 列表和 `index.html` 的 `bundles` 里就行。欢迎 PR！

## 说明

这些脚本调用的都是各平台网页版自己使用的接口，不是对外公开的 API，可能会因为平台改版而失效。遇到问题欢迎提 Issue。本项目与网易云音乐、QQ 音乐、酷狗、Apple 均无关联。

## License

MIT
