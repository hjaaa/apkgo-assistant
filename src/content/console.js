// 注入在各家商店后台页面上的助手面板。
//
// 三件事：把这家商店的「前置条件 + 步骤」贴在页面右下角；帮用户把密钥从页面上
// 拿下来（自动识别标签旁边的值，或者进入「点选」模式点一下）；点保存直接存到
// 配置平台（主体 + 渠道）并在线验证，结果就地显示。密钥草稿只放 storage.session。
/* global APKGO, APKGO_PANEL_CSS */
(() => {
  if (window.top !== window) return;
  const recipe = APKGO.recipeForUrl(location.href);
  if (!recipe || !recipe.verified) return; // 只在验证过的商店后台露面
  if (document.getElementById("apkgo-assistant-root")) return;

  // viewBox 收紧到正好框住三根横条（x18–82、y26–83），水平垂直居中，去掉原 100×100 画布顶部的空白。
  const escLabel = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const MARK = '<svg viewBox="12 16.5 76 76" fill="currentColor"><rect x="18" y="70" width="64" height="13" rx="6.5"/><rect x="18" y="51" width="64" height="13" rx="6.5"/><rect x="22" y="26" width="56" height="13" rx="6.5"/></svg>';
  const DRAFT_KEY = APKGO.KEY_DRAFT(recipe.id);
  const OWNER_KEY = APKGO.KEY_OWNER(recipe.id);

  // ---- state ----
  let draft = { config: {}, files: {} };
  let paired = null;
  let owner = ""; // 从配置平台「助手采集」带过来的主体；没有就不能保存
  let picking = null; // 正在点选的字段 key
  let result = null;  // { kind: ok|err|warn, html }
  let busy = false;
  let busyAction = "";
  // 一键流程的进度：idle → goto → filling → confirm（等用户点弹窗确认）→ captured → saving → done | error
  let stage = "idle";
  // 配方要求跳到另一页继续采集时放这里；由用户点按钮触发，助手不自己跳走。
  let pendingNav = null;
  let manualOpen = false; // 「手动模式」折叠是否展开；自动流程失败时自动展开

  // ---- shadow host ----
  const host = document.createElement("div");
  host.id = "apkgo-assistant-root";
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = APKGO_PANEL_CSS;
  root.appendChild(style);
  const launch = document.createElement("button");
  launch.className = "launch";
  launch.title = `密钥助手 · ${recipe.cn}`;
  const launchSub = recipe.flow && recipe.flow.length ? "一键获取密钥" : (recipe.fields.length ? "采集密钥，直接保存到配置平台" : "这一家的密钥怎么拿");
  launch.innerHTML = MARK + `<span class="lbl">密钥助手<small>${escLabel(recipe.cn)} · ${launchSub}</small></span><span class="dot"></span>`;
  const panel = document.createElement("div");
  panel.className = "panel";
  const pickbar = document.createElement("div");
  pickbar.className = "pickbar";
  // 「帮我点」做完后的提示条：面板会收起来让位给页面上的按钮，提示挪到顶部。
  const notice = document.createElement("div");
  notice.className = "pickbar notice";
  // 引导气泡：告诉用户「点这里」。
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  const bubbleText = recipe.flow && recipe.flow.length
    ? `${escLabel(recipe.cn)}的密钥在哪？点这里，一键获取 👇`
    : (recipe.fields.length ? `${escLabel(recipe.cn)}的密钥在哪？点这里，帮你找到并存进配置平台 👇` : `${escLabel(recipe.cn)}的密钥怎么拿？点这里看步骤 👇`);
  bubble.innerHTML = `<span>${bubbleText}</span><button class="bx" title="知道了">×</button>`;
  bubble.addEventListener("click", (e) => {
    if (e.target.classList.contains("bx")) { hideBubble(); return; }
    hideBubble(); hideNotice(); togglePanel(true);
  });
  function hideBubble() { bubble.classList.remove("on"); try { chrome.storage.session.set({ launcherSeen: true }); } catch { /* ignore */ } }
  root.append(launch, panel, pickbar, notice, bubble);
  notice.addEventListener("click", (e) => { if (e.target.dataset.n === "open") { hideNotice(); togglePanel(true); } if (e.target.dataset.n === "x") hideNotice(); });
  function showNotice(html) { notice.innerHTML = `<span>${html}</span><button class="mini" data-n="open">打开面板</button><button class="x" data-n="x" title="关闭">×</button>`; notice.classList.add("on"); }
  function hideNotice() { notice.classList.remove("on"); }
  document.documentElement.appendChild(host);

  launch.addEventListener("click", () => { hideNotice(); togglePanel(); });
  // 引起注意：滑入 + 光环 + 弹跳，本会话里点开过一次就不再闹。
  (async () => {
    let seen = false;
    try { ({ launcherSeen: seen } = await chrome.storage.session.get("launcherSeen")); } catch { /* ignore */ }
    if (!seen) {
      launch.classList.add("attn"); bubble.classList.add("on");
      setTimeout(() => { launch.classList.remove("attn"); bubble.classList.remove("on"); }, 30000);
    }
  })();

  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  // ---- render ----
  function render() {
    const fields = recipe.fields;
    const hasFields = fields.length > 0;
    const captured = fields.filter((f) => valueOf(f)).length;
    launch.classList.toggle("has-draft", captured > 0);

    const connHtml = paired
      ? `<div class="conn"><span class="sdot"></span><span>已连接配置平台 · ${esc(paired.userName || paired.origin)}</span></div>`
      : `<div class="conn off"><span class="sdot"></span><span>还没连接。去 <a href="${esc(APKGO.platformSecretPage(""))}" target="_blank" rel="noopener">配置平台的「主体」页</a>，打开密钥配置弹窗点「连接助手」。</span></div>`;
    // 主体从配置平台「助手采集」带过来；没有就不能保存，免得存错主体。
    const ownerHtml = owner
      ? `<div class="conn" style="margin-top:6px"><span class="sdot"></span><span>将保存到主体：<b>${esc(owner)}</b></span></div>`
      : `<div class="conn off" style="margin-top:6px"><span class="sdot"></span><span>没有主体上下文。回配置平台的密钥配置弹窗点「助手采集」再过来。</span></div>`;
    const canSave = !!(paired && owner);

    const preHtml = recipe.prereq.length
      ? `<div class="sec"><div class="sec-t">先确认</div><ul class="pre">${recipe.prereq.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>` : "";

    const hasFlow = !!(recipe.flow && recipe.flow.length);
    const stepsHtml = `<div class="sec"><div class="sec-t">在 ${esc(recipe.product)} 里</div><ol class="steps">${recipe.steps.map((s, i) => `<li><span class="n">${i + 1}</span><div style="flex:1;min-width:0"><div class="st">${esc(s.t)}</div>${s.d ? `<div class="sd">${esc(s.d)}</div>` : ""}</div>${s.action ? `<button class="mini ${busyAction === s.action ? "on" : ""}" data-action="${esc(s.action)}" ${busyAction ? "disabled" : ""}>${busyAction === s.action ? "正在点…" : "帮我点"}</button>` : ""}</li>`).join("")}</ol></div>`;

    let formHtml = "";
    if (hasFields) {
      const autoable = fields.some((f) => f.hints && f.hints.length);
      formHtml = `<div class="sec"><div class="sec-t" style="display:flex;justify-content:space-between;align-items:center">采集
        ${autoable ? '<button class="mini" data-act="auto">自动识别本页</button>' : ""}</div>` +
        fields.map((f) => fieldHtml(f)).join("") +
        (result && !hasFlow ? `<div class="msg ${result.kind}">${result.html}</div>` : "") +
        `<div class="actions"><button class="btn acc" data-act="save" ${busy || !canSave ? "disabled" : ""}>${busy ? "保存并验证中…" : "保存到配置平台并验证"}</button><button class="btn ghost" data-act="clear">清空</button></div>
        <div class="hint">保存时配置平台会连一次 ${esc(recipe.cn)}确认密钥可用。密钥只在这台浏览器的会话里暂存，保存成功即清除。</div></div>`;
    } else {
      formHtml = `<div class="msg warn">这一家的密钥是文件形式，请按上面的步骤拿到文件后，回到 <a href="${esc(APKGO.platformSecretPage(owner, paired && paired.origin))}" target="_blank" rel="noopener">配置平台的密钥配置弹窗</a> 手动填写。</div>` +
        (result ? `<div class="msg ${result.kind}">${result.html}</div>` : "");
    }

    let bodyHtml;
    if (hasFlow) {
      // 一键模式：包含需要手动填写的必填字段（如需）+ 备注名 + 一键按钮 + 进度
      const running = stage !== "idle" && stage !== "done" && stage !== "error";
      const extraFields = recipe.hideWizardFields ? [] : recipe.fields.filter((f) => !f.kind.startsWith("file") && f.required && !f.capture && !f.auto && f.key !== "privateKey");
      const extraFieldsHtml = extraFields.map((f) => fieldHtml(f)).join("");
      const doneText = recipe.doneBtnText || "再获取一个";
      const wizardHint = recipe.wizardHint || `扩展会跳到密钥页、打开创建弹窗并填好；唯一留给你的是弹窗上的「确认」。之后下载、保存、验证自动完成。`;
      const wizard = `<div class="sec wizard">
        ${extraFieldsHtml}
        <button class="btn acc" data-oneclick="1" ${running || !canSave ? "disabled" : ""}>${running ? "进行中…" : stage === "done" ? doneText : "一键获取密钥"}</button>
        ${stage === "idle" ? `<div class="hint">${esc(wizardHint)}</div>` : stage === "done" && recipe.doneHint ? `<div class="hint">${esc(recipe.doneHint)}</div>` : ""}
        ${progressHtml()}
        ${pendingNav ? `<button class="btn acc" data-nav="1" style="margin-top:10px">${esc(pendingNav.label)}</button><div class="hint">会打开 ${esc(pendingNav.url.replace(/^https?:\/\//, ""))}，落地后自动接着采集。</div>` : ""}
      </div>`;
      const manual = recipe.noManual ? "" : `<details class="manual" ${manualOpen ? "open" : ""}><summary>手动模式：自己按步骤操作、选文件</summary>${preHtml}${stepsHtml}${formHtml}</details>`;
      bodyHtml = connHtml + ownerHtml + '<div style="height:12px"></div>' + wizard + manual;
    } else {
      bodyHtml = connHtml + ownerHtml + '<div style="height:12px"></div>' + preHtml + stepsHtml + formHtml;
    }
    panel.innerHTML = `
      <div class="head"><span class="mark">${MARK}</span><div class="t">密钥助手<small>${esc(recipe.cn)} · ${esc(recipe.product)}</small></div><button class="x" data-act="close" title="收起">×</button></div>
      <div class="body">${bodyHtml}</div>`;
    if (result) { const m = panel.querySelector(".msg"); if (m) m.scrollIntoView({ block: "nearest" }); }
  }

  function progressHtml() {
    if (stage === "idle") return "";
    const defaultOrder = ["goto", "filling", "confirm", "captured", "saving", "done"];
    const order = recipe.progressOrder || defaultOrder;
    const defaultLabels = { goto: "跳到密钥页", filling: "打开创建弹窗并填好", confirm: "你点弹窗上的「确认」", captured: "抓到下载的密钥文件", saving: "保存到配置平台并验证", done: "完成" };
    const labels = Object.assign(defaultLabels, recipe.progressLabels || {});
    const cur = stage === "error" ? -1 : order.indexOf(stage);
    const items = order.filter((k) => k !== "done").map((k, i) => {
      const st = stage === "error" ? (i < errorAt ? "ok" : i === errorAt ? "err" : "") : (i < cur || stage === "done" ? "ok" : i === cur ? "cur" : "");
      return `<li class="${st}"><span class="pn">${st === "ok" ? "✓" : st === "err" ? "!" : i + 1}</span>${esc(labels[k])}${st === "cur" && k === "confirm" ? '<span class="pw">← 在页面上点它</span>' : ""}</li>`;
    }).join("");
    const res = result ? `<div class="msg ${result.kind}">${result.html}</div>` : "";
    return `<ol class="prog">${items}</ol>${res}`;
  }
  let errorAt = 0;
  function setStage(s) {
    stage = s;
    const order = recipe.progressOrder || ["goto", "filling", "confirm", "captured", "saving", "done"];
    if (s !== "error") errorAt = order.indexOf(s);
    render();
  }

  function valueOf(f) {
    if (f.kind === "file-b64" || f.kind === "file-text") return draft.config[f.key] ? (draft.files[f.key] || "已选择文件") : "";
    return draft.config[f.key] || "";
  }

  function fieldHtml(f) {
    const req = f.required ? "<b>*</b>" : "";
    const v = draft.config[f.key] || "";
    const okc = v ? "ok" : "";
    if (f.kind === "file-b64" || f.kind === "file-text") {
      return `<div class="field"><label><span>${esc(f.label)}${req}</span></label>
        <div class="file"><span class="name ${okc}">${esc(draft.files[f.key] || "还没选择文件")}</span>
        <label class="mini">选文件<input type="file" data-file="${esc(f.key)}" accept="${esc(f.accept || "")}"></label>
        ${v ? `<button class="mini" data-unfile="${esc(f.key)}">移除</button>` : ""}</div></div>`;
    }
    const pickBtn = f.virtual && !f.hints ? "" : `<button class="mini ${picking === f.key ? "on" : ""}" data-pick="${esc(f.key)}">${picking === f.key ? "点页面上的值…" : "点选"}</button>`;
    if (f.kind === "multiline") {
      return `<div class="field"><label><span>${esc(f.label)}${req}</span>${pickBtn}</label><textarea class="in ${okc}" data-k="${esc(f.key)}" spellcheck="false" placeholder="${esc(f.placeholder || "")}">${esc(v)}</textarea></div>`;
    }
    const type = f.kind === "secret" ? "password" : "text";
    return `<div class="field"><label><span>${esc(f.label)}${req}</span>${pickBtn}</label>
      <div class="row"><input class="in ${okc}" type="${type}" data-k="${esc(f.key)}" spellcheck="false" autocomplete="off" placeholder="${esc(f.placeholder || "")}" value="${esc(v)}">${f.kind === "secret" ? `<button class="mini" data-eye="${esc(f.key)}">显示</button>` : ""}</div></div>`;
  }

  // ---- events (delegated) ----
  panel.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-act],[data-pick],[data-eye],[data-unfile],[data-action],[data-oneclick],[data-nav]");
    if (!t) return;
    if (t.dataset.act === "close") return togglePanel(false);
    if (t.dataset.act === "auto") return autoDetect();
    if (t.dataset.act === "clear") { draft = { config: {}, files: {} }; result = null; await saveDraft(); return render(); }
    if (t.dataset.act === "save") return submit();
    if (t.dataset.action) return runAction(t.dataset.action);
    if (t.dataset.oneclick) return oneClick();
    if (t.dataset.nav && pendingNav) {
      const { url } = pendingNav;
      chrome.storage.session.set({ [APKGO.KEY_PENDING]: recipe.id, ["autorun:" + recipe.id]: true }).catch(() => {});
      location.href = url;
      return;
    }
    if (t.dataset.pick) return startPick(t.dataset.pick);
    if (t.dataset.eye) { const inp = panel.querySelector(`input[data-k="${t.dataset.eye}"]`); if (inp) { inp.type = inp.type === "password" ? "text" : "password"; t.textContent = inp.type === "password" ? "显示" : "隐藏"; } return; }
    if (t.dataset.unfile) { delete draft.config[t.dataset.unfile]; delete draft.files[t.dataset.unfile]; await saveDraft(); return render(); }
  });
  panel.addEventListener("toggle", (e) => { if (e.target.classList && e.target.classList.contains("manual")) manualOpen = e.target.open; }, true);
  panel.addEventListener("input", async (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    draft.config[k] = e.target.value;
    e.target.classList.toggle("ok", !!e.target.value);
    await saveDraft();
    launch.classList.toggle("has-draft", recipe.fields.some((f) => valueOf(f)));
  });
  panel.addEventListener("change", async (e) => {
    const fk = e.target.dataset.file;
    if (!fk) return;
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const f = recipe.fields.find((x) => x.key === fk);
    try {
      draft.config[fk] = f.kind === "file-text" ? await APKGO.fileToText(file) : await APKGO.fileToBase64(file);
      draft.files[fk] = file.name;
      await saveDraft();
      render();
    } catch (err) {
      result = { kind: "err", html: "读取文件失败：" + esc(err.message || err) };
      render();
    }
  });

  async function preloadFields() {
    if (typeof recipe.preload === "function") {
      try {
        const pre = await recipe.preload({ docs, byText, textOf, draft });
        if (pre && typeof pre === "object") {
          let changed = false;
          for (const [k, v] of Object.entries(pre)) {
            if (v && !draft.config[k]) { draft.config[k] = v; changed = true; }
          }
          if (changed) { await saveDraft(); render(); }
        }
      } catch { /* ignore */ }
    }
  }

  function togglePanel(force) {
    const open = force === undefined ? !panel.classList.contains("open") : force;
    panel.classList.toggle("open", open);
    launch.classList.toggle("hide", open);
    if (open) {
      launch.classList.remove("attn"); bubble.classList.remove("on");
      try { chrome.storage.session.set({ launcherSeen: true }); } catch { /* ignore */ }
      refreshState(); ensureHook(); preloadFields();
    }
  }

  // ---- storage ----
  async function loadDraft() {
    try {
      const { [DRAFT_KEY]: d } = await chrome.storage.session.get(DRAFT_KEY);
      if (d) draft = { config: {}, files: {}, ...d };
    } catch { /* session storage 不可用时就只在内存里 */ }
  }
  async function saveDraft() {
    try { await chrome.storage.session.set({ [DRAFT_KEY]: draft }); } catch { /* ignore */ }
  }
  async function clearDraft() {
    draft = { config: {}, files: {} };
    try { await chrome.storage.session.remove(DRAFT_KEY); } catch { /* ignore */ }
  }
  async function refreshState() {
    const st = await APKGO.send({ type: "state" });
    paired = st.ok ? st.paired : null;
    try { ({ [OWNER_KEY]: owner = "" } = await chrome.storage.session.get(OWNER_KEY)); } catch { owner = ""; }
    render();
  }

  // ---- auto detect: 找标签文字，再在它附近找一个像样的值 ----
  // 不少后台（华为 AGC 就是）把正文放在同源 iframe 里，识别和点选都要进去找。
  // 跨域 iframe 拿不到 contentDocument，会被静默跳过。
  function docs() {
    const out = [document];
    document.querySelectorAll("iframe").forEach((f) => {
      try { const d = f.contentDocument; if (d && d.body) out.push(d); } catch { /* 跨域 */ }
    });
    return out;
  }
  function isVisible(el) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return false;
    const win = (el.ownerDocument && el.ownerDocument.defaultView) || window;
    const cs = win.getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  }
  function textOf(el) { return (el.innerText || el.textContent || "").trim(); }
  function valuesIn(el) {
    const out = [];
    el.querySelectorAll("input,textarea").forEach((i) => { if (i.value) out.push(i.value); });
    // 值经常和「复制」按钮同在一个单元格里：整段文字之外，再把只含文本的直接
    // 子节点和每个叶子元素各作为一个候选，让 pattern 有机会单独命中。
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).filter(Boolean).join(" ");
    if (own) out.push(own);
    el.querySelectorAll("*").forEach((c) => { if (!c.children.length) { const t = textOf(c); if (t) out.push(t); } });
    const t = textOf(el);
    if (t) out.push(t);
    return out;
  }
  function plausible(f, raw) {
    let v = String(raw || "").trim();
    if (!v || v.length > 4096 || /^[•*·]+$/.test(v)) return "";
    // 「Client ID：123456」这种同一节点里带标签的，取冒号后面那段。
    const m = v.match(/[:：]\s*([^\s:：]+)\s*$/);
    if (m && f.hints && f.hints.some((re) => re.test(v))) v = m[1];
    if (f.pattern) {
      if (f.pattern.test(v)) return v;
      // 「30659871 复制」：按空白拆开，取第一个像样的片段。
      const parts = v.split(/\s+/);
      if (parts.length <= 6) { const hit = parts.find((x) => f.pattern.test(x)); if (hit) return hit; }
      return "";
    }
    return v.length >= 4 && !/\n/.test(v) ? v : "";
  }
  function detectField(f) {
    if (!f.hints || !f.hints.length) return "";
    const labels = [];
    for (const doc of docs()) {
      const all = doc.body.querySelectorAll("label,th,td,dt,dd,span,div,p,strong,b,li,h1,h2,h3,h4");
      for (const el of all) {
        if (el.children.length > 3) continue;
        const t = textOf(el);
        if (!t || t.length > 60) continue;
        if (f.hints.some((re) => re.test(t)) && isVisible(el)) labels.push(el);
        if (labels.length > 40) break;
      }
    }
    for (const label of labels) {
      const cands = [];
      if (label.tagName === "LABEL" && label.htmlFor) {
        const inp = label.ownerDocument.getElementById(label.htmlFor);
        if (inp && inp.value) cands.push(inp.value);
      }
      const inner = plausible(f, textOf(label));
      if (inner && f.hints.some((re) => re.test(textOf(label)))) cands.push(textOf(label));
      let node = label;
      for (let depth = 0; depth < 4 && node; depth++, node = node.parentElement) {
        let sib = node.nextElementSibling;
        for (let n = 0; sib && n < 3; n++, sib = sib.nextElementSibling) cands.push(...valuesIn(sib));
        if (node.parentElement && node.parentElement.tagName === "TR") break;
      }
      for (const c of cands) { const v = plausible(f, c); if (v) return v; }
    }
    return "";
  }
  async function autoDetect() {
    let n = 0;
    if (typeof recipe.detect === "function") {
      try {
        const custom = await recipe.detect({ docs, byText, textOf, draft });
        if (custom && typeof custom === "object") {
          for (const [k, v] of Object.entries(custom)) {
            if (v && !draft.config[k]) { draft.config[k] = v; n++; }
          }
        }
      } catch (e) { /* ignore */ }
    }
    for (const f of recipe.fields) {
      if (f.kind.startsWith("file") || draft.config[f.key]) continue;
      const v = detectField(f);
      if (v) { draft.config[f.key] = v; n++; }
    }
    await saveDraft();
    result = n ? { kind: "ok", html: `识别到 ${n} 个字段，请核对后保存。没识别到的可以用「点选」。` } : { kind: "warn", html: "这一页上没找到像密钥的内容。走到显示密钥的那一页再试，或者用「点选」。" };
    render();
  }

  // ---- pick mode: 点页面上的元素，取它的值 ----
  let lastHover = null;
  function startPick(key) {
    if (picking === key) return stopPick();
    picking = key;
    const f = recipe.fields.find((x) => x.key === key);
    pickbar.innerHTML = `点一下页面上的 <b>${esc(f.label)}</b>，Esc 取消`;
    pickbar.classList.add("on");
    pickDocs = docs();
    for (const d of pickDocs) {
      d.addEventListener("mouseover", onHover, true);
      d.addEventListener("click", onPickClick, true);
      d.addEventListener("keydown", onKey, true);
    }
    render();
  }
  let pickDocs = [];
  function stopPick() {
    picking = null;
    pickbar.classList.remove("on");
    if (lastHover) { lastHover.style.outline = lastHover.__apkgoOutline || ""; lastHover = null; }
    for (const d of pickDocs) {
      d.removeEventListener("mouseover", onHover, true);
      d.removeEventListener("click", onPickClick, true);
      d.removeEventListener("keydown", onKey, true);
    }
    pickDocs = [];
    render();
  }
  function onHover(e) {
    const el = e.target;
    if (!el || !el.style || host.contains(el)) return;
    if (lastHover && lastHover !== el) lastHover.style.outline = lastHover.__apkgoOutline || "";
    if (el !== lastHover) { el.__apkgoOutline = el.style.outline; el.style.outline = "2px solid #18E299"; lastHover = el; }
  }
  function onKey(e) { if (e.key === "Escape") { e.preventDefault(); stopPick(); } }
  async function onPickClick(e) {
    const el = e.target;
    if (!el || host.contains(el)) return;
    e.preventDefault(); e.stopPropagation();
    const key = picking;
    const f = recipe.fields.find((x) => x.key === key);
    let v = (el.tagName === "INPUT" || el.tagName === "TEXTAREA") ? el.value : textOf(el);
    const cleaned = plausible(f, v) || v.trim();
    stopPick();
    if (!cleaned) { result = { kind: "warn", html: "这个位置上没有文字。" }; return render(); }
    draft.config[key] = cleaned;
    await saveDraft();
    result = f.pattern && !f.pattern.test(cleaned)
      ? { kind: "warn", html: `已填入「${esc(APKGO.maskSecret(cleaned))}」，但看起来不太像 ${esc(f.label)}，保存前请核对。` }
      : null;
    render();
  }

  // ---- 「帮我点」：配方里声明的页面动作。最后的确认键永远留给用户 ----
  function byText(sel, re, root) {
    const roots = root ? [root] : docs().map((d) => d.body);
    for (const r of roots) {
      for (const el of r.querySelectorAll(sel)) {
        if (re.test(textOf(el)) && el.getClientRects().length) return el;
      }
    }
    return null;
  }
  function setInput(inp, value) {
    const proto = Object.getPrototypeOf(inp);
    const desc = Object.getOwnPropertyDescriptor(proto, "value") || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (desc && desc.set) desc.set.call(inp, value); else inp.value = value;
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function highlight(el) {
    if (!el) return;
    el.style.outline = "3px solid #18E299";
    el.style.outlineOffset = "3px";
    const doc = el.ownerDocument || document;
    if (!doc.getElementById("apkgo-highlight-style")) {
      const st = doc.createElement("style");
      st.id = "apkgo-highlight-style";
      st.textContent = `
        @keyframes apkgo-glow {
          0%, 100% {
            box-shadow: 0 0 8px #18E299, 0 0 16px rgba(24,226,153,.5);
          }
          50% {
            box-shadow: 0 0 22px #18E299, 0 0 40px rgba(24,226,153,.85), 0 0 60px rgba(24,226,153,.4);
          }
        }
        .apkgo-glow-target {
          animation: apkgo-glow 1.4s ease-in-out infinite alternate !important;
          transition: box-shadow .2s ease-in-out !important;
        }
      `;
      (doc.head || doc.documentElement).appendChild(st);
    }
    doc.querySelectorAll(".apkgo-glow-target").forEach((e) => e.classList.remove("apkgo-glow-target"));
    el.classList.add("apkgo-glow-target");
    el.addEventListener("click", () => {
      el.classList.remove("apkgo-glow-target");
      el.style.outline = "";
      el.style.outlineOffset = "";
    }, { once: true });
    try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch { /* ignore */ }
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(fn, ms = 4000) {
    const end = Date.now() + ms;
    while (Date.now() < end) { const v = fn(); if (v) return v; await wait(120); }
    return null;
  }
  function onConsolePage() {
    if ((recipe.flowPages || []).some((re) => re.test(location.href))) return true;
    try {
      const target = new URL(recipe.console);
      const cur = new URL(location.href);
      if (cur.origin !== target.origin) return false;
      const targetPath = target.pathname.replace(/\/+$/, "");
      const curPath = cur.pathname.replace(/\/+$/, "");
      if (curPath !== targetPath) return false;
      if (target.hash && cur.hash !== target.hash) return false;
      return true;
    } catch {
      return location.href.split("#")[0] === recipe.console.split("#")[0];
    }
  }
  // 向 MAIN world 的记录器要这一页发过的 JSON 返回（见 src/content/sniff-main.js）。
  // 只在配方主动调用时发生；拿到后配方只取自己声明的字段，其余丢弃。
  let sniffSeq = 0;
  function responses(timeout = 1200) {
    return new Promise((resolve) => {
      const id = ++sniffSeq;
      let done = false;
      const onMsg = (e) => {
        const d = e.data;
        if (e.source !== window || !d || d.source !== "apkgo-assistant-sniff" || d.type !== "sniff-res" || d.id !== id) return;
        done = true; window.removeEventListener("message", onMsg);
        resolve((d.entries || []).map((x) => { try { return { url: x.url, json: JSON.parse(x.text) }; } catch { return null; } }).filter(Boolean));
      };
      window.addEventListener("message", onMsg);
      window.postMessage({ source: "apkgo-assistant", type: "sniff-req", id }, location.origin);
      setTimeout(() => { if (!done) { window.removeEventListener("message", onMsg); resolve([]); } }, timeout);
    });
  }
  // 读这一页（含同源 iframe）的 localStorage / sessionStorage。有些后台把开发者 ID
  // 之类直接放在这里（应用宝的 $loginInfo），比等网络返回可靠：页面一加载就有。
  // 只在配方主动调用时读，配方只取自己声明的字段，其余丢弃。
  function storage() {
    const out = [];
    for (const d of docs()) {
      const w = d.defaultView;
      if (!w) continue;
      for (const [where, store] of [["local", "localStorage"], ["session", "sessionStorage"]]) {
        let s;
        try { s = w[store]; if (!s) continue; } catch { continue; }
        let keys = [];
        try { keys = Object.keys(s); } catch { continue; }
        for (const k of keys) {
          let v;
          try { v = s.getItem(k); } catch { continue; }
          if (!v || v.length > 64 * 1024) continue;
          let json = null;
          const t = v.trimStart();
          if (t[0] === "{" || t[0] === "[") { try { json = JSON.parse(v); } catch { /* 不是 JSON */ } }
          out.push({ where, key: k, text: v, json });
        }
      }
    }
    return out;
  }

  // 在任意嵌套结构里找第一个叫某个名字、且值像样的字段。
  function deepFind(obj, names, ok) {
    const want = names.map((n) => n.toLowerCase());
    const seen = new Set();
    const walk = (o, depth) => {
      if (!o || typeof o !== "object" || depth > 8 || seen.has(o)) return null;
      seen.add(o);
      for (const [k, v] of Object.entries(o)) {
        if (want.includes(k.toLowerCase()) && (typeof v === "string" || typeof v === "number")) {
          const s = String(v).trim();
          if (s && (!ok || ok(s))) return s;
        }
      }
      for (const v of Object.values(o)) { const r = walk(v, depth + 1); if (r) return r; }
      return null;
    };
    return walk(obj, 0);
  }
  // 整页找一个符合模式的独立字符串（用于页面上直接显示的密钥）。
  function scanText(re) {
    for (const d of docs()) {
      for (const inp of d.querySelectorAll("input, textarea")) {
        const v = (inp.value || inp.getAttribute("value") || inp.placeholder || "").trim();
        const m = v.match(re); if (m) return m[0];
      }
      const m = (d.body && d.body.innerText || "").match(re);
      if (m) return m[0];
    }
    return "";
  }
  // 一键流程里需要重新加载页面（比如要让记录器赶在页面自己的请求之前就位）时用它。
  async function reloadAndResume(reason) {
    const guard = "sniffReload:" + recipe.id;
    let already = false;
    try { ({ [guard]: already } = await chrome.storage.session.get(guard)); } catch { /* ignore */ }
    if (already) return false;
    try { await chrome.storage.session.set({ [guard]: true, ["autorun:" + recipe.id]: true, [APKGO.KEY_PENDING]: recipe.id }); } catch { /* ignore */ }
    result = { kind: "ok", html: esc(reason || "正在刷新页面重试…") };
    render();
    location.reload();
    return true;
  }

  function requestNav(url, label) { pendingNav = { url, label }; render(); }

  async function runAction(id, extra = {}) {
    if (id === "goto") {
      if (!onConsolePage()) { location.href = recipe.console; return false; }
      result = { kind: "ok", html: "已经在这一页了。" }; render(); return true;
    }
    const fn = recipe.actions && recipe.actions[id];
    if (!fn) return false;
    busyAction = id; result = null; render();
    try {
      await ensureHook();
      const msg = await fn({ docs, byText, setInput, highlight, wait, waitFor, draft, textOf, responses, storage, deepFind, scanText, reloadAndResume, requestNav, onConsolePage, ensureHook, ...extra });
      result = { kind: "ok", html: esc(msg || "已完成。") };
      busyAction = ""; render();
      if (!autoSave) { // 单独点「帮我点」时也让位；一键流程由 oneClick 统一处理
        togglePanel(false);
        showNotice(esc(msg || "已完成。"));
      }
      return true;
    } catch (e) {
      result = { kind: "warn", html: esc(e.message || String(e)) };
    }
    busyAction = ""; render();
    return false;
  }

  // 一键获取 = 按配方的 flow 依次跑 actions；不在入口页就先跳过去，落地后接着跑
  async function checkLogin() {
    const url = location.href;
    if (/login|passport|account\.xiaomi\.com|id\d*\.cloud\.huawei\.com|portal\/loginAuth/i.test(url)) {
      return false;
    }
    for (const d of docs()) {
      if (d.querySelector("#login_form, .login-container, form[action*='login']")) {
        return false;
      }
    }
    if (typeof recipe.isLoggedIn === "function") {
      try {
        return await recipe.isLoggedIn({ docs, byText, textOf, draft });
      } catch { /* ignore */ }
    }
    return true;
  }

  let autoSave = false;
  async function oneClick() {
    const flow = recipe.flow || [];
    if (!flow.length) return;
    const isReset = stage === "done";
    result = null;
    if (!paired || !owner) {
      result = { kind: "warn", html: paired ? "没有主体上下文：回配置平台的密钥配置弹窗点「助手采集」再过来。" : "还没连接配置平台。" };
      return render();
    }

    // 预检：如果尚未登录，提醒用户先登录开发者账号
    const loggedIn = await checkLogin();
    if (!loggedIn) {
      result = {
        kind: "warn",
        html: `检测到您尚未登录 <b>${esc(recipe.cn)} 开放平台</b>，请先登录开发者账号后再获取密钥。`
      };
      setStage("error");
      showNotice(`请先登录 ${esc(recipe.cn)} 开放平台开发者账号。`);
      return;
    }

    if (isReset) {
      for (const f of recipe.fields) delete draft.config[f.key];
      await saveDraft();
    }
    if (!onConsolePage()) {
      setStage("goto");
      try { await chrome.storage.session.set({ [APKGO.KEY_PENDING]: recipe.id, ["autorun:" + recipe.id]: true }); } catch { /* ignore */ }
      location.href = recipe.console;
      return;
    }
    autoSave = true;
    pendingNav = null;
    setStage("filling");
    for (const id of flow) {
      if (!(await runAction(id, { isReset }))) { autoSave = false; if (!recipe.noManual) manualOpen = true; setStage("error"); return; }
      if (pendingNav) { // 这一步要求换一页继续，等用户点按钮，不自己跳走
        autoSave = false;
        setStage(pendingNav.stage || "filling");
        render();
        return;
      }
    }
    const missing = recipe.fields.filter((f) => f.required && !draft.config[f.key]);
    if (!missing.length && !recipe.fields.some((f) => f.capture)) {
      setStage("saving");
      return submit();
    }
    setStage("confirm");
    // 让位：面板可能正盖着弹窗上的「确认」。
    togglePanel(false);
    showNotice(esc((result && result.html) || "请点弹窗上的「确认」，剩下的交给我。"));
  }

  // ---- 下载自动抓取：页面一下载密钥文件，直接填进对应的文件字段 ----
  let hookReady = false;
  const hookedWindows = new WeakSet();
  const huaweiHookBindings = new Map();
  let huaweiHookTask = null;
  let huaweiFrameObserver = null;
  let huaweiWatchEnabled = false;
  const huaweiFrames = new Set();
  async function ensureHook() {
    if (!recipe.fields.some((f) => f.capture)) return true;
    if (recipe.id !== "huawei") {
      const r = await APKGO.send({ type: "injectHook" }); hookReady = !!r.ok;
      for (const d of docs()) {
        const w = d.defaultView;
        if (!w || hookedWindows.has(w)) continue;
        hookedWindows.add(w);
        w.addEventListener("message", onHookMessage);
      }
      return hookReady;
    }
    huaweiWatchEnabled = true;
    startHuaweiHookWatch();
    if (!huaweiHookTask) {
      huaweiHookTask = (async () => {
        // 注入过程中 iframe 可能换文档；最多再核对一次，不把旧文档的成功当成新表单就绪。
        for (let attempt = 0; attempt < 2; attempt++) {
          const before = docs();
          const r = await APKGO.send({ type: "injectHook" });
          hookReady = !!r.ok;
          if (!hookReady) return false;
          const current = docs();
          if (before.length !== current.length || before.some((d, i) => d !== current[i])) continue;
          for (const [d, w] of huaweiHookBindings) {
            if (!current.includes(d)) { try { w.removeEventListener("message", onHookMessage); } catch { /* 旧文档可能已经销毁 */ } huaweiHookBindings.delete(d); }
          }
          for (const d of current) {
            const w = d.defaultView;
            if (!w) return false;
            if (!huaweiHookBindings.has(d)) { w.addEventListener("message", onHookMessage); huaweiHookBindings.set(d, w); }
          }
          return true;
        }
        hookReady = false;
        return false;
      })().finally(() => { huaweiHookTask = null; });
    }
    return huaweiHookTask;
  }
  function refreshHuaweiHook() { ensureHook().catch(() => { hookReady = false; }); }
  function watchHuaweiFrames() {
    const current = [...document.querySelectorAll("iframe")];
    for (const frame of huaweiFrames) {
      if (!current.includes(frame)) { frame.removeEventListener("load", refreshHuaweiHook); huaweiFrames.delete(frame); }
    }
    for (const frame of current) {
      if (huaweiFrames.has(frame)) continue;
      huaweiFrames.add(frame);
      frame.addEventListener("load", refreshHuaweiHook);
      refreshHuaweiHook();
    }
  }
  function startHuaweiHookWatch() {
    if (recipe.id !== "huawei" || huaweiFrameObserver) return;
    huaweiFrameObserver = new MutationObserver(watchHuaweiFrames);
    huaweiFrameObserver.observe(document.documentElement, { childList: true, subtree: true });
    watchHuaweiFrames();
  }
  function stopHuaweiHookWatch() {
    if (huaweiFrameObserver) huaweiFrameObserver.disconnect();
    huaweiFrameObserver = null;
    for (const frame of huaweiFrames) frame.removeEventListener("load", refreshHuaweiHook);
    huaweiFrames.clear();
    for (const w of huaweiHookBindings.values()) { try { w.removeEventListener("message", onHookMessage); } catch { /* 页面已关闭 */ } }
    huaweiHookBindings.clear();
  }
  if (recipe.id === "huawei") {
    window.addEventListener("pagehide", stopHuaweiHookWatch);
    window.addEventListener("pageshow", (e) => { if (e.persisted && huaweiWatchEnabled) startHuaweiHookWatch(); });
  }
  function onHookMessage(e) {
    const d = e.data;
    if (!d || d.source !== "apkgo-assistant-hook" || d.type !== "download") return;
    ingestDownload(d.name, d.mime, d.text);
  }
  // 同一次下载可能被多条路径各抓一遍（blob 钩子、fetch/XHR 钩子、浏览器下载事件），
  // 按内容指纹去重；刚保存成功的那份再抓到也不再往表单里填，免得用户二次保存撞上
  // 「同一组鉴权信息只能添加到一个账号下」。
  const fingerprint = (t) => { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return `${t.length}:${h}`; };
  let lastCapture = "";
  let lastSaved = "";
  async function ingestDownload(name, mime, text) {
    const f = recipe.fields.find((x) => x.capture && ((x.capture.name && x.capture.name.test(name || "")) || (x.capture.mime && x.capture.mime.test(mime || ""))));
    if (!f || !text) return;
    const fp = fingerprint(text);
    if (fp === lastSaved) { result = { kind: "ok", html: `这份 ${esc(name || "文件")} 刚才已经保存到配置平台了，不用再存。` }; togglePanel(true); render(); return; }
    if (fp === lastCapture) return;
    lastCapture = fp;
    draft.config[f.key] = f.kind === "file-text" ? text : btoa(unescape(encodeURIComponent(text)));
    draft.files[f.key] = name || "下载的文件";
    await saveDraft();
    result = { kind: "ok", html: `已自动抓到下载的 ${esc(name || "文件")}。${autoSave ? "正在保存并验证…" : "核对后点保存。"}` };
    hideNotice();
    togglePanel(true);
    if (autoSave) { autoSave = false; setStage("saving"); submit(fp); } else render();
  }
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "download-created" && recipe.fields.some((f) => f.capture)) {
      fetch(msg.url, { credentials: "include" }).then((r) => (r.ok ? r.text() : "")).then((t) => ingestDownload(msg.filename.split("/").pop(), "", t)).catch(() => {});
    }
  });

  // ---- submit ----
  async function submit(capturedFp) {
    if (busy) return;
    if (!paired || !owner) { result = { kind: "warn", html: paired ? "没有主体上下文，回配置平台的密钥配置弹窗点「助手采集」再过来。" : "还没连接配置平台。" }; return render(); }
    const missing = recipe.fields.filter((f) => f.required && !draft.config[f.key]);
    if (missing.length) { result = { kind: "warn", html: "还差：" + missing.map((f) => esc(f.label)).join("、") }; return render(); }
    if (typeof recipe.validate === "function") {
      const bad = recipe.validate(draft.config);
      if (bad) {
        result = { kind: "warn", html: esc(bad) };
        if (recipe.id === "huawei") { autoSave = false; manualOpen = true; setStage("error"); return; }
        return render();
      }
    }
    busy = true; result = null;
    if (recipe.id === "huawei" && stage === "idle") setStage("saving"); else render();
    let config = {};
    for (const f of recipe.fields) if (draft.config[f.key]) config[f.key] = draft.config[f.key];
    // finalize 把采集结果整理成配置平台要的 configInfo（华为拆 JSON、小米带公钥）；
    // 第二个参数是完整草稿，actions 算出来的中间值从这里取。
    if (recipe.finalize) config = recipe.finalize(config, draft.config);
    const r = await APKGO.send({ type: "submit", store: recipe.id, owner, config });
    busy = false;
    if (r.ok) {
      const link = `<a href="${esc(APKGO.platformSecretPage(owner, paired && paired.origin))}" target="_blank" rel="noopener">在配置平台查看</a>`;
      result = r.saved && r.saved.verified
        ? { kind: "ok", html: `已保存到配置平台，${esc(recipe.cn)}在线验证通过。${link}，或者继续采集下一家。` }
        : { kind: "ok", html: `已保存到配置平台。${esc(recipe.cn)}暂不支持在线验证，发布时会直接使用这组密钥。${link}` };
      if (capturedFp) lastSaved = capturedFp;
      else if (recipe.id === "huawei" && draft.config.serviceAccountJson) lastSaved = fingerprint(draft.config.serviceAccountJson);
      await clearDraft();
      launch.classList.remove("has-draft");
      if (stage !== "idle") { stage = "done"; }
    } else {
      result = { kind: "err", html: esc(r.error) };
      if (r.status === 401) paired = null;
      if (stage !== "idle") { stage = "error"; errorAt = 4; if (!recipe.noManual) manualOpen = true; }
    }
    render();
  }

  // ---- messages from popup / background ----
  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg && msg.type === "open-panel") { togglePanel(true); sendResponse({ ok: true }); }
  });

  // ---- init ----
  (async () => {
    await loadDraft();
    render();
    preloadFields();
    try {
      const { [APKGO.KEY_PENDING]: pending, ["autorun:" + recipe.id]: autorun } = await chrome.storage.session.get([APKGO.KEY_PENDING, "autorun:" + recipe.id]);
      if (pending === recipe.id) { await chrome.storage.session.remove(APKGO.KEY_PENDING); togglePanel(true); }
      if (autorun) { await chrome.storage.session.remove("autorun:" + recipe.id); stage = "goto"; togglePanel(true); await refreshState(); await wait(1500); oneClick(); }
    } catch { /* ignore */ }
  })();
})();
