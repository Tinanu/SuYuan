#!/usr/bin/env node
/**
 * 溯源 · 下载页清单生成器
 *
 * 用法：把要提供下载的文件（溯源.apk / 脚本 / 压缩包…）放进 appAPK/ 目录，
 *       然后在项目根目录执行一次：  node build.js
 *       页面会读取生成的 releases.json 自动更新下载区（版本、大小、时间、SHA-256）；
 *       同时从 wechat.html 同步生成独立静态预览页 guide-preview.html。
 *
 * 部署到 GitHub Pages 前记得先跑一次；以后每次换安装包、或改完微信引导也要跑一次。
 * 不跑也能用：页面会尝试直接探测 appAPK/溯源.apk，并把 子午流注.js 作为备用下载。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const APK_DIR = path.join(ROOT, 'appAPK');
const OUT = path.join(ROOT, 'releases.json');
const GUIDE_SRC = path.join(ROOT, 'wechat.html');
const GUIDE_PREVIEW = path.join(ROOT, 'guide-preview.html');

// 站点级配置。发新版时改这里的 version（与 App 内 config.js 的 LOCAL_VERSION 保持一致）。
const SITE = {
  app: '溯源',
  version: '1.0.2',
  subtitle: '子午流注 · 素问极简版',
  qq: '1241611627',
  github: '', // 例如 https://github.com/yourname/suyuan ，填了页面才会显示仓库按钮
};

// 不同扩展名在页面上的呈现方式，priority 越小越靠前
const TYPES = {
  '.apk': { kind: 'apk',    label: 'Android 安装包', hint: 'Android 7.0+ · 下载后直接安装', priority: 0 },
  '.js':  { kind: 'script', label: '源码 / 脚本',    hint: '源码文件',                   priority: 2 },
  '.zip': { kind: 'archive',label: '压缩包',         hint: '下载后解压使用',             priority: 3 },
  '.rar': { kind: 'archive',label: '压缩包',         hint: '下载后解压使用',             priority: 3 },
  '.7z':  { kind: 'archive',label: '压缩包',         hint: '下载后解压使用',             priority: 3 },
  '.exe': { kind: 'exe',    label: 'Windows 程序',   hint: 'Windows 平台',               priority: 4 },
  '.pdf': { kind: 'doc',    label: '文档',           hint: '资料文档',                   priority: 5 },
};

const pad = n => String(n).padStart(2, '0');
const dateOf = ms => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// 可选：若 appAPK/ 里同时放了 子午流注.js，则优先读取其中版本信息；否则使用 SITE 配置。
function readScriptMeta() {
  const p = path.join(APK_DIR, '子午流注.js');
  if (!fs.existsSync(p)) return;
  const head = fs.readFileSync(p, 'utf8').slice(0, 12000);
  const version = head.match(/LOCAL_VERSION\s*=\s*["']([^"']+)["']/);
  const name = head.match(/UPDATE_APP_NAME\s*=\s*["']([^"']+)["']/);
  const qq = head.match(/DEV_QQ\s*=\s*["']([^"']+)["']/);
  if (version) SITE.version = version[1];
  if (name) SITE.subtitle = name[1];
  if (qq) SITE.qq = qq[1];
}

/* ---------------------------------------------------------------------------
 * 微信引导图的「独立静态预览页」
 * wechat.html 是唯一内容源。生成时把 GUIDE-REDIRECT:START ~ :END 之间的
 * 线上跳转脚本整段摘掉，另存为 guide-preview.html：
 *   · 不含任何跳转逻辑（外部浏览器打开也不会回主页）
 *   · 不依赖 wx / preview / from 等 URL 参数（预览面板丢参数照样能看）
 *   · 纯静态，file:// 双击、本地预览面板、GitHub Pages 都能直接打开
 * 改完引导跑一次 node build.js 即可同步，内容永远和线上一致。
 * ------------------------------------------------------------------------- */
const MARK_START = '<!-- GUIDE-REDIRECT:START';
const MARK_END = '<!-- GUIDE-REDIRECT:END -->';

const PREVIEW_HEAD = `
<meta name="robots" content="noindex, nofollow">
<style>
  .gp-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px;
    width: min(100%, 540px); margin: 44px 0 18px; padding: 11px 14px;
    border: 1px solid #C6DBD6; border-radius: 12px; background: #E4F0ED;
    font-size: 12px; line-height: 1.65; color: #2A5A54; text-align: left; }
  .gp-bar b { flex: none; font-size: 13px; color: #1E3330; }
  .gp-bar span { flex: 1 1 240px; min-width: 0; }
  .gp-bar a { flex: none; color: #1E6B5A; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
  .gp-bar code { font-size: 11px; }
  .wx-preview-bar { display: none !important; } /* 由上面的横幅代替 */
</style>
`;

