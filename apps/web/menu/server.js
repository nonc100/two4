// apps/web/menu/server.js
const express = require("express");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;

/* 정적 파일 & SPA */
app.use(express.static(path.join(__dirname)));
function setCorsAndCache(res){
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Cache-Control","public, s-maxage=60, stale-while-revalidate=120");
}

/* CoinGecko 키 (환경변수 아무거나 1개면 됨) */
const CG_PRO  = process.env.X_CG_PRO_API_KEY || "";
const CG_DEMO = process.env.COINGECKO_API_KEY || process.env.X_CG_DEMO_API_KEY || "";
const cgBaseHeaders = { "User-Agent": "two4-cosmos/1.0" };
if (CG_PRO)  cgBaseHeaders["x-cg-pro-api-key"]   = CG_PRO;
else if (CG_DEMO) cgBaseHeaders["x-cg-demo-api-key"] = CG_DEMO;

/* 초간단 메모리 캐시 */
const cache = new Map(); // key -> { t, body, ct, status }
const TTL_MS = 60_000;

async function proxyFetch(targetURL, addHeaders = {}){
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(targetURL, { headers: { ...addHeaders }, signal: ac.signal });
    const body = await r.text();
    clearTimeout(timer);
    return { ok: r.ok, status: r.status, body, ct: r.headers.get("content-type") || "application/json; charset=utf-8" };
  } catch(e){
    clearTimeout(timer);
    return { ok:false, status:502, body: JSON.stringify({ error:"proxy failed", detail:String(e) }), ct:"application/json; charset=utf-8" };
  }
}
function maybeServeCache(key, res){
  const hit = cache.get(key);
  if (hit && Date.now()-hit.t < TTL_MS){
    setCorsAndCache(res);
    res.type(hit.ct).status(hit.status).send(hit.body);
    return true;
  }
  return false;
}
function saveCache(key, payload){
  if (payload.ok) cache.set(key, { t:Date.now(), body:payload.body, ct:payload.ct, status:payload.status });
}

/* /api/coins/markets */
app.get("/api/coins/markets", async (req, res) => {
  const u = new URL("https://api.coingecko.com/api/v3/coins/markets");
  for (const [k, v] of Object.entries(req.query)) u.searchParams.set(k, v);
  if (!u.searchParams.get("vs_currency")) u.searchParams.set("vs_currency", "usd");
  if (!u.searchParams.get("order")) u.searchParams.set("order", "market_cap_desc");
  if (!u.searchParams.get("per_page")) u.searchParams.set("per_page", "200");
  if (!u.searchParams.get("page")) u.searchParams.set("page", "1");
  if (!u.searchParams.get("sparkline")) u.searchParams.set("sparkline", "true");
  if (!u.searchParams.get("price_change_percentage")) u.searchParams.set("price_change_percentage", "1h,24h,7d");

  const key = `CG:${u.toString()}`;
  if (maybeServeCache(key, res)) return;

  const payload = await proxyFetch(u, cgBaseHeaders);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  saveCache(key, payload);
});

/* /api/global */
app.get("/api/global", async (_req, res) => {
  const u = "https://api.coingecko.com/api/v3/global";
  const key = `CG:${u}`;
  if (maybeServeCache(key, res)) return;

  const payload = await proxyFetch(u, cgBaseHeaders);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  saveCache(key, payload);
});

/* /api/fng (alternative.me) */
app.get("/api/fng", async (req, res) => {
  const u = new URL("https://api.alternative.me/fng/");
  u.searchParams.set("limit", req.query.limit || "1");
  u.searchParams.set("format", req.query.format || "json");

  const key = `FNG:${u.toString()}`;
  if (maybeServeCache(key, res)) return;

  const payload = await proxyFetch(u, { "User-Agent":"two4-cosmos/1.0" });
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  saveCache(key, payload);
});

/* SPA fallback */
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.listen(PORT, () => console.log(`🚀 Server started on ${PORT}`));
