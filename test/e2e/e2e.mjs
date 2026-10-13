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
const step = (name, data) => { out.steps.push({ ...data, name }); console.log("•", name, JSON.stringify(data)); };
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
    const r = await cdp.send("Runtime.callFunctionOn", { objectId: object.objectId, functionDeclaration: `function(...a){ return (${fnSrc})(this, ...a); }`, arguments: args.map((v) => ({ value: v })), returnByValue: true, awaitPromise: true, userGesture: true });
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

  // 7. 华为：新版开发者级独立表单；同一 iframe 导航与 iframe 替换均须捕获。
  const HDC_ENTRY = "https://developer.huawei.com/consumer/cn/hdc-console/index.html#/home/101653523124950083";
  await ctx.route("https://developer.huawei.com/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const file = path === "/consumer/cn/hdc-console/index.html" ? "hdc-outer.html"
      : /^\/consumer\/cn\/consoleIframe\/api\/credentials\/[01]$/.test(path) ? "hdc-credentials.html"
      : path === "/consumer/cn/consoleIframe/api/addServiceAccountKeys/0/developer/0" ? "hdc-service-account.html" : null;
    return file ? route.fulfill(html(fixture(file))) : route.abort();
  });
  const huaweiErrors = [];
  async function huaweiCase(name, scenario, check) {
    const page = await ctx.newPage();
    try {
      await page.goto(HDC_ENTRY.replace("index.html#", `index.html?case=${scenario}#`));
      await page.waitForSelector("#apkgo-assistant-root", { state: "attached", timeout: 10000 });
      const sh = await shadow(page);
      const inner = page.frameLocator("iframe");
      const until = async (fn, message) => {
        const end = Date.now() + 15000;
        while (Date.now() < end) { if (await fn()) return; await page.waitForTimeout(100); }
        throw new Error(message);
      };
      const prepare = async () => {
        await openPanel(sh);
        await until(async () => !(await oneClickDisabled(sh)), "华为一键按钮一直不可用");
        must(await oneClick(sh), "无法启动华为准备");
        await inner.locator("app-service-account-add").waitFor({ timeout: 15000 });
      };
      await check({ page, sh, inner, prepare, until });
      step(name, { passed: true });
    } catch (e) {
      huaweiErrors.push(`${name}: ${e.message || e}`);
      console.error("HUAWEI_CASE_FAIL", name, String(e));
    } finally { await page.close(); }
  }
  // 尚未从伪平台开启过华为渠道，此临时浏览器的 owner:huawei 为空。
  await huaweiCase("huawei no owner or collection intent", "normal", async ({ page, sh, inner }) => {
    await inner.locator("#developer-tab").waitFor();
    await page.waitForTimeout(300);
    must(!(await inner.locator("body").evaluate((body) => !!body.ownerDocument.defaultView.__apkgoDownloadHook)), "未打开助手时不能自动安装采集钩子");
    await openPanel(sh);
    must(await oneClickDisabled(sh), "没有主体时一键必须禁用");
    must(/没有主体上下文/.test(await panelText(sh)), "没有主体时应提示回配置平台");
    must((await page.evaluate(() => window.__huawei.confirm)) === 0, "没有主体时不能确认");
  });

  step("open-console huawei", { url: await openFromPlatform(platform, "huawei") });
  for (const mode of ["navigate", "replace"]) {
    const agc = await ctx.newPage();
    await agc.goto(HDC_ENTRY.replace("index.html#", `index.html?mode=${mode}#`));
    await agc.waitForSelector("#apkgo-assistant-root", { state: "attached", timeout: 10000 });
    const sh2 = await shadow(agc);
    await openPanel(sh2);
    const beforeHw = (await received()).length;
    must(await oneClick(sh2), "华为一键按钮不可点");
    const inner = agc.frameLocator("iframe");
    await inner.locator("app-service-account-add").waitFor({ timeout: 15000 });
    await agc.waitForFunction(() => window.__huawei.generate === 1, null, { timeout: 15000 }).catch(async (e) => { throw new Error(`${e.message}; Huawei preparation: ${await msgText(sh2)}; counts: ${JSON.stringify(await agc.evaluate(() => window.__huawei))}`); });
    await agc.waitForFunction(() => document.querySelector('iframe').contentDocument.querySelector('textarea').value === 'FAKE_PUBLIC_KEY');
    const prepared = await agc.evaluate(() => window.__huawei);
    must(prepared.confirm === 0 && prepared.wrongCreate === 0 && prepared.hookReady, "华为准备不能确认或点错区域，生成前捕获必须就绪");
    must((await received()).length === beforeHw, "用户确认前不能向配置平台保存");
    must(await inner.locator('input[placeholder="请输入名称"]').inputValue() === "apkgo", "名称未填写");
    await agc.screenshot({ path: path.join(SHOTS, `05-huawei-${mode}-filled.png`) });
    const dl = agc.waitForEvent("download", { timeout: 10000 });
    await inner.locator("#confirm").click();
    step("huawei browser download", { mode, file: (await dl).suggestedFilename() });
    await agc.waitForTimeout(1500);
    recv = await received();
    const hw = recv[recv.length - 1];
    must(recv.length === beforeHw + 1 && hw.body.channel === "huawei" && hw.body.owner === OWNER, "华为应恰保存一条到目标主体");
    must(hw.body.configInfo.keyId === "k1" && hw.body.configInfo.subAccount === "317654321" && /BEGIN PRIVATE KEY/.test(hw.body.configInfo.privateKey) && hw.body.configInfo.projectId === "", "华为 JSON 未正确拆分四字段");
    must(/在线验证通过/.test(await msgText(sh2)), "华为保存后应显示成功");
    const draft = await sw.evaluate(async () => (await chrome.storage.session.get('draft:huawei'))['draft:huawei']);
    must(draft === undefined, "华为成功后应清除草稿");
    step("huawei saved", { mode, action: hw.mode, channel: hw.body.channel });
    await agc.screenshot({ path: path.join(SHOTS, `06-huawei-${mode}-captured.png`) });
    await agc.close();
  }

  // 注入失败必须停在确认前，不能只依据公钥非空继续。
  await sw.evaluate(() => { globalThis.__savedExecuteScript = chrome.scripting.executeScript; chrome.scripting.executeScript = async () => { throw new Error("Simulated injection failure"); }; });
  try {
    const failedHook = await ctx.newPage();
    await failedHook.goto(HDC_ENTRY);
    await failedHook.waitForSelector("#apkgo-assistant-root", { state: "attached", timeout: 10000 });
    const failedShadow = await shadow(failedHook); await openPanel(failedShadow);
    const beforeHook = (await received()).length;
    must(await oneClick(failedShadow), "华为钩子失败测试无法启动");
    await failedHook.frameLocator("iframe").locator("app-service-account-add").waitFor({ timeout: 15000 });
    await failedHook.waitForTimeout(500);
    const counts = await failedHook.evaluate(() => window.__huawei);
    must(counts.generate === 0 && counts.confirm === 0 && (await received()).length === beforeHook, "捕获注入失败不能生成、确认或保存");
    must(/下载捕获/.test(await msgText(failedShadow)), "注入失败应给出捕获提示");
    step("huawei injection rejected", { stopped: true });
    await failedHook.close();
  } finally {
    await sw.evaluate(() => { chrome.scripting.executeScript = globalThis.__savedExecuteScript; delete globalThis.__savedExecuteScript; });
  }

  await huaweiCase("huawei missing private key rejected", "missing-private", async ({ page, sh, inner, prepare, until }) => {
    const before = (await received()).length;
    await prepare();
    await until(() => inner.locator("textarea").inputValue().then(Boolean), "公钥未生成");
    await inner.locator("#confirm").click();
    await until(async () => /private_key.*生成公私钥/.test(await msgText(sh)), "缺私钥未显示生成提示");
    must((await received()).length === before, "缺私钥 JSON 不能保存");
    must(await sh(`(sr) => sr.querySelector('details.manual').open`), "缺私钥时应展开手动恢复入口");
    must(!(await oneClickDisabled(sh)), "缺私钥不能停留在正在保存状态");
    const draft = await sw.evaluate(async () => (await chrome.storage.session.get('draft:huawei'))['draft:huawei']);
    must(!!draft.config.serviceAccountJson, "非法下载应保留给用户核对");
    await sw.evaluate(async () => chrome.storage.session.remove('draft:huawei'));
  });

  let rejectNext = true;
  const savePattern = /^http:\/\/localhost:9090\/api\/product\/owner-open-platform-config\/(?:add|edit)$/;
  await ctx.route(savePattern, (route) => {
    if (route.request().postDataJSON().channel === "huawei" && rejectNext) {
      rejectNext = false;
      return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: 400, msg: "模拟保存失败", data: null }) });
    }
    return route.continue();
  });
  try {
    await huaweiCase("huawei save retry without new credential", "normal", async ({ page, sh, inner, prepare, until }) => {
      await prepare();
      await until(() => inner.locator("textarea").inputValue().then(Boolean), "公钥未生成");
      await inner.locator("#confirm").click();
      await until(async () => /模拟保存失败/.test(await msgText(sh)), "未显示保存失败");
      const draft = await sw.evaluate(async () => (await chrome.storage.session.get('draft:huawei'))['draft:huawei']);
      must(!!draft.config.serviceAccountJson, "保存失败应保留文件草稿");
      must(await sh(`(sr) => sr.querySelector('details.manual').open`), "保存失败应展开手动恢复");
      const beforeRetry = (await received()).length;
      await sh(`(sr) => sr.querySelector('[data-act="save"]').click()`);
      await until(async () => /在线验证通过/.test(await msgText(sh)), "重试保存未成功");
      must((await received()).length === beforeRetry + 1, "重试应恰好提交一次");
      const counts = await page.evaluate(() => window.__huawei);
      must(counts.generate === 1 && counts.confirm === 1, "重试不能再生成或创建凭据");
      const json = JSON.stringify({ key_id: 'k1', sub_account: '317654321', private_key: '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----' });
      for (let i = 0; i < 3; i++) await inner.locator("body").evaluate((body, text) => body.ownerDocument.defaultView.postMessage({ source: "apkgo-assistant-hook", type: "download", name: "duplicate.json", mime: "application/json", text }, "*"), json);
      await page.waitForTimeout(300);
      must((await received()).length === beforeRetry + 1, "重复下载不能再次保存");
      const after = await sw.evaluate(async () => (await chrome.storage.session.get('draft:huawei'))['draft:huawei']);
      must(after === undefined, "已保存的下载不能重新填入草稿");
    });
  } finally { await ctx.unroute(savePattern); }

  await huaweiCase("huawei manual JSON fallback and dedup", "normal", async ({ page, sh, inner, until }) => {
    await openPanel(sh);
    await sh(`(sr) => { sr.querySelector('details.manual').open = true; }`);
    const json = JSON.stringify({ key_id: 'manual-k', sub_account: 'manual-sa', private_key: '-----BEGIN PRIVATE KEY-----\nMANUAL\n-----END PRIVATE KEY-----' });
    const chooserPromise = page.waitForEvent("filechooser", { timeout: 5000 });
    await sh(`(sr) => sr.querySelector('input[data-file="serviceAccountJson"]').click()`);
    const chooser = await chooserPromise;
    await chooser.setFiles({ name: "manual.json", mimeType: "application/json", buffer: Buffer.from(json) });
    await until(async () => {
      const d = await sw.evaluate(async () => (await chrome.storage.session.get('draft:huawei'))['draft:huawei']);
      return d?.config.serviceAccountJson === json;
    }, "手动文件未进入草稿");
    const before = (await received()).length;
    await sh(`(sr) => sr.querySelector('[data-act="save"]').click()`);
    await until(async () => (await received()).length === before + 1, "手动文件未保存成功");
    const receivedManual = await received();
    must(receivedManual.length === before + 1 && receivedManual.at(-1).body.configInfo.keyId === "manual-k", "手动导入未正确保存");
    must((await page.evaluate(() => window.__huawei.generate + window.__huawei.confirm)) === 0, "手动导入不能创建凭据");
    await until(async () => /在线验证通过/.test(await msgText(sh)), "手动保存成功应显示结果");
    await inner.locator("body").evaluate((body, text) => body.ownerDocument.defaultView.postMessage({ source: "apkgo-assistant-hook", type: "download", name: "manual.json", mime: "application/json", text }, "*"), json);
    await page.waitForTimeout(300);
    must((await received()).length === before + 1, "手动导入后重复下载不能保存");
    const draft = await sw.evaluate(async () => (await chrome.storage.session.get('draft:huawei'))['draft:huawei']);
    must(draft === undefined, "手动保存成功后重复下载不能恢复草稿");
  });

  for (const [scenario, error] of [["unknown-public", /公钥/], ["extra-role", /角色/], ["unknown-role", /角色|APP管理员/], ["generation-failed", /公钥|生成/]]) {
    await huaweiCase(`huawei stop ${scenario}`, scenario, async ({ page, sh, prepare, until }) => {
      const before = (await received()).length;
      await prepare();
      await until(async () => error.test(await msgText(sh)), "失败未显示对应提示");
      const counts = await page.evaluate(() => window.__huawei);
      must(counts.confirm === 0 && counts.wrongCreate === 0 && (await received()).length === before, "非法状态不能确认或保存");
      if (scenario !== "generation-failed") must(counts.generate === 0, "非法已有公钥或角色不能生成");
    });
  }
  await huaweiCase("huawei changed public key rejected", "normal", async ({ page, sh, inner, prepare, until }) => {
    await prepare(); await until(() => inner.locator("textarea").inputValue().then(Boolean), "公钥未生成");
    await inner.locator("textarea").fill("CHANGED_PUBLIC_KEY");
    await openPanel(sh);
    await sh(`(sr) => { sr.querySelector('details.manual').open = true; sr.querySelector('[data-action="open-create"]').click(); }`);
    await until(async () => /公钥.*修改/.test(await msgText(sh)), "修改公钥后未停止准备");
    const counts = await page.evaluate(() => window.__huawei);
    must(counts.generate === 1 && counts.confirm === 0, "修改公钥后不能重生成或确认");
    // 同一文档的 SPA 新建视图：替换表单根节点，不能复用旧表单的生成记录。
    await inner.locator("app-service-account-add").evaluate((old) => {
      const next = old.ownerDocument.createElement("app-service-account-add");
      next.append(...old.childNodes); old.replaceWith(next); next.querySelector("textarea").value = "";
    });
    await sh(`(sr) => sr.querySelector('[data-action="open-create"]').click()`);
    await until(async () => (await page.evaluate(() => window.__huawei.generate)) === 2, "新的空白表单应允许重新生成");
    must((await page.evaluate(() => window.__huawei.confirm)) === 0, "新的表单仍不能自动确认");
  });
  if (huaweiErrors.length) throw new Error(huaweiErrors.join("\n"));

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
