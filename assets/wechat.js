/* 溯源 · 微信引导页脚本（只服务 wechat.html）
   一张完整手机示意图在 HTML 里一次呈现，图上标好 ① ②，没有步骤切换。
   本文件只处理：浏览器预览提示、真实域名、iOS 文案、复制下载页链接、跳过标记。 */
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  // 与主页共用同一份判定规则（assets/wx-detect.js），预览页也会加载它
  function isWechat() {
    if (typeof window.suyuanIsWechat === 'function') return window.suyuanIsWechat();
    var ua = navigator.userAgent || '';
    if (/MicroMessenger|wxwork|WeChat|weixin|MMWEBIDEA|Micro Messenger/i.test(ua)) return true;
    try { if (window.__wxjs_environment === 'miniprogram') return true; } catch (e) {}
    try { if (typeof WeixinJSBridge !== 'undefined') return true; } catch (e) {}
    return false;
  }

  // 普通浏览器打开引导页时停留展示，并说明「这是预览」，避免误以为页面坏了。
  if (!isWechat()) {
    var bar = $('#wxPreviewBar');
    if (bar) bar.hidden = false;
  }

  // 复制给用户的必须是「下载页」链接，而不是引导页本身；
  // 同时去掉 wx / nowx / from / preview 这些流程与预览参数。
  function downloadPageUrl() {
    var path = location.pathname.replace(/[^/]*$/, '') + 'index.html';
    var kept = location.search.replace(/^[?&]+/, '').split('&').filter(function (kv) {
      return kv && !/^(wx|nowx|from|preview)=/.test(kv);
    });
    return location.protocol + '//' + location.host + path + (kept.length ? '?' + kept.join('&') : '');
  }

  var toastEl = $('#wxToast'), toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2400);
  }

  function copyText(text, msg) {
    var done = function () { toast(msg); };
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      try { document.execCommand('copy'); done(); }
      catch (e) { toast('复制失败，请长按下方链接手动复制'); }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  // 示意图里显示真实域名（部署后就是 tinanu.github.io 这类地址）
  $$('.js-host').forEach(function (el) {
    el.textContent = location.host || 'tinanu.github.io';
  });

  // 背景下载页上的版本号：只读 releases.json 顶层 version，不再硬编码在 HTML 里。
  // 读不到（file:// 本地预览 / 零清单部署）就留空，不影响引导图。
  (function fillVersion() {
    var els = $$('.js-ver');
    if (!els.length || typeof fetch !== 'function') return;
    fetch('releases.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var v = d && String(d.version || '').trim();
        els.forEach(function (el) { el.textContent = v ? 'v' + v : ''; });
      })
      .catch(function () {});
  })();

  // iPhone 的微信菜单写作「在 Safari 中打开」，且装不了 APK
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    $$('[data-wx-ios]').forEach(function (el) { el.textContent = el.getAttribute('data-wx-ios'); });
    var tip = $('#wxIosTip');
    if (tip) tip.hidden = false;
  }

  var urlInput = $('#wxUrl');
  if (urlInput) {
    urlInput.value = downloadPageUrl();
    urlInput.addEventListener('focus', function () { urlInput.select(); });
    urlInput.addEventListener('click', function () { urlInput.select(); });
  }

  var copyBtn = $('#wxCopy');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    copyText(downloadPageUrl(), '链接已复制，打开浏览器粘贴访问');
  });

  // 跳过用 URL 参数 nowx=1 表达，不再写 sessionStorage —— 那个标记会让微信里永久不再跳引导。
  var skipBtn = $('#wxSkip');
  if (skipBtn) skipBtn.addEventListener('click', function () {
    location.href = 'index.html?nowx=1';
  });
})();
