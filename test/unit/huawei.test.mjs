import { test } from "node:test";
import assert from "node:assert/strict";
import { loadScripts, fakeChrome } from "./load.mjs";

const ENTRY = "https://developer.huawei.com/consumer/cn/hdc-console/index.html#/home/101653523124950083";

// 只模拟已核对的标签、属性和表单交互；真实 DOM 与 iframe 导航由 E2E 验证。
class Element {
  constructor(tag, text = "", attrs = {}, children = []) {
    this.tagName = tag; this.text = text; this.attrs = attrs; this.children = children;
    this.value = attrs.value || ""; this.checked = !!attrs.checked;
    this.className = attrs.class || "";
    this.classList = { contains: (s) => this.className.split(/\s+/).includes(s) };
    children.forEach((el) => { el.parentElement = this; });
  }
  get textContent() { return [this.text, ...this.children.map((el) => el.textContent)].join(" ").trim(); }
  get innerText() { return this.textContent; }
  getClientRects() { return this.attrs.hidden ? [] : [{}]; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  hasAttribute(k) { return k in this.attrs; }
  matches(selector) {
    return selector.split(",").some((part) => {
      part = part.trim();
      if (part === "*") return true;
      const attrs = [...part.matchAll(/\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g)];
      const bare = part.replace(/\[[^\]]+\]/g, "");
      const tag = bare.match(/^[\w-]+/);
      const classes = [...bare.matchAll(/\.([\w-]+)/g)];
      return (!tag || this.tagName === tag[0]) && classes.every((m) => this.classList.contains(m[1])) && attrs.every((m) => this.hasAttribute(m[1]) && (m[2] === undefined || this.getAttribute(m[1]) === m[2]));
    });
  }
  querySelectorAll(selector) { return this.children.flatMap((el) => [el, ...el.querySelectorAll("*")]).filter((el) => el.matches(selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  click() { this.onclick?.(); }
}

function setupHuaweiPage({ page = "project-list", hookOk = true, generation = "success", name = "", description = "", publicKey = "", otherRole = false, roleReadable = true, levelReadable = true } = {}) {
  const counters = { generate: 0, confirm: 0, serviceCreate: 0, projectCreate: 0, apiKeyCreate: 0, apiClientCreate: 0 };
  const events = [];
  const body = new Element("body");
  const doc = { body, querySelectorAll: (s) => body.querySelectorAll(s), querySelector: (s) => body.querySelector(s) };
  body.ownerDocument = doc;
  const input = new Element("input", "", { placeholder: "请输入名称", value: name });
  const desc = new Element("input", "", { placeholder: "请输入描述", value: description });
  const pub = new Element("textarea", "", { placeholder: "请输入公钥或点击下方按钮生成公私钥", value: publicKey });
  const radio = new Element("label", "开发者级凭证", { class: "ant-radio-wrapper" }, levelReadable ? [new Element("input", "", { type: "radio", checked: true })] : []);
  const marker = new Element("span", "", { class: "ant-checkbox ucd-check" });
  const admin = new Element("label", "APP管理员", { class: "checkbox" }, roleReadable ? [marker] : []);
  admin.onclick = () => { marker.className = "ant-checkbox ant-checkbox-checked ucd-check"; };
  const other = new Element("label", "管理员", { class: "checkbox" }, [new Element("span", "", { class: "ant-checkbox" + (otherRole ? " ant-checkbox-checked" : "") })]);
  const gen = new Element("button", "生成公私钥");
  const confirm = new Element("button", "确认");
  confirm.onclick = () => { counters.confirm++; };
  gen.onclick = () => { counters.generate++; events.push("generate"); if (generation === "success") pub.value = "FAKE_PUBLIC_KEY"; };
  const form = new Element("app-service-account-add", "", {}, [new Element("h2", "创建服务账号凭证"), confirm, input, radio, admin, other, desc, pub, gen]);
  form.ownerDocument = doc;
  const show = (nodes) => { body.children = nodes; nodes.forEach((el) => { el.parentElement = body; }); };
  const showForm = () => { events.push("form-ready"); show([form]); };
  const list = (developer) => {
    const tab = new Element("div", "开发者级凭证", { role: "tab", "aria-selected": developer ? "true" : "false" });
    tab.onclick = () => { events.push("developer-tab"); list(true); };
    const create = new Element("button", "创建");
    create.onclick = () => { counters[developer ? "serviceCreate" : "projectCreate"]++; showForm(); };
    const service = new Element("section", "", {}, [new Element("h2", "服务账号凭证"), create]);
    const apiButton = new Element("button", "创建"); apiButton.onclick = () => { counters.apiKeyCreate++; };
    const clientButton = new Element("button", "创建"); clientButton.onclick = () => { counters.apiClientCreate++; };
    show([tab, service, new Element("section", "", {}, [new Element("h2", "API Key凭证"), apiButton]), new Element("section", "", {}, [new Element("h2", "API客户端凭证"), clientButton])]);
  };
  if (page === "form") showForm(); else list(page === "developer-list");
  const { get } = loadScripts(["src/recipes.js"], { location: { href: ENTRY }, document: doc });
  const recipe = get("APKGO_RECIPES").find((r) => r.id === "huawei");
  const h = {
    docs: () => [doc], textOf: (el) => el.textContent.trim(),
    byText: (sel, re, scope) => (scope || doc).querySelectorAll(sel).find((el) => re.test(el.textContent.trim()) && el.getClientRects().length) || null,
    setInput: (el, value) => { el.value = value; }, wait: async () => {},
    waitFor: async (fn) => fn(), highlight: () => events.push("highlight"),
    ensureHook: async () => { events.push(hookOk ? "hook-ready" : "hook-failed"); return hookOk; },
  };
  return { recipe, h, run: () => recipe.actions["open-create"](h), events, counters, form, input, desc, pub, marker, showForm };
}

test("华为：新版入口与 hash 查询参数可识别，不匹配其他菜单", () => {
  const { get } = loadScripts(["src/recipes.js", "src/shared.js"], { chrome: fakeChrome() });
  const recipe = get("APKGO_RECIPES").find((r) => r.id === "huawei");
  assert.equal(recipe.console, ENTRY);
  for (const suffix of ["", "?", "?lang=zh_CN"]) assert.ok(recipe.flowPages.some((re) => re.test(ENTRY + suffix)));
  assert.equal(recipe.flowPages.some((re) => re.test(ENTRY.replace("101653523124950083", "101653523124949886"))), false);
});

test("华为：默认项目级只打开开发者级服务账号创建，生成前捕获就绪，不点确认", async () => {
  const s = setupHuaweiPage();
  assert.match(await s.run(), /确认/);
  assert.equal(s.counters.serviceCreate, 1);
  assert.equal(s.counters.projectCreate + s.counters.apiKeyCreate + s.counters.apiClientCreate, 0);
  assert.equal(s.counters.confirm, 0);
  assert.ok(s.events.indexOf("hook-ready") < s.events.indexOf("generate"));
  assert.equal(s.input.value, "apkgo");
  assert.equal(s.desc.value, "用于配置平台的华为渠道 API 调用");
});

test("华为：独立表单不需要 el-dialog，同一文档重入不重新生成或覆盖已有输入", async () => {
  const s = setupHuaweiPage({ page: "form", name: "自定义名称", description: "自定义描述" });
  await s.run(); await s.run();
  assert.equal(s.counters.generate, 1); assert.equal(s.counters.confirm, 0);
  assert.equal(s.input.value, "自定义名称"); assert.equal(s.desc.value, "自定义描述");
});

for (const [label, options, error] of [
  ["未知公钥", { publicKey: "EXISTING_PUBLIC_KEY" }, /公钥/],
  ["其他角色已选中", { otherRole: true }, /角色/],
  ["角色不可确认", { roleReadable: false }, /APP管理员|角色/],
  ["级别不可确认", { levelReadable: false }, /开发者级|级别/],
  ["生成超时", { generation: "timeout" }, /生成|公钥/],
  ["钩子失败", { hookOk: false }, /捕获|下载/],
]) {
  test(`华为：${label}时停止，不确认或覆盖`, async () => {
    const s = setupHuaweiPage({ page: "form", ...options });
    await assert.rejects(s.run, error);
    assert.equal(s.counters.confirm, 0);
    if (options.generation !== "timeout") assert.equal(s.counters.generate, 0);
    if (options.publicKey) assert.equal(s.pub.value, options.publicKey);
  });
}

test("华为：已生成的公钥被修改后停止，不能重生成", async () => {
  const s = setupHuaweiPage({ page: "form" });
  await s.run(); s.pub.value = "CHANGED_PUBLIC_KEY";
  await assert.rejects(s.run, /公钥/);
  assert.equal(s.counters.generate, 1); assert.equal(s.counters.confirm, 0);
});

test("华为：JSON 缺少私钥时提示生成公私钥，四字段输出仍兼容", () => {
  const s = setupHuaweiPage();
  assert.match(s.recipe.validate({ serviceAccountJson: JSON.stringify({ key_id: "k", sub_account: "sa" }) }), /private_key.*生成公私钥/);
  assert.deepEqual(s.recipe.finalize({ serviceAccountJson: JSON.stringify({ keyId: "k", subAccount: "sa", privateKey: "fake" }) }), { keyId: "k", subAccount: "sa", privateKey: "fake", projectId: "" });
});
