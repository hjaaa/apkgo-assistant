// 配置平台客户端：保管配对信息（平台 origin + 用户 token），替后台发带 Bearer 的请求，
// 424 时用 refresh_token 续一次再重试。经典脚本，后台用 importScripts 引入。
// 扩展里所有发往配置平台的请求都在这一个文件里，而且只会发往配对时记下的 origin。
/* global APKGO */
const APKGO_PLATFORM = (() => {
  // 与配置平台前端登录 / 刷新用的是同一个 OAuth2 客户端（dream:dream）。
  const CLIENT_BASIC = "Basic ZHJlYW06ZHJlYW0=";
  const NOT_PAIRED = "还没连接配置平台，请在配置平台的「密钥配置」弹窗点「连接助手」";
  const EXPIRED = "连接已失效，请回配置平台的「密钥配置」弹窗重新连接";
  let refreshing = null; // 单飞：并发撞上 424 时共用同一次刷新

  async function getPaired() {
    const { [APKGO.KEY_PAIRED]: p } = await chrome.storage.local.get(APKGO.KEY_PAIRED);
    if (!p) return null;
    // 0.5.0 的配对记录是 { origin, apiKey, orgId, orgName }，换后端后不再可用；
    // 留着会让面板显示「已连接」却存不进去，还会把主体名发往旧域名。直接作废。
    if (!p.accessToken || !p.refreshToken) { await clearPaired(); return null; }
    return p;
  }
  async function setPaired(p) { await chrome.storage.local.set({ [APKGO.KEY_PAIRED]: p }); }
  async function clearPaired() { await chrome.storage.local.remove(APKGO.KEY_PAIRED); }
  // 给内容脚本 / 弹窗看的配对信息：不带 token。
  function publicPaired(p) {
    return p ? { origin: p.origin, userName: p.userName || "", pairedAt: p.pairedAt } : null;
  }

  // 用 refresh_token 换新的 access_token。成功返回更新后的配对记录（已落盘），失败返回 null。
  function refresh(p) {
    if (!refreshing) {
      refreshing = (async () => {
        try {
          const res = await fetch(p.origin + "/api/auth/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: CLIENT_BASIC },
            body: new URLSearchParams({ grant_type: "refresh_token", scope: "server", refresh_token: p.refreshToken }).toString(),
          });
          let body = null;
          try { body = await res.json(); } catch { /* 非 JSON */ }
          const data = body && body.code === 200 ? body.data : null;
          if (!res.ok || !data || !data.access_token) return null;
          const next = { ...p, accessToken: data.access_token, refreshToken: data.refresh_token || p.refreshToken };
          await setPaired(next);
          return next;
        } catch {
          return null;
        } finally {
          refreshing = null;
        }
      })();
    }
    return refreshing;
  }

  // 调平台接口（path 不含 /api 前缀）。返回 { ok, status, data | error }。
  async function request(path, init = {}, retried = false) {
    const p = await getPaired();
    if (!p) return { ok: false, status: 0, error: NOT_PAIRED };
    let res;
    try {
      res = await fetch(p.origin + "/api" + path, {
        ...init,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + p.accessToken, ...(init.headers || {}) },
      });
    } catch (e) {
      return { ok: false, status: 0, error: "连不上 " + p.origin + "：" + (e.message || e) };
    }
    if (res.status === 424 && !retried) {
      if (await refresh(p)) return request(path, init, true);
      await clearPaired();
      return { ok: false, status: 401, error: EXPIRED };
    }
    if (res.status === 401 || res.status === 424) {
      await clearPaired();
      return { ok: false, status: 401, error: EXPIRED };
    }
    let body = null;
    try { body = await res.json(); } catch { /* 非 JSON */ }
    if (!res.ok || !body || body.code !== 200) {
      return { ok: false, status: res.status, error: (body && body.msg) || `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, data: body.data === undefined ? null : body.data };
  }

  return { getPaired, setPaired, clearPaired, publicPaired, request, refresh };
})();
