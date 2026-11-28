#!/usr/bin/env node
/**
 * 溯源 · 下载页清单生成器
 *
 * 用法：把新版 APK 放进 appAPK/ 目录，然后 push（或手动跑 node build.js）。
 *       脚本会【自动挑出最新版 APK】作为主下载，同步刷新版本、大小、时间、SHA-256；
 *       同时从 wechat.html 同步生成独立静态预览页 guide-preview.html。
 *
 * 自动挑最新的规则（改引导 / 换包后无需手改任何下载链接）：
 *   1. 文件名带版本号（溯源-v1.0.3.apk / 溯源_1_1_0.apk）→ 解析出版本号；
 *   2. 不带版本号的文件（约定名 溯源.apk）视为「当前发布版」，与最高版本文件一起候选；
 *   3. 候选里取「文件修改时间」最新的；时间相同（git clone 后都相同）优先约定名；
 *   4. 选中文件的版本号自动成为页面显示版本；无版本号时沿用 releases.json 顶层 version。
 * 因此最省事的做法：把新版 APK 直接覆盖命名为 溯源.apk，或命名成 溯源-v新版本号.apk。
 *
 * ★ 版本号【全局唯一来源】：releases.json 顶层的 "version"。
 *   本脚本会先读取它、生成时原样写回，不再在每个文件条目里重复写 version / download；
 *   页面运行时也只认这一处，自动派生所有版本显示与「溯源-v版本号.apk」下载文件名。
 *   换版本时只改那一行即可（不跑本脚本、直接手改 releases.json 也生效）。
 *
 * ★ Web 版入口【唯一配置】：releases.json 顶层的 "webUrl"。
 *   填上网址 → 首页 / 下载卡片出现「Web 版」按钮，点击在新标签打开；
 *   留空 ""   → 按钮照常显示，点击提示「Web 版未添加部署」，不会乱跳。
 *   本脚本会读回并原样写回这个字段，手改清单后重跑构建 / Actions 都不会把它清空。
 *
 * ★ 重要：GitHub Pages 是纯静态托管，服务器上【不会也不必】运行本脚本 / Node.js。
 *   本脚本只在「上传之前」执行 —— 你自己的电脑，或 GitHub Actions 的构建机；
 *   生成的 releases.json 与 guide-preview.html 都是静态文件，push 上去即可。
 *   完全不用 Node 也能部署：把新版 APK 覆盖成 appAPK/溯源.apk 直接 push，
 *   页面会 HEAD 探测真实大小与日期；此时清单里的 SHA-256 会自动隐藏（避免过期误导）。
 *
 * 想省掉手动执行，可启用 .github/workflows/refresh-releases.yml：
 * 只要 push 了 appAPK/ 里的新包，Actions 会自动跑本脚本并提交清单。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const APK_DIR = path.join(ROOT, 'appAPK');
const OUT = path.join(ROOT, 'releases.json');
const GUIDE_SRC = path.join(ROOT, 'wechat.html');
const GUIDE_PREVIEW = path.join(ROOT, 'guide-preview.html');

// 站点级配置。★ version / webUrl / github 不在这里写死：
// 唯一来源是 releases.json 顶层同名字段，main() 启动时会先读回再生成，
// 所以手改清单后重跑本脚本、或 Actions 自动构建，都不会把用户改的值打回默认。
const SITE = {
  app: '溯源',
  version: '',
  subtitle: '子午流注 · 素问极简版',
  qq: '1241611627',
  github: '',   // 例如 https://github.com/yourname/suyuan ，填了页面才显示「仓库」按钮
  webUrl: '',   // Web 版地址，例如 https://xxx.github.io/suyuan-web/ ；留空则点击提示「Web 版未添加部署」
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

/* ---------------- 自动识别「最新版」APK ---------------- */
// 从文件名里抓版本号：溯源-v1.0.3.apk → 1.0.3；溯源_1_1_0.apk → 1.1.0；溯源.apk → ''
function versionOf(fileName) {
  const base = path.basename(fileName, path.extname(fileName));
  const m = base.match(/(?:^|[^0-9])[vV]?(\d+(?:[._-]\d+){0,4})(?:[^0-9]|$)/);
  return m ? m[1].replace(/[_-]/g, '.') : '';
}
// 语义化版本比较：a > b 返回正数
function cmpVersion(a, b) {
  const pa = String(a || '0').split('.').map(x => parseInt(x, 10) || 0);
  const pb = String(b || '0').split('.').map(x => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// ★ 读回站点级配置：version / webUrl / github 都以 releases.json 顶层为唯一来源。
// 用户手改清单后，Actions 重跑本脚本也不会把版本号或 Web 版地址打回默认值。
function readPreviousSite() {
  try {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    if (!prev || typeof prev !== 'object') return;
    if (typeof prev.version === 'string' && prev.version.trim()) SITE.version = prev.version.trim();
    if (typeof prev.webUrl === 'string') SITE.webUrl = prev.webUrl.trim();
    if (typeof prev.github === 'string') SITE.github = prev.github.trim();
  } catch (e) { /* 清单不存在 / 格式异常：保持默认 */ }
}

// 可选：若 appAPK/ 里同时放了 子午流注.js，读取其中的副标题与 QQ。
// 注意：这里【故意不读】LOCAL_VERSION —— 版本号只认 releases.json 顶层一处。
function readScriptMeta() {
  const p = path.join(APK_DIR, '子午流注.js');
  if (!fs.existsSync(p)) return;
  const head = fs.readFileSync(p, 'utf8').slice(0, 12000);
  const name = head.match(/UPDATE_APP_NAME\s*=\s*["']([^"']+)["']/);
  const qq = head.match(/DEV_QQ\s*=\s*["']([^"']+)["']/);
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
  .gp-bar { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 6px 14px;
    width: min(100%, 540px); margin: 44px 0 18px; padding: 11px 14px;
    border: 1px solid #C6DBD6; border-radius: 12px; background: #E4F0ED;
    font-size: 12px; line-height: 1.65; color: #2A5A54; text-align: left; }
  .gp-bar b { grid-column: 1; grid-row: 1; font-size: 13px; color: #1E3330; }
  .gp-bar a { grid-column: 2; grid-row: 1; white-space: nowrap; color: #1E6B5A; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
  .gp-bar span { grid-column: 1 / -1; grid-row: 2; min-width: 0; }
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
  readPreviousSite();         // ★ 先读回 version / webUrl / github，避免把用户手改的值打回默认
  readScriptMeta();
  syncGuidePreview();

  if (!fs.existsSync(APK_DIR)) fs.mkdirSync(APK_DIR, { recursive: true });

  const entries = fs.readdirSync(APK_DIR).filter(n => {
    if (n.startsWith('.')) return false;             // .gitkeep / 隐藏文件
    return fs.statSync(path.join(APK_DIR, n)).isFile();
  }).map(name => {
    const full = path.join(APK_DIR, name);
    const ext = path.extname(name).toLowerCase();
    return {
      name, full, ext,
      stat: fs.statSync(full),
      meta: TYPES[ext] || { kind: 'other', label: '文件', hint: '本地文件', priority: 9 },
    };
  });

  /* ---- 自动挑最新版 APK ---- */
  const apks = entries.filter(e => e.ext === '.apk');
  apks.forEach(e => { e.version = versionOf(e.name); });
  let maxVersion = '';
  apks.forEach(e => { if (e.version && cmpVersion(e.version, maxVersion) > 0) maxVersion = e.version; });
  // 候选 = 无版本号的约定名（当前发布版） + 版本号最高的那批
  const candidates = apks.filter(e => !e.version || (maxVersion && cmpVersion(e.version, maxVersion) === 0));
  candidates.sort((a, b) => {
    const d = b.stat.mtimeMs - a.stat.mtimeMs;
    if (Math.abs(d) > 1000) return d;                       // 修改时间相差明显：新的在前
    if (!a.version !== !b.version) return a.version ? 1 : -1; // 时间相同：优先约定名
    return a.name.localeCompare(b.name, 'zh');
  });
  const latestEntry = candidates[0] || null;
  // 文件名带版本号时，页面显示版本也跟着自动变；否则沿用 releases.json 顶层 version
  if (latestEntry && latestEntry.version) SITE.version = latestEntry.version;

  const files = [];
  for (const e of entries) {
    const isLatest = !!latestEntry && e.full === latestEntry.full;
    files.push({
      file: e.name,
      title: path.basename(e.name, e.ext),
      label: e.meta.label,
      hint: e.meta.hint,
      kind: e.meta.kind,
      priority: isLatest ? -1 : e.meta.priority,   // 最新版排第一
      ext: e.ext,
      latest: isLatest || undefined,
      size: e.stat.size,
      sha256: await sha256(e.full),
      updated: dateOf(e.stat.mtimeMs),
      mtime: new Date(e.stat.mtimeMs).toISOString(),
      // 中文文件名做 URL 编码，避免 GitHub Pages 上的路径问题
      url: 'appAPK/' + encodeURIComponent(e.name),
      // ★ 故意不写 version / download：版本号只在顶层写一次，
      //   页面运行时自动派生所有版本显示与「溯源-v版本号.apk」下载文件名。
    });
  }

  files.sort((a, b) => a.priority - b.priority || a.file.localeCompare(b.file, 'zh'));

  const latest = files.find(f => f.latest) || null;
  const apkList = files.filter(f => f.kind === 'apk');
  const data = {
    ...SITE,
    generated: new Date().toISOString(),
    // 约定俗成的主安装包名：即使没跑本脚本，页面也会探测它
    primaryName: `${SITE.app}.apk`,
    primaryUrl: 'appAPK/' + encodeURIComponent(`${SITE.app}.apk`),
    // 自动选中的最新版：页面优先把它作为下载链接
    latest: latest,
    latestUrl: latest ? latest.url : null,
    latestName: latest ? latest.file : null,
    // 运行时探测用的全部 APK 候选（按「最新优先」顺序）。同样不重复写 version / download。
    apkCandidates: apkList.map(f => ({
      file: f.file, url: f.url,
      size: f.size, mtime: f.mtime, sha256: f.sha256,
    })),
    files,
  };

  fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`[build] 版本 ${data.version || '（未设置）'} · ${files.length} 个文件 → releases.json`);
  console.log(`  · 版本号唯一入口：releases.json 顶层 "version" = ${data.version || '（未设置，页面显示「最新版」）'}`);
  console.log(`  · Web 版地址 "webUrl" = ${data.webUrl || '（未填写：点击提示「Web 版未添加部署」）'}`);
  if (latest) {
    console.log(`  ★ 主下载（自动选中最新版）：${latest.file}  ${data.version ? 'v' + data.version : '最新版'}  ` +
      `${(latest.size / 1024 / 1024).toFixed(2)} MB  ${latest.updated}`);
  }
  files.forEach(f => console.log(`  - ${f.file}  ${(f.size / 1024 / 1024).toFixed(2)} MB  ${f.updated}${f.latest ? '  ← 最新' : ''}`));
  if (!apkList.length) {
    console.log(`[build] 提示：appAPK/ 里还没有 APK。把安装包命名为「${SITE.app}.apk」放进去再跑一次即可。`);
  }
}

main().catch(err => {
  console.error('[build] 失败：', err);
  process.exit(1);
});
