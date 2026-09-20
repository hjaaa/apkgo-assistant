# 扩展后端切换为配置平台 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「密钥助手」浏览器扩展的保存目标从 apkgo cloud 换成我们的配置平台（dream-product 的 `owner_open_platform_config`），并在平台前端的密钥配置弹窗接入「连接助手 / 助手采集」入口。

**Architecture:** 扩展采集侧（配方、面板、抓下载、页面接口直取）保留；新增 `src/platform.js` 作为唯一的配置平台客户端（token 保管、Bearer 请求、424 刷新重试），`background.js` 只做消息分发与 get→add/edit 编排；配方字段 key 直接改成 dream 各渠道 Config 类的属性名，配方即契约。平台前端新增 `keyAssistant.js` 封装 postMessage 协议，`SecretDialog.vue` 加状态条与按钮。后端不改。

**Tech Stack:** Chrome MV3 扩展（经典脚本，无构建）、Node 24 内置 `node --test` 做单测、Playwright 1.59 + Python 3 伪服务做 e2e；平台前端 Vue 2.6 + Vuex 3 + Element UI 2.15。

**Spec:** `docs/superpowers/specs/2026-09-20-dream-platform-backend-design.md`

## Global Constraints

- 扩展是 MV3、`minimum_chrome_version: 116`、全部为经典脚本（非 ES module），没有构建步骤；**不引入任何运行时依赖**。单测只用 Node 内置 `node:test`（本机 Node v24.18.0）。
- 配置平台地址固定 `http://192.168.1.18:16003`；本地联调保留 `http://localhost/*`。扩展调接口一律 `{origin}/api/...`。
- 鉴权：`Authorization: Bearer <access_token>`；刷新 `POST /api/auth/oauth2/token`，表单 `grant_type=refresh_token&scope=server&refresh_token=…`，头 `Authorization: Basic ZHJlYW06ZHJlYW0=`；424 = 过期需刷新，401 = 失效。
- 响应约定：HTTP 2xx 且 `body.code === 200` 才算成功，数据在 `body.data`；否则错误文案取 `body.msg`。
- 渠道值：`huawei` / `xiaomi` / `oppo` / `vivo` / `honor` / `qq`；`configInfo` 字段：huawei `keyId, privateKey, subAccount, projectId`；xiaomi `userName, privateKey, publicKey`；oppo/honor `clientId, clientSecret`；vivo `accessKey, accessSecret`；qq `userId, accessSecret`。
- 命名：扩展名「密钥助手」；用户可见文案里的 apkgo 一律改「配置平台」；**代码标识符不改**（`APKGO` 全局对象、`apkgo-assistant-*` 的 DOM id 与 postMessage `source`、动画名、zip 名、商店后台里创建的凭据名 `apkgo`）。
- 所有 commit message、注释、面向用户文案用简体中文；代码标识符用英文。
- 扩展仓库在分支 `feat/dream-platform-backend` 上工作；平台前端仓库 `~/workspace/front/new_configuration` 从 `master` 切 `feat/key-assistant`。
- 每个任务结束前跑一遍该任务列出的验证命令；e2e（Task 7）是整个扩展改动的最终门禁。

---

## 文件结构

| 文件 | 职责 | 本计划 |
| --- | --- | --- |
| `src/shared.js` | 各处共用常量与小工具（存储 key、平台链接、配方查找） | 修改 |
| `src/platform.js` | **新增**：配置平台客户端。配对记录读写、带 Bearer 的请求、424 刷新重试。扩展里发往平台的请求只在这里 | 新增 |
| `src/background.js` | service worker：消息分发；配对验证；get→add/edit 编排；开后台页；下载钩子 | 修改 |
| `src/content/bridge.js` | 平台网页 ↔ 扩展的 postMessage 桥 | 修改 |
| `src/content/console.js` | 商店后台上的面板：主体展示、采集、提交、文案 | 修改 |
| `src/recipes.js` | 六家配方；字段 key = dream 属性名；华为拆 JSON；小米内置公钥；应用宝单段 | 修改 |
| `src/popup/popup.html` `popup.js` | 工具栏弹窗 | 修改 |
| `manifest.json` `package.json` | 清单、版本、脚本 | 修改 |
| `test/unit/load.mjs` | **新增**：把经典脚本装进 vm 跑单测的加载器 + 假 chrome | 新增 |
| `test/unit/*.test.mjs` | **新增**：shared / platform / background / recipes 单测 | 新增 |
| `test/e2e/fake_platform.py` `run.mjs` `e2e.mjs` | 伪配置平台 + 用例 | 改名/修改 |
| `README.md` `PRIVACY.md` `CHANGELOG.md` | 文档 | 修改 |
| 前端 `src/utils/keyAssistant.js` | **新增**：与扩展的 postMessage 协议封装 | 新增 |
| 前端 `src/views/application/mainMap/components/SecretDialog.vue` | 密钥配置弹窗：状态条、连接助手、助手采集、回到前台刷新 | 修改 |

不动：`src/content/sniff-main.js`、`src/content/panel-style.js`、`scripts/build.py`（打包只收 `icons/`、`src/`、`manifest.json`、`LICENSE`，新文件 `src/platform.js` 自动进包，测试文件不进）、`.github/workflows/release.yml`、`store/`、前端 `SecretFormDialog.vue`、`api/productConfig.js`。

---

### Task 1: 单测基座 + shared.js

**Files:**
- Create: `test/unit/load.mjs`
- Create: `test/unit/shared.test.mjs`
- Modify: `src/shared.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `loadScripts(files, globals) → { ctx, get(expr) }`、`fakeChrome()`、`fakeStorageArea()`（后续所有单测用）
- Produces: `APKGO.DEFAULT_ORIGIN = "http://192.168.1.18:16003"`、`APKGO.KEY_OWNER(storeId) → "owner:<storeId>"`、`APKGO.platformSecretPage(owner, origin) → string`；删除 `APKGO.errorHint` 与 `recipeById` 的别名表

- [ ] **Step 1: 写单测加载器**

`test/unit/load.mjs`：

```js
// 把扩展的经典脚本（非 module）装进一个 vm 上下文里跑单测。
// 顶层 const 不会挂到 global 上，所以用 get(表达式) 取值。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

// 内存版 chrome.storage.local / session。data 直接暴露，方便断言。
export function fakeStorageArea() {
  const data = {};
  return {
    data,
    async get(keys) {
      const list = keys == null ? Object.keys(data) : Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const k of list) if (k in data) out[k] = data[k];
      return out;
    },
    async set(obj) { Object.assign(data, obj); },
    async remove(keys) { for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k]; },
    async clear() { for (const k of Object.keys(data)) delete data[k]; },
    async setAccessLevel() {},
  };
}

// 假 chrome：只实现扩展脚本加载与被测路径用到的部分。listeners 记录 addListener 注册的回调。
export function fakeChrome() {
  const listeners = {};
  const on = (name) => ({ addListener(fn) { (listeners[name] ||= []).push(fn); } });
  return {
    listeners,
    runtime: { getManifest: () => ({ version: "0.6.0-test" }), onMessage: on("runtime.onMessage"), lastError: null, sendMessage() {} },
    storage: { local: fakeStorageArea(), session: fakeStorageArea() },
    tabs: {
      onUpdated: on("tabs.onUpdated"), onActivated: on("tabs.onActivated"),
      created: [],
      async create(o) { this.created.push(o); return { id: 7, url: o.url }; },
      async sendMessage() { return { ok: true }; }, async get() { return {}; }, async query() { return []; },
    },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {}, setTitle() {} },
    downloads: { onCreated: on("downloads.onCreated") },
    scripting: { async executeScript() {} },
  };
}

// files：相对仓库根的脚本路径，按顺序执行；globals：注入上下文的全局对象（chrome、fetch…）。
export function loadScripts(files, globals = {}) {
  const ctx = vm.createContext({ console, URL, URLSearchParams, setTimeout, clearTimeout, ...globals });
  const run = (f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  // background.js 用 importScripts 引其他脚本，这里让它在同一个上下文里执行。
  ctx.importScripts = (...names) => names.forEach((n) => run("src/" + n));
  for (const f of files) run(f);
  return { ctx, get: (expr) => vm.runInContext(expr, ctx) };
}
```

- [ ] **Step 2: 写 shared.js 的失败测试**

`test/unit/shared.test.mjs`：

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadScripts, fakeChrome } from "./load.mjs";

const { get } = loadScripts(["src/recipes.js", "src/shared.js"], { chrome: fakeChrome() });
const APKGO = get("APKGO");

test("DEFAULT_ORIGIN 指向配置平台", () => {
  assert.equal(APKGO.DEFAULT_ORIGIN, "http://192.168.1.18:16003");
});

test("platformSecretPage：不带主体是主体页，带主体直接弹出该主体的密钥配置", () => {
  assert.equal(APKGO.platformSecretPage(""), "http://192.168.1.18:16003/#/application/mainMap");
  assert.equal(
    APKGO.platformSecretPage("安徽逐梦", "http://localhost:9090"),
    "http://localhost:9090/#/application/mainMap?owner=%E5%AE%89%E5%BE%BD%E9%80%90%E6%A2%A6&openSecret=1",
  );
});

test("KEY_OWNER 按商店分开", () => {
  assert.equal(APKGO.KEY_OWNER("oppo"), "owner:oppo");
});

test("recipeById 只认渠道值本身（大小写与空白归一），不再有别名", () => {
  assert.equal(APKGO.recipeById(" OPPO ").id, "oppo");
  assert.equal(APKGO.recipeById("harmony"), null);
  assert.equal(APKGO.recipeById(""), null);
});

test("errorHint 已删除（后端报错直接透传）", () => {
  assert.equal(APKGO.errorHint, undefined);
});
```

- [ ] **Step 3: 加 test 脚本并跑，确认失败**

`package.json` 的 `scripts` 改为：

```json
  "scripts": {
    "test": "node --test test/unit/*.test.mjs",
    "e2e": "node test/e2e/run.mjs",
    "build": "python3 scripts/build.py"
  },
```

同时把 `"version": "0.5.0"` 改为 `"version": "0.6.0"`。

Run: `npm test`
Expected: FAIL（`DEFAULT_ORIGIN` 仍是 apkgo 地址、`platformSecretPage` / `KEY_OWNER` 不是函数、`errorHint` 存在）

- [ ] **Step 4: 改 shared.js**

把 `src/shared.js` 整个换成：

```js
// 各处共用的小工具。经典脚本（非 module），后台用 importScripts 引入，
// 内容脚本和弹窗按顺序 <script> 引入，共享一个全局作用域。
/* global APKGO_RECIPES */

const APKGO = {
  VERSION: chrome.runtime.getManifest().version,
  // 配置平台地址。bridge 只注入在 manifest 列出的地址上，配对时以页面 origin 为准。
  DEFAULT_ORIGIN: "http://192.168.1.18:16003",
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
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test`
Expected: 5 个用例 PASS

- [ ] **Step 6: 提交**

```bash
git add test/unit/load.mjs test/unit/shared.test.mjs src/shared.js package.json
git commit -m "test: 加 node --test 单测基座；shared.js 换配置平台地址与主体 key"
```

---

### Task 2: 配置平台客户端 `src/platform.js`

**Files:**
- Create: `src/platform.js`
- Create: `test/unit/platform.test.mjs`

**Interfaces:**
- Consumes: `APKGO.KEY_PAIRED`（Task 1）
- Produces: 全局 `APKGO_PLATFORM = { getPaired(), setPaired(p), clearPaired(), publicPaired(p), request(path, init?) , refresh(p) }`
  - 配对记录 `p = { origin, accessToken, refreshToken, userName, pairedAt }`
  - `publicPaired(p) → { origin, userName, pairedAt } | null`（不带 token）
  - `request(path, init)`：`path` 不含 `/api` 前缀；返回 `{ ok: true, status, data }` 或 `{ ok: false, status, error }`；未配对 `status: 0`；失效 `status: 401` 且已清配对

- [ ] **Step 1: 写失败测试**

`test/unit/platform.test.mjs`：

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadScripts, fakeChrome } from "./load.mjs";

const ORIGIN = "http://platform.test";
const PAIRED = { origin: ORIGIN, accessToken: "at-1", refreshToken: "rt-1", userName: "张三", pairedAt: 1 };

// 每个用例一份新上下文：队列式的 fetch 桩，按调用顺序吐响应，并记录每次请求。
function setup(responses) {
  const calls = [];
  const chrome = fakeChrome();
  const mk = (status, body) => ({ status, ok: status >= 200 && status < 300, async json() { if (body === undefined) throw new Error("no json"); return body; } });
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch " + url);
    if (next.throw) throw new Error(next.throw);
    return mk(next.status, next.body);
  };
  const { get } = loadScripts(["src/recipes.js", "src/shared.js", "src/platform.js"], { chrome, fetch });
  return { calls, chrome, P: get("APKGO_PLATFORM") };
}

test("未配对：不发请求，提示去连接", async () => {
  const { calls, P } = setup([]);
  const r = await P.request("/x");
  assert.equal(r.ok, false); assert.equal(r.status, 0); assert.equal(calls.length, 0); assert.match(r.error, /连接助手/);
});

test("publicPaired 不带 token", () => {
  const { P } = setup([]);
  assert.deepEqual(P.publicPaired(PAIRED), { origin: ORIGIN, userName: "张三", pairedAt: 1 });
  assert.equal(P.publicPaired(null), null);
});

test("成功：拼 /api 前缀、带 Bearer、取 body.data", async () => {
  const { calls, chrome, P } = setup([{ status: 200, body: { code: 200, msg: "success", data: { id: 3 } } }]);
  await chrome.storage.local.set({ paired: PAIRED });
  const r = await P.request("/product/owner-open-platform-config/get?owner=a&channel=oppo");
  assert.deepEqual(r, { ok: true, status: 200, data: { id: 3 } });
  assert.equal(calls[0].url, ORIGIN + "/api/product/owner-open-platform-config/get?owner=a&channel=oppo");
  assert.equal(calls[0].init.headers.Authorization, "Bearer at-1");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
});

test("data 为 null 时 ok 且 data 为 null（/get 查不到）", async () => {
  const { chrome, P } = setup([{ status: 200, body: { code: 200, msg: "success", data: null } }]);
  await chrome.storage.local.set({ paired: PAIRED });
  assert.deepEqual(await P.request("/x"), { ok: true, status: 200, data: null });
});

test("HTTP 200 但 code≠200：按失败处理，错误取 msg", async () => {
  const { chrome, P } = setup([{ status: 200, body: { code: 400, msg: "凭证验证未通过: x" } }]);
  await chrome.storage.local.set({ paired: PAIRED });
  const r = await P.request("/x", { method: "POST", body: "{}" });
  assert.equal(r.ok, false); assert.equal(r.error, "凭证验证未通过: x");
});

