// 起伪配置平台 → 跑 e2e.mjs → 关服务。截图落在 dist/shots/。
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
const HERE = path.dirname(new URL(import.meta.url).pathname);
fs.mkdirSync(path.join(HERE, "../../dist/shots"), { recursive: true });
const server = spawn("python3", [path.join(HERE, "fake_platform.py"), "9090"], { stdio: "inherit" });
await new Promise((r) => setTimeout(r, 800));
const test = spawn(process.execPath, [path.join(HERE, "e2e.mjs")], { stdio: "inherit" });
const code = await new Promise((r) => test.on("exit", r));
server.kill();
process.exit(code);
