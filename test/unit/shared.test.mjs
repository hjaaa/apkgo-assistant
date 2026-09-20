import { test } from "node:test";
import assert from "node:assert/strict";
import { loadScripts, fakeChrome } from "./load.mjs";

const { get } = loadScripts(["src/recipes.js", "src/shared.js"], { chrome: fakeChrome() });
const APKGO = get("APKGO");

test("DEFAULT_ORIGIN 指向配置平台", () => {
  assert.equal(APKGO.DEFAULT_ORIGIN, "http://inner.dreamplatform.cn:18003");
});

test("platformSecretPage：不带主体是主体页，带主体直接弹出该主体的密钥配置", () => {
  assert.equal(APKGO.platformSecretPage(""), "http://inner.dreamplatform.cn:18003/#/application/mainMap");
  assert.equal(
    APKGO.platformSecretPage("安徽逐梦", "http://localhost:9090"),
    "http://localhost:9090/#/application/mainMap?owner=%E5%AE%89%E5%BE%BD%E9%80%90%E6%A2%A6&openSecret=1",
  );
});

test("KEY_OWNER 按商店分开", () => {
  assert.equal(APKGO.KEY_OWNER("oppo"), "owner:oppo");
});

test("recipeById 只认渠道值本身（大小写与空白归一），不再有别名", () => {
  assert.equal(APKGO.recipeById(" OPPO ").id, "oppo");
  assert.equal(APKGO.recipeById("harmony"), null);
  assert.equal(APKGO.recipeById(""), null);
});

test("errorHint 已删除（后端报错直接透传）", () => {
  assert.equal(APKGO.errorHint, undefined);
});
