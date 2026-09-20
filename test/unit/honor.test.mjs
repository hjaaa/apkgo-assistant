// 荣耀：一键获取密钥应当先取用后台已有的凭据，没有才调 genAuthenticate 新生成。
// genAuthenticate 是纯生成接口，每调一次后台就多一对凭据，所以「有没有复用」要盯住。
//
// 后台的三个接口（2026-09-20 在真实后台抓到）：
//   GET /portal/auth/csrf?withSite=true              取 csrf token
//   GET /portal/auth/queryAuthenticate/2             列已有凭据；clientSecret 是掩码，只有 id 有用
//   GET /portal/common/getOriginalData?...&id=N      用 id 换那条的明文 clientSecret
//   POST /portal/auth/genAuthenticate                新生成一对
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadScripts, fakeChrome } from "./load.mjs";

const CSRF = "https://developer.honor.com/portal/auth/csrf?withSite=true";
const LIST = "https://developer.honor.com/portal/auth/queryAuthenticate/2";
const GEN = "https://developer.honor.com/portal/auth/genAuthenticate";
const reveal = (id) => `https://developer.honor.com/portal/common/getOriginalData?bizType=authenticate_clientSecret_info&id=${id}&fieldName=clientSecret&pageName=%2Fcn%2FmanageCenter%2Fcertificate`;

const NEW_ID = "newclientid0000000000000000000a";
const NEW_SECRET = "newclientsecret00000000000000b";
const MASK = "*".repeat(32);
const rec = (id, clientId) => ({ id, clientId, clientSecret: MASK, type: 2 });

// 每个用例自己定：列表返回什么、哪条 id 能换出明文
let list = [];
let secrets = {};
let calls = [];
let href = "https://developer.honor.com/cn/manageCenter/certificate";

const { get } = loadScripts(["src/recipes.js", "src/shared.js"], {
  chrome: fakeChrome(),
  location: { get href() { return href; } },
  fetch: async (url) => {
    const u = String(url);
    calls.push(u);
    const ok = (data) => ({ ok: true, json: async () => ({ code: "200", msg: "success", data }) });
    if (u.includes("/auth/csrf")) return ok({ csrfToken: "tok" });
    if (u.includes("/auth/queryAuthenticate/2")) return ok(list);
    if (u.includes("/common/getOriginalData")) {
      const id = /[?&]id=([^&]+)/.exec(u)[1];
      return id in secrets
        ? ok(secrets[id])
        : { ok: true, json: async () => ({ code: "BE000401", msg: "无权限" }) };
    }
    if (u.includes("/auth/genAuthenticate")) return ok({ clientId: NEW_ID, clientSecret: NEW_SECRET });
    throw new Error("意外的请求 " + u);
  },
});
const honor = get("APKGO_RECIPES").find((r) => r.id === "honor");

function run({ isReset = false } = {}) {
  const h = { draft: { config: {} }, isReset, docs: () => [], byText: () => null, highlight: () => {}, textOf: () => "" };
  return honor.actions["fetch-key"](h).then((msg) => ({ msg, config: h.draft.config }));
}
const called = (u) => calls.some((c) => c === u || c.startsWith(u.split("?")[0] + "?"));

test("后台已有凭据且明文能取回：直接取用，不调 genAuthenticate", async () => {
  calls = []; list = [rec(6212, "existingclientid000000000000001")]; secrets = { 6212: "existingsecret0000000000000002" };
  const { msg, config } = await run();
  assert.deepEqual(config, { clientId: "existingclientid000000000000001", clientSecret: "existingsecret0000000000000002" });
  assert.equal(called(GEN), false, "不该生成新凭据");
  assert.ok(called(LIST) && called(reveal(6212)));
  assert.match(msg, /现有的 API 凭据/);
});

test("后台一条凭据都没有：才新生成一对", async () => {
  calls = []; list = []; secrets = {};
  const { msg, config } = await run();
  assert.deepEqual(config, { clientId: NEW_ID, clientSecret: NEW_SECRET });
  assert.ok(called(GEN));
  assert.match(msg, /已新生成/);
});

test("有凭据但明文取不回：停下来报错，不闷声新建，也绝不把掩码存进去", async () => {
  calls = []; list = [rec(6212, "existingclientid000000000000001")]; secrets = {}; // 换明文一律 BE000401
  const h = { draft: { config: {} }, isReset: false, docs: () => [], byText: () => null, highlight: () => {}, textOf: () => "" };
  await assert.rejects(() => honor.actions["fetch-key"](h), /没能复用.*明文取不回.*BE000401 无权限/s);
  assert.ok(called(reveal(6212)), "得先试过换明文");
  assert.equal(called(GEN), false, "这一次不该新建");
  assert.deepEqual(h.draft.config, {});
  // 用户再点一次 = 确认要新建
  calls = [];
  const again = await honor.actions["fetch-key"](h);
  assert.match(again, /已新生成/);
  assert.deepEqual(h.draft.config, { clientId: NEW_ID, clientSecret: NEW_SECRET });
  assert.ok(called(GEN));
});

test("查列表就失败：也要停下报错，不能当成「后台没凭据」去新建", async () => {
  calls = []; list = null; secrets = {}; // list=null → queryAuthenticate 返回非数组，视为失败
  const h = { draft: { config: {} }, isReset: false, docs: () => [], byText: () => null, highlight: () => {}, textOf: () => "" };
  await assert.rejects(() => honor.actions["fetch-key"](h), /没能复用.*查不到已有凭据/s);
  assert.equal(called(GEN), false, "查不到列表时不该新建");
});

test("多条凭据：跳过换不出明文的，用第一条能换出来的", async () => {
  calls = [];
  list = [rec(6212, "newerclientid00000000000000001"), rec(6098, "olderclientid00000000000000002")];
  secrets = { 6098: "oldersecret000000000000000003" };
  const { config } = await run();
  assert.deepEqual(config, { clientId: "olderclientid00000000000000002", clientSecret: "oldersecret000000000000000003" });
  assert.equal(called(GEN), false);
});

test("「重新生成并保存」(isReset)：跳过复用，连列表都不查，直接生成", async () => {
  calls = []; list = [rec(6212, "existingclientid000000000000001")]; secrets = { 6212: "existingsecret0000000000000002" };
  const { config } = await run({ isReset: true });
  assert.deepEqual(config, { clientId: NEW_ID, clientSecret: NEW_SECRET });
  assert.equal(called(LIST), false);
  assert.ok(called(GEN));
});

test("未登录：先报错，不复用也不生成", async () => {
  calls = []; href = "https://developer.honor.com/cn/login"; list = []; secrets = {};
  await assert.rejects(() => run(), /尚未登录/);
  assert.deepEqual(calls, []);
  href = "https://developer.honor.com/cn/manageCenter/certificate";
});
