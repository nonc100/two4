// apps/web/menu/server.js  (ESM)
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.COSMOS_PORT || process.env.PORT || 5180;

/* 정적 파일 (menu 폴더 + /media) */
app.use(express.static(__dirname));
app.use("/media", express.static(path.join(__dirname, "..", "media")));

/* 간단 헬스체크 */
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "two4-cosmos", at: Date.now() });
});

function setCorsAndCache(res){
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
}

/* CoinGecko 키 (Railway Variables) */
const CG_PRO  = process.env.X_CG_PRO_API_KEY || "";
const CG_DEMO = process.env.COINGECKO_API_KEY || process.env.X_CG_DEMO_API_KEY || "";
const cgHeaders = { "User-Agent": "two4-cosmos/1.0" };
if (CG_PRO)   cgHeaders["x-cg-pro-api-key"]   = CG_PRO;
else if (CG_DEMO) cgHeaders["x-cg-demo-api-key"] = CG_DEMO;

/* 초간단 메모리 캐시 */
const cache = new Map();         // key -> { t, body, ct, status, ok }
const TTL_MS = 60_000;
const hit  = k => { const v = cache.get(k); return v && Date.now()-v.t < TTL_MS ? v : null; };
const keep = (k,p) => { if (p.ok) cache.set(k, { ...p, t: Date.now() }); };

async function proxyFetch(url, headers = {}){
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(url, { headers, signal: ac.signal }); // Node18 전역 fetch
    const body = await r.text();
    clearTimeout(timer);
    return { ok: r.ok, status: r.status, body, ct: r.headers.get("content-type") || "application/json; charset=utf-8" };
  } catch (e){
    clearTimeout(timer);
    return { ok:false, status:502, body: JSON.stringify({ error:"proxy failed", detail:String(e) }), ct:"application/json; charset=utf-8" };
  }
}

/* /api/coins/markets */
app.get("/api/coins/markets", async (req, res) => {
  const u = new URL("https://api.coingecko.com/api/v3/coins/markets");
  for (const [k,v] of Object.entries(req.query)) u.searchParams.set(k,v);
  if (!u.searchParams.get("vs_currency")) u.searchParams.set("vs_currency","usd");
  if (!u.searchParams.get("order"))      u.searchParams.set("order","market_cap_desc");
  const per_page = Math.min(Number(req.query.per_page) || 100, 250);
  u.searchParams.set("per_page", String(per_page));
  if (!u.searchParams.get("page"))       u.searchParams.set("page","1");
  if (!u.searchParams.get("sparkline"))  u.searchParams.set("sparkline","true");
  if (!u.searchParams.get("price_change_percentage")) u.searchParams.set("price_change_percentage","1h,24h,7d");

  const key = `CG:${u.toString()}`;
  const cached = hit(key); if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch(u, cgHeaders);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

/* /api/global */
app.get("/api/global", async (_req, res) => {
  const u = "https://api.coingecko.com/api/v3/global";
  const key = `CG:${u}`;
  const cached = hit(key); if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch(u, cgHeaders);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

/* /api/fng (alternative.me) */
app.get("/api/fng", async (req, res) => {
  const u = new URL("https://api.alternative.me/fng/");
  u.searchParams.set("limit",  req.query.limit  || "1");
  u.searchParams.set("format", req.query.format || "json");

  const key = `FNG:${u.toString()}`;
  const cached = hit(key); if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch(u, { "User-Agent":"two4-cosmos/1.0" });
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

/* ✅ 명시적 Tidewave 라우트: /tidewave -> menu/index.html */
app.get("/tidewave", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* 존재하지 않는 정적/비HTML 요청은 404 처리 */
app.use((req, res, next) => {
  if (req.accepts("html")) return next();
  res.status(404).end();
});

/* SPA fallback (그 외 HTML 요청은 menu/index.html) */
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.listen(PORT, () => console.log(`🚀 Cosmos server on ${PORT}`));
