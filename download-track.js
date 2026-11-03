(function () {
  "use strict";

  var cfg = window.PP_CONFIG || {};
  var api = window.PPApi;

  // 赞助购买按钮：没有配置发卡平台时给出提示
  var buy = document.getElementById("sponsorBuy");
  if (buy) {
    if (cfg.salesUrl) {
      buy.href = cfg.salesUrl;
      buy.target = "_blank";
      buy.rel = "noopener";
    } else {
      buy.textContent = "发卡平台即将上线";
      buy.removeAttribute("target");
      buy.addEventListener("click", function (event) {
        event.preventDefault();
        alert("发卡平台还在准备中。上线后这里会直接跳到 ¥9.9 永久赞助卡密商品页。");
      });
    }
  }

  // 登录用户从官网下载 APK 时记录一条下载历史（每个版本每天只记一次）
  function trackDownload(link) {
    if (!api || !api.getSession || !api.getSession()) return;
    var version = "1.3.0";
    var day = new Date().toISOString().slice(0, 10);
    var key = "pp_dl_" + version + "_" + day;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch (e) {}

    api.addDownload({
      title: "PP管理器",
      version: version,
      platform: "Android",
      size_bytes: 5735248,
      source: "website"
    }).catch(function () {
      try { localStorage.removeItem(key); } catch (e) {}
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll("a[download]"), function (link) {
    link.addEventListener("click", function () { trackDownload(link); });
  });
})();