test("HTTP 400 带 msg：错误取 msg；无 JSON 时用 HTTP 状态", async () => {
  const { chrome, P } = setup([{ status: 400, body: { code: 400, msg: "该主体渠道的开放平台配置已存在!" } }, { status: 502 }]);
  await chrome.storage.local.set({ paired: PAIRED });
  const r = await P.request("/x");
  assert.equal(r.status, 400); assert.equal(r.error, "该主体渠道的开放平台配置已存在!");
  const r2 = await P.request("/x");
  assert.equal(r2.error, "HTTP 502");
});

test("网络错误：ok=false，status=0", async () => {
  const { chrome, P } = setup([{ throw: "Failed to fetch" }]);
  await chrome.storage.local.set({ paired: PAIRED });
  const r = await P.request("/x");
  assert.equal(r.status, 0); assert.match(r.error, /连不上/);
});

test("424：用 refresh_token 刷新后换新 token 重试一次，并把新 token 落盘", async () => {
  const { calls, chrome, P } = setup([
    { status: 424, body: { code: 424, msg: "token expired" } },
    { status: 200, body: { code: 200, data: { access_token: "at-2" } } },
    { status: 200, body: { code: 200, data: "done" } },
  ]);
  await chrome.storage.local.set({ paired: PAIRED });
  const r = await P.request("/x");
  assert.equal(r.ok, true); assert.equal(r.data, "done");
  assert.equal(calls[1].url, ORIGIN + "/api/auth/oauth2/token");
  assert.equal(calls[1].init.method, "POST");
  assert.equal(calls[1].init.headers.Authorization, "Basic ZHJlYW06ZHJlYW0=");
  assert.equal(calls[1].init.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(calls[1].init.body, "grant_type=refresh_token&scope=server&refresh_token=rt-1");
  assert.equal(calls[2].init.headers.Authorization, "Bearer at-2");
  assert.equal(chrome.storage.local.data.paired.accessToken, "at-2");
  assert.equal(chrome.storage.local.data.paired.refreshToken, "rt-1");
});

test("刷新响应带新 refresh_token 时一并落盘", async () => {
  const { chrome, P } = setup([
    { status: 424, body: {} },
    { status: 200, body: { code: 200, data: { access_token: "at-2", refresh_token: "rt-2" } } },
    { status: 200, body: { code: 200, data: 1 } },
  ]);
  await chrome.storage.local.set({ paired: PAIRED });
  await P.request("/x");
  assert.equal(chrome.storage.local.data.paired.refreshToken, "rt-2");
});

test("424 且刷新失败：清除配对，返回 401 提示重新连接", async () => {
  const { chrome, P } = setup([
    { status: 424, body: {} },
    { status: 401, body: { code: 401, msg: "invalid_grant" } },
  ]);
  await chrome.storage.local.set({ paired: PAIRED });
  const r = await P.request("/x");
  assert.equal(r.ok, false); assert.equal(r.status, 401); assert.match(r.error, /重新连接/);
  assert.equal(chrome.storage.local.data.paired, undefined);
});

test("刷新后重试仍 424：不再刷新，清除配对", async () => {
  const { calls, chrome, P } = setup([
    { status: 424, body: {} },
    { status: 200, body: { code: 200, data: { access_token: "at-2" } } },
    { status: 424, body: {} },
  ]);
  await chrome.storage.local.set({ paired: PAIRED });
  const r = await P.request("/x");
  assert.equal(r.status, 401); assert.equal(calls.length, 3); assert.equal(chrome.storage.local.data.paired, undefined);
});

test("401：直接清除配对", async () => {
  const { chrome, P } = setup([{ status: 401, body: { code: 401 } }]);
  await chrome.storage.local.set({ paired: PAIRED });
  const r = await P.request("/x");
  assert.equal(r.status, 401); assert.equal(chrome.storage.local.data.paired, undefined);
});

test("并发两个 424：只刷新一次", async () => {
  const { calls, chrome, P } = setup([
    { status: 424, body: {} }, { status: 424, body: {} },
    { status: 200, body: { code: 200, data: { access_token: "at-2" } } },
    { status: 200, body: { code: 200, data: 1 } }, { status: 200, body: { code: 200, data: 2 } },
  ]);
  await chrome.storage.local.set({ paired: PAIRED });
  const [a, b] = await Promise.all([P.request("/a"), P.request("/b")]);
  assert.equal(a.ok && b.ok, true);
  assert.equal(calls.filter((c) => c.url.endsWith("/oauth2/token")).length, 1);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: platform 用例全部 FAIL（`src/platform.js` 不存在，`ENOENT`）

- [ ] **Step 3: 写 platform.js**

`src/platform.js`：

```js
// 配置平台客户端：保管配对信息（平台 origin + 用户 token），替后台发带 Bearer 的请求，
// 424 时用 refresh_token 续一次再重试。经典脚本，后台用 importScripts 引入。
// 扩展里所有发往配置平台的请求都在这一个文件里，而且只会发往配对时记下的 origin。
/* global APKGO */
const APKGO_PLATFORM = (() => {
  // 与配置平台前端登录 / 刷新用的是同一个 OAuth2 客户端（dream:dream）。
  const CLIENT_BASIC = "Basic ZHJlYW06ZHJlYW0=";
  const NOT_PAIRED = "还没连接配置平台，请在配置平台的「密钥配置」弹窗点「连接助手」";
  const EXPIRED = "连接已失效，请回配置平台的「密钥配置」弹窗重新连接";
  let refreshing = null; // 单飞：并发撞上 424 时共用同一次刷新

  async function getPaired() {
    const { [APKGO.KEY_PAIRED]: p } = await chrome.storage.local.get(APKGO.KEY_PAIRED);
    return p || null;
  }
  async function setPaired(p) { await chrome.storage.local.set({ [APKGO.KEY_PAIRED]: p }); }
  async function clearPaired() { await chrome.storage.local.remove(APKGO.KEY_PAIRED); }
  // 给内容脚本 / 弹窗看的配对信息：不带 token。
  function publicPaired(p) {
    return p ? { origin: p.origin, userName: p.userName || "", pairedAt: p.pairedAt } : null;
  }

  // 用 refresh_token 换新的 access_token。成功返回更新后的配对记录（已落盘），失败返回 null。
  function refresh(p) {
    if (!refreshing) {
      refreshing = (async () => {
        try {
          const res = await fetch(p.origin + "/api/auth/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: CLIENT_BASIC },
            body: new URLSearchParams({ grant_type: "refresh_token", scope: "server", refresh_token: p.refreshToken }).toString(),
          });
          let body = null;
          try { body = await res.json(); } catch { /* 非 JSON */ }
          const data = body && body.code === 200 ? body.data : null;
          if (!res.ok || !data || !data.access_token) return null;
          const next = { ...p, accessToken: data.access_token, refreshToken: data.refresh_token || p.refreshToken };
          await setPaired(next);
          return next;
        } catch {
          return null;
        } finally {
          refreshing = null;
        }
      })();
    }
    return refreshing;
  }

  // 调平台接口（path 不含 /api 前缀）。返回 { ok, status, data | error }。
  async function request(path, init = {}, retried = false) {
    const p = await getPaired();
    if (!p) return { ok: false, status: 0, error: NOT_PAIRED };
    let res;
    try {
      res = await fetch(p.origin + "/api" + path, {
        ...init,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + p.accessToken, ...(init.headers || {}) },
      });
    } catch (e) {
      return { ok: false, status: 0, error: "连不上 " + p.origin + "：" + (e.message || e) };
    }
    if (res.status === 424 && !retried) {
      if (await refresh(p)) return request(path, init, true);
      await clearPaired();
      return { ok: false, status: 401, error: EXPIRED };
    }
    if (res.status === 401 || res.status === 424) {
      await clearPaired();
      return { ok: false, status: 401, error: EXPIRED };
    }
    let body = null;
    try { body = await res.json(); } catch { /* 非 JSON */ }
    if (!res.ok || !body || body.code !== 200) {
      return { ok: false, status: res.status, error: (body && body.msg) || `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, data: body.data === undefined ? null : body.data };
  }

  return { getPaired, setPaired, clearPaired, publicPaired, request, refresh };
})();
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`
Expected: 全部 PASS（shared 5 个 + platform 13 个）

- [ ] **Step 5: 提交**

```bash
git add src/platform.js test/unit/platform.test.mjs
git commit -m "feat: 新增配置平台客户端 platform.js（Bearer 请求、424 刷新重试、401 清配对）"
```

---

### Task 3: background.js + bridge.js + manifest.json（换后端与配对协议）

**Files:**
- Modify: `src/background.js`
- Modify: `src/content/bridge.js`
- Modify: `manifest.json`
- Create: `test/unit/background.test.mjs`

**Interfaces:**
- Consumes: `APKGO_PLATFORM.*`（Task 2）、`APKGO.KEY_OWNER` / `KEY_PENDING` / `recipeById`（Task 1）
- Produces（runtime 消息，内容脚本 / 弹窗 / bridge 调用）：
  - `state → { ok, version, paired: { origin, userName, pairedAt } | null }`
  - `pair { accessToken, refreshToken, userName, origin } → { ok, paired } | { ok: false, error }`
  - `unpair → { ok }`
  - `submit { store, owner, config } → { ok, saved: { verified } } | { ok: false, status, error }`
  - `openConsole { store, owner?, url? } → { ok, tabId }`；会在 session 写 `pendingStore` 与 `owner:<store>`
  - `injectHook`、`openPanel` 不变
- Produces（bridge，网页侧协议）：页 → 扩 `hello` / `pair {accessToken, refreshToken, userName}` / `open-console {store, owner}`；扩 → 页 `ready {version, paired}` / `paired {paired}` / `error {message, action?}` / `open-console-ok {store}`

- [ ] **Step 1: 写失败测试**

`test/unit/background.test.mjs`：

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadScripts, fakeChrome } from "./load.mjs";

const ORIGIN = "http://platform.test";
const PAIRED = { origin: ORIGIN, accessToken: "at-1", refreshToken: "rt-1", userName: "张三", pairedAt: 1 };
const CFG = "/api/product/owner-open-platform-config";

// routes: [ [正则(匹配 path+query), (init) => ({ status, body }) ], ... ]；calls 记录所有请求
function setup(routes) {
  const calls = [];
  const chrome = fakeChrome();
  const fetch = async (url, init) => {
    const u = new URL(url); const key = u.pathname + u.search;
    calls.push({ key, init, method: (init && init.method) || "GET", json: init && init.body ? JSON.parse(init.body) : null });
    for (const [re, reply] of routes) if (re.test(key)) { const { status, body } = reply(init); return { status, ok: status < 300, async json() { return body; } }; }
    throw new Error("unrouted " + key);
  };
  loadScripts(["src/background.js"], { chrome, fetch });
  const listener = chrome.listeners["runtime.onMessage"][0];
  const call = (msg, sender = { url: ORIGIN + "/#/application/mainMap" }) => new Promise((resolve) => listener(msg, sender, resolve));
  return { calls, chrome, call };
}
const ok = (data) => () => ({ status: 200, body: { code: 200, msg: "success", data } });

test("state：只回公开的配对信息", async () => {
  const { chrome, call } = setup([]);
  await chrome.storage.local.set({ paired: PAIRED });
  const r = await call({ type: "state" });
  assert.deepEqual(r, { ok: true, version: "0.6.0-test", paired: { origin: ORIGIN, userName: "张三", pairedAt: 1 } });
});

test("pair：缺 token 或来源不一致都拒绝，不落盘", async () => {
  const { chrome, call } = setup([]);
  let r = await call({ type: "pair", accessToken: "", refreshToken: "rt", userName: "x", origin: ORIGIN });
  assert.equal(r.ok, false); assert.match(r.error, /登录令牌/);
  r = await call({ type: "pair", accessToken: "at", refreshToken: "rt", userName: "x", origin: ORIGIN }, { url: "http://evil.test/" });
  assert.equal(r.ok, false); assert.match(r.error, /来源/);
  assert.equal(chrome.storage.local.data.paired, undefined);
});

test("pair：用 token 调一次配置列表验证，成功后落盘并回公开信息", async () => {
  const { calls, chrome, call } = setup([[/\/list\?page=1&size=1$/, ok({ content: [], totalElements: 0 })]]);
  const r = await call({ type: "pair", accessToken: " at-1 ", refreshToken: "rt-1", userName: "张三", origin: ORIGIN + "/#/x" });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.paired).sort(), ["origin", "pairedAt", "userName"]);
  assert.equal(calls[0].key, CFG + "/list?page=1&size=1");
  assert.equal(calls[0].init.headers.Authorization, "Bearer at-1");
  assert.equal(chrome.storage.local.data.paired.origin, ORIGIN);
});

test("pair：验证失败则清除并报错", async () => {
  const { chrome, call } = setup([[/\/list/, () => ({ status: 401, body: { code: 401, msg: "invalid_token" } })]]);
  const r = await call({ type: "pair", accessToken: "bad", refreshToken: "rt", userName: "", origin: ORIGIN });
  assert.equal(r.ok, false); assert.match(r.error, /令牌验证失败/);
  assert.equal(chrome.storage.local.data.paired, undefined);
});

test("submit：未知商店 / 没有主体 都拒绝", async () => {
  const { call } = setup([]);
  assert.match((await call({ type: "submit", store: "meizu", owner: "a", config: {} })).error, /未知商店/);
  assert.match((await call({ type: "submit", store: "oppo", owner: "", config: {} })).error, /主体/);
});

test("submit：没有记录时 POST /add，验证过的渠道 verified=true", async () => {
  const { calls, chrome, call } = setup([[/\/get\?/, ok(null)], [/\/add$/, ok(true)]]);
  await chrome.storage.local.set({ paired: PAIRED });
  const r = await call({ type: "submit", store: "oppo", owner: "安徽逐梦", config: { clientId: "1", clientSecret: "s" } });
  assert.deepEqual(r, { ok: true, saved: { verified: true } });
  assert.equal(calls[0].key, CFG + "/get?owner=%E5%AE%89%E5%BE%BD%E9%80%90%E6%A2%A6&channel=oppo");
  assert.equal(calls[1].method, "POST");
  assert.deepEqual(calls[1].json, { owner: "安徽逐梦", channel: "oppo", configInfo: { clientId: "1", clientSecret: "s" } });
});

test("submit：已有记录时 PUT /edit 带 id", async () => {
  const { calls, chrome, call } = setup([[/\/get\?/, ok({ id: 9, owner: "a", channel: "vivo", configInfo: "{}" })], [/\/edit$/, ok(true)]]);
  await chrome.storage.local.set({ paired: PAIRED });
  const r = await call({ type: "submit", store: "vivo", owner: "a", config: { accessKey: "k", accessSecret: "s" } });
  assert.equal(r.ok, true);
  assert.equal(calls[1].method, "PUT");
  assert.deepEqual(calls[1].json, { id: 9, owner: "a", channel: "vivo", configInfo: { accessKey: "k", accessSecret: "s" } });
});

test("submit：后端报错原样透传", async () => {
  const { chrome, call } = setup([[/\/get\?/, ok(null)], [/\/add$/, () => ({ status: 400, body: { code: 400, msg: "凭证验证未通过: token: [10001]" } })]]);
  await chrome.storage.local.set({ paired: PAIRED });
  const r = await call({ type: "submit", store: "honor", owner: "a", config: { clientId: "1", clientSecret: "s" } });
  assert.equal(r.ok, false); assert.equal(r.status, 400); assert.equal(r.error, "凭证验证未通过: token: [10001]");
});

test("submit：应用宝渠道 verified=false（后端不验活）", async () => {
  const { chrome, call } = setup([[/\/get\?/, ok(null)], [/\/add$/, ok(true)]]);
  await chrome.storage.local.set({ paired: PAIRED });
  const r = await call({ type: "submit", store: "qq", owner: "a", config: { userId: "1", accessSecret: "s" } });
  assert.deepEqual(r.saved, { verified: false });
});

test("openConsole：记下 pendingStore 与该商店的主体；不带主体时不写 owner", async () => {
  const { chrome, call } = setup([]);
  let r = await call({ type: "openConsole", store: "oppo", owner: " 安徽逐梦 " });
  assert.equal(r.ok, true);
  assert.equal(chrome.storage.session.data.pendingStore, "oppo");
  assert.equal(chrome.storage.session.data["owner:oppo"], "安徽逐梦");
  assert.equal(chrome.tabs.created[0].url, "https://open.oppomobile.com/new/ecological/app");
  await chrome.storage.session.clear();
  r = await call({ type: "openConsole", store: "vivo" });
  assert.equal(chrome.storage.session.data["owner:vivo"], undefined);
});
```

