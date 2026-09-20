// 后台 service worker：保管配对信息、替内容脚本调配置平台接口、开后台页。
// 发往配置平台的请求都走 platform.js（APKGO_PLATFORM），只会发往配对时记下的平台地址。
/* global APKGO, APKGO_PLATFORM */
importScripts("recipes.js", "shared.js", "platform.js");

// 采集草稿放 storage.session，内容脚本要能直接读写，得先放开访问级别。
chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" }).catch(() => {});

const CONFIG_PATH = "/product/owner-open-platform-config";

const handlers = {
  async state() {
    const p = await APKGO_PLATFORM.getPaired();
    return { ok: true, version: APKGO.VERSION, paired: APKGO_PLATFORM.publicPaired(p) };
  },

  // 只接受和发消息的页面同源的 origin（bridge 已经校验过一遍，这里再兜底），
  // 存之前用 token 调一次只读接口确认它真的可用。
  async pair({ accessToken, refreshToken, userName, origin }, sender) {
    const at = typeof accessToken === "string" ? accessToken.trim() : "";
    const rt = typeof refreshToken === "string" ? refreshToken.trim() : "";
    if (!at || !rt) return { ok: false, error: "没有拿到登录令牌，请先登录配置平台再点「连接助手」" };
    let o;
    try { o = new URL(origin).origin; } catch { return { ok: false, error: "origin 不合法" }; }
    const senderOrigin = sender && sender.url ? new URL(sender.url).origin : "";
    if (senderOrigin !== o) return { ok: false, error: "配对来源和页面不一致" };
    const rec = { origin: o, accessToken: at, refreshToken: rt, userName: String(userName || ""), pairedAt: Date.now() };
    await APKGO_PLATFORM.setPaired(rec);
    const r = await APKGO_PLATFORM.request(CONFIG_PATH + "/list?page=1&size=1");
    if (!r.ok) {
      await APKGO_PLATFORM.clearPaired();
      return { ok: false, error: "令牌验证失败：" + r.error };
    }
    return { ok: true, paired: APKGO_PLATFORM.publicPaired(rec) };
  },

  async unpair() {
    await APKGO_PLATFORM.clearPaired();
    await chrome.storage.session.clear();
    return { ok: true };
  },

  // 保存到配置平台：(主体, 渠道) 唯一，已有记录就 edit 带 id，没有就 add。
  // 后端保存时在线验活，通过才落库；应用宝渠道后端不验活。
  async submit({ store, owner, config }) {
    const recipe = APKGO.recipeById(store);
    if (!recipe) return { ok: false, error: "未知商店 " + store };
    const o = owner == null ? "" : String(owner).trim();
    if (!o) return { ok: false, error: "没有主体上下文，请回配置平台的密钥配置弹窗点「助手采集」" };
    const channel = recipe.id;
    const q = `?owner=${encodeURIComponent(o)}&channel=${encodeURIComponent(channel)}`;
    const g = await APKGO_PLATFORM.request(CONFIG_PATH + "/get" + q);
    if (!g.ok) return g;
    const exist = g.data && g.data.id ? g.data : null;
    const body = { owner: o, channel, configInfo: config };
    const r = exist
      ? await APKGO_PLATFORM.request(CONFIG_PATH + "/edit", { method: "PUT", body: JSON.stringify({ id: exist.id, ...body }) })
      : await APKGO_PLATFORM.request(CONFIG_PATH + "/add", { method: "POST", body: JSON.stringify(body) });
    if (!r.ok) return r;
    return { ok: true, saved: { verified: channel !== "qq" } };
  },

  // 从配置平台「助手采集」过来时带着主体；从弹窗「前往后台」过来时没有主体，面板会提示。
  async openConsole({ store, owner, url }) {
    const recipe = APKGO.recipeById(store);
    const targetUrl = (recipe && recipe.console) || url;
    if (!targetUrl) return { ok: false, error: "未知商店 " + store };
    if (recipe) {
      const session = { [APKGO.KEY_PENDING]: recipe.id };
      const o = owner == null ? "" : String(owner).trim();
      if (o) session[APKGO.KEY_OWNER(recipe.id)] = o;
      await chrome.storage.session.set(session);
    }
    const tab = await chrome.tabs.create({ url: targetUrl });
    return { ok: true, tabId: tab.id };
  },

  // 在后台页面（含同源 iframe）的主世界里挂一个下载钩子：blob / <a download> /
  // 带 attachment 的 fetch 与 XHR 一旦发生，就把文件内容 postMessage 给内容脚本，
  // 面板据此自动填好「选文件」字段，省掉系统文件对话框。只挂在有配方的页面上。
  async injectHook(_msg, sender) {
    const tabId = sender && sender.tab && sender.tab.id;
    if (!tabId) return { ok: false, error: "no tab" };
    try {
      await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, world: "MAIN", func: downloadHook });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  },

  async openPanel({ tabId }) {
    try { await chrome.tabs.sendMessage(tabId, { type: "open-panel" }); return { ok: true }; }
    catch (e) { return { ok: false, error: "这个页面上没有助手面板，刷新一下再试" }; }
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const h = msg && handlers[msg.type];
  if (!h) { sendResponse({ ok: false, error: "unknown message " + (msg && msg.type) }); return false; }
  h(msg, sender).then(sendResponse, (e) => sendResponse({ ok: false, error: e.message || String(e) }));
  return true; // 异步回复
});

