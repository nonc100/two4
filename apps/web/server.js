// apps/web/menu/server.js  (ESM, Node 18+)
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// __dirname (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// 절대경로 확정
const ROOT_DIR   = path.resolve(__dirname);                 // apps/web/menu
const COSMOS_DIR = path.resolve(__dirname, "cosmos");       // apps/web/menu/cosmos

// 존재 여부 로그 (배포 로그에서 확인)
console.log("[PATH] ROOT_DIR   =", ROOT_DIR,   fs.existsSync(path.join(ROOT_DIR,   "index.html")) ? "index.html:OK" : "index.html:MISSING");
console.log("[PATH] COSMOS_DIR =", COSMOS_DIR, fs.existsSync(path.join(COSMOS_DIR, "index.html")) ? "index.html:OK" : "index.html:MISSING");

const app  = express();
const PORT = process.env.COSMOS_PORT || process.env.PORT || 3000;

/* -------------------------
   Static files
-------------------------- */
// 홈페이지 정적: /  -> apps/web/menu/index.html
app.use(express.static(ROOT_DIR, { index: "index.html" }));

// COSMOS 정적: /cosmos/ -> apps/web/menu/cosmos/index.html
app.use("/cosmos", express.static(COSMOS_DIR, { index: "index.html" }));

// 옛 링크 호환
app.use("/menu/cosmos", express.static(COSMOS_DIR, { index: "index.html" }));
app.use("/apps/web/menu/cosmos", express.static(COSMOS_DIR, { index: "index.html" }));

// /media 정적
app.use("/media", express.static(path.join(ROOT_DIR, "..", "media")));

// 파비콘 경고 제거
app.get("/favicon.ico", (_req, res) => res.sendStatus(204));

/* -------------------------
   Helpers (CORS, Cache)
-------------------------- */
function setCorsAndCache(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
}

const CG_PRO  = process.env.X_CG_PRO_API_KEY || "";
const CG_DEMO = process.env.COINGECKO_API_KEY || process.env.X_CG_DEMO_API_KEY || "";
const cgHeaders = { "User-Agent": "two4-cosmos/1.0" };
if (CG_PRO)      cgHeaders["x-cg-pro-api-key"]   = CG_PRO;
else if (CG_DEMO) cgHeaders["x-cg-demo-api-key"] = CG_DEMO;

const cache = new Map(); // key -> { t, body, ct, status, ok }
const TTL_MS = 60_000;
const hit  = (k) => { const v = cache.get(k); return v && Date.now() - v.t < TTL_MS ? v : null; };
const keep = (k, p) => { if (p.ok) cache.set(k, { ...p, t: Date.now() }); };

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
app.get("/api/coins/markets", async (req, res) => {
  const u = new URL("https://api.coingecko.com/api/v3/coins/markets");
  for (const [k, v] of Object.entries(req.query)) u.searchParams.set(k, v);
  if (!u.searchParams.get("vs_currency")) u.searchParams.set("vs_currency", "usd");
  if (!u.searchParams.get("order")) u.searchParams.set("order", "market_cap_desc");
  if (!u.searchParams.get("per_page")) u.searchParams.set("per_page", "200"); // 상위 200
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
   Explicit Home & Cosmos SPA
-------------------------- */
// 홈(루트)은 무조건 index.html (홈페이지)
app.get("/", (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "index.html"));
});

// COSMOS SPA 내부 라우팅 (/cosmos/**)
app.get(/^\/(cosmos|menu\/cosmos|apps\/web\/menu\/cosmos)(\/.*)?$/, (_req, res) => {
  res.sendFile(path.join(COSMOS_DIR, "index.html"));
});

/* -------------------------
   Catch-all (홈으로)
-------------------------- */
app.get("*", (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "index.html"));
});

/* -------------------------
   Start
-------------------------- */
app.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));
