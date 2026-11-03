// PP管理器 前端配置
// 部署到线上时，把 Supabase 项目的 URL 和 anon public key 填进来。
// anon key 是公开的，可以放在前端；绝对不要把 service_role key 放进来。
//
// 留空时会进入「演示模式」：账号、收藏、卡密都只保存在当前浏览器，
// 不会发送到任何服务器，方便先看界面。
window.PP_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",

  // 发卡平台商品页地址，例如 https://your-card-shop.com/buy/pp-lifetime
  // 留空时「购买卡密」会提示即将上线。
  salesUrl: "https://www.kufaka.com/item/gsaegg",

  // 管理后台入口（默认 /admin.html），可留空
  adminUrl: "admin.html"
};
