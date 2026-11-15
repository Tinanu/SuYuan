/* ==========================================================================
   溯源 · 下载页交互
   1) 读取 releases.json（由 node build.js 生成）渲染下载区
   2) 页面主题：与 App 内五套 THEMES 对应，localStorage 记忆
   3) 十二时辰经络流注环
   ========================================================================== */
(function () {
  'use strict';

  // 兜底只保留「去哪找文件」。版本、大小、日期、SHA-256 一律不手填：
  // 优先用 build.js 自动生成的 releases.json，其次运行时 HEAD 探测真实文件大小。
  var FALLBACK = {
    app: '溯源',
    version: '',
    subtitle: '子午流注 · 素问极简版',
    qq: '1241611627',
    github: '',
    primaryName: '溯源.apk',
    primaryUrl: 'appAPK/%E6%BA%AF%E6%BA%90.apk',
    files: []
  };

  var $ = function (s, root) { return (root || document).querySelector(s); };
  var $$ = function (s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var sizeText = function (n) {
    if (!n) return '—';                    // 未探测到大小时留空，绝不显示手填数字
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  };
  // 语义化版本比较（与 build.js 同规则）
  function cmpVersion(a, b) {
    var pa = String(a || '0').split('.').map(function (x) { return parseInt(x, 10) || 0; });
    var pb = String(b || '0').split('.').map(function (x) { return parseInt(x, 10) || 0; });
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d;
    }
    return 0;
  }
  function versionFromFile(name) {
    var m = String(name || '').match(/(?:^|[^0-9])[vV]?(\d+(?:[._-]\d+){0,4})(?:[^0-9]|$)/);
    return m ? m[1].replace(/[_-]/g, '.') : '';
  }
  function dateText(v) {
    if (!v) return '—';
    var d = new Date(v);
    if (isNaN(d.getTime())) return String(v).slice(0, 10);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function pickNewest(list) {
    return list.slice().sort(function (a, b) {
      var c = cmpVersion(b.version || versionFromFile(b.file), a.version || versionFromFile(a.file));
      if (c) return c;
      return (Date.parse(b.mtime || b.updated || '') || 0) - (Date.parse(a.mtime || a.updated || '') || 0);
    })[0] || null;
  }
  var shortHash = function (h) { return h && h.length > 34 ? h.slice(0, 16) + ' … ' + h.slice(-10) : (h || '—'); };

  /* ---------------- Toast ---------------- */
  var toastEl = $('#toast'), toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2400);
  }
  function copyText(text, msg) {
    if (!text) return;
    var done = function () { toast(msg || '已复制到剪贴板'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(function () { legacyCopy(text, done); });
    } else {
      legacyCopy(text, done);
    }
  }
  function legacyCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动选择'); }
    document.body.removeChild(ta);
  }

  /* ---------------- 主题 ---------------- */
  var THEME_META = {
    suwen:   { name: '素问墨绿' },
    xuanzhi: { name: '宣纸朱印' },
    moye:    { name: '墨夜浅金' },
    qingci:  { name: '青瓷月白' },
    dailan:  { name: '黛蓝雅灰' }
  };
  function setTheme(id, remember) {
    if (!THEME_META[id]) id = 'qingci';
    document.documentElement.setAttribute('data-theme', id);
    $$('.theme-dots button, .theme-card').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-theme') === id);
      el.setAttribute('aria-pressed', el.getAttribute('data-theme') === id ? 'true' : 'false');
    });
    var t = $('#themeStatusName'); if (t) t.textContent = THEME_META[id].name;
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
    if (remember !== false) {
      try { localStorage.setItem('suyuan-theme', id); } catch (e) {}
    }
  }
  $$('.theme-dots button, .theme-card').forEach(function (el) {
    el.addEventListener('click', function () { setTheme(el.getAttribute('data-theme')); });
  });
  setTheme(document.documentElement.getAttribute('data-theme') || 'qingci', false);

  /* ---------------- 下载区 ---------------- */
  var state = FALLBACK;

  function render(data) {
    state = data || FALLBACK;
    var files = (state.files || []).slice().sort(function (a, b) {
      return (a.priority == null ? 9 : a.priority) - (b.priority == null ? 9 : b.priority);
    });
    var apks = files.filter(function (f) { return f.kind === 'apk'; });
    // 主下载永远用「自动选出的最新版」，不写死文件名 / 版本 / 大小
    var main = state.latest || pickNewest(apks) || files[0];
    var ver = (main && main.version) || state.version || '';
    var vlabel = ver ? 'v' + ver : '最新版';

    // 站点级信息
    $('#heroVersion').textContent = vlabel;
    $('#dlVersion').textContent = vlabel;
    $$('[data-ver]').forEach(function (el) { el.textContent = ver || '—'; });
    var qq = $('#qqBtn'); if (qq && state.qq) qq.textContent = state.qq;
    var gh = $('#githubLink');
    if (state.github) { gh.href = state.github; gh.hidden = false; }
    else { gh.hidden = true; }

    if (!main) {
      $('#dlLabel').textContent = '正在检测安装包';
      $('#dlTitle').textContent = '自动读取 appAPK/ 目录…';
      $('#dlHint').textContent = '把 APK 放进 appAPK/ 即可，版本与大小会自动计算';
      $('#dlMainBtn').removeAttribute('href');
      return;
    }

    var isApk = main.kind === 'apk';
    $('#dlLabel').textContent = main.label || (isApk ? 'Android 安装包' : '本地文件');
    $('#dlTitle').textContent = isApk ? (state.app || '溯源') + ' · Android 安装包' : (main.title || main.file);
    $('#dlHint').textContent = (isApk ? (main.hint || state.subtitle || '') : (main.hint || '本地文件')) +
      (main.stale ? ' · 清单未刷新，已隐藏过期校验值' : '');
    $('#dlSize').textContent = sizeText(main.size);
    $('#dlDate').textContent = main.updated || '—';
    $('#dlPlatform').textContent = isApk ? 'Android 7.0+' : '本地文件';
    $('#dlMainText').textContent = isApk ? ('下载安装包 · ' + vlabel) : ('下载 ' + main.file);
    $('#heroBtnText').textContent = isApk ? ('下载溯源 ' + vlabel) : '下载文件';
    $('#heroMeta').textContent = '版本 ' + vlabel + ' · ' + sizeText(main.size) + ' · ' +
      (isApk ? 'Android 7.0+' : '本地文件') + ' · 无网络依赖';

    var btn = $('#dlMainBtn');
    btn.setAttribute('href', main.url);
    btn.setAttribute('download', main.download || main.file);
    btn.onclick = function () { toast('开始下载 ' + (main.download || main.file)); };

    var sha = main.sha256 || '';
    $('#dlSha').textContent = sha ? shortHash(sha) : '—';
    $('#dlSha').title = sha || (main.stale
      ? '安装包已更新但清单未刷新，旧的 SHA-256 已作废。本地跑一次 node build.js 可重新生成。'
      : '未生成校验值');
    $('#copySha').style.display = sha ? '' : 'none';
    $('#copySha').onclick = function () { copyText(sha, 'SHA-256 已复制'); };

    $('#dlNotice').classList.toggle('show', !isApk);

    var others = files.filter(function (f) { return f.url !== main.url; });
    var box = $('#dlOthers');
    box.innerHTML = others.map(function (f) {
      return '<a href="' + esc(f.url) + '" download="' + esc(f.download || f.file) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>' +
        esc(f.file) + ' <small>' + sizeText(f.size) + '</small></a>';
    }).join('');

    var rd = $('#releaseDate');
    if (rd) rd.textContent = main.updated || (state.generated || '').slice(0, 7) || '';
  }

  /* ---------------- 自动发现「最新版」APK + 自动算大小 ----------------
     静态站点无法列目录，所以分两层：
       ① releases.json（build.js 自动生成）给出全部 APK 候选与自动选中的 latest；
       ② 运行时对每个候选做 HEAD，确认文件真实存在，并用响应头里的
          Content-Length / Last-Modified 覆盖大小与日期 —— 即使清单过期也不用手填。
     因此换包只要放进 appAPK/，下载链接、版本、大小、日期都会自动切过去。 */
  function probe(url) {
    return new Promise(function (resolve) {
      var ctrl = null;
      try { ctrl = new AbortController(); } catch (e) {}
      var opts = { method: 'HEAD', cache: 'no-store' };
      if (ctrl) opts.signal = ctrl.signal;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); resolve(null); }, 4000);
      fetch(url, opts).then(function (r) {
        clearTimeout(timer);
        if (!r.ok) return resolve(null);
        resolve({
          size: Number(r.headers.get('content-length')) || 0,
          lastModified: r.headers.get('last-modified') || ''
        });
      }).catch(function () { clearTimeout(timer); resolve(null); });
    });
  }

  function apkRecord(f, hit, base) {
    var file = f.file || f.name || base.primaryName || '溯源.apk';
    var fromName = versionFromFile(file);
    // releases.json 是 build.js 留下的静态快照。若线上 APK 的实际大小与清单不一致，
    // 说明换过包但没刷新清单（也就是「完全不跑 node、直接 push」的部署方式）：
    // 此时清单里的 SHA-256 与版本号已经过期，必须丢掉，否则用户拿旧哈希校验新包会失败。
    var stale = !!(hit && hit.size && f.size && Number(hit.size) !== Number(f.size));
    var version = fromName || (stale ? '' : (f.version || ''));
    var when = (hit && hit.lastModified) || f.mtime || f.updated || '';
    return {
      file: file,
      title: f.title || base.app || '溯源',
      label: f.label || 'Android 安装包',
      hint: f.hint || 'Android 7.0+ · 下载后直接安装',
      kind: 'apk', priority: -1,
      version: version,
      size: (hit && hit.size) || f.size || 0,
      sha256: stale ? '' : (f.sha256 || ''),
      stale: stale,
      updated: dateText(when),
      mtime: when,
      url: f.url,
      download: (f.download && !stale)
        ? f.download
        : ((base.app || '溯源') + (version ? '-v' + version : '') + '.apk')
    };
  }

  async function initRelease() {
    render(FALLBACK);                         // 先占位，页面不出现任何手填数字
    var data = null;
    try {
      var res = await fetch('releases.json', { cache: 'no-store' });
      if (res.ok) data = await res.json();
    } catch (e) { /* file:// 本地预览读不到清单，交给下方 HEAD 探测 */ }
    var base = data || FALLBACK;

    // 候选 = 清单里所有 APK + 约定名 溯源.apk（去重）
    var list = (base.apkCandidates && base.apkCandidates.length)
      ? base.apkCandidates.slice()
      : (base.files || []).filter(function (f) { return f.kind === 'apk'; }).slice();
    var primaryUrl = base.primaryUrl || FALLBACK.primaryUrl;
    var seen = {}, candidates = [];
    list.forEach(function (f) { if (f.url && !seen[f.url]) { seen[f.url] = 1; candidates.push(f); } });
    if (!seen[primaryUrl]) candidates.push({ file: base.primaryName || '溯源.apk', url: primaryUrl });

    // 并行 HEAD：确认哪些文件真实存在，并读取真实大小 / 修改时间
    var found = [];
    try {
      var probed = await Promise.all(candidates.map(function (f) {
        return probe(f.url).then(function (hit) { return hit ? apkRecord(f, hit, base) : null; });
      }));
      found = probed.filter(Boolean);
    } catch (e) { found = []; }

    // 自动挑最新：版本号 → 修改时间 → 清单标记的 latest
    var latestUrl = base.latestUrl || (base.latest && base.latest.url) || '';
    found.sort(function (a, b) {
      var c = cmpVersion(b.version, a.version);
      if (c) return c;
      var d = (Date.parse(b.mtime || '') || 0) - (Date.parse(a.mtime || '') || 0);
      if (d) return d;
      if (a.url === latestUrl) return -1;
      if (b.url === latestUrl) return 1;
      return 0;
    });
    var main = found[0];
    // 探测全失败（如直接双击 file://）时，仍用清单信息给出可点击的下载链接
    if (!main && candidates.length) main = apkRecord(candidates[0], null, base);

    render(Object.assign({}, base, {
      // 清单过期时连站点级版本号也一起作废，避免显示旧版本 / 旧哈希误导用户
      version: (main && main.stale) ? '' : ((main && main.version) || base.version || ''),
      latest: main || null,
      files: main
        ? [main].concat((base.files || []).filter(function (f) { return f.url !== main.url; }))
        : (base.files || [])
    }));
  }

  /* ---------------- 十二时辰流注环 ---------------- */
  var HOURS = [
    { b: '子', n: '子时', m: '足少阳胆经',   s: '胆经',   t: '23:00 – 01:00' },
    { b: '丑', n: '丑时', m: '足厥阴肝经',   s: '肝经',   t: '01:00 – 03:00' },
    { b: '寅', n: '寅时', m: '手太阴肺经',   s: '肺经',   t: '03:00 – 05:00' },
    { b: '卯', n: '卯时', m: '手阳明大肠经', s: '大肠经', t: '05:00 – 07:00' },
    { b: '辰', n: '辰时', m: '足阳明胃经',   s: '胃经',   t: '07:00 – 09:00' },
    { b: '巳', n: '巳时', m: '足太阴脾经',   s: '脾经',   t: '09:00 – 11:00' },
    { b: '午', n: '午时', m: '手少阴心经',   s: '心经',   t: '11:00 – 13:00' },
    { b: '未', n: '未时', m: '手太阳小肠经', s: '小肠经', t: '13:00 – 15:00' },
    { b: '申', n: '申时', m: '足太阳膀胱经', s: '膀胱经', t: '15:00 – 17:00' },
    { b: '酉', n: '酉时', m: '足少阴肾经',   s: '肾经',   t: '17:00 – 19:00' },
    { b: '戌', n: '戌时', m: '手厥阴心包经', s: '心包经', t: '19:00 – 21:00' },
    { b: '亥', n: '亥时', m: '手少阳三焦经', s: '三焦经', t: '21:00 – 23:00' }
  ];
  function currentHourIndex() {
    return Math.floor(((new Date().getHours() + 1) % 24) / 2);
  }
  function polar(r, deg) {
    var a = deg * Math.PI / 180;
    return [210 + r * Math.cos(a), 210 + r * Math.sin(a)];
  }
  function ringPath(r1, r2, a0, a1) {
    var p1 = polar(r2, a0), p2 = polar(r2, a1), p3 = polar(r1, a1), p4 = polar(r1, a0);
    return 'M' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2) +
      ' A' + r2 + ' ' + r2 + ' 0 0 1 ' + p2[0].toFixed(2) + ' ' + p2[1].toFixed(2) +
      ' L' + p3[0].toFixed(2) + ' ' + p3[1].toFixed(2) +
      ' A' + r1 + ' ' + r1 + ' 0 0 0 ' + p4[0].toFixed(2) + ' ' + p4[1].toFixed(2) + ' Z';
  }
  function selectHour(i, isNow) {
    var h = HOURS[i];
    $$('.wheel-segment').forEach(function (p, k) { p.classList.toggle('active', k === i); });
    $$('.wheel-char').forEach(function (t, k) { t.classList.toggle('on-accent', k === i); });
    $('#wheelNow').textContent = isNow ? '此刻当令' : '流注时辰';
    $('#wheelHour').textContent = h.n;
    $('#wheelMeridian').textContent = h.m;
    $('#wheelTime').textContent = h.t;
  }
  function buildWheel() {
    var svg = $('#hourWheel');
    if (!svg) return;
    var ns = 'http://www.w3.org/2000/svg';
    var parts = [];
    parts.push('<circle cx="210" cy="210" r="192" fill="none" stroke="var(--gold)" stroke-width="1" opacity=".45"/>');
    parts.push('<circle cx="210" cy="210" r="116" fill="none" stroke="var(--gold)" stroke-width="1" opacity=".35"/>');
    HOURS.forEach(function (h, i) {
      var a0 = -105 + i * 30, a1 = a0 + 29.2, mid = -90 + i * 30;
      var pos = polar(150, mid);
      parts.push('<path class="wheel-segment" data-i="' + i + '" d="' + ringPath(124, 180, a0, a1) + '"/>');
      parts.push('<text class="wheel-char" x="' + pos[0].toFixed(2) + '" y="' + pos[1].toFixed(2) + '">' + h.b + '</text>');
    });
    svg.innerHTML = parts.join('');
    var now = currentHourIndex();
    var segs = $$('.wheel-segment', svg);
    segs[now].classList.add('now');
    segs.forEach(function (seg, i) {
      seg.setAttribute('tabindex', '0');
      seg.setAttribute('role', 'button');
      seg.setAttribute('aria-label', HOURS[i].n + ' · ' + HOURS[i].m + ' · ' + HOURS[i].t);
      var pick = function () { selectHour(i, i === now); };
      seg.addEventListener('click', pick);
      seg.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    });
    selectHour(now, true);
    var ph = $('#phoneHour');
    if (ph) ph.textContent = HOURS[now].n + ' · ' + HOURS[now].s + '当令';
  }

  /* ---------------- 导航 / 动效 / 杂项 ---------------- */
  var navToggle = $('#navToggle'), nav = $('#nav');
  if (navToggle && nav) {
    navToggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $$('.nav-link', nav).forEach(function (a) {
      a.addEventListener('click', function () { nav.classList.remove('open'); navToggle.setAttribute('aria-expanded', 'false'); });
    });
  }

  if ('IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('visible'); revealObserver.unobserve(e.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    $$('.reveal').forEach(function (el) { revealObserver.observe(el); });

    var navObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        $$('.nav-link').forEach(function (a) {
          a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id);
        });
      });
    }, { rootMargin: '-35% 0px -55% 0px' });
    $$('main section[id]').forEach(function (s) { navObserver.observe(s); });
  } else {
    $$('.reveal').forEach(function (el) { el.classList.add('visible'); });
  }

  var qqBtn = $('#qqBtn');
  if (qqBtn) qqBtn.addEventListener('click', function () {
    copyText(qqBtn.textContent.trim(), '开发者 QQ 已复制');
  });
  var year = $('#year'); if (year) year.textContent = new Date().getFullYear();

  buildWheel();
  initRelease();

  /* ---------------- 微信引导：多层兜底 ----------------
     有的手机微信 WebView 首帧脚本没跑 / 被拦 / 缓存了旧代码，就会「不出引导页」。
     除 head 与 <body> 开头两道外，这里再补四道：
       · DOM 就绪复检，仍没跳成就插一条醒目的手动入口
       · 点「下载」或任何 APK 链接时再判一次（微信常直接吞掉下载请求）
       · pageshow / load / 页面重新可见时各复检一次
     判定统一走 assets/wx-detect.js，避免多处规则不一致。 */
  function wxIsWechat() {
    if (typeof window.suyuanIsWechat === 'function') return window.suyuanIsWechat();
    return !!(window.__suyuanIsWechat && window.__suyuanIsWechat());
  }
  function wxGoGuide() {
    try { location.replace('wechat.html'); }
    catch (e) { location.href = 'wechat.html'; }
  }
  function wxEnsureGuide() {
    try {
      if (window.__suyuanWxOff) return false;                  // 用户主动选过「仍要继续浏览」
      if (window.__suyuanGoWechat && window.__suyuanGoWechat()) return true;
      if (!wxIsWechat()) return false;
      wxGoGuide();
      return true;
    } catch (e) { return false; }
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (wxEnsureGuide()) return;
    if (!wxIsWechat() || document.getElementById('wxFallbackBar')) return;
    var bar = document.createElement('a');
    bar.id = 'wxFallbackBar';
    bar.href = 'wechat.html';
    bar.textContent = '微信里下载没反应？点这里看「在浏览器中打开」图文指引 →';
    bar.style.cssText = 'display:block;position:sticky;top:0;z-index:9998;padding:12px 14px;' +
      'background:#B24A3B;color:#fff;font-size:14px;font-weight:600;text-align:center;text-decoration:none';
    document.body.insertBefore(bar, document.body.firstChild);
  });

  // 点下载时才暴露问题（首帧没跳成功）的手机，在这一步拦下来
  document.addEventListener('click', function (e) {
    try {
      if (!wxIsWechat() || window.__suyuanWxOff || e.defaultPrevented) return;
      var a = e.target && e.target.closest ? e.target.closest('a') : null;
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (a.id !== 'dlMainBtn' && href.indexOf('appAPK/') < 0 && !/\.apk(\?|$)/i.test(href)) return;
      e.preventDefault();
      wxGoGuide();
    } catch (err) {}
  }, true);

  ['pageshow', 'load'].forEach(function (ev) {
    window.addEventListener(ev, function () { wxEnsureGuide(); });
  });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) wxEnsureGuide();
  });
})();
