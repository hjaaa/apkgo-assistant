// 各处共用的小工具。经典脚本（非 module），后台用 importScripts 引入，
// 内容脚本和弹窗按顺序 <script> 引入，共享一个全局作用域。
/* global APKGO_RECIPES */

const APKGO = {
  VERSION: chrome.runtime.getManifest().version,
  // 配置平台地址。bridge 只注入在 manifest 列出的地址上，配对时以页面 origin 为准。
  DEFAULT_ORIGIN: "http://inner.dreamplatform.cn:18003",
  // storage.local：配对信息（平台 origin、用户 token、用户名）。
  KEY_PAIRED: "paired",
  // storage.session：采集草稿（按商店）、「刚从配置平台跳过来要打开面板」的标记、
  // 从配置平台带过来的主体（按商店）。关浏览器即清，密钥明文从不落盘。
  KEY_DRAFT: (storeId) => `draft:${storeId}`,
  KEY_PENDING: "pendingStore",
  KEY_OWNER: (storeId) => `owner:${storeId}`,
  // 配置平台「主体」页；带 owner 时直接弹出该主体的密钥配置弹窗（路由已支持 ?owner=&openSecret=1）。
  platformSecretPage(owner, origin) {
    const base = `${origin || APKGO.DEFAULT_ORIGIN}/#/application/mainMap`;
    return owner ? `${base}?owner=${encodeURIComponent(owner)}&openSecret=1` : base;
  },
  maskSecret(v) {
    const s = String(v || "");
    if (s.length <= 8) return "••••••••";
    return s.slice(0, 3) + "••••••" + s.slice(-3);
  },
  recipeForUrl(url) {
    let host = "";
    try { host = new URL(url).hostname; } catch { return null; }
    return APKGO_RECIPES.find((r) => r.hostRe.test(host)) || null;
  },
  // 网页发过来的就是渠道值（huawei / xiaomi / oppo / vivo / honor / qq）。
  recipeById(id) {
    if (!id) return null;
    const key = String(id).toLowerCase().trim();
    return APKGO_RECIPES.find((r) => r.id === key) || null;
  },
  // 把 File 读成 base64（不带 data: 前缀）。
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).replace(/^data:[^;]*;base64,/, ""));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(file);
    });
  },
  fileToText(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsText(file);
    });
  },
  send(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(r || { ok: false, error: "后台没有响应" });
        });
      } catch (e) {
        resolve({ ok: false, error: e.message || String(e) });
      }
    });
  },
};
