/* global APKGO, APKGO_RECIPES */
(async () => {
  document.getElementById("ver").textContent = "v" + APKGO.VERSION;
  const conn = document.getElementById("conn");
  const here = document.getElementById("here");
  const stores = document.getElementById("stores");

  async function renderConn() {
    const st = await APKGO.send({ type: "state" });
    if (!st.ok || !st.paired) {
      conn.innerHTML = `<div>还没连接配置平台。</div><div class="row"><a class="btn acc" href="${esc(APKGO.platformSecretPage(""))}" target="_blank" rel="noopener">打开配置平台去连接</a></div>
        <div class="note">在「主体」页打开某个主体的密钥配置弹窗，点「连接助手」。</div>`;
      return;
    }
    const p = st.paired;
    conn.innerHTML = `<div class="n">已连接 · ${esc(p.userName || "配置平台")}</div><div class="o">${esc(p.origin)}</div>
      <div class="row"><button class="btn ghost" id="unpair">断开连接</button></div>`;
    document.getElementById("unpair").onclick = async () => { await APKGO.send({ type: "unpair" }); renderConn(); };
  }

  async function renderHere() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const r = tab && tab.url ? APKGO.recipeForUrl(tab.url) : null;
    if (!r) { here.innerHTML = "这不是商店后台页面。下面选一家打开，或者在已打开的后台页面右下角找到助手按钮。"; return; }
    here.innerHTML = `<div>${esc(r.cn)} · ${esc(r.product)}</div><div class="row"><button class="btn acc" id="open">打开助手面板</button></div>`;
    document.getElementById("open").onclick = async () => {
      const res = await APKGO.send({ type: "openPanel", tabId: tab.id });
      if (res.ok) window.close();
      else here.insertAdjacentHTML("beforeend", `<div class="err">${esc(res.error)}</div>`);
    };
  }

  function renderStores() {
    const list = APKGO_RECIPES.filter((r) => r.verified);
    stores.innerHTML = list.map((r) => `<button class="chip" data-id="${r.id}">${esc(r.cn)}</button>`).join("")
      + '<div class="note">从这里打开的后台没有主体上下文，只能看步骤；要保存请从配置平台的密钥配置弹窗点「助手采集」过去。</div>';
    stores.onclick = async (e) => {
      const b = e.target.closest("[data-id]");
      if (!b) return;
      await APKGO.send({ type: "openConsole", store: b.dataset.id });
      window.close();
    };
  }

  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  renderConn();
  renderHere();
  renderStores();
})();
