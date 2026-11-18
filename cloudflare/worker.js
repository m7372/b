// Cloudflare Worker for the لَمعة web player.
// Routes: POST /auth/login | GET /api/player_api.php | GET /api/stream-url | GET /media?t=...
// Xtream credentials belong in Worker Secrets only. This Worker relays bytes; it does NOT transcode.

const SESSION_TTL = 60 * 60 * 4;
const MEDIA_TTL = 60 * 60 * 6;
const ALLOWED_ACTIONS = new Set([
  "get_live_categories", "get_live_streams", "get_vod_categories", "get_vod_streams",
  "get_series_categories", "get_series", "get_series_info", "get_vod_info",
]);
const ALLOWED_KINDS = new Set(["live", "movie", "series"]);
const ALLOWED_EXTENSIONS = new Set([
  "m3u8", "ts", "mp4", "m4v", "mkv", "avi", "mov", "webm", "mpg", "mpeg",
  "m2ts", "3gp", "wmv", "flv", "ogv", "vob", "mts", "mp3", "aac", "m4a",
]);
const SAFE_QUERY_KEYS = new Set(["category_id", "series_id", "vod_id", "stream_id", "season"]);
const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes) {
  let s = "";
  for (const byte of new Uint8Array(bytes)) s += String.fromCharCode(byte);
  return btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function unb64(value) {
  const base = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base + "=".repeat((4 - (base.length % 4)) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function cors(request, env) {
  const origin = request.headers.get("Origin");
  const allowedOrigin = (env.ALLOWED_ORIGIN || "").replace(/\/$/, "");
  const h = new Headers({
    "Vary": "Origin", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store",
  });
  if (origin && allowedOrigin && origin.replace(/\/$/, "") === allowedOrigin) {
    h.set("Access-Control-Allow-Origin", allowedOrigin);
    h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
    h.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Range");
    h.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Type");
    h.set("Access-Control-Max-Age", "600");
  }
  return h;
}
function reply(data, status, headers) {
  const h = new Headers(headers);
  h.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers: h });
}
function requireEnv(env) {
  return Boolean(env.UPSTREAM_ORIGIN && env.XTREAM_USERNAME && env.XTREAM_PASSWORD && env.APP_ACCESS_PASSWORD && env.SESSION_SIGNING_SECRET && env.MEDIA_TICKET_SECRET && env.ALLOWED_ORIGIN);
}
function sanitizeXtream(value, env, key = "") {
  if (/^(username|password|direct_source|stream_source|stream_url|play_url|original_url)$/i.test(key)) return undefined;
  if (typeof value === "string") {
    let decoded = value;
    try { decoded = decodeURIComponent(value); } catch { /* Keep the original for the credential scan. */ }
    if ((env.XTREAM_USERNAME && decoded.includes(env.XTREAM_USERNAME)) || (env.XTREAM_PASSWORD && decoded.includes(env.XTREAM_PASSWORD))) return "";
    return value;
  }
  if (Array.isArray(value)) return value.map(item => sanitizeXtream(item, env)).filter(item => item !== undefined);
  if (value && typeof value === "object") {
    const clean = {};
    for (const [name, child] of Object.entries(value)) {
      const safe = sanitizeXtream(child, env, name);
      if (safe !== undefined) clean[name] = safe;
    }
    return clean;
  }
  return value;
}
async function hmac(secret, message) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}
async function makeSession(env) {
  const payload = b64(enc.encode(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_TTL, nonce: crypto.randomUUID() })));
  return `${payload}.${b64(await hmac(env.SESSION_SIGNING_SECRET, payload))}`;
}
async function validSession(request, env) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  const expected = b64(await hmac(env.SESSION_SIGNING_SECRET, payload));
  if (signature.length !== expected.length) return false;
  const a = enc.encode(signature), b = enc.encode(expected);
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  if (mismatch) return false;
  try { return JSON.parse(dec.decode(unb64(payload))).exp > Math.floor(Date.now() / 1000); }
  catch { return false; }
}
async function encryptionKey(secret) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function makeTicket(url, env, exp = Math.floor(Date.now() / 1000) + MEDIA_TTL) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(env.MEDIA_TICKET_SECRET), enc.encode(JSON.stringify({ u: url, exp })));
  return `${b64(iv)}.${b64(cipher)}`;
}
async function readTicket(ticket, env) {
  try {
    const [ivPart, cipherPart, extra] = ticket.split(".");
    if (!ivPart || !cipherPart || extra) return null;
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(ivPart) }, await encryptionKey(env.MEDIA_TICKET_SECRET), unb64(cipherPart));
    const value = JSON.parse(dec.decode(plain));
    if (!value.u || value.exp <= Math.floor(Date.now() / 1000)) return null;
    return value;
  } catch { return null; }
}
function originUrl(env) {
  const url = new URL(env.UPSTREAM_ORIGIN);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("UPSTREAM_ORIGIN must be an origin such as https://host:port");
  return url;
}
function hostAllowed(url, env) {
  const configured = (env.ALLOWED_STREAM_HOSTS || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  const allowed = new Set([originUrl(env).host.toLowerCase(), ...configured]);
  let accountMatches = !url.username && !url.password;
  try { accountMatches = accountMatches || (decodeURIComponent(url.username) === env.XTREAM_USERNAME && decodeURIComponent(url.password) === env.XTREAM_PASSWORD); } catch { /* reject malformed userinfo */ }
  return allowed.has(url.host.toLowerCase()) && ["http:", "https:"].includes(url.protocol) && accountMatches;
}
function makeUpstreamUrl(kind, id, ext, env) {
  if (!ALLOWED_KINDS.has(kind) || !/^\d{1,16}$/.test(id) || !ALLOWED_EXTENSIONS.has(ext)) return null;
  const root = originUrl(env);
  const route = kind === "live" ? "live" : kind === "movie" ? "movie" : "series";
  return new URL(`/${route}/${encodeURIComponent(env.XTREAM_USERNAME)}/${encodeURIComponent(env.XTREAM_PASSWORD)}/${id}.${ext}`, root).toString();
}
async function limitedLogin(request, env) {
  if (env.LOGIN_RATE_LIMITER) {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const result = await env.LOGIN_RATE_LIMITER.limit({ key: ip });
    if (!result.success) return false;
  }
  return true;
}
async function fetchRedirects(initial, request, env) {
  let target = new URL(initial);
  const range = request.headers.get("Range");
  const upstreamHeaders = new Headers({ "User-Agent": "LamaStream/1.0", "Accept": request.headers.get("Accept") || "*/*" });
  if (range && /^bytes=\d*-\d*(,\d*-\d*)*$/.test(range)) upstreamHeaders.set("Range", range);
  for (let count = 0; count <= 5; count++) {
    if (!hostAllowed(target, env)) throw new Error("Stream host is not in ALLOWED_STREAM_HOSTS");
    const response = await fetch(target.toString(), { method: request.method === "HEAD" ? "HEAD" : "GET", headers: upstreamHeaders, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("Location");
      if (!location || count === 5) return { response, target };
      target = new URL(location, target);
      continue;
    }
    return { response, target };
  }
  throw new Error("Too many upstream redirects");
}
async function mediaUrl(ticket, env, requestUrl) {
  return `${requestUrl.origin}/media?t=${encodeURIComponent(ticket)}`;
}

export default {
  async fetch(request, env) {
    const headers = cors(request, env);
    const requestUrl = new URL(request.url);
    if (request.method === "OPTIONS") {
      const origin = request.headers.get("Origin");
      if (origin && origin.replace(/\/$/, "") !== (env.ALLOWED_ORIGIN || "").replace(/\/$/, "")) return new Response(null, { status: 403, headers });
      return new Response(null, { status: 204, headers });
    }
    const origin = request.headers.get("Origin");
    if (origin && origin.replace(/\/$/, "") !== (env.ALLOWED_ORIGIN || "").replace(/\/$/, "")) return reply({ error: "Origin not allowed" }, 403, headers);
    if (!requireEnv(env)) return reply({ error: "Worker configuration incomplete" }, 503, headers);
    if (requestUrl.pathname === "/auth/login" && request.method === "POST") {
      if (!(await limitedLogin(request, env))) return reply({ error: "Too many login attempts" }, 429, headers);
      let body;
      try { body = await request.json(); } catch { return reply({ error: "Invalid JSON" }, 400, headers); }
      if (typeof body.password !== "string" || body.password.length > 256 || body.password !== env.APP_ACCESS_PASSWORD) return reply({ error: "بيانات الدخول غير صحيحة" }, 401, headers);
      return reply({ token: await makeSession(env), expiresIn: SESSION_TTL }, 200, headers);
    }
    if (requestUrl.pathname === "/media" && ["GET", "HEAD"].includes(request.method)) {
      const ticket = requestUrl.searchParams.get("t") || "";
      const payload = await readTicket(ticket, env);
      if (!payload) return reply({ error: "Media link expired or invalid" }, 401, headers);
      let initial;
      try { initial = new URL(payload.u); } catch { return reply({ error: "Invalid media target" }, 400, headers); }
      if (!hostAllowed(initial, env)) return reply({ error: "Media host not allowed" }, 403, headers);
      try {
        const { response, target } = await fetchRedirects(initial, request, env);
        const contentType = response.headers.get("Content-Type") || "";
        const isPlaylist = /mpegurl|\.m3u8(?:$|\?)/i.test(`${contentType} ${target.pathname}${target.search}`);
        const out = new Headers(headers);
        for (const name of ["Content-Type", "Content-Range", "Accept-Ranges", "Content-Length", "Last-Modified", "ETag"]) {
          const value = response.headers.get(name);
          if (value) out.set(name, value);
        }
        out.set("Cache-Control", "private, no-store");
        if (isPlaylist && response.ok && request.method !== "HEAD") {
          const source = await response.text();
          const lines = await Promise.all(source.split(/\r?\n/).map(async line => {
            const trimmed = line.trim();
            if (!trimmed) return line;
            const rewrite = async raw => {
              try {
                const resolved = new URL(raw, target);
                if (!["http:", "https:"].includes(resolved.protocol)) return raw;
                if (!hostAllowed(resolved, env)) return `${requestUrl.origin}/media?blocked=1`;
                return await mediaUrl(await makeTicket(resolved.toString(), env, payload.exp), env, requestUrl);
              } catch { return raw; }
            };
            if (trimmed.startsWith("#")) {
              const matches = [...line.matchAll(/URI="([^"]+)"/g)];
              if (!matches.length) return line;
              let result = line;
              for (const match of matches) result = result.replace(`URI="${match[1]}"`, `URI="${await rewrite(match[1])}"`);
              return result;
            }
            return await rewrite(trimmed);
          }));
          out.set("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
          out.delete("Content-Length");
          return new Response(lines.join("\n"), { status: response.status, headers: out });
        }
        return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, headers: out });
      } catch (error) { return reply({ error: "Upstream media request failed", detail: error instanceof Error ? error.message : "unknown" }, 502, headers); }
    }
    if (request.method !== "GET") return reply({ error: "Method not allowed" }, 405, headers);
    if (!(await validSession(request, env))) return reply({ error: "Authentication required" }, 401, headers);

    if (requestUrl.pathname === "/api/player_api.php") {
      const action = requestUrl.searchParams.get("action") || "";
      if (!ALLOWED_ACTIONS.has(action)) return reply({ error: "Unsupported Xtream action" }, 400, headers);
      const upstream = new URL("/player_api.php", originUrl(env));
      upstream.searchParams.set("username", env.XTREAM_USERNAME);
      upstream.searchParams.set("password", env.XTREAM_PASSWORD);
      upstream.searchParams.set("action", action);
      for (const key of SAFE_QUERY_KEYS) {
        const value = requestUrl.searchParams.get(key);
        if (value && /^[A-Za-z0-9_-]{1,32}$/.test(value)) upstream.searchParams.set(key, value);
      }
      try {
        const response = await fetch(upstream, { headers: { "Accept": "application/json", "User-Agent": "LamaStream/1.0" }, redirect: "manual" });
        if (!response.ok) return reply({ error: "Xtream catalog request failed" }, 502, headers);
        const data = await response.json();
        return reply(sanitizeXtream(data, env), 200, headers);
      } catch { return reply({ error: "Could not read Xtream catalog" }, 502, headers); }
    }

    if (requestUrl.pathname === "/api/stream-url") {
      const kind = requestUrl.searchParams.get("kind") || "";
      const id = requestUrl.searchParams.get("id") || "";
      const ext = (requestUrl.searchParams.get("ext") || (kind === "live" ? "m3u8" : "mp4")).toLowerCase().replace(/^\./, "");
      const upstream = makeUpstreamUrl(kind, id, ext, env);
      if (!upstream) return reply({ error: "Invalid stream request" }, 400, headers);
      const ticket = await makeTicket(upstream, env);
      return reply({ url: await mediaUrl(ticket, env, requestUrl), expiresIn: MEDIA_TTL }, 200, headers);
    }
    return reply({ error: "Not found" }, 404, headers);
  },
};
