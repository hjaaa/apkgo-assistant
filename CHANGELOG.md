# 更新记录

## 0.6.0 · 2026-09-20

- **后端切换**：保存目标从 apkgo cloud 换成配置平台（dream-product 的主体开放平台配置）。在平台「密钥配置」弹窗点「连接助手」把登录令牌交给扩展；每个渠道行「助手采集」带着主体打开后台；保存按 (主体, 渠道) 有则改、无则增，后端在线验活通过才落库。
- 新增 `src/platform.js`：唯一的平台客户端，Bearer 请求、424 刷新重试、401 清配对。
- 配方字段 key 改为配置平台各渠道 Config 类的属性名（驼峰）。华为把下载的 JSON 拆成 keyId / privateKey / subAccount / projectId；小米内置公钥；应用宝改为单段（只取 userId 与 accessSecret）。
- 删除未验证的魅族 / Samsung / App Store / Google Play 配方；删除备注名、关联应用、可选域名授权。
- 扩展改名「密钥助手」，文案里的 apkgo 全部换成「配置平台」。
- 新增 `npm test`（Node 内置 test runner）单测；e2e 改为伪配置平台。

## 0.5.0 · 2026-09-15

- 助手只在已实登验证过的六家商店（华为、小米、OPPO、vivo、荣耀、应用宝）出现；魅族、Samsung、App Store、Google Play 不再注入，弹窗里也不列，改为引导到 apkgo 添加页手动添加。相应收窄 `host_permissions`，只申请这六家的域名。
- 新错误提示：区分「这个账号已绑在别的组织」和「这组密钥已存在」。

## 0.4.0 · 2026-09-15

- **应用宝**：支持一键获取，两段式——① 在「API发布接口」页调后台同源接口取 access_secret（只认 cookie，无签名），从页面登录信息 `$loginInfo` 取开发者 ID；② 你点一下跳到应用列表页，助手从页面自己的返回里按形状取全部应用的包名与 App ID，然后保存验证。取不到才回退到手填一行。
- 流程支持跨页续跑：`h.requestNav(url, 文案)` 让助手在面板上给一个按钮而不是自己跳走，用户点了才跳，落地后自动接着采集；配方用 `flowPages` 声明流程内的其他页面。
- 新增页面返回记录器（`world: "MAIN"` content script）：按字段名从后台自己的 JSON 返回里取值，不写死接口地址；配方新增 `h.storage()` / `h.responses()` / `h.deepFind()` / `h.scanText()` / `h.reloadAndResume()`、字段的 `auto` 标记、`validate(draft)` 钩子，`finalize` 增加第二个参数（完整草稿）。
- 网页传来的商店名支持别名（`harmony` / `harmonyos` / `hongmeng` → 华为，`google` / `play` → Google Play，`apple` / `ios` → App Store）；「前往后台」没有配方时退回网页给的 URL，并回一条 ack。
- README：各商店状态、两种一键路子（接口直取 / 代填抓下载）、配方全部可选项。

## 0.3.0 · 2026-09-11

- **小米开放平台**：支持一键获取密钥，自动提取现有凭证，无凭证时自动触发创建并引导确认，保存到 apkgo 验证。
- **OPPO 开放平台**：支持纯官方后台接口（`/myapi/server/app-list`、`/myapi/server/app-add`）极速获取或创建服务端应用凭据，直达生态应用页，零 UI 干扰。
- **vivo 开放平台**：支持纯官方接口（`/webapi/access/detail`）一键获取 Access Key 与 Access Secret，未开通时友好跳转并高亮「立即开通」。
- **荣耀开发者服务平台**：支持通过官方接口两步生成并提取 Client ID 与 Client Secret，保存至 apkgo 并验证。
- **登录状态预检**：各大平台一键获取前统一预检登录状态，未登录时给出明确提示。

## 0.2.0 · 2026-09-11

- **一键获取密钥**（华为）：跳页 → 打开创建弹窗并填好 → 用户只点「确认」→ 抓到下载的 JSON → 自动保存验证。真实 AppGallery Connect 上跑通。
- 下载自动抓取：主世界钩子（blob / `<a download>` / attachment fetch+XHR）+ `chrome.downloads` 事件，按内容去重；新增 `scripting`、`downloads` 权限。
- 面板：一键商店改成向导（备注名 + 按钮 + 五步进度），手动步骤和选文件折叠；「帮我点」执行后面板收起让位，提示挪到顶部。
- 启动按钮改成底部偏右居中的药丸（图标 + 文字），滑入 + 光环 + 弹跳，上方引导气泡；点开过就安静。
- 识别与点选支持同源 iframe（AGC 正文在 iframe 里）；值和「复制」按钮同格时也能识别。
- 华为配方按实登路径改写：`用户与访问 → API密钥 → Connect API`，角色列表异步渲染要等。
- 端到端测试进仓库：`npm run e2e`（真扩展 + 伪 apkgo + 拦截伪造的 OPPO / AGC 页）。
- 商店上架材料 `store/`、自动发布 workflow `publish.yml`。

## 0.1.0 · 2026-09-11

- 首个版本：九家商店的步骤引导，自动识别 / 点选采集，直接保存到 apkgo 并验证；与网页 postMessage 配对，密钥权限仅 `credential:create`；可复现构建。
