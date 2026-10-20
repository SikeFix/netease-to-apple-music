# 网易云 → Apple Music

把网易云音乐「❤️ 我喜欢的音乐」（或任意歌单）迁移到 Apple Music：自动匹配、创建歌单，还可以顺手把这些歌标记为「喜爱」。

**👉 在线使用：https://sikefix.github.io/netease-to-apple-music/**

- **不需要服务器**：全部在你自己的浏览器里运行，账号信息不会经过任何第三方
- **不需要 Apple 开发者账号**：借用 Apple Music 网页播放器自带的 MusicKit
- **私密歌单也能导**：用你在网易云网页版的登录状态读取「我喜欢的音乐」
- **智能匹配**：综合歌名（含网易云译名/别名）、歌手、时长打分，Live / Remix / 伴奏等版本会被降低优先级
- **可断点续跑**：搜索结果缓存在本地，中断后重跑会很快跳过已经搜过的歌
- **匹配报告**：没匹配上的歌可以导出成 CSV

## 使用方法

1. 打开 [主页](https://sikefix.github.io/netease-to-apple-music/)，把「① 导出网易云」和「② 导入 Apple Music」两个按钮拖到浏览器书签栏
2. 在 [music.163.com](https://music.163.com/) 登录后点 ①，选歌单 → 导出 → 复制数据
3. 在 [music.apple.com](https://music.apple.com/) 登录后点 ②，粘贴 → 开始匹配 → 确认 → 创建歌单

不方便用书签的话（比如 Safari），主页上也可以复制代码，粘贴到对应网页的开发者控制台里运行。

第 3 步也支持每行一首「歌名 - 歌手」的纯文本，所以 QQ 音乐、汽水音乐等平台的歌单可以先用 [GoMusic](https://github.com/Bistutu/GoMusic) 转成文本，再导入。

## 工作原理

| 步骤 | 运行位置 | 调用的接口 |
| --- | --- | --- |
| 导出 | music.163.com | `/api/user/playlist`、`/api/v6/playlist/detail`、`/api/v3/song/detail`（同源，带登录 Cookie） |
| 匹配 | music.apple.com | `amp-api.music.apple.com/v1/catalog/{storefront}/search` |
| 导入 | music.apple.com | `POST /v1/me/library/playlists`、`PUT /v1/me/ratings/songs/{id}`、`POST /v1/me/library` |

匹配打分在 [`src/match.js`](src/match.js)：标题相似度 55%、歌手 30%、时长 15%，非原版的 Live/Remix 等再扣分。≥0.8 记为「可靠」并自动加入，0.6–0.8 记为「较可信」并默认勾选，更低的需要你手动确认。

## 开发

```bash
node --test test/       # 运行测试
python3 -m http.server  # 本地预览主页
```

项目没有构建步骤。主页加载时会把 `src/` 下的文件拼接起来，生成书签链接：

- 书签 ① = `src/ui.js` + `src/netease.js`
- 书签 ② = `src/ui.js` + `src/match.js` + `src/apple.js`

## 说明

这两个脚本调用的都是网易云和 Apple Music 网页版自己使用的接口，不是对外公开的 API，可能会因为平台改版而失效。遇到问题欢迎提 Issue 或 PR。本项目与网易云音乐、Apple 均无关联。

## License

MIT
