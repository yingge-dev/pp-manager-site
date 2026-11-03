(function () {
  "use strict";

  var api = window.PPApi;
  var cfg = window.PP_CONFIG || {};
  var state = {
    profile: null,
    membership: { plan: "free", status: "active" },
    favorites: [],
    downloads: [],
    devices: [],
    settings: {}
  };

  function $(id) { return document.getElementById(id); }
  function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fmtDate(value) {
    if (!value) return "";
    var d = new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function fmtDateTime(value) {
    if (!value) return "";
    var d = new Date(value);
    if (isNaN(d.getTime())) return "";
    return fmtDate(value) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function fmtSize(bytes) {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  }

  function initials(name, email) {
    var s = String(name || email || "P").trim();
    return s ? s.slice(0, 1).toUpperCase() : "P";
  }

  function toast(message) {
    var el = $("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { el.classList.remove("show"); }, 2600);
  }

  function errorText(err) {
    var msg = err && (err.message || err.error_description || err.msg) || "操作失败";
    if (/Email not confirmed/i.test(msg)) return "邮箱尚未验证，请先查收验证邮件。";
    if (/Invalid login credentials/i.test(msg)) return "邮箱或密码错误。";
    if (/User already registered/i.test(msg)) return "该邮箱已注册。";
    if (/Password should be at least/i.test(msg)) return "密码太短，至少 6 位。";
    if (/Failed to fetch/i.test(msg)) return "无法连接服务器，请检查网络或 Supabase 配置。";
    return msg;
  }

  function setAuthError(message) {
    var el = $("authError");
    if (!el) return;
    el.textContent = message || "";
    el.hidden = !message;
  }

  function setButtonLoading(btn, loading, text) {
    if (!btn) return;
    if (loading) {
      btn.dataset.original = btn.textContent;
      btn.disabled = true;
      btn.textContent = text || "请稍候…";
    } else {
      btn.disabled = false;
      btn.textContent = btn.dataset.original || btn.textContent;
    }
  }

  // ---------- 主题 / 菜单 ----------

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("pp-theme", theme); } catch (e) {}
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#f6f7fb" : "#070a12");
  }

  var themeBtn = $("themeBtn");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      applyTheme(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light");
    });
  }

  var navToggle = $("navToggle");
  var navLinks = $("navLinks");
  if (navToggle && navLinks) {
    navToggle.addEventListener("click", function () {
      var open = navLinks.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    navLinks.addEventListener("click", function (event) {
      if (event.target.closest("a")) {
        navLinks.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  // ---------- 视图切换 ----------

  function showAuth() {
    $("authView").hidden = false;
    $("dashboardView").hidden = true;
    setAuthError("");
  }

  function showDashboard() {
    $("authView").hidden = true;
    $("dashboardView").hidden = false;
  }

  function switchAuthTab(tab) {
    all("[data-auth-tab]").forEach(function (el) {
      var active = el.getAttribute("data-auth-tab") === tab;
      if (el.classList.contains("auth-tab")) {
        el.classList.toggle("active", active);
        el.setAttribute("aria-selected", active ? "true" : "false");
      }
    });
    $("loginForm").hidden = tab !== "login";
    $("registerForm").hidden = tab !== "register";
    setAuthError("");
  }

  all("[data-auth-tab]").forEach(function (el) {
    el.addEventListener("click", function () { switchAuthTab(el.getAttribute("data-auth-tab")); });
  });

  // ---------- 登录 / 注册 ----------

  var loginForm = $("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", function (event) {
      event.preventDefault();
      setAuthError("");
      var email = $("loginEmail").value.trim();
      var password = $("loginPassword").value;
      var btn = loginForm.querySelector("button[type=submit]");
      setButtonLoading(btn, true, "登录中…");
      api.signIn(email, password).then(function () {
        return enterDashboard();
      }).catch(function (err) {
        setAuthError(errorText(err));
      }).finally(function () {
        setButtonLoading(btn, false);
      });
    });
  }

  var registerForm = $("registerForm");
  if (registerForm) {
    registerForm.addEventListener("submit", function (event) {
      event.preventDefault();
      setAuthError("");
      var name = $("registerName").value.trim();
      var email = $("registerEmail").value.trim();
      var password = $("registerPassword").value;
      var btn = registerForm.querySelector("button[type=submit]");
      setButtonLoading(btn, true, "注册中…");
      api.signUp(email, password, name).then(function (result) {
        if (result && result.needsConfirmation) {
          setAuthError("注册成功，请到邮箱点击验证链接后再登录。");
          switchAuthTab("login");
          $("loginEmail").value = email;
          return;
        }
        return enterDashboard();
      }).catch(function (err) {
        setAuthError(errorText(err));
      }).finally(function () {
        setButtonLoading(btn, false);
      });
    });
  }

  // ---------- 仪表盘加载 ----------

  function loadAll() {
    return Promise.all([
      api.getProfile(),
      api.getMembership(),
      api.getFavorites(),
      api.getDownloads(),
      api.getDevices(),
      api.getSettings()
    ]).then(function (values) {
      state.profile = values[0];
      state.membership = values[1] || { plan: "free", status: "active" };
      state.favorites = values[2] || [];
      state.downloads = values[3] || [];
      state.devices = values[4] || [];
      state.settings = values[5] || {};
    });
  }

  function enterDashboard() {
    return loadAll().then(function () {
      showDashboard();
      renderAll();
      api.registerDevice({ last_seen: new Date().toISOString() }).then(function () {
        return api.getDevices();
      }).then(function (devices) {
        state.devices = devices || [];
        renderDevices();
        $("statDevices").textContent = state.devices.length;
      }).catch(function () {});
      var hash = (location.hash || "").replace("#", "");
      if (["overview", "downloads", "favorites", "devices", "membership", "settings"].indexOf(hash) >= 0) {
        showTab(hash);
      }
    }).catch(function (err) {
      showAuth();
      setAuthError(errorText(err));
    });
  }

  function isSponsor() {
    return state.membership && state.membership.plan === "sponsor" && state.membership.status === "active";
  }

  function renderAll() {
    renderProfile();
    renderOverview();
    renderDownloads();
    renderFavorites();
    renderDevices();
    renderMembership();
    renderSettings();
  }

  function renderProfile() {
    var p = state.profile || {};
    var name = p.display_name || (p.email ? p.email.split("@")[0] : "用户");
    var initial = initials(name, p.email);
    $("sideName").textContent = name;
    $("sideEmail").textContent = p.email || "";
    $("avatarInitial").textContent = initial;
    $("ovName").textContent = name;
    $("ovSub").textContent = isSponsor()
      ? "感谢你的赞助。所有功能永久免费，账号用于同步收藏、下载记录和赞助徽章。"
      : "所有功能永久免费。账号用于同步收藏、下载记录和赞助徽章。";
    var sponsor = isSponsor();
    $("sideBadge").hidden = !sponsor;
    $("ovBadge").hidden = !sponsor;
    $("avatarCrown").hidden = !sponsor;
    $("avatarWrap").classList.toggle("sponsor", sponsor);
  }

  function renderOverview() {
    $("statDownloads").textContent = state.downloads.length;
    $("statFavorites").textContent = state.favorites.length;
    $("statDevices").textContent = state.devices.length;
    $("sponsorStrip").hidden = isSponsor();

    var recentDownloads = $("recentDownloads");
    if (!state.downloads.length) {
      recentDownloads.innerHTML = '<div class="empty-line">还没有下载记录。登录后从官网下载 APK 会自动记录。</div>';
    } else {
      recentDownloads.innerHTML = state.downloads.slice(0, 4).map(function (d) {
        return '<div class="mini-row"><span>' + escapeHtml(d.title || "文件") + " · " + escapeHtml(d.version || "") +
          '</span><span>' + escapeHtml(fmtDate(d.created_at)) + "</span></div>";
      }).join("");
    }

    var recentFavorites = $("recentFavorites");
    if (!state.favorites.length) {
      recentFavorites.innerHTML = '<div class="empty-line">还没有收藏。把常用目录或工具收藏起来吧。</div>';
    } else {
      recentFavorites.innerHTML = state.favorites.slice(0, 4).map(function (f) {
        return '<div class="mini-row"><span>' + escapeHtml(f.title) + '</span><span>' + escapeHtml(f.kind || "") + "</span></div>";
      }).join("");
    }
  }

  function renderDownloads() {
    var el = $("downloadList");
    if (!state.downloads.length) {
      el.innerHTML = '<div class="empty-line">还没有下载记录。登录后从官网下载 APK 会自动记录。</div>';
      return;
    }
    el.innerHTML = state.downloads.map(function (d) {
      return '<div class="record">' +
        '<div class="record-main"><span class="record-icon">↓</span><div>' +
        '<span class="record-title">' + escapeHtml(d.title || "文件") + '</span>' +
        '<span class="record-sub">' + escapeHtml([d.version, d.platform, fmtSize(d.size_bytes), d.source].filter(Boolean).join(" · ")) + '</span>' +
        '</div></div>' +
        '<span class="record-meta">' + escapeHtml(fmtDateTime(d.created_at)) + '</span>' +
        '</div>';
    }).join("");
  }

  function renderFavorites() {
    var el = $("favoriteList");
    if (!state.favorites.length) {
      el.innerHTML = '<div class="empty-line">还没有收藏。添加一个常用目录试试。</div>';
      return;
    }
    var icons = { file: "▤", folder: "▣", tool: "⚙", link: "↗" };
    el.innerHTML = state.favorites.map(function (f) {
      return '<div class="record">' +
        '<div class="record-main"><span class="record-icon">' + (icons[f.kind] || "★") + '</span><div>' +
        '<span class="record-title">' + escapeHtml(f.title) + '</span>' +
        '<span class="record-sub">' + escapeHtml(f.path) + (f.note ? " · " + escapeHtml(f.note) : "") + '</span>' +
        '</div></div>' +
        '<div class="record-actions"><span class="record-meta">' + escapeHtml(fmtDate(f.created_at)) + '</span>' +
        '<button class="icon-text-btn" type="button" data-del-fav="' + escapeHtml(f.id) + '">删除</button></div>' +
        '</div>';
    }).join("");
    all("[data-del-fav]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-del-fav");
        if (!confirm("删除这条收藏？")) return;
        api.deleteFavorite(id).then(function () {
          state.favorites = state.favorites.filter(function (x) { return x.id !== id; });
          renderFavorites();
          renderOverview();
          toast("已删除收藏");
        }).catch(function (err) { toast(errorText(err)); });
      });
    });
  }

  function renderDevices() {
    var el = $("deviceList");
    var currentId = api.deviceId || localStorage.getItem("pp_device_id");
    if (!state.devices.length) {
      el.innerHTML = '<div class="empty-line">还没有设备记录。</div>';
      return;
    }
    el.innerHTML = state.devices.map(function (d) {
      var current = d.device_id && d.device_id === currentId;
      return '<div class="record">' +
        '<div class="record-main"><span class="record-icon">▢</span><div>' +
        '<span class="record-title">' + escapeHtml(d.name || d.platform || "设备") + (current ? "（当前）" : "") + '</span>' +
        '<span class="record-sub">' + escapeHtml([d.platform, d.app_version].filter(Boolean).join(" · ")) + '</span>' +
        '</div></div>' +
        '<div class="record-actions"><span class="record-meta">' + escapeHtml(fmtDateTime(d.last_seen)) + '</span>' +
        '<button class="icon-text-btn" type="button" data-del-device="' + escapeHtml(d.id) + '">移除</button></div>' +
        '</div>';
    }).join("");
    all("[data-del-device]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-del-device");
        if (!confirm("移除这台设备的记录？不会退出登录。")) return;
        api.removeDevice(id).then(function () {
          state.devices = state.devices.filter(function (x) { return x.id !== id; });
          renderDevices();
          renderOverview();
          toast("已移除设备记录");
        }).catch(function (err) { toast(errorText(err)); });
      });
    });
  }

  function renderMembership() {
    var sponsor = isSponsor();
    $("memberPlan").textContent = sponsor ? "永久赞助者" : "普通用户";
    $("memberSince").textContent = sponsor && state.membership.sponsor_since
      ? "自 " + fmtDate(state.membership.sponsor_since) + " 起"
      : "";
    $("memberDesc").textContent = sponsor
      ? "感谢你的支持。所有功能永久免费，金色徽章会一直显示在头像旁。"
      : "赞助后头像旁会出现金色永久会员标志，并记录赞助时间。所有功能仍然免费。";
    $("memberBadge").hidden = !sponsor;
    $("memberStar").hidden = !sponsor;
    $("memberCard").classList.toggle("is-sponsor", sponsor);

    var buy = $("buyLink");
    if (buy) {
      if (cfg.salesUrl) {
        buy.href = cfg.salesUrl;
        buy.target = "_blank";
        buy.rel = "noopener";
        buy.textContent = "购买卡密 ¥9.9";
        buy.classList.remove("disabled");
      } else {
        buy.href = "#";
        buy.target = "";
        buy.textContent = "发卡平台即将上线";
      }
    }
  }

  function renderSettings() {
    var p = state.profile || {};
    $("settingsName").value = p.display_name || "";
    $("settingsEmail").value = p.email || "";
    $("syncToggle").checked = state.settings.sync !== false;
  }

  // ---------- Tab ----------

  function showTab(tab) {
    all(".panel").forEach(function (p) { p.classList.toggle("active", p.id === "panel-" + tab); });
    all(".side-link").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-tab") === tab); });
    if (history.replaceState) history.replaceState(null, "", "#" + tab);
    if (tab === "membership") {
      setTimeout(function () { var input = $("cdkInput"); if (input) input.focus(); }, 120);
    }
  }

  all("[data-tab]").forEach(function (el) {
    el.addEventListener("click", function () { showTab(el.getAttribute("data-tab")); });
  });

  // ---------- 收藏 ----------

  var favoriteForm = $("favoriteForm");
  if (favoriteForm) {
    favoriteForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var title = $("favTitle").value.trim();
      var path = $("favPath").value.trim();
      if (!title || !path) return;
      var btn = favoriteForm.querySelector("button[type=submit]");
      setButtonLoading(btn, true, "添加中…");
      api.addFavorite({
        title: title,
        path: path,
        kind: $("favKind").value,
        note: $("favNote").value.trim() || null
      }).then(function (item) {
        state.favorites.unshift(item);
        favoriteForm.reset();
        renderFavorites();
        renderOverview();
        toast("已添加收藏");
      }).catch(function (err) {
        toast(errorText(err));
      }).finally(function () {
        setButtonLoading(btn, false);
      });
    });
  }

  // ---------- 下载记录 ----------

  var clearDownloads = $("clearDownloads");
  if (clearDownloads) {
    clearDownloads.addEventListener("click", function () {
      if (!state.downloads.length) return toast("没有可清空的记录");
      if (!confirm("清空全部下载记录？")) return;
      api.clearDownloads().then(function () {
        state.downloads = [];
        renderDownloads();
        renderOverview();
        toast("已清空下载记录");
      }).catch(function (err) { toast(errorText(err)); });
    });
  }

  // ---------- 卡密 ----------

  var cdkForm = $("cdkForm");
  if (cdkForm) {
    cdkForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var code = $("cdkInput").value.trim();
      if (!code) return;
      var btn = cdkForm.querySelector("button[type=submit]");
      setButtonLoading(btn, true, "兑换中…");
      $("cdkHint").textContent = "";
      api.redeem(code).then(function () {
        return api.getMembership();
      }).then(function (membership) {
        state.membership = membership || { plan: "sponsor", status: "active" };
        renderProfile();
        renderOverview();
        renderMembership();
        $("cdkInput").value = "";
        toast("兑换成功，你现在是永久赞助者 ★");
      }).catch(function (err) {
        var msg = errorText(err);
        $("cdkHint").textContent = msg;
        toast(msg);
      }).finally(function () {
        setButtonLoading(btn, false);
      });
    });
  }

  // ---------- 设置 ----------

  var profileForm = $("profileForm");
  if (profileForm) {
    profileForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var name = $("settingsName").value.trim();
      if (!name) return toast("昵称不能为空");
      var btn = profileForm.querySelector("button[type=submit]");
      setButtonLoading(btn, true, "保存中…");
      api.updateProfile({ display_name: name }).then(function (profile) {
        state.profile = profile || Object.assign({}, state.profile, { display_name: name });
        renderProfile();
        toast("资料已保存");
      }).catch(function (err) { toast(errorText(err)); }).finally(function () {
        setButtonLoading(btn, false);
      });
    });
  }

  var syncToggle = $("syncToggle");
  if (syncToggle) {
    syncToggle.addEventListener("change", function () {
      state.settings.sync = syncToggle.checked;
      api.saveSettings(state.settings).then(function () {
        toast(syncToggle.checked ? "已开启云同步" : "已暂停云同步");
      }).catch(function (err) { toast(errorText(err)); });
    });
  }

  var logoutBtn = $("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      api.signOut().then(function () {
        state.profile = null;
        showAuth();
        switchAuthTab("login");
        toast("已退出登录");
      });
    });
  }

  var deleteBtn = $("deleteAccountBtn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", function () {
      if (!confirm("确定注销账号？账号、收藏、下载记录、设备记录和赞助身份都会删除，且无法恢复。")) return;
      if (!confirm("最后确认一次：注销后无法找回，卡密不会退款。继续？")) return;
      deleteBtn.disabled = true;
      api.deleteAccount().then(function () {
        showAuth();
        switchAuthTab("login");
        toast("账号已注销");
      }).catch(function (err) {
        toast(errorText(err));
      }).finally(function () {
        deleteBtn.disabled = false;
      });
    });
  }

  // ---------- 启动 ----------

  var demoBanner = $("demoBanner");
  if (demoBanner && !api.configured) demoBanner.hidden = false;

  var year = $("year");
  if (year) year.textContent = String(new Date().getFullYear());

  api.restore().then(function (user) {
    if (user) return enterDashboard();
    showAuth();
  }).catch(function () {
    showAuth();
  });
})();
