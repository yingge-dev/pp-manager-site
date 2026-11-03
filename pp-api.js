(function (global) {
  "use strict";

  var cfg = global.PP_CONFIG || {};
  var SUPABASE_URL = String(cfg.supabaseUrl || "").replace(/\/+$/, "");
  var ANON_KEY = String(cfg.supabaseAnonKey || "");
  var CONFIGURED = !!(SUPABASE_URL && ANON_KEY);
  var SESSION_KEY = "pp_session_v2";
  var DEVICE_KEY = "pp_device_id";
  var DEMO_KEY = "pp_demo_db_v1";

  function uuid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function getDeviceId() {
    var id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  function deviceName() {
    var ua = navigator.userAgent;
    var os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iPod/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac OS X/i.test(ua) ? "macOS" : "Web";
    var browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "浏览器";
    return os + " · " + browser;
  }

  function errorMessage(err) {
    if (!err) return "未知错误";
    if (typeof err === "string") return err;
    return err.message || err.error_description || err.error || err.msg || "请求失败";
  }

  function parseJson(text) {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      return text;
    }
  }

  function normalizeCode(code) {
    return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function decodeJwt(token) {
    try {
      var part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(decodeURIComponent(escape(atob(part))));
    } catch (e) {
      return null;
    }
  }

  // ---------------------------------------------------------------------
  // Supabase REST 实现（不依赖 SDK）
  // ---------------------------------------------------------------------

  function SupabaseApi() {
    this.mode = "supabase";
    this.url = SUPABASE_URL;
    this.key = ANON_KEY;
  }

  SupabaseApi.prototype.storedSession = function () {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch (e) {
      return null;
    }
  };

  SupabaseApi.prototype.saveSession = function (data) {
    var session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_in ? Date.now() + data.expires_in * 1000 : null,
      user: data.user || (this.storedSession() || {}).user || null
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  };

  SupabaseApi.prototype.clearSession = function () {
    localStorage.removeItem(SESSION_KEY);
  };

  SupabaseApi.prototype.getSession = function () {
    return this.storedSession();
  };

  SupabaseApi.prototype.getUser = function () {
    return this.request("/auth/v1/user", { method: "GET" });
  };

  SupabaseApi.prototype.ensureSession = function () {
    var self = this;
    var session = this.storedSession();
    if (!session) return Promise.resolve(null);
    if (session.expires_at && Date.now() > session.expires_at - 60000 && session.refresh_token) {
      return this.refreshSession(session.refresh_token).catch(function () {
        self.clearSession();
        return null;
      });
    }
    return Promise.resolve(session);
  };

  SupabaseApi.prototype.refreshSession = function (refreshToken) {
    var self = this;
    return this.authRequest("/auth/v1/token?grant_type=refresh_token", {
      refresh_token: refreshToken
    }).then(function (data) {
      return self.saveSession(data);
    });
  };

  SupabaseApi.prototype.authRequest = function (path, body) {
    var self = this;
    return fetch(SUPABASE_URL + path, {
      method: "POST",
      headers: {
        apikey: self.key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body || {})
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = parseJson(text);
        if (!res.ok) {
          throw new Error(errorMessage(data) + (data && data.code ? " (" + data.code + ")" : ""));
        }
        return data;
      });
    });
  };

  SupabaseApi.prototype.request = function (path, options) {
    var self = this;
    options = options || {};
    return this.ensureSession().then(function (session) {
      if (options.auth !== false && !session) throw new Error("请先登录");
      var headers = {
        apikey: self.key,
        "Content-Type": "application/json"
      };
      if (session && options.auth !== false) headers.Authorization = "Bearer " + session.access_token;
      if (options.prefer) headers.Prefer = options.prefer;

      return fetch(SUPABASE_URL + path, {
        method: options.method || "GET",
        headers: headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      }).then(function (res) {
        return res.text().then(function (text) {
          var data = parseJson(text);
          if (!res.ok) {
            throw new Error(errorMessage(data) + (data && data.code ? " (" + data.code + ")" : ""));
          }
          return data;
        });
      });
    });
  };

  SupabaseApi.prototype.signUp = function (email, password, displayName) {
    var self = this;
    return this.authRequest("/auth/v1/signup", {
      email: email,
      password: password,
      data: { display_name: displayName || email.split("@")[0] }
    }).then(function (data) {
      if (data.session || data.access_token) {
        self.saveSession(data.session || data);
        return { needsConfirmation: false, session: self.storedSession() };
      }
      return { needsConfirmation: true, user: data.user || data };
    });
  };

  SupabaseApi.prototype.signIn = function (email, password) {
    var self = this;
    return this.authRequest("/auth/v1/token?grant_type=password", {
      email: email,
      password: password
    }).then(function (data) {
      return self.saveSession(data);
    });
  };

  SupabaseApi.prototype.signOut = function () {
    var self = this;
    return this.request("/auth/v1/logout", { method: "POST" })
      .catch(function () {})
      .then(function () {
        self.clearSession();
      });
  };

  SupabaseApi.prototype.restore = function () {
    var self = this;
    var session = this.storedSession();
    if (!session) return Promise.resolve(null);
    return this.ensureSession().then(function (s) {
      if (!s) return null;
      return self.getUser().then(function (user) {
        s.user = user;
        localStorage.setItem(SESSION_KEY, JSON.stringify(s));
        return user;
      }).catch(function () {
        self.clearSession();
        return null;
      });
    });
  };

  SupabaseApi.prototype.isAdmin = function () {
    var session = this.storedSession();
    if (!session || !session.access_token) return false;
    var payload = decodeJwt(session.access_token);
    return !!(payload && payload.app_metadata && payload.app_metadata.role === "admin");
  };

  SupabaseApi.prototype.rest = function (path, options) {
    options = options || {};
    var prefer = null;
    if (options.method === "POST" || options.method === "PATCH") prefer = "return=representation";
    if (options.upsert) prefer = "resolution=merge-duplicates,return=representation";
    return this.request("/rest/v1/" + path, {
      method: options.method || "GET",
      body: options.body,
      prefer: prefer
    });
  };

  SupabaseApi.prototype.rpc = function (name, args) {
    return this.request("/rest/v1/rpc/" + name, {
      method: "POST",
      body: args || {}
    });
  };

  SupabaseApi.prototype.userId = function () {
    var s = this.storedSession();
    return s && s.user ? s.user.id : null;
  };

  SupabaseApi.prototype.getProfile = function () {
    return this.rest("profiles?select=*&limit=1").then(function (rows) {
      return rows && rows[0] ? rows[0] : null;
    });
  };

  SupabaseApi.prototype.updateProfile = function (patch) {
    var uid = this.userId();
    return this.rest("profiles?id=eq." + encodeURIComponent(uid), { method: "PATCH", body: patch })
      .then(function (rows) { return rows && rows[0] ? rows[0] : null; });
  };

  SupabaseApi.prototype.getMembership = function () {
    return this.rest("memberships?select=*&limit=1").then(function (rows) {
      return rows && rows[0] ? rows[0] : { plan: "free", status: "active" };
    });
  };

  SupabaseApi.prototype.getFavorites = function () {
    return this.rest("favorites?select=*&order=created_at.desc");
  };

  SupabaseApi.prototype.addFavorite = function (data) {
    var uid = this.userId();
    return this.rest("favorites", {
      method: "POST",
      body: Object.assign({}, data, { user_id: uid, updated_at: nowIso() })
    }).then(function (rows) { return rows && rows[0] ? rows[0] : null; });
  };

  SupabaseApi.prototype.deleteFavorite = function (id) {
    return this.rest("favorites?id=eq." + encodeURIComponent(id), { method: "DELETE" });
  };

  SupabaseApi.prototype.getDownloads = function () {
    return this.rest("downloads?select=*&order=created_at.desc&limit=200");
  };

  SupabaseApi.prototype.addDownload = function (data) {
    var uid = this.userId();
    return this.rest("downloads", {
      method: "POST",
      body: Object.assign({}, data, { user_id: uid })
    }).then(function (rows) { return rows && rows[0] ? rows[0] : null; });
  };

  SupabaseApi.prototype.clearDownloads = function () {
    var uid = this.userId();
    return this.rest("downloads?user_id=eq." + encodeURIComponent(uid), { method: "DELETE" });
  };

  SupabaseApi.prototype.getDevices = function () {
    return this.rest("devices?select=*&order=last_seen.desc");
  };

  SupabaseApi.prototype.registerDevice = function (data) {
    var uid = this.userId();
    return this.rest("devices?on_conflict=user_id,device_id", {
      method: "POST",
      upsert: true,
      body: Object.assign({
        user_id: uid,
        device_id: getDeviceId(),
        name: deviceName(),
        platform: "Web",
        last_seen: nowIso()
      }, data || {})
    });
  };

  SupabaseApi.prototype.removeDevice = function (id) {
    return this.rest("devices?id=eq." + encodeURIComponent(id), { method: "DELETE" });
  };

  SupabaseApi.prototype.getSettings = function () {
    return this.rest("user_settings?select=*&limit=1").then(function (rows) {
      return rows && rows[0] ? rows[0].data || {} : {};
    });
  };

  SupabaseApi.prototype.saveSettings = function (data) {
    var uid = this.userId();
    return this.rest("user_settings?on_conflict=user_id", {
      method: "POST",
      upsert: true,
      body: { user_id: uid, data: data, updated_at: nowIso() }
    });
  };

  SupabaseApi.prototype.redeem = function (code) {
    return this.rpc("redeem_cdk", { p_code: code, p_device_id: getDeviceId() });
  };

  SupabaseApi.prototype.deleteAccount = function () {
    return this.rpc("delete_my_account", {});
  };

  SupabaseApi.prototype.adminStats = function () {
    return this.rpc("admin_stats", {});
  };

  SupabaseApi.prototype.adminListBatches = function () {
    return this.rpc("admin_list_batches", {});
  };

  SupabaseApi.prototype.adminBatchCodes = function (batchId) {
    return this.rpc("admin_batch_codes", { p_batch_id: batchId });
  };

  SupabaseApi.prototype.adminGenerateBatch = function (data) {
    return this.rpc("admin_generate_batch", {
      p_name: data.name,
      p_quantity: Number(data.quantity),
      p_note: data.note || null,
      p_expires_at: data.expiresAt || null
    });
  };

  SupabaseApi.prototype.adminRevokeCode = function (id) {
    return this.rpc("admin_revoke_code", { p_code_id: id });
  };

  SupabaseApi.prototype.adminGrant = function (email, revoke) {
    return this.rpc("admin_grant", { p_email: email, p_revoke: !!revoke });
  };

  // ---------------------------------------------------------------------
  // 演示模式：所有数据只存在 localStorage
  // ---------------------------------------------------------------------

  function DemoApi() {
    this.mode = "demo";
    this.db = this.load();
    if (!this.db.users["admin@pp.local"]) this.seed();
  }

  DemoApi.prototype.load = function () {
    try {
      var db = JSON.parse(localStorage.getItem(DEMO_KEY) || "null");
      if (db && db.users) return db;
    } catch (e) {}
    return {
      users: {}, memberships: {}, favorites: {}, downloads: {},
      devices: {}, settings: {}, batches: [], codes: [], redemptions: []
    };
  };

  DemoApi.prototype.save = function () {
    localStorage.setItem(DEMO_KEY, JSON.stringify(this.db));
  };

  DemoApi.prototype.seed = function () {
    var self = this;
    function addUser(email, password, name, plan) {
      var id = uuid();
      self.db.users[email] = { id: id, email: email, password: password, display_name: name, created_at: nowIso() };
      self.db.memberships[id] = {
        user_id: id, plan: plan || "free", status: "active",
        sponsor_since: plan === "sponsor" ? "2026-10-01T00:00:00Z" : null,
        source: plan === "sponsor" ? "demo" : null
      };
      self.db.favorites[id] = [];
      self.db.downloads[id] = [];
      self.db.devices[id] = [];
      self.db.settings[id] = { sync: true };
      return id;
    }

    var demoId = addUser("demo@pp.local", "demo1234", "演示用户", "free");
    addUser("sponsor@pp.local", "sponsor1234", "赞助者", "sponsor");
    addUser("admin@pp.local", "admin1234", "管理员", "free");

    self.db.favorites[demoId] = [
      { id: uuid(), user_id: demoId, kind: "folder", title: "Download", path: "/sdcard/Download", note: "常用下载目录", created_at: "2026-10-20T10:00:00Z" },
      { id: uuid(), user_id: demoId, kind: "tool", title: "Base64 工具箱", path: "toolbox/base64", note: "", created_at: "2026-10-21T10:00:00Z" }
    ];
    self.db.downloads[demoId] = [
      { id: uuid(), user_id: demoId, title: "PP管理器", version: "1.2.1", platform: "Android", size_bytes: 5636772, source: "website", created_at: "2026-11-03T12:00:00Z" }
    ];
    self.db.devices[demoId] = [
      { id: uuid(), user_id: demoId, device_id: getDeviceId(), name: deviceName(), platform: "Web", app_version: "", last_seen: nowIso() }
    ];
    self.save();
  };

  DemoApi.prototype.storedSession = function () {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (e) { return null; }
  };

  DemoApi.prototype.saveSession = function (user) {
    var session = {
      access_token: "demo-" + user.id,
      refresh_token: "demo",
      expires_at: Date.now() + 30 * 24 * 3600 * 1000,
      user: { id: user.id, email: user.email }
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  };

  DemoApi.prototype.clearSession = function () { localStorage.removeItem(SESSION_KEY); };
  DemoApi.prototype.getSession = function () { return this.storedSession(); };

  DemoApi.prototype.restore = function () {
    var s = this.storedSession();
    if (!s) return Promise.resolve(null);
    var user = this.findByEmail(s.user.email);
    return Promise.resolve(user ? s.user : (this.clearSession(), null));
  };

  DemoApi.prototype.findByEmail = function (email) {
    return this.db.users[String(email || "").toLowerCase()] || null;
  };

  DemoApi.prototype.findUserById = function (id) {
    var users = this.db.users;
    for (var key in users) if (users[key].id === id) return users[key];
    return null;
  };

  DemoApi.prototype.userId = function () {
    var s = this.storedSession();
    return s && s.user ? s.user.id : null;
  };

  DemoApi.prototype.signUp = function (email, password, displayName) {
    var key = String(email || "").trim().toLowerCase();
    if (!key || !key.includes("@")) throw new Error("请输入有效邮箱");
    if (String(password || "").length < 6) throw new Error("密码至少 6 位");
    if (this.db.users[key]) throw new Error("该邮箱已注册");
    var id = uuid();
    this.db.users[key] = { id: id, email: key, password: password, display_name: displayName || key.split("@")[0], created_at: nowIso() };
    this.db.memberships[id] = { user_id: id, plan: "free", status: "active", sponsor_since: null, source: null };
    this.db.favorites[id] = [];
    this.db.downloads[id] = [];
    this.db.devices[id] = [];
    this.db.settings[id] = { sync: true };
    this.save();
    this.saveSession(this.db.users[key]);
    return Promise.resolve({ needsConfirmation: false, session: this.storedSession() });
  };

  DemoApi.prototype.signIn = function (email, password) {
    var user = this.findByEmail(email);
    if (!user || user.password !== password) return Promise.reject(new Error("邮箱或密码错误"));
    this.saveSession(user);
    return Promise.resolve(this.storedSession());
  };

  DemoApi.prototype.signOut = function () {
    this.clearSession();
    return Promise.resolve();
  };

  DemoApi.prototype.getProfile = function () {
    var u = this.findUserById(this.userId());
    return Promise.resolve(u ? {
      id: u.id, email: u.email, display_name: u.display_name,
      created_at: u.created_at
    } : null);
  };

  DemoApi.prototype.updateProfile = function (patch) {
    var u = this.findUserById(this.userId());
    if (!u) throw new Error("请先登录");
    if (patch.display_name) u.display_name = patch.display_name;
    this.save();
    return this.getProfile();
  };

  DemoApi.prototype.getMembership = function () {
    return Promise.resolve(this.db.memberships[this.userId()] || { plan: "free", status: "active" });
  };

  DemoApi.prototype.getFavorites = function () {
    return Promise.resolve((this.db.favorites[this.userId()] || []).slice());
  };

  DemoApi.prototype.addFavorite = function (data) {
    var uid = this.userId();
    var list = this.db.favorites[uid] || (this.db.favorites[uid] = []);
    var item = Object.assign({ id: uuid(), user_id: uid, created_at: nowIso() }, data);
    list.unshift(item);
    this.save();
    return Promise.resolve(item);
  };

  DemoApi.prototype.deleteFavorite = function (id) {
    var uid = this.userId();
    this.db.favorites[uid] = (this.db.favorites[uid] || []).filter(function (x) { return x.id !== id; });
    this.save();
    return Promise.resolve();
  };

  DemoApi.prototype.getDownloads = function () {
    return Promise.resolve((this.db.downloads[this.userId()] || []).slice());
  };

  DemoApi.prototype.addDownload = function (data) {
    var uid = this.userId();
    var list = this.db.downloads[uid] || (this.db.downloads[uid] = []);
    var item = Object.assign({ id: uuid(), user_id: uid, created_at: nowIso() }, data);
    list.unshift(item);
    this.save();
    return Promise.resolve(item);
  };

  DemoApi.prototype.clearDownloads = function () {
    this.db.downloads[this.userId()] = [];
    this.save();
    return Promise.resolve();
  };

  DemoApi.prototype.getDevices = function () {
    return Promise.resolve((this.db.devices[this.userId()] || []).slice());
  };

  DemoApi.prototype.registerDevice = function (data) {
    var uid = this.userId();
    var list = this.db.devices[uid] || (this.db.devices[uid] = []);
    var deviceId = getDeviceId();
    var existing = null;
    for (var i = 0; i < list.length; i++) if (list[i].device_id === deviceId) existing = list[i];
    if (existing) {
      existing.last_seen = nowIso();
      Object.assign(existing, data || {});
    } else {
      list.unshift(Object.assign({
        id: uuid(), user_id: uid, device_id: deviceId, name: deviceName(),
        platform: "Web", app_version: "", last_seen: nowIso()
      }, data || {}));
    }
    this.save();
    return Promise.resolve();
  };

  DemoApi.prototype.removeDevice = function (id) {
    var uid = this.userId();
    this.db.devices[uid] = (this.db.devices[uid] || []).filter(function (x) { return x.id !== id; });
    this.save();
    return Promise.resolve();
  };

  DemoApi.prototype.getSettings = function () {
    return Promise.resolve(this.db.settings[this.userId()] || {});
  };

  DemoApi.prototype.saveSettings = function (data) {
    this.db.settings[this.userId()] = data;
    this.save();
    return Promise.resolve();
  };

  DemoApi.prototype.redeem = function (code) {
    var normalized = normalizeCode(code);
    if (normalized.length < 8) return Promise.reject(new Error("卡密格式不正确"));
    var uid = this.userId();
    var membership = this.db.memberships[uid] || (this.db.memberships[uid] = { user_id: uid, plan: "free", status: "active" });
    if (membership.plan === "sponsor" && membership.status === "active") {
      return Promise.reject(new Error("当前账号已经是赞助者"));
    }
    var codeRecord = null;
    for (var i = 0; i < this.db.codes.length; i++) {
      if (this.db.codes[i].code === normalized && this.db.codes[i].status === "unused") codeRecord = this.db.codes[i];
    }
    if (codeRecord) {
      codeRecord.status = "used";
      codeRecord.used_by = uid;
      codeRecord.used_at = nowIso();
    } else if (!/^PP[0-9A-F]{8,}$/.test(normalized) && normalized.indexOf("DEMO") < 0) {
      return Promise.reject(new Error("演示模式：请输入以 PP- 开头的卡密（任意演示码均可）"));
    }
    membership.plan = "sponsor";
    membership.status = "active";
    membership.sponsor_since = nowIso();
    membership.source = "cdk";
    this.save();
    return Promise.resolve({ ok: true, plan: "sponsor", sponsor_since: membership.sponsor_since });
  };

  DemoApi.prototype.deleteAccount = function () {
    var uid = this.userId();
    var s = this.storedSession();
    if (s) delete this.db.users[s.user.email];
    delete this.db.memberships[uid];
    delete this.db.favorites[uid];
    delete this.db.downloads[uid];
    delete this.db.devices[uid];
    delete this.db.settings[uid];
    this.clearSession();
    this.save();
    return Promise.resolve();
  };

  DemoApi.prototype.isAdmin = function () {
    var s = this.storedSession();
    return !!(s && s.user && s.user.email === "admin@pp.local");
  };

  DemoApi.prototype.adminStats = function () {
    var sponsors = 0;
    for (var k in this.db.memberships) if (this.db.memberships[k].plan === "sponsor") sponsors++;
    return Promise.resolve({
      users: Object.keys(this.db.users).length,
      sponsors: sponsors,
      codes_total: this.db.codes.length,
      codes_used: this.db.codes.filter(function (c) { return c.status === "used"; }).length,
      codes_unused: this.db.codes.filter(function (c) { return c.status === "unused"; }).length,
      batches: this.db.batches.length
    });
  };

  DemoApi.prototype.adminGenerateBatch = function (data) {
    var batch = {
      id: uuid(), name: data.name || "演示批次", quantity: Number(data.quantity) || 10,
      note: data.note || "", status: "active", created_at: nowIso(), expires_at: data.expiresAt || null
    };
    this.db.batches.unshift(batch);
    var codes = [];
    for (var i = 0; i < batch.quantity; i++) {
      var raw = "";
      for (var j = 0; j < 12; j++) raw += Math.floor(Math.random() * 16).toString(16).toUpperCase();
      var formatted = "PP-" + raw.replace(/(.{4})(?=.)/g, "$1-");
      this.db.codes.push({
        id: uuid(), batch_id: batch.id, code: formatted, code_prefix: formatted.slice(0, 11) + "..." + formatted.slice(-4),
        status: "unused", used_by: null, used_at: null, created_at: nowIso()
      });
      codes.push(formatted);
    }
    this.save();
    return Promise.resolve({ batch_id: batch.id, quantity: batch.quantity, codes: codes });
  };

  DemoApi.prototype.adminListBatches = function () {
    var self = this;
    return Promise.resolve(this.db.batches.map(function (b) {
      var codes = self.db.codes.filter(function (c) { return c.batch_id === b.id; });
      return Object.assign({}, b, {
        unused: codes.filter(function (c) { return c.status === "unused"; }).length,
        used: codes.filter(function (c) { return c.status === "used"; }).length,
        revoked: codes.filter(function (c) { return c.status === "revoked"; }).length
      });
    }));
  };

  DemoApi.prototype.adminBatchCodes = function (batchId) {
    var self = this;
    return Promise.resolve(this.db.codes.filter(function (c) { return c.batch_id === batchId; }).map(function (c) {
      var u = c.used_by ? self.findUserById(c.used_by) : null;
      return {
        id: c.id, code_prefix: c.code_prefix, status: c.status,
        created_at: c.created_at, used_at: c.used_at, used_by_email: u ? u.email : null
      };
    }));
  };

  DemoApi.prototype.adminRevokeCode = function (id) {
    var code = null;
    for (var i = 0; i < this.db.codes.length; i++) if (this.db.codes[i].id === id) code = this.db.codes[i];
    if (!code || code.status !== "unused") return Promise.reject(new Error("只能撤销未使用的卡密"));
    code.status = "revoked";
    this.save();
    return Promise.resolve({ ok: true });
  };

  DemoApi.prototype.adminGrant = function (email, revoke) {
    var user = this.findByEmail(email);
    if (!user) return Promise.reject(new Error("找不到该邮箱的用户"));
    var m = this.db.memberships[user.id] || (this.db.memberships[user.id] = { user_id: user.id });
    if (revoke) {
      m.plan = "free"; m.status = "active"; m.sponsor_since = null; m.source = "admin";
    } else {
      m.plan = "sponsor"; m.status = "active"; m.sponsor_since = m.sponsor_since || nowIso(); m.source = "admin";
    }
    this.save();
    return Promise.resolve({ ok: true, plan: m.plan, user_id: user.id });
  };

  // ---------------------------------------------------------------------

  var api = CONFIGURED ? new SupabaseApi() : new DemoApi();
  api.configured = CONFIGURED;
  api.deviceId = getDeviceId();

  global.PPApi = api;
})(window);
