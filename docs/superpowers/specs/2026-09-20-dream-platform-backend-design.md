# 扩展后端切换为配置平台（dream-product OwnerOpenPlatformConfig）设计文档

- 日期：2026-09-20
- 分支：main
- 状态：设计已确认，待出实施计划

## 1. 背景与目标

扩展目前把各商店后台采集到的 API 密钥保存到 apkgo cloud（`POST /openapi/v1/credentials`，`X-API-Key` 鉴权）。我们的发布链路用的是自己的配置平台：dream-product 的 `owner_open_platform_config` 表（主体 + 渠道 → 凭证 JSON），前端入口是 `front/new_configuration` 的"主体 → 密钥配置"弹窗。

目标：扩展采集侧（配方、面板、抓下载、页面接口直取）全部保留，只把"后端客户端"这一层换成配置平台，并在平台前端的密钥配置弹窗接入"连接助手 / 助手采集"入口。

非目标：

- 不改 dream-product 后端（现有 add / edit / get / list 接口已够用，保存时的在线验活沿用）。
- 不保留 apkgo 作为可选后端，整体替换。
- 不改代码标识符（`APKGO` 全局对象、`apkgo-assistant-*` 的 DOM id 与 postMessage source、动画名、zip 名），只改面向用户的名称与文案。

## 2. 已确认的决策

| 事项 | 决定 |
| --- | --- |
| 鉴权 | 平台网页在"连接助手"时把当前登录用户的 `access_token` + `refresh_token` 交给扩展；扩展像 SPA 一样带 `Bearer` 直连网关，过期用 `refresh_token` 续 |
| 主体来源 | 从平台密钥配置弹窗的「助手采集」按钮带过来（`{store, owner}`），面板只读展示；无主体上下文时不能保存 |
| 小米公钥 | 对所有开发者相同，作为常量内置在小米配方里，保存时自动带上；由使用者提供 `dev.api.public.cer` 内容 |
| 改动范围 | 扩展 + 平台前端（`front/new_configuration`），后端不动 |
| 平台地址 | `http://192.168.1.18:16003`，写死在清单；另保留 `http://localhost/*` 供本地联调；将来有线上地址再加一行 |
| 字段映射 | 配方字段 key 直接改成 dream 各渠道 Config 类的属性名（驼峰），配方即契约 |
| 命名文案 | 扩展改名"密钥助手"；用户可见文案里的 apkgo 全部换成"配置平台" |

## 3. 目标接口（dream-product，经网关）

网关前缀由平台 nginx 转发：前端 `baseURL: '/api'`，扩展同样用 `{origin}/api/...`。

| 用途 | 方法与路径 | 说明 |
| --- | --- | --- |
| 配对验证 | `GET /api/product/owner-open-platform-config/list?page=1&size=1` | 只读，确认 token 可用 |
| 查已有 | `GET /api/product/owner-open-platform-config/get?owner=&channel=` | `data` 为 null 表示没有 |
| 新增 | `POST /api/product/owner-open-platform-config/add` | body `{owner, channel, configInfo}` |
| 修改 | `PUT /api/product/owner-open-platform-config/edit` | body `{id, owner, channel, configInfo}` |
| 刷新 token | `POST /api/auth/oauth2/token` | 表单 `grant_type=refresh_token&scope=server&refresh_token=…`，头 `Authorization: Basic ZHJlYW06ZHJlYW0=`；响应 `data.access_token`（与前端 `utils/auth.js` 同款） |

响应约定：HTTP 2xx 且 `body.code === 200` 为成功，`body.data` 为数据；否则错误文案取 `body.msg`。HTTP 424 表示 token 过期需刷新，401 表示失效需重新登录（与前端 `utils/request.js` 同款）。

渠道取值与 `configInfo` 结构（对应 `dream-product-api` 的 `api.dto.openplatform`）：

| channel | configInfo 字段 | 备注 |
| --- | --- | --- |
| huawei | keyId, privateKey, subAccount, projectId（可空） | 来自 AGC 下载的 `*_private.json` |
| xiaomi | userName, privateKey, publicKey | publicKey 内置 |
| oppo | clientId, clientSecret | |
| vivo | accessKey, accessSecret | |
| honor | clientId, clientSecret | |
| qq | userId, accessSecret | 后端对该渠道不验活（UNSUPPORTED 放行） |

唯一键是 (owner, channel)；同键重复 add 会报"该主体渠道的开放平台配置已存在!"，所以扩展保存前先 get，存在则 edit。

## 4. 数据流

### 4.1 连接（平台"密钥配置"弹窗 → 扩展）