// 在商店后台页面上给图标点个绿点，提示「这里有助手」。
function updateBadge(tabId, url) {
  const on = url && APKGO.recipeForUrl(url);
  chrome.action.setBadgeText({ tabId, text: on ? "●" : "" });
  if (on) {
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#18E299" });
    chrome.action.setTitle({ tabId, title: `密钥助手 · ${on.cn}后台` });
  }
}
chrome.tabs.onUpdated.addListener((tabId, info, tab) => { if (info.status === "complete" || info.url) updateBadge(tabId, tab.url); });
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try { const t = await chrome.tabs.get(tabId); updateBadge(tabId, t.url); } catch { /* 无权限的页面拿不到 url */ }
});

// 主世界里跑的钩子。只在页面自己发起下载时读一份副本，不改变原有行为。
// 2MB 以上的不读（密钥文件都很小），非文本也不读。
function downloadHook() {
  if (window.__apkgoDownloadHook) return;
  window.__apkgoDownloadHook = true;
  const MAX = 2 * 1024 * 1024;
  const emit = (name, mime, text) => { try { window.postMessage({ source: "apkgo-assistant-hook", type: "download", name: String(name || ""), mime: String(mime || ""), text }, "*"); } catch (e) { /* ignore */ } };
  const readBlob = (blob, name) => { try { if (blob && blob.size <= MAX) blob.text().then((t) => emit(name, blob.type, t)); } catch (e) { /* ignore */ } };
  const blobs = new Map();
  const origCreate = URL.createObjectURL;
  URL.createObjectURL = function (obj) { const url = origCreate.call(this, obj); try { if (obj instanceof Blob) blobs.set(url, obj); } catch (e) { /* ignore */ } return url; };
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    try {
      const href = String(this.href || "");
      const name = this.download || href.split("/").pop().split("?")[0];
      if (blobs.has(href)) readBlob(blobs.get(href), name);
      else if (/^https?:/.test(href) && (this.download || /\.(json|cer|pem|p8|key)(\?|$)/i.test(href))) fetch(href, { credentials: "include" }).then((r) => r.blob()).then((b) => readBlob(b, name)).catch(() => {});
    } catch (e) { /* ignore */ }
    return origClick.apply(this, arguments);
  };
  const isAttachment = (cd, ct) => /attachment/i.test(cd || "") || /octet-stream/i.test(ct || "");
  const nameFrom = (cd, url) => { const m = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(cd || ""); return m ? decodeURIComponent(m[1]) : String(url || "").split("/").pop().split("?")[0]; };
  const origFetch = window.fetch;
  window.fetch = async function (input) {
    const r = await origFetch.apply(this, arguments);
    try { const cd = r.headers.get("content-disposition"); const ct = r.headers.get("content-type"); if (isAttachment(cd, ct)) r.clone().blob().then((b) => readBlob(b, nameFrom(cd, typeof input === "string" ? input : input.url))); } catch (e) { /* ignore */ }
    return r;
  };
  const XO = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) {
    this.addEventListener("load", function () {
      try { const cd = this.getResponseHeader("content-disposition"); const ct = this.getResponseHeader("content-type"); if (!isAttachment(cd, ct)) return; const res = this.response; if (typeof res === "string") emit(nameFrom(cd, u), ct, res); else if (res instanceof Blob) readBlob(res, nameFrom(cd, u)); } catch (e) { /* ignore */ }
    });
    return XO.apply(this, arguments);
  };
}

// 浏览器层面的下载（页面直接跳到一个 URL、或钩子没覆盖到的路径）：把 URL 和文件名
// 告诉那个标签页的内容脚本，由它带着页面 cookie 再取一份内容。
chrome.downloads.onCreated.addListener((item) => {
  const url = item.finalUrl || item.url || "";
  if (!/^https?:/.test(url)) return;
  if (!/\.(json|cer|pem|p8|key)(\?|$)/i.test(item.filename || url)) return;
  chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: "download-created", url, filename: item.filename || "" }).catch(() => {});
  });
});
