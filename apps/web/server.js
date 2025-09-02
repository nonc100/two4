// apps/web/menu/server.js  (ESM, Node 18+)
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.COSMOS_PORT || process.env.PORT || 3000;

/* -------------------------
   Static files
-------------------------- */
// 루트 사이트 정적 서빙 => apps/web/menu/index.html 이 홈페이지
app.use(express.static(__dirname));

// COSMOS 정적 서빙 (부가 서비스)
const COSMOS_DIR = path.join(__dirname, "cosmos");
app.use("/cosmos", express.static(COSMOS_DIR));

// 과거 경로 호환
app.use("/menu/cosmos", express.static(COSMOS_DIR));
app.use("/apps/web/menu/cosmos", express.static(COSMOS_DIR));

// media 정적
app.use("/media", express.static(path.join(__dirname, "..", "media")));

// 파비콘 경고 제거
app.get("/favicon.ico", (_req, res) => res.sendStatus(204));

/* -------------------------
   Helpers (CORS, Cache)
-------------------------- */
function setCorsAndCache(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
}

// CoinGecko API 키 (둘 중 하나만 있어도 됨)
const CG_PRO  = process.env.X_CG_PRO_API_KEY || "";
const CG_DEMO = process.env.COINGECKO_API_KEY || process.env.X_CG_DEMO_API_KEY || "";
const cgHeaders = { "User-Agent": "two4-cosmos/1.0" };
if (CG_PRO)      cgHeaders["x-cg-pro-api-key"]   = CG_PRO;
else if (CG_DEMO) cgHeaders["x-cg-demo-api-key"] = CG_DEMO;

// 초간단 메모리 캐시
const cache = new Map(); // key -> { t, body, ct, status, ok }
const TTL_MS = 60_000;
const hit  = (k) => { const v = cache.get(k); return v && Date.now() - v.t < TTL_MS ? v : null; };
const keep = (k, p) => { if (p.ok) cache.set(k, { ...p, t: Date.now() }); };

// 공용 fetch (8초 타임아웃)
async function proxyFetch(url, headers = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(url, { headers, signal: ac.signal });
    const body = await r.text();
    clearTimeout(timer);
    return { ok: r.ok, status: r.status, body,
             ct: r.headers.get("content-type") || "application/json; charset=utf-8" };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, status: 502,
             body: JSON.stringify({ error: "proxy failed", detail: String(e) }),
             ct: "application/json; charset=utf-8" };
  }
}

/* -------------------------
   API Proxies
-------------------------- */

// /api/coins/markets → CoinGecko
app.get("/api/coins/markets", async (req, res) => {
  const u = new URL("https://api.coingecko.com/api/v3/coins/markets");
  for (const [k, v] of Object.entries(req.query)) u.searchParams.set(k, v);
  if (!u.searchParams.get("vs_currency")) u.searchParams.set("vs_currency", "usd");
  if (!u.searchParams.get("order")) u.searchParams.set("order", "market_cap_desc");
  if (!u.searchParams.get("per_page")) u.searchParams.set("per_page", "200"); // 상위 200만
  if (!u.searchParams.get("page")) u.searchParams.set("page", "1");
  if (!u.searchParams.get("sparkline")) u.searchParams.set("sparkline", "true");
  if (!u.searchParams.get("price_change_percentage"))
    u.searchParams.set("price_change_percentage", "1h,24h,7d");

  const key = `CG:${u.toString()}`;
  const cached = hit(key);
  if (cached) { setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch(u, cgHeaders);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// /api/global → CoinGecko
app.get("/api/global", async (_req, res) => {
  const u = "https://api.coingecko.com/api/v3/global";
  const key = `CG:${u}`;
  const cached = hit(key);
  if (cached) { setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch(u, cgHeaders);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// /api/fng → alternative.me Fear & Greed
app.get("/api/fng", async (req, res) => {
  const u = new URL("https://api.alternative.me/fng/");
  u.searchParams.set("limit",  req.query.limit  || "1");
  u.searchParams.set("format", req.query.format || "json");

  const key = `FNG:${u.toString()}`;
  const cached = hit(key);
  if (cached) { setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch(u, { "User-Agent": "two4-cosmos/1.0" });
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

/* -------------------------
   SPA fallbacks & Catch-all
-------------------------- */

// COSMOS(부가 서비스) 내부 라우팅: /cosmos/** 는 SPA index.html 반환
app.get(/^\/(cosmos|menu\/cosmos|apps\/web\/menu\/cosmos)(\/.*)?$/, (_req, res) =>
  res.sendFile(path.join(COSMOS_DIR, "index.html"))
);

// 마지막 캐치올: 홈페이지 SPA로 (루트 사이트)
app.get("*", (_req, res) =>
  res.sendFile(path.join(__dirname, "index.html"))
);

/* -------------------------
   Start
-------------------------- */
app.listen(PORT, () => console.log(`🚀 Cosmos server on ${PORT}`));