1. 弹窗打开时发 `hello`；扩展 bridge 回 `ready {version, paired}`，弹窗据此显示"未检测到扩展 / 未连接 / 已连接 · 用户名"。
2. 点「连接助手」：网页发 `pair {accessToken, refreshToken, userName}`。bridge 强制 origin 等于当前页面 origin（现有安全边界不变），后台再校验一次 sender origin。
3. 后台用该 token 调配对验证接口；成功则把 `{origin, accessToken, refreshToken, userName, pairedAt}` 存入 `chrome.storage.local`，回 `paired`；失败回 `error` 且不落盘。

### 4.2 跳转采集（弹窗每个渠道行「助手采集」）

1. 网页发 `open-console {store, owner}`，`store` 就是渠道值（huawei / xiaomi / oppo / vivo / honor / qq）。
2. 后台在 `chrome.storage.session` 写 `pendingStore = store` 与 `owner:{store} = owner`，打开该配方的 `console` 地址。
3. 面板初始化时读 `owner:{store}`：有则顶部只读显示"将保存到主体：X"；无则"一键获取密钥"与"保存"置灰，提示"回配置平台的密钥配置弹窗点「助手采集」"。

### 4.3 保存与验证

1. 面板按配方 `fields` 收集 `config`，跑 `validate` / `finalize` 得到 `configInfo`，发后台 `submit {store, owner, config}`。
2. 后台：`channel = recipe.id`；先 `get`，有记录则 `edit` 带 id，否则 `add`。
3. 后端保存时在线验活，通过才落库，因此"保存成功 = 验证通过"；`qq` 例外，面板提示"已保存，应用宝暂不支持在线验证"。
4. 成功后清空草稿，显示"已保存到配置平台，X 在线验证通过"，附链接 `{origin}/#/application/mainMap?owner={owner}&openSecret=1`（该路由已支持按 query 打开密钥配置弹窗）。
5. 失败直接展示后端 `msg`（如"凭证验证未通过: …""渠道接口异常,暂时无法验证凭证,请稍后重试: …"）；HTTP 401 或刷新失败时清除配对并提示"连接已失效，请回配置平台重新连接"。

### 4.4 token 刷新

`platformFetch` 收到 424 → 调 `refreshAccessToken`（单飞：并发请求共用同一个刷新 Promise）→ 更新 `storage.local` 里的 `accessToken`（响应若带新 `refresh_token` 也一并更新）→ 用新 token 重试原请求一次；刷新失败按 401 处理。

## 5. 扩展改动明细

### 5.1 `manifest.json`

- `name` / `short_name` / `default_title` 改"密钥助手"，`description` 改为"在华为、小米、OPPO、vivo、荣耀、应用宝开发者后台里一键取回 API 密钥，直接保存到配置平台并在线验证。只连配置平台。"
- `host_permissions`：六家商店域名不变；`https://apkgo.baici.tech/*` 换成 `http://192.168.1.18:16003/*`；保留 `http://localhost/*`。
- 删除 `optional_host_permissions`。
- bridge 那条 `content_scripts` 的 `matches` 改为 `http://192.168.1.18:16003/*` 与 `http://localhost/*`。
- `version` 升 `0.6.0`（`package.json` 同步）。

### 5.2 `src/background.js`

- `apkgoFetch` 换成 `platformFetch(path, init)`：基址 `p.origin + "/api"`，头 `Authorization: Bearer …`，JSON body；成功判定与错误文案见第 3 节；424 走刷新重试；401 清配对。
- 新增 `refreshAccessToken()`（单飞）。
- handlers：
  - `state`：返回 `{version, paired: {origin, userName, pairedAt}}`；删 `hostGranted`。
  - `pair({accessToken, refreshToken, userName, origin})`：三者非空字符串校验、origin 与 sender 一致、配对验证接口通过后落盘。
  - `unpair`：不变。
  - 删除 `apps`。
  - `submit({store, owner, config})`：owner 非空；get → add/edit（两者后端都只返回布尔值，没有 id）；返回 `{ok, saved: {verified: channel !== "qq"}}`。
  - `openConsole({store, owner, url})`：多写 `owner:{store}`；没有 owner 时不写（弹窗"前往后台"入口就是这种情况）。
  - `injectHook`、`openPanel`、徽标逻辑不变，徽标 title 改"密钥助手 · X后台"。

### 5.3 `src/content/bridge.js`

- `pair`：转发 `accessToken` / `refreshToken` / `userName`。
- `open-console`：转发 `store` / `owner`。
- 其余（同源校验、`ready` 主动上报）不变。

### 5.4 `src/shared.js`

- `DEFAULT_ORIGIN` 改 `http://192.168.1.18:16003`；新增 `KEY_OWNER(storeId)`（session 里按商店存主体）与 `platformSecretPage(owner, origin)` 生成主体页深链。
- 删 `errorHint`。
- `recipeById` 去掉别名表（网页发的就是渠道值），保留大小写与空白归一。

