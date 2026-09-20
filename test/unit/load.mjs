// 把扩展的经典脚本（非 module）拼成一个函数体，在宿主 realm 里编译执行。
// 用宿主 realm（而不是 vm.createContext 的独立 realm）是为了让脚本造出来的对象/数组
// 带的是宿主的 Object/Array 原型——否则 assert/strict 的深比较会连原型一起比，
// 结构完全相同也判不等。顶层 const 不会挂到 global 上，所以用 get(表达式) 取值。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

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

// files：相对仓库根的脚本路径，按顺序拼接；globals：作为函数参数注入（chrome、fetch…）。
export function loadScripts(files, globals = {}) {
  const seen = new Set();
  // background.js 用 importScripts 引其他脚本，这里把它们的源码就地内联到同一个作用域。
  const expand = (f) => {
    if (seen.has(f)) return "";
    seen.add(f);
    return fs.readFileSync(path.join(ROOT, f), "utf8").replace(
      /^[ \t]*importScripts\(([^)]*)\);?[ \t]*$/m,
      (_, args) => args.split(",").map((s) => expand("src/" + s.trim().replace(/^["']|["']$/g, ""))).join("\n"),
    );
  };
  const names = Object.keys(globals);
  const body = files.map(expand).join("\n;\n") + "\n;return (expr) => eval(expr);";
  const get = vm.compileFunction(body, names, { filename: files.join("+") })(...names.map((n) => globals[n]));
  return { get };
}
