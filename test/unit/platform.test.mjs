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

test("0.5.0 的旧配对记录视为未配对，并被清除", async () => {
  const { calls, chrome, P } = setup([]);
  await chrome.storage.local.set({ paired: { origin: "https://apkgo.baici.tech", apiKey: "apkgo_x", orgId: 1, orgName: "某组织", pairedAt: 1 } });
  const r = await P.request("/x");
  assert.equal(r.ok, false);
  assert.equal(r.status, 0);
  assert.match(r.error, /连接助手/);
  assert.equal(calls.length, 0);
  assert.equal(chrome.storage.local.data.paired, undefined);
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
