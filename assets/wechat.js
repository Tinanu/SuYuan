/* 溯源 · 微信引导页脚本（只服务 wechat.html）
   这里没有步骤切换：一张完整手机示意图在 HTML 里一次呈现，图上标好 ① ②。
   本文件只处理：真实域名、iOS 文案、复制下载页链接、跳过标记。 */
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  // 复制给用户的必须是「下载页」链接，而不是引导页本身；同时去掉 wx/nowx 预览参数。
  function downloadPageUrl() {
    var path = location.pathname.replace(/[^/]*$/, '') + 'index.html';
    var kept = location.search.replace(/^[?&]+/, '').split('&').filter(function (kv) {
      return kv && !/^(wx|nowx)=/.test(kv);
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

  var skipBtn = $('#wxSkip');
  if (skipBtn) skipBtn.addEventListener('click', function () {
    try { sessionStorage.setItem('suyuan-wx-skip', '1'); } catch (e) {}
    location.href = 'index.html?nowx=1';
  });
})();
