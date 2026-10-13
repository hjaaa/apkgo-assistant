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
  if (!keyId || !subAccount) return { error: "凭据文件无效，缺少 key_id / private_key / sub_account 字段" };
  if (!privateKey) return { error: "凭据文件缺少 private_key，请在华为创建表单先点击『生成公私钥』，再确认并下载 JSON" };
  return { config: { keyId: String(keyId), privateKey: String(privateKey), subAccount: String(subAccount), projectId: String(json.project_id || json.projectId || "") } };
}

// 同一文档中也可能重新进入创建表单，生成来源同时绑定表单节点。
const huaweiGeneratedPublicKeys = new WeakMap();

const APKGO_RECIPES = [
  {
    id: "huawei", verified: true, cn: "华为", product: "HarmonyOS 开发者中心",
    hostRe: /(^|\.)developer\.huawei\.com$/,
    console: "https://developer.huawei.com/consumer/cn/hdc-console/index.html#/home/101653523124950083",
    flowPages: [/^https:\/\/developer\.huawei\.com\/consumer\/cn\/hdc-console\/index\.html#\/home\/101653523124950083(?:\?[^#]*)?$/],
    prereq: ["需要有权限创建开发者级服务账号凭证的账号", "请在确认前核对当前华为账号与配置平台的保存主体"],
    steps: [
      { t: "进入「ID、证书和Profile → 凭证」，选择「开发者级凭证」", d: "配置平台需要开发者级服务账号凭证。", action: "goto" },
      { t: "在「服务账号凭证」区域创建，填名称并勾「APP管理员」", d: "助手会准备独立表单并生成公私钥，最终确认由你点击。", action: "open-create" },
      { t: "核对账号、主体和角色后点「确认」", d: "必须先生成公私钥，下载的 JSON 才包含私钥；未捕获时可手动选文件。" },
    ],
    fields: [
      { key: "serviceAccountJson", label: "服务账号 JSON 文件", kind: "file-text", accept: ".json,application/json", required: true, capture: { name: /\.json$/i, mime: /json/i } },
    ],
    validate(cfg) { return cfg.serviceAccountJson ? (parseHuaweiServiceAccount(cfg.serviceAccountJson).error || "") : ""; },
    finalize(config) { return parseHuaweiServiceAccount(config.serviceAccountJson).config; },
    wizardHint: "助手会进入开发者级服务账号表单、填好并生成公私钥。请核对账号与保存主体后亲自点「确认」，随后捕获 JSON 并保存验证。",
    progressLabels: { goto: "进入新版凭证页", filling: "填写服务账号表单并生成公私钥", confirm: "核对后点击页面上的「确认」" },
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
    flow: ["open-create"],
    actions: {
      "open-create": async (h) => {
        if (/login|id\d*\.cloud\.huawei\.com|portal\/loginAuth/i.test(location.href)) {
          throw new Error("检测到您尚未登录华为开发者账号，请先完成登录后再获取密钥。");
        }
        const getForm = () => h.byText("app-service-account-add", /创建服务账号凭证/);
        let form = getForm();
        if (!form) {
          const tab = await h.waitFor(() => h.byText('[role="tab"]', /^开发者级凭证$/), 10000);
          if (!tab) throw new Error("没找到「开发者级凭证」页签，请确认位于新版「凭证」页面。");
          if (tab.getAttribute("aria-selected") !== "true") tab.click();
          const create = await h.waitFor(() => {
            const selected = h.byText('[role="tab"]', /^开发者级凭证$/);
            if (!selected || selected.getAttribute("aria-selected") !== "true") return null;
            const title = h.byText("h1,h2,h3,h4,div,span", /^服务账号凭证$/);
            for (let section = title && title.parentElement; section && section.tagName.toLowerCase() !== "body"; section = section.parentElement) {
              const buttons = [...section.querySelectorAll("button")].filter((el) => /^创建$/.test(h.textOf(el)) && el.getClientRects().length);
              if (buttons.length > 1) throw new Error("服务账号区域有多个「创建」按钮，请手动进入服务账号创建表单。");
              if (buttons.length === 1) return buttons[0];
            }
            return null;
          }, 10000);
          if (!create) throw new Error("没找到开发者级「服务账号凭证」的创建按钮，请确认账号权限。");
          create.click();
          form = await h.waitFor(getForm, 10000);
          if (!form) throw new Error("没等到「创建服务账号凭证」表单，请手动进入后再试。");
        }
        // 新版自定义角色 label 没有 input，以 Ant 的 checked 标记读取实际状态。
        const checked = (el) => {
          if (!el) return null;
          const input = el.querySelector('input[type="checkbox"], input[type="radio"]');
          if (input) return input.checked;
          const aria = el.hasAttribute("aria-checked") ? el : el.querySelector("[aria-checked]");
          if (aria) { const value = aria.getAttribute("aria-checked"); return value === "true" ? true : value === "false" ? false : null; }
          const marker = el.querySelector(".ant-checkbox, .ant-radio");
          return marker ? (marker.classList.contains("ant-checkbox-checked") || marker.classList.contains("ant-radio-checked")) : null;
        };
        const level = h.byText('label,[role="radio"]', /^开发者级凭证\s*$/, form);
        if (checked(level) !== true) throw new Error("无法确认开发者级凭证，请返回「开发者级凭证」页签重新创建。");
        const admin = await h.waitFor(() => h.byText('label,[role="checkbox"]', /^APP管理员\s*$/, form), 10000);
        const roles = [...form.querySelectorAll('label.checkbox,[role="checkbox"]')];
        if (roles.some((el) => el !== admin && checked(el) !== false)) throw new Error("其他角色已选中或状态不可确认，请在表单中核对角色后再试。");
        if (checked(admin) === null) throw new Error("无法确认「APP管理员」角色的勾选状态，请手动核对。");
        if (!checked(admin)) {
          admin.click();
          if (!(await h.waitFor(() => checked(admin) === true, 10000))) throw new Error("未能勾选「APP管理员」，请手动核对。");
        }
        const name = form.querySelector('input[placeholder="请输入名称"]');
        const description = form.querySelector('input[placeholder="请输入描述"]');
        const publicKey = form.querySelector('textarea[placeholder="请输入公钥或点击下方按钮生成公私钥"]');
        if (!name || !description || !publicKey) throw new Error("服务账号表单字段发生变化，请手动填写或选取完整 JSON 文件。");
        if (!name.value.trim()) h.setInput(name, "apkgo");
        if (!description.value.trim()) h.setInput(description, "用于配置平台的华为渠道 API 调用");
        const verifyForm = () => {
          if (getForm() !== form || form.querySelector('textarea[placeholder="请输入公钥或点击下方按钮生成公私钥"]') !== publicKey) {
            throw new Error("服务账号表单已发生变化，请在当前表单重新准备。");
          }
        };
        const verifyRoles = () => {
          verifyForm();
          const currentLevel = h.byText('label,[role="radio"]', /^开发者级凭证\s*$/, form);
          const currentAdmin = h.byText('label,[role="checkbox"]', /^APP管理员\s*$/, form);
          const currentRoles = [...form.querySelectorAll('label.checkbox,[role="checkbox"]')];
          if (checked(currentLevel) !== true) throw new Error("开发者级凭证状态已变化，请重新核对级别。");
          if (checked(currentAdmin) !== true || currentRoles.some((el) => el !== currentAdmin && checked(el) !== false)) {
            throw new Error("角色在准备期间已变化或无法确认，请核对 APP管理员及其他角色后再试。");
          }
        };
        const knownPublicKey = () => {
          verifyForm();
          const generated = huaweiGeneratedPublicKeys.get(form.ownerDocument);
          const sameForm = generated && generated.form === form;
          const value = publicKey.value.trim();
          if ((sameForm && value !== generated.key) || (value && !sameForm)) {
            throw new Error("已有公钥的生成来源无法确认或公钥已被修改，请返回新建空白表单，或手动导入包含私钥的完整 JSON。");
          }
          return sameForm;
        };
        knownPublicKey();
        if (!(await h.ensureHook())) throw new Error("下载捕获尚未就绪，请重试；暂不生成公私钥。");
        // 等待期间表单仍能变化，必须重新读取，不能用等待前的公钥和角色快照。
        verifyRoles();
        if (!knownPublicKey()) {
          const generate = h.byText("button", /^生成公私钥$/, form);
          if (!generate) throw new Error("没找到「生成公私钥」按钮，请确认当前表单。");
          const wasReadOnly = publicKey.readOnly;
          try {
            publicKey.readOnly = true;
            generate.click();
            const key = await h.waitFor(() => getForm() === form && publicKey.value.trim(), 10000);
            if (!key) throw new Error("生成公私钥后未得到公钥，请核对页面提示，不要直接确认创建。");
            verifyForm();
            if (publicKey.value.trim() !== key) throw new Error("生成结果返回后公钥已变化，请重新核对公私钥。");
            huaweiGeneratedPublicKeys.set(form.ownerDocument, { form, key });
          } finally { publicKey.readOnly = wasReadOnly; }
        }
        verifyRoles();
        knownPublicKey();
        const ok = h.byText("button", /^确认$/, form);
        if (!ok) throw new Error("表单里没找到「确认」按钮。");
        h.highlight(ok);
        return "已准备开发者级服务账号、APP管理员角色与公私钥。请核对华为账号和保存主体后点击绿框里的「确认」，下载的 JSON 将自动保存并验证。";
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
        if (/login|account\.xiaomi\.com/i.test(location.href) || !phMatch || !uidMatch) {
          throw new Error("检测到您尚未登录小米开放平台，请先登录开发者账号后再获取密钥。");
        }
        // 草稿按渠道缓存，切换账号后必须重新读取邮箱，不能与当前私钥混用。
        let email = "";
        try {
          const url = `/pltapi/uiue/user?edit=1&mideveloper_ph=${encodeURIComponent(phMatch[1])}&userId=${encodeURIComponent(uidMatch[1])}`;
          const r = await fetch(url, { credentials: "include" });
          if (r.ok) {
            const d = await r.json();
            const value = d && d.data && d.data.email;
            if (typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) email = value;
          }
        } catch { /* 获取失败时由下方统一报错，不回退到草稿邮箱 */ }
        if (!email) {
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

        h.draft.config.userName = email;
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
