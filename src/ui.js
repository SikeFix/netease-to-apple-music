// 两个书签脚本共用的浮动面板与工具函数。面板放在 Shadow DOM 里，避免被页面样式干扰。

const REPO_URL = 'https://github.com/SikeFix/netease-to-apple-music';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function pool(items, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type: type || 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function starHtml() {
  return `<p class="star">觉得好用？去 <a href="${REPO_URL}" target="_blank">GitHub</a> 点个 ⭐ Star 支持一下，遇到问题也可以提 Issue。</p>`;
}

function createPanel(title) {
  const old = document.getElementById('ncm2am-host');
  if (old) old.remove();
  const host = document.createElement('div');
  host.id = 'ncm2am-host';
  host.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
<style>
  :host { all: initial; }
  .panel { width: 380px; max-height: calc(100vh - 32px); display: flex; flex-direction: column;
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    color: #1d1d1f; background: #fff; border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.25); overflow: hidden; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px;
    background: linear-gradient(90deg, #e60026, #fa2d48 60%, #fc5c7d); color: #fff; }
  header b { font-size: 15px; }
  .x { background: none; border: 0; color: #fff; font-size: 20px; cursor: pointer; line-height: 1; padding: 0 4px; }
  .body { padding: 14px 16px 16px; overflow: auto; }
  p { margin: 0 0 10px; }
  .muted { color: #6e6e73; font-size: 12px; }
  .err { color: #d70015; white-space: pre-wrap; }
  button.btn { display: inline-block; border: 0; border-radius: 8px; padding: 8px 14px; margin: 4px 6px 4px 0;
    background: #fa2d48; color: #fff; font: inherit; cursor: pointer; }
  button.btn.secondary { background: #f2f2f7; color: #1d1d1f; }
  button.btn:disabled { opacity: .5; cursor: default; }
  select, input[type=text], textarea { width: 100%; box-sizing: border-box; font: inherit; padding: 7px 9px;
    border: 1px solid #d2d2d7; border-radius: 8px; margin: 2px 0 10px; background: #fff; color: inherit; }
  textarea { height: 110px; font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
  label.chk { display: flex; gap: 6px; align-items: center; margin: 4px 0; }
  .bar { height: 6px; background: #f2f2f7; border-radius: 3px; overflow: hidden; margin: 6px 0 4px; }
  .bar i { display: block; height: 100%; width: 0; background: #fa2d48; transition: width .2s; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 8px 0 12px; text-align: center; }
  .stats div { background: #f5f5f7; border-radius: 8px; padding: 6px 0; }
  .stats b { display: block; font-size: 17px; }
  .list { max-height: 260px; overflow: auto; border: 1px solid #e5e5ea; border-radius: 8px; margin-bottom: 10px; }
  .row { display: flex; gap: 8px; padding: 6px 8px; border-bottom: 1px solid #f2f2f7; font-size: 12px; }
  .row:last-child { border-bottom: 0; }
  .row .src { font-weight: 600; }
  .tag { font-size: 11px; padding: 0 5px; border-radius: 4px; background: #f2f2f7; white-space: nowrap; }
  .tag.medium { background: #fff4d6; } .tag.low { background: #ffe1e1; } .tag.none { background: #e5e5ea; }
  a { color: #fa2d48; }
  .star { margin-top: 12px; padding: 8px 10px; border-radius: 8px; background: #fff4d6; font-size: 12px; }
  @media (prefers-color-scheme: dark) {
    .panel { background: #1c1c1e; color: #f5f5f7; }
    select, input[type=text], textarea { background: #2c2c2e; border-color: #3a3a3c; }
    button.btn.secondary, .stats div, .bar, .tag { background: #2c2c2e; color: #f5f5f7; }
    .list, .row { border-color: #3a3a3c; }
    .muted { color: #98989d; }
    .star { background: #3a3220; }
  }
</style>
<div class="panel"><header><b>${esc(title)}</b><button class="x" title="关闭">×</button></header><div class="body"></div></div>`;
  document.documentElement.appendChild(host);
  root.querySelector('.x').onclick = () => host.remove();
  const body = root.querySelector('.body');
  return {
    root,
    body,
    $: sel => body.querySelector(sel),
    render(html) { body.innerHTML = html; },
    error(e) {
      console.error('[ncm2am]', e);
      body.insertAdjacentHTML('beforeend', `<p class="err">出错了：${esc(e && e.message || e)}</p>`);
    },
  };
}
