import { test } from "node:test";
import assert from "node:assert/strict";
import { loadScripts } from "./load.mjs";

const CURRENT_KEY = "B".repeat(48);
const OLD_KEY = "A".repeat(48);
const response = (email) => ({ ok: true, json: async () => ({ data: { email } }) });

function setup({ fetch = async () => response("current@example.com"), cookie = "mideveloper_ph=test; userId=123", config = {} } = {}) {
  const document = {
    cookie,
    querySelector: () => ({ innerText: CURRENT_KEY }),
  };
  const { get } = loadScripts(["src/recipes.js"], {
    document,
    location: { href: "https://dev.mi.com/xiaomihyperos/console/app-services/auto-publish-api" },
    fetch,
  });
  const recipe = get("APKGO_RECIPES").find((r) => r.id === "xiaomi");
  const h = { draft: { config: { ...config } }, docs: () => [document], isReset: false };
  return { recipe, h, run: () => recipe.actions["fetch-key"](h) };
}

test("小米：切换账号后重新获取邮箱，与当前页面私钥一起提交", async () => {
  let email = "previous@example.com";
  const { recipe, h, run } = setup({ fetch: async () => response(email) });
  await run();
  assert.equal(h.draft.config.userName, email);

  email = "current@example.com";
  await run();
  const config = recipe.finalize(h.draft.config);
  assert.equal(config.userName, email);
  assert.equal(config.privateKey, CURRENT_KEY);
});

test("小米：无草稿时正常获取当前邮箱与私钥", async () => {
  const { h, run } = setup();
  await run();
  assert.deepEqual(h.draft.config, { userName: "current@example.com", privateKey: CURRENT_KEY });
});

for (const [name, fetch] of [
  ["网络失败", async () => { throw new Error("Network error"); }],
  ["HTTP 失败", async () => ({ ok: false })],
  ["响应不是 JSON", async () => ({ ok: true, json: async () => { throw new SyntaxError("Invalid JSON"); } })],
  ["缺少邮箱", async () => response(undefined)],
  ["邮箱格式无效", async () => response("not-an-email")],
]) {
  test(`小米：${name}时即使有旧草稿也必须停止采集`, async () => {
    const { h, run } = setup({ fetch, config: { userName: "previous@example.com", privateKey: OLD_KEY } });
    await assert.rejects(run, /未能自动获取到开发者邮箱/);
    assert.notEqual(h.draft.config.privateKey, CURRENT_KEY, "获取邮箱失败后不能继续采集新私钥");
  });
}

for (const cookie of ["", "mideveloper_ph=test", "userId=123"]) {
  test(`小米：登录凭据不完整（${cookie || "无 Cookie"}）时不能靠旧邮箱继续采集`, async () => {
    const { run } = setup({ cookie, config: { userName: "previous@example.com", privateKey: OLD_KEY } });
    await assert.rejects(run, /尚未登录/);
  });
}