注意：`qq` 用例在 Task 5 把配方 id 从 `tencent` 改成 `qq` 之前会因「未知商店」失败，这是预期的；本任务先让其余用例通过，Task 5 完成后整套通过。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: background 用例 FAIL（现有 `pair` 要 `apkgo_` 密钥、`submit` 打 `/openapi/v1/credentials`）

- [ ] **Step 3: 改写 background.js**

把 `src/background.js` 从文件头到 `const handlers = {` 之前，以及 `handlers` 里的 `state` / `pair` / `unpair` / `apps` / `submit` / `openConsole` 五个 handler，换成下面这样（`injectHook`、`openPanel`、`chrome.runtime.onMessage` 监听、`updateBadge`、`downloadHook`、`chrome.downloads.onCreated` 原样保留）：

```js
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
    if (senderOrigin && senderOrigin !== o) return { ok: false, error: "配对来源和页面不一致" };
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
```

另外把 `updateBadge` 里的 `chrome.action.setTitle({ tabId, title: \`apkgo 助手 · ${on.cn}后台\` });` 改成 `title: \`密钥助手 · ${on.cn}后台\``。确认文件里已没有 `apkgoFetch`、`getPaired`、`publicPaired`、`hostGranted`、`apps` 这些旧函数（`getPaired` / `publicPaired` 现在都从 `APKGO_PLATFORM` 取）。

- [ ] **Step 4: 改 bridge.js**

`src/content/bridge.js` 的 `message` 监听改为：

```js
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
```

文件头注释里的「注入在 apkgo 网页上的桥」改成「注入在配置平台网页上的桥」。其余不动。

- [ ] **Step 5: 改 manifest.json**

整个换成：

```json
{
  "manifest_version": 3,
  "name": "密钥助手",
  "short_name": "密钥助手",
  "version": "0.6.0",
  "description": "在华为、小米、OPPO、vivo、荣耀、应用宝开发者后台里一键取回 API 密钥，直接保存到配置平台并在线验证。只连配置平台。",
  "minimum_chrome_version": "116",
  "icons": {
    "16": "icons/16.png",
    "32": "icons/32.png",
    "48": "icons/48.png",
    "128": "icons/128.png"
  },
  "action": {
    "default_title": "密钥助手",
    "default_popup": "src/popup/popup.html",
    "default_icon": {
      "16": "icons/16.png",
      "32": "icons/32.png"
    }
  },
  "background": {
    "service_worker": "src/background.js"
  },
  "permissions": [
    "storage",
    "scripting",
    "downloads"
  ],
  "host_permissions": [
    "https://developer.huawei.com/*",
    "https://dev.mi.com/*",
    "https://dev.xiaomi.com/*",
    "https://open.oppomobile.com/*",
    "https://dev.vivo.com.cn/*",
    "https://developer.honor.com/*",
    "https://developer.hihonor.com/*",
    "https://open.qq.com/*",
    "https://*.open.qq.com/*",
    "http://192.168.1.18:16003/*",
    "http://localhost/*"
  ],
  "content_scripts": [
    {
      "matches": [
        "https://developer.huawei.com/*",
        "https://dev.mi.com/*",
        "https://dev.xiaomi.com/*",
        "https://open.oppomobile.com/*",
        "https://dev.vivo.com.cn/*",
        "https://developer.honor.com/*",
        "https://developer.hihonor.com/*",
        "https://open.qq.com/*",
        "https://*.open.qq.com/*"
      ],
      "js": [
        "src/content/sniff-main.js"
      ],
      "run_at": "document_start",
      "world": "MAIN",
      "all_frames": false
    },
    {
      "matches": [
        "https://developer.huawei.com/*",
        "https://dev.mi.com/*",
        "https://dev.xiaomi.com/*",
        "https://open.oppomobile.com/*",
        "https://dev.vivo.com.cn/*",
        "https://developer.honor.com/*",
        "https://developer.hihonor.com/*",
        "https://open.qq.com/*",
        "https://*.open.qq.com/*"
      ],
      "js": [
        "src/recipes.js",
        "src/shared.js",
        "src/content/panel-style.js",
        "src/content/console.js"
      ],
      "run_at": "document_idle",
      "all_frames": false
    },
    {
      "matches": [
        "http://192.168.1.18:16003/*",
        "http://localhost/*"
      ],
      "js": [
        "src/content/bridge.js"
      ],
      "run_at": "document_idle",
      "all_frames": false
    }
  ]
}
```

- [ ] **Step 6: 验证**

Run: `npm test`
Expected: 除 `submit：应用宝渠道 verified=false` 一个用例外全部 PASS（该用例等 Task 5 改 id 后通过）

Run: `python3 -c "import json; json.load(open('manifest.json'))" && for f in $(find src -name '*.js'); do node --check "$f"; done && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 7: 提交**

```bash
git add src/background.js src/content/bridge.js manifest.json test/unit/background.test.mjs
git commit -m "feat: 后台与桥接换成配置平台：用户 token 配对、get→add/edit 保存、清单指向平台地址"
```

---

### Task 4: console.js 面板（主体上下文、提交、文案）

**Files:**
- Modify: `src/content/console.js`

**Interfaces:**
- Consumes: `APKGO.KEY_OWNER`、`APKGO.platformSecretPage`（Task 1）；runtime 消息 `state` / `submit { store, owner, config }`（Task 3）
- Produces: 面板在 `storage.session["owner:<store>"]` 有值且已配对时才允许「一键获取密钥」与「保存」

以下每条都是「精确替换」：旧串必须一字不差地存在于文件中（含缩进），替换后再进行下一条。

- [ ] **Step 1: 文件头注释与状态变量**

旧：
```js
// 拿下来（自动识别标签旁边的值，或者进入「点选」模式点一下）；点保存直接调
// apkgo 新建凭证并验证，结果就地显示。密钥草稿只放 storage.session。
```
新：
```js
// 拿下来（自动识别标签旁边的值，或者进入「点选」模式点一下）；点保存直接存到
// 配置平台（主体 + 渠道）并在线验证，结果就地显示。密钥草稿只放 storage.session。
```

旧：
```js
  const DRAFT_KEY = APKGO.KEY_DRAFT(recipe.id);
```
新：
```js
  const DRAFT_KEY = APKGO.KEY_DRAFT(recipe.id);
  const OWNER_KEY = APKGO.KEY_OWNER(recipe.id);
```

旧：
```js
  let draft = { label: "", config: {}, files: {}, appId: "" };
  let paired = null;
  let apps = [];
```
新：
```js
  let draft = { config: {}, files: {} };
  let paired = null;
  let owner = ""; // 从配置平台「助手采集」带过来的主体；没有就不能保存
```

- [ ] **Step 2: 启动按钮与气泡文案**

旧：
```js
  launch.title = `apkgo 助手 · ${recipe.cn}`;
  const launchSub = recipe.flow && recipe.flow.length ? "一键获取密钥" : (recipe.fields.length ? "采集密钥，直接保存到 apkgo" : "这一家的密钥怎么拿");
  launch.innerHTML = MARK + `<span class="lbl">apkgo 助手<small>${escLabel(recipe.cn)} · ${launchSub}</small></span><span class="dot"></span>`;
```
新：
```js
  launch.title = `密钥助手 · ${recipe.cn}`;
  const launchSub = recipe.flow && recipe.flow.length ? "一键获取密钥" : (recipe.fields.length ? "采集密钥，直接保存到配置平台" : "这一家的密钥怎么拿");
  launch.innerHTML = MARK + `<span class="lbl">密钥助手<small>${escLabel(recipe.cn)} · ${launchSub}</small></span><span class="dot"></span>`;
```

旧：`帮你找到并存进 apkgo 👇`　新：`帮你找到并存进配置平台 👇`

- [ ] **Step 3: render 里的连接行、主体行、表单与向导**

旧：
```js
    const connHtml = paired
      ? `<div class="conn"><span class="sdot"></span><span>已连接 apkgo · ${esc(paired.orgName)}</span></div>`
      : `<div class="conn off"><span class="sdot"></span><span>还没连接。去 <a href="${esc(APKGO.DEFAULT_ORIGIN)}/credentials/new?store=${recipe.id}" target="_blank" rel="noopener">apkgo 添加商店账号页</a> 点「连接助手」。</span></div>`;
```
新：
```js
    const connHtml = paired
      ? `<div class="conn"><span class="sdot"></span><span>已连接配置平台 · ${esc(paired.userName || paired.origin)}</span></div>`
      : `<div class="conn off"><span class="sdot"></span><span>还没连接。去 <a href="${esc(APKGO.platformSecretPage(""))}" target="_blank" rel="noopener">配置平台的「主体」页</a>，打开密钥配置弹窗点「连接助手」。</span></div>`;
    // 主体从配置平台「助手采集」带过来；没有就不能保存，免得存错主体。
    const ownerHtml = owner
      ? `<div class="conn" style="margin-top:6px"><span class="sdot"></span><span>将保存到主体：<b>${esc(owner)}</b></span></div>`
      : `<div class="conn off" style="margin-top:6px"><span class="sdot"></span><span>没有主体上下文。回配置平台的密钥配置弹窗点「助手采集」再过来。</span></div>`;
    const canSave = !!(paired && owner);
```

旧（表单里的备注名、关联应用、保存按钮、提示，共六行）：
```js
        fields.map((f) => fieldHtml(f)).join("") +
        (hasFlow ? "" : `<div class="field"><label>备注名（可选）</label><input class="in" data-k="__label" placeholder="默认「${esc(recipe.cn)}账号」，同一商店多个账号时区分" value="${esc(draft.label)}"></div>`) +
        (apps.length ? `<div class="field"><label>关联应用（可选，验证时会更严格）</label><select class="sel" data-k="__app"><option value="">不关联</option>${apps.map((a) => `<option value="${esc(a.id)}" ${draft.appId === a.id ? "selected" : ""}>${esc(a.name)} · ${esc(a.pkg)}</option>`).join("")}</select></div>` : "") +
        (result && !hasFlow ? `<div class="msg ${result.kind}">${result.html}</div>` : "") +
        `<div class="actions"><button class="btn acc" data-act="save" ${busy || !paired ? "disabled" : ""}>${busy ? "保存并验证中…" : "保存到 apkgo 并验证"}</button><button class="btn ghost" data-act="clear">清空</button></div>
        <div class="hint">保存时 apkgo 会连一次 ${esc(recipe.cn)}确认密钥可用。密钥加密保存，只在这台浏览器的会话里暂存。</div></div>`;
    } else {
      formHtml = `<div class="msg warn">这一家的密钥是文件形式，请按上面的步骤拿到文件后，回到 <a href="${esc((paired && paired.origin) || APKGO.DEFAULT_ORIGIN)}/credentials/new?store=${recipe.id}" target="_blank" rel="noopener">apkgo 添加页</a> 上传。</div>` +
```
新：
```js
        fields.map((f) => fieldHtml(f)).join("") +
        (result && !hasFlow ? `<div class="msg ${result.kind}">${result.html}</div>` : "") +
        `<div class="actions"><button class="btn acc" data-act="save" ${busy || !canSave ? "disabled" : ""}>${busy ? "保存并验证中…" : "保存到配置平台并验证"}</button><button class="btn ghost" data-act="clear">清空</button></div>
        <div class="hint">保存时配置平台会连一次 ${esc(recipe.cn)}确认密钥可用。密钥只在这台浏览器的会话里暂存，保存成功即清除。</div></div>`;
    } else {
      formHtml = `<div class="msg warn">这一家的密钥是文件形式，请按上面的步骤拿到文件后，回到 <a href="${esc(APKGO.platformSecretPage(owner, paired && paired.origin))}" target="_blank" rel="noopener">配置平台的密钥配置弹窗</a> 手动填写。</div>` +
```

旧（向导里的备注名与一键按钮）：
```js
        ${extraFieldsHtml}
        <div class="field"><label>备注名（可选）</label><input class="in" data-k="__label" placeholder="默认「${esc(recipe.cn)}账号」，同一商店多个账号时区分" value="${esc(draft.label)}" ${running ? "disabled" : ""}></div>
        <button class="btn acc" data-oneclick="1" ${running || !paired ? "disabled" : ""}>${running ? "进行中…" : stage === "done" ? doneText : "一键获取密钥"}</button>
```
新：
```js
        ${extraFieldsHtml}
        <button class="btn acc" data-oneclick="1" ${running || !canSave ? "disabled" : ""}>${running ? "进行中…" : stage === "done" ? doneText : "一键获取密钥"}</button>
```

旧（两处，全部替换）：`connHtml + '<div style="height:12px"></div>'`　新：`connHtml + ownerHtml + '<div style="height:12px"></div>'`

旧：`<div class="t">apkgo 助手<small>`　新：`<div class="t">密钥助手<small>`

旧：`saving: "保存到 apkgo 并验证", done: "完成" };`　新：`saving: "保存到配置平台并验证", done: "完成" };`

旧：`!f.auto && f.key !== "private_key");`　新：`!f.auto && f.key !== "privateKey");`

- [ ] **Step 4: 事件与草稿结构**

旧：`draft = { label: "", config: {}, files: {}, appId: draft.appId }; result = null;`　新：`draft = { config: {}, files: {} }; result = null;`

旧：
```js
    if (k === "__label") draft.label = e.target.value;
    else draft.config[k] = e.target.value;
