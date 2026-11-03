(function () {
  "use strict";

  var api = window.PPApi;
  var lastCodes = [];
  var lastBatchName = "";
  var currentBatchId = null;
  var currentBatchName = "";

  function $(id) { return document.getElementById(id); }
  function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function fmt(value) {
    if (!value) return "";
    var d = new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") +
      " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function toast(message) {
    var el = $("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { el.classList.remove("show"); }, 2800);
  }

  function errText(err) {
    var msg = err && (err.message || err.error_description || err.msg) || "操作失败";
    if (/无权限|permission/i.test(msg)) return "没有管理员权限。请确认 app_metadata.role=admin，并重新登录。";
    if (/Failed to fetch/i.test(msg)) return "无法连接服务器，请检查 Supabase 配置。";
    return msg;
  }

  function setAuthError(message) {
    var el = $("adminAuthError");
    if (!el) return;
    el.textContent = message || "";
    el.hidden = !message;
  }

  // 主题
  var themeBtn = $("themeBtn");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("pp-theme", next); } catch (e) {}
    });
  }

  function showLogin() {
    $("adminAuthView").hidden = false;
    $("adminDashboard").hidden = true;
  }

  function showDashboard() {
    $("adminAuthView").hidden = true;
    $("adminDashboard").hidden = false;
    loadStats();
    loadBatches();
  }

  // 登录
  $("adminLoginForm").addEventListener("submit", function (event) {
    event.preventDefault();
    setAuthError("");
    var email = $("adminEmail").value.trim();
    var password = $("adminPassword").value;
    var btn = event.target.querySelector("button[type=submit]");
    var old = btn.textContent;
    btn.disabled = true;
    btn.textContent = "登录中…";
    api.signIn(email, password).then(function () {
      if (!api.isAdmin()) {
        return api.signOut().then(function () {
          throw new Error("该账号不是管理员（app_metadata.role 不是 admin）");
        });
      }
      showDashboard();
    }).catch(function (err) {
      setAuthError(errText(err));
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = old;
    });
  });

  $("adminLogout").addEventListener("click", function () {
    api.signOut().then(showLogin);
  });

  // Tabs
  all("[data-admin-tab]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var tab = btn.getAttribute("data-admin-tab");
      all("[data-admin-tab]").forEach(function (b) { b.classList.toggle("active", b === btn); });
      all(".admin-panel").forEach(function (p) { p.classList.toggle("active", p.id === "admin-panel-" + tab); });
      if (tab === "batches") loadBatches();
    });
  });

  // 统计
  function loadStats() {
    api.adminStats().then(function (s) {
      $("adminUsers").textContent = s.users || 0;
      $("adminSponsors").textContent = s.sponsors || 0;
      $("adminCodes").textContent = s.codes_total || 0;
      $("adminUsed").textContent = s.codes_used || 0;
      $("adminUnused").textContent = s.codes_unused || 0;
    }).catch(function (err) {
      toast(errText(err));
    });
  }

  // 生成
  $("generateForm").addEventListener("submit", function (event) {
    event.preventDefault();
    var name = $("genName").value.trim() || "赞助卡密批次";
    var quantity = Number($("genQuantity").value);
    if (!quantity || quantity < 1 || quantity > 1000) {
      return toast("数量必须在 1–1000 之间");
    }
    var expiresRaw = $("genExpires").value;
    var expires = expiresRaw ? new Date(expiresRaw).toISOString() : null;
    var btn = event.target.querySelector("button[type=submit]");
    var old = btn.textContent;
    btn.disabled = true;
    btn.textContent = "生成中…";

    api.adminGenerateBatch({
      name: name,
      quantity: quantity,
      note: $("genNote").value.trim(),
      expiresAt: expires
    }).then(function (result) {
      lastCodes = result.codes || [];
      lastBatchName = name;
      $("resultCount").textContent = lastCodes.length;
      $("codeOutput").value = lastCodes.join("\n");
      $("generateResult").hidden = false;
      toast("已生成 " + lastCodes.length + " 张卡密，请立即下载 CSV");
      loadStats();
      loadBatches();
      $("generateResult").scrollIntoView({ behavior: "smooth", block: "center" });
    }).catch(function (err) {
      toast(errText(err));
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = old;
    });
  });

  function downloadCsv() {
    if (!lastCodes.length) return toast("没有可下载的卡密");
    var csv = "卡密,批次,类型\n" + lastCodes.map(function (code) {
      return code + "," + lastBatchName.replace(/,/g, " ") + ",永久赞助";
    }).join("\n");
    var blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "PP-赞助卡密-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  $("downloadCsv").addEventListener("click", downloadCsv);

  $("copyCodes").addEventListener("click", function () {
    if (!lastCodes.length) return toast("没有可复制的卡密");
    var text = lastCodes.join("\n");
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast("已复制全部卡密"); });
    } else {
      var ta = $("codeOutput");
      ta.select();
      document.execCommand("copy");
      toast("已复制全部卡密");
    }
  });

  // 批次
  function loadBatches() {
    var tbody = $("batchRows");
    tbody.innerHTML = '<tr><td colspan="7" class="empty-line">加载中…</td></tr>';
    api.adminListBatches().then(function (rows) {
      if (!rows || !rows.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-line">还没有批次，先生成一批卡密。</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(function (b) {
        return "<tr>" +
          "<td>" + escapeHtml(b.name) + "</td>" +
          "<td>" + escapeHtml(fmt(b.created_at)) + "</td>" +
          "<td>" + (b.quantity || 0) + "</td>" +
          "<td>" + (b.unused || 0) + "</td>" +
          "<td>" + (b.used || 0) + "</td>" +
          "<td>" + (b.revoked || 0) + "</td>" +
          '<td><button class="icon-text-btn" type="button" data-view-batch="' + escapeHtml(b.id) + '" data-batch-name="' + escapeHtml(b.name) + '">查看</button></td>' +
          "</tr>";
      }).join("");
      all("[data-view-batch]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          openBatch(btn.getAttribute("data-view-batch"), btn.getAttribute("data-batch-name"));
        });
      });
    }).catch(function (err) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-line">' + escapeHtml(errText(err)) + "</td></tr>";
    });
  }

  $("refreshBatches").addEventListener("click", loadBatches);

  function openBatch(id, name) {
    currentBatchId = id;
    currentBatchName = name || "";
    $("batchDetail").hidden = false;
    $("batchDetailName").textContent = name || "";
    var tbody = $("codeRows");
    tbody.innerHTML = '<tr><td colspan="5" class="empty-line">加载中…</td></tr>';
    api.adminBatchCodes(id).then(function (rows) {
      if (!rows || !rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-line">这个批次没有卡密。</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(function (c) {
        return "<tr>" +
          '<td class="code-prefix">' + escapeHtml(c.code_prefix) + "</td>" +
          '<td><span class="status-pill ' + escapeHtml(c.status) + '">' + escapeHtml(c.status) + "</span></td>" +
          "<td>" + escapeHtml(c.used_by_email || "—") + "</td>" +
          "<td>" + escapeHtml(fmt(c.used_at)) + "</td>" +
          '<td>' + (c.status === "unused" ? '<button class="icon-text-btn" type="button" data-revoke-code="' + escapeHtml(c.id) + '">撤销</button>' : "") + "</td>" +
          "</tr>";
      }).join("");
      all("[data-revoke-code]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!confirm("撤销这张未使用的卡密？")) return;
          api.adminRevokeCode(btn.getAttribute("data-revoke-code")).then(function () {
            toast("已撤销");
            openBatch(currentBatchId, currentBatchName);
            loadStats();
            loadBatches();
          }).catch(function (err) { toast(errText(err)); });
        });
      });
      $("batchDetail").scrollIntoView({ behavior: "smooth", block: "start" });
    }).catch(function (err) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-line">' + escapeHtml(errText(err)) + "</td></tr>";
    });
  }

  $("closeBatchDetail").addEventListener("click", function () {
    $("batchDetail").hidden = true;
    currentBatchId = null;
  });

  // 手动开通
  $("grantForm").addEventListener("submit", function (event) {
    event.preventDefault();
    var email = $("grantEmail").value.trim();
    if (!email) return;
    api.adminGrant(email, false).then(function () {
      $("grantHint").textContent = "已开通：" + email;
      toast("已开通永久赞助");
      loadStats();
    }).catch(function (err) {
      $("grantHint").textContent = errText(err);
      toast(errText(err));
    });
  });

  $("revokeGrant").addEventListener("click", function () {
    var email = $("grantEmail").value.trim();
    if (!email) return toast("先填写邮箱");
    if (!confirm("撤销 " + email + " 的赞助者身份？")) return;
    api.adminGrant(email, true).then(function () {
      $("grantHint").textContent = "已撤销：" + email;
      toast("已撤销赞助");
      loadStats();
    }).catch(function (err) {
      $("grantHint").textContent = errText(err);
      toast(errText(err));
    });
  });

  // 启动
  var demoBanner = $("demoBanner");
  if (demoBanner && !api.configured) demoBanner.hidden = false;

  api.restore().then(function (user) {
    if (user && api.isAdmin()) {
      showDashboard();
    } else {
      showLogin();
      if (user) {
        setAuthError("当前账号不是管理员。请使用 app_metadata.role=admin 的账号。");
      }
    }
  }).catch(function () {
    showLogin();
  });
})();
