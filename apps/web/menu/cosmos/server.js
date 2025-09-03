
import express from "express";
import fetch from "node-fetch";

const app = express();

// 정적 파일 (필요 없으면 이 줄은 지워도 됨)
app.use(express.static("."));

// ---- 환경변수에서 키 읽기 (Railway Variables에 넣어둔 값 사용) ----
const CG_DEMO = process.env.CG_API_KEY || process.env.X_CG_DEMO_API_KEY || "";
const CG_PRO  = process.env.X_CG_PRO_API_KEY || "";

// 공통 헤더
const baseHeaders = { "User-Agent": "two4-cosmos/1.0" };
if (CG_PRO) baseHeaders["x-cg-pro-api-key"] = CG_PRO;
else if (CG_DEMO) baseHeaders["x-cg-demo-api-key"] = CG_DEMO;

// 메모리 캐시 (간단)
const cache = new Map(); // key -> { t, body, ct }
const TTL_MS = 60_000;

function setCorsAndCache(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
}

// --- FNG(alt.me) 전용 프록시 ---
app.get("/api/fng", async (req, res) => {
  const qs = req.originalUrl.split("?")[1] || "limit=1&format=json";
  const target = `https://api.alternative.me/fng/?${qs}`;
  const key = `FNG?${qs}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL_MS) {
    setCorsAndCache(res);
    res.type(hit.ct || "application/json");
    return res.status(200).send(hit.body);
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(target, { headers: baseHeaders, signal: ac.signal });
    const body = await r.text();
    clearTimeout(timer);

    setCorsAndCache(res);
    res.status(r.status);
    const ct = r.headers.get("content-type") || "application/json; charset=utf-8";
    res.type(ct);

    if (r.ok) cache.set(key, { t: Date.now(), body, ct });
    res.send(body);
  } catch (e) {
    clearTimeout(timer);
    setCorsAndCache(res);
    res.status(502).json({ error: "proxy failed", detail: String(e) });
  }
});

// --- CoinGecko 범용 프록시 (/api/* -> /api/v3/*) ---
app.get("/api/*", async (req, res) => {
  const pathAfter = req.originalUrl.replace(/^\/api/, ""); // 그대로 보존
  const u = new URL("https://api.coingecko.com/api/v3" + pathAfter);
  if (req.query.per_page || u.searchParams.has("per_page")) {
    const per_page = Math.min(Number(req.query.per_page) || 100, 250);
    u.searchParams.set("per_page", String(per_page));
  }
  const target = u.toString();
  const key = `CG:${u.pathname}${u.search}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL_MS) {
    setCorsAndCache(res);
    res.type(hit.ct || "application/json");
    return res.status(200).send(hit.body);
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(target, { headers: baseHeaders, signal: ac.signal });
    const body = await r.text();
    clearTimeout(timer);

    setCorsAndCache(res);
    res.status(r.status);
    const ct = r.headers.get("content-type") || "application/json; charset=utf-8";
    res.type(ct);

    if (r.ok) cache.set(key, { t: Date.now(), body, ct });
    res.send(body);
  } catch (e) {
    clearTimeout(timer);
    setCorsAndCache(res);
    res.status(502).json({ error: "proxy failed", detail: String(e) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("cosmos proxy listening on", port));