```
新：
```js
    draft.config[k] = e.target.value;
```

删除这一整行：
```js
    if (e.target.dataset.k === "__app") { draft.appId = e.target.value; await saveDraft(); return; }
```

旧：`if (d) draft = { label: "", config: {}, files: {}, appId: "", ...d };`　新：`if (d) draft = { config: {}, files: {}, ...d };`

旧：`draft = { label: "", config: {}, files: {}, appId: "" };`（clearDraft 里）　新：`draft = { config: {}, files: {} };`

旧：
```js
  async function refreshState() {
    const st = await APKGO.send({ type: "state" });
    paired = st.ok ? st.paired : null;
    if (paired && !apps.length && recipe.fields.length) {
      const r = await APKGO.send({ type: "apps" });
      if (r.ok) apps = r.apps;
    }
    render();
  }
```
新：
```js
  async function refreshState() {
    const st = await APKGO.send({ type: "state" });
    paired = st.ok ? st.paired : null;
    try { ({ [OWNER_KEY]: owner = "" } = await chrome.storage.session.get(OWNER_KEY)); } catch { owner = ""; }
    render();
  }
```

- [ ] **Step 5: 一键流程守卫与文案**

旧：
```js
    const isReset = stage === "done";
    result = null;

    // 预检：如果尚未登录，提醒用户先登录开发者账号
```
新：
```js
    const isReset = stage === "done";
    result = null;
    if (!paired || !owner) {
      result = { kind: "warn", html: paired ? "没有主体上下文：回配置平台的密钥配置弹窗点「助手采集」再过来。" : "还没连接配置平台。" };
      return render();
    }

    // 预检：如果尚未登录，提醒用户先登录开发者账号
```

删除这一整行（字段循环已经把 `privateKey` 清掉了）：
```js
      delete draft.config.private_key;
```

旧：`刚才已经保存到 apkgo 了，不用再存。`　新：`刚才已经保存到配置平台了，不用再存。`

- [ ] **Step 6: submit**

把整个 `async function submit(capturedFp) { ... }` 换成：

```js
  async function submit(capturedFp) {
    if (busy) return;
    if (!paired || !owner) { result = { kind: "warn", html: paired ? "没有主体上下文，回配置平台的密钥配置弹窗点「助手采集」再过来。" : "还没连接配置平台。" }; return render(); }
    const missing = recipe.fields.filter((f) => f.required && !draft.config[f.key]);
    if (missing.length) { result = { kind: "warn", html: "还差：" + missing.map((f) => esc(f.label)).join("、") }; return render(); }
    if (typeof recipe.validate === "function") {
      const bad = recipe.validate(draft.config);
      if (bad) { result = { kind: "warn", html: esc(bad) }; return render(); }
    }
    busy = true; result = null; render();
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
```

- [ ] **Step 7: 验证**

Run: `node --check src/content/console.js && grep -n "apkgo" src/content/console.js`
Expected: 语法通过；grep 只剩标识符与注释（`apkgo-assistant-root`、`apkgo-assistant-hook`、`apkgo-assistant-sniff`、`apkgo-assistant`、`__apkgoOutline`、`apkgo-highlight-style`、`apkgo-glow*`），没有任何面向用户的「apkgo」文案。

Run: `grep -n "draft.label\|draft.appId\|apps\b\|__label\|__app\|orgName\|credentials/new\|errorHint" src/content/console.js`
Expected: 无输出。

- [ ] **Step 8: 提交**

```bash
git add src/content/console.js
git commit -m "feat: 面板改为按主体保存到配置平台：主体只读展示、无主体不可保存、结果与文案更新"
```

---

### Task 5: recipes.js（字段改名、华为拆 JSON、小米公钥、应用宝单段、删四份）

**Files:**
- Modify: `src/recipes.js`
- Create: `test/unit/recipes.test.mjs`

**Interfaces:**
- Consumes: 面板调用约定（Task 4）：`recipe.validate(draftConfig) → "" | 错误文案`；`recipe.finalize(config, draftConfig) → configInfo`
- Produces: 六个配方 `id ∈ {huawei, xiaomi, oppo, vivo, honor, qq}`；字段 key 见 Global Constraints；顶层 `XIAOMI_PUBLIC_KEY`、`parseHuaweiServiceAccount(text) → { config } | { error }`

- [ ] **Step 1: 写失败测试**

`test/unit/recipes.test.mjs`：

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadScripts, fakeChrome } from "./load.mjs";

const { get } = loadScripts(["src/recipes.js", "src/shared.js"], { chrome: fakeChrome() });
const RECIPES = get("APKGO_RECIPES");
const byId = (id) => RECIPES.find((r) => r.id === id);

// 与 dream-product-api 的 api.dto.openplatform 各 Config 类属性一致
const EXPECTED_KEYS = {
  huawei: ["serviceAccountJson"],
  xiaomi: ["userName", "privateKey"],
  oppo: ["clientId", "clientSecret"],
  vivo: ["accessKey", "accessSecret"],
  honor: ["clientId", "clientSecret"],
  qq: ["userId", "accessSecret"],
};

test("只剩六家已验证配方，id 就是配置平台的渠道值", () => {
  assert.deepEqual(RECIPES.map((r) => r.id).sort(), ["honor", "huawei", "oppo", "qq", "vivo", "xiaomi"]);
  assert.ok(RECIPES.every((r) => r.verified === true));
});

test("字段 key 与配置平台各渠道 Config 类属性一致，且都是必填", () => {
  for (const [id, keys] of Object.entries(EXPECTED_KEYS)) {
    const r = byId(id);
    assert.deepEqual(r.fields.map((f) => f.key), keys, id);
    assert.ok(r.fields.every((f) => f.required), id + " 全部必填");
  }
});

test("华为：validate 拦下坏 JSON 与缺字段，finalize 拆成四个字段（兼容下划线与驼峰）", () => {
  const h = byId("huawei");
  assert.equal(h.fields[0].kind, "file-text");
  assert.match(h.validate({ serviceAccountJson: "not json" }), /不是合法的 JSON/);
  assert.match(h.validate({ serviceAccountJson: JSON.stringify({ key_id: "k" }) }), /缺少 key_id/);
  assert.equal(h.validate({}), ""); // 还没选文件时交给「还差」提示
  const pem = "-----BEGIN PRIVATE KEY-----\nX\n-----END PRIVATE KEY-----";
  const snake = JSON.stringify({ key_id: "k1", private_key: pem, sub_account: "317654321", project_id: "p1", name: "apkgo", roles: ["app"] });
  assert.deepEqual(h.finalize({ serviceAccountJson: snake }), { keyId: "k1", privateKey: pem, subAccount: "317654321", projectId: "p1" });
  const camel = JSON.stringify({ keyId: "k2", privateKey: "pk", subAccount: "sa" });
  assert.deepEqual(h.finalize({ serviceAccountJson: camel }), { keyId: "k2", privateKey: "pk", subAccount: "sa", projectId: "" });
});

test("小米：finalize 带上内置公钥（裸 base64）", () => {
  const out = byId("xiaomi").finalize({ userName: "a@b.com", privateKey: "p" });
  assert.equal(out.userName, "a@b.com"); assert.equal(out.privateKey, "p");
  assert.ok(out.publicKey.length > 100, "公钥常量必须已填入真实内容");
  assert.match(out.publicKey, /^[A-Za-z0-9+/]+=*$/);
});

test("应用宝：单段流程，没有第二段、虚拟字段、validate 与 finalize", () => {
  const q = byId("qq");
  assert.deepEqual(q.flow, ["fetch-key"]);
  assert.deepEqual(q.progressOrder, ["goto", "filling", "saving", "done"]);
  assert.equal(q.flowPages, undefined); assert.equal(q.finalize, undefined); assert.equal(q.validate, undefined);
  assert.equal(q.actions["fetch-apps"], undefined);
  assert.ok(q.fields.every((f) => !f.virtual));
});

test("接口直取的四家仍是 noManual + hideWizardFields，一键流程只有 fetch-key", () => {
  for (const id of ["xiaomi", "oppo", "vivo", "honor"]) {
    const r = byId(id);
    assert.equal(r.noManual, true, id); assert.equal(r.hideWizardFields, true, id); assert.deepEqual(r.flow, ["fetch-key"], id);
  }
});

test("配方文案里没有 apkgo（函数体除外）", () => {
  const text = JSON.stringify(RECIPES, (k, v) => (typeof v === "function" ? undefined : v));
  assert.doesNotMatch(text, /apkgo/i);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: recipes 用例全部 FAIL（还有 10 个配方、key 是下划线、没有 `finalize`）

- [ ] **Step 3: 向用户索要小米公钥**

`XIAOMI_PUBLIC_KEY` 的内容必须来自真实的 `dev.api.public.cer`（小米开放平台「自动发布接口」页下载的公钥证书）。**执行者拿不到文件时停止本任务并向用户索要，不要用假值提交。** 拿到文件后这样得到裸 base64：

```bash
grep -v '^-----' dev.api.public.cer | tr -d '\r\n '
```

输出即为下一步常量的值（一整行，以 `MII` 开头是正常的）。

- [ ] **Step 4: 文件头、常量与华为解析函数**

把 `src/recipes.js` 第 1 行到 `const APKGO_RECIPES = [` 之前（原来的两段注释）整个换成：

```js
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

// 小米开放平台下发的公钥对所有开发者相同：dev.api.public.cer 去掉 PEM 头尾与换行后的裸 base64。
// 后端用它做 RSA 加密生成 SIG；平台前端手动上传公钥文件时也是这么处理的。
const XIAOMI_PUBLIC_KEY = "";

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

```

然后把 `const XIAOMI_PUBLIC_KEY = "";` 的引号里填入 Step 3 得到的字符串。

- [ ] **Step 5: 应用宝配方整个替换，删掉四份未验证配方**

从 `  {\n    id: "tencent", verified: true, cn: "应用宝", product: "腾讯开放平台",` 那一行开始，到文件末尾 `];` 之前（包含 tencent、meizu、samsung、appstore、googleplay 五个对象），整段换成下面这一个对象（保留末尾的 `];`）：

```js
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
```

- [ ] **Step 6: 其余五家的机械改名（sed）**

只改 `config.xxx` / `out.xxx` 这两种前缀，商店后台接口返回里的字段（如 OPPO 的 `target.client_id`、`d.data.email`）不受影响：

```bash
sed -i '' \
  -e 's/config\.client_id/config.clientId/g' \
  -e 's/config\.client_secret/config.clientSecret/g' \
  -e 's/config\.access_key/config.accessKey/g' \
  -e 's/config\.access_secret/config.accessSecret/g' \
  -e 's/config\.private_key/config.privateKey/g' \
  -e 's/config\.email/config.userName/g' \
  -e 's/out\.client_id/out.clientId/g' \
  -e 's/out\.client_secret/out.clientSecret/g' \
  -e 's/out\.access_key/out.accessKey/g' \
  -e 's/out\.access_secret/out.accessSecret/g' \
  -e 's/out\.private_key/out.privateKey/g' \
  -e 's/out\.email/out.userName/g' \
  src/recipes.js
```

- [ ] **Step 7: 五家的字段定义与文案（精确替换）**

**华为**

旧：`{ key: "service_account", label: "服务账号 JSON 文件", kind: "file-b64", accept: ".json,application/json", required: true, capture: { name: /\.json$/i, mime: /json/i } },`
新：`{ key: "serviceAccountJson", label: "服务账号 JSON 文件", kind: "file-text", accept: ".json,application/json", required: true, capture: { name: /\.json$/i, mime: /json/i } },`

旧：`d: "列表里能看到已有的服务账号；apkgo 需要一个「开发者级 · APP管理员」的。", action: "goto" },`
新：`d: "列表里能看到已有的服务账号；配置平台需要一个「开发者级 · APP管理员」的。", action: "goto" },`

在华为配方的 `isLoggedIn: async (h) => {` 这一行之前插入：
```js
    // 采到的是整个 JSON 文本；保存前先校验，提交时拆成配置平台要的四个字段。
    validate(cfg) { return cfg.serviceAccountJson ? (parseHuaweiServiceAccount(cfg.serviceAccountJson).error || "") : ""; },
    finalize(config) { return parseHuaweiServiceAccount(config.serviceAccountJson).config; },
```

**小米**

旧：`"公钥由 apkgo 内置，无需下载上传",`　新：`"公钥由助手内置，无需下载上传",`
旧：`点击上方按钮将自动在后台重置并同步至 apkgo。",`　新：`点击上方按钮将自动在后台重置并同步至配置平台。",`
旧：`saving: "保存到 apkgo 并验证",\n    },`（小米 progressLabels 里的）　新：`saving: "保存到配置平台并验证",\n    },`
旧：
```js
      { key: "email", label: "开发者账号邮箱", kind: "text", hints: [/邮箱|e-?mail|账号/i], pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, required: true },
      { key: "private_key", label: "私钥", kind: "secret", hints: [/私钥|private\s*key|password|密码/i], pattern: /^[A-Za-z0-9+/=_-]{16,}$/, required: true },
```
新：
```js
      { key: "userName", label: "开发者账号邮箱", kind: "text", hints: [/邮箱|e-?mail|账号/i], pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, required: true },
      { key: "privateKey", label: "私钥", kind: "secret", hints: [/私钥|private\s*key|password|密码/i], pattern: /^[A-Za-z0-9+/=_-]{16,}$/, required: true },
```
旧：`if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { email };`　新：`if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { userName: email };`

在小米配方 `actions: { ... },` 之后、该配方的收尾 `  },` 之前插入：
```js
    // 配置平台的小米凭证还要公钥；公钥全局固定，直接带上。
    finalize(config) { return { userName: config.userName, privateKey: config.privateKey, publicKey: XIAOMI_PUBLIC_KEY }; },
```

**OPPO**

旧：`progressLabels: { filling: "自动获取 Client ID 与 Secret", saving: "保存到 apkgo 并验证" },`　新：`progressLabels: { filling: "自动获取 Client ID 与 Secret", saving: "保存到配置平台并验证" },`
旧：`d: "直接通过后台接口获取 Client ID 和 Secret，并保存到 apkgo 验证。" },`　新：`d: "直接通过后台接口获取 Client ID 和 Secret，并保存到配置平台验证。" },`
旧：
```js
      { key: "client_id", label: "Client ID", kind: "text", hints: [/client[\s_-]*id/i, /客户端\s*ID/i], pattern: /^\d{4,}$/, required: true },
      { key: "client_secret", label: "Client Secret", kind: "secret", hints: [/client[\s_-]*secret/i, /密钥|secret/i], pattern: /^[A-Za-z0-9]{16,}$/, required: true },
