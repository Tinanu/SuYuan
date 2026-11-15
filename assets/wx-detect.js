/* ==========================================================================
   溯源 · 微信环境统一判定
   index.html / wechat.html / assets/wechat.js / diag.html 共用这一份。
   之前三处各写一份规则，某些手机 UA 变体只在其中一处命中，
   就会出现「有的手机出引导页、有的不出」。统一后不会再有这种差异。
   ========================================================================== */
(function () {
  'use strict';

  // 返回命中的信号列表，diag.html 会把它显示出来方便排查
  function signals() {
    var ua = navigator.userAgent || '';
    var low = ua.toLowerCase();
    var hit = [];

    // 1) UA 关键字：覆盖安卓微信、iOS 微信、PC 微信、企业微信、小程序 WebView、开发者工具
    ['micromessenger', 'wechat', 'weixin', 'wxwork', 'mmwebidea',
     'micro messenger', 'wechatdevtools', 'miniprogram'].forEach(function (k) {
      if (low.indexOf(k) > -1) hit.push('UA:' + k);
    });

    // 2) 微信注入到页面里的全局对象 / 环境变量（UA 被改写的机型靠这些兜住）
    try { if (window.__wxjs_environment === 'miniprogram') hit.push('env:miniprogram'); } catch (e) {}
    try { if (window.__wxjs_is_wkwebview != null) hit.push('env:wkwebview'); } catch (e) {}
    try { if (typeof window.WeixinJSBridge !== 'undefined') hit.push('WeixinJSBridge'); } catch (e) {}
    try { if (window.wx && typeof window.wx.config === 'function') hit.push('wx.config'); } catch (e) {}

    // 注意：MQQBrowser 只说明是 X5 内核，QQ 浏览器也有，不能单独当作微信。
    return hit;
  }

  function isWechat() { return signals().length > 0; }

  window.suyuanIsWechat = isWechat;
  window.suyuanWechatSignals = signals;
  window.__suyuanIsWechat = isWechat;   // 兼容旧调用
})();
