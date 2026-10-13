# 华为新版凭证页面适配实施计划

> **面向执行 agent：**按任务使用 `superpowers:executing-plans`（本计划建议）或 `superpowers:subagent-driven-development` 实施；用户已选择 Native。使用下方复选框记录进度，用户已选择 Native；真实创建与保存仍等待目标确认。

**目标：**恢复华为渠道在新版开发者中心的凭证采集，完成开发者级服务账号表单填写、公私钥生成、用户确认、JSON 捕获及配置平台保存。

**架构：**保留当前 MV3 扩展、渠道配方和配置平台保存链路。在华为配方中适配新版入口与独立表单，通过已有下载钩子获取凭据文件；公共面板仅补充华为需要的 iframe 生命周期处理和捕获就绪接口。

**技术栈：**经典 JavaScript 脚本、Chrome MV3、Node 内置 test runner、已有 Playwright 1.59.1、Python 构建脚本；不新增依赖。

**设计依据：**本文件“已确认设计基线”一节，整理自 2026-10-13 本聊天中用户采用的方案；执行者应先阅读该节。方案已采用并完成本地实现及模拟验证，真实创建和保存的主体尚未确认。

## 全局约束

- 仅适配华为渠道；不修改其他五家渠道的配方、鉴权规则或业务流程。
- 保留小米现有改动，包括 `src/recipes.js` 中的小米差异与未跟踪文件 `test/unit/xiaomi.test.mjs`；不整文件暂存 `src/recipes.js`。
- 保留 `serviceAccountJson` 采集字段以及输出 `keyId / privateKey / subAccount / projectId`，不修改配置平台接口、表结构、权限、manifest 权限或下载消息格式。
- 由华为页面生成公私钥，不引入自有密码学实现，不读取已有服务账号的私钥，不自动向已有服务账号添加密钥。
- 最终「确认」由用户点击；真实创建与配置平台保存前，分别核对账号、主体和操作目标并取得用户确认。
- 真实验收允许用户一次明确确认“在账号 A 创建凭据并保存到主体 B 的华为渠道”；若目的主体或新增/覆盖目标发生变化，重新确认。
- 中文说明、注释、提交信息；英文代码标识符。日志不输出私钥、完整 JSON、平台令牌或公钥内容。
- 不重构公共流程、不新增框架、不升级版本、不上传发布扩展、不自动删除或停用任何现有凭据。
- 测试仅使用伪平台、拦截页面和虚构凭据；真实凭据不得进入测试夹具、Git、报告或截图。

## 审查重点

1. 页面默认处于项目级，且多处都有「创建」：必须选开发者级并定位服务账号区域，测试归属任务 1、2。
2. iframe 同一元素发生导航，或元素被替换：新文档必须重新注入钩子和绑定监听，不能按旧 WindowProxy 判定已绑定，测试归属任务 2。
3. 表单已有公钥或角色状态不确定：不能重生成配对或默默扩大权限，测试归属任务 1、3。
4. 生成按钮点击后尚未完成、钩子未就绪或下载缺少私钥：不能进入成功状态或向平台保存，测试归属任务 1、2、3。
5. 同一 JSON 多次到达、后端拒绝保存、手动文件导入：只保存一次，失败保留草稿，重试不创建新凭据，测试归属任务 3。

## 已确认设计基线

### 范围与事实

