/* ==========================================================================
   溯源 · 下载页交互
   1) 读取 releases.json（由 node build.js 生成）渲染下载区
   2) 页面主题：与 App 内五套 THEMES 对应，localStorage 记忆
   3) 十二时辰经络流注环
   ========================================================================== */
(function () {
  'use strict';

  // 本地预览 / releases.json 读取失败时的兜底清单，指向真正的安装包。
  // 真正部署时以 releases.json 为准（版本、大小、校验值由 build.js 自动刷新）。
  var FALLBACK = {
    app: '溯源',
    version: '1.0.2',
    subtitle: '子午流注 · 素问极简版',
    qq: '1241611627',
    github: '',
    primaryName: '溯源.apk',
    primaryUrl: 'appAPK/%E6%BA%AF%E6%BA%90.apk',
    files: [{
      file: '溯源.apk', title: '溯源', label: 'Android 安装包',
      hint: 'Android 7.0+ · 下载后直接安装', kind: 'apk', priority: 0,
      size: 4364871, sha256: '6b70d16252c85cd377a15fcb35ec3989335a7488bbbc5dd0667ce51d81804999',
      updated: '2026-11-14', url: 'appAPK/%E6%BA%AF%E6%BA%90.apk',
      download: '溯源-v1.0.2.apk'
    }]
  };

  var $ = function (s, root) { return (root || document).querySelector(s); };
  var $$ = function (s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var sizeText = function (n) {
    if (!n && n !== 0) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  };
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
    var apk = files.filter(function (f) { return f.kind === 'apk'; })[0];
    var main = apk || files[0];
    var ver = state.version || '1.0.2';

    // 站点级信息
    $('#heroVersion').textContent = 'v' + ver;
    $('#dlVersion').textContent = 'v' + ver;
    $$('[data-ver]').forEach(function (el) { el.textContent = ver; });
    var qq = $('#qqBtn'); if (qq && state.qq) qq.textContent = state.qq;
    var gh = $('#githubLink');
    if (state.github) { gh.href = state.github; gh.hidden = false; }
    else { gh.hidden = true; }

    if (!main) {
      $('#dlLabel').textContent = '暂无可下载文件';
      $('#dlTitle').textContent = '文件准备中';
      $('#dlHint').textContent = '请把文件放进 appAPK/ 目录并运行 node build.js';
      $('#dlMainBtn').removeAttribute('href');
      return;
    }

    var isApk = main.kind === 'apk';
    $('#dlLabel').textContent = main.label || (isApk ? 'Android 安装包' : '本地文件');
    $('#dlTitle').textContent = isApk ? (state.app || '溯源') + ' · Android 安装包' : (main.title || main.file);
    $('#dlHint').textContent = isApk ? (main.hint || state.subtitle || '') : (main.hint || '本地文件');
    $('#dlSize').textContent = sizeText(main.size);
    $('#dlDate').textContent = main.updated || '—';
    $('#dlPlatform').textContent = isApk ? 'Android 7.0+' : '本地文件';
    $('#dlMainText').textContent = isApk ? ('下载安装包 · v' + ver) : ('下载 ' + main.file);
    $('#heroBtnText').textContent = isApk ? '下载溯源 v' + ver : '下载文件';
    $('#heroMeta').textContent = '版本 v' + ver + ' · ' + sizeText(main.size) + ' · ' +
      (isApk ? 'Android 7.0+' : '本地文件') + ' · 无网络依赖';

    var btn = $('#dlMainBtn');
    btn.setAttribute('href', main.url);
    btn.setAttribute('download', main.download || main.file);
    btn.onclick = function () { toast('开始下载 ' + (main.download || main.file)); };

    var sha = main.sha256 || '';
    $('#dlSha').textContent = sha ? shortHash(sha) : '—';
    $('#dlSha').title = sha;
    $('#copySha').style.display = sha ? '' : 'none';
    $('#copySha').onclick = function () { copyText(sha, 'SHA-256 已复制'); };

    $('#dlNotice').classList.toggle('show', !isApk);

    var others = files.filter(function (f) { return f !== main; });
    var box = $('#dlOthers');
    box.innerHTML = others.map(function (f) {
      return '<a href="' + esc(f.url) + '" download="' + esc(f.download || f.file) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>' +
        esc(f.file) + ' <small>' + sizeText(f.size) + '</small></a>';
    }).join('');

    var rd = $('#releaseDate');
    if (rd) rd.textContent = main.updated || (state.generated || '').slice(0, 7) || '';
  }

  // HEAD 探测：即使忘记跑 build.js，只要把 溯源.apk 放进 appAPK/ 也能自动出现
  function probePrimary(url) {
    return new Promise(function (resolve) {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, 4000);
      fetch(url, { method: 'HEAD', signal: ctrl.signal }).then(function (r) {
        clearTimeout(timer);
        if (!r.ok) return resolve(null);
        resolve({ size: Number(r.headers.get('content-length')) || 0, res: r });
      }).catch(function () { clearTimeout(timer); resolve(null); });
    });
  }

  async function initRelease() {
    render(FALLBACK);
    var data = null;
    try {
      var res = await fetch('releases.json', { cache: 'no-store' });
      if (res.ok) data = await res.json();
    } catch (e) { /* 本地 file:// 预览会走这里，用兜底清单 */ }

    var base = data || FALLBACK;
    var primaryUrl = base.primaryUrl || FALLBACK.primaryUrl;
    var hasApk = (base.files || []).some(function (f) { return f.kind === 'apk'; });

    if (!hasApk) {
      var hit = await probePrimary(primaryUrl);
      if (hit) {
        var files = (base.files || []).slice();
        files.unshift({
          file: base.primaryName || '溯源.apk',
          title: base.app || '溯源',
          label: 'Android 安装包',
          hint: '下载后直接安装（未运行 build.js，仅显示基础信息）',
          kind: 'apk', priority: 0,
          size: hit.size, sha256: '', updated: (hit.res.headers.get('last-modified') || '').slice(0, 16),
          url: primaryUrl,
          download: (base.app || '溯源') + '-v' + (base.version || '1.0.2') + '.apk'
        });
        base = Object.assign({}, base, { files: files });
      }
    }
    render(base);
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
})();
