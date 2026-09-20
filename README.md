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

1. 登录配置平台（`http://inner.dreamplatform.cn:18003`），进「主体」页，点某个主体的「密钥配置」。弹窗顶部点 **「连接助手」**：网页把你当前的登录令牌交给扩展，扩展用它调一次只读接口确认可用。令牌过期扩展会自己续，失效了回来再点一次即可。
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

清单里的配置平台地址有三条：生产 `http://inner.dreamplatform.cn:18003/*`、内网联调 `http://192.168.1.18:16003/*`、本地前端 `http://localhost/*`。
扩展不写死用哪个——你在哪个地址的密钥配置弹窗点「连接助手」，之后就往哪个地址存。配对记录只有一条，换一个地址点一次「连接助手」即覆盖，同时只有最后一次生效；当前连的是哪个，扩展弹窗第二行有显示。

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
