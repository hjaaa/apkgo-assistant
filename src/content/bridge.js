// 注入在配置平台网页上的桥：网页用 window.postMessage 和它说话，它转给后台。
// 网页因此不需要知道扩展 ID，未打包的开发版也能配对。
//
// 安全边界：只回应同一 window、同源、source === "apkgo-web" 的消息；配对时
// 强制 origin 等于当前页面的 origin，网页没法把扩展指向别的地址。
(() => {
  const PAGE = "apkgo-web";
  const EXT = "apkgo-assistant";

  function reply(msg) {
    window.postMessage({ source: EXT, ...msg }, location.origin);
  }
  function send(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(r || { ok: false, error: "no response" });
        });
      } catch (e) {
        // 扩展刚更新过、旧的内容脚本还挂在页面上时会走到这里。
        resolve({ ok: false, error: "助手已更新，请刷新页面" });
      }
    });
  }
  async function ready() {
    const st = await send({ type: "state" });
    if (st.ok) reply({ type: "ready", version: st.version, paired: st.paired });
  }

  window.addEventListener("message", async (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const d = e.data;
    if (!d || d.source !== PAGE) return;
    if (d.type === "hello") {
      ready();
    } else if (d.type === "pair") {
      // origin 永远取当前页面的，网页没法把扩展指向别的地址。
      const r = await send({ type: "pair", accessToken: d.accessToken, refreshToken: d.refreshToken, userName: d.userName, origin: location.origin });
      if (r.ok) reply({ type: "paired", paired: r.paired });
      else reply({ type: "error", message: r.error });
    } else if (d.type === "open-console") {
      const r = await send({ type: "openConsole", store: d.store, owner: d.owner, url: d.url });
      if (!r.ok) reply({ type: "error", message: r.error, action: "open-console" });
      else reply({ type: "open-console-ok", store: d.store });
    }
  });

  // 内容脚本在 document_idle 才注入，可能晚于页面的 hello；主动报一次到。
  ready();
})();
