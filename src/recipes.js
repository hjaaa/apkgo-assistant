// 每家商店一份「配方」：后台域名、入口页、前置条件、步骤、要采集的字段。
//
// 加一家商店 = 加一个对象。字段的 key 必须和配置平台（dream-product）对应渠道
// Config 类的属性名一致（dream-product-api 的 api.dto.openplatform 包，驼峰）：
//   huawei  keyId / privateKey / subAccount / projectId（由下载的 JSON 拆出，见 parseHuaweiServiceAccount）
//   xiaomi  userName / privateKey / publicKey（publicKey 内置）
//   oppo    clientId / clientSecret
//   vivo    accessKey / accessSecret
//   honor   clientId / clientSecret
//   qq      userId / accessSecret
// kind:
//   text      单行明文（ID 之类）
//   secret    单行密文（secret / key）
//   multiline 多行密文（PEM 私钥），不能用单行输入框，会被吃掉换行
//   file-b64  选文件 → base64
//   file-text 选文件 → 原文（JSON / PEM）
// hints 是自动识别时匹配页面上标签文字的正则；pattern 用来过滤识别到的值。
// 各家后台会改版，菜单名和入口 URL 以实际为准——错了改这个文件就行。
//
// verified: true = 已在真实后台完整跑通，才会在页面上出助手入口。配置平台只有这六个渠道。
// 商店后台里由助手创建的凭据（华为 Service Account、OPPO 服务端应用）仍命名为 apkgo：
// 那是后台里的名字，不是产品文案，保持不变以免影响已验证的流程。

// 小米开放平台下发的公钥对所有开发者相同：dev.api.public.cer 去掉 PEM 头尾与换行后的裸base64。
// 后端用它做 RSA 加密生成 SIG；平台前端手动上传公钥文件时也是这么处理的。
const XIAOMI_PUBLIC_KEY = "MIICsjCCAhugAwIBAgIUbANcYrk1DOkSSBAxRZo+FcIru9wwDQYJKoZIhvcNAQEEBQAwajELMAkGA1UEBhMCQ04xEDAOBgNVBAgMB0JlaUppbmcxEDAOBgNVBAcMB0JlaUppbmcxDzANBgNVBAoMBnhpYW9taTENMAsGA1UECwwEbWl1aTEXMBUGA1UEAwwOZGV2LnhpYW9taS5jb20wIBcNMjMwMjIxMDIwOTA2WhgPMjEyMzAxMjgwMjA5MDZaMGoxCzAJBgNVBAYTAkNOMRAwDgYDVQQIDAdCZWlKaW5nMRAwDgYDVQQHDAdCZWlKaW5nMQ8wDQYDVQQKDAZ4aWFvbWkxDTALBgNVBAsMBG1pdWkxFzAVBgNVBAMMDmRldi54aWFvbWkuY29tMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDAX+S8xIjMtIvC3hDV1Pb9G0xeHKDP5C3yukb41kuvf+rVMTcSb4wxTWy7JlOMaRd6hWPUSNKskX+/aZin2FHlqJkAjP4SqNpSiG1le/0VYXmYRAtshm1DEcoCMyatwAoQU9jDtWu2wPSyDXL/sS5qMufpdzJ1cG1VKVrAvxiOfQIDAQABo1MwUTAdBgNVHQ4EFgQUSerMKItNhZ/Od9mhtMVd4vE/pBEwHwYDVR0jBBgwFoAUSerMKItNhZ/Od9mhtMVd4vE/pBEwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQQFAAOBgQCpyfyMQ1tXgiwbd6j4kU8suUwwFdRcpnjoABwndExs38XF7EoLcHFHpt3WUmIs4fdnOD6+549n0usGOCkRb8H47P7Y+qnJgH/YM42sZEp4vVHczr7MyOquQC/ZO5gnAwaYoVMkKqs06u5dP/MMoedva3PCu9tBkNSQpAnle2BiYg==";

// 华为 AGC 下载的 *_private.json → 配置平台要的四个字段；与平台前端手动上传的解析规则一致。
// 返回 { config } 或 { error }。
function parseHuaweiServiceAccount(text) {
  let json;
  try { json = JSON.parse(text); } catch { return { error: "凭据文件不是合法的 JSON" }; }
  if (!json || typeof json !== "object") return { error: "凭据文件不是合法的 JSON" };
  const keyId = json.key_id || json.keyId;
  const privateKey = json.private_key || json.privateKey;
  const subAccount = json.sub_account || json.subAccount;
  if (!keyId || !privateKey || !subAccount) return { error: "凭据文件无效，缺少 key_id / private_key / sub_account 字段" };
  return { config: { keyId: String(keyId), privateKey: String(privateKey), subAccount: String(subAccount), projectId: String(json.project_id || json.projectId || "") } };
}