### 5.5 `src/content/console.js`

- 状态：删 `draft.label` / `draft.appId` / `apps`；新增 `owner`（从 `storage.session` 读 `owner:{recipe.id}`）。
- 渲染：删备注名输入与关联应用下拉；连接行显示"已连接配置平台 · 用户名"；新增主体行；无主体或未连接时一键 / 保存按钮禁用并给提示。
- 提交：`submit` 发 `{store, owner, config}`；成功 / 失败文案与链接见 4.3；HTTP 401 时 `paired = null`。
- 进度条默认文案 `saving: "保存到配置平台并验证"`。
- 向导额外字段的特判 `f.key !== "private_key"` 改为 `"privateKey"`。
- `ingestDownload` 里"刚才已经保存到 apkgo 了"等文案改"配置平台"。

### 5.6 `src/recipes.js`

- 文件头注释：字段 `key` 必须等于 dream-product 对应渠道 Config 类的属性名。
- 删除 meizu / samsung / appstore / googleplay 四份配方。
- 顶部新增常量 `XIAOMI_PUBLIC_KEY`（裸 base64，去掉 PEM 头尾与换行；内容由使用者提供）。
- 各配方：

| 配方 | 改动 |
| --- | --- |
| huawei | 字段改为 `{key: "serviceAccountJson", kind: "file-text", required, capture: {name: /\.json$/i, mime: /json/i}}`；`validate(cfg)`：解析 JSON，缺 `key_id` / `private_key` / `sub_account` 任一即返回错误文案；`finalize(config)`：返回 `{keyId, privateKey, subAccount, projectId}`，兼容驼峰与下划线两种 JSON 键（与前端 `SecretFormDialog.handleFileChange` 同规则） |
| xiaomi | `email` → `userName`，`private_key` → `privateKey`，actions / preload / detect 内引用同步；`finalize` 加 `publicKey: XIAOMI_PUBLIC_KEY`；prereq 文案"公钥由助手内置" |
| oppo | `client_id` → `clientId`，`client_secret` → `clientSecret`，actions 引用同步 |
| vivo | `access_key` → `accessKey`，`access_secret` → `accessSecret`，actions 引用同步 |
| honor | `client_id` → `clientId`，`client_secret` → `clientSecret`，actions 引用同步 |
| tencent → qq | `id` 改 `qq`；`user_id` → `userId`，`access_secret` → `accessSecret`；删两个 `__tencent_*` 虚拟字段、`validate`、`flowPages`、`fetch-apps`、`finalize`；`flow` 改 `["fetch-key"]`；`progressOrder` 改 `["goto", "filling", "saving", "done"]`；`fetch-key` 取不到开发者 ID 时沿用现有回退（提示在手动模式里填 User ID）；steps / progressLabels / wizardHint / prereq 去掉第二段与 App ID 的描述 |

- 所有配方文案里的 apkgo 改"配置平台"。

### 5.7 `src/popup/popup.html` / `popup.js`

- 标题"密钥助手"。
- 连接区：未连接显示"还没连接配置平台"与"打开配置平台去连接"链接（指向 `{DEFAULT_ORIGIN}/#/application/mainMap`）；已连接显示"已连接 · 用户名"、origin、断开按钮；删"允许访问"按钮与相关提示。
- 前往后台区：只列六家（`verified` 过滤保留），删"其余商店请在 apkgo 添加页手动添加"提示。
- 页脚：删 GitHub 与隐私说明链接，保留"只连配置平台，不连任何第三方"。

### 5.8 文档

- `README.md`：按新后端重写——支持的商店与一键方式（保留）、安装（改为"用 `python3 scripts/build.py` 打包后内部分发，手动加载"）、使用（连接助手 / 助手采集 / 一键 / 结果）、一键原理（保留）、写配方（字段 key 改为 dream 属性名，示例更新）、安全与隐私（网络去向改平台地址 + 商店后台）、开发与 e2e。
- `PRIVACY.md`：网络去向、token 存储与清除方式。
- `CHANGELOG.md`：`0.6.0` 条目，说明后端切换、字段改名、应用宝改单段、删四份配方、改名。

### 5.9 不动的文件

`src/content/sniff-main.js`、`src/content/panel-style.js`（apkgo 只出现在标识符、注释与动画名）、`scripts/build.py`（zip 名保留 `apkgo-assistant-{version}.zip`）、`.github/workflows/release.yml`、`store/`（已过时，暂不删）。

## 6. 平台前端改动（`front/new_configuration`）

### 6.1 新增 `src/utils/keyAssistant.js`

封装与扩展的 postMessage 协议，页面侧 `source: "apkgo-web"`，扩展侧 `source: "apkgo-assistant"`：

