// 把扩展的经典脚本（非 module）装进一个 vm 上下文里跑单测。
// 顶层 const 不会挂到 global 上，所以用 get(表达式) 取值。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

// 内存版 chrome.storage.local / session。data 直接暴露，方便断言。
export function fakeStorageArea() {
  const data = {};
  return {
    data,
    async get(keys) {
      const list = keys == null ? Object.keys(data) : Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const k of list) if (k in data) out[k] = data[k];
      return out;
    },
    async set(obj) { Object.assign(data, obj); },
    async remove(keys) { for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k]; },
    async clear() { for (const k of Object.keys(data)) delete data[k]; },
    async setAccessLevel() {},
  };
}

// 假 chrome：只实现扩展脚本加载与被测路径用到的部分。listeners 记录 addListener 注册的回调。
export function fakeChrome() {
  const listeners = {};
  const on = (name) => ({ addListener(fn) { (listeners[name] ||= []).push(fn); } });
  return {
    listeners,
    runtime: { getManifest: () => ({ version: "0.6.0-test" }), onMessage: on("runtime.onMessage"), lastError: null, sendMessage() {} },
    storage: { local: fakeStorageArea(), session: fakeStorageArea() },
    tabs: {
      onUpdated: on("tabs.onUpdated"), onActivated: on("tabs.onActivated"),
      created: [],
      async create(o) { this.created.push(o); return { id: 7, url: o.url }; },
      async sendMessage() { return { ok: true }; }, async get() { return {}; }, async query() { return []; },
    },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {}, setTitle() {} },
    downloads: { onCreated: on("downloads.onCreated") },
    scripting: { async executeScript() {} },
  };
}

// files：相对仓库根的脚本路径，按顺序执行；globals：注入上下文的全局对象（chrome、fetch…）。
export function loadScripts(files, globals = {}) {
  const ctx = vm.createContext({ console, URL, URLSearchParams, setTimeout, clearTimeout, ...globals });
  const run = (f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  // background.js 用 importScripts 引其他脚本，这里让它在同一个上下文里执行。
  ctx.importScripts = (...names) => names.forEach((n) => run("src/" + n));
  for (const f of files) run(f);
  return { ctx, get: (expr) => vm.runInContext(expr, ctx) };
}