```
新：
```js
      { key: "clientId", label: "Client ID", kind: "text", hints: [/client[\s_-]*id/i, /客户端\s*ID/i], pattern: /^\d{4,}$/, required: true },
      { key: "clientSecret", label: "Client Secret", kind: "secret", hints: [/client[\s_-]*secret/i, /密钥|secret/i], pattern: /^[A-Za-z0-9]{16,}$/, required: true },
```

**vivo**

旧：`progressLabels: { filling: "自动获取 Access Key 与 Secret", saving: "保存到 apkgo 并验证" },`　新：`... saving: "保存到配置平台并验证" },`
旧：`d: "自动获取 Access Key 和 Access Secret 并保存到 apkgo 验证。" },`　新：`d: "自动获取 Access Key 和 Access Secret 并保存到配置平台验证。" },`
旧：
```js
      { key: "access_key", label: "Access Key", kind: "text", hints: [/access[\s_-]*key/i], pattern: /^[A-Za-z0-9]{8,}$/, required: true },
      { key: "access_secret", label: "Access Secret", kind: "secret", hints: [/access[\s_-]*secret/i, /secret|密钥/i], pattern: /^[A-Za-z0-9]{16,}$/, required: true },
```
新：
```js
      { key: "accessKey", label: "Access Key", kind: "text", hints: [/access[\s_-]*key/i], pattern: /^[A-Za-z0-9]{8,}$/, required: true },
      { key: "accessSecret", label: "Access Secret", kind: "secret", hints: [/access[\s_-]*secret/i, /secret|密钥/i], pattern: /^[A-Za-z0-9]{16,}$/, required: true },
```

**荣耀**

旧：`progressLabels: { filling: "生成并获取 Client ID 与 Secret", saving: "保存到 apkgo 并验证" },`　新：`... saving: "保存到配置平台并验证" },`
旧：`d: "自动生成 API 凭证并提取 Client ID 和 Secret 保存到 apkgo 验证。" },`　新：`d: "自动生成 API 凭证并提取 Client ID 和 Secret 保存到配置平台验证。" },`
旧：
```js
      { key: "client_id", label: "Client ID", kind: "text", hints: [/client[\s_-]*id/i, /客户端\s*ID/i], pattern: /^[A-Za-z0-9]{6,}$/, required: true },
      { key: "client_secret", label: "Client Secret", kind: "secret", hints: [/client[\s_-]*secret/i, /密钥|secret/i], pattern: /^[A-Za-z0-9]{16,}$/, required: true },
```
新：
```js
      { key: "clientId", label: "Client ID", kind: "text", hints: [/client[\s_-]*id/i, /客户端\s*ID/i], pattern: /^[A-Za-z0-9]{6,}$/, required: true },
      { key: "clientSecret", label: "Client Secret", kind: "secret", hints: [/client[\s_-]*secret/i, /密钥|secret/i], pattern: /^[A-Za-z0-9]{16,}$/, required: true },
```

- [ ] **Step 8: 核对残留**

Run: `grep -n "client_id\|client_secret\|access_key\|access_secret\|private_key\|user_id\|\.email\b\|service_account\|__tencent\|app_id_map\|fetch-apps\|flowPages\|apkgo" src/recipes.js`

Expected 只剩这些（都是商店后台接口 / 页面里的名字，不是我们的字段）：
- 文件头注释里说明「凭据仍命名为 apkgo」的两行
- `parseHuaweiServiceAccount` 里的 `json.key_id` / `json.private_key` / `json.sub_account`
- 华为 `h.setInput(name, "apkgo")`
- 小米 `d.data.email`（三处）
- OPPO 的 `r.client_name`、`target.client_id` / `target.client_secret`、`/^apkgo/i`、`const appName = "apkgo"`
- 应用宝的 `access_secret` 标签 / 注释 / `deepFind(..., ["secret", "access_secret", "accessSecret"])`、`/^access_secret$/i`、`["userId", "user_id", "developerId", "uin"]`

出现任何 `config.client_id`、`config.email`、`key: "client_id"` 之类的就是漏改。

Run: `node --check src/recipes.js && npm test`
Expected: 全部 PASS（含 Task 3 里暂时失败的 `submit：应用宝渠道 verified=false`）

- [ ] **Step 9: 提交**

```bash
git add src/recipes.js test/unit/recipes.test.mjs
git commit -m "feat(recipes): 字段改为配置平台属性名；华为拆 JSON、小米内置公钥、应用宝改单段；删四份未验证配方"
```

---

### Task 6: 弹窗与文档（改名）

**Files:**
- Modify: `src/popup/popup.html`
- Modify: `src/popup/popup.js`
- Modify: `README.md`
- Modify: `PRIVACY.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `state` / `unpair` / `openConsole` / `openPanel` 消息（Task 3）、`APKGO.platformSecretPage`（Task 1）

- [ ] **Step 1: popup.html**

整个换成：

```html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>密钥助手</title>
<link rel="stylesheet" href="popup.css">
</head>
<body>
<div class="head">
  <span class="mark"><svg viewBox="0 0 100 100" fill="currentColor"><rect x="18" y="70" width="64" height="13" rx="6.5"/><rect x="18" y="51" width="64" height="13" rx="6.5"/><rect x="22" y="26" width="56" height="13" rx="6.5"/></svg></span>
  <div class="t">密钥助手 <small id="ver"></small></div>
</div>
<div class="sec">
  <div class="sec-t">连接</div>
  <div id="conn" class="conn"></div>
</div>
<div class="sec">
  <div class="sec-t">当前页面</div>
  <div id="here" class="here"></div>
</div>
<div class="sec">
  <div class="sec-t">前往后台</div>
  <div id="stores" class="chips"></div>
</div>
<div class="foot">
  <span>只连配置平台，不连任何第三方</span>
</div>
<script src="../recipes.js"></script>
<script src="../shared.js"></script>
<script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: popup.js**

整个换成：

```js
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
```

- [ ] **Step 3: README.md**

整个换成：

````markdown
# 密钥助手

Chrome / Edge 扩展。打开华为、小米、OPPO、vivo、荣耀、应用宝六家开放平台后台时，页面下方出现助手按钮，点一下「一键获取密钥」就拿到 API 密钥并直接保存到**配置平台**（主体 → 密钥配置）。配置平台保存时在线验证，通过才落库；之后提审、发布就用这组密钥。

**只连配置平台，不连任何第三方。** 密钥采集后只在浏览器会话内存里暂存，保存成功立即清除。

## 支持的商店

助手只在**已在真实后台完整跑通**的商店页面上出现，六家，正好对应配置平台的六个渠道：

| 渠道 | 一键获取怎么做的 |
|---|---|
| 华为 AppGallery（huawei） | 跳到 Connect API → 打开创建 Service Account 弹窗并填好（开发者级 · APP管理员）→ **你点「确认」** → 抓到下载的 JSON，拆成 keyId / privateKey / subAccount / projectId → 自动保存验证 |
| 小米（xiaomi） | 后台接口读出开发者邮箱，页面提取私钥（没有就自动生成），带上内置公钥 → 自动保存验证；完成后可「重置私钥并重新保存」 |
| OPPO（oppo） | 直达「生态应用」页，用后台自己的接口读取服务端应用凭据，没有就新建一个 → 自动保存验证 |
| vivo（vivo） | 用后台自己的接口读取 Access Key / Secret → 自动保存验证；未开通时跳到开通页并高亮「立即开通」 |
| 荣耀（honor） | 在凭据页用后台接口生成 API 客户端并读出 Client ID / Secret → 自动保存验证 |
| 应用宝（qq） | 调后台同源接口取 access_secret、从登录信息取开发者 ID → 自动保存（配置平台对应用宝不做在线验证） |

## 安装

不上 Chrome / Edge 商店，手动加载：

1. 在仓库里跑 `python3 scripts/build.py`，得到 `dist/apkgo-assistant-<版本>.zip`（或向维护者要现成的包）。
2. 解压到一个不会被删掉的目录（浏览器每次启动都要读它）。
3. 打开 `chrome://extensions`（Edge 是 `edge://extensions`），打开右上角「开发者模式」。
4. 点「加载已解压的扩展程序」，选中刚才解压出来的文件夹。

更新时用新包覆盖原目录，再回扩展页点一下「重新加载」。

## 使用

1. 登录配置平台（`http://192.168.1.18:16003`），进「主体」页，点某个主体的「密钥配置」。弹窗顶部点 **「连接助手」**：网页把你当前的登录令牌交给扩展，扩展用它调一次只读接口确认可用。令牌过期扩展会自己续，失效了回来再点一次即可。
2. 在要采集的渠道那一行点 **「助手采集」**：扩展记下主体和渠道，打开那家后台。页面下方出现助手按钮，面板顶部显示「将保存到主体：X」。
3. 点 **「一键获取密钥」**，看进度条走完。华为中间会停一下等你点弹窗上的「确认」，其余五家全程不用碰页面。
4. 结果就地显示。配置平台保存时会连一次该商店验证密钥（应用宝除外），失败会把后端给的原因原样显示。回到配置平台的弹窗，列表自动刷新。

没有主体上下文（比如从扩展弹窗直接打开后台）时面板只能看步骤，不能保存，避免存错主体。同一主体同一渠道再采一次会覆盖旧值（小米重置私钥就靠这个）。

## 一键获取密钥是怎么工作的

两种路子，取决于那家后台给了什么。

**接口直取 / 读页面**（小米、OPPO、vivo、荣耀、应用宝）：这些后台的网页本身就是靠一组内部接口在读写密钥（比如 OPPO 的 `/myapi/server/app-list`、vivo 的 `/webapi/access/detail`、荣耀的 `/portal/auth/genAuthenticate`）。扩展在你已登录的页面里，以你的会话直接调这些接口读出（没有则创建）凭据，跳过一切点点点，几秒钟就保存完。请求只发往那家后台自己的域名。应用宝的 `access_secret` 走它自己的同源接口（只认 cookie，没有签名，登录了就能取），开发者 ID 在页面的登录信息里（`localStorage` 的 `$loginInfo`）。

**页面代填 + 抓下载**（华为）：AGC 的密钥是一次性下载的 JSON，没有可读的接口，于是：

1. **跳页**：不在密钥页就先跳到 `用户与访问 → API密钥 → Connect API`，落地后自动继续。
2. **填弹窗**：在同源 iframe 里点开「创建」，等异步渲染的角色列表出现，填名称、选「开发者级」、勾「APP管理员」，把「确认」按钮描上绿框。面板收起让位，提示挪到页面顶部。
3. **你点「确认」**：这一下真正在你的开发者账号里创建密钥，扩展不替你点。
4. **抓下载**：扩展事先在页面主世界挂了钩子（`chrome.scripting` MAIN world），覆盖 blob、`<a download>`、带 attachment 头的 fetch / XHR，外加 `chrome.downloads` 事件；AGC 一下载 JSON，内容直接进面板。同一次下载被多条路径抓到会按内容去重。
5. **自动保存验证**：把 JSON 拆成四个字段存到配置平台，服务端连华为验证一次，结果显示在面板进度里。

失败时面板底部的「手动模式」会自动展开（接口直取的商店没有手动模式）：完整步骤、每步单独的「帮我点」、自动识别、点选、选文件都在里面。

## 从页面自己那里取值

有些后台把需要的值只放在自己的登录信息或接口返回里，页面上看不到（应用宝的开发者 ID 就是）。配方有两条路可走。

**本地存储**：`h.storage()` 读这一页（含同源 iframe）的 `localStorage` / `sessionStorage`，配 `h.deepFind()` 按字段名取。只在配方主动调用时读，只取声明的字段。

**页面返回记录器**：[`src/content/sniff-main.js`](src/content/sniff-main.js) 在页面自己的世界里运行（MV3 的 `world: "MAIN"`，`document_start`），把页面发出的 JSON 返回记在一个环形缓冲里：只在装了配方的商店后台域名上运行，上限 40 条、每条 64KB，页面一关就没了；不主动外发，只有配方在你点「一键获取密钥」后来要才回一份，配方只取自己声明的字段，其余当场丢弃；只读，不改写页面的任何请求或返回。配方里用 `h.responses()` 拿到 `[{url, json}]`，配 `h.deepFind(json, ["userId"], 校验函数)` 按字段名深挖。记录器要赶在页面自己的请求之前就位，刚装好扩展时缓冲是空的，`h.reloadAndResume()` 会刷新一次页面并自动接着跑。

## 写一份配方

`src/recipes.js` 里每家商店一个对象，`id` 就是配置平台的渠道值，字段 `key` 必须等于 dream-product 对应渠道 Config 类的属性名（`dream-product-api` 的 `api.dto.openplatform` 包）：

```js
{
  id: "oppo", verified: true, cn: "OPPO", product: "OPPO 开放平台",
  hostRe: /(^|\.)open\.oppomobile\.com$/,     // 在哪些域名上注入
  console: "https://open.oppomobile.com/new/ecological/app",  // 密钥页入口（「跳到密钥页」用）
  prereq: ["需要企业开发者账号"],                 // 前置条件
  steps: [{ t: "管理中心 → API 密钥管理", d: "说明", action: "fetch-key" }],  // 带 action 的步骤旁边有「帮我点」
  fields: [
    { key: "clientId", label: "Client ID", kind: "text", hints: [/client[\s_-]*id/i], pattern: /^\d{4,}$/, required: true },
    { key: "serviceAccountJson", label: "JSON 文件", kind: "file-text", capture: { name: /\.json$/i } },  // capture：下载自动抓取
  ],
  flow: ["fetch-key"],                          // 有 flow 才显示「一键获取密钥」，按顺序跑 actions
  actions: {
    "fetch-key": async (h) => { /* 用 fetch 调后台接口；或 h.byText / h.setInput / h.highlight / h.waitFor 操作页面；
                                 或 h.responses() + h.deepFind() 从页面自己的 JSON 返回里取值、h.scanText(正则) 全页扫一个值；
                                 h.reloadAndResume() 刷新重试。把结果写进 h.draft.config，返回给用户看的一句话 */ },
  },
  // 可选：
  fields: [{ key: "userId", auto: true }],            // auto：由 actions 自动填，向导里不占位
  preload: async (h) => ({ userName: "…" }),    // 面板打开时预填字段（比如从接口读到的账号邮箱）
  detect: async (h) => ({ clientId: "…" }),     // 「自动识别」时优先跑它，再跑 hints 的通用识别
  validate: (cfg) => "",                        // 返回非空字符串就拦下保存
  finalize: (config, draft) => ({ ...config }), // 采集结果 → 配置平台的 configInfo（华为在这里拆 JSON、小米在这里带公钥）
  noManual: true,                               // 不显示「手动模式」（接口直取的商店用）
  hideWizardFields: true,                       // 向导里不显示必填字段（全部由 actions 填）
  progressOrder: ["goto", "filling", "saving", "done"],   // 进度条步骤（默认含 confirm / captured）
  progressLabels: { filling: "自动获取 Client ID 与 Secret" },
  wizardHint: "…", doneHint: "…", doneBtnText: "重新获取并保存",
}
```

