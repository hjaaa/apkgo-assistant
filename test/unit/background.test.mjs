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

test("pair：缺 token / 来源不一致 / 来源缺失 都拒绝，不落盘", async () => {
  const { chrome, call } = setup([]);
  let r = await call({ type: "pair", accessToken: "", refreshToken: "rt", userName: "x", origin: ORIGIN });
  assert.equal(r.ok, false); assert.match(r.error, /登录令牌/);
  r = await call({ type: "pair", accessToken: "at", refreshToken: "rt", userName: "x", origin: ORIGIN }, { url: "http://evil.test/" });
  assert.equal(r.ok, false); assert.match(r.error, /来源/);
  r = await call({ type: "pair", accessToken: "at", refreshToken: "rt", userName: "x", origin: ORIGIN }, {});
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
