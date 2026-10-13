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
  assert.match(h.validate({ serviceAccountJson: JSON.stringify({ key_id: "k", sub_account: "sa" }) }), /private_key.*生成公私钥/);
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
