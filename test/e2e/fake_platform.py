# 伪配置平台：一个模拟「密钥配置」弹窗协议的页面 + token 刷新端点 + 主体开放平台配置的 list/get/add/edit。
# 响应形状、错误文案、唯一键规则都照 dream-product 与网关的口径。
import json, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>fake platform</title></head><body>
<h1>fake platform · 密钥配置</h1><pre id="log"></pre>
<script>
const log = (m) => { document.getElementById('log').textContent += m + "\\n"; };
window.__state = {};
window.addEventListener('message', (e) => {
  if (e.source !== window || e.origin !== location.origin) return;
  const d = e.data; if (!d || d.source !== 'apkgo-assistant') return;
  log('ext→page ' + JSON.stringify(d));
  if (d.type === 'ready') window.__state.ready = d;
  if (d.type === 'paired') window.__state.paired = d.paired;
  if (d.type === 'error') window.__state.error = d.message;
  if (d.type === 'open-console-ok') window.__state.opened = d.store;
});
window.postMessage({ source: 'apkgo-web', type: 'hello' }, location.origin);
window.__pair = (accessToken, refreshToken) => window.postMessage({ source: 'apkgo-web', type: 'pair', accessToken, refreshToken, userName: '张三' }, location.origin);
window.__open = (store, owner) => window.postMessage({ source: 'apkgo-web', type: 'open-console', store, owner }, location.origin);
</script></body></html>"""

ACCESS = {"at-1"}          # 当前有效的 access_token
REFRESH = "rt-1"           # 唯一有效的 refresh_token
ROWS = {}                  # (owner, channel) -> 记录
RECEIVED = []              # add / edit 请求记录，供用例断言
STATE = {"expire_next": False, "next_id": 1}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _send(self, code, body, ctype="application/json"):
        data = body.encode() if isinstance(body, str) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code); self.send_header("Content-Type", ctype + "; charset=utf-8"); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

    def _ok(self, data=None): return self._send(200, {"code": 200, "msg": "success", "data": data})
    def _bad(self, msg): return self._send(400, {"code": 400, "msg": msg})

    # 与网关一致：无效 token → 401；「过期」→ 424（由 /__expire-next 触发一次）
    def _auth(self):
        h = self.headers.get("Authorization", "")
        if not h.startswith("Bearer ") or h[7:] not in ACCESS:
            self._send(401, {"code": 401, "msg": "invalid_token"}); return False
        if STATE["expire_next"]:
            STATE["expire_next"] = False
            self._send(424, {"code": 424, "msg": "token expired"}); return False
        return True

    def _body(self):
        n = int(self.headers.get("Content-Length", "0"))
        return self.rfile.read(n) if n else b""

    def do_GET(self):
        u = urlparse(self.path); q = {k: v[0] for k, v in parse_qs(u.query).items()}
        if u.path == "/" or u.path.startswith("/index"): return self._send(200, PAGE, "text/html")
        if u.path == "/__received": return self._send(200, RECEIVED)
        if u.path == "/api/product/owner-open-platform-config/list":
            if not self._auth(): return
            rows = [r for r in ROWS.values() if not q.get("owner") or q["owner"] in r["owner"]]
            return self._ok({"content": rows, "totalElements": len(rows)})
        if u.path == "/api/product/owner-open-platform-config/get":
            if not self._auth(): return
            return self._ok(ROWS.get((q.get("owner"), q.get("channel"))))
        return self._send(404, {"code": 404, "msg": "not found"})

    def do_POST(self):
        u = urlparse(self.path)
        if u.path == "/__expire-next":
            STATE["expire_next"] = True; return self._ok(True)
        if u.path == "/api/auth/oauth2/token":
            if self.headers.get("Authorization") != "Basic ZHJlYW06ZHJlYW0=": return self._send(401, {"code": 401, "msg": "invalid_client"})
            form = {k: v[0] for k, v in parse_qs(self._body().decode()).items()}
            if form.get("grant_type") != "refresh_token" or form.get("refresh_token") != REFRESH: return self._send(401, {"code": 401, "msg": "invalid_grant"})
            tok = "at-%d" % (len(ACCESS) + 1); ACCESS.add(tok)
            return self._ok({"access_token": tok, "refresh_token": REFRESH, "expires_in": 3600})
        if u.path == "/api/product/owner-open-platform-config/add":
            if not self._auth(): return
            return self._save(json.loads(self._body() or b"{}"), "add")
        return self._send(404, {"code": 404, "msg": "not found"})

    def do_PUT(self):
        u = urlparse(self.path)
        if u.path == "/api/product/owner-open-platform-config/edit":
            if not self._auth(): return
            return self._save(json.loads(self._body() or b"{}"), "edit")
        return self._send(404, {"code": 404, "msg": "not found"})

    # 与 dream-product 的 add/update 同口径：(owner, channel) 唯一；configInfo.clientSecret == "bad" 模拟验活失败
    def _save(self, body, mode):
        owner, channel, info = body.get("owner"), body.get("channel"), body.get("configInfo") or {}
        RECEIVED.append({"mode": mode, "auth": self.headers.get("Authorization", "")[:14], "body": body})
        if not owner or not channel or not info: return self._bad("主体不能为空, 渠道不能为空, 凭证配置不能为空")
        key = (owner, channel)
        if mode == "add" and key in ROWS: return self._bad("该主体渠道的开放平台配置已存在!")
        if mode == "edit" and (body.get("id") is None or not any(r["id"] == body["id"] for r in ROWS.values())): return self._bad("该主体开放平台配置不存在!")
        if info.get("clientSecret") == "bad": return self._bad("凭证验证未通过: token: [10001] invalid client_secret")
        row = {"id": body.get("id") if mode == "edit" else STATE["next_id"], "owner": owner, "channel": channel,
               "configInfo": json.dumps(info, ensure_ascii=False), "updateTime": "2026-09-20T10:00:00"}
        if mode == "add": STATE["next_id"] += 1
        ROWS[key] = row
        return self._ok(True)


ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 9090), H).serve_forever()