- `hello()`：发 `{type: "hello"}`。
- `pair()`：从 `store.state.common.token` 取 `access_token` / `refresh_token`，从 `localStorage.userInfo` 的 `nickName` 取用户名（登录与刷新都会写这个键；无则空串），发 `{type: "pair", accessToken, refreshToken, userName}`。
- `openConsole(store, owner)`：发 `{type: "open-console", store, owner}`。
- `listen(handler)`：只接收 `e.source === window && e.origin === location.origin && e.data.source === "apkgo-assistant"` 的消息，分发 `ready` / `paired` / `error` / `open-console-ok`；返回解绑函数。

### 6.2 `SecretDialog.vue`

- 表格上方加状态条：`extension: "none" | "unpaired" | "paired"`，文案分别为"未检测到密钥助手扩展"、"已安装，未连接"、"已连接 · 用户名"；右侧「连接助手」按钮（`none` 时禁用，`paired` 时显示"重新连接"）。
- 弹窗 `init` 时状态重置为 `none` 并发 `hello`；收到 `ready` 才变为 `unpaired` / `paired`。
- 操作列每行加「助手采集」按钮（`paired` 时可用），点击发 `open-console(row.value, this.owner)`；收到 `error` 时 `$message.error`。
- 弹窗打开期间监听 `visibilitychange`，回到前台时 `getTableData()`；`closed` 时解绑。
- `SecretFormDialog.vue`（手动路径）与 `api/productConfig.js` 不动。

## 7. 错误处理与安全

- 扩展持有的 token 与网页 cookie `user_type` 里的是同一把，存 `chrome.storage.local`；断开、401、刷新失败即清除。商店密钥草稿仍只在 `chrome.storage.session`，保存成功立即清除。
- 扩展对外网络去向只有两处：平台地址（`background.js` 一个文件）与各商店后台自己的域名（配方内），与现状一致。
- 后端报错文案直接透传，不再二次映射；扩展日志不打印 token、密钥、含 secret 的 URL。
- 刷新 token 单飞、只重试一次；`submit` 在面板层已有 `busy` 互斥。
- bridge 只回应同 window、同源、`source === "apkgo-web"` 的消息；`pair` 的 origin 由 bridge 与后台各校验一次。
- 面板在没有主体上下文时拒绝保存，避免误存到错误主体。

## 8. 测试

### 8.1 自动化（`npm run e2e`）

`test/e2e/fake_apkgo.py` 改名 `fake_platform.py`，提供：

- `GET /`（含 `#/application/mainMap`）：模拟弹窗协议的页面，暴露 `window.__pair(token)`、`window.__openConsole(store, owner)`、`window.__state`。
- `POST /api/auth/oauth2/token`：校验 Basic 头与 `grant_type=refresh_token`，返回新 access_token。
- `GET /api/product/owner-open-platform-config/list`、`/get`、`POST /add`、`PUT /edit`：内存表，按 (owner, channel) 唯一；`add` 撞键返回 HTTP 400 与 `{code: 400, msg: "该主体渠道的开放平台配置已存在!"}`。
- `POST /__expire-next`：测试控制端点，让下一次带 Bearer 的业务请求返回 424 一次，用于验证刷新重试。
- `GET /__received`：返回收到的 add / edit 记录。

`e2e.mjs` 用例顺序：配对 → OPPO 一键（走 add，断言 `configInfo.clientId` / `clientSecret`）→ 再点一次一键（走 edit，断言带 id）→ 调 `/__expire-next` 后再保存一次（断言扩展刷新 token 后成功、`/__received` 多一条 edit）→ 华为一键（代填、模拟点确认、抓下载，断言 `configInfo.keyId` 等四字段）→ 应用宝单段（断言 `configInfo.userId` / `accessSecret`，无第二段导航按钮）→ 无主体上下文打开 OPPO 后台（断言一键按钮禁用）→ 弹窗截图。

### 8.2 人工校准

- 六家真实后台各走一遍，保存到 `http://192.168.1.18:16003`，在平台弹窗里看到"已配置"；后端验活通过即字段映射正确。
- 小米：内置公钥是否正确以后端验活通过为准。
- 前端：`npm run serve` 手工过状态条三种状态、「助手采集」跳转、回到前台自动刷新。

## 9. 使用者需提供 / 假设

- 需提供：小米 `dev.api.public.cer` 文件内容。
- 假设：`16003` 的 nginx 把 `/api` 转到网关（前端已依赖）；`dream:dream` 客户端可用于 refresh_token 授权（前端已依赖）；网关 424 = 过期、401 = 失效（前端已依赖）。

## 10. 提交拆分

扩展仓库按实施计划的任务逐个提交（单测基座与 shared → platform.js → background/bridge/manifest → console → recipes → popup 与文档 → e2e，共七笔）；前端仓库一笔：密钥配置弹窗接入助手。