- `kind`：`text` / `secret` / `multiline`（PEM）/ `file-b64` / `file-text`。
- `hints` 是自动识别时匹配页面标签文字的正则，`pattern` 过滤识别到的值。
- `actions` 里拿到的 `h` 会跨同源 iframe 查找；需要用户亲手确认的按钮请 `h.highlight()` 而不是点它。
- 需要换一页才能继续时用 `h.requestNav(url, 按钮文案)`：助手不自己跳走，而是在面板上给一个按钮，用户点了才跳，落地后自动接着跑。配方用 `flowPages: [/正则/]` 声明这些页面也算在流程内。
- 小米公钥是文件顶部的常量 `XIAOMI_PUBLIC_KEY`（`dev.api.public.cer` 去掉 PEM 头尾与换行）；华为 JSON 的解析在 `parseHuaweiServiceAccount`。
- 改完跑 `npm test` 与 `npm run e2e`，再在真实后台过一遍。

## 与配置平台的对接

- **配对**：平台网页在「连接助手」时通过 `window.postMessage` 把 `{accessToken, refreshToken, userName}` 交给 [`src/content/bridge.js`](src/content/bridge.js)；bridge 只回应同 window、同源、`source === "apkgo-web"` 的消息，配对的 origin 强制取当前页面的。后台用该 token 调一次只读接口验证后才落盘。
- **请求**：[`src/platform.js`](src/platform.js) 是扩展里唯一发往配置平台的地方。基址 `{origin}/api`，头 `Authorization: Bearer <access_token>`；HTTP 424 用 `refresh_token` 刷新（`POST /api/auth/oauth2/token`，与平台前端同一个客户端）后重试一次；401 或刷新失败清除配对。成功判定为 HTTP 2xx 且 `code === 200`，错误文案取 `msg`。
- **保存**：`GET /product/owner-open-platform-config/get?owner&channel` → 有记录 `PUT /edit` 带 id，没有 `POST /add`。
- **协议**（页 → 扩）：`hello`、`pair {accessToken, refreshToken, userName}`、`open-console {store, owner}`；（扩 → 页）：`ready {version, paired}`、`paired {paired}`、`error {message}`、`open-console-ok {store}`。

## 安全与隐私

- **网络**：扩展向外只连你连接时所在的配置平台地址，这部分请求集中在 `src/platform.js` 一个文件里。接口直取的商店会在你已登录的后台页面里调用**那家后台自己的**接口（同站、带你的会话），地址都写在 `src/recipes.js` 对应商店的配方里，只在你点「一键获取密钥」后发生。除这两处之外没有任何网络地址。
- **密钥**：采集到的商店密钥放 `chrome.storage.session`，关浏览器就没了；保存成功立即清除；从不写入磁盘、从不进 URL。
- **平台令牌**：与网页 cookie 里的是同一把用户令牌，存扩展的本地存储；断开连接、令牌失效即清除。
- **页面权限**：只在六家后台域名和配置平台地址上注入脚本，清单里一目了然；没有 `tabs`、没有 `<all_urls>`。
- **可复现构建**：`python3 scripts/build.py` 打出的 zip 字节固定，附 sha256。

## 开发

```bash
# chrome://extensions → 开发者模式 → 加载已解压的扩展程序 → 选这个目录
npm test                  # 单测（Node 内置 test runner，无依赖）
npm run e2e               # 端到端（见下）
python3 scripts/build.py  # 打 zip 到 dist/
```

本地跑配置平台前端时（`localhost`），清单里已包含 `http://localhost/*`，在本地的密钥配置弹窗点「连接助手」即可。

目录：

- `manifest.json` — MV3 清单，权限都在这里。
- `src/recipes.js` — 每家商店的域名、入口、步骤、字段、自动化动作。
- `src/platform.js` — 配置平台客户端，唯一发往平台的地方。
- `src/background.js` — 消息分发、配对验证、保存编排、下载钩子。
- `src/content/console.js` — 后台页面上的面板：引导、采集、保存。
- `src/content/bridge.js` — 配置平台网页和扩展之间的桥（`window.postMessage`）。
- `src/content/sniff-main.js` — 页面返回记录器。
- `src/popup/` — 工具栏弹窗：连接状态、打开面板、前往后台。
- `test/unit/` — 单测；`test/e2e/` — 端到端。

## 端到端测试

不用手动装扩展：`npm install && npx playwright install chromium && npm run e2e`。脚本用真 Chromium 加载真正的扩展，起一个伪配置平台（配对页 + token 刷新 + 配置 get/add/edit/list），把 `open.oppomobile.com`、`developer.huawei.com`、`app.open.qq.com` 拦截成伪造的后台页（`test/e2e/fixtures/`），然后走完：配对 → 无主体时不可保存 → OPPO 一键（add）→ 再存一次（edit）→ 令牌过期后自动刷新 → 华为一键（代填弹窗、模拟用户点确认、抓下载、拆 JSON）→ 应用宝单段 → 弹窗。截图落在 `dist/shots/`。
````

- [ ] **Step 4: PRIVACY.md**

整个换成：

```markdown
# 隐私说明 · 密钥助手

**密钥助手只做一件事：把你在应用商店开放平台后台看到的 API 密钥，按你的操作保存到配置平台指定主体的密钥配置里。**

## 收集什么

- 你在后台页面上点「一键获取密钥」「自动识别」「点选」或选择文件所得到的密钥字段。
- 你在配置平台「密钥配置」弹窗点「连接助手」时，网页交给扩展的当前登录令牌（与网页 cookie 里的是同一把）。

除此之外不收集任何数据：不记录浏览历史，不读取与密钥无关的页面内容，不采集个人信息，没有统计埋点。

## 发到哪里

- 密钥只发往你连接时所在的配置平台地址（`http://192.168.1.18:16003`）。
- 「一键获取密钥」时，扩展会在你已登录的商店后台页面里调用该后台自己的接口来读取（或按你的操作创建）API 凭据。这些请求只发往那家后台的域名、带的是你自己的登录会话，只在你点了按钮之后发生。
- 不发往任何第三方服务器。除配置平台和各商店后台自己的域名外，扩展代码里不存在其他网络地址。
- 部分后台（应用宝）把需要的开发者 ID 放在页面的本地存储里（`$loginInfo`）。助手在你点「一键获取密钥」后读取该页本地存储，只取声明好的字段（如 `userId`），其余立即丢弃。
- 部分值只在后台自己的接口返回里。助手在这些后台页面上会把页面**自己发出的** JSON 返回暂存在该页面内存中（上限 40 条、每条 64KB，关页即清），仅在你点「一键获取密钥」后读取其中声明好的字段，其余立即丢弃，不外发、不落盘。

## 存在哪里

- 商店密钥：仅存于浏览器会话存储（`chrome.storage.session`），关闭浏览器即清除；保存到配置平台成功后立即清除。
- 平台登录令牌：存于扩展的本地存储，用于后续保存操作与到期续期。你可以在扩展弹窗里点「断开连接」删除；令牌失效时扩展也会自动清除。

## 权限说明

- `storage`：保存上述两类数据。
- `scripting`：在商店后台页面里挂一个下载钩子，页面下载密钥文件时把内容直接填进面板，省掉文件对话框。钩子只读页面自己发起的下载，不改变页面行为。
- `downloads`：识别刚发生的密钥文件下载（文件名为 .json / .cer / .pem / .p8），配合上一条。不读取你的其他下载。
- 各商店后台域名：在这些页面上显示引导面板并读取你指定的密钥字段。
- 配置平台地址：让配置平台网页能把令牌交给扩展。

## 核验

`python3 scripts/build.py` 打出的 zip 字节固定，附 sha256，可自行核对。
```

- [ ] **Step 5: CHANGELOG.md**

把文件开头的这一段：

```markdown
## 未发布

- 改为自建托管：不上 Chrome / Edge 商店，zip 放七牛 CDN，下载地址 https://apkgo.baici.tech/dl/apkgo-assistant.zip ，控制台的安装卡片直接给下载按钮和四步加载说明。
```

换成：

```markdown
## 0.6.0 · 2026-09-20