- 用户已采用“新版开发者级凭证表单自动填写＋生成公私钥＋用户确认＋捕获 JSON”的方案，要求先制定实施计划，保留小米改动，真实创建和保存时再确认主体。
- 2026-10-13 在用户登录的 Chrome 中，旧助手跳到 `/consumer/cn/service/josp/agc/index.html#/ups/9249519184595983326` 后被重定向回新版页面，采集未完成。
- 新版外层入口：`https://developer.huawei.com/consumer/cn/hdc-console/index.html#/home/101653523124950083`。
- 已观察的同源 iframe：项目级列表 `/consumer/cn/consoleIframe/api/credentials/1`，开发者级列表 `/consumer/cn/consoleIframe/api/credentials/0`，开发者级创建表单 `/consumer/cn/consoleIframe/api/addServiceAccountKeys/0/developer/0`。这些是页面识别证据，不通过直接设置 iframe URL 绕过页面导航。
- 页签为「开发者级凭证 / 项目级凭证 / 应用级凭证」；创建界面标题为「创建服务账号凭证」，字段包含凭证名称、凭证级别、角色、描述、公钥和「生成公私钥」按钮。
- 点击生成按钮后已观察到公钥填入；尚未点击创建确认，因此未实测新 JSON 内容、文件名、下载时机或服务端在线验证。
- [华为 API 服务操作指南](https://developer.huawei.com/consumer/cn/doc/start/api-0000001062522591)（页面显示更新于 2026-01-15）说明：生成公私钥后创建并下载 JSON；未点击生成按钮时 JSON 不含私钥。其菜单及按钮文案与当前页面有差异，交互定位以当前页面为准。

### 最终行为

1. 一键采集进入新版入口，选开发者级，等待服务账号列表，再打开该区域的创建表单。
2. 仅为空名称填 `apkgo`、为空描述填「用于配置平台的华为渠道 API 调用」（本计划的实现选择）；不覆盖用户已有输入。只自动勾选 APP管理员，不选其他角色；其他角色已选中时提示用户核对，停止自动准备。
3. 在创建表单新文档上确认下载钩子与消息监听就绪，再调用华为的生成按钮，等待公钥非空，并确认开发者级和 APP管理员均处于选中状态。
4. 同一个存活的表单文档中，助手已成功生成且公钥未被修改时，再次准备复用此次结果，不重新生成。已有公钥但无法确认生成来源，或者已生成公钥被修改时停止，提示返回新建空白表单或导入完整 JSON；不假设“公钥非空”就代表 JSON 会包含私钥。
5. 高亮「确认」，收起面板，等待用户确认。自动准备动作绝不调用创建确认按钮；不设置定时任务代点确认。
6. 捕获下载 JSON，校验必需字段并保存。缺私钥时提示先在华为表单生成公私钥；不能只从列表拼出 keyId、凭证ID 或 API Key 代替完整凭据。
7. 保存失败打开已有手动模式并保留文件草稿；用户点已有「保存到配置平台并验证」重试，不能通过重新执行创建流程恢复保存。成功沿用原有草稿清理与去重。
8. 保留手动 JSON 文件导入作为捕获失败的回退。网页切换导致生成记录丢失时不尝试恢复页面内部私钥，重新准备需由用户主动操作。

### 代码边界与基线

当前 HEAD：`72a06d4e9d75cdffdd0f582ae3a844ecafb7855d`。起始 `git status --short`：

```text
 M src/recipes.js
?? test/unit/xiaomi.test.mjs
```

已检查 `git diff -- src/recipes.js`：现有差异属于小米的邮箱/私钥账号一致性修复。执行时先保存该差异的本地副本，不能恢复、覆盖、合并提交或取消暂存用户的小米改动。可在 `/tmp` 保存文件副本及差异，避免写入项目产物。

起始 SHA-256：

- `src/recipes.js`：`f7fd8a402b05b0119a7ecd9ea6580c8c1cf7cedd1eb00693df445dc83e9caf73`。
- `test/unit/xiaomi.test.mjs`：`d327422291971e124fb0e2fe9245d4d51584c9efac776393d526dc88f22d58fb`。

执行后 `src/recipes.js` 整文件哈希会变化，必须另外比较 `id: "xiaomi"` 起至文件末尾的字节与执行前副本；该比较同时保护其他五家配方。小米测试整文件哈希应保持一致。若用户期间修改这些文件，以新的用户状态为准并说明差异，不覆盖它们。

2026-10-13 已运行 `npm test`：53 项通过，0 项失败，包含未提交的小米测试。这只是实现前单测基线，不代表新版华为或真实后台验收通过。

## 文件分工

| 文件 | 计划操作 | 职责 |
| --- | --- | --- |
| `src/recipes.js` | 修改华为配方与华为 JSON 校验 | 新入口、表单准备、生成、华为文案 |
| `src/content/console.js` | 局部修改 | 暴露捕获就绪接口，华为 iframe 生命周期处理 |
| `test/unit/huawei.test.mjs` | 新建 | 华为配方和自动准备逻辑，使用既有 `loadScripts` 与小型 DOM/helper 桩 |
| `test/unit/recipes.test.mjs` | 修改华为断言 | 输出字段和校验回归，其余渠道断言保留 |
| `test/e2e/fixtures/hdc-outer.html` | 新建 | 新版壳、同源 iframe 和替换模式 |
| `test/e2e/fixtures/hdc-credentials.html` | 新建 | 默认项目级、开发者级、多区域创建按钮 |
| `test/e2e/fixtures/hdc-service-account.html` | 新建 | 独立表单、异步生成与虚构 JSON 下载 |
| `test/e2e/e2e.mjs` | 修改华为块 | 真实扩展在伪新版后台的端到端验证 |
| `test/e2e/fake_platform.py` | 测试支撑修复 | 使用标准库线程服务器避免空闲连接阻塞，不改变端点 |
| `README.md` | 更新华为段落 | 新入口、生成步骤和失败恢复 |

不修改 `src/background.js`、`src/platform.js`、`src/shared.js`、manifest 或小米测试；不删除旧 AGC 夹具，本次 E2E 改用新夹具即可。不存在新 CLI、对外接口或后端改动。

## 任务 1：华为配方适配新版入口和表单

**文件：**修改 `src/recipes.js:30` 的华为解析校验及 `src/recipes.js:43` 的华为配方；新增 `test/unit/huawei.test.mjs`；修改 `test/unit/recipes.test.mjs` 的华为用例。

**接口：**

- 保留 `recipe.actions["open-create"](h): Promise<string>`，`flow: ["open-create"]`，成功返回中文确认提示；失败抛 `Error`。
- 使用既有 `h.docs / byText / setInput / wait / waitFor / textOf / highlight`，新增消费 `h.ensureHook(): Promise<boolean>`（由任务 2 提供）。
- `parseHuaweiServiceAccount(text): {config}|{error}`、`recipe.validate(cfg): string`、`recipe.finalize(config)` 维持现有形状及四字段输出。
- 单测内定义 `setupHuaweiPage(options): {recipe,h,run,events,counters,form}`；`run()` 调用该配方的 open-create，`counters` 记录 `generate / confirm / serviceCreate / projectCreate / apiKeyCreate / apiClientCreate`；`form` 持有可变字段值和文档身份。options 覆盖起始页、已有输入、角色可读性、钩子结果及生成结果；helper 桩的 waitFor 不做真实等待。

入口与准备的关键断言示例（完整用例按下方步骤补齐）：

```js
const { get } = loadScripts(["src/recipes.js", "src/shared.js"], { chrome: fakeChrome() });
const recipe = get("APKGO_RECIPES").find((r) => r.id === "huawei");
const entry = "https://developer.huawei.com/consumer/cn/hdc-console/index.html#/home/101653523124950083";
assert.equal(recipe.console, entry);
assert.ok(recipe.flowPages.some((re) => re.test(entry + "?lang=zh_CN")));
assert.equal(recipe.flowPages.some((re) => re.test(entry.replace("101653523124950083", "101653523124949886"))), false);

const s = setupHuaweiPage({ page: "project-list", hookOk: true, generation: "success" });
await s.run();
assert.equal(s.counters.serviceCreate, 1);
assert.equal(s.counters.projectCreate + s.counters.apiKeyCreate + s.counters.apiClientCreate, 0);
assert.equal(s.counters.confirm, 0);
assert.ok(s.events.indexOf("hook-ready") < s.events.indexOf("generate"));
await s.run();
assert.equal(s.counters.generate, 1);
assert.equal(s.counters.confirm, 0);
```

- [x] 1. 写失败测试：`新版入口与无关查询参数可识别`。断言 `recipe.console` 为上述新版 URL；`flowPages` 接受同一凭证入口在 hash 后附 `?` 或查询参数，不匹配其他 home 页面；原域名匹配保持有效。使用 `loadScripts(["src/recipes.js", "src/shared.js"], {chrome: fakeChrome()})`，不导入新 DOM 库。
- [x] 2. 写失败测试：`默认项目级只打开开发者级服务账号创建`，让 helper 桩记录 tab/create 点击；断言项目级、API Key、API客户端的创建计数全为 0，服务账号创建恰为 1。`独立表单准备不要求 el-dialog` 断言在无弹窗的表单上可继续。
- [x] 3. 写失败测试：`钩子就绪后才生成且不点击确认`，事件记录顺序为表单就绪 → ensureHook 成功 → generate → 公钥非空 → highlight；assert `confirmClicks === 0`。同一文档重入且公钥未改动时 `generateClicks === 1`，名称/描述已有值不覆盖。
- [x] 4. 写失败测试：`未知公钥不覆盖`、`其他角色已选中停止`、`角色或级别不可确认停止`、`生成超时停止`、`钩子失败停止`；断言抛出中文错误且不确认。新增缺私钥 JSON 的专门提示测试，保留下划线/驼峰与缺其他字段原有校验。
- [x] 5. 运行 `node --test test/unit/huawei.test.mjs test/unit/recipes.test.mjs`，确认上述新版行为在旧配方上失败，并记录实际 RED 原因；不能用导入报错当作业务复现。
- [x] 6. 最小实现：更新 `console / flowPages / product / prereq / steps / wizardHint / progressLabels`；按页签、区域标题、表单标题及字段标签/placeholder 定位，确认真实 DOM 属性后选择控件，不假设旧 Element UI 类名仍成立。表单切换和生成分别使用现有 `h.waitFor`，上限 10 秒，超时反馈具体步骤；不在新表单上调用旧弹窗操作。
- [x] 7. 用华为配方闭包内的 `WeakMap<Document, string>` 记录助手本次已生成的公钥；只记录来源与值，不存储私钥。维持已填写内容规则、角色确认规则和生成顺序；不得点击最终确认。缺私钥提示为「凭据文件缺少 private_key，请在华为创建表单先点击『生成公私钥』，再确认并下载 JSON」。
- [x] 8. 运行上述定向单测，再运行 `npm test`；要求全部通过，其他渠道测试不改弱。检查 diff 仅含华为范围。
- [x] 9. 小步提交：`git add test/unit/huawei.test.mjs`，对 `src/recipes.js` 和 `test/unit/recipes.test.mjs` 使用 `git add -p`，核对 `git diff --cached` 只包含本任务；提交说明「修复华为新版凭证页面的自动准备流程」。先检查原有暂存状态，不混入用户暂存内容。

## 任务 2：跨 iframe 文档的捕获就绪与端到端主流程

**文件：**局部修改 `src/content/console.js` 的 `runAction`（约 597 行）和 `ensureHook`（约 700 行）；新增三个 HDC 夹具；替换 `test/e2e/e2e.mjs` 第 7 段华为旧夹具调用（约 128 行）。

**接口：**

- `ensureHook(): Promise<boolean>`：无 capture 字段返回 true；有 capture 字段时，注入成功且当前可访问文档均已绑定监听返回 true；失败返回 false。
- `runAction` 传给动作的 helper 对象新增 `ensureHook`，保留原属性。华为动作按任务 1 合同调用；其他渠道动作不需要改动。
- 延用后台消息 `{type:"injectHook"}`、回包 `{ok,error?}` 和 `onHookMessage(e)`，不修改主世界钩子代码或消息格式。
- 新夹具外壳保持 iframe 同源；列表和创建表单按真实已观察路径路由。模式使用夹具内部的测试参数，不成为产品配置项。

- [x] 1. 编写伪新版壳/列表/表单：默认项目级、至少两个不同区域的创建按钮、只读级别、APP管理员与其他角色、公钥、生成与确认按钮。生成异步填入虚构公钥并在页面内持有虚构私钥；仅测试模拟的用户确认点击创建下载 JSON。测试计数器记录生成次数、确认次数和错误区域点击次数，不写真实凭据。
- [x] 2. 增加华为 E2E 主场景：从伪平台携带主体打开新入口 → 一键自动进入开发者级表单 → 生成一次 → 等待确认且平台无新增请求 → 测试模拟用户点击确认 → 下载 → 保存一条华为记录。断言输出四字段、主体和渠道、成功提示，以及 `chrome.storage.session` 中 `draft:huawei` 已清除。
- [x] 3. 增加 iframe 模式：同一 iframe 元素从列表导航到创建表单，以及删除旧元素后插入新 iframe；下载前后再导航列表。每种模式均断言捕获和保存只发生一次，生成前注入完成。注入失败通过测试中 `chrome.scripting.executeScript` 拒绝来模拟，断言不生成、不确认、不保存。
- [x] 4. 运行 `npm run e2e`，检查日志及 `dist/e2e-result.json`，记录旧监听对新文档捕获失败或缺 helper 的 RED；不能仅凭进程退出码判定结果。
- [x] 5. 实现上述 `ensureHook` 返回值和 helper 暴露。对华为按当前 `Document` 记录绑定，避免 `WeakSet<Window>` 跨导航误判；同一文档监听只绑定一次。维持其他渠道原有路径。
- [x] 6. 仅华为注册 iframe `load` 监听及顶层 DOM `MutationObserver`，处理已有 iframe 和后插入/替换元素。新文档就绪后调用 ensureHook；并发调用合并，失败可再次尝试，避免递归注入。pagehide 时断开 observer 并清理监听，pageshow 从浏览器页面缓存恢复时重新绑定；跨域/已销毁文档跳过并由准备阶段报错，不轮询所有页面。
- [x] 7. 更新 E2E 路由，分别匹配 HDC 外壳、列表与创建表单，未知华为地址在测试里明确拒绝；不再把所有华为路径都返回同一夹具。保留 OPPO、应用宝与配对测试原有断言。
- [x] 8. 运行 `npm test`、`npm run e2e`；要求单测通过、日志 `E2E_OK` 且结果 `ok === true`，两个 iframe 模式均经过真实扩展。若本机 Chromium 缺失或受限，记录具体阻塞，不能降级声明端到端通过。
- [x] 9. 仅暂存本任务文件并核对 diff，提交「修复华为凭证表单切换后的下载捕获」。不整文件暂存共享配方。

## 任务 3：失败恢复、去重与其他渠道回归

**文件：**修改 `test/e2e/e2e.mjs` 的华为断言和 `hdc-service-account.html` 的测试模式。若测试暴露缺陷，仅修复 `src/recipes.js` 华为段或 `src/content/console.js` 的华为分支；已有通过行为不重写。

**接口：**使用现有 `received()` 请求记录、伪页面测试计数、面板 shadow helper、`ingestDownload(name,mime,text)` 和 `submit(capturedFp)` 行为；不增加配置平台端点。

- [x] 1. 写 E2E 失败用例：缺私钥 JSON 被拦截，add/edit 请求为 0，显示专门提示；多路径发送同一 JSON 时只新增一条配置；已保存文件重发不重新填入草稿或提交。
- [x] 2. 写保存恢复用例：Playwright 仅拦截伪平台的华为 add 请求，第一次返回现有协议 `{code:400,msg:"模拟保存失败",data:null}`；断言草稿仍存在、错误可见。用户点击手动模式已有保存按钮后第二次成功；确认和生成次数仍为 1，不重新打开创建表单。
- [x] 3. 写手动回退用例：模拟漏捕获后用 Playwright `setInputFiles` 输入内存构造的虚构 JSON，点击已有保存按钮，断言四字段正确且只保存一次。无主体场景使用新的临时浏览器上下文，不写 `owner:huawei`；一键及保存禁用且无平台写请求。
- [x] 4. 写非空公钥、生成失败/超时、角色不可确认和额外角色场景的 E2E 断言，均不确认、不保存；生成后公钥被用户修改时重新准备必须停止。重新打开空白表单允许新的一次生成，不复用失效文档记录。
- [x] 5. 运行 `npm run e2e`；记录新增用例的 RED，若既有恢复/去重已经通过则保留测试，不为制造 RED 修改代码。只有实际失败时，按复现问题做最小修复，禁止扩展公共去重/主体缓存设计。
- [x] 6. 运行 `npm test` 和完整 `npm run e2e`，检查结果文件 `ok === true`。覆盖等级说明：五家其他渠道的既有单测/配方约束保留，OPPO/应用宝既有伪后台 E2E 通过；不声称已验证另外三家真实后台。
- [x] 7. 对比执行前副本，要求 `src/recipes.js` 小米段至文件末尾字节未变，`test/unit/xiaomi.test.mjs` 哈希未变。只将本任务华为修复 hunk 与测试暂存，提交「验证华为采集失败恢复与重复下载处理」。

## 任务 4：说明、构建与最终整体审查

**文件：**更新 `README.md` 华为渠道表格、使用说明、华为自动化段落和 E2E 说明；本计划勾选已完成步骤并记录证据。构建产物仍由原脚本输出到 `dist/`。

**接口：**沿用 `npm test / npm run e2e / npm run build`，不增加 package 脚本，不改变构建版本。

- [ ] 1. 更新华为说明：新版菜单 → 开发者级 → 服务账号凭证 → 创建 → 生成公私钥 → 用户确认 → 下载捕获；失败后重试保存用已有手动模式，不重新创建。其他渠道说明不修改。
- [ ] 2. 运行 `npm test`；运行 `npm run e2e` 并执行 `node --input-type=module -e 'import fs from "node:fs"; const r=JSON.parse(fs.readFileSync("dist/e2e-result.json","utf8")); if(r.ok!==true) process.exit(1);'`，两者均通过才进入构建。
- [ ] 3. 运行 `npm run build`；检查 `dist/apkgo-assistant-0.6.0.zip` 和 `.sha256`，核对归档内华为配方/console 与当前工作区内容相同，小米配方与用户基线相同。打包会包含保留的小米改动，不能把该包描述为“只有华为变更”；Git 提交范围与工作区打包内容分别报告。
- [ ] 4. 精确暂存本任务文档，核对所有本次提交相对执行前 HEAD 的 diff 不含用户小米改动。保存未暂存小米差异，并检查没有真实密钥文件入 Git；提交「更新华为新版凭证采集说明」。
- [ ] 5. 执行最终独立整体审查。风险为权限选择、异步生命周期与外部凭据创建流程，按全局约定使用 sp-deep：`gpt-6-astra / high`、`fork_turns: "none"`。给 reviewer 本计划、执行报告、BASE/HEAD、提交 diff、未提交状态、测试证据和包内容差异说明；reviewer 只读，不自行派发。
- [ ] 6. 修复流程服从用户选择的执行技能：Native 由本会话一次修复，复现测试 RED→GREEN 与完整套件验证，不额外派发复审；SDD 按对应 task 审查轮次及最终 scoped re-review 规则。未解决问题明确列出，不凭单测通过免除审查。

## 任务 5：真实创建与保存验收关卡

**目标：**在代码、伪后台测试、构建和审查完成后验证新版真实下载与平台在线校验；此任务须等待用户届时确认，不能作为本次计划或此前采用方案的授权。

- [ ] 1. 只读确认当前安装扩展确为新包，页面入口、表单、角色和生成步骤仍匹配；旧版 AGC 不作为此次验收目标。
- [ ] 2. 向用户列明华为当前登录企业/账号、配置平台地址、目标主体、渠道 `huawei`、是否已有配置及此次保存是新增还是覆盖。上次观察到华为企业与助手携带主体名称不同，仅为提醒，不据此自动认定两者不能关联或自动选择主体。
- [ ] 3. 取得用户对具体创建和保存目标的确认；从目标主体重新点击「助手采集」，复核面板主体。预计用户点击华为确认后会自动保存，因此必须在点击前完成两项授权；若只允许创建，进入手动采集流程，确保自动保存未启用，后续保存再确认。
- [ ] 4. 助手完成自动准备，用户亲自点击华为最终确认；观察实际下载文件名、MIME、下载触发方式，仅记录字段是否存在及格式，不打印 JSON 内容或私钥。
- [ ] 5. 若新 JSON 兼容现有解析则完成在线校验和保存，检查目标主体的华为配置刷新、成功提示、草稿清除与一次保存。后端拒绝时保留草稿，不重新创建；补救保存仍遵守目标确认。
- [ ] 6. 若真实下载格式不兼容，或实际流程多出确认/协议步骤，停止自动保存，说明差异；不猜测字段映射，不转用 API Key 或 API客户端凭据，不自动签署协议。根据实际证据补齐华为范围方案和测试，涉及对外契约或权限变化时重新确认。
- [ ] 7. 分别报告单测、伪后台 E2E、构建、整体审查、真实下载、在线保存六项结果。此关卡未执行前，完成状态应是“实现与模拟验证完成，真实验收待用户确认”，不能写“华为真实后台完整跑通”。

## 执行交接与回滚

建议 Native：两个产品文件、任务之间接口紧密，主流程已有捕获/保存能力；在当前会话执行便于持续保护小米未提交内容，最后独立审查覆盖敏感部分。用户也可选择 SDD；用户已于 2026-10-13 选择 Native；按本会话实施并最终独立审查。

若需要隔离工作区，执行阶段先依 `using-git-worktrees` 检查现有 checkout。普通新 worktree 只包含提交内容，不会自动带上小米修改；必须按原字节复制配方与小米测试到执行 worktree 形成验证基线，标记用户拥有的差异，保持源 checkout 不变，不把这些差异混入华为提交。不要在规划阶段创建 worktree。

回滚仅针对本次华为提交，用可审阅的反向补丁/回滚提交，先检查共享配方是否有后续用户改动。保留用户的小米修复，不执行 reset --hard、整文件 checkout、删凭据或自动改平台配置。真实创建的服务账号不随代码回滚删除；任何删除、停用或配置覆盖都另行列清单并取得确认。

## 计划自审记录

- 已将批准方案映射到任务 1（入口、表单、生成）、任务 2（iframe 捕获）、任务 3（失败、去重、回退）、任务 4（交付与审查）、任务 5（真实验收）。
- `h.ensureHook(): Promise<boolean>` 在任务 1 消费、任务 2 实现；新生成状态仅在华为配方中按 Document 保存；输出字段、消息协议与后端路径不变。
- 五项审查重点均有对应测试步骤；新夹具包含真实已观察的独立表单和 iframe 导航，避免重复旧弹窗测试造成误判。
- 未以官方指南推断真实新 JSON 已验证；未把历史 `verified: true` 标志当作新版验收证据；未新增自动主体一致性校验业务规则。
- 规划阶段仅新增本文件；执行阶段的华为实现与验证已记录，现有小米文件和原始暂存状态保持不变。