const PREVIEW_BAR = `
      <div class="gp-bar">
        <b>引导图 · 静态预览</b>
        <span>本页不含任何跳转逻辑、不依赖 URL 参数：本地双击、预览面板、GitHub Pages 都能直接看到完整引导图。卡片外的朱红箭头指向微信<b>真实</b>的右上角「···」，预览页不重复画虚拟三点。由 <code>node build.js</code> 从 <code>wechat.html</code> 同步生成，改完引导记得重跑一次。</span>
        <a href="index.html?nowx=1">返回下载页 →</a>
      </div>
`;

function syncGuidePreview() {
  let html = fs.readFileSync(GUIDE_SRC, 'utf8');
  const s = html.indexOf(MARK_START);
  const e = html.indexOf(MARK_END);
  if (s < 0 || e < 0 || e < s) {
    throw new Error('wechat.html 缺少 GUIDE-REDIRECT:START / :END 标记，无法生成预览页');
  }
  html = html.slice(0, s) +
    '<!-- 独立静态预览页：线上跳转脚本已移除，本页永不跳转、不依赖 URL 参数 -->\n' +
    html.slice(e + MARK_END.length);
  html = html.replace('<title>请在浏览器中打开 · 溯源</title>', '<title>引导图静态预览 · 溯源</title>');
  // 把源文件的「线上跳转说明」换成预览页说明，避免生成物里留着会误导人的旧注释
  html = html.replace(/<!-- 这个页面只负责「微信引导」[\s\S]*?-->/,
    '<!-- 独立静态预览页：由 node build.js 从 wechat.html 生成；改引导请改源文件后重跑本脚本 -->');
  html = html.replace('</head>', PREVIEW_HEAD + '</head>');
  html = html.replace('<div class="wx-page">', '<div class="wx-page">\n' + PREVIEW_BAR);
  fs.writeFileSync(GUIDE_PREVIEW, html, 'utf8');
  console.log('[build] 已同步 guide-preview.html（独立静态预览页，不含跳转逻辑）');
}

async function main() {
  readScriptMeta();
  syncGuidePreview();

  if (!fs.existsSync(APK_DIR)) fs.mkdirSync(APK_DIR, { recursive: true });

  const names = fs.readdirSync(APK_DIR).filter(n => {
    if (n.startsWith('.')) return false;             // .gitkeep / 隐藏文件
    return fs.statSync(path.join(APK_DIR, n)).isFile();
  });

  const files = [];
  for (const name of names) {
    const full = path.join(APK_DIR, name);
    const stat = fs.statSync(full);
    const ext = path.extname(name).toLowerCase();
    const meta = TYPES[ext] || { kind: 'other', label: '文件', hint: '本地文件', priority: 9 };
    files.push({
      file: name,
      title: path.basename(name, ext),
      label: meta.label,
      hint: meta.hint,
      kind: meta.kind,
      priority: meta.priority,
      ext,
      size: stat.size,
      sha256: await sha256(full),
      updated: dateOf(stat.mtimeMs),
      // 中文文件名做 URL 编码，避免 GitHub Pages 上的路径问题
      url: 'appAPK/' + encodeURIComponent(name),
      // 下载时另存的名字：APK 统一叫「溯源-v版本号.apk」，其它保持原名
      download: meta.kind === 'apk' ? `${SITE.app}-v${SITE.version}.apk` : name,
    });
  }

  files.sort((a, b) => a.priority - b.priority || a.file.localeCompare(b.file, 'zh'));

  const data = {
    ...SITE,
    generated: new Date().toISOString(),
    // 约定俗成的主安装包名：即使没跑本脚本，页面也会探测它
    primaryName: `${SITE.app}.apk`,
    primaryUrl: 'appAPK/' + encodeURIComponent(`${SITE.app}.apk`),
    files,
  };

  fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`[build] 版本 ${data.version} · ${files.length} 个文件 → releases.json`);
  files.forEach(f => console.log(`  - ${f.file}  ${(f.size / 1024 / 1024).toFixed(2)} MB  ${f.updated}`));
  if (!files.some(f => f.kind === 'apk')) {
    console.log(`[build] 提示：appAPK/ 里还没有 APK。把安装包命名为「${SITE.app}.apk」放进去再跑一次即可。`);
  }
}

main().catch(err => {
  console.error('[build] 失败：', err);
  process.exit(1);
});