- **后端切换**：保存目标从 apkgo cloud 换成配置平台（dream-product 的主体开放平台配置）。在平台「密钥配置」弹窗点「连接助手」把登录令牌交给扩展；每个渠道行「助手采集」带着主体打开后台；保存按 (主体, 渠道) 有则改、无则增，后端在线验活通过才落库。
- 新增 `src/platform.js`：唯一的平台客户端，Bearer 请求、424 刷新重试、401 清配对。
- 配方字段 key 改为配置平台各渠道 Config 类的属性名（驼峰）。华为把下载的 JSON 拆成 keyId / privateKey / subAccount / projectId；小米内置公钥；应用宝改为单段（只取 userId 与 accessSecret）。
- 删除未验证的魅族 / Samsung / App Store / Google Play 配方；删除备注名、关联应用、可选域名授权。
- 扩展改名「密钥助手」，文案里的 apkgo 全部换成「配置平台」。
- 新增 `npm test`（Node 内置 test runner）单测；e2e 改为伪配置平台。
```

- [ ] **Step 6: 验证**

Run: `node --check src/popup/popup.js && grep -n "apkgo" src/popup/popup.html src/popup/popup.js PRIVACY.md`
Expected: 无输出。

Run: `grep -n "apkgo" README.md`
Expected: 只剩三类：zip 文件名 `apkgo-assistant-<版本>.zip`、协议里的 `source === "apkgo-web"`、目录说明里没有。出现「保存到 apkgo」「apkgo 添加页」之类即漏改。

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 7: 提交**

```bash
git add src/popup/popup.html src/popup/popup.js README.md PRIVACY.md CHANGELOG.md
git commit -m "docs: 扩展改名「密钥助手」，弹窗与 README / PRIVACY / CHANGELOG 按配置平台重写"
```

---

### Task 7: e2e 伪配置平台与用例

**Files:**
- Rename: `test/e2e/fake_apkgo.py` → `test/e2e/fake_platform.py`（内容重写）
- Modify: `test/e2e/run.mjs`
- Modify: `test/e2e/e2e.mjs`（整个重写）
- 夹具 `test/e2e/fixtures/*.html` 不动

**Interfaces:**
- Consumes: 扩展全部改动（Task 1–6）
- Produces: `npm run e2e` 输出 `E2E_OK`；`dist/e2e-result.json`、`dist/shots/*.png`

- [ ] **Step 1: 伪配置平台**

```bash
git mv test/e2e/fake_apkgo.py test/e2e/fake_platform.py
```

然后把 `test/e2e/fake_platform.py` 整个换成：

```python
# 伪配置平台：一个模拟「密钥配置」弹窗协议的页面 + token 刷新端点 + 主体开放平台配置的 list/get/add/edit。
# 响应形状、错误文案、唯一键规则都照 dream-product 与网关的口径。
import json, sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>fake platform</title></head><body>
<h1>fake platform · 密钥配置</h1><pre id="log"></pre>
<script>
const log = (m) => { document.getElementById('log').textContent += m + "\\n"; };
window.__state = {};
window.addEventListener('message', (e) => {
  if (e.source !== window || e.origin !== location.origin) return;
  const d = e.data; if (!d || d.source !== 'apkgo-assistant') return;
  log('ext→page ' + JSON.stringify(d));
  if (d.type === 'ready') window.__state.ready = d;
  if (d.type === 'paired') window.__state.paired = d.paired;
  if (d.type === 'error') window.__state.error = d.message;
  if (d.type === 'open-console-ok') window.__state.opened = d.store;
});
window.postMessage({ source: 'apkgo-web', type: 'hello' }, location.origin);
window.__pair = (accessToken, refreshToken) => window.postMessage({ source: 'apkgo-web', type: 'pair', accessToken, refreshToken, userName: '张三' }, location.origin);
window.__open = (store, owner) => window.postMessage({ source: 'apkgo-web', type: 'open-console', store, owner }, location.origin);
</script></body></html>"""

ACCESS = {"at-1"}          # 当前有效的 access_token
REFRESH = "rt-1"           # 唯一有效的 refresh_token
ROWS = {}                  # (owner, channel) -> 记录
RECEIVED = []              # add / edit 请求记录，供用例断言
STATE = {"expire_next": False, "next_id": 1}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _send(self, code, body, ctype="application/json"):
        data = body.encode() if isinstance(body, str) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code); self.send_header("Content-Type", ctype + "; charset=utf-8"); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

    def _ok(self, data=None): return self._send(200, {"code": 200, "msg": "success", "data": data})
    def _bad(self, msg): return self._send(400, {"code": 400, "msg": msg})

    # 与网关一致：无效 token → 401；「过期」→ 424（由 /__expire-next 触发一次）
    def _auth(self):
        h = self.headers.get("Authorization", "")
        if not h.startswith("Bearer ") or h[7:] not in ACCESS:
            self._send(401, {"code": 401, "msg": "invalid_token"}); return False
        if STATE["expire_next"]:
            STATE["expire_next"] = False
            self._send(424, {"code": 424, "msg": "token expired"}); return False
        return True

    def _body(self):
        n = int(self.headers.get("Content-Length", "0"))
        return self.rfile.read(n) if n else b""

    def do_GET(self):
        u = urlparse(self.path); q = {k: v[0] for k, v in parse_qs(u.query).items()}
        if u.path == "/" or u.path.startswith("/index"): return self._send(200, PAGE, "text/html")
        if u.path == "/__received": return self._send(200, RECEIVED)
        if u.path == "/api/product/owner-open-platform-config/list":
            if not self._auth(): return
            rows = [r for r in ROWS.values() if not q.get("owner") or q["owner"] in r["owner"]]
            return self._ok({"content": rows, "totalElements": len(rows)})
        if u.path == "/api/product/owner-open-platform-config/get":
            if not self._auth(): return
            return self._ok(ROWS.get((q.get("owner"), q.get("channel"))))
        return self._send(404, {"code": 404, "msg": "not found"})

    def do_POST(self):
        u = urlparse(self.path)
        if u.path == "/__expire-next":
            STATE["expire_next"] = True; return self._ok(True)
        if u.path == "/api/auth/oauth2/token":
            if self.headers.get("Authorization") != "Basic ZHJlYW06ZHJlYW0=": return self._send(401, {"code": 401, "msg": "invalid_client"})
            form = {k: v[0] for k, v in parse_qs(self._body().decode()).items()}
            if form.get("grant_type") != "refresh_token" or form.get("refresh_token") != REFRESH: return self._send(401, {"code": 401, "msg": "invalid_grant"})
            tok = "at-%d" % (len(ACCESS) + 1); ACCESS.add(tok)
            return self._ok({"access_token": tok, "refresh_token": REFRESH, "expires_in": 3600})
        if u.path == "/api/product/owner-open-platform-config/add":
            if not self._auth(): return
            return self._save(json.loads(self._body() or b"{}"), "add")
        return self._send(404, {"code": 404, "msg": "not found"})

    def do_PUT(self):
        u = urlparse(self.path)
        if u.path == "/api/product/owner-open-platform-config/edit":
            if not self._auth(): return
            return self._save(json.loads(self._body() or b"{}"), "edit")
        return self._send(404, {"code": 404, "msg": "not found"})

    # 与 dream-product 的 add/update 同口径：(owner, channel) 唯一；configInfo.clientSecret == "bad" 模拟验活失败
    def _save(self, body, mode):
        owner, channel, info = body.get("owner"), body.get("channel"), body.get("configInfo") or {}
        RECEIVED.append({"mode": mode, "auth": self.headers.get("Authorization", "")[:14], "body": body})
        if not owner or not channel or not info: return self._bad("主体不能为空, 渠道不能为空, 凭证配置不能为空")
        key = (owner, channel)
        if mode == "add" and key in ROWS: return self._bad("该主体渠道的开放平台配置已存在!")
        if mode == "edit" and (body.get("id") is None or not any(r["id"] == body["id"] for r in ROWS.values())): return self._bad("该主体开放平台配置不存在!")
        if info.get("clientSecret") == "bad": return self._bad("凭证验证未通过: token: [10001] invalid client_secret")
        row = {"id": body.get("id") if mode == "edit" else STATE["next_id"], "owner": owner, "channel": channel,
               "configInfo": json.dumps(info, ensure_ascii=False), "updateTime": "2026-09-20T10:00:00"}
        if mode == "add": STATE["next_id"] += 1
        ROWS[key] = row
        return self._ok(True)


HTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 9090), H).serve_forever()
```

- [ ] **Step 2: run.mjs**

旧：`// 起伪 apkgo 服务 → 跑 e2e.mjs → 关服务。截图落在 dist/shots/，也是商店截图的来源。`
新：`// 起伪配置平台 → 跑 e2e.mjs → 关服务。截图落在 dist/shots/。`

旧：`const server = spawn("python3", [path.join(HERE, "fake_apkgo.py"), "9090"], { stdio: "inherit" });`
新：`const server = spawn("python3", [path.join(HERE, "fake_platform.py"), "9090"], { stdio: "inherit" });`

- [ ] **Step 3: e2e.mjs 整个重写**

```js
// 真实端到端：真正的扩展 + 真 Chromium + 伪配置平台 + 拦截出来的伪商店后台页。
// 用法：npm run e2e（run.mjs 会先起伪平台）。需要 playwright 的 Chromium：npx playwright install chromium
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const EXT = path.resolve(HERE, "../..");
const ORIGIN = "http://localhost:9090";
const OWNER = "安徽逐梦星河网络科技有限公司";
const SHOTS = path.join(HERE, "../../dist/shots");
const fixture = (n) => fs.readFileSync(path.join(HERE, "fixtures", n), "utf8");
const received = async () => (await fetch(`${ORIGIN}/__received`)).json();
const html = (body) => ({ contentType: "text/html; charset=utf-8", body });

const userData = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "apkgo-e2e-"));
const ctx = await chromium.launchPersistentContext(userData, {
  channel: "chromium", headless: true, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const out = { steps: [] };
const step = (name, data) => { out.steps.push({ name, ...data }); console.log("•", name, JSON.stringify(data)); };
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

// 面板在关闭的 shadow root 里：走 CDP 穿透。返回一个「在 shadow root 上执行函数」的助手。
async function shadow(page) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("DOM.enable"); await cdp.send("Runtime.enable");
  return async (fnSrc, ...args) => {
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const { nodeId: hostId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: "#apkgo-assistant-root" });
    const { node } = await cdp.send("DOM.describeNode", { nodeId: hostId, pierce: true });
    const { object } = await cdp.send("DOM.resolveNode", { backendNodeId: node.shadowRoots[0].backendNodeId });
    const r = await cdp.send("Runtime.callFunctionOn", { objectId: object.objectId, functionDeclaration: `function(...a){ return (${fnSrc})(this, ...a); }`, arguments: args.map((v) => ({ value: v })), returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  };
}
const openPanel = (sh) => sh(`(sr) => { if (!sr.querySelector('.panel').classList.contains('open')) sr.querySelector('.launch').click(); }`);
const panelText = (sh) => sh(`(sr) => sr.querySelector('.panel .body').innerText`);
const msgText = (sh) => sh(`(sr) => (sr.querySelector('.msg')||{}).textContent || ''`);
const oneClick = (sh) => sh(`(sr) => { const b = sr.querySelector('[data-oneclick]'); if (!b || b.disabled) return false; b.click(); return true; }`);
const oneClickDisabled = (sh) => sh(`(sr) => { const b = sr.querySelector('[data-oneclick]'); return !b || b.disabled; }`);

// 从伪平台页发 open-console（带主体）：扩展会自己开一个标签到真站（抢在 Playwright 路由之前），
// 这里只用它验证「真的开了」，然后关掉，后台页改由 Playwright 打开（被路由成伪页面）。
async function openFromPlatform(platform, store) {
  const [autoTab] = await Promise.all([ctx.waitForEvent("page", { timeout: 10000 }), platform.evaluate(([s, o]) => window.__open(s, o), [store, OWNER])]);
  await autoTab.waitForLoadState("domcontentloaded").catch(() => {});
  const url = autoTab.url();
  await autoTab.close();
  await platform.waitForFunction((s) => window.__state.opened === s, store, { timeout: 5000 });
  return url;
}

try {
  let sw = ctx.serviceWorkers()[0]; if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  step("service worker up", { url: sw.url() });

  // 1. 配对：hello → ready；pair(token) → paired；回包不带 token
  const platform = await ctx.newPage();
  await platform.goto(`${ORIGIN}/#/application/mainMap`);
  await platform.waitForFunction(() => window.__state.ready, null, { timeout: 10000 });
  step("ready", await platform.evaluate(() => window.__state.ready));
  await platform.evaluate(() => window.__pair("at-1", "rt-1"));
  await platform.waitForFunction(() => window.__state.paired || window.__state.error, null, { timeout: 10000 });
  const pairedState = await platform.evaluate(() => ({ paired: window.__state.paired, error: window.__state.error }));
  step("paired", pairedState);
  must(pairedState.paired && pairedState.paired.userName === "张三", "配对失败：" + pairedState.error);
  must(!("accessToken" in pairedState.paired) && !("refreshToken" in pairedState.paired), "paired 回包不能带 token");

  // 2. 没有主体上下文：面板出现但不能一键
  await ctx.route("https://open.oppomobile.com/**", (route) => route.fulfill(html(fixture("oppo.html"))));
  const oppo = await ctx.newPage();
  await oppo.goto("https://open.oppomobile.com/new/ecological/app");
  await oppo.waitForSelector("#apkgo-assistant-root", { state: "attached", timeout: 10000 });
  await oppo.waitForTimeout(2600); // 让启动按钮的滑入动画结束
  await oppo.screenshot({ path: path.join(SHOTS, "00-launcher.png") });
  let sh = await shadow(oppo);
  await openPanel(sh); await oppo.waitForTimeout(500);
  const noOwner = { disabled: await oneClickDisabled(sh), text: await panelText(sh) };
  step("no owner context", { disabled: noOwner.disabled, hint: /没有主体上下文/.test(noOwner.text) });
  must(noOwner.disabled && /没有主体上下文/.test(noOwner.text), "没有主体时一键按钮应禁用并提示");
  await oppo.screenshot({ path: path.join(SHOTS, "01-panel-no-owner.png") });

  // 3. 从平台弹窗「助手采集」带主体打开 OPPO；已开的 OPPO 页刷新后面板知道主体
  step("open-console opened tab", { url: await openFromPlatform(platform, "oppo") });
  await oppo.reload();
  await oppo.waitForSelector("#apkgo-assistant-root", { state: "attached", timeout: 10000 });
  await oppo.waitForTimeout(800);
  sh = await shadow(oppo);
  await openPanel(sh); await oppo.waitForTimeout(500);
  const withOwner = await panelText(sh);
  step("owner context", { owner: withOwner.includes("将保存到主体：" + OWNER), connected: withOwner.includes("已连接配置平台 · 张三") });
  must(withOwner.includes("将保存到主体：" + OWNER), "面板没显示主体");
  await oppo.screenshot({ path: path.join(SHOTS, "01-panel.png") });

  // 4. OPPO 一键：抓 Client ID / Secret → add
  must(await oneClick(sh), "一键按钮不可点");
  await oppo.waitForTimeout(2500);
  let msg = await msgText(sh);
  let recv = await received();
  step("oppo saved (add)", { msg, mode: recv[0] && recv[0].mode, body: recv[0] && recv[0].body });
  must(/在线验证通过/.test(msg), "OPPO 保存后应提示验证通过：" + msg);
  must(recv.length === 1 && recv[0].mode === "add", "第一次保存应走 add");
  must(recv[0].body.owner === OWNER && recv[0].body.channel === "oppo", "owner / channel 不对");
  must(recv[0].body.configInfo.clientId === "1855486693700881086" && recv[0].body.configInfo.clientSecret.length === 64, "configInfo 字段不对");
  must(!("store_name" in recv[0].body) && !("label" in recv[0].body), "不应再有 apkgo 的字段");
  await oppo.screenshot({ path: path.join(SHOTS, "03-saved.png") });

  // 5. 再存一次 → edit 带 id
  must(await oneClick(sh), "「重新获取并保存」不可点");
  await oppo.waitForTimeout(2500);
  recv = await received();
  step("oppo saved again (edit)", { mode: recv[1] && recv[1].mode, id: recv[1] && recv[1].body.id });
  must(recv.length === 2 && recv[1].mode === "edit" && recv[1].body.id === 1, "第二次保存应走 edit 带 id");

  // 6. 令牌过期：下一次请求 424 → 扩展刷新后用新 token 重试
  await fetch(`${ORIGIN}/__expire-next`, { method: "POST" });
  must(await oneClick(sh), "一键按钮不可点");
  await oppo.waitForTimeout(2500);
  recv = await received();
  msg = await msgText(sh);
  step("token refreshed", { msg, mode: recv[2] && recv[2].mode, auth: recv[2] && recv[2].auth });
  must(recv.length === 3 && recv[2].mode === "edit" && recv[2].auth === "Bearer at-2", "过期后应刷新并用新 token 重试：" + JSON.stringify(recv[2]));
  must(/在线验证通过/.test(msg), "刷新后应保存成功：" + msg);

  // 7. 华为：「一键」打开并填好创建弹窗 → 用户点「确认」→ 下载的 JSON 自动进面板 → 拆成四个字段保存
  await ctx.route("https://developer.huawei.com/**", (route) => route.fulfill(html(route.request().url().includes("/cdp/") ? fixture("agc-inner.html") : fixture("agc-outer.html"))));
  step("open-console huawei", { url: await openFromPlatform(platform, "huawei") });
  const agc = await ctx.newPage();
  await agc.goto("https://developer.huawei.com/consumer/cn/service/josp/agc/index.html#/ups/9249519184595983326");
  await agc.waitForSelector("#apkgo-assistant-root", { state: "attached", timeout: 10000 });
  await agc.frameLocator("iframe").locator("text=Service Account是更安全的凭据").waitFor({ timeout: 10000 });
  await agc.waitForTimeout(600);
  const sh2 = await shadow(agc);
  await openPanel(sh2); await agc.waitForTimeout(400);
  must(await oneClick(sh2), "华为一键按钮不可点");
  await agc.waitForTimeout(1200);
  const inner = agc.frameLocator("iframe");
  step("huawei open-create", {
    msg: await msgText(sh2),
    dialogVisible: await inner.locator(".el-dialog__wrapper.on").count(),
    name: await inner.locator("input.el-input__inner").inputValue(),
    devChecked: await inner.locator('input[name=t][value=dev]').isChecked(),
    appAdminChecked: await inner.locator('.el-checkbox__original[value=app]').isChecked(),
  });
  await agc.screenshot({ path: path.join(SHOTS, "05-huawei-filled.png") });
  const dl = agc.waitForEvent("download", { timeout: 5000 }).then((d) => ({ name: d.suggestedFilename() }), () => ({ name: null }));
  await inner.locator(".el-dialog__footer button").first().click();
  step("huawei browser download event", await dl);
  await agc.waitForTimeout(3000); // 抓到下载 → 自动保存
  recv = await received();
  const hw = recv[recv.length - 1];
  step("huawei saved", { msg: await msgText(sh2), mode: hw.mode, channel: hw.body.channel, keys: Object.keys(hw.body.configInfo) });
  must(hw.body.channel === "huawei" && hw.mode === "add", "华为应新增保存");
  must(hw.body.configInfo.keyId === "k1" && hw.body.configInfo.subAccount === "317654321" && /BEGIN PRIVATE KEY/.test(hw.body.configInfo.privateKey) && hw.body.configInfo.projectId === "", "华为 JSON 没有拆成四个字段：" + JSON.stringify(hw.body.configInfo));
  await agc.screenshot({ path: path.join(SHOTS, "06-huawei-captured.png") });

  // 8. 应用宝：单段——本页读 access_secret + 登录信息取 userId → 直接保存（后端不验活）
  const CORS = { "access-control-allow-origin": "https://app.open.qq.com", "access-control-allow-credentials": "true", "access-control-allow-headers": "*", "access-control-allow-methods": "POST,GET,OPTIONS" };
  await ctx.route("https://p.open.qq.com/**", (route) => route.request().method() === "OPTIONS"
    ? route.fulfill({ status: 204, headers: CORS })
    : route.fulfill({ contentType: "application/json", headers: CORS, body: JSON.stringify({ ret: 0, data: { total: 0, list: [] } }) }));
  await ctx.route("https://app.open.qq.com/**", (route) => {
    const u = route.request().url();
    if (u.includes("/apply_signature/apply_api/request")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ret: 0, msg: "", data: { secret: "8f4c5dc2d0474226ac44e5c2af0691c7" } }) });
    if (u.includes("/cgi-bin/")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ret: 0, msg: "", data: { userId: "7157850727738201088", name: "上海和住信息科技有限公司", registerStatus: 1 } }) });
    return route.fulfill(html(fixture("tencent.html")));
  });
  step("open-console qq", { url: await openFromPlatform(platform, "qq") });
  const tc = await ctx.newPage();
  await tc.goto("https://app.open.qq.com/p/developer/team_manage/apply_api");
  await tc.waitForSelector("#apkgo-assistant-root", { state: "attached", timeout: 10000 });
  await tc.waitForTimeout(1200);
  const sh3 = await shadow(tc);
  await openPanel(sh3); await tc.waitForTimeout(500);
  const before = (await received()).length;
  must(await oneClick(sh3), "应用宝一键按钮不可点");
  await tc.waitForTimeout(2500);
  recv = await received();
  const qq = recv[recv.length - 1];
  const navBtn = await sh3(`(sr) => !!sr.querySelector('[data-nav]')`);
  const qqMsg = await msgText(sh3);
  step("qq one-click", { msg: qqMsg, newSubmissions: recv.length - before, navBtn, channel: qq.body.channel, configInfo: qq.body.configInfo });
  must(!navBtn, "应用宝不该再有「去应用列表页」按钮");
  must(recv.length === before + 1 && qq.body.channel === "qq" && qq.body.configInfo.userId === "7157850727738201088" && qq.body.configInfo.accessSecret.length === 32, "应用宝没把 userId / accessSecret 保存到平台");
  must(!("app_id_map" in qq.body.configInfo), "应用宝不该再有 app_id_map");
  must(/暂不支持在线验证/.test(qqMsg), "应用宝应提示不支持在线验证：" + qqMsg);
  await tc.screenshot({ path: path.join(SHOTS, "08-qq.png") });

  // 9. 弹窗：已连接、六家、没有 apkgo 文案
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${new URL(sw.url()).host}/src/popup/popup.html`);
  await popup.waitForTimeout(600);
  const pop = { conn: await popup.locator("#conn").innerText(), stores: await popup.locator("#stores").innerText(), body: await popup.locator("body").innerText() };
  step("popup", { conn: pop.conn, stores: pop.stores });
  must(/已连接 · 张三/.test(pop.conn), "弹窗应显示已连接与用户名");
  must(["华为", "小米", "OPPO", "vivo", "荣耀", "应用宝"].every((n) => pop.stores.includes(n)) && !/apkgo/i.test(pop.body), "弹窗商店列表或文案不对");
  await popup.screenshot({ path: path.join(SHOTS, "04-popup.png") });
  out.ok = true;
} catch (e) {
  out.ok = false; out.error = String(e && e.stack || e); console.error(out.error);
} finally {
  await ctx.close();
  fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.join(HERE, "../../dist/e2e-result.json"), JSON.stringify(out, null, 2));
  console.log(out.ok ? "E2E_OK" : "E2E_FAIL");
}
```

- [ ] **Step 4: 跑 e2e**

Run: `npx playwright install chromium`（只需一次）然后 `npm run e2e`
Expected: 逐步打印 `• …`，最后 `E2E_OK`。`dist/shots/` 里有 `00-launcher.png`、`01-panel-no-owner.png`、`01-panel.png`、`03-saved.png`、`05-huawei-filled.png`、`06-huawei-captured.png`、`08-qq.png`、`04-popup.png`。

失败时先看 `dist/e2e-result.json` 的 `error` 与最后一个 `step`；常见原因：
- `no owner context` 失败 → Task 4 的 `canSave` 没接到一键按钮的 `disabled`。
- `token refreshed` 的 `auth` 不是 `Bearer at-2` → Task 2 的 424 分支或 Task 3 的 `submit` 没走 `APKGO_PLATFORM.request`。
- `huawei saved` 的 keys 里有 `serviceAccountJson` → Task 5 华为 `finalize` 没被调用（检查 Task 4 submit 里 `recipe.finalize`）。

- [ ] **Step 5: 提交**

```bash
git add test/e2e/fake_platform.py test/e2e/run.mjs test/e2e/e2e.mjs
git commit -m "test(e2e): 伪 apkgo 改为伪配置平台；覆盖无主体、add→edit、令牌刷新、华为拆字段、应用宝单段"
```

---

### Task 8: 平台前端 密钥配置弹窗接入助手

**Files:**（仓库 `~/workspace/front/new_configuration`，分支 `feat/key-assistant`）
- Create: `src/utils/keyAssistant.js`
- Modify: `src/views/application/mainMap/components/SecretDialog.vue`

**Interfaces:**
- Consumes: 扩展 bridge 协议（Task 3）：页 → 扩 `hello` / `pair {accessToken, refreshToken, userName}` / `open-console {store, owner}`；扩 → 页 `ready {version, paired}` / `paired {paired}` / `error {message}` / `open-console-ok {store}`；`paired = { origin, userName, pairedAt }`
- Consumes: `store.state.common.token = { access_token, refresh_token, … }`（`src/store/modules/common.js`）；`localStorage.userInfo.nickName`（登录与刷新都写）
- Produces: `keyAssistant.js` 导出 `hello()`、`pair()`、`openConsole(channel, owner)`、`listen(handler) → unlisten`

- [ ] **Step 1: 切分支**

```bash
cd ~/workspace/front/new_configuration && git checkout master && git pull --ff-only && git checkout -b feat/key-assistant
```

- [ ] **Step 2: 写 `src/utils/keyAssistant.js`**

```js
// 与浏览器扩展「密钥助手」之间的桥：扩展在本页注入 bridge.js，双方用 window.postMessage 通信。
// 页面侧 source 固定为 'apkgo-web'，扩展侧为 'apkgo-assistant'（扩展内部标识符，不随产品名变）。
import store from '@/store'

const PAGE = 'apkgo-web'
const EXT = 'apkgo-assistant'

function post(msg) {
  window.postMessage({ source: PAGE, ...msg }, location.origin)
}

function currentUserName() {
  try {
    const info = JSON.parse(localStorage.getItem('userInfo') || '{}')
    return (info && info.nickName) || ''
  } catch (e) {
    return ''
  }
}

// 问一声扩展在不在；装了会回 ready
export function hello() {
  post({ type: 'hello' })
}

// 把当前登录用户的 token 交给扩展；扩展会先用它调一次只读接口验证，再落盘
export function pair() {
  const token = store.state.common.token || {}
  post({
    type: 'pair',
    accessToken: token.access_token || '',
    refreshToken: token.refresh_token || '',
    userName: currentUserName()
  })
}

// 让扩展打开该渠道的后台并带上主体；扩展面板据此知道存到哪个主体
export function openConsole(channel, owner) {
  post({ type: 'open-console', store: channel, owner })
}

// 监听扩展回包。handler 收到 { type: 'ready'|'paired'|'error'|'open-console-ok', ... }；返回解绑函数
export function listen(handler) {
  const fn = e => {
    if (e.source !== window || e.origin !== location.origin) return
    const d = e.data
    if (!d || d.source !== EXT) return
    handler(d)
  }
  window.addEventListener('message', fn)
  return () => window.removeEventListener('message', fn)
}
```

- [ ] **Step 3: 改 `SecretDialog.vue`**

整个换成：

```vue
<template>
  <div>
    <CustomDialog :title="`密钥配置 — 主体：${owner}`" width="900px" :visible="active" :confirm="false" @cancel="closed">
      <div class="assistant-bar">
        <span class="assistant-dot" :class="assistant"></span>
        <span class="assistant-text">{{ assistantText }}</span>
        <el-button size="mini" type="primary" plain :disabled="assistant === 'none'" @click="connect">
          {{ assistant === 'paired' ? '重新连接' : '连接助手' }}
        </el-button>
        <span class="assistant-tip">装了「密钥助手」浏览器扩展后点「连接助手」，再在渠道行点「助手采集」，即可在商店后台一键取回密钥并存到本主体。</span>
      </div>
      <el-table :data="rows" border v-loading="loading" size="small">
        <el-table-column label="渠道" align="center" width="170">
          <template #default="scope">
            {{ scope.row.label }} <span style="color: #909399; font-size: 12px">{{ scope.row.value }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" align="center" width="110">
          <template #default="scope">
            <el-tag :type="scope.row.config ? 'success' : 'info'" size="small">
              {{ scope.row.config ? '已配置' : '未配置' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" align="center" width="190">
          <template #default="scope">
            {{ scope.row.config ? formatTime(scope.row.config.updateTime) : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" align="center">
          <template #default="scope">
            <el-button type="success" size="mini" :disabled="assistant !== 'paired'" @click="collect(scope.row)">助手采集</el-button>
            <template v-if="scope.row.config">
              <el-button type="warning" size="mini" @click="editConfig(scope.row)">编辑</el-button>
              <el-button type="danger" size="mini" @click="delConfig(scope.row)">删除</el-button>
            </template>
            <el-button v-else type="primary" size="mini" @click="editConfig(scope.row)">配置</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div style="margin-top: 12px; font-size: 12px; color: #909399">每个主体每个渠道仅一条凭证记录。助手采集完成后回到本页会自动刷新。</div>
    </CustomDialog>
    <SecretFormDialog ref="SecretFormDialog" @saved="getTableData" />
  </div>
</template>

<script>
import SecretFormDialog from './SecretFormDialog.vue'
import { OPEN_PLATFORM_CHANNELS } from './openPlatformChannels'
import { ownerOpenPlatformConfigList, ownerOpenPlatformConfigDel } from '@/api/productConfig'
import { hello, pair, openConsole, listen } from '@/utils/keyAssistant'
export default {
  components: { SecretFormDialog },
  data() {
    return {
      active: false,
      owner: '',
      ownerEmail: '',
      loading: false,
      configList: [],
      // 浏览器扩展「密钥助手」：none 未检测到 / unpaired 已安装未连接 / paired 已连接
      assistant: 'none',
      assistantUser: '',
      unlisten: null
    }
  },
  computed: {
    rows() {
      return OPEN_PLATFORM_CHANNELS.map(channel => ({
        ...channel,
        config: this.configList.find(item => item.channel === channel.value)
      }))
    },
    assistantText() {
      if (this.assistant === 'paired') return `密钥助手已连接 · ${this.assistantUser || '当前用户'}`
      if (this.assistant === 'unpaired') return '密钥助手已安装，未连接'
      return '未检测到密钥助手扩展'
    }
  },
  methods: {
    async init(owner, ownerEmail) {
      this.owner = owner
      this.ownerEmail = ownerEmail || ''
      this.configList = []
      this.active = true
      this.startAssistant()
      await this.getTableData()
    },
    // 弹窗打开期间监听扩展回包与页面可见性；hello 一声看扩展在不在
    startAssistant() {
      this.stopAssistant()
      this.assistant = 'none'
      this.assistantUser = ''
      this.unlisten = listen(this.onAssistant)
      document.addEventListener('visibilitychange', this.onVisible)
      hello()
    },
    stopAssistant() {
      if (this.unlisten) this.unlisten()
      this.unlisten = null
      document.removeEventListener('visibilitychange', this.onVisible)
    },
    onAssistant(d) {
      if (d.type === 'ready' || d.type === 'paired') {
        this.assistant = d.paired ? 'paired' : 'unpaired'
        this.assistantUser = (d.paired && d.paired.userName) || ''
        if (d.type === 'paired') this.$message.success('密钥助手已连接')
      } else if (d.type === 'error') {
        this.$message.error(d.message || '密钥助手出错')
      } else if (d.type === 'open-console-ok') {
        const channel = OPEN_PLATFORM_CHANNELS.find(item => item.value === d.store)
        this.$message.info(`已打开${channel ? channel.label : d.store}后台，采集完成后回到本页会自动刷新`)
      }
    },
    connect() {
      pair()
    },
    collect(row) {
      openConsole(row.value, this.owner)
    },
    // 从商店后台切回来时刷新列表，助手刚存的记录就能看到
    onVisible() {
      if (document.visibilityState === 'visible' && this.active) this.getTableData()
    },
    async getTableData() {
      this.loading = true
      try {
        const { data } = await ownerOpenPlatformConfigList({ owner: this.owner, page: 1, size: 100 })
        // 后端 owner 为模糊查询,前端再精确过滤一次
        this.configList = (data.content || []).filter(item => item.owner === this.owner)
      } finally {
        this.loading = false
      }
    },
    formatTime(time) {
      return time ? String(time).replace('T', ' ') : '-'
    },
    editConfig(row) {
      this.$refs.SecretFormDialog.init({
        owner: this.owner,
        ownerEmail: this.ownerEmail,
        channel: row.value,
        config: row.config
      })
    },
    delConfig(row) {
      this.$confirm(`确认删除主体「${this.owner}」的 ${row.label} 渠道凭证?`, '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async () => {
        const res = await ownerOpenPlatformConfigDel({ id: row.config.id })
        if (res.code === 200) {
          this.$message.success('删除成功')
        }
        this.getTableData()
      })
    },
    closed() {
      this.active = false
      this.stopAssistant()
    }
  }
}
</script>

<style lang="scss" scoped>
.assistant-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 12px;
}
.assistant-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #c0c4cc;
  flex-shrink: 0;
}
.assistant-dot.unpaired {
  background: #e6a23c;
}
.assistant-dot.paired {
  background: #67c23a;
}
.assistant-text {
  font-weight: 600;
  color: #303133;
}
.assistant-tip {
  color: #909399;
  margin-left: auto;
}
</style>
```

- [ ] **Step 4: lint**

Run: `cd ~/workspace/front/new_configuration && npm run lint -- --no-fix`
Expected: 没有 error（warning 若来自这两个文件也修掉；其他文件原有的 warning 不管）。

- [ ] **Step 5: 手工验证（该仓库没有自动化测试）**

1. 扩展仓库先把 Task 1–7 的改动加载进 Chrome（`chrome://extensions` → 加载已解压 → 选扩展仓库目录）。清单里有 `http://localhost/*`，本地前端能被识别。
2. `npm run dev`，登录，进「主体」页，点某个主体的「密钥配置」。
3. 状态条应显示「密钥助手已安装，未连接」（黄点）；点「连接助手」→ 变成「密钥助手已连接 · <昵称>」（绿点），右上 toast「密钥助手已连接」。
4. 每行「助手采集」变可点；点 OPPO 行的「助手采集」→ 新标签打开 OPPO 后台，toast「已打开OPPO后台…」；扩展面板顶部显示「将保存到主体：<该主体>」。
5. 在扩展未安装的浏览器（或禁用扩展）打开同一弹窗：灰点「未检测到密钥助手扩展」，「连接助手」与「助手采集」都禁用。
6. 从后台标签切回平台标签：网络面板里能看到重新请求了配置列表。

把上述 6 项的结果写进提交说明或 PR 描述。

- [ ] **Step 6: 提交**

```bash
cd ~/workspace/front/new_configuration
git add src/utils/keyAssistant.js src/views/application/mainMap/components/SecretDialog.vue
git commit -m "feat(密钥配置): 接入密钥助手扩展——连接助手、助手采集带主体、回到前台自动刷新"
```

---

## 完成后的人工校准（不进 CI，按 spec 第 8.2 节）

1. 用真实账号在六家后台各走一遍「助手采集 → 一键获取密钥」，保存到 `http://192.168.1.18:16003`，回到弹窗看到该渠道「已配置」。后端验活通过即说明字段映射与内置公钥都正确。
2. 小米：做一次「重置私钥并重新保存」，确认走的是 edit（弹窗里更新时间变化）。
3. 让 access_token 过期（等待或后台吊销）后再保存一次，确认扩展自动续期；吊销 refresh_token 后再保存，确认面板提示「连接已失效」且弹窗里状态回到「未连接」。
4. 前端发版前把扩展 zip（`python3 scripts/build.py`）交给使用者，README 的安装步骤照做一遍。