const APKGO_RECIPES = [
  {
    id: "huawei", verified: true, cn: "华为", product: "AppGallery Connect",
    hostRe: /(^|\.)developer\.huawei\.com$/,
    // 「用户与访问 → API密钥 → Connect API」那一页（2026-09 实登核对）。
    console: "https://developer.huawei.com/consumer/cn/service/josp/agc/index.html#/ups/9249519184595983326",
    prereq: ["需要团队管理员账号，否则顶部没有「用户与访问」", "华为提示「API 客户端」即将被 Service Account 替代，新建请选 Service Account"],
    steps: [
      { t: "登录 AppGallery Connect，顶部点「用户与访问」", d: "" },
      { t: "左侧「API密钥 → Connect API」，停在「Service Account」页签", d: "列表里能看到已有的服务账号；配置平台需要一个「开发者级 · APP管理员」的。", action: "goto" },
      { t: "点「创建」，填名称、选「开发者级」、勾「APP管理员」", d: "「帮我点」会打开弹窗并填好，最后的「确认」留给你点。", action: "open-create" },
      { t: "点「确认」后下载 JSON，面板会自动抓到这个文件", d: "没抓到就手动「选文件」。JSON 只能下载一次。" },
    ],
    fields: [
      { key: "serviceAccountJson", label: "服务账号 JSON 文件", kind: "file-text", accept: ".json,application/json", required: true, capture: { name: /\.json$/i, mime: /json/i } },
    ],
    // 采到的是整个 JSON 文本；保存前先校验，提交时拆成配置平台要的四个字段。
    validate(cfg) { return cfg.serviceAccountJson ? (parseHuaweiServiceAccount(cfg.serviceAccountJson).error || "") : ""; },
    finalize(config) { return parseHuaweiServiceAccount(config.serviceAccountJson).config; },
    isLoggedIn: async (h) => {
      if (/login|id\d*\.cloud\.huawei\.com|portal\/loginAuth/i.test(location.href)) return false;
      for (const doc of h.docs()) {
        if (doc.querySelector("#login_form, .login-container, input[type='password'][name*='login']")) return false;
        const hasLogin = [...doc.querySelectorAll("a, button, span")].some((el) => /^登录$/.test(h.textOf(el).trim()) && el.getClientRects().length);
        const hasUser = doc.querySelector(".agc-header, .header-user, .user-info, .head-portrait, [class*='avatar'], [class*='account-name']");
        if (hasLogin && !hasUser) return false;
      }
      return true;
    },
    // AGC 正文在同源 iframe 里，Element UI：.el-dialog / .el-radio / .el-checkbox / .el-button。
    // 「一键获取密钥」按 flow 顺序跑；弹窗上的「确认」留给用户，之后抓下载 → 自动保存验证。
    flow: ["open-create"],
    actions: {
      "open-create": async (h) => {
        if (/login|id\d*\.cloud\.huawei\.com|portal\/loginAuth/i.test(location.href)) {
          throw new Error("检测到您尚未登录华为开发者账号，请先完成登录后再获取密钥。");
        }
        let dlg = h.byText(".el-dialog", /创建Service Account/);
        if (!dlg) {
          const btn = h.byText("button", /^创建$/);
          if (!btn) throw new Error("没找到「创建」按钮。请确认停在「用户与访问 → API密钥 → Connect API」的 Service Account 页签。");
          btn.click();
          dlg = await h.waitFor(() => h.byText(".el-dialog", /创建Service Account/), 4000);
          if (!dlg) throw new Error("点了「创建」但没等到弹窗，请手动点一次再试。");
        }
        const name = dlg.querySelector('input.el-input__inner[type="text"]');
        if (name && !name.value) h.setInput(name, "apkgo");
        // 单选/多选按「去掉空白、不分大小写」的文字找。AGC 的角色一栏不是标准
        // .el-checkbox（实登时 querySelectorAll 为空），所以退一步：找文字正好是
        // 「APP管理员」的元素，点它最近的可点击容器；勾没勾上从 input / aria-checked /
        // class 三种信号判断，没信号就假定没勾、点一次并提醒核对。
        const norm = (t) => String(t || "").replace(/\s+/g, "").toLowerCase();
        const findText = (want) => {
          const els = [...dlg.querySelectorAll("*")].filter((el) => el.children.length <= 2 && norm(h.textOf(el)) === want && el.getClientRects().length);
          const el = els[els.length - 1];
          if (!el) return null;
          // 先找语义明确的容器（label / role / el-*），再退到类名含 checkbox/radio 的祖先，最后用父元素。
          const c1 = el.closest('label, [role="checkbox"], [role="radio"], .el-checkbox, .el-radio');
          if (c1) return c1;
          const c2 = el.parentElement && el.parentElement.closest('[class*="checkbox"], [class*="radio"], li');
          return c2 || el.parentElement || el;
        };
        const state = (t) => {
          const inp = t.querySelector('input[type="checkbox"], input[type="radio"]');
          if (inp) return inp.checked;
          const ariaEl = t.hasAttribute("aria-checked") ? t : t.querySelector("[aria-checked]");
          if (ariaEl) return ariaEl.getAttribute("aria-checked") === "true";
          if (/is-checked|checked|is-active|active|selected/i.test(t.className)) return true;
          if (t.querySelector('[class*="is-checked"], [class*="checked"], [class*="active"], [class*="selected"]')) return true;
          return null; // 看不出来
        };
        const notes = [];
        // 角色一栏（.el-checkbox-group）是弹窗打开后异步加载的，等它渲染出来再勾。
        await h.waitFor(() => [...dlg.querySelectorAll(".el-checkbox")].some((x) => norm(h.textOf(x)) === "app管理员"), 6000);
        const radio = findText("开发者级");
        if (radio && state(radio) !== true) radio.click();
        const cb = findText("app管理员");
        if (!cb) {
          const roleLabel = [...dlg.querySelectorAll("*")].find((el) => el.children.length <= 2 && /^角色/.test(h.textOf(el)));
          const box = roleLabel ? (roleLabel.closest(".el-form-item") || roleLabel.parentElement) : null;
          const opts = box ? [...box.querySelectorAll("*")].filter((el) => !el.children.length && h.textOf(el) && h.textOf(el).length <= 8 && !/^角色/.test(h.textOf(el))).map((el) => h.textOf(el)) : [];
          notes.push("没找到「APP管理员」角色，请在弹窗里手动勾上" + (opts.length ? "（看到的选项：" + [...new Set(opts)].join("、") + "）" : ""));
        } else {
          const before = state(cb);
          if (before !== true) { cb.click(); await h.wait(150); }
          const after = state(cb);
          if (after === false) { const inp = cb.querySelector("input"); if (inp) { inp.click(); await h.wait(100); } }
          if (state(cb) !== true) notes.push("已点「APP管理员」，请在弹窗里确认它勾上了");
        }
        const ok = h.byText("button", /^确认$/, dlg);
        if (!ok) throw new Error("弹窗里没找到「确认」按钮。");
        h.highlight(ok);
        return (notes.length ? "⚠️ " + notes.join("；") + "。然后" : "已填好：名称 apkgo、类型「开发者级」、角色「APP管理员」。请核对后") + "点绿框里的「确认」，剩下的交给我：抓到下载的 JSON 就自动保存并验证。";
      },
    },
  },
  {
    id: "xiaomi", verified: true, cn: "小米", product: "小米开放平台",
    hostRe: /(^|\.)dev\.(mi|xiaomi)\.com$/,
    // 2026-09 实登核对：管理中心 → 应用服务 → 自动发布接口
    console: "https://dev.mi.com/xiaomihyperos/console/app-services/auto-publish-api",
    noManual: true,
    hideWizardFields: true,
    prereq: [
      "请用主账号；团队子账号可能没有「自动发布」入口",
      "私钥每次「重置」都会变，重置后要重新采集",
      "公钥由助手内置，无需下载上传",
    ],
    doneBtnText: "重置私钥并重新保存",
    doneHint: "小米仅支持一把私钥；重置后旧私钥失效，点击上方按钮将自动在后台重置并同步至配置平台。",
    wizardHint: "全自动流程：扩展会自动调取开发者邮箱并提取私钥（未生成时自动生成），直接保存并验证。",
    progressOrder: ["goto", "filling", "saving", "done"],
    progressLabels: {
      filling: "自动获取邮箱与私钥",
      saving: "保存到配置平台并验证",
    },
    steps: [
      { t: "登录小米开放平台 → 管理中心", d: "用主账号。" },
      { t: "左侧菜单「应用服务 → 自动发布接口」", d: "直达接口配置页面。", action: "goto" },
      { t: "获取邮箱与私钥，保存并验证", d: "扩展会自动从后台调取开发者邮箱并提取私钥。", action: "fetch-key" },
    ],
    fields: [
      { key: "userName", label: "开发者账号邮箱", kind: "text", hints: [/邮箱|e-?mail|账号/i], pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, required: true },
      { key: "privateKey", label: "私钥", kind: "secret", hints: [/私钥|private\s*key|password|密码/i], pattern: /^[A-Za-z0-9+/=_-]{16,}$/, required: true },
    ],
    preload: async () => {
      try {
        const phMatch = document.cookie.match(/mideveloper_ph=([^;]+)/);
        const uidMatch = document.cookie.match(/\buserId=([^;]+)/);
        if (!phMatch || !uidMatch) return null;
        const url = `/pltapi/uiue/user?edit=1&mideveloper_ph=${encodeURIComponent(phMatch[1])}&userId=${encodeURIComponent(uidMatch[1])}`;
        const r = await fetch(url, { credentials: "include" });
        if (!r.ok) return null;
        const d = await r.json();
        const email = d && d.data && d.data.email;
        if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { userName: email };
      } catch { /* ignore */ }
      return null;
    },
    detect: async (h) => {
      const out = {};
      try {
        const phMatch = document.cookie.match(/mideveloper_ph=([^;]+)/);
        const uidMatch = document.cookie.match(/\buserId=([^;]+)/);
        if (phMatch && uidMatch) {
          const url = `/pltapi/uiue/user?edit=1&mideveloper_ph=${encodeURIComponent(phMatch[1])}&userId=${encodeURIComponent(uidMatch[1])}`;
          const r = await fetch(url, { credentials: "include" });
          if (r.ok) {
            const d = await r.json();
            if (d && d.data && d.data.email) out.userName = d.data.email;
          }
        }
      } catch { /* ignore */ }

      for (const doc of h.docs()) {
        const text = (doc.body && doc.body.innerText) || "";
        const matches = text.match(/\b[a-zA-Z0-9]{40,64}\b/g) || [];
        for (const m of matches) {
          if (!/已生成|mideveloper|openplatform/i.test(m)) { out.privateKey = m; break; }
        }
        if (out.privateKey) break;
      }
      return out;
    },
    isLoggedIn: async (h) => {
      if (/login|account\.xiaomi\.com/i.test(location.href)) return false;
      const phMatch = document.cookie.match(/mideveloper_ph=([^;]+)/);
      const uidMatch = document.cookie.match(/\buserId=([^;]+)/);
      if (!phMatch || !uidMatch) {
        for (const doc of h.docs()) {
          const hasLogin = [...doc.querySelectorAll("a, button, span")].some((el) => /^登录$/.test(h.textOf(el).trim()) && el.getClientRects().length);
          const hasUser = doc.querySelector(".user-name, .user-info, [class*='avatar'], .logout");
          if (hasLogin && !hasUser) return false;
        }
      }
      return true;
    },
    flow: ["fetch-key"],
    actions: {
      "fetch-key": async (h) => {
        // 1. 登录检查与调取邮箱
        const phMatch = document.cookie.match(/mideveloper_ph=([^;]+)/);
        const uidMatch = document.cookie.match(/\buserId=([^;]+)/);
        if (/login|account\.xiaomi\.com/i.test(location.href) || (!phMatch && !uidMatch && !h.draft.config.userName)) {
          throw new Error("检测到您尚未登录小米开放平台，请先登录开发者账号后再获取密钥。");
        }
        if (!h.draft.config.userName) {
          try {
            if (phMatch && uidMatch) {
              const url = `/pltapi/uiue/user?edit=1&mideveloper_ph=${encodeURIComponent(phMatch[1])}&userId=${encodeURIComponent(uidMatch[1])}`;
              const r = await fetch(url, { credentials: "include" });
              if (r.ok) {
                const d = await r.json();
                if (d && d.data && d.data.email) h.draft.config.userName = d.data.email;
              }
            }
          } catch { /* ignore */ }
        }
        if (!h.draft.config.userName) {
          throw new Error("未能自动获取到开发者邮箱，请确认已登录小米开放平台。");
        }

        // 2. 查找页面上的私钥
        // 只读「获取私钥」区块里那个展示私钥的 span，不扫整页——整页扫描会把
        // 浏览器注入串或占位文案误当私钥。span 里出现的可能是占位文案，过滤掉。
        const KEY_PLACEHOLDER = /未生成|已生成私钥数据|私钥生成中|请/;
        const readShownKey = () => {
          for (const doc of h.docs()) {
            const el = doc.querySelector('[class*="buttonGroup"] [class*="download_button"] span');
            const v = el ? (el.innerText || el.textContent || "").trim() : "";
            if (/^[A-Za-z0-9]{16,}$/.test(v) && !KEY_PLACEHOLDER.test(v)) return v;
          }
          return "";
        };

        const before = readShownKey();
        let key = before;

        // 重置，或页面上还没显示私钥时，自动点「获取私钥/重置私钥」并确认，等出现新私钥。
        // 按钮文案随小米改版：无私钥是「获取私钥」，已有私钥是「重置私钥」；重置弹窗确认是「确认重置」。
        if (h.isReset || !key) {
          const btn = h.byText("button, a", /^(获取私钥|重置私钥|生成私钥)$/) ||
                      h.byText("button, a", /获取私钥|重置私钥|生成私钥/);
          if (btn) {
            btn.click();
            await h.wait(400);
            for (const doc of h.docs()) {
              const confirmBtn = [...doc.querySelectorAll(".el-dialog button, .el-message-box button, .ant-modal button, button")]
                .find((b) => /^(确定|确认|确认重置)$/.test(h.textOf(b).trim()) && b.getClientRects().length);
              if (confirmBtn) { confirmBtn.click(); break; }
            }
            // 必须等到与旧值不同的新私钥才算数；等不到就置空并报错，绝不回退旧值提交。
            key = (await h.waitFor(() => { const k = readShownKey(); return k && k !== before ? k : null; }, 8000)) || "";
          }
        }

        if (!key) {
          const btn = h.byText("button, a", /^(获取私钥|重置私钥|生成私钥)$/) || h.byText("button, a", /获取私钥|重置私钥|生成私钥/);
          if (btn) h.highlight(btn);
          const btnName = btn ? h.textOf(btn).trim() : "获取私钥";
          throw new Error(`未能自动提取到私钥。请在页面上点击绿框高亮的「${btnName}」并确认，等私钥显示出来后再点「一键获取密钥」。`);
        }

        h.draft.config.privateKey = key;
        return `已自动获取邮箱（${h.draft.config.userName}）与私钥！正在保存并验证…`;
      },
    },
    // 配置平台的小米凭证还要公钥；公钥全局固定，直接带上。
    finalize(config) { return { userName: config.userName, privateKey: config.privateKey, publicKey: XIAOMI_PUBLIC_KEY }; },
  },
  {
    id: "oppo", verified: true, cn: "OPPO", product: "OPPO 开放平台",
    hostRe: /(^|\.)open\.oppomobile\.com$/,
    console: "https://open.oppomobile.com/new/ecological/app",
    noManual: true,
    hideWizardFields: true,
    progressOrder: ["goto", "filling", "saving", "done"],
    progressLabels: { filling: "自动获取 Client ID 与 Secret", saving: "保存到配置平台并验证" },
    wizardHint: "助手会直接通过官方接口获取或创建服务端应用，提取 Client ID 和 Secret，并自动保存与验证。",
    doneBtnText: "重新获取并保存",
    doneHint: "已自动保存并验证 OPPO 开放平台凭据。",
    prereq: [
      "请登录 OPPO 开放平台开发者账号（主账号或管理员）",
      "自动通过官方接口获取或新建服务端应用并提取 Client ID 和 Secret",
    ],
    steps: [
      { t: "登录 OPPO 开放平台", d: "用主账号或管理员账号。" },
      { t: "进入「生态应用」管理页", d: "https://open.oppomobile.com/new/ecological/app" },
      { t: "一键获取服务端应用密钥", d: "直接通过后台接口获取 Client ID 和 Secret，并保存到配置平台验证。" },
    ],
    fields: [
      { key: "clientId", label: "Client ID", kind: "text", hints: [/client[\s_-]*id/i, /客户端\s*ID/i], pattern: /^\d{4,}$/, required: true },
      { key: "clientSecret", label: "Client Secret", kind: "secret", hints: [/client[\s_-]*secret/i, /密钥|secret/i], pattern: /^[A-Za-z0-9]{16,}$/, required: true },
    ],
    detect: async () => {
      const out = {};
      try {
        const res = await fetch("https://open.oppomobile.com/myapi/server/app-list", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: "client_type=6&page=1&limit=20&service_id=",
          credentials: "include",
        });
        if (res.ok) {
          const d = await res.json();
          if (d && d.errno === 0 && d.data && Array.isArray(d.data.rows) && d.data.rows.length) {
            const target = d.data.rows.find((r) => /^apkgo/i.test(r.client_name)) || d.data.rows[0];
            if (target && target.client_id && target.client_secret) {
              out.clientId = String(target.client_id);
              out.clientSecret = String(target.client_secret);
              return out;
            }
          }
        }
      } catch { /* ignore */ }
      return out;
    },
    isLoggedIn: async (h) => {
      if (/login|passport|cas\./i.test(location.href)) return false;
      const ck = document.cookie || "";
      if (ck.includes("isLogin=0")) return false;
      if (ck.includes("isLogin=1") || ck.includes("OPENPLATLOGIN=1") || ck.includes("OPPOSID=")) return true;
      for (const doc of h.docs()) {
        if (doc.querySelector("#login_form, .login-container, form[action*='login']")) return false;
        const hasLogin = [...doc.querySelectorAll("a, button, span")].some((el) => /^登录$/.test(h.textOf(el).trim()) && el.getClientRects().length);
        const hasUser = doc.querySelector(".user-name, .user-info, [class*='avatar'], .header-user, .store-user, .logout");
        if (hasLogin && !hasUser) return false;
      }
      return true;
    },
    flow: ["fetch-key"],
    actions: {
      "fetch-key": async (h) => {
        if (/login|passport|cas\./i.test(location.href) || (document.cookie && document.cookie.includes("isLogin=0"))) {
          throw new Error("检测到您尚未登录 OPPO 开放平台，请先登录开发者账号后再获取密钥。");
        }

        // 直接通过官方接口获取服务端应用列表
        const listServerApps = async () => {
          try {
            const res = await fetch("https://open.oppomobile.com/myapi/server/app-list", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
              body: "client_type=6&page=1&limit=20&service_id=",
              credentials: "include",
            });
            if (res.ok) {
              const d = await res.json();
              if (d && d.errno === 0 && d.data && Array.isArray(d.data.rows)) {
                return d.data.rows;
              }
            }
          } catch { /* ignore */ }
          return null;
        };

        const addServerApp = async (name) => {
          try {
            const res = await fetch("https://open.oppomobile.com/myapi/server/app-add", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
              body: `client_name=${encodeURIComponent(name)}&client_type=&id=`,
              credentials: "include",
            });
            if (res.ok) {
              const d = await res.json();
              return d && d.errno === 0;
            }
          } catch { /* ignore */ }
          return false;
        };

        let serverApps = await listServerApps();

        // 只要已存在服务端应用，直接使用现有应用，不重复创建
        if (serverApps && serverApps.length > 0) {
          const target = serverApps.find((r) => /^apkgo/i.test(r.client_name)) || serverApps[0];
          if (target && target.client_id && target.client_secret) {
            h.draft.config.clientId = String(target.client_id);
            h.draft.config.clientSecret = String(target.client_secret);
            return `已获取服务端应用「${target.client_name}」凭据！正在保存并验证…`;
          }
        }

        // 仅在完全没有服务端应用时，才通过接口自动创建一个应用
        if (serverApps && serverApps.length === 0) {
          const appName = "apkgo";
          const added = await addServerApp(appName);
          if (added) {
            await h.wait(500);
            serverApps = await listServerApps();
            const target = (serverApps && serverApps.find((r) => r.client_name === appName)) || (serverApps && serverApps[0]);
            if (target && target.client_id && target.client_secret) {
              h.draft.config.clientId = String(target.client_id);
              h.draft.config.clientSecret = String(target.client_secret);
              return `已自动创建应用「${target.client_name}」并获取凭据！正在保存并验证…`;
            }
          }
        }

        // 兜底（如本地离线测试环境，纯文本匹配，不做任何 UI 操作）
        for (const doc of h.docs()) {
          const text = (doc.body && doc.body.innerText) || "";
          const idMatch = text.match(/\b(\d{6,22})\b/);
          const secretMatch = text.match(/\b([a-fA-F0-9]{32,64})\b/);
          if (idMatch && secretMatch) {
            h.draft.config.clientId = idMatch[1];
            h.draft.config.clientSecret = secretMatch[1];
            return `已获取凭据！正在保存并验证…`;
          }
        }

        throw new Error("未能通过接口获取到 Client ID 与 Client Secret，请确认处于登录状态。");
      },
    },
  },
  {
    id: "vivo", verified: true, cn: "vivo", product: "vivo 开放平台",
    hostRe: /(^|\.)dev\.vivo\.com\.cn$/,
    console: "https://dev.vivo.com.cn/apiAccess/detail",
    noManual: true,
    hideWizardFields: true,
    progressOrder: ["goto", "filling", "saving", "done"],
    progressLabels: { filling: "自动获取 Access Key 与 Secret", saving: "保存到配置平台并验证" },
    wizardHint: "助手会自动通过官方接口获取 Access Key 和 Access Secret，并自动保存与验证。",
    doneBtnText: "重新获取并保存",
    doneHint: "已自动保存并验证 vivo 开放平台凭据。",
    prereq: [
      "请登录 vivo 开放平台开发者账号（主账号）",
      "自动通过官方后台接口获取 Access Key 和 Access Secret",
    ],
    steps: [
      { t: "登录 vivo 开放平台", d: "用主账号操作。" },
      { t: "进入 API 管理页面", d: "https://dev.vivo.com.cn/apiAccess/detail" },
      { t: "一键获取并保存凭据", d: "自动获取 Access Key 和 Access Secret 并保存到配置平台验证。" },
    ],
    fields: [
      { key: "accessKey", label: "Access Key", kind: "text", hints: [/access[\s_-]*key/i], pattern: /^[A-Za-z0-9]{8,}$/, required: true },
      { key: "accessSecret", label: "Access Secret", kind: "secret", hints: [/access[\s_-]*secret/i, /secret|密钥/i], pattern: /^[A-Za-z0-9]{16,}$/, required: true },
    ],
    detect: async () => {
      const out = {};
      try {
        const getCsrf = () => {
          const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
          return m ? m[1] : "";
        };
        const headers = { "Accept": "application/json, text/plain, */*" };
        const csrf = getCsrf();
        if (csrf) headers["csrftoken"] = csrf;
        const ts = Date.now();
        const reqId = `${ts}${Math.random().toString().slice(2, 13)}`;
        const res = await fetch(`https://dev.vivo.com.cn/webapi/access/detail?timestamp=${ts}&requestId=${reqId}`, {
          method: "GET",
          headers,
          credentials: "include",
        });
        if (res.ok) {
          const d = await res.json();
          if (d && d.code === 0 && d.data && d.data.accessKey && d.data.accessSecret) {
            out.accessKey = String(d.data.accessKey);
            out.accessSecret = String(d.data.accessSecret);
            return out;
          }
        }
      } catch { /* ignore */ }
      return out;
    },
    isLoggedIn: async (h) => {
      if (/passport|login/i.test(location.href)) return false;
      const ck = document.cookie || "";
      if (ck.includes("b_account_token") || ck.includes("b_account_username")) return true;
      for (const doc of h.docs()) {
        if (doc.querySelector("#login_form, .login-container, form[action*='login']")) return false;
        const hasLogin = [...doc.querySelectorAll("a, button, span")].some((el) => /^登录$/.test(h.textOf(el).trim()) && el.getClientRects().length);
        const hasUser = doc.querySelector(".user-name, .user-info, [class*='avatar'], .header-user, .store-user, .logout, .head-portrait");
        if (hasLogin && !hasUser) return false;
      }
      return true;
    },
    flow: ["fetch-key"],
    actions: {
      "fetch-key": async (h) => {
        if (/login|passport/i.test(location.href)) {
          throw new Error("检测到您尚未登录 vivo 开放平台，请先登录开发者账号后再获取密钥。");
        }

        const getCsrf = () => {
          const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
          return m ? m[1] : "";
        };

        const fetchDetail = async () => {
          try {
            const ts = Date.now();
            const reqId = `${ts}${Math.random().toString().slice(2, 13)}`;
            const headers = {
              "Accept": "application/json, text/plain, */*",
            };
            const csrf = getCsrf();
            if (csrf) headers["csrftoken"] = csrf;

            const res = await fetch(`https://dev.vivo.com.cn/webapi/access/detail?timestamp=${ts}&requestId=${reqId}`, {
              method: "GET",
              headers,
              credentials: "include",
            });
            if (res.ok) {
              const d = await res.json();
              if (d && d.code === 0 && d.data && d.data.accessKey && d.data.accessSecret) {
                return d.data;
              }
            }
          } catch { /* ignore */ }
          return null;
        };

        const detail = await fetchDetail();
        if (detail && detail.accessKey && detail.accessSecret) {
          h.draft.config.accessKey = String(detail.accessKey);
          h.draft.config.accessSecret = String(detail.accessSecret);
          return `已成功获取 vivo API 凭据（Access Key: ${detail.accessKey}）！正在保存并验证…`;
        }

        // 离线/测试环境纯文本兜底（不进行任何脆弱的 UI 交互）
        for (const doc of h.docs()) {
          const text = (doc.body && doc.body.innerText) || "";
          const keyMatch = text.match(/20\d{6}[A-Za-z0-9]{6,20}/) || text.match(/\b([A-Za-z0-9]{12,24})\b/);
          const secMatch = text.match(/\b([a-fA-F0-9]{32})\b/);
          if (keyMatch && secMatch && keyMatch[1] !== secMatch[1]) {
            h.draft.config.accessKey = keyMatch[1] || keyMatch[0];
            h.draft.config.accessSecret = secMatch[1] || secMatch[0];
            return `已获取凭据！正在保存并验证…`;
          }
        }

        // 若接口未返回凭据，可能尚未开通 API 传包
        const targetUrl = "https://dev.vivo.com.cn/apiAccess/detail";
        if (!location.href.includes("/apiAccess/detail")) {
          location.href = targetUrl;
          throw new Error("未能获取到凭据，正在为您跳转到 API 管理页面。请在页面上点击「立即开通」签署协议，完成后再点击「一键获取密钥」。");
        }

        // 若已在 /apiAccess/detail 页面，尝试提示并高亮页面上的「立即开通」或签约按钮
        for (const doc of h.docs()) {
          const openBtn = [...doc.querySelectorAll("button, a, div, span")].find(
            (el) => /^(立即开通|开通|签署协议|去签约)$/.test(h.textOf(el).trim()) && el.getClientRects().length
          );
          if (openBtn) {
            h.highlight(openBtn);
            throw new Error("检测到您尚未开通 API 传包能力。请先点击页面上绿框标注的「立即开通」按钮签署协议，开通后再点击「一键获取密钥」。");
          }
        }

        throw new Error("未能获取到 Access Key 与 Access Secret，请确认处于登录状态并已在「API管理」中开通 API 传包能力。");
      },
    },
  },
  {
    id: "honor", verified: true, cn: "荣耀", product: "荣耀开发者服务平台",
    hostRe: /(^|\.)developer\.(honor|hihonor)\.com$/,
    console: "https://developer.honor.com/cn/manageCenter/certificate?cardRouteCode=E00069&~id=69",
    noManual: true,
    hideWizardFields: true,
    progressOrder: ["goto", "filling", "saving", "done"],
    progressLabels: { filling: "获取 Client ID 与 Secret", saving: "保存到配置平台并验证" },
    wizardHint: "助手会先取用凭据管理页里已有的 API 客户端凭证（Client ID 与 Secret），没有才新生成，然后自动保存与验证。",
    doneBtnText: "重新生成并保存",
    doneHint: "已保存并验证荣耀开发者服务平台凭据。点上方按钮会在后台新生成一对凭据。",
    prereq: [
      "请登录荣耀开发者服务平台开发者账号（管理员）",
      "优先取用后台已有的 API 密钥凭证，没有才通过官方后台接口新生成",
    ],
    steps: [
      { t: "登录荣耀开发者服务平台", d: "用管理员账号。" },
      { t: "进入凭据管理页面", d: "https://developer.honor.com/cn/manageCenter/certificate?cardRouteCode=E00069&~id=69" },
      { t: "一键获取凭证", d: "优先取用已有的 API 凭证，没有才新生成，提取 Client ID 和 Secret 保存到配置平台验证。" },
    ],
    fields: [
      { key: "clientId", label: "Client ID", kind: "text", hints: [/client[\s_-]*id/i, /客户端\s*ID/i], pattern: /^[A-Za-z0-9]{6,}$/, required: true },
      { key: "clientSecret", label: "Client Secret", kind: "secret", hints: [/client[\s_-]*secret/i, /密钥|secret/i], pattern: /^[A-Za-z0-9]{16,}$/, required: true },
    ],
    isLoggedIn: async (h) => {
      if (/login|cas\./i.test(location.href)) return false;
      const ck = document.cookie || "";
      if (ck.includes("HonorID_CAS_ISCASLOGIN=true") || ck.includes("cn_islogged=true") || ck.includes("developer_cn_islogged=true") || ck.includes("X-ACCESS-TOKEN=")) return true;
      for (const doc of h.docs()) {
        if (doc.querySelector("#login_form, .login-container, form[action*='login']")) return false;
        const hasLogin = [...doc.querySelectorAll("a, button, span")].some((el) => /^登录$/.test(h.textOf(el).trim()) && el.getClientRects().length);
        const hasUser = doc.querySelector(".user-name, .user-info, [class*='avatar'], .header-user, .store-user, .logout");
        if (hasLogin && !hasUser) return false;
      }
      return true;
    },
    flow: ["fetch-key"],
    actions: {
      "fetch-key": async (h) => {
        if (/login|cas\./i.test(location.href)) {
          throw new Error("检测到您尚未登录荣耀开发者服务平台，请先登录开发者账号后再获取密钥。");
        }

        const idOk = (x) => /^[A-Za-z0-9]{6,}$/.test(x);
        const secretOk = (x) => /^[A-Za-z0-9]{16,}$/.test(x);
        // 荣耀后台自己发的请求都带这个自定义头，跟着带上。
        const HDRS = { "Accept": "application/json, text/plain, */*", "terminal-lang": "cn" };

        // 步骤 1：获取 CSRF Token
        const getCsrfToken = async () => {
          try {
            const res = await fetch("https://developer.honor.com/portal/auth/csrf?withSite=true", {
              method: "GET",
              headers: HDRS,
              credentials: "include",
            });
            if (res.ok) {
              const d = await res.json();
              if (d && (d.code === "200" || d.code === 200) && d.data && d.data.csrfToken) {
                return d.data.csrfToken;
              }
            }
          } catch { /* ignore */ }
          return null;
        };

        // 步骤 2：生成/获取新的 API 凭据（客户端凭证类型为 2）
        const genAuth = async (csrfToken) => {
          try {
            const res = await fetch("https://developer.honor.com/portal/auth/genAuthenticate", {
              method: "POST",
              headers: { ...HDRS, "Content-Type": "application/json;charset=UTF-8", "developer-csrftoken": csrfToken },
              body: JSON.stringify({ type: 2 }),
              credentials: "include",
            });
            if (res.ok) {
              const d = await res.json();
              if (d && (d.code === "200" || d.code === 200) && d.data && d.data.clientId && d.data.clientSecret) {
                return d.data;
              }
            }
          } catch { /* ignore */ }
          return null;
        };

        // 列出后台已有的 API 密钥凭据（type 2，和 genAuthenticate 同一类）。
        // 返回里的 clientSecret 是掩码（一串 *），只有 id 能用来换明文，见 revealSecret。
        const listExisting = async (csrfToken) => {
          try {
            const res = await fetch("https://developer.honor.com/portal/auth/queryAuthenticate/2", {
              method: "GET",
              headers: { ...HDRS, "developer-csrftoken": csrfToken },
              credentials: "include",
            });
            const d = res.ok ? await res.json() : null;
            if (d && (d.code === "200" || d.code === 200) && Array.isArray(d.data)) return { list: d.data };
            return { list: [], error: d ? `${d.code} ${d.msg || ""}`.trim() : `HTTP ${res.status}` };
          } catch (e) {
            return { list: [], error: e.message || String(e) };
          }
        };

        // 换一条记录的明文 clientSecret：就是凭证页上「复制」按钮背后的接口
        // （2026-09-20 在真实后台核对）。拿不到就返回空，由调用方回退去新建。
        const revealSecret = async (csrfToken, id) => {
          try {
            const q = `?bizType=authenticate_clientSecret_info&id=${encodeURIComponent(id)}&fieldName=clientSecret&pageName=${encodeURIComponent("/cn/manageCenter/certificate")}`;
            const res = await fetch("https://developer.honor.com/portal/common/getOriginalData" + q, {
              method: "GET",
              headers: { ...HDRS, "developer-csrftoken": csrfToken },
              credentials: "include",
            });
            const d = res.ok ? await res.json() : null;
            if (d && (d.code === "200" || d.code === 200) && typeof d.data === "string" && secretOk(d.data)) return { secret: d.data };
            return { error: d ? `${d.code} ${d.msg || ""}`.trim() : `HTTP ${res.status}` };
          } catch (e) {
            return { error: e.message || String(e) };
          }
        };

        const csrf = await getCsrfToken();
        if (csrf) {
          // 步骤 2：先取用后台已有的凭据。genAuthenticate 是纯生成接口，每调一次后台就多
          // 一对凭据，用户只是来采集时没必要白生成一把。
          // 「重新生成并保存」是用户明确要换一把，这时跳过复用直接往下生成。
          if (!h.isReset) {
            const { list, error } = await listExisting(csrf);
            let why = error ? `查不到已有凭据（${error}）` : "";
            for (const rec of list) {
              if (!rec || !rec.id || !idOk(String(rec.clientId || ""))) continue;
              const got = await revealSecret(csrf, rec.id);
              if (!got.secret) { why = why || `明文取不回（${got.error}）`; continue; }
              h.draft.config.clientId = String(rec.clientId);
              h.draft.config.clientSecret = got.secret;
              return `已取用荣耀后台里现有的 API 凭据（Client ID: ${rec.clientId}）！正在保存并验证…`;
            }
            // 查不到列表、或明明有凭据却一条都取不回明文：停下来说清楚，不闷声新建一把。
            // 荣耀是每建一条就多一条，用户要的是复用，得让他自己决定要不要新建。
            // why 为空才说明后台确实一条凭据都没有，那种情况下新建是对的。
            if (why && !h.draft.honorRetried) {
              h.draft.honorRetried = true;
              throw new Error(`助手没能复用荣耀后台已有的 API 凭据：${why}。` +
                `再点一次「一键获取密钥」就新建一对（已有的保留不动）。`);
            }
          }

          // 步骤 3：后台没有可用的现成凭据（或用户已确认要新建），才生成一对。
          const auth = await genAuth(csrf);
          if (auth && auth.clientId && auth.clientSecret) {
            h.draft.config.clientId = String(auth.clientId);
            h.draft.config.clientSecret = String(auth.clientSecret);
            return `已新生成荣耀 API 凭据（Client ID: ${auth.clientId}）！正在保存并验证…`;
          }
        }

        // 兼容离线测试环境的静态文本匹配（纯被动读取，不做任何破坏性 DOM 操作）
        for (const doc of h.docs()) {
          const text = (doc.body && doc.body.innerText) || "";
          const idMatch = text.match(/\b([a-fA-F0-9]{32})\b/);
          const secMatch = text.match(/\b([A-Za-z0-9]{32})\b/);
          if (idMatch && secMatch && idMatch[1] !== secMatch[1]) {
            h.draft.config.clientId = idMatch[1];
            h.draft.config.clientSecret = secMatch[1];
            return `已获取凭据！正在保存并验证…`;
          }
        }

        throw new Error("未能通过接口生成 Client ID 与 Client Secret，请确认处于登录状态并在凭据管理页面中。");
      },
    },
  },
  {
    id: "qq", verified: true, cn: "应用宝", product: "腾讯开放平台",
    hostRe: /(^|\.)open\.qq\.com$/,
    // 「账号管理 → API发布接口」那一页：access_secret 就显示在这里（2026-09 截图核对）。
    console: "https://app.open.qq.com/p/developer/team_manage/apply_api",
    prereq: ["API 发布接口要先「申请开通」并等审核，通过后这一页才会显示 access_secret"],
    steps: [
      { t: "登录腾讯开放平台（应用宝）", d: "" },
      { t: "账号管理 → API发布接口", d: "没开通就先点「申请开通」，审核通过后再回来。", action: "goto" },
      { t: "读出 access_secret 和开发者 ID，保存", d: "助手从本页读 access_secret，开发者 ID 从登录信息里取。", action: "fetch-key" },
    ],
    progressOrder: ["goto", "filling", "saving", "done"],
    progressLabels: { filling: "读取 access_secret 与开发者 ID", saving: "保存到配置平台" },
    wizardHint: "在本页取 access_secret 和开发者 ID，然后直接保存到配置平台。应用宝暂不支持在线验证。",
    doneBtnText: "重新获取并保存",
    doneHint: "已保存应用宝凭据。",
    fields: [
      { key: "userId", label: "User ID（开发者 ID）", kind: "text", hints: [/user[\s_-]*id/i, /开发者\s*ID|用户\s*ID/i], pattern: /^\d{4,}$/, required: true, auto: true },
      { key: "accessSecret", label: "Access Secret", kind: "secret", hints: [/access[\s_-]*secret/i, /secret|密钥/i], pattern: /^[A-Za-z0-9]{16,}$/, required: true, auto: true },
    ],
    flow: ["fetch-key"],
    actions: {
      // 不写死接口地址：access_secret 直接从页面上读，开发者 ID 从登录信息 / 页面自己发过的
      // JSON 返回里按字段名取（见 src/content/sniff-main.js）。后台改版了也不容易坏。
      "fetch-key": async (h) => {
        // access_secret：首选调后台自己的接口。这一条是同源、只认 cookie、没有时间戳
        // 签名（和 p.open.qq.com 那组不同），所以扩展可以直接复用你的登录态。
        let secret = "";
        try {
          const res = await fetch("https://app.open.qq.com/api/xy/runtime/env/prod/manage/datasource/collection/request/open/apply_signature/apply_api/request", {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              "X-Requested-With": "XMLHttpRequest",
              "xy-env": "prod",
              "xy-mode": "runtime",
              "xy-project-id": "open",
              "xy-page-id": "apply_signature",
              "xy-page-path": "/developer/team_manage/apply_api",
            },
            body: "{}",
          });
          if (res.ok) {
            const j = await res.json();
            const s = h.deepFind(j, ["secret", "access_secret", "accessSecret"], (x) => /^[A-Za-z0-9]{16,}$/.test(x));
            if (s) secret = s;
          }
        } catch { /* 接口挪了就走下面的页面兜底 */ }

        // 兜底：从页面上读。先在「access_secret」这个标签附近找，再全页扫一个 32 位十六进制串。
        const label = secret ? null : h.byText("*", /^access_secret$/i);
        if (label) {
          let node = label;
          for (let i = 0; i < 4 && node && !secret; i++, node = node.parentElement) {
            for (const el of [...(node.parentElement ? node.parentElement.querySelectorAll("input, textarea") : [])]) {
              const v = (el.value || el.getAttribute("value") || el.placeholder || "").trim();
              if (/^[A-Za-z0-9]{16,}$/.test(v)) { secret = v; break; }
            }
          }
        }
        if (!secret) secret = h.scanText(/\b[0-9a-f]{32}\b/);
        if (!secret) secret = h.scanText(/\b[A-Za-z0-9]{24,64}\b/);
        if (!secret) {
          const apply = h.byText("button, a, span", /^\s*申请开通\s*$/);
          if (apply) { h.highlight(apply); throw new Error("这一页还没有 access_secret，多半是 API 发布接口还没开通。已高亮「申请开通」，审核通过后再回来点一次。"); }
          throw new Error("没在本页读到 access_secret。请确认停在「账号管理 → API发布接口」页，且接口已开通。");
        }
        h.draft.config.accessSecret = secret;

        // 开发者 ID：优先读本地存储（应用宝登录后写在 $loginInfo 里，页面一加载就有），
        // 读不到再退回页面自己发过的 JSON 返回。
        const digits = (s) => /^\d{4,}$/.test(s);
        let uid = "";
        for (const item of h.storage()) {
          if (!item.json) continue;
          uid = h.deepFind(item.json, ["userId", "user_id", "developerId", "uin"], digits);
          if (uid) break;
        }
        const entries = uid ? [] : await h.responses();
        for (const e of entries) {
          uid = h.deepFind(e.json, ["userId", "user_id", "developerId", "uin"], digits);
          if (uid) break;
        }
        if (!uid && !entries.length) {
          // 记录器要赶在页面自己的请求之前就位；刚装上/刚重载扩展时会是空的，刷新一次即可。
          if (await h.reloadAndResume("正在刷新页面，让助手赶在后台请求之前就位…")) return "正在刷新…";
        }
        if (!uid) {
          const keys = new Set();
          for (const e of entries) { const walk = (o, d) => { if (!o || typeof o !== "object" || d > 3) return; for (const [k, v] of Object.entries(o)) { keys.add(k); walk(v, d + 1); } }; walk(e.json, 0); }
          throw new Error("已读到 access_secret，但没从登录信息或后台返回里取到开发者 ID。请在下面的手动模式里填 User ID，再点「保存到配置平台并验证」" + (keys.size ? "（看到的字段：" + [...keys].slice(0, 25).join("、") + "）" : "") + "。");
        }
        h.draft.config.userId = uid;
        return "已读到 access_secret 和开发者 ID，正在保存…";
      },
    },
  },
];
