// apps/web/menu/server.js
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====== 환경설정 ======
const app = express();
const PORT = process.env.PORT || process.env.COSMOS_PORT || 8080;

// CoinGecko 키 / 티어 (demo | pro)
const CG_KEY = process.env.COINGECKO_API_KEY || "";
const CG_TIER = (process.env.COINGECKO_API_TIER || "demo").toLowerCase(); // demo 기본
const CG_BASE =
  CG_TIER === "pro"
    ? "https://pro-api.coingecko.com/api/v3"
    : "https://api.coingecko.com/api/v3";
const CG_HEADER =
  CG_TIER === "pro" ? "x-cg-pro-api-key" : "x-cg-demo-api-key";

console.log("🌌 Cosmos server starting…");
console.log("🔑 CG key set:", CG_KEY ? "yes" : "no", "| tier:", CG_TIER);
console.log("🌐 CG base:", CG_BASE, "| header:", CG_HEADER);

// 정적파일 경로
const MENU_DIR = __dirname;                 // apps/web/menu
const WEB_DIR  = path.join(__dirname, ".."); // apps/web
const MEDIA_DIR = path.join(WEB_DIR, "media");

// ====== 간단 캐시 (기본 30초) ======
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.t < ttlMs) return hit.v;
  const v = await fn();
  cache.set(key, { t: now, v });
  return v;
}

// 미들웨어
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production" ? [/\.railway\.app$/, /localhost/] : true,
    credentials: true,
  })
);
app.use(express.json());

// 정적 서빙
app.use(express.static(MENU_DIR));            // /index.html, … (menu 폴더)
app.use(express.static(WEB_DIR));             // /style.css 등
app.use("/media", express.static(MEDIA_DIR)); // /media/*

// ====== CoinGecko 호출 유틸 ======
async function callCG(endpoint, { ttlMs = 30000 } = {}) {
  const url = `${CG_BASE}${endpoint}`;
  const key = `CG:${url}`;

  return cached(key, ttlMs, async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const headers = {
      Accept: "application/json",
      "User-Agent": "Cosmos-CryptoDashboard/1.0",
    };
    if (CG_KEY) headers[CG_HEADER] = CG_KEY;

    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
      }
      return await res.json();
    } catch (e) {
      throw e;
    }
  });
}

// ====== 라우트 ======

// 서버/키 상태
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    ts: new Date().toISOString(),
    key: !!CG_KEY,
    tier: CG_TIER,
    base: CG_BASE,
    header: CG_HEADER,
  });
});

// 전체 시장 (global)
app.get("/api/global", async (req, res) => {
  try {
    if (!CG_KEY) return res.status(400).json({ error: "COINGECKO_API_KEY required" });
    const data = await callCG("/global", { ttlMs: 30000 });
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// global summary (동일 엔드포인트, 프런트 편의용)
app.get("/api/global/summary", async (req, res) => {
  try {
    if (!CG_KEY) return res.status(400).json({ error: "COINGECKO_API_KEY required" });
    const g = await callCG("/global", { ttlMs: 30000 });
    const d = g?.data || g?.data?.data || g;
    res.json({
      active_cryptocurrencies: d?.active_cryptocurrencies,
      upcoming_icos: d?.upcoming_icos,
      ongoing_icos: d?.ongoing_icos,
      markets: d?.markets,
      total_market_cap: d?.total_market_cap,
      total_volume: d?.total_volume,
      market_cap_percentage: d?.market_cap_percentage,
      market_cap_change_percentage_24h_usd: d?.market_cap_change_percentage_24h_usd,
      updated_at: d?.updated_at,
    });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// 트렌딩
app.get("/api/trending", async (req, res) => {
  try {
    const data = await callCG("/search/trending", { ttlMs: 30000 });
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// 코인 마켓 목록
app.get("/api/coins/markets", async (req, res) => {
  try {
    const qp = new URLSearchParams();
    qp.set("vs_currency", req.query.vs_currency || "usd");
    qp.set("order", req.query.order || "market_cap_desc");
    qp.set("per_page", Math.min(parseInt(req.query.per_page || "20", 10), 250));
    qp.set("page", Math.max(parseInt(req.query.page || "1", 10), 1));
    if (req.query.sparkline) qp.set("sparkline", req.query.sparkline);
    if (req.query.price_change_percentage)
      qp.set("price_change_percentage", req.query.price_change_percentage);
    if (req.query.ids) qp.set("ids", req.query.ids);

    const data = await callCG(`/coins/markets?${qp.toString()}`, { ttlMs: 30000 });
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// 24h 상승 상위(Top Gainers)
app.get("/api/top-gainers", async (req, res) => {
  try {
    const vs = (req.query.vs_currency || "usd").toLowerCase();
    const perPage = 250;
    const pages = 1; // 필요하면 2~3으로 늘리기

    let rows = [];
    for (let p = 1; p <= pages; p++) {
      const q = new URLSearchParams({
        vs_currency: vs,
        order: "market_cap_desc",
        per_page: String(perPage),
        page: String(p),
        price_change_percentage: "24h",
      });
      const pageRows = await callCG(`/coins/markets?${q.toString()}`, { ttlMs: 30000 });
      rows = rows.concat(pageRows || []);
    }

    const picked = rows
      .map((c) => ({
        id: c.id,
        symbol: c.symbol,
        name: c.name,
        rank: c.market_cap_rank,
        price: c.current_price,
        price_change_24h_pct: c.price_change_percentage_24h_in_currency,
        market_cap: c.market_cap,
      }))
      .filter((x) => Number.isFinite(x.price_change_24h_pct))
      .sort((a, b) => b.price_change_24h_pct - a.price_change_24h_pct)
      .slice(0, Math.min(parseInt(req.query.limit || "10", 10), 50));

    res.json({ vs_currency: vs, limit: picked.length, rows: picked });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// 디버그
app.get("/api/__debug", (req, res) => {
  const files = [
    "beacons.html","constellation.html","cosmos","cosmos.html",
    "echoes.html","header.html","method.html","orbits.html",
    "portal.html","psyche.html","seed-oracle.html","server.js",
  ];
  res.json({ dirname: MENU_DIR, cwd: process.cwd(), files, media: "ok", ts: new Date().toISOString() });
});

// 404
app.use((req, res) => res.status(404).json({ error: "Not Found" }));

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

// 시작
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Cosmos server listening on :${PORT}`);
});
